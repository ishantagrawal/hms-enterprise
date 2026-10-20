from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Optional
import random
import datetime
import requests
import re

app = FastAPI(title="HMS Enterprise - SVNIT Campus Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TENANTS = {
    "SVNIT": {
        "institute_id": "SVNIT",
        "name": "Sardar Vallabhbhai National Institute of Technology, Surat",
        "short_name": "SVNIT Surat",
        "logo_url": "https://upload.wikimedia.org/wikipedia/en/1/1b/NIT_Surat_Logo.svg",
        "hostels": [
            "Bhabha Bhawan", "Gajjar Bhawan", "Mother Teresa Bhawan",
            "Narmad Bhawan (Guest House)", "Nehru Bhawan", "Raman Bhawan",
            "Sarabhai Bhawan", "Swami Vivekananda Bhawan", "Tagore Bhawan", "Atal Bihari Vajpayee Bhawan"
        ],
        "modules": {"complaints": True}
    }
}

CATEGORY_ROUTING = {
    "Electricity": "Electrical Wing (Estate Dept)",
    "Mess Food Quality": "Mess Supervision Committee",
    "Water Issue": "Plumbing & Water Works",
    "Furniture": "Civil & Carpentry Wing",
    "Wi-Fi & Internet": "Central Computer Center (CCC)"
}

# Official SVNIT Council of Wardens Database
USERS_DB = [
    {
        "user_id": "FOUNDER", "password": "IshantFounder@2026!",
        "full_name": "Ishant Agrawal (HMS Founder)", "role": "PlatformOwner",
        "authority_title": "HMS Platform Founder", "institute_id": "ALL",
        "hostel_block": "All", "floor": "-", "room": "SaaS HQ",
        "phone": "9876543211", "email": "founder@hms-enterprise.com", "department": "All"
    },
    {
        "user_id": "DEAN01", "password": "SvnitDean@2026!",
        "full_name": "Prof. Sanjay R. Patel", "role": "Warden",
        "authority_title": "Dean of Student Welfare", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Dean Office",
        "phone": "0261-2201528", "email": "deansw@svnit.ac.in", "department": "All"
    },
    {
        "user_id": "CW_BHABHA", "password": "123",
        "full_name": "Dr. Vikram P. Rathod", "role": "Warden",
        "authority_title": "Chief Warden", "institute_id": "SVNIT",
        "hostel_block": "Bhabha Bhawan", "floor": "Ground", "room": "Office",
        "phone": "9876543210", "email": "cw1_bhabha@svnit.ac.in", "department": "All"
    },
    {
        "user_id": "CW_GAJJAR", "password": "123",
        "full_name": "Dr. Jogender Singh", "role": "Warden",
        "authority_title": "Chief Warden", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "Ground", "room": "Office",
        "phone": "9876543211", "email": "cw1_gajjar@svnit.ac.in", "department": "All"
    },
    {
        "user_id": "CW_MTB", "password": "123",
        "full_name": "Dr. Premlata Kumari", "role": "Warden",
        "authority_title": "Chief Warden", "institute_id": "SVNIT",
        "hostel_block": "Mother Teresa Bhawan", "floor": "Ground", "room": "Office",
        "phone": "9876543212", "email": "cw1_mtb@svnit.ac.in", "department": "All"
    },
    {
        "user_id": "U26CE011", "password": "123",
        "full_name": "Ishant Agrawal", "role": "Student",
        "authority_title": "Student", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "2nd Floor", "room": "B-204",
        "phone": "9876543213", "email": "u26ce011@ced.svnit.ac.in", "department": "None"
    },
    {
        "user_id": "STAFF_ELEC", "password": "123",
        "full_name": "Ramesh Kumar (JE Electrical)", "role": "DepartmentStaff",
        "authority_title": "Department Staff", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "-",
        "phone": "9876543214", "email": "elec@svnit.ac.in", "department": "Electricity"
    }
]

