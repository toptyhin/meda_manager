"""OpenAI-compatible chat + model catalog adapters (Atlas / CrazyRouter / NordRouter).

Uses httpx only — no openai/anthropic SDKs — to keep memory use low.
"""

from __future__ import annotations

import base64
import logging
import re
from dataclasses import dataclass
from typing import Any, Optional, Protocol

import httpx

from app.config import Settings, get_settings
from app.models import ImproveKind
from app.providers.base import (
    ChatProvider,
    GenerationError,
    ModelCatalog,
    ModelInfo,
    ModelPricing,
)

logger = logging.getLogger(__name__)

_GENERIC_IMPROVE_SYSTEM = (
    "You are an expert prompt engineer. Rewrite the user's draft into a clear, "
    "detail-rich English generation prompt. Output ONLY the improved prompt text: "
    "no quotes, no explanations, no markdown."
)

_CLEAN_PREFIX_PATTERNS = (
    r"^\*\*prompt:\*\*\s*",
    r"^prompt:\s*",
    r"^\*\*enhanced prompt:\*\*\s*",
    r"^enhanced prompt:\s*",
    r"^\*\*improved prompt:\*\*\s*",
    r"^improved prompt:\s*",
    r"^\*\*output:\*\*\s*",
    r"^output:\s*",
)


def _clean_prompt_output(text: str) -> str:
    cleaned = text.strip()
    for pattern in _CLEAN_PREFIX_PATTERNS:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def _coerce_text(value: object) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, list):
        parts: list[str] = []
        for part in value:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text") or ""))
            elif isinstance(part, str):
                parts.append(part)
        text = "".join(parts).strip()
        return text or None
    text = str(value).strip()
    return text or None


def _message_text(data: dict) -> tuple[Optional[str], Optional[str]]:
    try:
        choice = data["choices"][0]
        message = choice["message"]
        finish_reason = choice.get("finish_reason")
    except (KeyError, IndexError, TypeError):
        return None, None

    content = _coerce_text(message.get("content"))
    if not content:
        for key in ("reasoning_content", "reasoning", "thinking"):
            content = _coerce_text(message.get(key))
            if content:
                break
    return content, str(finish_reason) if finish_reason is not None else None


def _to_data_uri(data: bytes) -> str:
    mime = "image/png"
    if data[:3] == b"\xff\xd8\xff":
        mime = "image/jpeg"
    elif data[:8] == b"\x89PNG\r\n\x1a\n":
        mime = "image/png"
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        mime = "image/webp"
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _safe_float(value: object) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _safe_int(value: object) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _infer_kind(item: dict) -> str:
    out_mods = item.get("output_modalities") or item.get("output_modality") or []
    if isinstance(out_mods, str):
        out_mods = [out_mods]
    out_mods_l = {str(m).lower() for m in out_mods}

    model_id = str(item.get("id") or "").lower()
    owned = str(item.get("owned_by") or "").lower()
    haystack = f"{model_id} {owned}"

    if "embedding" in haystack or "embed" in haystack:
        return "embedding"
    if "video" in out_mods_l or "video" in haystack:
        return "video"
    if "image" in out_mods_l or any(
        token in haystack for token in ("dall-e", "flux", "imagen", "image", "midjourney")
    ):
        # Prefer chat when modalities include text output as primary.
        if "text" in out_mods_l and "image" not in out_mods_l:
            return "chat"
        if "image" in out_mods_l or any(
            token in haystack for token in ("dall-e", "flux", "imagen", "midjourney")
        ):
            return "image"
    if "audio" in out_mods_l or any(token in haystack for token in ("tts", "whisper", "audio")):
        return "audio"
    return "chat"


def _extract_items(payload: Any) -> list[dict]:
    """Normalize various /models response wrappers to a list of model dicts."""
    if isinstance(payload, list):
        return [m for m in payload if isinstance(m, dict)]
    if not isinstance(payload, dict):
        return []
    data = payload.get("data")
    if isinstance(data, list):
        return [m for m in data if isinstance(m, dict)]
    if isinstance(data, dict):
        nested = data.get("data")
        if isinstance(nested, list):
            return [m for m in nested if isinstance(m, dict)]
    return []


class CatalogNormalizer(Protocol):
    def normalize(self, provider_id: str, payload: Any) -> list[ModelInfo]: ...


