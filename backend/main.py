from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import random

app = FastAPI(title="SVNIT Surat - HMS ")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# 1. DYNAMIC COMPLAINT DEPARTMENTS (DEAN = CENTRAL, WARDEN = HOSTEL)
# =========================================================
COMPLAINT_DEPARTMENTS = [
    {"id": "Electricity", "title": "Electricity", "type": "Central", "hostel_block": "All", "icon": "⚡", "created_by": "DEAN"},
    {"id": "CCC / Internet / LAN", "title": "CCC / Internet / LAN", "type": "Central", "hostel_block": "All", "icon": "🌐", "created_by": "DEAN"},
    {"id": "Plumbing", "title": "Plumbing", "type": "Hostel", "hostel_block": "All", "icon": "🚰", "created_by": "WARDEN"},
    {"id": "Cleanliness & Hygiene", "title": "Cleanliness & Hygiene", "type": "Hostel", "hostel_block": "All", "icon": "🧹", "created_by": "WARDEN"},
    {"id": "Carpentry & Furniture", "title": "Carpentry & Furniture", "type": "Hostel", "hostel_block": "All", "icon": "🪚", "created_by": "WARDEN"}
]

# =========================================================
# 2. SVNIT HOSTELS REGISTRY
# =========================================================
HOSTELS_DB = [
    {"code": "GAJJAR", "name": "Gajjar Bhawan", "warden_id": "CW_GAJJAR", "ext": "0261-2201659"},
    {"code": "BHABHA", "name": "Bhabha Bhawan", "warden_id": "CW_BHABHA", "ext": "0261-2201790"},
    {"code": "MTB", "name": "Mother Teresa Bhawan", "warden_id": "CW_MTB", "ext": "0261-2201967"},
    {"code": "SVB", "name": "Swami Vivekananda Bhawan", "warden_id": "CW_SVB", "ext": "0261-2201657"},
    {"code": "NEHRU", "name": "Nehru Bhawan", "warden_id": "CW_NEHRU", "ext": "0261-2201703"},
    {"code": "TAGORE", "name": "Tagore Bhawan", "warden_id": "CW_TAGORE", "ext": "0261-2201707"},
    {"code": "SARABHAI", "name": "Sarabhai Bhawan", "warden_id": "CW_SARABHAI", "ext": "0261-2201793"},
    {"code": "RAMAN", "name": "Raman Bhawan", "warden_id": "CW_RAMAN", "ext": "0261-2201789"},
    {"code": "ABVB", "name": "Atal Bihari Vajpayee Bhawan", "warden_id": "CW_ABVB", "ext": "0261-2201880"}
]

