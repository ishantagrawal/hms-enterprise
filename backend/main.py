import os
import hmac
import hashlib
import base64
import asyncio
import contextvars
import json
import logging
import math
import random
import re
import secrets
import sqlite3
import threading
import time
import uuid
from io import BytesIO
from contextlib import asynccontextmanager
from html import escape as html_escape
from datetime import datetime, time as datetime_time, timedelta, timezone
from typing import Optional, List, Dict
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.exceptions import WebAuthnException
from webauthn.helpers.structs import (
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
import google.auth.exceptions
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.exceptions import InvalidSignature

try:
    import psycopg2
    from psycopg2 import pool
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None
    pool = None
    RealDictCursor = None

DB_INTEGRITY_ERRORS = (sqlite3.IntegrityError,)
if psycopg2 is not None:
    DB_INTEGRITY_ERRORS += (psycopg2.IntegrityError,)

@asynccontextmanager
async def app_lifespan(application: FastAPI):
    task = asyncio.create_task(attendance_expiry_worker())
    application.state.attendance_expiry_task = task
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


ENVIRONMENT = os.getenv("ENV", os.getenv("ENVIRONMENT", "development")).strip().lower()
IS_PRODUCTION = ENVIRONMENT == "production"
REQUIRED_PRODUCTION_ENV = ("DATABASE_URL", "JWT_SECRET", "FACE_ENCRYPTION_KEY", "BEACON_HMAC_SECRETS_JSON")
if IS_PRODUCTION:
    missing_environment = [name for name in REQUIRED_PRODUCTION_ENV if not os.getenv(name, "").strip()]
    if missing_environment:
        raise RuntimeError(
            "Missing required production environment variables: "
            + ", ".join(missing_environment)
        )

app = FastAPI(
    title="svnitcampus - Production Backend",
    lifespan=app_lifespan,
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)
logger = logging.getLogger(__name__)

# Compress payloads > 500 bytes by ~80% for fast campus Wi-Fi transfer
app.add_middleware(GZipMiddleware, minimum_size=500)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
if IS_PRODUCTION and not GOOGLE_CLIENT_ID:
    raise RuntimeError("GOOGLE_CLIENT_ID must be configured in production.")
AUTH_SECRET = (os.getenv("JWT_SECRET") or os.getenv("AUTH_SECRET") or "").strip()
if AUTH_SECRET and len(AUTH_SECRET) < 32:
    raise RuntimeError("AUTH_SECRET must contain at least 32 characters.")
if not AUTH_SECRET and IS_PRODUCTION:
    raise RuntimeError("AUTH_SECRET must be configured when DATABASE_URL is set.")
AUTH_SECRET = AUTH_SECRET or secrets.token_urlsafe(48)
FACE_ENCRYPTION_KEY = os.getenv("FACE_ENCRYPTION_KEY", "").strip()
BEACON_HMAC_SECRETS_JSON = os.getenv("BEACON_HMAC_SECRETS_JSON", "").strip()
try:
    BEACON_HMAC_SECRETS = json.loads(BEACON_HMAC_SECRETS_JSON or "{}")
except json.JSONDecodeError as error:
    raise RuntimeError("BEACON_HMAC_SECRETS_JSON must be valid JSON.") from error
if not isinstance(BEACON_HMAC_SECRETS, dict):
    raise RuntimeError("BEACON_HMAC_SECRETS_JSON must be a JSON object.")
DEFAULT_ADMIN_PASS = ""
PASSWORD_HASH_PREFIX = "pbkdf2_sha256$"
PASSWORD_HASH_ITERATIONS = 600_000
PASSWORD_MIN_LENGTH = 12
STAFF_LOGIN_ROLES = {
    "Dean",
    "Founder",
    "Warden",
    "ClubOrganizer",
    "Staff",
    "GateSecurity",
    "Gate Security",
}
PASSWORD_LOGIN_FAILURES: Dict[str, tuple] = {}
PASSWORD_LOGIN_FAILURES_LOCK = threading.Lock()

_GOOGLE_TOKEN_CACHE: Dict[str, tuple] = {}
_GOOGLE_TOKEN_CACHE_LOCK = threading.Lock()

# RAM Cache for Bearer token user lookup (eliminates redundant DB hit on every API call)
_USER_AUTH_CACHE: Dict[tuple, tuple] = {}
_USER_AUTH_CACHE_LOCK = threading.Lock()
USER_CACHE_TTL = 60.0
ACTIVE_COLLEGE_ID = contextvars.ContextVar("active_college_id", default="SVNIT")
_TENANT_CACHE: Dict[str, tuple] = {}
_TENANT_CACHE_LOCK = threading.Lock()

CORS_ORIGINS = [
    "https://svnitcampus.in",
    "https://localhost",
    "capacitor://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

RATE_LIMITS = {
    "/api/auth/": (10, 60),
    "/api/biometric/register": (5, 300),
    "/api/biometric/beacon-mark": (12, 60),
    "/api/attendance/verify-identity": (12, 60),
}
_RATE_LIMIT_STATE = {}
_RATE_LIMIT_LOCK = threading.Lock()


@app.middleware("http")
async def rate_limit_sensitive_routes(request: Request, call_next):
    limit_config = next(
        ((limit, window) for path, (limit, window) in RATE_LIMITS.items()
         if request.url.path.startswith(path)),
        None,
    )
    if limit_config:
        limit, window = limit_config
        authorization = request.headers.get("authorization", "")
        identity = f"user:{hashlib.sha256(authorization.encode()).hexdigest()}" if authorization else f"ip:{request.client.host if request.client else 'unknown'}"
        key = (request.url.path, identity)
        now = time.monotonic()
        with _RATE_LIMIT_LOCK:
            timestamps = [stamp for stamp in _RATE_LIMIT_STATE.get(key, []) if now - stamp < window]
            if len(timestamps) >= limit:
                return JSONResponse(status_code=429, content={"detail": "Too many requests. Try again later."})
            timestamps.append(now)
            _RATE_LIMIT_STATE[key] = timestamps
    return await call_next(request)

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DB_FILE = os.getenv("DB_FILE", "hms.db")
USE_POSTGRES = bool(DATABASE_URL and psycopg2 is not None)

# =====================================================================
# PERSISTENT POSTGRESQL CONNECTION POOL & DROP-IN WRAPPER
# =====================================================================
pg_pool = None

if USE_POSTGRES:
    _db_url = DATABASE_URL
    if _db_url.startswith("postgres://"):
        _db_url = _db_url.replace("postgres://", "postgresql://", 1)
    try:
        pg_pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=3,
            maxconn=20,
            dsn=_db_url,
            cursor_factory=RealDictCursor,
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=5,
        )
        print("✅ PostgreSQL ThreadedConnectionPool Initialized (3-20 warm connections)")
    except Exception as e:
        print(f"⚠️ Connection pool init fallback: {e}")
        pg_pool = None


class PooledConnection:
    """
    Wraps a pooled psycopg2 connection so calling conn.close() returns
    the connection to the pool in 0ms instead of closing the socket.
    """
    def __init__(self, raw_conn, connection_pool):
        self._conn = raw_conn
        self._pool = connection_pool
        self._closed = False

    def cursor(self, *args, **kwargs):
        return self._conn.cursor(*args, **kwargs)

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    def close(self):
        if not self._closed and self._conn is not None:
            self._closed = True
            try:
                self._conn.rollback()
                self._pool.putconn(self._conn)
            except Exception:
                try:
                    self._pool.putconn(self._conn, close=True)
                except Exception:
                    self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.rollback()
        self.close()

    def __getattr__(self, name):
        return getattr(self._conn, name)


def get_conn():
    if USE_POSTGRES:
        if pg_pool is not None:
            raw_conn = None
            try:
                raw_conn = pg_pool.getconn()
                if raw_conn.closed != 0:
                    pg_pool.putconn(raw_conn, close=True)
                    raw_conn = pg_pool.getconn()
                cursor = raw_conn.cursor()
                cursor.execute(
                    "SELECT set_config('app.college_id', %s, true)",
                    (ACTIVE_COLLEGE_ID.get(),),
                )
                cursor.close()
                return PooledConnection(raw_conn, pg_pool)
            except Exception as e:
                if raw_conn is not None:
                    try:
                        pg_pool.putconn(raw_conn, close=True)
                    except Exception:
                        raw_conn.close()
                logger.warning("Pooled database connection unavailable; using a direct connection: %s", e)
        url = DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        raw_conn = psycopg2.connect(url, cursor_factory=RealDictCursor)
        cursor = raw_conn.cursor()
        cursor.execute(
            "SELECT set_config('app.college_id', %s, true)",
            (ACTIVE_COLLEGE_ID.get(),),
        )
        cursor.close()
        return raw_conn

    # High-concurrency SQLite with WAL mode & 64MB RAM cache
    conn = sqlite3.connect(DB_FILE, check_same_thread=False, timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA cache_size=-64000;")
    return conn


def db_exec(conn, query: str, params: tuple = ()):
    cur = conn.cursor()
    if USE_POSTGRES:
        query = query.replace("?", "%s")
    cur.execute(query, params)
    return cur


def db_fetchone(conn, query: str, params: tuple = ()):
    cursor = db_exec(conn, query, params)
    try:
        return cursor.fetchone()
    finally:
        cursor.close()


def invalidate_user_cache(user_id: Optional[str] = None):
    with _USER_AUTH_CACHE_LOCK:
        if user_id:
            uid = user_id.strip().upper()
            keys = [key for key in _USER_AUTH_CACHE if key[1] == uid]
            for key in keys:
                _USER_AUTH_CACHE.pop(key, None)
        else:
            _USER_AUTH_CACHE.clear()


def create_session_token(
    user_id: str,
    college_id: Optional[str] = None,
    password_hash: Optional[str] = None,
) -> str:
    exp = int(time.time()) + 86400 * 7
    college = (college_id or ACTIVE_COLLEGE_ID.get()).upper()
    if password_hash is None:
        payload = f"{user_id.upper()}:{college}:{exp}"
    else:
        fingerprint = hmac.new(
            AUTH_SECRET.encode(), password_hash.encode(), hashlib.sha256
        ).hexdigest()
        payload = f"{user_id.upper()}:{college}:{fingerprint}:{exp}"
    sig = hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    raw = f"{payload}:{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def verify_session_token(token: str) -> Optional[tuple]:
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        parts = raw.split(":")
        if len(parts) == 3:
            user_id, exp_str, sig = parts
            college_id = "SVNIT"
            payload = f"{user_id}:{exp_str}"
            password_fingerprint = None
        elif len(parts) == 4:
            user_id, college_id, exp_str, sig = parts
            payload = f"{user_id}:{college_id}:{exp_str}"
            password_fingerprint = None
        elif len(parts) == 5:
            user_id, college_id, password_fingerprint, exp_str, sig = parts
            payload = f"{user_id}:{college_id}:{password_fingerprint}:{exp_str}"
        else:
            return None
        if int(exp_str) < int(time.time()):
            return None
        expected_sig = hmac.new(
            AUTH_SECRET.encode(), payload.encode(), hashlib.sha256
        ).hexdigest()
        if hmac.compare_digest(sig, expected_sig):
            return user_id.upper(), college_id.upper(), password_fingerprint
    except Exception:
        return None
    return None


def hash_password(password: str) -> str:
    if not isinstance(password, str) or not PASSWORD_MIN_LENGTH <= len(password) <= 128:
        raise HTTPException(status_code=400, detail="Passwords must be between 12 and 128 characters.")
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PASSWORD_HASH_ITERATIONS
    )
    return (
        f"{PASSWORD_HASH_PREFIX}{PASSWORD_HASH_ITERATIONS}$"
        f"{base64.urlsafe_b64encode(salt).decode()}$"
        f"{base64.urlsafe_b64encode(derived).decode()}"
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        prefix, iterations_text, salt_text, expected_text = stored_hash.split("$", 3)
        iterations = int(iterations_text)
        if prefix != "pbkdf2_sha256" or not 100_000 <= iterations <= 1_000_000:
            return False
        salt = base64.urlsafe_b64decode(salt_text.encode())
        expected = base64.urlsafe_b64decode(expected_text.encode())
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, iterations
        )
        return hmac.compare_digest(actual, expected)
    except (AttributeError, TypeError, ValueError):
        return False


def password_login_key(request: Request, username: str) -> str:
    client_ip = request.client.host if request.client else "unknown"
    value = f"{ACTIVE_COLLEGE_ID.get()}:{client_ip}:{username.upper()}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def password_login_retry_after(key: str) -> int:
    now = time.monotonic()
    with PASSWORD_LOGIN_FAILURES_LOCK:
        _, blocked_until, last_attempt = PASSWORD_LOGIN_FAILURES.get(
            key, (0, 0.0, now)
        )
        if now - last_attempt >= 15 * 60:
            PASSWORD_LOGIN_FAILURES.pop(key, None)
            return 0
        if blocked_until > now:
            return max(1, int(blocked_until - now))
    return 0


def record_password_login_failure(key: str):
    now = time.monotonic()
    with PASSWORD_LOGIN_FAILURES_LOCK:
        failures, blocked_until, last_attempt = PASSWORD_LOGIN_FAILURES.get(
            key, (0, 0.0, now)
        )
        if now - last_attempt >= 15 * 60:
            failures = 0
            blocked_until = 0.0
        failures += 1
        blocked_until = now + 15 * 60 if failures >= 8 else 0.0
        PASSWORD_LOGIN_FAILURES[key] = (failures, blocked_until, now)
        if len(PASSWORD_LOGIN_FAILURES) > 10_000:
            expired_keys = [
                stored_key
                for stored_key, (_, _, updated_at) in PASSWORD_LOGIN_FAILURES.items()
                if now - updated_at >= 15 * 60
            ]
            for expired_key in expired_keys:
                PASSWORD_LOGIN_FAILURES.pop(expired_key, None)
            if len(PASSWORD_LOGIN_FAILURES) > 10_000:
                oldest_keys = sorted(
                    PASSWORD_LOGIN_FAILURES,
                    key=lambda stored_key: PASSWORD_LOGIN_FAILURES[stored_key][2],
                )[: len(PASSWORD_LOGIN_FAILURES) - 10_000]
                for oldest_key in oldest_keys:
                    PASSWORD_LOGIN_FAILURES.pop(oldest_key, None)


def clear_password_login_failures(key: str):
    with PASSWORD_LOGIN_FAILURES_LOCK:
        PASSWORD_LOGIN_FAILURES.pop(key, None)


def upsert_user(conn, u: tuple):
    if USE_POSTGRES:
        db_exec(
            conn,
            """
            INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob, wing, college_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT (college_id, user_id) DO UPDATE SET
                password = CASE
                    WHEN EXCLUDED.password = '' THEN users.password
                    ELSE EXCLUDED.password
                END,
                full_name = EXCLUDED.full_name,
                role = EXCLUDED.role,
                authority_title = EXCLUDED.authority_title,
                hostel_block = EXCLUDED.hostel_block,
                phone = EXCLUDED.phone,
                email = EXCLUDED.email,
                department = EXCLUDED.department
            """,
            (*u, ACTIVE_COLLEGE_ID.get()),
        )
    else:
        existing = db_exec(
            conn,
            "SELECT user_id FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
            (ACTIVE_COLLEGE_ID.get(), u[0].upper()),
        ).fetchone()
        if existing:
            db_exec(
                conn,
                """
                UPDATE users SET
                    password = CASE WHEN ? = '' THEN password ELSE ? END,
                    full_name = ?, role = ?, authority_title = ?, hostel_block = ?, phone = ?, email = ?, department = ?
                WHERE college_id = ? AND UPPER(user_id) = ?
                """,
                (u[1], u[1], u[2], u[3], u[4], u[6], u[9], u[10], u[11], ACTIVE_COLLEGE_ID.get(), u[0].upper()),
            )
        else:
            db_exec(
                conn,
                """
                INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob, wing, college_id)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (*u, ACTIVE_COLLEGE_ID.get()),
            )
    invalidate_user_cache(u[0])


def upsert_club(conn, c: tuple):
    if USE_POSTGRES:
        db_exec(
            conn,
            """
            INSERT INTO clubs (club_id, name, mission, faculty_advisor, head_coordinator, extra_dean_info, banner_url, logo_url, members, gallery)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT (college_id, club_id) DO UPDATE SET
                name = EXCLUDED.name,
                mission = EXCLUDED.mission,
                faculty_advisor = CASE WHEN clubs.faculty_advisor IS NULL OR clubs.faculty_advisor = '' THEN EXCLUDED.faculty_advisor ELSE clubs.faculty_advisor END,
                head_coordinator = CASE WHEN clubs.head_coordinator IS NULL OR clubs.head_coordinator = '' THEN EXCLUDED.head_coordinator ELSE clubs.head_coordinator END
            """,
            c,
        )
    else:
        existing = db_exec(conn, "SELECT club_id FROM clubs WHERE UPPER(club_id) = ?", (c[0].upper(),)).fetchone()
        if not existing:
            db_exec(
                conn,
                """
                INSERT INTO clubs
                    (club_id, name, mission, faculty_advisor, head_coordinator, extra_dean_info, banner_url, logo_url, members, gallery)
                VALUES (?,?,?,?,?,?,?,?,?,?)
                """,
                c,
            )
        else:
            db_exec(
                conn,
                "UPDATE clubs SET name = ?, mission = ?, faculty_advisor = ?, head_coordinator = ? WHERE UPPER(club_id) = ?",
                (c[1], c[2], c[3], c[4], c[0].upper()),
            )


def init_db():
    conn = get_conn()
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            password TEXT,
            full_name TEXT,
            role TEXT,
            authority_title TEXT,
            institute_id TEXT,
            hostel_block TEXT,
            year TEXT,
            room TEXT,
            phone TEXT,
            email TEXT,
            department TEXT,
            dob TEXT,
            wing TEXT,
            guardian_phone TEXT,
            guardian_whatsapp_consent INTEGER NOT NULL DEFAULT 0
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS departments (
            id TEXT PRIMARY KEY,
            title TEXT,
            type TEXT,
            hostel_block TEXT,
            icon TEXT
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS clubs (
            club_id TEXT PRIMARY KEY,
            name TEXT,
            mission TEXT,
            faculty_advisor TEXT,
            head_coordinator TEXT,
            extra_dean_info TEXT,
            banner_url TEXT,
            logo_url TEXT,
            members TEXT,
            gallery TEXT
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS events (
            event_id TEXT PRIMARY KEY,
            club_id TEXT,
            title TEXT,
            date TEXT,
            start_time TEXT,
            end_time TEXT,
            venue TEXT,
            status TEXT,
            submitted_by TEXT,
            description TEXT,
            budget TEXT,
            funding_source TEXT,
            chief_guest TEXT,
            expected_attendance TEXT,
            logistics_needs TEXT,
            image_url TEXT,
            registration_link TEXT,
            custom_fields TEXT,
            rsvps TEXT,
            feedbacks TEXT,
            ai_audit TEXT
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS complaints (
            ticket_id TEXT PRIMARY KEY,
            student_id TEXT,
            student_name TEXT,
            hostel_block TEXT,
            room TEXT,
            year TEXT,
            department TEXT,
            category TEXT,
            summary TEXT,
            description TEXT,
            status TEXT,
            routed_to TEXT,
            staff_remark TEXT,
            created_at TEXT,
            resolved_at TEXT,
            wing TEXT
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS notices (
            notice_id TEXT PRIMARY KEY,
            club_id TEXT,
            title TEXT,
            message TEXT,
            target_branch TEXT,
            target_year TEXT,
            image_url TEXT,
            registration_link TEXT,
            custom_fields TEXT,
            status TEXT,
            created_at TEXT
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS ads (
            ad_id TEXT PRIMARY KEY,
            sponsor_tag TEXT,
            title TEXT,
            subtitle TEXT,
            badge_text TEXT,
            cta_text TEXT,
            target_url TEXT,
            image_url TEXT,
            bg_gradient TEXT,
            created_at TEXT,
            expires_at TEXT
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS event_photo_albums (
            album_id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            club_id TEXT NOT NULL,
            album_url TEXT NOT NULL,
            caption TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS student_profile_requests (
            request_id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL,
            hostel_block TEXT NOT NULL,
            requested_changes TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            reviewed_at TEXT NOT NULL,
            reviewed_by TEXT NOT NULL,
            review_remark TEXT NOT NULL
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS tenants (
            college_id TEXT PRIMARY KEY,
            college_name TEXT NOT NULL,
            primary_domain TEXT NOT NULL UNIQUE,
            allowed_email_domain TEXT NOT NULL,
            timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
            logo_url TEXT NOT NULL DEFAULT '',
            modules_json TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS hostels (
            college_id TEXT NOT NULL DEFAULT 'SVNIT',
            hostel_id TEXT NOT NULL,
            name TEXT NOT NULL,
            wings_json TEXT NOT NULL DEFAULT '[]',
            wing_beacons_json TEXT NOT NULL DEFAULT '{}',
            enabled INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (college_id, hostel_id)
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS attendance_sessions (
            college_id TEXT NOT NULL DEFAULT 'SVNIT',
            session_id TEXT NOT NULL,
            hostel_block TEXT NOT NULL,
            hostel_key TEXT NOT NULL DEFAULT '',
            session_date TEXT NOT NULL DEFAULT '',
            started_by TEXT NOT NULL,
            started_at TEXT NOT NULL,
            closes_at TEXT NOT NULL,
            session_secret TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            PRIMARY KEY (college_id, session_id)
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS attendance_records (
            college_id TEXT NOT NULL DEFAULT 'SVNIT',
            record_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            status TEXT NOT NULL,
            method TEXT NOT NULL,
            marked_at TEXT NOT NULL,
            exception_reason TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (college_id, record_id),
            UNIQUE (college_id, session_id, student_id)
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS attendance_challenges (
            college_id TEXT NOT NULL,
            nonce TEXT NOT NULL,
            student_id TEXT NOT NULL,
            colors_json TEXT NOT NULL,
            gesture TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            consumed_at TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (college_id, nonce)
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS attendance_logs (
            college_id TEXT NOT NULL DEFAULT 'SVNIT',
            log_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            student_name TEXT NOT NULL DEFAULT '',
            hostel_block TEXT NOT NULL,
            wing TEXT NOT NULL DEFAULT '',
            room TEXT NOT NULL DEFAULT '',
            date TEXT NOT NULL,
            time TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            wing_beacon_id TEXT NOT NULL DEFAULT '',
            rssi INTEGER,
            verified_method TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (college_id, log_id)
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS warden_test_overrides (
            college_id TEXT NOT NULL,
            override_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            wing TEXT NOT NULL,
            enabled_by TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            PRIMARY KEY (college_id, override_id)
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS leave_passes (
            college_id TEXT NOT NULL DEFAULT 'SVNIT',
            pass_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            hostel_block TEXT NOT NULL,
            pass_type TEXT NOT NULL,
            destination TEXT NOT NULL,
            purpose TEXT NOT NULL,
            departure_at TEXT NOT NULL,
            return_at TEXT NOT NULL,
            status TEXT NOT NULL,
            warden_id TEXT NOT NULL DEFAULT '',
            reviewed_at TEXT NOT NULL DEFAULT '',
            reviewed_by TEXT NOT NULL DEFAULT '',
            review_remark TEXT NOT NULL DEFAULT '',
            qr_secret TEXT NOT NULL,
            parent_alert_status TEXT NOT NULL DEFAULT 'queued',
            parent_phone TEXT NOT NULL DEFAULT '',
            student_name TEXT NOT NULL DEFAULT '',
            wing TEXT NOT NULL DEFAULT '',
            room TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            leave_type TEXT NOT NULL DEFAULT '',
            reason TEXT NOT NULL DEFAULT '',
            from_date TEXT NOT NULL DEFAULT '',
            to_date TEXT NOT NULL DEFAULT '',
            days_count INTEGER NOT NULL DEFAULT 0,
            qr_token TEXT NOT NULL DEFAULT '',
            expected_return_time TEXT NOT NULL DEFAULT '22:00',
            actual_return_at TEXT NOT NULL DEFAULT '',
            return_status TEXT NOT NULL DEFAULT 'Not Returned',
            return_beacon_id TEXT NOT NULL DEFAULT '',
            approved_by TEXT NOT NULL DEFAULT 'Chief Warden',
            created_at TEXT NOT NULL,
            PRIMARY KEY (college_id, pass_id)
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS pass_scans (
            college_id TEXT NOT NULL DEFAULT 'SVNIT',
            scan_id TEXT NOT NULL,
            pass_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            direction TEXT NOT NULL,
            scanned_by TEXT NOT NULL,
            scanned_at TEXT NOT NULL,
            PRIMARY KEY (college_id, scan_id),
            UNIQUE (college_id, pass_id, direction)
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS webauthn_credentials (
            college_id TEXT NOT NULL DEFAULT 'SVNIT',
            credential_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            public_key TEXT NOT NULL,
            sign_count INTEGER NOT NULL DEFAULT 0,
            transports TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            PRIMARY KEY (college_id, credential_id)
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS webauthn_challenges (
            college_id TEXT NOT NULL DEFAULT 'SVNIT',
            challenge_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            challenge TEXT NOT NULL,
            purpose TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            PRIMARY KEY (college_id, challenge_id)
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            college_id TEXT NOT NULL DEFAULT 'SVNIT',
            endpoint TEXT NOT NULL,
            user_id TEXT NOT NULL,
            subscription_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (college_id, endpoint)
        )
    ''')
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS notification_outbox (
            college_id TEXT NOT NULL DEFAULT 'SVNIT',
            notification_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            channel TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (college_id, notification_id)
        )
    ''')

    tenant_tables = {
        "users": "user_id",
        "departments": "id",
        "clubs": "club_id",
        "events": "event_id",
        "complaints": "ticket_id",
        "notices": "notice_id",
        "ads": "ad_id",
        "event_photo_albums": "album_id",
        "student_profile_requests": "request_id",
        "attendance_sessions": "session_id",
        "attendance_records": "record_id",
        "attendance_logs": "log_id",
        "leave_passes": "pass_id",
        "pass_scans": "scan_id",
        "webauthn_credentials": "credential_id",
        "webauthn_challenges": "challenge_id",
        "push_subscriptions": "endpoint",
        "notification_outbox": "notification_id",
        "hostels": "hostel_id",
    }
    for table_name, key_column in tenant_tables.items():
        if USE_POSTGRES:
            db_exec(conn, f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS college_id TEXT")
            db_exec(conn, f"UPDATE {table_name} SET college_id = 'SVNIT' WHERE college_id IS NULL")
            db_exec(conn, f"ALTER TABLE {table_name} ALTER COLUMN college_id SET NOT NULL")
            db_exec(conn, f"ALTER TABLE {table_name} DROP CONSTRAINT IF EXISTS {table_name}_pkey")
            db_exec(conn, f"ALTER TABLE {table_name} ADD PRIMARY KEY (college_id, {key_column})")
            db_exec(
                conn,
                f"CREATE INDEX IF NOT EXISTS idx_{table_name}_college_id ON {table_name} (college_id)",
            )
        else:
            columns = {
                column[0]
                for column in db_exec(conn, f"SELECT * FROM {table_name} LIMIT 0").description
            }
            if "college_id" not in columns:
                db_exec(
                    conn,
                    f"ALTER TABLE {table_name} ADD COLUMN college_id TEXT NOT NULL DEFAULT 'SVNIT'",
                )

    if USE_POSTGRES:
        db_exec(conn, """
            CREATE OR REPLACE FUNCTION set_active_college_id() RETURNS trigger AS $$
            BEGIN
                NEW.college_id := current_setting('app.college_id', true);
                IF NEW.college_id IS NULL OR NEW.college_id = '' THEN
                    RAISE EXCEPTION 'Missing tenant context';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        """)
        for table_name in tenant_tables:
            db_exec(conn, f"DROP TRIGGER IF EXISTS {table_name}_set_college_id ON {table_name}")
            db_exec(conn, f"""
                CREATE TRIGGER {table_name}_set_college_id
                BEFORE INSERT ON {table_name}
                FOR EACH ROW EXECUTE FUNCTION set_active_college_id()
            """)
            db_exec(conn, f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY")
            db_exec(conn, f"ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY")
            db_exec(conn, f"DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name}")
            db_exec(conn, f"""
                CREATE POLICY {table_name}_tenant_isolation ON {table_name}
                USING (
                    college_id = current_setting('app.college_id', true)
                    OR current_setting('app.college_id', true) = '*'
                )
                WITH CHECK (
                    college_id = current_setting('app.college_id', true)
                    OR current_setting('app.college_id', true) = '*'
                )
            """)

    default_modules = {
        "grievances": True,
        "mess_pulse": True,
        "event_radar": True,
        "gate_outpass": False,
        "attendance": False,
        "parent_alerts": False,
    }
    db_exec(
        conn,
        """
        INSERT INTO tenants
            (college_id, college_name, primary_domain, allowed_email_domain, timezone, logo_url, modules_json, enabled, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (college_id) DO NOTHING
        """,
        (
            "SVNIT",
            "Sardar Vallabhbhai National Institute of Technology",
            os.getenv("SVNIT_PRIMARY_DOMAIN", "svnitcampus.in").strip().lower(),
            "svnit.ac.in",
            "Asia/Kolkata",
            "",
            json.dumps(default_modules),
            1,
            datetime.now().isoformat(timespec="seconds"),
        ),
    )

    user_columns = {column[0] for column in db_exec(conn, "SELECT * FROM users LIMIT 0").description}
    if "wing" not in user_columns:
        db_exec(conn, "ALTER TABLE users ADD COLUMN wing TEXT")
    if "guardian_phone" not in user_columns:
        db_exec(conn, "ALTER TABLE users ADD COLUMN guardian_phone TEXT")
    if "guardian_whatsapp_consent" not in user_columns:
        db_exec(conn, "ALTER TABLE users ADD COLUMN guardian_whatsapp_consent INTEGER NOT NULL DEFAULT 0")
    for column_name, column_definition in (
        ("biometric_status", "TEXT NOT NULL DEFAULT 'Unenrolled'"),
        ("biometric_cred_id", "TEXT NOT NULL DEFAULT ''"),
        ("device_hardware_id", "TEXT NOT NULL DEFAULT ''"),
        ("device_token_hash", "TEXT NOT NULL DEFAULT ''"),
        ("face_reference_encrypted", "TEXT NOT NULL DEFAULT ''"),
        ("face_embedding_encrypted", "TEXT NOT NULL DEFAULT ''"),
        ("device_public_key", "TEXT NOT NULL DEFAULT ''"),
        ("face_enrolled_at", "TEXT NOT NULL DEFAULT ''"),
        ("enroll_window_until", "INTEGER NOT NULL DEFAULT 0"),
        ("consent_withdrawn_at", "TEXT NOT NULL DEFAULT ''"),
    ):
        if column_name not in user_columns:
            db_exec(conn, f"ALTER TABLE users ADD COLUMN {column_name} {column_definition}")
    if "managed_by" not in user_columns:
        db_exec(conn, "ALTER TABLE users ADD COLUMN managed_by TEXT NOT NULL DEFAULT ''")
    warden_rows = db_exec(
        conn,
        "SELECT user_id, hostel_block FROM users WHERE role = 'Warden' AND college_id = ?",
        (ACTIVE_COLLEGE_ID.get(),),
    ).fetchall()
    unowned_staff = db_exec(
        conn,
        "SELECT user_id, hostel_block FROM users WHERE role = 'Staff' AND college_id = ? AND (managed_by IS NULL OR managed_by = '')",
        (ACTIVE_COLLEGE_ID.get(),),
    ).fetchall()
    for warden in warden_rows:
        prefix = re.sub(r"[^A-Z0-9]+", "_", warden["user_id"].upper()).strip("_") + "_"
        for staff in unowned_staff:
            if (
                str(staff["hostel_block"] or "").casefold()
                == str(warden["hostel_block"] or "").casefold()
                and staff["user_id"].upper().startswith(prefix)
            ):
                db_exec(
                    conn,
                    "UPDATE users SET managed_by = ? WHERE UPPER(user_id) = ? AND (managed_by IS NULL OR managed_by = '')",
                    (warden["user_id"], staff["user_id"].upper()),
                )
    hostel_columns = {column[0] for column in db_exec(conn, "SELECT * FROM hostels LIMIT 0").description}
    for column_name, column_definition in (
        ("attendance_start_time", "TEXT NOT NULL DEFAULT '21:00'"),
        ("attendance_end_time", "TEXT NOT NULL DEFAULT '22:00'"),
        ("attendance_test_mode", "INTEGER NOT NULL DEFAULT 0"),
        ("geofence_latitude", "REAL"),
        ("geofence_longitude", "REAL"),
        ("geofence_radius_m", "INTEGER NOT NULL DEFAULT 150"),
        ("geofence_max_accuracy_m", "INTEGER NOT NULL DEFAULT 100"),
        ("wing_beacons_json", "TEXT NOT NULL DEFAULT '{}'"),
    ):
        if column_name not in hostel_columns:
            db_exec(conn, f"ALTER TABLE hostels ADD COLUMN {column_name} {column_definition}")
    tenant_columns = {column[0] for column in db_exec(conn, "SELECT * FROM tenants LIMIT 0").description}
    if "timezone" not in tenant_columns:
        db_exec(conn, "ALTER TABLE tenants ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata'")
    pass_columns = {column[0] for column in db_exec(conn, "SELECT * FROM leave_passes LIMIT 0").description}
    for column_name, column_definition in (
        ("parent_phone", "TEXT NOT NULL DEFAULT ''"),
        ("reviewed_by", "TEXT NOT NULL DEFAULT ''"),
        ("review_remark", "TEXT NOT NULL DEFAULT ''"),
        ("student_name", "TEXT NOT NULL DEFAULT ''"),
        ("wing", "TEXT NOT NULL DEFAULT ''"),
        ("room", "TEXT NOT NULL DEFAULT ''"),
        ("phone", "TEXT NOT NULL DEFAULT ''"),
        ("leave_type", "TEXT NOT NULL DEFAULT ''"),
        ("reason", "TEXT NOT NULL DEFAULT ''"),
        ("from_date", "TEXT NOT NULL DEFAULT ''"),
        ("to_date", "TEXT NOT NULL DEFAULT ''"),
        ("days_count", "INTEGER NOT NULL DEFAULT 0"),
        ("qr_token", "TEXT NOT NULL DEFAULT ''"),
        ("expected_return_time", "TEXT NOT NULL DEFAULT '22:00'"),
        ("actual_return_at", "TEXT NOT NULL DEFAULT ''"),
        ("return_status", "TEXT NOT NULL DEFAULT 'Not Returned'"),
        ("return_beacon_id", "TEXT NOT NULL DEFAULT ''"),
        ("approved_by", "TEXT NOT NULL DEFAULT 'Chief Warden'"),
    ):
        if column_name not in pass_columns:
            db_exec(conn, f"ALTER TABLE leave_passes ADD COLUMN {column_name} {column_definition}")
    session_columns = {column[0] for column in db_exec(conn, "SELECT * FROM attendance_sessions LIMIT 0").description}
    for column_name, column_definition in (
        ("hostel_key", "TEXT NOT NULL DEFAULT ''"),
        ("session_date", "TEXT NOT NULL DEFAULT ''"),
        ("session_secret", "TEXT NOT NULL DEFAULT ''"),
        ("geofence_latitude", "REAL"),
        ("geofence_longitude", "REAL"),
        ("geofence_radius_m", "INTEGER NOT NULL DEFAULT 0"),
        ("geofence_max_accuracy_m", "INTEGER NOT NULL DEFAULT 0"),
    ):
        if column_name not in session_columns:
            db_exec(conn, f"ALTER TABLE attendance_sessions ADD COLUMN {column_name} {column_definition}")
    attendance_columns = {column[0] for column in db_exec(conn, "SELECT * FROM attendance_records LIMIT 0").description}
    if "exception_reason" not in attendance_columns:
        db_exec(conn, "ALTER TABLE attendance_records ADD COLUMN exception_reason TEXT NOT NULL DEFAULT ''")
    complaint_columns = {column[0] for column in db_exec(conn, "SELECT * FROM complaints LIMIT 0").description}
    if "wing" not in complaint_columns:
        db_exec(conn, "ALTER TABLE complaints ADD COLUMN wing TEXT")
    db_exec(
        conn,
        "UPDATE users SET password = '' "
        "WHERE password IS NOT NULL AND password != '' "
        "AND password NOT LIKE ?",
        (f"{PASSWORD_HASH_PREFIX}%",),
    )

    # High-Speed B-Tree & Expression Indexes (accelerates UPPER/LOWER filters)
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_users_upper_id ON users (UPPER(user_id))",
        "CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users (LOWER(email))",
        "CREATE INDEX IF NOT EXISTS idx_users_role_hostel ON users (role, LOWER(hostel_block))",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_device_token_hash "
        "ON users (college_id, device_token_hash) WHERE device_token_hash != ''",
        "CREATE INDEX IF NOT EXISTS idx_complaints_student ON complaints (UPPER(student_id), created_at)",
        "CREATE INDEX IF NOT EXISTS idx_complaints_hostel ON complaints (LOWER(hostel_block), created_at)",
        "CREATE INDEX IF NOT EXISTS idx_complaints_cat ON complaints (UPPER(category), LOWER(routed_to))",
        "CREATE INDEX IF NOT EXISTS idx_events_date_status ON events (date, status)",
        "CREATE INDEX IF NOT EXISTS idx_events_club ON events (UPPER(club_id))",
        "CREATE INDEX IF NOT EXISTS idx_notices_status ON notices (status, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_event_albums_event ON event_photo_albums (event_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_profile_requests_hostel_status ON student_profile_requests (LOWER(hostel_block), status, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_profile_requests_student_status ON student_profile_requests (UPPER(student_id), status, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_profile_requests_tenant_hostel_status ON student_profile_requests (college_id, LOWER(hostel_block), status, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_profile_requests_tenant_student_status ON student_profile_requests (college_id, UPPER(student_id), status, created_at)",
    ]
    for idx_sql in indexes:
        try:
            db_exec(conn, idx_sql)
        except Exception:
            pass
    db_exec(
        conn,
        "DROP INDEX IF EXISTS idx_attendance_hostel_day",
    )
    db_exec(
        conn,
        "CREATE INDEX IF NOT EXISTS idx_attendance_logs_hostel_date_student "
        "ON attendance_logs (college_id, LOWER(hostel_block), date, UPPER(student_id))",
    )
    db_exec(conn, "CREATE INDEX IF NOT EXISTS idx_leave_passes_student ON leave_passes (college_id, UPPER(student_id), created_at)")
    db_exec(conn, "CREATE INDEX IF NOT EXISTS idx_leave_passes_hostel ON leave_passes (college_id, LOWER(hostel_block), status, created_at)")
    db_exec(conn, "CREATE INDEX IF NOT EXISTS idx_attendance_expiry ON attendance_sessions (college_id, status, closes_at)")
    db_exec(conn, "CREATE INDEX IF NOT EXISTS idx_attendance_hostel_status ON attendance_sessions (college_id, LOWER(hostel_block), status, closes_at)")
    db_exec(conn, "CREATE INDEX IF NOT EXISTS idx_attendance_hostel_history ON attendance_sessions (college_id, LOWER(hostel_block), started_at)")
    db_exec(conn, "CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records (college_id, UPPER(student_id), marked_at)")
    db_exec(conn, "CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user ON webauthn_credentials (college_id, UPPER(user_id))")
    db_exec(conn, "CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user ON webauthn_challenges (college_id, UPPER(user_id), purpose, expires_at)")

    default_users = [
        ("FOUNDER", DEFAULT_ADMIN_PASS, "Founder & Ad Admin", "Founder", "Platform Creator & Sponsor Manager", "SVNIT", "All", "-", "Admin", "+91-7906771779", "founder@svnit.ac.in", "Platform Admin", "10072007", ""),
        ("DEAN", DEFAULT_ADMIN_PASS, "Dr. Shweta Shah (Dean SW Office)", "Dean", "Dean Student Welfare (SVNIT)", "SVNIT", "All", "-", "SAC / Admin Block", "0261-2201500", "dean_sw@svnit.ac.in", "Office of Dean Student Welfare", "", ""),
        ("CW_GAJJAR", DEFAULT_ADMIN_PASS, "Gajjar Bhawan Chief Warden Office", "Warden", "Chief Warden / Hostel Office", "SVNIT", "Gajjar Bhawan", "-", "Warden Office", "0261-2201659", "warden_gajjar@svnit.ac.in", "Hostel Administration", "", ""),
        ("CW_BHABHA", DEFAULT_ADMIN_PASS, "Bhabha Bhawan Chief Warden Office", "Warden", "Chief Warden / Hostel Office", "SVNIT", "Bhabha Bhawan", "-", "Warden Office", "0261-2201790", "warden_bhabha@svnit.ac.in", "Hostel Administration", "", ""),
        ("CW_MTB", DEFAULT_ADMIN_PASS, "Mother Teresa Bhawan Warden Office", "Warden", "Chief Warden / Hostel Office", "SVNIT", "Mother Teresa Bhawan", "-", "Warden Office", "0261-2201967", "warden_mtb@svnit.ac.in", "Hostel Administration", "", ""),
        ("CW_SVB", DEFAULT_ADMIN_PASS, "Swami Vivekananda Bhawan Warden Office", "Warden", "Chief Warden / Hostel Office", "SVNIT", "Swami Vivekananda Bhawan", "-", "Warden Office", "0261-2201657", "warden_svb@svnit.ac.in", "Hostel Administration", "", ""),
        ("CW_NEHRU", DEFAULT_ADMIN_PASS, "Nehru Bhawan Chief Warden Office", "Warden", "Chief Warden / Hostel Office", "SVNIT", "Nehru Bhawan", "-", "Warden Office", "0261-2201703", "warden_nehru@svnit.ac.in", "Hostel Administration", "", ""),
        ("CW_TAGORE", DEFAULT_ADMIN_PASS, "Tagore Bhawan Chief Warden Office", "Warden", "Chief Warden / Hostel Office", "SVNIT", "Tagore Bhawan", "-", "Warden Office", "0261-2201707", "warden_tagore@svnit.ac.in", "Hostel Administration", "", ""),
        ("CW_SARABHAI", DEFAULT_ADMIN_PASS, "Sarabhai Bhawan Chief Warden Office", "Warden", "Chief Warden / Hostel Office", "SVNIT", "Sarabhai Bhawan", "-", "Warden Office", "0261-2201793", "warden_sarabhai@svnit.ac.in", "Hostel Administration", "", ""),
        ("CW_RAMAN", DEFAULT_ADMIN_PASS, "Raman Bhawan Chief Warden Office", "Warden", "Chief Warden / Hostel Office", "SVNIT", "Raman Bhawan", "-", "Warden Office", "0261-2201789", "warden_raman@svnit.ac.in", "Hostel Administration", "", ""),
        ("CW_ABVB", DEFAULT_ADMIN_PASS, "Atal Bihari Vajpayee Bhawan Warden Office", "Warden", "Chief Warden / Hostel Office", "SVNIT", "Atal Bihari Vajpayee Bhawan", "-", "Warden Office", "0261-2201880", "warden_abvb@svnit.ac.in", "Hostel Administration", "", ""),
        ("ELECTRICITY", DEFAULT_ADMIN_PASS, "Electrical Maintenance (Central)", "Staff", "Central Department Portal", "SVNIT", "All", "-", "Estate Electrical Wing", "0261-2201555", "electricity@svnit.ac.in", "ELECTRICITY", "", ""),
        ("CCC_LAN", DEFAULT_ADMIN_PASS, "CCC / Internet / LAN (Central)", "Staff", "Central Department Portal", "SVNIT", "All", "-", "Central Computer Centre", "0261-2201566", "ccc_lan@svnit.ac.in", "CCC_LAN", "", ""),
        ("WATER_PLUMBING", DEFAULT_ADMIN_PASS, "Water Cooler & Plumbing (Central)", "Staff", "Central Department Portal", "SVNIT", "All", "-", "Estate Civil & Water Wing", "0261-2201570", "plumbing@svnit.ac.in", "WATER_PLUMBING", "", ""),
        ("CARPENTRY", DEFAULT_ADMIN_PASS, "Carpentry & Furniture (Central)", "Staff", "Central Department Portal", "SVNIT", "All", "-", "Estate Maintenance Wing", "0261-2201575", "carpentry@svnit.ac.in", "CARPENTRY", "", "")
    ]
    for u in default_users:
        upsert_user(conn, u)
    for user_id, role, environment_key in (
        ("FOUNDER", "Founder", "FOUNDER_INITIAL_PASSWORD"),
        ("DEAN", "Dean", "DEAN_INITIAL_PASSWORD"),
    ):
        initial_password = os.getenv(environment_key, "")
        account = db_exec(
            conn,
            "SELECT password FROM users WHERE college_id = ? AND UPPER(user_id) = ? AND role = ?",
            ("SVNIT", user_id, role),
        ).fetchone()
        if initial_password:
            if not PASSWORD_MIN_LENGTH <= len(initial_password) <= 128:
                raise RuntimeError(f"{environment_key} must contain 12 to 128 characters.")
            if account and not account["password"]:
                db_exec(
                    conn,
                    "UPDATE users SET password = ? "
                    "WHERE college_id = ? AND UPPER(user_id) = ? AND role = ? "
                    "AND (password IS NULL OR password = '')",
                    (hash_password(initial_password), "SVNIT", user_id, role),
                )
                invalidate_user_cache(user_id)
            account = db_exec(
                conn,
                "SELECT password FROM users WHERE college_id = ? AND UPPER(user_id) = ? AND role = ?",
                ("SVNIT", user_id, role),
            ).fetchone()
        if (
            os.getenv("DATABASE_URL", "").strip()
            and (not account or not str(account["password"] or "").startswith(PASSWORD_HASH_PREFIX))
        ):
            logger.warning(
                "%s is not configured; %s account password login is unavailable until it is set.",
                environment_key,
                role,
            )
    warden_hostels = db_exec(
        conn,
        "SELECT DISTINCT hostel_block FROM users WHERE college_id = ? AND role = 'Warden' "
        "AND hostel_block IS NOT NULL AND hostel_block NOT IN ('', 'All')",
        (ACTIVE_COLLEGE_ID.get(),),
    ).fetchall()
    for row in warden_hostels:
        hostel_name = row["hostel_block"]
        db_exec(
            conn,
            """
            INSERT INTO hostels (hostel_id, name, wings_json, enabled)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (college_id, hostel_id) DO NOTHING
            """,
            (
                re.sub(r"[^A-Z0-9]+", "_", hostel_name.strip().upper()).strip("_"),
                hostel_name,
                json.dumps([f"Wing {letter}" for letter in "ABCDEFGH"]),
                1,
            ),
        )
    if ACTIVE_COLLEGE_ID.get().casefold() == "svnit":
        for hostel_name in (
            "Gajjar Bhawan",
            "Bhabha Bhawan",
            "Swami Vivekananda Bhawan",
            "Mother Teresa Bhawan",
            "Nehru Bhawan",
            "Tagore Bhawan",
            "Raman Bhawan",
            "Sarabhai Bhawan",
        ):
            db_exec(
                conn,
                """
                INSERT INTO hostels (hostel_id, name, wings_json, enabled)
                VALUES (?, ?, ?, 1)
                ON CONFLICT (college_id, hostel_id) DO NOTHING
                """,
                (
                    re.sub(r"[^A-Z0-9]+", "_", hostel_name.strip().upper()).strip("_"),
                    hostel_name,
                    json.dumps([f"Wing {letter}" for letter in "ABCDEFGH"]),
                ),
            )
        db_exec(
            conn,
            """
            UPDATE users
            SET hostel_block = 'Gajjar Bhawan', wing = 'Wing D',
                authority_title = 'Verified Resident'
            WHERE college_id = 'SVNIT' AND UPPER(user_id) = 'U26CE011'
              AND LOWER(COALESCE(hostel_block, '')) = 'day scholar'
              AND UPPER(COALESCE(room, '')) = 'D-315'
            """,
        )

    official_svnit_clubs = [
        ("ACM", "ACM Student Chapter SVNIT", "Official Association for Computing Machinery chapter at SVNIT fostering competitive programming, open-source development, AI/ML research, and flagship hackathons like HackDotSlash.", "Dr. Dipti P. Rana & Dr. Mukesh A. Zaveri (DoCSE)", "Student Chairperson — ACM SVNIT", "Annual flagship events: DotSlash Hackathon, CodeSprint, Epiphany & CS Winter of Code."),
        ("DRISHTI", "DRISHTI — Revolutionary Innovation & Robotics Club", "SVNIT's premier technical hobby and robotics innovation lab building autonomous rovers, drones, IoT systems, and competing in national competitions including Robocon.", "Dr. A. D. Darji (DoECE) & Dr. R. N. Patel (DoME)", "Head Coordinator — Team DRISHTI", "Operates out of the DRISHTI Innovation Lab; conducts fresher technical mentorship & workshops."),
        ("GDSC", "Google Developer Student Clubs (GDSC SVNIT)", "University developer community powered by Google Developers focusing on Web, Android, Flutter, Cloud Computing, Machine Learning, and Solution Challenge projects.", "Dr. Bhavesh N. Gohil (DoCSE)", "GDSC Lead — SVNIT Surat", "Conducts Google Cloud Study Jams, DevFest Campus Sessions, and Android Bootcamps."),
        ("CHRD", "CHRD — Center for Human Resource Development", "The official cultural society of SVNIT nurturing talent across Music, Dance (Nritya), Dramatics (Kirdaar), and Fine Arts (Aakriti), and spearheading cultural nights during Sparsh.", "Dr. S. R. Patel & SAC Cultural Committee", "General Secretary (Cultural) / CHRD Convener", "Wings: Raag (Music), Nritya (Dance), Kirdaar (Drama), and Aakriti (Fine Arts)."),
        ("LAC", "LAC — Literary & Debating Club", "Official literary, parliamentary debating, quizzing, creative writing, and public speaking society of SVNIT Surat.", "Dr. Urvashi Kaushal (DoHSS)", "Convener — Literary & Debating Club", "Organises SVNIT Parliamentary Debate, Model United Nations (MUN), and LitFest."),
        ("SCOSH", "SCOSH — Society for Cultivation of Science & Humanities", "Dedicated to cultivating scientific temperament, astronomy observation, research symposia, and interdisciplinary science quizzing across campus.", "Dr. Vipul Kheraj (Department of Physics)", "Convener — SCOSH SVNIT", "Organises InQuest, Night Sky Stargazing Sessions, and National Science Day Conclave."),
        ("SAE", "SAE Collegiate Club — Motorsports & Automotive", "Society of Automotive Engineers chapter designing and fabricating All-Terrain Vehicles (Baja SAE), Formula-style race cars (Phoenix Racing), and Aero Design prototypes.", "Dr. R. D. Shah & Dr. J. V. Menghani (DoME)", "Captain — SAE SVNIT / Phoenix Racing", "Represents SVNIT at SAE BAJA, SUPRA SAEINDIA, and Efficycle competitions."),
        ("CES", "CES — Civil Engineering Society", "Departmental technical society of the Department of Civil Engineering organising Kaizen (Annual Civil Techfest), site visits, AutoCAD/STAAD workshops, and industry lectures.", "Dr. G. J. Joshi & Dr. Kashyap A. Patel (DoCE)", "Student President — CES SVNIT", "Flagship Conclave: Kaizen — Civil Engineering Annual Symposium."),
        ("EES", "EES — Electrical Engineering Society", "Official student chapter of the Department of Electrical Engineering conducting power systems workshops, EV seminars, PCB design bootcamps, and Urja tech events.", "Dr. Sabha Raj Arya & Dr. Basant Kumar (DoEE)", "President — Electrical Engineering Society", "Conducts technical workshops on MATLAB/Simulink, Embedded Systems, and Smart Grids."),
        ("ISF", "ISF — IETE Students' Forum (ECE)", "Institution of Electronics and Telecommunication Engineers student chapter at SVNIT focusing on VLSI, Embedded Systems, Signal Processing, and 5G/IoT innovation.", "Dr. P. N. Patel & Dr. J. N. Sarvaiya (DoECE)", "Chairperson — ISF SVNIT", "Hosts VLSI & Arduino hardware hackathons and electronics design contests."),
        ("CHES", "ChES — Chemical Engineering Society (AIChE)", "Official Chemical Engineering Society and AIChE student chapter promoting process simulation, green energy research, Chem-E-Car, and Siphon (Annual Chemical Techfest).", "Dr. V. N. Lad & Dr. Mausumi Mukhopadhyay (DoChE)", "President — ChES SVNIT", "Flagship Event: Siphon — Annual Chemical Engineering Festival."),
        ("CEV", "CEV — Cutting Edge Visionaries", "Techno-managerial, finance, entrepreneurship, stock market literacy, and startup incubation society of SVNIT Surat.", "Dr. R. K. Jana (DoMS / Applied Math)", "Chief Coordinator — Cutting Edge Visionaries", "Conducts Case Study Competitions, FinStreet Sessions, and Startup Pitching."),
        ("RENESA", "Renesa — Official Campus Media & Magazine", "The official student media body, journalism society, and monthly newsletter/magazine publication house of SVNIT Surat.", "Dr. Urvashi Kaushal (Chief Editor / Faculty Advisor)", "Editor-in-Chief — Renesa SVNIT", "Publishes official campus editions, interviews, and event coverage."),
        ("MALANG", "Malang — Dramatics & Street Play Society", "Official theatre, Nukkad Natak (street play), and stage acting troupe of SVNIT performing social-awareness plays across national collegiate festivals.", "SAC Cultural Faculty Coordinator", "Head Coordinator — Malang SVNIT", "Performs Nukkad Natak, Stage Plays, and Mime at Sparsh and IIT/NIT fests."),
        ("NSS", "NSS & Nirvaan — National Service Scheme SVNIT", "Official community service, blood donation, campus cleanliness, tree plantation, and rural outreach unit of SVNIT Surat.", "Dr. R. N. Patel (NSS Programme Coordinator)", "Student Head — NSS SVNIT Unit", "Organises Blood Donation Camps, Cloth Drives, and Village Education Drives.")
    ]

    for cid, cname, cmission, cadvisor, chead, cextra in official_svnit_clubs:
        upsert_club(conn, (cid, cname, cmission, cadvisor, chead, cextra, "", "", json.dumps([]), json.dumps([])))
        upsert_user(
            conn,
            (cid, DEFAULT_ADMIN_PASS, cname, "ClubOrganizer", f"Official Club Portal ({cid})", "SVNIT", "All", "-", "SAC Office", "0261-2201500", f"{cid.lower()}@svnit.ac.in", "Student Activity Centre (SAC)", "", "")
        )

    default_depts = [
        ("ELECTRICITY", "Electrical Maintenance (Central)", "Central", "All", "⚡"),
        ("CCC_LAN", "CCC / Internet / LAN (Central)", "Central", "All", "🌐"),
        ("WATER_PLUMBING", "Water Cooler & Plumbing (Central)", "Central", "All", "🚰"),
        ("CARPENTRY", "Carpentry & Furniture (Central)", "Central", "All", "🪚")
    ]
    for d in default_depts:
        if USE_POSTGRES:
            db_exec(
                conn,
                "INSERT INTO departments (id, title, type, hostel_block, icon) VALUES (?,?,?,?,?) ON CONFLICT (college_id, id) DO NOTHING",
                d,
            )
        else:
            db_exec(
                conn,
                "INSERT INTO departments (id, title, type, hostel_block, icon) VALUES (?,?,?,?,?) ON CONFLICT (id) DO NOTHING",
                d,
            )

    conn.commit()
    conn.close()


init_db()


def get_tenant_by_id(college_id: str):
    normalized_id = college_id.strip().upper()
    now = time.time()
    with _TENANT_CACHE_LOCK:
        cached = _TENANT_CACHE.get(normalized_id)
        if cached and cached[0] > now:
            return cached[1]

    conn = get_conn()
    try:
        row = db_exec(
            conn,
            "SELECT * FROM tenants WHERE UPPER(college_id) = ? AND enabled = 1",
            (normalized_id,),
        ).fetchone()
        tenant = dict(row) if row else None
        if tenant:
            tenant["modules"] = json.loads(tenant.get("modules_json") or "{}")
            with _TENANT_CACHE_LOCK:
                _TENANT_CACHE[normalized_id] = (now + 30.0, tenant)
        return tenant
    finally:
        conn.close()


def email_domain_matches_tenant(domain: str, allowed_domain: str) -> bool:
    normalized_domain = domain.strip().lower().rstrip(".")
    normalized_allowed = allowed_domain.strip().lower().lstrip("@").rstrip(".")
    return bool(
        normalized_domain
        and normalized_allowed
        and (
            normalized_domain == normalized_allowed
            or normalized_domain.endswith(f".{normalized_allowed}")
        )
    )


def normalized_college_email(email: Optional[str], default_local_part: str) -> str:
    tenant = get_tenant_by_id(ACTIVE_COLLEGE_ID.get())
    if not tenant:
        raise HTTPException(status_code=404, detail="This college is not enabled.")
    normalized = (email or f"{default_local_part}@{tenant['allowed_email_domain']}").strip().lower()
    local_part, separator, domain = normalized.partition("@")
    if (
        not separator
        or not re.fullmatch(r"[a-z0-9._%+-]+", local_part)
        or not email_domain_matches_tenant(domain, tenant["allowed_email_domain"])
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Use an email address from @{tenant['allowed_email_domain']} or one of its subdomains.",
        )
    return normalized


def resolve_tenant_id(request: Request) -> str:
    origin = request.headers.get("origin", "").strip()
    origin_host = (urlparse(origin).hostname or "").lower() if origin else ""
    request_host = (request.url.hostname or "").lower()
    candidate_host = origin_host or request_host
    if candidate_host in {"localhost", "127.0.0.1", "::1"}:
        return "SVNIT"

    conn = get_conn()
    try:
        row = db_exec(
            conn,
            "SELECT college_id FROM tenants WHERE LOWER(primary_domain) = LOWER(?) AND enabled = 1",
            (candidate_host,),
        ).fetchone()
        if row:
            return str(row["college_id"]).upper()
        if candidate_host in {"api.svnitcampus.in", "hms-enterprise-mqvx.onrender.com"}:
            return "SVNIT"
    finally:
        conn.close()
    raise HTTPException(status_code=404, detail="This college domain is not configured.")


class GoogleLoginReq(BaseModel):
    credential: str

class PasswordLoginReq(BaseModel):
    username: str
    password: str

class StaffPasswordSetReq(BaseModel):
    user_id: str
    password: str

class StudentProfileReq(BaseModel):
    hostel_block: str
    wing: Optional[str] = ""
    room: Optional[str] = ""
    phone: str

class CreateDepartmentReq(BaseModel):
    dept_id: Optional[str] = None
    name: Optional[str] = None
    title: Optional[str] = None
    dept_type: str = "Central"
    hostel_block: Optional[str] = "All"
    icon: Optional[str] = "🛠️"
    email: Optional[str] = None

class ClubCreateReq(BaseModel):
    club_id: str
    name: str
    email: Optional[str] = None
    mission: Optional[str] = ""
    faculty_advisor: Optional[str] = ""
    head_coordinator: Optional[str] = ""

class WardenCreateReq(BaseModel):
    user_id: str
    hostel_block: str
    email: Optional[str] = None
    phone: Optional[str] = "0261-2201600"

class StudentManualAddReq(BaseModel):
    user_id: str
    full_name: str
    hostel_block: str
    wing: Optional[str] = "Wing A"
    room: str
    department: str
    year: Optional[str] = "1st Year"
    dob: Optional[str] = ""
    phone: Optional[str] = ""
    guardian_phone: Optional[str] = ""
    email: Optional[str] = ""

class WardenStudentUpdateReq(BaseModel):
    user_id: str
    hostel_block: str
    wing: Optional[str] = ""
    room: Optional[str] = ""
    full_name: Optional[str] = None
    department: Optional[str] = None
    year: Optional[str] = None
    phone: Optional[str] = ""
    guardian_phone: Optional[str] = ""

class ComplaintCreateReq(BaseModel):
    student_id: str
    category: str
    summary: str
    description: str

class StaffResolveReq(BaseModel):
    ticket_id: str
    staff_remark: str

class StudentVerifyReq(BaseModel):
    ticket_id: str
    satisfied: bool

class ClubUpdateInfoReq(BaseModel):
    club_id: str
    mission: str
    extra_dean_info: str
    faculty_advisor: Optional[str] = None
    head_coordinator: Optional[str] = None
    banner_url: Optional[str] = None
    logo_url: Optional[str] = None

class ClubMemberAddReq(BaseModel):
    club_id: str
    name: str
    roll: str
    position: str
    phone: Optional[str] = ""
    year: Optional[str] = ""
    department: Optional[str] = ""

class ClubMemberRemoveReq(BaseModel):
    club_id: str
    index: int

class ClubGalleryAddReq(BaseModel):
    club_id: str
    media_type: str
    media_url: str
    caption: str

class EventRequisitionReq(BaseModel):
    club_id: str
    title: str
    date: str
    start_time: str
    end_time: str
    venue: str
    submitted_by: str
    description: Optional[str] = ""
    budget: Optional[str] = ""
    funding_source: Optional[str] = ""
    chief_guest: Optional[str] = ""
    expected_attendance: Optional[str] = ""
    logistics_needs: Optional[str] = ""
    image_url: Optional[str] = ""
    registration_link: Optional[str] = ""
    custom_fields: Optional[List[Dict[str, str]]] = []

class EventRsvpReq(BaseModel):
    event_id: str
    student_id: str

class EventFeedbackReq(BaseModel):
    event_id: str
    rating: int
    review: str

class EventPhotoAlbumReq(BaseModel):
    event_id: str
    album_url: str
    caption: str

class StudentProfileChangeReq(BaseModel):
    hostel_block: Optional[str] = None
    room: Optional[str] = None
    wing: Optional[str] = None
    phone: Optional[str] = None

class ProfileRequestReviewReq(BaseModel):
    request_id: str
    decision: str
    remark: Optional[str] = ""

class NoticeCreateReq(BaseModel):
    club_id: str
    title: str
    message: str
    target_branch: str = "All Branches"
    target_year: str = "All Years"
    image_url: Optional[str] = ""
    registration_link: Optional[str] = ""
    custom_fields: Optional[List[Dict[str, str]]] = []

class AdCreateReq(BaseModel):
    sponsor_tag: str
    title: str
    subtitle: str
    badge_text: Optional[str] = ""
    cta_text: Optional[str] = "Apply Now →"
    target_url: str
    image_url: Optional[str] = ""
    bg_gradient: Optional[str] = "linear-gradient(135deg, #002970 0%, #0284C7 100%)"
    days_valid: int = 15

class TenantCreateReq(BaseModel):
    college_id: str
    college_name: str
    primary_domain: str
    allowed_email_domain: str
    timezone: str = "Asia/Kolkata"
    initial_dean_id: str
    initial_dean_name: str
    initial_dean_email: str
    initial_dean_password: str
    logo_url: Optional[str] = ""
    modules: Optional[Dict[str, bool]] = None

class TenantModulesReq(BaseModel):
    modules: Dict[str, bool]

class HostelConfigReq(BaseModel):
    name: str
    wings: Optional[List[str]] = None

class AttendanceConfigReq(BaseModel):
    start_time: str
    end_time: str
    wing_beacons: Optional[Dict[str, str]] = None
    test_mode: Optional[bool] = None

class GateSecurityCreateReq(BaseModel):
    user_id: str
    full_name: str
    email: str
    phone: Optional[str] = ""

class OutpassCreateReq(BaseModel):
    pass_type: str
    destination: str
    purpose: str
    departure_at: str
    return_at: str

class OutpassReviewReq(BaseModel):
    pass_id: str
    decision: str
    departure_at: Optional[str] = None
    return_at: Optional[str] = None
    remark: Optional[str] = ""

class GateScanReq(BaseModel):
    code: str
    direction: str

class AttendanceExceptionReq(BaseModel):
    session_id: str
    student_id: str
    reason: str
    status: str = "Present"

class WebAuthnChallengeReq(BaseModel):
    challenge_id: str
    credential: Dict
    qr_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_m: Optional[float] = None

class AttendanceOptionsReq(BaseModel):
    session_id: str
    qr_code: str
    latitude: float
    longitude: float
    accuracy_m: float

class AttendanceStartReq(BaseModel):
    hostel_block: Optional[str] = None

class BiometricUnlockReq(BaseModel):
    student_id: str

class BiometricEnrollReq(BaseModel):
    challenge_id: str
    credential: Dict
    device_hardware_id: str
    biometric_cred_id: Optional[str] = None

class AttendanceBeaconOptionsReq(BaseModel):
    biometric_cred_id: str
    device_hardware_id: str
    wing_beacon_id: str
    rssi: int
    simulated: bool = False

class AttendanceBeaconMarkReq(AttendanceBeaconOptionsReq):
    challenge_id: str
    credential: Dict

class DeviceBindingRegisterReq(BaseModel):
    model_config = {"extra": "forbid"}

    device_binding_token: str
    reference_image_base64: str = Field(min_length=100, max_length=6_000_000)
    consent_confirmed: bool
    device_public_key: str = Field(min_length=80, max_length=4096)

class DeviceBeaconMarkReq(BaseModel):
    model_config = {"extra": "forbid"}

    device_binding_token: str
    wing_beacon_id: str
    rssi: int
    raw_rotating_payload_hex: str = Field(default="", max_length=512)
    rssi_samples: List[int] = Field(default_factory=list, min_length=3, max_length=20)
    simulated: bool = False
    embedding: List[float] = Field(min_length=128, max_length=128)
    challenge_nonce: str = Field(min_length=20, max_length=128)
    blink_ear_curve: List[float] = Field(min_length=3, max_length=120)
    yaw_delta: float
    head_gesture: str
    rgb_reflection_delta: float
    rgb_reflection_samples: List[List[float]] = Field(min_length=2, max_length=2)
    signed_timestamp: int
    signature: str = Field(min_length=80, max_length=1024)

class LeaveApplyReq(BaseModel):
    leave_type: str
    from_date: str
    to_date: str
    destination: str
    reason: str
    parent_phone: str = ""
    expected_return_time: Optional[str] = None

class LeaveActionReq(BaseModel):
    pass_id: str
    status: str
    warden_remark: str = ""

class LeaveReturnOptionsReq(BaseModel):
    pass_id: str
    biometric_cred_id: str
    device_hardware_id: str
    wing_beacon_id: str
    rssi: int
    simulated: bool = False

class LeaveReturnMarkReq(LeaveReturnOptionsReq):
    challenge_id: str
    credential: Dict

class DeviceLeaveReturnReq(BaseModel):
    model_config = {"extra": "forbid"}

    pass_id: str
    device_binding_token: str
    wing_beacon_id: str
    rssi: int
    simulated: bool = False
    live_image_base64: str = Field(min_length=100, max_length=6_000_000)


def verify_google_credential(credential: str) -> dict:
    now = time.time()
    with _GOOGLE_TOKEN_CACHE_LOCK:
        cached = _GOOGLE_TOKEN_CACHE.get(credential)
        if cached and cached[0] > now:
            return cached[1]
    try:
        claims = id_token.verify_oauth2_token(
            credential, GoogleAuthRequest(), GOOGLE_CLIENT_ID
        )
    except google.auth.exceptions.TransportError as exc:
        raise HTTPException(status_code=503, detail="Google sign-in verification is temporarily unavailable. Please try again.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Google sign-in token is invalid or expired. Please choose your college account again.") from exc
    with _GOOGLE_TOKEN_CACHE_LOCK:
        if len(_GOOGLE_TOKEN_CACHE) > 500:
            expired = [token for token, (expiry, _) in _GOOGLE_TOKEN_CACHE.items() if expiry <= now]
            for token in expired:
                _GOOGLE_TOKEN_CACHE.pop(token, None)
        _GOOGLE_TOKEN_CACHE[credential] = (float(claims.get("exp", 0)), claims)
        return claims


def is_tenant_email(email: str) -> bool:
    if email.count("@") != 1:
        return False
    local_part, domain = email.rsplit("@", 1)
    if not local_part or any(character.isspace() for character in local_part):
        return False
    tenant = get_tenant_by_id(ACTIVE_COLLEGE_ID.get())
    return bool(tenant and email_domain_matches_tenant(domain, tenant["allowed_email_domain"]))


def get_account_by_email(email: str):
    conn = get_conn()
    row = db_exec(
        conn,
        "SELECT * FROM users WHERE college_id = ? AND LOWER(email) = LOWER(?)",
        (ACTIVE_COLLEGE_ID.get(), email),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_account_by_id(user_id: str):
    uid = user_id.strip().upper()
    cache_key = (ACTIVE_COLLEGE_ID.get(), uid)
    now = time.time()
    with _USER_AUTH_CACHE_LOCK:
        cached = _USER_AUTH_CACHE.get(cache_key)
        if cached and cached[0] > now:
            return cached[1]

    conn = get_conn()
    row = db_exec(
        conn,
        "SELECT * FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
        (ACTIVE_COLLEGE_ID.get(), uid),
    ).fetchone()
    conn.close()
    if row:
        account_dict = dict(row)
        with _USER_AUTH_CACHE_LOCK:
            _USER_AUTH_CACHE[cache_key] = (now + USER_CACHE_TTL, account_dict)
        return account_dict
    return None


def get_account_for_google_claims(claims: dict):
    email = str(claims.get("email", "")).strip().lower()
    if claims.get("email_verified") is not True:
        raise HTTPException(status_code=403, detail="Use a verified college Google account.")
    if not is_tenant_email(email):
        raise HTTPException(status_code=403, detail="This Google account domain is not approved for this college.")

    existing_email = get_account_by_email(email)
    if existing_email:
        return existing_email

    local_part = email.split("@", 1)[0].upper()
    if not re.fullmatch(r"[A-Z0-9._+-]{1,64}", local_part):
        raise HTTPException(status_code=403, detail="The Google account has an unsupported email identifier.")
    existing_id = get_account_by_id(local_part)
    if existing_id:
        previous_email = str(existing_id.get("email") or "").strip().lower()
        if existing_id.get("role") != "Student" or (
            previous_email and not is_tenant_email(previous_email)
        ):
            raise HTTPException(status_code=403, detail="This account ID is already assigned. Contact your college administrator.")
        conn = get_conn()
        try:
            db_exec(
                conn,
                "UPDATE users SET email = ? WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'",
                (email, ACTIVE_COLLEGE_ID.get(), local_part),
            )
            conn.commit()
        finally:
            conn.close()
        invalidate_user_cache(local_part)
        updated_account = get_account_by_id(local_part)
        if updated_account:
            return updated_account
        raise HTTPException(status_code=500, detail="Could not link this verified college email to the student account.")

    conn = get_conn()
    try:
        full_name = str(claims.get("name") or local_part).strip()
        db_exec(
            conn,
            "INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob, wing, college_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (local_part, "", full_name, "Student", "Verified Student", ACTIVE_COLLEGE_ID.get(), "", "", "", "", email, "", "", "", ACTIVE_COLLEGE_ID.get()),
        )
        account = db_exec(conn, "SELECT * FROM users WHERE college_id = ? AND UPPER(user_id) = ?", (ACTIVE_COLLEGE_ID.get(), local_part)).fetchone()
        conn.commit()
    finally:
        conn.close()
    invalidate_user_cache(local_part)
    return dict(account)


def account_from_bearer(request: Request):
    authorization = request.headers.get("authorization", "")
    scheme, _, credential = authorization.partition(" ")
    if scheme.lower() != "bearer" or not credential:
        raise HTTPException(status_code=401, detail="Please sign in to continue.")

    token_claims = verify_session_token(credential)
    if token_claims:
        token_user_id, token_college_id, token_password_fingerprint = token_claims
        if token_college_id != ACTIVE_COLLEGE_ID.get().upper():
            raise HTTPException(status_code=403, detail="This session belongs to a different college.")
        account = get_account_by_id(token_user_id)
        if account:
            if token_password_fingerprint is None and account.get("role") in STAFF_LOGIN_ROLES:
                raise HTTPException(status_code=401, detail="Staff password changed. Please sign in again.")
            if token_password_fingerprint is not None:
                expected_fingerprint = hmac.new(
                    AUTH_SECRET.encode(),
                    (account.get("password") or "").encode(),
                    hashlib.sha256,
                ).hexdigest()
                if not hmac.compare_digest(token_password_fingerprint, expected_fingerprint):
                    raise HTTPException(status_code=401, detail="Staff password changed. Please sign in again.")
            return account

    claims = verify_google_credential(credential)
    email = str(claims.get("email", "")).strip().lower()
    if claims.get("email_verified") is not True or not is_tenant_email(email):
        raise HTTPException(status_code=403, detail="Only verified accounts from this college are allowed.")
    account = get_account_by_email(email)
    if not account:
        account = get_account_for_google_claims(claims)
    if account.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Staff accounts must use username and password.")
    return account


def _is_event_completed(event: Dict) -> bool:
    status = str(event["status"]).strip().lower()
    if status == "completed":
        return True
    if status != "approved":
        return False

    try:
        scheduled_end = datetime.fromisoformat(
            f"{event['date']}T{event['end_time']}"
        ).replace(tzinfo=timezone(timedelta(hours=5, minutes=30)))
    except (KeyError, TypeError, ValueError):
        return False
    return scheduled_end <= datetime.now(timezone(timedelta(hours=5, minutes=30)))


def _event_feedback_without_identity(feedbacks: List[Dict]) -> List[Dict]:
    return [
        {"rating": item.get("rating"), "review": item.get("review", "")}
        for item in feedbacks
        if isinstance(item, dict)
    ]


@app.middleware("http")
async def require_authentication(request: Request, call_next):
    open_paths = {
        "/api/auth/google",
        "/api/auth/login",
        "/api/hostels",
        "/api/hostels/config",
        "/api/tenant",
    }
    if not request.url.path.startswith("/api/") or request.method == "OPTIONS":
        return await call_next(request)
    tenant_token = ACTIVE_COLLEGE_ID.set("SVNIT")
    try:
        college_id = resolve_tenant_id(request)
        tenant = get_tenant_by_id(college_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="This college is not enabled.")
        ACTIVE_COLLEGE_ID.set(college_id)
        request.state.college_id = college_id
        request.state.tenant = tenant
        if request.url.path in open_paths:
            return await call_next(request)

        account = account_from_bearer(request)
        if request.url.path.startswith("/api/founder/") and account["role"] != "Founder":
            raise HTTPException(status_code=403, detail="Founder access is required.")
        if request.url.path.startswith("/api/founder/tenants"):
            ACTIVE_COLLEGE_ID.set("*")

        module = None
        if request.url.path.startswith(("/api/complaints", "/api/departments")):
            module = "grievances"
        elif request.url.path.startswith(("/api/unicore/", "/api/notices")):
            module = "event_radar"
        elif request.url.path.startswith("/api/attendance") or request.url.path == "/api/warden/unlock-biometric":
            module = "attendance"
        elif request.url.path.startswith(("/api/outpasses", "/api/leave")):
            module = "gate_outpass"
        if module and not tenant["modules"].get(module, False):
            raise HTTPException(status_code=404, detail="This module is not enabled for your college.")
        if account.get("college_id") != college_id:
            raise HTTPException(status_code=403, detail="This account does not belong to this college.")

        request.state.user = account
        return await call_next(request)
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    finally:
        ACTIVE_COLLEGE_ID.reset(tenant_token)


@app.get("/")
def root():
    return {
        "status": "online",
        "app": "svnitcampus",
        "database_mode": "Cloud PostgreSQL (Pooled)" if USE_POSTGRES else "Local SQLite (WAL)"
    }


@app.get("/api/founder/tenants")
def list_tenants(request: Request):
    if request.state.user.get("role") != "Founder":
        raise HTTPException(status_code=403, detail="Founder access is required.")
    conn = get_conn()
    try:
        rows = db_exec(conn, "SELECT * FROM tenants ORDER BY college_name").fetchall()
        return [
            {
                **dict(row),
                "modules": json.loads(row["modules_json"] or "{}"),
            }
            for row in rows
        ]
    finally:
        conn.close()


@app.post("/api/founder/tenants")
def create_tenant(req: TenantCreateReq, request: Request):
    if request.state.user.get("role") != "Founder":
        raise HTTPException(status_code=403, detail="Founder access is required.")
    if not USE_POSTGRES:
        raise HTTPException(
            status_code=503,
            detail="Tenant provisioning requires the shared PostgreSQL database with row-level security.",
        )

    college_id = req.college_id.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{1,39}", college_id):
        raise HTTPException(status_code=400, detail="Use a 2–40 character college ID with letters, numbers, - or _.")
    college_name = req.college_name.strip()
    if not college_name or len(college_name) > 160:
        raise HTTPException(status_code=400, detail="Enter a college name up to 160 characters.")
    college_timezone = req.timezone.strip()
    try:
        ZoneInfo(college_timezone)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise HTTPException(status_code=400, detail="Enter a valid IANA time zone.") from error

    supplied_domain = req.primary_domain.strip().lower()
    parsed_domain = urlparse(supplied_domain if "://" in supplied_domain else f"//{supplied_domain}")
    domain = (parsed_domain.hostname or "").rstrip(".")
    try:
        supplied_port = parsed_domain.port
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Enter the approved custom domain without a path or port.") from error
    if (
        not domain
        or parsed_domain.path not in {"", "/"}
        or supplied_port is not None
        or parsed_domain.username is not None
        or parsed_domain.password is not None
        or parsed_domain.query
        or parsed_domain.fragment
        or (parsed_domain.scheme and parsed_domain.scheme != "https")
        or domain in {"localhost", "svnitcampus.in", "api.svnitcampus.in"}
        or not re.fullmatch(r"(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", domain)
    ):
        raise HTTPException(status_code=400, detail="Enter the approved custom domain without a path or port.")

    allowed_domain = req.allowed_email_domain.strip().lower().lstrip("@").rstrip(".")
    if not re.fullmatch(r"(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", allowed_domain):
        raise HTTPException(status_code=400, detail="Enter a valid approved email domain.")
    dean_id = req.initial_dean_id.strip().upper()
    dean_name = req.initial_dean_name.strip()
    dean_email = req.initial_dean_email.strip().lower()
    dean_password_hash = hash_password(req.initial_dean_password)
    dean_local_part, separator, dean_email_domain = dean_email.partition("@")
    if (
        not re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{1,39}", dean_id)
        or not dean_name
        or len(dean_name) > 160
        or not separator
        or not re.fullmatch(r"[a-z0-9._%+-]+", dean_local_part)
        or not email_domain_matches_tenant(dean_email_domain, allowed_domain)
    ):
        raise HTTPException(status_code=400, detail="Provide an initial Dean account using the approved college email domain.")
    if req.logo_url:
        logo_url = urlparse(req.logo_url.strip())
        if logo_url.scheme != "https" or not logo_url.netloc:
            raise HTTPException(status_code=400, detail="College logo URL must use HTTPS.")

    modules = {
        "grievances": True,
        "mess_pulse": True,
        "event_radar": True,
        "gate_outpass": False,
        "attendance": False,
        "parent_alerts": False,
    }
    if req.modules is not None:
        unknown = set(req.modules) - set(modules)
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown module: {sorted(unknown)[0]}.")
        modules.update(req.modules)

    conn = get_conn()
    try:
        db_exec(
            conn,
            """
            INSERT INTO tenants
                (college_id, college_name, primary_domain, allowed_email_domain, timezone, logo_url, modules_json, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                college_id,
                college_name,
                domain,
                allowed_domain,
                college_timezone,
                (req.logo_url or "").strip(),
                json.dumps(modules),
                1,
                datetime.now().isoformat(timespec="seconds"),
            ),
        )
        db_exec(conn, "SELECT set_config('app.college_id', ?, true)", (college_id,))
        upsert_user(
            conn,
            (
                dean_id,
                dean_password_hash,
                dean_name,
                "Dean",
                f"Dean Student Welfare ({college_name})",
                college_id,
                "All",
                "-",
                "Administration",
                "",
                dean_email,
                "Student Welfare",
                "",
                "",
            ),
        )
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception as error:
        conn.rollback()
        if psycopg2 is not None and isinstance(error, psycopg2.IntegrityError):
            raise HTTPException(
                status_code=409,
                detail="That college ID or custom domain is already configured.",
            ) from error
        logger.exception("Could not provision college tenant %s", college_id)
        raise
    finally:
        conn.close()
    with _TENANT_CACHE_LOCK:
        _TENANT_CACHE.pop(college_id, None)
    return {
        "success": True,
        "college_id": college_id,
        "domain": domain,
        "initial_dean_id": dean_id,
        "modules": modules,
    }


@app.put("/api/founder/tenants/{college_id}/modules")
def update_tenant_modules(college_id: str, req: TenantModulesReq, request: Request):
    if request.state.user.get("role") != "Founder":
        raise HTTPException(status_code=403, detail="Founder access is required.")
    allowed_modules = {
        "grievances",
        "mess_pulse",
        "event_radar",
        "gate_outpass",
        "attendance",
        "parent_alerts",
    }
    if set(req.modules) != allowed_modules or not all(isinstance(value, bool) for value in req.modules.values()):
        raise HTTPException(status_code=400, detail="Provide a boolean value for every supported module.")
    conn = get_conn()
    try:
        cursor = db_exec(
            conn,
            "UPDATE tenants SET modules_json = ? WHERE UPPER(college_id) = ?",
            (json.dumps(req.modules), college_id.strip().upper()),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="College not found.")
        conn.commit()
    finally:
        conn.close()
    with _TENANT_CACHE_LOCK:
        _TENANT_CACHE.pop(college_id.strip().upper(), None)
    return {"success": True, "modules": req.modules}


@app.get("/api/dean/hostels")
def list_hostel_configuration(request: Request):
    if request.state.user.get("role") != "Dean":
        raise HTTPException(status_code=403, detail="Dean access is required.")
    conn = get_conn()
    try:
        rows = db_exec(
            conn,
            """
            SELECT hostels.hostel_id, hostels.name, hostels.wings_json, hostels.enabled,
                   users.user_id AS warden_id, users.email AS warden_email, users.phone AS warden_phone
            FROM hostels
            LEFT JOIN users ON users.role = 'Warden'
                AND LOWER(users.hostel_block) = LOWER(hostels.name)
            ORDER BY hostels.name
            """,
        ).fetchall()
        return [
            {
                **dict(row),
                "wings": json.loads(row["wings_json"] or "[]"),
            }
            for row in rows
        ]
    finally:
        conn.close()


@app.post("/api/dean/hostels")
def save_hostel_configuration(req: HostelConfigReq, request: Request):
    if request.state.user.get("role") != "Dean":
        raise HTTPException(status_code=403, detail="Dean access is required.")
    name = req.name.strip()
    if not name or len(name) > 100 or name.casefold() == "day scholar":
        raise HTTPException(status_code=400, detail="Enter a valid hostel name.")
    wings = req.wings or [f"Wing {letter}" for letter in "ABCDEFGH"]
    wings = list(dict.fromkeys(wing.strip() for wing in wings if wing.strip()))
    if not wings or len(wings) > 30 or any(len(wing) > 40 for wing in wings):
        raise HTTPException(status_code=400, detail="A hostel must have 1–30 valid wings.")
    hostel_id = re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")
    conn = get_conn()
    try:
        db_exec(
            conn,
            """
            INSERT INTO hostels (hostel_id, name, wings_json, enabled)
            VALUES (?, ?, ?, 1)
            ON CONFLICT (college_id, hostel_id)
            DO UPDATE SET name = EXCLUDED.name, wings_json = EXCLUDED.wings_json, enabled = 1
            """,
            (hostel_id, name, json.dumps(wings)),
        )
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "hostel_id": hostel_id, "name": name, "wings": wings}


def list_warden_profile_requests(conn, hostel_block: str):
    rows = db_exec(
        conn,
        """
        SELECT profile_requests.*, users.full_name, users.room AS current_room,
               users.wing AS current_wing, users.phone AS current_phone
        FROM student_profile_requests AS profile_requests
        JOIN users ON users.college_id = profile_requests.college_id
                  AND UPPER(users.user_id) = UPPER(profile_requests.student_id)
        WHERE profile_requests.college_id = ?
          AND users.college_id = ?
          AND (
              LOWER(COALESCE(profile_requests.hostel_block, '')) = LOWER(?)
              OR LOWER(COALESCE(users.hostel_block, '')) = LOWER(?)
          )
          AND profile_requests.status = 'Pending'
        ORDER BY profile_requests.created_at ASC
        """,
        (ACTIVE_COLLEGE_ID.get(), ACTIVE_COLLEGE_ID.get(), hostel_block, hostel_block),
    ).fetchall()
    return [
        {**dict(row), "requested_changes": json.loads(row["requested_changes"] or "{}")}
        for row in rows
    ]


# =====================================================================
# UNIFIED SINGLE-ROUNDTRIP BOOTSTRAP ENDPOINT
# =====================================================================
@app.get("/api/portal/bootstrap")
def portal_bootstrap(request: Request, hostel_block: str = "All"):
    """
    Fetches all portal data in 1 pooled connection instead of 6 parallel HTTP calls.
    """
    account = request.state.user
    role = account["role"]
    uid = account["user_id"].upper()
    if role == "Warden":
        h_block = str(account.get("hostel_block") or "").strip()
        if not h_block or h_block.casefold() == "all":
            raise HTTPException(status_code=403, detail="Your Warden account is not assigned to a hostel.")
    else:
        h_block = account.get("hostel_block") or hostel_block or "All"

    conn = get_conn()
    try:
        # 1. Complaints
        base_query = """
            SELECT complaints.*,
                   COALESCE(NULLIF(complaints.wing, ''), users.wing, '') AS resolved_wing,
                   COALESCE(users.phone, '') AS student_phone
            FROM complaints
            LEFT JOIN users ON UPPER(users.user_id) = UPPER(complaints.student_id)
        """
        if role == "Student":
            c_rows = db_exec(conn, f"{base_query} WHERE UPPER(complaints.student_id) = ? ORDER BY complaints.created_at DESC", (uid,)).fetchall()
        elif role == "Warden":
            c_rows = db_exec(conn, f"{base_query} WHERE LOWER(complaints.hostel_block) = LOWER(?) ORDER BY complaints.created_at DESC", (h_block,)).fetchall()
        elif role == "Staff":
            dept_key = (account.get("department") or uid).strip().upper()
            dept_row = db_exec(conn, "SELECT * FROM departments WHERE UPPER(id) = ?", (dept_key,)).fetchone()
            if dept_row:
                c_rows = db_exec(conn, f"{base_query} WHERE UPPER(complaints.category) = ? OR LOWER(complaints.routed_to) = LOWER(?) ORDER BY complaints.created_at DESC", (dept_key, dept_row["title"])).fetchall()
            else:
                c_rows = db_exec(conn, f"{base_query} WHERE UPPER(complaints.category) = ? ORDER BY complaints.created_at DESC", (dept_key,)).fetchall()
        else:
            c_rows = db_exec(conn, f"{base_query} ORDER BY complaints.created_at DESC").fetchall()

        complaints = []
        for r in c_rows:
            item = dict(r)
            item["wing"] = item.pop("resolved_wing", item.get("wing") or "")
            item["phone"] = item.pop("student_phone", item.get("phone") or "")
            item["student_phone"] = item["phone"]
            complaints.append(item)

        # 2. Departments
        if h_block and h_block not in {"All", "Day Scholar"}:
            d_rows = db_exec(
                conn,
                "SELECT departments.*, users.email AS login_email FROM departments LEFT JOIN users ON UPPER(users.user_id) = UPPER(departments.id) WHERE departments.type = 'Central' OR LOWER(departments.hostel_block) = LOWER(?)",
                (h_block,)
            ).fetchall()
        else:
            d_rows = db_exec(
                conn,
                "SELECT departments.*, users.email AS login_email FROM departments LEFT JOIN users ON UPPER(users.user_id) = UPPER(departments.id)"
            ).fetchall()
        departments = [dict(r) for r in d_rows]

        # 3. Events
        e_rows = db_exec(conn, "SELECT * FROM events ORDER BY date DESC").fetchall()
        album_rows = db_exec(
            conn,
            "SELECT album_id, event_id, album_url, caption, created_at FROM event_photo_albums ORDER BY created_at DESC"
        ).fetchall()
        albums_by_event: Dict[str, List[Dict]] = {}
        for album_row in album_rows:
            album = dict(album_row)
            albums_by_event.setdefault(album["event_id"], []).append(album)

        events = []
        for r in e_rows:
            d = dict(r)
            d["custom_fields"] = json.loads(d["custom_fields"] or "[]")
            d["rsvps"] = json.loads(d["rsvps"] or "[]")
            raw_feedbacks = json.loads(d["feedbacks"] or "[]")
            d["feedback_submitted"] = (
                role == "Student"
                and any(
                    str(item.get("student_id", "")).upper() == uid
                    for item in raw_feedbacks
                    if isinstance(item, dict)
                )
            )
            d["is_completed"] = _is_event_completed(d)
            d["feedbacks"] = _event_feedback_without_identity(raw_feedbacks)
            d["ai_audit"] = json.loads(d["ai_audit"] or "{}") if d["ai_audit"] else None
            d["photo_albums"] = albums_by_event.get(d["event_id"], [])
            events.append(d)

        # 4. Clubs
        cl_rows = db_exec(conn, "SELECT * FROM clubs ORDER BY club_id ASC").fetchall()
        clubs = []
        for r in cl_rows:
            d = dict(r)
            d["members"] = json.loads(d["members"] or "[]")
            d["gallery"] = json.loads(d["gallery"] or "[]")
            clubs.append(d)

        # 5. Notices
        if role == "Student":
            n_rows = db_exec(conn, "SELECT * FROM notices WHERE status = 'Approved' ORDER BY created_at DESC").fetchall()
        elif role == "ClubOrganizer":
            n_rows = db_exec(conn, "SELECT * FROM notices WHERE UPPER(club_id) = ? ORDER BY created_at DESC", (uid,)).fetchall()
        else:
            n_rows = db_exec(conn, "SELECT * FROM notices ORDER BY created_at DESC").fetchall()
        notices = []
        for r in n_rows:
            d = dict(r)
            d["custom_fields"] = json.loads(d["custom_fields"] or "[]")
            notices.append(d)

        # 6. Active Ads
        ad_rows = db_exec(conn, "SELECT * FROM ads ORDER BY created_at DESC").fetchall()
        today = datetime.now().strftime("%Y-%m-%d")
        ads = [dict(r) for r in ad_rows if not r["expires_at"] or r["expires_at"] >= today]

        # 7. Hostel Students (for Warden / Dean / Founder)
        students = []
        if role in {"Warden", "Dean", "Founder"}:
            if role == "Warden" and h_block != "All":
                s_rows = db_exec(
                    conn,
                    "SELECT * FROM users WHERE college_id = ? AND role = 'Student' "
                    "AND LOWER(hostel_block) = LOWER(?) ORDER BY user_id ASC",
                    (ACTIVE_COLLEGE_ID.get(), h_block),
                ).fetchall()
            else:
                s_rows = db_exec(
                    conn,
                    "SELECT * FROM users WHERE college_id = ? AND role = 'Student' ORDER BY user_id ASC",
                    (ACTIVE_COLLEGE_ID.get(),),
                ).fetchall()
            students = [
                {
                    k: v
                    for k, v in dict(r).items()
                    if k not in {"password", "dob", "biometric_cred_id", "device_hardware_id", "device_token_hash"}
                }
                for r in s_rows
            ]

        hostel_rows = db_exec(
            conn,
            "SELECT hostel_id, name, wings_json, wing_beacons_json, attendance_test_mode FROM hostels WHERE college_id = ? AND enabled = 1 ORDER BY name",
            (ACTIVE_COLLEGE_ID.get(),),
        ).fetchall()
        hostels = [
            {
                "hostel_id": row["hostel_id"],
                "name": row["name"],
                "wings": json.loads(row["wings_json"] or "[]"),
                "wing_beacons": json.loads(row["wing_beacons_json"] or "{}"),
                "attendance_test_mode": bool(row["attendance_test_mode"]),
            }
            for row in hostel_rows
        ]
        tenant = request.state.tenant
        portal_user_row = db_exec(
            conn,
            """
            SELECT user_id, full_name, role, authority_title, institute_id, hostel_block,
                   year, room, phone, email, department, wing, guardian_phone,
                   guardian_whatsapp_consent, biometric_status, biometric_cred_id,
                   enroll_window_until
            FROM users
            WHERE college_id = ? AND UPPER(user_id) = ?
            """,
            (ACTIVE_COLLEGE_ID.get(), uid),
        ).fetchone()
        portal_user = dict(portal_user_row) if portal_user_row else {}

        profile_requests = (
            list_warden_profile_requests(conn, h_block)
            if role == "Warden"
            else []
        )

        leave_pass_rows = []
        if role == "Student":
            leave_pass_rows = db_exec(
                conn,
                "SELECT * FROM leave_passes WHERE college_id = ? AND UPPER(student_id) = ? ORDER BY created_at DESC LIMIT 100",
                (ACTIVE_COLLEGE_ID.get(), uid),
            ).fetchall()
        elif role == "Warden":
            leave_pass_rows = db_exec(
                conn,
                """
                SELECT * FROM leave_passes
                WHERE college_id = ? AND LOWER(hostel_block) = LOWER(?)
                  AND status IN ('Pending', 'Pending Warden Approval', 'Approved')
                ORDER BY created_at DESC
                """,
                (ACTIVE_COLLEGE_ID.get(), h_block),
            ).fetchall()
        elif role == "Dean":
            if h_block and h_block.casefold() != "all":
                leave_pass_rows = db_exec(
                    conn,
                    "SELECT * FROM leave_passes WHERE college_id = ? AND LOWER(hostel_block) = LOWER(?) ORDER BY created_at DESC LIMIT 500",
                    (ACTIVE_COLLEGE_ID.get(), h_block),
                ).fetchall()
            else:
                leave_pass_rows = db_exec(
                    conn,
                    "SELECT * FROM leave_passes WHERE college_id = ? ORDER BY created_at DESC LIMIT 500",
                    (ACTIVE_COLLEGE_ID.get(),),
                ).fetchall()
        leave_passes = []
        for row in leave_pass_rows:
            item = sanitized_pass(row, include_parent_phone=role in {"Warden", "Dean"})
            leave_passes.append(item)

        local_today = datetime.now(ZoneInfo(tenant["timezone"])).date().isoformat()
        if role == "Student":
            attendance_rows = db_exec(
                conn,
                """
                SELECT * FROM attendance_logs
                WHERE college_id = ? AND UPPER(student_id) = ?
                ORDER BY date DESC, time DESC LIMIT 30
                """,
                (ACTIVE_COLLEGE_ID.get(), uid),
            ).fetchall()
        elif role == "Warden":
            attendance_rows = db_exec(
                conn,
                """
                SELECT * FROM attendance_logs
                WHERE college_id = ? AND LOWER(hostel_block) = LOWER(?) AND date = ?
                ORDER BY time DESC
                """,
                (ACTIVE_COLLEGE_ID.get(), h_block, local_today),
            ).fetchall()
        elif role == "Dean":
            if h_block and h_block.casefold() != "all":
                attendance_rows = db_exec(
                    conn,
                    """
                    SELECT * FROM attendance_logs
                    WHERE college_id = ? AND LOWER(hostel_block) = LOWER(?) AND date = ?
                    ORDER BY time DESC
                    """,
                    (ACTIVE_COLLEGE_ID.get(), h_block, local_today),
                ).fetchall()
            else:
                attendance_rows = db_exec(
                    conn,
                    "SELECT * FROM attendance_logs WHERE college_id = ? AND date = ? ORDER BY time DESC",
                    (ACTIVE_COLLEGE_ID.get(), local_today),
                ).fetchall()
        else:
            attendance_rows = []
        attendance_logs = [dict(row) for row in attendance_rows]
        if not tenant["modules"].get("grievances", False):
            complaints = []
            departments = []
        if not tenant["modules"].get("event_radar", False):
            events = []
            clubs = []
            notices = []
        if not tenant["modules"].get("gate_outpass", False):
            leave_passes = []
        if not tenant["modules"].get("attendance", False):
            attendance_logs = []
        return {
            "complaints": complaints,
            "departments": departments,
            "events": events,
            "clubs": clubs,
            "notices": notices,
            "ads": ads,
            "students": students,
            "user": portal_user,
            "profile_requests": profile_requests,
            "leave_passes": leave_passes,
            "attendance_logs": attendance_logs,
            "tenant": {
                "college_id": tenant["college_id"],
                "college_name": tenant["college_name"],
                "logo_url": tenant["logo_url"],
                "modules": tenant["modules"],
            },
            "hostels": hostels,
        }
    finally:
        conn.close()


@app.post("/api/auth/login")
def password_login(req: PasswordLoginReq, request: Request):
    username = req.username.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{1,39}", username) or len(req.password) > 128:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    failure_key = password_login_key(request, username)
    retry_after = password_login_retry_after(failure_key)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Too many sign-in attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    account = get_account_by_id(username)
    if (
        not account
        or account.get("role") not in STAFF_LOGIN_ROLES
        or not verify_password(req.password, account.get("password") or "")
    ):
        record_password_login_failure(failure_key)
        retry_after = password_login_retry_after(failure_key)
        if retry_after:
            raise HTTPException(
                status_code=429,
                detail="Too many sign-in attempts. Try again later.",
                headers={"Retry-After": str(retry_after)},
            )
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    clear_password_login_failures(failure_key)
    user = dict(account)
    user.pop("password", None)
    user.pop("dob", None)
    token = create_session_token(
        user["user_id"], user.get("college_id"), account.get("password") or ""
    )
    return {"success": True, "user": user, "token": token}


@app.post("/api/auth/google")
def google_login(req: GoogleLoginReq):
    claims = verify_google_credential(req.credential)
    account = get_account_for_google_claims(claims)
    if account.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Staff accounts must use username and password.")
    user = dict(account)
    user.pop("password", None)
    user.pop("dob", None)
    token = create_session_token(
        user["user_id"], user.get("college_id"), account.get("password") or ""
    )
    return {"success": True, "user": user, "token": token}


@app.get("/api/staff/accounts")
def list_staff_accounts(request: Request):
    caller = request.state.user
    caller_role = caller.get("role")
    if caller_role not in {"Dean", "Founder", "Warden"}:
        raise HTTPException(status_code=403, detail="Staff account management access is required.")
    conn = get_conn()
    try:
        if caller_role == "Founder":
            query = "SELECT user_id, full_name, role, email, hostel_block, department, password, managed_by FROM users WHERE college_id = ? AND role = 'Dean'"
            params = (ACTIVE_COLLEGE_ID.get(),)
        elif caller_role == "Dean":
            query = """
                SELECT user_id, full_name, role, email, hostel_block, department, password, managed_by
                FROM users
                WHERE college_id = ? AND (
                    role IN ('Warden', 'ClubOrganizer', 'GateSecurity', 'Gate Security')
                    OR (role = 'Staff' AND (hostel_block IS NULL OR hostel_block = '' OR LOWER(hostel_block) = 'all'))
                )
            """
            params = (ACTIVE_COLLEGE_ID.get(),)
        else:
            query = """
                SELECT user_id, full_name, role, email, hostel_block, department, password, managed_by
                FROM users
                WHERE college_id = ? AND role = 'Staff' AND UPPER(managed_by) = ?
            """
            params = (ACTIVE_COLLEGE_ID.get(), caller["user_id"].upper())
        rows = db_exec(conn, query + " ORDER BY role, full_name, user_id", params).fetchall()
        return [
            {
                "user_id": row["user_id"],
                "full_name": row["full_name"],
                "role": row["role"],
                "email": row["email"],
                "hostel_block": row["hostel_block"],
                "department": row["department"],
                "has_password": str(row["password"] or "").startswith(PASSWORD_HASH_PREFIX),
                "can_manage": can_manage_staff_account(caller, row),
            }
            for row in rows
        ]
    finally:
        conn.close()


@app.put("/api/staff/accounts/password")
def set_staff_account_password(req: StaffPasswordSetReq, request: Request):
    caller = request.state.user
    caller_role = caller.get("role")
    if caller_role not in {"Dean", "Founder", "Warden"}:
        raise HTTPException(status_code=403, detail="Staff account management access is required.")
    user_id = req.user_id.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{1,39}", user_id):
        raise HTTPException(status_code=400, detail="Enter a valid staff account ID.")
    password_hash = hash_password(req.password)
    conn = get_conn()
    try:
        target = db_exec(
            conn,
            "SELECT role, hostel_block, managed_by FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
            (ACTIVE_COLLEGE_ID.get(), user_id),
        ).fetchone()
        if not target or target["role"] not in STAFF_LOGIN_ROLES:
            raise HTTPException(status_code=404, detail="Staff account not found.")
        if not can_manage_staff_account(caller, target):
            raise HTTPException(status_code=403, detail="You are not allowed to manage this staff account.")
        db_exec(
            conn,
            "UPDATE users SET password = ? WHERE college_id = ? AND UPPER(user_id) = ?",
            (password_hash, ACTIVE_COLLEGE_ID.get(), user_id),
        )
        conn.commit()
        invalidate_user_cache(user_id)
        return {"success": True, "message": f"Password updated for {user_id}."}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


def can_manage_staff_account(caller, target) -> bool:
    target = dict(target)
    caller_role = caller.get("role")
    target_role = target.get("role")
    if caller_role == "Founder":
        return target_role == "Dean"
    if caller_role == "Dean":
        if target_role in {"Warden", "ClubOrganizer", "GateSecurity", "Gate Security"}:
            return True
        return (
            target_role == "Staff"
            and str(target.get("hostel_block") or "").strip().casefold() in {"", "all"}
        )
    if caller_role == "Warden":
        return (
            target_role == "Staff"
            and str(target.get("managed_by") or "").strip().upper()
            == str(caller.get("user_id") or "").strip().upper()
        )
    return False


@app.get("/api/auth/me")
def get_current_account(request: Request):
    user = dict(request.state.user)
    user.pop("password", None)
    user.pop("dob", None)
    return {"success": True, "user": user}


@app.get("/api/hostels")
def get_hostels():
    conn = get_conn()
    try:
        rows = db_exec(
            conn,
            "SELECT name FROM hostels WHERE enabled = 1 ORDER BY name",
        ).fetchall()
        if rows:
            return [row["name"] for row in rows]
        rows = db_exec(
            conn,
            "SELECT DISTINCT hostel_block AS name FROM users WHERE role = 'Warden' AND hostel_block IS NOT NULL AND hostel_block NOT IN ('', 'All') ORDER BY hostel_block",
        ).fetchall()
        return [row["name"] for row in rows]
    finally:
        conn.close()


@app.get("/api/tenant")
def get_public_tenant_config():
    tenant = get_tenant_by_id(ACTIVE_COLLEGE_ID.get())
    if not tenant:
        raise HTTPException(status_code=404, detail="This college domain is not configured.")
    conn = get_conn()
    try:
        rows = db_exec(
            conn,
            "SELECT hostel_id, name, wings_json FROM hostels WHERE enabled = 1 ORDER BY name",
        ).fetchall()
        hostel_config = [
            {
                "hostel_id": row["hostel_id"],
                "name": row["name"],
                "wings": json.loads(row["wings_json"] or "[]"),
            }
            for row in rows
        ]
        hostels = [hostel["name"] for hostel in hostel_config]
        if not hostels:
            fallback_rows = db_exec(
                conn,
                "SELECT DISTINCT hostel_block AS name FROM users "
                "WHERE role = 'Warden' AND hostel_block IS NOT NULL "
                "AND hostel_block NOT IN ('', 'All') ORDER BY hostel_block",
            ).fetchall()
            hostels = [row["name"] for row in fallback_rows]
    finally:
        conn.close()
    return {
        "college_id": tenant["college_id"],
        "college_name": tenant["college_name"],
        "allowed_email_domain": tenant["allowed_email_domain"],
        "timezone": tenant["timezone"],
        "logo_url": tenant["logo_url"],
        "modules": tenant["modules"],
        "hostels": hostels,
        "hostel_config": hostel_config,
    }


@app.get("/api/hostels/config")
def get_hostel_config():
    conn = get_conn()
    try:
        rows = db_exec(
            conn,
            "SELECT hostel_id, name, wings_json FROM hostels WHERE enabled = 1 ORDER BY name",
        ).fetchall()
        return [
            {
                "hostel_id": row["hostel_id"],
                "name": row["name"],
                "wings": json.loads(row["wings_json"] or "[]"),
            }
            for row in rows
        ]
    finally:
        conn.close()


def configured_wings(hostel_block: str) -> List[str]:
    if not hostel_block or hostel_block.strip().casefold() == "day scholar":
        return []
    row = get_hostel_config_by_name(hostel_block)
    return json.loads(row["wings_json"] or "[]") if row else []


def get_hostel_config_by_name(hostel_block: str):
    conn = get_conn()
    try:
        return db_exec(
            conn,
            "SELECT * FROM hostels WHERE college_id = ? AND enabled = 1 AND LOWER(name) = LOWER(?)",
            (ACTIVE_COLLEGE_ID.get(), hostel_block.strip()),
        ).fetchone()
    finally:
        conn.close()


def parse_clock_time(value: str, field_name: str) -> datetime_time:
    try:
        return datetime.strptime(value, "%H:%M").time()
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=f"Enter {field_name} as a 24-hour time (HH:MM).") from error


