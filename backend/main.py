import os
import json
import random
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, List, Dict
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None

app = FastAPI(title="SVNIT HMS - Cloud Persistent Production Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
            dob TEXT
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
            resolved_at TEXT
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
            db_exec(conn, "INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (user_id) DO NOTHING", u)
        else:
            db_exec(conn, "INSERT OR IGNORE INTO users VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", u)

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


# =========================================================
# PYDANTIC MODELS
# =========================================================
class LoginReq(BaseModel):
    user_id: str
    password: str

class CreateDepartmentReq(BaseModel):
    dept_id: Optional[str] = None
    name: Optional[str] = None
    title: Optional[str] = None
    password: Optional[str] = "123"
    dept_type: str = "Central"
    hostel_block: Optional[str] = "All"
    icon: Optional[str] = "🛠️"

class ClubCreateReq(BaseModel):
    club_id: str
    name: str
    password: Optional[str] = "123"
    mission: Optional[str] = ""
    faculty_advisor: Optional[str] = ""
    head_coordinator: Optional[str] = ""

class WardenCreateReq(BaseModel):
    user_id: str
    hostel_block: str
    password: str
    phone: Optional[str] = "0261-2201600"

class PasswordResetReq(BaseModel):
    target_user_id: str
    new_password: str

class StudentChangePassReq(BaseModel):
    student_id: str
    old_password: str
    new_password: str

class StudentManualAddReq(BaseModel):
    user_id: str
    full_name: str
    hostel_block: str
    room: str
    department: str
    year: Optional[str] = "1st Year"
    dob: str
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


# =========================================================
# API ENDPOINTS
# =========================================================
@app.get("/")
def root():
    return {
        "status": "online",
        "database_mode": "Cloud PostgreSQL (Permanent)" if USE_POSTGRES else "Local SQLite (Set DATABASE_URL on Render for Cloud Persistence)"
    }

@app.post("/api/auth/login")
def login(req: LoginReq):
    uid = req.user_id.strip().upper()
    pwd = req.password.strip()
    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (uid,)).fetchone()
    conn.close()
    if row and (row["password"] == pwd or row["dob"] == pwd):
        u = dict(row)
        u.pop("password", None)
        return {"success": True, "user": u}
    raise HTTPException(status_code=401, detail="Invalid Roll No / Login ID or Password")

# --- PROMOTIONAL AD BANNERS (PAYTM IPO STYLE) ---
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
    return {"success": True, "message": f"Sponsor Ad '{req.title}' published until {expires_at}!"}

