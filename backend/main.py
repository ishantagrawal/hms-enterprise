from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import random
import datetime
import requests

app = FastAPI(title="HMS Enterprise - Multi-Tenant Campus Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 1. MULTI-TENANT INSTITUTE REGISTRY (Oracle / Tally Style)
# ==========================================
TENANTS = {
    "SVNIT": {
        "institute_id": "SVNIT",
        "name": "Sardar Vallabhbhai National Institute of Technology, Surat",
        "short_name": "SVNIT Surat",
        "logo_url": "https://upload.wikimedia.org/wikipedia/en/1/1b/NIT_Surat_Logo.svg",
        "ccc_osticket_url": "https://help.ccc.svnit.ac.in/api/tickets.json",
        "ccc_api_key": "PASTE_SVNIT_OSTICKET_API_KEY_HERE",
        "hostels": ["Gajjar Bhawan", "Bhabha Bhawan", "Swami Vivekananda Bhawan", "Mother Teresa Bhawan"],
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

# Pre-seeded Demo Accounts
USERS_DB = [
    # High-Level Campus Authorities (Super Admins seeing ALL hostels)
    {"user_id": "CW01", "password": "123", "full_name": "Dr. S. Kumar (Chief Warden)", "role": "Warden", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "Main Office", "phone": "9876543220", "email": "cw@svnit.ac.in", "department": "All"},
    {"user_id": "AD01", "password": "123", "full_name": "Dr. M. Sharma (Associate Dean)", "role": "Warden", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "AD Office", "phone": "9876543221", "email": "adsw@svnit.ac.in", "department": "All"},
    {"user_id": "DEAN01", "password": "123", "full_name": "Dr. V. Singh (Dean SW)", "role": "Warden", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "Dean Office", "phone": "9876543222", "email": "dosw@svnit.ac.in", "department": "All"},
    
    # Regular Wardens, Students, and Staff
    {"user_id": "W01", "password": "123", "full_name": "Dr. R. Patel (Chief Warden)", "role": "Warden", "institute_id": "SVNIT", "hostel_block": "Gajjar Bhawan", "floor": "Ground", "room": "Warden Office", "phone": "9876543210", "email": "warden.gajjar@svnit.ac.in", "department": "All"},
    {"user_id": "U26CE011", "password": "123", "full_name": "Ishant Agrawal", "role": "Student", "institute_id": "SVNIT", "hostel_block": "Gajjar Bhawan", "floor": "2nd Floor", "room": "B-204", "phone": "9876543211", "email": "u26ce011@ced.svnit.ac.in", "department": "None"},
    {"user_id": "STAFF_CCC", "password": "123", "full_name": "CCC Network Engineer", "role": "DepartmentStaff", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "9876543213", "email": "helpdesk@ccc.svnit.ac.in", "department": "Wi-Fi & Internet"},
    {"user_id": "STAFF_ELEC", "password": "123", "full_name": "Ramesh Kumar (JE Electrical)", "role": "DepartmentStaff", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "9876543212", "email": "elec@svnit.ac.in", "department": "Electricity"},
    {"user_id": "STAFF_WATER", "password": "123", "full_name": "Suresh Verma (Plumbing)", "role": "DepartmentStaff", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "9876543214", "email": "water@svnit.ac.in", "department": "Water Issue"},
    {"user_id": "STAFF_FURN", "password": "123", "full_name": "Maheshbhai (Civil/Carpentry)", "role": "DepartmentStaff", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "9876543215", "email": "civil@svnit.ac.in", "department": "Furniture"},
    {"user_id": "STAFF_MESS", "password": "123", "full_name": "Mess Coordinator", "role": "DepartmentStaff", "institute_id": "SVNIT", "hostel_block": "Gajjar Bhawan", "floor": "-", "room": "-", "phone": "9876543216", "email": "mess@svnit.ac.in", "department": "Mess Food Quality"},
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
# 3. OFFICIAL OSTICKET API BRIDGE FOR SVNIT CCC
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
# 4. API ENDPOINTS
# ==========================================
class LoginReq(BaseModel):
    user_id: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginReq):
    for u in USERS_DB:
        if u["user_id"].lower() == req.user_id.strip().lower() and u["password"] == req.password.strip():
            tenant = TENANTS.get(u["institute_id"], TENANTS["SVNIT"])
            return {"success": True, "user": u, "tenant": tenant}
    raise HTTPException(status_code=401, detail="Invalid ID or Password")

class ComplaintCreate(BaseModel):
    student_id: str
    category: str
    summary: str
    description: str

@app.post("/api/complaints")
def create_complaint(req: ComplaintCreate):
    student = next((u for u in USERS_DB if u["user_id"] == req.student_id), None)
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
        return [c for c in scoped if c["student_id"] == user_id]
    elif role == "DepartmentStaff":
        return [c for c in scoped if c["category"] == department]
    elif role == "Warden":
        if hostel_block and hostel_block != "All":
            return [c for c in scoped if c["hostel_block"] == hostel_block]
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
            c["staff_remark"] = req.staff_remark.strip() or "Issue resolved by department."
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

class BulkStudent(BaseModel):
    user_id: str
    full_name: str
    hostel_block: str
    floor: str
    room: str
    phone: str
    email: str

@app.post("/api/warden/bulk-upload")
def bulk_upload(institute_id: str, students: List[BulkStudent]):
    added = 0
    for s in students:
        if not any(u["user_id"].lower() == s.user_id.lower() for u in USERS_DB):
            USERS_DB.append({
                "user_id": s.user_id.upper(),
                "password": "123",
                "full_name": s.full_name,
                "role": "Student",
                "institute_id": institute_id,
                "hostel_block": s.hostel_block,
                "floor": s.floor,
                "room": s.room,
                "phone": s.phone,
                "email": s.email,
                "department": "None"
            })
            added += 1
    return {"success": True, "added": added, "total_users": len(USERS_DB)}

@app.get("/api/warden/students")
def get_students(institute_id: str):
    return [u for u in USERS_DB if u["institute_id"] == institute_id and u["role"] == "Student"]

# ==========================================
# 5. SUPER ADMIN (DEAN/CHIEF WARDEN) WARDEN CREATION API
# ==========================================
class WardenCreate(BaseModel):
    user_id: str
    full_name: str
    hostel_block: str
    phone: str
    email: str

@app.post("/api/admin/create-warden")
def create_warden(req: WardenCreate, admin_id: str):
    admin = next((u for u in USERS_DB if u["user_id"] == admin_id), None)
    
    # Only Super Admins (hostel_block == "All") can create wardens
    if not admin or admin["hostel_block"] != "All":
        raise HTTPException(status_code=403, detail="Only Campus Super Admins can create Wardens")

    # Check if Warden ID already exists
    if any(u["user_id"].lower() == req.user_id.lower() for u in USERS_DB):
        raise HTTPException(status_code=400, detail="Warden ID already exists!")

    USERS_DB.append({
        "user_id": req.user_id.upper(),
        "password": "123", # Default password
        "full_name": req.full_name,
        "role": "Warden",
        "institute_id": admin["institute_id"],
        "hostel_block": req.hostel_block,
        "floor": "-",
        "room": "Warden Office",
        "phone": req.phone,
        "email": req.email,
        "department": "All"
    })
    return {"success": True, "message": f"Warden account created for {req.hostel_block}!"}