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
        "hostels": [
            "Gajjar Bhawan", "Bhabha Bhawan", "Swami Vivekananda Bhawan",
            "Mother Teresa Bhawan", "Tagore Bhawan", "Nehru Bhawan"
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

USERS_DB = [
    {
        "user_id": "FOUNDER", "password": "IshantFounder@2026!",
        "full_name": "Ishant Agrawal (HMS Founder)", "role": "Warden",
        "authority_title": "HMS Platform Founder", "institute_id": "SVNIT",
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
    },
    {
        "user_id": "STAFF_ELEC", "password": "123",
        "full_name": "Ramesh Kumar (JE Electrical)", "role": "DepartmentStaff",
        "authority_title": "Department Staff", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "-",
        "phone": "9876543212", "email": "elec@svnit.ac.in", "department": "Electricity"
    },
    {
        "user_id": "STAFF_CCC", "password": "123",
        "full_name": "CCC Network Engineer", "role": "DepartmentStaff",
        "authority_title": "Department Staff", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "-",
        "phone": "9876543213", "email": "helpdesk@ccc.svnit.ac.in", "department": "Wi-Fi & Internet"
    }
]

COMPLAINTS_DB = [
    {
        "id": 1, "ticket_id": "HMS-48291", "ccc_ticket_id": "CCC-839201", "institute_id": "SVNIT",
        "student_id": "U26CE011", "student_name": "Ishant Agrawal", "phone": "9876543211",
        "email": "u26ce011@ced.svnit.ac.in", "hostel_block": "Gajjar Bhawan", "floor": "2nd Floor",
        "room": "B-204", "category": "Wi-Fi & Internet", "routed_to": "Central Computer Center (CCC)",
        "summary": "LAN port not working in Room B-204",
        "description": "Ethernet cable connected but showing unidentified network since morning.",
        "status": "Awaiting Confirmation", "staff_remark": "Reset VLAN switch port. Check now.",
        "created_at": "19 Oct 2026, 10:15 AM", "resolved_at": None
    }
]

@app.get("/")
def health_check():
    student_count = len([u for u in USERS_DB if u["role"] == "Student"])
    return {
        "status": "HMS Enterprise Backend Live",
        "total_users": len(USERS_DB),
        "active_students": student_count,
        "onboarding_capacity": "50,000+ Students (Scalable in-memory & DB ready)"
    }

class LoginReq(BaseModel):
    user_id: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginReq):
    for u in USERS_DB:
        if u["user_id"].lower() == req.user_id.strip().lower() and u["password"] == req.password.strip():
            return {"success": True, "user": u, "tenant": TENANTS["SVNIT"]}
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
    staff_remark: Optional[str] = "Resolved."

@app.post("/api/complaints/staff-resolve")
def staff_resolve(req: StaffResolveReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            c["status"] = "Awaiting Confirmation"
            c["staff_remark"] = req.staff_remark
            return {"success": True}
    raise HTTPException(status_code=404, detail="Ticket not found")

class StudentVerifyReq(BaseModel):
    ticket_id: str
    satisfied: bool

@app.post("/api/complaints/student-verify")
def student_verify(req: StudentVerifyReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            c["status"] = "Completed" if req.satisfied else "Reopened"
            if req.satisfied:
                c["resolved_at"] = datetime.datetime.now().strftime("%d %b %Y, %I:%M %p")
            return {"success": True}
    raise HTTPException(status_code=404, detail="Ticket not found")

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
    return {"success": True, "added": added, "total_students_capacity": "50,000+"}

@app.get("/api/warden/students/count")
def get_student_count(institute_id: str):
    students = [u for u in USERS_DB if u["institute_id"] == institute_id and u["role"] == "Student"]
    return {"active_count": len(students), "max_capacity": 50000}

# ==========================================
# PRINT & PDF EXPORT ENDPOINT
# ==========================================
@app.get("/api/complaints/export-pdf")
def export_pdf_html(institute_id: str, hostel_block: Optional[str] = "All"):
    scoped = [c for c in COMPLAINTS_DB if c["institute_id"] == institute_id]
    if hostel_block and hostel_block != "All":
        scoped = [c for c in scoped if c["hostel_block"].lower() == hostel_block.lower()]
    
    html_content = f"""
    <html>
    <head>
        <title>HMS Grievance Report</title>
        <style>
            body {{ font-family: Arial, sans-serif; padding: 20px; color: #333; }}
            h2 {{ color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 5px; }}
            table {{ width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }}
            th, td {{ border: 1px solid #cbd5e1; padding: 8px; text-align: left; }}
            th {{ background: #f1f5f9; }}
            .badge {{ font-weight: bold; }}
        </style>
    </head>
    <body>
        <h2>🏛️ HMS Enterprise - Official Grievance Audit Report</h2>
        <p><b>Institute:</b> {institute_id} | <b>Hostel Scope:</b> {hostel_block} | <b>Generated:</b> {datetime.datetime.now().strftime('%d %b %Y, %I:%M %p')}</p>
        <table>
            <tr>
                <th>Ticket ID</th>
                <th>Category</th>
                <th>Student & Room</th>
                <th>Issue Summary</th>
                <th>Status</th>
                <th>Date</th>
            </tr>
    """
    for c in scoped:
        html_content += f"""
            <tr>
                <td><b>{c['ticket_id']}</b></td>
                <td>{c['category']}</td>
                <td>{c['student_name']}<br/>{c['hostel_block']}, Rm {c['room']}</td>
                <td>{c['summary']}</td>
                <td><span class="badge">{c['status']}</span></td>
                <td>{c['created_at']}</td>
            </tr>
        """
    html_content += """
        </table>
        <script>window.onload = function() {{ window.print(); }}</script>
    </body>
    </html>
    """
    return Response(content=html_content, media_type="text/html")