@app.post("/api/ads/delete")
def delete_ad(ad_id: str = Query(...)):
    conn = get_conn()
    db_exec(conn, "DELETE FROM ads WHERE ad_id = ?", (ad_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Ad removed."}

# --- DEPARTMENTS (Upsert / Edit Support) ---
@app.get("/api/departments")
def get_departments(hostel_block: str = "All"):
    conn = get_conn()
    if hostel_block and hostel_block != "All":
        rows = db_exec(conn, "SELECT * FROM departments WHERE type = 'Central' OR LOWER(hostel_block) = LOWER(?)", (hostel_block,)).fetchall()
    else:
        rows = db_exec(conn, "SELECT * FROM departments").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/departments/create")
def create_department(req: CreateDepartmentReq):
    raw_name = (req.name or req.title or "").strip()
    if not raw_name:
        raise HTTPException(status_code=400, detail="Department name is required.")
    did = (req.dept_id or raw_name).strip().upper().replace(" ", "_").replace("/", "")
    pwd = (req.password or "123").strip()
    h_block = req.hostel_block if req.dept_type == "Hostel" else "All"

    display_title = raw_name
    if req.dept_type == "Hostel" and h_block != "All" and h_block.lower() not in raw_name.lower():
        display_title = f"{raw_name} ({h_block})"
    elif req.dept_type == "Central" and "central" not in raw_name.lower():
        display_title = f"{raw_name} (Central)"

    conn = get_conn()
    existing = db_exec(conn, "SELECT * FROM departments WHERE UPPER(id) = ?", (did,)).fetchone()
    if existing:
        db_exec(conn, "UPDATE departments SET title = ?, type = ?, hostel_block = ?, icon = ? WHERE UPPER(id) = ?",
                (display_title, req.dept_type, h_block, req.icon or "🛠️", did))
    else:
        db_exec(conn, "INSERT INTO departments VALUES (?, ?, ?, ?, ?)",
                (did, display_title, req.dept_type, h_block, req.icon or "🛠️"))

    existing_u = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (did,)).fetchone()
    if existing_u:
        db_exec(conn, "UPDATE users SET password = ?, full_name = ?, hostel_block = ?, department = ? WHERE UPPER(user_id) = ?",
                (pwd, display_title, h_block, did, did))
    else:
        db_exec(conn, "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (did, pwd, display_title, "Staff", f"Department Portal ({h_block})", "SVNIT", h_block, "-", "Maintenance Wing", "0261-2201500", f"{did.lower()}@svnit.ac.in", did, "01011990"))
    conn.commit()
    conn.close()
    return {
        "success": True,
        "message": f"Department '{display_title}' saved! Login ID: {did} | Password: {pwd}",
        "departments": get_departments()
    }

# --- WARDENS & DEAN CONTROLS ---
@app.get("/api/dean/wardens")
def get_wardens():
    conn = get_conn()
    rows = db_exec(conn, "SELECT * FROM users WHERE role = 'Warden'").fetchall()
    conn.close()
    return [{k: v for k, v in dict(r).items() if k != "password"} for r in rows]

@app.post("/api/dean/create-warden")
def create_or_update_warden(req: WardenCreateReq):
    uid = req.user_id.strip().upper().replace(" ", "_")
    full_name = f"{req.hostel_block.strip()} Warden Office"
    conn = get_conn()
    if db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (uid,)).fetchone():
        db_exec(conn, "UPDATE users SET password = ?, hostel_block = ?, full_name = ? WHERE UPPER(user_id) = ?",
                (req.password.strip(), req.hostel_block.strip(), full_name, uid))
    else:
        db_exec(conn, "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (uid, req.password.strip(), full_name, "Warden", "Chief Warden / Warden", "SVNIT", req.hostel_block.strip(), "-", "Warden Office", req.phone.strip(), f"{uid.lower()}@svnit.ac.in", "Hostel Office", "01011980"))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Warden Portal '{uid}' saved for {req.hostel_block}!"}

@app.post("/api/founder/create-club")
@app.post("/api/dean/create-club")
def create_club(req: ClubCreateReq):
    cid = req.club_id.strip().upper().replace(" ", "_")
    pwd = (req.password or "123").strip()
    conn = get_conn()
    if db_exec(conn, "SELECT * FROM clubs WHERE UPPER(club_id) = ?", (cid,)).fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail=f"Club ID '{cid}' already exists.")
    db_exec(conn, "INSERT INTO clubs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (cid, req.name.strip(), (req.mission or "").strip() or "Official Student Chapter of SVNIT Surat.",
             (req.faculty_advisor or "").strip() or "To be updated by club", (req.head_coordinator or "").strip() or "To be updated by club",
             "", "", "", json.dumps([]), json.dumps([])))
    if db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (cid,)).fetchone():
        db_exec(conn, "UPDATE users SET password = ? WHERE UPPER(user_id) = ?", (pwd, cid))
    else:
        db_exec(conn, "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (cid, pwd, req.name.strip(), "ClubOrganizer", f"Club Portal ({cid})", "SVNIT", "All", "-", "SAC Office", "", f"{cid.lower()}@svnit.ac.in", "Student Society", "01012000"))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Club '{req.name}' created! Login ID: {cid} | Password: {pwd}"}

