import os
import json
import random
import re
import sqlite3
import threading
import time
from html import escape as html_escape
from datetime import datetime, timedelta
from typing import Optional, List, Dict
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
import google.auth.exceptions
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None

app = FastAPI(title="SVNIT HMS - Cloud Persistent Production Backend")
GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    "312566505039-bvh0tfh4gao8bi6jqs65fkgni7pbn5bn.apps.googleusercontent.com",
)
_GOOGLE_TOKEN_CACHE: Dict[str, tuple] = {}
_GOOGLE_TOKEN_CACHE_LOCK = threading.Lock()
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DB_FILE = "hms.db"
USE_POSTGRES = bool(DATABASE_URL and psycopg2 is not None)


def get_conn():
    if USE_POSTGRES:
        url = DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return psycopg2.connect(url, cursor_factory=RealDictCursor)
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def db_exec(conn, query: str, params: tuple = ()):
    cur = conn.cursor()
    if USE_POSTGRES:
        query = query.replace("?", "%s")
    cur.execute(query, params)
    return cur


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
            wing TEXT
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
    user_columns = {column[0] for column in db_exec(conn, "SELECT * FROM users LIMIT 0").description}
    if "wing" not in user_columns:
        db_exec(conn, "ALTER TABLE users ADD COLUMN wing TEXT")
    complaint_columns = {column[0] for column in db_exec(conn, "SELECT * FROM complaints LIMIT 0").description}
    if "wing" not in complaint_columns:
        db_exec(conn, "ALTER TABLE complaints ADD COLUMN wing TEXT")

    default_users = [
        ("FOUNDER", "ishant123", "Founder & Ad Admin", "Founder", "Platform Creator & Sponsor Manager", "SVNIT", "All", "-", "Admin", "+91", "founder@svnit.ac.in", "Platform Admin", "10072007"),
        ("DEAN", "123", "Dean Student Welfare", "Dean", "Dean Student Welfare (SVNIT)", "SVNIT", "All", "-", "Admin Block", "0261-2201500", "dean_sw@svnit.ac.in", "Administration", "01011975"),
        ("CW_GAJJAR", "123", "Gajjar Bhawan Warden Office", "Warden", "Chief Warden / Warden", "SVNIT", "Gajjar Bhawan", "-", "Warden Office", "0261-2201659", "warden_gajjar@svnit.ac.in", "Hostel Office", "01011980"),
        ("CW_BHABHA", "123", "Bhabha Bhawan Warden Office", "Warden", "Chief Warden / Warden", "SVNIT", "Bhabha Bhawan", "-", "Warden Office", "0261-2201790", "warden_bhabha@svnit.ac.in", "Hostel Office", "01011980"),
        ("CW_MTB", "123", "Mother Teresa Bhawan Warden Office", "Warden", "Chief Warden / Warden", "SVNIT", "Mother Teresa Bhawan", "-", "Warden Office", "0261-2201967", "warden_mtb@svnit.ac.in", "Hostel Office", "01011980"),
        ("CW_SVB", "123", "Swami Vivekananda Bhawan Warden Office", "Warden", "Chief Warden / Warden", "SVNIT", "Swami Vivekananda Bhawan", "-", "Warden Office", "0261-2201657", "warden_svb@svnit.ac.in", "Hostel Office", "01011980"),
        ("CW_NEHRU", "123", "Nehru Bhawan Warden Office", "Warden", "Chief Warden / Warden", "SVNIT", "Nehru Bhawan", "-", "Warden Office", "0261-2201703", "warden_nehru@svnit.ac.in", "Hostel Office", "01011980"),
        ("CW_TAGORE", "123", "Tagore Bhawan Warden Office", "Warden", "Chief Warden / Warden", "SVNIT", "Tagore Bhawan", "-", "Warden Office", "0261-2201707", "warden_tagore@svnit.ac.in", "Hostel Office", "01011980"),
        ("CW_SARABHAI", "123", "Sarabhai Bhawan Warden Office", "Warden", "Chief Warden / Warden", "SVNIT", "Sarabhai Bhawan", "-", "Warden Office", "0261-2201793", "warden_sarabhai@svnit.ac.in", "Hostel Office", "01011980"),
        ("CW_RAMAN", "123", "Raman Bhawan Warden Office", "Warden", "Chief Warden / Warden", "SVNIT", "Raman Bhawan", "-", "Warden Office", "0261-2201789", "warden_raman@svnit.ac.in", "Hostel Office", "01011980"),
        ("CW_ABVB", "123", "Atal Bihari Vajpayee Bhawan Warden Office", "Warden", "Chief Warden / Warden", "SVNIT", "Atal Bihari Vajpayee Bhawan", "-", "Warden Office", "0261-2201880", "warden_abvb@svnit.ac.in", "Hostel Office", "01011980"),
        ("ELECTRICITY", "123", "Electrical Maintenance (Central)", "Staff", "Central Department Portal", "SVNIT", "All", "-", "Estate Electrical Wing", "0261-2201555", "electricity@svnit.ac.in", "ELECTRICITY", "01011990"),
        ("CCC_LAN", "123", "CCC / Internet / LAN (Central)", "Staff", "Central Department Portal", "SVNIT", "All", "-", "Central Computer Centre", "0261-2201566", "ccc_lan@svnit.ac.in", "CCC_LAN", "01011990")
    ]
    for u in default_users:
        if USE_POSTGRES:
            db_exec(conn, "INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (user_id) DO NOTHING", u)
        else:
            db_exec(conn, "INSERT OR IGNORE INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", u)

    for user_id in ["FOUNDER", "DEAN", "CW_GAJJAR", "CW_BHABHA", "CW_MTB", "CW_SVB", "CW_NEHRU", "CW_TAGORE", "CW_SARABHAI", "CW_RAMAN", "CW_ABVB"]:
        configured_email = os.getenv(f"{user_id}_EMAIL", "").strip().lower()
        if not configured_email:
            continue
        db_exec(conn, "UPDATE users SET email = ? WHERE UPPER(user_id) = ?", (configured_email, user_id))

    db_exec(conn, "UPDATE users SET password = '', dob = ''")

    default_depts = [
        ("ELECTRICITY", "Electrical Maintenance (Central)", "Central", "All", "⚡"),
        ("CCC_LAN", "CCC / Internet / LAN (Central)", "Central", "All", "🌐")
    ]
    for d in default_depts:
        if USE_POSTGRES:
            db_exec(conn, "INSERT INTO departments VALUES (?,?,?,?,?) ON CONFLICT (id) DO NOTHING", d)
        else:
            db_exec(conn, "INSERT OR IGNORE INTO departments VALUES (?,?,?,?,?)", d)

    conn.commit()
    conn.close()


