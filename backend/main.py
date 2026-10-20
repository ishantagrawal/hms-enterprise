from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime
import random

app = FastAPI(title="SVNIT HMS & Multi-NIT Campus API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# 1. MULTI-NIT TENANT CONFIGURATION (FOUNDER CONTROL)
# =========================================================
NIT_TENANTS_DB = [
    {
        "institute_id": "SVNIT",
        "name": "Sardar Vallabhbhai National Institute of Technology (Surat)",
        "city": "Surat, Gujarat",
        "modules": {
            "complaints": True,
            "eventradar": True,
            "attendance": True,
            "leave_pass": True,
            "clubs_hub": True,
            "ai_audit": True
        },
        "hostels": [
            "Gajjar Bhawan", "Bhabha Bhawan", "Mother Teresa Bhawan",
            "Swami Vivekananda Bhawan", "Nehru Bhawan", "Tagore Bhawan",
            "Sarabhai Bhawan", "Raman Bhawan", "Atal Bihari Vajpayee Bhawan"
        ]
    },
    {
        "institute_id": "NITT",
        "name": "National Institute of Technology Tiruchirappalli",
        "city": "Tiruchirappalli, Tamil Nadu",
        "modules": {
            "complaints": True,
            "eventradar": False,
            "attendance": True,
            "leave_pass": True,
            "clubs_hub": False,
            "ai_audit": False
        },
        "hostels": ["Agate", "Coral", "Diamond", "Garnet", "Opal", "Zircon"]
    },
    {
        "institute_id": "NITK",
        "name": "National Institute of Technology Karnataka (Surathkal)",
        "city": "Surathkal, Karnataka",
        "modules": {
            "complaints": True,
            "eventradar": True,
            "attendance": True,
            "leave_pass": False,
            "clubs_hub": True,
            "ai_audit": True
        },
        "hostels": ["Aravali", "Himalaya", "Nilgiri", "Sahyadri", "Vindhya"]
    },
    {
        "institute_id": "NITW",
        "name": "National Institute of Technology Warangal",
        "city": "Warangal, Telangana",
        "modules": {
            "complaints": True,
            "eventradar": True,
            "attendance": True,
            "leave_pass": True,
            "clubs_hub": True,
            "ai_audit": False
        },
        "hostels": ["1.8k Ultra Mega Hostel", "BTech Block 1", "Priyadarshini Hall", "Sarojini Hall"]
    }
]

# =========================================================
# 2. MASTER USERS DATABASE
# =========================================================
USERS_DB = [
    # FOUNDER / MULTI-NIT SUPER ADMIN (TOP OF HIERARCHY)
    {
        "user_id": "FOUNDER", "password": "123", "full_name": "Chief Architect & Founder",
        "role": "Founder", "authority_title": "Multi-NIT System Architect & Super Admin", "institute_id": "GLOBAL",
        "hostel_block": "All Campuses", "floor": "-", "room": "HQ Core",
        "phone": "+91 9876543210", "email": "founder@nit-hms.in", "department": "Multi-Tenant Administration"
    },
    # DEAN (SVNIT)
    {
        "user_id": "DEAN", "password": "123", "full_name": "Prof. S. R. Patel (Dean SW)",
        "role": "Dean", "authority_title": "Dean Student Welfare", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Admin Block",
        "phone": "0261-2201500", "email": "dean_sw@svnit.ac.in", "department": "Administration"
    },
    # STUDENTS
    {
        "user_id": "U26CE011", "password": "123", "full_name": "Ishant Agrawal",
        "role": "Student", "authority_title": "Verified Resident", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "2nd Floor", "room": "B-204",
        "phone": "+91 9876543210", "email": "u26ce011@ced.svnit.ac.in", "department": "Civil Engineering"
    },
    {
        "user_id": "U26CS012", "password": "123", "full_name": "Aarav Sharma",
        "role": "Student", "authority_title": "Verified Resident", "institute_id": "SVNIT",
        "hostel_block": "Bhabha Bhawan", "floor": "3rd Floor", "room": "A-302",
        "phone": "+91 9876543211", "email": "u26cs012@coed.svnit.ac.in", "department": "Computer Engineering"
    },
    # CLUB COORDINATORS
    {
        "user_id": "ACM", "password": "123", "full_name": "ACM SVNIT Chapter",
        "role": "ClubOrganizer", "authority_title": "Coordinator (ACM)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "SAC Club Room 1",
        "phone": "+91 9811122233", "email": "acm@svnit.ac.in", "department": "Technical Society"
    },
    {
        "user_id": "GDSC", "password": "123", "full_name": "Google Developer Student Club",
        "role": "ClubOrganizer", "authority_title": "Coordinator (GDSC)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "SAC Club Room 2",
        "phone": "+91 9811122244", "email": "gdsc@svnit.ac.in", "department": "Technical Society"
    },
    {
        "user_id": "CHRD", "password": "123", "full_name": "Centre for Human Resource Dev (CHRD)",
        "role": "ClubOrganizer", "authority_title": "Coordinator (CHRD)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "SAC Cultural Wing",
        "phone": "+91 9811122255", "email": "chrd@svnit.ac.in", "department": "Cultural Society"
    },
    # WARDENS
    {
        "user_id": "CW_GAJJAR", "password": "123", "full_name": "Dr. M. K. Verma",
        "role": "Warden", "authority_title": "Chief Warden (Gajjar Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "Ground", "room": "CW Office",
        "phone": "0261-2201659", "email": "cw_gajjar@svnit.ac.in", "department": "Hostel Office"
    },
    {
        "user_id": "W_GAJJAR", "password": "123", "full_name": "Dr. P. K. Shah",
        "role": "Warden", "authority_title": "Warden (Gajjar Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "Ground", "room": "Warden Office",
        "phone": "0261-2201659", "email": "w_gajjar@svnit.ac.in", "department": "Hostel Office"
    },
    {
        "user_id": "CW_BHABHA", "password": "123", "full_name": "Dr. A. N. Joshi",
        "role": "Warden", "authority_title": "Chief Warden (Bhabha Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Bhabha Bhawan", "floor": "Ground", "room": "CW Office",
        "phone": "0261-2201790", "email": "cw_bhabha@svnit.ac.in", "department": "Hostel Office"
    },
    # MAINTENANCE STAFF
    {
        "user_id": "STAFF_ELEC", "password": "123", "full_name": "Rameshbhai Patel (Electrical)",
        "role": "Staff", "authority_title": "Senior Electrician", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Estate Section",
        "phone": "+91 9900112233", "email": "elec@svnit.ac.in", "department": "Electricity"
    },
    {
        "user_id": "STAFF_PLUMB", "password": "123", "full_name": "Sureshbhai Solanki (Plumbing)",
        "role": "Staff", "authority_title": "Head Plumber", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Estate Section",
        "phone": "+91 9900112244", "email": "plumb@svnit.ac.in", "department": "Plumbing"
    }
]

# =========================================================
# 3. MASTER CLUBS DATABASE
# =========================================================
CLUBS_DB = [
    {
        "club_id": "ACM",
        "name": "ACM Student Chapter SVNIT",
        "mission": "Advancing computing as a science and profession through hackathons, CP contests, and research workshops.",
        "faculty_advisor": "Dr. R. K. Gupta (Comp. Engg.)",
        "head_coordinator": "Aarav Sharma",
        "extra_dean_info": "Annual Budget Approved: ₹1,80,000 | Lab Equipment Inventory Verified.",
        "members": [
            {"name": "Aarav Sharma", "roll": "U23CS004", "position": "Chairperson", "phone": "+91 9811100001"},
            {"name": "Riya Mehta", "roll": "U23CS045", "position": "Vice-Chairperson", "phone": "+91 9811100002"},
            {"name": "Karan Verma", "roll": "U24CS019", "position": "Treasurer", "phone": "+91 9811100003"},
            {"name": "Ishant Agrawal", "roll": "U26CE011", "position": "Executive Member", "phone": "+91 9876543210"}
        ]
    },
    {
        "club_id": "GDSC",
        "name": "Google Developer Student Club (GDSC)",
        "mission": "Bridging the gap between theory and practice using Google Cloud, Android, and AI.",
        "faculty_advisor": "Dr. M. A. Zaveri (Comp. Engg.)",
        "head_coordinator": "Devansh Joshi",
        "extra_dean_info": "Google Cloud Study Jams completed with 240+ students.",
        "members": [
            {"name": "Devansh Joshi", "roll": "U23CS011", "position": "GDSC Lead", "phone": "+91 9822200001"},
            {"name": "Ananya Iyer", "roll": "U23EC032", "position": "AI/ML Lead", "phone": "+91 9822200002"}
        ]
    },
    {
        "club_id": "CHRD",
        "name": "Centre for Human Resource Development (CHRD)",
        "mission": "Nurturing music, dance, drama, fine arts, and literary culture.",
        "faculty_advisor": "Dr. S. N. Sharma (Electrical)",
        "head_coordinator": "Kashish Verma",
        "extra_dean_info": "Sparsh Cultural Night concluded with 1,200+ attendees.",
        "members": [
            {"name": "Kashish Verma", "roll": "U23EE018", "position": "Cultural Secretary", "phone": "+91 9833300001"},
            {"name": "Ishant Agrawal", "roll": "U26CE011", "position": "Event Coordinator", "phone": "+91 9876543210"}
        ]
    }
]

# =========================================================
# 4. MASTER EVENTS DATABASE
# =========================================================
EVENTS_DB = [
    {
        "event_id": "EVT-101",
        "club_id": "ACM",
        "title": "Algothon 2026 - Annual Hackathon",
        "date": "2026-10-25",
        "start_time": "10:00",
        "end_time": "18:00",
        "venue": "CRC Auditorium",
        "status": "Approved",
        "submitted_by": "Aarav Sharma",
        "type": "Upcoming",
        "description": "SVNIT's biggest annual 8-hour competitive coding & AI hackathon! ₹50,000 in prizes.",
        "image_url": "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80",
        "registration_link": "https://docs.google.com/forms",
        "rsvps": ["U26CE011", "U26CS012"],
        "feedbacks": []
    },
    {
        "event_id": "EVT-102",
        "club_id": "GDSC",
        "title": "GenAI & Cloud Study Jam",
        "date": "2026-10-28",
        "start_time": "14:00",
        "end_time": "17:00",
        "venue": "CCC Seminar Hall",
        "status": "Pending Dean Approval",
        "submitted_by": "Devansh Joshi",
        "type": "Upcoming",
        "description": "Hands-on workshop on Gemini API, Vertex AI, and Kubernetes deployment.",
        "image_url": "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80",
        "registration_link": "https://docs.google.com/forms",
        "rsvps": ["U26CS012"],
        "feedbacks": []
    },
    {
        "event_id": "EVT-100",
        "club_id": "CHRD",
        "title": "Garba & Acoustic Eve 2026",
        "date": "2026-10-19",
        "start_time": "18:30",
        "end_time": "22:00",
        "venue": "SAC Amphitheatre",
        "status": "Completed",
        "submitted_by": "Kashish Verma",
        "type": "Completed",
        "description": "Cultural evening celebrating unplugged music. 1-day feedback window active!",
        "image_url": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80",
        "registration_link": "",
        "rsvps": ["U26CE011", "U26CS012"],
        "feedbacks": [
            {"student_id": "U26CS012", "rating": 5, "review": "Awesome sound quality and crowd management!"}
        ],
        "ai_audit": {
            "total_attendees": 850,
            "average_rating": 4.9,
            "sentiment": "Extremely Positive",
            "key_pros": ["Vibrant acoustics and lighting", "Zero discipline issues"],
            "key_cons": ["Water dispenser ran out by 9:30 PM"],
            "recommendation": "Approve winter fest budget with bonus allocation."
        }
    }
]

# =========================================================
# 5. MASTER COMPLAINTS DATABASE
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
        "description": "The regulator makes a buzzing sound and sparks at speed 4.",
        "status": "Awaiting Confirmation",
        "routed_to": "Electricity Wing",
        "staff_remark": "Replaced faulty capacitor and regulator switch.",
        "created_at": "2026-10-18, 10:30 AM"
    },
    {
        "ticket_id": "TKT-902",
        "student_id": "U26CS012",
        "student_name": "Aarav Sharma",
        "hostel_block": "Bhabha Bhawan",
        "room": "A-302",
        "category": "LAN / Wi-Fi",
        "summary": "No LAN connectivity in Wing A 3rd floor",
        "description": "Switch port blink light is off since morning.",
        "status": "In Progress",
        "routed_to": "CCC Network Wing",
        "staff_remark": "Checking floor rack switch.",
        "created_at": "2026-10-19, 02:15 PM"
    }
]

