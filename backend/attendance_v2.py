import csv
import base64
import hashlib
import hmac
import io
import json
import logging
import os
import re
import secrets
import smtplib
import uuid
from datetime import date as Date, datetime, time as DateTimeTime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field
from cryptography.exceptions import InvalidSignature
from cryptography.fernet import InvalidToken
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/attendance-v2", tags=["attendance-v2"])
reverse_ble_router = APIRouter(prefix="/api/attendance", tags=["reverse-ble"])

TABLES = {
    "attendance_v2_beacons": """
        CREATE TABLE IF NOT EXISTS attendance_v2_beacons (
            college_id TEXT NOT NULL, tenant_id TEXT NOT NULL, id TEXT NOT NULL,
            name TEXT NOT NULL, scope TEXT NOT NULL CHECK (scope IN ('CLASS', 'HOSTEL')),
            owner_id TEXT NOT NULL, uuid TEXT NOT NULL, major INTEGER NOT NULL,
            minor INTEGER NOT NULL, min_rssi INTEGER NOT NULL DEFAULT -78,
            beacon_code TEXT NOT NULL DEFAULT '', signing_secret_enc TEXT NOT NULL DEFAULT '',
            hostel_block TEXT NOT NULL DEFAULT '', wing_name TEXT NOT NULL DEFAULT '',
            is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
            PRIMARY KEY (college_id, id)
        )
    """,
    "attendance_v2_courses": """
        CREATE TABLE IF NOT EXISTS attendance_v2_courses (
            college_id TEXT NOT NULL, tenant_id TEXT NOT NULL, id TEXT NOT NULL,
            code TEXT NOT NULL, title TEXT NOT NULL, faculty_id TEXT NOT NULL,
            default_beacon_id TEXT, created_at TEXT NOT NULL,
            PRIMARY KEY (college_id, id), UNIQUE (college_id, code)
        )
    """,
    "attendance_v2_course_enrollments": """
        CREATE TABLE IF NOT EXISTS attendance_v2_course_enrollments (
            college_id TEXT NOT NULL, tenant_id TEXT NOT NULL, id TEXT NOT NULL,
            course_id TEXT NOT NULL, student_id TEXT, roll_no TEXT NOT NULL,
            student_name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
            PRIMARY KEY (college_id, id), UNIQUE (course_id, roll_no)
        )
    """,
    "attendance_v2_hostel_wing_members": """
        CREATE TABLE IF NOT EXISTS attendance_v2_hostel_wing_members (
            college_id TEXT NOT NULL, tenant_id TEXT NOT NULL, id TEXT NOT NULL,
            wing_name TEXT NOT NULL, hostel_block TEXT NOT NULL DEFAULT '',
            room_no TEXT NOT NULL, student_id TEXT,
            roll_no TEXT NOT NULL, student_name TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL, PRIMARY KEY (college_id, id),
            UNIQUE (tenant_id, wing_name, roll_no)
        )
    """,
    "attendance_v2_sessions": """
        CREATE TABLE IF NOT EXISTS attendance_v2_sessions (
            college_id TEXT NOT NULL, tenant_id TEXT NOT NULL, id TEXT NOT NULL,
            scope TEXT NOT NULL CHECK (scope IN ('CLASS', 'HOSTEL')),
            course_id TEXT, department TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '',
            division TEXT NOT NULL DEFAULT '', wing_name TEXT, hostel_block TEXT NOT NULL DEFAULT '',
            beacon_id TEXT NOT NULL, beacon_ids_json TEXT NOT NULL DEFAULT '[]',
            created_by TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
            expires_at TEXT, current_nonce TEXT NOT NULL, nonce_expires_at TEXT NOT NULL,
            ble_nonce TEXT NOT NULL DEFAULT '', ble_nonce_expires_at TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL, closed_at TEXT,
            PRIMARY KEY (college_id, id)
        )
    """,
    "attendance_v2_session_roster": """
        CREATE TABLE IF NOT EXISTS attendance_v2_session_roster (
            college_id TEXT NOT NULL, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL,
            student_id TEXT NOT NULL, roll_no TEXT NOT NULL, student_name TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL, PRIMARY KEY (college_id, session_id, student_id)
        )
    """,
    "attendance_v2_records": """
        CREATE TABLE IF NOT EXISTS attendance_v2_records (
            college_id TEXT NOT NULL, id TEXT NOT NULL, session_id TEXT NOT NULL,
            student_id TEXT NOT NULL, roll_no TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('PRESENT', 'ABSENT')),
            method TEXT, measured_rssi INTEGER, override_reason TEXT,
            marked_at TEXT, PRIMARY KEY (college_id, id),
            UNIQUE (session_id, student_id)
        )
    """,
    "attendance_v2_record_audit": """
        CREATE TABLE IF NOT EXISTS attendance_v2_record_audit (
            college_id TEXT NOT NULL, tenant_id TEXT NOT NULL, id TEXT NOT NULL,
            session_id TEXT NOT NULL, student_id TEXT NOT NULL,
            previous_status TEXT, new_status TEXT NOT NULL,
            reason TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
            PRIMARY KEY (college_id, id)
        )
    """,
    "attendance_v2_student_devices": """
        CREATE TABLE IF NOT EXISTS attendance_v2_student_devices (
            college_id TEXT NOT NULL, student_id TEXT NOT NULL,
            webauthn_credential_id TEXT NOT NULL, public_key_cbor TEXT NOT NULL,
            sign_count INTEGER NOT NULL DEFAULT 0,
            reference_face_embedding_enc TEXT NOT NULL,
            ble_secret_enc TEXT NOT NULL DEFAULT '',
            locked_at TEXT NOT NULL, approved_by TEXT NOT NULL,
            PRIMARY KEY (college_id, student_id),
            UNIQUE (college_id, webauthn_credential_id)
        )
    """,
    "attendance_v2_ble_batches": """
        CREATE TABLE IF NOT EXISTS attendance_v2_ble_batches (
            college_id TEXT NOT NULL, batch_id TEXT NOT NULL, session_id TEXT NOT NULL,
            beacon_id TEXT NOT NULL, imported_at TEXT NOT NULL,
            PRIMARY KEY (college_id, batch_id)
        )
    """,
    "attendance_v2_staff_offline_keys": """
        CREATE TABLE IF NOT EXISTS attendance_v2_staff_offline_keys (
            college_id TEXT NOT NULL, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,
            key_id TEXT NOT NULL, public_key_der TEXT NOT NULL, created_at TEXT NOT NULL,
            revoked_at TEXT, PRIMARY KEY (college_id, actor_id, key_id)
        )
    """,
    "attendance_v2_offline_session_metadata": """
        CREATE TABLE IF NOT EXISTS attendance_v2_offline_session_metadata (
            college_id TEXT NOT NULL, session_id TEXT NOT NULL, faculty_key_id TEXT NOT NULL,
            offline_session_json TEXT NOT NULL, faculty_signature TEXT NOT NULL, created_at TEXT NOT NULL,
            PRIMARY KEY (college_id, session_id)
        )
    """,
    "attendance_v2_ios_ble_tokens": """
        CREATE TABLE IF NOT EXISTS attendance_v2_ios_ble_tokens (
            college_id TEXT NOT NULL, token_hash TEXT NOT NULL, session_id TEXT NOT NULL,
            student_id TEXT NOT NULL, roll_id TEXT NOT NULL, expires_at TEXT NOT NULL,
            consumed_at TEXT, created_at TEXT NOT NULL,
            PRIMARY KEY (college_id, token_hash)
        )
    """,
    "attendance_v2_enrollment_windows": """
        CREATE TABLE IF NOT EXISTS attendance_v2_enrollment_windows (
            college_id TEXT NOT NULL, student_id TEXT NOT NULL, approved_by TEXT NOT NULL,
            expires_at TEXT NOT NULL, PRIMARY KEY (college_id, student_id)
        )
    """,
    "attendance_v2_pre_approved_staff": """
        CREATE TABLE IF NOT EXISTS attendance_v2_pre_approved_staff (
            college_id TEXT NOT NULL, tenant_id TEXT NOT NULL, id TEXT NOT NULL,
            name TEXT NOT NULL, email TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('FACULTY', 'WARDEN')),
            department_or_block TEXT NOT NULL, created_by TEXT NOT NULL,
            claimed_by_user_id TEXT, created_at TEXT NOT NULL,
            PRIMARY KEY (college_id, id), UNIQUE (tenant_id, email)
        )
    """,
    "attendance_v2_report_email_codes": """
        CREATE TABLE IF NOT EXISTS attendance_v2_report_email_codes (
            college_id TEXT NOT NULL, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
            email TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0, last_sent_at TEXT NOT NULL,
            PRIMARY KEY (college_id, user_id)
        )
    """,
}

INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_beacons_owner ON attendance_v2_beacons (college_id, owner_id, scope)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_v2_beacons_code ON attendance_v2_beacons (college_id, beacon_code) WHERE beacon_code != ''",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_courses_faculty ON attendance_v2_courses (college_id, faculty_id)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_enrollments_student ON attendance_v2_course_enrollments (college_id, student_id, course_id)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_wing_student ON attendance_v2_hostel_wing_members (college_id, student_id, hostel_block, wing_name)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_sessions_expiry ON attendance_v2_sessions (college_id, status, expires_at)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_session_roster_student ON attendance_v2_session_roster (college_id, student_id, session_id)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_records_student ON attendance_v2_records (college_id, student_id, session_id)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_staff_email ON attendance_v2_pre_approved_staff (college_id, email)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_report_email_expiry ON attendance_v2_report_email_codes (college_id, expires_at)",
)


class BeaconInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scope: str
    uuid: Optional[str] = Field(default=None, max_length=80)
    major: int = Field(default=1, ge=0, le=65535)
    minor: int = Field(default=1, ge=0, le=65535)
    min_rssi: int = Field(default=-78, ge=-85, le=-65)
    is_active: bool = True
    hostel_block: str = Field(default="", max_length=160)
    wing_name: str = Field(default="", max_length=80)


class CourseInput(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    title: str = Field(min_length=1, max_length=160)
    default_beacon_id: Optional[str] = None


class StudentInput(BaseModel):
    roll_no: str = Field(min_length=1, max_length=40)
    student_name: str = Field(default="", max_length=160)


class SessionInput(BaseModel):
    scope: str
    beacon_id: str
    beacon_ids: Optional[list[str]] = None
    course_id: Optional[str] = None
    department: Optional[str] = Field(default=None, max_length=120)
    year: Optional[str] = Field(default=None, max_length=40)
    division: Optional[str] = Field(default=None, max_length=80)
    wing_name: Optional[str] = None
    hostel_block: Optional[str] = None
    duration_minutes: Optional[int] = None


class OverrideInput(BaseModel):
    student_id: str
    status: str
    reason: str = Field(min_length=3, max_length=500)


class EnrollmentWindowInput(BaseModel):
    student_id: str
    duration_seconds: int = Field(default=120, ge=30, le=300)


class StaffInput(BaseModel):
    user_id: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=1, max_length=160)
    email: str = Field(min_length=3, max_length=254)
    role: str
    department_or_block: str = Field(min_length=1, max_length=160)

class ReportEmailStartInput(BaseModel):
    email: str = Field(min_length=5, max_length=254)

class ReportEmailVerifyInput(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    code: str = Field(min_length=6, max_length=6)


class RegistrationInput(BaseModel):
    challenge_id: str
    credential: dict
    reference_image_base64: str = Field(min_length=100, max_length=6_000_000)
    ble_public_key: Optional[str] = Field(default=None, min_length=80, max_length=1024)


class CheckInInput(BaseModel):
    session_id: str
    session_nonce: str
    credential: dict
    uuid: str
    major: int
    minor: int
    rssi: int
    live_image_base64: str = Field(min_length=100, max_length=6_000_000)


class ReverseBleBatchInput(BaseModel):
    batch_id: str = Field(min_length=16, max_length=80)
    session_id: str = Field(min_length=4, max_length=100)
    beacon_id: str = Field(min_length=4, max_length=100)
    raw_records_json: str = Field(min_length=2, max_length=256_000)
    esp32_batch_signature: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    offline_session_json: Optional[str] = Field(default=None, min_length=2, max_length=128_000)
    faculty_key_id: Optional[str] = Field(default=None, min_length=16, max_length=64)
    faculty_signature: Optional[str] = Field(default=None, min_length=40, max_length=256)


class OfflineFacultyKeyInput(BaseModel):
    public_key: str = Field(min_length=80, max_length=1024)


class OfflineStudentCheckInInput(BaseModel):
    session_id: str = Field(min_length=4, max_length=100)
    credential: dict
    face_embedding: list[float] = Field(min_length=128, max_length=128)


class IOSBleTokenInput(BaseModel):
    session_nonce: str = Field(min_length=16, max_length=128)
    credential: dict
    live_image_base64: str = Field(min_length=100, max_length=6_000_000)

def _now():
    return datetime.now(timezone.utc)


def _now_text():
    return _now().isoformat(timespec="seconds")


def _parse_time(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _session_ble_expiry(session):
    expires = _parse_time(session.get("expires_at"))
    if expires:
        return int(expires.timestamp())
    created = _parse_time(session.get("created_at")) or _now()
    return int((created + timedelta(hours=24)).timestamp())


def _hmac_digest(key, message):
    return hmac.new(key, message, hashlib.sha256).digest()


def _webauthn_challenge(conn, backend, challenge_id, user_id, purpose):
    row = backend["db_exec"](
        conn,
        """
        SELECT * FROM webauthn_challenges
        WHERE college_id = ? AND challenge_id = ? AND UPPER(user_id) = ?
            AND purpose = ? AND expires_at > ?
        """,
        (
            backend["ACTIVE_COLLEGE_ID"].get(), challenge_id, user_id.upper(),
            purpose, _now_text(),
        ),
    ).fetchone()
    return dict(row) if row else None


def _tenant_id(request):
    return str(request.state.college_id).upper()


def _user(request):
    return request.state.user


def _require_roles(request, *roles):
    role = str(_user(request).get("role") or "").upper()
    if role not in {item.upper() for item in roles}:
        raise HTTPException(status_code=403, detail="You are not allowed to perform this attendance action.")
    return _user(request)


def _require_feature(request, key):
    modules = request.state.tenant.get("modules", {})
    if not modules.get(key, False):
        raise HTTPException(status_code=404, detail="This attendance feature is not enabled for your college.")


def _require_attendance_enabled(request):
    modules = request.state.tenant.get("modules", {})
    if not modules.get("class_attendance", False) and not modules.get("hostel_attendance", False):
        raise HTTPException(status_code=404, detail="Attendance is not enabled for your college.")


def _new_id(prefix):
    return f"{prefix}-{uuid.uuid4().hex}"


def _wrap_ble_secret(public_key_b64, secret):
    try:
        public_key_der = base64.b64decode(public_key_b64, validate=True)
        public_key = serialization.load_der_public_key(public_key_der)
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=400, detail="The Android BLE key-agreement public key is invalid.") from error
    if not isinstance(public_key, ec.EllipticCurvePublicKey) or not isinstance(public_key.curve, ec.SECP256R1):
        raise HTTPException(status_code=400, detail="The BLE key-agreement key must use P-256.")
    ephemeral_key = ec.generate_private_key(ec.SECP256R1())
    shared_secret = ephemeral_key.exchange(ec.ECDH(), public_key)
    salt = secrets.token_bytes(16)
    wrapping_key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=b"vidyut-attendance-ble-key-v1",
    ).derive(shared_secret)
    nonce = secrets.token_bytes(12)
    aad = b"vidyut-attendance-ble-key-v1"
    ciphertext = AESGCM(wrapping_key).encrypt(nonce, secret, aad)
    ephemeral_public_key = ephemeral_key.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return {
        "ble_key_ephemeral_public_key": base64.b64encode(ephemeral_public_key).decode("ascii"),
        "ble_key_salt": base64.b64encode(salt).decode("ascii"),
        "ble_key_nonce": base64.b64encode(nonce).decode("ascii"),
        "ble_key_ciphertext": base64.b64encode(ciphertext).decode("ascii"),
    }


def _new_beacon_credentials(conn, backend):
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    while True:
        beacon_code = secrets.token_hex(4).upper()
        exists = backend["db_exec"](
            conn,
            "SELECT 1 FROM attendance_v2_beacons WHERE college_id = ? AND beacon_code = ?",
            (college_id, beacon_code),
        ).fetchone()
        if not exists:
            break
    secret = secrets.token_hex(32)
    encrypted = backend["_beacon_signing_cipher"]().encrypt(secret.encode("ascii")).decode("ascii")
    return beacon_code, encrypted, secret


