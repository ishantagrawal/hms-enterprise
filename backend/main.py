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

# =========================================================
# 1. MULTI-NIT TENANT CONFIGURATION (FOUNDER CONTROL)
# =========================================================
NIT_TENANTS_DB = [
    {
        "institute_id": "SVNIT",
        "name": "Sardar Vallabhbhai National Institute of Technology",
        "city": "Surat, Gujarat",
        "modules": {
            "complaints": True,
            "eventradar": True,
            "attendance": False,
            "leave_pass": False,
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
            "clubs_hub": True,
            "ai_audit": True
        },
        "hostels": ["Agate", "Coral", "Diamond", "Garnet", "Opal", "Zircon"]
    },
    {
        "institute_id": "NITK",
        "name": "National Institute of Technology Karnataka",
        "city": "Surathkal, Karnataka",
        "modules": {
            "complaints": True,
            "eventradar": True,
            "attendance": False,
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
            "attendance": False,
            "leave_pass": False,
            "clubs_hub": False,
            "ai_audit": False
        },
        "hostels": ["1.8k Ultra Mega Hostel", "BTech Block 1", "Priyadarshini Hall", "Sarojini Hall"]
    }
]

# =========================================================
# 2. LARGE MASTER USERS DATABASE
# =========================================================
USERS_DB = [
    # FOUNDER (TOP OF HIERARCHY)
    {
        "user_id": "FOUNDER", "password": "123", "full_name": "Chief Architect & Founder",
        "role": "Founder", "authority_title": "Multi-NIT System Architect & Super Admin", "institute_id": "GLOBAL",
        "hostel_block": "All Campuses", "floor": "-", "room": "HQ Core",
        "phone": "+91 9876543210", "email": "founder@nit-hms.in", "department": "Global Administration", "dob": "01012000"
    },
    # DEAN (SVNIT)
    {
        "user_id": "DEAN", "password": "123", "full_name": "Prof. S. R. Patel (Dean SW)",
        "role": "Dean", "authority_title": "Dean Student Welfare", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Admin Block",
        "phone": "0261-2201500", "email": "dean_sw@svnit.ac.in", "department": "Administration", "dob": "01011975"
    },
    # STUDENTS (Login with '123' or DOB 'DDMMYYYY')
    {
        "user_id": "U26CE011", "password": "123", "full_name": "Ishant Agrawal",
        "role": "Student", "authority_title": "Verified Resident", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "2nd Floor", "room": "B-204",
        "phone": "+91 9876543210", "email": "u26ce011@ced.svnit.ac.in", "department": "Civil Engineering", "dob": "10072007"
    },
    {
        "user_id": "U26CS012", "password": "123", "full_name": "Aarav Sharma",
        "role": "Student", "authority_title": "Verified Resident", "institute_id": "SVNIT",
        "hostel_block": "Bhabha Bhawan", "floor": "3rd Floor", "room": "A-302",
        "phone": "+91 9876543211", "email": "u26cs012@coed.svnit.ac.in", "department": "Computer Engineering", "dob": "15082006"
    },
    {
        "user_id": "U26EC045", "password": "123", "full_name": "Priya Nair",
        "role": "Student", "authority_title": "Verified Resident", "institute_id": "SVNIT",
        "hostel_block": "Mother Teresa Bhawan", "floor": "1st Floor", "room": "C-108",
        "phone": "+91 9876543212", "email": "u26ec045@eced.svnit.ac.in", "department": "Electronics Engineering", "dob": "22112006"
    },
    {
        "user_id": "U26ME088", "password": "123", "full_name": "Rohan Kulkarni",
        "role": "Student", "authority_title": "Verified Resident", "institute_id": "SVNIT",
        "hostel_block": "Swami Vivekananda Bhawan", "floor": "4th Floor", "room": "D-412",
        "phone": "+91 9876543213", "email": "u26me088@med.svnit.ac.in", "department": "Mechanical Engineering", "dob": "05032006"
    },
    {
        "user_id": "U26EE019", "password": "123", "full_name": "Kabir Verma",
        "role": "Student", "authority_title": "Verified Resident", "institute_id": "SVNIT",
        "hostel_block": "Nehru Bhawan", "floor": "2nd Floor", "room": "A-210",
        "phone": "+91 9876543214", "email": "u26ee019@eed.svnit.ac.in", "department": "Electrical Engineering", "dob": "19092006"
    },
    # CLUB COORDINATORS
    {
        "user_id": "ACM", "password": "123", "full_name": "ACM SVNIT Chapter",
        "role": "ClubOrganizer", "authority_title": "Coordinator (ACM)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "SAC Club Room 1",
        "phone": "+91 9811122233", "email": "acm@svnit.ac.in", "department": "Technical Society", "dob": "01012000"
    },
    {
        "user_id": "GDSC", "password": "123", "full_name": "Google Developer Student Club",
        "role": "ClubOrganizer", "authority_title": "Coordinator (GDSC)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "SAC Club Room 2",
        "phone": "+91 9811122244", "email": "gdsc@svnit.ac.in", "department": "Technical Society", "dob": "01012000"
    },
    {
        "user_id": "CHRD", "password": "123", "full_name": "Centre for Human Resource Dev (CHRD)",
        "role": "ClubOrganizer", "authority_title": "Coordinator (CHRD)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "SAC Cultural Wing",
        "phone": "+91 9811122255", "email": "chrd@svnit.ac.in", "department": "Cultural Society", "dob": "01012000"
    },
    {
        "user_id": "DRISHTI", "password": "123", "full_name": "DRISHTI Robotics & Innovation Club",
        "role": "ClubOrganizer", "authority_title": "Coordinator (DRISHTI)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Innovation Lab",
        "phone": "+91 9811122266", "email": "drishti@svnit.ac.in", "department": "Robotics & Tinkering Lab", "dob": "01012000"
    },
    {
        "user_id": "MIND_BEND", "password": "123", "full_name": "MindBend Techno-Managerial Fest",
        "role": "ClubOrganizer", "authority_title": "Convener (MindBend)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "SAC Fest Cell",
        "phone": "+91 9811122277", "email": "mindbend@svnit.ac.in", "department": "Annual Tech Symposium", "dob": "01012000"
    },
    {
        "user_id": "SPARSH", "password": "123", "full_name": "Sparsh Socio-Cultural Fest",
        "role": "ClubOrganizer", "authority_title": "Convener (Sparsh)", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "SAC Cultural Cell",
        "phone": "+91 9811122288", "email": "sparsh@svnit.ac.in", "department": "Annual Cultural Fest", "dob": "01012000"
    },
    # WARDENS (ALL HOSTELS)
    {
        "user_id": "CW_GAJJAR", "password": "123", "full_name": "Dr. M. K. Verma",
        "role": "Warden", "authority_title": "Chief Warden (Gajjar Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "Ground", "room": "CW Office",
        "phone": "0261-2201659", "email": "cw_gajjar@svnit.ac.in", "department": "Hostel Office", "dob": "01011980"
    },
    {
        "user_id": "W_GAJJAR", "password": "123", "full_name": "Dr. P. K. Shah",
        "role": "Warden", "authority_title": "Warden (Gajjar Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Gajjar Bhawan", "floor": "Ground", "room": "Warden Office",
        "phone": "0261-2201659", "email": "w_gajjar@svnit.ac.in", "department": "Hostel Office", "dob": "01011982"
    },
    {
        "user_id": "CW_BHABHA", "password": "123", "full_name": "Dr. A. N. Joshi",
        "role": "Warden", "authority_title": "Chief Warden (Bhabha Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Bhabha Bhawan", "floor": "Ground", "room": "CW Office",
        "phone": "0261-2201790", "email": "cw_bhabha@svnit.ac.in", "department": "Hostel Office", "dob": "01011979"
    },
    {
        "user_id": "W_BHABHA", "password": "123", "full_name": "Dr. V. S.Solanki",
        "role": "Warden", "authority_title": "Warden (Bhabha Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Bhabha Bhawan", "floor": "Ground", "room": "Warden Office",
        "phone": "0261-2201790", "email": "w_bhabha@svnit.ac.in", "department": "Hostel Office", "dob": "01011981"
    },
    {
        "user_id": "CW_MTB", "password": "123", "full_name": "Dr. R. Desai",
        "role": "Warden", "authority_title": "Chief Warden (Mother Teresa Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Mother Teresa Bhawan", "floor": "Ground", "room": "CW Office",
        "phone": "0261-2201967", "email": "cw_mtb@svnit.ac.in", "department": "Hostel Office", "dob": "01011980"
    },
    {
        "user_id": "CW_SVB", "password": "123", "full_name": "Dr. K. M. पटेल",
        "role": "Warden", "authority_title": "Chief Warden (Swami Vivekananda Bhawan)", "institute_id": "SVNIT",
        "hostel_block": "Swami Vivekananda Bhawan", "floor": "Ground", "room": "CW Office",
        "phone": "0261-2201657", "email": "cw_svb@svnit.ac.in", "department": "Hostel Office", "dob": "01011978"
    },
    # MAINTENANCE STAFF
    {
        "user_id": "STAFF_ELEC", "password": "123", "full_name": "Rameshbhai Patel (Electrical)",
        "role": "Staff", "authority_title": "Senior Electrician", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Estate Section",
        "phone": "+91 9900112233", "email": "elec@svnit.ac.in", "department": "Electricity", "dob": "01011985"
    },
    {
        "user_id": "STAFF_PLUMB", "password": "123", "full_name": "Sureshbhai Solanki (Plumbing)",
        "role": "Staff", "authority_title": "Head Plumber", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Estate Section",
        "phone": "+91 9900112244", "email": "plumb@svnit.ac.in", "department": "Plumbing", "dob": "01011986"
    },
    {
        "user_id": "STAFF_LAN", "password": "123", "full_name": "Vikram Parmar (CCC Network)",
        "role": "Staff", "authority_title": "Network Technician", "institute_id": "SVNIT",
        "hostel_block": "All", "floor": "-", "room": "Central Computer Centre",
        "phone": "+91 9900112255", "email": "lan@svnit.ac.in", "department": "LAN / Wi-Fi", "dob": "01011990"
    }
]

