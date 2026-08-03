"""«Придумай промпт»: chat-LLM придумывает новый промпт генерации с нуля.

Системный шаблон — глобальный, редактируется админом (AppPromptTemplate,
kind=AppPromptKind.prompt_gen); при отсутствии версий используется дефолт ниже.
"""

from typing import Optional

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import AppPromptKind, AppPromptTemplate, User
from app.services.provider_runtime import get_chat_provider_for_user

DEFAULT_PROMPT_GEN_TEMPLATE = """You are a creative prompt engineer for the Agnes Image 2.1 Flash image generation model.
Invent one original, visually striking {mode_label} prompt.

Use this structure:
[Subject] + [Scene] + [Style] + [Lighting] + [Composition] + [Quality]

Rules:
- Output ONLY the prompt text: no quotes, no explanations, no markdown, no labels such as "Prompt:".
- Write the prompt in English.
- Vary subjects, settings and moods from request to request; avoid repeating yourself.
- If the user provides a theme or idea, build on it creatively instead of ignoring it.
- Keep it a single concise paragraph (60-120 words), rich in concrete visual detail."""

SUGGEST_DEFAULT_REQUEST = "Invent one original prompt."

MODE_LABELS = {
    "t2i": "text-to-image",
    "i2i": "image-to-image (the user edits their own photo)",
}


def render_prompt_gen_system(template: str, mode: str) -> str:
    return template.replace("{mode_label}", MODE_LABELS.get(mode, MODE_LABELS["t2i"]))


async def get_prompt_gen_template(session: AsyncSession) -> tuple[str, Optional[int]]:
    """Current global template text and its version (None = code default)."""
    result = await session.exec(
        select(AppPromptTemplate)
        .where(AppPromptTemplate.kind == AppPromptKind.prompt_gen)
        .order_by(AppPromptTemplate.version.desc())
        .limit(1)
    )
    latest = result.first()
    if latest is None:
        return DEFAULT_PROMPT_GEN_TEMPLATE, None
    return latest.text, latest.version


async def suggest_prompt(
    session: AsyncSession,
    user: User,
    hint: str,
    mode: str,
) -> str:
    template, _ = await get_prompt_gen_template(session)
    system = render_prompt_gen_system(template, mode)
    user_text = hint or SUGGEST_DEFAULT_REQUEST
    provider = await get_chat_provider_for_user(session, user=user)
    try:
        return await provider.suggest_prompt(user_text, system)
    finally:
        await provider.aclose()
