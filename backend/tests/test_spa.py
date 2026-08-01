from pathlib import Path

from app.main import _frontend_file, _looks_like_static_asset
import app.main as main


def test_looks_like_static_asset_detects_probes() -> None:
    assert _looks_like_static_asset("var/.env")
    assert _looks_like_static_asset(".env")
    assert _looks_like_static_asset("config.php")
    assert _looks_like_static_asset("assets/app.js")
    assert not _looks_like_static_asset("gallery")
    assert not _looks_like_static_asset("prompts/123")
    assert not _looks_like_static_asset("")


def test_frontend_file_serves_only_inside_dist(tmp_path: Path, monkeypatch) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html></html>", encoding="utf-8")
    (dist / "favicon.ico").write_bytes(b"ico")
    secret = tmp_path / "secret.env"
    secret.write_text("LEAK=1", encoding="utf-8")

    monkeypatch.setattr(main, "FRONTEND_DIST", dist.resolve())

    assert _frontend_file("favicon.ico") == (dist / "favicon.ico").resolve()
    assert _frontend_file("missing.js") is None
    assert _frontend_file("../secret.env") is None
    assert _frontend_file("") is None
