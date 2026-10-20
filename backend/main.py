from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Optional
import random
import datetime

app = FastAPI(title="HMS & UniCore ERP - SVNIT Campus Engine")

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
    {
        "user_id": "DEAN_SW",
        "password": "SvnitDean@2026!",
        "full_name": "Prof. Sanjay R. Patel",
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
    {"user_id": "STAFF_ELEC", "password": "123", "full_name": "Electrical Maintenance Wing", "role": "DepartmentStaff", "authority_title": "Estate Electrical Wing", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "0261-2201111", "email": "elec@svnit.ac.in", "department": "Electricity"},
    {"user_id": "STAFF_WATER", "password": "123", "full_name": "Plumbing & Water Works Wing", "role": "DepartmentStaff", "authority_title": "Estate Water Wing", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "0261-2201112", "email": "water@svnit.ac.in", "department": "Water Issue"},
    {"user_id": "STAFF_FURN", "password": "123", "full_name": "Civil & Carpentry Wing", "role": "DepartmentStaff", "authority_title": "Estate Civil Wing", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "0261-2201113", "email": "civil@svnit.ac.in", "department": "Furniture"},
    {"user_id": "STAFF_MESS", "password": "123", "full_name": "Mess Supervision Committee", "role": "DepartmentStaff", "authority_title": "Mess Committee Wing", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "0261-2201114", "email": "mess@svnit.ac.in", "department": "Mess Food Quality"},
    {"user_id": "STAFF_CCC", "password": "123", "full_name": "Central Computer Center (CCC)", "role": "DepartmentStaff", "authority_title": "CCC Network Wing", "institute_id": "SVNIT", "hostel_block": "All", "floor": "-", "room": "-", "phone": "0261-2201115", "email": "helpdesk@ccc.svnit.ac.in", "department": "Wi-Fi & Internet"},
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
    }
]

# ==========================================
# UNICORE ERP DATA STORES (MOD-01 to MOD-04)
# ==========================================
CLUBS_DB = [
    {
        "club_id": "ACM", "name": "ACM SVNIT Chapter", "mission": "Promoting competitive programming and advanced algorithmic research.",
        "faculty_advisor": "Dr. R. K. Gupta", "head_coordinator": "Aarav Sharma", "members_count": 120
    },
    {
        "club_id": "GDSC", "name": "Google Developer Student Club", "mission": "Building scalable web, mobile, and cloud solutions for social impact.",
        "faculty_advisor": "Dr. D. C. Jinwala", "head_coordinator": "Priya Verma", "members_count": 150
    },
    {
        "club_id": "CHRD", "name": "Creative & Hobby Club (CHRD)", "mission": "Fostering arts, drama, music, and literary culture across SVNIT.",
        "faculty_advisor": "Dr. Alka A. Mungray", "head_coordinator": "Ishant Agrawal", "members_count": 210
    }
]

EVENTS_DB = [
    {
        "event_id": "EVT-101", "club_id": "ACM", "title": "Algothon 2026 - Annual Hackathon",
        "date": "2026-11-15", "start_time": "10:00", "end_time": "18:00", "venue": "CRC Auditorium",
        "status": "Approved", "submitted_by": "Aarav Sharma"
    }
]

FORMS_DB = [
    {
        "form_id": "FORM-01", "club_id": "CHRD", "title": "Core Committee Recruitment 2026",
        "fields": ["SOP Essay", "GitHub / Portfolio Link", "Branch & Year", "Preferred Domain (Design/Tech/Management)"]
    }
]

FEEDBACK_DB = [
    {
        "event_id": "EVT-101", "ratings": [5, 4, 5, 4, 5],
        "reviews": ["Amazing coding environment!", "Snacks could be better.", "Well organized by ACM."]
    }
]

@app.get("/")
def health_check():
    return {"status": "HMS & UniCore ERP Backend Live", "institute": "SVNIT Surat"}

class LoginReq(BaseModel):
    user_id: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginReq):
    uid_input = req.user_id.strip().lower()
    if uid_input == "dean01": uid_input = "dean_sw"
    if uid_input == "w01": uid_input = "w_gajjar"

    for u in USERS_DB:
        if u["user_id"].lower() == uid_input and u["password"] == req.password.strip():
            tenant = TENANTS.get(u["institute_id"], TENANTS["SVNIT"]) if u["institute_id"] != "ALL" else {"name": "HMS Multi-Tenant SaaS Cloud", "institute_id": "ALL"}
            return {"success": True, "user": u, "tenant": tenant}
    raise HTTPException(status_code=401, detail="Invalid Position ID or Password")

