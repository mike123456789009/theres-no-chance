"""Secret manager abstraction with env and Vault providers."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Dict, Optional
from urllib.parse import parse_qs, urlparse

from ..config.models import SecretsConfig

logger = logging.getLogger(__name__)


class SecretResolutionError(RuntimeError):
    """Raised when a secret reference cannot be resolved."""


class SecretProvider:
    """Interface for secret providers."""

    def get_secret(
        self,
        identifier: str,
        field: Optional[str] = None,
        options: Optional[Dict[str, str]] = None,
    ) -> str:
        raise NotImplementedError


@dataclass(slots=True)
class EnvSecretProvider(SecretProvider):
    prefix: Optional[str] = None

    def get_secret(
        self,
        identifier: str,
        field: Optional[str] = None,
        options: Optional[Dict[str, str]] = None,
    ) -> str:
        if field:
            raise SecretResolutionError("Environment secrets do not support field selectors")
        key = identifier
        if self.prefix:
            key = f"{self.prefix}{identifier}"
        value = os.getenv(key)
        if value is None:
            raise SecretResolutionError(f"Environment variable {key} not set for secret")
        return value


class VaultSecretProvider(SecretProvider):
    """HashiCorp Vault secret provider (KV v1/v2)."""

    def __init__(
        self,
        address: str,
        token: str,
        mount_point: str = "secret",
        namespace: Optional[str] = None,
        kv_version: int = 2,
    ) -> None:
        try:
            import hvac  # type: ignore
        except ImportError as exc:  # pragma: no cover - import guard
            raise SecretResolutionError("hvac package is required for Vault secrets") from exc

        self._kv_version = kv_version
        self._mount_point = mount_point
        self._client = hvac.Client(url=address, token=token, namespace=namespace)
        if not self._client.is_authenticated():
            raise SecretResolutionError("Vault authentication failed; check token and address")

    def get_secret(
        self,
        identifier: str,
        field: Optional[str] = None,
        options: Optional[Dict[str, str]] = None,
    ) -> str:
        if self._kv_version == 2:
            response = self._client.secrets.kv.v2.read_secret_version(
                path=identifier,
                mount_point=self._mount_point,
            )
            data = response.get("data", {}).get("data", {})
        else:
            response = self._client.secrets.kv.v1.read_secret(
                path=identifier,
                mount_point=self._mount_point,
            )
            data = response.get("data", {})
        if not data:
            raise SecretResolutionError(f"Vault secret at {identifier} is empty or missing")
        if field:
            if field not in data:
                raise SecretResolutionError(
                    f"Field '{field}' not found in Vault secret {identifier}"
                )
            value = data[field]
        else:
            if len(data) == 1:
                value = next(iter(data.values()))
            else:
                raise SecretResolutionError(
                    f"Secret {identifier} has multiple fields; specify one with #field"
                )
        if value is None:
            raise SecretResolutionError(f"Secret {identifier} field '{field}' is empty")
        return str(value)


class SecretManager:
    """Resolve secret references based on configuration."""

    def __init__(self, config: SecretsConfig):
        self._config = config
        self._providers: Dict[str, SecretProvider] = {}

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, object]]) -> "SecretManager":
        cfg = SecretsConfig(**(data or {}))
        return cls(cfg)

    def resolve_reference(self, reference: str) -> str:
        """Resolve a secret URI like secret://env/VAR or secret://vault/path#field."""

        parsed = urlparse(reference)
        if parsed.scheme != "secret":
            raise SecretResolutionError(f"Invalid secret reference: {reference}")
        provider_name = parsed.netloc or self._config.provider
        identifier = parsed.path.lstrip("/")
        field = parsed.fragment or None
        options = {k: v[-1] for k, v in parse_qs(parsed.query, keep_blank_values=True).items()}
        if not identifier:
            raise SecretResolutionError("Secret identifier missing in reference")
        optional = options.get("optional", "false").lower() in {"1", "true", "yes", "on"}
        provider = self._get_provider(provider_name)
        logger.debug(
            "Resolving secret via provider=%s identifier=%s field=%s optional=%s",
            provider_name,
            identifier,
            field,
            optional,
        )
        try:
            return provider.get_secret(identifier, field, options)
        except SecretResolutionError:
            if optional:
                default = options.get("default")
                if default is not None:
                    return default
                return ""
            raise

    def _get_provider(self, name: str) -> SecretProvider:
        normalized = name.lower()
        if normalized not in self._providers:
            if normalized == "env":
                self._providers[normalized] = EnvSecretProvider(self._config.env_prefix)
            elif normalized == "vault":
                if not self._config.vault_address:
                    raise SecretResolutionError("Vault address not configured")
                token_env = self._config.vault_token_env or "VAULT_TOKEN"
                token = os.getenv(token_env)
                if not token:
                    raise SecretResolutionError(
                        f"Vault token not available in environment variable {token_env}"
                    )
                self._providers[normalized] = VaultSecretProvider(
                    address=str(self._config.vault_address),
                    token=token,
                    mount_point=self._config.vault_mount_point,
                    namespace=self._config.vault_namespace,
                    kv_version=self._config.vault_kv_version,
                )
            else:
                raise SecretResolutionError(f"Unknown secret provider '{name}'")
        return self._providers[normalized]
