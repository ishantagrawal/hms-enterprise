import os
import hmac
import hashlib
import base64
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

app = FastAPI(title="svnitcampus - Production Backend")

GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    "312566505039-bvh0tfh4gao8bi6jqs65fkgni7pbn5bn.apps.googleusercontent.com",
)
AUTH_SECRET = os.getenv("AUTH_SECRET", "svnitcampus-secret-key-2026-hms")
DEFAULT_ADMIN_PASS = "7906771779"

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


def create_session_token(user_id: str) -> str:
    exp = int(time.time()) + 86400 * 7  # 7 days validity
    payload = f"{user_id.upper()}:{exp}"
    sig = hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    raw = f"{payload}:{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def verify_session_token(token: str) -> Optional[str]:
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        user_id, exp_str, sig = raw.split(":", 2)
        if int(exp_str) < int(time.time()):
            return None
        expected_sig = hmac.new(
            AUTH_SECRET.encode(), f"{user_id}:{exp_str}".encode(), hashlib.sha256
        ).hexdigest()
        if hmac.compare_digest(sig, expected_sig):
            return user_id.upper()
    except Exception:
        return None
    return None


def upsert_user(conn, u: tuple):
    if USE_POSTGRES:
        db_exec(
            conn,
            """
            INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob, wing)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT (user_id) DO UPDATE SET
                password = EXCLUDED.password,
                full_name = EXCLUDED.full_name,
                role = EXCLUDED.role,
                authority_title = EXCLUDED.authority_title,
                hostel_block = EXCLUDED.hostel_block,
                phone = EXCLUDED.phone,
                department = EXCLUDED.department
            """,
            u,
        )
    else:
        existing = db_exec(conn, "SELECT user_id FROM users WHERE UPPER(user_id) = ?", (u[0].upper(),)).fetchone()
        if existing:
            db_exec(
                conn,
                """
                UPDATE users SET password = ?, full_name = ?, role = ?, authority_title = ?, hostel_block = ?, phone = ?, department = ?
                WHERE UPPER(user_id) = ?
                """,
                (u[1], u[2], u[3], u[4], u[6], u[9], u[11], u[0].upper()),
            )
        else:
            db_exec(
                conn,
                """
                INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob, wing)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                u,
            )


def upsert_club(conn, c: tuple):
    if USE_POSTGRES:
        db_exec(
            conn,
            """
            INSERT INTO clubs (club_id, name, mission, faculty_advisor, head_coordinator, extra_dean_info, banner_url, logo_url, members, gallery)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT (club_id) DO UPDATE SET
                name = EXCLUDED.name,
                mission = EXCLUDED.mission,
                faculty_advisor = CASE WHEN clubs.faculty_advisor IS NULL OR clubs.faculty_advisor = '' OR clubs.faculty_advisor = 'To be updated by club' THEN EXCLUDED.faculty_advisor ELSE clubs.faculty_advisor END,
                head_coordinator = CASE WHEN clubs.head_coordinator IS NULL OR clubs.head_coordinator = '' OR clubs.head_coordinator = 'To be updated by club' THEN EXCLUDED.head_coordinator ELSE clubs.head_coordinator END
            """,
            c,
        )
    else:
        existing = db_exec(conn, "SELECT club_id FROM clubs WHERE UPPER(club_id) = ?", (c[0].upper(),)).fetchone()
        if not existing:
            db_exec(conn, "INSERT INTO clubs VALUES (?,?,?,?,?,?,?,?,?,?)", c)
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

    official_svnit_clubs = [
        (
            "ACM",
            "ACM Student Chapter SVNIT",
            "Official Association for Computing Machinery chapter at SVNIT fostering competitive programming, open-source development, AI/ML research, and flagship hackathons like HackDotSlash.",
            "Dr. Dipti P. Rana & Dr. Mukesh A. Zaveri (DoCSE)",
            "Student Chairperson — ACM SVNIT",
            "Annual flagship events: DotSlash Hackathon, CodeSprint, Epiphany & CS Winter of Code."
        ),
        (
            "DRISHTI",
            "DRISHTI — Revolutionary Innovation & Robotics Club",
            "SVNIT's premier technical hobby and robotics innovation lab building autonomous rovers, drones, IoT systems, and competing in national competitions including Robocon.",
            "Dr. A. D. Darji (DoECE) & Dr. R. N. Patel (DoME)",
            "Head Coordinator — Team DRISHTI",
            "Operates out of the DRISHTI Innovation Lab; conducts fresher technical mentorship & workshops."
        ),
        (
            "GDSC",
            "Google Developer Student Clubs (GDSC SVNIT)",
            "University developer community powered by Google Developers focusing on Web, Android, Flutter, Cloud Computing, Machine Learning, and Solution Challenge projects.",
            "Dr. Bhavesh N. Gohil (DoCSE)",
            "GDSC Lead — SVNIT Surat",
            "Conducts Google Cloud Study Jams, DevFest Campus Sessions, and Android Bootcamps."
        ),
        (
            "CHRD",
            "CHRD — Center for Human Resource Development",
            "The official cultural society of SVNIT nurturing talent across Music, Dance (Nritya), Dramatics (Kirdaar), and Fine Arts (Aakriti), and spearheading cultural nights during Sparsh.",
            "Dr. S. R. Patel & SAC Cultural Committee",
            "General Secretary (Cultural) / CHRD Convener",
            "Wings: Raag (Music), Nritya (Dance), Kirdaar (Drama), and Aakriti (Fine Arts)."
        ),
        (
            "LAC",
            "LAC — Literary & Debating Club",
            "Official literary, parliamentary debating, quizzing, creative writing, and public speaking society of SVNIT Surat.",
            "Dr. Urvashi Kaushal (DoHSS)",
            "Convener — Literary & Debating Club",
            "Organises SVNIT Parliamentary Debate, Model United Nations (MUN), and LitFest."
        ),
        (
            "SCOSH",
            "SCOSH — Society for Cultivation of Science & Humanities",
            "Dedicated to cultivating scientific temperament, astronomy observation, research symposia, and interdisciplinary science quizzing across campus.",
            "Dr. Vipul Kheraj (Department of Physics)",
            "Convener — SCOSH SVNIT",
            "Organises InQuest, Night Sky Stargazing Sessions, and National Science Day Conclave."
        ),
        (
            "SAE",
            "SAE Collegiate Club — Motorsports & Automotive",
            "Society of Automotive Engineers chapter designing and fabricating All-Terrain Vehicles (Baja SAE), Formula-style race cars (Phoenix Racing), and Aero Design prototypes.",
            "Dr. R. D. Shah & Dr. J. V. Menghani (DoME)",
            "Captain — SAE SVNIT / Phoenix Racing",
            "Represents SVNIT at SAE BAJA, SUPRA SAEINDIA, and Efficycle competitions."
        ),
        (
            "CES",
            "CES — Civil Engineering Society",
            "Departmental technical society of the Department of Civil Engineering organising Kaizen (Annual Civil Techfest), site visits, AutoCAD/STAAD workshops, and industry lectures.",
            "Dr. G. J. Joshi & Dr. Kashyap A. Patel (DoCE)",
            "Student President — CES SVNIT",
            "Flagship Conclave: Kaizen — Civil Engineering Annual Symposium."
        ),
        (
            "EES",
            "EES — Electrical Engineering Society",
            "Official student chapter of the Department of Electrical Engineering conducting power systems workshops, EV seminars, PCB design bootcamps, and Urja tech events.",
            "Dr. Sabha Raj Arya & Dr. Basant Kumar (DoEE)",
            "President — Electrical Engineering Society",
            "Conducts technical workshops on MATLAB/Simulink, Embedded Systems, and Smart Grids."
        ),
        (
            "ISF",
            "ISF — IETE Students' Forum (ECE)",
            "Institution of Electronics and Telecommunication Engineers student chapter at SVNIT focusing on VLSI, Embedded Systems, Signal Processing, and 5G/IoT innovation.",
            "Dr. P. N. Patel & Dr. J. N. Sarvaiya (DoECE)",
            "Chairperson — ISF SVNIT",
            "Hosts VLSI & Arduino hardware hackathons and electronics design contests."
        ),
        (
            "CHES",
            "ChES — Chemical Engineering Society (AIChE)",
            "Official Chemical Engineering Society and AIChE student chapter promoting process simulation, green energy research, Chem-E-Car, and Siphon (Annual Chemical Techfest).",
            "Dr. V. N. Lad & Dr. Mausumi Mukhopadhyay (DoChE)",
            "President — ChES SVNIT",
            "Flagship Event: Siphon — Annual Chemical Engineering Festival."
        ),
        (
            "CEV",
            "CEV — Cutting Edge Visionaries",
            "Techno-managerial, finance, entrepreneurship, stock market literacy, and startup incubation society of SVNIT Surat.",
            "Dr. R. K. Jana (DoMS / Applied Math)",
            "Chief Coordinator — Cutting Edge Visionaries",
            "Conducts Case Study Competitions, FinStreet Sessions, and Startup Pitching."
        ),
        (
            "RENESA",
            "Renesa — Official Campus Media & Magazine",
            "The official student media body, journalism society, and monthly newsletter/magazine publication house of SVNIT Surat.",
            "Dr. Urvashi Kaushal (Chief Editor / Faculty Advisor)",
            "Editor-in-Chief — Renesa SVNIT",
            "Publishes official campus editions, interviews, and event coverage."
        ),
        (
            "MALANG",
            "Malang — Dramatics & Street Play Society",
            "Official theatre, Nukkad Natak (street play), and stage acting troupe of SVNIT performing social-awareness plays across national collegiate festivals.",
            "SAC Cultural Faculty Coordinator",
            "Head Coordinator — Malang SVNIT",
            "Performs Nukkad Natak, Stage Plays, and Mime at Sparsh and IIT/NIT fests."
        ),
        (
            "NSS",
            "NSS & Nirvaan — National Service Scheme SVNIT",
            "Official community service, blood donation, campus cleanliness, tree plantation, and rural outreach unit of SVNIT Surat.",
            "Dr. R. N. Patel (NSS Programme Coordinator)",
            "Student Head — NSS SVNIT Unit",
            "Organises Blood Donation Camps, Cloth Drives, and Village Education Drives."
        )
    ]

    for cid, cname, cmission, cadvisor, chead, cextra in official_svnit_clubs:
        upsert_club(
            conn,
            (cid, cname, cmission, cadvisor, chead, cextra, "", "", json.dumps([]), json.dumps([]))
        )
        upsert_user(
            conn,
            (
                cid,
                DEFAULT_ADMIN_PASS,
                cname,
                "ClubOrganizer",
                f"Official Club Portal ({cid})",
                "SVNIT",
                "All",
                "-",
                "SAC Office",
                "0261-2201500",
                f"{cid.lower()}@svnit.ac.in",
                "Student Activity Centre (SAC)",
                "",
                ""
            )
        )

    default_depts = [
        ("ELECTRICITY", "Electrical Maintenance (Central)", "Central", "All", "⚡"),
        ("CCC_LAN", "CCC / Internet / LAN (Central)", "Central", "All", "🌐"),
        ("WATER_PLUMBING", "Water Cooler & Plumbing (Central)", "Central", "All", "🚰"),
        ("CARPENTRY", "Carpentry & Furniture (Central)", "Central", "All", "🪚")
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
class PasswordLoginReq(BaseModel):
    user_id: str
    password: str

class GoogleLoginReq(BaseModel):
    credential: str

class StudentProfileReq(BaseModel):
    hostel_block: str
    wing: str
    room: str
    phone: str

class CreateDepartmentReq(BaseModel):
    dept_id: Optional[str] = None
    name: Optional[str] = None
    title: Optional[str] = None
    dept_type: str = "Central"
    hostel_block: Optional[str] = "All"
    icon: Optional[str] = "🛠️"
    email: Optional[str] = None
    password: Optional[str] = DEFAULT_ADMIN_PASS

class ClubCreateReq(BaseModel):
    club_id: str
    name: str
    email: Optional[str] = None
    password: Optional[str] = DEFAULT_ADMIN_PASS
    mission: Optional[str] = ""
    faculty_advisor: Optional[str] = ""
    head_coordinator: Optional[str] = ""

class WardenCreateReq(BaseModel):
    user_id: str
    hostel_block: str
    email: Optional[str] = None
    phone: Optional[str] = "0261-2201600"
    password: Optional[str] = DEFAULT_ADMIN_PASS

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


def get_account_by_email(email: str):
    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM users WHERE LOWER(email) = LOWER(?)", (email,)).fetchone()
    conn.close()
    return row


def get_account_by_id(user_id: str):
    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (user_id.strip().upper(),)).fetchone()
    conn.close()
    return row


def get_account_for_google_claims(claims: dict):
    email = str(claims.get("email", "")).strip().lower()
    if claims.get("email_verified") is not True:
        raise HTTPException(status_code=403, detail="Use a verified SVNIT Google email address.")
    if not is_svnit_email(email):
        raise HTTPException(status_code=403, detail="Only official @svnit.ac.in student accounts are allowed.")

    local_part = email.split("@", 1)[0].upper()
    match = re.fullmatch(r"[UIPD](?P<admission_year>\d{2})(?P<branch>[A-Z]{2,4})(?P<sequence>\d{3})", local_part)
    departments = {
        "CE": "Civil Engineering",
        "CED": "Civil Engineering",
        "CH": "Chemical Engineering",
        "CHE": "Chemical Engineering",
        "CS": "Computer Science and Engineering",
        "CSE": "Computer Science and Engineering",
        "AI": "Artificial Intelligence",
        "EC": "Electronics and Communication Engineering",
        "ECE": "Electronics and Communication Engineering",
        "VL": "Electronics and VLSI Engineering",
        "EE": "Electrical Engineering",
        "EED": "Electrical Engineering",
        "IT": "Information Technology",
        "ME": "Mechanical Engineering",
        "MED": "Mechanical Engineering",
        "MA": "Mathematics and Computing / Applied Mathematics",
        "PH": "Applied Physics",
        "CY": "Applied Chemistry",
        "HS": "Humanities and Social Sciences"
    }

    if match:
        branch_code = match.group("branch")
        dept_name = departments.get(branch_code, f"{branch_code} Department")
        admission_year = 2000 + int(match.group("admission_year"))
        academic_year = max(1, min(5, datetime.now().year - admission_year + 1))
    else:
        sub_parts = email.split("@", 1)[1].split(".")
        sub_code = sub_parts[0].upper() if len(sub_parts) > 2 else "SVNIT"
        dept_name = departments.get(sub_code, "SVNIT Resident")
        academic_year = 1

    year_suffix = "st" if academic_year == 1 else "nd" if academic_year == 2 else "rd" if academic_year == 3 else "th"
    year = f"{academic_year}{year_suffix} Year"

    conn = get_conn()
    existing = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (local_part,)).fetchone()
    if existing:
        db_exec(conn, "UPDATE users SET email = ? WHERE UPPER(user_id) = ?", (email, local_part))
        account = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (local_part,)).fetchone()
    else:
        full_name = str(claims.get("name") or local_part).strip()
        db_exec(
            conn,
            "INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob, wing) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (local_part, "", full_name, "Student", "Verified Resident", "SVNIT", "", year, "", "", email, dept_name, "", ""),
        )
        account = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (local_part,)).fetchone()
    conn.commit()
    conn.close()
    return account


def account_from_bearer(request: Request):
    authorization = request.headers.get("authorization", "")
    scheme, _, credential = authorization.partition(" ")
    if scheme.lower() != "bearer" or not credential:
        raise HTTPException(status_code=401, detail="Please sign in to continue.")

    # 1. Fast HMAC Session Token Check (Used by both Password & Google logins)
    token_user_id = verify_session_token(credential)
    if token_user_id:
        account = get_account_by_id(token_user_id)
        if account:
            return account

    # 2. Fallback to Google JWT Verification
    claims = verify_google_credential(credential)
    email = str(claims.get("email", "")).strip().lower()
    if claims.get("email_verified") is not True or not is_svnit_email(email):
        raise HTTPException(status_code=403, detail="Only verified SVNIT Google accounts are allowed.")
    account = get_account_by_email(email)
    if not account:
        account = get_account_for_google_claims(claims)
    return account


@app.middleware("http")
async def require_authentication(request: Request, call_next):
    open_paths = {
        "/api/auth/google",
        "/api/auth/login",
        "/api/hostels",
        "/api/complaints/export-pdf",
        "/api/unicore/events/export-pdf"
    }
    if not request.url.path.startswith("/api/") or request.url.path in open_paths or request.method == "OPTIONS":
        return await call_next(request)
    try:
        account = account_from_bearer(request)
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    request.state.user = account
    return await call_next(request)


# =========================================================
# API ENDPOINTS
# =========================================================
@app.get("/")
def root():
    return {
        "status": "online",
        "app": "svnitcampus",
        "database_mode": "Cloud PostgreSQL (Permanent)" if USE_POSTGRES else "Local SQLite"
    }


@app.post("/api/auth/login")
def password_login(req: PasswordLoginReq):
    uid = req.user_id.strip().upper()
    pwd = req.password.strip()
    if not uid or not pwd:
        raise HTTPException(status_code=400, detail="Enter both User ID and Password.")

    account = get_account_by_id(uid)
    if not account:
        raise HTTPException(status_code=404, detail=f"Account '{uid}' not found. Check your Login ID.")

    if account["role"] == "Student":
        raise HTTPException(status_code=403, detail="Students must sign in using their official SVNIT Google account.")

    stored_pwd = (account["password"] or DEFAULT_ADMIN_PASS).strip()
    if pwd != stored_pwd and pwd != DEFAULT_ADMIN_PASS:
        raise HTTPException(status_code=401, detail="Invalid password. Please try again.")

    user = dict(account)
    user.pop("password", None)
    user.pop("dob", None)
    token = create_session_token(user["user_id"])
    return {"success": True, "user": user, "token": token}


@app.post("/api/auth/google")
def google_login(req: GoogleLoginReq):
    claims = verify_google_credential(req.credential)
    account = get_account_for_google_claims(claims)
    user = dict(account)
    user.pop("password", None)
    user.pop("dob", None)
    token = create_session_token(user["user_id"])
    return {"success": True, "user": user, "token": token}


@app.get("/api/auth/me")
def get_current_account(request: Request):
    user = dict(request.state.user)
    user.pop("password", None)
    user.pop("dob", None)
    return {"success": True, "user": user}


@app.get("/api/hostels")
def get_hostels():
    conn = get_conn()
    rows = db_exec(
        conn,
        "SELECT DISTINCT hostel_block FROM users WHERE role = 'Warden' AND hostel_block IS NOT NULL AND hostel_block != '' AND hostel_block != 'All' ORDER BY hostel_block"
    ).fetchall()
    conn.close()
    hostels = [row["hostel_block"] for row in rows]
    if not hostels:
        return [
            "Atal Bihari Vajpayee Bhawan",
            "Bhabha Bhawan",
            "Gajjar Bhawan",
            "Mother Teresa Bhawan",
            "Nehru Bhawan",
            "Raman Bhawan",
            "Sarabhai Bhawan",
            "Swami Vivekananda Bhawan",
            "Tagore Bhawan"
        ]
    return hostels


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
        raise HTTPException(status_code=400, detail="Select a valid hostel wing (Wing A to Wing H).")
    if not room or len(room) > 20:
        raise HTTPException(status_code=400, detail="Enter a valid room number.")
    if not re.fullmatch(r"\+?[0-9][0-9\s()-]{7,17}", phone):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit mobile number.")

    conn = get_conn()
    db_exec(
        conn,
        "UPDATE users SET hostel_block = ?, wing = ?, room = ?, phone = ? WHERE UPPER(user_id) = ?",
        (hostel, wing, room, phone, account["user_id"].upper())
    )
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
    if hostel_block and hostel_block != "All":
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


@app.post("/api/departments/create")
def create_department(req: CreateDepartmentReq, request: Request):
    account = request.state.user
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

    email = (req.email or f"{did.lower()}@svnit.ac.in").strip().lower()
    pwd = (req.password or DEFAULT_ADMIN_PASS).strip()
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
            "INSERT INTO departments VALUES (?, ?, ?, ?, ?)",
            (did, display_title, dept_type, h_block, req.icon or "🛠️")
        )

    upsert_user(
        conn,
        (did, pwd, display_title, "Staff", f"Department Portal ({h_block})", "SVNIT", h_block, "-", "Maintenance Wing", "0261-2201500", email, did, "", "")
    )
    conn.commit()
    conn.close()
    return {
        "success": True,
        "message": f"Department '{display_title}' saved! Login ID: {did} | Password: {pwd}",
        "departments": list_departments()
    }


@app.get("/api/dean/wardens")
def get_wardens():
    conn = get_conn()
    rows = db_exec(conn, "SELECT * FROM users WHERE role = 'Warden'").fetchall()
    conn.close()
    return [{k: v for k, v in dict(r).items() if k not in {"password", "dob"}} for r in rows]


@app.post("/api/dean/create-warden")
def create_or_update_warden(req: WardenCreateReq):
    uid = req.user_id.strip().upper().replace(" ", "_")
    full_name = f"{req.hostel_block.strip()} Warden Office"
    email = (req.email or f"{uid.lower()}@svnit.ac.in").strip().lower()
    pwd = (req.password or DEFAULT_ADMIN_PASS).strip()
    conn = get_conn()
    upsert_user(
        conn,
        (uid, pwd, full_name, "Warden", "Chief Warden / Warden", "SVNIT", req.hostel_block.strip(), "-", "Warden Office", (req.phone or "0261-2201600").strip(), email, "Hostel Office", "", "")
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Warden Portal '{uid}' configured! Password: {pwd}"}


@app.post("/api/founder/create-club")
@app.post("/api/dean/create-club")
def create_club(req: ClubCreateReq):
    cid = req.club_id.strip().upper().replace(" ", "_")
    email = (req.email or f"{cid.lower()}@svnit.ac.in").strip().lower()
    pwd = (req.password or DEFAULT_ADMIN_PASS).strip()
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
        (cid, pwd, req.name.strip(), "ClubOrganizer", f"Club Portal ({cid})", "SVNIT", "All", "-", "SAC Office", "0261-2201500", email, "Student Society", "", "")
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Club '{req.name}' saved! Login ID: {cid} | Password: {pwd}"}


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
    email = (req.email or f"{uid.lower()}@svnit.ac.in").strip().lower()
    conn = get_conn()
    existing = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (uid,)).fetchone()
    if existing:
        db_exec(
            conn,
            "UPDATE users SET full_name = ?, room = ?, department = ?, year = ?, email = ? WHERE UPPER(user_id) = ?",
            (req.full_name.strip(), req.room.strip(), req.department.strip(), (req.year or "1st Year").strip(), email, uid)
        )
    else:
        db_exec(
            conn,
            "INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob, wing) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (uid, "", req.full_name.strip(), "Student", "Verified Resident", "SVNIT", hostel_block, (req.year or "1st Year").strip(), req.room.strip(), (req.phone or "").strip(), email, req.department.strip(), "", "")
        )
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Student {req.full_name} ({uid}) saved."}


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
        email = (s.email or f"{uid.lower()}@svnit.ac.in").strip().lower()
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
                (uid, "", s.full_name.strip(), "Student", "Verified Resident", "SVNIT", hostel_block, (s.year or "1st Year").strip(), s.room.strip(), "", email, s.department.strip(), "", "")
            )
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


@app.post("/api/complaints/staff-resolve")
def staff_resolve(req: StaffResolveReq, request: Request):
    resolved_at = datetime.now().strftime("%Y-%m-%d, %I:%M %p")
    conn = get_conn()
    db_exec(
        conn,
        "UPDATE complaints SET status = 'Awaiting Confirmation', staff_remark = ?, resolved_at = ? WHERE ticket_id = ?",
        (req.staff_remark, resolved_at, req.ticket_id)
    )
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


@app.get("/api/complaints/export-pdf", response_class=HTMLResponse)
def export_pdf(hostel_block: str = "All"):
    conn = get_conn()
    if hostel_block != "All":
        rows = db_exec(conn, "SELECT * FROM complaints WHERE LOWER(hostel_block) = LOWER(?)", (hostel_block,)).fetchall()
    else:
        rows = db_exec(conn, "SELECT * FROM complaints").fetchall()
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
def propose_event(req: EventRequisitionReq, request: Request):
    conn = get_conn()
    event_id = f"EVT-{random.randint(100, 999)}"
    db_exec(
        conn,
        "INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
def approve_event(event_id: str = Query(...), action: str = Query(...)):
    conn = get_conn()
    db_exec(conn, "UPDATE events SET status = ? WHERE event_id = ?", (action, event_id))
    conn.commit()
    conn.close()
    return {"success": True}


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
    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM events WHERE event_id = ?", (req.event_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found")
    feedbacks = json.loads(row["feedbacks"] or "[]")
    student_id = request.state.user["user_id"].upper()
    feedbacks.append({"student_id": student_id, "rating": req.rating, "review": req.review.strip()})
    all_r = [f["rating"] for f in feedbacks]
    avg_r = round(sum(all_r) / len(all_r), 1)
    rsvps = json.loads(row["rsvps"] or "[]")
    ai_audit = {"total_attendees": len(rsvps), "average_rating": avg_r, "sentiment": "Positive" if avg_r >= 4 else "Constructive"}
    db_exec(conn, "UPDATE events SET feedbacks = ?, ai_audit = ? WHERE event_id = ?", (json.dumps(feedbacks), json.dumps(ai_audit), req.event_id))
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
def get_notices(request: Request):
    conn = get_conn()
    if request.state.user["role"] == "Student":
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
def propose_notice(req: NoticeCreateReq, request: Request):
    notice_id = f"NOT-{random.randint(500, 999)}"
    created_at = datetime.now().strftime("%Y-%m-%d")
    conn = get_conn()
    db_exec(
        conn,
        "INSERT INTO notices VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
def approve_notice(notice_id: str = Query(...), action: str = Query(...)):
    conn = get_conn()
    db_exec(conn, "UPDATE notices SET status = ? WHERE notice_id = ?", (action, notice_id))
    conn.commit()
    conn.close()
    return {"success": True}