@app.get("/api/founder/tenants")
def get_tenants():
    return [{
        "institute_id": "SVNIT", "name": TENANTS["SVNIT"]["name"],
        "hostel_count": len(SVNIT_HOSTELS), "student_count": len([u for u in USERS_DB if u["role"] == "Student"]),
        "dean_id": "DEAN_SW"
    }]

@app.get("/api/complaints")
def get_complaints(institute_id: str, role: str, user_id: str, department: Optional[str] = None, hostel_block: Optional[str] = None):
    if role == "PlatformOwner": return []
    scoped = [c for c in COMPLAINTS_DB if c["institute_id"] == institute_id]
    if role == "Student": return [c for c in scoped if c["student_id"].lower() == user_id.lower()]
    elif role == "DepartmentStaff": return [c for c in scoped if c["category"] == department]
    elif role == "Warden": return [c for c in scoped if c["hostel_block"].lower() == (hostel_block or "").lower()]
    elif role == "Dean": return scoped
    return scoped

class ComplaintCreate(BaseModel):
    student_id: str
    category: str
    summary: str
    description: str

@app.post("/api/complaints")
def create_complaint(req: ComplaintCreate):
    student = next((u for u in USERS_DB if u["user_id"].lower() == req.student_id.strip().lower()), None)
    if not student: raise HTTPException(status_code=404, detail="Student not found")
    new_ticket = {
        "id": len(COMPLAINTS_DB) + 1, "ticket_id": f"HMS-{random.randint(10000, 99999)}",
        "ccc_ticket_id": f"CCC-{random.randint(100000, 999999)}" if req.category == "Wi-Fi & Internet" else None,
        "institute_id": student["institute_id"], "student_id": student["user_id"],
        "student_name": student["full_name"], "phone": student["phone"], "email": student["email"],
        "hostel_block": student["hostel_block"], "floor": student["floor"], "room": student["room"],
        "category": req.category, "routed_to": CATEGORY_ROUTING.get(req.category, "General Maintenance"),
        "summary": req.summary, "description": req.description, "status": "Open", "staff_remark": "",
        "created_date": datetime.date.today().strftime("%Y-%m-%d"),
        "created_at": datetime.datetime.now().strftime("%d %b %Y, %I:%M %p"), "resolved_at": None
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
            c["status"] = "Completed" if req.satisfied else "Reopened"
            if req.satisfied: c["resolved_at"] = datetime.datetime.now().strftime("%d %b %Y, %I:%M %p")
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
                "role": "Student", "authority_title": "Hostel Resident", "institute_id": institute_id,
                "hostel_block": s.hostel_block.strip(), "floor": s.floor.strip(), "room": s.room.strip(),
                "phone": s.phone.strip(), "email": s.email or f"{uid.lower()}@svnit.ac.in", "department": "None"
            })
            added += 1
    return {"success": True, "added": added}

@app.get("/api/warden/students")
def get_hostel_students(institute_id: str, hostel_block: str):
    students = [u for u in USERS_DB if u["institute_id"] == institute_id and u["role"] == "Student"]
    if hostel_block != "All": students = [s for s in students if s["hostel_block"].lower() == hostel_block.lower()]
    return {"count": len(students), "max_capacity": 50000, "students": students[:50]}

class PasswordResetReq(BaseModel):
    target_user_id: str
    new_password: str

@app.post("/api/dean/reset-password")
def reset_position_password(req: PasswordResetReq, admin_id: str):
    admin = next((u for u in USERS_DB if u["user_id"].lower() == admin_id.strip().lower()), None)
    if not admin or admin["role"] not in ["Dean", "PlatformOwner"]: raise HTTPException(status_code=403, detail="Unauthorized")
    target = next((u for u in USERS_DB if u["user_id"].lower() == req.target_user_id.strip().lower()), None)
    if not target: raise HTTPException(status_code=404, detail="Position not found")
    target["password"] = req.new_password.strip()
    return {"success": True, "message": f"Password updated for position {target['user_id']}"}

# ==========================================
# UNICORE ERP API ENDPOINTS (MOD-01 to MOD-04)
# ==========================================
@app.get("/api/unicore/clubs")
def get_clubs():
    return CLUBS_DB