@app.post("/api/dean/reset-password")
def reset_password(req: PasswordResetReq, admin_id: str = Query("DEAN")):
    target_id = req.target_user_id.strip().upper()
    conn = get_conn()
    target = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (target_id,)).fetchone()
    if not target:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Account ID '{target_id}' not found.")
    db_exec(conn, "UPDATE users SET password = ? WHERE UPPER(user_id) = ?", (req.new_password.strip(), target_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Password updated for {target['full_name']} ({target['user_id']})"}

# --- 6-FIELD STUDENT ONBOARDING ---
@app.get("/api/warden/students")
def get_hostel_students(hostel_block: str = "All"):
    conn = get_conn()
    if hostel_block == "All":
        rows = db_exec(conn, "SELECT * FROM users WHERE role = 'Student'").fetchall()
    else:
        rows = db_exec(conn, "SELECT * FROM users WHERE role = 'Student' AND LOWER(hostel_block) = LOWER(?)", (hostel_block,)).fetchall()
    conn.close()
    return [{k: v for k, v in dict(r).items() if k != "password"} for r in rows]

@app.post("/api/warden/add-student")
def add_student_manual(req: StudentManualAddReq):
    uid = req.user_id.strip().upper()
    clean_dob = req.dob.strip().replace("-", "").replace("/", "")
    conn = get_conn()
    if db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (uid,)).fetchone():
        db_exec(conn, "UPDATE users SET full_name = ?, hostel_block = ?, room = ?, department = ?, year = ?, dob = ?, password = ? WHERE UPPER(user_id) = ?",
                (req.full_name.strip(), req.hostel_block.strip(), req.room.strip(), req.department.strip(), (req.year or "1st Year").strip(), clean_dob, clean_dob, uid))
    else:
        db_exec(conn, "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (uid, clean_dob, req.full_name.strip(), "Student", "Verified Resident", "SVNIT", req.hostel_block.strip(), (req.year or "1st Year").strip(), req.room.strip(), (req.phone or "").strip(), (req.email or f"{uid.lower()}@svnit.ac.in").strip(), req.department.strip(), clean_dob))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Student {req.full_name} ({uid}) saved! Password = DOB ({clean_dob})."}

@app.post("/api/warden/upload-students")
@app.post("/api/founder/upload-students")
def upload_students_bulk(students: List[StudentManualAddReq]):
    added, updated = 0, 0
    conn = get_conn()
    for s in students:
        uid = s.user_id.strip().upper()
        if not uid:
            continue
        clean_dob = s.dob.strip().replace("-", "").replace("/", "")
        if db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (uid,)).fetchone():
            db_exec(conn, "UPDATE users SET full_name = ?, hostel_block = ?, room = ?, department = ?, year = ?, dob = ?, password = ? WHERE UPPER(user_id) = ?",
                    (s.full_name.strip(), s.hostel_block.strip(), s.room.strip(), s.department.strip(), (s.year or "1st Year").strip(), clean_dob, clean_dob, uid))
            updated += 1
        else:
            db_exec(conn, "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (uid, clean_dob, s.full_name.strip(), "Student", "Verified Resident", "SVNIT", s.hostel_block.strip(), (s.year or "1st Year").strip(), s.room.strip(), (s.phone or "").strip(), (s.email or f"{uid.lower()}@svnit.ac.in").strip(), s.department.strip(), clean_dob))
            added += 1
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Bulk Upload Complete: {added} new students added, {updated} updated!"}

@app.post("/api/warden/reset-student-password")
def warden_reset_student(req: PasswordResetReq, warden_id: str = Query("CW_GAJJAR")):
    conn = get_conn()
    target = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (req.target_user_id.strip().upper(),)).fetchone()
    if not target:
        conn.close()
        raise HTTPException(status_code=404, detail="Student Roll No not found.")
    default_dob = target["dob"]
    db_exec(conn, "UPDATE users SET password = ? WHERE UPPER(user_id) = ?", (default_dob, target["user_id"]))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Password for {target['full_name']} reset to DOB ({default_dob})!"}

@app.post("/api/student/change-password")
def student_change_password(req: StudentChangePassReq):
    conn = get_conn()
    student = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (req.student_id.strip().upper(),)).fetchone()
    if not student:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found.")
    old_p = req.old_password.strip()
    if student["password"] != old_p and student["dob"] != old_p:
        conn.close()
        raise HTTPException(status_code=400, detail="Current password or DOB is incorrect.")
    db_exec(conn, "UPDATE users SET password = ? WHERE UPPER(user_id) = ?", (req.new_password.strip(), student["user_id"]))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Custom password saved successfully!"}

