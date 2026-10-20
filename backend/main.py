from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import random
import datetime
import requests
import re

app = FastAPI(title="HMS Enterprise - Multi-Tenant Campus Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 1. MULTI-TENANT INSTITUTE REGISTRY
# ==========================================
TENANTS = {
    "SVNIT": {
        "institute_id": "SVNIT",
        "name": "Sardar Vallabhbhai National Institute of Technology, Surat",
        "short_name": "SVNIT Surat",
        "logo_url": "https://upload.wikimedia.org/wikipedia/en/1/1b/NIT_Surat_Logo.svg",
        "ccc_osticket_url": "https://help.ccc.svnit.ac.in/api/tickets.json",
        "ccc_api_key": "PASTE_SVNIT_OSTICKET_API_KEY_HERE",
        "hostels": [
            "Gajjar Bhawan",
            "Bhabha Bhawan",
            "Swami Vivekananda Bhawan",
            "Mother Teresa Bhawan",
            "Tagore Bhawan",
            "Nehru Bhawan",
            "Raman Bhawan",
            "Sarabhai Bhawan"
        ],
        "modules": {
            "complaints": True,   # Phase 1: ACTIVE for 30-Day Pilot
            "attendance": False,  # Phase 2: Locked until Day 31
            "outpass": False,     # Phase 2: Locked until Day 31
            "mess": False         # Phase 3: Locked until Day 31
        }
    },
    "MNIT": {
        "institute_id": "MNIT",
        "name": "Malaviya National Institute of Technology, Jaipur",
        "short_name": "MNIT Jaipur",
        "logo_url": "https://upload.wikimedia.org/wikipedia/en/b/b5/MNIT_Jaipur_Logo.svg",
        "ccc_osticket_url": "",
        "ccc_api_key": "",
        "hostels": ["Aurobindo Hostel", "Gargi Hostel"],
        "modules": {"complaints": True, "attendance": False, "outpass": False, "mess": False}
    }
}

# ==========================================
# 2. THE 5 CORE COMPLAINT CATEGORIES & ROUTING
# ==========================================
CATEGORY_ROUTING = {
    "Electricity": "Electrical Wing (Estate Dept)",
    "Mess Food Quality": "Mess Supervision Committee",
    "Water Issue": "Plumbing & Water Works",
    "Furniture": "Civil & Carpentry Wing",
    "Wi-Fi & Internet": "Central Computer Center (CCC)"
}

# ==========================================
# 3. PRE-SEEDED ACCOUNTS (REAL-USE READY)
# ==========================================
USERS_DB = [
    # Super Admins (Campus-Wide Access: hostel_block = "All", Strong Passwords)
    {
        "user_id": "DEAN01",
        "password": "SvnitDean@2026!",
        "full_name": "Dr. V. Singh (Dean SW)",
        "role": "Warden",
        "authority_title": "Dean of Student Welfare",
        "institute_id": "SVNIT",
        "hostel_block": "All",
        "floor": "-",
        "room": "Dean Office",
        "phone": "9876543222",
        "email": "dosw@svnit.ac.in",
        "department": "All"
    },
    {
        "user_id": "AD01",
        "password": "SvnitAd@2026!",
        "full_name": "Dr. M. Sharma (Associate Dean)",
        "role": "Warden",
        "authority_title": "Associate Dean",
        "institute_id": "SVNIT",
        "hostel_block": "All",
        "floor": "-",
        "room": "AD Office",
        "phone": "9876543221",
        "email": "adsw@svnit.ac.in",
        "department": "All"
    },
    {
        "user_id": "CW01",
        "password": "SvnitCw@2026!",
        "full_name": "Dr. S. Kumar (Chief Warden)",
        "role": "Warden",
        "authority_title": "Chief Warden",
        "institute_id": "SVNIT",
        "hostel_block": "All",
        "floor": "-",
        "room": "Main Office",
        "phone": "9876543220",
        "email": "cw@svnit.ac.in",
        "department": "All"
    },

    # Local Hostel Warden (Scoped to Specific Hostel)
    {
        "user_id": "W01",
        "password": "123",
        "full_name": "Dr. R. Patel (Warden)",
        "role": "Warden",
        "authority_title": "Local Warden",
        "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan",
        "floor": "Ground",
        "room": "Warden Office",
        "phone": "9876543210",
        "email": "warden.gajjar@svnit.ac.in",
        "department": "All"
    },

    # Sample Student Account
    {
        "user_id": "U26CE011",
        "password": "123",
        "full_name": "Ishant Agrawal",
        "role": "Student",
        "authority_title": "Student",
        "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan",
        "floor": "2nd Floor",
        "room": "B-204",
        "phone": "9876543211",
        "email": "u26ce011@ced.svnit.ac.in",
        "department": "None"
    },

    # Department Staff Accounts (Scoped by Category)
    {
        "user_id": "STAFF_CCC",
        "password": "123",
        "full_name": "CCC Network Engineer",
        "role": "DepartmentStaff",
        "authority_title": "Department Staff",
        "institute_id": "SVNIT",
        "hostel_block": "All",
        "floor": "-",
        "room": "-",
        "phone": "9876543213",
        "email": "helpdesk@ccc.svnit.ac.in",
        "department": "Wi-Fi & Internet"
    },
    {
        "user_id": "STAFF_ELEC",
        "password": "123",
        "full_name": "Ramesh Kumar (JE Electrical)",
        "role": "DepartmentStaff",
        "authority_title": "Department Staff",
        "institute_id": "SVNIT",
        "hostel_block": "All",
        "floor": "-",
        "room": "-",
        "phone": "9876543212",
        "email": "elec@svnit.ac.in",
        "department": "Electricity"
    },
    {
        "user_id": "STAFF_WATER",
        "password": "123",
        "full_name": "Suresh Verma (Plumbing)",
        "role": "DepartmentStaff",
        "authority_title": "Department Staff",
        "institute_id": "SVNIT",
        "hostel_block": "All",
        "floor": "-",
        "room": "-",
        "phone": "9876543214",
        "email": "water@svnit.ac.in",
        "department": "Water Issue"
    },
    {
        "user_id": "STAFF_FURN",
        "password": "123",
        "full_name": "Maheshbhai (Civil/Carpentry)",
        "role": "DepartmentStaff",
        "authority_title": "Department Staff",
        "institute_id": "SVNIT",
        "hostel_block": "All",
        "floor": "-",
        "room": "-",
        "phone": "9876543215",
        "email": "civil@svnit.ac.in",
        "department": "Furniture"
    },
    {
        "user_id": "STAFF_MESS",
        "password": "123",
        "full_name": "Mess Coordinator",
        "role": "DepartmentStaff",
        "authority_title": "Department Staff",
        "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan",
        "floor": "-",
        "room": "-",
        "phone": "9876543216",
        "email": "mess@svnit.ac.in",
        "department": "Mess Food Quality"
    }
]

# Pre-seeded Sample Tickets
COMPLAINTS_DB = [
    {
        "id": 1,
        "ticket_id": "HMS-48291",
        "ccc_ticket_id": "CCC-839201",
        "institute_id": "SVNIT",
        "student_id": "U26CE011",
        "student_name": "Ishant Agrawal",
        "phone": "9876543211",
        "email": "u26ce011@ced.svnit.ac.in",
        "hostel_block": "Gajjar Bhawan",
        "floor": "2nd Floor",
        "room": "B-204",
        "category": "Wi-Fi & Internet",
        "routed_to": "Central Computer Center (CCC)",
        "summary": "LAN port not working in Room B-204",
        "description": "Ethernet cable connected but showing unidentified network since morning.",
        "status": "Awaiting Confirmation",
        "staff_remark": "Reset VLAN switch port from CCC server room. Please check now.",
        "created_at": "19 Oct 2026, 10:15 AM",
        "resolved_at": None
    },
    {
        "id": 2,
        "ticket_id": "HMS-19402",
        "ccc_ticket_id": None,
        "institute_id": "SVNIT",
        "student_id": "U26CE011",
        "student_name": "Ishant Agrawal",
        "phone": "9876543211",
        "email": "u26ce011@ced.svnit.ac.in",
        "hostel_block": "Gajjar Bhawan",
        "floor": "2nd Floor",
        "room": "B-204",
        "category": "Electricity",
        "routed_to": "Electrical Wing (Estate Dept)",
        "summary": "Ceiling fan regulator sparking",
        "description": "Fan regulator only works on speed 5 and sparks when turned.",
        "status": "Open",
        "staff_remark": "",
        "created_at": "19 Oct 2026, 11:30 AM",
        "resolved_at": None
    }
]

# ==========================================
# 4. OFFICIAL OSTICKET API BRIDGE FOR SVNIT CCC
# ==========================================
def push_to_ccc_osticket(tenant, student, summary, details):
    api_url = tenant.get("ccc_osticket_url")
    api_key = tenant.get("ccc_api_key")

    payload = {
        "name": student["full_name"],
        "email": student["email"],
        "phone": student["phone"],
        "subject": f"[{student['hostel_block']} Rm {student['room']}] {summary}",
        "message": (
            f"Auto-Registered via HMS Enterprise\n"
            f"-----------------------------------\n"
            f"Student ID: {student['user_id']}\n"
            f"Phone Number: {student['phone']}\n"
            f"Hostel Name: {student['hostel_block']}\n"
            f"Floor Number: {student['floor']}\n"
            f"Room Number: {student['room']}\n\n"
            f"Issue Details:\n{details}"
        ),
        "ip": "127.0.0.1",
        "topicId": 1,
        "hostel_name": student["hostel_block"],
        "floor_number": student["floor"],
        "room_number": student["room"]
    }

    if not api_key or api_key == "PASTE_SVNIT_OSTICKET_API_KEY_HERE":
        simulated_ccc_id = f"CCC-{random.randint(100000, 999999)}"
        return {"synced": True, "ccc_ticket_id": simulated_ccc_id, "mode": "Pilot Ready"}

    try:
        headers = {"X-API-Key": api_key, "Content-Type": "application/json"}
        res = requests.post(api_url, json=payload, headers=headers, timeout=5)
        if res.status_code == 201:
            return {"synced": True, "ccc_ticket_id": f"CCC-{res.text.strip()}", "mode": "Live osTicket Sync"}
    except Exception:
        pass

    return {"synced": False, "ccc_ticket_id": "Pending-Sync", "mode": "Local Queue"}

# ==========================================
# 5. CORE AUTH & COMPLAINT WORKFLOW ENDPOINTS
# ==========================================
@app.get("/")
def health_check():
    return {"status": "HMS Enterprise Backend is Live", "total_users": len(USERS_DB), "total_complaints": len(COMPLAINTS_DB)}

class LoginReq(BaseModel):
    user_id: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginReq):
    for u in USERS_DB:
        if u["user_id"].lower() == req.user_id.strip().lower() and u["password"] == req.password.strip():
            tenant = TENANTS.get(u["institute_id"], TENANTS["SVNIT"])
            return {"success": True, "user": u, "tenant": tenant}
    raise HTTPException(status_code=401, detail="Invalid User ID or Password")

