from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Optional
import random
import datetime

app = FastAPI(title="HMS Enterprise - Position-Based Multi-Tenant Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SVNIT_HOSTELS = [
    {"code": "GAJJAR", "name": "Gajjar Bhawan", "ext": "0261-2201659", "email": "cw1_gajjar@svnit.ac.in"},
    {"code": "BHABHA", "name": "Bhabha Bhawan", "ext": "0261-2201790", "email": "cw1_bhabha@svnit.ac.in"},
    {"code": "MTB", "name": "Mother Teresa Bhawan", "ext": "0261-2201967", "email": "cw1_mtb@svnit.ac.in"},
    {"code": "SVB", "name": "Swami Vivekananda Bhawan", "ext": "0261-2201657", "email": "cw1_svb@svnit.ac.in"},
    {"code": "NEHRU", "name": "Nehru Bhawan", "ext": "0261-2201703", "email": "cw1_nehru@svnit.ac.in"},
    {"code": "TAGORE", "name": "Tagore Bhawan", "ext": "0261-2201707", "email": "cw1_tagore@svnit.ac.in"},
    {"code": "SARABHAI", "name": "Sarabhai Bhawan", "ext": "0261-2201793", "email": "cw1_sarabhai@svnit.ac.in"},
    {"code": "RAMAN", "name": "Raman Bhawan", "ext": "0261-2201789", "email": "cw1_raman@svnit.ac.in"},
    {"code": "ABVB", "name": "Atal Bihari Vajpayee Bhawan", "ext": "0261-2201880", "email": "jtc@amd.svnit.ac.in"},
    {"code": "NARMAD", "name": "Narmad Bhawan (Guest House)", "ext": "0261-2201652", "email": "cw1_narmad@svnit.ac.in"}
]