def attendance_config_for_hostel(hostel_block: str):
    conn = get_conn()
    try:
        row = db_exec(
            conn,
            """
            SELECT name, wings_json, attendance_start_time, attendance_end_time,
                   attendance_test_mode, geofence_latitude,
                   geofence_longitude, geofence_radius_m, geofence_max_accuracy_m,
                   wing_beacons_json
            FROM hostels
            WHERE college_id = ? AND enabled = 1 AND LOWER(name) = LOWER(?)
            """,
            (ACTIVE_COLLEGE_ID.get(), hostel_block.strip()),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


@app.get("/api/warden/attendance-config")
def get_warden_attendance_config(request: Request):
    warden = request.state.user
    if warden.get("role") != "Warden":
        raise HTTPException(status_code=403, detail="Only wardens can manage hostel attendance settings.")
    config = attendance_config_for_hostel(warden.get("hostel_block", ""))
    if not config:
        raise HTTPException(status_code=404, detail="Your assigned hostel is not configured.")
    return {
        "hostel_block": config["name"],
        "wings": json.loads(config["wings_json"] or "[]"),
        "start_time": config["attendance_start_time"],
        "end_time": config["attendance_end_time"],
        "test_mode": bool(config["attendance_test_mode"]),
        "wing_beacons": json.loads(config["wing_beacons_json"] or "{}"),
    }


@app.put("/api/warden/attendance-config")
def update_warden_attendance_config(req: AttendanceConfigReq, request: Request):
    warden = request.state.user
    if warden.get("role") != "Warden":
        raise HTTPException(status_code=403, detail="Only wardens can manage hostel attendance settings.")
    start_time = parse_clock_time(req.start_time, "start time")
    end_time = parse_clock_time(req.end_time, "end time")
    if start_time == end_time:
        raise HTTPException(status_code=400, detail="Attendance start and end times must be different.")
    conn = get_conn()
    try:
        check_warden_hostel(warden, warden.get("hostel_block", ""))
        hostel = db_exec(
            conn,
            "SELECT wings_json, wing_beacons_json, attendance_test_mode FROM hostels WHERE college_id = ? AND enabled = 1 AND LOWER(name) = LOWER(?)",
            (ACTIVE_COLLEGE_ID.get(), warden["hostel_block"].strip()),
        ).fetchone()
        if not hostel:
            raise HTTPException(status_code=404, detail="Your assigned hostel is not configured.")
        if req.wing_beacons is None:
            wing_beacons = json.loads(hostel["wing_beacons_json"] or "{}")
        else:
            configured_wings_for_hostel = set(json.loads(hostel["wings_json"] or "[]"))
            wing_beacons = {}
            for wing, beacon_id in req.wing_beacons.items():
                normalized_wing = wing.strip()
                normalized_beacon = beacon_id.strip()
                if normalized_wing not in configured_wings_for_hostel:
                    raise HTTPException(status_code=400, detail=f"{normalized_wing} is not configured for this hostel.")
                if normalized_beacon and not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", normalized_beacon):
                    raise HTTPException(status_code=400, detail="Beacon IDs may contain letters, numbers, dots, underscores, colons, and hyphens.")
                if normalized_beacon:
                    wing_beacons[normalized_wing] = normalized_beacon
        updated = db_exec(
            conn,
            """
            UPDATE hostels SET attendance_start_time = ?, attendance_end_time = ?,
            wing_beacons_json = ?, attendance_test_mode = ?
            WHERE college_id = ? AND enabled = 1 AND LOWER(name) = LOWER(?)
            """,
            (
                req.start_time,
                req.end_time,
                json.dumps(wing_beacons),
                int(req.test_mode) if req.test_mode is not None else int(hostel["attendance_test_mode"] or 0),
                ACTIVE_COLLEGE_ID.get(),
                warden["hostel_block"].strip(),
            ),
        )
        if updated.rowcount == 0:
            raise HTTPException(status_code=404, detail="Your assigned hostel is not configured.")
        conn.commit()
        return {"success": True, "message": "Attendance hours and wing beacons saved."}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


def parse_aware_datetime(value: str, field_name: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=f"Enter a valid {field_name} date and time.") from error
    if parsed.tzinfo is None:
        raise HTTPException(status_code=400, detail=f"{field_name.capitalize()} must include its time-zone offset.")
    return parsed.astimezone(timezone.utc)


def validate_pass_times(pass_type: str, departure_at: datetime, return_at: datetime, tenant_timezone: str):
    now = datetime.now(timezone.utc)
    if departure_at <= now or return_at <= departure_at:
        raise HTTPException(status_code=400, detail="Choose a future departure and a later return time.")
    if pass_type == "day":
        local_zone = ZoneInfo(tenant_timezone)
        if departure_at.astimezone(local_zone).date() != return_at.astimezone(local_zone).date():
            raise HTTPException(status_code=400, detail="A day outpass must depart and return on the same college-local date.")
    elif pass_type == "outstation":
        if return_at - departure_at > timedelta(days=30):
            raise HTTPException(status_code=400, detail="Outstation outpasses cannot exceed 30 days.")
    else:
        raise HTTPException(status_code=400, detail="Choose Day or Outstation.")


def expected_webauthn_origin(request: Request):
    origin = request.headers.get("origin", "").strip()
    parsed = urlparse(origin)
    tenant_domain = str(request.state.tenant["primary_domain"]).lower()
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in {"https", "http"} or not host or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail="A valid portal origin is required for passkey verification.")
    is_localhost = host == "localhost"
    if not is_localhost and (parsed.scheme != "https" or host != tenant_domain):
        raise HTTPException(status_code=403, detail="Passkeys must be used from this college's secure portal domain.")
    rp_id = "localhost" if is_localhost else tenant_domain
    return origin.rstrip("/"), rp_id


