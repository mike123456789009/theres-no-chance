from pathlib import Path

import pytest

from kalshi_autotrader.config.models import KalshiApiConfig
from kalshi_autotrader.infrastructure.kalshi_client import KalshiRestClient


@pytest.mark.parametrize("dry_run", [True, False])
def test_load_credentials_env_private_key(monkeypatch: pytest.MonkeyPatch, dry_run: bool) -> None:
    monkeypatch.setenv("KALSHI_API_KEY_ID_TEST", "demo-key")
    pem = """
-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAMock
-----END RSA PRIVATE KEY-----
"""
    monkeypatch.setenv("KALSHI_PRIVATE_KEY_TEST", pem)

    cfg = KalshiApiConfig(
        environment="demo",
        rest_base_url="https://example.com",
        websocket_url="wss://example.com/ws",
        api_key_id_env="KALSHI_API_KEY_ID_TEST",
        private_key_env="KALSHI_PRIVATE_KEY_TEST",
        dry_run=dry_run,
    )

    creds = KalshiRestClient._load_credentials(cfg)
    assert creds.api_key_id == "demo-key"
    if dry_run:
        assert creds.private_key_pem == ""
    else:
        assert "-----BEGIN" in creds.private_key_pem


def test_load_credentials_with_path(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("KALSHI_API_KEY_ID_TEST", "demo-key")
    key_file = tmp_path / "private.pem"
    key_file.write_text("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----")

    cfg = KalshiApiConfig(
        environment="demo",
        rest_base_url="https://example.com",
        websocket_url="wss://example.com/ws",
        api_key_id_env="KALSHI_API_KEY_ID_TEST",
        private_key_path=key_file,
        dry_run=False,
    )

    creds = KalshiRestClient._load_credentials(cfg)
    assert "abc" in creds.private_key_pem


def test_load_credentials_missing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MISSING_KEY", raising=False)
    cfg = KalshiApiConfig(
        environment="demo",
        rest_base_url="https://example.com",
        websocket_url="wss://example.com/ws",
        api_key_id_env="MISSING_KEY",
        dry_run=True,
    )
    with pytest.raises(RuntimeError):
        KalshiRestClient._load_credentials(cfg)