# =========================================================
# 3. MASTER USERS DATABASE
# =========================================================
USERS_DB = [
    # DEAN STUDENT WELFARE
    {
        "user_id": "DEAN", "password": "123", "full_name": "Prof. S. R. Patel (Dean SW)",
        "role": "Dean", "authority_title": "Dean Student Welfare", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Admin Block",
        "phone": "0261-2201500", "email": "dean_sw@svnit.ac.in", "department": "Administration",
        "branch": "Administration", "year": "-", "dob": "01011975"
    },
    # COMBINED WARDEN / CHIEF WARDEN PORTALS (ONE PER HOSTEL)
    {
        "user_id": "CW_GAJJAR", "password": "123", "full_name": "Gajjar Bhawan Warden Office",
        "role": "Warden", "authority_title": "Chief Warden / Warden (Gajjar Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "Ground", "room": "Warden Office",
        "phone": "0261-2201659", "email": "warden_gajjar@svnit.ac.in", "department": "Hostel Administration",
        "branch": "-", "year": "-", "dob": "01011980"
    },
    {
        "user_id": "CW_BHABHA", "password": "123", "full_name": "Bhabha Bhawan Warden Office",
        "role": "Warden", "authority_title": "Chief Warden / Warden (Bhabha Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Bhabha Bhawan", "floor": "Ground", "room": "Warden Office",
        "phone": "0261-2201790", "email": "warden_bhabha@svnit.ac.in", "department": "Hostel Administration",
        "branch": "-", "year": "-", "dob": "01011980"
    },
    {
        "user_id": "CW_MTB", "password": "123", "full_name": "Mother Teresa Bhawan Warden Office",
        "role": "Warden", "authority_title": "Chief Warden / Warden (MTB)", "institute_id": "SVNIT",
        "hostel_block": "Mother Teresa Bhawan", "floor": "Ground", "room": "Warden Office",
        "phone": "0261-2201967", "email": "warden_mtb@svnit.ac.in", "department": "Hostel Administration",
        "branch": "-", "year": "-", "dob": "01011980"
    },
    {
        "user_id": "CW_SVB", "password": "123", "full_name": "Swami Vivekananda Bhawan Warden Office",
        "role": "Warden", "authority_title": "Chief Warden / Warden (SVB)", "institute_id": "SVNIT",
        "hostel_block": "Swami Vivekananda Bhawan", "floor": "Ground", "room": "Warden Office",
        "phone": "0261-2201657", "email": "warden_svb@svnit.ac.in", "department": "Hostel Administration",
        "branch": "-", "year": "-", "dob": "01011980"
    },
    # STUDENTS
    {
        "user_id": "U26CE011", "password": "123", "full_name": "Ishant Agrawal",
        "role": "Student", "authority_title": "Verified Resident", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "2nd Floor", "room": "B-204",
        "phone": "+91 9876543210", "email": "u26ce011@ced.svnit.ac.in", "department": "Civil Engineering",
        "branch": "Civil Engineering", "year": "1st Year", "dob": "10072007"
    },
    {
        "user_id": "U26CS012", "password": "123", "full_name": "Aarav Sharma",
        "role": "Student", "authority_title": "Verified Resident", "institute_id": "SVNIT",
        "hostel_block": "Bhabha Bhawan", "floor": "3rd Floor", "room": "A-302",
        "phone": "+91 9876543211", "email": "u26cs012@coed.svnit.ac.in", "department": "Computer Engineering",
        "branch": "Computer Engineering", "year": "1st Year", "dob": "15082006"
    },
    # CLUB PORTALS
    {
        "user_id": "ACM", "password": "123", "full_name": "ACM Student Chapter",
        "role": "ClubOrganizer", "authority_title": "Club Portal (ACM)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "SAC Office",
        "phone": "+91 9811122233", "email": "acm@svnit.ac.in", "department": "Student Chapter",
        "branch": "All", "year": "All", "dob": "01012000"
    },
    {
        "user_id": "CHRD", "password": "123", "full_name": "CHRD Cultural Society",
        "role": "ClubOrganizer", "authority_title": "Club Portal (CHRD)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "SAC Cultural Wing",
        "phone": "+91 9811122255", "email": "chrd@svnit.ac.in", "department": "Student Chapter",
        "branch": "All", "year": "All", "dob": "01012000"
    },
    # CENTRAL & HOSTEL MAINTENANCE STAFF
    {
        "user_id": "STAFF_ELEC", "password": "123", "full_name": "Rameshbhai Patel (Central Electrical)",
        "role": "Staff", "authority_title": "Central Electrician (All Hostels)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Estate Electrical Wing",
        "phone": "+91 9900112233", "email": "elec@svnit.ac.in", "department": "Electricity",
        " staff_scope": "Central", "dob": "01011985"
    },
    {
        "user_id": "STAFF_CCC", "password": "123", "full_name": "Vikram Parmar (Central CCC / LAN)",
        "role": "Staff", "authority_title": "CCC Network Engineer (All Hostels)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Central Computer Centre",
        "phone": "+91 9900112244", "email": "ccc@svnit.ac.in", "department": "CCC / Internet / LAN",
        "staff_scope": "Central", "dob": "01011988"
    },
    {
        "user_id": "CLEAN_GAJJAR", "password": "123", "full_name": "Sureshbhai Solanki (Gajjar Hygiene)",
        "role": "Staff", "authority_title": "Gajjar Bhawan Sanitation Staff", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "-", "room": "Gajjar Maintenance Cell",
        "phone": "+91 9900112255", "email": "clean_gajjar@svnit.ac.in", "department": "Cleanliness & Hygiene",
        "staff_scope": "Hostel", "dob": "01011986"
    }
]

# =========================================================
# 4. CLUBS DATABASE (100% MANUAL & CUSTOMIZABLE BY CLUBS)
# =========================================================
CLUBS_DB = [
    {
        "club_id": "ACM",
        "name": "ACM Student Chapter SVNIT",
        "tagline": "Advancing Computing as a Science & Profession",
        "mission": "Organizing competitive coding contests, hackathons, ICPC training, and AI/ML workshops for SVNIT students.",
        "faculty_advisor": "Dr. R. K. Gupta",
        "head_coordinator": "Aarav Sharma",
        "banner_url": "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1000&q=80",
        "avatar_url": "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=300&q=80",
        "extra_dean_info": "Equipment & Lab Inventory Verified.",
        "members": [
            {"id": "M-1", "name": "Aarav Sharma", "roll": "U23CS004", "position": "Chairperson / Head Member", "phone": "+91 9811100001"},
            {"id": "M-2", "name": "Riya Mehta", "roll": "U23CS045", "position": "Technical Head", "phone": "+91 9811100002"},
            {"id": "M-3", "name": "Karan Verma", "roll": "U24CS019", "position": "Stage & Logistics Head", "phone": "+91 9811100003"},
            {"id": "M-4", "name": "Ishant Agrawal", "roll": "U26CE011", "position": "Promotional & PR Member", "phone": "+91 9876543210"}
        ],
        "gallery": [
            {
                "id": "G-1",
                "media_type": "image",
                "media_url": "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80",
                "caption": "Algothon Coding Finale at CRC Auditorium",
                "timestamp": "2026-10-15"
            }
        ]
    },
    {
        "club_id": "CHRD",
        "name": "Centre for Human Resource Development (CHRD)",
        "tagline": "The Official Cultural & Literary Pulse of SVNIT",
        "mission": "Nurturing music, dance, drama, fine arts, photography, and literary talent across campus.",
        "faculty_advisor": "Dr. S. N. Sharma",
        "head_coordinator": "Kashish Verma",
        "banner_url": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1000&q=80",
        "avatar_url": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80",
        "extra_dean_info": "Acoustic & Sound System Verified.",
        "members": [
            {"id": "M-10", "name": "Kashish Verma", "roll": "U23EE018", "position": "Head Member", "phone": "+91 9833300001"},
            {"id": "M-11", "name": "Yashika Jain", "roll": "U24CE029", "position": "Stage & Logistics Head", "phone": "+91 9833300002"}
        ],
        "gallery": []
    }
]