# =========================================================
# 6. PYDANTIC MODELS
# =========================================================
class LoginReq(BaseModel):
    user_id: str
    password: str

class ComplaintCreateReq(BaseModel):
    student_id: str
    category: str
    summary: str
    description: str

class StudentVerifyReq(BaseModel):
    ticket_id: str
    satisfied: bool

class StaffResolveReq(BaseModel):
    ticket_id: str
    staff_remark: str

class PasswordResetReq(BaseModel):
    target_user_id: str
    new_password: str

class EventRequisitionReq(BaseModel):
    club_id: str
    title: str
    date: str
    start_time: str
    end_time: str
    venue: str
    submitted_by: str
    description: Optional[str] = ""
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

class ClubUpdateInfoReq(BaseModel):
    club_id: str
    mission: str
    extra_dean_info: str

class ModuleToggleReq(BaseModel):
    institute_id: str
    module_key: str
    enabled: bool

class AddHostelReq(BaseModel):
    institute_id: str
    hostel_name: str

# =========================================================
# 7. FOUNDER & HIERARCHY-AWARE PASSWORD API
# =========================================================
@app.get("/api/founder/tenants")
def get_tenants():
    return NIT_TENANTS_DB

@app.post("/api/founder/toggle-module")
def toggle_module(req: ModuleToggleReq):
    for nit in NIT_TENANTS_DB:
        if nit["institute_id"].upper() == req.institute_id.upper():
            if req.module_key in nit["modules"]:
                nit["modules"][req.module_key] = req.enabled
                return {"success": True, "message": f"{req.module_key} updated for {nit['institute_id']}", "modules": nit["modules"]}
    raise HTTPException(status_code=404, detail="Institute not found")

