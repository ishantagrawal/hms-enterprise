from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import random

app = FastAPI(title="SVNIT HMS - Clean Manual Architecture")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SVNIT_HOSTELS = [
    "Gajjar Bhawan", "Bhabha Bhawan", "Mother Teresa Bhawan",
    "Swami Vivekananda Bhawan", "Nehru Bhawan", "Tagore Bhawan",
    "Sarabhai Bhawan", "Raman Bhawan", "Atal Bihari Vajpayee Bhawan"
]

# Clean baseline: Only Dean exists initially
USERS_DB = [
    {
        "user_id": "DEAN", "password": "123", "full_name": "Prof. S. R. Patel (Dean SW)",
        "role": "Dean", "authority_title": "Dean Student Welfare", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Admin Block",
        "phone": "0261-2201500", "email": "dean_sw@svnit.ac.in", "department": "Administration", "dob": "01011975"
    }
]

COMPLAINT_DEPARTMENTS = [
    {"id": "ELECTRICITY", "title": "Electrical Maintenance (Central)", "type": "Central", "hostel_block": "All", "icon": "⚡"},
    {"id": "CCC_LAN", "title": "CCC / Internet / LAN (Central)", "type": "Central", "hostel_block": "All", "icon": "🌐"}
]

CLUBS_DB = []
EVENTS_DB = []
COMPLAINTS_DB = []
NOTICES_DB = []

class LoginReq(BaseModel):
    user_id: str
    password: str

class CreateDepartmentReq(BaseModel):
    dept_id: Optional[str] = None
    name: Optional[str] = None
    title: Optional[str] = None
    password: Optional[str] = "123"
    dept_type: str = "Central"
    hostel_block: Optional[str] = "All"
    icon: Optional[str] = "🛠️"

class ClubCreateReq(BaseModel):
    club_id: str
    name: str
    password: Optional[str] = "123"
    mission: Optional[str] = ""
    faculty_advisor: Optional[str] = ""
    head_coordinator: Optional[str] = ""

class WardenCreateReq(BaseModel):
    user_id: str
    hostel_block: str
    password: str
    phone: Optional[str] = "0261-2201600"

class PasswordResetReq(BaseModel):
    target_user_id: str
    new_password: str

class StudentManualAddReq(BaseModel):
    user_id: str
    full_name: str
    hostel_block: str
    room: str
    department: str
    phone: str
    email: str
    dob: str

class ComplaintCreateReq(BaseModel):
    student_id: str
    category: str
    summary: str
    description: str

class StaffResolveReq(BaseModel):
    ticket_id: str
    staff_remark: str

class StudentVerifyReq(BaseModel):
    ticket_id: str
    satisfied: bool

class ClubUpdateInfoReq(BaseModel):
    club_id: str
    mission: str
    extra_dean_info: str
    faculty_advisor: Optional[str] = None
    head_coordinator: Optional[str] = None

class ClubMemberAddReq(BaseModel):
    club_id: str
    name: str
    roll: str
    position: str
    phone: str

class ClubGalleryAddReq(BaseModel):
    club_id: str
    media_type: str
    media_url: str
    caption: str

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

class NoticeCreateReq(BaseModel):
    club_id: str
    title: str
    message: str
    target_branch: str = "All Branches"
    target_year: str = "All Years"
    registration_link: Optional[str] = ""

@app.get("/")
def root():
    return {"status": "online", "institute": "SVNIT Surat HMS Clean State"}

@app.post("/api/auth/login")
def login(req: LoginReq):
    uid = req.user_id.strip().upper()
    pwd = req.password.strip()
    for u in USERS_DB:
        if u["user_id"].upper() == uid and (u["password"] == pwd or u.get("dob") == pwd):
            user_copy = {k: v for k, v in u.items() if k != "password"}
            return {"success": True, "user": user_copy}
    raise HTTPException(status_code=401, detail="Invalid Login ID or Password")

@app.get("/api/departments")
def get_departments(hostel_block: str = "All"):
    if hostel_block and hostel_block != "All":
        return [d for d in COMPLAINT_DEPARTMENTS if d["type"] == "Central" or d.get("hostel_block", "All").lower() == hostel_block.lower()]
    return COMPLAINT_DEPARTMENTS

