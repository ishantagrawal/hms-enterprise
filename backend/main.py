from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import random

app = FastAPI(title="HMS - National Institute of Technology")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

NIT_TENANTS_DB = [
    {
        "institute_id": "SVNIT",
        "name": "Sardar Vallabhbhai National Institute of Technology",
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
            "eventradar": True,
            "attendance": False,
            "leave_pass": False,
            "clubs_hub": False,
            "ai_audit": False
        },
        "hostels": ["Agate", "Coral", "Diamond", "Garnet", "Opal", "Zircon"]
    }
]

USERS_DB = [
    {
        "user_id": "FOUNDER", "password": "123", "full_name": "Chief Architect & Founder",
        "role": "Founder", "authority_title": "Multi-NIT System Architect & Super Admin", "institute_id": "GLOBAL",
        "hostel_block": "All Campuses", "floor": "-", "room": "HQ Core",
        "phone": "+91 9876543210", "email": "founder@nit-hms.in", "department": "Global Administration", "dob": "01012000"
    },
    {
        "user_id": "DEAN", "password": "123", "full_name": "Prof. S. R. Patel (Dean SW)",
        "role": "Dean", "authority_title": "Dean Student Welfare", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Admin Block",
        "phone": "0261-2201500", "email": "dean_sw@svnit.ac.in", "department": "Administration", "dob": "01011975"
    },
    {
        "user_id": "U26CE011", "password": "123", "full_name": "Ishant Agrawal",
        "role": "Student", "authority_title": "Verified Resident", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "2nd Floor", "room": "B-204",
        "phone": "+91 9876543210", "email": "u26ce011@ced.svnit.ac.in", "department": "Civil Engineering", "dob": "10072007"
    },
    {
        "user_id": "ACM", "password": "123", "full_name": "ACM SVNIT Chapter",
        "role": "ClubOrganizer", "authority_title": "Coordinator (ACM)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "SAC Club Room 1",
        "phone": "+91 9811122233", "email": "acm@svnit.ac.in", "department": "Technical Society", "dob": "01012000"
    },
    {
        "user_id": "CW_GAJJAR", "password": "123", "full_name": "Dr. M. K. Verma",
        "role": "Warden", "authority_title": "Chief Warden (Gajjar Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "Ground", "room": "CW Office",
        "phone": "0261-2201659", "email": "cw_gajjar@svnit.ac.in", "department": "Hostel Office", "dob": "01011980"
    },
    {
        "user_id": "STAFF_ELEC", "password": "123", "full_name": "Rameshbhai Patel (Electrical)",
        "role": "Staff", "authority_title": "Senior Electrician", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Estate Section",
        "phone": "+91 9900112233", "email": "elec@svnit.ac.in", "department": "Electricity", "dob": "01011985"
    }
]

CLUBS_DB = [
    {
        "club_id": "ACM",
        "name": "ACM Student Chapter SVNIT",
        "mission": "Advancing computing through hackathons and workshops.",
        "faculty_advisor": "Dr. R. K. Gupta",
        "head_coordinator": "Aarav Sharma",
        "extra_dean_info": "Budget approved: ₹1,80,000",
        "members": [{"name": "Aarav Sharma", "roll": "U23CS004", "position": "Chairperson", "phone": "+91 9811100001"}]
    }
]

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
        "description": "SVNIT's biggest 8-hour competitive coding hackathon.",
        "image_url": "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80",
        "registration_link": "https://docs.google.com/forms",
        "rsvps": ["U26CE011"],
        "feedbacks": []
    }
]

COMPLAINTS_DB = [
    {
        "ticket_id": "TKT-901",
        "student_id": "U26CE011",
        "student_name": "Ishant Agrawal",
        "hostel_block": "Gajjar Bhawan",
        "room": "B-204",
        "category": "Electricity",
        "summary": "Ceiling fan regulator sparking in B-204",
        "description": "The regulator makes a buzzing sound and sparks.",
        "status": "Awaiting Confirmation",
        "routed_to": "Electricity Wing",
        "staff_remark": "Replaced faulty capacitor.",
        "created_at": "2026-10-18, 10:30 AM"
    }
]

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

class StudentChangePassReq(BaseModel):
    student_id: str
    old_password: str
    new_password: str

class StudentBulkItem(BaseModel):
    user_id: str
    full_name: str
    hostel_block: str
    room: str
    department: str
    phone: str
    email: str
    dob: str

