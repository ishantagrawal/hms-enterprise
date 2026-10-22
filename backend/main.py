from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime
import random

app = FastAPI(title="SVNIT HMS - Official Pilot Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SVNIT_HOSTELS = [
    "Gajjar Bhawan", "Bhabha Bhawan", "Mother Teresa Bhawan",
    "Swami Vivekananda Bhawan", "Nehru Bhawan", "Tagore Bhawan",
    "Sarabhai Bhawan", "Raman Bhawan", "Atal Bihari Vajpayee Bhawan"
]

# =========================================================
# 1. BASELINE CENTRAL DEPARTMENTS
# =========================================================
COMPLAINT_DEPARTMENTS = [
    {
        "id": "ELECTRICITY",
        "title": "Electrical Maintenance (Central)",
        "type": "Central",
        "hostel_block": "All",
        "icon": "⚡"
    },
    {
        "id": "CCC_LAN",
        "title": "CCC / Internet / LAN (Central)",
        "type": "Central",
        "hostel_block": "All",
        "icon": "🌐"
    }
]

# =========================================================
# 2. CLEAN PRODUCTION USERS DATABASE
# =========================================================
USERS_DB = [
    {
        "user_id": "DEAN", "password": "123", "full_name": "Dean Student Welfare",
        "role": "Dean", "authority_title": "Dean Student Welfare (SVNIT)", "institute_id": "SVNIT",
        "hostel_block": "All", "year": "-", "room": "Admin Block",
        "phone": "0261-2201500", "email": "dean_sw@svnit.ac.in", "department": "Administration", "dob": "01011975"
    },
    {
        "user_id": "CW_GAJJAR", "password": "123", "full_name": "Gajjar Bhawan Warden Office",
        "role": "Warden", "authority_title": "Chief Warden / Warden (Gajjar Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "year": "-", "room": "Warden Office",
        "phone": "0261-2201659", "email": "warden_gajjar@svnit.ac.in", "department": "Hostel Office", "dob": "01011980"
    },
    {
        "user_id": "CW_BHABHA", "password": "123", "full_name": "Bhabha Bhawan Warden Office",
        "role": "Warden", "authority_title": "Chief Warden / Warden (Bhabha Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Bhabha Bhawan", "year": "-", "room": "Warden Office",
        "phone": "0261-2201790", "email": "warden_bhabha@svnit.ac.in", "department": "Hostel Office", "dob": "01011980"
    },
    {
        "user_id": "CW_MTB", "password": "123", "full_name": "Mother Teresa Bhawan Warden Office",
        "role": "Warden", "authority_title": "Chief Warden / Warden (Mother Teresa Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Mother Teresa Bhawan", "year": "-", "room": "Warden Office",
        "phone": "0261-2201967", "email": "warden_mtb@svnit.ac.in", "department": "Hostel Office", "dob": "01011980"
    },
    {
        "user_id": "CW_SVB", "password": "123", "full_name": "Swami Vivekananda Bhawan Warden Office",
        "role": "Warden", "authority_title": "Chief Warden / Warden (Swami Vivekananda Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Swami Vivekananda Bhawan", "year": "-", "room": "Warden Office",
        "phone": "0261-2201657", "email": "warden_svb@svnit.ac.in", "department": "Hostel Office", "dob": "01011980"
    },
    {
        "user_id": "CW_NEHRU", "password": "123", "full_name": "Nehru Bhawan Warden Office",
        "role": "Warden", "authority_title": "Chief Warden / Warden (Nehru Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Nehru Bhawan", "year": "-", "room": "Warden Office",
        "phone": "0261-2201703", "email": "warden_nehru@svnit.ac.in", "department": "Hostel Office", "dob": "01011980"
    },
    {
        "user_id": "CW_TAGORE", "password": "123", "full_name": "Tagore Bhawan Warden Office",
        "role": "Warden", "authority_title": "Chief Warden / Warden (Tagore Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Tagore Bhawan", "year": "-", "room": "Warden Office",
        "phone": "0261-2201707", "email": "warden_tagore@svnit.ac.in", "department": "Hostel Office", "dob": "01011980"
    },
    {
        "user_id": "CW_SARABHAI", "password": "123", "full_name": "Sarabhai Bhawan Warden Office",
        "role": "Warden", "authority_title": "Chief Warden / Warden (Sarabhai Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Sarabhai Bhawan", "year": "-", "room": "Warden Office",
        "phone": "0261-2201793", "email": "warden_sarabhai@svnit.ac.in", "department": "Hostel Office", "dob": "01011980"
    },
    {
        "user_id": "CW_RAMAN", "password": "123", "full_name": "Raman Bhawan Warden Office",
        "role": "Warden", "authority_title": "Chief Warden / Warden (Raman Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Raman Bhawan", "year": "-", "room": "Warden Office",
        "phone": "0261-2201789", "email": "warden_raman@svnit.ac.in", "department": "Hostel Office", "dob": "01011980"
    },
    {
        "user_id": "CW_ABVB", "password": "123", "full_name": "Atal Bihari Vajpayee Bhawan Warden Office",
        "role": "Warden", "authority_title": "Chief Warden / Warden (Atal Bihari Vajpayee Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Atal Bihari Vajpayee Bhawan", "year": "-", "room": "Warden Office",
        "phone": "0261-2201880", "email": "warden_abvb@svnit.ac.in", "department": "Hostel Office", "dob": "01011980"
    },
    {
        "user_id": "ELECTRICITY", "password": "123", "full_name": "Electrical Maintenance (Central)",
        "role": "Staff", "authority_title": "Central Department Portal (All Hostels)", "institute_id": "SVNIT",
        "hostel_block": "All", "year": "-", "room": "Estate Electrical Wing",
        "phone": "0261-2201555", "email": "electricity@svnit.ac.in", "department": "ELECTRICITY", "dob": "01011990"
    },
    {
        "user_id": "CCC_LAN", "password": "123", "full_name": "CCC / Internet / LAN (Central)",
        "role": "Staff", "authority_title": "Central Department Portal (All Hostels)", "institute_id": "SVNIT",
        "hostel_block": "All", "year": "-", "room": "Central Computer Centre",
        "phone": "0261-2201566", "email": "ccc_lan@svnit.ac.in", "department": "CCC_LAN", "dob": "01011990"
    }
]