def close_expired_attendance_sessions():
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    conn = get_conn()
    closed_count = 0
    try:
        suffix = " FOR UPDATE" if USE_POSTGRES else ""
        active_college_id = ACTIVE_COLLEGE_ID.get()
        tenant_filter = "" if active_college_id == "*" else "college_id = ? AND "
        params = (now,) if active_college_id == "*" else (active_college_id, now)
        sessions = db_exec(
            conn,
            f"SELECT * FROM attendance_sessions WHERE {tenant_filter}status = 'Open' AND closes_at <= ?{suffix}",
            params,
        ).fetchall()
        for session in sessions:
            if USE_POSTGRES:
                db_exec(
                    conn,
                    "SELECT set_config('app.college_id', ?, true)",
                    (session["college_id"],),
                )
            updated = db_exec(
                conn,
                "UPDATE attendance_sessions SET status = 'Closed' WHERE college_id = ? AND session_id = ? AND status = 'Open'",
                (session["college_id"], session["session_id"]),
            )
            if updated.rowcount == 0:
                continue
            students = db_exec(
                conn,
                "SELECT user_id FROM users WHERE college_id = ? AND role = 'Student' AND LOWER(hostel_block) = LOWER(?)",
                (session["college_id"], session["hostel_block"]),
            ).fetchall()
            for student in students:
                db_exec(
                    conn,
                    """
                    INSERT INTO attendance_records
                        (college_id, record_id, session_id, student_id, status, method, marked_at, exception_reason)
                    VALUES (?, ?, ?, ?, 'Absent', 'automatic', ?, '')
                    ON CONFLICT (college_id, session_id, student_id) DO NOTHING
                    """,
                    (
                        session["college_id"],
                        f"AR-{uuid.uuid4().hex[:16].upper()}",
                        session["session_id"],
                        student["user_id"],
                        now,
                    ),
                )
            closed_count += 1
        conn.commit()
        return closed_count
    except Exception:
        conn.rollback()
        logger.exception("Could not close expired attendance sessions")
        raise
    finally:
        conn.close()