class ClubCreateReq(BaseModel):
    club_id: str
    name: str
    mission: str
    faculty_advisor: str
    head_coordinator: str

class ModuleToggleReq(BaseModel):
    institute_id: str
    module_key: str
    enabled: bool

class AddHostelReq(BaseModel):
    institute_id: str
    hostel_name: str

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

@app.get("/")
def root():
    return {"status": "online", "service": "HMS Multi-NIT Backend"}

@app.get("/api/founder/tenants")
def get_tenants():
    return NIT_TENANTS_DB

@app.post("/api/founder/toggle-module")
def toggle_module(req: ModuleToggleReq):
    for nit in NIT_TENANTS_DB:
        if nit["institute_id"].upper() == req.institute_id.upper():
            if req.module_key in nit["modules"]:
                nit["modules"][req.module_key] = req.enabled
                return {"success": True, "modules": nit["modules"]}
    raise HTTPException(status_code=404, detail="Institute not found")

@app.post("/api/founder/add-hostel")
def add_hostel(req: AddHostelReq):
    for nit in NIT_TENANTS_DB:
        if nit["institute_id"].upper() == req.institute_id.upper():
            if req.hostel_name not in nit["hostels"]:
                nit["hostels"].append(req.hostel_name)
            return {"success": True, "hostels": nit["hostels"]}
    raise HTTPException(status_code=404, detail="Institute not found")

@app.post("/api/founder/upload-students")
def upload_students_bulk(students: List[StudentBulkItem]):
    added_count = 0
    for s in students:
        uid = s.user_id.strip().upper()
        existing = next((u for u in USERS_DB if u["user_id"].upper() == uid), None)
        if existing:
            existing["full_name"] = s.full_name
            existing["hostel_block"] = s.hostel_block
            existing["room"] = s.room
            existing["department"] = s.department
            existing["phone"] = s.phone
            existing["email"] = s.email
            existing["dob"] = s.dob
        else:
            USERS_DB.append({
                "user_id": uid,
                "password": s.dob.strip(),
                "full_name": s.full_name,
                "role": "Student",
                "authority_title": "Verified Resident",
                "institute_id": "SVNIT",
                "hostel_block": s.hostel_block,
                "floor": "1st Floor",
                "room": s.room,
                "phone": s.phone,
                "email": s.email,
                "department": s.department,
                "dob": s.dob.strip()
            })
            added_count += 1
    return {"success": True, "message": f"Successfully onboarded {added_count} students with DOB passwords!"}

@app.post("/api/founder/create-club")
def create_club(req: ClubCreateReq):
    cid = req.club_id.strip().upper()
    if any(c["club_id"].upper() == cid for c in CLUBS_DB):
        raise HTTPException(status_code=400, detail="Club ID already exists.")
    
    CLUBS_DB.append({
        "club_id": cid,
        "name": req.name,
        "mission": req.mission,
        "faculty_advisor": req.faculty_advisor,
        "head_coordinator": req.head_coordinator,
        "extra_dean_info": "Newly registered chapter.",
        "members": [{"name": req.head_coordinator, "roll": cid + "-HEAD", "position": "Coordinator", "phone": "+91 9800000000"}]
    })
    if not any(u["user_id"].upper() == cid for u in USERS_DB):
        USERS_DB.append({
            "user_id": cid,
            "password": "123",
            "full_name": req.name,
            "role": "ClubOrganizer",
            "authority_title": f"Coordinator ({cid})",
            "institute_id": "SVNIT",
            "hostel_block": "All",
            "floor": "-",
            "room": "SAC Room",
            "phone": "+91 9800000000",
            "email": f"{cid.lower()}@nit.ac.in",
            "department": "Student Chapter"
        })
    return {"success": True, "message": f"Club {req.name} created successfully!"}

@app.post("/api/auth/login")
def login(req: LoginReq):
    uid = req.user_id.strip().upper()
    pwd = req.password.strip()
    for u in USERS_DB:
        if u["user_id"].upper() == uid and (u["password"] == pwd or u.get("dob") == pwd):
            user_copy = {k: v for k, v in u.items() if k != "password"}
            return {"success": True, "user": user_copy}
    raise HTTPException(status_code=401, detail="Invalid Position ID / Roll No or Password")