CLUBS_DB = []
EVENTS_DB = []
COMPLAINTS_DB = []
NOTICES_DB = []

# =========================================================
# 3. PYDANTIC MODELS
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

# =========================================================
# 4. API ENDPOINTS
# =========================================================
@app.get("/")
def root():
    return {"status": "online", "institute": "SVNIT Surat HMS Pilot"}

@app.post("/api/auth/login")
def login(req: LoginReq):
    uid = req.user_id.strip().upper()
    pwd = req.password.strip()
    for u in USERS_DB:
        if u["user_id"].upper() == uid and (u["password"] == pwd or u.get("dob") == pwd):
            user_copy = {k: v for k, v in u.items() if k != "password"}
            return {"success": True, "user": user_copy}
    raise HTTPException(status_code=401, detail="Invalid Roll No / Login ID or Password")

@app.get("/api/departments")
def get_departments(hostel_block: str = "All"):
    if hostel_block and hostel_block != "All":
        return [
            d for d in COMPLAINT_DEPARTMENTS
            if d["type"] == "Central" or d.get("hostel_block", "All").lower() == hostel_block.lower()
        ]
    return COMPLAINT_DEPARTMENTS

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

    existing_dept = next((d for d in COMPLAINT_DEPARTMENTS if d["id"].upper() == did), None)
    if existing_dept:
        existing_dept["title"] = display_title
        existing_dept["icon"] = req.icon or "🛠️"
    else:
        COMPLAINT_DEPARTMENTS.append({
            "id": did,
            "title": display_title,
            "type": req.dept_type,
            "hostel_block": h_block,
            "icon": req.icon or "🛠️"
        })

    existing_user = next((u for u in USERS_DB if u["user_id"].upper() == did), None)
    if existing_user:
        existing_user["password"] = pwd
        existing_user["full_name"] = display_title
        existing_user["hostel_block"] = h_block
        existing_user["department"] = did
    else:
        USERS_DB.append({
            "user_id": did,
            "password": pwd,
            "full_name": display_title,
            "role": "Staff",
            "authority_title": f"Department Portal ({h_block})",
            "institute_id": "SVNIT",
            "hostel_block": h_block,
            "year": "-",
            "room": "Maintenance Wing",
            "phone": "0261-2201500",
            "email": f"{did.lower()}@svnit.ac.in",
            "department": did,
            "dob": "01011990"
        })

    return {
        "success": True,
        "message": f"Department '{display_title}' created! Login ID: {did} | Password: {pwd}",
        "departments": COMPLAINT_DEPARTMENTS
    }