@app.post("/api/departments/create")
def create_department(req: CreateDepartmentReq):
    raw_name = (req.name or req.title or "").strip()
    did = (req.dept_id or raw_name).strip().upper().replace(" ", "_").replace("/", "")
    pwd = (req.password or "123").strip()
    h_block = req.hostel_block if req.dept_type == "Hostel" else "All"
    display_title = raw_name

    existing_dept = next((d for d in COMPLAINT_DEPARTMENTS if d["id"].upper() == did), None)
    if existing_dept:
        existing_dept["title"] = display_title
        existing_dept["icon"] = req.icon or "🛠️"
    else:
        COMPLAINT_DEPARTMENTS.append({"id": did, "title": display_title, "type": req.dept_type, "hostel_block": h_block, "icon": req.icon or "🛠️"})

    existing_user = next((u for u in USERS_DB if u["user_id"].upper() == did), None)
    if existing_user:
        existing_user["password"] = pwd
        existing_user["full_name"] = display_title
    else:
        USERS_DB.append({
            "user_id": did, "password": pwd, "full_name": display_title, "role": "Staff",
            "authority_title": f"Department Portal ({h_block})", "institute_id": "SVNIT",
            "hostel_block": h_block, "floor": "-", "room": "Maintenance Wing",
            "phone": "0261-2201500", "email": f"{did.lower()}@svnit.ac.in", "department": did, "dob": "01011990"
        })
    return {"success": True, "message": f"Department '{display_title}' created successfully!"}

@app.post("/api/dean/create-warden")
def create_or_update_warden(req: WardenCreateReq):
    uid = req.user_id.strip().upper().replace(" ", "_")
    existing = next((u for u in USERS_DB if u["user_id"].upper() == uid), None)
    if existing:
        existing["password"] = req.password.strip()
        existing["hostel_block"] = req.hostel_block.strip()
        return {"success": True, "message": f"Updated Warden portal for {req.hostel_block}!"}
    
    USERS_DB.append({
        "user_id": uid, "password": req.password.strip(), "full_name": f"{req.hostel_block.strip()} Warden Office",
        "role": "Warden", "authority_title": f"Chief Warden / Warden ({req.hostel_block.strip()})", "institute_id": "SVNIT",
        "hostel_block": req.hostel_block.strip(), "floor": "Ground", "room": "Warden Office",
        "phone": req.phone.strip(), "email": f"{uid.lower()}@svnit.ac.in", "department": "Hostel Office", "dob": "01011980"
    })
    return {"success": True, "message": f"Warden portal created for {req.hostel_block}!"}

@app.post("/api/dean/create-club")
def create_club(req: ClubCreateReq):
    cid = req.club_id.strip().upper().replace(" ", "_")
    pwd = (req.password or "123").strip()
    if any(c["club_id"].upper() == cid for c in CLUBS_DB):
        raise HTTPException(status_code=400, detail=f"Club ID '{cid}' already exists.")
    
    new_c = {
        "club_id": cid, "name": req.name.strip(),
        "mission": (req.mission or "").strip() or "Club coordinator will manually update mission & details.",
        "faculty_advisor": (req.faculty_advisor or "").strip() or "To be updated",
        "head_coordinator": (req.head_coordinator or "").strip() or "To be updated",
        "extra_dean_info": "Newly registered club.", "members": [], "gallery": []
    }
    CLUBS_DB.insert(0, new_c)
    USERS_DB.append({
        "user_id": cid, "password": pwd, "full_name": req.name.strip(),
        "role": "ClubOrganizer", "authority_title": f"Club Portal ({cid})", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "SAC Office",
        "phone": "+91 9800000000", "email": f"{cid.lower()}@svnit.ac.in", "department": "Student Society", "dob": "01012000"
    })
    return {"success": True, "message": f"Club '{req.name}' created with ID '{cid}'!"}

@app.post("/api/dean/reset-password")
def reset_password(req: PasswordResetReq, admin_id: str = Query("DEAN")):
    target = next((u for u in USERS_DB if u["user_id"].upper() == req.target_user_id.strip().upper()), None)
    if not target:
        raise HTTPException(status_code=404, detail="Account not found.")
    target["password"] = req.new_password.strip()
    return {"success": True, "message": f"Password updated for {target['full_name']}!"}

@app.get("/api/warden/students")
def get_hostel_students(hostel_block: str = "All"):
    if hostel_block == "All":
        return [{k: v for k, v in u.items() if k != "password"} for u in USERS_DB if u["role"] == "Student"]
    return [{k: v for k, v in u.items() if k != "password"} for u in USERS_DB if u["role"] == "Student" and u["hostel_block"].lower() == hostel_block.lower()]