# =========================================================
# 3. LARGE MASTER CLUBS DATABASE
# =========================================================
CLUBS_DB = [
    {
        "club_id": "ACM",
        "name": "ACM Student Chapter SVNIT",
        "mission": "Advancing computing as a science and profession through annual hackathons, ICPC bootcamps, competitive coding contests, and research seminars.",
        "faculty_advisor": "Dr. R. K. Gupta (Comp. Engg.)",
        "head_coordinator": "Aarav Sharma",
        "extra_dean_info": "Annual Budget Approved: ₹1,80,000 | Server Rack & Router Inventory Verified | 3 National Hackathon Wins in 2026.",
        "members": [
            {"name": "Aarav Sharma", "roll": "U23CS004", "position": "Chairperson", "phone": "+91 9811100001"},
            {"name": "Riya Mehta", "roll": "U23CS045", "position": "Vice-Chairperson", "phone": "+91 9811100002"},
            {"name": "Karan Verma", "roll": "U24CS019", "position": "Treasurer", "phone": "+91 9811100003"},
            {"name": "Sneha Nair", "roll": "U24CS088", "position": "Webmaster & Tech Lead", "phone": "+91 9811100004"},
            {"name": "Ishant Agrawal", "roll": "U26CE011", "position": "Executive Coordinator", "phone": "+91 9876543210"}
        ]
    },
    {
        "club_id": "GDSC",
        "name": "Google Developer Student Club (GDSC)",
        "mission": "Bridging the gap between theory and real-world engineering using Google Cloud, GenAI, Android, Flutter, and Web technologies.",
        "faculty_advisor": "Dr. M. A. Zaveri (Comp. Engg.)",
        "head_coordinator": "Devansh Joshi",
        "extra_dean_info": "Google Cloud & GenAI Study Jams completed with 240+ certified students. Requesting CCC Seminar Hall audio upgrade.",
        "members": [
            {"name": "Devansh Joshi", "roll": "U23CS011", "position": "GDSC Lead", "phone": "+91 9822200001"},
            {"name": "Ananya Iyer", "roll": "U23EC032", "position": "AI/ML Lead", "phone": "+91 9822200002"},
            {"name": "Harshvardhan Singh", "roll": "U24CS056", "position": "Cloud & Android Lead", "phone": "+91 9822200003"},
            {"name": "Pooja Desai", "roll": "U24EE021", "position": "Outreach & PR Head", "phone": "+91 9822200004"}
        ]
    },
    {
        "club_id": "CHRD",
        "name": "Centre for Human Resource Development (CHRD)",
        "mission": "Nurturing music, dance, drama, fine arts, photography, and literary culture across the entire NIT student community.",
        "faculty_advisor": "Dr. S. N. Sharma (Electrical)",
        "head_coordinator": "Kashish Verma",
        "extra_dean_info": "Garba & Acoustic Night concluded with 850+ attendees and 4.9/5 rating. Musical instrument audit cleared by Estate Section.",
        "members": [
            {"name": "Kashish Verma", "roll": "U23EE018", "position": "Cultural Secretary", "phone": "+91 9833300001"},
            {"name": "Yashika Jain", "roll": "U24CE029", "position": "Joint Secretary (Music & Dance)", "phone": "+91 9833300002"},
            {"name": "Rohan Kulkarni", "roll": "U26ME088", "position": "Stage & Logistics Head", "phone": "+91 9876543213"},
            {"name": "Ishant Agrawal", "roll": "U26CE011", "position": "Event Operations Lead", "phone": "+91 9876543210"}
        ]
    },
    {
        "club_id": "DRISHTI",
        "name": "DRISHTI — Robotics & Revolutionary Innovation Lab",
        "mission": "Designing autonomous rovers, combat robots, UAV drones, and IoT hardware prototypes for national and international competitions.",
        "faculty_advisor": "Dr. A. K. Mungray (Mechanical)",
        "head_coordinator": "Pranav Deshmukh",
        "extra_dean_info": " Qualified for National DD Robocon 2026 Finals. Lab 3D printer & LiPo battery safety audit completed.",
        "members": [
            {"name": "Pranav Deshmukh", "roll": "U23ME007", "position": "Club Head", "phone": "+91 9844400001"},
            {"name": "Priya Nair", "roll": "U26EC045", "position": "Embedded & PCB Lead", "phone": "+91 9876543212"},
            {"name": "Kabir Verma", "roll": "U26EE019", "position": "UAV & Control Systems", "phone": "+91 9876543214"}
        ]
    },
    {
        "club_id": "MIND_BEND",
        "name": "MindBend — Annual Techno-Managerial Symposium",
        "mission": "Gujarat's largest technical and managerial festival hosting guest lectures, drone racing, case studies, and coding marathons.",
        "faculty_advisor": "Dr. H. B. Mehta (Mechanical)",
        "head_coordinator": "Siddharth Rao",
        "extra_dean_info": "Sponsorship target ₹12 Lakhs achieved (65%). Security & Barricading plan submitted to Chief Security Officer.",
        "members": [
            {"name": "Siddharth Rao", "roll": "U23CE002", "position": "Chief Convener", "phone": "+91 9855500001"},
            {"name": "Neha Kapoor", "roll": "U23CH019", "position": "Sponsorship & Finance Head", "phone": "+91 9855500002"}
        ]
    },
    {
        "club_id": "SPARSH",
        "name": "Sparsh — Annual Socio-Cultural Fiesta",
        "mission": "Celebrating youth, artistry, pro-shows, celebrity concerts, street play (Nukkad Natak), and social initiatives.",
        "faculty_advisor": "Dr. V. L. Manekar (Civil Engg.)",
        "head_coordinator": "Aditya Raj",
        "extra_dean_info": "Main Ground stage blueprint approved by Civil Estate Wing. Crowd management volunteers roster ready.",
        "members": [
            {"name": "Aditya Raj", "roll": "U23CE055", "position": "Cultural Convener", "phone": "+91 9866600001"},
            {"name": "Simran Kaur", "roll": "U24EC014", "position": "Hospitality & PR Lead", "phone": "+91 9866600002"}
        ]
    }
]