init_db()


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
    room: str
    department: str
    year: Optional[str] = "1st Year"
    dob: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""

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
    student_id: str
    rating: int
    review: str

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

class GoogleLoginReq(BaseModel):
    credential: str

class StudentProfileReq(BaseModel):
    hostel_block: str
    wing: str
    room: str
    phone: str


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
            raise HTTPException(status_code=503, detail="Google sign-in verification is temporarily unavailable.") from exc
        except ValueError as exc:
            raise HTTPException(status_code=401, detail="Google sign-in token is invalid or expired.") from exc
        if len(_GOOGLE_TOKEN_CACHE) > 500:
            expired = [token for token, (expiry, _) in _GOOGLE_TOKEN_CACHE.items() if expiry <= now]
            for token in expired:
                _GOOGLE_TOKEN_CACHE.pop(token, None)
        _GOOGLE_TOKEN_CACHE[credential] = (float(claims.get("exp", 0)), claims)
        return claims


def is_svnit_email(email: str) -> bool:
    if email.count("@") != 1:
        return False
    local_part, domain = email.rsplit("@", 1)
    if not local_part or any(character.isspace() for character in local_part):
        return False
    return domain.lower() == "svnit.ac.in" or domain.lower().endswith(".svnit.ac.in")


def require_svnit_email(email: Optional[str]) -> str:
    normalized = (email or "").strip().lower()
    if not is_svnit_email(normalized):
        raise HTTPException(status_code=400, detail="Enter an official @svnit.ac.in email address.")
    return normalized


def get_account_by_email(email: str):
    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM users WHERE LOWER(email) = LOWER(?)", (email,)).fetchone()
    conn.close()
    return row


