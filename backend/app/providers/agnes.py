import base64
import logging
from typing import Optional

import httpx

from app.config import Settings, get_settings
from app.providers.base import GenerationError, ImageProvider

logger = logging.getLogger(__name__)

IMAGE_MODEL = "agnes-image-2.1-flash"
CHAT_MODEL = "agnes-2.5-flash"

IMPROVE_SYSTEM = """You are an expert prompt engineer for Agnes Image 2.1 Flash.
Rewrite the user's prompt into a clear English image-generation prompt.

Structure: [Subject] + [Scene / Environment] + [Style] + [Lighting] + [Composition] + [Quality Requirements]

Rules:
- Output ONLY the improved prompt text, nothing else.
- Translate to English if the input is not English.
- Preserve the user's intent and any reference-image roles (person, bag, glasses, etc.).
- For edit requests, clearly state what to change and what to preserve.
- Keep it concise but detail-rich for high visual density.
"""


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