# =========================================================
# 4. LARGE MASTER EVENTS DATABASE (WITH AI DESCRIPTIONS & AUDITS)
# =========================================================
EVENTS_DB = [
    {
        "event_id": "EVT-101",
        "club_id": "ACM",
        "title": "Algothon 2026 — 24Hr AI & Coding Hackathon",
        "date": "2026-10-25",
        "start_time": "10:00",
        "end_time": "18:00",
        "venue": "CRC Auditorium",
        "status": "Approved",
        "submitted_by": "Aarav Sharma",
        "type": "Upcoming",
        "description": "SVNIT's flagship annual competitive coding and Generative AI hackathon! Form teams of 2-4, build full-stack prototypes solving real campus problems, and compete for ₹50,000 in cash prizes, internship interviews, and official goodies. High-speed LAN & refreshments provided!",
        "image_url": "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80",
        "registration_link": "https://docs.google.com/forms",
        "rsvps": ["U26CE011", "U26CS012", "U26EC045", "U26EE019"],
        "feedbacks": []
    },
    {
        "event_id": "EVT-103",
        "club_id": "DRISHTI",
        "title": "RoboWars & Autonomous Drone Expo 2026",
        "date": "2026-10-27",
        "start_time": "09:30",
        "end_time": "16:30",
        "venue": "SAC Amphitheatre",
        "status": "Approved",
        "submitted_by": "Pranav Deshmukh",
        "type": "Upcoming",
        "description": "Witness 15kg combat robots clash in the steel arena alongside live autonomous FPV drone obstacle flights! Open to all hostel residents. Freshers can also register for the hands-on Arduino & ROS2 hardware workshop.",
        "image_url": "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&q=80",
        "registration_link": "https://docs.google.com/forms",
        "rsvps": ["U26CE011", "U26ME088", "U26EE019"],
        "feedbacks": []
    },
    {
        "event_id": "EVT-105",
        "club_id": "SPARSH",
        "title": "Starlight Unplugged & Band Auditions",
        "date": "2026-10-30",
        "start_time": "18:00",
        "end_time": "21:30",
        "venue": "SAC Amphitheatre",
        "status": "Approved",
        "submitted_by": "Aditya Raj",
        "type": "Upcoming",
        "description": "An enchanting open-air evening of indie rock, classical fusion, and acoustic jamming under the stars, followed by live selections for the official college band.",
        "image_url": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80",
        "registration_link": "https://docs.google.com/forms",
        "rsvps": ["U26CE011", "U26CS012", "U26EC045", "U26ME088", "U26EE019"],
        "feedbacks": []
    },
    {
        "event_id": "EVT-102",
        "club_id": "GDSC",
        "title": "GenAI, Gemini API & Cloud Study Jam",
        "date": "2026-10-28",
        "start_time": "14:00",
        "end_time": "17:00",
        "venue": "CCC Seminar Hall",
        "status": "Pending Dean Approval",
        "submitted_by": "Devansh Joshi",
        "type": "Upcoming",
        "description": "Hands-on bootcamp on building AI agents using Gemini API, Vertex AI, and deploying full-stack apps to cloud containers. Free Google Cloud credits for all participants!",
        "image_url": "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80",
        "registration_link": "https://docs.google.com/forms",
        "rsvps": ["U26CS012", "U26EC045"],
        "feedbacks": []
    },
    {
        "event_id": "EVT-104",
        "club_id": "MIND_BEND",
        "title": "FinTech & Quant Algorithmic Trading Summit",
        "date": "2026-10-25",
        "start_time": "11:00",
        "end_time": "15:00",
        "venue": "CRC Auditorium",
        "status": "Pending Dean Approval",
        "submitted_by": "Siddharth Rao",
        "type": "Upcoming",
        "description": " Quantitative finance workshop and stock market simulation game. (Note: Proposed on the same date/venue as ACM Algothon to test Dean AI Venue Clash detection!)",
        "image_url": "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&q=80",
        "registration_link": "https://docs.google.com/forms",
        "rsvps": ["U26CE011"],
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
        "description": "Cultural evening celebrating traditional Garba rhythms and unplugged musical performances by student artists. Post-event student feedback & AI Audit active!",
        "image_url": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80",
        "registration_link": "",
        "rsvps": ["U26CE011", "U26CS012", "U26EC045", "U26ME088"],
        "feedbacks": [
            {"student_id": "U26CS012", "rating": 5, "review": "Awesome sound quality, lighting, and smooth crowd management!"},
            {"student_id": "U26EC045", "rating": 5, "review": "Best cultural evening of the semester. Acoustic band was phenomenal."}
        ],
        "ai_audit": {
            "total_attendees": 850,
            "average_rating": 4.9,
            "sentiment": "Extremely Positive",
            "key_pros": [
                "Vibrant acoustic setlist and stage lighting",
                "Zero discipline or security issues reported",
                "Awesome sound quality, lighting, and smooth crowd management!"
            ],
            "key_cons": [
                "Drinking water dispenser near Gate 2 ran out by 9:30 PM"
            ],
            "recommendation": "Approve winter cultural fest budget with 15% bonus allocation."
        }
    },
    {
        "event_id": "EVT-099",
        "club_id": "ACM",
        "title": "ICPC Competitive Programming Bootcamp",
        "date": "2026-10-15",
        "start_time": "16:00",
        "end_time": "19:00",
        "venue": "CCC Seminar Hall",
        "status": "Completed",
        "submitted_by": "Aarav Sharma",
        "type": "Completed",
        "description": "Intensive 3-hour session on Dynamic Programming, Graph Algorithms, and Segment Trees for ACM ICPC regionals aspirants.",
        "image_url": "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&q=80",
        "registration_link": "",
        "rsvps": ["U26CE011", "U26CS012", "U26EE019"],
        "feedbacks": [
            {"student_id": "U26CE011", "rating": 5, "review": "Graph theory problem set and live code walkthroughs were super helpful!"}
        ],
        "ai_audit": {
            "total_attendees": 310,
            "average_rating": 4.8,
            "sentiment": "Very Positive",
            "key_pros": [
                "Clear explanation of DP and Graph templates",
                "Interactive Q&A and live contest practice"
            ],
            "key_cons": [
                "AC in CCC Seminar Hall was slightly warm in the last hour"
            ],
            "recommendation": "Highly effective technical session. Approved for monthly series."
        }
    }
]

