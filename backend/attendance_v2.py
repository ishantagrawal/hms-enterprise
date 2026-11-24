import csv
import io
import json
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, UploadFile, File
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/attendance-v2", tags=["attendance-v2"])

TABLES = {
    "attendance_v2_beacons": """
        CREATE TABLE IF NOT EXISTS attendance_v2_beacons (
            college_id TEXT NOT NULL, tenant_id TEXT NOT NULL, id TEXT NOT NULL,
            name TEXT NOT NULL, scope TEXT NOT NULL CHECK (scope IN ('CLASS', 'HOSTEL')),
            owner_id TEXT NOT NULL, uuid TEXT NOT NULL, major INTEGER NOT NULL,
            minor INTEGER NOT NULL, min_rssi INTEGER NOT NULL DEFAULT -78,
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
            course_id TEXT, wing_name TEXT, hostel_block TEXT NOT NULL DEFAULT '',
            beacon_id TEXT NOT NULL,
            created_by TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
            expires_at TEXT, current_nonce TEXT NOT NULL, nonce_expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL, closed_at TEXT,
            PRIMARY KEY (college_id, id)
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
    "attendance_v2_student_devices": """
        CREATE TABLE IF NOT EXISTS attendance_v2_student_devices (
            college_id TEXT NOT NULL, student_id TEXT NOT NULL,
            webauthn_credential_id TEXT NOT NULL, public_key_cbor TEXT NOT NULL,
            sign_count INTEGER NOT NULL DEFAULT 0,
            reference_face_embedding_enc TEXT NOT NULL,
            locked_at TEXT NOT NULL, approved_by TEXT NOT NULL,
            PRIMARY KEY (college_id, student_id),
            UNIQUE (college_id, webauthn_credential_id)
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
}

INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_beacons_owner ON attendance_v2_beacons (college_id, owner_id, scope)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_courses_faculty ON attendance_v2_courses (college_id, faculty_id)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_enrollments_student ON attendance_v2_course_enrollments (college_id, student_id, course_id)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_wing_student ON attendance_v2_hostel_wing_members (college_id, student_id, hostel_block, wing_name)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_sessions_expiry ON attendance_v2_sessions (college_id, status, expires_at)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_records_student ON attendance_v2_records (college_id, student_id, session_id)",
    "CREATE INDEX IF NOT EXISTS idx_attendance_v2_staff_email ON attendance_v2_pre_approved_staff (college_id, email)",
)


class BeaconInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scope: str
    uuid: str = Field(min_length=1, max_length=80)
    major: int = Field(ge=0, le=65535)
    minor: int = Field(ge=0, le=65535)
    min_rssi: int = Field(default=-78, ge=-85, le=-65)
    is_active: bool = True


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
    course_id: Optional[str] = None
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
    name: str = Field(min_length=1, max_length=160)
    email: str = Field(min_length=3, max_length=254)
    role: str
    department_or_block: str = Field(min_length=1, max_length=160)


class RegistrationInput(BaseModel):
    challenge_id: str
    credential: dict
    reference_image_base64: str = Field(min_length=100, max_length=6_000_000)


class CheckInInput(BaseModel):
    session_id: str
    session_nonce: str
    credential: dict
    uuid: str
    major: int
    minor: int
    rssi: int
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


def _validate_scope(scope):
    normalized = str(scope).upper()
    if normalized not in {"CLASS", "HOSTEL"}:
        raise HTTPException(status_code=422, detail="Scope must be CLASS or HOSTEL.")
    return normalized