TENANTS = {
    "SVNIT": {
        "institute_id": "SVNIT",
        "name": "Sardar Vallabhbhai National Institute of Technology, Surat",
        "short_name": "SVNIT Surat",
        "logo_url": "https://upload.wikimedia.org/wikipedia/en/1/1b/NIT_Surat_Logo.svg",
        "hostels": [h["name"] for h in SVNIT_HOSTELS],
        "hostel_details": SVNIT_HOSTELS
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
    # 1. PLATFORM FOUNDER (GLOBAL SAAS ROOT)
    {
        "user_id": "FOUNDER",
        "password": "IshantFounder@2026!",
        "full_name": "HMS SaaS Founder Portal",
        "role": "PlatformOwner",
        "authority_title": "Platform Founder",
        "institute_id": "ALL",
        "hostel_block": "All",
        "floor": "-",
        "room": "Cloud HQ",
        "phone": "9876543211",
        "email": "founder@hms-enterprise.com",
        "department": "All"
    },
    # 2. CAMPUS DEAN PORTALS (CAMPUS-WIDE ACCESS)
    {
        "user_id": "DEAN_SW",
        "password": "SvnitDean@2026!",
        "full_name": "Office of the Dean (Student Welfare)",
        "role": "Dean",
        "authority_title": "Dean (Students Welfare)",
        "institute_id": "SVNIT",
        "hostel_block": "All",
        "floor": "-",
        "room": "Dean SW Office",
        "phone": "0261-2201528",
        "email": "deansw@svnit.ac.in",
        "department": "All"
    },
    {
        "user_id": "ADEAN_SW",
        "password": "SvnitDean@2026!",
        "full_name": "Office of the Associate Dean (SW)",
        "role": "Dean",
        "authority_title": "Associate Dean (SW)",
        "institute_id": "SVNIT",
        "hostel_block": "All",
        "floor": "-",
        "room": "CoW Office",
        "phone": "0261-2201527",
        "email": "adean_sw@svnit.ac.in",
        "department": "All"
    },
    # 3. 5 SPECIALIZED MAINTENANCE DEPARTMENT PORTALS
    {"user_id": "STAFF_ELEC", "password": "123", "full_name": "Electrical Maintenance Wing", "role": "DepartmentStaff", "authority_title": "Estate Electrical Wing", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "0261-2201111", "email": "elec@svnit.ac.in", "department": "Electricity"},
    {"user_id": "STAFF_WATER", "password": "123", "full_name": "Plumbing & Water Works Wing", "role": "DepartmentStaff", "authority_title": "Estate Water Wing", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "0261-2201112", "email": "water@svnit.ac.in", "department": "Water Issue"},
    {"user_id": "STAFF_FURN", "password": "123", "full_name": "Civil & Carpentry Wing", "role": "DepartmentStaff", "authority_title": "Estate Civil Wing", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "0261-2201113", "email": "civil@svnit.ac.in", "department": "Furniture"},
    {"user_id": "STAFF_MESS", "password": "123", "full_name": "Mess Supervision Committee", "role": "DepartmentStaff", "authority_title": "Mess Committee Wing", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "0261-2201114", "email": "mess@svnit.ac.in", "department": "Mess Food Quality"},
    {"user_id": "STAFF_CCC", "password": "123", "full_name": "Central Computer Center (CCC)", "role": "DepartmentStaff", "authority_title": "CCC Network Wing", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "0261-2201115", "email": "helpdesk@ccc.svnit.ac.in", "department": "Wi-Fi & Internet"},
    # 4. SAMPLE STUDENT
    {
        "user_id": "U26CE011",
        "password": "123",
        "full_name": "Ishant Agrawal",
        "role": "Student",
        "authority_title": "Hostel Resident",
        "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan",
        "floor": "2nd Floor",
        "room": "B-204",
        "phone": "9876543213",
        "email": "u26ce011@ced.svnit.ac.in",
        "department": "None"
    }
]

# Auto-generate Position-Based Chief Warden (CW_*) and Warden (W_*) accounts for all 10 SVNIT Hostels
for h in SVNIT_HOSTELS:
    USERS_DB.append({
        "user_id": f"CW_{h['code']}",
        "password": "123",
        "full_name": f"Chief Warden Office — {h['name']}",
        "role": "Warden",
        "authority_title": f"Chief Warden ({h['name']})",
        "institute_id": "SVNIT",
        "hostel_block": h["name"],
        "floor": "Ground",
        "room": "Chief Warden Office",
        "phone": h["ext"],
        "email": h["email"],
        "department": "All"
    })
    USERS_DB.append({
        "user_id": f"W_{h['code']}",
        "password": "123",
        "full_name": f"Warden Portal — {h['name']}",
        "role": "Warden",
        "authority_title": f"Warden ({h['name']})",
        "institute_id": "SVNIT",
        "hostel_block": h["name"],
        "floor": "Ground",
        "room": "Hostel Office",
        "phone": h["ext"],
        "email": f"warden_{h['code'].lower()}@svnit.ac.in",
        "department": "All"
    })

COMPLAINTS_DB = [
    {
        "id": 1,
        "ticket_id": "HMS-48291",
        "ccc_ticket_id": "CCC-839201",
        "institute_id": "SVNIT",
        "student_id": "U26CE011",
        "student_name": "Ishant Agrawal",
        "phone": "9876543213",
        "email": "u26ce011@ced.svnit.ac.in",
        "hostel_block": "Gajjar Bhawan",
        "floor": "2nd Floor",
        "room": "B-204",
        "category": "Wi-Fi & Internet",
        "routed_to": "Central Computer Center (CCC)",
        "summary": "LAN port not working in Room B-204",
        "description": "Ethernet cable connected but showing unidentified network since morning.",
        "status": "Awaiting Confirmation",
        "staff_remark": "Reset VLAN switch port from CCC server room. Please verify.",
        "created_date": datetime.date.today().strftime("%Y-%m-%d"),
        "created_at": datetime.datetime.now().strftime("%d %b %Y, %I:%M %p"),
        "resolved_at": None
    },
    {
        "id": 2,
        "ticket_id": "HMS-19402",
        "ccc_ticket_id": None,
        "institute_id": "SVNIT",
        "student_id": "U26CE011",
        "student_name": "Ishant Agrawal",
        "phone": "9876543213",
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
        "created_date": datetime.date.today().strftime("%Y-%m-%d"),
        "created_at": datetime.datetime.now().strftime("%d %b %Y, %I:%M %p"),
        "resolved_at": None
    }
]

@app.get("/")
def health_check():
    students = [u for u in USERS_DB if u["role"] == "Student"]
    return {
        "status": "HMS Enterprise Position-Based Backend Live",
        "total_tenants": len(TENANTS),
        "active_students": len(students),
        "max_student_capacity": "50,000+"
    }

class LoginReq(BaseModel):
    user_id: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginReq):
    uid_input = req.user_id.strip().lower()
    # Backward compatibility alias: allow DEAN01 to login as DEAN_SW
    if uid_input == "dean01":
        uid_input = "dean_sw"
    if uid_input == "w01":
        uid_input = "w_gajjar"

    for u in USERS_DB:
        if u["user_id"].lower() == uid_input and u["password"] == req.password.strip():
            tenant = TENANTS.get(u["institute_id"], TENANTS["SVNIT"]) if u["institute_id"] != "ALL" else {
                "name": "HMS Enterprise Multi-Tenant SaaS Cloud",
                "institute_id": "ALL"
            }
            return {"success": True, "user": u, "tenant": tenant}
    raise HTTPException(status_code=401, detail="Invalid Position ID or Password")