class ComplaintCreate(BaseModel):
    student_id: str
    category: str
    summary: str
    description: str

@app.post("/api/complaints")
def create_complaint(req: ComplaintCreate):
    student = next((u for u in USERS_DB if u["user_id"].lower() == req.student_id.strip().lower()), None)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    tenant = TENANTS.get(student["institute_id"], TENANTS["SVNIT"])
    ticket_id = f"HMS-{random.randint(10000, 99999)}"

    ccc_sync_info = None
    if req.category == "Wi-Fi & Internet":
        ccc_sync_info = push_to_ccc_osticket(tenant, student, req.summary, req.description)

    new_ticket = {
        "id": len(COMPLAINTS_DB) + 1,
        "ticket_id": ticket_id,
        "ccc_ticket_id": ccc_sync_info["ccc_ticket_id"] if ccc_sync_info else None,
        "institute_id": student["institute_id"],
        "student_id": student["user_id"],
        "student_name": student["full_name"],
        "phone": student["phone"],
        "email": student["email"],
        "hostel_block": student["hostel_block"],
        "floor": student["floor"],
        "room": student["room"],
        "category": req.category,
        "routed_to": CATEGORY_ROUTING.get(req.category, "General Maintenance"),
        "summary": req.summary,
        "description": req.description,
        "status": "Open",
        "staff_remark": "",
        "created_at": datetime.datetime.now().strftime("%d %b %Y, %I:%M %p"),
        "resolved_at": None
    }
    COMPLAINTS_DB.insert(0, new_ticket)
    return {"success": True, "ticket": new_ticket, "ccc_sync": ccc_sync_info}