def _validate_rotating_beacon(beacon, presented_uuid, backend, now=None):
    compact = re.sub(r"[^0-9a-f]", "", str(presented_uuid or "").lower())
    if (
        len(compact) != 32
        or not beacon.get("beacon_code")
        or not beacon.get("signing_secret_enc")
        or compact[:8].upper() != beacon["beacon_code"].upper()
    ):
        return False
    try:
        slot = int(compact[8:16], 16)
        signature = bytes.fromhex(compact[16:])
        secret_hex = backend["_beacon_signing_cipher"]().decrypt(
            beacon["signing_secret_enc"].encode("ascii")
        ).decode("ascii")
        secret = bytes.fromhex(secret_hex)
    except (ValueError, TypeError, UnicodeDecodeError, UnicodeEncodeError, InvalidToken):
        return False
    if len(secret) != 32:
        return False
    current_slot = int((now or _now()).timestamp() // 30)
    if slot not in {current_slot - 1, current_slot, current_slot + 1}:
        return False
    expected = hmac.new(
        secret,
        f'{beacon["beacon_code"].upper()}:{slot}'.encode("ascii"),
        hashlib.sha256,
    ).digest()[:8]
    return hmac.compare_digest(signature, expected)


def _validate_scope(scope):
    normalized = str(scope).upper()
    if normalized not in {"CLASS", "HOSTEL"}:
        raise HTTPException(status_code=422, detail="Scope must be CLASS or HOSTEL.")
    return normalized


def _sync_v2_rls(conn, backend):
    db_exec = backend["db_exec"]
    for table_name, statement in TABLES.items():
        db_exec(conn, statement)
        if table_name == "attendance_v2_beacons":
            _ensure_column(conn, backend, table_name, "beacon_code", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(conn, backend, table_name, "signing_secret_enc", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(conn, backend, table_name, "hostel_block", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(conn, backend, table_name, "wing_name", "TEXT NOT NULL DEFAULT ''")
        elif table_name == "attendance_v2_hostel_wing_members":
            _ensure_column(conn, backend, table_name, "hostel_block", "TEXT NOT NULL DEFAULT ''")
        elif table_name == "attendance_v2_sessions":
            _ensure_column(conn, backend, table_name, "beacon_ids_json", "TEXT NOT NULL DEFAULT '[]'")
            _ensure_column(conn, backend, table_name, "hostel_block", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(conn, backend, table_name, "department", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(conn, backend, table_name, "year", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(conn, backend, table_name, "division", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(conn, backend, table_name, "ble_nonce", "TEXT NOT NULL DEFAULT ''")
            _ensure_column(conn, backend, table_name, "ble_nonce_expires_at", "TEXT NOT NULL DEFAULT ''")
        elif table_name == "attendance_v2_student_devices":
            _ensure_column(conn, backend, table_name, "ble_secret_enc", "TEXT NOT NULL DEFAULT ''")
        if backend["USE_POSTGRES"]:
            db_exec(conn, f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY")
            db_exec(conn, f"ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY")
            db_exec(conn, f"DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name}")
            db_exec(conn, f"""
                CREATE POLICY {table_name}_tenant_isolation ON {table_name}
                USING (college_id = current_setting('app.college_id', true)
                    OR current_setting('app.college_id', true) = '*')
                WITH CHECK (college_id = current_setting('app.college_id', true)
                    OR current_setting('app.college_id', true) = '*')
            """)
            db_exec(conn, f"DROP TRIGGER IF EXISTS {table_name}_set_college_id ON {table_name}")
            db_exec(conn, f"""
                CREATE TRIGGER {table_name}_set_college_id
                BEFORE INSERT ON {table_name} FOR EACH ROW
                EXECUTE FUNCTION set_active_college_id()
            """)
    for statement in INDEXES:
        db_exec(conn, statement)


def _ensure_column(conn, backend, table_name, column_name, definition):
    if backend["USE_POSTGRES"]:
        exists = backend["db_exec"](
            conn,
            "SELECT 1 FROM information_schema.columns WHERE table_name = ? AND column_name = ?",
            (table_name, column_name),
        ).fetchone()
    else:
        columns = backend["db_exec"](conn, f"PRAGMA table_info({table_name})").fetchall()
        exists = next((column for column in columns if column["name"] == column_name), None)
    if not exists:
        backend["db_exec"](
            conn, f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"
        )


def _course_for_user(conn, backend, course_id, actor, allow_admin=False):
    query = "SELECT * FROM attendance_v2_courses WHERE college_id = ? AND id = ?"
    row = backend["db_exec"](conn, query, (backend["ACTIVE_COLLEGE_ID"].get(), course_id)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Course not found.")
    if not allow_admin and str(row["faculty_id"]).upper() != str(actor["user_id"]).upper():
        raise HTTPException(status_code=403, detail="This course belongs to another faculty member.")
    return dict(row)


def _beacon(conn, backend, beacon_id, scope=None):
    row = backend["db_exec"](
        conn,
        "SELECT * FROM attendance_v2_beacons WHERE college_id = ? AND id = ?",
        (backend["ACTIVE_COLLEGE_ID"].get(), beacon_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Beacon not found.")
    result = dict(row)
    if scope and result["scope"] != scope:
        raise HTTPException(status_code=400, detail=f"A {scope.lower()} beacon is required.")
    return result


def _session_roster(conn, backend, session):
    db_exec = backend["db_exec"]
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    if session["scope"] == "CLASS":
        if session.get("department") and session.get("year") and session.get("division"):
            rows = db_exec(
                conn,
                """
                SELECT student_id, roll_no, student_name
                FROM attendance_v2_session_roster
                WHERE college_id = ? AND session_id = ?
                ORDER BY UPPER(roll_no), roll_no
                """,
                (college_id, session["id"]),
            ).fetchall()
        else:
            rows = db_exec(
                conn,
                """
                SELECT student_id, roll_no, student_name FROM attendance_v2_course_enrollments
                WHERE college_id = ? AND course_id = ? ORDER BY UPPER(roll_no), roll_no
                """,
                (college_id, session["course_id"]),
            ).fetchall()
    else:
        rows = db_exec(
            conn,
            """
            SELECT student_id, roll_no, student_name FROM attendance_v2_hostel_wing_members
            WHERE college_id = ? AND (? = 'ALL' OR LOWER(wing_name) = LOWER(?))
                AND (? = '' OR LOWER(hostel_block) = LOWER(?))
            ORDER BY room_no, roll_no
            """,
            (
                college_id, session["wing_name"], session["wing_name"], session.get("hostel_block") or "",
                session.get("hostel_block") or "",
            ),
        ).fetchall()
    records = db_exec(
        conn,
        "SELECT * FROM attendance_v2_records WHERE college_id = ? AND session_id = ?",
        (college_id, session["id"]),
    ).fetchall()
    by_student = {str(item["student_id"]).upper(): dict(item) for item in records}
    result = []
    for row in rows:
        student_id = row["student_id"]
        record = by_student.get(str(student_id).upper()) if student_id else None
        result.append({
            "student_id": student_id,
            "roll_no": row["roll_no"],
            "student_name": row["student_name"],
            "status": record["status"] if record else "ABSENT",
            "method": record.get("method") if record else None,
            "marked_at": record.get("marked_at") if record else None,
            "override_reason": record.get("override_reason") if record else None,
        })
    return result


def _close_session(conn, backend, session):
    db_exec = backend["db_exec"]
    now = _now_text()
    for student in _session_roster(conn, backend, session):
        if student["student_id"] and student["status"] == "ABSENT" and not student["method"]:
            db_exec(
                conn,
                """
                INSERT INTO attendance_v2_records
                    (college_id, id, session_id, student_id, roll_no, status, method, measured_rssi, override_reason, marked_at)
                VALUES (?, ?, ?, ?, ?, 'ABSENT', 'NO_CHECK_IN', NULL, NULL, ?)
                ON CONFLICT (session_id, student_id) DO NOTHING
                """,
                (
                    backend["ACTIVE_COLLEGE_ID"].get(), _new_id("REC"), session["id"],
                    student["student_id"], student["roll_no"], now,
                ),
            )
    db_exec(
        conn,
        "UPDATE attendance_v2_sessions SET status = 'CLOSED', closed_at = ? WHERE college_id = ? AND id = ? AND status = 'OPEN'",
        (now, backend["ACTIVE_COLLEGE_ID"].get(), session["id"]),
    )
    session["status"] = "CLOSED"
    session["closed_at"] = now
    return session


def _build_report_pdf(report):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    page_width, page_height = A4
    rows = report["students"]
    present = sum(item["status"] == "PRESENT" for item in rows)
    total = len(rows)
    absent = total - present
    left = 32
    pdf.setTitle(f'{report["course_code"]} attendance report')
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(left, page_height - 38, "Vidyut OS Attendance Report")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(left, page_height - 56, str(report["institute"])[:110])
    pdf.setFont("Helvetica-Bold", 11)
    class_label = f'  |  {report["class_group"]}' if report.get("class_group") else ""
    pdf.drawString(left, page_height - 76, f'{report["course_code"]}  |  {report["course_title"]}{class_label}'[:100])
    pdf.setFont("Helvetica", 8)
    pdf.drawString(
        left, page_height - 94,
        f'{report.get("owner_label", "Faculty")}: {report["faculty_name"]}    Date: {report["date"]}    Room / Beacon: {report["beacon_name"]}'[:140],
    )
    pdf.drawString(
        left, page_height - 110,
        f"Total {total}    Present {present} ({present * 100 / total if total else 0:.1f}%)    "
        f"Absent {absent} ({absent * 100 / total if total else 0:.1f}%)    Manual overrides * {report['overrides']}",
    )
    pdf.setStrokeColorRGB(.82, .85, .89)
    pdf.line(left, page_height - 120, page_width - left, page_height - 120)

    columns = (left, 220, 408)
    rows_per_column = 50
    for page_start in range(0, total, rows_per_column * len(columns)):
        if page_start:
            pdf.showPage()
            pdf.setFont("Helvetica-Bold", 10)
            pdf.drawString(left, page_height - 32, f'{report["course_code"]} attendance · continued')
        for column, x in enumerate(columns):
            y = page_height - (137 if page_start == 0 else 52)
            pdf.setFont("Helvetica-Bold", 7)
            pdf.drawString(x, y, "Roll No.       Name                     P/A")
            pdf.setFont("Helvetica", 7)
            for row_index in range(rows_per_column):
                index = page_start + column * rows_per_column + row_index
                if index >= total:
                    break
                student = rows[index]
                marker = "P" if student["status"] == "PRESENT" else "A"
                if student["method"] == "MANUAL_OVERRIDE":
                    marker += "*"
                roll = str(student["roll_no"] or "")[:14]
                name = str(student["student_name"] or "")[:22]
                y -= 12
                pdf.drawString(x, y, f"{roll:<14} {name:<22} {marker}")

    pdf.showPage()
    pdf.save()
    return output.getvalue()


def _email_report(report):
    host = os.getenv("SMTP_HOST", "").strip()
    sender = os.getenv("SMTP_FROM_EMAIL", "").strip()
    recipient = str(report.get("report_email") or "").strip()
    if not report.get("report_email_verified") or not recipient:
        logger.info("Attendance PDF email skipped: report recipient is not verified for %s.", report.get("owner_id"))
        return False
    if not host or not sender:
        raise RuntimeError("Attendance PDF email requires SMTP_HOST and SMTP_FROM_EMAIL.")
    message = EmailMessage()
    message["Subject"] = f'Attendance report: {report["course_code"]} - {report["date"]}'
    message["From"] = formataddr((os.getenv("SMTP_FROM_NAME", "Campus Attendance"), sender))
    message["To"] = recipient
    message.set_content("The attached PDF contains the attendance report for your attendance session.")
    filename_prefix = "".join(
        character if character.isalnum() or character in "-_" else "-"
        for character in str(report["course_code"])
    ).strip("-") or "attendance"
    message.add_attachment(
        _build_report_pdf(report),
        maintype="application",
        subtype="pdf",
        filename=f'{filename_prefix}-{report["date"][:10]}-attendance.pdf',
    )
    port = int(os.getenv("SMTP_PORT", "587"))
    with smtplib.SMTP(host, port, timeout=20) as server:
        server.starttls()
        username = os.getenv("SMTP_USERNAME", "")
        password = os.getenv("SMTP_PASSWORD", "")
        if username:
            server.login(username, password)
        server.send_message(message)
    return True


def _email_report_safely(report):
    try:
        _email_report(report)
    except Exception:
        logger.exception("Could not email attendance report for session %s", report.get("session_id"))


def _report_data(conn, backend, session):
    db_exec = backend["db_exec"]
    beacon_ids = json.loads(session.get("beacon_ids_json") or "[]") or [session["beacon_id"]]
    beacon_names = [
        _beacon(conn, backend, beacon_id)["name"]
        for beacon_id in beacon_ids
    ]
    students = _session_roster(conn, backend, session)
    audit_count = db_exec(
        conn,
        "SELECT COUNT(*) AS count FROM attendance_v2_record_audit WHERE college_id = ? AND session_id = ?",
        (backend["ACTIVE_COLLEGE_ID"].get(), session["id"]),
    ).fetchone()["count"]
    report_date = _parse_time(session.get("created_at")) or _now()
    tenant = backend["get_tenant_by_id"](backend["ACTIVE_COLLEGE_ID"].get())
    tenant_zone = ZoneInfo((tenant or {}).get("timezone") or "UTC")
    if session["scope"] == "CLASS":
        course = None
        if session.get("course_id"):
            course = db_exec(
                conn,
                "SELECT * FROM attendance_v2_courses WHERE college_id = ? AND id = ?",
                (backend["ACTIVE_COLLEGE_ID"].get(), session["course_id"]),
            ).fetchone()
            if not course:
                return None
        owner_id = session["created_by"]
        owner = db_exec(
            conn,
            """
            SELECT full_name, attendance_report_email, attendance_report_email_verified
            FROM users WHERE college_id = ? AND UPPER(user_id) = ?
            """,
            (backend["ACTIVE_COLLEGE_ID"].get(), str(owner_id).upper()),
        ).fetchone()
        group_label = " · ".join(
            item for item in (
                session.get("department"), session.get("year"), session.get("division")
            ) if item
        )
        course_code = course["code"] if course else group_label or "Class"
        course_title = course["title"] if course else "Class attendance"
        owner_label = "Faculty"
        owner_name = owner["full_name"] if owner else owner_id
    else:
        owner = db_exec(
            conn,
            """
            SELECT full_name, attendance_report_email, attendance_report_email_verified
            FROM users WHERE college_id = ? AND UPPER(user_id) = ?
            """,
            (backend["ACTIVE_COLLEGE_ID"].get(), str(session["created_by"]).upper()),
        ).fetchone()
        course_code = f'{session.get("hostel_block") or "Hostel"} · {session.get("wing_name") or "Wing"}'
        course_title = "Night roll call"
        owner_id = session["created_by"]
        owner_label = "Warden"
        owner_name = owner["full_name"] if owner else owner_id
    if session["scope"] == "CLASS":
        students.sort(key=lambda item: (str(item.get("roll_no") or "").casefold()))
    return {
        "session_id": session["id"],
        "scope": session["scope"],
        "owner_id": owner_id,
        "owner_label": owner_label,
        "institute": (tenant or {}).get("college_name", "Institute"),
        "course_code": course_code,
        "course_title": course_title,
        "class_group": group_label if session["scope"] == "CLASS" else "",
        "faculty_name": owner_name,
        "report_email": str(owner["attendance_report_email"] or "") if owner else "",
        "report_email_verified": bool(owner["attendance_report_email_verified"]) if owner else False,
        "date": report_date.astimezone(tenant_zone).strftime("%Y-%m-%d %H:%M"),
        "beacon_name": ", ".join(beacon_names),
        "students": students,
        "overrides": sum(item["method"] == "MANUAL_OVERRIDE" for item in students),
        "audit_entries": int(audit_count or 0),
    }


async def expire_sessions_worker(backend):
    while True:
        await __import__("asyncio").sleep(10)
        tenant_token = backend["ACTIVE_COLLEGE_ID"].set("*")
        conn = None
        try:
            conn = backend["get_conn"]()
            rows = backend["db_exec"](
                conn,
                "SELECT * FROM attendance_v2_sessions WHERE status = 'OPEN' AND expires_at IS NOT NULL",
            ).fetchall()
            for row in rows:
                session = dict(row)
                expiry = _parse_time(session.get("expires_at"))
                if expiry and expiry <= _now():
                    session_token = backend["ACTIVE_COLLEGE_ID"].set(session["college_id"])
                    try:
                        _close_session(conn, backend, session)
                        report = _report_data(conn, backend, session)
                        conn.commit()
                        if report and report.get("report_email_verified") and report.get("report_email"):
                            await __import__("asyncio").to_thread(_email_report_safely, report)
                    finally:
                        backend["ACTIVE_COLLEGE_ID"].reset(session_token)
        except Exception:
            if conn:
                conn.rollback()
            logger.exception("Attendance-v2 session expiry worker failed")
        finally:
            if conn:
                conn.close()
            backend["ACTIVE_COLLEGE_ID"].reset(tenant_token)


@router.get("/beacons")
def list_beacons(request: Request, scope: Optional[str] = None):
    actor = _require_roles(request, "Dean", "Faculty", "Warden", "BeaconManager")
    db_exec = request.app.state.attendance_v2_backend["db_exec"]
    conn = request.app.state.attendance_v2_backend["get_conn"]()
    try:
        if scope:
            _require_feature(request, "class_attendance" if _validate_scope(scope) == "CLASS" else "hostel_attendance")
        query = "SELECT * FROM attendance_v2_beacons WHERE college_id = ?"
        params = [request.app.state.attendance_v2_backend["ACTIVE_COLLEGE_ID"].get()]
        if scope:
            query += " AND scope = ?"
            params.append(_validate_scope(scope))
        else:
            enabled_scopes = []
            if request.state.tenant.get("modules", {}).get("class_attendance"):
                enabled_scopes.append("CLASS")
            if request.state.tenant.get("modules", {}).get("hostel_attendance"):
                enabled_scopes.append("HOSTEL")
            if not enabled_scopes:
                return []
            query += " AND scope IN (" + ", ".join("?" for _ in enabled_scopes) + ")"
            params.extend(enabled_scopes)
        if str(actor["role"]).upper() not in {"DEAN", "FOUNDER", "BEACONMANAGER"}:
            query += " AND (owner_id = ? OR scope = 'HOSTEL')"
            params.append(actor["user_id"])
        if str(actor["role"]).upper() == "WARDEN":
            query += " AND LOWER(hostel_block) = LOWER(?)"
            params.append(str(actor.get("hostel_block") or ""))
        rows = db_exec(conn, query + " ORDER BY created_at DESC", tuple(params)).fetchall()
        return [
            {
                key: value
                for key, value in dict(row).items()
                if key != "signing_secret_enc"
            } | {"is_provisioned": bool(row["beacon_code"] and row["signing_secret_enc"])}
            for row in rows
        ]
    finally:
        conn.close()


def _validate_beacon_assignment(scope, hostel_block, wing_name, request, backend):
    hostel_block = str(hostel_block or "").strip()
    wing_name = str(wing_name or "").strip()
    if scope == "CLASS":
        if hostel_block or wing_name:
            raise HTTPException(status_code=422, detail="Classroom beacons cannot be assigned to a hostel wing.")
        return "", ""
    if not hostel_block or not wing_name:
        raise HTTPException(status_code=422, detail="Choose a hostel and wing for a hostel beacon.")
    if str(request.state.user["role"]).upper() == "WARDEN":
        if hostel_block.casefold() != str(request.state.user.get("hostel_block") or "").casefold():
            raise HTTPException(status_code=403, detail="You can manage only beacons in your assigned hostel.")
    configured_wings = backend["configured_wings"](hostel_block)
    if configured_wings and not any(str(item).casefold() == wing_name.casefold() for item in configured_wings):
        raise HTTPException(status_code=422, detail="Choose a wing configured for this hostel.")
    if not configured_wings:
        raise HTTPException(status_code=422, detail="Configure this hostel and its wings before adding a beacon.")
    return hostel_block, wing_name


def _beacon_response(row, provisioning_secret=None):
    item = {
        key: value for key, value in dict(row).items()
        if key != "signing_secret_enc"
    }
    item["is_provisioned"] = bool(row["beacon_code"] and row["signing_secret_enc"])
    if provisioning_secret:
        item["provisioning_secret"] = provisioning_secret
    return item


@router.post("/beacons")
def create_beacon(body: BeaconInput, request: Request):
    actor = _require_roles(request, "Dean", "BeaconManager")
    backend = request.app.state.attendance_v2_backend
    scope = _validate_scope(body.scope)
    _require_feature(request, "class_attendance" if scope == "CLASS" else "hostel_attendance")
    hostel_block, wing_name = _validate_beacon_assignment(
        scope, body.hostel_block, body.wing_name, request, backend
    )
    conn = backend["get_conn"]()
    beacon_id = _new_id("BCN")
    try:
        beacon_code, signing_secret_enc, provisioning_secret = _new_beacon_credentials(conn, backend)
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_beacons
                (college_id, tenant_id, id, name, scope, owner_id, uuid, major, minor,
                 min_rssi, beacon_code, signing_secret_enc, hostel_block, wing_name,
                 is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), _tenant_id(request), beacon_id,
                body.name.strip(), scope, actor["user_id"],
                str(body.uuid or uuid.uuid4()), body.major, body.minor,
                body.min_rssi, beacon_code, signing_secret_enc, hostel_block,
                wing_name, int(body.is_active), _now_text(),
            ),
        )
        conn.commit()
        row = backend["db_exec"](conn, "SELECT * FROM attendance_v2_beacons WHERE college_id = ? AND id = ?", (backend["ACTIVE_COLLEGE_ID"].get(), beacon_id)).fetchone()
        return _beacon_response(row, provisioning_secret)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.patch("/beacons/{beacon_id}")
def update_beacon(beacon_id: str, body: BeaconInput, request: Request):
    actor = _require_roles(request, "Dean", "BeaconManager")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        current = _beacon(conn, backend, beacon_id)
        _require_feature(request, "class_attendance" if current["scope"] == "CLASS" else "hostel_attendance")
        if str(actor["role"]).upper() not in {"DEAN", "BEACONMANAGER"} and current["owner_id"] != actor["user_id"]:
            raise HTTPException(status_code=403, detail="Only the beacon owner or Dean can edit it.")
        scope = _validate_scope(body.scope)
        if scope != current["scope"]:
            raise HTTPException(status_code=400, detail="Beacon scope cannot be changed after creation.")
        hostel_block, wing_name = _validate_beacon_assignment(
            scope, body.hostel_block, body.wing_name, request, backend
        )
        backend["db_exec"](
            conn,
            """
            UPDATE attendance_v2_beacons
            SET name = ?, min_rssi = ?, hostel_block = ?, wing_name = ?, is_active = ?
            WHERE college_id = ? AND id = ?
            """,
            (
                body.name.strip(), body.min_rssi, hostel_block, wing_name,
                int(body.is_active), backend["ACTIVE_COLLEGE_ID"].get(), beacon_id,
            ),
        )
        conn.commit()
        return {"success": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.post("/beacons/{beacon_id}/toggle")
def toggle_beacon(beacon_id: str, request: Request):
    actor = _require_roles(request, "Dean", "BeaconManager")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        current = _beacon(conn, backend, beacon_id)
        _require_feature(request, "class_attendance" if current["scope"] == "CLASS" else "hostel_attendance")
        if str(actor["role"]).upper() not in {"DEAN", "BEACONMANAGER"} and current["owner_id"] != actor["user_id"]:
            raise HTTPException(status_code=403, detail="Only the beacon owner or Dean can change its status.")
        active = 0 if current["is_active"] else 1
        backend["db_exec"](
            conn, "UPDATE attendance_v2_beacons SET is_active = ? WHERE college_id = ? AND id = ?",
            (active, backend["ACTIVE_COLLEGE_ID"].get(), beacon_id),
        )
        conn.commit()
        return {"success": True, "is_active": bool(active)}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.post("/beacons/{beacon_id}/provision")
def provision_beacon(beacon_id: str, request: Request):
    _require_roles(request, "Dean", "BeaconManager")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        beacon = _beacon(conn, backend, beacon_id)
        open_sessions = backend["db_exec"](
            conn,
            "SELECT beacon_id, beacon_ids_json FROM attendance_v2_sessions WHERE college_id = ? AND status = 'OPEN'",
            (backend["ACTIVE_COLLEGE_ID"].get(),),
        ).fetchall()
        if any(
            beacon_id == row["beacon_id"]
            or beacon_id in (json.loads(row["beacon_ids_json"] or "[]"))
            for row in open_sessions
        ):
            raise HTTPException(status_code=409, detail="Close active attendance sessions before rotating this beacon key.")
        beacon_code, signing_secret_enc, provisioning_secret = _new_beacon_credentials(conn, backend)
        backend["db_exec"](
            conn,
            "UPDATE attendance_v2_beacons SET beacon_code = ?, signing_secret_enc = ? WHERE college_id = ? AND id = ?",
            (beacon_code, signing_secret_enc, backend["ACTIVE_COLLEGE_ID"].get(), beacon_id),
        )
        conn.commit()
        return {
            "success": True,
            "beacon_id": beacon_id,
            "beacon_code": beacon_code,
            "provisioning_secret": provisioning_secret,
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.post("/courses")
def create_course(body: CourseInput, request: Request):
    _require_feature(request, "class_attendance")
    actor = _require_roles(request, "Faculty", "Dean")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    course_id = _new_id("CRS")
    try:
        if body.default_beacon_id:
            beacon = _beacon(conn, backend, body.default_beacon_id, "CLASS")
            if not beacon["is_active"]:
                raise HTTPException(status_code=400, detail="Choose an active classroom beacon.")
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_courses
                (college_id, tenant_id, id, code, title, faculty_id, default_beacon_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), _tenant_id(request), course_id,
                body.code.strip().upper(), body.title.strip(), actor["user_id"],
                body.default_beacon_id, _now_text(),
            ),
        )
        conn.commit()
        return {"id": course_id, "code": body.code.strip().upper(), "title": body.title.strip()}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/courses")
def list_courses(request: Request):
    _require_feature(request, "class_attendance")
    actor = _require_roles(request, "Dean", "Faculty")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        return [
            dict(row)
            for row in backend["db_exec"](
                conn,
                "SELECT * FROM attendance_v2_courses WHERE college_id = ? ORDER BY code",
                (backend["ACTIVE_COLLEGE_ID"].get(),),
            ).fetchall()
        ]
    finally:
        conn.close()


@router.get("/directory/class-groups")
def attendance_class_groups(request: Request):
    _require_feature(request, "class_attendance")
    _require_roles(request, "Dean", "Faculty")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        rows = backend["db_exec"](
            conn,
            """
            SELECT MIN(TRIM(department)) AS department, MIN(TRIM(year)) AS year,
                   MIN(TRIM(division)) AS division, COUNT(*) AS student_count
            FROM users
            WHERE college_id = ? AND role = 'Student'
              AND TRIM(COALESCE(department, '')) <> ''
              AND TRIM(COALESCE(year, '')) <> ''
              AND TRIM(COALESCE(division, '')) <> ''
            GROUP BY LOWER(TRIM(department)), LOWER(TRIM(year)), LOWER(TRIM(division))
            ORDER BY LOWER(MIN(TRIM(department))), LOWER(MIN(TRIM(year))), LOWER(MIN(TRIM(division)))
            """,
            (backend["ACTIVE_COLLEGE_ID"].get(),),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.get("/directory/students")
def attendance_student_directory(
    request: Request,
    q: str = "",
    department: str = "",
    scope: str = "CLASS",
):
    actor = _require_roles(request, "Dean", "Faculty", "Warden")
    normalized_scope = _validate_scope(scope)
    _require_feature(
        request,
        "class_attendance" if normalized_scope == "CLASS" else "hostel_attendance",
    )
    backend = request.app.state.attendance_v2_backend
    predicates = ["college_id = ?", "role = 'Student'"]
    values = [backend["ACTIVE_COLLEGE_ID"].get()]
    if str(actor["role"]).upper() == "WARDEN":
        hostel_block = str(actor.get("hostel_block") or "").strip()
        if not hostel_block or hostel_block.casefold() == "all":
            raise HTTPException(status_code=403, detail="Your Warden account is not assigned to a hostel.")
        predicates.append("LOWER(COALESCE(hostel_block, '')) = LOWER(?)")
        values.append(hostel_block)
    elif str(actor["role"]).upper() == "FACULTY" and str(actor.get("department") or "").strip():
        predicates.append("LOWER(COALESCE(department, '')) = LOWER(?)")
        values.append(str(actor["department"]).strip())
    elif department.strip():
        predicates.append("LOWER(COALESCE(department, '')) = LOWER(?)")
        values.append(department.strip())
    if q.strip():
        predicates.append("(UPPER(user_id) LIKE ? OR UPPER(full_name) LIKE ?)")
        search = f"%{q.strip().upper()}%"
        values.extend((search, search))
    conn = backend["get_conn"]()
    try:
        rows = backend["db_exec"](
            conn,
            """
            SELECT user_id, full_name, department, year, division, hostel_block, room, wing
            FROM users WHERE """ + " AND ".join(predicates) + " ORDER BY user_id LIMIT 1000",
            tuple(values),
        ).fetchall()
        return [
            {
                "user_id": row["user_id"],
                "roll_no": row["user_id"],
                "student_name": row["full_name"],
                "department": row["department"],
                "year": row["year"],
                "division": row["division"],
                "hostel_block": row["hostel_block"],
                "room_no": row["room"],
                "wing": row["wing"],
            }
            for row in rows
        ]
    finally:
        conn.close()


@router.get("/offline/roster")
def get_offline_roster(
    request: Request,
    scope: str,
    department: str = "",
    year: str = "",
    division: str = "",
    hostel_block: str = "",
    wing_name: str = "",
):
    normalized_scope = _validate_scope(scope)
    if normalized_scope == "CLASS":
        actor = _require_roles(request, "Faculty", "Dean")
        _require_feature(request, "class_attendance")
        if not department.strip() or not year.strip() or not division.strip():
            raise HTTPException(status_code=400, detail="Department, year, and division are required.")
        if str(actor["role"]).upper() == "FACULTY" and str(actor.get("department") or "").strip():
            if str(actor["department"]).casefold() != department.strip().casefold():
                raise HTTPException(status_code=403, detail="You cannot cache a roster outside your department.")
        sql = """
            SELECT user_id AS student_id, user_id AS roll_no, COALESCE(full_name, '') AS student_name
            FROM users WHERE college_id = ? AND role = 'Student'
              AND LOWER(TRIM(COALESCE(department, ''))) = LOWER(?)
              AND LOWER(TRIM(COALESCE(year, ''))) = LOWER(?)
              AND LOWER(TRIM(COALESCE(division, ''))) = LOWER(?)
            ORDER BY UPPER(user_id), user_id LIMIT 201
        """
        params = (
            request.app.state.attendance_v2_backend["ACTIVE_COLLEGE_ID"].get(),
            department.strip(), year.strip(), division.strip(),
        )
    else:
        actor = _require_roles(request, "Warden", "Dean")
        _require_feature(request, "hostel_attendance")
        block = str(actor.get("hostel_block") or "").strip() if str(actor["role"]).upper() == "WARDEN" else hostel_block.strip()
        if not block or not wing_name.strip():
            raise HTTPException(status_code=400, detail="Hostel block and wing are required.")
        if str(actor["role"]).upper() == "WARDEN" and block.casefold() != hostel_block.strip().casefold() and hostel_block.strip():
            raise HTTPException(status_code=403, detail="You cannot cache a roster outside your assigned hostel.")
        sql = """
            SELECT m.student_id, m.roll_no, m.student_name
            FROM attendance_v2_hostel_wing_members m
            WHERE m.college_id = ? AND LOWER(m.hostel_block) = LOWER(?)
              AND (? = 'ALL' OR LOWER(m.wing_name) = LOWER(?))
            ORDER BY m.room_no, UPPER(m.roll_no), m.roll_no LIMIT 201
        """
        params = (
            request.app.state.attendance_v2_backend["ACTIVE_COLLEGE_ID"].get(),
            block, wing_name.strip(), wing_name.strip(),
        )
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        rows = backend["db_exec"](conn, sql, params).fetchall()
        if len(rows) > 200:
            raise HTTPException(status_code=422, detail="Offline capture supports at most 200 roster members.")
        return {
            "scope": normalized_scope,
            "department": department.strip(),
            "year": year.strip(),
            "division": division.strip(),
            "hostel_block": block if normalized_scope == "HOSTEL" else "",
            "wing_name": wing_name.strip(),
            "roster": [dict(row) for row in rows if row["student_id"]],
        }
    finally:
        conn.close()


def _add_students(conn, backend, course_id, students, actor=None):
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    added = 0
    for student in students:
        roll_no = student["roll_no"].strip().upper()
        if not roll_no:
            continue
        account = backend["db_exec"](
            conn,
            "SELECT user_id, full_name, department FROM users WHERE college_id = ? AND role = 'Student' AND UPPER(user_id) = ?",
            (college_id, roll_no),
        ).fetchone()
        if not account:
            raise HTTPException(
                status_code=404,
                detail=f"Student account {roll_no} was not found. Ask Student Onboarding Staff to create it first.",
            )
        faculty_department = str((actor or {}).get("department") or "").strip()
        if str((actor or {}).get("role") or "").upper() == "FACULTY" and faculty_department:
            if str(account["department"] or "").strip().casefold() != faculty_department.casefold():
                raise HTTPException(
                    status_code=403,
                    detail=f"Student {roll_no} is outside your department roster.",
                )
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_course_enrollments
                (college_id, tenant_id, id, course_id, student_id, roll_no, student_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (course_id, roll_no) DO UPDATE SET
                student_id = excluded.student_id, student_name = excluded.student_name
            """,
            (
                college_id, college_id, _new_id("ENR"), course_id, account["user_id"],
                roll_no, str(account["full_name"] or "").strip(), _now_text(),
            ),
        )
        added += 1
    return added


@router.post("/courses/{course_id}/students")
def add_course_student(course_id: str, body: StudentInput, request: Request):
    _require_feature(request, "class_attendance")
    actor = _require_roles(request, "Faculty", "Dean")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        _course_for_user(conn, backend, course_id, actor, allow_admin=str(actor["role"]).upper() == "DEAN")
        count = _add_students(conn, backend, course_id, [body.model_dump()], actor)
        conn.commit()
        return {"success": True, "added": count}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.post("/courses/{course_id}/students/range")
def add_course_roll_range(course_id: str, body: dict, request: Request):
    _require_feature(request, "class_attendance")
    actor = _require_roles(request, "Faculty", "Dean")
    start = str(body.get("start_roll_no", "")).strip().upper()
    end = str(body.get("end_roll_no", "")).strip().upper()
    match_start = __import__("re").fullmatch(r"(.*?)(\d+)", start)
    match_end = __import__("re").fullmatch(r"(.*?)(\d+)", end)
    if not match_start or not match_end or match_start.group(1) != match_end.group(1):
        raise HTTPException(status_code=400, detail="Roll range must share a prefix and end in a number.")
    first, last = int(match_start.group(2)), int(match_end.group(2))
    if last < first or last - first > 999:
        raise HTTPException(status_code=400, detail="Roll range must be ascending and contain at most 1,000 students.")
    width = max(len(match_start.group(2)), len(match_end.group(2)))
    students = [{"roll_no": f"{match_start.group(1)}{value:0{width}d}", "student_name": ""} for value in range(first, last + 1)]
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        _course_for_user(conn, backend, course_id, actor, allow_admin=str(actor["role"]).upper() == "DEAN")
        count = _add_students(conn, backend, course_id, students, actor)
        conn.commit()
        return {"success": True, "added": count}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.post("/courses/{course_id}/students/csv")
async def import_course_roster(course_id: str, request: Request, file: UploadFile = File(...)):
    _require_feature(request, "class_attendance")
    actor = _require_roles(request, "Faculty", "Dean")
    data = await file.read(2_000_001)
    if len(data) > 2_000_000:
        raise HTTPException(status_code=413, detail="Roster CSV must be no larger than 2 MB.")
    try:
        rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
    except (UnicodeDecodeError, csv.Error) as error:
        raise HTTPException(status_code=400, detail="Upload a valid UTF-8 CSV with roll_no and name columns.") from error
    if not rows or not {"roll_no", "name"}.issubset({str(key).strip().lower() for key in rows[0]}):
        raise HTTPException(status_code=400, detail="CSV header must contain roll_no,name.")
    students = [
        {
            "roll_no": next((value for key, value in row.items() if str(key).strip().lower() == "roll_no"), ""),
            "student_name": next((value for key, value in row.items() if str(key).strip().lower() == "name"), ""),
        }
        for row in rows
    ]
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        _course_for_user(conn, backend, course_id, actor, allow_admin=str(actor["role"]).upper() == "DEAN")
        count = _add_students(conn, backend, course_id, students, actor)
        conn.commit()
        return {"success": True, "added": count}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/courses/{course_id}/roster")
def get_course_roster(course_id: str, request: Request):
    _require_feature(request, "class_attendance")
    actor = _require_roles(request, "Faculty", "Dean")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        _course_for_user(conn, backend, course_id, actor, allow_admin=str(actor["role"]).upper() == "DEAN")
        rows = backend["db_exec"](
            conn,
            "SELECT * FROM attendance_v2_course_enrollments WHERE college_id = ? AND course_id = ? ORDER BY roll_no",
            (backend["ACTIVE_COLLEGE_ID"].get(), course_id),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.post("/hostel/members")
def add_hostel_member(body: dict, request: Request):
    _require_feature(request, "hostel_attendance")
    _require_roles(request, "StudentOnboarding")
    backend = request.app.state.attendance_v2_backend
    wing = str(body.get("wing_name", "")).strip()
    room = str(body.get("room_no", "")).strip()
    roll = str(body.get("roll_no", "")).strip().upper()
    if not wing or not room or not roll:
        raise HTTPException(status_code=400, detail="Wing, room number, and roll number are required.")
    hostel_block = str(body.get("hostel_block") or "").strip()
    if not hostel_block:
        raise HTTPException(status_code=400, detail="Hostel block is required.")
    configured_wings = backend["configured_wings"](hostel_block)
    if not any(str(item).casefold() == wing.casefold() for item in configured_wings):
        raise HTTPException(status_code=422, detail="Choose a wing configured for this hostel.")
    conn = backend["get_conn"]()
    try:
        student = backend["db_exec"](
            conn,
            "SELECT user_id FROM users WHERE college_id = ? AND role = 'Student' AND UPPER(user_id) = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), roll),
        ).fetchone()
        if not student:
            raise HTTPException(
                status_code=404,
                detail=f"Student account {roll} was not found. Ask Student Onboarding Staff to create it first.",
            )
        backend["db_exec"](
            conn,
            """
            UPDATE users SET hostel_block = ?, wing = ?, room = ?
            WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'
            """,
            (hostel_block, wing, room, backend["ACTIVE_COLLEGE_ID"].get(), roll),
        )
        link_student_records(conn, backend, backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"])
        conn.commit()
        return {"success": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.post("/sessions")
def start_session(body: SessionInput, request: Request):
    actor = _require_roles(request, "Faculty", "Warden", "Dean")
    scope = _validate_scope(body.scope)
    _require_feature(request, "class_attendance" if scope == "CLASS" else "hostel_attendance")
    if body.duration_minutes not in {None, 2, 3, 5}:
        raise HTTPException(status_code=400, detail="Session duration must be 2, 3, 5 minutes, or manual stop.")
    if scope == "CLASS" and str(actor["role"]).upper() not in {"FACULTY", "DEAN"}:
        raise HTTPException(status_code=403, detail="Only Faculty or the Dean can start a class session.")
    class_group = {
        "department": str(body.department or "").strip(),
        "year": str(body.year or "").strip(),
        "division": str(body.division or "").strip(),
    }
    has_class_details = any(class_group.values())
    use_profile_roster = scope == "CLASS" and all(class_group.values())
    if scope == "CLASS" and has_class_details and not use_profile_roster:
        raise HTTPException(status_code=400, detail="Choose a department, academic year, and division.")
    if scope == "CLASS" and not use_profile_roster and not body.course_id:
        raise HTTPException(status_code=400, detail="Choose a class division or an existing course.")
    wing_name = str(body.wing_name or "").strip()
    if scope == "HOSTEL" and (not wing_name or str(actor["role"]).upper() not in {"WARDEN", "DEAN"}):
        raise HTTPException(status_code=403, detail="A Warden must choose a wing to start a hostel session.")
    beacon_ids = list(dict.fromkeys(body.beacon_ids or [body.beacon_id]))
    if not beacon_ids or len(beacon_ids) > 20 or body.beacon_id not in beacon_ids:
        raise HTTPException(status_code=422, detail="Choose up to 20 attendance beacons, including the primary beacon.")
    hostel_block = ""
    if scope == "HOSTEL":
        hostel_block = (
            str(actor.get("hostel_block") or "").strip()
            if str(actor["role"]).upper() == "WARDEN"
            else str(body.hostel_block or "").strip()
        )
        if not hostel_block:
            raise HTTPException(status_code=400, detail="Choose a specific hostel block for this roll call.")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        selected_beacons = []
        for selected_id in beacon_ids:
            beacon = _beacon(conn, backend, selected_id, scope)
            if not beacon["is_active"]:
                raise HTTPException(status_code=400, detail=f'The selected beacon "{beacon["name"]}" is inactive.')
            if not beacon["beacon_code"] or not beacon["signing_secret_enc"]:
                raise HTTPException(
                    status_code=409,
                    detail=f'Provision the selected beacon "{beacon["name"]}" with the Beacon Manager before starting attendance.',
                )
            if scope == "HOSTEL":
                if str(beacon.get("hostel_block") or "").casefold() != hostel_block.casefold():
                    raise HTTPException(status_code=403, detail="Every selected beacon must belong to this hostel.")
                beacon_wing = str(beacon.get("wing_name") or "").casefold()
                if wing_name.casefold() != "all" and beacon_wing not in {wing_name.casefold(), "all"}:
                    raise HTTPException(status_code=403, detail="Select beacons configured for this wing or its hostel.")
            selected_beacons.append(beacon)
        beacon = next(item for item in selected_beacons if item["id"] == body.beacon_id)
        if scope == "CLASS":
            if use_profile_roster:
                if body.course_id:
                    _course_for_user(conn, backend, body.course_id, actor, allow_admin=True)
                group_roster = backend["db_exec"](
                    conn,
                    """
                    SELECT user_id, full_name FROM users
                    WHERE college_id = ? AND role = 'Student'
                      AND LOWER(TRIM(COALESCE(department, ''))) = LOWER(?)
                      AND LOWER(TRIM(COALESCE(year, ''))) = LOWER(?)
                      AND LOWER(TRIM(COALESCE(division, ''))) = LOWER(?)
                    ORDER BY UPPER(user_id), user_id
                    """,
                    (
                        backend["ACTIVE_COLLEGE_ID"].get(), class_group["department"],
                        class_group["year"], class_group["division"],
                    ),
                ).fetchall()
                if not group_roster:
                    raise HTTPException(status_code=400, detail="No students are assigned to the selected class division.")
            else:
                _course_for_user(
                    conn, backend, body.course_id, actor,
                    allow_admin=str(actor["role"]).upper() == "DEAN",
                )
                group_roster = None
        else:
            if str(actor["role"]).upper() == "WARDEN" and not backend["db_exec"](
                conn,
                """
                SELECT 1 FROM attendance_v2_hostel_wing_members
                WHERE college_id = ? AND LOWER(hostel_block) = LOWER(?)
                  AND (? = 'ALL' OR LOWER(wing_name) = LOWER(?))
                LIMIT 1
                """,
                (backend["ACTIVE_COLLEGE_ID"].get(), hostel_block, wing_name, wing_name),
            ).fetchone():
                raise HTTPException(status_code=403, detail="No roster is configured for this wing in your assigned hostel.")
            if not backend["db_exec"](
                conn,
                """
                SELECT 1 FROM attendance_v2_hostel_wing_members
                WHERE college_id = ? AND LOWER(hostel_block) = LOWER(?)
                  AND (? = 'ALL' OR LOWER(wing_name) = LOWER(?))
                LIMIT 1
                """,
                (backend["ACTIVE_COLLEGE_ID"].get(), hostel_block, wing_name, wing_name),
            ).fetchone():
                raise HTTPException(status_code=400, detail="No students are assigned to the selected hostel wing.")
        created_at = _now()
        session_id = _new_id("SES")
        expires_at = (created_at + timedelta(minutes=body.duration_minutes)).isoformat(timespec="seconds") if body.duration_minutes else None
        ble_nonce = secrets.token_hex(4)
        ble_nonce_expires_at = (
            _parse_time(expires_at).isoformat(timespec="seconds")
            if expires_at else (created_at + timedelta(hours=24)).isoformat(timespec="seconds")
        )
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_sessions
                (college_id, tenant_id, id, scope, course_id, department, year, division,
                 wing_name, hostel_block, beacon_id, beacon_ids_json, created_by, status,
                 expires_at, current_nonce, nonce_expires_at, ble_nonce, ble_nonce_expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?)
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), _tenant_id(request), session_id, scope,
                body.course_id if scope == "CLASS" else None,
                class_group["department"] if scope == "CLASS" else "",
                class_group["year"] if scope == "CLASS" else "",
                class_group["division"] if scope == "CLASS" else "",
                wing_name, hostel_block, body.beacon_id, json.dumps(beacon_ids), actor["user_id"], expires_at,
                secrets.token_urlsafe(24), (created_at + timedelta(seconds=30)).isoformat(timespec="seconds"),
                ble_nonce, ble_nonce_expires_at,
                created_at.isoformat(timespec="seconds"),
            ),
        )
        if use_profile_roster:
            for student in group_roster:
                backend["db_exec"](
                    conn,
                    """
                    INSERT INTO attendance_v2_session_roster
                        (college_id, tenant_id, session_id, student_id, roll_no, student_name, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        backend["ACTIVE_COLLEGE_ID"].get(), _tenant_id(request), session_id,
                        student["user_id"], student["user_id"], student["full_name"] or "",
                        created_at.isoformat(timespec="seconds"),
                    ),
                )
        conn.commit()
        return {"id": session_id, "scope": scope, "status": "OPEN", "expires_at": expires_at}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _get_session(conn, backend, session_id):
    row = backend["db_exec"](
        conn,
        "SELECT * FROM attendance_v2_sessions WHERE college_id = ? AND id = ?",
        (backend["ACTIVE_COLLEGE_ID"].get(), session_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Attendance session not found.")
    session = dict(row)
    if session["status"] == "OPEN" and not _session_expired(session):
        nonce_expiry = _parse_time(session["nonce_expires_at"])
        if not nonce_expiry or nonce_expiry <= _now():
            now = _now()
            session["current_nonce"] = secrets.token_urlsafe(24)
            session["nonce_expires_at"] = (now + timedelta(seconds=30)).isoformat(timespec="seconds")
            backend["db_exec"](
                conn,
                """
                UPDATE attendance_v2_sessions SET current_nonce = ?, nonce_expires_at = ?
                WHERE college_id = ? AND id = ?
                """,
                (
                    session["current_nonce"], session["nonce_expires_at"],
                    backend["ACTIVE_COLLEGE_ID"].get(), session_id,
                ),
            )
    return session


def _session_expired(session):
    expires = _parse_time(session.get("expires_at"))
    return bool(session.get("status") == "OPEN" and expires and expires <= _now())


@reverse_ble_router.post("/offline/faculty-key")
def register_offline_faculty_key(body: OfflineFacultyKeyInput, request: Request):
    actor = _require_roles(request, "Faculty", "Warden", "Dean")
    try:
        public_der = base64.b64decode(body.public_key, validate=True)
        public_key = serialization.load_der_public_key(public_der)
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=422, detail="The faculty offline public key is invalid.") from error
    if not isinstance(public_key, ec.EllipticCurvePublicKey) or not isinstance(public_key.curve, ec.SECP256R1):
        raise HTTPException(status_code=422, detail="A P-256 faculty signing key is required.")
    key_id = hashlib.sha256(public_der).hexdigest()[:32]
    backend = request.app.state.attendance_v2_backend
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    conn = backend["get_conn"]()
    try:
        existing = backend["db_exec"](
            conn,
            """
            SELECT revoked_at FROM attendance_v2_staff_offline_keys
            WHERE college_id = ? AND actor_id = ? AND key_id = ?
            """,
            (college_id, actor["user_id"], key_id),
        ).fetchone()
        if not existing:
            backend["db_exec"](
                conn,
                """
                INSERT INTO attendance_v2_staff_offline_keys
                    (college_id, tenant_id, actor_id, key_id, public_key_der, created_at, revoked_at)
                VALUES (?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    college_id, _tenant_id(request), actor["user_id"], key_id,
                    base64.b64encode(public_der).decode("ascii"), _now_text(),
                ),
            )
        elif existing["revoked_at"]:
            raise HTTPException(status_code=409, detail="This key was revoked. Create a new device key before registering again.")
        conn.commit()
        return {"success": True, "key_id": key_id}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@reverse_ble_router.delete("/offline/faculty-key/{key_id}")
def revoke_offline_faculty_key(key_id: str, request: Request):
    actor = _require_roles(request, "Faculty", "Warden", "Dean")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        updated = backend["db_exec"](
            conn,
            """
            UPDATE attendance_v2_staff_offline_keys SET revoked_at = ?
            WHERE college_id = ? AND actor_id = ? AND key_id = ? AND revoked_at IS NULL
            """,
            (_now_text(), backend["ACTIVE_COLLEGE_ID"].get(), actor["user_id"], key_id),
        )
        conn.commit()
        return {"success": True, "revoked": updated.rowcount > 0}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@reverse_ble_router.get("/sessions/{session_id}/ble")
def get_reverse_ble_session(session_id: str, request: Request):
    actor = _require_roles(request, "Student", "Faculty", "Warden", "Dean")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        session = _get_session(conn, backend, session_id)
        if session["status"] != "OPEN" or _session_expired(session):
            raise HTTPException(status_code=409, detail="This attendance session is closed.")
        if str(actor["role"]).upper() == "STUDENT":
            roster = _session_roster(conn, backend, session)
            if not any(str(item.get("student_id") or "").upper() == str(actor["user_id"]).upper() for item in roster):
                raise HTTPException(status_code=403, detail="You are not enrolled in this attendance session.")
        elif str(session["created_by"]).upper() != str(actor["user_id"]).upper() and str(actor["role"]).upper() != "DEAN":
            raise HTTPException(status_code=403, detail="This session belongs to another staff member.")

        beacon = _beacon(conn, backend, session["beacon_id"], session["scope"])
        if not beacon["is_active"] or not beacon["signing_secret_enc"]:
            raise HTTPException(status_code=409, detail="The active room beacon is not provisioned.")
        secret_hex = backend["_beacon_signing_cipher"]().decrypt(
            beacon["signing_secret_enc"].encode("ascii")
        ).decode("ascii")
        secret = bytes.fromhex(secret_hex)
        location_id = int(beacon["minor"])
        expiry = _session_ble_expiry(session)
        nonce = bytes.fromhex(session["ble_nonce"])
        unsigned = bytes((
            0x56, 0x4e, (location_id >> 8) & 0xff, location_id & 0xff,
        )) + nonce + expiry.to_bytes(4, "big")
        signature = _hmac_digest(secret, unsigned)[:4]
        packet = unsigned + signature
        service_uuid = str(uuid.UUID(bytes=packet))
        duration_seconds = max(1, expiry - int(_now().timestamp()))
        start_message = "|".join((
            session["id"], nonce.hex(), str(expiry), str(location_id),
            str(duration_seconds), service_uuid,
        )).encode("ascii")
        conn.commit()
        return {
            "session_id": session["id"],
            "location_id": location_id,
            "session_nonce": nonce.hex(),
            "expires_at": expiry,
            "duration_seconds": duration_seconds,
            "service_uuid": service_uuid,
            "start_signature": _hmac_digest(secret, start_message).hex(),
            "min_rssi": int(beacon["min_rssi"]),
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@reverse_ble_router.post("/sessions/{session_id}/ios-ble-token")
def issue_ios_ble_token(session_id: str, body: IOSBleTokenInput, request: Request):
    student = _require_roles(request, "Student")
    backend = request.app.state.attendance_v2_backend
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    conn = backend["get_conn"]()
    live_image = body.live_image_base64
    body.live_image_base64 = ""
    try:
        session = _get_session(conn, backend, session_id)
        if session["status"] != "OPEN" or _session_expired(session):
            raise HTTPException(status_code=409, detail="This attendance session is closed.")
        _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
        if (
            body.session_nonce != session["current_nonce"]
            or (_parse_time(session["nonce_expires_at"]) or _now()) <= _now()
        ):
            raise HTTPException(status_code=409, detail="The session challenge expired. Retry the passkey check.")

        roster = _session_roster(conn, backend, session)
        roster_entry = next(
            (
                item for item in roster
                if str(item.get("student_id") or "").upper() == str(student["user_id"]).upper()
            ),
            None,
        )
        if not roster_entry:
            raise HTTPException(status_code=403, detail="You are not enrolled in this attendance session.")
        try:
            roll_id = int(str(roster_entry["roll_no"]), 10)
        except (KeyError, TypeError, ValueError) as error:
            raise HTTPException(status_code=422, detail="This student does not have a numeric BLE roll ID.") from error
        if not 0 <= roll_id <= 0xffffffff:
            raise HTTPException(status_code=422, detail="This student does not have a numeric BLE roll ID.")

        ble_nonce = bytes.fromhex(session["ble_nonce"])
        ble_nonce_expiry = _parse_time(session["ble_nonce_expires_at"])
        if len(ble_nonce) != 4 or not ble_nonce_expiry or ble_nonce_expiry <= _now():
            raise HTTPException(status_code=409, detail="This session no longer accepts BLE attendance.")

        device = backend["db_exec"](
            conn,
            """
            SELECT * FROM attendance_v2_student_devices
            WHERE college_id = ? AND UPPER(student_id) = ?
            """,
            (college_id, str(student["user_id"]).upper()),
        ).fetchone()
        if not device:
            raise HTTPException(status_code=403, detail="Enroll an approved passkey and face reference before checking in.")
        origin, rp_id = backend["expected_webauthn_origin"](request)
        try:
            verified = backend["verify_authentication_response"](
                credential=body.credential,
                expected_challenge=backend["base64url_to_bytes"](body.session_nonce),
                expected_rp_id=rp_id,
                expected_origin=origin,
                credential_public_key=backend["base64url_to_bytes"](device["public_key_cbor"]),
                credential_current_sign_count=int(device["sign_count"]),
                require_user_verification=True,
            )
        except (backend["WebAuthnException"], ValueError, TypeError) as error:
            raise HTTPException(status_code=403, detail="Hardware passkey assertion could not be verified.") from error

        embedding_enc = backend["_compute_enrollment_embedding"](live_image)
        live_image = None
        candidate_bytes = backend["_embedding_cipher"]().decrypt(embedding_enc.encode("ascii"))
        import numpy as np
        candidate = np.frombuffer(candidate_bytes, dtype=np.float32)
        matched = backend["_verify_embedding"](candidate.tolist(), device["reference_face_embedding_enc"])
        del candidate, candidate_bytes, embedding_enc
        if not matched:
            raise HTTPException(status_code=403, detail="Face verification did not match the enrolled reference.")

        token = secrets.token_bytes(8)
        token_hash = hashlib.sha256(token).hexdigest()
        now = _now()
        expires_at = min(now + timedelta(seconds=90), ble_nonce_expiry)
        created_at = _now_text()
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_ios_ble_tokens
                (college_id, token_hash, session_id, student_id, roll_id, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                college_id, token_hash, session["id"], student["user_id"],
                str(roll_id), expires_at.isoformat(timespec="seconds"), created_at,
            ),
        )
        backend["db_exec"](
            conn,
            """
            UPDATE attendance_v2_student_devices SET sign_count = ?
            WHERE college_id = ? AND UPPER(student_id) = ?
            """,
            (verified.new_sign_count, college_id, str(student["user_id"]).upper()),
        )
        conn.commit()
        return {
            "success": True,
            "attendance_token": token.hex(),
            "session_nonce": ble_nonce.hex(),
            "expires_at": int(expires_at.timestamp()),
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        body.live_image_base64 = ""
        live_image = None
        conn.close()


def _process_offline_signed_batch(body, request):
    actor = _require_roles(request, "Faculty", "Warden", "Dean")
    if not body.offline_session_json or not body.faculty_key_id or not body.faculty_signature:
        raise HTTPException(status_code=400, detail="A signed offline session package is required.")
    try:
        session_data = json.loads(body.offline_session_json)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail="The offline session package is invalid JSON.") from error
    if not isinstance(session_data, dict):
        raise HTTPException(status_code=400, detail="The offline session package must be an object.")
    canonical = json.dumps(session_data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    if canonical != body.offline_session_json:
        raise HTTPException(status_code=400, detail="The offline session package is not canonically encoded.")
    try:
        signature = base64.b64decode(body.faculty_signature, validate=True)
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=400, detail="The faculty session signature is malformed.") from error

    backend = request.app.state.attendance_v2_backend
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    conn = backend["get_conn"]()
    try:
        key_row = backend["db_exec"](
            conn,
            """
            SELECT public_key_der FROM attendance_v2_staff_offline_keys
            WHERE college_id = ? AND actor_id = ? AND key_id = ? AND revoked_at IS NULL
            """,
            (college_id, actor["user_id"], body.faculty_key_id),
        ).fetchone()
        if not key_row:
            raise HTTPException(status_code=403, detail="This faculty signing key is not registered or has been revoked.")
        try:
            public_key = serialization.load_der_public_key(
                base64.b64decode(key_row["public_key_der"], validate=True)
            )
            public_key.verify(signature, canonical.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
        except (ValueError, TypeError, InvalidSignature) as error:
            raise HTTPException(status_code=403, detail="The offline session signature is invalid.") from error

        if session_data.get("actor_id") != actor["user_id"]:
            raise HTTPException(status_code=403, detail="The offline session belongs to another staff member.")
        session_id = str(session_data.get("session_id") or "")
        scope = _validate_scope(str(session_data.get("scope") or ""))
        _require_feature(request, "class_attendance" if scope == "CLASS" else "hostel_attendance")
        if len(session_id) < 4 or len(session_id) > 100 or session_id != body.session_id:
            raise HTTPException(status_code=400, detail="The offline session ID does not match the batch.")
        if body.beacon_id != session_data.get("beacon_id"):
            raise HTTPException(status_code=403, detail="The batch beacon does not match the signed session.")
        if scope == "CLASS" and str(actor["role"]).upper() not in {"FACULTY", "DEAN"}:
            raise HTTPException(status_code=403, detail="Only Faculty or the Dean can sync a class session.")
        if scope == "HOSTEL" and str(actor["role"]).upper() not in {"WARDEN", "DEAN"}:
            raise HTTPException(status_code=403, detail="Only a Warden or the Dean can sync a hostel session.")

        created_at = _parse_time(session_data.get("created_at"))
        expires_at = _parse_time(session_data.get("expires_at"))
        duration_seconds = session_data.get("duration_seconds")
        if (
            not created_at or not expires_at or expires_at <= created_at
            or not isinstance(duration_seconds, int) or duration_seconds < 30 or duration_seconds > 86400
            or abs((expires_at - created_at).total_seconds() - duration_seconds) > 2
            or created_at > _now() + timedelta(minutes=5)
            or _now() - created_at > timedelta(days=7)
        ):
            raise HTTPException(status_code=422, detail="The offline session timestamps or duration are invalid or too old.")
        try:
            nonce = bytes.fromhex(str(session_data.get("session_nonce") or ""))
            location_id = int(session_data.get("location_id"))
            passkey_challenge = backend["base64url_to_bytes"](
                str(session_data.get("offline_passkey_challenge") or "")
            )
        except (TypeError, ValueError) as error:
            raise HTTPException(
                status_code=422,
                detail="The offline session nonce, passkey challenge, or location is invalid.",
            ) from error
        if len(nonce) != 4 or len(passkey_challenge) != 32 or not 0 <= location_id <= 65535:
            raise HTTPException(
                status_code=422,
                detail="The offline session nonce, passkey challenge, or location is invalid.",
            )

        beacon_ids = session_data.get("beacon_ids")
        if not isinstance(beacon_ids, list) or not beacon_ids or len(beacon_ids) > 20 or body.beacon_id not in beacon_ids:
            raise HTTPException(status_code=422, detail="The signed session does not include this beacon.")
        beacon = _beacon(conn, backend, body.beacon_id, scope)
        if not beacon["is_active"] or not beacon["signing_secret_enc"] or int(beacon["minor"]) != location_id:
            raise HTTPException(status_code=403, detail="The selected beacon is inactive or its location does not match.")
        try:
            beacon_secret = bytes.fromhex(
                backend["_beacon_signing_cipher"]().decrypt(
                    beacon["signing_secret_enc"].encode("ascii")
                ).decode("ascii")
            )
        except (ValueError, TypeError, UnicodeDecodeError, InvalidToken) as error:
            raise HTTPException(status_code=503, detail="The ESP32 signing key could not be loaded.") from error
        expected_batch_signature = _hmac_digest(
            beacon_secret, body.raw_records_json.encode("utf-8")
        ).hex()
        if not hmac.compare_digest(expected_batch_signature, body.esp32_batch_signature.lower()):
            raise HTTPException(status_code=403, detail="The ESP32 batch signature is invalid.")
        existing_batch = backend["db_exec"](
            conn,
            """
            SELECT session_id, beacon_id FROM attendance_v2_ble_batches
            WHERE college_id = ? AND batch_id = ?
            """,
            (college_id, body.batch_id),
        ).fetchone()
        if existing_batch:
            if existing_batch["session_id"] == session_id and existing_batch["beacon_id"] == body.beacon_id:
                conn.commit()
                return {"success": True, "accepted": 0, "rejected": [], "duplicate_batch": True}
            raise HTTPException(status_code=409, detail="This batch ID is already assigned to another session or beacon.")
        existing_session = backend["db_exec"](
            conn,
            "SELECT 1 FROM attendance_v2_sessions WHERE college_id = ? AND id = ?",
            (college_id, session_id),
        ).fetchone()
        if existing_session:
            raise HTTPException(status_code=409, detail="This offline session has already been reconciled.")

        roster = session_data.get("roster")
        if not isinstance(roster, list) or not roster or len(roster) > 200:
            raise HTTPException(status_code=422, detail="The signed offline roster must contain 1 to 200 students.")
        roster_by_roll = {}
        for item in roster:
            if not isinstance(item, dict):
                raise HTTPException(status_code=422, detail="The signed offline roster contains an invalid entry.")
            student_id = str(item.get("student_id") or "")
            roll_no = str(item.get("roll_no") or "")
            try:
                roll_id = int(roll_no, 10)
            except ValueError as error:
                raise HTTPException(status_code=422, detail="Offline BLE requires numeric 32-bit student roll IDs.") from error
            if not student_id or not 0 <= roll_id <= 0xffffffff or roll_id in roster_by_roll:
                raise HTTPException(status_code=422, detail="The signed offline roster contains duplicate or invalid roll IDs.")
            if scope == "CLASS":
                department = str(session_data.get("department") or "").strip()
                year = str(session_data.get("year") or "").strip()
                division = str(session_data.get("division") or "").strip()
                if not department or not year or not division:
                    raise HTTPException(status_code=422, detail="The signed class session must identify a complete division.")
                student_row = backend["db_exec"](
                    conn,
                    """
                    SELECT user_id, full_name FROM users
                    WHERE college_id = ? AND role = 'Student' AND UPPER(user_id) = ?
                      AND LOWER(TRIM(COALESCE(department, ''))) = LOWER(?)
                      AND LOWER(TRIM(COALESCE(year, ''))) = LOWER(?)
                      AND LOWER(TRIM(COALESCE(division, ''))) = LOWER(?)
                    """,
                    (college_id, student_id.upper(), department, year, division),
                ).fetchone()
            else:
                hostel_block = str(session_data.get("hostel_block") or "").strip()
                wing_name = str(session_data.get("wing_name") or "").strip()
                if not hostel_block or not wing_name:
                    raise HTTPException(status_code=422, detail="The signed hostel session must identify a hostel and wing.")
                if str(actor["role"]).upper() == "WARDEN" and str(actor.get("hostel_block") or "").casefold() != hostel_block.casefold():
                    raise HTTPException(status_code=403, detail="The offline session is outside your assigned hostel.")
                student_row = backend["db_exec"](
                    conn,
                    """
                    SELECT u.user_id, u.full_name FROM attendance_v2_hostel_wing_members m
                    JOIN users u ON u.college_id = m.college_id AND UPPER(u.user_id) = UPPER(m.student_id)
                    WHERE m.college_id = ? AND UPPER(m.student_id) = ?
                      AND LOWER(m.hostel_block) = LOWER(?)
                      AND (? = 'ALL' OR LOWER(m.wing_name) = LOWER(?))
                    """,
                    (college_id, student_id, hostel_block, wing_name.upper(), wing_name),
                ).fetchone()
            if not student_row or str(student_row["user_id"]).upper() != student_id.upper():
                raise HTTPException(status_code=403, detail="A roster member is no longer authorized for this offline session.")
            if str(student_row["user_id"]) != roll_no:
                raise HTTPException(status_code=422, detail="The BLE roll ID must match the student's account ID.")
            roster_by_roll[roll_id] = {
                "student_id": student_row["user_id"],
                "roll_no": roll_no,
                "student_name": str(item.get("student_name") or student_row["full_name"] or ""),
            }

        try:
            records = json.loads(body.raw_records_json)
        except json.JSONDecodeError as error:
            raise HTTPException(status_code=400, detail="The attendance batch JSON is invalid.") from error
        if not isinstance(records, list) or not records or len(records) > 200:
            raise HTTPException(status_code=400, detail="A batch must contain 1 to 200 attendance records.")

        department = str(session_data.get("department") or "").strip()
        year = str(session_data.get("year") or "").strip()
        division = str(session_data.get("division") or "").strip()
        wing_name = str(session_data.get("wing_name") or "").strip()
        hostel_block = str(session_data.get("hostel_block") or "").strip()
        created_text = created_at.isoformat(timespec="seconds")
        expires_text = expires_at.isoformat(timespec="seconds")
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_sessions
                (college_id, tenant_id, id, scope, course_id, department, year, division,
                 wing_name, hostel_block, beacon_id, beacon_ids_json, created_by, status,
                 expires_at, current_nonce, nonce_expires_at, ble_nonce, ble_nonce_expires_at,
                 created_at, closed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLOSED', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                college_id, _tenant_id(request), session_id, scope,
                session_data.get("course_id") if scope == "CLASS" else None,
                department, year, division, wing_name, hostel_block, body.beacon_id,
                json.dumps(beacon_ids), actor["user_id"], expires_text,
                secrets.token_urlsafe(24), expires_text, nonce.hex(), expires_text,
                created_text, expires_text,
            ),
        )
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_offline_session_metadata
                (college_id, session_id, faculty_key_id, offline_session_json, faculty_signature, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                college_id, session_id, body.faculty_key_id,
                body.offline_session_json, body.faculty_signature, created_text,
            ),
        )
        for item in roster_by_roll.values():
            backend["db_exec"](
                conn,
                """
                INSERT INTO attendance_v2_session_roster
                    (college_id, tenant_id, session_id, student_id, roll_no, student_name, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    college_id, _tenant_id(request), session_id, item["student_id"],
                    item["roll_no"], item["student_name"], created_text,
                ),
            )

        accepted = []
        rejected = []
        seen_token_hashes = set()
        for record in records:
            if not isinstance(record, dict):
                rejected.append({"reason": "malformed"})
                continue
            try:
                roll_id = int(record["student_roll_id"])
                rssi = int(record["rssi"])
                record_nonce = bytes.fromhex(str(record["session_nonce"]))
                proof = bytes.fromhex(str(record["proof"]))
            except (KeyError, TypeError, ValueError):
                rejected.append({"reason": "malformed"})
                continue
            if not 0 <= roll_id <= 0xffffffff or len(record_nonce) != 4 or len(proof) != 8:
                rejected.append({"reason": "malformed"})
                continue
            student = roster_by_roll.get(roll_id)
            if not student:
                rejected.append({"student_roll_id": roll_id, "reason": "not_enrolled"})
                continue
            if record_nonce != nonce:
                rejected.append({"student_roll_id": roll_id, "reason": "stale_nonce"})
                continue
            if rssi < int(beacon["min_rssi"]):
                rejected.append({"student_roll_id": roll_id, "reason": "weak_signal"})
                continue
            token_hash = hashlib.sha256(proof).hexdigest()
            token_row = backend["db_exec"](
                conn,
                """
                SELECT token_hash FROM attendance_v2_ios_ble_tokens
                WHERE college_id = ? AND token_hash = ? AND session_id = ?
                  AND UPPER(student_id) = UPPER(?) AND roll_id = ?
                  AND consumed_at IS NULL AND expires_at > ?
                """,
                (
                    college_id, token_hash, session["id"], student["student_id"],
                    str(roll_id), _now_text(),
                ),
            ).fetchone()
            if token_row:
                if token_hash in seen_token_hashes:
                    rejected.append({"student_roll_id": roll_id, "reason": "duplicate_token"})
                    continue
                seen_token_hashes.add(token_hash)
                accepted.append((student, rssi, token_hash))
                continue
            device = backend["db_exec"](
                conn,
                """
                SELECT ble_secret_enc FROM attendance_v2_student_devices
                WHERE college_id = ? AND UPPER(student_id) = ?
                """,
                (college_id, student["student_id"].upper()),
            ).fetchone()
            if not device or not device["ble_secret_enc"]:
                rejected.append({"student_roll_id": roll_id, "reason": "device_not_enrolled"})
                continue
            try:
                student_secret = backend["_embedding_cipher"]().decrypt(
                    device["ble_secret_enc"].encode("ascii")
                )
            except (ValueError, InvalidToken) as error:
                raise HTTPException(status_code=503, detail="A student BLE key could not be loaded.") from error
            expected_proof = _hmac_digest(student_secret, nonce + roll_id.to_bytes(4, "big"))[:8]
            if not hmac.compare_digest(expected_proof, proof):
                rejected.append({"student_roll_id": roll_id, "reason": "invalid_proof"})
                continue
            accepted.append((student, rssi))
        marked_at = _now_text()
        for student, rssi in accepted:
            backend["db_exec"](
                conn,
                """
                INSERT INTO attendance_v2_records
                    (college_id, id, session_id, student_id, roll_no, status, method, measured_rssi, marked_at)
                VALUES (?, ?, ?, ?, ?, 'PRESENT', 'BLE_REVERSE', ?, ?)
                """,
                (
                    college_id, _new_id("REC"), session_id, student["student_id"],
                    student["roll_no"], rssi, marked_at,
                ),
            )
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_ble_batches
                (college_id, batch_id, session_id, beacon_id, imported_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (college_id, body.batch_id, session_id, body.beacon_id, marked_at),
        )
        conn.commit()
        return {
            "success": True,
            "accepted": len(accepted),
            "rejected": rejected,
            "offline_session": True,
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _process_reverse_ble_batch(body, request, require_faculty):
    if require_faculty and body.offline_session_json:
        return _process_offline_signed_batch(body, request)
    if require_faculty:
        actor = _require_roles(request, "Faculty", "Warden", "Dean")
    backend = request.app.state.attendance_v2_backend
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    conn = backend["get_conn"]()
    try:
        if len(body.raw_records_json.encode("utf-8")) > 256_000:
            raise HTTPException(status_code=413, detail="The attendance batch is too large.")
        try:
            records = json.loads(body.raw_records_json)
        except json.JSONDecodeError as error:
            raise HTTPException(status_code=400, detail="The attendance batch JSON is invalid.") from error
        if not isinstance(records, list) or not records or len(records) > 200:
            raise HTTPException(status_code=400, detail="A batch must contain 1 to 200 attendance records.")

        session = _get_session(conn, backend, body.session_id)
        if session["status"] != "OPEN" or _session_expired(session):
            raise HTTPException(status_code=409, detail="This attendance session is closed.")
        _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
        if require_faculty and str(session["created_by"]).upper() != str(actor["user_id"]).upper() and str(actor["role"]).upper() != "DEAN":
            raise HTTPException(status_code=403, detail="This session belongs to another staff member.")
        allowed_beacons = json.loads(session.get("beacon_ids_json") or "[]") or [session["beacon_id"]]
        if body.beacon_id not in allowed_beacons:
            raise HTTPException(status_code=403, detail="This beacon is not assigned to the attendance session.")
        beacon = _beacon(conn, backend, body.beacon_id, session["scope"])
        if not beacon["is_active"] or not beacon["signing_secret_enc"]:
            raise HTTPException(status_code=403, detail="The ESP32 beacon is inactive or not provisioned.")
        try:
            beacon_secret_hex = backend["_beacon_signing_cipher"]().decrypt(
                beacon["signing_secret_enc"].encode("ascii")
            ).decode("ascii")
            beacon_secret = bytes.fromhex(beacon_secret_hex)
        except (ValueError, TypeError, UnicodeDecodeError, InvalidToken) as error:
            raise HTTPException(status_code=503, detail="The ESP32 signing key could not be loaded.") from error
        expected_batch_signature = _hmac_digest(
            beacon_secret, body.raw_records_json.encode("utf-8")
        ).hex()
        if not hmac.compare_digest(expected_batch_signature, body.esp32_batch_signature.lower()):
            raise HTTPException(status_code=403, detail="The ESP32 batch signature is invalid.")

        existing_batch = backend["db_exec"](
            conn,
            """
            SELECT session_id, beacon_id FROM attendance_v2_ble_batches
            WHERE college_id = ? AND batch_id = ?
            """,
            (college_id, body.batch_id),
        ).fetchone()
        if existing_batch:
            if existing_batch["session_id"] == body.session_id and existing_batch["beacon_id"] == body.beacon_id:
                conn.commit()
                return {"success": True, "accepted": 0, "rejected": [], "duplicate_batch": True}
            raise HTTPException(status_code=409, detail="This batch ID is already assigned to another session or beacon.")

        nonce = bytes.fromhex(session["ble_nonce"])
        nonce_expiry = _parse_time(session.get("ble_nonce_expires_at"))
        if not nonce_expiry or nonce_expiry <= _now():
            raise HTTPException(status_code=409, detail="The BLE session nonce has expired.")
        roster = _session_roster(conn, backend, session)
        by_roll = {}
        for item in roster:
            try:
                numeric_roll = int(str(item["roll_no"]), 10)
            except (TypeError, ValueError):
                continue
            if 0 <= numeric_roll <= 0xffffffff:
                by_roll[numeric_roll] = item

        accepted = []
        rejected = []
        for record in records:
            if not isinstance(record, dict):
                rejected.append({"reason": "malformed"})
                continue
            try:
                roll_id = int(record["student_roll_id"])
                rssi = int(record["rssi"])
                record_nonce = bytes.fromhex(str(record["session_nonce"]))
                proof = bytes.fromhex(str(record["proof"]))
            except (KeyError, TypeError, ValueError):
                rejected.append({"reason": "malformed"})
                continue
            if not 0 <= roll_id <= 0xffffffff or len(record_nonce) != 4 or len(proof) != 8:
                rejected.append({"reason": "malformed"})
                continue
            student = by_roll.get(roll_id)
            if not student or not student.get("student_id"):
                rejected.append({"student_roll_id": roll_id, "reason": "not_enrolled"})
                continue
            if record_nonce != nonce:
                rejected.append({"student_roll_id": roll_id, "reason": "stale_nonce"})
                continue
            if rssi < int(beacon["min_rssi"]):
                rejected.append({"student_roll_id": roll_id, "reason": "weak_signal"})
                continue
            device = backend["db_exec"](
                conn,
                """
                SELECT ble_secret_enc FROM attendance_v2_student_devices
                WHERE college_id = ? AND UPPER(student_id) = ?
                """,
                (college_id, str(student["student_id"]).upper()),
            ).fetchone()
            if not device or not device["ble_secret_enc"]:
                rejected.append({"student_roll_id": roll_id, "reason": "device_not_enrolled"})
                continue
            try:
                student_secret = backend["_embedding_cipher"]().decrypt(
                    device["ble_secret_enc"].encode("ascii")
                )
            except (ValueError, InvalidToken) as error:
                raise HTTPException(status_code=503, detail="A student BLE key could not be loaded.") from error
            signed_message = nonce + roll_id.to_bytes(4, "big")
            expected_proof = _hmac_digest(student_secret, signed_message)[:8]
            if not hmac.compare_digest(expected_proof, proof):
                rejected.append({"student_roll_id": roll_id, "reason": "invalid_proof"})
                continue
            accepted.append((student, rssi, None))

        now = _now_text()
        for student, rssi, token_hash in accepted:
            current = backend["db_exec"](
                conn,
                """
                SELECT method, measured_rssi FROM attendance_v2_records
                WHERE college_id = ? AND session_id = ? AND student_id = ?
                """,
                (college_id, session["id"], student["student_id"]),
            ).fetchone()
            if current and current["method"] == "MANUAL_OVERRIDE":
                continue
            if current and current["measured_rssi"] is not None and int(current["measured_rssi"]) >= rssi:
                continue
            if token_hash:
                consumed = backend["db_exec"](
                    conn,
                    """
                    UPDATE attendance_v2_ios_ble_tokens SET consumed_at = ?
                    WHERE college_id = ? AND token_hash = ? AND consumed_at IS NULL AND expires_at > ?
                    """,
                    (now, college_id, token_hash, now),
                )
                if consumed.rowcount != 1:
                    continue
            backend["db_exec"](
                conn,
                """
                INSERT INTO attendance_v2_records
                    (college_id, id, session_id, student_id, roll_no, status, method, measured_rssi, marked_at)
                VALUES (?, ?, ?, ?, ?, 'PRESENT', 'BLE_REVERSE', ?, ?)
                ON CONFLICT (session_id, student_id) DO UPDATE SET
                    status = 'PRESENT', method = 'BLE_REVERSE',
                    measured_rssi = excluded.measured_rssi, marked_at = excluded.marked_at
                """,
                (
                    college_id, _new_id("REC"), session["id"], student["student_id"],
                    student["roll_no"], rssi, now,
                ),
            )
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_ble_batches
                (college_id, batch_id, session_id, beacon_id, imported_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (college_id, body.batch_id, session["id"], body.beacon_id, now),
        )
        conn.commit()
        return {"success": True, "accepted": len(accepted), "rejected": rejected}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@reverse_ble_router.post("/esp32-batch")
def ingest_reverse_ble_batch(body: ReverseBleBatchInput, request: Request):
    return _process_reverse_ble_batch(body, request, require_faculty=False)


@reverse_ble_router.post("/faculty-offline-sync")
def sync_reverse_ble_batch(body: ReverseBleBatchInput, request: Request):
    return _process_reverse_ble_batch(body, request, require_faculty=True)


@reverse_ble_router.post("/student-offline-sync")
def sync_student_offline_checkin(body: OfflineStudentCheckInInput, request: Request):
    student = _require_roles(request, "Student")
    backend = request.app.state.attendance_v2_backend
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    conn = backend["get_conn"]()
    try:
        session = backend["db_exec"](
            conn,
            """
            SELECT s.*, m.offline_session_json
            FROM attendance_v2_sessions s
            JOIN attendance_v2_offline_session_metadata m
              ON m.college_id = s.college_id AND m.session_id = s.id
            WHERE s.college_id = ? AND s.id = ?
            """,
            (college_id, body.session_id),
        ).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="This offline session has not been synced by Faculty yet.")
        offline_expires_at = _parse_time(session["expires_at"])
        if (
            session["status"] != "CLOSED"
            or not offline_expires_at
            or _now() > offline_expires_at + timedelta(days=7)
        ):
            raise HTTPException(status_code=409, detail="This offline check-in window is closed.")
        _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
        roster_entry = backend["db_exec"](
            conn,
            """
            SELECT student_id, roll_no FROM attendance_v2_session_roster
            WHERE college_id = ? AND session_id = ? AND UPPER(student_id) = ?
            """,
            (college_id, body.session_id, str(student["user_id"]).upper()),
        ).fetchone()
        if not roster_entry:
            raise HTTPException(status_code=403, detail="You are not on this offline attendance roster.")
        current = backend["db_exec"](
            conn,
            """
            SELECT method, status FROM attendance_v2_records
            WHERE college_id = ? AND session_id = ? AND UPPER(student_id) = ?
            """,
            (college_id, body.session_id, str(student["user_id"]).upper()),
        ).fetchone()
        if current and current["method"] == "MANUAL_OVERRIDE":
            return {"success": True, "status": current["status"], "preserved_manual_override": True}
        if current and current["method"] == "BLE_QR_PASSKEY":
            return {"success": True, "status": "PRESENT", "duplicate": True}

        try:
            session_data = json.loads(session["offline_session_json"])
            challenge = backend["base64url_to_bytes"](
                str(session_data["offline_passkey_challenge"])
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=503, detail="The offline session passkey challenge could not be loaded.") from error
        if len(challenge) != 32 or len(body.face_embedding) != 128:
            raise HTTPException(status_code=422, detail="The offline passkey proof has invalid dimensions.")
        import math
        if any(not math.isfinite(value) for value in body.face_embedding):
            raise HTTPException(status_code=422, detail="The offline face embedding contains invalid values.")
        device = backend["db_exec"](
            conn,
            """
            SELECT * FROM attendance_v2_student_devices
            WHERE college_id = ? AND UPPER(student_id) = ?
            """,
            (college_id, str(student["user_id"]).upper()),
        ).fetchone()
        if not device:
            raise HTTPException(status_code=403, detail="Enroll an approved passkey and face reference before checking in.")
        origin, rp_id = backend["expected_webauthn_origin"](request)
        try:
            verified = backend["verify_authentication_response"](
                credential=body.credential,
                expected_challenge=challenge,
                expected_rp_id=rp_id,
                expected_origin=origin,
                credential_public_key=backend["base64url_to_bytes"](device["public_key_cbor"]),
                credential_current_sign_count=int(device["sign_count"]),
                require_user_verification=True,
            )
        except (backend["WebAuthnException"], ValueError, TypeError) as error:
            raise HTTPException(status_code=403, detail="The offline passkey assertion could not be verified.") from error
        if not backend["_verify_embedding"](
            body.face_embedding, device["reference_face_embedding_enc"]
        ):
            raise HTTPException(status_code=403, detail="Offline face verification did not match the enrolled reference.")
        marked_at = _now_text()
        if current:
            backend["db_exec"](
                conn,
                """
                UPDATE attendance_v2_records SET status = 'PRESENT', method = 'BLE_QR_PASSKEY',
                    marked_at = ? WHERE college_id = ? AND session_id = ? AND UPPER(student_id) = ?
                """,
                (marked_at, college_id, body.session_id, str(student["user_id"]).upper()),
            )
        else:
            backend["db_exec"](
                conn,
                """
                INSERT INTO attendance_v2_records
                    (college_id, id, session_id, student_id, roll_no, status, method, measured_rssi, marked_at)
                VALUES (?, ?, ?, ?, ?, 'PRESENT', 'BLE_QR_PASSKEY', NULL, ?)
                """,
                (
                    college_id, _new_id("REC"), body.session_id, student["user_id"],
                    roster_entry["roll_no"], marked_at,
                ),
            )
        backend["db_exec"](
            conn,
            """
            UPDATE attendance_v2_student_devices SET sign_count = ?
            WHERE college_id = ? AND UPPER(student_id) = ?
            """,
            (verified.new_sign_count, college_id, str(student["user_id"]).upper()),
        )
        conn.commit()
        return {"success": True, "status": "PRESENT", "marked_at": marked_at}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/sessions")
def list_open_sessions(request: Request, scope: Optional[str] = None):
    actor = _require_roles(request, "Faculty", "Warden", "Dean")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        query = "SELECT * FROM attendance_v2_sessions WHERE college_id = ? AND status = 'OPEN'"
        params = [backend["ACTIVE_COLLEGE_ID"].get()]
        if scope:
            scope = _validate_scope(scope)
            _require_feature(request, "class_attendance" if scope == "CLASS" else "hostel_attendance")
            query += " AND scope = ?"
            params.append(scope)
        if str(actor["role"]).upper() != "DEAN":
            query += " AND UPPER(created_by) = ?"
            params.append(str(actor["user_id"]).upper())
        rows = backend["db_exec"](conn, query + " ORDER BY created_at DESC", tuple(params)).fetchall()
        result = []
        for row in rows:
            session = _get_session(conn, backend, dict(row)["id"])
            if session["status"] != "OPEN" or _session_expired(session):
                continue
            _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
            roster = _session_roster(conn, backend, session)
            session["students"] = roster
            session["present_count"] = sum(item["status"] == "PRESENT" for item in roster)
            session["absent_count"] = sum(item["status"] == "ABSENT" for item in roster)
            if session["scope"] == "CLASS":
                course = None
                if session.get("course_id"):
                    course = backend["db_exec"](
                        conn,
                        "SELECT code, title FROM attendance_v2_courses WHERE college_id = ? AND id = ?",
                        (backend["ACTIVE_COLLEGE_ID"].get(), session["course_id"]),
                    ).fetchone()
                session["class_group"] = " · ".join(
                    item for item in (
                        session.get("department"), session.get("year"), session.get("division")
                    ) if item
                )
                session["course_code"] = course["code"] if course else session["class_group"]
                session["course_title"] = course["title"] if course else "Class attendance"
                faculty = backend["db_exec"](
                    conn,
                    "SELECT full_name FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
                    (backend["ACTIVE_COLLEGE_ID"].get(), str(session["created_by"]).upper()),
                ).fetchone()
                session["faculty_name"] = faculty["full_name"] if faculty else session["created_by"]
            result.append(session)
        conn.commit()
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/sessions/{session_id}")
def get_session(session_id: str, request: Request):
    actor = _require_roles(request, "Faculty", "Warden", "Dean")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        session = _get_session(conn, backend, session_id)
        _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
        if session["created_by"] != actor["user_id"] and str(actor["role"]).upper() != "DEAN":
            raise HTTPException(status_code=403, detail="Only the session owner can view it.")
        students = _session_roster(conn, backend, session)
        conn.commit()
        return {
            **session,
            "students": students,
            "present_count": sum(item["status"] == "PRESENT" for item in students),
            "absent_count": sum(item["status"] == "ABSENT" for item in students),
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/student/open-sessions")
def student_open_sessions(request: Request):
    student = _require_roles(request, "Student")
    backend = request.app.state.attendance_v2_backend
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    enabled_scopes = []
    if request.state.tenant.get("modules", {}).get("class_attendance"):
        enabled_scopes.append("CLASS")
    if request.state.tenant.get("modules", {}).get("hostel_attendance"):
        enabled_scopes.append("HOSTEL")
    if not enabled_scopes:
        return []
    conn = backend["get_conn"]()
    try:
        rows = backend["db_exec"](
            conn,
            """
            SELECT DISTINCT s.* FROM attendance_v2_sessions s
            LEFT JOIN attendance_v2_course_enrollments e
                ON e.college_id = s.college_id AND e.course_id = s.course_id
                AND UPPER(e.student_id) = ?
            LEFT JOIN attendance_v2_session_roster sr
                ON sr.college_id = s.college_id AND sr.session_id = s.id
                AND UPPER(sr.student_id) = ?
            LEFT JOIN attendance_v2_hostel_wing_members m
                ON m.college_id = s.college_id
                AND (UPPER(s.wing_name) = 'ALL' OR LOWER(m.wing_name) = LOWER(s.wing_name))
                AND LOWER(m.hostel_block) = LOWER(s.hostel_block) AND UPPER(m.student_id) = ?
            WHERE s.college_id = ? AND s.status = 'OPEN'
                AND s.scope IN ({})
                AND ((s.scope = 'CLASS' AND (
                        (TRIM(COALESCE(s.department, '')) <> '' AND sr.student_id IS NOT NULL)
                        OR (TRIM(COALESCE(s.department, '')) = '' AND e.student_id IS NOT NULL)
                    ))
                    OR (s.scope = 'HOSTEL' AND m.student_id IS NOT NULL))
            ORDER BY s.created_at DESC
            """.format(", ".join("?" for _ in enabled_scopes)),
            (
                student["user_id"].upper(), student["user_id"].upper(),
                student["user_id"].upper(), college_id, *enabled_scopes,
            ),
        ).fetchall()
        sessions = []
        for row in rows:
            session = _get_session(conn, backend, dict(row)["id"])
            if session["status"] != "OPEN" or _session_expired(session):
                continue
            _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
            beacon = _beacon(conn, backend, session["beacon_id"], session["scope"])
            allowed_beacon_ids = json.loads(session.get("beacon_ids_json") or "[]") or [session["beacon_id"]]
            beacons = [
                _beacon(conn, backend, beacon_id, session["scope"])
                for beacon_id in allowed_beacon_ids
            ]
            course = None
            if session["scope"] == "CLASS":
                if session.get("course_id"):
                    course = backend["db_exec"](
                        conn,
                        "SELECT code, title FROM attendance_v2_courses WHERE college_id = ? AND id = ?",
                        (college_id, session["course_id"]),
                    ).fetchone()
                faculty = backend["db_exec"](
                    conn,
                    "SELECT full_name FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
                    (college_id, str(session["created_by"]).upper()),
                ).fetchone()
            else:
                faculty = None
            class_group = " · ".join(
                item for item in (
                    session.get("department"), session.get("year"), session.get("division")
                ) if item
            )
            sessions.append({
                **session,
                "course_code": course["code"] if course else class_group,
                "course_title": course["title"] if course else "Class attendance",
                "faculty_name": faculty["full_name"] if faculty else session.get("created_by"),
                "class_group": class_group,
                "beacon": {
                    "name": beacon["name"],
                    "beacon_code": beacon["beacon_code"],
                    "uuid": beacon["uuid"], "major": beacon["major"],
                    "minor": beacon["minor"], "min_rssi": beacon["min_rssi"],
                },
                "beacons": [{
                    "id": item["id"],
                    "name": item["name"],
                    "beacon_code": item["beacon_code"],
                    "min_rssi": item["min_rssi"],
                } for item in beacons],
            })
        conn.commit()
        return sessions
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.post("/sessions/{session_id}/override")
def override_attendance(session_id: str, body: OverrideInput, request: Request):
    actor = _require_roles(request, "Faculty", "Warden", "Dean")
    status = str(body.status).upper()
    if status not in {"PRESENT", "ABSENT"}:
        raise HTTPException(status_code=400, detail="Status must be PRESENT or ABSENT.")
    reason = body.reason.strip()
    if len(reason) < 3:
        raise HTTPException(status_code=422, detail="Enter an audit reason of at least 3 non-space characters.")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        session = _get_session(conn, backend, session_id)
        _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
        if session["status"] != "OPEN" or _session_expired(session):
            raise HTTPException(status_code=409, detail="Attendance session is closed.")
        if session["created_by"] != actor["user_id"] and str(actor["role"]).upper() != "DEAN":
            raise HTTPException(status_code=403, detail="Only the session owner can override attendance.")
        roster = _session_roster(conn, backend, session)
        target = next((item for item in roster if str(item["student_id"] or "").upper() == body.student_id.upper()), None)
        if not target:
            raise HTTPException(status_code=404, detail="Student is not on this session roster.")
        now = _now_text()
        previous = backend["db_exec"](
            conn,
            "SELECT status FROM attendance_v2_records WHERE college_id = ? AND session_id = ? AND UPPER(student_id) = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), session_id, body.student_id.upper()),
        ).fetchone()
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_records
                (college_id, id, session_id, student_id, roll_no, status, method, measured_rssi, override_reason, marked_at)
            VALUES (?, ?, ?, ?, ?, ?, 'MANUAL_OVERRIDE', NULL, ?, ?)
            ON CONFLICT (session_id, student_id) DO UPDATE SET
                status = excluded.status, method = excluded.method,
                override_reason = excluded.override_reason, marked_at = excluded.marked_at
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), _new_id("REC"), session_id,
                body.student_id, target["roll_no"], status, reason, now,
            ),
        )
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_record_audit
                (college_id, tenant_id, id, session_id, student_id, previous_status,
                 new_status, reason, actor_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), _tenant_id(request), _new_id("AUD"),
                session_id, body.student_id, previous["status"] if previous else None,
                status, reason, actor["user_id"], now,
            ),
        )
        conn.commit()
        return {"success": True, "status": status, "method": "MANUAL_OVERRIDE", "marked_at": now}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/sessions/{session_id}/audit")
def get_session_attendance_audit(session_id: str, request: Request):
    actor = _require_roles(request, "Faculty", "Warden", "Dean")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        session = _get_session(conn, backend, session_id)
        _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
        if session["created_by"] != actor["user_id"] and str(actor["role"]).upper() != "DEAN":
            raise HTTPException(status_code=403, detail="Only the session owner can review its audit log.")
        rows = backend["db_exec"](
            conn,
            """
            SELECT a.id, a.student_id, r.roll_no, a.previous_status, a.new_status,
                   a.reason, a.actor_id, a.created_at, u.full_name AS actor_name
            FROM attendance_v2_record_audit a
            LEFT JOIN attendance_v2_records r
              ON r.college_id = a.college_id AND r.session_id = a.session_id
              AND UPPER(r.student_id) = UPPER(a.student_id)
            LEFT JOIN users u ON u.college_id = a.college_id AND UPPER(u.user_id) = UPPER(a.actor_id)
            WHERE a.college_id = ? AND a.session_id = ?
            ORDER BY a.created_at DESC
            """,
            (backend["ACTIVE_COLLEGE_ID"].get(), session_id),
        ).fetchall()
        conn.commit()
        return [dict(row) for row in rows]
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.post("/sessions/{session_id}/close")
def close_session(session_id: str, request: Request, background_tasks: BackgroundTasks):
    actor = _require_roles(request, "Faculty", "Warden", "Dean")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        session = _get_session(conn, backend, session_id)
        _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
        if session["created_by"] != actor["user_id"] and str(actor["role"]).upper() != "DEAN":
            raise HTTPException(status_code=403, detail="Only the session owner can close it.")
        just_closed = session["status"] == "OPEN"
        if just_closed:
            _close_session(conn, backend, session)
        report = _report_data(conn, backend, session)
        conn.commit()
        email_queued = bool(
            just_closed and report and report.get("report_email_verified") and report.get("report_email")
        )
        if email_queued:
            background_tasks.add_task(_email_report_safely, report)
        return {
            "success": True,
            "status": "CLOSED",
            "report_available": bool(report),
            "report_queued": email_queued,
            "report_email_verified": bool(report and report.get("report_email_verified")),
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _send_report_email_verification(email: str, code: str):
    host = os.getenv("SMTP_HOST", "").strip()
    sender = os.getenv("SMTP_FROM_EMAIL", "").strip()
    if not host or not sender:
        raise HTTPException(status_code=503, detail="Report email verification is not configured. Contact your college administrator.")
    message = EmailMessage()
    message["Subject"] = "Vidyut OS report email verification"
    message["From"] = formataddr((os.getenv("SMTP_FROM_NAME", "Vidyut OS"), sender))
    message["To"] = email
    message.set_content(
        f"Your Vidyut OS report email verification code is {code}. "
        "It expires in 10 minutes. If you did not request this, ignore this message."
    )
    try:
        with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587")), timeout=20) as server:
            server.starttls()
            username = os.getenv("SMTP_USERNAME", "")
            password = os.getenv("SMTP_PASSWORD", "")
            if username:
                server.login(username, password)
            server.send_message(message)
    except (OSError, smtplib.SMTPException, ValueError) as error:
        logger.exception("Could not send attendance report email verification.")
        raise HTTPException(status_code=502, detail="Could not send the verification code. Check SMTP configuration and try again.") from error


@router.get("/report-email")
def get_report_email(request: Request):
    actor = _require_roles(request, "Faculty", "Warden")
    feature = "class_attendance" if str(actor["role"]).upper() == "FACULTY" else "hostel_attendance"
    _require_feature(request, feature)
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        row = backend["db_exec"](
            conn,
            "SELECT attendance_report_email, attendance_report_email_verified FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), str(actor["user_id"]).upper()),
        ).fetchone()
        return {
            "email": row["attendance_report_email"] if row else "",
            "verified": bool(row["attendance_report_email_verified"]) if row else False,
        }
    finally:
        conn.close()


@router.post("/report-email/verification")
def start_report_email_verification(body: ReportEmailStartInput, request: Request):
    actor = _require_roles(request, "Faculty", "Warden")
    feature = "class_attendance" if str(actor["role"]).upper() == "FACULTY" else "hostel_attendance"
    _require_feature(request, feature)
    email = body.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    backend = request.app.state.attendance_v2_backend
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    user_id = str(actor["user_id"]).upper()
    conn = backend["get_conn"]()
    try:
        existing = backend["db_exec"](
            conn,
            "SELECT last_sent_at FROM attendance_v2_report_email_codes WHERE college_id = ? AND UPPER(user_id) = ?",
            (college_id, user_id),
        ).fetchone()
        last_sent = _parse_time(existing["last_sent_at"]) if existing else None
        if last_sent and (_now() - last_sent).total_seconds() < 60:
            raise HTTPException(status_code=429, detail="Wait one minute before requesting another verification code.")
        code = f"{secrets.randbelow(1_000_000):06d}"
        code_hash = hmac.new(
            backend["AUTH_SECRET"].encode(),
            f"{college_id}:{user_id}:{email}:{code}".encode(),
            hashlib.sha256,
        ).hexdigest()
        _send_report_email_verification(email, code)
        now = _now()
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_report_email_codes
                (college_id, tenant_id, user_id, email, code_hash, expires_at, attempts, last_sent_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)
            ON CONFLICT (college_id, user_id) DO UPDATE SET
                email = excluded.email, code_hash = excluded.code_hash,
                expires_at = excluded.expires_at, attempts = 0, last_sent_at = excluded.last_sent_at
            """,
            (
                college_id, _tenant_id(request), user_id, email, code_hash,
                (now + timedelta(minutes=10)).isoformat(), now.isoformat(),
            ),
        )
        conn.commit()
        return {"success": True, "email": email, "expires_in_seconds": 600}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.post("/report-email/verify")
def verify_report_email(body: ReportEmailVerifyInput, request: Request):
    actor = _require_roles(request, "Faculty", "Warden")
    feature = "class_attendance" if str(actor["role"]).upper() == "FACULTY" else "hostel_attendance"
    _require_feature(request, feature)
    email = body.email.strip().lower()
    if not re.fullmatch(r"\d{6}", body.code):
        raise HTTPException(status_code=400, detail="Enter the six-digit verification code.")
    backend = request.app.state.attendance_v2_backend
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    user_id = str(actor["user_id"]).upper()
    conn = backend["get_conn"]()
    try:
        row = backend["db_exec"](
            conn,
            "SELECT * FROM attendance_v2_report_email_codes WHERE college_id = ? AND UPPER(user_id) = ?",
            (college_id, user_id),
        ).fetchone()
        if not row or str(row["email"]).lower() != email:
            raise HTTPException(status_code=400, detail="Request a verification code for this email first.")
        expiry = _parse_time(row["expires_at"])
        if not expiry or expiry <= _now():
            backend["db_exec"](
                conn,
                "DELETE FROM attendance_v2_report_email_codes WHERE college_id = ? AND UPPER(user_id) = ?",
                (college_id, user_id),
            )
            conn.commit()
            raise HTTPException(status_code=400, detail="The verification code expired. Request a new one.")
        if int(row["attempts"]) >= 5:
            raise HTTPException(status_code=429, detail="Too many incorrect codes. Request a new verification code.")
        expected = hmac.new(
            backend["AUTH_SECRET"].encode(),
            f"{college_id}:{user_id}:{email}:{body.code}".encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(str(row["code_hash"]), expected):
            backend["db_exec"](
                conn,
                "UPDATE attendance_v2_report_email_codes SET attempts = attempts + 1 WHERE college_id = ? AND UPPER(user_id) = ?",
                (college_id, user_id),
            )
            conn.commit()
            raise HTTPException(status_code=400, detail="The verification code is incorrect.")
        backend["db_exec"](
            conn,
            """
            UPDATE users SET attendance_report_email = ?, attendance_report_email_verified = 1
            WHERE college_id = ? AND UPPER(user_id) = ?
            """,
            (email, college_id, user_id),
        )
        backend["db_exec"](
            conn,
            "DELETE FROM attendance_v2_report_email_codes WHERE college_id = ? AND UPPER(user_id) = ?",
            (college_id, user_id),
        )
        conn.commit()
        backend["invalidate_user_cache"](user_id)
        return {"success": True, "email": email, "verified": True}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


def _report_day_bounds(request: Request, day: str):
    try:
        local_day = Date.fromisoformat(day)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Date must use YYYY-MM-DD.") from error
    timezone_name = (request.state.tenant or {}).get("timezone") or "UTC"
    local_zone = ZoneInfo(timezone_name)
    start = datetime.combine(local_day, DateTimeTime.min, tzinfo=local_zone).astimezone(timezone.utc)
    end = datetime.combine(local_day + timedelta(days=1), DateTimeTime.min, tzinfo=local_zone).astimezone(timezone.utc)
    return start.isoformat(), end.isoformat()


@router.get("/reports/sessions")
def list_daily_report_sessions(request: Request, scope: str, date: str):
    actor = _require_roles(request, "Faculty", "Warden", "Dean")
    normalized_scope = _validate_scope(scope)
    _require_feature(request, "class_attendance" if normalized_scope == "CLASS" else "hostel_attendance")
    role = str(actor["role"]).upper()
    if role == "FACULTY" and normalized_scope != "CLASS":
        raise HTTPException(status_code=403, detail="Faculty can only view their class reports.")
    if role == "WARDEN" and normalized_scope != "HOSTEL":
        raise HTTPException(status_code=403, detail="Wardens can only view their hostel reports.")
    start, end = _report_day_bounds(request, date)
    backend = request.app.state.attendance_v2_backend
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    conn = backend["get_conn"]()
    try:
        query = """
            SELECT s.* FROM attendance_v2_sessions s
            WHERE s.college_id = ? AND s.scope = ? AND s.created_at >= ? AND s.created_at < ?
        """
        values = [college_id, normalized_scope, start, end]
        if normalized_scope == "CLASS" and role == "FACULTY":
            query += " AND UPPER(s.created_by) = ?"
            values.append(str(actor["user_id"]).upper())
        if normalized_scope == "HOSTEL" and role == "WARDEN":
            query += " AND LOWER(COALESCE(s.hostel_block, '')) = LOWER(?)"
            values.append(str(actor.get("hostel_block") or ""))
        rows = backend["db_exec"](conn, query + " ORDER BY s.created_at DESC", tuple(values)).fetchall()
        result = []
        for row in rows:
            session = dict(row)
            report = _report_data(conn, backend, session)
            if not report:
                continue
            present = sum(item["status"] == "PRESENT" for item in report["students"])
            result.append({
                "session_id": session["id"],
                "scope": session["scope"],
                "title": " · ".join(
                    item for item in (
                        report["course_code"], report["course_title"], report.get("class_group")
                    ) if item
                ),
                "date": report["date"],
                "status": session["status"],
                "total": len(report["students"]),
                "present": present,
                "absent": len(report["students"]) - present,
                "manual_overrides": report["overrides"],
                "audit_entries": report["audit_entries"],
            })
        return result
    finally:
        conn.close()


@router.get("/reports/session/{session_id}.pdf")
def download_session_report(session_id: str, request: Request):
    actor = _require_roles(request, "Faculty", "Warden", "Dean")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        session = _get_session(conn, backend, session_id)
        _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
        role = str(actor["role"]).upper()
        if role == "FACULTY":
            if session["scope"] != "CLASS" or str(session["created_by"]).upper() != str(actor["user_id"]).upper():
                raise HTTPException(status_code=403, detail="You can only download reports for your own class sessions.")
        if role == "WARDEN":
            if session["scope"] != "HOSTEL" or str(session.get("hostel_block") or "").casefold() != str(actor.get("hostel_block") or "").casefold():
                raise HTTPException(status_code=403, detail="You can only download reports for your assigned hostel.")
        report = _report_data(conn, backend, session)
        if not report:
            raise HTTPException(status_code=404, detail="Attendance report not found.")
        pdf = _build_report_pdf(report)
        filename_prefix = re.sub(r"[^A-Za-z0-9_-]+", "-", str(report["course_code"])).strip("-")[:40] or "attendance"
        filename = f'{filename_prefix}-{report["date"][:10]}-attendance.pdf'
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    finally:
        conn.close()


def _build_student_daily_pdf(report):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    _, page_height = A4
    pdf.setTitle(f'{report["student_id"]} attendance {report["date"]}')
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(32, page_height - 40, "Vidyut OS · Personal Attendance")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(32, page_height - 58, f'{report["institute"]} · {report["student_name"]} · {report["student_id"]}')
    pdf.drawString(32, page_height - 74, f'Daily attendance · {report["date"]}')
    y = page_height - 105
    rows = report["records"]
    for index, item in enumerate(rows):
        if index and index % 48 == 0:
            pdf.showPage()
            y = page_height - 40
            pdf.setFont("Helvetica-Bold", 10)
            pdf.drawString(32, y, f'{report["date"]} · continued')
            y -= 18
        pdf.setFont("Helvetica", 8)
        pdf.drawString(32, y, str(item["time"])[:16])
        pdf.drawString(112, y, str(item["label"])[:52])
        pdf.drawString(365, y, str(item["status"]))
        pdf.drawString(425, y, str(item["method"] or "—")[:15])
        pdf.drawString(32, y - 10, f'Marked at: {item["marked_at"] or "—"}')
        y -= 25
    if not rows:
        pdf.setFont("Helvetica", 9)
        pdf.drawString(32, y, "No attendance sessions were recorded on this date.")
    pdf.showPage()
    pdf.save()
    return output.getvalue()


@router.get("/student/daily-report.pdf")
def download_student_daily_report(request: Request, date: str):
    student = _require_roles(request, "Student")
    _require_attendance_enabled(request)
    start, end = _report_day_bounds(request, date)
    backend = request.app.state.attendance_v2_backend
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    student_id = str(student["user_id"]).upper()
    conn = backend["get_conn"]()
    try:
        modules = request.state.tenant.get("modules", {})
        class_rows = []
        if modules.get("class_attendance"):
            class_rows = backend["db_exec"](
                conn,
                """
                SELECT s.created_at, c.code, c.title, s.department, s.year, s.division,
                       f.full_name AS faculty_name, r.status, r.method, r.marked_at
                FROM attendance_v2_sessions s
                LEFT JOIN attendance_v2_courses c
                    ON c.college_id = s.college_id AND c.id = s.course_id
                LEFT JOIN attendance_v2_session_roster sr
                    ON sr.college_id = s.college_id AND sr.session_id = s.id
                    AND UPPER(sr.student_id) = ?
                LEFT JOIN attendance_v2_course_enrollments e
                    ON e.college_id = s.college_id AND e.course_id = s.course_id
                    AND UPPER(e.student_id) = ?
                LEFT JOIN attendance_v2_records r ON r.college_id = s.college_id
                    AND r.session_id = s.id AND UPPER(r.student_id) = ?
                LEFT JOIN users f
                    ON f.college_id = s.college_id AND UPPER(f.user_id) = UPPER(s.created_by)
                WHERE s.college_id = ? AND s.scope = 'CLASS'
                  AND s.created_at >= ? AND s.created_at < ?
                  AND (sr.student_id IS NOT NULL
                       OR (TRIM(COALESCE(s.department, '')) = '' AND e.student_id IS NOT NULL))
                """,
                (student_id, student_id, student_id, college_id, start, end),
            ).fetchall()
        hostel_rows = []
        if modules.get("hostel_attendance"):
            hostel_rows = backend["db_exec"](
                conn,
                """
                SELECT s.created_at, s.hostel_block, s.wing_name, r.status, r.method, r.marked_at
                FROM attendance_v2_sessions s
                JOIN attendance_v2_hostel_wing_members m ON m.college_id = s.college_id
                    AND LOWER(m.wing_name) = LOWER(s.wing_name)
                    AND LOWER(m.hostel_block) = LOWER(COALESCE(s.hostel_block, ''))
                    AND UPPER(m.student_id) = ?
                LEFT JOIN attendance_v2_records r ON r.college_id = s.college_id
                    AND r.session_id = s.id AND UPPER(r.student_id) = ?
                WHERE s.college_id = ? AND s.scope = 'HOSTEL' AND s.created_at >= ? AND s.created_at < ?
                """,
                (student_id, student_id, college_id, start, end),
            ).fetchall()
        records = []
        for row in class_rows:
            created = _parse_time(row["created_at"])
            class_group = " · ".join(
                item for item in (row["department"], row["year"], row["division"]) if item
            )
            class_label = (
                f'{row["code"]} · {row["title"]}' if row["code"]
                else f'{class_group} class attendance'
            )
            records.append({
                "time": created.astimezone(ZoneInfo(request.state.tenant.get("timezone") or "UTC")).strftime("%Y-%m-%d %H:%M") if created else "",
                "label": f'{class_label} · {row["faculty_name"] or "Faculty"}',
                "status": row["status"] or "ABSENT",
                "method": row["method"],
                "marked_at": row["marked_at"],
            })
        for row in hostel_rows:
            created = _parse_time(row["created_at"])
            records.append({
                "time": created.astimezone(ZoneInfo(request.state.tenant.get("timezone") or "UTC")).strftime("%Y-%m-%d %H:%M") if created else "",
                "label": f'{row["hostel_block"]} · {row["wing_name"]} roll call',
                "status": row["status"] or "ABSENT",
                "method": row["method"],
                "marked_at": row["marked_at"],
            })
        records.sort(key=lambda item: item["time"])
        report = {
            "institute": request.state.tenant.get("college_name", "Institute"),
            "student_id": student["user_id"],
            "student_name": student.get("full_name") or student["user_id"],
            "date": date,
            "records": records,
        }
        pdf = _build_student_daily_pdf(report)
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{student_id}-{date}-attendance.pdf"'},
        )
    finally:
        conn.close()


@router.get("/student/class-summary")
def student_class_summary(request: Request):
    _require_feature(request, "class_attendance")
    student = _require_roles(request, "Student")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        rows = backend["db_exec"](
            conn,
            """
            SELECT s.id AS session_id, s.created_at AS date, s.status AS session_status,
                   s.created_by, s.department, s.year, s.division,
                   c.id AS course_id, c.code AS course_code, c.title AS course_title,
                   f.full_name AS faculty_name, r.status, r.method, r.marked_at
            FROM attendance_v2_sessions s
            LEFT JOIN attendance_v2_courses c
                ON c.college_id = s.college_id AND c.id = s.course_id
            LEFT JOIN attendance_v2_session_roster sr
                ON sr.college_id = s.college_id AND sr.session_id = s.id
                AND UPPER(sr.student_id) = ?
            LEFT JOIN attendance_v2_course_enrollments e
                ON e.college_id = s.college_id AND e.course_id = s.course_id
                AND UPPER(e.student_id) = ?
            LEFT JOIN attendance_v2_records r
                ON r.college_id = s.college_id AND r.session_id = s.id
                AND UPPER(r.student_id) = ?
            LEFT JOIN users f
                ON f.college_id = s.college_id AND UPPER(f.user_id) = UPPER(s.created_by)
            WHERE s.college_id = ? AND s.scope = 'CLASS'
              AND (sr.student_id IS NOT NULL
                   OR (TRIM(COALESCE(s.department, '')) = '' AND e.student_id IS NOT NULL))
            ORDER BY s.created_at
            """,
            (
                student["user_id"].upper(), student["user_id"].upper(),
                student["user_id"].upper(), backend["ACTIVE_COLLEGE_ID"].get(),
            ),
        ).fetchall()
        grouped = {}
        for row in rows:
            class_group = " · ".join(
                item for item in (row["department"], row["year"], row["division"]) if item
            )
            group_key = (
                row["course_id"] or class_group,
                str(row["created_by"]).upper(),
                class_group,
            )
            group = grouped.setdefault(
                group_key,
                {
                    "summary_id": ":".join(str(part) for part in group_key),
                    "course_id": row["course_id"],
                    "course_code": row["course_code"] or class_group or "Class",
                    "course_title": row["course_title"] or "Class attendance",
                    "department": row["department"] or "",
                    "year": row["year"] or "",
                    "division": row["division"] or "",
                    "faculty_name": row["faculty_name"] or row["created_by"],
                    "sessions": [],
                },
            )
            parsed_date = _parse_time(row["date"])
            group["sessions"].append({
                "session_id": row["session_id"],
                "date": row["date"],
                "start_time": parsed_date.strftime("%H:%M") if parsed_date else "",
                "status": row["status"] or "ABSENT",
                "method": row["method"],
                "marked_at": row["marked_at"],
                "faculty_name": group["faculty_name"],
            })
        result = []
        for group in grouped.values():
            total = len(group["sessions"])
            present = sum(item["status"] == "PRESENT" for item in group["sessions"])
            result.append({
                **group,
                "total_sessions": total,
                "present_count": present,
                "percentage": round((present / total) * 100, 1) if total else 0,
            })
        return result
    finally:
        conn.close()


@router.get("/student/hostel-history")
def student_hostel_history(request: Request):
    _require_feature(request, "hostel_attendance")
    student = _require_roles(request, "Student")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        membership = backend["db_exec"](
            conn,
            """
            SELECT m.wing_name, m.room_no, m.hostel_block FROM attendance_v2_hostel_wing_members m
            WHERE m.college_id = ? AND UPPER(m.student_id) = ?
                AND (? = '' OR LOWER(m.hostel_block) = LOWER(?))
            ORDER BY m.created_at DESC
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"].upper(),
                student.get("hostel_block") or "", student.get("hostel_block") or "",
            ),
        ).fetchone()
        if not membership:
            return {"wing_name": None, "room_no": None, "monthly_percentage": 0, "records": []}
        rows = backend["db_exec"](
            conn,
            """
            SELECT s.id AS session_id, s.created_at, r.status, r.method, r.marked_at
            FROM attendance_v2_sessions s
            LEFT JOIN attendance_v2_records r ON r.session_id = s.id
                AND UPPER(r.student_id) = ? AND r.college_id = s.college_id
            WHERE s.college_id = ? AND s.scope = 'HOSTEL' AND LOWER(s.wing_name) = LOWER(?)
                AND LOWER(COALESCE(s.hostel_block, '')) = LOWER(?)
            ORDER BY s.created_at
            """,
            (
                student["user_id"].upper(), backend["ACTIVE_COLLEGE_ID"].get(),
                membership["wing_name"], membership["hostel_block"] or "",
            ),
        ).fetchall()
        month_prefix = _now().strftime("%Y-%m")
        monthly = [row for row in rows if str(row["created_at"]).startswith(month_prefix)]
        present = sum(row["status"] == "PRESENT" for row in monthly)
        return {
            "wing_name": membership["wing_name"],
            "room_no": membership["room_no"],
            "monthly_percentage": round(present * 100 / len(monthly), 1) if monthly else 0,
            "records": [{
                "date": row["created_at"], "status": row["status"] or "ABSENT",
                "method": row["method"], "marked_at": row["marked_at"],
            } for row in rows],
        }
    finally:
        conn.close()


@router.post("/device/enrollment/open")
def open_device_enrollment(body: EnrollmentWindowInput, request: Request):
    _require_attendance_enabled(request)
    actor = _require_roles(request, "StudentOnboarding")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        student = backend["db_exec"](
            conn,
            """
            SELECT user_id, biometric_status, biometric_cred_id, device_token_hash
            FROM users WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'
            """,
            (backend["ACTIVE_COLLEGE_ID"].get(), body.student_id.upper()),
        ).fetchone()
        if not student:
            raise HTTPException(status_code=404, detail="Student account not found.")
        active_device = backend["db_exec"](
            conn,
            "SELECT 1 FROM attendance_v2_student_devices WHERE college_id = ? AND UPPER(student_id) = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), body.student_id.upper()),
        ).fetchone()
        if active_device or student["biometric_cred_id"] or student["device_token_hash"]:
            raise HTTPException(status_code=409, detail="Reset the existing device lock before opening enrollment for a replacement phone.")
        until = int(_now().timestamp()) + body.duration_seconds
        updated = backend["db_exec"](
            conn,
            """
            UPDATE users SET enroll_window_until = ?, biometric_status = 'Enrollment Unlocked'
            WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'
            """,
            (until, backend["ACTIVE_COLLEGE_ID"].get(), body.student_id.upper()),
        )
        if updated.rowcount != 1:
            raise HTTPException(status_code=404, detail="Student account not found.")
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_enrollment_windows (college_id, student_id, approved_by, expires_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (college_id, student_id) DO UPDATE SET
                approved_by = excluded.approved_by, expires_at = excluded.expires_at
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), body.student_id, actor["user_id"],
                datetime.fromtimestamp(until, timezone.utc).isoformat(),
            ),
        )
        conn.commit()
        return {"success": True, "expires_at": datetime.fromtimestamp(until, timezone.utc).isoformat()}
    finally:
        conn.close()


@router.post("/device/reset/{student_id}")
def reset_device_lock(student_id: str, request: Request):
    actor = _require_roles(request, "StudentOnboarding")
    _require_attendance_enabled(request)
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        student = backend["db_exec"](
            conn,
            "SELECT 1 FROM users WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'",
            (backend["ACTIVE_COLLEGE_ID"].get(), student_id.upper()),
        ).fetchone()
        if not student:
            raise HTTPException(status_code=404, detail="Student account not found.")
        backend["db_exec"](
            conn,
            "DELETE FROM attendance_v2_student_devices WHERE college_id = ? AND UPPER(student_id) = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), student_id.upper()),
        )
        backend["db_exec"](
            conn,
            "DELETE FROM attendance_v2_enrollment_windows WHERE college_id = ? AND UPPER(student_id) = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), student_id.upper()),
        )
        backend["db_exec"](
            conn,
            "DELETE FROM webauthn_credentials WHERE college_id = ? AND UPPER(user_id) = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), student_id.upper()),
        )
        backend["db_exec"](
            conn,
            """
            UPDATE users SET biometric_status = 'Not Enrolled', biometric_cred_id = '',
                device_hardware_id = '', device_token_hash = '', face_reference_encrypted = '',
                face_embedding_encrypted = '', face_embedding_model = '', device_public_key = '',
                face_enrolled_at = '', enroll_window_until = 0
            WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'
            """,
            (backend["ACTIVE_COLLEGE_ID"].get(), student_id.upper()),
        )
        conn.commit()
        return {"success": True, "reset_by": actor["user_id"]}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.post("/device/enrollment/options")
def device_enrollment_options(request: Request):
    student = _require_roles(request, "Student")
    _require_attendance_enabled(request)
    backend = request.app.state.attendance_v2_backend
    origin, rp_id = backend["expected_webauthn_origin"](request)
    del origin
    conn = backend["get_conn"]()
    try:
        user = backend["db_exec"](
            conn, """
            SELECT w.expires_at FROM attendance_v2_enrollment_windows w
            WHERE w.college_id = ? AND UPPER(w.student_id) = ?
            """,
            (backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"].upper()),
        ).fetchone()
        if not user or (_parse_time(user["expires_at"]) or _now()) <= _now():
            raise HTTPException(status_code=403, detail="Ask Student Onboarding Staff to open the timed device enrollment window.")
        options = backend["generate_registration_options"](
            rp_id=rp_id,
            rp_name="Campus Attendance",
            user_id=student["user_id"].encode("utf-8"),
            user_name=student["user_id"],
            user_display_name=student.get("full_name") or student["user_id"],
            authenticator_selection=backend["AuthenticatorSelectionCriteria"](
                authenticator_attachment=backend["AuthenticatorAttachment"].PLATFORM,
                resident_key=backend["ResidentKeyRequirement"].REQUIRED,
                user_verification=backend["UserVerificationRequirement"].REQUIRED,
            ),
        )
        challenge_id = backend["create_webauthn_challenge"](
            conn, student["user_id"], f"attendance-v2-enroll:{student['user_id'].upper()}", options.challenge,
        )
        conn.commit()
        return {"challenge_id": challenge_id, "options": json.loads(backend["options_to_json"](options))}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/device/status")
def device_status(request: Request):
    student = _require_roles(request, "Student")
    _require_attendance_enabled(request)
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        device = backend["db_exec"](
            conn,
            "SELECT locked_at FROM attendance_v2_student_devices WHERE college_id = ? AND UPPER(student_id) = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"].upper()),
        ).fetchone()
        window = backend["db_exec"](
            conn,
            "SELECT expires_at FROM attendance_v2_enrollment_windows WHERE college_id = ? AND UPPER(student_id) = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"].upper()),
        ).fetchone()
        expires_at = window["expires_at"] if window else None
        is_open = bool(expires_at and (_parse_time(expires_at) or _now()) > _now())
        return {
            "device_locked": bool(device),
            "locked_at": device["locked_at"] if device else None,
            "enrollment_window_expires_at": expires_at if is_open else None,
        }
    finally:
        conn.close()


@router.post("/device/enrollment/complete")
def complete_device_enrollment(body: RegistrationInput, request: Request):
    student = _require_roles(request, "Student")
    _require_attendance_enabled(request)
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        window = backend["db_exec"](
            conn, """
            SELECT approved_by, expires_at FROM attendance_v2_enrollment_windows
            WHERE college_id = ? AND UPPER(student_id) = ?
            """,
            (backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"].upper()),
        ).fetchone()
        if not window or (_parse_time(window["expires_at"]) or _now()) <= _now():
            raise HTTPException(status_code=403, detail="The Student Onboarding-approved enrollment window has expired.")
        if backend["db_exec"](
            conn,
            "SELECT 1 FROM attendance_v2_student_devices WHERE college_id = ? AND UPPER(student_id) = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"].upper()),
        ).fetchone():
            raise HTTPException(status_code=409, detail="Ask Student Onboarding Staff to reset the existing device lock before enrolling a replacement.")
        challenge = _webauthn_challenge(
            conn, backend, body.challenge_id, student["user_id"],
            f"attendance-v2-enroll:{student['user_id'].upper()}",
        )
        if not challenge:
            raise HTTPException(status_code=400, detail="Enrollment challenge is missing or expired.")
        origin, rp_id = backend["expected_webauthn_origin"](request)
        try:
            verified = backend["verify_registration_response"](
                credential=body.credential,
                expected_challenge=backend["base64url_to_bytes"](challenge["challenge"]),
                expected_rp_id=rp_id,
                expected_origin=origin,
                require_user_verification=True,
            )
        except (backend["WebAuthnException"], ValueError, TypeError) as error:
            raise HTTPException(status_code=400, detail="Passkey enrollment could not be verified.") from error
        embedding_enc = backend["_compute_enrollment_embedding"](body.reference_image_base64)
        credential_id = backend["bytes_to_base64url"](verified.credential_id)
        ble_secret = secrets.token_bytes(32) if body.ble_public_key else None
        ble_secret_wrapped = (
            _wrap_ble_secret(body.ble_public_key, ble_secret)
            if ble_secret and body.ble_public_key else {}
        )
        ble_secret_enc = (
            backend["_embedding_cipher"]().encrypt(ble_secret).decode("ascii")
            if ble_secret else ""
        )
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_student_devices
                (college_id, student_id, webauthn_credential_id, public_key_cbor, sign_count,
                 reference_face_embedding_enc, ble_secret_enc, locked_at, approved_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (college_id, student_id) DO UPDATE SET
                webauthn_credential_id = excluded.webauthn_credential_id,
                public_key_cbor = excluded.public_key_cbor, sign_count = excluded.sign_count,
                reference_face_embedding_enc = excluded.reference_face_embedding_enc,
                ble_secret_enc = excluded.ble_secret_enc,
                locked_at = excluded.locked_at, approved_by = excluded.approved_by
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"], credential_id,
                backend["bytes_to_base64url"](verified.credential_public_key),
                verified.sign_count, embedding_enc, ble_secret_enc, _now_text(), window["approved_by"],
            ),
        )
        backend["db_exec"](
            conn,
            "DELETE FROM webauthn_challenges WHERE college_id = ? AND challenge_id = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), body.challenge_id),
        )
        backend["db_exec"](
            conn,
            "DELETE FROM attendance_v2_enrollment_windows WHERE college_id = ? AND UPPER(student_id) = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"].upper()),
        )
        conn.commit()
        result = {"success": True, "device_locked": True, "reverse_ble_enabled": bool(ble_secret)}
        if ble_secret and body.ble_public_key:
            result.update(ble_secret_wrapped)
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        body.reference_image_base64 = ""
        conn.close()