@app.get("/api/founder/tenants")
def get_tenants():
    result = []
    for code, t in TENANTS.items():
        student_cnt = len([u for u in USERS_DB if u["institute_id"] == code and u["role"] == "Student"])
        dean_user = next((u for u in USERS_DB if u["institute_id"] == code and u["role"] == "Dean"), None)
        result.append({
            "institute_id": code,
            "name": t["name"],
            "hostel_count": len(t.get("hostels", [])),
            "student_count": student_cnt,
            "dean_id": dean_user["user_id"] if dean_user else "DEAN_SW"
        })
    return result

class OnboardCollegeReq(BaseModel):
    institute_id: str
    institute_name: str
    dean_user_id: str
    dean_password: str
    dean_phone: str
    dean_email: str

@app.post("/api/founder/onboard-college")
def onboard_college(req: OnboardCollegeReq, founder_id: str):
    if founder_id.strip().upper() != "FOUNDER":
        raise HTTPException(status_code=403, detail="Only Platform Founder can onboard new colleges")
    inst_code = req.institute_id.strip().upper()
    dean_uid = req.dean_user_id.strip().upper()
    if any(u["user_id"].lower() == dean_uid.lower() for u in USERS_DB):
        raise HTTPException(status_code=400, detail=f"User ID {dean_uid} already exists!")

    TENANTS[inst_code] = {
        "institute_id": inst_code,
        "name": req.institute_name.strip(),
        "short_name": inst_code,
        "logo_url": "",
        "hostels": ["Hostel Block A", "Hostel Block B"],
        "hostel_details": [
            {"code": f"{inst_code}_A", "name": "Hostel Block A", "ext": req.dean_phone, "email": req.dean_email},
            {"code": f"{inst_code}_B", "name": "Hostel Block B", "ext": req.dean_phone, "email": req.dean_email}
        ]
    }
    USERS_DB.append({
        "user_id": dean_uid,
        "password": req.dean_password.strip(),
        "full_name": f"Office of the Dean SW ({inst_code})",
        "role": "Dean",
        "authority_title": "Dean (Students Welfare)",
        "institute_id": inst_code,
        "hostel_block": "All",
        "floor": "-",
        "room": "Dean Office",
        "phone": req.dean_phone.strip(),
        "email": req.dean_email.strip(),
        "department": "All"
    })
    return {"success": True, "message": f"Onboarded {req.institute_name}! Master Dean Portal: {dean_uid}"}

@app.get("/api/complaints")
def get_complaints(institute_id: str, role: str, user_id: str, department: Optional[str] = None, hostel_block: Optional[str] = None):
    if role == "PlatformOwner":
        return []
    scoped = [c for c in COMPLAINTS_DB if c["institute_id"] == institute_id]
    if role == "Student":
        return [c for c in scoped if c["student_id"].lower() == user_id.lower()]
    elif role == "DepartmentStaff":
        return [c for c in scoped if c["category"] == department]
    elif role == "Warden":
        # Strictly return ONLY their assigned hostel's complaints!
        return [c for c in scoped if c["hostel_block"].lower() == (hostel_block or "").lower()]
    elif role == "Dean":
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
        "created_date": datetime.date.today().strftime("%Y-%m-%d"),
        "created_at": datetime.datetime.now().strftime("%d %b %Y, %I:%M %p"),
        "resolved_at": None
    }
    COMPLAINTS_DB.insert(0, new_ticket)
    return {"success": True, "ticket": new_ticket}

class StaffResolveReq(BaseModel):
    ticket_id: str
    staff_remark: Optional[str] = "Issue resolved by department team."

@app.post("/api/complaints/staff-resolve")
def staff_resolve(req: StaffResolveReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            c["status"] = "Awaiting Confirmation"
            c["staff_remark"] = (req.staff_remark or "").strip() or "Resolved by maintenance wing."
            return {"success": True}
    raise HTTPException(status_code=404, detail="Ticket not found")

class StudentVerifyReq(BaseModel):
    ticket_id: str
    satisfied: bool

@app.post("/api/complaints/student-verify")
def student_verify(req: StudentVerifyReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            if req.satisfied:
                c["status"] = "Completed"
                c["resolved_at"] = datetime.datetime.now().strftime("%d %b %Y, %I:%M %p")
            else:
                c["status"] = "Reopened"
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
                "user_id": uid,
                "password": "123",
                "full_name": s.full_name.strip(),
                "role": "Student",
                "authority_title": "Hostel Resident",
                "institute_id": institute_id,
                "hostel_block": s.hostel_block.strip(),
                "floor": s.floor.strip(),
                "room": s.room.strip(),
                "phone": s.phone.strip(),
                "email": s.email or f"{uid.lower()}@svnit.ac.in",
                "department": "None"
            })
            added += 1
    return {"success": True, "added": added}