@app.post("/api/founder/add-hostel")
def add_hostel(req: AddHostelReq):
    for nit in NIT_TENANTS_DB:
        if nit["institute_id"].upper() == req.institute_id.upper():
            if req.hostel_name not in nit["hostels"]:
                nit["hostels"].append(req.hostel_name)
            return {"success": True, "hostels": nit["hostels"]}
    raise HTTPException(status_code=404, detail="Institute not found")

# =========================================================================
# STRICT HIERARCHY GUARD: Dean CANNOT change Founder. Founder CAN change all!
# =========================================================================
@app.post("/api/dean/reset-password")
def reset_password(req: PasswordResetReq, admin_id: str = Query(...)):
    requester = next((u for u in USERS_DB if u["user_id"].upper() == admin_id.strip().upper()), None)
    if not requester:
        raise HTTPException(status_code=403, detail="Unauthorized operator.")

    target_id = req.target_user_id.strip().upper()

    # Rule 1: NO ONE below Founder can touch FOUNDER account
    if target_id == "FOUNDER" and requester["role"] != "Founder":
        raise HTTPException(
            status_code=403,
            detail="HIERARCHY VIOLATION: Dean cannot reset or modify the Founder / Super Admin password!"
        )

    # Rule 2: Dean cannot change other Deans or global settings if restricted
    if requester["role"] == "Dean" and target_id == "DEAN" and requester["user_id"].upper() != "DEAN":
        raise HTTPException(status_code=403, detail="Cannot alter another Dean's security credentials.")

    target_user = next((u for u in USERS_DB if u["user_id"].upper() == target_id), None)
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user ID not found.")

    target_user["password"] = req.new_password.strip()
    return {"success": True, "message": f"Password securely updated for {target_user['user_id']}!"}

