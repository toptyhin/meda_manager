import base64
import json
import logging
import re
from typing import Optional

import httpx

from app.config import Settings, get_settings
from app.providers.base import GenerationError, ImageProvider, ImageReview

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


class AgnesProvider(ImageProvider):
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

    async def improve_prompt(self, text: str, category: Optional[str] = None) -> str:
        if not self.settings.agnes_api_key:
            raise GenerationError("AGNES_API_KEY is not configured")

        client = await self._get_client()
        user_content = text
        if category:
            user_content = f"Category: {category}\n\nPrompt draft:\n{text}"

        payload = {
            "model": CHAT_MODEL,
            "messages": [
                {"role": "system", "content": IMPROVE_SYSTEM},
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
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise GenerationError("Unexpected Agnes chat response format") from exc

        if not content or not str(content).strip():
            raise GenerationError("Agnes chat returned empty content")
        return str(content).strip()

    async def review_image(self, prompt: str, image: bytes) -> ImageReview:
        if not self.settings.agnes_api_key:
            raise GenerationError("AGNES_API_KEY is not configured")

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
                            "image_url": {"url": self._to_data_uri(image)},
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
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise GenerationError("Unexpected Agnes review response format") from exc

        if not content or not str(content).strip():
            raise GenerationError("Agnes review returned empty content")

        obj = _parse_review_json(str(content))
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