@app.get("/api/warden/students")
def get_hostel_students(institute_id: str, hostel_block: str):
    students = [u for u in USERS_DB if u["institute_id"] == institute_id and u["role"] == "Student"]
    if hostel_block != "All":
        students = [s for s in students if s["hostel_block"].lower() == hostel_block.lower()]
    return {"count": len(students), "max_capacity": 50000, "students": students[:50]}

class PasswordResetReq(BaseModel):
    target_user_id: str
    new_password: str

@app.post("/api/dean/reset-password")
def reset_position_password(req: PasswordResetReq, admin_id: str):
    admin = next((u for u in USERS_DB if u["user_id"].lower() == admin_id.strip().lower()), None)
    if not admin or admin["role"] not in ["Dean", "PlatformOwner"]:
        raise HTTPException(status_code=403, detail="Only Dean can reset position passwords")
    target = next((u for u in USERS_DB if u["user_id"].lower() == req.target_user_id.strip().lower()), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Position ID {req.target_user_id} not found")
    target["password"] = req.new_password.strip()
    return {"success": True, "message": f"Password updated for position {target['user_id']} ({target['authority_title']})"}

@app.get("/api/complaints/export-pdf")
def export_pdf_html(
    institute_id: str,
    hostel_block: Optional[str] = "All",
    from_date: Optional[str] = None,
    to_date: Optional[str] = None
):
    scoped = [c for c in COMPLAINTS_DB if c["institute_id"] == institute_id]
    if hostel_block and hostel_block != "All":
        scoped = [c for c in scoped if c["hostel_block"].lower() == hostel_block.lower()]
    if from_date:
        scoped = [c for c in scoped if c.get("created_date", "2026-10-20") >= from_date]
    if to_date:
        scoped = [c for c in scoped if c.get("created_date", "2026-10-20") <= to_date]

    date_label = f"{from_date or 'Start'} to {to_date or 'Today'}"
    html_content = f"""
    <html><head><title>SVNIT Official Grievance Report</title><style>
    body {{ font-family: system-ui, -apple-system, sans-serif; padding: 28px; color: #0f172a; }}
    .header {{ border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }}
    h2 {{ margin: 0; color: #1e3a8a; font-size: 20px; }}
    p {{ margin: 4px 0 0 0; font-size: 12px; color: #475569; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }}
    th, td {{ border: 1px solid #cbd5e1; padding: 10px; text-align: left; }}
    th {{ background: #f1f5f9; font-weight: 700; text-transform: uppercase; font-size: 11px; }}
    .print-btn {{ background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; }}
    @media print {{ .no-print {{ display: none; }} }}
    </style></head><body>
    <div class="header">
        <div>
            <h2>Sardar Vallabhbhai National Institute of Technology, Surat</h2>
            <p><b>Official Hostel Grievance Audit</b> | Scope: <b>{hostel_block}</b> | Date Filter: <b>{date_label}</b></p>
        </div>
        <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    </div>
    <table>
        <tr><th>Ticket ID</th><th>Date</th><th>Category & Wing</th><th>Student & Room</th><th>Grievance Summary</th><th>Status</th></tr>
    """
    if not scoped:
        html_content += '<tr><td colspan="6" style="text-align:center; padding: 20px;">No complaints recorded in this date range.</td></tr>'
    for c in scoped:
        html_content += f"""
        <tr>
            <td><b>{c['ticket_id']}</b></td>
            <td>{c['created_at']}</td>
            <td><b>{c['category']}</b><br/><span style="color:#64748b;font-size:11px;">{c['routed_to']}</span></td>
            <td>{c['student_name']} ({c['student_id']})<br/><b>{c['hostel_block']} • Rm {c['room']}</b></td>
            <td><b>{c['summary']}</b><br/>{c['description']}</td>
            <td><b>{c['status']}</b></td>
        </tr>
        """
    html_content += "</table><script>window.onload = function() { setTimeout(function(){ window.print(); }, 300); }</script></body></html>"
    return Response(content=html_content, media_type="text/html")