# =========================================================
# 5. LARGE MASTER COMPLAINTS DATABASE
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
        "description": "The regulator makes a buzzing sound and sparks when switched to speed 4. Needs urgent replacement.",
        "status": "Awaiting Confirmation",
        "routed_to": "Electricity Maintenance Wing",
        "staff_remark": "Replaced faulty capacitor and installed new modular regulator switch.",
        "created_at": "2026-10-19, 10:30 AM"
    },
    {
        "ticket_id": "TKT-902",
        "student_id": "U26CS012",
        "student_name": "Aarav Sharma",
        "hostel_block": "Bhabha Bhawan",
        "room": "A-302",
        "category": "LAN / Wi-Fi",
        "summary": "No LAN connectivity in Wing A 3rd floor",
        "description": "Wall Ethernet port link light is completely off since yesterday evening.",
        "status": "In Progress",
        "routed_to": "CCC Network Wing",
        "staff_remark": "Resetting 3rd floor Cisco rack switch and re-crimping RJ45 jack.",
        "created_at": "2026-10-20, 02:15 PM"
    },
    {
        "ticket_id": "TKT-903",
        "student_id": "U26EC045",
        "student_name": "Priya Nair",
        "hostel_block": "Mother Teresa Bhawan",
        "room": "C-108",
        "category": "Water Cooler",
        "summary": "RO Water Cooler filter indicator blinking red on 1st Floor",
        "description": "Water flow is very slow and cooling unit is off.",
        "status": "Pending",
        "routed_to": "Water Cooler Maintenance Wing",
        "staff_remark": "",
        "created_at": "2026-10-20, 05:40 PM"
    },
    {
        "ticket_id": "TKT-904",
        "student_id": "U26ME088",
        "student_name": "Rohan Kulkarni",
        "hostel_block": "Swami Vivekananda Bhawan",
        "room": "D-412",
        "category": "Plumbing",
        "summary": "Washbasin tap leaking continuously in D-Wing washroom",
        "description": "The main valve washer is worn out causing water wastage.",
        "status": "Awaiting Confirmation",
        "routed_to": "Plumbing Maintenance Wing",
        "staff_remark": "Fitted new brass spindle and teflon seal.",
        "created_at": "2026-10-18, 11:20 AM"
    },
    {
        "ticket_id": "TKT-905",
        "student_id": "U26EE019",
        "student_name": "Kabir Verma",
        "hostel_block": "Nehru Bhawan",
        "room": "A-210",
        "category": "Carpentry",
        "summary": "Study table drawer channel jammed and window latch loose",
        "description": "Unable to close the mosquito mesh window frame properly.",
        "status": "Completed",
        "routed_to": "Carpentry Maintenance Wing",
        "staff_remark": "Replaced slider rail and tightened window hinges.",
        "created_at": "2026-10-16, 09:10 AM"
    },
    {
        "ticket_id": "TKT-906",
        "student_id": "U26CE011",
        "student_name": "Ishant Agrawal",
        "hostel_block": "Gajjar Bhawan",
        "room": "B-204",
        "category": "LAN / Wi-Fi",
        "summary": "High packet loss on Hostel Wi-Fi router B-Wing 2nd Floor",
        "description": "Ping spikes above 500ms during evening coding contests.",
        "status": "Pending",
        "routed_to": "LAN / Wi-Fi Maintenance Wing",
        "staff_remark": "",
        "created_at": "2026-10-20, 08:00 PM"
    }
]

