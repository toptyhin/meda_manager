import base64
import json
import logging
import re
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx

from app.config import Settings, get_settings
from app.providers.base import (
    GenerationError,
    ImageProvider,
    ImageReview,
    VideoProvider,
    VideoTaskRef,
    VideoTaskResult,
)

logger = logging.getLogger(__name__)

IMAGE_MODEL = "agnes-image-2.1-flash"
CHAT_MODEL = "agnes-2.5-flash"

IMPROVE_SYSTEM = """You are an expert prompt engineer for the Agnes Image 2.1 Flash image generation model.
Rewrite the user's draft into a clear, detail-rich English image-generation prompt.

Pick the structure that matches the request:

Text-to-image:
[Subject] + [Scene / Environment] + [Style] + [Lighting] + [Composition] + [Quality Requirements]
Example: "A luminous floating city above a misty canyon at sunrise, cinematic realism, wide-angle composition, rich architectural details, soft golden light, high visual density"

Image-to-image editing:
[Change Request] + [New Style / Scene] + [Elements to Add or Remove] + [Elements to Preserve]
Example: "Turn the daytime street scene into a cinematic cyberpunk night scene, add neon signs and wet road reflections, while preserving the original street layout, camera angle, and main building shapes."

Multi-image composition:
[Reference roles] + [Target scene] + [Relationship between images] + [Style / Lighting / Composition]
Example: "Use the first image as the main character and the second image as the product reference. Create a cinematic campaign poster that preserves the character identity and product shape, with natural lighting and a clean commercial composition."

Rules:
- Output ONLY the improved prompt text: no quotes, no explanations, no markdown.
- Translate to English if the input is not English.
- Preserve the user's intent, subject, and any reference-image roles (person, bag, glasses, etc.).
- The model excels at complex, detail-rich visuals: describe the visual hierarchy — main subject, background environment, important secondary details, style and lighting, composition constraints.
- For edit requests, clearly state what to change and what to preserve.
- Keep it a single concise paragraph, rich in concrete visual detail.
"""

VIDEO_IMPROVE_SYSTEM = """You are an expert prompt engineer for the Agnes Video V2.0 video generation model.
Rewrite the user's draft into a clear, detail-rich English video-generation prompt.

Use this structure:
[Subject] + [Action] + [Scene] + [Camera Movement] + [Lighting] + [Style]
Example: "A young astronaut walking across a red desert planet, dust blowing in the wind, slow cinematic tracking shot, dramatic sunset lighting, realistic sci-fi style"

For image-to-video (animating a still photo):
Describe what should move and which key subject elements should remain stable.
Example: "Animate the character with subtle breathing motion, hair moving gently in the wind, background lights flickering softly, while keeping the face and outfit consistent"

For keyframe transitions:
Clearly describe the transition relationship between keyframes.
Example: "Create a smooth transition from the first keyframe to the second keyframe, maintaining character identity, consistent camera angle, and natural motion between scenes"

Rules:
- Output ONLY the improved prompt text: no quotes, no explanations, no markdown.
- Translate to English if the input is not English.
- Preserve the user's intent, subject, camera style, and any motion cues.
- Prefer concrete, cinematic language: subject actions, camera movement, lighting, style.
- Keep it a single concise paragraph, rich in concrete visual and motion detail.
"""

REVIEW_SYSTEM = """You are a strict visual QA reviewer for AI-generated images (Agnes Image 2.1 Flash).

You receive:
1) The original generation prompt (what was requested).
2) The generated image.

Evaluate BOTH technical quality AND prompt fidelity.

Technical issues to look for:
- anatomy / hands / face distortions
- garbled or unreadable text
- blur, compression artifacts, noise
- watermarks, logos, UI chrome
- duplicate/merged limbs or objects
- broken perspective or lighting inconsistency

Prompt fidelity:
- missing or wrong main subject
- wrong style, setting, composition, or key attributes from the prompt
- ignored reference roles if the prompt mentions them

Respond with ONLY a single JSON object (no markdown, no commentary):
{
  "score": <integer 0-10>,
  "passed": <boolean>,
  "issues": [
    {"type": "<short_snake_case>", "description": "<concise English>", "severity": "minor"|"major"}
  ],
  "fix_mode": "i2i"|"regen",
  "fix_instructions": "<English instruction for the image model>"
}

Rules:
- score 0–10 overall quality+fidelity. Use passed=true only when score >= 7 AND there are no major issues.
- fix_mode="i2i" when the composition/subject is mostly right and defects are local (anatomy, text, small artifacts).
  fix_instructions then MUST be an image-edit instruction: what to change and what to preserve.
- fix_mode="regen" when the image fails the prompt globally (wrong subject/scene/style) or is badly broken.
  fix_instructions then MUST be a full improved generation prompt that avoids the listed issues.
- If the image is excellent, return passed=true, empty issues, fix_mode="i2i", fix_instructions="".
- Output JSON only.
"""


