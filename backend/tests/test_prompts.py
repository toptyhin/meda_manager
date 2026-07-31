import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_categories_and_prompt_versions(auth_client: AsyncClient) -> None:
    cat = await auth_client.post("/api/categories", json={"name": "мода"})
    assert cat.status_code == 201
    cat_id = cat.json()["id"]

    dup = await auth_client.post("/api/categories", json={"name": "мода"})
    assert dup.status_code == 409

    prompt = await auth_client.post(
        "/api/prompts",
        json={
            "title": "сумка и очки",
            "category_id": cat_id,
            "text": "человек с сумкой и очками",
        },
    )
    assert prompt.status_code == 201
    data = prompt.json()
    assert data["current_version"]["version"] == 1
    prompt_id = data["id"]

    v2 = await auth_client.post(
        f"/api/prompts/{prompt_id}/versions",
        json={"text": "человек в очках с сумкой и кроссовками", "source": "manual"},
    )
    assert v2.status_code == 201
    assert v2.json()["version"] == 2

    versions = await auth_client.get(f"/api/prompts/{prompt_id}/versions")
    assert versions.status_code == 200
    assert len(versions.json()) == 2

    got = await auth_client.get(f"/api/prompts/{prompt_id}")
    assert got.json()["current_version"]["version"] == 2
