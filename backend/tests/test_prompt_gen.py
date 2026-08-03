import httpx
import pytest
import respx
from httpx import AsyncClient

from app.config import get_settings
from app.db import async_session_factory
from app.models import Invite
from app.services import prompt_gen
from app.services.prompt_gen import DEFAULT_PROMPT_GEN_TEMPLATE


def _chat_route():
    settings = get_settings()
    return respx.post(f"{settings.agnes_base_url}/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "x",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "Invented prompt"},
                        "finish_reason": "stop",
                    }
                ],
            },
        )
    )


async def _register_second_user(client: AsyncClient, username: str = "bob") -> str:
    async with async_session_factory() as session:
        session.add(Invite(code="second-invite"))
        await session.commit()
    resp = await client.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": "secret12",
            "invite_code": "second-invite",
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


# --- Template versions ---


@pytest.mark.asyncio
async def test_prompt_template_default(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/api/settings/prompt-template")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_default"] is True
    assert body["version"] is None
    assert body["text"] == DEFAULT_PROMPT_GEN_TEMPLATE
    assert body["versions"] == []


@pytest.mark.asyncio
async def test_prompt_template_versions_and_restore(auth_client: AsyncClient) -> None:
    v1 = await auth_client.put(
        "/api/settings/prompt-template", json={"text": "Custom template {mode_label} v1"}
    )
    assert v1.status_code == 200, v1.text
    assert v1.json()["version"] == 1

    v2 = await auth_client.put(
        "/api/settings/prompt-template", json={"text": "Custom template v2"}
    )
    assert v2.status_code == 200, v2.text
    assert v2.json()["version"] == 2
    assert [v["version"] for v in v2.json()["versions"]] == [2, 1]

    current = await auth_client.get("/api/settings/prompt-template")
    body = current.json()
    assert body["text"] == "Custom template v2"
    assert [v["version"] for v in body["versions"]] == [2, 1]
    assert body["versions"][0]["updated_by"] is not None

    restored = await auth_client.post(
        "/api/settings/prompt-template/restore", json={"version": 1}
    )
    assert restored.status_code == 200, restored.text
    rbody = restored.json()
    assert rbody["version"] == 3
    assert rbody["text"] == "Custom template {mode_label} v1"
    assert [v["version"] for v in rbody["versions"]] == [3, 2, 1]

    missing = await auth_client.post(
        "/api/settings/prompt-template/restore", json={"version": 42}
    )
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_prompt_template_reset(auth_client: AsyncClient) -> None:
    await auth_client.put("/api/settings/prompt-template", json={"text": "Custom"})
    resp = await auth_client.delete("/api/settings/prompt-template")
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_default"] is True

    current = await auth_client.get("/api/settings/prompt-template")
    assert current.json()["versions"] == []


# --- Intents CRUD (admin) ---