# --- COMPLAINTS (Strictly Scoped to Hostel Block for Hostel Wings) ---
@app.get("/api/complaints")
def get_complaints(role: str = "Dean", user_id: str = "", hostel_block: str = "All", department: str = ""):
    conn = get_conn()
    if role == "Student":
        rows = db_exec(conn, "SELECT * FROM complaints WHERE UPPER(student_id) = ? ORDER BY created_at DESC", (user_id.upper(),)).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    if role == "Warden" and hostel_block != "All":
        rows = db_exec(conn, "SELECT * FROM complaints WHERE LOWER(hostel_block) = LOWER(?) ORDER BY created_at DESC", (hostel_block,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    if role == "Staff":
        dept_key = (department or user_id).strip().upper()
        dept_row = db_exec(conn, "SELECT * FROM departments WHERE UPPER(id) = ?", (dept_key,)).fetchone()
        dept_scope = dept_row["hostel_block"] if dept_row else hostel_block
        rows = db_exec(conn, "SELECT * FROM complaints WHERE UPPER(category) LIKE ? OR UPPER(routed_to) LIKE ? ORDER BY created_at DESC", (f"%{dept_key}%", f"%{dept_key}%")).fetchall()
        conn.close()
        matched = [dict(r) for r in rows]
        if dept_scope and dept_scope != "All":
            matched = [c for c in matched if c["hostel_block"].lower() == dept_scope.lower()]
        elif hostel_block and hostel_block != "All":
            matched = [c for c in matched if c["hostel_block"].lower() == hostel_block.lower()]
        return matched

    rows = db_exec(conn, "SELECT * FROM complaints ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/complaints")
def create_complaint(req: ComplaintCreateReq):
    conn = get_conn()
    student = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (req.student_id.upper(),)).fetchone()
    if not student:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found")
    dept_obj = db_exec(conn, "SELECT * FROM departments WHERE UPPER(id) = ? OR LOWER(title) = LOWER(?)", (req.category.upper(), req.category)).fetchone()
    routed_title = dept_obj["title"] if dept_obj else f"{req.category} Department"
    cat_id = dept_obj["id"] if dept_obj else req.category

    ticket_id = f"TKT-{random.randint(100, 999)}"
    created_at = datetime.now().strftime("%Y-%m-%d, %I:%M %p")
    db_exec(conn, "INSERT INTO complaints VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (ticket_id, student["user_id"], student["full_name"], student["hostel_block"], student["room"], student["year"], student["department"], cat_id, req.summary, req.description, "Pending", routed_title, "", created_at, ""))
    conn.commit()
    conn.close()
    return {"success": True, "ticket": {"ticket_id": ticket_id, "student_id": student["user_id"], "student_name": student["full_name"], "hostel_block": student["hostel_block"], "room": student["room"], "category": cat_id, "summary": req.summary, "description": req.description, "status": "Pending", "routed_to": routed_title, "staff_remark": "", "created_at": created_at, "resolved_at": ""}}

@app.post("/api/complaints/staff-resolve")
def staff_resolve(req: StaffResolveReq):
    resolved_at = datetime.now().strftime("%Y-%m-%d, %I:%M %p")
    conn = get_conn()
    db_exec(conn, "UPDATE complaints SET status = 'Awaiting Confirmation', staff_remark = ?, resolved_at = ? WHERE ticket_id = ?",
            (req.staff_remark, resolved_at, req.ticket_id))
    conn.commit()
    row = db_exec(conn, "SELECT * FROM complaints WHERE ticket_id = ?", (req.ticket_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"success": True, "ticket": dict(row)}

@app.post("/api/complaints/student-verify")
def student_verify(req: StudentVerifyReq):
    new_status = "Completed" if req.satisfied else "Reopened"
    conn = get_conn()
    db_exec(conn, "UPDATE complaints SET status = ? WHERE ticket_id = ?", (new_status, req.ticket_id))
    conn.commit()
    row = db_exec(conn, "SELECT * FROM complaints WHERE ticket_id = ?", (req.ticket_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"success": True, "ticket": dict(row)}

@app.get("/api/complaints/export-pdf", response_class=HTMLResponse)
def export_pdf(hostel_block: str = "All", from_date: str = "", to_date: str = ""):
    conn = get_conn()
    if hostel_block != "All":
        rows = db_exec(conn, "SELECT * FROM complaints WHERE hostel_block = ?", (hostel_block,)).fetchall()
    else:
        rows = db_exec(conn, "SELECT * FROM complaints").fetchall()
    conn.close()
    tr_html = "".join([
        f"<tr><td>{c['ticket_id']}</td><td>{c['student_name']} ({c['student_id']})</td><td>{c['hostel_block']} ({c['room']})</td><td>{c['routed_to']}</td><td>{c['summary']}</td><td>{c['status']}</td><td>{c['created_at']}</td></tr>"
        for c in rows
    ])
    html = f"""
    <html><head><title>SVNIT Grievance Report</title>
    <style>body{{font-family:'Inter',Arial,sans-serif;padding:30px;color:#111827;}} table{{width:100%;border-collapse:collapse;margin-top:20px;}} th,td{{border:1px solid #d1d5db;padding:10px;text-align:left;font-size:13px;}} th{{background:#f3f4f6;}}</style>
    </head><body onload="window.print()">
    <h2>Sardar Vallabhbhai National Institute of Technology, Surat</h2>
    <h3>Official Hostel Grievance Audit Report</h3>
    <p><strong>Hostel Scope:</strong> {hostel_block} | <strong>Total Tickets:</strong> {len(rows)} | <strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
    <table><thead><tr><th>Ticket ID</th><th>Resident</th><th>Hostel & Room</th><th>Department</th><th>Summary</th><th>Status</th><th>Timestamp</th></tr></thead>
    <tbody>{tr_html}</tbody></table></body></html>
    """
    return HTMLResponse(content=html)

@app.get("/api/unicore/events/export-pdf", response_class=HTMLResponse)
def export_events_pdf(year: str = "2026", club_id: str = "All"):
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

# --- CLUBS, EVENTS & NOTICES (Link-Based Zero-DB-Bloat Architecture) ---
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

@app.post("/api/unicore/clubs/update-info")
def update_club_info(req: ClubUpdateInfoReq):
    conn = get_conn()
    if not db_exec(conn, "SELECT * FROM clubs WHERE UPPER(club_id) = ?", (req.club_id.upper(),)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Club not found")
    db_exec(conn, "UPDATE clubs SET mission = ?, extra_dean_info = ? WHERE UPPER(club_id) = ?",
            (req.mission, req.extra_dean_info, req.club_id.upper()))
    if req.faculty_advisor is not None:
        db_exec(conn, "UPDATE clubs SET faculty_advisor = ? WHERE UPPER(club_id) = ?", (req.faculty_advisor, req.club_id.upper()))
    if req.head_coordinator is not None:
        db_exec(conn, "UPDATE clubs SET head_coordinator = ? WHERE UPPER(club_id) = ?", (req.head_coordinator, req.club_id.upper()))
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
    row = db_exec(conn, "SELECT * FROM clubs WHERE UPPER(club_id) = ?", (req.club_id.upper(),)).fetchone()
    conn.close()
    res = dict(row)
    res["members"] = json.loads(res["members"] or "[]")
    res["gallery"] = json.loads(res["gallery"] or "[]")
    return {"success": True, "club": res}

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
    row = db_exec(conn, "SELECT * FROM clubs WHERE UPPER(club_id) = ?", (req.club_id.upper(),)).fetchone()
    conn.close()
    res = dict(row)
    res["members"] = json.loads(res["members"] or "[]")
    res["gallery"] = json.loads(res["gallery"] or "[]")
    return {"success": True, "club": res}

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
    row = db_exec(conn, "SELECT * FROM clubs WHERE UPPER(club_id) = ?", (req.club_id.upper(),)).fetchone()
    conn.close()
    res = dict(row)
    res["members"] = json.loads(res["members"] or "[]")
    res["gallery"] = json.loads(res["gallery"] or "[]")
    return {"success": True, "club": res}

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

@app.post("/api/unicore/events/propose")
def propose_event(req: EventRequisitionReq):
    conn = get_conn()
    app_events = db_exec(conn, "SELECT * FROM events WHERE date = ? AND status = 'Approved'", (req.date,)).fetchall()
    clash = None
    for ev in app_events:
        if not (req.end_time <= ev["start_time"] or req.start_time >= ev["end_time"]):
            clash = f"Note: Another event ({ev['club_id']}'s '{ev['title']}' at {ev['venue']}) is scheduled on {req.date} during {ev['start_time']}-{ev['end_time']}."
            break
    event_id = f"EVT-{random.randint(100, 999)}"
    db_exec(conn, "INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (event_id, req.club_id.upper(), req.title, req.date, req.start_time, req.end_time, req.venue,
             "Pending Dean Approval", req.submitted_by, req.description or "", req.budget or "Not Specified",
             req.funding_source or "Institute / Self", req.chief_guest or "None", req.expected_attendance or "100+",
             req.logistics_needs or "Standard Venue Setup", (req.image_url or "").strip(), (req.registration_link or "").strip(),
             json.dumps(req.custom_fields or []), json.dumps([]), json.dumps([]), json.dumps({})))
    conn.commit()
    row = db_exec(conn, "SELECT * FROM events WHERE event_id = ?", (event_id,)).fetchone()
    conn.close()
    res = dict(row)
    res["custom_fields"] = json.loads(res["custom_fields"] or "[]")
    res["rsvps"] = json.loads(res["rsvps"] or "[]")
    res["feedbacks"] = json.loads(res["feedbacks"] or "[]")
    return {"success": True, "message": clash or "Event proposal submitted to Dean for approval!", "event": res}

@app.post("/api/unicore/events/approve")
def approve_event(event_id: str = Query(...), action: str = Query(...)):
    conn = get_conn()
    db_exec(conn, "UPDATE events SET status = ? WHERE event_id = ?", (action, event_id))
    conn.commit()
    row = db_exec(conn, "SELECT * FROM events WHERE event_id = ?", (event_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    res = dict(row)
    res["custom_fields"] = json.loads(res["custom_fields"] or "[]")
    res["rsvps"] = json.loads(res["rsvps"] or "[]")
    res["feedbacks"] = json.loads(res["feedbacks"] or "[]")
    return {"success": True, "event": res}

@app.post("/api/unicore/events/rsvp")
def rsvp_event(req: EventRsvpReq):
    uid = req.student_id.strip().upper()
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
def submit_event_feedback(req: EventFeedbackReq):
    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM events WHERE event_id = ?", (req.event_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found")
    feedbacks = json.loads(row["feedbacks"] or "[]")
    feedbacks.append({"student_id": req.student_id.upper(), "rating": req.rating, "review": req.review})
    all_r = [f["rating"] for f in feedbacks]
    avg_r = round(sum(all_r) / len(all_r), 1)
    rsvps = json.loads(row["rsvps"] or "[]")
    ai_audit = {
        "total_attendees": len(rsvps),
        "average_rating": avg_r,
        "sentiment": "Positive" if avg_r >= 4 else "Constructive"
    }
    db_exec(conn, "UPDATE events SET feedbacks = ?, ai_audit = ? WHERE event_id = ?",
            (json.dumps(feedbacks), json.dumps(ai_audit), req.event_id))
    conn.commit()
    row = db_exec(conn, "SELECT * FROM events WHERE event_id = ?", (req.event_id,)).fetchone()
    conn.close()
    res = dict(row)
    res["custom_fields"] = json.loads(res["custom_fields"] or "[]")
    res["rsvps"] = json.loads(res["rsvps"] or "[]")
    res["feedbacks"] = json.loads(res["feedbacks"] or "[]")
    res["ai_audit"] = json.loads(res["ai_audit"] or "{}")
    return {"success": True, "event": res}

@app.get("/api/notices")
def get_notices(role: str = "Dean"):
    conn = get_conn()
    if role == "Student":
        rows = db_exec(conn, "SELECT * FROM notices WHERE status = 'Approved' ORDER BY created_at DESC").fetchall()
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
def propose_notice(req: NoticeCreateReq):
    notice_id = f"NOT-{random.randint(500, 999)}"
    created_at = datetime.now().strftime("%Y-%m-%d")
    conn = get_conn()
    db_exec(conn, "INSERT INTO notices VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (notice_id, req.club_id.upper(), req.title, req.message, req.target_branch, req.target_year,
             (req.image_url or "").strip(), (req.registration_link or "").strip(), json.dumps(req.custom_fields or []),
             "Pending Dean Approval", created_at))
    conn.commit()
    row = db_exec(conn, "SELECT * FROM notices WHERE notice_id = ?", (notice_id,)).fetchone()
    conn.close()
    res = dict(row)
    res["custom_fields"] = json.loads(res["custom_fields"] or "[]")
    return {"success": True, "notice": res, "message": "Notice submitted to Dean for approval!"}

@app.post("/api/notices/approve")
def approve_notice(notice_id: str = Query(...), action: str = Query(...)):
    conn = get_conn()
    db_exec(conn, "UPDATE notices SET status = ? WHERE notice_id = ?", (action, notice_id))
    conn.commit()
    row = db_exec(conn, "SELECT * FROM notices WHERE notice_id = ?", (notice_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Notice not found")
    res = dict(row)
    res["custom_fields"] = json.loads(res["custom_fields"] or "[]")
    return {"success": True, "notice": res}