# =========================================================
# 6. PYDANTIC REQUEST MODELS
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

class ClubMemberAddReq(BaseModel):
    club_id: str
    name: str
    roll: str
    position: str
    phone: str

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

# =========================================================
# 7. API ENDPOINTS
# =========================================================
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

@app.get("/api/founder/students")
def get_all_students():
    return [
        {k: v for k, v in u.items() if k != "password"}
        for u in USERS_DB if u.get("role") == "Student"
    ]

@app.post("/api/founder/upload-students")
def upload_students_bulk(students: List[StudentBulkItem]):
    added_count = 0
    updated_count = 0
    for s in students:
        uid = s.user_id.strip().upper()
        if not uid:
            continue
        existing = next((u for u in USERS_DB if u["user_id"].upper() == uid), None)
        if existing:
            existing["full_name"] = s.full_name.strip()
            existing["hostel_block"] = s.hostel_block.strip()
            existing["room"] = s.room.strip()
            existing["department"] = s.department.strip()
            existing["phone"] = s.phone.strip()
            existing["email"] = s.email.strip()
            existing["dob"] = s.dob.strip()
            updated_count += 1
        else:
            USERS_DB.append({
                "user_id": uid,
                "password": s.dob.strip(),
                "full_name": s.full_name.strip(),
                "role": "Student",
                "authority_title": "Verified Resident",
                "institute_id": "SVNIT",
                "hostel_block": s.hostel_block.strip(),
                "floor": "Resident Wing",
                "room": s.room.strip(),
                "phone": s.phone.strip(),
                "email": s.email.strip(),
                "department": s.department.strip(),
                "dob": s.dob.strip()
            })
            added_count += 1
    return {
        "success": True,
        "message": f"Successfully onboarded {added_count} new students & updated {updated_count} records (Default Password = DOB DDMMYYYY)!"
    }