def get_account_for_google_claims(claims: dict):
    email = str(claims.get("email", "")).strip().lower()
    if claims.get("email_verified") is not True:
        raise HTTPException(status_code=403, detail="Use a verified SVNIT Google email address.")
    if not is_svnit_email(email):
        raise HTTPException(status_code=403, detail="Only verified @svnit.ac.in accounts are allowed.")

    account = get_account_by_email(email)
    if account:
        return account

    local_part = email.split("@", 1)[0].upper()
    match = re.fullmatch(r"U(?P<admission_year>\d{2})(?P<branch>[A-Z]{2,3})(?P<sequence>\d{3})", local_part)
    if not match:
        raise HTTPException(status_code=403, detail="This official account is not preconfigured for staff access, and its email does not contain a valid student roll number.")

    branch_code = match.group("branch")
    departments = {
        "CE": "Civil Engineering",
        "CED": "Civil Engineering",
        "CH": "Chemical Engineering",
        "CS": "Computer Science and Engineering",
        "CSE": "Computer Science and Engineering",
        "EC": "Electronics and Communication Engineering",
        "EE": "Electrical Engineering",
        "IT": "Information Technology",
        "ME": "Mechanical Engineering",
        "MA": "Applied Mathematics",
        "PH": "Applied Physics",
        "CY": "Applied Chemistry",
    }
    if branch_code not in departments:
        raise HTTPException(status_code=403, detail=f"Student branch code '{branch_code}' is not configured.")

    admission_year = 2000 + int(match.group("admission_year"))
    academic_year = max(1, datetime.now().year - admission_year + 1)
    year_suffix = "st" if academic_year % 10 == 1 and academic_year % 100 != 11 else "nd" if academic_year % 10 == 2 and academic_year % 100 != 12 else "rd" if academic_year % 10 == 3 and academic_year % 100 != 13 else "th"
    year = f"{academic_year}{year_suffix} Year"
    conn = get_conn()
    existing = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (local_part,)).fetchone()
    if existing and existing["role"] != "Student":
        conn.close()
        raise HTTPException(status_code=403, detail="This roll number is already assigned to a non-student account.")
    if existing:
        db_exec(conn, "UPDATE users SET email = ? WHERE UPPER(user_id) = ?", (email, local_part))
        account = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (local_part,)).fetchone()
    else:
        full_name = str(claims.get("name") or local_part).strip()
        db_exec(
            conn,
            "INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob, wing) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (local_part, "", full_name, "Student", "Verified Resident", "SVNIT", "", year, "", "", email, departments[branch_code], "", ""),
        )
        account = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (local_part,)).fetchone()
    conn.commit()
    conn.close()
    return account


def account_from_bearer(request: Request):
    authorization = request.headers.get("authorization", "")
    scheme, _, credential = authorization.partition(" ")
    if scheme.lower() != "bearer" or not credential:
        raise HTTPException(status_code=401, detail="Sign in with your SVNIT Google account.")
    claims = verify_google_credential(credential)
    email = str(claims.get("email", "")).strip().lower()
    if claims.get("email_verified") is not True or not is_svnit_email(email):
        raise HTTPException(status_code=403, detail="Only verified SVNIT Google accounts are allowed.")
    account = get_account_by_email(email)
    if not account:
        raise HTTPException(status_code=401, detail="Google account is not registered.")
    return account


@app.middleware("http")
async def require_google_authentication(request: Request, call_next):
    if not request.url.path.startswith("/api/") or request.url.path == "/api/auth/google" or request.method == "OPTIONS":
        return await call_next(request)
    try:
        account = account_from_bearer(request)
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    request.state.user = account
    return await call_next(request)


@app.get("/")
def root():
    return {
        "status": "online",
        "database_mode": "Cloud PostgreSQL (Permanent)" if USE_POSTGRES else "Local SQLite"
    }

@app.post("/api/auth/google")
def google_login(req: GoogleLoginReq):
    claims = verify_google_credential(req.credential)
    account = get_account_for_google_claims(claims)
    user = dict(account)
    user.pop("password", None)
    user.pop("dob", None)
    return {"success": True, "user": user}

@app.get("/api/auth/me")
def get_current_account(request: Request):
    user = dict(request.state.user)
    user.pop("password", None)
    user.pop("dob", None)
    return {"success": True, "user": user}

@app.get("/api/hostels")
def get_hostels():
    conn = get_conn()
    rows = db_exec(conn, "SELECT DISTINCT hostel_block FROM users WHERE role = 'Warden' AND hostel_block IS NOT NULL AND hostel_block != '' ORDER BY hostel_block").fetchall()
    conn.close()
    return [row["hostel_block"] for row in rows]

