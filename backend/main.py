import os
import asyncio
import hmac
import hashlib
import base64
import json
import logging
import random
import re
import sqlite3
import threading
import time
import uuid
from html import escape as html_escape
from datetime import datetime, timedelta
from typing import Optional, List, Dict
from urllib.parse import urlparse
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
import google.auth.exceptions
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token

try:
    import psycopg2
    from psycopg2 import pool
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None
    pool = None
    RealDictCursor = None

app = FastAPI(title="svnitcampus - Production Backend")
logger = logging.getLogger(__name__)

# Compress payloads > 500 bytes by ~80% for fast campus Wi-Fi transfer
app.add_middleware(GZipMiddleware, minimum_size=500)

GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    "312566505039-bvh0tfh4gao8bi6jqs65fkgni7pbn5bn.apps.googleusercontent.com",
)
AUTH_SECRET = os.getenv("AUTH_SECRET", "svnitcampus-secret-key-2026-hms")
DEFAULT_ADMIN_PASS = "7906771779"

_GOOGLE_TOKEN_CACHE: Dict[str, tuple] = {}
_GOOGLE_TOKEN_CACHE_LOCK = threading.Lock()

# RAM Cache for Bearer token user lookup (eliminates redundant DB hit on every API call)
_USER_AUTH_CACHE: Dict[str, tuple] = {}
_USER_AUTH_CACHE_LOCK = threading.Lock()
USER_CACHE_TTL = 60.0

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
                self._pool.putconn(self._conn)
            except Exception:
                try:
                    self._conn.close()
                except Exception:
                    pass

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
            try:
                raw_conn = pg_pool.getconn()
                if raw_conn.closed != 0:
                    pg_pool.putconn(raw_conn, close=True)
                    raw_conn = pg_pool.getconn()
                return PooledConnection(raw_conn, pg_pool)
            except Exception as e:
                print(f"⚠️ Pool getconn fallback: {e}")
        url = DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return psycopg2.connect(url, cursor_factory=RealDictCursor)

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


def invalidate_user_cache(user_id: Optional[str] = None):
    with _USER_AUTH_CACHE_LOCK:
        if user_id:
            _USER_AUTH_CACHE.pop(user_id.strip().upper(), None)
        else:
            _USER_AUTH_CACHE.clear()