@app.get("/api/complaints")
def get_complaints(institute_id: str, role: str, user_id: str, department: Optional[str] = None, hostel_block: Optional[str] = None):
    scoped = [c for c in COMPLAINTS_DB if c["institute_id"] == institute_id]
    if role == "Student":
        return [c for c in scoped if c["student_id"].lower() == user_id.lower()]
    elif role == "DepartmentStaff":
        return [c for c in scoped if c["category"] == department]
    elif role == "Warden":
        if hostel_block and hostel_block != "All":
            return [c for c in scoped if c["hostel_block"].lower() == hostel_block.lower()]
        return scoped
    return scoped

class StaffResolveReq(BaseModel):
    ticket_id: str
    staff_remark: Optional[str] = "Issue resolved by department."

@app.post("/api/complaints/staff-resolve")
def staff_resolve_complaint(req: StaffResolveReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            c["status"] = "Awaiting Confirmation"
            c["staff_remark"] = (req.staff_remark or "").strip() or "Issue resolved by department."
            return {"success": True, "message": "Marked resolved! Waiting for student confirmation."}
    raise HTTPException(status_code=404, detail="Ticket not found")

class StudentVerifyReq(BaseModel):
    ticket_id: str
    satisfied: bool

@app.post("/api/complaints/student-verify")
def student_verify_complaint(req: StudentVerifyReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            if req.satisfied:
                c["status"] = "Completed"
                c["resolved_at"] = datetime.datetime.now().strftime("%d %b %Y, %I:%M %p")
                return {"success": True, "message": "Complaint officially marked Completed!"}
            else:
                c["status"] = "Reopened"
                return {"success": True, "message": "Ticket Reopened and escalated back to department!"}
    raise HTTPException(status_code=404, detail="Ticket not found")

# ==========================================
# 6. STUDENT PROVISIONING (BULK CSV & SINGLE)
# ==========================================
class BulkStudent(BaseModel):
    user_id: str
    full_name: str
    hostel_block: str
    floor: str
    room: str
    phone: str
    email: Optional[str] = None
    password: Optional[str] = "123"

@app.post("/api/warden/bulk-upload")
def bulk_upload(institute_id: str, students: List[BulkStudent]):
    added = 0
    for s in students:
        uid = s.user_id.strip().upper()
        if not any(u["user_id"].lower() == uid.lower() for u in USERS_DB):
            USERS_DB.append({
                "user_id": uid,
                "password": s.password.strip() if s.password else "123",
                "full_name": s.full_name.strip(),
                "role": "Student",
                "authority_title": "Student",
                "institute_id": institute_id,
                "hostel_block": s.hostel_block.strip(),
                "floor": s.floor.strip(),
                "room": s.room.strip(),
                "phone": s.phone.strip(),
                "email": s.email.strip() if s.email else f"{uid.lower()}@svnit.ac.in",
                "department": "None"
            })
            added += 1
    return {"success": True, "added": added, "total_users": len(USERS_DB)}

@app.post("/api/warden/create-student")
def create_single_student(req: BulkStudent, institute_id: str = "SVNIT"):
    uid = req.user_id.strip().upper()
    if any(u["user_id"].lower() == uid.lower() for u in USERS_DB):
        raise HTTPException(status_code=400, detail="Student User ID already exists!")

    USERS_DB.append({
        "user_id": uid,
        "password": req.password.strip() if req.password else "123",
        "full_name": req.full_name.strip(),
        "role": "Student",
        "authority_title": "Student",
        "institute_id": institute_id,
        "hostel_block": req.hostel_block.strip(),
        "floor": req.floor.strip(),
        "room": req.room.strip(),
        "phone": req.phone.strip(),
        "email": req.email.strip() if req.email else f"{uid.lower()}@svnit.ac.in",
        "department": "None"
    })
    return {"success": True, "message": f"Student {uid} created for {req.hostel_block}!"}

@app.get("/api/warden/students")
def get_students(institute_id: str, hostel_block: Optional[str] = None):
    students = [u for u in USERS_DB if u["institute_id"] == institute_id and u["role"] == "Student"]
    if hostel_block and hostel_block != "All":
        return [s for s in students if s["hostel_block"].lower() == hostel_block.lower()]
    return students

# ==========================================
# 7. SUPER ADMIN: ROLE CREATION & PASSWORD SECURITY
# ==========================================
class AdminCreate(BaseModel):
    user_id: str
    full_name: str
    authority_type: Optional[str] = "Local Warden"  # 'Local Warden', 'Chief Warden', 'Associate Dean'
    hostel_block: Optional[str] = ""
    phone: str
    email: Optional[str] = ""
    password: Optional[str] = "123"

@app.post("/api/admin/create-admin")
@app.post("/api/admin/create-warden")  # Backward-compatible alias
def create_admin(req: AdminCreate, admin_id: str):
    admin = next((u for u in USERS_DB if u["user_id"].lower() == admin_id.strip().lower()), None)
    if not admin or admin["hostel_block"] != "All":
        raise HTTPException(status_code=403, detail="Only Campus Super Admins (Dean / Chief Warden / Assoc. Dean) can create authorities")

    uid = req.user_id.strip().upper()
    if any(u["user_id"].lower() == uid.lower() for u in USERS_DB):
        raise HTTPException(status_code=400, detail=f"User ID {uid} already exists!")

    auth_type = req.authority_type or "Local Warden"
    is_campus_wide = auth_type in ["Chief Warden", "Associate Dean", "Dean of Student Welfare"]
    assigned_block = "All" if is_campus_wide else (req.hostel_block or "Gajjar Bhawan").strip()

    raw_pass = (req.password or "").strip()
    if not raw_pass:
        raw_pass = "SvnitAdmin@2026!" if is_campus_wide else "123"

    # Enforce strong password if creating a Campus-Wide Super Admin with a custom password
    if is_campus_wide and raw_pass != "123":
        if len(raw_pass) < 8 or not re.search(r"[!@#$%^&*]", raw_pass):
            raise HTTPException(
                status_code=400,
                detail="Security Policy: Super Admin passwords must be 8+ characters and include a special character (!@#$%^&*)"
            )

    display_name = req.full_name.strip()
    if auth_type not in display_name:
        display_name = f"{display_name} ({auth_type})"

    USERS_DB.append({
        "user_id": uid,
        "password": raw_pass,
        "full_name": display_name,
        "role": "Warden",
        "authority_title": auth_type,
        "institute_id": admin["institute_id"],
        "hostel_block": assigned_block,
        "floor": "-",
        "room": "Admin Office" if is_campus_wide else "Warden Office",
        "phone": req.phone.strip(),
        "email": req.email.strip() if req.email else f"{uid.lower()}@svnit.ac.in",
        "department": "All"
    })
    return {
        "success": True,
        "message": f"{auth_type} account ({uid}) created for {assigned_block}! Initial Password: {raw_pass}"
    }

class PasswordChange(BaseModel):
    target_user_id: str
    new_password: str

@app.post("/api/admin/change-password")
def change_password(req: PasswordChange, admin_id: str):
    admin = next((u for u in USERS_DB if u["user_id"].lower() == admin_id.strip().lower()), None)
    if not admin or admin["hostel_block"] != "All":
        raise HTTPException(status_code=403, detail="Only Super Admins can override passwords")

    target_user = next((u for u in USERS_DB if u["user_id"].lower() == req.target_user_id.strip().lower()), None)
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User ID '{req.target_user_id}' not found in database")

    new_pass = req.new_password.strip()

    # Enforce Strong Password Policy for Super Admins (Dean, Assoc. Dean, Chief Warden)
    if target_user["hostel_block"] == "All" and target_user["role"] == "Warden":
        if len(new_pass) < 8 or not re.search(r"[!@#$%^&*]", new_pass):
            raise HTTPException(
                status_code=400,
                detail="Security Policy: Super Admin (Dean/CW/AD) passwords must be at least 8 characters and contain a special character (!@#$%^&*)"
            )

    if len(new_pass) < 3:
        raise HTTPException(status_code=400, detail="Password must be at least 3 characters long")

    target_user["password"] = new_pass
    return {
        "success": True,
        "message": f"Password successfully updated for {target_user['user_id']} ({target_user['full_name']})"
    }

@app.get("/api/admin/users")
def list_all_users(admin_id: str):
    admin = next((u for u in USERS_DB if u["user_id"].lower() == admin_id.strip().lower()), None)
    if not admin or admin["hostel_block"] != "All":
        raise HTTPException(status_code=403, detail="Unauthorized")
    return [
        {
            "user_id": u["user_id"],
            "full_name": u["full_name"],
            "role": u["role"],
            "authority_title": u.get("authority_title", u["role"]),
            "hostel_block": u["hostel_block"],
            "phone": u["phone"]
        }
        for u in USERS_DB
    ]
# ==========================================
# 8. FOUNDER API: ONBOARD NEW COLLEGE & CREATE DEAN
# ==========================================
class OnboardCollegeReq(BaseModel):
    institute_id: str      # e.g., "VNIT" or "IITB"
    institute_name: str    # e.g., "VNIT Nagpur"
    dean_user_id: str      # e.g., "DEAN_VNIT"
    dean_name: str         # e.g., "Dr. A. K. Verma"
    dean_password: str     # Strong password
    dean_phone: str
    dean_email: str

@app.post("/api/founder/onboard-college")
def onboard_college(req: OnboardCollegeReq, founder_id: str):
    founder = next((u for u in USERS_DB if u["user_id"].lower() == founder_id.strip().lower()), None)
    if not founder or founder.get("authority_title") != "HMS Platform Founder":
        raise HTTPException(status_code=403, detail="Only the HMS Platform Founder can onboard new colleges and Deans")

    inst_code = req.institute_id.strip().upper()
    dean_uid = req.dean_user_id.strip().upper()

    if any(u["user_id"].lower() == dean_uid.lower() for u in USERS_DB):
        raise HTTPException(status_code=400, detail=f"User ID {dean_uid} already exists!")

    if len(req.dean_password) < 8 or not re.search(r"[!@#$%^&*]", req.dean_password):
        raise HTTPException(status_code=400, detail="Dean password must be 8+ chars with a special character (!@#$%^&*)")

    # 1. Register the new College Tenant
    TENANTS[inst_code] = {
        "institute_id": inst_code,
        "name": req.institute_name.strip(),
        "short_name": inst_code,
        "logo_url": "",
        "ccc_osticket_url": "",
        "ccc_api_key": "",
        "hostels": ["Hostel Block A", "Hostel Block B"],
        "modules": {"complaints": True, "attendance": False, "outpass": False, "mess": False}
    }

    # 2. Provision the Dean Account for that College
    USERS_DB.append({
        "user_id": dean_uid,
        "password": req.dean_password.strip(),
        "full_name": f"{req.dean_name.strip()} (Dean SW)",
        "role": "Warden",
        "authority_title": "Dean of Student Welfare",
        "institute_id": inst_code,
        "hostel_block": "All",
        "floor": "-",
        "room": "Dean Office",
        "phone": req.dean_phone.strip(),
        "email": req.dean_email.strip(),
        "department": "All"
    })

    return {
        "success": True,
        "message": f"🚀 Onboarded {req.institute_name} ({inst_code})! Created Dean login: {dean_uid}"
    }