@app.put("/api/profile")
def update_student_profile(req: StudentProfileReq, request: Request):
    account = request.state.user
    if account["role"] != "Student":
        raise HTTPException(status_code=403, detail="Only student profiles can be updated here.")
    hostel = req.hostel_block.strip()
    wing = req.wing.strip()
    room = req.room.strip()
    phone = req.phone.strip()
    if wing not in {f"Wing {letter}" for letter in "ABCDEFGH"}:
        raise HTTPException(status_code=400, detail="Select a valid hostel wing.")
    if not room or len(room) > 20:
        raise HTTPException(status_code=400, detail="Enter a valid room number.")
    conn = get_conn()
    hostel_row = db_exec(conn, "SELECT 1 FROM users WHERE role = 'Warden' AND LOWER(hostel_block) = LOWER(?)", (hostel,)).fetchone()
    if not hostel_row:
        conn.close()
        raise HTTPException(status_code=400, detail="Select a valid SVNIT hostel.")
    db_exec(conn, "UPDATE users SET hostel_block = ?, wing = ?, room = ?, phone = ? WHERE UPPER(user_id) = ? AND role = 'Student'",
            (hostel, wing, room, phone, account["user_id"].upper()))
    updated = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (account["user_id"].upper(),)).fetchone()
    conn.commit()
    conn.close()
    user = dict(updated)
    user.pop("password", None)
    user.pop("dob", None)
    return {"success": True, "user": user}

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
        "INSERT INTO ads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (ad_id, req.sponsor_tag.strip(), req.title.strip(), req.subtitle.strip(),
         (req.badge_text or "").strip(), (req.cta_text or "Explore →").strip(),
         req.target_url.strip(), (req.image_url or "").strip(),
         req.bg_gradient or "linear-gradient(135deg, #002970 0%, #0284C7 100%)",
         created_at, expires_at)
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Sponsor Ad '{req.title}' published!"}

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
    if hostel_block and hostel_block != "All":
        rows = db_exec(conn, "SELECT departments.*, users.email AS login_email FROM departments LEFT JOIN users ON UPPER(users.user_id) = UPPER(departments.id) WHERE departments.type = 'Central' OR LOWER(departments.hostel_block) = LOWER(?)", (hostel_block,)).fetchall()
    else:
        rows = db_exec(conn, "SELECT departments.*, users.email AS login_email FROM departments LEFT JOIN users ON UPPER(users.user_id) = UPPER(departments.id)").fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/departments/create")
def create_department(req: CreateDepartmentReq, request: Request):
    account = request.state.user
    raw_name = (req.name or req.title or "").strip()
    did = (req.dept_id or raw_name).strip().upper().replace(" ", "_").replace("/", "")
    dept_type = "Hostel" if account["role"] == "Warden" else req.dept_type
    h_block = account["hostel_block"] if account["role"] == "Warden" else req.hostel_block if dept_type == "Hostel" else "All"
    email = require_svnit_email(req.email)
    display_title = raw_name

    conn = get_conn()
    existing = db_exec(conn, "SELECT * FROM departments WHERE UPPER(id) = ?", (did,)).fetchone()
    if existing:
        db_exec(conn, "UPDATE departments SET title = ?, type = ?, hostel_block = ?, icon = ? WHERE UPPER(id) = ?",
                (display_title, dept_type, h_block, req.icon or "🛠️", did))
    else:
        db_exec(conn, "INSERT INTO departments VALUES (?, ?, ?, ?, ?)",
                (did, display_title, dept_type, h_block, req.icon or "🛠️"))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Department '{display_title}' saved.", "departments": list_departments()}

@app.get("/api/warden/students")
def get_hostel_students(request: Request, hostel_block: str = "All"):
    account = request.state.user
    if account["role"] == "Warden":
        hostel_block = account["hostel_block"]
    conn = get_conn()
    if hostel_block == "All":
        rows = db_exec(conn, "SELECT * FROM users WHERE role = 'Student'").fetchall()
    else:
        rows = db_exec(conn, "SELECT * FROM users WHERE role = 'Student' AND LOWER(hostel_block) = LOWER(?)", (hostel_block,)).fetchall()
    conn.close()
    return [{k: v for k, v in dict(r).items() if k not in {"password", "dob"}} for r in rows]

@app.post("/api/warden/add-student")
def add_student_manual(req: StudentManualAddReq, request: Request):
    uid = req.user_id.strip().upper()
    hostel_block = request.state.user["hostel_block"]
    email = f"{uid.lower()}@svnit.ac.in"
    conn = get_conn()
    existing = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (uid,)).fetchone()
    if existing:
        db_exec(conn, "UPDATE users SET full_name = ?, room = ?, department = ?, year = ?, email = ? WHERE UPPER(user_id) = ?",
                (req.full_name.strip(), req.room.strip(), req.department.strip(), (req.year or "1st Year").strip(), email, uid))
    else:
        db_exec(conn, "INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (uid, "", req.full_name.strip(), "Student", "Verified Resident", "SVNIT", hostel_block, (req.year or "1st Year").strip(), req.room.strip(), "", email, req.department.strip(), ""))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Student {req.full_name} ({uid}) saved."}