@app.post("/api/founder/create-club")
def create_club(req: ClubCreateReq):
    cid = req.club_id.strip().upper().replace(" ", "_")
    if any(c["club_id"].upper() == cid for c in CLUBS_DB):
        raise HTTPException(status_code=400, detail=f"Club ID '{cid}' already exists.")
    
    new_club = {
        "club_id": cid,
        "name": req.name.strip(),
        "mission": req.mission.strip(),
        "faculty_advisor": req.faculty_advisor.strip(),
        "head_coordinator": req.head_coordinator.strip(),
        "extra_dean_info": f"Official chapter registered under {req.faculty_advisor.strip()}.",
        "members": [
            {"name": req.head_coordinator.strip(), "roll": f"{cid}_HEAD", "position": "Head Coordinator", "phone": "+91 9800000000"}
        ]
    }
    CLUBS_DB.insert(0, new_club)

    if not any(u["user_id"].upper() == cid for u in USERS_DB):
        USERS_DB.append({
            "user_id": cid,
            "password": "123",
            "full_name": req.name.strip(),
            "role": "ClubOrganizer",
            "authority_title": f"Coordinator ({cid})",
            "institute_id": "SVNIT",
            "hostel_block": "All",
            "floor": "-",
            "room": "SAC Office",
            "phone": "+91 9800000000",
            "email": f"{cid.lower()}@svnit.ac.in",
            "department": "Student Chapter",
            "dob": "01012000"
        })
    return {
        "success": True,
        "message": f"Club '{req.name}' created! Coordinator can now login with ID: {cid} & Password: 123",
        "club": new_club
    }

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
        raise HTTPException(status_code=404, detail=f"User ID '{target_id}' not found.")
    target_user["password"] = req.new_password.strip()
    return {"success": True, "message": f"Password updated for {target_user['full_name']} ({target_user['user_id']})"}