# =========================================================
# 8. STANDARD CORE API ENDPOINTS
# =========================================================
@app.get("/")
def root():
    return {"status": "online", "service": "NIT Multi-Campus HMS Backend"}

@app.post("/api/auth/login")
def login(req: LoginReq):
    uid = req.user_id.strip().upper()
    pwd = req.password.strip()
    for u in USERS_DB:
        if u["user_id"].upper() == uid and u["password"] == pwd:
            user_copy = {k: v for k, v in u.items() if k != "password"}
            return {"success": True, "user": user_copy}
    raise HTTPException(status_code=401, detail="Invalid Position ID or Password")

@app.get("/api/complaints")
def get_complaints(role: str = "Dean", user_id: str = "", hostel_block: str = "All", department: str = ""):
    if role == "Student":
        return [c for c in COMPLAINTS_DB if c["student_id"].upper() == user_id.upper()]
    if role == "Warden" and hostel_block != "All":
        return [c for c in COMPLAINTS_DB if c["hostel_block"].lower() == hostel_block.lower()]
    if role == "Staff" and department:
        return [c for c in COMPLAINTS_DB if department.lower() in c["category"].lower() or department.lower() in c["routed_to"].lower()]
    return COMPLAINTS_DB

@app.post("/api/complaints")
def create_complaint(req: ComplaintCreateReq):
    student = next((u for u in USERS_DB if u["user_id"].upper() == req.student_id.upper()), None)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    new_tkt = {
        "ticket_id": f"TKT-{random.randint(100, 999)}",
        "student_id": student["user_id"],
        "student_name": student["full_name"],
        "hostel_block": student["hostel_block"],
        "room": student["room"],
        "category": req.category,
        "summary": req.summary,
        "description": req.description,
        "status": "Pending",
        "routed_to": f"{req.category} Maintenance Wing",
        "staff_remark": "",
        "created_at": datetime.now().strftime("%Y-%m-%d, %I:%M %p")
    }
    COMPLAINTS_DB.insert(0, new_tkt)
    return {"success": True, "ticket": new_tkt}