# =========================================================
# 5. EVENTS DATABASE (MANUAL VENUES, FEEDBACKS & AUDITS)
# =========================================================
EVENTS_DB = [
    {
        "event_id": "EVT-101",
        "club_id": "ACM",
        "title": "Algothon 2026 — 24Hr AI & Coding Hackathon",
        "date": "2026-10-25",
        "start_time": "10:00",
        "end_time": "18:00",
        "venue": "CRC Auditorium Ground Floor",
        "status": "Approved",
        "submitted_by": "ACM",
        "description": "SVNIT's flagship competitive coding and AI hackathon! Build real-world prototypes and win cash prizes.",
        "image_url": "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80",
        "registration_link": "https://docs.google.com/forms",
        "rsvps": ["U26CE011", "U26CS012"],
        "feedbacks": []
    },
    {
        "event_id": "EVT-102",
        "club_id": "CHRD",
        "title": "Freshers Acoustic Jam & Auditions",
        "date": "2026-10-28",
        "start_time": "17:30",
        "end_time": "20:30",
        "venue": "SAC Open Air Lawn Behind Canteen",
        "status": "Pending Dean Approval",
        "submitted_by": "CHRD",
        "description": "Live acoustic evening and auditions for vocalists, guitarists, and drama artists. Click the audition link to register!",
        "image_url": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80",
        "registration_link": "https://docs.google.com/forms",
        "rsvps": ["U26CE011"],
        "feedbacks": []
    },
    {
        "event_id": "EVT-100",
        "club_id": "CHRD",
        "title": "Garba & Cultural Eve 2026",
        "date": "2026-10-18",
        "start_time": "18:30",
        "end_time": "22:00",
        "venue": "Main SAC Ground",
        "status": "Completed",
        "submitted_by": "CHRD",
        "description": "Annual traditional Garba night and unplugged band performance.",
        "image_url": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80",
        "registration_link": "",
        "rsvps": ["U26CE011", "U26CS012"],
        "feedbacks": [
            {"student_id": "U26CE011", "student_name": "Ishant Agrawal", "rating": 5, "review": "Amazing lighting and sound setup!", "created_at": "2026-10-19"},
            {"student_id": "U26CS012", "student_name": "Aarav Sharma", "rating": 5, "review": "Great crowd management by the stage & logistics team.", "created_at": "2026-10-19"}
        ]
    }
]

# =========================================================
# 6. TARGETED CLUB NOTICES DATABASE
# =========================================================
NOTICES_DB = [
    {
        "notice_id": "NOT-201",
        "club_id": "ACM",
        "title": "1st Year Civil & CS Mentorship Session",
        "message": "Special introductory Git, GitHub, and CP orientation session for 1st-year residents. Bring your laptops!",
        "target_branch": "All",
        "target_year": "1st Year",
        "attachment_link": "https://docs.google.com/forms",
        "status": "Approved",
        "created_at": "2026-10-20"
    },
    {
        "notice_id": "NOT-202",
        "club_id": "CHRD",
        "title": "Drama & Anchoring Auditions — Slot List",
        "message": "Auditions for the winter stage play will be held at SAC Room 2 at 5:30 PM.",
        "target_branch": "All",
        "target_year": "All",
        "attachment_link": "https://docs.google.com/forms",
        "status": "Pending Dean Approval",
        "created_at": "2026-10-21"
    }
]

# =========================================================
# 7. COMPLAINTS DATABASE (SIMPLE 3-STAGE TRACKING)
# =========================================================
COMPLAINTS_DB = [
    {
        "ticket_id": "TKT-901",
        "student_id": "U26CE011",
        "student_name": "Ishant Agrawal",
        "hostel_block": "Gajjar Bhawan",
        "room": "B-204",
        "category": "Electricity",
        "summary": "Ceiling fan regulator sparking in B-204",
        "description": "The regulator makes a buzzing sound and sparks when set to speed 4.",
        "status": "Awaiting Confirmation",
        "routed_to": "Central Electricity Wing",
        "staff_remark": "Replaced faulty capacitor and regulator switch.",
        "created_at": "2026-10-19, 10:30 AM",
        "staff_read_at": "2026-10-19, 11:15 AM",
        "staff_done_at": "2026-10-19, 02:10 PM",
        "student_verified_at": ""
    },
    {
        "ticket_id": "TKT-902",
        "student_id": "U26CE011",
        "student_name": "Ishant Agrawal",
        "hostel_block": "Gajjar Bhawan",
        "room": "B-204",
        "category": "Cleanliness & Hygiene",
        "summary": "2nd Floor Corridor Dustbin & Washroom Cleaning",
        "description": "Corridor near B-204 needs mopping and washroom soap dispenser refill.",
        "status": "In Progress",
        "routed_to": "Gajjar Bhawan — Cleanliness & Hygiene",
        "staff_remark": "",
        "created_at": "2026-10-20, 09:00 AM",
        "staff_read_at": "2026-10-20, 09:45 AM",
        "staff_done_at": "",
        "student_verified_at": ""
    }
]

# =========================================================
# 8. PYDANTIC MODELS
# =========================================================
class LoginReq(BaseModel):
    user_id: str
    password: str

