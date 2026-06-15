from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from fastapi import Depends, Header, HTTPException

from .db import connection
from .models import Account
from .settings import settings


def _account_for_user(user_id: int) -> Account | None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.user_id, u.username, u.full_name, r.role_name,
                       u.department_id, d.department_name
                FROM users u
                JOIN roles r ON r.role_id = u.role_id
                LEFT JOIN departments d ON d.department_id = u.department_id
                WHERE u.user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return Account(
        user_id=row[0],
        username=row[1],
        full_name=row[2],
        role=row[3],
        department_id=row[4],
        department_name=row[5],
    )


def authenticate(username: str, password: str) -> Account | None:
    password_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id, password_hash
                FROM users
                WHERE username = %s
                """,
                (username,),
            )
            row = cur.fetchone()
    if not row or not hmac.compare_digest(row[1], password_hash):
        return None
    return _account_for_user(int(row[0]))


def create_access_token(account: Account) -> str:
    payload = json.dumps(
        {
            "sub": account.user_id,
            "exp": int(time.time()) + settings.token_ttl_seconds,
        },
        separators=(",", ":"),
    ).encode("utf-8")
    encoded = base64.urlsafe_b64encode(payload).rstrip(b"=")
    signature = hmac.new(
        settings.app_secret.encode("utf-8"),
        encoded,
        hashlib.sha256,
    ).digest()
    return (
        encoded.decode("ascii")
        + "."
        + base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")
    )


def _decode_token(token: str) -> int:
    try:
        encoded, supplied_signature = token.split(".", 1)
        expected_signature = hmac.new(
            settings.app_secret.encode("utf-8"),
            encoded.encode("ascii"),
            hashlib.sha256,
        ).digest()
        supplied = base64.urlsafe_b64decode(supplied_signature + "=" * (-len(supplied_signature) % 4))
        if not hmac.compare_digest(expected_signature, supplied):
            raise ValueError("invalid signature")
        payload_bytes = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        payload = json.loads(payload_bytes)
        if int(payload["exp"]) < int(time.time()):
            raise ValueError("expired token")
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş oturum.") from exc


def current_account(authorization: str | None = Header(default=None)) -> Account:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Oturum açmanız gerekiyor.")
    account = _account_for_user(_decode_token(authorization[7:]))
    if account is None:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı.")
    return account


def optional_account(authorization: str | None = Header(default=None)) -> Account | None:
    if not authorization:
        return None
    return current_account(authorization)


CurrentAccount = Depends(current_account)
