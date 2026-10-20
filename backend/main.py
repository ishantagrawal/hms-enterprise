from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Optional
import random
import datetime

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
        "user_id": "U26CE011", "password": "123",
        "full_name": "Ishant Agrawal", "role": "Student",
        "authority_title": "Student", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "2nd Floor", "room": "B-204",
        "phone": "9876543213", "email": "u26ce011@ced.svnit.ac.in", "department": "None"
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

@app.get("/api/complaints/export-pdf")
def export_pdf_html(institute_id: str, hostel_block: Optional[str] = "All"):
    scoped = COMPLAINTS_DB if institute_id == "ALL" else [c for c in COMPLAINTS_DB if c["institute_id"] == institute_id]
    if hostel_block and hostel_block != "All":
        scoped = [c for c in scoped if c["hostel_block"].lower() == hostel_block.lower()]
    
    html_content = f"""
    <html><head><title>SVNIT Grievance Report</title><style>
    body {{ font-family: system-ui, sans-serif; padding: 24px; color: #1e293b; }}
    h2 {{ color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }}
    th, td {{ border: 1px solid #cbd5e1; padding: 10px; text-align: left; }}
    th {{ background: #f8fafc; font-weight: bold; }}
    </style></head><body>
    <h2>🏛️ SVNIT Surat - Official Grievance Audit Report</h2>
    <p><b>Hostel Scope:</b> {hostel_block} | <b>Generated on:</b> {datetime.datetime.now().strftime('%d %b %Y, %I:%M %p')}</p>
    <table><tr><th>Ticket ID</th><th>Category</th><th>Student & Room</th><th>Issue Summary</th><th>Status</th><th>Date</th></tr>
    """
    for c in scoped:
        html_content += f"<tr><td><b>{c['ticket_id']}</b></td><td>{c['category']}</td><td>{c['student_name']}<br/>{c['hostel_block']}, Rm {c['room']}</td><td>{c['summary']}</td><td><b>{c['status']}</b></td><td>{c['created_at']}</td></tr>"
    html_content += "</table><script>window.onload = function() { window.print(); }</script></body></html>"
    return Response(content=html_content, media_type="text/html")