class DepartmentCreateReq(BaseModel):
    title: str
    dept_type: str  # 'Central' or 'Hostel'
    hostel_block: str = "All"
    icon: str = "🛠️"
    created_by: str = "DEAN"

class ClubQuickCreateReq(BaseModel):
    club_id: str
    password: str
    name: Optional[str] = ""

class WardenAccountReq(BaseModel):
    hostel_name: str
    warden_id: str
    password: str
    ext: Optional[str] = ""

class StaffAccountReq(BaseModel):
    user_id: str
    password: str
    full_name: str
    department: str
    hostel_block: str  # 'All' for Central, or specific hostel name
    phone: str

class PasswordResetReq(BaseModel):
    target_user_id: str
    new_password: Optional[str] = ""

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
    year: str = "1st Year"
    phone: str
    email: str
    dob: str  # DDMMYYYY

class ComplaintCreateReq(BaseModel):
    student_id: str
    category: str
    summary: str
    description: str

class StaffReadReq(BaseModel):
    ticket_id: str

class StaffResolveReq(BaseModel):
    ticket_id: str
    staff_remark: str

class StudentVerifyReq(BaseModel):
    ticket_id: str
    satisfied: bool

class ClubUpdateDossierReq(BaseModel):
    club_id: str
    name: str
    tagline: str
    mission: str
    faculty_advisor: str
    head_coordinator: str
    banner_url: str
    avatar_url: str
    extra_dean_info: str

class ClubMemberAddReq(BaseModel):
    club_id: str
    name: str
    roll: str
    position: str
    phone: str

class ClubMemberRemoveReq(BaseModel):
    club_id: str
    member_id: str

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
    description: str
    image_url: Optional[str] = ""
    registration_link: Optional[str] = ""

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
    target_branch: str
    target_year: str
    attachment_link: Optional[str] = ""

# =========================================================
# 9. AUTH & HIERARCHY ENDPOINTS
# =========================================================
@app.get("/")
def root():
    return {"status": "online", "service": "SVNIT HMS Backend"}

@app.post("/api/auth/login")
def login(req: LoginReq):
    uid = req.user_id.strip().upper()
    pwd = req.password.strip()
    for u in USERS_DB:
        if u["user_id"].upper() == uid and (u["password"] == pwd or u.get("dob") == pwd):
            user_copy = {k: v for k, v in u.items() if k != "password"}
            return {"success": True, "user": user_copy}
    raise HTTPException(status_code=401, detail="Invalid Username / Roll No or Password")

@app.get("/api/hostels")
def get_hostels():
    return HOSTELS_DB

@app.post("/api/dean/warden-account")
def create_or_update_warden(req: WardenAccountReq):
    wid = req.warden_id.strip().upper()
    hname = req.hostel_name.strip()
    existing_h = next((h for h in HOSTELS_DB if h["name"].lower() == hname.lower() or h["warden_id"].upper() == wid), None)
    if existing_h:
        existing_h["warden_id"] = wid
        existing_h["name"] = hname
        if req.ext:
            existing_h["ext"] = req.ext
    else:
        HOSTELS_DB.append({
            "code": wid.replace("CW_", ""),
            "name": hname,
            "warden_id": wid,
            "ext": req.ext or "0261-2201600"
        })

    existing_u = next((u for u in USERS_DB if u["user_id"].upper() == wid), None)
    if existing_u:
        existing_u["password"] = req.password.strip()
        existing_u["hostel_block"] = hname
    else:
        USERS_DB.append({
            "user_id": wid,
            "password": req.password.strip(),
            "full_name": f"{hname} Warden Office",
            "role": "Warden",
            "authority_title": f"Chief Warden / Warden ({hname})",
            "institute_id": "SVNIT",
            "hostel_block": hname,
            "floor": "Ground",
            "room": "Warden Office",
            "phone": req.ext or "0261-2201600",
            "email": f"{wid.lower()}@svnit.ac.in",
            "department": "Hostel Administration",
            "branch": "-",
            "year": "-",
            "dob": "01011980"
        })
    return {"success": True, "message": f"Warden portal '{wid}' configured for {hname}!", "hostels": HOSTELS_DB}

@app.post("/api/dean/create-club")
def dean_create_club(req: ClubQuickCreateReq):
    cid = req.club_id.strip().upper().replace(" ", "_")
    pwd = req.password.strip()
    if not cid or not pwd:
        raise HTTPException(status_code=400, detail="Username and password are required.")

    existing_club = next((c for c in CLUBS_DB if c["club_id"].upper() == cid), None)
    if not existing_club:
        CLUBS_DB.insert(0, {
            "club_id": cid,
            "name": req.name.strip() if req.name and req.name.strip() else f"{cid} Official Chapter",
            "tagline": "Click 'Edit Club Profile' in your portal to customize tagline",
            "mission": "Club coordinator can manually fill the mission, faculty advisor, and member roster.",
            "faculty_advisor": "To be updated by Club",
            "head_coordinator": "To be updated by Club",
            "banner_url": "https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=1000&q=80",
            "avatar_url": "",
            "extra_dean_info": "",
            "members": [],
            "gallery": []
        })

    existing_user = next((u for u in USERS_DB if u["user_id"].upper() == cid), None)
    if existing_user:
        existing_user["password"] = pwd
    else:
        USERS_DB.append({
            "user_id": cid,
            "password": pwd,
            "full_name": req.name.strip() if req.name and req.name.strip() else f"{cid} Official Chapter",
            "role": "ClubOrganizer",
            "authority_title": f"Club Portal ({cid})",
            "institute_id": "SVNIT",
            "hostel_block": "All",
            "floor": "-",
            "room": "SAC Office",
            "phone": "-",
            "email": f"{cid.lower()}@svnit.ac.in",
            "department": "Student Chapter",
            "branch": "All",
            "year": "All",
            "dob": "01012000"
        })
    return {"success": True, "message": f"Club account '{cid}' is active with your assigned password!"}