class BaseCatalogNormalizer:
    def normalize(self, provider_id: str, payload: Any) -> list[ModelInfo]:
        items = _extract_items(payload)
        models: list[ModelInfo] = []
        for item in items:
            model_id = item.get("id")
            if not model_id:
                continue
            models.append(self._normalize_item(provider_id, item))
        return models

    def _normalize_item(self, provider_id: str, item: dict) -> ModelInfo:
        in_mods = item.get("input_modalities") or []
        out_mods = item.get("output_modalities") or []
        if isinstance(in_mods, str):
            in_mods = [in_mods]
        if isinstance(out_mods, str):
            out_mods = [out_mods]
        return ModelInfo(
            id=str(item["id"]),
            provider=provider_id,
            kind=_infer_kind(item),
            context_length=_safe_int(item.get("context_length") or item.get("context_window")),
            max_output_length=_safe_int(
                item.get("max_output_length") or item.get("max_completion_tokens")
            ),
            input_modalities=[str(m) for m in in_mods],
            output_modalities=[str(m) for m in out_mods],
            pricing=self._pricing(item),
            raw=item,
        )

    def _pricing(self, item: dict) -> Optional[ModelPricing]:
        return None


class AtlasCatalogNormalizer(BaseCatalogNormalizer):
    def _pricing(self, item: dict) -> Optional[ModelPricing]:
        pricing = item.get("pricing")
        if not isinstance(pricing, dict):
            return None
        prompt = _safe_float(pricing.get("prompt"))
        completion = _safe_float(pricing.get("completion"))
        # Atlas reports per-token rates; convert to per-1M for UI consistency.
        prompt_1m = prompt * 1_000_000 if prompt is not None else None
        completion_1m = completion * 1_000_000 if completion is not None else None
        cache_read = _safe_float(pricing.get("input_cache_read"))
        cache_1m = cache_read * 1_000_000 if cache_read is not None else None
        image = _safe_float(pricing.get("image"))
        request = _safe_float(pricing.get("request"))
        if all(v is None for v in (prompt_1m, completion_1m, image, request, cache_1m)):
            return None
        return ModelPricing(
            prompt_per_1m=prompt_1m,
            completion_per_1m=completion_1m,
            image=image if image not in (None, 0.0) else None,
            request=request if request not in (None, 0.0) else None,
            input_cache_read_per_1m=cache_1m,
            unit="token",
        )


class CrazyRouterCatalogNormalizer(BaseCatalogNormalizer):
    """CrazyRouter /v1/models is typically id/owned_by only; pricing often absent."""


class NordRouterCatalogNormalizer(BaseCatalogNormalizer):
    """NordRouter chat models use OpenAI-style ids (provider/model)."""


@dataclass(frozen=True)
class OpenAICompatConfig:
    provider_id: str
    base_url: str
    api_key: str
    default_model: str
    normalizer: CatalogNormalizer


