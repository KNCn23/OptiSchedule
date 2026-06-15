from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/optisched",
    )
    frontend_origin: str = os.getenv(
        "FRONTEND_ORIGIN",
        "http://127.0.0.1:5173",
    )
    app_secret: str = os.getenv(
        "APP_SECRET",
        "change-this-development-secret",
    )
    token_ttl_seconds: int = int(os.getenv("TOKEN_TTL_SECONDS", "28800"))


settings = Settings()
