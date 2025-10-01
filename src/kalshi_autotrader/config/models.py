"""Configuration models for Kalshi Autotrader."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Literal

from pydantic import AnyUrl, BaseModel, Field, HttpUrl, model_validator, validator


class KalshiApiConfig(BaseModel):
    """Kalshi API configuration."""

    environment: str = Field(
        "demo",
        description="API environment identifier: demo or production",
    )
    rest_base_url: HttpUrl = Field(..., description="Base REST endpoint for Kalshi API")
    websocket_url: AnyUrl = Field(..., description="WebSocket endpoint for streaming")
    api_key_id_env: Optional[str] = Field(
        default=None,
        description="Environment variable name storing the Kalshi API key ID",
    )
    api_key_id: Optional[str] = Field(
        default=None,
        description="Kalshi API key ID value; overrides api_key_id_env when provided.",
    )
    private_key_path: Optional[Path] = Field(
        default=None,
        description="Optional path to a PEM-encoded RSA private key. Leave null if using env secret stores.",
    )
    private_key_env: Optional[str] = Field(
        default=None,
        description="Environment variable name storing the PEM private key content.",
    )
    private_key: Optional[str] = Field(
        default=None,
        description="Inline PEM private key content (discouraged unless managed via secrets manager).",
    )
    dry_run: bool = Field(
        True,
        description="When true, orders are not sent live; instead they are logged for paper trading.",
    )
    request_timeout_seconds: float = Field(10.0, ge=1.0, description="HTTP request timeout per call")
    max_retries: int = Field(3, ge=0, description="Retry attempts for recoverable API errors")

    @validator("environment")
    def validate_environment(cls, v: str) -> str:
        allowed = {"demo", "production"}
        if v not in allowed:
            raise ValueError(f"environment must be one of {allowed}")
        return v

    @validator("private_key_path")
    def validate_private_key(cls, v: Optional[Path]) -> Optional[Path]:
        if v is not None and not v.suffix == ".pem":
            raise ValueError("Private key path should reference a .pem file")
        return v

    @validator("api_key_id_env", "api_key_id", "private_key_env", pre=True)
    def strip_blank(cls, v: Optional[str]) -> Optional[str]:  # noqa: D401
        if v in ("", None):
            return None
        return v

    @validator("private_key", pre=True)
    def strip_private_key(cls, v: Optional[str]) -> Optional[str]:  # noqa: D401
        if v in ("", None):
            return None
        return v

    @validator("dry_run", pre=True)
    def coerce_bool(cls, v: Any) -> bool:  # noqa: D401
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            lowered = v.strip().lower()
            if lowered in {"true", "1", "yes", "y"}:
                return True
            if lowered in {"false", "0", "no", "n"}:
                return False
        return bool(v)

    @model_validator(mode="after")
    def validate_live_credentials(self) -> "KalshiApiConfig":  # noqa: D401
        if not self.dry_run:
            if not (self.private_key or self.private_key_path or self.private_key_env):
                raise ValueError("Kalshi private key must be configured when dry_run is false")
        if not (self.api_key_id or self.api_key_id_env):
            raise ValueError("Kalshi API key id must be provided via api_key_id or api_key_id_env")
        return self


class ResearchProviderConfig(BaseModel):
    name: str = Field("primary", description="Identifier for the provider within the routing chain")
    provider: str = Field(..., description="Provider name, e.g., openai")
    model: str = Field(..., description="Model identifier for the LLM")
    temperature: Optional[float] = Field(0.2, ge=0.0, le=1.0)
    min_sources: int = Field(0, ge=0)
    approved_domains: List[str] = Field(default_factory=list)
    request_timeout_seconds: float = Field(600.0, ge=1.0)
    api_key_env: Optional[str] = Field(
        default=None, description="Environment variable that stores the provider API key"
    )
    api_key: Optional[str] = Field(
        default=None, description="Provider API key value if supplied directly."
    )
    reasoning_effort: Optional[str] = Field(
        default="medium",
        description="Optional reasoning effort hint for models that support structured thinking (e.g., o4-mini).",
    )
    max_output_tokens: int = Field(10000, ge=256)
    verbosity: Optional[str] = Field(
        default="high",
        description="Optional verbosity setting for responses API (low, medium, high).",
    )
    min_confidence: float = Field(
        0.5,
        ge=0.0,
        le=1.0,
        description="Confidence threshold required before accepting the provider response.",
    )
    max_attempts: int = Field(
        3,
        ge=1,
        description="Retry attempts for the provider before moving to a fallback.",
    )
    fallbacks: List["ResearchProviderConfig"] = Field(
        default_factory=list,
        description="Optional ordered list of fallback providers.",
    )

    @validator("api_key_env", "api_key", pre=True)
    def strip_api_key(cls, v: Optional[str]) -> Optional[str]:  # noqa: D401
        if v in ("", None):
            return None
        return v

    @validator("name", pre=True)
    def normalize_name(cls, v: Optional[str]) -> str:  # noqa: D401
        value = (v or "primary").strip()
        return value or "primary"


class RiskConfig(BaseModel):
    max_notional_per_market: float = Field(5000.0, ge=0.0)
    max_theme_exposure: float = Field(20000.0, ge=0.0)
    freeze_minutes: int = Field(5, ge=0)
    kelly_scale: float = Field(0.2, ge=0.0, le=1.0)
    ev_threshold_cents: int = Field(1, ge=0)
    max_contracts_per_trade: int = Field(2000, ge=1)
    max_notional_per_trade: float = Field(2000.0, ge=0.0)
    bankroll_dollars: float = Field(2000.0, ge=0.0)
    theme_limits: Dict[str, float] = Field(default_factory=dict)
    market_theme_map: Dict[str, str] = Field(default_factory=dict)
    max_daily_loss: float = Field(2000.0, ge=0.0)
    stop_out_drawdown: float = Field(5000.0, ge=0.0)
    cooldown_minutes: int = Field(15, ge=0)
    restricted_markets: List[str] = Field(default_factory=list)
    restricted_categories: List[str] = Field(default_factory=list)
    manual_override_markets: List[str] = Field(default_factory=list)
    margin_buffer: float = Field(0.2, ge=0.0)
    manual_override_file: Optional[str] = Field(
        default="artifacts/control/manual_overrides.json",
        description="Path to the JSON file containing manual override tickers",
    )


class ExecutionConfig(BaseModel):
    post_only_default: bool = True
    reprice_tick: int = Field(1, ge=0)
    max_child_orders: int = Field(5, ge=1)
    max_cancels_per_min: int = Field(20, ge=1)
    iceberg_clip_size: int = Field(100, ge=1)
    pegged_offset_ticks: int = Field(1, ge=0)
    cancel_window_seconds: int = Field(60, ge=1)
    maker_fee_rate: float = Field(0.02, ge=0.0)
    taker_fee_rate: float = Field(0.07, ge=0.0)


class SecretsConfig(BaseModel):
    provider: str = Field(
        "env",
        description="Secret provider identifier (env or vault)",
    )
    env_prefix: Optional[str] = Field(
        default=None,
        description="Optional prefix applied to environment variable lookups.",
    )
    vault_address: Optional[AnyUrl] = Field(
        default=None,
        description="HashiCorp Vault address when provider is 'vault'.",
    )
    vault_token_env: Optional[str] = Field(
        default="VAULT_TOKEN",
        description="Environment variable that stores the Vault token.",
    )
    vault_mount_point: str = Field(
        "secret",
        description="Vault mount point for KV secrets engine.",
    )
    vault_namespace: Optional[str] = Field(
        default=None,
        description="Optional Vault namespace.",
    )
    vault_kv_version: int = Field(
        2,
        ge=1,
        le=2,
        description="Vault KV engine version (1 or 2).",
    )

    @validator("provider", pre=True)
    def normalize_provider(cls, v: Optional[str]) -> str:  # noqa: D401
        value = (v or "env").strip().lower()
        if value not in {"env", "vault"}:
            raise ValueError("Secrets provider must be 'env' or 'vault'")
        return value


class AlertChannelConfig(BaseModel):
    """Configuration for alert routing targets."""

    type: Literal["log", "slack", "email", "file"] = "log"
    target: Optional[str] = Field(
        default=None,
        description="Destination identifier (file path, webhook URL, or email address).",
    )
    severity_threshold: str = Field(
        "WARNING",
        description="Lowest severity that will be routed to this channel.",
    )

    @validator("severity_threshold", pre=True)
    def normalize_severity(cls, value: Any) -> str:  # noqa: D401
        if value in (None, ""):
            return "WARNING"
        return str(value).upper()


class TelemetryConfig(BaseModel):
    enable_metrics: bool = True
    metrics_endpoint: Optional[str] = None
    metrics_host: str = Field(
        "127.0.0.1",
        description="Host interface to bind the Prometheus metrics HTTP server.",
    )
    metrics_port: int = Field(
        8000,
        ge=0,
        le=65535,
        description="Port for the Prometheus metrics HTTP server.",
    )
    metrics_namespace: str = Field(
        "kalshi_autotrader",
        description="Namespace prefix applied to emitted metrics.",
    )
    enable_alerts: bool = True
    alert_channels: List[AlertChannelConfig] = Field(
        default_factory=lambda: [AlertChannelConfig(type="log")]
    )
    structured_logging: bool = True
    log_dir: str = Field(
        "artifacts/logs",
        description="Directory where structured log files are persisted.",
    )
    audit_log_path: str = Field(
        "artifacts/audit/trading_audit.jsonl",
        description="Filesystem path for immutable audit logs of research and execution decisions.",
    )
    analytics_dir: str = Field(
        "artifacts/analytics",
        description="Directory for storing derived analytics artifacts (shadow trading, post-trade stats).",
    )
    log_level: Optional[str] = Field(
        default=None,
        description="Optional logging level override (e.g., INFO, DEBUG).",
    )

    @validator("log_level", pre=True)
    def normalize_log_level(cls, v: Optional[str]) -> Optional[str]:  # noqa: D401
        if v in ("", None):
            return None
        return str(v).upper()


class DatabaseConfig(BaseModel):
    dsn_env: str = Field(
        ..., description="Environment variable name that stores the Postgres DSN"
    )
    pool_min_size: int = Field(2, ge=1)
    pool_max_size: int = Field(10, ge=1)


class MomentumStrategyConfig(BaseModel):
    enabled: bool = Field(True, description="Apply momentum overlay adjustments when true")
    threshold: float = Field(0.002, ge=0.0, description="Minimum mid-price momentum (dollars) before triggering overlays")
    ev_boost: float = Field(0.002, ge=0.0, description="Expected value boost applied when momentum is positive")
    size_boost: float = Field(0.25, ge=0.0, description="Fractional increase to Kelly size when momentum is positive")
    liquidity_boost: float = Field(0.1, ge=0.0, description="Additional liquidity multiplier when momentum is positive")
    negative_ev_penalty: float = Field(0.003, ge=0.0, description="EV penalty applied when momentum is negative")
    negative_size_penalty: float = Field(0.5, ge=0.0, description="Fractional reduction in position size under negative momentum")
    negative_liquidity_penalty: float = Field(0.4, ge=0.0, description="Liquidity multiplier reduction under negative momentum")


class EventSuppressorStrategyConfig(BaseModel):
    enabled: bool = Field(True, description="Enable event-driven suppression logic")
    cooldown_minutes: int = Field(30, ge=0, description="Block trades when the market closes within this many minutes")
    suppressed_keywords: List[str] = Field(
        default_factory=lambda: ["cancelled", "postponed", "delayed"],
        description="Lowercase keywords that suppress markets at scan time.",
    )
    category_blocks: List[str] = Field(
        default_factory=list,
        description="Optional list of market categories to suppress entirely.",
    )
    confidence_floor: float = Field(
        0.55,
        ge=0.0,
        le=1.0,
        description="Reduce or block trades when research confidence falls below this value.",
    )
    low_confidence_size_multiplier: float = Field(
        0.5,
        ge=0.0,
        description="Multiplier applied to size when confidence falls below the floor (instead of blocking outright).",
    )


class PairTradeArbStrategyConfig(BaseModel):
    enabled: bool = Field(False, description="Enable pair-trade arbitrage overlays")
    groups: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Mapping of group identifiers to the list of tickers that form a pair or basket.",
    )
    spread_threshold: float = Field(
        0.05,
        ge=0.0,
        description="Threshold (in probability points) above which the pair spread triggers adjustments.",
    )
    ev_boost: float = Field(0.003, ge=0.0, description="EV boost applied when the market trades at a discount to its pair")
    liquidity_boost: float = Field(0.15, ge=0.0, description="Liquidity multiplier when market is cheap versus its pair")
    size_penalty: float = Field(0.6, ge=0.0, description="Fractional reduction in size when the market is rich versus its pair")


class StrategyConfig(BaseModel):
    enabled: bool = Field(True, description="Master switch for strategy packs")
    packs: List[str] = Field(
        default_factory=lambda: ["core"],
        description="Active strategy packs; 'core' enables the default overlays.",
    )
    momentum_overlay: MomentumStrategyConfig = Field(
        default_factory=MomentumStrategyConfig,
        description="Configuration for momentum overlays.",
    )
    event_suppressor: EventSuppressorStrategyConfig = Field(
        default_factory=EventSuppressorStrategyConfig,
        description="Configuration for event-driven suppression.",
    )
    pair_trade_arb: PairTradeArbStrategyConfig = Field(
        default_factory=PairTradeArbStrategyConfig,
        description="Configuration for pair-trade arbitrage overlays.",
    )


class ScannerConfig(BaseModel):
    limit: int = Field(100, ge=1, description="Number of markets to request from API")
    include_keywords: List[str] = Field(
        default_factory=lambda: [
            "CPI",
            "inflation",
            "payroll",
            "unemployment",
            "rate",
            "FOMC",
            "GDP",
            "Treasury",
            "interest",
            "election",
            "senate",
            "house",
            "president",
            "vote",
            "trump",
            "gas",
            "oil",
            "price",
        ],
        description="Market titles must contain at least one keyword (case-insensitive).",
    )
    exclude_prefixes: List[str] = Field(
        default_factory=lambda: ["KXQUICKSETTLE", "KXCOINFLIP"],
        description="Market tickers with these prefixes are ignored.",
    )
    exclude_keywords: List[str] = Field(
        default_factory=lambda: ["rotten tomatoes", "temperature", "press briefing"],
        description="Market titles containing these phrases are ignored (case-insensitive).",
    )
    target_prefixes: List[str] = Field(
        default_factory=lambda: [
            "KXAAAGAS",
            "KXAAAOIL",
            "KXAAAGOLD",
            "KXSP",
            "KXUSGOV",
            "KXUSRATE",
            "KXUSCPI",
            "KXUSGDP",
            "KXNONFARM",
            "KXUNEMP",
            "KXTRUMP",
            "KXPRECPI",
        ],
        description="Preferred market ticker prefixes (checked before keyword filters).",
    )
    min_open_interest: int = Field(5, ge=0)
    min_volume_24h: int = Field(1, ge=0)
    fallback_top_n: int = Field(10, ge=1)
    heartbeat_seconds: int = Field(15, ge=0, description="Heartbeat interval for order book streams")
    delta_price_ticks: int = Field(1, ge=0, description="Minimum tick change to emit updates")
    delta_quantity: int = Field(25, ge=0, description="Minimum size change to emit updates")
    snapshot_path: Optional[str] = Field("artifacts/orderbooks", description="Directory for caching order book snapshots")
    snapshot_retention: int = Field(50, ge=1, description="Number of snapshots to retain per market")


class AppConfig(BaseModel):
    secrets: SecretsConfig = Field(default_factory=SecretsConfig)
    kalshi_api: KalshiApiConfig
    research: ResearchProviderConfig
    risk: RiskConfig
    execution: ExecutionConfig
    telemetry: TelemetryConfig
    database: DatabaseConfig
    scanner: ScannerConfig
    strategy: StrategyConfig = Field(default_factory=StrategyConfig)

    class Config:
        arbitrary_types_allowed = True

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AppConfig":
        return cls(**data)


ResearchProviderConfig.model_rebuild()