@pytest.mark.asyncio
async def test_intents_crud(auth_client: AsyncClient) -> None:
    created = await auth_client.post(
        "/api/settings/prompt-gen-intents",
        json={
            "key": "noir",
            "label": "Нуар",
            "instruction": "Mood: film noir.",
            "position": 5,
        },
    )
    assert created.status_code == 201, created.text
    intent_id = created.json()["id"]

    dup = await auth_client.post(
        "/api/settings/prompt-gen-intents",
        json={"key": "noir", "label": "Дубликат", "instruction": "x"},
    )
    assert dup.status_code == 409

    patched = await auth_client.patch(
        f"/api/settings/prompt-gen-intents/{intent_id}",
        json={"label": "Нео-нуар", "is_active": False},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["label"] == "Нео-нуар"
    assert patched.json()["is_active"] is False
    assert patched.json()["position"] == 5

    listed = await auth_client.get("/api/settings/prompt-gen-intents")
    assert listed.status_code == 200
    assert [i["key"] for i in listed.json()] == ["noir"]

    deleted = await auth_client.delete(f"/api/settings/prompt-gen-intents/{intent_id}")
    assert deleted.status_code == 204
    assert (await auth_client.get("/api/settings/prompt-gen-intents")).json() == []


@pytest.mark.asyncio
async def test_intents_admin_only(client: AsyncClient, auth_client: AsyncClient) -> None:
    token = await _register_second_user(client)
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.get("/api/settings/prompt-gen-intents", headers=headers)
    assert resp.status_code == 403
    resp = await client.post(
        "/api/settings/prompt-gen-intents",
        json={"key": "x", "label": "x", "instruction": "x"},
        headers=headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_suggest_intents_lists_active_only(auth_client: AsyncClient) -> None:
    assert (await auth_client.get("/api/assistant/suggest-intents")).json() == []

    await auth_client.post(
        "/api/settings/prompt-gen-intents",
        json={"key": "a", "label": "Активный", "instruction": "i", "position": 2},
    )
    await auth_client.post(
        "/api/settings/prompt-gen-intents",
        json={"key": "b", "label": "Выключен", "instruction": "i", "position": 1},
    )
    second = await auth_client.post(
        "/api/settings/prompt-gen-intents",
        json={"key": "c", "label": "Первый", "instruction": "i", "position": 0},
    )
    b_id = (await auth_client.get("/api/settings/prompt-gen-intents")).json()[1]["id"]
    await auth_client.patch(
        f"/api/settings/prompt-gen-intents/{b_id}", json={"is_active": False}
    )
    assert second.status_code == 201

    resp = await auth_client.get("/api/assistant/suggest-intents")
    assert resp.status_code == 200
    assert [i["key"] for i in resp.json()] == ["c", "a"]


@pytest.mark.asyncio
async def test_seed_prompt_gen_intents(auth_client: AsyncClient) -> None:
    async with async_session_factory() as session:
        seeded = await prompt_gen.seed_prompt_gen_intents(session)
        assert seeded == len(prompt_gen.DEFAULT_PROMPT_GEN_INTENTS)
        again = await prompt_gen.seed_prompt_gen_intents(session)
        assert again == 0

    resp = await auth_client.get("/api/assistant/suggest-intents")
    keys = [i["key"] for i in resp.json()]
    assert keys == ["funny", "fantastic", "romantic", "erotic", "dark", "epic"]


# --- Suggest with intent ---


@pytest.mark.asyncio
@respx.mock
async def test_suggest_uses_intent_instruction(auth_client: AsyncClient) -> None:
    instruction = "Mood: humorous and absurd. Make it funny."
    await auth_client.post(
        "/api/settings/prompt-gen-intents",
        json={"key": "funny", "label": "Смешной", "instruction": instruction},
    )

    route = _chat_route()
    resp = await auth_client.post(
        "/api/assistant/suggest",
        json={"hint": "кот", "mode": "t2i", "intent": "funny"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["text"] == "Invented prompt"
    assert route.called
    body = route.calls[0].request.content
    assert instruction.encode() in body
    assert b"text-to-image" in body


@pytest.mark.asyncio
@respx.mock
async def test_suggest_without_intent_keeps_default(auth_client: AsyncClient) -> None:
    route = _chat_route()
    resp = await auth_client.post("/api/assistant/suggest", json={"hint": "кот"})
    assert resp.status_code == 200, resp.text
    assert route.called
    assert DEFAULT_PROMPT_GEN_TEMPLATE.splitlines()[0].encode() in (
        route.calls[0].request.content
    )


@pytest.mark.asyncio
@respx.mock
async def test_suggest_rejects_unknown_or_inactive_intent(
    auth_client: AsyncClient,
) -> None:
    created = await auth_client.post(
        "/api/settings/prompt-gen-intents",
        json={"key": "off", "label": "Выкл", "instruction": "i", "is_active": False},
    )
    assert created.status_code == 201

    route = _chat_route()
    unknown = await auth_client.post(
        "/api/assistant/suggest", json={"intent": "does-not-exist"}
    )
    assert unknown.status_code == 400

    inactive = await auth_client.post("/api/assistant/suggest", json={"intent": "off"})
    assert inactive.status_code == 400
    assert not route.called


@pytest.mark.asyncio
@respx.mock
async def test_preview_with_draft_template_and_intent(auth_client: AsyncClient) -> None:
    instruction = "Mood: epic and cinematic."
    await auth_client.post(
        "/api/settings/prompt-gen-intents",
        json={"key": "epic", "label": "Эпичный", "instruction": instruction},
    )

    route = _chat_route()
    resp = await auth_client.post(
        "/api/settings/prompt-template/preview",
        json={
            "text": "Draft {mode_label} template without intent placeholder",
            "hint": "",
            "mode": "i2i",
            "intent": "epic",
        },
    )
    assert resp.status_code == 200, resp.text
    body = route.calls[0].request.content
    assert b"Draft image-to-image" in body
    # No {intent_instruction} placeholder in draft: instruction is appended.
    assert instruction.encode() in body

    bad = await auth_client.post(
        "/api/settings/prompt-template/preview",
        json={"intent": "missing"},
    )
    assert bad.status_code == 400


@pytest.mark.asyncio
@respx.mock
async def test_suggest_uses_custom_template_with_placeholder(
    auth_client: AsyncClient,
) -> None:
    await auth_client.put(
        "/api/settings/prompt-template",
        json={"text": "SYS {mode_label} :: {intent_instruction} :: END"},
    )
    await auth_client.post(
        "/api/settings/prompt-gen-intents",
        json={"key": "dark", "label": "Мрачный", "instruction": "DARK_INSTR"},
    )

    route = _chat_route()
    resp = await auth_client.post("/api/assistant/suggest", json={"intent": "dark"})
    assert resp.status_code == 200, resp.text
    body = route.calls[0].request.content
    assert b"SYS text-to-image :: DARK_INSTR :: END" in body