class OpenAICompatibleProvider(ChatProvider, ModelCatalog):
    def __init__(
        self,
        config: OpenAICompatConfig,
        settings: Optional[Settings] = None,
        client: Optional[httpx.AsyncClient] = None,
    ):
        self.config = config
        self.settings = settings or get_settings()
        self._client = client
        self._owns_client = client is None

    @property
    def provider_id(self) -> str:
        return self.config.provider_id

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.config.base_url.rstrip("/"),
                headers={
                    "Authorization": f"Bearer {self.config.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=httpx.Timeout(360.0, connect=30.0),
            )
        return self._client

    async def aclose(self) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    def _require_key(self) -> None:
        if not self.config.api_key:
            raise GenerationError(
                f"{self.provider_id} API key is not configured",
                status_code=503,
            )

    async def _chat_text(self, payload: dict, api_label: str = "chat") -> str:
        client = await self._get_client()
        try:
            resp = await client.post("/chat/completions", json=payload)
        except httpx.TimeoutException as exc:
            raise GenerationError(f"{self.provider_id} {api_label} API timed out") from exc
        except httpx.HTTPError as exc:
            raise GenerationError(
                f"{self.provider_id} {api_label} API network error: {exc}"
            ) from exc

        if resp.status_code >= 400:
            detail = resp.text[:500]
            raise GenerationError(
                f"{self.provider_id} {api_label} API error ({resp.status_code}): {detail}",
                status_code=resp.status_code,
            )

        data = resp.json()
        content, finish_reason = _message_text(data)
        if content is None and finish_reason is None and "choices" not in data:
            raise GenerationError(f"Unexpected {self.provider_id} {api_label} response format")
        if not content:
            reason = f" (finish_reason={finish_reason})" if finish_reason else ""
            raise GenerationError(
                f"{self.provider_id} {api_label} returned empty content{reason}"
            )
        return content

    async def improve_prompt(
        self,
        text: str,
        category: Optional[str] = None,
        kind: Optional[object] = None,
        system: Optional[str] = None,
    ) -> str:
        self._require_key()
        user_content = text
        if category:
            user_content = f"Category: {category}\n\nPrompt draft:\n{text}"
        if not system:
            # Prefer Agnes templates when kind is known, without hard-failing import.
            if isinstance(kind, ImproveKind):
                try:
                    from app.providers.agnes import DEFAULT_IMPROVE_TEMPLATES

                    system = DEFAULT_IMPROVE_TEMPLATES.get(kind)
                except Exception:  # pragma: no cover - defensive
                    system = None
            system = system or _GENERIC_IMPROVE_SYSTEM

        payload = {
            "model": self.config.default_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.3,
            "max_tokens": 2048,
        }
        content = await self._chat_text(payload)
        return _clean_prompt_output(content)

    async def vision_prompt(
        self,
        image: bytes,
        system: str,
        instruction: str = "Describe this image as an AI image generation prompt.",
    ) -> str:
        self._require_key()
        payload = {
            "model": self.config.default_model,
            "messages": [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": _to_data_uri(image)},
                        },
                        {"type": "text", "text": instruction},
                    ],
                },
            ],
            "temperature": 0.3,
            "max_tokens": 2048,
        }
        content = await self._chat_text(payload, api_label="vision")
        return _clean_prompt_output(content)

    async def list_models(self) -> list[ModelInfo]:
        self._require_key()
        client = await self._get_client()
        try:
            resp = await client.get("/models")
        except httpx.TimeoutException as exc:
            raise GenerationError(f"{self.provider_id} models API timed out") from exc
        except httpx.HTTPError as exc:
            raise GenerationError(
                f"{self.provider_id} models API network error: {exc}"
            ) from exc

        if resp.status_code >= 400:
            detail = resp.text[:500]
            raise GenerationError(
                f"{self.provider_id} models API error ({resp.status_code}): {detail}",
                status_code=resp.status_code,
            )

        payload = resp.json()
        return self.config.normalizer.normalize(self.provider_id, payload)


def _atlas_config(settings: Settings) -> OpenAICompatConfig:
    return OpenAICompatConfig(
        provider_id="atlas",
        base_url=settings.atlas_base_url,
        api_key=settings.atlas_api_key,
        default_model=settings.atlas_chat_model,
        normalizer=AtlasCatalogNormalizer(),
    )


def _crazyrouter_config(settings: Settings) -> OpenAICompatConfig:
    return OpenAICompatConfig(
        provider_id="crazyrouter",
        base_url=settings.crazyrouter_base_url,
        api_key=settings.crazyrouter_api_key,
        default_model=settings.crazyrouter_chat_model,
        normalizer=CrazyRouterCatalogNormalizer(),
    )


def _nordrouter_config(settings: Settings) -> OpenAICompatConfig:
    return OpenAICompatConfig(
        provider_id="nordrouter",
        base_url=settings.nordrouter_base_url,
        api_key=settings.nordrouter_api_key,
        default_model=settings.nordrouter_chat_model,
        normalizer=NordRouterCatalogNormalizer(),
    )


class AtlasProvider(OpenAICompatibleProvider):
    def __init__(
        self,
        settings: Optional[Settings] = None,
        client: Optional[httpx.AsyncClient] = None,
        config: Optional[OpenAICompatConfig] = None,
    ):
        settings = settings or get_settings()
        super().__init__(
            config or _atlas_config(settings), settings=settings, client=client
        )


class CrazyRouterProvider(OpenAICompatibleProvider):
    def __init__(
        self,
        settings: Optional[Settings] = None,
        client: Optional[httpx.AsyncClient] = None,
        config: Optional[OpenAICompatConfig] = None,
    ):
        settings = settings or get_settings()
        super().__init__(
            config or _crazyrouter_config(settings), settings=settings, client=client
        )


class NordRouterProvider(OpenAICompatibleProvider):
    def __init__(
        self,
        settings: Optional[Settings] = None,
        client: Optional[httpx.AsyncClient] = None,
        config: Optional[OpenAICompatConfig] = None,
    ):
        settings = settings or get_settings()
        super().__init__(
            config or _nordrouter_config(settings), settings=settings, client=client
        )