@app.get("/api/dean/wardens")
def get_wardens():
    return [{k: v for k, v in u.items() if k != "password"} for u in USERS_DB if u.get("role") == "Warden"]

@app.post("/api/dean/create-warden")
def create_or_update_warden(req: WardenCreateReq):
    uid = req.user_id.strip().upper().replace(" ", "_")
    existing = next((u for u in USERS_DB if u["user_id"].upper() == uid), None)
    if existing:
        existing["password"] = req.password.strip()
        existing["hostel_block"] = req.hostel_block.strip()
        existing["full_name"] = f"{req.hostel_block.strip()} Warden Office"
        return {"success": True, "message": f"Updated Warden portal '{uid}' for {req.hostel_block}!"}
    
    USERS_DB.append({
        "user_id": uid,
        "password": req.password.strip(),
        "full_name": f"{req.hostel_block.strip()} Warden Office",
        "role": "Warden",
        "authority_title": f"Chief Warden / Warden ({req.hostel_block.strip()})",
        "institute_id": "SVNIT",
        "hostel_block": req.hostel_block.strip(),
        "year": "-",
        "room": "Warden Office",
        "phone": req.phone.strip(),
        "email": f"{uid.lower()}@svnit.ac.in",
        "department": "Hostel Office",
        "dob": "01011980"
    })
    return {"success": True, "message": f"Warden Portal '{uid}' created for {req.hostel_block}!"}

@app.post("/api/founder/create-club")
@app.post("/api/dean/create-club")
def create_club(req: ClubCreateReq):
    cid = req.club_id.strip().upper().replace(" ", "_")
    pwd = (req.password or "123").strip()
    if any(c["club_id"].upper() == cid for c in CLUBS_DB):
        raise HTTPException(status_code=400, detail=f"Club ID '{cid}' already exists.")
    
    new_c = {
        "club_id": cid,
        "name": req.name.strip(),
        "mission": (req.mission or "").strip() or "Official Student Chapter of SVNIT Surat.",
        "faculty_advisor": (req.faculty_advisor or "").strip() or "To be updated by club",
        "head_coordinator": (req.head_coordinator or "").strip() or "To be updated by club",
        "extra_dean_info": "",
        "banner_url": "",
        "logo_url": "",
        "members": [],
        "gallery": []
    }
    CLUBS_DB.insert(0, new_c)

    existing_u = next((u for u in USERS_DB if u["user_id"].upper() == cid), None)
    if existing_u:
        existing_u["password"] = pwd
    else:
        USERS_DB.append({
            "user_id": cid,
            "password": pwd,
            "full_name": req.name.strip(),
            "role": "ClubOrganizer",
            "authority_title": f"Club Portal ({cid})",
            "institute_id": "SVNIT",
            "hostel_block": "All",
            "year": "-",
            "room": "SAC Office",
            "phone": "",
            "email": f"{cid.lower()}@svnit.ac.in",
            "department": "Student Society",
            "dob": "01012000"
        })
    return {
        "success": True,
        "message": f"Club '{req.name}' created! Login ID: {cid} | Password: {pwd}",
        "club": new_c
    }