@app.get("/api/unicore/events")
def get_events():
    return EVENTS_DB

class EventRequisitionReq(BaseModel):
    club_id: str
    title: str
    date: str
    start_time: str
    end_time: str
    venue: str
    submitted_by: str

@app.post("/api/unicore/events/propose")
def propose_event(req: EventRequisitionReq):
    # MOD-02: Clash Detection Engine
    for ev in EVENTS_DB:
        if ev["date"] == req.date and ev["venue"].lower() == req.venue.lower() and ev["status"] == "Approved":
            # Check time clash
            if not (req.end_time <= ev["start_time"] or req.start_time >= ev["end_time"]):
                raise HTTPException(status_code=400, detail=f"❌ Venue Clash Detected! {ev['venue']} is already booked by {ev['title']} from {ev['start_time']} to {ev['end_time']}.")
    
    new_evt = {
        "event_id": f"EVT-{random.randint(100, 999)}",
        "club_id": req.club_id,
        "title": req.title,
        "date": req.date,
        "start_time": req.start_time,
        "end_time": req.end_time,
        "venue": req.venue,
        "status": "Pending Dean Approval",
        "submitted_by": req.submitted_by
    }
    EVENTS_DB.append(new_evt)
    return {"success": True, "message": "Event requisition submitted successfully to Associate Dean clash matrix!", "event": new_evt}

@app.post("/api/unicore/events/approve")
def approve_event(event_id: str, action: str): # action: 'Approved' or 'Rejected'
    evt = next((e for e in EVENTS_DB if e["event_id"] == event_id), None)
    if not evt: raise HTTPException(status_code=404, detail="Event not found")
    evt["status"] = action
    return {"success": True, "message": f"Event {event_id} marked as {action}!"}

@app.get("/api/unicore/forms")
def get_forms():
    return FORMS_DB

class FormCreateReq(BaseModel):
    club_id: str
    title: str
    fields: List[str]

@app.post("/api/unicore/forms")
def create_form(req: FormCreateReq):
    new_f = {"form_id": f"FORM-{random.randint(10, 99)}", "club_id": req.club_id, "title": req.title, "fields": req.fields}
    FORMS_DB.append(new_f)
    return {"success": True, "form": new_f}

@app.get("/api/unicore/audit-summary")
def get_ai_audit():
    # MOD-04: AI Feedback Summaries
    return {
        "event_title": "Algothon 2026 - Annual Hackathon",
        "total_attendees": 142,
        "average_rating": 4.6,
        "sentiment": "Overwhelmingly Positive (92% satisfaction)",
        "key_pros": ["Seamless coding infrastructure", "Active faculty mentorship", "Timely refreshments"],
        "key_cons": ["Wi-Fi bandwidth dipped slightly during peak afternoon hours"],
        "recommendation": "Approve future ACM hackathon budget requests with priority."
    }

@app.get("/api/complaints/export-pdf")
def export_pdf_html(institute_id: str, hostel_block: Optional[str] = "All", from_date: Optional[str] = None, to_date: Optional[str] = None):
    scoped = [c for c in COMPLAINTS_DB if c["institute_id"] == institute_id]
    if hostel_block and hostel_block != "All": scoped = [c for c in scoped if c["hostel_block"].lower() == hostel_block.lower()]
    html_content = f"""
    <html><head><title>SVNIT Audit Report</title><style>
    body {{ font-family: system-ui, sans-serif; padding: 24px; color: #0f172a; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }}
    th, td {{ border: 1px solid #cbd5e1; padding: 10px; text-align: left; }}
    th {{ background: #f1f5f9; }}
    </style></head><body>
    <h2>🏛️ SVNIT Surat — Official Institutional ERP & Grievance Audit</h2>
    <p><b>Scope:</b> {hostel_block} | <b>Generated:</b> {datetime.datetime.now().strftime('%d %b %Y, %I:%M %p')}</p>
    <table><tr><th>Ticket ID</th><th>Category</th><th>Student & Room</th><th>Summary</th><th>Status</th></tr>
    """
    for c in scoped:
        html_content += f"<tr><td><b>{c['ticket_id']}</b></td><td>{c['category']}</td><td>{c['student_name']} ({c['hostel_block']}, Rm {c['room']})</td><td>{c['summary']}</td><td><b>{c['status']}</b></td></tr>"
    html_content += "</table><script>window.onload = function() { window.print(); }</script></body></html>"
    return Response(content=html_content, media_type="text/html")