def _sync_v2_rls(conn, backend):
    db_exec = backend["db_exec"]
    for table_name, statement in TABLES.items():
        db_exec(conn, statement)
        if table_name == "attendance_v2_hostel_wing_members":
            _ensure_column(conn, backend, table_name, "hostel_block", "TEXT NOT NULL DEFAULT ''")
        elif table_name == "attendance_v2_sessions":
            _ensure_column(conn, backend, table_name, "hostel_block", "TEXT NOT NULL DEFAULT ''")
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
        rows = db_exec(
            conn,
            """
            SELECT student_id, roll_no, student_name FROM attendance_v2_course_enrollments
            WHERE college_id = ? AND course_id = ? ORDER BY roll_no
            """,
            (college_id, session["course_id"]),
        ).fetchall()
    else:
        rows = db_exec(
            conn,
            """
            SELECT student_id, roll_no, student_name FROM attendance_v2_hostel_wing_members
            WHERE college_id = ? AND LOWER(wing_name) = LOWER(?)
                AND (? = '' OR LOWER(hostel_block) = LOWER(?))
            ORDER BY room_no, roll_no
            """,
            (
                college_id, session["wing_name"], session.get("hostel_block") or "",
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
    pdf.drawString(left, page_height - 38, "Campus Attendance Report")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(left, page_height - 56, str(report["institute"])[:110])
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(left, page_height - 76, f'{report["course_code"]}  |  {report["course_title"]}'[:100])
    pdf.setFont("Helvetica", 8)
    pdf.drawString(
        left, page_height - 94,
        f'Faculty: {report["faculty_name"]}    Date: {report["date"]}    Room / Beacon: {report["beacon_name"]}'[:140],
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
    for column, x in enumerate(columns):
        y = page_height - 137
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawString(x, y, "Roll No.       Name                     P/A")
        pdf.setFont("Helvetica", 7)
        for row_index in range(rows_per_column):
            index = column * rows_per_column + row_index
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
    import os
    import smtplib
    from email.utils import formataddr
    host = os.getenv("SMTP_HOST", "").strip()
    sender = os.getenv("SMTP_FROM_EMAIL", "").strip()
    recipient = report.get("faculty_email", "").strip()
    if not host or not sender or not recipient:
        logger.error("Attendance PDF email not sent: SMTP_HOST, SMTP_FROM_EMAIL, or faculty email is not configured.")
        return
    message = EmailMessage()
    message["Subject"] = f'Attendance report: {report["course_code"]} - {report["date"]}'
    message["From"] = formataddr((os.getenv("SMTP_FROM_NAME", "Campus Attendance"), sender))
    message["To"] = recipient
    message.set_content("The attached PDF contains the attendance report for your class session.")
    message.add_attachment(
        _build_report_pdf(report),
        maintype="application",
        subtype="pdf",
        filename=f'{report["course_code"]}-{report["date"]}-attendance.pdf',
    )
    port = int(os.getenv("SMTP_PORT", "587"))
    with smtplib.SMTP(host, port, timeout=20) as server:
        server.starttls()
        username = os.getenv("SMTP_USERNAME", "")
        password = os.getenv("SMTP_PASSWORD", "")
        if username:
            server.login(username, password)
        server.send_message(message)


def _email_report_safely(report):
    try:
        _email_report(report)
    except Exception:
        logger.exception("Could not email attendance report for course %s", report.get("course_code"))


def _report_data(conn, backend, session):
    db_exec = backend["db_exec"]
    course = db_exec(
        conn,
        "SELECT * FROM attendance_v2_courses WHERE college_id = ? AND id = ?",
        (backend["ACTIVE_COLLEGE_ID"].get(), session["course_id"]),
    ).fetchone()
    if not course:
        return None
    faculty = db_exec(
        conn,
        "SELECT full_name, email FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
        (backend["ACTIVE_COLLEGE_ID"].get(), str(course["faculty_id"]).upper()),
    ).fetchone()
    beacon = _beacon(conn, backend, session["beacon_id"])
    students = _session_roster(conn, backend, session)
    report_date = _parse_time(session.get("created_at")) or _now()
    tenant = backend["get_tenant_by_id"](backend["ACTIVE_COLLEGE_ID"].get())
    tenant_zone = ZoneInfo((tenant or {}).get("timezone") or "UTC")
    return {
        "institute": (tenant or {}).get("college_name", "Institute"),
        "course_code": course["code"],
        "course_title": course["title"],
        "faculty_name": faculty["full_name"] if faculty else course["faculty_id"],
        "faculty_email": faculty["email"] if faculty else "",
        "date": report_date.astimezone(tenant_zone).strftime("%Y-%m-%d %H:%M"),
        "beacon_name": beacon["name"],
        "students": students,
        "overrides": sum(item["method"] == "MANUAL_OVERRIDE" for item in students),
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
                    _close_session(conn, backend, session)
                    report = _report_data(conn, backend, session) if session["scope"] == "CLASS" else None
                    if report:
                        try:
                            await __import__("asyncio").to_thread(_email_report_safely, report)
                        except Exception:
                            logger.exception("Could not email attendance report for session %s", session["id"])
            conn.commit()
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
    actor = _require_roles(request, "Dean", "Faculty", "Warden")
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
        if str(actor["role"]).upper() not in {"DEAN", "FOUNDER"}:
            query += " AND (owner_id = ? OR scope = 'HOSTEL')"
            params.append(actor["user_id"])
        rows = db_exec(conn, query + " ORDER BY created_at DESC", tuple(params)).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.post("/beacons")
def create_beacon(body: BeaconInput, request: Request):
    actor = _require_roles(request, "Dean", "Faculty", "Warden")
    backend = request.app.state.attendance_v2_backend
    scope = _validate_scope(body.scope)
    _require_feature(request, "class_attendance" if scope == "CLASS" else "hostel_attendance")
    if scope == "CLASS" and str(actor["role"]).upper() not in {"DEAN", "FACULTY"}:
        raise HTTPException(status_code=403, detail="Only Faculty or Dean can create classroom beacons.")
    if scope == "HOSTEL" and str(actor["role"]).upper() not in {"DEAN", "WARDEN"}:
        raise HTTPException(status_code=403, detail="Only Wardens or Dean can create hostel beacons.")
    conn = backend["get_conn"]()
    beacon_id = _new_id("BCN")
    try:
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_beacons
                (college_id, tenant_id, id, name, scope, owner_id, uuid, major, minor, min_rssi, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), _tenant_id(request), beacon_id,
                body.name.strip(), scope, actor["user_id"], body.uuid.strip().lower(),
                body.major, body.minor, body.min_rssi, int(body.is_active), _now_text(),
            ),
        )
        conn.commit()
        row = backend["db_exec"](conn, "SELECT * FROM attendance_v2_beacons WHERE college_id = ? AND id = ?", (backend["ACTIVE_COLLEGE_ID"].get(), beacon_id)).fetchone()
        return dict(row)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.patch("/beacons/{beacon_id}")
def update_beacon(beacon_id: str, body: BeaconInput, request: Request):
    actor = _require_roles(request, "Dean", "Faculty", "Warden")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        current = _beacon(conn, backend, beacon_id)
        _require_feature(request, "class_attendance" if current["scope"] == "CLASS" else "hostel_attendance")
        if str(actor["role"]).upper() != "DEAN" and current["owner_id"] != actor["user_id"]:
            raise HTTPException(status_code=403, detail="Only the beacon owner or Dean can edit it.")
        scope = _validate_scope(body.scope)
        if scope != current["scope"]:
            raise HTTPException(status_code=400, detail="Beacon scope cannot be changed after creation.")
        backend["db_exec"](
            conn,
            """
            UPDATE attendance_v2_beacons
            SET name = ?, uuid = ?, major = ?, minor = ?, min_rssi = ?, is_active = ?
            WHERE college_id = ? AND id = ?
            """,
            (
                body.name.strip(), body.uuid.strip().lower(), body.major, body.minor,
                body.min_rssi, int(body.is_active), backend["ACTIVE_COLLEGE_ID"].get(), beacon_id,
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
    actor = _require_roles(request, "Dean", "Faculty", "Warden")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        current = _beacon(conn, backend, beacon_id)
        _require_feature(request, "class_attendance" if current["scope"] == "CLASS" else "hostel_attendance")
        if str(actor["role"]).upper() != "DEAN" and current["owner_id"] != actor["user_id"]:
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
        query = "SELECT * FROM attendance_v2_courses WHERE college_id = ?"
        args = [backend["ACTIVE_COLLEGE_ID"].get()]
        if str(actor["role"]).upper() != "DEAN":
            query += " AND UPPER(faculty_id) = ?"
            args.append(str(actor["user_id"]).upper())
        return [dict(row) for row in backend["db_exec"](conn, query + " ORDER BY code", tuple(args)).fetchall()]
    finally:
        conn.close()


def _add_students(conn, backend, course_id, students):
    college_id = backend["ACTIVE_COLLEGE_ID"].get()
    added = 0
    for student in students:
        roll_no = student["roll_no"].strip().upper()
        if not roll_no:
            continue
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_course_enrollments
                (college_id, tenant_id, id, course_id, student_id, roll_no, student_name, created_at)
            VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
            ON CONFLICT (course_id, roll_no) DO UPDATE SET student_name = excluded.student_name
            """,
            (
                college_id, college_id, _new_id("ENR"), course_id, roll_no,
                student.get("student_name", "").strip(), _now_text(),
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
        count = _add_students(conn, backend, course_id, [body.model_dump()])
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
        count = _add_students(conn, backend, course_id, students)
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
        count = _add_students(conn, backend, course_id, students)
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
    actor = _require_roles(request, "Warden", "Dean")
    backend = request.app.state.attendance_v2_backend
    wing = str(body.get("wing_name", "")).strip()
    room = str(body.get("room_no", "")).strip()
    roll = str(body.get("roll_no", "")).strip().upper()
    name = str(body.get("student_name", "")).strip()
    if not wing or not room or not roll:
        raise HTTPException(status_code=400, detail="Wing, room number, and roll number are required.")
    if str(actor["role"]).upper() == "WARDEN":
        hostel_block = str(actor.get("hostel_block") or "").strip()
        if not hostel_block or hostel_block.casefold() == "all":
            raise HTTPException(status_code=403, detail="Your account must have a specific hostel assignment.")
    else:
        hostel_block = str(body.get("hostel_block") or "").strip()
    if not hostel_block:
        raise HTTPException(status_code=400, detail="Hostel block is required.")
    conn = backend["get_conn"]()
    try:
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_hostel_wing_members
                (college_id, tenant_id, id, wing_name, hostel_block, room_no, student_id, roll_no, student_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
            ON CONFLICT (tenant_id, wing_name, roll_no) DO UPDATE
            SET hostel_block = excluded.hostel_block, room_no = excluded.room_no,
                student_name = excluded.student_name
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), _tenant_id(request), _new_id("HWM"),
                wing, hostel_block, room, roll, name, _now_text(),
            ),
        )
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
    if scope == "CLASS" and (not body.course_id or str(actor["role"]).upper() not in {"FACULTY", "DEAN"}):
        raise HTTPException(status_code=403, detail="Faculty must choose a course to start a class session.")
    if scope == "HOSTEL" and (not body.wing_name or str(actor["role"]).upper() not in {"WARDEN", "DEAN"}):
        raise HTTPException(status_code=403, detail="A Warden must choose a wing to start a hostel session.")
    hostel_block = ""
    if scope == "HOSTEL":
        hostel_block = (
            str(actor.get("hostel_block") or "").strip()
            if str(actor["role"]).upper() == "WARDEN"
            else str(body.hostel_block or "").strip()
        )
        if not hostel_block or hostel_block.casefold() == "all":
            raise HTTPException(status_code=400, detail="Choose a specific hostel block for this roll call.")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        beacon = _beacon(conn, backend, body.beacon_id, scope)
        if not beacon["is_active"]:
            raise HTTPException(status_code=400, detail="The selected beacon is inactive.")
        if scope == "CLASS":
            course = _course_for_user(conn, backend, body.course_id, actor, allow_admin=str(actor["role"]).upper() == "DEAN")
            if course.get("default_beacon_id") and course["default_beacon_id"] != body.beacon_id:
                raise HTTPException(status_code=400, detail="The selected beacon does not match this course's default room beacon.")
        else:
            if str(actor["role"]).upper() == "WARDEN" and not backend["db_exec"](
                conn,
                """
                SELECT 1 FROM attendance_v2_hostel_wing_members
                WHERE college_id = ? AND LOWER(hostel_block) = LOWER(?) AND LOWER(wing_name) = LOWER(?)
                LIMIT 1
                """,
                (backend["ACTIVE_COLLEGE_ID"].get(), hostel_block, body.wing_name),
            ).fetchone():
                raise HTTPException(status_code=403, detail="No roster is configured for this wing in your assigned hostel.")
        created_at = _now()
        session_id = _new_id("SES")
        expires_at = (created_at + timedelta(minutes=body.duration_minutes)).isoformat(timespec="seconds") if body.duration_minutes else None
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_sessions
                (college_id, tenant_id, id, scope, course_id, wing_name, hostel_block, beacon_id, created_by, status,
                 expires_at, current_nonce, nonce_expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), _tenant_id(request), session_id, scope,
                body.course_id, body.wing_name, hostel_block, body.beacon_id, actor["user_id"], expires_at,
                secrets.token_urlsafe(24), (created_at + timedelta(seconds=30)).isoformat(timespec="seconds"),
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
    if session["status"] == "OPEN" and session.get("expires_at"):
        expires = _parse_time(session["expires_at"])
        if expires and expires <= _now():
            _close_session(conn, backend, session)
    if session["status"] == "OPEN":
        nonce_expiry = _parse_time(session["nonce_expires_at"])
        if not nonce_expiry or nonce_expiry <= _now():
            now = _now()
            session["current_nonce"] = secrets.token_urlsafe(24)
            session["nonce_expires_at"] = (now + timedelta(seconds=30)).isoformat(timespec="seconds")
            backend["db_exec"](
                conn,
                "UPDATE attendance_v2_sessions SET current_nonce = ?, nonce_expires_at = ? WHERE college_id = ? AND id = ?",
                (session["current_nonce"], session["nonce_expires_at"], backend["ACTIVE_COLLEGE_ID"].get(), session_id),
            )
    return session


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
            if session["status"] != "OPEN":
                continue
            _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
            roster = _session_roster(conn, backend, session)
            session["students"] = roster
            session["present_count"] = sum(item["status"] == "PRESENT" for item in roster)
            session["absent_count"] = sum(item["status"] == "ABSENT" for item in roster)
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
            LEFT JOIN attendance_v2_hostel_wing_members m
                ON m.college_id = s.college_id AND LOWER(m.wing_name) = LOWER(s.wing_name)
                AND LOWER(m.hostel_block) = LOWER(s.hostel_block) AND UPPER(m.student_id) = ?
            WHERE s.college_id = ? AND s.status = 'OPEN'
                AND s.scope IN ({})
                AND ((s.scope = 'CLASS' AND e.student_id IS NOT NULL)
                    OR (s.scope = 'HOSTEL' AND m.student_id IS NOT NULL))
            ORDER BY s.created_at DESC
            """.format(", ".join("?" for _ in enabled_scopes)),
            (student["user_id"].upper(), student["user_id"].upper(), college_id, *enabled_scopes),
        ).fetchall()
        sessions = []
        for row in rows:
            session = _get_session(conn, backend, dict(row)["id"])
            if session["status"] != "OPEN":
                continue
            _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
            beacon = _beacon(conn, backend, session["beacon_id"], session["scope"])
            course = None
            if session["scope"] == "CLASS":
                course = backend["db_exec"](
                    conn,
                    "SELECT code, title FROM attendance_v2_courses WHERE college_id = ? AND id = ?",
                    (college_id, session["course_id"]),
                ).fetchone()
            sessions.append({
                **session,
                "course_code": course["code"] if course else None,
                "course_title": course["title"] if course else None,
                "beacon": {
                    "uuid": beacon["uuid"], "major": beacon["major"],
                    "minor": beacon["minor"], "min_rssi": beacon["min_rssi"],
                },
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
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        session = _get_session(conn, backend, session_id)
        _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
        if session["status"] != "OPEN":
            raise HTTPException(status_code=409, detail="Attendance session is closed.")
        if session["created_by"] != actor["user_id"] and str(actor["role"]).upper() != "DEAN":
            raise HTTPException(status_code=403, detail="Only the session owner can override attendance.")
        roster = _session_roster(conn, backend, session)
        target = next((item for item in roster if str(item["student_id"] or "").upper() == body.student_id.upper()), None)
        if not target:
            raise HTTPException(status_code=404, detail="Student is not on this session roster.")
        now = _now_text()
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
                body.student_id, target["roll_no"], status, body.reason.strip(), now,
            ),
        )
        conn.commit()
        return {"success": True, "status": status, "method": "MANUAL_OVERRIDE", "marked_at": now}
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
        if session["status"] == "OPEN":
            _close_session(conn, backend, session)
        report = _report_data(conn, backend, session) if session["scope"] == "CLASS" else None
        conn.commit()
        if report:
            background_tasks.add_task(_email_report_safely, report)
        return {"success": True, "status": "CLOSED", "report_queued": bool(report)}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/student/class-summary")
def student_class_summary(request: Request):
    _require_feature(request, "class_attendance")
    student = _require_roles(request, "Student")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        courses = backend["db_exec"](
            conn,
            """
            SELECT DISTINCT c.* FROM attendance_v2_courses c
            JOIN attendance_v2_course_enrollments e ON e.course_id = c.id AND e.college_id = c.college_id
            WHERE c.college_id = ? AND UPPER(e.student_id) = ? ORDER BY c.code
            """,
            (backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"].upper()),
        ).fetchall()
        result = []
        for course in courses:
            sessions = backend["db_exec"](
                conn,
                """
                SELECT s.id AS session_id, s.created_at AS date, s.status AS session_status,
                       r.status, r.method, r.marked_at
                FROM attendance_v2_sessions s
                LEFT JOIN attendance_v2_records r ON r.session_id = s.id
                    AND UPPER(r.student_id) = ? AND r.college_id = s.college_id
                WHERE s.college_id = ? AND s.scope = 'CLASS' AND s.course_id = ?
                ORDER BY s.created_at
                """,
                (student["user_id"].upper(), backend["ACTIVE_COLLEGE_ID"].get(), course["id"]),
            ).fetchall()
            faculty = backend["db_exec"](
                conn, "SELECT full_name FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
                (backend["ACTIVE_COLLEGE_ID"].get(), str(course["faculty_id"]).upper()),
            ).fetchone()
            total = len(sessions)
            present = sum(row["status"] == "PRESENT" for row in sessions)
            result.append({
                "course_id": course["id"], "course_code": course["code"],
                "course_title": course["title"],
                "faculty_name": faculty["full_name"] if faculty else course["faculty_id"],
                "total_sessions": total, "present_count": present,
                "percentage": round((present / total) * 100, 1) if total else 0,
                "sessions": [{
                    "session_id": row["session_id"], "date": row["date"],
                    "start_time": _parse_time(row["date"]).strftime("%H:%M") if _parse_time(row["date"]) else "",
                    "status": row["status"] or "ABSENT", "method": row["method"],
                    "marked_at": row["marked_at"],
                } for row in sessions],
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
    actor = _require_roles(request, "Warden", "Dean")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        until = int(_now().timestamp()) + body.duration_seconds
        if request.state.tenant.get("modules", {}).get("hostel_attendance"):
            member = backend["db_exec"](
                conn,
                """
                SELECT m.hostel_block FROM attendance_v2_hostel_wing_members m
                JOIN users u ON u.college_id = m.college_id AND UPPER(u.user_id) = UPPER(m.student_id)
                WHERE m.college_id = ? AND UPPER(m.student_id) = ?
                """,
                (backend["ACTIVE_COLLEGE_ID"].get(), body.student_id.upper()),
            ).fetchone()
            if not member:
                raise HTTPException(status_code=404, detail="Student is not assigned to a hostel wing.")
            if str(actor["role"]).upper() == "WARDEN" and str(actor.get("hostel_block") or "").casefold() != str(member["hostel_block"] or "").casefold():
                raise HTTPException(status_code=403, detail="You can only approve students in your assigned hostel.")
        else:
            enrolled = backend["db_exec"](
                conn,
                """
                SELECT 1 FROM attendance_v2_course_enrollments e
                JOIN users u ON u.college_id = e.college_id AND UPPER(u.user_id) = UPPER(e.student_id)
                WHERE e.college_id = ? AND UPPER(e.student_id) = ?
                LIMIT 1
                """,
                (backend["ACTIVE_COLLEGE_ID"].get(), body.student_id.upper()),
            ).fetchone()
            if not enrolled:
                raise HTTPException(status_code=404, detail="Student is not enrolled in an attendance course.")
        backend["db_exec"](
            conn,
            "UPDATE users SET enroll_window_until = ? WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'",
            (until, backend["ACTIVE_COLLEGE_ID"].get(), body.student_id.upper()),
        )
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
    actor = _require_roles(request, "Warden", "Dean")
    _require_attendance_enabled(request)
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    try:
        if str(actor["role"]).upper() == "WARDEN" and request.state.tenant.get("modules", {}).get("hostel_attendance"):
            membership = backend["db_exec"](
                conn,
                """
                SELECT hostel_block FROM attendance_v2_hostel_wing_members
                WHERE college_id = ? AND UPPER(student_id) = ?
                """,
                (backend["ACTIVE_COLLEGE_ID"].get(), student_id.upper()),
            ).fetchone()
            if not membership or str(membership["hostel_block"] or "").casefold() != str(actor.get("hostel_block") or "").casefold():
                raise HTTPException(status_code=403, detail="You can only reset devices for students in your assigned hostel.")
        elif str(actor["role"]).upper() == "WARDEN":
            enrolled = backend["db_exec"](
                conn,
                """
                SELECT 1 FROM attendance_v2_course_enrollments
                WHERE college_id = ? AND UPPER(student_id) = ?
                LIMIT 1
                """,
                (backend["ACTIVE_COLLEGE_ID"].get(), student_id.upper()),
            ).fetchone()
            if not enrolled:
                raise HTTPException(status_code=403, detail="You can reset devices only for students enrolled in attendance.")
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
            "UPDATE users SET enroll_window_until = 0 WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'",
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
            raise HTTPException(status_code=403, detail="Ask your Warden to open the timed device enrollment window.")
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
            raise HTTPException(status_code=403, detail="The Warden-approved enrollment window has expired.")
        if backend["db_exec"](
            conn,
            "SELECT 1 FROM attendance_v2_student_devices WHERE college_id = ? AND UPPER(student_id) = ?",
            (backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"].upper()),
        ).fetchone():
            raise HTTPException(status_code=409, detail="Ask your Warden to reset the existing device lock before enrolling a replacement.")
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
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_student_devices
                (college_id, student_id, webauthn_credential_id, public_key_cbor, sign_count,
                 reference_face_embedding_enc,                  locked_at, approved_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (college_id, student_id) DO UPDATE SET
                webauthn_credential_id = excluded.webauthn_credential_id,
                public_key_cbor = excluded.public_key_cbor, sign_count = excluded.sign_count,
                reference_face_embedding_enc = excluded.reference_face_embedding_enc,
                locked_at = excluded.locked_at, approved_by = excluded.approved_by
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), student["user_id"], credential_id,
                backend["bytes_to_base64url"](verified.credential_public_key),
                verified.sign_count, embedding_enc, _now_text(), window["approved_by"],
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
        return {"success": True, "device_locked": True}
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
        if session["status"] != "OPEN":
            raise HTTPException(status_code=409, detail="This attendance session is closed.")
        _require_feature(request, "class_attendance" if session["scope"] == "CLASS" else "hostel_attendance")
        if body.session_nonce != session["current_nonce"] or (_parse_time(session["nonce_expires_at"]) or _now()) <= _now():
            raise HTTPException(status_code=409, detail="The session nonce expired. Refresh and try again.")
        beacon = _beacon(conn, backend, session["beacon_id"], session["scope"])
        if (
            not beacon["is_active"] or beacon["uuid"].lower() != body.uuid.strip().lower()
            or int(beacon["major"]) != body.major or int(beacon["minor"]) != body.minor
            or body.rssi < int(beacon["min_rssi"])
        ):
            raise HTTPException(status_code=403, detail="The active room beacon was not verified.")
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
        "SELECT user_id, full_name FROM users WHERE college_id = ? AND UPPER(user_id) = ? AND role = 'Student'",
        (tenant_id, uid),
    ).fetchone()
    if not row:
        return
    name = str(row["full_name"] or "")
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
        staff_id = _new_id("STAFF")
        backend["db_exec"](
            conn,
            """
            INSERT INTO attendance_v2_pre_approved_staff
                (college_id, tenant_id, id, name, email, role, department_or_block, created_by, claimed_by_user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
            """,
            (
                backend["ACTIVE_COLLEGE_ID"].get(), _tenant_id(request), staff_id,
                body.name.strip(), email, role, body.department_or_block.strip(),
                actor["user_id"], _now_text(),
            ),
        )
        conn.commit()
        return {"success": True, "id": staff_id}
    except Exception as error:
        conn.rollback()
        if backend["DB_INTEGRITY_ERRORS"] and isinstance(error, backend["DB_INTEGRITY_ERRORS"]):
            raise HTTPException(status_code=409, detail="That staff email has already been provisioned.") from error
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
    expected = {"name", "email", "role", "department_or_block"}
    if not rows or not expected.issubset({str(key).strip().lower() for key in rows[0]}):
        raise HTTPException(status_code=400, detail="CSV header must be name,email,role,department_or_block.")
    backend = request.app.state.attendance_v2_backend
    conn = backend["get_conn"]()
    created = 0
    try:
        for raw_row in rows:
            values = {str(key).strip().lower(): str(value or "").strip() for key, value in raw_row.items()}
            staff = StaffInput(
                name=values.get("name", ""), email=values.get("email", ""),
                role=values.get("role", ""), department_or_block=values.get("department_or_block", ""),
            )
            role = staff.role.upper()
            if role not in {"FACULTY", "WARDEN"} or not backend["is_tenant_email"](staff.email.lower()):
                raise HTTPException(status_code=400, detail=f"Invalid role or institute email in CSV row {created + 2}.")
            backend["db_exec"](
                conn,
                """
                INSERT INTO attendance_v2_pre_approved_staff
                    (college_id, tenant_id, id, name, email, role, department_or_block, created_by, claimed_by_user_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
                ON CONFLICT (tenant_id, email) DO NOTHING
                """,
                (
                    backend["ACTIVE_COLLEGE_ID"].get(), _tenant_id(request), _new_id("STAFF"),
                    staff.name, staff.email.lower(), role, staff.department_or_block,
                    actor["user_id"], _now_text(),
                ),
            )
            created += 1
        conn.commit()
        return {"success": True, "processed": created}
    except Exception:
        conn.rollback()
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