COMPLAINTS_DB = [
    {
        "id": 1, "ticket_id": "HMS-48291", "ccc_ticket_id": "CCC-839201", "institute_id": "SVNIT",
        "student_id": "U26CE011", "student_name": "Ishant Agrawal", "phone": "9876543213",
        "email": "u26ce011@ced.svnit.ac.in", "hostel_block": "Gajjar Bhawan", "floor": "2nd Floor",
        "room": "B-204", "category": "Wi-Fi & Internet", "routed_to": "Central Computer Center (CCC)",
        "summary": "LAN port not working in Room B-204",
        "description": "Ethernet cable connected but showing unidentified network.",
        "status": "Awaiting Confirmation", "staff_remark": "Reset VLAN switch port. Check now.",
        "created_at": "19 Oct 2026, 10:15 AM", "resolved_at": None
    }
]

@app.get("/")
def health_check():
    return {"status": "SVNIT HMS Backend Live", "total_users": len(USERS_DB)}

class LoginReq(BaseModel):
    user_id: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginReq):
    for u in USERS_DB:
        if u["user_id"].lower() == req.user_id.strip().lower() and u["password"] == req.password.strip():
            tenant = TENANTS.get(u["institute_id"], TENANTS["SVNIT"]) if u["institute_id"] != "ALL" else {"name": "HMS Multi-Tenant Cloud HQ", "institute_id": "ALL"}
            return {"success": True, "user": u, "tenant": tenant}
    raise HTTPException(status_code=401, detail="Invalid User ID or Password")

@app.get("/api/complaints")
def get_complaints(institute_id: str, role: str, user_id: str, department: Optional[str] = None, hostel_block: Optional[str] = None):
    if role == "PlatformOwner" or user_id.upper() == "FOUNDER":
        return COMPLAINTS_DB
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
    new_ticket = {
        "id": len(COMPLAINTS_DB) + 1,
        "ticket_id": f"HMS-{random.randint(10000, 99999)}",
        "ccc_ticket_id": f"CCC-{random.randint(100000, 999999)}" if req.category == "Wi-Fi & Internet" else None,
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
    return {"success": True, "ticket": new_ticket}

# ==========================================
# WARDEN DYNAMIC UPDATE API FOR DEAN
# ==========================================
class WardenUpdateReq(BaseModel):
    user_id: str
    full_name: str
    hostel_block: str
    phone: str
    email: str
    authority_title: str # 'Chief Warden' or 'Local Warden'

@app.post("/api/admin/update-warden")
def update_warden(req: WardenUpdateReq, admin_id: str):
    admin = next((u for u in USERS_DB if u["user_id"].lower() == admin_id.strip().lower()), None)
    if not admin or admin["hostel_block"] != "All":
        raise HTTPException(status_code=403, detail="Only Dean / Super Admin can update wardens")
    
    existing = next((u for u in USERS_DB if u["user_id"].lower() == req.user_id.strip().lower()), None)
    if existing:
        existing["full_name"] = req.full_name
        existing["hostel_block"] = req.hostel_block
        existing["phone"] = req.phone
        existing["email"] = req.email
        existing["authority_title"] = req.authority_title
        return {"success": True, "message": f"Updated warden {req.user_id} successfully!"}
    else:
        USERS_DB.append({
            "user_id": req.user_id.upper(), "password": "123",
            "full_name": req.full_name, "role": "Warden",
            "authority_title": req.authority_title, "institute_id": "SVNIT",
            "hostel_block": req.hostel_block, "floor": "-", "room": "Office",
            "phone": req.phone, "email": req.email, "department": "All"
        })
        return {"success": True, "message": f"Added new warden {req.user_id.upper()} successfully!"}

@app.get("/api/admin/wardens")
def get_wardens(institute_id: str):
    return [u for u in USERS_DB if u["institute_id"] == institute_id and u["role"] == "Warden" and u["user_id"] != "DEAN01"]