@app.post("/api/complaints/student-verify")
def student_verify(req: StudentVerifyReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            c["status"] = "Completed" if req.satisfied else "Reopened"
            return {"success": True, "ticket": c}
    raise HTTPException(status_code=404, detail="Ticket not found")

@app.post("/api/complaints/staff-resolve")
def staff_resolve(req: StaffResolveReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            c["status"] = "Awaiting Confirmation"
            c["staff_remark"] = req.staff_remark
            return {"success": True, "ticket": c}
    raise HTTPException(status_code=404, detail="Ticket not found")

@app.get("/api/complaints/export-pdf", response_class=HTMLResponse)
def export_pdf(institute_id: str = "SVNIT", hostel_block: str = "All", from_date: str = "", to_date: str = ""):
    rows = COMPLAINTS_DB
    if hostel_block != "All":
        rows = [c for c in rows if c["hostel_block"] == hostel_block]
    tr_html = "".join([
        f"<tr><td>{c['ticket_id']}</td><td>{c['hostel_block']} ({c['room']})</td><td>{c['category']}</td><td>{c['summary']}</td><td>{c['status']}</td><td>{c['created_at']}</td></tr>"
        for c in rows
    ])
    html = f"""
    <html><head><title>Hostel Grievance Audit Report</title>
    <style>body{{font-family:Arial,sans-serif;padding:30px;}} table{{width:100%;border-collapse:collapse;margin-top:20px;}} th,td{{border:1px solid #ccc;padding:10px;text-align:left;font-size:13px;}} th{{background:#f1f5f9;}}</style>
    </head><body onload="window.print()">
    <h2>National Institute of Technology — Official Grievance Audit Report</h2>
    <p><strong>Scope:</strong> {hostel_block} | <strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
    <table><thead><tr><th>Ticket ID</th><th>Hostel & Room</th><th>Category</th><th>Summary</th><th>Status</th><th>Timestamp</th></tr></thead>
    <tbody>{tr_html}</tbody></table></body></html>
    """
    return HTMLResponse(content=html)

# =========================================================
# 9. CLUBS & EVENTRADAR ENDPOINTS
# =========================================================
@app.get("/api/unicore/clubs")
def get_clubs():
    return CLUBS_DB

@app.post("/api/unicore/clubs/update-info")
def update_club_info(req: ClubUpdateInfoReq):
    for c in CLUBS_DB:
        if c["club_id"].upper() == req.club_id.upper():
            c["mission"] = req.mission
            c["extra_dean_info"] = req.extra_dean_info
            return {"success": True, "club": c}
    raise HTTPException(status_code=404, detail="Club not found")

@app.get("/api/unicore/events")
def get_events():
    return EVENTS_DB

@app.post("/api/unicore/events/propose")
def propose_event(req: EventRequisitionReq):
    for ev in EVENTS_DB:
        if ev["date"] == req.date and ev["venue"].lower() == req.venue.lower() and ev["status"] == "Approved":
            if not (req.end_time <= ev["start_time"] or req.start_time >= ev["end_time"]):
                raise HTTPException(
                    status_code=400,
                    detail=f"Venue Clash! {ev['venue']} is already booked by {ev['club_id']} ({ev['title']}) from {ev['start_time']} to {ev['end_time']}."
                )
    new_evt = {
        "event_id": f"EVT-{random.randint(103, 999)}",
        "club_id": req.club_id.upper(),
        "title": req.title,
        "date": req.date,
        "start_time": req.start_time,
        "end_time": req.end_time,
        "venue": req.venue,
        "status": "Pending Dean Approval",
        "submitted_by": req.submitted_by,
        "description": req.description,
        "image_url": req.image_url,
        "registration_link": req.registration_link,
        "type": "Upcoming",
        "rsvps": [],
        "feedbacks": []
    }
    EVENTS_DB.insert(0, new_evt)
    return {"success": True, "message": "Proposal submitted to Dean Clash Matrix!", "event": new_evt}

@app.post("/api/unicore/events/approve")
def approve_event(event_id: str = Query(...), action: str = Query(...)):
    for ev in EVENTS_DB:
        if ev["event_id"] == event_id:
            ev["status"] = action
            return {"success": True, "event": ev}
    raise HTTPException(status_code=404, detail="Event not found")

@app.post("/api/unicore/events/rsvp")
def rsvp_event(req: EventRsvpReq):
    for ev in EVENTS_DB:
        if ev["event_id"] == req.event_id:
            if "rsvps" not in ev:
                ev["rsvps"] = []
            if req.student_id not in ev["rsvps"]:
                ev["rsvps"].append(req.student_id)
            return {"success": True, "message": "RSVP recorded! Seat reserved.", "rsvps": ev["rsvps"]}
    raise HTTPException(status_code=404, detail="Event not found")

@app.post("/api/unicore/events/feedback")
def submit_event_feedback(req: EventFeedbackReq):
    for ev in EVENTS_DB:
        if ev["event_id"] == req.event_id:
            if "feedbacks" not in ev:
                ev["feedbacks"] = []
            ev["feedbacks"].append({
                "student_id": req.student_id,
                "rating": req.rating,
                "review": req.review
            })
            if "ai_audit" not in ev or not ev["ai_audit"]:
                ev["ai_audit"] = {
                    "total_attendees": max(len(ev.get("rsvps", [])), 1),
                    "average_rating": float(req.rating),
                    "sentiment": "Positive" if req.rating >= 4 else "Mixed",
                    "key_pros": [req.review] if req.rating >= 4 else ["Good participation"],
                    "key_cons": [req.review] if req.rating < 4 else ["No major complaints"],
                    "recommendation": "Audited by AI feedback loop."
                }
            else:
                all_ratings = [f["rating"] for f in ev["feedbacks"]]
                ev["ai_audit"]["average_rating"] = round(sum(all_ratings) / len(all_ratings), 1)
                if req.rating >= 4:
                    ev["ai_audit"]["key_pros"].append(req.review)
                else:
                    ev["ai_audit"]["key_cons"].append(req.review)
            return {"success": True, "message": "Feedback submitted to AI Audit engine!", "event": ev}
    raise HTTPException(status_code=404, detail="Event not found")

@app.get("/api/unicore/audit-summary")
def get_audit_summary():
    for ev in EVENTS_DB:
        if ev.get("ai_audit"):
            return {
                "event_id": ev["event_id"],
                "event_title": ev["title"],
                **ev["ai_audit"]
            }
    return {
        "event_id": "EVT-100",
        "event_title": "Garba & Acoustic Eve 2026",
        "total_attendees": 850,
        "average_rating": 4.9,
        "sentiment": "Extremely Positive",
        "key_pros": ["Vibrant acoustic setlist", "Zero discipline issues"],
        "key_cons": ["Water dispenser ran out early"],
        "recommendation": "Approve winter fest budget with bonus allocation."
    }