@app.post("/api/warden/upload-students")
def upload_students_bulk(students: List[StudentManualAddReq], request: Request):
    account = request.state.user
    added, updated = 0, 0
    conn = get_conn()
    for s in students:
        uid = s.user_id.strip().upper()
        if not uid:
            continue
        hostel_block = account["hostel_block"] if account["role"] == "Warden" else s.hostel_block
        email = f"{uid.lower()}@svnit.ac.in"
        existing = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (uid,)).fetchone()
        if existing:
            db_exec(conn, "UPDATE users SET full_name = ?, hostel_block = ?, room = ?, department = ?, year = ?, email = ? WHERE UPPER(user_id) = ?",
                    (s.full_name.strip(), hostel_block, s.room.strip(), s.department.strip(), (s.year or "1st Year").strip(), email, uid))
            updated += 1
        else:
            db_exec(conn, "INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (uid, "", s.full_name.strip(), "Student", "Verified Resident", "SVNIT", hostel_block, (s.year or "1st Year").strip(), s.room.strip(), "", email, s.department.strip(), ""))
            added += 1
    conn.commit()
    conn.close()
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
    dept_obj = db_exec(conn, "SELECT * FROM departments WHERE (UPPER(id) = ? OR LOWER(title) = LOWER(?))", (req.category.upper(), req.category)).fetchone()
    if not dept_obj:
        conn.close()
        raise HTTPException(status_code=400, detail="Select a valid maintenance category.")
    ticket_id = f"TKT-{random.randint(100, 999)}"
    created_at = datetime.now().strftime("%Y-%m-%d, %I:%M %p")
    db_exec(conn, "INSERT INTO complaints VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (ticket_id, student["user_id"], student["full_name"], student["hostel_block"], student["room"], student["year"], student["department"], dept_obj["id"], req.summary, req.description, "Pending", dept_obj["title"], "", created_at, "", student["wing"] or ""))
    conn.commit()
    conn.close()
    return {"success": True, "ticket": {"ticket_id": ticket_id, "summary": req.summary, "status": "Pending"}}

@app.post("/api/complaints/staff-resolve")
def staff_resolve(req: StaffResolveReq, request: Request):
    resolved_at = datetime.now().strftime("%Y-%m-%d, %I:%M %p")
    conn = get_conn()
    db_exec(conn, "UPDATE complaints SET status = 'Awaiting Confirmation', staff_remark = ?, resolved_at = ? WHERE ticket_id = ?",
            (req.staff_remark, resolved_at, req.ticket_id))
    conn.commit()
    row = db_exec(conn, "SELECT * FROM complaints WHERE ticket_id = ?", (req.ticket_id,)).fetchone()
    conn.close()
    return {"success": True, "ticket": dict(row)}

@app.post("/api/complaints/student-verify")
def student_verify(req: StudentVerifyReq, request: Request):
    new_status = "Completed" if req.satisfied else "Reopened"
    conn = get_conn()
    db_exec(conn, "UPDATE complaints SET status = ? WHERE ticket_id = ?", (new_status, req.ticket_id))
    conn.commit()
    row = db_exec(conn, "SELECT * FROM complaints WHERE ticket_id = ?", (req.ticket_id,)).fetchone()
    conn.close()
    return {"success": True, "ticket": dict(row)}

@app.get("/api/unicore/clubs")
def get_clubs():
    conn = get_conn()
    rows = db_exec(conn, "SELECT * FROM clubs").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["members"] = json.loads(d["members"] or "[]")
        d["gallery"] = json.loads(d["gallery"] or "[]")
        result.append(d)
    return result

@app.get("/api/unicore/events")
def get_events():
    conn = get_conn()
    rows = db_exec(conn, "SELECT * FROM events ORDER BY date DESC").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["custom_fields"] = json.loads(d["custom_fields"] or "[]")
        d["rsvps"] = json.loads(d["rsvps"] or "[]")
        d["feedbacks"] = json.loads(d["feedbacks"] or "[]")
        d["ai_audit"] = json.loads(d["ai_audit"] or "{}") if d["ai_audit"] else None
        result.append(d)
    return result

@app.get("/api/notices")
def get_notices(request: Request):
    conn = get_conn()
    rows = db_exec(conn, "SELECT * FROM notices ORDER BY created_at DESC").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["custom_fields"] = json.loads(d["custom_fields"] or "[]")
        result.append(d)
    return result