@app.post("/api/dean/reset-password")
def reset_password(req: PasswordResetReq, admin_id: str = Query(...)):
    requester = next((u for u in USERS_DB if u["user_id"].upper() == admin_id.strip().upper()), None)
    if not requester:
        raise HTTPException(status_code=403, detail="Unauthorized operator.")
    target_id = req.target_user_id.strip().upper()
    if target_id == "FOUNDER" and requester["role"] != "Founder":
        raise HTTPException(status_code=403, detail="HIERARCHY VIOLATION: Dean cannot modify Founder password!")
    target_user = next((u for u in USERS_DB if u["user_id"].upper() == target_id), None)
    if not target_user:
        raise HTTPException(status_code=404, detail="Target ID not found.")
    target_user["password"] = req.new_password.strip()
    return {"success": True, "message": f"Password updated for {target_user['user_id']}"}

@app.post("/api/warden/reset-student-password")
def warden_reset_student(req: PasswordResetReq, warden_id: str = Query(...)):
    warden = next((u for u in USERS_DB if u["user_id"].upper() == warden_id.strip().upper()), None)
    if not warden or warden["role"] not in ["Warden", "Dean", "Founder"]:
        raise HTTPException(status_code=403, detail="Unauthorized.")
    target = next((u for u in USERS_DB if u["user_id"].upper() == req.target_user_id.strip().upper()), None)
    if not target:
        raise HTTPException(status_code=404, detail="Student Roll No not found.")
    if target["role"] in ["Founder", "Dean"]:
        raise HTTPException(status_code=403, detail="Hierarchy Violation.")
    target["password"] = req.new_password.strip()
    return {"success": True, "message": f"Password reset for {target['full_name']} ({target['user_id']})"}

@app.post("/api/student/change-password")
def student_change_password(req: StudentChangePassReq):
    student = next((u for u in USERS_DB if u["user_id"].upper() == req.student_id.strip().upper()), None)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    old_p = req.old_password.strip()
    if student["password"] != old_p and student.get("dob") != old_p:
        raise HTTPException(status_code=400, detail="Current password (or DOB) is incorrect.")
    if len(req.new_password.strip()) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters.")
    student["password"] = req.new_password.strip()
    return {"success": True, "message": "Custom password saved successfully!"}

@app.get("/api/complaints")
def get_complaints(role: str = "Dean", user_id: str = "", hostel_block: str = "All", department: str = ""):
    if role == "Student":
        return [c for c in COMPLAINTS_DB if c["student_id"].upper() == user_id.upper()]
    if role == "Warden" and hostel_block != "All":
        return [c for c in COMPLAINTS_DB if c["hostel_block"].lower() == hostel_block.lower()]
    if role == "Staff" and department:
        return [c for c in COMPLAINTS_DB if department.lower() in c["category"].lower()]
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
def export_pdf(institute_id: str = "SVNIT", hostel_block: str = "All"):
    rows = COMPLAINTS_DB
    if hostel_block != "All":
        rows = [c for c in rows if c["hostel_block"] == hostel_block]
    tr_html = "".join([
        f"<tr><td>{c['ticket_id']}</td><td>{c['student_name']}</td><td>{c['hostel_block']} ({c['room']})</td><td>{c['category']}</td><td>{c['summary']}</td><td>{c['status']}</td></tr>"
        for c in rows
    ])
    html = f"<html><head><title>Report</title></head><body onload='window.print()'><h2>HMS Grievance Report</h2><table><tr><th>ID</th><th>Student</th><th>Hostel</th><th>Category</th><th>Summary</th><th>Status</th></tr>{tr_html}</table></body></html>"
    return HTMLResponse(content=html)

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
    return {"success": True, "event": new_evt}

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
            if "rsvps" not in ev: ev["rsvps"] = []
            if req.student_id not in ev["rsvps"]: ev["rsvps"].append(req.student_id)
            return {"success": True, "rsvps": ev["rsvps"]}
    raise HTTPException(status_code=404, detail="Event not found")

@app.post("/api/unicore/events/feedback")
def submit_event_feedback(req: EventFeedbackReq):
    for ev in EVENTS_DB:
        if ev["event_id"] == req.event_id:
            if "feedbacks" not in ev: ev["feedbacks"] = []
            ev["feedbacks"].append({"student_id": req.student_id, "rating": req.rating, "review": req.review})
            return {"success": True, "event": ev}
    raise HTTPException(status_code=404, detail="Event not found")

@app.get("/api/unicore/audit-summary")
def get_audit_summary():
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