@router.post("/check-in")
def check_in(body: CheckInInput, request: Request):
    student = _require_roles(request, "Student")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    live_image = body.live_image_base64
    body.live_image_base64 = ""
    try:
        session = _get_session(conn, backend, body.session_id)
        if session["status"] != "OPEN" or _session_expired(session):
            raise HTTPException(status_code=409, detail="This attendance session is closed.")
        _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
        if body.session_nonce != session["current_nonce"] or (_parse_time(session["nonce_expires_at"]) or _now()) <= _now():
            raise HTTPException(status_code=409, detail="The session nonce expired. Refresh and try again.")
        allowed_beacon_ids = json.loads(session.get("beacon_ids_json") or "[]") or [session["beacon_id"]]
        presented_code = re.sub(r"[^0-9a-f]", "", body.uuid.lower())[:8].upper()
        presented_beacon = None
        for allowed_beacon_id in allowed_beacon_ids:
            candidate_beacon = _beacon(conn, backend, allowed_beacon_id, session["scope"])
            if candidate_beacon["beacon_code"].upper() == presented_code:
                presented_beacon = candidate_beacon
                break
        if (
            not presented_beacon
            or not presented_beacon["is_active"]
            or body.rssi < int(presented_beacon["min_rssi"])
        ):
            raise HTTPException(status_code=403, detail="The active room beacon was not verified.")
        if not _validate_rotating_beacon(presented_beacon, body.uuid, backend):
            raise HTTPException(
                status_code=403,
                detail="The rotating beacon signature is invalid or expired. Wait for the next beacon update and retry.",
            )
        device = backend["db_exec"](
            conn,
            "SELECT * FROM attendance_v2_student_devices WHERE college_id = ? AND UPPER(student_id) = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"].upper()),
        ).fetchone()
        if not device:
            raise HTTPException(status_code=403, detail="Enroll an approved device before checking in.")
        origin, rp_id = backend["expected_webauthn_origin"](request)
        try:
            verified = backend["verify_authentication_response"](
                credential=body.credential,
                expected_challenge=backend["base64url_to_bytes"](body.session_nonce),
                expected_rp_id=rp_id,
                expected_origin=origin,
                credential_public_key=backend["base64url_to_bytes"](device["public_key_cbor"]),
                credential_current_sign_count=int(device["sign_count"]),
                require_user_verification=True,
            )
        except (backend["WebAuthnException"], ValueError, TypeError) as error:
            raise HTTPException(status_code=403, detail="Hardware passkey assertion could not be verified.") from error
        embedding_enc = backend["_compute_enrollment_embedding"](live_image)
        live_image = None
        candidate_bytes = backend["_embedding_cipher"]().decrypt(embedding_enc.encode("ascii"))
        import numpy as np
        candidate = np.frombuffer(candidate_bytes, dtype=np.float32)
        matched = backend["_verify_embedding"](candidate.tolist(), device["reference_face_embedding_enc"])
        del candidate, candidate_bytes, embedding_enc
        if not matched:
            raise HTTPException(status_code=403, detail="Face verification did not match the enrolled reference.")
        if session["scope"] == "CLASS":
            enrollment = backend["db_exec"](
                conn,
                "SELECT roll_no FROM attendance_v2_course_enrollments WHERE college_id = ? AND course_id = ? AND UPPER(student_id) = ?",
                (backend["ACTIVE_COLLEGE_ID"].get(), session["course_id"], student["user_id"].upper()),
            ).fetchone()
        else:
            enrollment = backend["db_exec"](
                conn,
                """
                SELECT roll_no FROM attendance_v2_hostel_wing_members
                WHERE college_id = ? AND LOWER(wing_name) = LOWER(?)
                    AND LOWER(hostel_block) = LOWER(?) AND UPPER(student_id) = ?
                """,
                (
                    backend["ACTIVE_COLLEGE_ID"].get(), session["wing_name"],
                    session.get("hostel_block") or "", student["user_id"].upper(),
                ),
            ).fetchone()
        if not enrollment:
            raise HTTPException(status_code=403, detail="You are not enrolled in this class or hostel wing.")
        now = _now_text()
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_records
                (college_id, id, session_id, student_id, roll_no, status, method, measured_rssi, marked_at)
            VALUES (?, ?, ?, ?, ?, 'PRESENT', 'BLE_FACE', ?, ?)
            ON CONFLICT (session_id, student_id) DO UPDATE SET
                status = 'PRESENT', method = 'BLE_FACE',
                measured_rssi = excluded.measured_rssi, marked_at = excluded.marked_at
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), _new_id("REC"), session["id"],
                student["user_id"], enrollment["roll_no"], body.rssi, now,
            ),
        )
        backend["db_exec"](
            conn,
            "UPDATE attendance_v2_student_devices SET sign_count = ? WHERE college_id = ? AND UPPER(student_id) = ?",
            (verified.new_sign_count, backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"].upper()),
        )
        conn.commit()
        return {"success": True, "status": "PRESENT", "marked_at": now}
    except Exception:
        conn.rollback()
        raise
    finally:
        live_image = None
        conn.close()


def link_student_records(conn, backend, tenant_id, student_id):
    uid = str(student_id).strip().upper()
    row = backend["db_exec"](
        conn,
        """
        SELECT user_id, full_name, hostel_block, wing, room
        FROM users WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'
        """,
        (tenant_id, uid),
    ).fetchone()
    if not row:
        return
    name = str(row["full_name"] or "")
    hostel_block = str(row["hostel_block"] or "").strip()
    hostel_category = re.sub(r"[^a-z0-9]+", "", hostel_block.casefold())
    wing_name = str(row["wing"] or "").strip()
    room_no = str(row["room"] or "").strip()
    backend["db_exec"](
        conn,
        """
        UPDATE attendance_v2_course_enrollments SET student_id = ?, student_name = CASE
            WHEN student_name = '' THEN ? ELSE student_name END
        WHERE college_id = ? AND student_id IS NULL AND UPPER(roll_no) = ?
        """,
        (row["user_id"], name, tenant_id, uid),
    )
    backend["db_exec"](
        conn,
        "DELETE FROM attendance_v2_hostel_wing_members WHERE college_id = ? AND UPPER(student_id) = ?",
        (tenant_id, uid),
    )
    if hostel_block and hostel_category not in {"dayscholar", "dayboarding", "nohostel"} and wing_name:
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_hostel_wing_members
                (college_id, tenant_id, id, wing_name, hostel_block, room_no,
                 student_id, roll_no, student_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (tenant_id, wing_name, roll_no) DO UPDATE
            SET hostel_block = excluded.hostel_block, room_no = excluded.room_no,
                student_id = excluded.student_id, student_name = excluded.student_name
            """,
            (
                tenant_id, tenant_id, _new_id("HWM"), wing_name, hostel_block,
                room_no, row["user_id"], row["user_id"], name, _now_text(),
            ),
        )
    backend["db_exec"](
        conn,
        """
        UPDATE attendance_v2_hostel_wing_members SET student_id = ?, student_name = CASE
            WHEN student_name = '' THEN ? ELSE student_name END
        WHERE college_id = ? AND student_id IS NULL AND UPPER(roll_no) = ?
        """,
        (row["user_id"], name, tenant_id, uid),
    )


def create_approved_staff(conn, backend, tenant_id, claims):
    email = str(claims.get("email", "")).strip().lower()
    approved = backend["db_exec"](
        conn,
        """
        SELECT * FROM attendance_v2_pre_approved_staff
        WHERE college_id = ? AND LOWER(email) = LOWER(?)
        """,
        (tenant_id, email),
    ).fetchone()
    if not approved:
        return None
    expected_role = "Faculty" if approved["role"] == "FACULTY" else "Warden"
    existing = backend["db_exec"](
        conn, "SELECT * FROM users WHERE college_id = ? AND LOWER(email) = LOWER(?)",
        (tenant_id, email),
    ).fetchone()
    if existing:
        if existing["role"] != expected_role:
            raise HTTPException(status_code=409, detail="This institute email is already assigned to a different role.")
        backend["db_exec"](
            conn,
            "UPDATE attendance_v2_pre_approved_staff SET claimed_by_user_id = ? WHERE college_id = ? AND id = ? AND claimed_by_user_id IS NULL",
            (existing["user_id"], tenant_id, approved["id"]),
        )
        return dict(existing)
    if approved["claimed_by_user_id"]:
        raise HTTPException(status_code=409, detail="This approved staff account has already been claimed.")
    local = email.split("@", 1)[0].upper()
    user_id = local[:40]
    collision = backend["db_exec"](
        conn, "SELECT 1 FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
        (tenant_id, user_id),
    ).fetchone()
    if collision:
        user_id = f"{local[:30]}_{uuid.uuid4().hex[:8].upper()}"
    role = expected_role
    full_name = approved["name"]
    department = approved["department_or_block"] if role == "Faculty" else "Hostel Administration"
    hostel_block = approved["department_or_block"] if role == "Warden" else "All"
    backend["db_exec"](
        conn,
        """
        INSERT INTO users
            (college_id, user_id, password, full_name, role, authority_title, institute_id,
             hostel_block, year, room, phone, email, department, dob, wing)
        VALUES (?, ?, '', ?, ?, ?, ?, ?, '', '', '', ?, ?, '', '')
        """,
        (tenant_id, user_id, full_name, role, role, tenant_id, hostel_block, email, department),
    )
    backend["db_exec"](
        conn,
        """
        UPDATE attendance_v2_pre_approved_staff
        SET claimed_by_user_id = ? WHERE college_id = ? AND id = ? AND claimed_by_user_id IS NULL
        """,
        (user_id, tenant_id, approved["id"]),
    )
    account = backend["db_exec"](
        conn, "SELECT * FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
        (tenant_id, user_id),
    ).fetchone()
    backend["invalidate_user_cache"](user_id)
    return dict(account)


@router.get("/admin/staff")
def list_approved_staff(request: Request):
    actor = _require_roles(request, "Dean")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        rows = backend["db_exec"](
            conn,
            """
            SELECT id, name, email, role, department_or_block, created_by,
                   claimed_by_user_id, created_at
            FROM attendance_v2_pre_approved_staff WHERE college_id = ? ORDER BY created_at DESC
            """,
            (backend["ACTIVE_COLLEGE_ID"].get(),),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.post("/admin/staff")
def add_approved_staff(body: StaffInput, request: Request):
    actor = _require_roles(request, "Dean")
    backend = request.app.state.attendance_v2_backend
    email = body.email.strip().lower()
    role = body.role.strip().upper()
    if role not in {"FACULTY", "WARDEN"}:
        raise HTTPException(status_code=400, detail="Role must be FACULTY or WARDEN.")
    if not backend["is_tenant_email"](email):
        raise HTTPException(status_code=400, detail="Use an approved institute email address.")
    conn = backend["get_conn"]()
    try:
        normalized_role = "Faculty" if role == "FACULTY" else "Warden"
        account = backend["_create_dean_staff_account"](
            conn,
            {
                "user_id": body.user_id,
                "full_name": body.name.strip(),
                "role": normalized_role,
                "email": email,
                "department": body.department_or_block.strip() if role == "FACULTY" else "",
                "hostel_block": body.department_or_block.strip() if role == "WARDEN" else "All",
            },
            actor["user_id"],
        )
        staff_id = _new_id("STAFF")
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_pre_approved_staff
                (college_id, tenant_id, id, name, email, role, department_or_block, created_by, claimed_by_user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), _tenant_id(request), staff_id,
                body.name.strip(), email, role, body.department_or_block.strip(),
                actor["user_id"], account["user_id"], _now_text(),
            ),
        )
        conn.commit()
        return {"success": True, "id": staff_id, **account}
    except Exception as error:
        conn.rollback()
        if backend["DB_INTEGRITY_ERRORS"] and isinstance(error, backend["DB_INTEGRITY_ERRORS"]):
            raise HTTPException(status_code=409, detail="That username or staff email is already in use.") from error
        raise
    finally:
        conn.close()


@router.post("/admin/staff/csv")
async def import_approved_staff(request: Request, file: UploadFile = File(...)):
    actor = _require_roles(request, "Dean")
    raw = await file.read(2_000_001)
    if len(raw) > 2_000_000:
        raise HTTPException(status_code=413, detail="Staff CSV must be no larger than 2 MB.")
    try:
        rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    except (UnicodeDecodeError, csv.Error) as error:
        raise HTTPException(status_code=400, detail="Upload a valid UTF-8 CSV.") from error
    expected = {"user_id", "name", "email", "role", "department_or_block"}
    if not rows or not expected.issubset({str(key).strip().lower() for key in rows[0]}):
        raise HTTPException(status_code=400, detail="CSV header must be user_id,name,email,role,department_or_block.")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    accounts = []
    try:
        for row_number, raw_row in enumerate(rows, start=2):
            values = {str(key).strip().lower(): str(value or "").strip() for key, value in raw_row.items()}
            staff = StaffInput(
                user_id=values.get("user_id", ""),
                name=values.get("name", ""), email=values.get("email", ""),
                role=values.get("role", ""), department_or_block=values.get("department_or_block", ""),
            )
            role = staff.role.upper()
            if role not in {"FACULTY", "WARDEN"} or not backend["is_tenant_email"](staff.email.lower()):
                raise HTTPException(status_code=400, detail=f"Invalid role or institute email in CSV row {row_number}.")
            try:
                account = backend["_create_dean_staff_account"](
                    conn,
                    {
                        "user_id": staff.user_id,
                        "full_name": staff.name,
                        "role": "Faculty" if role == "FACULTY" else "Warden",
                        "email": staff.email.lower(),
                        "department": staff.department_or_block if role == "FACULTY" else "",
                        "hostel_block": staff.department_or_block if role == "WARDEN" else "All",
                    },
                    actor["user_id"],
                )
            except HTTPException as error:
                raise HTTPException(status_code=error.status_code, detail=f"CSV row {row_number}: {error.detail}") from error
            backend["db_exec"](
                conn,
                """
                INSERT INTO attendance_v2_pre_approved_staff
                    (college_id, tenant_id, id, name, email, role, department_or_block, created_by, claimed_by_user_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    backend["ACTIVE_COLLEGE_ID"].get(), _tenant_id(request), _new_id("STAFF"),
                    staff.name, staff.email.lower(), role, staff.department_or_block,
                    actor["user_id"], account["user_id"], _now_text(),
                ),
            )
            accounts.append(account)
        conn.commit()
        return {"success": True, "accounts": accounts}
    except Exception as error:
        conn.rollback()
        if backend["DB_INTEGRITY_ERRORS"] and isinstance(error, backend["DB_INTEGRITY_ERRORS"]):
            raise HTTPException(status_code=409, detail="A username or staff email is already in use; no CSV rows were imported.") from error
        raise
    finally:
        conn.close()


def install(app, backend):
    app.state.attendance_v2_backend = backend
    backend["_attendance_v2_link_student_records"] = (
        lambda conn, tenant_id, student_id: link_student_records(
            conn, backend, tenant_id, student_id
        )
    )
    backend["_attendance_v2_provision_approved_staff"] = (
        lambda conn, tenant_id, claims: create_approved_staff(
            conn, backend, tenant_id, claims
        )
    )
    import asyncio

    async def lifespan_task():
        return await expire_sessions_worker(backend)

    current_lifespan = app.router.lifespan_context

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def combined_lifespan(application):
        task = asyncio.create_task(lifespan_task())
        try:
            async with current_lifespan(application):
                yield
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    app.router.lifespan_context = combined_lifespan
    conn = backend["get_conn"]()
    try:
        _sync_v2_rls(conn, backend)
        conn.commit()
    except Exception:
        conn.rollback()
        logger.exception("Could not initialize additive attendance-v2 tables")
        raise
    finally:
        conn.close()
    app.include_router(router)
    app.include_router(reverse_ble_router)