# Update CLUBS_DB in backend/main.py with complete member rosters and positions
CLUBS_DB = [
    {
        "club_id": "ACM", "name": "ACM SVNIT Chapter", "mission": "Promoting competitive programming and advanced algorithmic research.",
        "faculty_advisor": "Dr. R. K. Gupta", "head_coordinator": "Aarav Sharma",
        "members": [
            {"name": "Aarav Sharma", "roll": "U26CS012", "position": "Head Coordinator", "branch": "CSE"},
            {"name": "Ishant Agrawal", "roll": "U26CE011", "position": "Tech Lead", "branch": "Civil"},
            {"name": "Kashish Patel", "roll": "U26EC045", "position": "Event Manager", "branch": "ECE"}
        ]
    },
    {
        "club_id": "GDSC", "name": "Google Developer Student Club", "mission": "Building scalable web, mobile, and cloud solutions for social impact.",
        "faculty_advisor": "Dr. D. C. Jinwala", "head_coordinator": "Priya Verma",
        "members": [
            {"name": "Priya Verma", "roll": "U26IT022", "position": "Lead Organizer", "branch": "IT"},
            {"name": "Yashika Shah", "roll": "U26CS089", "position": "Android Core", "branch": "CSE"}
        ]
    },
    {
        "club_id": "CHRD", "name": "Creative & Hobby Club (CHRD)", "mission": "Fostering arts, drama, music, and literary culture across SVNIT.",
        "faculty_advisor": "Dr. Alka A. Mungray", "head_coordinator": "Ishant Agrawal",
        "members": [
            {"name": "Ishant Agrawal", "roll": "U26CE011", "position": "President", "branch": "Civil"},
            {"name": "Shubhi Agrawal", "roll": "U26EE014", "position": "Design Head", "branch": "Electrical"}
        ]
    }
]

# Add completed events with AI audit mapping in backend/main.py
EVENTS_DB = [
    {
        "event_id": "EVT-101", "club_id": "ACM", "title": "Algothon 2026 - Annual Hackathon",
        "date": "2026-11-15", "start_time": "10:00", "end_time": "18:00", "venue": "CRC Auditorium",
        "status": "Pending Dean Approval", "submitted_by": "Aarav Sharma", "type": "Upcoming"
    },
    {
        "event_id": "EVT-099", "club_id": "CHRD", "README": "Completed Event with AI Audit", "title": "Sparsh Cultural Night 2026",
        "date": "2026-03-10", "start_time": "18:00", "end_time": "22:00", "venue": "SAC Amphitheatre",
        "status": "Completed", "submitted_by": "Ishant Agrawal", "type": "Completed",
        "ai_audit": {
            "total_attendees": 1200,
            "average_rating": 4.8,
            "sentiment": "Extremely Positive (95% satisfaction)",
            "key_pros": ["Outstanding stage lighting and sound", "Flawless crowd management by volunteers", "Punctual timeline execution"],
            "key_cons": ["Seating capacity fell short for late attendees"],
            "recommendation": "Grant annual cultural fest priority funding."
        }
    }
]
class EventRsvpReq(BaseModel):
    event_id: str
    student_id: str

@app.post("/api/unicore/events/rsvp")
def rsvp_event(req: EventRsvpReq):
    for ev in EVENTS_DB:
        if ev["event_id"] == req.event_id:
            if "rsvps" not in ev: ev["rsvps"] = []
            if req.student_id not in ev["rsvps"]:
                ev["rsvps"].append(req.student_id)
            return {"success": True, "message": "RSVP recorded successfully! Seat reserved."}
    raise HTTPException(status_code=404, detail="Event not found")

class EventFeedbackReq(BaseModel):
    event_id: str
    student_id: str
    rating: int
    review: str

@app.post("/api/unicore/events/feedback")
def submit_event_feedback(req: EventFeedbackReq):
    for ev in EVENTS_DB:
        if ev["event_id"] == req.event_id:
            if "feedbacks" not in ev: ev["feedbacks"] = []
            ev["feedbacks"].append({"student_id": req.student_id, "rating": req.rating, "review": req.review})
            return {"success": True, "message": "Feedback submitted to AI audit engine successfully!"}
    raise HTTPException(status_code=404, detail="Event not found")