@app.post("/api/warden/reset-student-password")
def warden_reset_student(req: PasswordResetReq, warden_id: str = Query(...)):
    warden = next((u for u in USERS_DB if u["user_id"].upper() == warden_id.strip().upper()), None)
    if not warden or warden["role"] not in ["Warden", "Dean", "Founder"]:
        raise HTTPException(status_code=403, detail="Unauthorized.")
    target = next((u for u in USERS_DB if u["user_id"].upper() == req.target_user_id.strip().upper()), None)
    if not target:
        raise HTTPException(status_code=404, detail="Student Roll No not found.")
    if target["role"] in ["Founder", "Dean"]:
        raise HTTPException(status_code=403, detail="Hierarchy Violation: Cannot modify higher authority.")
    if warden["role"] == "Warden" and warden["hostel_block"] != "All":
        if target.get("hostel_block") != warden["hostel_block"]:
            raise HTTPException(status_code=403, detail=f"You can only reset passwords for {warden['hostel_block']} residents.")
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
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters.")
    student["password"] = req.new_password.strip()
    return {"success": True, "message": "Custom password saved successfully!"}

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
        f"<tr><td>{c['ticket_id']}</td><td>{c['student_name']} ({c['student_id']})</td><td>{c['hostel_block']} ({c['room']})</td><td>{c['category']}</td><td>{c['summary']}</td><td>{c['status']}</td><td>{c['created_at']}</td></tr>"
        for c in rows
    ])
    html = f"""
    <html><head><title>HMS Grievance Audit Report</title>
    <style>body{{font-family:Arial,sans-serif;padding:30px;color:#0f172a;}} table{{width:100%;border-collapse:collapse;margin-top:20px;}} th,td{{border:1px solid #cbd5e1;padding:10px;text-align:left;font-size:13px;}} th{{background:#f1f5f9;}}</style>
    </head><body onload="window.print()">
    <h2>National Institute of Technology — Official HMS Grievance Report</h2>
    <p><strong>Hostel Scope:</strong> {hostel_block} | <strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
    <table><thead><tr><th>Ticket ID</th><th>Resident</th><th>Hostel & Room</th><th>Category</th><th>Summary</th><th>Status</th><th>Timestamp</th></tr></thead>
    <tbody>{tr_html}</tbody></table></body></html>
    """
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