@app.get("/api/staff")
def get_staff(hostel_block: str = "All"):
    staff_list = [
        {k: v for k, v in u.items() if k != "password"}
        for u in USERS_DB if u.get("role") == "Staff"
    ]
    if hostel_block != "All":
        return [s for s in staff_list if s.get("hostel_block") == "All" or s.get("hostel_block", "").lower() == hostel_block.lower()]
    return staff_list

@app.post("/api/staff/create")
def create_staff_account(req: StaffAccountReq):
    uid = req.user_id.strip().upper().replace(" ", "_")
    existing = next((u for u in USERS_DB if u["user_id"].upper() == uid), None)
    if existing:
        existing["password"] = req.password.strip()
        existing["full_name"] = req.full_name.strip()
        existing["department"] = req.department.strip()
        existing["hostel_block"] = req.hostel_block.strip()
        existing["phone"] = req.phone.strip()
    else:
        USERS_DB.append({
            "user_id": uid,
            "password": req.password.strip(),
            "full_name": req.full_name.strip(),
            "role": "Staff",
            "authority_title": f"{req.department} Staff ({req.hostel_block})",
            "institute_id": "SVNIT",
            "hostel_block": req.hostel_block.strip(),
            "floor": "-",
            "room": "Maintenance Cell",
            "phone": req.phone.strip(),
            "email": f"{uid.lower()}@svnit.ac.in",
            "department": req.department.strip(),
            "staff_scope": "Central" if req.hostel_block == "All" else "Hostel",
            "dob": "01011985"
        })
    return {"success": True, "message": f"Staff account '{uid}' saved for {req.department} ({req.hostel_block})!"}