@app.post("/api/warden/add-student")
def add_student_manual(req: StudentManualAddReq):
    uid = req.user_id.strip().upper()
    existing = next((u for u in USERS_DB if u["user_id"].upper() == uid), None)
    if existing:
        existing.update({
            "full_name": req.full_name.strip(), "hostel_block": req.hostel_block.strip(),
            "room": req.room.strip(), "department": req.department.strip(),
            "phone": req.phone.strip(), "email": req.email.strip(), "dob": req.dob.strip()
        })
        return {"success": True, "message": f"Updated student record for {req.full_name}."}

    USERS_DB.append({
        "user_id": uid, "password": req.dob.strip(), "full_name": req.full_name.strip(),
        "role": "Student", "authority_title": "Verified Resident", "institute_id": "SVNIT",
        "hostel_block": req.hostel_block.strip(), "floor": "Resident Wing", "room": req.room.strip(),
        "phone": req.phone.strip(), "email": req.email.strip(), "department": req.department.strip(), "dob": req.dob.strip()
    })
    return {"success": True, "message": f"Student {req.full_name} onboarded! Default password is DOB ({req.dob})."}

@app.post("/api/warden/reset-student-password")
def warden_reset_student(req: PasswordResetReq, warden_id: str = Query("CW_GAJJAR")):
    target = next((u for u in USERS_DB if u["user_id"].upper() == req.target_user_id.strip().upper()), None)
    if not target:
        raise HTTPException(status_code=404, detail="Student not found.")
    default_dob = target.get("dob", "123")
    target["password"] = default_dob
    return {"success": True, "message": f"Password reset to DOB ({default_dob})."}

@app.post("/api/student/change-password")
def student_change_password(req: StudentChangePassReq):
    student = next((u for u in USERS_DB if u["user_id"].upper() == req.student_id.strip().upper()), None)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    if student["password"] != req.old_password.strip() and student.get("dob") != req.old_password.strip():
        raise HTTPException(status_code=400, detail="Current password incorrect.")
    student["password"] = req.new_password.strip()
    return {"success": True, "message": "Password updated successfully!"}

@app.get("/api/complaints")
def get_complaints(role: str = "Dean", user_id: str = "", hostel_block: str = "All", department: str = ""):
    if role == "Student":
        return [c for c in COMPLAINTS_DB if c["student_id"].upper() == user_id.upper()]
    if role == "Warden" and hostel_block != "All":
        return [c for c in COMPLAINTS_DB if c["hostel_block"].lower() == hostel_block.lower()]
    if role == "Staff":
        dept_key = (department or user_id).strip().upper()
        matched = [c for c in COMPLAINTS_DB if dept_key in c["category"].upper() or dept_key in c["routed_to"].upper()]
        if hostel_block and hostel_block != "All":
            matched = [c for c in matched if c["hostel_block"].lower() == hostel_block.lower()]
        return matched
    return COMPLAINTS_DB

@app.post("/api/complaints")
def create_complaint(req: ComplaintCreateReq):
    student = next((u for u in USERS_DB if u["user_id"].upper() == req.student_id.upper()), None)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    dept_obj = next((d for d in COMPLAINT_DEPARTMENTS if d["id"].upper() == req.category.upper() or d["title"].lower() == req.category.lower()), None)
    routed_title = dept_obj["title"] if dept_obj else f"{req.category} Department"
    
    new_tkt = {
        "ticket_id": f"TKT-{random.randint(100, 999)}", "student_id": student["user_id"],
        "student_name": student["full_name"], "hostel_block": student["hostel_block"], "room": student["room"],
        "category": req.category, "summary": req.summary, "description": req.description,
        "status": "Pending", "routed_to": routed_title, "staff_remark": "",
        "created_at": datetime.now().strftime("%Y-%m-%d, %I:%M %p"), "resolved_at": ""
    }
    COMPLAINTS_DB.insert(0, new_tkt)
    return {"success": True, "ticket": new_tkt}

