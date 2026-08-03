"""«Придумай промпт»: chat-LLM придумывает новый промпт генерации с нуля.

Системный шаблон — глобальный, редактируется админом (AppPromptTemplate,
kind=AppPromptKind.prompt_gen); при отсутствии версий используется дефолт ниже.
Настроение (интент) — PromptGenIntent из БД, управляется админом; инструкция
интента подставляется в плейсхолдер {intent_instruction} (или дописывается
в конец, если плейсхолдера нет в кастомном шаблоне).
"""

from typing import Optional

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import AppPromptKind, AppPromptTemplate, PromptGenIntent, User
from app.services.provider_runtime import get_chat_provider_for_user

DEFAULT_PROMPT_GEN_TEMPLATE = """You are a creative prompt engineer for the Agnes Image 2.1 Flash image generation model.
Invent one original, visually striking {mode_label} prompt.
{intent_instruction}
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

INTENT_FALLBACK_HEADER = "Mood / intent:"

# (key, label, instruction) — вставляются при старте, если таблица пуста.
DEFAULT_PROMPT_GEN_INTENTS: list[tuple[str, str, str]] = [
    (
        "funny",
        "Смешной",
        "Mood: humorous and absurd. Invent a funny, playful prompt — a ridiculous "
        "situation, comical character or ironic detail that makes the viewer smile.",
    ),
    (
        "fantastic",
        "Фантастический",
        "Mood: science fiction / fantasy. Invent a prompt with futuristic technology, "
        "alien worlds, magic or other impossible, imaginative elements.",
    ),
    (
        "romantic",
        "Романтический",
        "Mood: romantic and tender. Invent a prompt full of warmth, intimacy and soft "
        "emotion — gentle light, cozy atmosphere, affection.",
    ),
    (
        "erotic",
        "Эротический",
        "Mood: erotic and sensual, tasteful boudoir aesthetics. Invent a seductive, "
        "suggestive prompt emphasizing allure, curves, silk, warm intimate light; "
        "elegant and artistic, never crude.",
    ),
    (
        "dark",
        "Мрачный",
        "Mood: dark and ominous. Invent a prompt with horror / gothic / noir vibes — "
        "fog, shadows, decay, unsettling atmosphere.",
    ),
    (
        "epic",
        "Эпичный",
        "Mood: epic and cinematic. Invent a prompt of grand scale — heroic subject, "
        "dramatic lighting, sweeping composition, blockbuster movie feel.",
    ),
]


def render_prompt_gen_system(
    template: str,
    mode: str,
    intent_instruction: str = "",
) -> str:
    system = template.replace("{mode_label}", MODE_LABELS.get(mode, MODE_LABELS["t2i"]))
    if "{intent_instruction}" in system:
        return system.replace("{intent_instruction}", intent_instruction).strip()
    if intent_instruction:
        return f"{system}\n\n{INTENT_FALLBACK_HEADER}\n{intent_instruction}"
    return system


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


async def list_prompt_gen_versions(session: AsyncSession) -> list[AppPromptTemplate]:
    result = await session.exec(
        select(AppPromptTemplate)
        .where(AppPromptTemplate.kind == AppPromptKind.prompt_gen)
        .order_by(AppPromptTemplate.version.desc())
    )
    return list(result.all())


async def get_prompt_gen_intent(
    session: AsyncSession,
    intent_key: Optional[str],
) -> Optional[PromptGenIntent]:
    """Active intent by key; raises ValueError for unknown/inactive keys."""
    if not intent_key:
        return None
    result = await session.exec(
        select(PromptGenIntent).where(PromptGenIntent.key == intent_key).limit(1)
    )
    intent = result.first()
    if intent is None or not intent.is_active:
        raise ValueError(f"Unknown prompt-gen intent: {intent_key}")
    return intent


async def list_active_intents(session: AsyncSession) -> list[PromptGenIntent]:
    result = await session.exec(
        select(PromptGenIntent)
        .where(PromptGenIntent.is_active.is_(True))
        .order_by(PromptGenIntent.position, PromptGenIntent.id)
    )
    return list(result.all())


async def seed_prompt_gen_intents(session: AsyncSession) -> int:
    """Insert default intents when the table is empty; returns rows added."""
    result = await session.exec(select(PromptGenIntent.id).limit(1))
    if result.first() is not None:
        return 0
    for pos, (key, label, instruction) in enumerate(DEFAULT_PROMPT_GEN_INTENTS):
        session.add(
            PromptGenIntent(
                key=key,
                label=label,
                instruction=instruction,
                position=pos,
            )
        )
    await session.commit()
    return len(DEFAULT_PROMPT_GEN_INTENTS)


async def suggest_prompt(
    session: AsyncSession,
    user: User,
    hint: str,
    mode: str,
    intent_key: Optional[str] = None,
) -> str:
    template, _ = await get_prompt_gen_template(session)
    intent = await get_prompt_gen_intent(session, intent_key)
    instruction = intent.instruction.strip() if intent is not None else ""
    system = render_prompt_gen_system(template, mode, instruction)
    user_text = hint or SUGGEST_DEFAULT_REQUEST
    provider = await get_chat_provider_for_user(session, user=user)
    try:
        return await provider.suggest_prompt(user_text, system)
    finally:
        await provider.aclose()