def create_session_token(user_id: str) -> str:
    exp = int(time.time()) + 86400 * 7
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
    invalidate_user_cache(u[0])


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
                faculty_advisor = CASE WHEN clubs.faculty_advisor IS NULL OR clubs.faculty_advisor = '' THEN EXCLUDED.faculty_advisor ELSE clubs.faculty_advisor END,
                head_coordinator = CASE WHEN clubs.head_coordinator IS NULL OR clubs.head_coordinator = '' THEN EXCLUDED.head_coordinator ELSE clubs.head_coordinator END
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
    db_exec(conn, '''
        CREATE TABLE IF NOT EXISTS event_chat_messages (
            message_id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            student_name TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
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

    user_columns = {column[0] for column in db_exec(conn, "SELECT * FROM users LIMIT 0").description}
    if "wing" not in user_columns:
        db_exec(conn, "ALTER TABLE users ADD COLUMN wing TEXT")
    complaint_columns = {column[0] for column in db_exec(conn, "SELECT * FROM complaints LIMIT 0").description}
    if "wing" not in complaint_columns:
        db_exec(conn, "ALTER TABLE complaints ADD COLUMN wing TEXT")

    # High-Speed B-Tree & Expression Indexes (accelerates UPPER/LOWER filters)
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_users_upper_id ON users (UPPER(user_id))",
        "CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users (LOWER(email))",
        "CREATE INDEX IF NOT EXISTS idx_users_role_hostel ON users (role, LOWER(hostel_block))",
        "CREATE INDEX IF NOT EXISTS idx_complaints_student ON complaints (UPPER(student_id), created_at)",
        "CREATE INDEX IF NOT EXISTS idx_complaints_hostel ON complaints (LOWER(hostel_block), created_at)",
        "CREATE INDEX IF NOT EXISTS idx_complaints_cat ON complaints (UPPER(category), LOWER(routed_to))",
        "CREATE INDEX IF NOT EXISTS idx_events_date_status ON events (date, status)",
        "CREATE INDEX IF NOT EXISTS idx_events_club ON events (UPPER(club_id))",
        "CREATE INDEX IF NOT EXISTS idx_notices_status ON notices (status, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_event_chat_event_created ON event_chat_messages (event_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_event_albums_event ON event_photo_albums (event_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_profile_requests_hostel_status ON student_profile_requests (LOWER(hostel_block), status, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_profile_requests_student_status ON student_profile_requests (UPPER(student_id), status, created_at)",
    ]
    for idx_sql in indexes:
        try:
            db_exec(conn, idx_sql)
        except Exception:
            pass

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
            db_exec(conn, "INSERT INTO departments VALUES (?,?,?,?,?) ON CONFLICT (id) DO NOTHING", d)
        else:
            db_exec(conn, "INSERT OR IGNORE INTO departments VALUES (?,?,?,?,?)", d)

    conn.commit()
    conn.close()


init_db()


class PasswordLoginReq(BaseModel):
    user_id: str
    password: str

class GoogleLoginReq(BaseModel):
    credential: str

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
    wing: Optional[str] = "Wing A"
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
    rating: int
    review: str

class EventPhotoAlbumReq(BaseModel):
    event_id: str
    album_url: str
    caption: str

class EventChatTicketReq(BaseModel):
    event_id: str

class StudentProfileChangeReq(BaseModel):
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
    return dict(row) if row else None


def get_account_by_id(user_id: str):
    uid = user_id.strip().upper()
    now = time.time()
    with _USER_AUTH_CACHE_LOCK:
        cached = _USER_AUTH_CACHE.get(uid)
        if cached and cached[0] > now:
            return cached[1]

    conn = get_conn()
    row = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (uid,)).fetchone()
    conn.close()
    if row:
        account_dict = dict(row)
        with _USER_AUTH_CACHE_LOCK:
            _USER_AUTH_CACHE[uid] = (now + USER_CACHE_TTL, account_dict)
        return account_dict
    return None


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
        dept_name = departments.get(sub_code, "SVNIT Student")
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
            (local_part, "", full_name, "Student", "Verified Student", "SVNIT", "", year, "", "", email, dept_name, "", ""),
        )
        account = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (local_part,)).fetchone()
    conn.commit()
    conn.close()
    invalidate_user_cache(local_part)
    return dict(account)


def account_from_bearer(request: Request):
    authorization = request.headers.get("authorization", "")
    scheme, _, credential = authorization.partition(" ")
    if scheme.lower() != "bearer" or not credential:
        raise HTTPException(status_code=401, detail="Please sign in to continue.")

    token_user_id = verify_session_token(credential)
    if token_user_id:
        account = get_account_by_id(token_user_id)
        if account:
            return account

    claims = verify_google_credential(credential)
    email = str(claims.get("email", "")).strip().lower()
    if claims.get("email_verified") is not True or not is_svnit_email(email):
        raise HTTPException(status_code=403, detail="Only verified SVNIT Google accounts are allowed.")
    account = get_account_by_email(email)
    if not account:
        account = get_account_for_google_claims(claims)
    return account


def _encode_event_chat_ticket(user_id: str, event_id: str) -> str:
    payload = json.dumps(
        {"user_id": user_id.upper(), "event_id": event_id, "expires": int(time.time()) + 300},
        separators=(",", ":"),
    ).encode()
    encoded = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    signature = hmac.new(AUTH_SECRET.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def _decode_event_chat_ticket(ticket: str) -> Optional[Dict[str, str]]:
    try:
        encoded, signature = ticket.split(".", 1)
        expected = hmac.new(AUTH_SECRET.encode(), encoded.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        payload = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        data = json.loads(payload)
        if int(data.get("expires", 0)) < int(time.time()):
            return None
        if not data.get("user_id") or not data.get("event_id"):
            return None
        return {"user_id": str(data["user_id"]).upper(), "event_id": str(data["event_id"])}
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def _can_access_event_chat(account: Dict, event: Dict) -> bool:
    if account["role"] == "Student":
        return event["status"] in {"Approved", "Completed"}
    return (
        account["role"] == "ClubOrganizer"
        and str(event["club_id"]).upper() == str(account["user_id"]).upper()
    )


def _event_feedback_without_identity(feedbacks: List[Dict]) -> List[Dict]:
    return [
        {"rating": item.get("rating"), "review": item.get("review", "")}
        for item in feedbacks
        if isinstance(item, dict)
    ]


EVENT_CHAT_CONNECTIONS: Dict[str, set] = {}


def _get_event_for_chat(event_id: str):
    conn = get_conn()
    try:
        return db_exec(conn, "SELECT * FROM events WHERE event_id = ?", (event_id,)).fetchone()
    finally:
        conn.close()


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


@app.get("/")
def root():
    return {
        "status": "online",
        "app": "svnitcampus",
        "database_mode": "Cloud PostgreSQL (Pooled)" if USE_POSTGRES else "Local SQLite (WAL)"
    }


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
                s_rows = db_exec(conn, "SELECT * FROM users WHERE role = 'Student' AND LOWER(hostel_block) = LOWER(?) ORDER BY user_id ASC", (h_block,)).fetchall()
            else:
                s_rows = db_exec(conn, "SELECT * FROM users WHERE role = 'Student' ORDER BY user_id ASC").fetchall()
            students = [{k: v for k, v in dict(r).items() if k not in {"password", "dob"}} for r in s_rows]

        return {
            "complaints": complaints,
            "departments": departments,
            "events": events,
            "clubs": clubs,
            "notices": notices,
            "ads": ads,
            "students": students
        }
    finally:
        conn.close()


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
    conn = get_conn()
    existing = db_exec(
        conn,
        "SELECT hostel_block, wing, room, phone FROM users WHERE UPPER(user_id) = ? AND role = 'Student'",
        (account["user_id"].upper(),),
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
        if wing not in {f"Wing {letter}" for letter in "ABCDEFGH"}:
            conn.close()
            raise HTTPException(status_code=400, detail="Select a valid hostel wing (Wing A to Wing H).")
        if not room or len(room) > 20:
            conn.close()
            raise HTTPException(status_code=400, detail="Enter a valid room number.")
        title = "Verified Resident"

    uid = account["user_id"].upper()
    db_exec(
        conn,
        "UPDATE users SET hostel_block = ?, wing = ?, room = ?, phone = ?, authority_title = ? WHERE UPPER(user_id) = ?",
        (hostel, wing, room, phone, title, uid)
    )
    updated = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (uid,)).fetchone()
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
            "SELECT * FROM student_profile_requests WHERE UPPER(student_id) = ? ORDER BY created_at DESC",
            (account["user_id"].upper(),),
        ).fetchall()
        profile = dict(db_exec(
            conn,
            "SELECT user_id, full_name, role, authority_title, institute_id, hostel_block, wing, room, phone, year, department, email FROM users WHERE UPPER(user_id) = ?",
            (account["user_id"].upper(),),
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
            "SELECT * FROM users WHERE UPPER(user_id) = ? AND role = 'Student'",
            (account["user_id"].upper(),),
        ).fetchone()
        if not student:
            raise HTTPException(status_code=404, detail="Student record not found.")

        changes = {}
        if req.room is not None:
            room = req.room.strip()
            if not room or len(room) > 20:
                raise HTTPException(status_code=400, detail="Enter a valid room number.")
            if room != (student["room"] or ""):
                changes["room"] = room
        if req.wing is not None:
            wing = req.wing.strip()
            if wing not in {f"Wing {letter}" for letter in "ABCDEFGH"}:
                raise HTTPException(status_code=400, detail="Select a valid hostel wing (Wing A to Wing H).")
            if (student["hostel_block"] or "").strip().lower() == "day scholar":
                raise HTTPException(status_code=400, detail="Day Scholars do not have a hostel wing.")
            if wing != (student["wing"] or ""):
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
            "SELECT request_id FROM student_profile_requests WHERE UPPER(student_id) = ? AND status = 'Pending' LIMIT 1",
            (account["user_id"].upper(),),
        ).fetchone()
        if pending:
            raise HTTPException(status_code=409, detail="You already have a pending profile change request.")

        request_id = f"PR-{uuid.uuid4().hex[:12].upper()}"
        created_at = datetime.now().isoformat(timespec="seconds")
        db_exec(
            conn,
            "INSERT INTO student_profile_requests (request_id, student_id, hostel_block, requested_changes, status, created_at, reviewed_at, reviewed_by, review_remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (request_id, student["user_id"], student["hostel_block"], json.dumps(changes), "Pending", created_at, "", "", ""),
        )
        conn.commit()
        return {
            "success": True,
            "request": {
                "request_id": request_id,
                "student_id": student["user_id"],
                "hostel_block": student["hostel_block"],
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
        rows = db_exec(
            conn,
            """
            SELECT profile_requests.*, users.full_name, users.room AS current_room,
                   users.wing AS current_wing, users.phone AS current_phone
            FROM student_profile_requests AS profile_requests
            JOIN users ON UPPER(users.user_id) = UPPER(profile_requests.student_id)
            WHERE LOWER(profile_requests.hostel_block) = LOWER(?)
              AND LOWER(users.hostel_block) = LOWER(?)
              AND profile_requests.status = 'Pending'
            ORDER BY profile_requests.created_at ASC
            """,
            (account["hostel_block"], account["hostel_block"]),
        ).fetchall()
        return [
            {**dict(row), "requested_changes": json.loads(row["requested_changes"] or "{}")}
            for row in rows
        ]
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
            JOIN users ON UPPER(users.user_id) = UPPER(profile_requests.student_id)
            WHERE profile_requests.request_id = ?
              AND LOWER(profile_requests.hostel_block) = LOWER(?)
              AND LOWER(users.hostel_block) = LOWER(?)
            """,
            (req.request_id, account["hostel_block"], account["hostel_block"]),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Profile request not found for your hostel.")
        if row["status"] != "Pending":
            raise HTTPException(status_code=409, detail="This profile request has already been reviewed.")

        changes = json.loads(row["requested_changes"] or "{}")
        if decision == "approved":
            allowed_fields = {"room", "wing", "phone"}
            if not changes or not set(changes).issubset(allowed_fields):
                raise HTTPException(status_code=400, detail="This profile request contains invalid changes.")
            columns = ", ".join(f"{field} = ?" for field in changes)
            db_exec(
                conn,
                f"UPDATE users SET {columns} WHERE UPPER(user_id) = ?",
                (*changes.values(), row["student_id"].upper()),
            )

        reviewed_at = datetime.now().isoformat(timespec="seconds")
        db_exec(
            conn,
            "UPDATE student_profile_requests SET status = ?, reviewed_at = ?, reviewed_by = ?, review_remark = ? WHERE request_id = ?",
            (decision.title(), reviewed_at, account["user_id"], (req.remark or "").strip()[:500], req.request_id),
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


@app.post("/api/dean/update-warden")
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


@app.post("/api/unicore/clubs/create")
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
        rows = db_exec(conn, "SELECT * FROM users WHERE role = 'Student' ORDER BY user_id ASC").fetchall()
    else:
        rows = db_exec(conn, "SELECT * FROM users WHERE role = 'Student' AND LOWER(hostel_block) = LOWER(?) ORDER BY user_id ASC", (hostel_block,)).fetchall()
    conn.close()
    return [{k: v for k, v in dict(r).items() if k not in {"password", "dob"}} for r in rows]


@app.post("/api/warden/add-student")
def add_student_manual(req: StudentManualAddReq, request: Request):
    uid = req.user_id.strip().upper()
    hostel_block = req.hostel_block.strip() if req.hostel_block else request.state.user["hostel_block"]
    wing = (req.wing or "Wing A").strip()
    room = req.room.strip()
    if hostel_block.lower() == "day scholar":
        hostel_block = "Day Scholar"
        wing = "N/A"
        room = "N/A"
    email = (req.email or f"{uid.lower()}@svnit.ac.in").strip().lower()
    conn = get_conn()
    existing = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (uid,)).fetchone()
    if existing:
        db_exec(
            conn,
            "UPDATE users SET full_name = ?, hostel_block = ?, wing = ?, room = ?, department = ?, year = ?, phone = ?, email = ? WHERE UPPER(user_id) = ?",
            (req.full_name.strip(), hostel_block, wing, room, req.department.strip(), (req.year or "1st Year").strip(), (req.phone or "").strip(), email, uid)
        )
    else:
        db_exec(
            conn,
            "INSERT INTO users (user_id, password, full_name, role, authority_title, institute_id, hostel_block, year, room, phone, email, department, dob, wing) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (uid, "", req.full_name.strip(), "Student", "Verified Resident", "SVNIT", hostel_block, (req.year or "1st Year").strip(), room, (req.phone or "").strip(), email, req.department.strip(), "", wing)
        )
    conn.commit()
    conn.close()
    invalidate_user_cache(uid)
    return {"success": True, "message": f"Student {req.full_name} ({uid}) saved in {hostel_block}."}


@app.post("/api/warden/update-student")
def update_student_by_warden(req: StudentManualAddReq, request: Request):
    uid = req.user_id.strip().upper()
    new_hostel = req.hostel_block.strip()
    new_wing = (req.wing or "Wing A").strip()
    new_room = req.room.strip()
    if new_hostel.lower() == "day scholar":
        new_hostel = "Day Scholar"
        new_wing = "N/A"
        new_room = "N/A"
    conn = get_conn()
    existing = db_exec(conn, "SELECT * FROM users WHERE UPPER(user_id) = ?", (uid,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Student record not found.")

    full_name = (req.full_name or existing["full_name"] or uid).strip()
    dept = (req.department or existing["department"] or "").strip()
    yr = (req.year or existing["year"] or "1st Year").strip()

    db_exec(
        conn,
        "UPDATE users SET full_name = ?, hostel_block = ?, wing = ?, room = ?, department = ?, year = ?, phone = ? WHERE UPPER(user_id) = ?",
        (full_name, new_hostel, new_wing, new_room, dept, yr, (req.phone or "").strip(), uid)
    )
    db_exec(
        conn,
        "UPDATE complaints SET hostel_block = ?, wing = ?, room = ?, student_name = ? WHERE UPPER(student_id) = ? AND status != 'Completed'",
        (new_hostel, new_wing, new_room, full_name, uid)
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
                (uid, "", s.full_name.strip(), "Student", "Verified Resident", "SVNIT", hostel_block, (s.year or "1st Year").strip(), s.room.strip(), "", email, s.department.strip(), "", "Wing A")
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
    body = await request.json()
    ticket_id = body.get("ticket_id", "")
    status = body.get("status", "Awaiting Confirmation")
    remark = body.get("staff_remark") or body.get("remark") or ""
    resolved_at = datetime.now().strftime("%Y-%m-%d, %I:%M %p")

    conn = get_conn()
    db_exec(
        conn,
        "UPDATE complaints SET status = ?, staff_remark = ?, resolved_at = ? WHERE ticket_id = ?",
        (status, remark, resolved_at, ticket_id)
    )
    conn.commit()
    row = db_exec(conn, "SELECT * FROM complaints WHERE ticket_id = ?", (ticket_id,)).fetchone()
    conn.close()
    return {"success": True, "ticket": dict(row) if row else {}}


@app.post("/api/complaints/student-verify")
def student_verify(req: StudentVerifyReq, request: Request):
    new_status = "Completed" if req.satisfied else "Reopened"
    conn = get_conn()
    db_exec(conn, "UPDATE complaints SET status = ? WHERE ticket_id = ?", (new_status, req.ticket_id))
    conn.commit()
    row = db_exec(conn, "SELECT * FROM complaints WHERE ticket_id = ?", (req.ticket_id,)).fetchone()
    conn.close()
    return {"success": True, "ticket": dict(row) if row else {}}


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
    album_rows = db_exec(
        conn,
        "SELECT album_id, event_id, album_url, caption, created_at FROM event_photo_albums ORDER BY created_at DESC"
    ).fetchall()
    albums_by_event: Dict[str, List[Dict]] = {}
    for album_row in album_rows:
        album = dict(album_row)
        albums_by_event.setdefault(album["event_id"], []).append(album)
    for r in rows:
        d = dict(r)
        d["custom_fields"] = json.loads(d["custom_fields"] or "[]")
        d["rsvps"] = json.loads(d["rsvps"] or "[]")
        d["feedbacks"] = _event_feedback_without_identity(json.loads(d["feedbacks"] or "[]"))
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
        if row["status"] != "Completed":
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
        if event["status"] != "Completed":
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


@app.post("/api/unicore/events/chat-ticket")
def create_event_chat_ticket(req: EventChatTicketReq, request: Request):
    account = request.state.user
    event = _get_event_for_chat(req.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    if not _can_access_event_chat(account, event):
        raise HTTPException(status_code=403, detail="This event chat is not available to your account.")
    return {"ticket": _encode_event_chat_ticket(account["user_id"], req.event_id)}


@app.websocket("/api/unicore/events/chat/{event_id}")
async def event_chat(websocket: WebSocket, event_id: str):
    ticket_data = _decode_event_chat_ticket(websocket.query_params.get("ticket", ""))
    if not ticket_data or ticket_data["event_id"] != event_id:
        await websocket.close(code=1008, reason="Invalid or expired chat ticket.")
        return

    account = get_account_by_id(ticket_data["user_id"])
    event = _get_event_for_chat(event_id)
    if not account or not event or not _can_access_event_chat(account, event):
        await websocket.close(code=1008, reason="Event chat access denied.")
        return

    await websocket.accept()
    conn = get_conn()
    try:
        rows = db_exec(
            conn,
            "SELECT message_id, event_id, student_name, message, created_at FROM event_chat_messages WHERE event_id = ? ORDER BY created_at DESC LIMIT 100",
            (event_id,),
        ).fetchall()
        history = [dict(row) for row in reversed(rows)]
    finally:
        conn.close()

    room_connections = EVENT_CHAT_CONNECTIONS.setdefault(event_id, set())
    room_connections.add(websocket)
    try:
        await websocket.send_json({"type": "history", "messages": history})
    except (WebSocketDisconnect, OSError, RuntimeError):
        room_connections.discard(websocket)
        if not room_connections:
            EVENT_CHAT_CONNECTIONS.pop(event_id, None)
        return
    try:
        while True:
            payload = await websocket.receive_json()
            message = payload.get("message", "") if isinstance(payload, dict) else ""
            if not isinstance(message, str):
                await websocket.send_json({"type": "error", "message": "Messages must be text."})
                continue
            message = message.strip()
            if not message or len(message) > 1000:
                await websocket.send_json({"type": "error", "message": "Messages must be between 1 and 1,000 characters."})
                continue

            created_at = datetime.now().astimezone().isoformat(timespec="microseconds")
            chat_message = {
                "message_id": uuid.uuid4().hex,
                "event_id": event_id,
                "student_name": account.get("full_name") or account["user_id"],
                "message": message,
                "created_at": created_at,
            }
            message_conn = get_conn()
            try:
                db_exec(
                    message_conn,
                    "INSERT INTO event_chat_messages (message_id, event_id, student_id, student_name, message, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (chat_message["message_id"], event_id, account["user_id"], chat_message["student_name"], message, created_at),
                )
                message_conn.commit()
            finally:
                message_conn.close()

            expired_connections = []
            for connection in tuple(room_connections):
                try:
                    await connection.send_json({"type": "message", "message": chat_message})
                except (WebSocketDisconnect, OSError, RuntimeError):
                    expired_connections.append(connection)
            for connection in expired_connections:
                room_connections.discard(connection)
    except WebSocketDisconnect:
        pass
    finally:
        room_connections.discard(websocket)
        if not room_connections:
            EVENT_CHAT_CONNECTIONS.pop(event_id, None)


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