async def attendance_expiry_worker():
    tenant_token = ACTIVE_COLLEGE_ID.set("*")
    try:
        while True:
            try:
                await asyncio.to_thread(close_expired_attendance_sessions)
            except Exception:
                logger.exception("Attendance expiry worker failed; it will retry")
            await asyncio.sleep(30)
    finally:
        ACTIVE_COLLEGE_ID.reset(tenant_token)


def sanitized_pass(row, include_parent_phone: bool = False):
    item = dict(row)
    item.pop("qr_secret", None)
    item.pop("qr_token", None)
    if not include_parent_phone:
        item.pop("parent_phone", None)
    if item.get("actual_return_at") and item.get("to_date"):
        try:
            actual_return = datetime.strptime(item["actual_return_at"], "%Y-%m-%d %H:%M")
            deadline = datetime.strptime(
                f"{item['to_date']} {item.get('expected_return_time') or '22:00'}",
                "%Y-%m-%d %H:%M",
            )
            minutes = int(abs((actual_return - deadline).total_seconds()) // 60)
            hours, remaining_minutes = divmod(minutes, 60)
            if actual_return < deadline:
                item["return_timing"] = (
                    f"Early by {hours} hr{'s' if hours != 1 else ''} "
                    f"{remaining_minutes} min{'s' if remaining_minutes != 1 else ''}"
                    if hours else f"Early by {remaining_minutes} min{'s' if remaining_minutes != 1 else ''}"
                )
            elif actual_return > deadline:
                item["return_timing"] = (
                    f"Late by {hours} hr{'s' if hours != 1 else ''} "
                    f"{remaining_minutes} min{'s' if remaining_minutes != 1 else ''}"
                    if hours else f"Late by {remaining_minutes} min{'s' if remaining_minutes != 1 else ''}"
                )
            else:
                item["return_timing"] = "Returned on time"
        except (TypeError, ValueError):
            item["return_timing"] = ""
    return item


def pass_qr_code(pass_id: str, secret: str, now: Optional[datetime] = None) -> str:
    timestamp = now or datetime.now(timezone.utc)
    time_slot = int(timestamp.timestamp() // 30)
    payload = f"{pass_id}.{time_slot}"
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def verify_pass_qr_code(pass_row, code: str, now: Optional[datetime] = None) -> bool:
    try:
        pass_id, slot, signature = code.split(".", 2)
        if pass_id != pass_row["pass_id"] or int(slot) != int((now or datetime.now(timezone.utc)).timestamp() // 30):
            return False
    except (ValueError, TypeError):
        return False
    expected = pass_qr_code(pass_id, pass_row["qr_secret"], now).rsplit(".", 1)[1]
    return hmac.compare_digest(signature, expected)


def attendance_qr_code(session_id: str, secret: str, now: Optional[datetime] = None) -> str:
    timestamp = now or datetime.now(timezone.utc)
    time_slot = int(timestamp.timestamp() // 30)
    payload = f"{session_id}.{time_slot}"
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def verify_attendance_qr_code(session_row, code: str, now: Optional[datetime] = None) -> bool:
    try:
        session_id, slot, signature = code.split(".", 2)
        timestamp = now or datetime.now(timezone.utc)
        closes_at = parse_aware_datetime(session_row["closes_at"], "session close")
        if (
            session_id != session_row["session_id"]
            or timestamp >= closes_at
            or int(slot) != int(timestamp.timestamp() // 30)
        ):
            return False
    except (ValueError, TypeError):
        return False
    expected = attendance_qr_code(session_id, session_row["session_secret"], now).rsplit(".", 1)[1]
    return hmac.compare_digest(signature, expected)


@app.post("/api/leave/apply")
def apply_digital_leave(req: LeaveApplyReq, request: Request):
    student_account = request.state.user
    if student_account.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can apply for leave.")
    leave_type = req.leave_type.strip().casefold()
    if leave_type in {"day", "day outpass", "day out-pass"}:
        normalized_type, pass_type = "Day Outpass", "day"
    elif leave_type in {"home", "home leave"}:
        normalized_type, pass_type = "Home Leave", "outstation"
    else:
        raise HTTPException(status_code=400, detail="Choose Day Outpass or Home Leave.")
    destination = req.destination.strip()
    reason = req.reason.strip()
    parent_phone = req.parent_phone.strip()
    if not destination or len(destination) > 160:
        raise HTTPException(status_code=400, detail="Enter a destination of 1 to 160 characters.")
    if not reason or len(reason) > 500:
        raise HTTPException(status_code=400, detail="Enter a reason of 1 to 500 characters.")
    if parent_phone and not re.fullmatch(r"\+?[0-9][0-9\s()-]{7,17}", parent_phone):
        raise HTTPException(status_code=400, detail="Enter a valid parent or guardian mobile number.")
    try:
        from_date = datetime.strptime(req.from_date, "%Y-%m-%d").date()
        to_date = datetime.strptime(req.to_date, "%Y-%m-%d").date()
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail="Choose valid start and end dates.") from error
    if to_date < from_date:
        raise HTTPException(status_code=400, detail="The end date must be on or after the start date.")
    days_count = (to_date - from_date).days + 1
    if pass_type == "day" and days_count != 1:
        raise HTTPException(status_code=400, detail="A Day Outpass must start and end on the same date.")
    if pass_type == "outstation" and days_count > 30:
        raise HTTPException(status_code=400, detail="Home Leave cannot exceed 30 calendar days.")
    expected_return_time = (req.expected_return_time or ("22:00" if pass_type == "day" else "21:00")).strip()
    parse_clock_time(expected_return_time, "expected return time")
    zone = ZoneInfo(request.state.tenant["timezone"])
    today = datetime.now(zone).date()
    if from_date < today:
        raise HTTPException(status_code=400, detail="Leave cannot start on a date in the past.")

    conn = get_conn()
    try:
        student = db_exec(
            conn,
            """
            SELECT user_id, full_name, hostel_block, wing, room, phone, guardian_phone,
                   guardian_whatsapp_consent
            FROM users
            WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'
            """,
            (ACTIVE_COLLEGE_ID.get(), student_account["user_id"].upper()),
        ).fetchone()
        if not student:
            raise HTTPException(status_code=404, detail="Student profile not found.")
        if not student["hostel_block"] or student["hostel_block"].strip().casefold() == "day scholar":
            raise HTTPException(status_code=403, detail="Digital leave passes are available only to hostel residents.")
        effective_parent_phone = parent_phone or student["guardian_phone"] or ""
        departure = datetime.combine(from_date, datetime_time.min, tzinfo=zone).astimezone(timezone.utc)
        returned = datetime.combine(to_date, datetime_time(23, 59, 59), tzinfo=zone).astimezone(timezone.utc)
        pass_id = f"OP-{uuid.uuid4().hex[:16].upper()}"
        alert_status = "not_sent"
        db_exec(
            conn,
            """
            INSERT INTO leave_passes
                (college_id, pass_id, student_id, student_name, hostel_block, wing, room,
                 phone, parent_phone, leave_type, reason, from_date, to_date, days_count,
                 pass_type, destination, purpose, departure_at, return_at, status, qr_secret,
                 qr_token, parent_alert_status, expected_return_time, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    'Pending Warden Approval', ?, '', ?, ?, ?)
            """,
            (
                ACTIVE_COLLEGE_ID.get(),
                pass_id,
                student["user_id"],
                student["full_name"] or student["user_id"],
                student["hostel_block"],
                student["wing"] or "",
                student["room"] or "",
                student["phone"] or "",
                effective_parent_phone,
                normalized_type,
                reason,
                from_date.isoformat(),
                to_date.isoformat(),
                days_count,
                pass_type,
                destination,
                reason,
                departure.isoformat(timespec="seconds"),
                returned.isoformat(timespec="seconds"),
                "",
                alert_status,
                expected_return_time,
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        )
        conn.commit()
        row = db_exec(
            conn,
            "SELECT * FROM leave_passes WHERE college_id = ? AND pass_id = ?",
            (ACTIVE_COLLEGE_ID.get(), pass_id),
        ).fetchone()
        return {"success": True, "leave_pass": sanitized_pass(row)}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.post("/api/leave/action")
def action_digital_leave(req: LeaveActionReq, request: Request):
    warden = request.state.user
    if warden.get("role") not in {"Warden", "Dean"}:
        raise HTTPException(status_code=403, detail="Warden or Dean access is required.")
    status = req.status.strip().casefold()
    if status not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail="Choose Approved or Rejected.")
    remark = req.warden_remark.strip()
    if len(remark) > 500:
        raise HTTPException(status_code=400, detail="Warden remark cannot exceed 500 characters.")
    conn = get_conn()
    try:
        suffix = " FOR UPDATE" if USE_POSTGRES else ""
        leave_pass = db_exec(
            conn,
            f"""
            SELECT * FROM leave_passes
            WHERE college_id = ? AND pass_id = ?{suffix}
            """,
            (ACTIVE_COLLEGE_ID.get(), req.pass_id),
        ).fetchone()
        if not leave_pass:
            raise HTTPException(status_code=404, detail="Leave pass not found.")
        if not leave_pass["leave_type"]:
            raise HTTPException(status_code=409, detail="This request is not a digital leave pass.")
        if warden.get("role") == "Warden" and str(leave_pass["hostel_block"] or "").casefold() != str(warden.get("hostel_block") or "").casefold():
            raise HTTPException(status_code=403, detail="You can review leave passes only for your assigned hostel.")
        if leave_pass["status"] not in {"Pending", "Pending Warden Approval"}:
            raise HTTPException(status_code=409, detail="This leave pass has already been reviewed.")
        final_status = "Approved" if status == "approved" else "Rejected"
        approved_by = str(
            warden.get("full_name") or warden.get("name") or warden.get("user_id") or "Chief Warden"
        ).strip()
        reviewed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        updated = db_exec(
            conn,
            """
            UPDATE leave_passes
            SET status = ?, warden_id = ?, reviewed_at = ?, reviewed_by = ?,
                review_remark = ?, return_status = ?,
                approved_by = CASE WHEN ? = 'Approved' THEN ? ELSE approved_by END
            WHERE college_id = ? AND pass_id = ?
              AND status IN ('Pending', 'Pending Warden Approval')
            """,
            (
                final_status,
                warden["user_id"],
                reviewed_at,
                warden["user_id"],
                remark,
                "Currently Out" if final_status == "Approved" else "Not Returned",
                final_status,
                approved_by,
                ACTIVE_COLLEGE_ID.get(),
                req.pass_id,
            ),
        )
        if updated.rowcount == 0:
            raise HTTPException(status_code=409, detail="This leave pass has already been reviewed.")
        if final_status == "Approved":
            student = db_exec(
                conn,
                """
                SELECT user_id, full_name, hostel_block, wing, room
                FROM users
                WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'
                """,
                (ACTIVE_COLLEGE_ID.get(), leave_pass["student_id"].upper()),
            ).fetchone()
            if not student:
                raise HTTPException(status_code=404, detail="The student record for this pass no longer exists.")
            if leave_pass["from_date"] and leave_pass["to_date"]:
                first_date = datetime.strptime(leave_pass["from_date"], "%Y-%m-%d").date()
                last_date = datetime.strptime(leave_pass["to_date"], "%Y-%m-%d").date()
            else:
                zone = ZoneInfo(request.state.tenant["timezone"])
                first_date = parse_aware_datetime(leave_pass["departure_at"], "departure").astimezone(zone).date()
                last_date = parse_aware_datetime(leave_pass["return_at"], "return").astimezone(zone).date()
            if last_date < first_date or (last_date - first_date).days > 30:
                raise HTTPException(status_code=400, detail="The stored leave dates are invalid.")
            current_date = first_date
            while current_date <= last_date:
                date_text = current_date.isoformat()
                existing = db_exec(
                    conn,
                    """
                    SELECT log_id FROM attendance_logs
                    WHERE college_id = ? AND UPPER(student_id) = ? AND date = ?
                    LIMIT 1
                    """,
                    (ACTIVE_COLLEGE_ID.get(), student["user_id"].upper(), date_text),
                ).fetchone()
                if existing:
                    db_exec(
                        conn,
                        """
                        UPDATE attendance_logs
                        SET status = 'On Approved Leave', verified_method = 'warden_approved_leave',
                            wing_beacon_id = '', rssi = NULL
                        WHERE college_id = ? AND log_id = ?
                        """,
                        (ACTIVE_COLLEGE_ID.get(), existing["log_id"]),
                    )
                else:
                    db_exec(
                        conn,
                        """
                        INSERT INTO attendance_logs
                            (college_id, log_id, student_id, student_name, hostel_block, wing, room,
                             date, time, status, wing_beacon_id, rssi, verified_method)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 'On Approved Leave', '', NULL, 'warden_approved_leave')
                        """,
                        (
                            ACTIVE_COLLEGE_ID.get(),
                            f"AL-{uuid.uuid4().hex[:16].upper()}",
                            student["user_id"],
                            student["full_name"] or student["user_id"],
                            student["hostel_block"],
                            student["wing"] or "",
                            student["room"] or "",
                            date_text,
                        ),
                    )
                current_date += timedelta(days=1)
        conn.commit()
        row = db_exec(
            conn,
            "SELECT * FROM leave_passes WHERE college_id = ? AND pass_id = ?",
            (ACTIVE_COLLEGE_ID.get(), req.pass_id),
        ).fetchone()
        return {"success": True, "leave_pass": sanitized_pass(row)}
    except DB_INTEGRITY_ERRORS as error:
        conn.rollback()
        raise HTTPException(status_code=409, detail="This leave pass was already reviewed.") from error
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def leave_return_challenge_purpose(leave_pass, request_body) -> str:
    challenge_context = {
        "college_id": ACTIVE_COLLEGE_ID.get(),
        "student_id": leave_pass["student_id"].upper(),
        "pass_id": leave_pass["pass_id"],
        "biometric_cred_id": request_body.biometric_cred_id,
        "device_hardware_id": request_body.device_hardware_id,
        "wing_beacon_id": request_body.wing_beacon_id,
        "rssi": request_body.rssi,
        "simulated": request_body.simulated,
    }
    digest = hashlib.sha256(
        json.dumps(challenge_context, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return f"leave-return:{leave_pass['pass_id']}:{digest}"


def validate_leave_return_request(conn, request_body, request: Request, for_update: bool = False):
    account = request.state.user
    pass_suffix = " FOR UPDATE" if USE_POSTGRES and for_update else ""
    leave_pass = db_exec(
        conn,
        f"SELECT * FROM leave_passes WHERE college_id = ? AND pass_id = ?{pass_suffix}",
        (ACTIVE_COLLEGE_ID.get(), request_body.pass_id),
    ).fetchone()
    if not leave_pass:
        raise HTTPException(status_code=404, detail="Leave pass not found.")
    if not leave_pass["leave_type"]:
        raise HTTPException(status_code=409, detail="Return tracking is available only for digital leave passes.")
    if leave_pass["student_id"].upper() != account["user_id"].upper():
        raise HTTPException(status_code=403, detail="This leave pass belongs to another student.")
    if leave_pass["status"] != "Approved":
        raise HTTPException(status_code=409, detail="Only Warden-approved leave passes can be used to confirm a return.")
    if leave_pass["actual_return_at"]:
        raise HTTPException(status_code=409, detail="This leave pass already has a verified return.")

    student = student_biometric_record(conn, account["user_id"], for_update=for_update)
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")
    if hasattr(request_body, "device_binding_token"):
        verify_device_binding(student, request_body.device_binding_token)
    elif (
        student["biometric_status"] != "Locked"
        or not student["biometric_cred_id"]
        or request_body.biometric_cred_id != student["biometric_cred_id"]
        or not student["device_hardware_id"]
        or request_body.device_hardware_id != student["device_hardware_id"]
    ):
        raise HTTPException(
            status_code=403,
            detail="This device does not match the Warden-enrolled device binding.",
        )
    if not -127 <= request_body.rssi <= 0:
        raise HTTPException(status_code=400, detail="Beacon RSSI must be between -127 and 0 dBm.")
    if request_body.rssi <= -80:
        raise HTTPException(status_code=403, detail="The beacon signal is too weak for return verification.")

    hostel = attendance_config_for_hostel(student["hostel_block"] or "")
    if not hostel:
        raise HTTPException(status_code=404, detail="Your hostel does not have attendance settings.")
    if not student["wing"]:
        raise HTTPException(status_code=409, detail="Your Warden must assign your hostel wing before return verification.")
    expected_beacon = json.loads(hostel["wing_beacons_json"] or "{}").get(student["wing"])
    if not expected_beacon:
        raise HTTPException(status_code=409, detail=f"Your Warden has not configured the {student['wing']} beacon yet.")
    if request_body.wing_beacon_id != expected_beacon:
        raise HTTPException(status_code=403, detail="The detected beacon does not match your assigned hostel wing.")
    if not re.fullmatch(r"HMS-[A-Za-z0-9_-]+-[A-Fa-f0-9]{8}", request_body.wing_beacon_id):
        raise HTTPException(status_code=403, detail="The beacon identity is not a valid HMS beacon.")
    wing_id = request_body.wing_beacon_id.split("-", 2)[1]
    secret = BEACON_HMAC_SECRETS.get(wing_id)
    if not isinstance(secret, str) or not any(
        hmac.compare_digest(
            request_body.wing_beacon_id.rsplit("-", 1)[-1].lower(),
            hmac.new(secret.encode(), f"{wing_id}:{slot}".encode(), hashlib.sha256).hexdigest()[:8].lower(),
        )
        for slot in (int(time.time() // 600) - 1, int(time.time() // 600), int(time.time() // 600) + 1)
    ):
        raise HTTPException(status_code=403, detail="The beacon signature is invalid or expired.")
    if request_body.simulated:
        raise HTTPException(status_code=403, detail="Simulated BLE return verification is not available to students.")
    zone = ZoneInfo(request.state.tenant["timezone"])
    if leave_pass["from_date"] and datetime.now(zone).date().isoformat() < leave_pass["from_date"]:
        raise HTTPException(status_code=403, detail="Return verification is not available before the approved leave starts.")
    return leave_pass, student


@app.post("/api/leave/mark-return/options")
def leave_return_options(req: LeaveReturnOptionsReq, request: Request):
    account = request.state.user
    if account.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can confirm their return.")
    origin, rp_id = expected_webauthn_origin(request)
    del origin
    conn = get_conn()
    try:
        leave_pass, student = validate_leave_return_request(conn, req, request)
        credential = db_exec(
            conn,
            """
            SELECT credential_id FROM webauthn_credentials
            WHERE college_id = ? AND credential_id = ? AND UPPER(user_id) = ?
            """,
            (ACTIVE_COLLEGE_ID.get(), student["biometric_cred_id"], account["user_id"].upper()),
        ).fetchone()
        if not credential:
            raise HTTPException(status_code=409, detail="Your locked device passkey is missing. Ask your Warden to unlock enrollment again.")
        options = generate_authentication_options(
            rp_id=rp_id,
            allow_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(credential["credential_id"]))],
            user_verification=UserVerificationRequirement.REQUIRED,
        )
        challenge_id = create_webauthn_challenge(
            conn,
            account["user_id"],
            leave_return_challenge_purpose(leave_pass, req),
            options.challenge,
        )
        conn.commit()
        return {"challenge_id": challenge_id, "options": json.loads(options_to_json(options))}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.post("/api/leave/mark-return")
def mark_leave_return(req: DeviceLeaveReturnReq, request: Request):
    account = request.state.user
    if account.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can confirm their return.")
    conn = get_conn()
    try:
        leave_pass, student = validate_leave_return_request(conn, req, request, for_update=True)
        if not student["face_reference_encrypted"] or not _verify_face_image(req.live_image_base64, student["face_reference_encrypted"]):
            raise HTTPException(status_code=403, detail="Server-side liveness and face verification failed.")
        req.live_image_base64 = ""

        zone = ZoneInfo(request.state.tenant["timezone"])
        now_str = datetime.now(zone).strftime("%Y-%m-%d %H:%M")
        deadline = datetime.strptime(
            f"{leave_pass['to_date']} {leave_pass['expected_return_time'] or '22:00'}",
            "%Y-%m-%d %H:%M",
        )
        actual = datetime.strptime(now_str, "%Y-%m-%d %H:%M")
        if actual < deadline:
            return_status = "Returned Early"
        elif actual == deadline:
            return_status = "Returned On Time"
        else:
            return_status = "Returned Late"
        updated = db_exec(
            conn,
            """
            UPDATE leave_passes
            SET actual_return_at = ?, return_status = ?, return_beacon_id = ?
            WHERE college_id = ? AND pass_id = ? AND status = 'Approved'
              AND actual_return_at = ''
            """,
            (
                now_str,
                return_status,
                req.wing_beacon_id,
                ACTIVE_COLLEGE_ID.get(),
                req.pass_id,
            ),
        )
        if updated.rowcount == 0:
            raise HTTPException(status_code=409, detail="This leave pass already has a verified return.")
        conn.commit()
        row = db_exec(
            conn,
            "SELECT * FROM leave_passes WHERE college_id = ? AND pass_id = ?",
            (ACTIVE_COLLEGE_ID.get(), req.pass_id),
        ).fetchone()
        return {"success": True, "leave_pass": sanitized_pass(row)}
    except DB_INTEGRITY_ERRORS as error:
        conn.rollback()
        raise HTTPException(status_code=409, detail="This leave pass already has a verified return.") from error
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def verify_attendance_location(session_row, latitude: Optional[float], longitude: Optional[float], accuracy_m: Optional[float]):
    session_row = dict(session_row)
    center_lat = session_row.get("geofence_latitude")
    center_lon = session_row.get("geofence_longitude")
    if center_lat is None or center_lon is None:
        raise HTTPException(status_code=503, detail="This roll call has no configured hostel geofence.")
    if latitude is None or longitude is None or accuracy_m is None:
        raise HTTPException(status_code=400, detail="Allow location access to mark attendance.")
    if (
        not math.isfinite(latitude)
        or not math.isfinite(longitude)
        or not math.isfinite(accuracy_m)
        or not -90 <= latitude <= 90
        or not -180 <= longitude <= 180
        or accuracy_m <= 0
    ):
        raise HTTPException(status_code=400, detail="Your browser returned invalid location data.")
    max_accuracy = int(session_row.get("geofence_max_accuracy_m") or 0)
    if accuracy_m > max_accuracy:
        raise HTTPException(
            status_code=403,
            detail=f"GPS accuracy is too low ({round(accuracy_m)} m). Move to an open area and try again; the limit is {max_accuracy} m.",
        )
    earth_radius_m = 6_371_000
    lat1, lat2 = math.radians(latitude), math.radians(float(center_lat))
    delta_lat = lat2 - lat1
    delta_lon = math.radians(float(center_lon) - longitude)
    haversine = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    haversine = min(1.0, max(0.0, haversine))
    distance_m = earth_radius_m * 2 * math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine))
    if distance_m > int(session_row.get("geofence_radius_m") or 0):
        raise HTTPException(status_code=403, detail="You are outside the configured hostel attendance area.")


def sanitized_attendance_session(row):
    item = dict(row)
    item.pop("session_secret", None)
    item.pop("hostel_key", None)
    item.pop("geofence_latitude", None)
    item.pop("geofence_longitude", None)
    return item


@app.post("/api/outpasses")
def create_outpass(req: OutpassCreateReq, request: Request):
    student = request.state.user
    if student.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can request an outpass.")
    if len(req.destination.strip()) > 160 or len(req.purpose.strip()) > 500:
        raise HTTPException(status_code=400, detail="Destination or purpose is too long.")
    if not req.destination.strip() or not req.purpose.strip():
        raise HTTPException(status_code=400, detail="Destination and purpose are required.")
    tenant = request.state.tenant
    departure = parse_aware_datetime(req.departure_at, "departure")
    returned = parse_aware_datetime(req.return_at, "return")
    pass_type = req.pass_type.strip().lower()
    validate_pass_times(pass_type, departure, returned, tenant["timezone"])

    conn = get_conn()
    try:
        profile = db_exec(
            conn,
            """
            SELECT hostel_block, guardian_phone, guardian_whatsapp_consent
            FROM users WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'
            """,
            (ACTIVE_COLLEGE_ID.get(), student["user_id"].upper()),
        ).fetchone()
        if not profile:
            raise HTTPException(status_code=404, detail="Student profile not found.")
        if not profile["hostel_block"] or profile["hostel_block"].strip().casefold() == "day scholar":
            raise HTTPException(status_code=403, detail="Outpasses are available only to hostel residents.")
        pass_id = f"OP-{uuid.uuid4().hex[:16].upper()}"
        alert_enabled = bool(tenant["modules"].get("parent_alerts", False))
        has_consent = bool(profile["guardian_whatsapp_consent"])
        parent_phone = (profile["guardian_phone"] or "") if alert_enabled and has_consent else ""
        if not alert_enabled:
            alert_status = "disabled"
        elif not has_consent:
            alert_status = "not_consented"
        elif not parent_phone:
            alert_status = "no_contact"
        else:
            alert_status = "pending_review"
        db_exec(
            conn,
            """
            INSERT INTO leave_passes
                (college_id, pass_id, student_id, hostel_block, pass_type, destination, purpose,
                 departure_at, return_at, status, qr_secret, parent_alert_status,
                 parent_phone, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?)
            """,
            (
                ACTIVE_COLLEGE_ID.get(),
                pass_id,
                student["user_id"],
                profile["hostel_block"],
                pass_type,
                req.destination.strip(),
                req.purpose.strip(),
                departure.isoformat(timespec="seconds"),
                returned.isoformat(timespec="seconds"),
                secrets.token_urlsafe(32),
                alert_status,
                parent_phone,
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        )
        conn.commit()
        row = db_exec(conn, "SELECT * FROM leave_passes WHERE college_id = ? AND pass_id = ?", (ACTIVE_COLLEGE_ID.get(), pass_id)).fetchone()
        return {"success": True, "outpass": sanitized_pass(row)}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.get("/api/outpasses")
def list_outpasses(request: Request, status: Optional[str] = Query(default=None)):
    account = request.state.user
    conn = get_conn()
    try:
        if account["role"] == "Student":
            rows = db_exec(
                conn,
                "SELECT * FROM leave_passes WHERE college_id = ? AND UPPER(student_id) = ? ORDER BY created_at DESC LIMIT 100",
                (ACTIVE_COLLEGE_ID.get(), account["user_id"].upper()),
            ).fetchall()
        elif account["role"] in {"Warden", "Dean"}:
            if account["role"] == "Warden":
                query = "SELECT * FROM leave_passes WHERE college_id = ? AND LOWER(hostel_block) = LOWER(?)"
                params = [ACTIVE_COLLEGE_ID.get(), account.get("hostel_block", "")]
            else:
                query = "SELECT * FROM leave_passes WHERE college_id = ?"
                params = [ACTIVE_COLLEGE_ID.get()]
            if status:
                if status.casefold() == "pending":
                    query += " AND status IN ('Pending', 'Pending Warden Approval')"
                else:
                    query += " AND LOWER(status) = LOWER(?)"
                    params.append(status)
            query += " ORDER BY created_at DESC LIMIT 200"
            rows = db_exec(conn, query, tuple(params)).fetchall()
        elif account["role"] == "Gate Security":
            rows = db_exec(
                conn,
                """
                SELECT * FROM leave_passes
                WHERE college_id = ? AND status = 'Approved' AND return_at >= ?
                ORDER BY departure_at ASC LIMIT 200
                """,
                (ACTIVE_COLLEGE_ID.get(), datetime.now(timezone.utc).isoformat(timespec="seconds")),
            ).fetchall()
        else:
            raise HTTPException(status_code=403, detail="You cannot view outpasses.")
        return {"outpasses": [sanitized_pass(row) for row in rows]}
    finally:
        conn.close()


@app.post("/api/outpasses/review")
def review_outpass(req: OutpassReviewReq, request: Request):
    reviewer = request.state.user
    if reviewer.get("role") not in {"Warden", "Dean"}:
        raise HTTPException(status_code=403, detail="Warden or Dean access is required.")
    decision = req.decision.strip().lower()
    if decision not in {"approve", "reject"}:
        raise HTTPException(status_code=400, detail="Decision must be approve or reject.")
    if len((req.remark or "").strip()) > 500:
        raise HTTPException(status_code=400, detail="Review remark is too long.")

    conn = get_conn()
    try:
        suffix = " FOR UPDATE" if USE_POSTGRES else ""
        outpass = db_exec(
            conn,
            f"SELECT * FROM leave_passes WHERE college_id = ? AND pass_id = ?{suffix}",
            (ACTIVE_COLLEGE_ID.get(), req.pass_id),
        ).fetchone()
        if not outpass:
            raise HTTPException(status_code=404, detail="Outpass not found.")
        if reviewer["role"] == "Warden" and outpass["hostel_block"].casefold() != str(reviewer.get("hostel_block", "")).casefold():
            raise HTTPException(status_code=403, detail="This outpass belongs to a different hostel.")
        if outpass["status"] not in {"Pending", "Pending Warden Approval"}:
            raise HTTPException(status_code=409, detail="This outpass has already been reviewed.")

        departure = parse_aware_datetime(req.departure_at, "departure") if req.departure_at else parse_aware_datetime(outpass["departure_at"], "departure")
        returned = parse_aware_datetime(req.return_at, "return") if req.return_at else parse_aware_datetime(outpass["return_at"], "return")
        if decision == "approve":
            validate_pass_times(outpass["pass_type"], departure, returned, request.state.tenant["timezone"])
        status = "Approved" if decision == "approve" else "Rejected"
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        updated = db_exec(
            conn,
            """
            UPDATE leave_passes
            SET status = ?, departure_at = ?, return_at = ?, warden_id = ?,
                reviewed_at = ?, reviewed_by = ?, review_remark = ?
            WHERE college_id = ? AND pass_id = ? AND status IN ('Pending', 'Pending Warden Approval')
            """,
            (
                status,
                departure.isoformat(timespec="seconds"),
                returned.isoformat(timespec="seconds"),
                reviewer["user_id"],
                now,
                reviewer["user_id"],
                (req.remark or "").strip(),
                ACTIVE_COLLEGE_ID.get(),
                req.pass_id,
            ),
        )
        if updated.rowcount == 0:
            raise HTTPException(status_code=409, detail="This outpass has already been reviewed.")
        if decision == "approve" and outpass["parent_phone"] and outpass["parent_alert_status"] == "pending_review":
            notification_id = f"NT-{uuid.uuid4().hex[:16].upper()}"
            payload = {
                "to": outpass["parent_phone"],
                "message": (
                    f"Outpass for {outpass['student_id']} was approved. "
                    f"Departure: {departure.isoformat(timespec='minutes')}; "
                    f"return: {returned.isoformat(timespec='minutes')}."
                ),
                "pass_id": outpass["pass_id"],
            }
            db_exec(
                conn,
                """
                INSERT INTO notification_outbox
                    (college_id, notification_id, user_id, channel, payload_json, status, attempts,
                     last_error, created_at, updated_at)
                VALUES (?, ?, ?, 'whatsapp', ?, 'queued', 0, '', ?, ?)
                """,
                (
                    ACTIVE_COLLEGE_ID.get(),
                    notification_id,
                    outpass["student_id"],
                    json.dumps(payload),
                    now,
                    now,
                ),
            )
            db_exec(
                conn,
                "UPDATE leave_passes SET parent_alert_status = 'queued' WHERE college_id = ? AND pass_id = ?",
                (ACTIVE_COLLEGE_ID.get(), req.pass_id),
            )
        elif decision == "reject" and outpass["parent_phone"]:
            db_exec(
                conn,
                "UPDATE leave_passes SET parent_alert_status = 'not_sent' WHERE college_id = ? AND pass_id = ?",
                (ACTIVE_COLLEGE_ID.get(), req.pass_id),
            )
        conn.commit()
        updated = db_exec(conn, "SELECT * FROM leave_passes WHERE college_id = ? AND pass_id = ?", (ACTIVE_COLLEGE_ID.get(), req.pass_id)).fetchone()
        return {"success": True, "outpass": sanitized_pass(updated)}
    except DB_INTEGRITY_ERRORS as error:
        conn.rollback()
        raise HTTPException(status_code=409, detail="This outpass was already reviewed.") from error
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.get("/api/outpasses/{pass_id}/qr")
def get_outpass_qr(pass_id: str, request: Request):
    account = request.state.user
    if account["role"] != "Student":
        raise HTTPException(status_code=403, detail="Only the student who owns the pass can access its QR.")
    conn = get_conn()
    try:
        row = db_exec(conn, "SELECT * FROM leave_passes WHERE college_id = ? AND pass_id = ?", (ACTIVE_COLLEGE_ID.get(), pass_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Outpass not found.")
        if account["role"] == "Student" and row["student_id"].upper() != account["user_id"].upper():
            raise HTTPException(status_code=403, detail="This outpass belongs to another student.")
        if row["leave_type"]:
            raise HTTPException(status_code=410, detail="Digital leave passes use the live visual approval card, not a QR code.")
        if row["status"] != "Approved":
            raise HTTPException(status_code=409, detail="Only approved outpasses have a QR code.")
        now = datetime.now(timezone.utc)
        departure = parse_aware_datetime(row["departure_at"], "departure")
        returned = parse_aware_datetime(row["return_at"], "return")
        if now < departure or now > returned:
            raise HTTPException(status_code=403, detail="The pass QR is available only during its approved validity window.")
        return {"pass_id": row["pass_id"], "code": pass_qr_code(row["pass_id"], row["qr_secret"], now), "rotates_in_seconds": 30 - int(now.timestamp()) % 30}
    finally:
        conn.close()


@app.post("/api/outpasses/scan")
def scan_outpass(req: GateScanReq, request: Request):
    guard = request.state.user
    if guard.get("role") != "Gate Security":
        raise HTTPException(status_code=403, detail="Gate Security access is required.")
    direction = req.direction.strip().upper()
    if direction not in {"OUT", "RETURN"}:
        raise HTTPException(status_code=400, detail="Scan direction must be OUT or RETURN.")
    try:
        pass_id, _, _ = req.code.split(".", 2)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="This is not a valid outpass QR code.") from error
    conn = get_conn()
    try:
        suffix = " FOR UPDATE" if USE_POSTGRES else ""
        row = db_exec(conn, f"SELECT * FROM leave_passes WHERE college_id = ? AND pass_id = ?{suffix}", (ACTIVE_COLLEGE_ID.get(), pass_id)).fetchone()
        if not row or row["leave_type"] or row["status"] != "Approved" or not verify_pass_qr_code(row, req.code):
            raise HTTPException(status_code=403, detail="Outpass QR is invalid, expired, or not approved.")
        now = datetime.now(timezone.utc)
        if now < parse_aware_datetime(row["departure_at"], "departure") or now > parse_aware_datetime(row["return_at"], "return"):
            raise HTTPException(status_code=403, detail="This scan is outside the approved time window.")
        scans = db_exec(conn, "SELECT direction FROM pass_scans WHERE college_id = ? AND pass_id = ?", (ACTIVE_COLLEGE_ID.get(), pass_id)).fetchall()
        scanned_directions = {scan["direction"] for scan in scans}
        if direction == "OUT" and scanned_directions:
            raise HTTPException(status_code=409, detail="This pass has already been scanned out.")
        if direction == "RETURN" and "OUT" not in scanned_directions:
            raise HTTPException(status_code=409, detail="The student must be scanned out before returning.")
        if direction == "RETURN" and "RETURN" in scanned_directions:
            raise HTTPException(status_code=409, detail="This pass has already been scanned back in.")
        db_exec(
            conn,
            """
            INSERT INTO pass_scans (college_id, scan_id, pass_id, student_id, direction, scanned_by, scanned_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ACTIVE_COLLEGE_ID.get(),
                f"GS-{uuid.uuid4().hex[:16].upper()}",
                pass_id,
                row["student_id"],
                direction,
                guard["user_id"],
                now.isoformat(timespec="seconds"),
            ),
        )
        conn.commit()
        return {"success": True, "direction": direction, "student_id": row["student_id"], "scanned_at": now.isoformat(timespec="seconds")}
    except DB_INTEGRITY_ERRORS as error:
        conn.rollback()
        raise HTTPException(status_code=409, detail="This gate scan was already recorded.") from error
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def create_webauthn_challenge(conn, user_id: str, purpose: str, challenge: bytes):
    now = datetime.now(timezone.utc)
    db_exec(
        conn,
        "DELETE FROM webauthn_challenges WHERE college_id = ? AND UPPER(user_id) = ? AND expires_at <= ?",
        (ACTIVE_COLLEGE_ID.get(), user_id.upper(), now.isoformat(timespec="seconds")),
    )
    challenge_id = f"WC-{uuid.uuid4().hex[:16].upper()}"
    db_exec(
        conn,
        """
        INSERT INTO webauthn_challenges
            (college_id, challenge_id, user_id, challenge, purpose, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            ACTIVE_COLLEGE_ID.get(),
            challenge_id,
            user_id,
            bytes_to_base64url(challenge),
            purpose,
            (now + timedelta(minutes=5)).isoformat(timespec="seconds"),
        ),
    )
    return challenge_id


def student_biometric_record(conn, user_id: str, for_update: bool = False):
    suffix = " FOR UPDATE" if USE_POSTGRES and for_update else ""
    return db_exec(
        conn,
        f"""
        SELECT user_id, full_name, role, hostel_block, wing, room, phone,
               biometric_status, biometric_cred_id, device_hardware_id,
               device_token_hash, face_reference_encrypted, face_embedding_encrypted,
               device_public_key, face_enrolled_at,
               enroll_window_until
        FROM users
        WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'{suffix}
        """,
        (ACTIVE_COLLEGE_ID.get(), user_id.strip().upper()),
    ).fetchone()


def require_enrollment_window(student):
    if (
        student["biometric_status"] != "Enrollment Unlocked"
        or int(student["enroll_window_until"] or 0) < int(time.time())
    ):
        raise HTTPException(
            status_code=403,
            detail="Ask your Warden to unlock the 2-minute enrollment window first.",
        )


@app.get("/api/attendance/biometric-status")
def get_student_biometric_status(request: Request):
    account = request.state.user
    if account.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can view their biometric enrollment status.")
    conn = get_conn()
    try:
        student = student_biometric_record(conn, account["user_id"])
        if not student:
            raise HTTPException(status_code=404, detail="Student record not found.")
        return {
            "biometric_status": student["biometric_status"],
            "biometric_cred_id": student["biometric_cred_id"],
            "enroll_window_until": int(student["enroll_window_until"] or 0),
            "face_enrolled": bool(student["face_reference_encrypted"]),
            "embedding_enrolled": bool(student["face_embedding_encrypted"]),
        }
    finally:
        conn.close()


def _decode_face_image(image_base64: str):
    encoded_image = image_base64.strip()
    if encoded_image.startswith("data:"):
        header, separator, encoded_image = encoded_image.partition(",")
        if not separator or not header.startswith(("data:image/jpeg", "data:image/png", "data:image/webp")):
            raise HTTPException(status_code=400, detail="Provide a supported JPEG, PNG, or WebP face image.")
    try:
        image_bytes = base64.b64decode(encoded_image, validate=True)
    except (ValueError, base64.binascii.Error) as error:
        raise HTTPException(status_code=400, detail="The face image is not valid base64.") from error
    if not image_bytes or len(image_bytes) > 4 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Face images must be smaller than 4 MB.")
    try:
        import cv2
        import numpy as np
    except ImportError as error:
        raise HTTPException(status_code=503, detail="Server-side face verification dependencies are unavailable.") from error
    image_stream = BytesIO(image_bytes)
    try:
        image = cv2.imdecode(np.frombuffer(image_stream.getbuffer(), dtype=np.uint8), cv2.IMREAD_COLOR)
    except cv2.error as error:
        raise HTTPException(status_code=400, detail="The uploaded face image could not be decoded.") from error
    finally:
        image_stream.close()
    if image is None:
        raise HTTPException(status_code=400, detail="The uploaded face image could not be decoded.")
    height, width = image.shape[:2]
    if width < 160 or height < 160 or width > 4096 or height > 4096:
        raise HTTPException(status_code=400, detail="Face images must be between 160 and 4096 pixels per side.")
    return image


def _face_reference_cipher():
    key = FACE_ENCRYPTION_KEY
    if not key:
        key_material = hashlib.sha256(
            b"hms-face-reference-v1:" + AUTH_SECRET.encode("utf-8")
        ).digest()
        key = base64.urlsafe_b64encode(key_material).decode("ascii")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as error:
        raise HTTPException(status_code=503, detail="Face reference encryption is not configured correctly.") from error


def _encrypt_face_reference(image_base64: str) -> str:
    image = _decode_face_image(image_base64)
    try:
        import cv2
        import numpy as np
        try:
            success, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90])
        except cv2.error as error:
            raise HTTPException(status_code=400, detail="The face reference could not be normalized.") from error
        if not success:
            raise HTTPException(status_code=400, detail="The face reference could not be normalized.")
        encrypted = _face_reference_cipher().encrypt(np.asarray(encoded).tobytes())
        return encrypted.decode("ascii")
    finally:
        del image


def _embedding_cipher():
    return _face_reference_cipher()


def _compute_enrollment_embedding(image_base64: str) -> str:
    image = None
    embedding = None
    try:
        image = _decode_face_image(image_base64)
        from deepface import DeepFace
        result = DeepFace.represent(
            img_path=image,
            model_name="Facenet",
            enforce_detection=True,
            normalization="base",
        )
        candidate = result[0]["embedding"] if isinstance(result, list) else result["embedding"]
        import numpy as np
        vector = np.asarray(candidate, dtype=np.float32).reshape(-1)
        if vector.size != 128 or not np.isfinite(vector).all():
            raise HTTPException(status_code=400, detail="The enrollment model did not produce a valid 128D face vector.")
        norm = float(np.linalg.norm(vector))
        if not 0.9 <= norm <= 1.1:
            vector = vector / norm
        return _embedding_cipher().encrypt(vector.tobytes()).decode("ascii")
    except ImportError as error:
        raise HTTPException(status_code=503, detail="Enrollment face model dependencies are unavailable.") from error
    except (KeyError, TypeError, ValueError, ZeroDivisionError) as error:
        raise HTTPException(status_code=400, detail="A single usable face is required for enrollment.") from error
    finally:
        image = None
        embedding = None


def _verify_embedding(embedding, encrypted_reference: str) -> bool:
    reference_bytes = b""
    candidate = reference = None
    try:
        import numpy as np
        candidate = np.asarray(embedding, dtype=np.float32)
        if candidate.shape != (128,) or not np.isfinite(candidate).all():
            raise HTTPException(status_code=400, detail="Embedding must contain exactly 128 finite numbers.")
        candidate_norm = float(np.linalg.norm(candidate))
        if not 0.95 <= candidate_norm <= 1.05:
            raise HTTPException(status_code=400, detail="Embedding L2 norm is invalid.")
        reference_bytes = _embedding_cipher().decrypt(encrypted_reference.encode("ascii"))
        reference = np.frombuffer(reference_bytes, dtype=np.float32)
        if reference.shape != (128,) or not np.isfinite(reference).all():
            raise HTTPException(status_code=503, detail="The enrolled face vector is unavailable.")
        reference_norm = float(np.linalg.norm(reference))
        if reference_norm == 0:
            raise HTTPException(status_code=503, detail="The enrolled face vector is invalid.")
        distance = 1.0 - float(np.dot(candidate, reference) / (candidate_norm * reference_norm))
        return math.isfinite(distance) and distance <= 0.30
    except InvalidToken as error:
        raise HTTPException(status_code=503, detail="The enrolled face vector is unavailable.") from error
    finally:
        candidate = None
        reference = None
        reference_bytes = b""


def _verify_face_image(live_image_base64: str, encrypted_reference: str) -> bool:
    live_image = reference_image = None
    reference_bytes = b""
    try:
        live_image = _decode_face_image(live_image_base64)
        reference_bytes = _face_reference_cipher().decrypt(encrypted_reference.encode("ascii"))
        import cv2
        import numpy as np
        reference_image = cv2.imdecode(np.frombuffer(reference_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if reference_image is None:
            raise HTTPException(status_code=503, detail="The enrolled face reference could not be read.")
        from deepface import DeepFace
        result = DeepFace.verify(
            img1_path=live_image,
            img2_path=reference_image,
            model_name="Facenet",
            distance_metric="cosine",
            enforce_detection=True,
        )
        return bool(result.get("verified"))
    except InvalidToken as error:
        logger.exception("Could not decrypt a stored face reference.")
        raise HTTPException(status_code=503, detail="The enrolled face reference is unavailable.") from error
    except ImportError as error:
        raise HTTPException(status_code=503, detail="Server-side face verification dependencies are unavailable.") from error
    except ValueError:
        return False
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Server-side face verification failed.")
        raise HTTPException(status_code=503, detail="Server-side face verification is temporarily unavailable.") from error
    finally:
        live_image = None
        reference_image = None
        reference_bytes = b""


@app.post("/api/warden/unlock-biometric")
def unlock_student_biometric(req: BiometricUnlockReq, request: Request):
    warden = request.state.user
    if warden.get("role") != "Warden":
        raise HTTPException(status_code=403, detail="Only the student's Warden can unlock biometric enrollment.")
    student_id = req.student_id.strip().upper()
    if not student_id or len(student_id) > 64:
        raise HTTPException(status_code=400, detail="Enter a valid student account ID.")
    conn = get_conn()
    try:
        student = student_biometric_record(conn, student_id, for_update=True)
        if not student:
            raise HTTPException(status_code=404, detail="Student record not found.")
        if str(student["hostel_block"] or "").casefold() != str(warden.get("hostel_block") or "").casefold():
            raise HTTPException(status_code=403, detail="You can unlock enrollment only for students in your hostel.")
        until = int(time.time()) + 120
        if student["biometric_cred_id"]:
            db_exec(
                conn,
                "DELETE FROM webauthn_credentials "
                "WHERE college_id = ? AND credential_id = ? AND UPPER(user_id) = ?",
                (ACTIVE_COLLEGE_ID.get(), student["biometric_cred_id"], student_id),
            )
        db_exec(
            conn,
            """
            UPDATE users
            SET biometric_status = 'Enrollment Unlocked', biometric_cred_id = '',
                device_hardware_id = '', device_token_hash = '',
                face_reference_encrypted = '', face_embedding_encrypted = '',
                device_public_key = '', face_enrolled_at = '', enroll_window_until = ?
            WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'
            """,
            (until, ACTIVE_COLLEGE_ID.get(), student_id),
        )
        conn.commit()
        invalidate_user_cache(student_id)
        return {
            "success": True,
            "student_id": student_id,
            "biometric_status": "Enrollment Unlocked",
            "enroll_window_until": until,
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.post("/api/biometric/register")
def register_device_binding(req: DeviceBindingRegisterReq, request: Request):
    account = request.state.user
    if account.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can register a device binding.")
    if req.consent_confirmed is not True:
        raise HTTPException(status_code=400, detail="Confirm face verification consent before enrolling.")
    token = req.device_binding_token.strip().lower()
    if not re.fullmatch(r"[a-f0-9]{64}", token):
        raise HTTPException(status_code=400, detail="The device binding token must be a 256-bit hexadecimal token.")
    token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
    try:
        public_key = serialization.load_der_public_key(base64.b64decode(req.device_public_key))
    except (ValueError, TypeError, base64.binascii.Error) as error:
        raise HTTPException(status_code=400, detail="The device public key is invalid.") from error
    if not isinstance(public_key, ec.EllipticCurvePublicKey) or public_key.curve.name != "secp256r1":
        raise HTTPException(status_code=400, detail="Only a P-256 device public key is supported.")
    encrypted_reference = _encrypt_face_reference(req.reference_image_base64)
    encrypted_embedding = _compute_enrollment_embedding(req.reference_image_base64)
    req.reference_image_base64 = ""
    conn = get_conn()
    try:
        student = student_biometric_record(conn, account["user_id"], for_update=True)
        if not student:
            raise HTTPException(status_code=404, detail="Student record not found.")
        require_enrollment_window(student)
        db_exec(
            conn,
            """
            UPDATE users
            SET biometric_status = 'Locked', device_token_hash = ?,
                biometric_cred_id = '', device_hardware_id = '',
                face_reference_encrypted = ?, face_embedding_encrypted = ?,
                device_public_key = ?, face_enrolled_at = ?, enroll_window_until = 0
            WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'
              AND biometric_status = 'Enrollment Unlocked' AND enroll_window_until >= ?
            """,
            (
                token_hash,
                encrypted_reference,
                encrypted_embedding,
                req.device_public_key,
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
                ACTIVE_COLLEGE_ID.get(),
                account["user_id"].upper(),
                int(time.time()),
            ),
        )
        conn.commit()
        invalidate_user_cache(account["user_id"])
        return {
            "success": True,
            "biometric_status": "Locked",
            "enroll_window_until": 0,
            "device_binding_ready": True,
            "face_enrolled": True,
            "embedding_enrolled": True,
        }
    except DB_INTEGRITY_ERRORS as error:
        conn.rollback()
        raise HTTPException(status_code=409, detail="This device binding is already registered to another student.") from error
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.delete("/api/biometric/revoke-and-delete")
def revoke_and_delete_biometric(request: Request):
    account = request.state.user
    if account.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can withdraw their biometric consent.")
    conn = get_conn()
    try:
        student = student_biometric_record(conn, account["user_id"], for_update=True)
        if not student:
            raise HTTPException(status_code=404, detail="Student record not found.")
        deleted_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        db_exec(
            conn,
            """
            UPDATE users
            SET biometric_status = 'Not Enrolled',
                biometric_cred_id = '', device_hardware_id = '',
                device_token_hash = '', face_reference_encrypted = '',
                face_embedding_encrypted = '', device_public_key = '',
                face_enrolled_at = '', enroll_window_until = 0,
                consent_withdrawn_at = ?
            WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'
            """,
            (deleted_at, ACTIVE_COLLEGE_ID.get(), account["user_id"].upper()),
        )
        conn.commit()
        invalidate_user_cache(account["user_id"])
        return {"success": True, "biometric_status": "Not Enrolled", "consent_withdrawn_at": deleted_at}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.post("/api/attendance/enroll-biometric/options")
def biometric_enrollment_options(request: Request):
    account = request.state.user
    if account.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can enroll a device passkey.")
    origin, rp_id = expected_webauthn_origin(request)
    del origin
    conn = get_conn()
    try:
        student = student_biometric_record(conn, account["user_id"], for_update=True)
        if not student:
            raise HTTPException(status_code=404, detail="Student record not found.")
        require_enrollment_window(student)
        options = generate_registration_options(
            rp_id=rp_id,
            rp_name=request.state.tenant["college_name"],
            user_name=account.get("email") or account["user_id"],
            user_id=hashlib.sha256(
                f"{request.state.college_id}:{account['user_id'].upper()}".encode()
            ).digest(),
            user_display_name=account.get("full_name") or account["user_id"],
            authenticator_selection=AuthenticatorSelectionCriteria(
                authenticator_attachment=AuthenticatorAttachment.PLATFORM,
                resident_key=ResidentKeyRequirement.PREFERRED,
                user_verification=UserVerificationRequirement.REQUIRED,
            ),
        )
        challenge_id = create_webauthn_challenge(
            conn, account["user_id"], "biometric_enrollment", options.challenge
        )
        conn.commit()
        return {
            "challenge_id": challenge_id,
            "options": json.loads(options_to_json(options)),
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.post("/api/attendance/enroll-biometric")
def enroll_student_biometric(req: BiometricEnrollReq, request: Request):
    account = request.state.user
    if account.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can enroll a device passkey.")
    origin, rp_id = expected_webauthn_origin(request)
    hardware_id = req.device_hardware_id.strip()
    if not re.fullmatch(r"[A-Za-z0-9._:-]{16,128}", hardware_id):
        raise HTTPException(status_code=400, detail="This browser has an invalid device binding. Refresh and try again.")
    conn = get_conn()
    try:
        student = student_biometric_record(conn, account["user_id"], for_update=True)
        if not student:
            raise HTTPException(status_code=404, detail="Student record not found.")
        require_enrollment_window(student)
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        challenge = db_exec(
            conn,
            """
            SELECT * FROM webauthn_challenges
            WHERE college_id = ? AND challenge_id = ? AND UPPER(user_id) = ?
              AND purpose = 'biometric_enrollment' AND expires_at > ?
            """,
            (ACTIVE_COLLEGE_ID.get(), req.challenge_id, account["user_id"].upper(), now),
        ).fetchone()
        if not challenge:
            raise HTTPException(status_code=400, detail="Passkey enrollment challenge is missing or expired. Ask your Warden to unlock enrollment again.")
        try:
            verified = verify_registration_response(
                credential=req.credential,
                expected_challenge=base64url_to_bytes(challenge["challenge"]),
                expected_rp_id=rp_id,
                expected_origin=origin,
                require_user_verification=True,
            )
        except (WebAuthnException, ValueError, TypeError) as error:
            raise HTTPException(status_code=400, detail="Device passkey enrollment could not be verified.") from error
        if not verified.user_verified:
            raise HTTPException(status_code=403, detail="Your device did not verify your identity.")
        credential_id = bytes_to_base64url(verified.credential_id)
        if req.biometric_cred_id and req.biometric_cred_id != credential_id:
            raise HTTPException(status_code=400, detail="The submitted credential does not match the verified device passkey.")
        existing = db_exec(
            conn,
            "SELECT user_id FROM webauthn_credentials WHERE college_id = ? AND credential_id = ?",
            (ACTIVE_COLLEGE_ID.get(), credential_id),
        ).fetchone()
        if existing and existing["user_id"].upper() != account["user_id"].upper():
            raise HTTPException(status_code=409, detail="This device passkey is already assigned to another account.")
        transports = req.credential.get("response", {}).get("transports", [])
        transports = [item for item in transports if item in {"ble", "internal", "nfc", "usb", "hybrid"}]
        db_exec(
            conn,
            """
            INSERT INTO webauthn_credentials
                (college_id, credential_id, user_id, public_key, sign_count, transports, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (college_id, credential_id) DO UPDATE SET
                public_key = excluded.public_key,
                sign_count = excluded.sign_count,
                transports = excluded.transports
            """,
            (
                ACTIVE_COLLEGE_ID.get(),
                credential_id,
                account["user_id"],
                bytes_to_base64url(verified.credential_public_key),
                verified.sign_count,
                json.dumps(transports),
                now,
            ),
        )
        updated = db_exec(
            conn,
            """
            UPDATE users
            SET biometric_status = 'Locked', biometric_cred_id = ?,
                device_hardware_id = ?, enroll_window_until = 0
            WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'
              AND biometric_status = 'Enrollment Unlocked' AND enroll_window_until >= ?
            """,
            (credential_id, hardware_id, ACTIVE_COLLEGE_ID.get(), account["user_id"].upper(), int(time.time())),
        )
        if updated.rowcount == 0:
            raise HTTPException(status_code=403, detail="Enrollment window expired. Ask your Warden to unlock it again.")
        db_exec(
            conn,
            "DELETE FROM webauthn_challenges WHERE college_id = ? AND challenge_id = ?",
            (ACTIVE_COLLEGE_ID.get(), req.challenge_id),
        )
        conn.commit()
        invalidate_user_cache(account["user_id"])
        return {
            "success": True,
            "biometric_status": "Locked",
            "biometric_cred_id": credential_id,
            "enroll_window_until": 0,
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def check_warden_hostel(account, hostel_block: str):
    assigned_hostel = str(account.get("hostel_block") or "")
    if account["role"] == "Warden" and assigned_hostel.casefold() != hostel_block.casefold():
        raise HTTPException(status_code=403, detail="You can manage attendance only for your assigned hostel.")


def attendance_window_date(hostel, timezone_name: str, now: Optional[datetime] = None) -> str:
    zone = ZoneInfo(timezone_name)
    local_now = (now or datetime.now(timezone.utc)).astimezone(zone)
    start_time = parse_clock_time(hostel["attendance_start_time"], "attendance start time")
    end_time = parse_clock_time(hostel["attendance_end_time"], "attendance end time")
    if start_time == end_time:
        raise HTTPException(status_code=409, detail="The attendance time window is not configured correctly.")
    current_time = local_now.time().replace(tzinfo=None)
    overnight = end_time <= start_time
    if overnight:
        within_window = current_time >= start_time or current_time < end_time
        window_date = local_now.date() if current_time >= start_time else local_now.date() - timedelta(days=1)
    else:
        within_window = start_time <= current_time < end_time
        window_date = local_now.date()
    if not within_window:
        raise HTTPException(
            status_code=403,
            detail=f"Attendance can only be marked between {start_time.strftime('%H:%M')} and {end_time.strftime('%H:%M')} college-local time.",
        )
    return window_date.isoformat()


def verify_attendance_beacon(student, req, hostel, _request=None):
    del _request
    if not -127 <= req.rssi <= 0:
        raise HTTPException(status_code=400, detail="Beacon RSSI must be between -127 and 0 dBm.")
    if str(student["hostel_block"] or "").casefold() == "day scholar":
        raise HTTPException(status_code=403, detail="Beacon attendance is available only to hostel residents.")
    if str(student["wing"] or "") == "":
        raise HTTPException(status_code=409, detail="Your Warden must assign your hostel wing before attendance.")
    if student["biometric_status"] != "Locked":
        raise HTTPException(status_code=403, detail="Ask your Warden to unlock and complete device enrollment first.")
    if (
        not student["biometric_cred_id"]
        or req.biometric_cred_id != student["biometric_cred_id"]
        or not student["device_hardware_id"]
        or req.device_hardware_id != student["device_hardware_id"]
    ):
        raise HTTPException(
            status_code=403,
            detail="Hardware or Fingerprint mismatch! Device is locked to your registered fingerprint",
        )
    wing_beacons = json.loads(hostel["wing_beacons_json"] or "{}")
    expected_beacon = wing_beacons.get(student["wing"])
    if not expected_beacon:
        raise HTTPException(status_code=409, detail=f"Your Warden has not configured the {student['wing']} beacon yet.")
    if req.wing_beacon_id != expected_beacon:
        raise HTTPException(status_code=403, detail="The detected beacon does not match your assigned hostel wing.")
    if req.simulated and not bool(hostel.get("attendance_test_mode")):
        raise HTTPException(status_code=403, detail="Simulated BLE attendance is disabled by your Warden.")


def verify_device_binding(student, device_binding_token: str):
    token = (device_binding_token or "").strip().lower()
    if not re.fullmatch(r"[a-f0-9]{64}", token):
        raise HTTPException(status_code=403, detail="This device has no valid enrolled binding. Ask your Warden to unlock enrollment.")
    token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
    if (
        student["biometric_status"] != "Locked"
        or not student["device_token_hash"]
        or not hmac.compare_digest(token_hash, student["device_token_hash"])
    ):
        raise HTTPException(status_code=403, detail="Device binding does not match the Warden-enrolled device.")


def verify_device_beacon(student, req, hostel):
    if len(req.rssi_samples) < 3 or any(not -127 <= sample <= 0 for sample in req.rssi_samples):
        raise HTTPException(status_code=400, detail="At least three valid beacon RSSI samples are required.")
    if any(sample > -40 or sample < -90 for sample in req.rssi_samples):
        raise HTTPException(status_code=403, detail="Beacon RSSI samples are outside the trusted proximity range.")
    if len(set(req.rssi_samples)) == 1:
        raise HTTPException(status_code=403, detail="Beacon samples are too static to verify a live advertisement.")
    if not -127 <= req.rssi <= 0:
        raise HTTPException(status_code=400, detail="Beacon RSSI must be between -127 and 0 dBm.")
    if req.rssi <= -80:
        raise HTTPException(status_code=403, detail="The beacon signal is too weak for attendance verification.")
    if str(student["hostel_block"] or "").casefold() == "day scholar":
        raise HTTPException(status_code=403, detail="Beacon attendance is available only to hostel residents.")
    if not student["wing"]:
        raise HTTPException(status_code=409, detail="Your Warden must assign your hostel wing before attendance.")
    verify_device_binding(student, req.device_binding_token)
    expected_beacon = json.loads(hostel["wing_beacons_json"] or "{}").get(student["wing"])
    if not expected_beacon:
        raise HTTPException(status_code=409, detail=f"Your Warden has not configured the {student['wing']} beacon yet.")
    if req.wing_beacon_id != expected_beacon:
        raise HTTPException(status_code=403, detail="The detected beacon does not match your assigned hostel wing.")
    if not re.fullmatch(r"HMS-[A-Za-z0-9_-]+-[A-Fa-f0-9]{8}", req.wing_beacon_id):
        raise HTTPException(status_code=403, detail="The beacon identity is not a valid HMS beacon.")
    wing_id = req.wing_beacon_id.split("-", 2)[1]
    secret = BEACON_HMAC_SECRETS.get(wing_id)
    if not isinstance(secret, str) or not secret:
        raise HTTPException(status_code=403, detail="The beacon is not registered for this wing.")
    valid_name = any(hmac.compare_digest(
        req.wing_beacon_id.rsplit("-", 1)[-1].lower(),
        hmac.new(secret.encode("utf-8"), f"{wing_id}:{slot}".encode("utf-8"), hashlib.sha256).hexdigest()[:8].lower(),
    ) for slot in (int(time.time() // 600) - 1, int(time.time() // 600), int(time.time() // 600) + 1))
    payload = req.raw_rotating_payload_hex.strip().lower()
    if payload and (len(payload) not in (8, 16) or not re.fullmatch(r"[0-9a-f]+", payload)):
        raise HTTPException(status_code=400, detail="The rotating beacon payload must be 4 or 8 bytes of hexadecimal data.")
    valid_payload = not payload or any(hmac.compare_digest(
        payload,
        hmac.new(secret.encode("utf-8"), str(slot).encode("ascii"), hashlib.sha256).hexdigest()[:len(payload)],
    ) for slot in (int(time.time() // 60) - 1, int(time.time() // 60), int(time.time() // 60) + 1))
    if not valid_name or not valid_payload:
        raise HTTPException(status_code=403, detail="The beacon signature is invalid or expired.")
    if req.simulated:
        conn = get_conn()
        try:
            override = db_fetchone(
                conn,
                """
                SELECT 1 FROM warden_test_overrides
                WHERE college_id = ? AND UPPER(student_id) = ? AND LOWER(wing) = LOWER(?)
                  AND expires_at > ?
                """,
                (ACTIVE_COLLEGE_ID.get(), student["user_id"].upper(), student["wing"],
                 datetime.now(timezone.utc).isoformat()),
            )
        finally:
            conn.close()
        if not override:
            raise HTTPException(status_code=403, detail="Test mode requires an active Warden override for this student.")


def verify_device_signature(student, req):
    if not student["device_public_key"]:
        raise HTTPException(status_code=401, detail="This device has no registered hardware signing key.")
    if abs(int(time.time()) - req.signed_timestamp) > 30:
        raise HTTPException(status_code=401, detail="The device attendance signature has expired.")
    canonical = json.dumps({
        "student_id": student["user_id"].upper(),
        "timestamp": req.signed_timestamp,
        "challenge_nonce": req.challenge_nonce,
        "beacon_payload": req.raw_rotating_payload_hex.lower(),
        "embedding": req.embedding,
    }, sort_keys=True, separators=(",", ":"))
    try:
        public_key = serialization.load_der_public_key(base64.b64decode(student["device_public_key"]))
        signature = base64.b64decode(req.signature, validate=True)
        public_key.verify(signature, canonical.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
    except (ValueError, TypeError, base64.binascii.Error, InvalidSignature) as error:
        raise HTTPException(status_code=401, detail="The device attendance signature is invalid.") from error


def attendance_beacon_challenge_purpose(student, req, attendance_date: str) -> str:
    challenge_context = {
        "college_id": ACTIVE_COLLEGE_ID.get(),
        "student_id": student["user_id"].upper(),
        "date": attendance_date,
        "biometric_cred_id": req.biometric_cred_id,
        "device_hardware_id": req.device_hardware_id,
        "wing_beacon_id": req.wing_beacon_id,
        "rssi": req.rssi,
        "simulated": req.simulated,
    }
    digest = hashlib.sha256(
        json.dumps(challenge_context, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return f"beacon-attendance:{attendance_date}:{digest}"


@app.post("/api/attendance/mark/options")
def attendance_beacon_mark_options(req: AttendanceBeaconOptionsReq, request: Request):
    del req, request
    raise HTTPException(status_code=410, detail="Passkey attendance is disabled. Use server-side face verification.")


@app.get("/api/attendance/challenge")
def attendance_challenge(request: Request):
    account = request.state.user
    if account.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can request an attendance challenge.")
    nonce = secrets.token_urlsafe(32)
    colors = [random.choice(["#00FFFF", "#FFBF00", "#FF00FF", "#00FF66"]), random.choice(["#FFBF00", "#00FFFF", "#3366FF", "#FF3366"])]
    while colors[1] == colors[0]:
        colors[1] = random.choice(["#00FFFF", "#FFBF00", "#FF00FF", "#00FF66", "#3366FF", "#FF3366"])
    gesture = random.choice(["TILT_LEFT", "TILT_RIGHT", "NOD"])
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=30)
    conn = get_conn()
    try:
        db_exec(conn, "DELETE FROM attendance_challenges WHERE college_id = ? AND (expires_at <= ? OR consumed_at <> '')",
                (ACTIVE_COLLEGE_ID.get(), datetime.now(timezone.utc).isoformat()))
        db_exec(conn, """
            INSERT INTO attendance_challenges
                (college_id, nonce, student_id, colors_json, gesture, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (ACTIVE_COLLEGE_ID.get(), nonce, account["user_id"].upper(), json.dumps(colors),
              gesture, expires_at.isoformat(timespec="seconds")))
        conn.commit()
        return {"challenge_nonce": nonce, "colors": colors, "gesture": gesture, "expires_at": expires_at.isoformat()}
    finally:
        conn.close()


@app.post("/api/attendance/mark")
def mark_beacon_attendance(req: DeviceBeaconMarkReq, request: Request):
    del req, request
    raise HTTPException(
        status_code=410,
        detail="Client-only attendance checks are disabled. Use server-side face verification.",
    )


@app.post("/api/attendance/verify-identity")
def verify_identity_and_mark_attendance(req: DeviceBeaconMarkReq, request: Request):
    account = request.state.user
    if account.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can mark attendance.")
    conn = get_conn()
    try:
        student = student_biometric_record(conn, account["user_id"], for_update=True)
        if not student:
            raise HTTPException(status_code=404, detail="Student record not found.")
        hostel = attendance_config_for_hostel(student["hostel_block"] or "")
        if not hostel:
            raise HTTPException(status_code=404, detail="Your hostel does not have attendance settings.")
        verify_device_beacon(student, req, hostel)
        if not student["face_embedding_encrypted"]:
            raise HTTPException(status_code=403, detail="Enroll face verification during the Warden-authorized setup window.")
        challenge = db_fetchone(
            conn,
            """SELECT colors_json, gesture, expires_at FROM attendance_challenges
               WHERE college_id = ? AND nonce = ? AND UPPER(student_id) = ?
                 AND consumed_at = ''""",
            (ACTIVE_COLLEGE_ID.get(), req.challenge_nonce, student["user_id"].upper()),
        )
        if not challenge or datetime.fromisoformat(challenge["expires_at"]) <= datetime.now(timezone.utc):
            raise HTTPException(status_code=403, detail="The attendance liveness challenge is missing or expired.")
        if req.head_gesture != challenge["gesture"] or req.yaw_delta < 0.08:
            raise HTTPException(status_code=401, detail="The required head gesture was not completed.")
        reflection_samples = req.rgb_reflection_samples
        if (
            len(reflection_samples) != 2
            or any(len(sample) != 3 or any(not math.isfinite(value) for value in sample) for sample in reflection_samples)
            or not math.isfinite(req.rgb_reflection_delta)
            or req.rgb_reflection_delta < 0.08
        ):
            raise HTTPException(status_code=401, detail="The screen-flash reflection could not be verified.")
        expected_colors = json.loads(challenge["colors_json"])
        expected_delta = []
        for color in expected_colors:
            rgb = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
            total = sum(rgb) or 1
            expected_delta.append([channel / total for channel in rgb])
        expected_vector = [expected_delta[0][index] - expected_delta[1][index] for index in range(3)]
        observed_vector = [reflection_samples[0][index] - reflection_samples[1][index] for index in range(3)]
        if sum(left * right for left, right in zip(expected_vector, observed_vector)) <= 0:
            raise HTTPException(status_code=401, detail="The screen-flash reflection does not match the challenge colors.")
        if min(req.blink_ear_curve) >= 0.20:
            raise HTTPException(status_code=401, detail="A complete blink was not detected.")
        verify_device_signature(student, req)
        attendance_date = attendance_window_date(hostel, request.state.tenant["timezone"])
        now_utc = datetime.now(timezone.utc).isoformat(timespec="seconds")
        session = db_exec(
            conn,
            """
            SELECT session_id FROM attendance_sessions
            WHERE college_id = ? AND LOWER(hostel_block) = LOWER(?)
              AND session_date = ? AND status = 'Open' AND closes_at > ?
            ORDER BY started_at DESC LIMIT 1
            """,
            (ACTIVE_COLLEGE_ID.get(), student["hostel_block"], attendance_date, now_utc),
        ).fetchone()
        if not session:
            raise HTTPException(status_code=409, detail="Your Warden has not started an active roll call for this hostel.")
        identity_verified = _verify_embedding(req.embedding, student["face_embedding_encrypted"])
        if not identity_verified:
            raise HTTPException(
                status_code=401,
                detail="Biometric 3D Mesh Mismatch: Face does not match enrolled resident",
            )
        local_now = datetime.now(timezone.utc).astimezone(ZoneInfo(request.state.tenant["timezone"]))
        log_id = f"AL-{uuid.uuid4().hex[:16].upper()}"
        db_exec(
            conn,
            """
            INSERT INTO attendance_records
                (college_id, record_id, session_id, student_id, status, method, marked_at)
            VALUES (?, ?, ?, ?, 'Present', 'BLE + server-side Facenet verification', ?)
            """,
            (
                ACTIVE_COLLEGE_ID.get(),
                f"AR-{uuid.uuid4().hex[:16].upper()}",
                session["session_id"],
                student["user_id"],
                local_now.isoformat(timespec="seconds"),
            ),
        )
        db_exec(
            conn,
            """
            INSERT INTO attendance_logs
                (college_id, log_id, student_id, student_name, hostel_block, wing, room,
                 date, time, status, wing_beacon_id, rssi, verified_method)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Present (Server Face Verification + Beacon)', ?, ?, 'device_token_ble_facenet_server')
            """,
            (
                ACTIVE_COLLEGE_ID.get(),
                log_id,
                student["user_id"],
                student["full_name"] or student["user_id"],
                student["hostel_block"],
                student["wing"] or "",
                student["room"] or "",
                attendance_date,
                local_now.strftime("%H:%M:%S"),
                req.wing_beacon_id,
                req.rssi,
            ),
        )
        conn.commit()
        db_exec(conn, "UPDATE attendance_challenges SET consumed_at = ? WHERE college_id = ? AND nonce = ?",
                (now_utc, ACTIVE_COLLEGE_ID.get(), req.challenge_nonce))
        conn.commit()
        return {
            "success": True,
            "attendance_log": {
                "college_id": ACTIVE_COLLEGE_ID.get(),
                "log_id": log_id,
                "student_id": student["user_id"],
                "student_name": student["full_name"] or student["user_id"],
                "hostel_block": student["hostel_block"],
                "wing": student["wing"] or "",
                "room": student["room"] or "",
                "date": attendance_date,
                "time": local_now.strftime("%H:%M:%S"),
                "status": "Present (Server Face Verification + Beacon)",
                "wing_beacon_id": req.wing_beacon_id,
                "rssi": req.rssi,
                "verified_method": "device_token_ble_facenet_server",
            },
        }
    except DB_INTEGRITY_ERRORS as error:
        conn.rollback()
        raise HTTPException(status_code=409, detail="Today's attendance has already been recorded.") from error
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.post("/api/attendance/passkeys/register/options")
def passkey_registration_options(request: Request):
    student = request.state.user
    if student.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can register attendance passkeys.")
    origin, rp_id = expected_webauthn_origin(request)
    del origin
    conn = get_conn()
    try:
        options = generate_registration_options(
            rp_id=rp_id,
            rp_name=request.state.tenant["college_name"],
            user_name=student.get("email") or student["user_id"],
            user_id=hashlib.sha256(
                f"{request.state.college_id}:{student['user_id'].upper()}".encode()
            ).digest(),
            user_display_name=student.get("full_name") or student["user_id"],
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.PREFERRED,
                user_verification=UserVerificationRequirement.REQUIRED,
            ),
        )
        challenge_id = create_webauthn_challenge(conn, student["user_id"], "registration", options.challenge)
        conn.commit()
        return {"challenge_id": challenge_id, "options": json.loads(options_to_json(options))}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.post("/api/attendance/passkeys/register/verify")
def passkey_registration_verify(req: WebAuthnChallengeReq, request: Request):
    student = request.state.user
    if student.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can register attendance passkeys.")
    origin, rp_id = expected_webauthn_origin(request)
    conn = get_conn()
    try:
        challenge = db_exec(
            conn,
            """
            SELECT * FROM webauthn_challenges
            WHERE college_id = ? AND challenge_id = ? AND UPPER(user_id) = ? AND purpose = 'registration' AND expires_at > ?
            """,
            (
                ACTIVE_COLLEGE_ID.get(),
                req.challenge_id,
                student["user_id"].upper(),
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        ).fetchone()
        if not challenge:
            raise HTTPException(status_code=400, detail="Passkey challenge is missing or expired. Please try again.")
        try:
            verified = verify_registration_response(
                credential=req.credential,
                expected_challenge=base64url_to_bytes(challenge["challenge"]),
                expected_rp_id=rp_id,
                expected_origin=origin,
                require_user_verification=True,
            )
        except (WebAuthnException, ValueError, TypeError) as error:
            raise HTTPException(status_code=400, detail="Passkey registration could not be verified.") from error
        if not verified.user_verified:
            raise HTTPException(status_code=403, detail="Your device did not verify your identity.")
        credential_id = bytes_to_base64url(verified.credential_id)
        existing = db_exec(
            conn,
            "SELECT user_id FROM webauthn_credentials WHERE college_id = ? AND credential_id = ?",
            (ACTIVE_COLLEGE_ID.get(), credential_id),
        ).fetchone()
        if existing and existing["user_id"].upper() != student["user_id"].upper():
            raise HTTPException(status_code=409, detail="This passkey is already registered to another account.")
        transports = req.credential.get("response", {}).get("transports", [])
        transports = [item for item in transports if item in {"ble", "internal", "nfc", "usb", "hybrid"}]
        db_exec(
            conn,
            """
            INSERT INTO webauthn_credentials
                (college_id, credential_id, user_id, public_key, sign_count, transports, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (college_id, credential_id) DO UPDATE SET
                public_key = excluded.public_key,
                sign_count = excluded.sign_count,
                transports = excluded.transports
            """,
            (
                ACTIVE_COLLEGE_ID.get(),
                credential_id,
                student["user_id"],
                bytes_to_base64url(verified.credential_public_key),
                verified.sign_count,
                json.dumps(transports),
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        )
        db_exec(conn, "DELETE FROM webauthn_challenges WHERE college_id = ? AND challenge_id = ?", (ACTIVE_COLLEGE_ID.get(), req.challenge_id))
        conn.commit()
        return {"success": True, "credential_id": credential_id}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.get("/api/attendance/passkeys")
def list_attendance_passkeys(request: Request):
    student = request.state.user
    if student.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can manage attendance passkeys.")
    conn = get_conn()
    try:
        rows = db_exec(
            conn,
            """
            SELECT credential_id, transports, created_at
            FROM webauthn_credentials WHERE college_id = ? AND UPPER(user_id) = ?
            ORDER BY created_at DESC
            """,
            (ACTIVE_COLLEGE_ID.get(), student["user_id"].upper()),
        ).fetchall()
        return {"passkeys": [dict(row) for row in rows]}
    finally:
        conn.close()


@app.delete("/api/attendance/passkeys/{credential_id}")
def delete_attendance_passkey(credential_id: str, request: Request):
    student = request.state.user
    if student.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can manage attendance passkeys.")
    conn = get_conn()
    try:
        result = db_exec(
            conn,
            "DELETE FROM webauthn_credentials WHERE college_id = ? AND credential_id = ? AND UPPER(user_id) = ?",
            (ACTIVE_COLLEGE_ID.get(), credential_id, student["user_id"].upper()),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Passkey not found.")
        conn.commit()
        return {"success": True}
    finally:
        conn.close()


@app.post("/api/attendance/sessions")
def start_attendance_session(req: AttendanceStartReq, request: Request):
    warden = request.state.user
    if warden.get("role") not in {"Warden", "Dean"}:
        raise HTTPException(status_code=403, detail="Warden or Dean access is required.")
    hostel_block = (req.hostel_block or warden.get("hostel_block") or "").strip()
    if not hostel_block or hostel_block.casefold() == "all":
        raise HTTPException(status_code=400, detail="Choose a specific hostel for roll call.")
    check_warden_hostel(warden, hostel_block)
    zone = ZoneInfo(request.state.tenant["timezone"])
    now = datetime.now(timezone.utc)
    local_now = now.astimezone(zone)

    conn = get_conn()
    try:
        hostel = db_exec(
            conn,
            """
            SELECT name, attendance_start_time, attendance_end_time, geofence_latitude,
                   geofence_longitude, geofence_radius_m, geofence_max_accuracy_m
            FROM hostels
            WHERE college_id = ? AND enabled = 1 AND LOWER(name) = LOWER(?)
            """,
            (ACTIVE_COLLEGE_ID.get(), hostel_block),
        ).fetchone()
        if not hostel:
            raise HTTPException(status_code=404, detail="This hostel is not configured for the college.")
        start_time = parse_clock_time(hostel["attendance_start_time"], "attendance start time")
        end_time = parse_clock_time(hostel["attendance_end_time"], "attendance end time")
        if start_time == end_time:
            raise HTTPException(status_code=409, detail="The attendance time window is not configured correctly.")
        current_time = local_now.time().replace(tzinfo=None)
        overnight = end_time <= start_time
        if overnight:
            within_window = current_time >= start_time or current_time < end_time
            window_date = local_now.date() if current_time >= start_time else local_now.date() - timedelta(days=1)
            close_date = window_date + timedelta(days=1)
        else:
            within_window = start_time <= current_time < end_time
            window_date = local_now.date()
            close_date = window_date
        if not within_window:
            raise HTTPException(
                status_code=403,
                detail=f"Attendance can only be started between {start_time.strftime('%H:%M')} and {end_time.strftime('%H:%M')} college-local time.",
            )
        close_at = datetime.combine(close_date, end_time, tzinfo=zone).astimezone(timezone.utc)
        students = db_exec(
            conn,
            "SELECT COUNT(*) AS count FROM users WHERE college_id = ? AND role = 'Student' AND LOWER(hostel_block) = LOWER(?)",
            (ACTIVE_COLLEGE_ID.get(), hostel["name"]),
        ).fetchone()
        if not students or students["count"] == 0:
            raise HTTPException(status_code=409, detail="There are no student residents assigned to this hostel.")
        session_id = f"AS-{uuid.uuid4().hex[:16].upper()}"
        normalized_hostel = hostel["name"].strip().casefold()
        local_date = window_date.isoformat()
        db_exec(
            conn,
            """
            INSERT INTO attendance_sessions
                (college_id, session_id, hostel_block, hostel_key, session_date, started_by,
                 started_at, closes_at, session_secret, status, geofence_latitude,
                 geofence_longitude, geofence_radius_m, geofence_max_accuracy_m)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?, ?, ?)
            """,
            (
                ACTIVE_COLLEGE_ID.get(),
                session_id,
                hostel["name"],
                normalized_hostel,
                local_date,
                warden["user_id"],
                now.isoformat(timespec="microseconds"),
                close_at.isoformat(timespec="seconds"),
                secrets.token_urlsafe(32),
                hostel["geofence_latitude"],
                hostel["geofence_longitude"],
                hostel["geofence_radius_m"],
                hostel["geofence_max_accuracy_m"],
            ),
        )
        conn.commit()
        row = db_exec(conn, "SELECT * FROM attendance_sessions WHERE college_id = ? AND session_id = ?", (ACTIVE_COLLEGE_ID.get(), session_id)).fetchone()
        return {"success": True, "session": sanitized_attendance_session(row), "resident_count": students["count"]}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.get("/api/attendance/sessions")
def list_attendance_sessions(request: Request, hostel_block: Optional[str] = Query(default=None)):
    account = request.state.user
    if account.get("role") not in {"Warden", "Dean"}:
        raise HTTPException(status_code=403, detail="Warden or Dean access is required.")
    selected_hostel = (hostel_block or account.get("hostel_block") or "").strip()
    if account["role"] == "Warden":
        selected_hostel = account.get("hostel_block", "")
    close_expired_attendance_sessions()
    conn = get_conn()
    try:
        if selected_hostel and selected_hostel.casefold() != "all":
            rows = db_exec(
                conn,
                "SELECT * FROM attendance_sessions WHERE college_id = ? AND LOWER(hostel_block) = LOWER(?) ORDER BY started_at DESC LIMIT 50",
                (ACTIVE_COLLEGE_ID.get(), selected_hostel),
            ).fetchall()
        else:
            rows = db_exec(conn, "SELECT * FROM attendance_sessions WHERE college_id = ? ORDER BY started_at DESC LIMIT 100", (ACTIVE_COLLEGE_ID.get(),)).fetchall()
        return {"sessions": [sanitized_attendance_session(row) for row in rows]}
    finally:
        conn.close()


@app.get("/api/attendance/sessions/{session_id}/qr")
def get_attendance_session_qr(session_id: str, request: Request):
    warden = request.state.user
    if warden.get("role") not in {"Warden", "Dean"}:
        raise HTTPException(status_code=403, detail="Warden or Dean access is required.")
    conn = get_conn()
    try:
        row = db_exec(conn, "SELECT * FROM attendance_sessions WHERE college_id = ? AND session_id = ?", (ACTIVE_COLLEGE_ID.get(), session_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Roll call session not found.")
        check_warden_hostel(warden, row["hostel_block"])
        if row["status"] != "Open":
            raise HTTPException(status_code=409, detail="This roll call is closed.")
        now = datetime.now(timezone.utc)
        code = attendance_qr_code(session_id, row["session_secret"], now)
        origin, _ = expected_webauthn_origin(request)
        return {
            "code": code,
            "url": f"{origin}/?attendance={code}",
            "rotates_in_seconds": 30 - int(now.timestamp()) % 30,
            "closes_at": row["closes_at"],
        }
    finally:
        conn.close()


@app.get("/api/attendance/sessions/{session_id}")
def get_attendance_session(session_id: str, request: Request):
    warden = request.state.user
    if warden.get("role") not in {"Warden", "Dean"}:
        raise HTTPException(status_code=403, detail="Warden or Dean access is required.")
    close_expired_attendance_sessions()
    conn = get_conn()
    try:
        session = db_exec(conn, "SELECT * FROM attendance_sessions WHERE college_id = ? AND session_id = ?", (ACTIVE_COLLEGE_ID.get(), session_id)).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Roll call session not found.")
        check_warden_hostel(warden, session["hostel_block"])
        rows = db_exec(
            conn,
            """
            SELECT ar.student_id, u.full_name, ar.status, ar.method, ar.marked_at, ar.exception_reason
            FROM attendance_records ar
            LEFT JOIN users u ON u.college_id = ar.college_id AND UPPER(u.user_id) = UPPER(ar.student_id)
            WHERE ar.college_id = ? AND ar.session_id = ?
            ORDER BY LOWER(COALESCE(u.full_name, ar.student_id))
            """,
            (ACTIVE_COLLEGE_ID.get(), session_id),
        ).fetchall()
        return {"session": sanitized_attendance_session(session), "records": [dict(row) for row in rows]}
    finally:
        conn.close()


@app.post("/api/attendance/sessions/{session_id}/mark/options")
def attendance_mark_options(session_id: str, req: AttendanceOptionsReq, request: Request):
    del session_id, req, request
    raise HTTPException(status_code=410, detail="Passkey attendance is disabled. Use server-side face verification.")


@app.post("/api/attendance/sessions/{session_id}/mark")
def mark_attendance(session_id: str, req: WebAuthnChallengeReq, request: Request):
    del session_id, req, request
    raise HTTPException(status_code=410, detail="Passkey attendance is disabled. Use server-side face verification.")


@app.post("/api/attendance/exceptions")
def record_attendance_exception(req: AttendanceExceptionReq, request: Request):
    warden = request.state.user
    if warden.get("role") not in {"Warden", "Dean"}:
        raise HTTPException(status_code=403, detail="Warden or Dean access is required.")
    reason = req.reason.strip()
    status = req.status.strip().title()
    if not reason or len(reason) > 500:
        raise HTTPException(status_code=400, detail="Provide a reason of 1 to 500 characters.")
    if status not in {"Present", "Absent", "Excused"}:
        raise HTTPException(status_code=400, detail="Status must be Present, Absent, or Excused.")
    conn = get_conn()
    try:
        session = db_exec(conn, "SELECT * FROM attendance_sessions WHERE college_id = ? AND session_id = ?", (ACTIVE_COLLEGE_ID.get(), req.session_id)).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Roll call session not found.")
        check_warden_hostel(warden, session["hostel_block"])
        student_row = db_exec(
            conn,
            "SELECT user_id FROM users WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student' AND LOWER(hostel_block) = LOWER(?)",
            (ACTIVE_COLLEGE_ID.get(), req.student_id.upper(), session["hostel_block"]),
        ).fetchone()
        if not student_row:
            raise HTTPException(status_code=404, detail="Student is not assigned to this hostel.")
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        db_exec(
            conn,
            """
            INSERT INTO attendance_records
                (college_id, record_id, session_id, student_id, status, method, marked_at, exception_reason)
            VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)
            ON CONFLICT (college_id, session_id, student_id) DO UPDATE SET
                status = excluded.status,
                method = 'manual',
                marked_at = excluded.marked_at,
                exception_reason = excluded.exception_reason
            """,
            (
                ACTIVE_COLLEGE_ID.get(),
                f"AR-{uuid.uuid4().hex[:16].upper()}",
                req.session_id,
                student_row["user_id"],
                status,
                now,
                reason,
            ),
        )
        conn.commit()
        return {"success": True, "student_id": student_row["user_id"], "status": status, "reason": reason}
    finally:
        conn.close()


@app.get("/api/attendance/mine")
def my_attendance(request: Request):
    student = request.state.user
    if student.get("role") != "Student":
        raise HTTPException(status_code=403, detail="Only students can view their attendance.")
    close_expired_attendance_sessions()
    conn = get_conn()
    try:
        rows = db_exec(
            conn,
            """
            SELECT s.session_id, s.hostel_block, s.session_date, s.status AS session_status,
                   s.closes_at, ar.status, ar.method, ar.marked_at, ar.exception_reason
            FROM attendance_sessions s
            LEFT JOIN attendance_records ar
                ON ar.college_id = s.college_id AND ar.session_id = s.session_id AND UPPER(ar.student_id) = ?
            WHERE s.college_id = ? AND LOWER(s.hostel_block) = LOWER(
                (SELECT hostel_block FROM users WHERE college_id = s.college_id AND UPPER(user_id) = ? AND role = 'Student')
            )
            ORDER BY s.started_at DESC LIMIT 100
            """,
            (student["user_id"].upper(), ACTIVE_COLLEGE_ID.get(), student["user_id"].upper()),
        ).fetchall()
        return {"attendance": [dict(row) for row in rows]}
    finally:
        conn.close()


@app.put("/api/profile")
def update_student_profile(req: StudentProfileReq, request: Request):
    account = request.state.user
    if account["role"] != "Student":
        raise HTTPException(status_code=403, detail="Only student profiles can be updated here.")
    conn = get_conn()
    existing = db_exec(
        conn,
        "SELECT hostel_block, wing, room, phone FROM users WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'",
        (ACTIVE_COLLEGE_ID.get(), account["user_id"].upper()),
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Student record not found.")
    needs_setup = (
        not existing["hostel_block"]
        or not existing["phone"]
        or (
            (existing["hostel_block"] or "").strip().lower() != "day scholar"
            and (not existing["wing"] or not existing["room"])
        )
    )
    if not needs_setup:
        conn.close()
        raise HTTPException(status_code=403, detail="Use a warden-approved profile change request to update your details.")

    hostel = req.hostel_block.strip()
    phone = req.phone.strip()
    if not re.fullmatch(r"\+?[0-9][0-9\s()-]{7,17}", phone):
        conn.close()
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit mobile number.")

    if hostel.lower() == "day scholar":
        hostel = "Day Scholar"
        wing = "N/A"
        room = "N/A"
        title = "Day Scholar"
    else:
        wing = (req.wing or "").strip()
        room = (req.room or "").strip()
        if wing not in configured_wings(hostel):
            conn.close()
            raise HTTPException(status_code=400, detail="Select a wing configured for your hostel.")
        if not room or len(room) > 20:
            conn.close()
            raise HTTPException(status_code=400, detail="Enter a valid room number.")
        title = "Verified Resident"

    uid = account["user_id"].upper()
    db_exec(
        conn,
        "UPDATE users SET hostel_block = ?, wing = ?, room = ?, phone = ?, authority_title = ? WHERE college_id = ? AND UPPER(user_id) = ?",
        (hostel, wing, room, phone, title, ACTIVE_COLLEGE_ID.get(), uid)
    )
    updated = db_exec(conn, "SELECT * FROM users WHERE college_id = ? AND UPPER(user_id) = ?", (ACTIVE_COLLEGE_ID.get(), uid)).fetchone()
    conn.commit()
    conn.close()
    invalidate_user_cache(uid)
    user = dict(updated)
    user.pop("password", None)
    user.pop("dob", None)
    return {"success": True, "user": user}


@app.get("/api/profile/requests")
def get_student_profile_requests(request: Request):
    account = request.state.user
    if account["role"] != "Student":
        raise HTTPException(status_code=403, detail="Only students can view their profile requests.")
    conn = get_conn()
    try:
        rows = db_exec(
            conn,
            "SELECT * FROM student_profile_requests WHERE college_id = ? AND UPPER(student_id) = ? ORDER BY created_at DESC",
            (ACTIVE_COLLEGE_ID.get(), account["user_id"].upper()),
        ).fetchall()
        profile = dict(db_exec(
            conn,
            "SELECT user_id, full_name, role, authority_title, institute_id, hostel_block, wing, room, phone, guardian_phone, guardian_whatsapp_consent, year, department, email FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
            (ACTIVE_COLLEGE_ID.get(), account["user_id"].upper()),
        ).fetchone())
        return {
            "requests": [
            {**dict(row), "requested_changes": json.loads(row["requested_changes"] or "{}")}
            for row in rows
            ],
            "profile": profile,
        }
    finally:
        conn.close()


@app.post("/api/profile/requests")
def create_student_profile_request(req: StudentProfileChangeReq, request: Request):
    account = request.state.user
    if account["role"] != "Student":
        raise HTTPException(status_code=403, detail="Only students can request profile changes.")

    conn = get_conn()
    try:
        student = db_exec(
            conn,
            "SELECT * FROM users WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'",
            (ACTIVE_COLLEGE_ID.get(), account["user_id"].upper()),
        ).fetchone()
        if not student:
            raise HTTPException(status_code=404, detail="Student record not found.")

        changes = {}
        requested_hostel = (req.hostel_block or student["hostel_block"] or "").strip()
        if requested_hostel.casefold() == "day scholar":
            requested_hostel = "Day Scholar"
            requested_wing = "N/A"
            requested_room = "N/A"
        else:
            hostel_config = get_hostel_config_by_name(requested_hostel)
            if not hostel_config:
                raise HTTPException(status_code=400, detail="Select a configured destination hostel.")
            requested_hostel = hostel_config["name"]
            requested_wing = (req.wing or (student["wing"] if requested_hostel.casefold() == str(student["hostel_block"] or "").casefold() else "") or "").strip()
            requested_room = (req.room or (student["room"] if requested_hostel.casefold() == str(student["hostel_block"] or "").casefold() else "") or "").strip()
            if requested_wing not in json.loads(hostel_config["wings_json"] or "[]"):
                raise HTTPException(status_code=400, detail="Select a wing configured for the destination hostel.")
            if not requested_room or len(requested_room) > 20:
                raise HTTPException(status_code=400, detail="Enter a valid room number.")
        if requested_hostel.casefold() != str(student["hostel_block"] or "").casefold():
            changes["hostel_block"] = requested_hostel
            changes["wing"] = requested_wing
            changes["room"] = requested_room
        if req.room is not None:
            room = req.room.strip()
            if requested_hostel.casefold() != "day scholar" and (not room or len(room) > 20):
                raise HTTPException(status_code=400, detail="Enter a valid room number.")
            if requested_hostel.casefold() != "day scholar" and room != (student["room"] or ""):
                changes["room"] = room
        if req.wing is not None:
            wing = req.wing.strip()
            if requested_hostel.casefold() != "day scholar" and wing not in configured_wings(requested_hostel):
                raise HTTPException(status_code=400, detail="Select a wing configured for your hostel.")
            if requested_hostel.casefold() == "day scholar":
                raise HTTPException(status_code=400, detail="Day Scholars do not have a hostel wing.")
            if requested_hostel.casefold() == str(student["hostel_block"] or "").casefold() and wing != (student["wing"] or ""):
                changes["wing"] = wing
        if req.phone is not None:
            phone = req.phone.strip()
            if not re.fullmatch(r"\+?[0-9][0-9\s()-]{7,17}", phone):
                raise HTTPException(status_code=400, detail="Enter a valid mobile number.")
            if phone != (student["phone"] or ""):
                changes["phone"] = phone
        if not changes:
            raise HTTPException(status_code=400, detail="Enter at least one profile change that differs from your current information.")

        pending = db_exec(
            conn,
            "SELECT request_id FROM student_profile_requests WHERE college_id = ? AND UPPER(student_id) = ? AND status = 'Pending' LIMIT 1",
            (ACTIVE_COLLEGE_ID.get(), account["user_id"].upper()),
        ).fetchone()
        if pending:
            raise HTTPException(status_code=409, detail="You already have a pending profile change request.")

        request_id = f"PR-{uuid.uuid4().hex[:12].upper()}"
        created_at = datetime.now().isoformat(timespec="seconds")
        routing_hostel = str(student["hostel_block"] or "").strip()
        if not routing_hostel or routing_hostel.casefold() == "day scholar":
            routing_hostel = requested_hostel
        db_exec(
            conn,
            "INSERT INTO student_profile_requests (request_id, student_id, hostel_block, requested_changes, status, created_at, reviewed_at, reviewed_by, review_remark, college_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (request_id, student["user_id"], routing_hostel, json.dumps(changes), "Pending", created_at, "", "", "", ACTIVE_COLLEGE_ID.get()),
        )
        conn.commit()
        return {
            "success": True,
            "request": {
                "request_id": request_id,
                "student_id": student["user_id"],
                "hostel_block": routing_hostel,
                "requested_changes": changes,
                "status": "Pending",
                "created_at": created_at,
            },
        }
    finally:
        conn.close()


@app.get("/api/warden/profile-requests")
def get_warden_profile_requests(request: Request):
    account = request.state.user
    if account["role"] != "Warden":
        raise HTTPException(status_code=403, detail="Only wardens can review student profile requests.")
    conn = get_conn()
    try:
        return list_warden_profile_requests(conn, account["hostel_block"])
    finally:
        conn.close()


@app.post("/api/warden/profile-requests/review")
def review_student_profile_request(req: ProfileRequestReviewReq, request: Request):
    account = request.state.user
    if account["role"] != "Warden":
        raise HTTPException(status_code=403, detail="Only wardens can review student profile requests.")
    decision = req.decision.strip().lower()
    if decision not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail="Choose approve or reject.")

    conn = get_conn()
    try:
        row = db_exec(
            conn,
            """
            SELECT profile_requests.*
            FROM student_profile_requests AS profile_requests
            JOIN users ON users.college_id = profile_requests.college_id
                      AND UPPER(users.user_id) = UPPER(profile_requests.student_id)
            WHERE profile_requests.college_id = ?
              AND users.college_id = ?
              AND profile_requests.request_id = ?
              AND (
                  LOWER(COALESCE(profile_requests.hostel_block, '')) = LOWER(?)
                  OR LOWER(COALESCE(users.hostel_block, '')) = LOWER(?)
              )
            """,
            (ACTIVE_COLLEGE_ID.get(), ACTIVE_COLLEGE_ID.get(), req.request_id, account["hostel_block"], account["hostel_block"]),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Profile request not found for your hostel.")
        if row["status"] != "Pending":
            raise HTTPException(status_code=409, detail="This profile request has already been reviewed.")

        changes = json.loads(row["requested_changes"] or "{}")
        if decision == "approved":
            allowed_fields = {"hostel_block", "room", "wing", "phone", "guardian_phone", "guardian_whatsapp_consent"}
            if not changes or not set(changes).issubset(allowed_fields):
                raise HTTPException(status_code=400, detail="This profile request contains invalid changes.")
            if "hostel_block" in changes:
                target_hostel = str(changes["hostel_block"]).strip()
                if target_hostel.casefold() == "day scholar":
                    changes.update({"hostel_block": "Day Scholar", "wing": "N/A", "room": "N/A"})
                else:
                    hostel_config = get_hostel_config_by_name(target_hostel)
                    if not hostel_config:
                        raise HTTPException(status_code=400, detail="The requested destination hostel is no longer configured.")
                    target_hostel = hostel_config["name"]
                    if changes.get("wing") not in json.loads(hostel_config["wings_json"] or "[]"):
                        raise HTTPException(status_code=400, detail="The requested wing is not configured in the destination hostel.")
                    if not str(changes.get("room") or "").strip() or len(str(changes["room"])) > 20:
                        raise HTTPException(status_code=400, detail="The requested room number is invalid.")
                    changes["hostel_block"] = target_hostel
            if "phone" in changes and not re.fullmatch(r"\+?[0-9][0-9\s()-]{7,17}", str(changes["phone"])):
                raise HTTPException(status_code=400, detail="The requested mobile number is invalid.")
            if changes.get("guardian_phone") and not re.fullmatch(r"\+?[0-9][0-9\s()-]{7,17}", str(changes["guardian_phone"])):
                raise HTTPException(status_code=400, detail="The requested guardian number is invalid.")
            columns = ", ".join(f"{field} = ?" for field in changes)
            db_exec(
                conn,
                f"UPDATE users SET {columns} WHERE college_id = ? AND UPPER(user_id) = ?",
                (*changes.values(), ACTIVE_COLLEGE_ID.get(), row["student_id"].upper()),
            )

        reviewed_at = datetime.now().isoformat(timespec="seconds")
        db_exec(
            conn,
            "UPDATE student_profile_requests SET status = ?, reviewed_at = ?, reviewed_by = ?, review_remark = ? WHERE college_id = ? AND request_id = ?",
            (decision.title(), reviewed_at, account["user_id"], (req.remark or "").strip()[:500], ACTIVE_COLLEGE_ID.get(), req.request_id),
        )
        conn.commit()
        if decision == "approved":
            invalidate_user_cache(row["student_id"])
        return {"success": True, "status": decision.title(), "request_id": req.request_id}
    finally:
        conn.close()


@app.get("/api/ads")
def get_ads():
    conn = get_conn()
    rows = db_exec(conn, "SELECT * FROM ads ORDER BY created_at DESC").fetchall()
    conn.close()
    today = datetime.now().strftime("%Y-%m-%d")
    active_ads = []
    for r in rows:
        d = dict(r)
        if not d.get("expires_at") or d["expires_at"] >= today:
            active_ads.append(d)
    return active_ads


@app.post("/api/ads/create")
def create_ad(req: AdCreateReq):
    ad_id = f"AD-{random.randint(100, 999)}"
    created_at = datetime.now().strftime("%Y-%m-%d")
    expires_at = (datetime.now() + timedelta(days=max(1, req.days_valid))).strftime("%Y-%m-%d")
    conn = get_conn()
    db_exec(
        conn,
        """
        INSERT INTO ads
            (ad_id, sponsor_tag, title, subtitle, badge_text, cta_text, target_url, image_url, bg_gradient, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            ad_id, req.sponsor_tag.strip(), req.title.strip(), req.subtitle.strip(),
            (req.badge_text or "").strip(), (req.cta_text or "Explore →").strip(),
            req.target_url.strip(), (req.image_url or "").strip(),
            req.bg_gradient or "linear-gradient(135deg, #002970 0%, #0284C7 100%)",
            created_at, expires_at
        )
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Sponsor Ad '{req.title}' published until {expires_at}!"}


@app.post("/api/ads/delete")
def delete_ad(ad_id: str = Query(...)):
    conn = get_conn()
    db_exec(conn, "DELETE FROM ads WHERE ad_id = ?", (ad_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Ad removed."}


@app.get("/api/departments")
def get_departments(request: Request, hostel_block: str = "All"):
    account = request.state.user
    if account["role"] in {"Student", "Warden", "Staff"}:
        hostel_block = account["hostel_block"] or "All"
    return list_departments(hostel_block)


def list_departments(hostel_block: str = "All"):
    conn = get_conn()
    if hostel_block and hostel_block not in {"All", "Day Scholar"}:
        rows = db_exec(
            conn,
            "SELECT departments.*, users.email AS login_email FROM departments LEFT JOIN users ON UPPER(users.user_id) = UPPER(departments.id) WHERE departments.type = 'Central' OR LOWER(departments.hostel_block) = LOWER(?)",
            (hostel_block,)
        ).fetchall()
    else:
        rows = db_exec(
            conn,
            "SELECT departments.*, users.email AS login_email FROM departments LEFT JOIN users ON UPPER(users.user_id) = UPPER(departments.id)"
        ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.post("/api/departments")
@app.post("/api/departments/create")
def create_department(req: CreateDepartmentReq, request: Request):
    account = request.state.user
    if account["role"] not in {"Dean", "Warden"}:
        raise HTTPException(status_code=403, detail="Dean or Warden access is required.")
    raw_name = (req.name or req.title or "").strip()
    if not raw_name:
        raise HTTPException(status_code=400, detail="Department name is required.")
    did = (req.dept_id or raw_name).strip().upper().replace(" ", "_").replace("/", "")
    dept_type = "Hostel" if account["role"] == "Warden" else req.dept_type
    h_block = account["hostel_block"] if account["role"] == "Warden" else req.hostel_block if dept_type == "Hostel" else "All"
    if account["role"] == "Warden":
        warden_prefix = re.sub(r"[^A-Z0-9]+", "_", account["user_id"].upper()).strip("_")
        if not did.startswith(f"{warden_prefix}_"):
            did = f"{warden_prefix}_{did}"

    email = normalized_college_email(req.email, did.lower())
    pwd = ""
    display_title = f"{raw_name} ({h_block})" if dept_type == "Hostel" and h_block != "All" and h_block.lower() not in raw_name.lower() else raw_name

    conn = get_conn()
    existing = db_exec(conn, "SELECT * FROM departments WHERE UPPER(id) = ?", (did,)).fetchone()
    if existing:
        db_exec(
            conn,
            "UPDATE departments SET title = ?, type = ?, hostel_block = ?, icon = ? WHERE UPPER(id) = ?",
            (display_title, dept_type, h_block, req.icon or "🛠️", did)
        )
    else:
        db_exec(
            conn,
            "INSERT INTO departments (id, title, type, hostel_block, icon) VALUES (?, ?, ?, ?, ?)",
            (did, display_title, dept_type, h_block, req.icon or "🛠️")
        )

    upsert_user(
        conn,
        (did, pwd, display_title, "Staff", f"Department Portal ({h_block})", ACTIVE_COLLEGE_ID.get(), h_block, "-", "Maintenance Wing", "0261-2201500", email, did, "", "")
    )
    if account["role"] == "Warden":
        db_exec(
            conn,
            "UPDATE users SET managed_by = ? WHERE college_id = ? AND UPPER(user_id) = ?",
            (account["user_id"].upper(), ACTIVE_COLLEGE_ID.get(), did.upper()),
        )
    conn.commit()
    conn.close()
    return {
        "success": True,
        "message": f"Department '{display_title}' saved. Set its password in Staff account access.",
        "departments": list_departments()
    }


@app.get("/api/dean/wardens")
def get_wardens(request: Request):
    if request.state.user["role"] != "Dean":
        raise HTTPException(status_code=403, detail="Dean access is required.")
    conn = get_conn()
    rows = db_exec(conn, "SELECT * FROM users WHERE role = 'Warden'").fetchall()
    conn.close()
    return [
        {
            k: v
            for k, v in dict(r).items()
            if k not in {"password", "dob", "biometric_cred_id", "device_hardware_id", "device_token_hash"}
        }
        for r in rows
    ]


@app.post("/api/dean/update-warden")
@app.post("/api/dean/create-warden")
def create_or_update_warden(req: WardenCreateReq, request: Request):
    if request.state.user["role"] != "Dean":
        raise HTTPException(status_code=403, detail="Dean access is required.")
    uid = req.user_id.strip().upper().replace(" ", "_")
    full_name = f"{req.hostel_block.strip()} Warden Office"
    email = normalized_college_email(req.email, uid.lower())
    pwd = ""
    conn = get_conn()
    upsert_user(
        conn,
        (uid, pwd, full_name, "Warden", "Chief Warden / Warden", ACTIVE_COLLEGE_ID.get(), req.hostel_block.strip(), "-", "Warden Office", (req.phone or "0261-2201600").strip(), email, "Hostel Office", "", "")
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Warden Portal '{uid}' configured. Set its password in Staff account access."}


@app.get("/api/dean/gate-security")
def list_gate_security(request: Request):
    if request.state.user["role"] != "Dean":
        raise HTTPException(status_code=403, detail="Dean access is required.")
    conn = get_conn()
    try:
        rows = db_exec(
            conn,
            "SELECT user_id, full_name, email, phone FROM users WHERE role = 'GateSecurity' ORDER BY full_name",
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@app.post("/api/dean/gate-security")
def create_gate_security(req: GateSecurityCreateReq, request: Request):
    if request.state.user["role"] != "Dean":
        raise HTTPException(status_code=403, detail="Dean access is required.")
    user_id = req.user_id.strip().upper()
    full_name = req.full_name.strip()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{1,39}", user_id):
        raise HTTPException(status_code=400, detail="Use a 2–40 character staff ID with letters, numbers, - or _.")
    if not full_name or len(full_name) > 160:
        raise HTTPException(status_code=400, detail="Enter the security staff member's name.")
    email = normalized_college_email(req.email, user_id.lower())
    phone = (req.phone or "").strip()
    if phone and not re.fullmatch(r"\+?[0-9][0-9\s()-]{7,17}", phone):
        raise HTTPException(status_code=400, detail="Enter a valid mobile number.")
    conn = get_conn()
    try:
        upsert_user(
            conn,
            (
                user_id,
                "",
                full_name,
                "GateSecurity",
                "Gate Security",
                ACTIVE_COLLEGE_ID.get(),
                "All",
                "",
                "",
                phone,
                email,
                "Gate Security",
                "",
                "",
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "message": f"Gate Security account configured for {full_name}."}


@app.post("/api/unicore/clubs/create")
@app.post("/api/founder/create-club")
@app.post("/api/dean/create-club")
def create_club(req: ClubCreateReq, request: Request):
    if request.state.user["role"] not in {"Dean", "Founder"}:
        raise HTTPException(status_code=403, detail="Dean or Founder access is required.")
    cid = req.club_id.strip().upper().replace(" ", "_")
    email = normalized_college_email(req.email, cid.lower())
    pwd = ""
    conn = get_conn()
    upsert_club(
        conn,
        (
            cid,
            req.name.strip(),
            (req.mission or "").strip() or "Official Student Chapter & Society of SVNIT Surat.",
            (req.faculty_advisor or "").strip() or "SAC Faculty Advisor",
            (req.head_coordinator or "").strip() or "Student Convener",
            "", "", "", json.dumps([]), json.dumps([])
        )
    )
    upsert_user(
        conn,
        (cid, pwd, req.name.strip(), "ClubOrganizer", f"Club Portal ({cid})", ACTIVE_COLLEGE_ID.get(), "All", "-", "SAC Office", "0261-2201500", email, "Student Society", "", "")
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Club '{req.name}' saved. Set its password in Staff account access."}


@app.get("/api/warden/students")
def get_hostel_students(request: Request, hostel_block: str = "All"):
    account = request.state.user
    if account["role"] not in {"Warden", "Dean"}:
        raise HTTPException(status_code=403, detail="Warden or Dean access is required.")
    if account["role"] == "Warden":
        hostel_block = account["hostel_block"]
    conn = get_conn()
    try:
        if hostel_block == "All":
            rows = db_exec(
                conn,
                "SELECT * FROM users WHERE college_id = ? AND role = 'Student' ORDER BY user_id ASC",
                (ACTIVE_COLLEGE_ID.get(),),
            ).fetchall()
        else:
            rows = db_exec(
                conn,
                "SELECT * FROM users WHERE college_id = ? AND role = 'Student' "
                "AND LOWER(hostel_block) = LOWER(?) ORDER BY user_id ASC",
                (ACTIVE_COLLEGE_ID.get(), hostel_block),
            ).fetchall()
    finally:
        conn.close()
    return [
        {
            key: value
            for key, value in dict(row).items()
            if key not in {"password", "dob", "biometric_cred_id", "device_hardware_id", "device_token_hash"}
        }
        for row in rows
    ]


@app.post("/api/warden/add-student")
def add_student_manual(req: StudentManualAddReq, request: Request):
    warden = request.state.user
    if warden.get("role") != "Warden":
        raise HTTPException(status_code=403, detail="Only wardens can manage hostel residents.")
    uid = req.user_id.strip().upper()
    hostel_block = str(warden.get("hostel_block") or "").strip()
    if not hostel_block:
        raise HTTPException(status_code=403, detail="Your account is not assigned to a hostel.")
    wing = (req.wing or "Wing A").strip()
    room = req.room.strip()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9._-]{1,63}", uid):
        raise HTTPException(status_code=400, detail="Enter a valid student account ID.")
    if wing not in configured_wings(hostel_block):
        raise HTTPException(status_code=400, detail="Select a wing configured for your hostel.")
    if not room or len(room) > 20:
        raise HTTPException(status_code=400, detail="Enter a valid room number.")
    phone = (req.phone or "").strip()
    guardian_phone = (req.guardian_phone or "").strip()
    if phone and not re.fullmatch(r"\+?[0-9][0-9\s()-]{7,17}", phone):
        raise HTTPException(status_code=400, detail="Enter a valid student mobile number.")
    if guardian_phone and not re.fullmatch(r"\+?[0-9][0-9\s()-]{7,17}", guardian_phone):
        raise HTTPException(status_code=400, detail="Enter a valid parent or guardian number.")
    tenant = get_tenant_by_id(ACTIVE_COLLEGE_ID.get())
    email = (req.email or f"{uid.lower()}@{tenant['allowed_email_domain']}").strip().lower()
    conn = get_conn()
    existing = db_exec(
        conn,
        "SELECT * FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
        (ACTIVE_COLLEGE_ID.get(), uid),
    ).fetchone()
    if existing:
        if existing["role"] != "Student" or str(existing["hostel_block"] or "").casefold() != hostel_block.casefold():
            conn.close()
            raise HTTPException(status_code=403, detail="This student is assigned to another hostel. Use the transfer workflow.")
        db_exec(
            conn,
            "UPDATE users SET full_name = ?, wing = ?, room = ?, department = ?, year = ?, phone = ?, guardian_phone = ?, email = ? WHERE college_id = ? AND UPPER(user_id) = ?",
            (req.full_name.strip(), wing, room, req.department.strip(), (req.year or "1st Year").strip(), phone, guardian_phone, email, ACTIVE_COLLEGE_ID.get(), uid)
        )
    else:
        db_exec(
            conn,
            "INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob, wing, guardian_phone, college_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (uid, "", req.full_name.strip(), "Student", "Verified Resident", ACTIVE_COLLEGE_ID.get(), hostel_block, (req.year or "1st Year").strip(), room, phone, email, req.department.strip(), "", wing, guardian_phone, ACTIVE_COLLEGE_ID.get())
        )
    conn.commit()
    conn.close()
    invalidate_user_cache(uid)
    return {"success": True, "message": f"Student {req.full_name} ({uid}) saved in {hostel_block}."}


@app.post("/api/warden/update-student")
def update_student_by_warden(req: WardenStudentUpdateReq, request: Request):
    warden = request.state.user
    if warden.get("role") != "Warden":
        raise HTTPException(status_code=403, detail="Only wardens can manage hostel residents.")
    uid = req.user_id.strip().upper()
    new_hostel = req.hostel_block.strip()
    new_wing = (req.wing or "").strip()
    new_room = (req.room or "").strip()
    if new_hostel.lower() == "day scholar":
        new_hostel = "Day Scholar"
        new_wing = "N/A"
        new_room = "N/A"
    else:
        configured_hostel = get_hostel_config_by_name(new_hostel)
        if not configured_hostel:
            raise HTTPException(status_code=400, detail="Select a configured destination hostel.")
        new_hostel = configured_hostel["name"]
        if new_wing not in json.loads(configured_hostel["wings_json"] or "[]"):
            raise HTTPException(status_code=400, detail="Select a wing configured for the destination hostel.")
        if not new_room or len(new_room) > 20:
            raise HTTPException(status_code=400, detail="Enter a valid room number.")
    phone = (req.phone or "").strip()
    guardian_phone = (req.guardian_phone or "").strip()
    if phone and not re.fullmatch(r"\+?[0-9][0-9\s()-]{7,17}", phone):
        raise HTTPException(status_code=400, detail="Enter a valid student mobile number.")
    if guardian_phone and not re.fullmatch(r"\+?[0-9][0-9\s()-]{7,17}", guardian_phone):
        raise HTTPException(status_code=400, detail="Enter a valid parent or guardian number.")
    conn = get_conn()
    existing = db_exec(
        conn,
        "SELECT * FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
        (ACTIVE_COLLEGE_ID.get(), uid),
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Student record not found.")
    if existing["role"] != "Student" or str(existing["hostel_block"] or "").casefold() != str(warden.get("hostel_block") or "").casefold():
        conn.close()
        raise HTTPException(status_code=403, detail="You can only manage students currently assigned to your hostel.")

    full_name = (req.full_name or existing["full_name"] or uid).strip()
    dept = (req.department or existing["department"] or "").strip()
    yr = (req.year or existing["year"] or "1st Year").strip()

    db_exec(
        conn,
        "UPDATE users SET full_name = ?, hostel_block = ?, wing = ?, room = ?, department = ?, year = ?, phone = ?, guardian_phone = ?, authority_title = ? WHERE college_id = ? AND UPPER(user_id) = ?",
        (full_name, new_hostel, new_wing, new_room, dept, yr, phone, guardian_phone, "Day Scholar" if new_hostel == "Day Scholar" else "Verified Resident", ACTIVE_COLLEGE_ID.get(), uid)
    )
    db_exec(
        conn,
        "UPDATE complaints SET hostel_block = ?, wing = ?, room = ?, student_name = ? WHERE college_id = ? AND UPPER(student_id) = ? AND status != 'Completed'",
        (new_hostel, new_wing, new_room, full_name, ACTIVE_COLLEGE_ID.get(), uid)
    )
    conn.commit()
    conn.close()
    invalidate_user_cache(uid)
    return {
        "success": True,
        "message": f"Updated {full_name} ({uid}) → {new_hostel} ({new_wing}, Room {new_room})."
    }


@app.post("/api/warden/upload-students")
@app.post("/api/founder/upload-students")
def upload_students_bulk(students: List[StudentManualAddReq], request: Request):
    account = request.state.user
    added, updated = 0, 0
    conn = get_conn()
    for s in students:
        uid = s.user_id.strip().upper()
        if not uid:
            continue
        hostel_block = account["hostel_block"] if account["role"] == "Warden" else s.hostel_block
        tenant = get_tenant_by_id(ACTIVE_COLLEGE_ID.get())
        email = (s.email or f"{uid.lower()}@{tenant['allowed_email_domain']}").strip().lower()
        existing = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (uid,)).fetchone()
        if existing:
            db_exec(
                conn,
                "UPDATE users SET full_name = ?, hostel_block = ?, room = ?, department = ?, year = ?, email = ? WHERE UPPER(user_id) = ?",
                (s.full_name.strip(), hostel_block, s.room.strip(), s.department.strip(), (s.year or "1st Year").strip(), email, uid)
            )
            updated += 1
        else:
            db_exec(
                conn,
                "INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob, wing) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (uid, "", s.full_name.strip(), "Student", "Verified Resident", ACTIVE_COLLEGE_ID.get(), hostel_block, (s.year or "1st Year").strip(), s.room.strip(), "", email, s.department.strip(), "", "Wing A")
            )
            added += 1
    conn.commit()
    conn.close()
    invalidate_user_cache()
    return {"success": True, "message": f"Bulk Upload Complete: {added} added, {updated} updated!"}


@app.get("/api/complaints")
def get_complaints(request: Request, wing: str = "", category: str = ""):
    account = request.state.user
    role = account["role"]
    conn = get_conn()
    base_query = """
        SELECT complaints.*,
               COALESCE(NULLIF(complaints.wing, ''), users.wing, '') AS resolved_wing,
               COALESCE(users.phone, '') AS student_phone
        FROM complaints
        LEFT JOIN users ON UPPER(users.user_id) = UPPER(complaints.student_id)
    """
    if role == "Student":
        rows = db_exec(conn, f"{base_query} WHERE UPPER(complaints.student_id) = ? ORDER BY complaints.created_at DESC", (account["user_id"].upper(),)).fetchall()
    elif role == "Staff":
        dept_key = (account["department"] or account["user_id"]).strip().upper()
        dept_row = db_exec(conn, "SELECT * FROM departments WHERE UPPER(id) = ?", (dept_key,)).fetchone()
        if dept_row:
            rows = db_exec(conn, f"{base_query} WHERE UPPER(complaints.category) = ? OR LOWER(complaints.routed_to) = LOWER(?) ORDER BY complaints.created_at DESC", (dept_key, dept_row["title"])).fetchall()
        else:
            rows = db_exec(conn, f"{base_query} WHERE UPPER(complaints.category) = ? ORDER BY complaints.created_at DESC", (dept_key,)).fetchall()
    elif role == "Warden":
        rows = db_exec(conn, f"{base_query} WHERE LOWER(complaints.hostel_block) = LOWER(?) ORDER BY complaints.created_at DESC", (account["hostel_block"],)).fetchall()
    else:
        rows = db_exec(conn, f"{base_query} ORDER BY complaints.created_at DESC").fetchall()
    conn.close()

    matched = [dict(r) for r in rows]
    for item in matched:
        item["wing"] = item.pop("resolved_wing", item.get("wing") or "")
        item["phone"] = item.pop("student_phone", item.get("phone") or "")
        item["student_phone"] = item["phone"]

    if wing:
        matched = [c for c in matched if c.get("wing") == wing]
    if category:
        cat_key = category.strip().casefold()
        matched = [c for c in matched if (c.get("category") or "").casefold() == cat_key or (c.get("routed_to") or "").casefold() == cat_key]
    return matched


@app.post("/api/complaints")
def create_complaint(req: ComplaintCreateReq, request: Request):
    conn = get_conn()
    account = request.state.user
    student = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ? AND role = 'Student'", (account["user_id"].upper(),)).fetchone()
    if not student:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found")
    if (student["hostel_block"] or "").strip().lower() == "day scholar":
        conn.close()
        raise HTTPException(status_code=403, detail="Hostel complaints are only available for Hostel Residents.")
    dept_obj = db_exec(conn, "SELECT * FROM departments WHERE (UPPER(id) = ? OR LOWER(title) = LOWER(?))", (req.category.upper(), req.category)).fetchone()
    routed_title = dept_obj["title"] if dept_obj else req.category
    cat_id = dept_obj["id"] if dept_obj else req.category.upper()
    ticket_id = f"TKT-{random.randint(100, 999)}"
    created_at = datetime.now().strftime("%Y-%m-%d, %I:%M %p")
    db_exec(
        conn,
        "INSERT INTO complaints (ticket_id, student_id, student_name, hostel_block, room, year, department, category, summary, description, status, routed_to, staff_remark, created_at, resolved_at, wing) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (ticket_id, student["user_id"], student["full_name"], student["hostel_block"], student["room"], student["year"], student["department"], cat_id, req.summary, req.description, "Pending", routed_title, "", created_at, "", student["wing"] or "")
    )
    conn.commit()
    conn.close()
    return {"success": True, "ticket": {"ticket_id": ticket_id, "summary": req.summary, "status": "Pending"}}


@app.post("/api/complaints/update")
@app.post("/api/complaints/staff-resolve")
async def staff_resolve(request: Request):
    if request.state.user.get("role") not in {"Warden", "Dean", "Founder", "Staff"}:
        raise HTTPException(status_code=403, detail="Staff authorization is required.")
    body = await request.json()
    ticket_id = body.get("ticket_id", "")
    status = body.get("status", "Awaiting Confirmation")
    remark = body.get("staff_remark") or body.get("remark") or ""
    resolved_at = datetime.now().strftime("%Y-%m-%d, %I:%M %p")

    conn = get_conn()
    db_exec(
        conn,
        "UPDATE complaints SET status = ?, staff_remark = ?, resolved_at = ? WHERE college_id = ? AND ticket_id = ?",
        (status, remark, resolved_at, ACTIVE_COLLEGE_ID.get(), ticket_id)
    )
    conn.commit()
    row = db_exec(conn, "SELECT * FROM complaints WHERE college_id = ? AND ticket_id = ?", (ACTIVE_COLLEGE_ID.get(), ticket_id)).fetchone()
    conn.close()
    return {"success": True, "ticket": dict(row) if row else {}}


@app.post("/api/complaints/student-verify")
def student_verify(req: StudentVerifyReq, request: Request):
    new_status = "Completed" if req.satisfied else "Reopened"
    conn = get_conn()
    db_exec(
        conn,
        "UPDATE complaints SET status = ? WHERE college_id = ? AND ticket_id = ? AND UPPER(student_id) = ?",
        (new_status, ACTIVE_COLLEGE_ID.get(), req.ticket_id, request.state.user["user_id"].upper()),
    )
    conn.commit()
    row = db_exec(conn, "SELECT * FROM complaints WHERE college_id = ? AND ticket_id = ? AND UPPER(student_id) = ?", (ACTIVE_COLLEGE_ID.get(), req.ticket_id, request.state.user["user_id"].upper())).fetchone()
    conn.close()
    return {"success": True, "ticket": dict(row) if row else {}}


@app.get("/api/complaints/export-pdf", response_class=HTMLResponse)
def export_pdf(hostel_block: str = "All", request: Request = None):
    if request.state.user.get("role") not in {"Warden", "Dean", "Founder", "Staff"}:
        raise HTTPException(status_code=403, detail="Staff authorization is required.")
    conn = get_conn()
    if hostel_block != "All":
        rows = db_exec(conn, "SELECT * FROM complaints WHERE college_id = ? AND LOWER(hostel_block) = LOWER(?)", (ACTIVE_COLLEGE_ID.get(), hostel_block)).fetchall()
    else:
        rows = db_exec(conn, "SELECT * FROM complaints WHERE college_id = ?", (ACTIVE_COLLEGE_ID.get(),)).fetchall()
    conn.close()
    tr_html = "".join([
        f"<tr><td>{html_escape(str(c['ticket_id'] or ''))}</td><td>{html_escape(str(c['student_name'] or ''))} ({html_escape(str(c['student_id'] or ''))})</td><td>{html_escape(str(c['hostel_block'] or ''))} ({html_escape(str(c['room'] or ''))})</td><td>{html_escape(str(c['routed_to'] or ''))}</td><td>{html_escape(str(c['summary'] or ''))}</td><td>{html_escape(str(c['status'] or ''))}</td><td>{html_escape(str(c['created_at'] or ''))}</td></tr>"
        for c in rows
    ])
    html = f"""
    <html><head><title>SVNIT Grievance Report</title>
    <style>body{{font-family:'Inter',Arial,sans-serif;padding:30px;color:#111827;}} table{{width:100%;border-collapse:collapse;margin-top:20px;}} th,td{{border:1px solid #d1d5db;padding:10px;text-align:left;font-size:13px;}} th{{background:#f3f4f6;}}</style>
    </head><body onload="window.print()">
    <h2>Sardar Vallabhbhai National Institute of Technology, Surat</h2>
    <h3>Official Hostel Grievance Audit Report</h3>
    <p><strong>Hostel Scope:</strong> {html_escape(hostel_block)} | <strong>Total Tickets:</strong> {len(rows)} | <strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
    <table><thead><tr><th>Ticket ID</th><th>Resident</th><th>Hostel & Room</th><th>Department</th><th>Summary</th><th>Status</th><th>Timestamp</th></tr></thead>
    <tbody>{tr_html}</tbody></table></body></html>
    """
    return HTMLResponse(content=html)


@app.get("/api/unicore/events/export-pdf", response_class=HTMLResponse)
def export_events_pdf(year: str = "2026", club_id: str = "All", request: Request = None):
    if request.state.user.get("role") not in {"Dean", "Founder", "Staff"}:
        raise HTTPException(status_code=403, detail="Dean or staff authorization is required.")
    conn = get_conn()
    rows = db_exec(conn, "SELECT * FROM events WHERE date LIKE ? AND (status = 'Approved' OR status = 'Completed')", (f"{year}%",)).fetchall()
    conn.close()
    if club_id != "All":
        rows = [e for e in rows if e["club_id"].upper() == club_id.upper()]
    club_counts = {}
    for e in rows:
        club_counts[e["club_id"]] = club_counts.get(e["club_id"], 0) + 1
    summary_rows = "".join([f"<tr><td><strong>{cid}</strong></td><td>{cnt} Events Conducted</td></tr>" for cid, cnt in club_counts.items()])
    event_rows = "".join([
        f"<tr><td>{e['event_id']}</td><td>{e['club_id']}</td><td>{e['title']}</td><td>{e['date']} ({e['start_time']}-{e['end_time']})</td><td>{e['venue']}</td><td>{len(json.loads(e['rsvps'] or '[]'))}</td><td>{e['status']}</td></tr>"
        for e in rows
    ])
    html = f"""
    <html><head><title>SVNIT Annual Club Events Report - {year}</title>
    <style>body{{font-family:'Inter',Arial,sans-serif;padding:30px;color:#111827;}} table{{width:100%;border-collapse:collapse;margin-top:16px;margin-bottom:28px;}} th,td{{border:1px solid #d1d5db;padding:10px;text-align:left;font-size:13px;}} th{{background:#f3f4f6;}}</style>
    </head><body onload="window.print()">
    <h2>Sardar Vallabhbhai National Institute of Technology, Surat</h2>
    <h3>Office of the Dean Student Welfare — Annual Events Report ({year})</h3>
    <p><strong>Total Approved / Completed Events in {year}:</strong> {len(rows)} Events | <strong>Club Filter:</strong> {club_id}</p>
    <h4>1. Club-Wise Event Breakdown</h4>
    <table><thead><tr><th>Club Chapter</th><th>Total Events Conducted</th></tr></thead><tbody>{summary_rows}</tbody></table>
    <h4>2. Complete Event Ledger</h4>
    <table><thead><tr><th>Event ID</th><th>Club</th><th>Event Title</th><th>Date & Time</th><th>Venue</th><th>Student RSVPs</th><th>Status</th></tr></thead>
    <tbody>{event_rows}</tbody></table></body></html>
    """
    return HTMLResponse(content=html)


@app.get("/api/unicore/clubs")
def get_clubs():
    conn = get_conn()
    rows = db_exec(conn, "SELECT * FROM clubs ORDER BY club_id ASC").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["members"] = json.loads(d["members"] or "[]")
        d["gallery"] = json.loads(d["gallery"] or "[]")
        result.append(d)
    return result


@app.post("/api/unicore/clubs/update-info")
def update_club_info(req: ClubUpdateInfoReq):
    conn = get_conn()
    db_exec(
        conn,
        "UPDATE clubs SET mission = ?, extra_dean_info = ?, faculty_advisor = COALESCE(?, faculty_advisor), head_coordinator = COALESCE(?, head_coordinator) WHERE UPPER(club_id) = ?",
        (req.mission, req.extra_dean_info, req.faculty_advisor, req.head_coordinator, req.club_id.upper())
    )
    conn.commit()
    row = db_exec(conn, "SELECT * FROM clubs WHERE UPPER(club_id) = ?", (req.club_id.upper(),)).fetchone()
    conn.close()
    res = dict(row)
    res["members"] = json.loads(res["members"] or "[]")
    res["gallery"] = json.loads(res["gallery"] or "[]")
    return {"success": True, "club": res}


@app.post("/api/unicore/clubs/add-member")
def add_club_member(req: ClubMemberAddReq):
    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM clubs WHERE UPPER(club_id) = ?", (req.club_id.upper(),)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Club not found")
    members = json.loads(row["members"] or "[]")
    members.append({
        "name": req.name.strip(),
        "roll": req.roll.strip().upper(),
        "position": req.position.strip(),
        "phone": (req.phone or "").strip(),
        "year": (req.year or "").strip(),
        "department": (req.department or "").strip()
    })
    db_exec(conn, "UPDATE clubs SET members = ? WHERE UPPER(club_id) = ?", (json.dumps(members), req.club_id.upper()))
    conn.commit()
    conn.close()
    return {"success": True}


@app.post("/api/unicore/clubs/remove-member")
def remove_club_member(req: ClubMemberRemoveReq):
    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM clubs WHERE UPPER(club_id) = ?", (req.club_id.upper(),)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Club not found")
    members = json.loads(row["members"] or "[]")
    if 0 <= req.index < len(members):
        members.pop(req.index)
    db_exec(conn, "UPDATE clubs SET members = ? WHERE UPPER(club_id) = ?", (json.dumps(members), req.club_id.upper()))
    conn.commit()
    conn.close()
    return {"success": True}


@app.post("/api/unicore/clubs/add-gallery")
def add_club_gallery(req: ClubGalleryAddReq):
    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM clubs WHERE UPPER(club_id) = ?", (req.club_id.upper(),)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Club not found")
    gallery = json.loads(row["gallery"] or "[]")
    gallery.insert(0, {
        "media_type": req.media_type,
        "media_url": req.media_url.strip(),
        "caption": req.caption.strip(),
        "timestamp": datetime.now().strftime("%Y-%m-%d")
    })
    db_exec(conn, "UPDATE clubs SET gallery = ? WHERE UPPER(club_id) = ?", (json.dumps(gallery), req.club_id.upper()))
    conn.commit()
    conn.close()
    return {"success": True}


@app.get("/api/unicore/events")
def get_events():
    conn = get_conn()
    try:
        rows = db_exec(conn, "SELECT * FROM events ORDER BY date DESC").fetchall()
        album_rows = db_exec(
            conn,
            "SELECT album_id, event_id, album_url, caption, created_at FROM event_photo_albums ORDER BY created_at DESC"
        ).fetchall()
    finally:
        conn.close()

    albums_by_event: Dict[str, List[Dict]] = {}
    for album_row in album_rows:
        album = dict(album_row)
        albums_by_event.setdefault(album["event_id"], []).append(album)
    result = []
    for r in rows:
        d = dict(r)
        d["custom_fields"] = json.loads(d["custom_fields"] or "[]")
        d["rsvps"] = json.loads(d["rsvps"] or "[]")
        d["feedbacks"] = _event_feedback_without_identity(json.loads(d["feedbacks"] or "[]"))
        d["is_completed"] = _is_event_completed(d)
        d["photo_albums"] = albums_by_event.get(d["event_id"], [])
        d["ai_audit"] = json.loads(d["ai_audit"] or "{}") if d["ai_audit"] else None
        result.append(d)
    return result


@app.post("/api/unicore/events/propose")
def propose_event(req: EventRequisitionReq, request: Request):
    conn = get_conn()
    event_id = f"EVT-{random.randint(100, 999)}"
    db_exec(
        conn,
        """
        INSERT INTO events
            (event_id, club_id, title, date, start_time, end_time, venue, status, submitted_by,
             description, budget, funding_source, chief_guest, expected_attendance, logistics_needs,
             image_url, registration_link, custom_fields, rsvps, feedbacks, ai_audit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event_id, req.club_id.upper(), req.title, req.date, req.start_time, req.end_time, req.venue,
            "Pending Dean Approval", request.state.user["full_name"], req.description or "", req.budget or "Not Specified",
            req.funding_source or "Institute / Self", req.chief_guest or "None", req.expected_attendance or "100+",
            req.logistics_needs or "Standard Venue Setup", (req.image_url or "").strip(), (req.registration_link or "").strip(),
            json.dumps(req.custom_fields or []), json.dumps([]), json.dumps([]), json.dumps({})
        )
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Event proposal submitted to Dean for approval!"}


@app.post("/api/unicore/events/approve")
def approve_event(event_id: str = Query(...), action: str = Query(...), request: Request = None):
    if request.state.user.get("role") not in {"Dean", "Founder"}:
        raise HTTPException(status_code=403, detail="Dean authorization is required.")
    conn = get_conn()
    db_exec(conn, "UPDATE events SET status = ? WHERE event_id = ?", (action, event_id))
    conn.commit()
    conn.close()
    return {"success": True}


@app.post("/api/unicore/events/delete")
def delete_event(request: Request, event_id: str = Query(...)):
    account = request.state.user
    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM events WHERE event_id = ?", (event_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found.")
    if account["role"] == "ClubOrganizer" and row["club_id"].upper() != account["user_id"].upper():
        conn.close()
        raise HTTPException(status_code=403, detail="You can only delete your own club's events.")
    db_exec(conn, "DELETE FROM event_photo_albums WHERE event_id = ?", (event_id,))
    db_exec(conn, "DELETE FROM events WHERE event_id = ?", (event_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Event permanently deleted from everywhere."}


@app.post("/api/unicore/events/rsvp")
def rsvp_event(req: EventRsvpReq, request: Request):
    uid = request.state.user["user_id"].strip().upper()
    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM events WHERE event_id = ?", (req.event_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found")
    rsvps = json.loads(row["rsvps"] or "[]")
    if uid in [x.upper() for x in rsvps]:
        rsvps = [x for x in rsvps if x.upper() != uid]
        attending = False
    else:
        rsvps.append(uid)
        attending = True
    db_exec(conn, "UPDATE events SET rsvps = ? WHERE event_id = ?", (json.dumps(rsvps), req.event_id))
    conn.commit()
    conn.close()
    return {
        "success": True,
        "attending": attending,
        "rsvps": rsvps,
        "message": "RSVP Confirmed! You are marked as attending." if attending else "RSVP Cancelled."
    }


@app.post("/api/unicore/events/feedback")
def submit_event_feedback(req: EventFeedbackReq, request: Request):
    account = request.state.user
    if account["role"] != "Student":
        raise HTTPException(status_code=403, detail="Only students can submit event feedback.")
    if req.rating < 1 or req.rating > 5:
        raise HTTPException(status_code=400, detail="Choose a rating from 1 to 5.")
    review = req.review.strip()
    if not review or len(review) > 2000:
        raise HTTPException(status_code=400, detail="Feedback must be between 1 and 2,000 characters.")

    conn = get_conn()
    try:
        row = db_exec(conn, "SELECT * FROM events WHERE event_id = ?", (req.event_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")
        if not _is_event_completed(row):
            raise HTTPException(status_code=409, detail="Feedback is available after the event is completed.")
        feedbacks = json.loads(row["feedbacks"] or "[]")
        student_id = account["user_id"].upper()
        if any(str(feedback.get("student_id", "")).upper() == student_id for feedback in feedbacks if isinstance(feedback, dict)):
            raise HTTPException(status_code=409, detail="You have already submitted feedback for this event.")
        feedbacks.append({"student_id": student_id, "rating": req.rating, "review": review})
        all_r = [feedback["rating"] for feedback in feedbacks]
        avg_r = round(sum(all_r) / len(all_r), 1)
        rsvps = json.loads(row["rsvps"] or "[]")
        ai_audit = {"total_attendees": len(rsvps), "average_rating": avg_r, "sentiment": "Positive" if avg_r >= 4 else "Constructive"}
        db_exec(conn, "UPDATE events SET feedbacks = ?, ai_audit = ? WHERE event_id = ?", (json.dumps(feedbacks), json.dumps(ai_audit), req.event_id))
        conn.commit()
        row = db_exec(conn, "SELECT * FROM events WHERE event_id = ?", (req.event_id,)).fetchone()
        res = dict(row)
        res["custom_fields"] = json.loads(res["custom_fields"] or "[]")
        res["rsvps"] = json.loads(res["rsvps"] or "[]")
        res["feedbacks"] = _event_feedback_without_identity(json.loads(res["feedbacks"] or "[]"))
        res["ai_audit"] = json.loads(res["ai_audit"] or "{}")
        return {"success": True, "event": res}
    finally:
        conn.close()


@app.post("/api/unicore/events/photo-albums")
def add_event_photo_album(req: EventPhotoAlbumReq, request: Request):
    account = request.state.user
    if account["role"] != "ClubOrganizer":
        raise HTTPException(status_code=403, detail="Only the event's club organizer can add its photo album.")

    album_url = req.album_url.strip()
    parsed_url = urlparse(album_url)
    if parsed_url.scheme != "https" or (parsed_url.hostname or "").lower() != "drive.google.com":
        raise HTTPException(status_code=400, detail="Use a secure Google Drive album link.")
    caption = req.caption.strip()
    if not caption or len(caption) > 120:
        raise HTTPException(status_code=400, detail="Enter an album caption up to 120 characters.")

    conn = get_conn()
    try:
        event = db_exec(conn, "SELECT * FROM events WHERE event_id = ?", (req.event_id,)).fetchone()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found.")
        if str(event["club_id"]).upper() != account["user_id"].upper():
            raise HTTPException(status_code=403, detail="You can only add photos to your club's events.")
        if not _is_event_completed(event):
            raise HTTPException(status_code=409, detail="Photo albums can be published after the event is completed.")

        album = {
            "album_id": f"ALB-{uuid.uuid4().hex[:12].upper()}",
            "event_id": req.event_id,
            "album_url": album_url,
            "caption": caption,
            "created_at": datetime.now().isoformat(timespec="seconds"),
        }
        db_exec(
            conn,
            "INSERT INTO event_photo_albums (album_id, event_id, club_id, album_url, caption, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (album["album_id"], req.event_id, account["user_id"], album_url, caption, album["created_at"]),
        )
        conn.commit()
        return {"success": True, "album": album}
    finally:
        conn.close()


@app.get("/api/notices")
def get_notices(request: Request):
    account = request.state.user
    conn = get_conn()
    if account["role"] == "Student":
        rows = db_exec(conn, "SELECT * FROM notices WHERE status = 'Approved' ORDER BY created_at DESC").fetchall()
    elif account["role"] == "ClubOrganizer":
        rows = db_exec(conn, "SELECT * FROM notices WHERE UPPER(club_id) = ? ORDER BY created_at DESC", (account["user_id"].upper(),)).fetchall()
    else:
        rows = db_exec(conn, "SELECT * FROM notices ORDER BY created_at DESC").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["custom_fields"] = json.loads(d["custom_fields"] or "[]")
        result.append(d)
    return result


@app.post("/api/notices/propose")
def propose_notice(req: NoticeCreateReq, request: Request):
    notice_id = f"NOT-{random.randint(500, 999)}"
    created_at = datetime.now().strftime("%Y-%m-%d")
    conn = get_conn()
    db_exec(
        conn,
        """
        INSERT INTO notices
            (notice_id, club_id, title, message, target_branch, target_year, image_url,
             registration_link, custom_fields, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            notice_id, request.state.user["user_id"].upper(), req.title, req.message,
            req.target_branch, req.target_year, (req.image_url or "").strip(),
            (req.registration_link or "").strip(), json.dumps(req.custom_fields or []),
            "Pending Dean Approval", created_at
        )
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Notice submitted to Dean for approval!"}


@app.post("/api/notices/approve")
def approve_notice(notice_id: str = Query(...), action: str = Query(...), request: Request = None):
    if request.state.user.get("role") not in {"Dean", "Founder"}:
        raise HTTPException(status_code=403, detail="Dean authorization is required.")
    conn = get_conn()
    db_exec(conn, "UPDATE notices SET status = ? WHERE notice_id = ?", (action, notice_id))
    conn.commit()
    conn.close()
    return {"success": True}


@app.post("/api/notices/delete")
def delete_notice(request: Request, notice_id: str = Query(...)):
    account = request.state.user
    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM notices WHERE notice_id = ?", (notice_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Notice not found.")
    if account["role"] == "ClubOrganizer" and row["club_id"].upper() != account["user_id"].upper():
        conn.close()
        raise HTTPException(status_code=403, detail="You can only delete your own club's notices.")
    db_exec(conn, "DELETE FROM notices WHERE notice_id = ?", (notice_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Notice permanently deleted from everywhere."}


@app.post("/api/complaints/delete")
def delete_complaint(ticket_id: str = Query(...), request: Request = None):
    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM complaints WHERE ticket_id = ?", (ticket_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Complaint not found.")
    user = request.state.user
    if user["role"] == "Student" and row["student_id"].upper() != user["user_id"].upper():
        conn.close()
        raise HTTPException(status_code=403, detail="You can only delete your own complaints.")
    db_exec(conn, "DELETE FROM complaints WHERE ticket_id = ?", (ticket_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Complaint deleted."}