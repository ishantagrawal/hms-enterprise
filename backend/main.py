from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
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

TENANTS = {
    "SVNIT": {
        "institute_id": "SVNIT",
        "name": "Sardar Vallabhbhai National Institute of Technology, Surat",
        "short_name": "SVNIT Surat",
        "logo_url": "https://upload.wikimedia.org/wikipedia/en/1/1b/NIT_Surat_Logo.svg",
        "hostels": ["Gajjar Bhawan", "Bhabha Bhawan", "Swami Vivekananda Bhawan", "Mother Teresa Bhawan"],
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

USERS_DB = [
    # GLOBAL SAAS FOUNDER (Platform Owner - Sees ALL Colleges & All Complaints)
    {
        "user_id": "FOUNDER", "password": "IshantFounder@2026!",
        "full_name": "Ishant Agrawal (HMS Founder)", "role": "PlatformOwner",
        "authority_title": "HMS Platform Founder", "institute_id": "ALL",
        "hostel_block": "All", "floor": "-", "room": "SaaS HQ",
        "phone": "9876543211", "email": "founder@hms-enterprise.com", "department": "All"
    },
    {
        "user_id": "DEAN01", "password": "SvnitDean@2026!",
        "full_name": "Dr. V. Singh (Dean SW)", "role": "Warden",
        "authority_title": "Dean of Student Welfare", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Dean Office",
        "phone": "9876543222", "email": "dosw@svnit.ac.in", "department": "All"
    },
    {
        "user_id": "W01", "password": "123",
        "full_name": "Dr. R. Patel (Warden)", "role": "Warden",
        "authority_title": "Local Warden", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "Ground", "room": "Office",
        "phone": "9876543210", "email": "warden@svnit.ac.in", "department": "All"
    },
    {
        "user_id": "U26CE011", "password": "123",
        "full_name": "Ishant Agrawal", "role": "Student",
        "authority_title": "Student", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "2nd Floor", "room": "B-204",
        "phone": "9876543211", "email": "u26ce011@ced.svnit.ac.in", "department": "None"
    }
]

COMPLAINTS_DB = [
    {
        "id": 1, "ticket_id": "HMS-48291", "ccc_ticket_id": "CCC-839201", "institute_id": "SVNIT",
        "student_id": "U26CE011", "student_name": "Ishant Agrawal", "phone": "9876543211",
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
    return {"status": "HMS Enterprise Backend Live", "total_tenants": len(TENANTS), "total_users": len(USERS_DB)}

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
    # If user is Platform Founder, return ALL complaints across ALL colleges!
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

class BulkStudent(BaseModel):
    user_id: str
    full_name: str
    hostel_block: str
    floor: str
    room: str
    phone: str
    email: Optional[str] = None

@app.post("/api/warden/bulk-upload")
def bulk_upload(institute_id: str, students: List[BulkStudent]):
    added = 0
    for s in students:
        uid = s.user_id.strip().upper()
        if not any(u["user_id"].lower() == uid.lower() for u in USERS_DB):
            USERS_DB.append({
                "user_id": uid, "password": "123", "full_name": s.full_name.strip(),
                "role": "Student", "authority_title": "Student", "institute_id": institute_id,
                "hostel_block": s.hostel_block.strip(), "floor": s.floor.strip(), "room": s.room.strip(),
                "phone": s.phone.strip(), "email": s.email or f"{uid.lower()}@svnit.ac.in", "department": "None"
            })
            added += 1
    return {"success": True, "added": added}

class OnboardCollegeReq(BaseModel):
    institute_id: str
    institute_name: str
    dean_user_id: str
    dean_name: str
    dean_password: str
    dean_phone: str
    dean_email: str

@app.post("/api/founder/onboard-college")
def onboard_college(req: OnboardCollegeReq, founder_id: str):
    founder = next((u for u in USERS_DB if u["user_id"].lower() == founder_id.strip().lower()), None)
    if not founder or founder.get("role") != "PlatformOwner":
        raise HTTPException(status_code=403, detail="Unauthorized")
    inst_code = req.institute_id.strip().upper()
    dean_uid = req.dean_user_id.strip().upper()
    TENANTS[inst_code] = {
        "institute_id": inst_code, "name": req.institute_name.strip(), "short_name": inst_code,
        "logo_url": "", "hostels": ["Hostel Block A", "Hostel Block B"], "modules": {"complaints": True}
    }
    USERS_DB.append({
        "user_id": dean_uid, "password": req.dean_password.strip(),
        "full_name": f"{req.dean_name.strip()} (Dean SW)", "role": "Warden",
        "authority_title": "Dean of Student Welfare", "institute_id": inst_code,
        "hostel_block": "All", "floor": "-", "room": "Dean Office",
        "phone": req.dean_phone.strip(), "email": req.dean_email.strip(), "department": "All"
    })
    return {"success": True, "message": f"Onboarded {req.institute_name}! Dean login: {dean_uid}"}

@app.get("/api/complaints/export-pdf")
def export_pdf_html(institute_id: str, hostel_block: Optional[str] = "All"):
    scoped = COMPLAINTS_DB if institute_id == "ALL" else [c for c in COMPLAINTS_DB if c["institute_id"] == institute_id]
    html_content = f"""
    <html><head><title>HMS Report</title><style>
    body {{ font-family: system-ui, sans-serif; padding: 20px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }}
    th, td {{ border: 1px solid #cbd5e1; padding: 8px; text-align: left; }}
    th {{ background: #f1f5f9; }}
    </style></head><body>
    <h2>🏛️ HMS Enterprise - Audit Report</h2>
    <p><b>Scope:</b> {institute_id} | <b>Generated:</b> {datetime.datetime.now().strftime('%d %b %Y, %I:%M %p')}</p>
    <table><tr><th>Ticket</th><th>Institute</th><th>Category</th><th>Student</th><th>Summary</th><th>Status</th></tr>
    """
    for c in scoped:
        html_content += f"<tr><td><b>{c['ticket_id']}</b></td><td>{c['institute_id']}</td><td>{c['category']}</td><td>{c['student_name']}</td><td>{c['summary']}</td><td>{c['status']}</td></tr>"
    html_content += "</table><script>window.onload = function() { window.print(); }</script></body></html>"
    return Response(content=html_content, media_type="text/html")