def _parse_review_json(content: str) -> dict:
    """Extract a JSON object from model output (strip fences, find first '{')."""
    text = content.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    if start < 0:
        raise GenerationError("Review response contained no JSON object")
    try:
        obj, _ = json.JSONDecoder().raw_decode(text[start:])
    except json.JSONDecodeError as exc:
        raise GenerationError(f"Failed to parse review JSON: {exc}") from exc
    if not isinstance(obj, dict):
        raise GenerationError("Review JSON root must be an object")
    return obj


def _message_text(data: dict) -> tuple[Optional[str], Optional[str]]:
    """Return (content, finish_reason) from an OpenAI-style chat completion."""
    try:
        choice = data["choices"][0]
        message = choice["message"]
        content = message.get("content")
        finish_reason = choice.get("finish_reason")
    except (KeyError, IndexError, TypeError):
        return None, None

    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text") or ""))
            elif isinstance(part, str):
                parts.append(part)
        content = "".join(parts)

    if content is None:
        return None, str(finish_reason) if finish_reason is not None else None
    text = str(content).strip()
    return (text or None), str(finish_reason) if finish_reason is not None else None


class AgnesProvider(ImageProvider, VideoProvider):
    def __init__(self, settings: Optional[Settings] = None, client: Optional[httpx.AsyncClient] = None):
        self.settings = settings or get_settings()
        self._client = client
        self._owns_client = client is None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.settings.agnes_base_url,
                headers={
                    "Authorization": f"Bearer {self.settings.agnes_api_key}",
                    "Content-Type": "application/json",
                },
                timeout=httpx.Timeout(360.0, connect=30.0),
            )
        return self._client

    async def aclose(self) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    def _gateway_root(self) -> str:
        """Strip trailing /v1 from agnes_base_url for non-/v1 endpoints like /agnesapi."""
        base = self.settings.agnes_base_url.rstrip("/")
        if base.endswith("/v1"):
            return base[: -len("/v1")]
        return base

    def _to_data_uri(self, data: bytes) -> str:
        mime = "image/png"
        if data[:3] == b"\xff\xd8\xff":
            mime = "image/jpeg"
        elif data[:8] == b"\x89PNG\r\n\x1a\n":
            mime = "image/png"
        elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            mime = "image/webp"
        b64 = base64.b64encode(data).decode("ascii")
        return f"data:{mime};base64,{b64}"

    async def generate(
        self,
        prompt: str,
        images: list[bytes],
        size: str = "1K",
        ratio: str = "1:1",
    ) -> bytes:
        if not self.settings.agnes_api_key:
            raise GenerationError("AGNES_API_KEY is not configured")

        client = await self._get_client()
        payload: dict = {
            "model": IMAGE_MODEL,
            "prompt": prompt,
            "size": size,
            "ratio": ratio,
            "extra_body": {"response_format": "b64_json"},
        }
        if images:
            payload["extra_body"]["image"] = [self._to_data_uri(img) for img in images]

        try:
            resp = await client.post("/images/generations", json=payload)
        except httpx.TimeoutException as exc:
            raise GenerationError("Agnes image API timed out") from exc
        except httpx.HTTPError as exc:
            raise GenerationError(f"Agnes image API network error: {exc}") from exc

        if resp.status_code >= 400:
            detail = resp.text[:500]
            raise GenerationError(
                f"Agnes image API error ({resp.status_code}): {detail}",
                status_code=resp.status_code,
            )

        data = resp.json()
        items = data.get("data") or []
        if not items:
            raise GenerationError("Agnes image API returned empty data")

        item = items[0]
        b64 = item.get("b64_json")
        if b64:
            return base64.b64decode(b64)

        url = item.get("url")
        if url:
            try:
                img_resp = await client.get(url)
                img_resp.raise_for_status()
                return img_resp.content
            except httpx.HTTPError as exc:
                raise GenerationError(f"Failed to download generated image: {exc}") from exc

        raise GenerationError("Agnes image API returned neither b64_json nor url")

    async def improve_prompt(
        self,
        text: str,
        category: Optional[str] = None,
        kind: str = "image",
    ) -> str:
        if not self.settings.agnes_api_key:
            raise GenerationError("AGNES_API_KEY is not configured")

        client = await self._get_client()
        user_content = text
        if category:
            user_content = f"Category: {category}\n\nPrompt draft:\n{text}"

        system = VIDEO_IMPROVE_SYSTEM if kind == "video" else IMPROVE_SYSTEM
        payload = {
            "model": CHAT_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.7,
            "max_tokens": 1024,
        }

        try:
            resp = await client.post("/chat/completions", json=payload)
        except httpx.TimeoutException as exc:
            raise GenerationError("Agnes chat API timed out") from exc
        except httpx.HTTPError as exc:
            raise GenerationError(f"Agnes chat API network error: {exc}") from exc

        if resp.status_code >= 400:
            detail = resp.text[:500]
            raise GenerationError(
                f"Agnes chat API error ({resp.status_code}): {detail}",
                status_code=resp.status_code,
            )

        data = resp.json()
        content, finish_reason = _message_text(data)
        if content is None and finish_reason is None and "choices" not in data:
            raise GenerationError("Unexpected Agnes chat response format")
        if not content:
            reason = f" (finish_reason={finish_reason})" if finish_reason else ""
            raise GenerationError(f"Agnes chat returned empty content{reason}")
        return content

    async def review_image(self, prompt: str, image_url: str) -> ImageReview:
        if not self.settings.agnes_api_key:
            raise GenerationError("AGNES_API_KEY is not configured")
        if not image_url or not image_url.startswith(("http://", "https://")):
            raise GenerationError(
                "Agnes review requires a publicly fetchable image URL "
                "(configure PUBLIC_BASE_URL)"
            )

        client = await self._get_client()
        user_text = (
            "Original generation prompt:\n"
            f"{prompt}\n\n"
            "Review the attached image against this prompt. Return JSON only."
        )
        payload = {
            "model": CHAT_MODEL,
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {
                            "type": "image_url",
                            "image_url": {"url": image_url},
                        },
                    ],
                },
            ],
            "temperature": 0.2,
            "max_tokens": 1024,
        }

        try:
            resp = await client.post("/chat/completions", json=payload)
        except httpx.TimeoutException as exc:
            raise GenerationError("Agnes review API timed out") from exc
        except httpx.HTTPError as exc:
            raise GenerationError(f"Agnes review API network error: {exc}") from exc

        if resp.status_code >= 400:
            detail = resp.text[:500]
            raise GenerationError(
                f"Agnes review API error ({resp.status_code}): {detail}",
                status_code=resp.status_code,
            )

        data = resp.json()
        content, finish_reason = _message_text(data)
        if content is None and finish_reason is None and "choices" not in data:
            raise GenerationError("Unexpected Agnes review response format")
        if not content:
            reason = f" (finish_reason={finish_reason})" if finish_reason else ""
            logger.warning(
                "Agnes review empty content%s image_url=%s keys=%s",
                reason,
                image_url[:120],
                list(data.keys()) if isinstance(data, dict) else type(data),
            )
            raise GenerationError(f"Agnes review returned empty content{reason}")

        obj = _parse_review_json(content)
        try:
            score = int(obj.get("score", 0))
        except (TypeError, ValueError) as exc:
            raise GenerationError("Review score must be an integer") from exc
        score = max(0, min(10, score))

        passed = bool(obj.get("passed", False))
        raw_issues = obj.get("issues") or []
        issues: list[dict] = []
        if isinstance(raw_issues, list):
            for item in raw_issues:
                if isinstance(item, dict):
                    issues.append(
                        {
                            "type": str(item.get("type") or "unknown"),
                            "description": str(item.get("description") or ""),
                            "severity": str(item.get("severity") or "minor"),
                        }
                    )

        fix_mode = str(obj.get("fix_mode") or "i2i").lower()
        if fix_mode not in ("i2i", "regen"):
            fix_mode = "i2i"
        fix_instructions = str(obj.get("fix_instructions") or "").strip()

        return ImageReview(
            score=score,
            passed=passed,
            issues=issues,
            fix_mode=fix_mode,
            fix_instructions=fix_instructions,
        )

    async def create_video_task(
        self,
        prompt: str,
        *,
        mode: str = "t2v",
        image_urls: Optional[list[str]] = None,
        width: int = 1152,
        height: int = 768,
        num_frames: int = 121,
        frame_rate: float = 24,
        seed: Optional[int] = None,
        negative_prompt: Optional[str] = None,
    ) -> VideoTaskRef:
        if not self.settings.agnes_api_key:
            raise GenerationError("AGNES_API_KEY is not configured")

        client = await self._get_client()
        payload: dict = {
            "model": self.settings.agnes_video_model,
            "prompt": prompt,
            "height": height,
            "width": width,
            "num_frames": num_frames,
            "frame_rate": frame_rate,
        }
        if seed is not None:
            payload["seed"] = seed
        if negative_prompt:
            payload["negative_prompt"] = negative_prompt

        urls = image_urls or []
        if mode == "i2v":
            if not urls:
                raise GenerationError("image URL required for i2v mode")
            payload["image"] = urls[0]
        elif mode == "keyframes":
            if len(urls) < 2:
                raise GenerationError("at least 2 image URLs required for keyframes mode")
            payload["extra_body"] = {"image": urls, "mode": "keyframes"}

        try:
            resp = await client.post("/videos", json=payload)
        except httpx.TimeoutException as exc:
            raise GenerationError("Agnes video API timed out") from exc
        except httpx.HTTPError as exc:
            raise GenerationError(f"Agnes video API network error: {exc}") from exc

        if resp.status_code >= 400:
            detail = resp.text[:500]
            raise GenerationError(
                f"Agnes video API error ({resp.status_code}): {detail}",
                status_code=resp.status_code,
            )

        data = resp.json()
        task_id = str(data.get("task_id") or data.get("id") or "")
        video_id = str(data.get("video_id") or task_id)
        if not video_id:
            raise GenerationError("Agnes video API returned no video_id")
        return VideoTaskRef(task_id=task_id or video_id, video_id=video_id)

    async def get_video_result(self, video_id: str) -> VideoTaskResult:
        if not self.settings.agnes_api_key:
            raise GenerationError("AGNES_API_KEY is not configured")

        client = await self._get_client()
        url = urljoin(self._gateway_root() + "/", f"agnesapi?video_id={video_id}")
        try:
            resp = await client.get(url)
        except httpx.TimeoutException as exc:
            raise GenerationError("Agnes video status API timed out") from exc
        except httpx.HTTPError as exc:
            raise GenerationError(f"Agnes video status API network error: {exc}") from exc

        if resp.status_code >= 400:
            detail = resp.text[:500]
            raise GenerationError(
                f"Agnes video status API error ({resp.status_code}): {detail}",
                status_code=resp.status_code,
            )

        data = resp.json()
        status = str(data.get("status") or "queued").lower()
        try:
            progress = int(data.get("progress") or 0)
        except (TypeError, ValueError):
            progress = 0
        progress = max(0, min(100, progress))

        seconds: Optional[float] = None
        raw_seconds = data.get("seconds")
        if raw_seconds is not None:
            try:
                seconds = float(raw_seconds)
            except (TypeError, ValueError):
                seconds = None

        size = data.get("size")
        if size is not None:
            size = str(size)

        metadata = data.get("metadata") or {}
        result_url = None
        if isinstance(metadata, dict):
            result_url = metadata.get("url")
            if result_url is not None:
                result_url = str(result_url)

        error = None
        err_field = data.get("error")
        if err_field:
            if isinstance(err_field, dict):
                error = str(err_field.get("message") or err_field)
            else:
                error = str(err_field)

        return VideoTaskResult(
            status=status,
            progress=progress,
            url=result_url,
            seconds=seconds,
            size=size,
            error=error,
        )

    async def download_video(self, url: str) -> bytes:
        if not url:
            raise GenerationError("Empty video URL")
        client = await self._get_client()
        try:
            # Absolute URLs work with httpx even when the client has a base_url
            _ = urlparse(url)
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.content
        except httpx.TimeoutException as exc:
            raise GenerationError("Timed out downloading generated video") from exc
        except httpx.HTTPError as exc:
            raise GenerationError(f"Failed to download generated video: {exc}") from exc