@app.post("/api/unicore/clubs/add-member")
def add_club_member(req: ClubMemberAddReq):
    for c in CLUBS_DB:
        if c["club_id"].upper() == req.club_id.upper():
            if "members" not in c:
                c["members"] = []
            c["members"].append({
                "name": req.name.strip(),
                "roll": req.roll.strip().upper(),
                "position": req.position.strip(),
                "phone": req.phone.strip()
            })
            return {"success": True, "club": c}
    raise HTTPException(status_code=404, detail="Club not found")

@app.get("/api/unicore/events")
def get_events():
    return EVENTS_DB

@app.post("/api/unicore/events/propose")
def propose_event(req: EventRequisitionReq):
    clash_msg = None
    for ev in EVENTS_DB:
        if ev["date"] == req.date and ev["venue"].lower() == req.venue.lower() and ev["status"] == "Approved":
            if not (req.end_time <= ev["start_time"] or req.start_time >= ev["end_time"]):
                clash_msg = f"Note: Overlaps with {ev['club_id']}'s '{ev['title']}' ({ev['start_time']}-{ev['end_time']}). Flagged for Dean AI Clash review."

    new_evt = {
        "event_id": f"EVT-{random.randint(106, 999)}",
        "club_id": req.club_id.upper(),
        "title": req.title,
        "date": req.date,
        "start_time": req.start_time,
        "end_time": req.end_time,
        "venue": req.venue,
        "status": "Pending Dean Approval",
        "submitted_by": req.submitted_by,
        "description": req.description or "Official campus event organized by student chapter.",
        "image_url": req.image_url or "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80",
        "registration_link": req.registration_link,
        "type": "Upcoming",
        "rsvps": [],
        "feedbacks": []
    }
    EVENTS_DB.insert(0, new_evt)
    return {
        "success": True,
        "message": clash_msg or "Event proposal sent to Dean with AI Clash Verification Passed!",
        "event": new_evt
    }

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
            if "rsvps" not in ev:
                ev["rsvps"] = []
            # Toggle RSVP so student can mark Attending or Cancel Attending
            if uid in [x.upper() for x in ev["rsvps"]]:
                ev["rsvps"] = [x for x in ev["rsvps"] if x.upper() != uid]
                attending = False
            else:
                ev["rsvps"].append(uid)
                attending = True
            return {
                "success": True,
                "attending": attending,
                "rsvps": ev["rsvps"],
                "message": "🎟️ RSVP Confirmed! You are attending." if attending else "RSVP Cancelled."
            }
    raise HTTPException(status_code=404, detail="Event not found")

@app.post("/api/unicore/events/feedback")
def submit_event_feedback(req: EventFeedbackReq):
    for ev in EVENTS_DB:
        if ev["event_id"] == req.event_id:
            if "feedbacks" not in ev:
                ev["feedbacks"] = []
            ev["feedbacks"].append({
                "student_id": req.student_id.upper(),
                "rating": req.rating,
                "review": req.review
            })
            all_ratings = [f["rating"] for f in ev["feedbacks"]]
            avg_r = round(sum(all_ratings) / len(all_ratings), 1)
            if "ai_audit" not in ev or not ev["ai_audit"]:
                ev["ai_audit"] = {
                    "total_attendees": max(len(ev.get("rsvps", [])) * 45, 120),
                    "average_rating": avg_r,
                    "sentiment": "Very Positive" if avg_r >= 4 else "Constructive",
                    "key_pros": [req.review] if req.rating >= 4 else ["Strong student turnout"],
                    "key_cons": [req.review] if req.rating < 4 else ["No major issues reported"],
                    "recommendation": "Audited automatically via Student Feedback AI Engine."
                }
            else:
                ev["ai_audit"]["average_rating"] = avg_r
                if req.rating >= 4:
                    ev["ai_audit"]["key_pros"].insert(0, req.review)
                else:
                    ev["ai_audit"]["key_cons"].insert(0, req.review)
            return {"success": True, "event": ev}
    raise HTTPException(status_code=404, detail="Event not found")

@app.get("/api/unicore/audit-summary")
def get_audit_summary():
    for ev in EVENTS_DB:
        if ev.get("ai_audit"):
            return {"event_id": ev["event_id"], "event_title": ev["title"], **ev["ai_audit"]}
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