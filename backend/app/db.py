from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg2
from psycopg2.extras import RealDictCursor

from .settings import settings


@contextmanager
def connection() -> Iterator:
    conn = psycopg2.connect(settings.database_url)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@contextmanager
def cursor() -> Iterator:
    with connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            yield cur