@app.post("/api/complaints/staff-resolve")
def staff_resolve(req: StaffResolveReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            c["status"] = "Awaiting Confirmation"
            c["staff_remark"] = req.staff_remark
            c["resolved_at"] = datetime.now().strftime("%Y-%m-%d, %I:%M %p")
            return {"success": True, "ticket": c}
    raise HTTPException(status_code=404, detail="Ticket not found")

@app.post("/api/complaints/student-verify")
def student_verify(req: StudentVerifyReq):
    for c in COMPLAINTS_DB:
        if c["ticket_id"] == req.ticket_id:
            c["status"] = "Completed" if req.satisfied else "Reopened"
            return {"success": True, "ticket": c}
    raise HTTPException(status_code=404, detail="Ticket not found")

@app.get("/api/complaints/export-pdf", response_class=HTMLResponse)
def export_pdf(hostel_block: str = "All", from_date: str = "", to_date: str = ""):
    rows = COMPLAINTS_DB
    if hostel_block != "All":
        rows = [c for c in rows if c["hostel_block"] == hostel_block]
    tr_html = "".join([f"<tr><td>{c['ticket_id']}</td><td>{c['student_name']} ({c['student_id']})</td><td>{c['hostel_block']} ({c['room']})</td><td>{c['routed_to']}</td><td>{c['summary']}</td><td>{c['status']}</td><td>{c['created_at']}</td></tr>" for c in rows])
    return HTMLResponse(content=f"<html><head><title>Report</title><style>body{{font-family:Inter,sans-serif;padding:30px;}} table{{width:100%;border-collapse:collapse;margin-top:20px;}} th,td{{border:1px solid #cbd5e1;padding:10px;text-align:left;font-size:13px;}} th{{background:#f1f5f9;}}</style></head><body onload='window.print()'><h2>SVNIT Surat — Grievance Report</h2><table><thead><tr><th>ID</th><th>Resident</th><th>Hostel/Room</th><th>Department</th><th>Summary</th><th>Status</th><th>Timestamp</th></tr></thead><tbody>{tr_html}</tbody></table></body></html>")

@app.get("/api/unicore/events/export-pdf", response_class=HTMLResponse)
def export_events_pdf(year: str = "2026", club_id: str = "All"):
    rows = [e for e in EVENTS_DB if e["date"].startswith(year) and e["status"] in ["Approved", "Completed"]]
    if club_id != "All":
        rows = [e for e in rows if e["club_id"].upper() == club_id.upper()]
    event_rows = "".join([f"<tr><td>{e['event_id']}</td><td>{e['club_id']}</td><td>{e['title']}</td><td>{e['date']} ({e['start_time']}-{e['end_time']})</td><td>{e['venue']}</td><td>{len(e.get('rsvps', []))}</td><td>{e['status']}</td></tr>" for e in rows])
    return HTMLResponse(content=f"<html><head><title>Events Report</title><style>body{{font-family:Inter,sans-serif;padding:30px;}} table{{width:100%;border-collapse:collapse;margin-top:20px;}} th,td{{border:1px solid #cbd5e1;padding:10px;text-align:left;font-size:13px;}} th{{background:#f1f5f9;}}</style></head><body onload='window.print()'><h2>SVNIT Surat — Annual Events Report ({year})</h2><table><thead><tr><th>ID</th><th>Club</th><th>Title</th><th>Date & Time</th><th>Venue</th><th>RSVPs</th><th>Status</th></tr></thead><tbody>{event_rows}</tbody></table></body></html>")

@app.get("/api/unicore/clubs")
def get_clubs():
    return CLUBS_DB

@app.post("/api/unicore/clubs/update-info")
def update_club_info(req: ClubUpdateInfoReq):
    for c in CLUBS_DB:
        if c["club_id"].upper() == req.club_id.upper():
            c["mission"] = req.mission
            c["extra_dean_info"] = req.extra_dean_info
            if req.faculty_advisor: c["faculty_advisor"] = req.faculty_advisor
            if req.head_coordinator: c["head_coordinator"] = req.head_coordinator
            return {"success": True, "club": c}
    raise HTTPException(status_code=404, detail="Club not found")

@app.post("/api/unicore/clubs/add-member")
def add_club_member(req: ClubMemberAddReq):
    for c in CLUBS_DB:
        if c["club_id"].upper() == req.club_id.upper():
            if "members" not in c: c["members"] = []
            c["members"].append({"name": req.name.strip(), "roll": req.roll.strip().upper(), "position": req.position.strip(), "phone": req.phone.strip()})
            return {"success": True, "club": c}
    raise HTTPException(status_code=404, detail="Club not found")

@app.post("/api/unicore/clubs/add-gallery")
def add_club_gallery(req: ClubGalleryAddReq):
    for c in CLUBS_DB:
        if c["club_id"].upper() == req.club_id.upper():
            if "gallery" not in c: c["gallery"] = []
            c["gallery"].insert(0, {"media_type": req.media_type, "media_url": req.media_url, "caption": req.caption, "timestamp": datetime.now().strftime("%Y-%m-%d")})
            return {"success": True, "club": c}
    raise HTTPException(status_code=404, detail="Club not found")

@app.get("/api/unicore/events")
def get_events():
    return EVENTS_DB

@app.post("/api/unicore/events/propose")
def propose_event(req: EventRequisitionReq):
    clash = None
    for ev in EVENTS_DB:
        if ev["date"] == req.date and ev["status"] == "Approved":
            if not (req.end_time <= ev["start_time"] or req.start_time >= ev["end_time"]):
                clash = f"Time Overlap Warning: Conflicts with {ev['club_id']}'s '{ev['title']}' at {ev['venue']} ({ev['start_time']}-{ev['end_time']})."
    new_evt = {
        "event_id": f"EVT-{random.randint(100, 999)}", "club_id": req.club_id.upper(),
        "title": req.title, "date": req.date, "start_time": req.start_time, "end_time": req.end_time,
        "venue": req.venue, "status": "Pending Dean Approval", "submitted_by": req.submitted_by,
        "description": req.description or "Official student event.", "image_url": req.image_url or "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80",
        "registration_link": req.registration_link, "type": "Upcoming", "rsvps": [], "feedbacks": []
    }
    EVENTS_DB.insert(0, new_evt)
    return {"success": True, "message": clash or "Proposal sent to Dean successfully!", "event": new_evt}

@app.post("/api/unicore/events/approve")
def approve_event(event_id: str = Query(...), action: str = Query(...)):
    for ev in EVENTS_DB:
        if ev["event_id"] == event_id:
            ev["status"] = action
            return {"success": True, "event": ev}
    raise HTTPException(status_code=404, detail="Event not found")

@app.post("/api/unicore/events/rsvp")
def rsvp_event(req: EventRsvpReq):
    uid = req.student_id.strip().upper()
    for ev in EVENTS_DB:
        if ev["event_id"] == req.event_id:
            if "rsvps" not in ev: ev["rsvps"] = []
            if uid in [x.upper() for x in ev["rsvps"]]:
                ev["rsvps"] = [x for x in ev["rsvps"] if x.upper() != uid]
                attending = False
            else:
                ev["rsvps"].append(uid)
                attending = True
            return {"success": True, "attending": attending, "rsvps": ev["rsvps"], "message": "🎟️ RSVP Confirmed!" if attending else "RSVP Cancelled."}
    raise HTTPException(status_code=404, detail="Event not found")

@app.post("/api/unicore/events/feedback")
def submit_event_feedback(req: EventFeedbackReq):
    for ev in EVENTS_DB:
        if ev["event_id"] == req.event_id:
            if "feedbacks" not in ev: ev["feedbacks"] = []
            ev["feedbacks"].append({"student_id": req.student_id.upper(), "rating": req.rating, "review": req.review})
            all_r = [f["rating"] for f in ev["feedbacks"]]
            avg_r = round(sum(all_r) / len(all_r), 1)
            ev["ai_audit"] = {"total_attendees": max(len(ev.get("rsvps", [])) * 35, 100), "average_rating": avg_r, "sentiment": "Positive", "key_pros": [f["review"] for f in ev["feedbacks"]]}
            return {"success": True, "event": ev}
    raise HTTPException(status_code=404, detail="Event not found")

@app.get("/api/notices")
def get_notices(role: str = "Dean"):
    if role == "Student": return [n for n in NOTICES_DB if n["status"] == "Approved"]
    return NOTICES_DB

@app.post("/api/notices/propose")
def propose_notice(req: NoticeCreateReq):
    new_n = {
        "notice_id": f"NOT-{random.randint(100, 999)}", "club_id": req.club_id.upper(),
        "title": req.title, "message": req.message, "target_branch": req.target_branch,
        "target_year": req.target_year, "registration_link": req.registration_link,
        "status": "Pending Dean Approval", "created_at": datetime.now().strftime("%Y-%m-%d")
    }
    NOTICES_DB.insert(0, new_n)
    return {"success": True, "notice": new_n, "message": "Notice sent to Dean for approval!"}

@app.post("/api/notices/approve")
def approve_notice(notice_id: str = Query(...), action: str = Query(...)):
    for n in NOTICES_DB:
        if n["notice_id"] == notice_id:
            n["status"] = action
            return {"success": True, "notice": n}
    raise HTTPException(status_code=404, detail="Notice not found")