@app.post("/api/dean/reset-password")
def reset_password(req: PasswordResetReq, admin_id: str = Query("DEAN")):
    target_id = req.target_user_id.strip().upper()
    target = next((u for u in USERS_DB if u["user_id"].upper() == target_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Account ID '{target_id}' not found.")
    target["password"] = req.new_password.strip()
    return {"success": True, "message": f"Password updated for {target['full_name']} ({target['user_id']})"}

# --- 6-FIELD STUDENT ONBOARDING (Roll No, Name, Room, Dept, Year, DOB) ---
@app.get("/api/warden/students")
def get_hostel_students(hostel_block: str = "All"):
    if hostel_block == "All":
        return [{k: v for k, v in u.items() if k != "password"} for u in USERS_DB if u["role"] == "Student"]
    return [
        {k: v for k, v in u.items() if k != "password"}
        for u in USERS_DB
        if u["role"] == "Student" and u["hostel_block"].lower() == hostel_block.lower()
    ]

@app.post("/api/warden/add-student")
def add_student_manual(req: StudentManualAddReq):
    uid = req.user_id.strip().upper()
    clean_dob = req.dob.strip().replace("-", "").replace("/", "")
    existing = next((u for u in USERS_DB if u["user_id"].upper() == uid), None)
    if existing:
        existing.update({
            "full_name": req.full_name.strip(),
            "hostel_block": req.hostel_block.strip(),
            "room": req.room.strip(),
            "department": req.department.strip(),
            "year": (req.year or "1st Year").strip(),
            "dob": clean_dob
        })
        return {"success": True, "message": f"Updated student record for {req.full_name} ({uid})."}

    USERS_DB.append({
        "user_id": uid,
        "password": clean_dob,
        "full_name": req.full_name.strip(),
        "role": "Student",
        "authority_title": "Verified Resident",
        "institute_id": "SVNIT",
        "hostel_block": req.hostel_block.strip(),
        "year": (req.year or "1st Year").strip(),
        "room": req.room.strip(),
        "phone": (req.phone or "").strip(),
        "email": (req.email or f"{uid.lower()}@svnit.ac.in").strip(),
        "department": req.department.strip(),
        "dob": clean_dob
    })
    return {
        "success": True,
        "message": f"Student {req.full_name} ({uid}) registered! Login Password = DOB ({clean_dob})."
    }

@app.post("/api/warden/upload-students")
@app.post("/api/founder/upload-students")
def upload_students_bulk(students: List[StudentManualAddReq]):
    added = 0
    updated = 0
    for s in students:
        uid = s.user_id.strip().upper()
        if not uid:
            continue
        clean_dob = s.dob.strip().replace("-", "").replace("/", "")
        existing = next((u for u in USERS_DB if u["user_id"].upper() == uid), None)
        if existing:
            existing.update({
                "full_name": s.full_name.strip(),
                "hostel_block": s.hostel_block.strip(),
                "room": s.room.strip(),
                "department": s.department.strip(),
                "year": (s.year or "1st Year").strip(),
                "dob": clean_dob
            })
            updated += 1
        else:
            USERS_DB.append({
                "user_id": uid,
                "password": clean_dob,
                "full_name": s.full_name.strip(),
                "role": "Student",
                "authority_title": "Verified Resident",
                "institute_id": "SVNIT",
                "hostel_block": s.hostel_block.strip(),
                "year": (s.year or "1st Year").strip(),
                "room": s.room.strip(),
                "phone": (s.phone or "").strip(),
                "email": (s.email or f"{uid.lower()}@svnit.ac.in").strip(),
                "department": s.department.strip(),
                "dob": clean_dob
            })
            added += 1
    return {
        "success": True,
        "message": f"Onboarding Complete: {added} new students added & {updated} updated (Password = DOB)!"
    }

@app.post("/api/warden/reset-student-password")
def warden_reset_student(req: PasswordResetReq, warden_id: str = Query("CW_GAJJAR")):
    target = next((u for u in USERS_DB if u["user_id"].upper() == req.target_user_id.strip().upper()), None)
    if not target:
        raise HTTPException(status_code=404, detail="Student Roll No not found.")
    default_dob = target.get("dob", "123")
    target["password"] = default_dob
    return {
        "success": True,
        "message": f"Password for {target['full_name']} ({target['user_id']}) reset to DOB ({default_dob})!"
    }

@app.post("/api/student/change-password")
def student_change_password(req: StudentChangePassReq):
    student = next((u for u in USERS_DB if u["user_id"].upper() == req.student_id.strip().upper()), None)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    old_p = req.old_password.strip()
    if student["password"] != old_p and student.get("dob") != old_p:
        raise HTTPException(status_code=400, detail="Current password or DOB is incorrect.")
    student["password"] = req.new_password.strip()
    return {"success": True, "message": "New password saved successfully!"}

# --- COMPLAINTS ---
@app.get("/api/complaints")
def get_complaints(role: str = "Dean", user_id: str = "", hostel_block: str = "All", department: str = ""):
    if role == "Student":
        return [c for c in COMPLAINTS_DB if c["student_id"].upper() == user_id.upper()]
    if role == "Warden" and hostel_block != "All":
        return [c for c in COMPLAINTS_DB if c["hostel_block"].lower() == hostel_block.lower()]
    if role == "Staff":
        dept_key = (department or user_id).strip().upper()
        matched = [
            c for c in COMPLAINTS_DB
            if dept_key in c["category"].upper() or dept_key in c["routed_to"].upper()
        ]
        if hostel_block and hostel_block != "All":
            matched = [c for c in matched if c["hostel_block"].lower() == hostel_block.lower()]
        return matched
    return COMPLAINTS_DB

@app.post("/api/complaints")
def create_complaint(req: ComplaintCreateReq):
    student = next((u for u in USERS_DB if u["user_id"].upper() == req.student_id.upper()), None)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    dept_obj = next((d for d in COMPLAINT_DEPARTMENTS if d["id"].upper() == req.category.upper() or d["title"].lower() == req.category.lower()), None)
    routed_title = dept_obj["title"] if dept_obj else f"{req.category} Department"
    cat_id = dept_obj["id"] if dept_obj else req.category

    new_tkt = {
        "ticket_id": f"TKT-{random.randint(100, 999)}",
        "student_id": student["user_id"],
        "student_name": student["full_name"],
        "hostel_block": student["hostel_block"],
        "room": student["room"],
        "year": student.get("year", ""),
        "department": student.get("department", ""),
        "category": cat_id,
        "summary": req.summary,
        "description": req.description,
        "status": "Pending",
        "routed_to": routed_title,
        "staff_remark": "",
        "created_at": datetime.now().strftime("%Y-%m-%d, %I:%M %p"),
        "resolved_at": ""
    }
    COMPLAINTS_DB.insert(0, new_tkt)
    return {"success": True, "ticket": new_tkt}

@app.post("/api/complaints/staff-resolve")
def staff_resolve(req: StaffResolveReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            c["status"] = "Awaiting Confirmation"
            c["staff_remark"] = req.staff_remark
            c["resolved_at"] = datetime.now().strftime("%Y-%m-%d, %I:%M %p")
            return {"success": True, "ticket": c}
    raise HTTPException(status_code=404, detail="Ticket not found")

@app.post("/api/complaints/student-verify")
def student_verify(req: StudentVerifyReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            c["status"] = "Completed" if req.satisfied else "Reopened"
            return {"success": True, "ticket": c}
    raise HTTPException(status_code=404, detail="Ticket not found")

@app.get("/api/complaints/export-pdf", response_class=HTMLResponse)
def export_pdf(hostel_block: str = "All", from_date: str = "", to_date: str = ""):
    rows = COMPLAINTS_DB
    if hostel_block != "All":
        rows = [c for c in rows if c["hostel_block"] == hostel_block]
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
    rows = [e for e in EVENTS_DB if e["date"].startswith(year) and e["status"] in ["Approved", "Completed"]]
    if club_id != "All":
        rows = [e for e in rows if e["club_id"].upper() == club_id.upper()]
    
    club_counts = {}
    for e in rows:
        club_counts[e["club_id"]] = club_counts.get(e["club_id"], 0) + 1
    summary_rows = "".join([f"<tr><td><strong>{cid}</strong></td><td>{cnt} Events Conducted</td></tr>" for cid, cnt in club_counts.items()])

    event_rows = "".join([
        f"<tr><td>{e['event_id']}</td><td>{e['club_id']}</td><td>{e['title']}</td><td>{e['date']} ({e['start_time']}-{e['end_time']})</td><td>{e['venue']}</td><td>{len(e.get('rsvps', []))}</td><td>{e['status']}</td></tr>"
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

# --- CLUBS, EVENTS & NOTICES ---
@app.get("/api/unicore/clubs")
def get_clubs():
    return CLUBS_DB

@app.post("/api/unicore/clubs/update-info")
def update_club_info(req: ClubUpdateInfoReq):
    for c in CLUBS_DB:
        if c["club_id"].upper() == req.club_id.upper():
            c["mission"] = req.mission
            c["extra_dean_info"] = req.extra_dean_info
            if req.faculty_advisor is not None:
                c["faculty_advisor"] = req.faculty_advisor
            if req.head_coordinator is not None:
                c["head_coordinator"] = req.head_coordinator
            if req.banner_url is not None:
                c["banner_url"] = req.banner_url
            return {"success": True, "club": c}
    raise HTTPException(status_code=404, detail="Club not found")

@app.post("/api/unicore/clubs/add-member")
def add_club_member(req: ClubMemberAddReq):
    for c in CLUBS_DB:
        if c["club_id"].upper() == req.club_id.upper():
            if "members" not in c:
                c["members"] = []
            c["members"].append({
                "name": req.name.strip(),
                "roll": req.roll.strip().upper(),
                "position": req.position.strip(),
                "phone": (req.phone or "").strip(),
                "year": (req.year or "").strip(),
                "department": (req.department or "").strip()
            })
            return {"success": True, "club": c}
    raise HTTPException(status_code=404, detail="Club not found")

@app.post("/api/unicore/clubs/remove-member")
def remove_club_member(req: ClubMemberRemoveReq):
    for c in CLUBS_DB:
        if c["club_id"].upper() == req.club_id.upper():
            if "members" in c and 0 <= req.index < len(c["members"]):
                c["members"].pop(req.index)
            return {"success": True, "club": c}
    raise HTTPException(status_code=404, detail="Club not found")

@app.post("/api/unicore/clubs/add-gallery")
def add_club_gallery(req: ClubGalleryAddReq):
    for c in CLUBS_DB:
        if c["club_id"].upper() == req.club_id.upper():
            if "gallery" not in c:
                c["gallery"] = []
            c["gallery"].insert(0, {
                "media_type": req.media_type,
                "media_url": req.media_url,
                "caption": req.caption,
                "timestamp": datetime.now().strftime("%Y-%m-%d")
            })
            return {"success": True, "club": c}
    raise HTTPException(status_code=404, detail="Club not found")

@app.get("/api/unicore/events")
def get_events():
    return EVENTS_DB

@app.post("/api/unicore/events/propose")
def propose_event(req: EventRequisitionReq):
    clash = None
    for ev in EVENTS_DB:
        if ev["date"] == req.date and ev["status"] == "Approved":
            if not (req.end_time <= ev["start_time"] or req.start_time >= ev["end_time"]):
                clash = f"Note: Another event ({ev['club_id']}'s '{ev['title']}' at {ev['venue']}) is scheduled on {req.date} during {ev['start_time']}-{ev['end_time']}."
    new_evt = {
        "event_id": f"EVT-{random.randint(100, 999)}",
        "club_id": req.club_id.upper(),
        "title": req.title,
        "date": req.date,
        "start_time": req.start_time,
        "end_time": req.end_time,
        "venue": req.venue,
        "status": "Pending Dean Approval",
        "submitted_by": req.submitted_by,
        "description": req.description or "",
        "budget": req.budget or "Not Specified",
        "funding_source": req.funding_source or "Institute / Self",
        "chief_guest": req.chief_guest or "None",
        "expected_attendance": req.expected_attendance or "100+",
        "logistics_needs": req.logistics_needs or "Standard Venue Setup",
        "image_url": req.image_url or "",
        "registration_link": req.registration_link or "",
        "custom_fields": req.custom_fields or [],
        "type": "Upcoming",
        "rsvps": [],
        "feedbacks": []
    }
    EVENTS_DB.insert(0, new_evt)
    return {"success": True, "message": clash or "Event proposal submitted to Dean for approval!", "event": new_evt}

@app.post("/api/unicore/events/approve")
def approve_event(event_id: str = Query(...), action: str = Query(...)):
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
                "message": "RSVP Confirmed! You are marked as attending." if attending else "RSVP Cancelled."
            }
    raise HTTPException(status_code=404, detail="Event not found")

@app.post("/api/unicore/events/feedback")
def submit_event_feedback(req: EventFeedbackReq):
    for ev in EVENTS_DB:
        if ev["event_id"] == req.event_id:
            if "feedbacks" not in ev:
                ev["feedbacks"] = []
            ev["feedbacks"].append({
                "student_id": req.student_id.upper(),
                "rating": req.rating,
                "review": req.review
            })
            all_r = [f["rating"] for f in ev["feedbacks"]]
            avg_r = round(sum(all_r) / len(all_r), 1)
            ev["ai_audit"] = {
                "total_attendees": len(ev.get("rsvps", [])),
                "average_rating": avg_r,
                "sentiment": "Positive" if avg_r >= 4 else "Constructive",
                "key_pros": [f["review"] for f in ev["feedbacks"] if f["rating"] >= 4],
                "key_cons": [f["review"] for f in ev["feedbacks"] if f["rating"] < 4],
                "recommendation": "Verified student post-event reviews."
            }
            return {"success": True, "event": ev}
    raise HTTPException(status_code=404, detail="Event not found")

@app.get("/api/notices")
def get_notices(role: str = "Dean"):
    if role == "Student":
        return [n for n in NOTICES_DB if n["status"] == "Approved"]
    return NOTICES_DB

@app.post("/api/notices/propose")
def propose_notice(req: NoticeCreateReq):
    new_n = {
        "notice_id": f"NOT-{random.randint(500, 999)}",
        "club_id": req.club_id.upper(),
        "title": req.title,
        "message": req.message,
        "target_branch": req.target_branch,
        "target_year": req.target_year,
        "image_url": req.image_url or "",
        "registration_link": req.registration_link or "",
        "custom_fields": req.custom_fields or [],
        "status": "Pending Dean Approval",
        "created_at": datetime.now().strftime("%Y-%m-%d")
    }
    NOTICES_DB.insert(0, new_n)
    return {"success": True, "notice": new_n, "message": "Notice submitted to Dean for approval!"}

@app.post("/api/notices/approve")
def approve_notice(notice_id: str = Query(...), action: str = Query(...)):
    for n in NOTICES_DB:
        if n["notice_id"] == notice_id:
            n["status"] = action
            return {"success": True, "notice": n}
    raise HTTPException(status_code=404, detail="Notice not found")