@app.post("/api/dean/reset-password")
def dean_reset_password(req: PasswordResetReq):
    target_id = req.target_user_id.strip().upper()
    target = next((u for u in USERS_DB if u["user_id"].upper() == target_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Account '{target_id}' not found.")
    target["password"] = req.new_password.strip()
    return {"success": True, "message": f"Password updated for {target['user_id']}!"}

# =========================================================
# 10. DYNAMIC DEPARTMENTS & GRIEVANCE ENDPOINTS
# =========================================================
@app.get("/api/departments")
def get_departments(hostel_block: str = "All"):
    if hostel_block == "All":
        return COMPLAINT_DEPARTMENTS
    return [
        d for d in COMPLAINT_DEPARTMENTS
        if d["type"] == "Central" or d["hostel_block"] == "All" or d["hostel_block"].lower() == hostel_block.lower()
    ]

@app.post("/api/departments/create")
def create_department(req: DepartmentCreateReq):
    dept_id = req.title.strip()
    if not dept_id:
        raise HTTPException(status_code=400, detail="Department title required.")
    existing = next((d for d in COMPLAINT_DEPARTMENTS if d["id"].lower() == dept_id.lower() and d["hostel_block"].lower() == req.hostel_block.lower()), None)
    if existing:
        raise HTTPException(status_code=400, detail="This complaint department already exists.")
    new_d = {
        "id": dept_id,
        "title": dept_id,
        "type": req.dept_type,
        "hostel_block": "All" if req.dept_type == "Central" else req.hostel_block,
        "icon": req.icon or "🛠️",
        "created_by": req.created_by
    }
    COMPLAINT_DEPARTMENTS.append(new_d)
    return {"success": True, "message": f"Department '{dept_id}' added! Students can now select it.", "departments": COMPLAINT_DEPARTMENTS}

@app.get("/api/complaints")
def get_complaints(role: str = "Dean", user_id: str = "", hostel_block: str = "All", department: str = ""):
    if role == "Student":
        return [c for c in COMPLAINTS_DB if c["student_id"].upper() == user_id.upper()]
    if role == "Warden" and hostel_block != "All":
        return [c for c in COMPLAINTS_DB if c["hostel_block"].lower() == hostel_block.lower()]
    if role == "Staff":
        res = []
        for c in COMPLAINTS_DB:
            dept_match = department.lower() in c["category"].lower() or c["category"].lower() in department.lower()
            hostel_match = (hostel_block == "All") or (c["hostel_block"].lower() == hostel_block.lower())
            if dept_match and hostel_match:
                res.append(c)
        return res
    return COMPLAINTS_DB

@app.post("/api/complaints")
def create_complaint(req: ComplaintCreateReq):
    student = next((u for u in USERS_DB if u["user_id"].upper() == req.student_id.upper()), None)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    dept_obj = next((d for d in COMPLAINT_DEPARTMENTS if d["id"].lower() == req.category.lower()), None)
    is_central = dept_obj and dept_obj["type"] == "Central"
    routed_label = f"Central {req.category} Wing" if is_central else f"{student['hostel_block']} — {req.category}"

    new_tkt = {
        "ticket_id": f"TKT-{random.randint(100, 999)}",
        "student_id": student["user_id"],
        "student_name": student["full_name"],
        "hostel_block": student["hostel_block"],
        "room": student["room"],
        "category": req.category,
        "summary": req.summary.strip(),
        "description": req.description.strip(),
        "status": "Pending",
        "routed_to": routed_label,
        "staff_remark": "",
        "created_at": datetime.now().strftime("%Y-%m-%d, %I:%M %p"),
        "staff_read_at": "",
        "staff_done_at": "",
        "student_verified_at": ""
    }
    COMPLAINTS_DB.insert(0, new_tkt)
    return {"success": True, "ticket": new_tkt}

@app.post("/api/complaints/staff-read")
def staff_read_complaint(req: StaffReadReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            if not c.get("staff_read_at"):
                c["staff_read_at"] = datetime.now().strftime("%Y-%m-%d, %I:%M %p")
            if c["status"] in ["Pending", "Reopened"]:
                c["status"] = "In Progress"
            return {"success": True, "ticket": c}
    raise HTTPException(status_code=404, detail="Ticket not found")

@app.post("/api/complaints/staff-resolve")
def staff_resolve_complaint(req: StaffResolveReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            now_str = datetime.now().strftime("%Y-%m-%d, %I:%M %p")
            if not c.get("staff_read_at"):
                c["staff_read_at"] = now_str
            c["staff_done_at"] = now_str
            c["status"] = "Awaiting Confirmation"
            c["staff_remark"] = req.staff_remark.strip()
            return {"success": True, "ticket": c}
    raise HTTPException(status_code=404, detail="Ticket not found")

@app.post("/api/complaints/student-verify")
def student_verify_complaint(req: StudentVerifyReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            if req.satisfied:
                c["status"] = "Completed"
                c["student_verified_at"] = datetime.now().strftime("%Y-%m-%d, %I:%M %p")
            else:
                c["status"] = "Reopened"
                c["student_verified_at"] = ""
            return {"success": True, "ticket": c}
    raise HTTPException(status_code=404, detail="Ticket not found")

@app.get("/api/complaints/export-pdf", response_class=HTMLResponse)
def export_complaints_pdf(hostel_block: str = "All", from_date: str = "", to_date: str = ""):
    rows = COMPLAINTS_DB
    if hostel_block != "All":
        rows = [c for c in rows if c["hostel_block"] == hostel_block]
    tr_html = "".join([
        f"<tr><td>{c['ticket_id']}</td><td>{c['student_name']} ({c['student_id']})</td><td>{c['hostel_block']} ({c['room']})</td><td>{c['category']}</td><td>{c['summary']}</td><td>{c['status']}</td><td>{c['created_at']}</td></tr>"
        for c in rows
    ])
    html = f"""
    <html><head><title>SVNIT Official Grievance Report</title>
    <style>body{{font-family:Arial,sans-serif;padding:30px;color:#0f172a;}} table{{width:100%;border-collapse:collapse;margin-top:20px;}} th,td{{border:1px solid #cbd5e1;padding:10px;text-align:left;font-size:13px;}} th{{background:#f1f5f9;}}</style>
    </head><body onload="window.print()">
    <h2>SVNIT Surat — Official Hostel Grievance Report</h2>
    <p><strong>Hostel Scope:</strong> {hostel_block} | <strong>Total Complaints:</strong> {len(rows)} | <strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
    <table><thead><tr><th>Ticket ID</th><th>Resident</th><th>Hostel & Room</th><th>Department</th><th>Issue</th><th>Status</th><th>Lodged At</th></tr></thead>
    <tbody>{tr_html}</tbody></table></body></html>
    """
    return HTMLResponse(content=html)

# =========================================================
# 11. WARDEN STUDENT MANAGEMENT & DOB PASSWORD RESET
# =========================================================
@app.get("/api/warden/students")
def get_students(hostel_block: str = "All"):
    students = [
        {k: v for k, v in u.items() if k != "password"}
        for u in USERS_DB if u.get("role") == "Student"
    ]
    if hostel_block != "All":
        return [s for s in students if s.get("hostel_block", "").lower() == hostel_block.lower()]
    return students

@app.post("/api/warden/add-student")
def warden_add_student(req: StudentManualAddReq):
    uid = req.user_id.strip().upper()
    existing = next((u for u in USERS_DB if u["user_id"].upper() == uid), None)
    if existing:
        existing["full_name"] = req.full_name.strip()
        existing["hostel_block"] = req.hostel_block.strip()
        existing["room"] = req.room.strip()
        existing["department"] = req.department.strip()
        existing["branch"] = req.department.strip()
        existing["year"] = req.year.strip()
        existing["phone"] = req.phone.strip()
        existing["email"] = req.email.strip()
        existing["dob"] = req.dob.strip()
        return {"success": True, "message": f"Updated student record for {req.full_name} ({uid})!"}
    new_s = {
        "user_id": uid,
        "password": req.dob.strip(),
        "full_name": req.full_name.strip(),
        "role": "Student",
        "authority_title": "Verified Resident",
        "institute_id": "SVNIT",
        "hostel_block": req.hostel_block.strip(),
        "floor": "Resident Wing",
        "room": req.room.strip(),
        "phone": req.phone.strip(),
        "email": req.email.strip(),
        "department": req.department.strip(),
        "branch": req.department.strip(),
        "year": req.year.strip(),
        "dob": req.dob.strip()
    }
    USERS_DB.insert(0, new_s)
    return {"success": True, "message": f"Onboarded {req.full_name} ({uid})! Default Password set to DOB: {req.dob}"}

@app.post("/api/warden/upload-students")
def warden_bulk_upload_students(students: List[StudentManualAddReq]):
    count = 0
    for s in students:
        warden_add_student(s)
        count += 1
    return {"success": True, "message": f"Successfully onboarded {count} students with DOB default passwords!"}

@app.post("/api/warden/reset-student-password")
def warden_reset_student_to_dob(req: PasswordResetReq):
    uid = req.target_user_id.strip().upper()
    student = next((u for u in USERS_DB if u["user_id"].upper() == uid and u["role"] == "Student"), None)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    default_dob = student.get("dob", "123")
    student["password"] = default_dob
    return {"success": True, "message": f"Password for {student['full_name']} ({uid}) reset to Default DOB ({default_dob})!"}

@app.post("/api/student/change-password")
def student_change_password(req: StudentChangePassReq):
    student = next((u for u in USERS_DB if u["user_id"].upper() == req.student_id.strip().upper()), None)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    old_p = req.old_password.strip()
    if student["password"] != old_p and student.get("dob") != old_p:
        raise HTTPException(status_code=400, detail="Current password (or DOB) is incorrect.")
    if len(req.new_password.strip()) < 4:
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters.")
    student["password"] = req.new_password.strip()
    return {"success": True, "message": "Custom password saved successfully!"}

# =========================================================
# 12. CLUBS, EVENTS, NOTICES & YEAR-WISE PRINTABLE REPORTS
# =========================================================
@app.get("/api/unicore/clubs")
def get_clubs():
    return CLUBS_DB

@app.post("/api/unicore/clubs/update-dossier")
def update_club_dossier(req: ClubUpdateDossierReq):
    for c in CLUBS_DB:
        if c["club_id"].upper() == req.club_id.upper():
            c["name"] = req.name.strip()
            c["tagline"] = req.tagline.strip()
            c["mission"] = req.mission.strip()
            c["faculty_advisor"] = req.faculty_advisor.strip()
            c["head_coordinator"] = req.head_coordinator.strip()
            c["banner_url"] = req.banner_url.strip()
            c["avatar_url"] = req.avatar_url.strip()
            c["extra_dean_info"] = req.extra_dean_info.strip()
            return {"success": True, "club": c}
    raise HTTPException(status_code=404, detail="Club not found")

@app.post("/api/unicore/clubs/add-member")
def add_club_member(req: ClubMemberAddReq):
    for c in CLUBS_DB:
        if c["club_id"].upper() == req.club_id.upper():
            if "members" not in c:
                c["members"] = []
            c["members"].append({
                "id": f"M-{random.randint(100, 9999)}",
                "name": req.name.strip(),
                "roll": req.roll.strip().upper(),
                "position": req.position.strip(),
                "phone": req.phone.strip()
            })
            return {"success": True, "club": c}
    raise HTTPException(status_code=404, detail="Club not found")

@app.post("/api/unicore/clubs/remove-member")
def remove_club_member(req: ClubMemberRemoveReq):
    for c in CLUBS_DB:
        if c["club_id"].upper() == req.club_id.upper():
            c["members"] = [m for m in c.get("members", []) if m.get("id") != req.member_id]
            return {"success": True, "club": c}
    raise HTTPException(status_code=404, detail="Club not found")

@app.post("/api/unicore/clubs/add-gallery")
def add_club_gallery(req: ClubGalleryAddReq):
    for c in CLUBS_DB:
        if c["club_id"].upper() == req.club_id.upper():
            if "gallery" not in c:
                c["gallery"] = []
            c["gallery"].insert(0, {
                "id": f"G-{random.randint(100, 9999)}",
                "media_type": req.media_type,
                "media_url": req.media_url,
                "caption": req.caption.strip(),
                "timestamp": datetime.now().strftime("%Y-%m-%d")
            })
            return {"success": True, "club": c}
    raise HTTPException(status_code=404, detail="Club not found")

@app.get("/api/unicore/events")
def get_events():
    return EVENTS_DB

@app.post("/api/unicore/events/propose")
def propose_event(req: EventRequisitionReq):
    # Time-only overlap check across campus events
    time_overlaps = []
    for ev in EVENTS_DB:
        if ev["date"] == req.date and ev["status"] in ["Approved", "Pending Dean Approval"]:
            if not (req.end_time <= ev["start_time"] or req.start_time >= ev["end_time"]):
                time_overlaps.append(f"{ev['title']} ({ev['club_id']} at {ev['venue']}, {ev['start_time']}-{ev['end_time']})")

    new_evt = {
        "event_id": f"EVT-{random.randint(105, 999)}",
        "club_id": req.club_id.upper(),
        "title": req.title.strip(),
        "date": req.date,
        "start_time": req.start_time,
        "end_time": req.end_time,
        "venue": req.venue.strip(),
        "status": "Pending Dean Approval",
        "submitted_by": req.submitted_by,
        "description": req.description.strip(),
        "image_url": req.image_url or "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80",
        "registration_link": req.registration_link.strip() if req.registration_link else "",
        "rsvps": [],
        "feedbacks": []
    }
    EVENTS_DB.insert(0, new_evt)
    msg = "Event proposal submitted to Dean!"
    if time_overlaps:
        msg += f" (Note: Time slot overlaps with: {', '.join(time_overlaps)})"
    return {"success": True, "message": msg, "event": new_evt}

@app.post("/api/unicore/events/approve")
def approve_or_update_event(event_id: str = Query(...), action: str = Query(...)):
    for ev in EVENTS_DB:
        if ev["event_id"] == event_id:
            ev["status"] = action
            return {"success": True, "event": ev}
    raise HTTPException(status_code=404, detail="Event not found")

@app.post("/api/unicore/events/rsvp")
def rsvp_event(req: EventRsvpReq):
    uid = req.student_id.strip().upper()
    for ev in EVENTS_DB:
        if ev["event_id"] == req.event_id:
            if "rsvps" not in ev:
                ev["rsvps"] = []
            if uid in [x.upper() for x in ev["rsvps"]]:
                ev["rsvps"] = [x for x in ev["rsvps"] if x.upper() != uid]
                attending = False
            else:
                ev["rsvps"].append(uid)
                attending = True
            return {
                "success": True,
                "attending": attending,
                "rsvps": ev["rsvps"],
                "message": "🎟️ You are marked as Attending!" if attending else "Attendance RSVP removed."
            }
    raise HTTPException(status_code=404, detail="Event not found")

@app.post("/api/unicore/events/feedback")
def submit_event_feedback(req: EventFeedbackReq):
    student = next((u for u in USERS_DB if u["user_id"].upper() == req.student_id.upper()), None)
    sname = student["full_name"] if student else req.student_id.upper()
    for ev in EVENTS_DB:
        if ev["event_id"] == req.event_id:
            if "feedbacks" not in ev:
                ev["feedbacks"] = []
            ev["feedbacks"].insert(0, {
                "student_id": req.student_id.upper(),
                "student_name": sname,
                "rating": req.rating,
                "review": req.review.strip(),
                "created_at": datetime.now().strftime("%Y-%m-%d")
            })
            return {"success": True, "event": ev}
    raise HTTPException(status_code=404, detail="Event not found")

@app.get("/api/unicore/events/export-pdf", response_class=HTMLResponse)
def export_events_pdf(year: str = "2026", club_id: str = "All"):
    rows = [e for e in EVENTS_DB if e["date"].startswith(year) and e["status"] in ["Approved", "Completed"]]
    if club_id != "All":
        rows = [e for e in rows if e["club_id"].upper() == club_id.upper()]

    club_summary = {}
    for e in rows:
        cid = e["club_id"]
        club_summary[cid] = club_summary.get(cid, 0) + 1

    summary_html = "".join([f"<li><strong>{k}:</strong> {v} Events conducted</li>" for k, v in club_summary.items()])
    tr_html = "".join([
        f"<tr><td>{e['event_id']}</td><td>{e['club_id']}</td><td>{e['title']}</td><td>{e['date']} ({e['start_time']}-{e['end_time']})</td><td>{e['venue']}</td><td>{len(e.get('rsvps', []))}</td><td>{len(e.get('feedbacks', []))}</td><td>{e['status']}</td></tr>"
        for e in rows
    ])
    html = f"""
    <html><head><title>SVNIT Annual Club Events Audit Report - {year}</title>
    <style>body{{font-family:Arial,sans-serif;padding:30px;color:#0f172a;}} table{{width:100%;border-collapse:collapse;margin-top:20px;}} th,td{{border:1px solid #cbd5e1;padding:10px;text-align:left;font-size:13px;}} th{{background:#f1f5f9;}}</style>
    </head><body onload="window.print()">
    <h2>SVNIT Surat — Official Annual Club Events Audit Report ({year})</h2>
    <p><strong>Club Filter:</strong> {club_id} | <strong>Total Events Conducted:</strong> {len(rows)} | <strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
    <h4>Club-Wise Event Breakdown:</h4>
    <ul>{summary_html or '<li>No events recorded</li>'}</ul>
    <table><thead><tr><th>Event ID</th><th>Club</th><th>Event Title</th><th>Date & Time</th><th>Venue</th><th>Students Attended/RSVP</th><th>Feedbacks</th><th>Status</th></tr></thead>
    <tbody>{tr_html}</tbody></table></body></html>
    """
    return HTMLResponse(content=html)

@app.get("/api/unicore/notices")
def get_notices():
    return NOTICES_DB

@app.post("/api/unicore/notices/create")
def create_notice(req: NoticeCreateReq):
    new_n = {
        "notice_id": f"NOT-{random.randint(203, 999)}",
        "club_id": req.club_id.upper(),
        "title": req.title.strip(),
        "message": req.message.strip(),
        "target_branch": req.target_branch,
        "target_year": req.target_year,
        "attachment_link": req.attachment_link.strip() if req.attachment_link else "",
        "status": "Pending Dean Approval",
        "created_at": datetime.now().strftime("%Y-%m-%d")
    }
    NOTICES_DB.insert(0, new_n)
    return {"success": True, "notice": new_n}

@app.post("/api/unicore/notices/approve")
def approve_notice(notice_id: str = Query(...), action: str = Query(...)):
    for n in NOTICES_DB:
        if n["notice_id"] == notice_id:
            n["status"] = action
            return {"success": True, "notice": n}
    raise HTTPException(status_code=404, detail="Notice not found")