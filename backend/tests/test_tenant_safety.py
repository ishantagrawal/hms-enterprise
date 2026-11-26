import io
import os
import re
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

os.environ["DATABASE_URL"] = ""
_test_db_dir = tempfile.TemporaryDirectory(prefix="vidyut-tenant-safety-")
os.environ["DB_FILE"] = os.path.join(_test_db_dir.name, "test.db")
os.environ["AUTH_SECRET"] = "unit-test-secret-with-at-least-32-characters"

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi import HTTPException
from starlette.requests import Request

import main


def build_request(headers):
    return Request(
        {
            "type": "http",
            "method": "GET",
            "scheme": "https",
            "path": "/api/tenant",
            "query_string": b"",
            "server": ("api.example.edu", 443),
            "client": ("127.0.0.1", 1234),
            "headers": headers,
        }
    )


class FakeConnection:
    def __init__(self, events):
        self.events = events

    def rollback(self):
        self.events.append("rollback")

    def close(self):
        self.events.append("close")


class FakePool:
    def __init__(self, events):
        self.events = events

    def putconn(self, connection, close=False):
        self.events.append("putconn-close" if close else "putconn")


class TenantSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        conn = main.get_conn()
        modules = {
            "grievances": False,
            "mess_pulse": False,
            "event_radar": False,
            "gate_outpass": False,
            "attendance": False,
            "parent_alerts": False,
        }
        main.db_exec(
            conn,
            """
            INSERT INTO tenants
                (college_id, college_name, primary_domain, allowed_email_domain, logo_url, modules_json, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "TESTCOLLEGE",
                "Test College",
                "portal.example.edu",
                "example.edu",
                "",
                main.json.dumps(modules),
                1,
                "2026-01-01",
            ),
        )
        main.db_exec(
            conn,
            """
            INSERT INTO events
                (event_id, club_id, title, date, start_time, end_time, venue, status,
                 submitted_by, description, budget, funding_source, chief_guest,
                 expected_attendance, logistics_needs, image_url, registration_link,
                 custom_fields, rsvps, feedbacks, ai_audit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "TEST-EVENT",
                "TEST",
                "Disabled event",
                "2026-01-01",
                "10:00",
                "11:00",
                "Hall",
                "Approved",
                "TEST",
                "",
                "",
                "",
                "",
                "1",
                "",
                "",
                "",
                "[]",
                "[]",
                "[]",
                "{}",
            ),
        )
        conn.commit()
        conn.close()

    def test_attendance_v2_tables_are_additive_and_records_are_unique(self):
        conn = main.get_conn()
        try:
            tables = {
                row["name"] for row in main.db_exec(
                    conn, "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
            self.assertIn("attendance_sessions", tables)
            self.assertIn("attendance_records", tables)
            self.assertIn("attendance_v2_sessions", tables)
            self.assertIn("attendance_v2_records", tables)
            records_sql = main.db_exec(
                conn,
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
                ("attendance_v2_records",),
            ).fetchone()["sql"]
            self.assertIn("UNIQUE (session_id, student_id)", records_sql)
        finally:
            conn.close()

    def test_student_onboarding_stores_and_updates_division_without_clearing_omitted_values(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            conn = main.get_conn()
            try:
                created = main._create_or_update_student_account(
                    conn,
                    {
                        "roll_no": "DIVISION-TEST-001",
                        "full_name": "Division Student",
                        "department": "Civil",
                        "year": "2",
                        "division": "A",
                    },
                )
                conn.commit()
                self.assertEqual(created["division"], "A")

                main._create_or_update_student_account(
                    conn,
                    {
                        "roll_no": "DIVISION-TEST-001",
                        "full_name": "Division Student",
                        "department": "Civil",
                        "year": "2",
                    },
                )
                conn.commit()
                stored = main.db_exec(
                    conn,
                    "SELECT division FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
                    ("TESTCOLLEGE", "DIVISION-TEST-001"),
                ).fetchone()
                self.assertEqual(stored["division"], "A")

                main._create_or_update_student_account(
                    conn,
                    {
                        "roll_no": "DIVISION-TEST-001",
                        "full_name": "Division Student",
                        "department": "Civil",
                        "year": "2",
                        "division": "B",
                    },
                )
                conn.commit()
                stored = main.db_exec(
                    conn,
                    "SELECT division FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
                    ("TESTCOLLEGE", "DIVISION-TEST-001"),
                ).fetchone()
                self.assertEqual(stored["division"], "B")
            finally:
                conn.close()
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_onboarding_year_rollover_advances_numeric_years_once_per_academic_year(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        student_ids = [
            ("ROLLOVER-Y1", "1", "TESTCOLLEGE"),
            ("ROLLOVER-Y2", "2", "TESTCOLLEGE"),
            ("ROLLOVER-Y3", "3", "TESTCOLLEGE"),
            ("ROLLOVER-Y4", "4", "TESTCOLLEGE"),
            ("ROLLOVER-OTHER", "Graduate", "TESTCOLLEGE"),
            ("ROLLOVER-OTHER-TENANT", "1", "OTHER-COLLEGE"),
        ]
        try:
            conn = main.get_conn()
            try:
                for user_id, year, college_id in student_ids:
                    main.db_exec(
                        conn,
                        """
                        INSERT INTO users
                            (user_id, full_name, role, department, year, division, college_id)
                        VALUES (?, ?, 'Student', 'Civil', ?, 'A', ?)
                        """,
                        (user_id, user_id, year, college_id),
                    )
                conn.commit()
            finally:
                conn.close()

            request = build_request([(b"host", b"api.example.edu")])
            request.state.user = {"role": "StudentOnboarding", "user_id": "ONB-1"}
            preview = main.preview_onboarding_year_rollover(request)
            self.assertGreaterEqual(preview["counts"]["year_1"], 1)
            self.assertGreaterEqual(preview["counts"]["year_2"], 1)
            self.assertGreaterEqual(preview["counts"]["year_3"], 1)

            result = main.apply_onboarding_year_rollover(
                main.AcademicYearRolloverReq(academic_year="2026-27"),
                request,
            )
            self.assertTrue(result["success"])
            conn = main.get_conn()
            try:
                actual_years = {
                    row["user_id"]: row["year"]
                    for row in main.db_exec(
                        conn,
                        "SELECT user_id, year FROM users WHERE user_id LIKE 'ROLLOVER-%'",
                    ).fetchall()
                }
            finally:
                conn.close()
            self.assertEqual(actual_years, {
                "ROLLOVER-Y1": "2",
                "ROLLOVER-Y2": "3",
                "ROLLOVER-Y3": "4",
                "ROLLOVER-Y4": "4",
                "ROLLOVER-OTHER": "Graduate",
                "ROLLOVER-OTHER-TENANT": "1",
            })
            with self.assertRaises(HTTPException) as duplicate:
                main.apply_onboarding_year_rollover(
                    main.AcademicYearRolloverReq(academic_year="2026-27"),
                    request,
                )
            self.assertEqual(duplicate.exception.status_code, 409)
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_class_attendance_snapshots_division_and_uses_session_faculty_for_reports(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        session_id = None
        original_modules = None
        student_ids = ("DIVISION-CLASS-001", "DIVISION-CLASS-002", "DIVISION-OTHER-001")
        try:
            conn = main.get_conn()
            try:
                modules_row = main.db_exec(
                    conn, "SELECT modules_json FROM tenants WHERE college_id = ?", ("TESTCOLLEGE",)
                ).fetchone()
                original_modules = modules_row["modules_json"]
                modules = main.json.loads(original_modules)
                modules["class_attendance"] = True
                main.db_exec(
                    conn,
                    "UPDATE tenants SET modules_json = ? WHERE college_id = ?",
                    (main.json.dumps(modules), "TESTCOLLEGE"),
                )
                main.upsert_user(
                    conn,
                    (
                        "SESSION-FACULTY", "", "Session Faculty", "Faculty", "Faculty",
                        "TESTCOLLEGE", "", "", "", "", "session@example.edu", "Other", "", "",
                    ),
                )
                main.upsert_user(
                    conn,
                    (
                        "COURSE-OWNER", "", "Course Owner", "Faculty", "Faculty",
                        "TESTCOLLEGE", "", "", "", "", "owner@example.edu", "Civil", "", "",
                    ),
                )
                for user_id, division in (
                    ("DIVISION-CLASS-001", "A"),
                    ("DIVISION-CLASS-002", "A"),
                    ("DIVISION-OTHER-001", "B"),
                ):
                    main._create_or_update_student_account(
                        conn,
                        {
                            "roll_no": user_id,
                            "full_name": user_id,
                            "department": "Civil",
                            "year": "2",
                            "division": division,
                        },
                    )
                main.db_exec(
                    conn,
                    """
                    INSERT INTO users (user_id, full_name, role, department, year, division, college_id)
                    VALUES (?, ?, 'Student', ?, ?, ?, ?)
                    """,
                    ("OTHER-TENANT-STUDENT", "Outside Student", "Civil", "2", "A", "OTHER-COLLEGE"),
                )
                main.db_exec(
                    conn,
                    """
                    INSERT INTO attendance_v2_courses
                        (college_id, tenant_id, id, code, title, faculty_id, default_beacon_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
                    """,
                    (
                        "TESTCOLLEGE", "TESTCOLLEGE", "DIVISION-COURSE", "CIV-101",
                        "Civil Basics", "COURSE-OWNER", datetime.now(timezone.utc).isoformat(),
                    ),
                )
                main.db_exec(
                    conn,
                    """
                    INSERT INTO attendance_v2_beacons
                        (college_id, tenant_id, id, name, scope, owner_id, uuid, major, minor,
                         min_rssi, is_active, created_at)
                    VALUES (?, ?, ?, ?, 'CLASS', ?, ?, 1, 1, -78, 1, ?)
                    """,
                    (
                        "TESTCOLLEGE", "TESTCOLLEGE", "DIVISION-ROOM-BEACON", "Civil Room",
                        "COURSE-OWNER", "00000000-0000-0000-0000-000000000001",
                        datetime.now(timezone.utc).isoformat(),
                    ),
                )
                main.db_exec(
                    conn,
                    """
                    UPDATE users
                    SET attendance_report_email = ?, attendance_report_email_verified = 1
                    WHERE college_id = ? AND UPPER(user_id) = ?
                    """,
                    ("session@example.edu", "TESTCOLLEGE", "SESSION-FACULTY"),
                )
                conn.commit()
            finally:
                conn.close()
            with main._TENANT_CACHE_LOCK:
                main._TENANT_CACHE.pop("TESTCOLLEGE", None)

            request = build_request([(b"host", b"api.example.edu")])
            request.scope["app"] = main.app
            request.state.college_id = "TESTCOLLEGE"
            request.state.user = {"user_id": "SESSION-FACULTY", "role": "Faculty"}
            request.state.tenant = {
                "college_name": "Test College",
                "timezone": "Asia/Kolkata",
                "modules": {"class_attendance": True, "hostel_attendance": False},
            }
            attendance = main._attendance_v2_module
            groups = attendance.attendance_class_groups(request)
            selected_group = next(
                item for item in groups
                if (item["department"], item["year"], item["division"]) == ("Civil", "2", "A")
            )
            self.assertEqual(selected_group["student_count"], 2)
            session = attendance.start_session(
                attendance.SessionInput(
                    scope="CLASS",
                    beacon_id="DIVISION-ROOM-BEACON",
                    course_id="DIVISION-COURSE",
                    department="Civil",
                    year="2",
                    division="A",
                ),
                request,
            )
            session_id = session["id"]
            conn = main.get_conn()
            try:
                stored_session = main.db_exec(
                    conn,
                    "SELECT * FROM attendance_v2_sessions WHERE college_id = ? AND id = ?",
                    ("TESTCOLLEGE", session_id),
                ).fetchone()
                roster = attendance._session_roster(conn, main.__dict__, dict(stored_session))
                self.assertEqual(
                    [item["roll_no"] for item in roster],
                    ["DIVISION-CLASS-001", "DIVISION-CLASS-002"],
                )
                main.db_exec(
                    conn,
                    """
                    INSERT INTO attendance_v2_records
                        (college_id, id, session_id, student_id, roll_no, status, method, measured_rssi, marked_at)
                    VALUES (?, ?, ?, ?, ?, 'PRESENT', 'BLE_FACE', -60, ?)
                    """,
                    (
                        "TESTCOLLEGE", "DIVISION-PRESENT-RECORD", session_id,
                        "DIVISION-CLASS-002", "DIVISION-CLASS-002",
                        datetime.now(timezone.utc).isoformat(),
                    ),
                )
                conn.commit()
            finally:
                conn.close()

            student_request = build_request([(b"host", b"api.example.edu")])
            student_request.scope["app"] = main.app
            student_request.state.college_id = "TESTCOLLEGE"
            student_request.state.user = {"user_id": student_ids[0], "role": "Student"}
            student_request.state.tenant = request.state.tenant
            live = attendance.student_open_sessions(student_request)
            self.assertEqual([item["id"] for item in live], [session_id])
            self.assertEqual(live[0]["faculty_name"], "Session Faculty")
            student_request.state.user = {"user_id": student_ids[2], "role": "Student"}
            self.assertEqual(attendance.student_open_sessions(student_request), [])

            background = main._attendance_v2_module.BackgroundTasks()
            closed = attendance.close_session(session_id, request, background)
            self.assertTrue(closed["report_queued"])
            self.assertEqual(len(background.tasks), 1)

            conn = main.get_conn()
            try:
                stored_session = main.db_exec(
                    conn,
                    "SELECT * FROM attendance_v2_sessions WHERE college_id = ? AND id = ?",
                    ("TESTCOLLEGE", session_id),
                ).fetchone()
                report = attendance._report_data(conn, main.__dict__, dict(stored_session))
                absent = main.db_exec(
                    conn,
                    """
                    SELECT status, method FROM attendance_v2_records
                    WHERE college_id = ? AND session_id = ? AND UPPER(student_id) = ?
                    """,
                    ("TESTCOLLEGE", session_id, "DIVISION-CLASS-001"),
                ).fetchone()
            finally:
                conn.close()
            self.assertEqual(report["owner_id"], "SESSION-FACULTY")
            self.assertEqual(report["report_email"], "session@example.edu")
            self.assertEqual([item["roll_no"] for item in report["students"]], list(student_ids[:2]))
            self.assertEqual([item["status"] for item in report["students"]], ["ABSENT", "PRESENT"])
            self.assertEqual(absent["status"], "ABSENT")
            self.assertEqual(absent["method"], "NO_CHECK_IN")

            report_date = report["date"][:10]
            reports = attendance.list_daily_report_sessions(request, scope="CLASS", date=report_date)
            self.assertTrue(any(item["session_id"] == session_id for item in reports))
            own_pdf = attendance.download_session_report(session_id, request)
            self.assertEqual(own_pdf.media_type, "application/pdf")
            self.assertTrue(own_pdf.body.startswith(b"%PDF"))
            request.state.user = {"user_id": "COURSE-OWNER", "role": "Faculty"}
            owner_reports = attendance.list_daily_report_sessions(request, scope="CLASS", date=report_date)
            self.assertFalse(any(item["session_id"] == session_id for item in owner_reports))
            with self.assertRaises(HTTPException) as error:
                attendance.download_session_report(session_id, request)
            self.assertEqual(error.exception.status_code, 403)

            request.state.user = {"user_id": student_ids[0], "role": "Student"}
            summary = attendance.student_class_summary(request)
            self.assertEqual(len(summary), 1)
            self.assertEqual(summary[0]["faculty_name"], "Session Faculty")
            self.assertEqual(summary[0]["sessions"][0]["status"], "ABSENT")
            student_request.state.user = {"user_id": student_ids[0], "role": "Student"}
            captured_report = {}
            with patch.object(
                attendance,
                "_build_student_daily_pdf",
                side_effect=lambda data: captured_report.update(data) or b"test-pdf",
            ):
                personal_report = attendance.download_student_daily_report(
                    student_request, report_date
                )
            self.assertEqual(personal_report.body, b"test-pdf")
            self.assertEqual(captured_report["records"][0]["status"], "ABSENT")
            self.assertIn("Session Faculty", captured_report["records"][0]["label"])
        finally:
            conn = main.get_conn()
            try:
                if original_modules is not None:
                    main.db_exec(
                        conn,
                        "UPDATE tenants SET modules_json = ? WHERE college_id = ?",
                        (original_modules, "TESTCOLLEGE"),
                    )
                if session_id:
                    main.db_exec(conn, "DELETE FROM attendance_v2_records WHERE college_id = ? AND session_id = ?", ("TESTCOLLEGE", session_id))
                    main.db_exec(conn, "DELETE FROM attendance_v2_session_roster WHERE college_id = ? AND session_id = ?", ("TESTCOLLEGE", session_id))
                    main.db_exec(conn, "DELETE FROM attendance_v2_sessions WHERE college_id = ? AND id = ?", ("TESTCOLLEGE", session_id))
                main.db_exec(conn, "DELETE FROM attendance_v2_courses WHERE college_id = ? AND id = ?", ("TESTCOLLEGE", "DIVISION-COURSE"))
                main.db_exec(conn, "DELETE FROM attendance_v2_beacons WHERE college_id = ? AND id = ?", ("TESTCOLLEGE", "DIVISION-ROOM-BEACON"))
                for user_id in (*student_ids, "OTHER-TENANT-STUDENT", "SESSION-FACULTY", "COURSE-OWNER"):
                    main.db_exec(
                        conn, "DELETE FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
                        ("TESTCOLLEGE" if user_id != "OTHER-TENANT-STUDENT" else "OTHER-COLLEGE", user_id),
                    )
                conn.commit()
            finally:
                conn.close()
            for user_id in (*student_ids, "SESSION-FACULTY", "COURSE-OWNER"):
                main.invalidate_user_cache(user_id)
            with main._TENANT_CACHE_LOCK:
                main._TENANT_CACHE.pop("TESTCOLLEGE", None)
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_attendance_v2_faculty_pdf_fits_150_students_on_one_page(self):
        rows = [
            {
                "roll_no": f"U24CS{number:03d}",
                "student_name": f"Student {number}",
                "status": "PRESENT" if number % 2 else "ABSENT",
                "method": "BLE_FACE",
            }
            for number in range(1, 151)
        ]
        pdf = main._attendance_v2_module._build_report_pdf(
            {
                "students": rows,
                "course_code": "U24CS",
                "course_title": "Systems",
                "faculty_name": "Faculty",
                "date": "2026-06-11 10:00",
                "beacon_name": "Room Beacon",
                "overrides": 0,
                "institute": "Institute",
            }
        )
        self.assertEqual(len(re.findall(rb"/Type\s*/Page\b", pdf)), 1)

    def test_attendance_report_email_requires_and_accepts_verification_code(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        conn = main.get_conn()
        original_modules = main.db_exec(
            conn, "SELECT modules_json FROM tenants WHERE college_id = ?", ("TESTCOLLEGE",)
        ).fetchone()["modules_json"]
        try:
            modules = main.json.loads(original_modules)
            modules["class_attendance"] = True
            main.db_exec(
                conn,
                "UPDATE tenants SET modules_json = ? WHERE college_id = ?",
                (main.json.dumps(modules), "TESTCOLLEGE"),
            )
            main.upsert_user(
                conn,
                (
                    "REPORT-FACULTY", "", "Report Faculty", "Faculty", "Faculty",
                    "TESTCOLLEGE", "", "", "", "", "old@example.edu", "Civil", "", "",
                ),
            )
            conn.commit()
        finally:
            conn.close()

        request = build_request([(b"host", b"api.example.edu")])
        request.scope["app"] = main.app
        request.state.college_id = "TESTCOLLEGE"
        request.state.user = {"user_id": "REPORT-FACULTY", "role": "Faculty"}
        request.state.tenant = main.get_tenant_by_id("TESTCOLLEGE")
        request.state.tenant["modules"]["class_attendance"] = True
        captured = []
        try:
            with patch.object(
                main._attendance_v2_module,
                "_send_report_email_verification",
                side_effect=lambda email, code: captured.append((email, code)),
            ):
                started = main._attendance_v2_module.start_report_email_verification(
                    main._attendance_v2_module.ReportEmailStartInput(email="reports@example.edu"),
                    request,
                )
            self.assertTrue(started["success"])
            self.assertEqual(captured[0][0], "reports@example.edu")
            incorrect_code = f'{(int(captured[0][1]) + 1) % 1_000_000:06d}'
            with self.assertRaises(HTTPException):
                main._attendance_v2_module.verify_report_email(
                    main._attendance_v2_module.ReportEmailVerifyInput(
                        email="reports@example.edu", code=incorrect_code
                    ),
                    request,
                )
            verified = main._attendance_v2_module.verify_report_email(
                main._attendance_v2_module.ReportEmailVerifyInput(
                    email="reports@example.edu", code=captured[0][1]
                ),
                request,
            )
            self.assertTrue(verified["verified"])
            conn = main.get_conn()
            try:
                stored = main.db_exec(
                    conn,
                    "SELECT attendance_report_email, attendance_report_email_verified FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
                    ("TESTCOLLEGE", "REPORT-FACULTY"),
                ).fetchone()
            finally:
                conn.close()
            self.assertEqual(stored["attendance_report_email"], "reports@example.edu")
            self.assertTrue(stored["attendance_report_email_verified"])
        finally:
            conn = main.get_conn()
            main.db_exec(
                conn,
                "UPDATE tenants SET modules_json = ? WHERE college_id = ?",
                (original_modules, "TESTCOLLEGE"),
            )
            conn.commit()
            conn.close()
            with main._TENANT_CACHE_LOCK:
                main._TENANT_CACHE.pop("TESTCOLLEGE", None)
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_attendance_staff_provisioning_creates_password_account(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        request = build_request([(b"host", b"api.example.edu")])
        request.scope["app"] = main.app
        request.state.college_id = "TESTCOLLEGE"
        request.state.user = {"user_id": "TEST-DEAN", "role": "Dean"}
        request.state.tenant = main.get_tenant_by_id("TESTCOLLEGE")
        try:
            created = main._attendance_v2_module.add_approved_staff(
                main._attendance_v2_module.StaffInput(
                    user_id="V2-FACULTY",
                    name="Provisioned Faculty",
                    email="v2.faculty@example.edu",
                    role="FACULTY",
                    department_or_block="Civil",
                ),
                request,
            )
            self.assertEqual(created["user_id"], "V2-FACULTY")
            self.assertTrue(created["temporary_password"])
            login = main.password_login(
                main.PasswordLoginReq(username="V2-FACULTY", password=created["temporary_password"]),
                request,
            )
            self.assertEqual(login["user"]["role"], "Faculty")
            approved = main._attendance_v2_module.list_approved_staff(request)
            row = next(item for item in approved if item["id"] == created["id"])
            self.assertEqual(row["claimed_by_user_id"], "V2-FACULTY")
        finally:
            conn = main.get_conn()
            main.db_exec(
                conn,
                "DELETE FROM attendance_v2_pre_approved_staff WHERE college_id = ? AND email = ?",
                ("TESTCOLLEGE", "v2.faculty@example.edu"),
            )
            main.db_exec(
                conn,
                "DELETE FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
                ("TESTCOLLEGE", "V2-FACULTY"),
            )
            conn.commit()
            conn.close()
            main.invalidate_user_cache("V2-FACULTY")
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_face_reference_is_encrypted_before_persistence(self):
        import cv2
        import numpy as np

        success, encoded = cv2.imencode(".jpg", np.zeros((200, 200, 3), dtype=np.uint8))
        self.assertTrue(success)
        reference_base64 = main.base64.b64encode(encoded.tobytes()).decode("ascii")
        encrypted = main._encrypt_face_reference(reference_base64)
        self.assertNotIn(reference_base64, encrypted)
        decrypted = main._face_reference_cipher().decrypt(encrypted.encode("ascii"))
        self.assertTrue(decrypted.startswith(b"\xff\xd8"))

    def test_exact_custom_domain_resolves_and_unknown_domain_is_rejected(self):
        request = build_request(
            [
                (b"host", b"api.example.edu"),
                (b"origin", b"https://portal.example.edu"),
            ]
        )
        self.assertEqual(main.resolve_tenant_id(request), "TESTCOLLEGE")

        with self.assertRaises(HTTPException) as error:
            main.resolve_tenant_id(build_request([(b"host", b"unknown.example.edu")]))
        self.assertEqual(error.exception.status_code, 404)

    def test_public_tenant_config_includes_modules_and_hostel_configuration(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            config = main.get_public_tenant_config()
            self.assertEqual(config["college_id"], "TESTCOLLEGE")
            self.assertEqual(config["modules"]["attendance"], False)
            self.assertTrue(all(isinstance(name, str) for name in config["hostels"]))
            self.assertTrue(all("name" in hostel and "wings" in hostel for hostel in config["hostel_config"]))
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_warden_student_directory_does_not_expose_device_binding_ids(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            conn = main.get_conn()
            main.upsert_user(
                conn,
                (
                    "DIRECTORY-BIOMETRIC-STUDENT", "", "Directory Student", "Student", "",
                    "TESTCOLLEGE", "Directory Hostel", "1st Year", "A-101", "9999999999",
                    "directory.student@example.edu", "Civil", "", "Wing A",
                ),
            )
            main.db_exec(
                conn,
                """
                UPDATE users
                SET biometric_status = 'Locked', biometric_cred_id = ?, device_hardware_id = ?
                WHERE college_id = ? AND UPPER(user_id) = ?
                """,
                ("private-credential-id", "private-device-binding", "TESTCOLLEGE", "DIRECTORY-BIOMETRIC-STUDENT"),
            )
            conn.commit()
            conn.close()
            request = build_request([(b"host", b"api.example.edu")])
            request.state.user = {
                "user_id": "TEST-WARDEN",
                "role": "Warden",
                "hostel_block": "Directory Hostel",
            }

            students = main.get_hostel_students(request)

            self.assertEqual(len(students), 1)
            self.assertEqual(students[0]["biometric_status"], "Locked")
            self.assertNotIn("biometric_cred_id", students[0])
            self.assertNotIn("device_hardware_id", students[0])
            self.assertNotIn("password", students[0])
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_session_token_cannot_cross_college_boundary(self):
        token = main.create_session_token("FOUNDER", "SVNIT")
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            request = build_request(
                [
                    (b"host", b"api.example.edu"),
                    (b"authorization", f"Bearer {token}".encode()),
                ]
            )
            with self.assertRaises(HTTPException) as error:
                main.account_from_bearer(request)
            self.assertEqual(error.exception.status_code, 403)
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_disabled_modules_are_not_returned_by_portal_bootstrap(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            request = build_request([(b"host", b"api.example.edu")])
            request.state.user = {
                "user_id": "TEST-STUDENT",
                "role": "Student",
                "hostel_block": "Test Hostel",
            }
            request.state.tenant = main.get_tenant_by_id("TESTCOLLEGE")
            data = main.portal_bootstrap(request)
            self.assertEqual(data["events"], [])
            self.assertEqual(data["clubs"], [])
            self.assertEqual(data["notices"], [])
            self.assertEqual(data["complaints"], [])
            self.assertEqual(data["departments"], [])
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_tenant_module_flags_default_to_disabled_and_require_booleans(self):
        modules = main.normalize_tenant_modules(
            {
                "grievances": True,
                "event_radar": "true",
                "mess_pulse": True,
                "unknown_module": True,
            }
        )

        self.assertTrue(modules["grievances"])
        self.assertFalse(modules["event_radar"])
        self.assertFalse(modules["mess_pulse"])
        self.assertFalse(modules["hostel_attendance"])
        self.assertNotIn("unknown_module", modules)

    def test_founder_cannot_enable_unavailable_mess_pulse(self):
        request = build_request([])
        request.state.user = {"role": "Founder"}
        modules = dict(main.TENANT_MODULE_DEFAULTS)
        modules["mess_pulse"] = True

        with self.assertRaises(HTTPException) as error:
            main.update_tenant_modules(
                "TESTCOLLEGE", main.TenantModulesReq(modules=modules), request
            )

        self.assertEqual(error.exception.status_code, 400)

    def test_legacy_face_embedding_requires_reenrollment(self):
        request = build_request([])
        request.state.user = {"user_id": "ATTENDANCE-STUDENT", "role": "Student"}
        connection = Mock()
        student = {
            "biometric_status": "Locked",
            "biometric_cred_id": "credential",
            "enroll_window_until": 0,
            "face_reference_encrypted": "encrypted-reference",
            "face_embedding_encrypted": "encrypted-vector",
            "face_embedding_model": "legacy-deepface",
        }

        with patch.object(main, "get_conn", return_value=connection):
            with patch.object(main, "student_biometric_record", return_value=student):
                status = main.get_student_biometric_status(request)

        self.assertFalse(status["face_enrolled"])
        self.assertFalse(status["embedding_enrolled"])
        connection.close.assert_called_once()

    def test_enrollment_uses_shared_mobilefacenet_embedding(self):
        import base64
        import cv2
        import numpy as np

        image = np.full((112, 112, 3), 127, dtype=np.uint8)
        success, encoded = cv2.imencode(".jpg", image)
        self.assertTrue(success)
        image_base64 = "data:image/jpeg;base64," + base64.b64encode(encoded).decode("ascii")

        encrypted = main._compute_enrollment_embedding(image_base64)
        vector = np.frombuffer(
            main._embedding_cipher().decrypt(encrypted.encode("ascii")),
            dtype=np.float32,
        )

        self.assertEqual(vector.shape, (128,))
        self.assertTrue(np.isfinite(vector).all())
        self.assertAlmostEqual(float(np.linalg.norm(vector)), 1.0, places=5)
        self.assertTrue(main._verify_embedding(vector.tolist(), encrypted))

    def test_module_gate_covers_legacy_and_v2_attendance_paths(self):
        disabled_tenant = {"modules": main.normalize_tenant_modules({})}
        disabled_paths = (
            "/api/warden/attendance-config",
            "/api/biometric/register",
            "/api/attendance/mark",
            "/api/attendance-v2/courses",
            "/api/attendance-v2/hostel/sessions",
            "/api/outpasses",
            "/api/complaints",
        )

        for path in disabled_paths:
            with self.subTest(path=path):
                with self.assertRaises(HTTPException) as error:
                    main.require_tenant_module(path, disabled_tenant)
                self.assertEqual(error.exception.status_code, 404)

        enabled_tenant = {
            "modules": main.normalize_tenant_modules(
                {"attendance": True, "class_attendance": True, "hostel_attendance": True}
            )
        }
        self.assertIsNone(
            main.require_tenant_module("/api/warden/attendance-config", enabled_tenant)
        )

    def test_native_tenant_domain_selects_enabled_college(self):
        request = build_request(
            [
                (b"origin", b"capacitor://localhost"),
                (b"x-campus-domain", b"portal.example.edu"),
            ]
        )

        self.assertEqual(main.resolve_tenant_id(request), "TESTCOLLEGE")

    def test_native_tenant_domain_rejects_unknown_college(self):
        request = build_request(
            [
                (b"origin", b"capacitor://localhost"),
                (b"x-campus-domain", b"unknown.example.edu"),
            ]
        )

        with self.assertRaises(HTTPException) as error:
            main.resolve_tenant_id(request)

        self.assertEqual(error.exception.status_code, 404)

    def test_registered_web_origin_cannot_be_overridden_by_native_tenant_header(self):
        request = build_request(
            [
                (b"origin", b"https://portal.example.edu"),
                (b"x-campus-domain", b"unknown.example.edu"),
            ]
        )

        self.assertEqual(main.resolve_tenant_id(request), "TESTCOLLEGE")

    def test_unassigned_warden_cannot_use_bootstrap_to_read_all_hostels(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            request = build_request([(b"host", b"api.example.edu")])
            request.state.user = {
                "user_id": "UNASSIGNED-WARDEN",
                "role": "Warden",
                "hostel_block": "",
            }
            request.state.tenant = main.get_tenant_by_id("TESTCOLLEGE")

            with self.assertRaises(HTTPException) as error:
                main.portal_bootstrap(request)

            self.assertEqual(error.exception.status_code, 403)
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_legacy_seeded_passwords_are_cleared(self):
        conn = main.get_conn()
        try:
            passwords = main.db_exec(
                conn,
                "SELECT password FROM users WHERE college_id = 'SVNIT' AND password IS NOT NULL AND password != ''",
            ).fetchall()
            self.assertEqual(passwords, [])
        finally:
            conn.close()

    def test_password_migration_pattern_is_bound_for_postgres(self):
        cursor = Mock()
        connection = Mock()
        connection.cursor.return_value = cursor
        pattern = f"{main.PASSWORD_HASH_PREFIX}%"
        with patch.object(main, "USE_POSTGRES", True):
            main.db_exec(
                connection,
                "UPDATE users SET password = '' WHERE password NOT LIKE ?",
                (pattern,),
            )
        cursor.execute.assert_called_once_with(
            "UPDATE users SET password = '' WHERE password NOT LIKE %s",
            (pattern,),
        )

    def test_attendance_geofence_enforces_radius_and_accuracy(self):
        session = {
            "geofence_latitude": 21.0,
            "geofence_longitude": 72.9,
            "geofence_radius_m": 150,
            "geofence_max_accuracy_m": 80,
        }
        main.verify_attendance_location(session, 21.0001, 72.9001, 20)
        with self.assertRaises(HTTPException) as outside:
            main.verify_attendance_location(session, 21.01, 72.9, 20)
        self.assertEqual(outside.exception.status_code, 403)
        with self.assertRaises(HTTPException) as inaccurate:
            main.verify_attendance_location(session, 21.0, 72.9, 100)
        self.assertEqual(inaccurate.exception.status_code, 403)

    def test_warden_can_configure_attendance_window_and_wing_beacons(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            conn = main.get_conn()
            main.db_exec(
                conn,
                """
                INSERT OR REPLACE INTO hostels
                    (college_id, hostel_id, name, wings_json, geofence_latitude,
                     geofence_longitude, geofence_radius_m, geofence_max_accuracy_m, enabled)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                ("TESTCOLLEGE", "ATTENDANCE", "Attendance Hostel", '["Wing A"]', 21.0, 72.9, 250, 75),
            )
            conn.commit()
            conn.close()
            request = build_request([(b"host", b"api.example.edu")])
            request.state.user = {"role": "Warden", "user_id": "W_ATTENDANCE", "hostel_block": "Attendance Hostel"}
            request.state.tenant = main.get_tenant_by_id("TESTCOLLEGE")
            result = main.update_warden_attendance_config(
                main.AttendanceConfigReq(
                    start_time="20:30",
                    end_time="01:15",
                    wing_beacons={"Wing A": "A-BEACON"},
                    test_mode=True,
                ),
                request,
            )
            config = main.get_warden_attendance_config(request)
            self.assertTrue(result["success"])
            self.assertEqual(config["wings"], ["Wing A"])
            self.assertEqual(config["start_time"], "20:30")
            self.assertEqual(config["end_time"], "01:15")
            self.assertEqual(config["wing_beacons"], {"Wing A": "A-BEACON"})
            self.assertTrue(config["test_mode"])
            self.assertNotIn("latitude", config)
            self.assertNotIn("longitude", config)
            self.assertNotIn("radius_m", config)
            self.assertNotIn("max_accuracy_m", config)

            local_now = datetime.now(main.ZoneInfo("Asia/Kolkata"))
            start_time = (local_now - timedelta(minutes=5)).strftime("%H:%M")
            end_time = (local_now + timedelta(minutes=30)).strftime("%H:%M")
            main.update_warden_attendance_config(
                main.AttendanceConfigReq(
                    start_time=start_time,
                    end_time=end_time,
                    wing_beacons={"Wing A": "A-BEACON"},
                    test_mode=False,
                ),
                request,
            )
            conn = main.get_conn()
            main.upsert_user(
                conn,
                (
                    "ATTENDANCE-STUDENT", "", "Attendance Student", "Student", "Verified Resident",
                    "TESTCOLLEGE", "Attendance Hostel", "1st Year", "101", "", "attendance@example.edu",
                    "Civil", "", "Wing A",
                ),
            )
            conn.commit()
            conn.close()
            started = main.start_attendance_session(main.AttendanceStartReq(), request)
            self.assertEqual(started["resident_count"], 1)
            self.assertEqual(started["session"]["college_id"], "TESTCOLLEGE")
            restarted = main.start_attendance_session(main.AttendanceStartReq(), request)
            self.assertNotEqual(started["session"]["session_id"], restarted["session"]["session_id"])
            request.state.user = {"user_id": "W_ATTENDANCE", "role": "Warden", "hostel_block": "Attendance Hostel"}
            session_detail = main.get_attendance_session(started["session"]["session_id"], request)
            self.assertEqual(session_detail["records"], [])
            request.state.user = {"user_id": "ATTENDANCE-STUDENT", "role": "Student"}
            attendance = main.my_attendance(request)
            self.assertEqual(len(attendance["attendance"]), 2)

            device_token = "b" * 64
            device_public_key = main.base64.b64encode(
                main.ec.generate_private_key(main.ec.SECP256R1()).public_key().public_bytes(
                    main.serialization.Encoding.DER,
                    main.serialization.PublicFormat.SubjectPublicKeyInfo,
                )
            ).decode("ascii")
            conn = main.get_conn()
            main.db_exec(
                conn,
                """
                UPDATE users
                SET biometric_status = 'Enrollment Unlocked', enroll_window_until = ?
                WHERE college_id = ? AND UPPER(user_id) = ?
                """,
                (int(main.time.time()) + 120, "TESTCOLLEGE", "ATTENDANCE-STUDENT"),
            )
            conn.commit()
            conn.close()
            request.state.user = {"user_id": "ATTENDANCE-STUDENT", "role": "Student"}
            enrollment_request = main.DeviceBindingRegisterReq(
                device_binding_token=device_token,
                reference_image_base64="data:image/jpeg;base64," + ("A" * 100),
                embedding_image_base64="data:image/jpeg;base64," + ("B" * 100),
                consent_confirmed=True,
                device_public_key=device_public_key,
            )
            with patch.object(main, "_encrypt_face_reference", return_value="encrypted-test-face-reference"):
                with patch.object(
                    main,
                    "_compute_enrollment_embedding",
                    return_value="encrypted-test-embedding",
                ) as compute_embedding:
                    registered = main.register_device_binding(enrollment_request, request)
            compute_embedding.assert_called_once_with("data:image/jpeg;base64," + ("B" * 100))
            self.assertEqual(enrollment_request.embedding_image_base64, "")
            self.assertTrue(registered["device_binding_ready"])
            self.assertTrue(registered["face_enrolled"])
            self.assertNotIn("device_token_hash", registered)
            status = main.get_student_biometric_status(request)
            self.assertTrue(status["face_enrolled"])
            self.assertTrue(status["embedding_enrolled"])
            with self.assertRaises(HTTPException) as legacy_bypass:
                main.mark_beacon_attendance(Mock(), request)
            self.assertEqual(legacy_bypass.exception.status_code, 410)
            request.state.user = {"user_id": "W_ATTENDANCE", "role": "Warden", "hostel_block": "Attendance Hostel"}
            active_detail = main.get_attendance_session(restarted["session"]["session_id"], request)
            self.assertEqual(active_detail["records"], [])
            request.state.user = {"role": "Warden", "user_id": "W_ATTENDANCE", "hostel_block": "Attendance Hostel"}

            past_start = (local_now - timedelta(hours=2)).strftime("%H:%M")
            past_end = (local_now - timedelta(hours=1)).strftime("%H:%M")
            main.update_warden_attendance_config(
                main.AttendanceConfigReq(
                    start_time=past_start,
                    end_time=past_end,
                    wing_beacons={"Wing A": "A-BEACON"},
                ),
                request,
            )
            with self.assertRaises(HTTPException) as outside_window:
                main.start_attendance_session(main.AttendanceStartReq(), request)
            self.assertEqual(outside_window.exception.status_code, 403)
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_warden_can_update_student_hostel_and_guardian_contact(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            conn = main.get_conn()
            main.db_exec(
                conn,
                "INSERT OR REPLACE INTO hostels (college_id, hostel_id, name, wings_json, enabled) VALUES (?, ?, ?, ?, 1)",
                ("TESTCOLLEGE", "CURRENT", "Test Hostel", '["Wing A"]'),
            )
            main.db_exec(
                conn,
                "INSERT OR REPLACE INTO hostels (college_id, hostel_id, name, wings_json, enabled) VALUES (?, ?, ?, ?, 1)",
                ("TESTCOLLEGE", "DESTINATION", "Destination Hostel", '["Wing B"]'),
            )
            main.db_exec(
                conn,
                """
                INSERT OR REPLACE INTO users
                    (college_id, user_id, password, full_name, role, authority_title,
                     institute_id, hostel_block, year, room, phone, email, department, dob, wing)
                VALUES (?, ?, '', ?, 'Student', 'Verified Resident', ?, ?, ?, ?, ?, ?, ?, '', ?)
                """,
                ("TESTCOLLEGE", "MOVE-STUDENT", "Move Student", "TESTCOLLEGE", "Test Hostel", "1st Year", "101", "9876543210", "move@example.edu", "Civil", "Wing A"),
            )
            conn.commit()
            conn.close()
            request = build_request([(b"host", b"api.example.edu")])
            request.state.user = {"role": "Warden", "user_id": "W_TEST", "hostel_block": "Test Hostel"}
            result = main.update_student_by_warden(
                main.WardenStudentUpdateReq(
                    user_id="MOVE-STUDENT",
                    hostel_block="Destination Hostel",
                    wing="Wing B",
                    room="202",
                    phone="9876543210",
                    guardian_phone="+919876543210",
                ),
                request,
            )
            self.assertTrue(result["success"])
            conn = main.get_conn()
            student = main.db_exec(
                conn,
                "SELECT hostel_block, wing, room, guardian_phone FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
                ("TESTCOLLEGE", "MOVE-STUDENT"),
            ).fetchone()
            conn.close()
            self.assertEqual(student["hostel_block"], "Destination Hostel")
            self.assertEqual(student["wing"], "Wing B")
            self.assertEqual(student["room"], "202")
            self.assertEqual(student["guardian_phone"], "+919876543210")
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_student_can_request_hostel_transfer_for_warden_review(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            conn = main.get_conn()
            main.db_exec(
                conn,
                "INSERT OR REPLACE INTO hostels (college_id, hostel_id, name, wings_json, enabled) VALUES (?, ?, ?, ?, 1)",
                ("TESTCOLLEGE", "CURRENT", "Test Hostel", '["Wing A"]'),
            )
            main.db_exec(
                conn,
                "INSERT OR REPLACE INTO hostels (college_id, hostel_id, name, wings_json, enabled) VALUES (?, ?, ?, ?, 1)",
                ("TESTCOLLEGE", "DESTINATION", "Destination Hostel", '["Wing B"]'),
            )
            main.db_exec(
                conn,
                """
                INSERT OR REPLACE INTO users
                    (college_id, user_id, password, full_name, role, authority_title,
                     institute_id, hostel_block, year, room, phone, email, department, dob, wing)
                VALUES (?, ?, '', ?, 'Student', 'Verified Resident', ?, ?, ?, ?, ?, ?, ?, '', ?)
                """,
                ("TESTCOLLEGE", "REQUEST-STUDENT", "Request Student", "TESTCOLLEGE", "Test Hostel", "1st Year", "101", "9876543210", "request@example.edu", "Civil", "Wing A"),
            )
            conn.commit()
            conn.close()
            student_request = build_request([(b"host", b"api.example.edu")])
            student_request.state.user = {"role": "Student", "user_id": "REQUEST-STUDENT"}
            created = main.create_student_profile_request(
                main.StudentProfileChangeReq(
                    hostel_block="Destination Hostel",
                    wing="Wing B",
                    room="202",
                    phone="9876543210",
                ),
                student_request,
            )
            warden_request = build_request([(b"host", b"api.example.edu")])
            warden_request.state.user = {"role": "Warden", "user_id": "W_TEST", "hostel_block": "Test Hostel"}
            reviewed = main.review_student_profile_request(
                main.ProfileRequestReviewReq(request_id=created["request"]["request_id"], decision="approved"),
                warden_request,
            )
            self.assertEqual(reviewed["status"], "Approved")
            conn = main.get_conn()
            student = main.db_exec(
                conn,
                "SELECT hostel_block, wing, room FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
                ("TESTCOLLEGE", "REQUEST-STUDENT"),
            ).fetchone()
            conn.close()
            self.assertEqual(student["hostel_block"], "Destination Hostel")
            self.assertEqual(student["wing"], "Wing B")
            self.assertEqual(student["room"], "202")
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_warden_profile_requests_match_request_hostel_or_current_directory(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            conn = main.get_conn()
            main.db_exec(
                conn,
                """
                INSERT OR REPLACE INTO users
                    (college_id, user_id, password, full_name, role, authority_title,
                     institute_id, hostel_block, year, room, phone, email, department, dob, wing)
                VALUES (?, ?, '', ?, 'Student', 'Verified Resident', ?, ?, ?, ?, ?, ?, ?, '', ?)
                """,
                ("TESTCOLLEGE", "PROFILE-ROUTING-STUDENT", "Profile Routing Student", "TESTCOLLEGE", "Test Hostel", "1st Year", "D-315", "9876543210", "profile-routing@example.edu", "Civil", "Wing D"),
            )
            main.db_exec(
                conn,
                """
                INSERT OR REPLACE INTO users
                    (college_id, user_id, password, full_name, role, authority_title,
                     institute_id, hostel_block, year, room, phone, email, department, dob, wing)
                VALUES (?, ?, '', ?, 'Student', 'Verified Resident', ?, ?, ?, ?, ?, ?, ?, '', ?)
                """,
                ("TESTCOLLEGE", "PROFILE-REQUEST-HOSTEL-STUDENT", "Request Hostel Student", "TESTCOLLEGE", "Other Hostel", "1st Year", "A-101", "9876543210", "profile-request-hostel@example.edu", "Civil", "Wing A"),
            )
            for request_id, request_hostel, student_id in (
                ("PR-REQUEST-HOSTEL", "Test Hostel", "PROFILE-REQUEST-HOSTEL-STUDENT"),
                ("PR-CURRENT-DIRECTORY", "Unassigned Hostel", "PROFILE-ROUTING-STUDENT"),
            ):
                main.db_exec(
                    conn,
                    """
                    INSERT OR REPLACE INTO student_profile_requests
                        (request_id, student_id, hostel_block, requested_changes, status,
                         created_at, reviewed_at, reviewed_by, review_remark, college_id)
                    VALUES (?, ?, ?, '{}', 'Pending', ?, '', '', '', ?)
                    """,
                    (request_id, student_id, request_hostel, "2026-04-20T10:00:00", "TESTCOLLEGE"),
                )
            conn.commit()
            conn.close()

            request = build_request([(b"host", b"api.example.edu")])
            request.state.user = {
                "user_id": "W_TEST",
                "role": "Warden",
                "hostel_block": "Test Hostel",
            }
            request.state.tenant = main.get_tenant_by_id("TESTCOLLEGE")

            requests = main.get_warden_profile_requests(request)
            self.assertEqual(
                {item["request_id"] for item in requests},
                {"PR-REQUEST-HOSTEL", "PR-CURRENT-DIRECTORY"},
            )
            bootstrap = main.portal_bootstrap(request)
            self.assertEqual(
                {item["request_id"] for item in bootstrap["profile_requests"]},
                {"PR-REQUEST-HOSTEL", "PR-CURRENT-DIRECTORY"},
            )

            reviewed = main.review_student_profile_request(
                main.ProfileRequestReviewReq(
                    request_id="PR-CURRENT-DIRECTORY",
                    decision="rejected",
                ),
                request,
            )
            self.assertEqual(reviewed["status"], "Rejected")
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_day_scholar_profile_transfer_routes_to_requested_hostel(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            conn = main.get_conn()
            main.db_exec(
                conn,
                "INSERT OR REPLACE INTO hostels (college_id, hostel_id, name, wings_json, enabled) VALUES (?, ?, ?, ?, 1)",
                ("TESTCOLLEGE", "DESTINATION", "Destination Hostel", '["Wing B"]'),
            )
            main.db_exec(
                conn,
                """
                INSERT OR REPLACE INTO users
                    (college_id, user_id, password, full_name, role, authority_title,
                     institute_id, hostel_block, year, room, phone, email, department, dob, wing)
                VALUES (?, ?, '', ?, 'Student', 'Day Scholar', ?, 'Day Scholar', ?, 'N/A', ?, ?, ?, '', 'N/A')
                """,
                ("TESTCOLLEGE", "DAY-TRANSFER-STUDENT", "Day Transfer Student", "TESTCOLLEGE", "1st Year", "9876543210", "day-transfer@example.edu", "Civil"),
            )
            conn.commit()
            conn.close()

            student_request = build_request([(b"host", b"api.example.edu")])
            student_request.state.user = {"role": "Student", "user_id": "DAY-TRANSFER-STUDENT"}
            created = main.create_student_profile_request(
                main.StudentProfileChangeReq(
                    hostel_block="Destination Hostel",
                    wing="Wing B",
                    room="202",
                    phone="9876543210",
                ),
                student_request,
            )
            self.assertEqual(created["request"]["hostel_block"], "Destination Hostel")

            warden_request = build_request([(b"host", b"api.example.edu")])
            warden_request.state.user = {
                "role": "Warden",
                "user_id": "W_DESTINATION",
                "hostel_block": "Destination Hostel",
            }
            requests = main.get_warden_profile_requests(warden_request)
            self.assertEqual([item["request_id"] for item in requests], [created["request"]["request_id"]])
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_svnit_hostel_seed_and_known_room_assignment_repair(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("SVNIT")
        try:
            conn = main.get_conn()
            main.db_exec(
                conn,
                """
                INSERT OR REPLACE INTO users
                    (college_id, user_id, password, full_name, role, authority_title,
                     institute_id, hostel_block, year, room, phone, email, department, dob, wing)
                VALUES ('SVNIT', 'U26CE011', '', 'Test Resident', 'Student',
                        'Day Scholar', 'SVNIT', 'Day Scholar', '1st Year', 'D-315',
                        '', 'resident@example.edu', 'Civil', '', 'N/A')
                """,
            )
            conn.commit()
            conn.close()

            main.init_db()

            conn = main.get_conn()
            student = main.db_exec(
                conn,
                "SELECT hostel_block, wing FROM users WHERE college_id = 'SVNIT' AND UPPER(user_id) = 'U26CE011'",
            ).fetchone()
            hostel_count = main.db_exec(
                conn,
                """
                SELECT COUNT(*) AS count FROM hostels
                WHERE college_id = 'SVNIT' AND enabled = 1
                  AND name IN (
                      'Gajjar Bhawan', 'Bhabha Bhawan', 'Swami Vivekananda Bhawan',
                      'Mother Teresa Bhawan', 'Nehru Bhawan', 'Tagore Bhawan',
                      'Raman Bhawan', 'Sarabhai Bhawan'
                  )
                """,
            ).fetchone()["count"]
            conn.close()
            self.assertEqual(student["hostel_block"], "Gajjar Bhawan")
            self.assertEqual(student["wing"], "Wing D")
            self.assertEqual(hostel_count, 8)
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_founder_staff_account_list_includes_dean_phone(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("SVNIT")
        try:
            request = build_request([(b"host", b"api.svnitcampus.in")])
            request.state.user = {"role": "Founder", "user_id": "FOUNDER"}

            accounts = main.list_staff_accounts(request)

            dean = next(account for account in accounts if account["user_id"] == "DEAN")
            self.assertIn("phone", dean)
            self.assertEqual(dean["phone"], "0261-2201500")
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_founder_tenant_listing_includes_aggregate_account_counts(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("*")
        try:
            conn = main.get_conn()
            try:
                before_students = main.db_exec(
                    conn,
                    "SELECT COUNT(*) AS count FROM users WHERE college_id = 'TESTCOLLEGE' AND UPPER(role) = 'STUDENT'",
                ).fetchone()["count"]
                before_main_accounts = main.db_exec(
                    conn,
                    "SELECT COUNT(*) AS count FROM users WHERE college_id = 'TESTCOLLEGE' AND UPPER(role) IN ('DEAN', 'STUDENTONBOARDING', 'BEACONMANAGER')",
                ).fetchone()["count"]
                for user_id, role in (
                    ("COUNT-STUDENT", "Student"),
                    ("COUNT-DEAN", "Dean"),
                    ("COUNT-ONBOARDING", "StudentOnboarding"),
                    ("COUNT-BEACON", "BeaconManager"),
                ):
                    main.db_exec(
                        conn,
                        """
                        INSERT INTO users
                            (user_id, full_name, role, department, year, division, college_id)
                        VALUES (?, ?, ?, '', '', '', 'TESTCOLLEGE')
                        """,
                        (user_id, user_id, role),
                    )
                conn.commit()
            finally:
                conn.close()

            request = build_request([(b"host", b"api.example.edu")])
            request.state.user = {"role": "Founder", "user_id": "FOUNDER"}
            tenant = next(
                item for item in main.list_tenants(request)
                if item["college_id"] == "TESTCOLLEGE"
            )
            self.assertEqual(tenant["student_count"], before_students + 1)
            self.assertEqual(tenant["main_account_count"], before_main_accounts + 3)
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_founder_billing_status_is_scoped_to_the_configured_razorpay_customer(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("*")
        request = build_request([(b"host", b"api.example.edu")])
        request.state.user = {"role": "Founder", "user_id": "FOUNDER"}
        customer_id = "cust_12345678901234"
        try:
            with patch.dict(os.environ, {"RAZORPAY_KEY_ID": "", "RAZORPAY_KEY_SECRET": ""}):
                unconfigured = main.get_founder_tenant_billing_status("TESTCOLLEGE", request)
            self.assertEqual(unconfigured["status"], "not_configured")
            with self.assertRaises(HTTPException) as invalid_customer:
                main.update_founder_tenant_razorpay_customer(
                    "TESTCOLLEGE",
                    main.RazorpayCustomerIdReq(razorpay_customer_id="invalid"),
                    request,
                )
            self.assertEqual(invalid_customer.exception.status_code, 422)
            main.update_founder_tenant_razorpay_customer(
                "TESTCOLLEGE",
                main.RazorpayCustomerIdReq(razorpay_customer_id=customer_id),
                request,
            )
            subscription_response = io.BytesIO(main.json.dumps({
                "items": [
                    {"id": "sub_match", "customer_id": customer_id, "status": "active", "created_at": 1760000000},
                    {"id": "sub_other", "customer_id": "cust_00000000000000", "status": "active"},
                ]
            }).encode("utf-8"))
            invoice_response = io.BytesIO(main.json.dumps({
                "items": [
                    {"id": "inv_match", "customer_id": customer_id, "status": "paid", "amount": 10000, "currency": "INR"},
                    {"id": "inv_other", "customer_id": "cust_00000000000000", "status": "issued"},
                ]
            }).encode("utf-8"))
            with patch.dict(os.environ, {"RAZORPAY_KEY_ID": "test-key", "RAZORPAY_KEY_SECRET": "test-secret"}):
                with patch("main.urlopen", side_effect=[subscription_response, invoice_response]):
                    result = main.get_founder_tenant_billing_status("TESTCOLLEGE", request)
            self.assertEqual(result["status"], "ready")
            self.assertEqual([item["id"] for item in result["subscriptions"]], ["sub_match"])
            self.assertEqual([item["id"] for item in result["invoices"]], ["inv_match"])
            self.assertNotIn("customer_details", result["invoices"][0])
        finally:
            main.update_founder_tenant_razorpay_customer(
                "TESTCOLLEGE",
                main.RazorpayCustomerIdReq(razorpay_customer_id=""),
                request,
            )
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_staff_passwords_are_hashed_and_admin_can_reset_and_sign_in(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("SVNIT")
        try:
            request = build_request([(b"host", b"api.svnitcampus.in")])
            request.state.user = {"role": "Dean", "user_id": "DEAN"}
            result = main.set_staff_account_password(
                main.StaffPasswordSetReq(user_id="CW_GAJJAR"),
                request,
            )
            self.assertTrue(result["success"])
            password = result["temporary_password"]

            conn = main.get_conn()
            main.upsert_user(
                conn,
                (
                    "CW_GAJJAR",
                    "",
                    "Gajjar Bhawan Warden Office",
                    "Warden",
                    "Chief Warden / Warden",
                    "SVNIT",
                    "Gajjar Bhawan",
                    "-",
                    "Warden Office",
                    "0261-2201659",
                    "warden_gajjar@svnit.ac.in",
                    "Hostel Administration",
                    "",
                    "",
                ),
            )
            conn.commit()
            conn.close()

            staff_accounts = main.list_staff_accounts(request)
            warden = next(account for account in staff_accounts if account["user_id"] == "CW_GAJJAR")
            self.assertTrue(warden["has_password"])
            self.assertNotIn("password", warden)

            login_result = main.password_login(
                main.PasswordLoginReq(username="cw_gajjar", password=password),
                request,
            )
            self.assertEqual(login_result["user"]["role"], "Warden")
            self.assertNotIn("password", login_result["user"])
            self.assertTrue(main.verify_session_token(login_result["token"]))

            main.set_staff_account_password(
                main.StaffPasswordSetReq(user_id="CW_GAJJAR"),
                request,
            )
            session_request = build_request(
                [
                    (b"host", b"api.svnitcampus.in"),
                    (b"authorization", f"Bearer {login_result['token']}".encode()),
                ]
            )
            with self.assertRaises(HTTPException) as expired_error:
                main.account_from_bearer(session_request)
            self.assertEqual(expired_error.exception.status_code, 401)

            with self.assertRaises(HTTPException) as error:
                main.password_login(
                    main.PasswordLoginReq(username="CW_GAJJAR", password="wrong-password"),
                    request,
                )
            self.assertEqual(error.exception.status_code, 401)
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_staff_password_manager_hierarchy(self):
        self.assertTrue(main.can_manage_staff_account(
            {"role": "Founder", "user_id": "FOUNDER"},
            {"role": "Dean"},
        ))
        self.assertTrue(main.can_manage_staff_account(
            {"role": "Founder", "user_id": "FOUNDER"},
            {"role": "StudentOnboarding"},
        ))
        self.assertTrue(main.can_manage_staff_account(
            {"role": "Founder", "user_id": "FOUNDER"},
            {"role": "BeaconManager"},
        ))
        self.assertFalse(main.can_manage_staff_account(
            {"role": "Founder", "user_id": "FOUNDER"},
            {"role": "Warden"},
        ))
        dean = {"role": "Dean", "user_id": "DEAN"}
        self.assertTrue(main.can_manage_staff_account(dean, {"role": "Warden"}))
        self.assertTrue(main.can_manage_staff_account(dean, {"role": "ClubOrganizer"}))
        self.assertTrue(main.can_manage_staff_account(dean, {"role": "Staff", "hostel_block": "All"}))
        self.assertFalse(main.can_manage_staff_account(dean, {"role": "Staff", "hostel_block": "Gajjar Bhawan"}))
        warden = {"role": "Warden", "user_id": "CW_GAJJAR"}
        self.assertFalse(main.can_manage_staff_account(warden, {"role": "Staff", "managed_by": "CW_GAJJAR"}))
        self.assertFalse(main.can_manage_staff_account(warden, {"role": "Staff", "managed_by": "CW_BHABHA"}))

    def test_founder_can_provision_missing_college_main_accounts_once(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("*")
        try:
            request = build_request([(b"host", b"api.svnitcampus.in")])
            request.state.user = {"role": "Founder", "user_id": "FOUNDER"}

            result = main.provision_founder_tenant_accounts("TESTCOLLEGE", request)
            self.assertEqual(
                {account["role"] for account in result["accounts"]},
                {"StudentOnboarding", "BeaconManager"},
            )
            for account in result["accounts"]:
                self.assertEqual(len(account["temporary_password"]), main.TEMPORARY_PASSWORD_LENGTH)

            listed = main.list_founder_tenant_accounts("TESTCOLLEGE", request)
            self.assertEqual(
                {account["role"] for account in listed},
                {"StudentOnboarding", "BeaconManager"},
            )
            self.assertTrue(all(account["can_manage"] for account in listed))
            reset = main.reset_founder_tenant_account_password(
                "TESTCOLLEGE",
                main.StaffPasswordSetReq(user_id=listed[0]["user_id"]),
                request,
            )
            self.assertEqual(len(reset["temporary_password"]), main.TEMPORARY_PASSWORD_LENGTH)
            self.assertEqual(
                main.provision_founder_tenant_accounts("TESTCOLLEGE", request)["accounts"],
                [],
            )
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_founder_ad_banners_are_tenant_scoped_and_deletable(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("*")
        try:
            request = build_request([(b"host", b"api.example.edu")])
            request.state.user = {"role": "Founder", "user_id": "FOUNDER"}
            result = main.create_founder_tenant_ad(
                "TESTCOLLEGE",
                main.AdCreateReq(
                    sponsor_tag="Campus Partner",
                    title="Student offer",
                    subtitle="An offer for students",
                    target_url="https://offers.example.com/student",
                ),
                request,
            )
            listed = main.list_founder_tenant_ads("TESTCOLLEGE", request)
            ad = next(item for item in listed if item["ad_id"] == result["ad_id"])
            self.assertEqual(ad["title"], "Student offer")
            self.assertEqual(ad["college_id"], "TESTCOLLEGE")
            self.assertTrue(main.delete_founder_tenant_ad("TESTCOLLEGE", result["ad_id"], request)["success"])
            self.assertFalse(any(item["ad_id"] == result["ad_id"] for item in main.list_founder_tenant_ads("TESTCOLLEGE", request)))
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_founder_ad_banners_require_founder_and_https_urls(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("*")
        try:
            request = build_request([(b"host", b"api.example.edu")])
            request.state.user = {"role": "Dean", "user_id": "DEAN"}
            req = main.AdCreateReq(
                sponsor_tag="Campus Partner",
                title="Student offer",
                subtitle="An offer for students",
                target_url="https://offers.example.com/student",
            )
            with self.assertRaises(HTTPException) as role_error:
                main.create_founder_tenant_ad("TESTCOLLEGE", req, request)
            self.assertEqual(role_error.exception.status_code, 403)

            request.state.user = {"role": "Founder", "user_id": "FOUNDER"}
            for url in ("http://offers.example.com", "https://offers.example.com:invalid"):
                with self.subTest(url=url), self.assertRaises(HTTPException) as url_error:
                    main.create_founder_tenant_ad(
                        "TESTCOLLEGE",
                        req.model_copy(update={"target_url": url}),
                        request,
                    )
                self.assertEqual(url_error.exception.status_code, 400)
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_student_password_reset_request_issues_one_time_password(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            conn = main.get_conn()
            main._create_or_update_student_account(
                conn,
                {
                    "roll_no": "RESET-STUDENT-001",
                    "full_name": "Reset Request Student",
                    "department": "Civil",
                    "year": "2",
                    "division": "A",
                },
            )
            conn.commit()
            conn.close()

            request = build_request([(b"host", b"api.svnitcampus.in")])
            request.state.user = {
                "role": "StudentOnboarding",
                "user_id": "TEST-ONBOARDING",
            }
            submitted = main.create_password_reset_request(
                main.PasswordResetRequestReq(username="RESET-STUDENT-001"),
                request,
            )
            self.assertTrue(submitted["success"])

            pending = main.list_onboarding_password_reset_requests(request)
            self.assertEqual(len(pending), 1)
            issued = main.issue_requested_student_password(pending[0]["request_id"], request)
            self.assertEqual(issued["user_id"], "RESET-STUDENT-001")
            self.assertEqual(len(issued["temporary_password"]), main.TEMPORARY_PASSWORD_LENGTH)

            conn = main.get_conn()
            student = main.db_exec(
                conn,
                "SELECT password, password_reset_required FROM users WHERE college_id = ? AND UPPER(user_id) = ?",
                ("TESTCOLLEGE", "RESET-STUDENT-001"),
            ).fetchone()
            conn.close()
            self.assertTrue(student["password_reset_required"])
            self.assertTrue(main.verify_password(issued["temporary_password"], student["password"]))
            self.assertEqual(main.list_onboarding_password_reset_requests(request), [])
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_temporary_password_is_compact_and_dean_can_edit_staff_details(self):
        password = main.generate_temporary_password()
        self.assertRegex(password, r"^[A-Za-z0-9]{10}$")
        self.assertEqual(len(password), main.TEMPORARY_PASSWORD_LENGTH)
        self.assertTrue(any(character.islower() for character in password))
        self.assertTrue(any(character.isupper() for character in password))
        self.assertTrue(any(character.isdigit() for character in password))

        context_token = main.ACTIVE_COLLEGE_ID.set("SVNIT")
        try:
            conn = main.get_conn()
            main.upsert_user(
                conn,
                (
                    "EDIT_WARDEN",
                    "",
                    "Old Warden Name",
                    "Warden",
                    "Hostel Warden",
                    "SVNIT",
                    "Gajjar Bhawan",
                    "-",
                    "Warden Office",
                    "",
                    "",
                    "Hostel Administration",
                    "",
                    "",
                ),
            )
            conn.commit()
            conn.close()

            request = build_request([(b"host", b"api.svnitcampus.in")])
            request.state.user = {"role": "Dean", "user_id": "DEAN"}
            result = main.update_dean_staff_account(
                "EDIT_WARDEN",
                main.DeanStaffEditReq(
                    full_name="Updated Warden",
                    email="warden.updated@svnit.ac.in",
                    phone="+91 98765 43210",
                    department="Hostel Administration",
                    hostel_block="Bhabha Bhawan",
                ),
                request,
            )
            self.assertTrue(result["success"])
            self.assertEqual(result["full_name"], "Updated Warden")
            self.assertEqual(result["hostel_block"], "Bhabha Bhawan")

            request.state.user = {"role": "Warden", "user_id": "EDIT_WARDEN"}
            with self.assertRaises(HTTPException) as error:
                main.update_dean_staff_account(
                    "EDIT_WARDEN",
                    main.DeanStaffEditReq(
                        full_name="Unauthorized Update",
                        email="warden.updated@svnit.ac.in",
                        phone="",
                        department="Hostel Administration",
                        hostel_block="Bhabha Bhawan",
                    ),
                    request,
                )
            self.assertEqual(error.exception.status_code, 403)
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_pooled_connection_rolls_back_before_reuse(self):
        events = []
        connection = main.PooledConnection(FakeConnection(events), FakePool(events))
        connection.close()
        self.assertEqual(events, ["rollback", "putconn"])

    def test_rotating_pass_and_attendance_codes_expire_after_30_seconds(self):
        now = datetime(2030, 1, 1, 12, 0, 5, tzinfo=timezone.utc)
        pass_row = {"pass_id": "OP-123", "qr_secret": "pass-secret"}
        pass_code = main.pass_qr_code(pass_row["pass_id"], pass_row["qr_secret"], now)
        self.assertTrue(main.verify_pass_qr_code(pass_row, pass_code, now + timedelta(seconds=20)))
        self.assertFalse(main.verify_pass_qr_code(pass_row, pass_code, now + timedelta(seconds=30)))

        attendance_row = {
            "session_id": "AS-123",
            "session_secret": "attendance-secret",
            "closes_at": (now + timedelta(hours=10)).isoformat(),
        }
        attendance_code = main.attendance_qr_code(attendance_row["session_id"], attendance_row["session_secret"], now)
        self.assertTrue(main.verify_attendance_qr_code(attendance_row, attendance_code, now + timedelta(seconds=20)))
        self.assertFalse(main.verify_attendance_qr_code(attendance_row, attendance_code, now + timedelta(seconds=30)))
        self.assertNotIn("session_secret", main.sanitized_attendance_session(attendance_row))

    def test_outpass_request_is_reviewed_and_parent_alert_is_queued(self):
        tenant_context = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            conn = main.get_conn()
            main.db_exec(
                conn,
                "INSERT OR REPLACE INTO hostels (college_id, hostel_id, name, wings_json, enabled) VALUES (?, ?, ?, ?, 1)",
                ("TESTCOLLEGE", "TEST-HOSTEL", "Test Hostel", '["Wing A"]'),
            )
            main.upsert_user(
                conn,
                (
                    "TEST-OUTPASS-STUDENT", "",
                    "Outpass Student", "Student", "Verified Resident",
                    "TESTCOLLEGE", "Test Hostel", "1st Year", "101", "9999999999",
                    "outpass.student@example.edu", "Civil", "", "Wing A",
                ),
            )
            main.db_exec(
                conn,
                "UPDATE users SET guardian_phone = ?, guardian_whatsapp_consent = 1 WHERE UPPER(user_id) = ?",
                ("+919999999999", "TEST-OUTPASS-STUDENT"),
            )
            tenant = main.get_tenant_by_id("TESTCOLLEGE")
            tenant["modules"]["parent_alerts"] = True
            conn.commit()
            conn.close()

            local_zone = main.ZoneInfo("Asia/Kolkata")
            local_departure = datetime.now(local_zone).replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=2)
            local_return = local_departure + timedelta(hours=3)
            request = build_request([(b"host", b"portal.example.edu")])
            request.state.user = {"user_id": "TEST-OUTPASS-STUDENT", "role": "Student"}
            request.state.tenant = tenant
            created = main.create_outpass(
                main.OutpassCreateReq(
                    pass_type="day",
                    destination="City",
                    purpose="Appointment",
                    departure_at=local_departure.isoformat(),
                    return_at=local_return.isoformat(),
                ),
                request,
            )
            pass_record = created["outpass"]
            self.assertEqual(pass_record["status"], "Pending")
            self.assertNotIn("qr_secret", pass_record)
            self.assertNotIn("parent_phone", pass_record)
            self.assertEqual(pass_record["college_id"], "TESTCOLLEGE")

            request.state.user = {"user_id": "TEST-WARDEN", "role": "Warden", "hostel_block": "Test Hostel"}
            reviewed = main.review_outpass(
                main.OutpassReviewReq(pass_id=pass_record["pass_id"], decision="approve"),
                request,
            )
            self.assertEqual(reviewed["outpass"]["status"], "Approved")
            self.assertEqual(reviewed["outpass"]["parent_alert_status"], "queued")
            request.state.user = {"user_id": "TEST-GUARD", "role": "Gate Security"}
            with self.assertRaises(HTTPException) as qr_access:
                main.get_outpass_qr(pass_record["pass_id"], request)
            self.assertEqual(qr_access.exception.status_code, 403)
            conn = main.get_conn()
            queued = main.db_exec(
                conn,
                "SELECT status, channel FROM notification_outbox WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
                ("TEST-OUTPASS-STUDENT",),
            ).fetchone()
            conn.close()
            self.assertEqual(queued["status"], "queued")
            self.assertEqual(queued["channel"], "whatsapp")

            request.state.user = {"user_id": "TEST-GUARD", "role": "Gate Security"}
            conn = main.get_conn()
            approved_row = main.db_exec(
                conn,
                "SELECT * FROM leave_passes WHERE pass_id = ?",
                (pass_record["pass_id"],),
            ).fetchone()
            conn.close()
            code = main.pass_qr_code(approved_row["pass_id"], approved_row["qr_secret"])
            with self.assertRaises(HTTPException) as early:
                main.scan_outpass(main.GateScanReq(code=code, direction="OUT"), request)
            self.assertEqual(early.exception.status_code, 403)
            with self.assertRaises(HTTPException) as return_before_exit:
                main.scan_outpass(main.GateScanReq(code=code, direction="RETURN"), request)
            self.assertEqual(return_before_exit.exception.status_code, 403)

            conn = main.get_conn()
            main.db_exec(
                conn,
                "UPDATE leave_passes SET departure_at = ?, return_at = ? WHERE pass_id = ?",
                (
                    (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(timespec="seconds"),
                    (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(timespec="seconds"),
                    pass_record["pass_id"],
                ),
            )
            conn.commit()
            approved_row = main.db_exec(
                conn,
                "SELECT * FROM leave_passes WHERE pass_id = ?",
                (pass_record["pass_id"],),
            ).fetchone()
            conn.close()
            code = main.pass_qr_code(approved_row["pass_id"], approved_row["qr_secret"])
            with self.assertRaises(HTTPException) as return_before_out:
                main.scan_outpass(main.GateScanReq(code=code, direction="RETURN"), request)
            self.assertEqual(return_before_out.exception.status_code, 409)
            scanned = main.scan_outpass(main.GateScanReq(code=code, direction="OUT"), request)
            self.assertEqual(scanned["direction"], "OUT")
            returned = main.scan_outpass(main.GateScanReq(code=code, direction="RETURN"), request)
            self.assertEqual(returned["direction"], "RETURN")
            with self.assertRaises(HTTPException) as duplicate:
                main.scan_outpass(main.GateScanReq(code=code, direction="RETURN"), request)
            self.assertEqual(duplicate.exception.status_code, 409)
        finally:
            main.ACTIVE_COLLEGE_ID.reset(tenant_context)

    def test_warden_unlock_and_digital_leave_approval_write_attendance_logs(self):
        tenant_context = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            conn = main.get_conn()
            main.db_exec(
                conn,
                "INSERT OR REPLACE INTO hostels (college_id, hostel_id, name, wings_json, enabled) VALUES (?, ?, ?, ?, 1)",
                ("TESTCOLLEGE", "LEAVE-HOSTEL", "Leave Hostel", '["Wing A"]'),
            )
            main.upsert_user(
                conn,
                (
                    "BIOMETRIC-LEAVE-STUDENT", "", "Leave Student", "Student", "Verified Resident",
                    "TESTCOLLEGE", "Leave Hostel", "1st Year", "303", "9999999999",
                    "leave.student@example.edu", "Civil", "", "Wing A",
                ),
            )
            main.db_exec(
                conn,
                """
                UPDATE users
                SET guardian_phone = ?, biometric_status = 'Locked',
                    biometric_cred_id = 'old-credential', device_hardware_id = 'old-device',
                    face_reference_encrypted = 'old-reference',
                    face_embedding_encrypted = 'old-embedding',
                    face_embedding_model = 'legacy-deepface'
                WHERE college_id = ? AND UPPER(user_id) = ?
                """,
                ("+919999999999", "TESTCOLLEGE", "BIOMETRIC-LEAVE-STUDENT"),
            )
            main.db_exec(
                conn,
                """
                INSERT INTO webauthn_credentials
                    (college_id, credential_id, user_id, public_key, sign_count, transports, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                ("TESTCOLLEGE", "old-credential", "BIOMETRIC-LEAVE-STUDENT", "old-key", 0, "[]", "2026-01-01"),
            )
            main.db_exec(
                conn,
                """
                INSERT INTO webauthn_credentials
                    (college_id, credential_id, user_id, public_key, sign_count, transports, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                ("TESTCOLLEGE", "night-attendance-passkey", "BIOMETRIC-LEAVE-STUDENT", "night-key", 0, "[]", "2026-01-01"),
            )
            conn.commit()
            conn.close()

            request = build_request([(b"host", b"portal.example.edu")])
            request.state.tenant = main.get_tenant_by_id("TESTCOLLEGE")
            request.state.user = {"user_id": "TEST-WARDEN", "role": "Warden", "hostel_block": "Leave Hostel"}
            unlock = main.unlock_student_biometric(
                main.BiometricUnlockReq(student_id="BIOMETRIC-LEAVE-STUDENT"),
                request,
            )
            self.assertEqual(unlock["biometric_status"], "Enrollment Unlocked")
            self.assertGreaterEqual(unlock["enroll_window_until"], int(main.time.time()) + 119)
            conn = main.get_conn()
            credentials = main.db_exec(
                conn,
                "SELECT credential_id FROM webauthn_credentials "
                "WHERE college_id = ? AND UPPER(user_id) = ?",
                ("TESTCOLLEGE", "BIOMETRIC-LEAVE-STUDENT"),
            ).fetchall()
            conn.close()
            self.assertEqual([row["credential_id"] for row in credentials], ["night-attendance-passkey"])
            conn = main.get_conn()
            biometric = main.db_exec(
                conn,
                """
                SELECT face_reference_encrypted, face_embedding_encrypted, face_embedding_model
                FROM users WHERE college_id = ? AND UPPER(user_id) = ?
                """,
                ("TESTCOLLEGE", "BIOMETRIC-LEAVE-STUDENT"),
            ).fetchone()
            conn.close()
            self.assertEqual(biometric["face_reference_encrypted"], "")
            self.assertEqual(biometric["face_embedding_encrypted"], "")
            self.assertEqual(biometric["face_embedding_model"], "")

            local_zone = main.ZoneInfo(request.state.tenant["timezone"])
            first_day = datetime.now(local_zone).date() + timedelta(days=2)
            last_day = first_day + timedelta(days=2)
            request.state.user = {"user_id": "BIOMETRIC-LEAVE-STUDENT", "role": "Student"}
            created = main.apply_digital_leave(
                main.LeaveApplyReq(
                    leave_type="Home Leave",
                    from_date=first_day.isoformat(),
                    to_date=last_day.isoformat(),
                    destination="Home",
                    reason="Family visit",
                    parent_phone="+919999999999",
                ),
                request,
            )
            leave_pass = created["leave_pass"]
            self.assertEqual(leave_pass["status"], "Pending Warden Approval")
            self.assertEqual(leave_pass["days_count"], 3)
            self.assertEqual(leave_pass["expected_return_time"], "21:00")
            self.assertNotIn("qr_token", leave_pass)
            self.assertNotIn("parent_phone", leave_pass)

            request.state.user = {"user_id": "TEST-WARDEN", "role": "Warden", "hostel_block": "Leave Hostel"}
            reviewed = main.action_digital_leave(
                main.LeaveActionReq(
                    pass_id=leave_pass["pass_id"],
                    status="Approved",
                    warden_remark="Approved",
                ),
                request,
            )
            self.assertEqual(reviewed["leave_pass"]["status"], "Approved")
            self.assertEqual(reviewed["leave_pass"]["return_status"], "Currently Out")
            self.assertEqual(reviewed["leave_pass"]["approved_by"], "TEST-WARDEN")
            conn = main.get_conn()
            logs = main.db_exec(
                conn,
                """
                SELECT date, status, verified_method FROM attendance_logs
                WHERE college_id = ? AND UPPER(student_id) = ?
                ORDER BY date
                """,
                ("TESTCOLLEGE", "BIOMETRIC-LEAVE-STUDENT"),
            ).fetchall()
            conn.close()
            self.assertEqual([row["date"] for row in logs], [first_day.isoformat(), (first_day + timedelta(days=1)).isoformat(), last_day.isoformat()])
            self.assertTrue(all(row["status"] == "On Approved Leave" for row in logs))
            self.assertTrue(all(row["verified_method"] == "warden_approved_leave" for row in logs))
        finally:
            main.ACTIVE_COLLEGE_ID.reset(tenant_context)

    def test_biometric_enrollment_options_returns_challenge_without_runtime_error(self):
        tenant_context = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            conn = main.get_conn()
            main.upsert_user(
                conn,
                (
                    "BIOMETRIC-OPTIONS-STUDENT", "", "Passkey Student", "Student", "Verified Resident",
                    "TESTCOLLEGE", "Options Hostel", "1st Year", "101", "9999999999",
                    "passkey.student@example.edu", "Civil", "", "Wing A",
                ),
            )
            main.db_exec(
                conn,
                """
                UPDATE users
                SET biometric_status = 'Enrollment Unlocked', enroll_window_until = ?
                WHERE college_id = ? AND UPPER(user_id) = ?
                """,
                (int(main.time.time()) + 120, "TESTCOLLEGE", "BIOMETRIC-OPTIONS-STUDENT"),
            )
            conn.commit()
            conn.close()

            request = build_request([(b"host", b"portal.example.edu"), (b"origin", b"https://portal.example.edu")])
            request.state.tenant = main.get_tenant_by_id("TESTCOLLEGE")
            request.state.college_id = "TESTCOLLEGE"
            request.state.user = {
                "user_id": "BIOMETRIC-OPTIONS-STUDENT",
                "full_name": "Passkey Student",
                "email": "passkey.student@example.edu",
                "role": "Student",
            }
            with patch.object(main, "expected_webauthn_origin", return_value=("https://portal.example.edu", "portal.example.edu")), \
                 patch.object(main, "generate_registration_options", return_value=Mock(challenge=b"test-challenge")), \
                 patch.object(main, "options_to_json", return_value='{"challenge":"test"}'):
                result = main.biometric_enrollment_options(request)

            self.assertTrue(result["challenge_id"])
            self.assertEqual(result["options"], {"challenge": "test"})
            self.assertNotIn("attendance_date", result)
        finally:
            main.ACTIVE_COLLEGE_ID.reset(tenant_context)

    def test_digital_leave_return_uses_device_binding_and_records_beacon_return(self):
        tenant_context = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        previous_beacon_secret = main.BEACON_HMAC_SECRETS.get("A")
        try:
            beacon_secret = "unit-test-beacon-secret"
            main.BEACON_HMAC_SECRETS["A"] = beacon_secret
            beacon_slot = int(main.time.time() // 600)
            beacon_signature = main.hmac.new(
                beacon_secret.encode(),
                f"A:{beacon_slot}".encode(),
                main.hashlib.sha256,
            ).hexdigest()[:8]
            beacon_id = f"VIDYUT-A-{beacon_signature}"
            device_token = "a" * 64
            token_hash = main.hashlib.sha256(device_token.encode("ascii")).hexdigest()
            today = datetime.now(main.ZoneInfo("Asia/Kolkata")).date().isoformat()
            conn = main.get_conn()
            main.upsert_user(
                conn,
                (
                    "LEAVE-RETURN-STUDENT", "", "Return Student", "Student", "Verified Resident",
                    "TESTCOLLEGE", "Return Hostel", "1st Year", "D-315", "9999999999",
                    "return.student@example.edu", "Civil", "", "Wing A",
                ),
            )
            main.db_exec(
                conn,
                """
                UPDATE users
                SET biometric_status = 'Locked', device_token_hash = ?, face_reference_encrypted = ?
                WHERE college_id = ? AND UPPER(user_id) = ?
                """,
                (token_hash, "encrypted-test-face-reference", "TESTCOLLEGE", "LEAVE-RETURN-STUDENT"),
            )
            conn.commit()
            conn.close()

            request = build_request([(b"host", b"portal.example.edu")])
            request.state.tenant = main.get_tenant_by_id("TESTCOLLEGE")
            request.state.user = {"user_id": "LEAVE-RETURN-STUDENT", "role": "Student"}
            created = main.apply_digital_leave(
                main.LeaveApplyReq(
                    leave_type="Day Outpass",
                    from_date=today,
                    to_date=today,
                    destination="City",
                    reason="Appointment",
                    expected_return_time="00:00",
                ),
                request,
            )
            pass_id = created["leave_pass"]["pass_id"]
            request.state.user = {"user_id": "RETURN-WARDEN", "name": "Warden", "role": "Warden", "hostel_block": "Return Hostel"}
            main.action_digital_leave(
                main.LeaveActionReq(pass_id=pass_id, status="Approved"),
                request,
            )
            request.state.user = {"user_id": "LEAVE-RETURN-STUDENT", "role": "Student"}
            mark_body = main.DeviceLeaveReturnReq(
                pass_id=pass_id,
                device_binding_token=device_token,
                wing_beacon_id=beacon_id,
                rssi=-42,
                live_image_base64="data:image/jpeg;base64," + ("A" * 100),
            )
            with patch.object(
                main,
                "attendance_config_for_hostel",
                return_value={"wing_beacons_json": main.json.dumps({"Wing A": beacon_id}), "attendance_test_mode": 0},
            ):
                with patch.object(main, "_verify_face_image", return_value=True):
                    result = main.mark_leave_return(mark_body, request)

            returned_pass = result["leave_pass"]
            self.assertEqual(returned_pass["return_status"], "Returned Late")
            self.assertTrue(returned_pass["actual_return_at"])
            self.assertEqual(returned_pass["return_beacon_id"], beacon_id)
            self.assertTrue(returned_pass["return_timing"].startswith("Late by "))
            self.assertNotIn("qr_token", returned_pass)
            with self.assertRaises(HTTPException) as duplicate:
                main.mark_leave_return(mark_body, request)
            self.assertEqual(duplicate.exception.status_code, 409)
        finally:
            if previous_beacon_secret is None:
                main.BEACON_HMAC_SECRETS.pop("A", None)
            else:
                main.BEACON_HMAC_SECRETS["A"] = previous_beacon_secret
            main.ACTIVE_COLLEGE_ID.reset(tenant_context)

    def test_beacon_attendance_options_are_disabled(self):
        tenant_context = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            credential_id = main.bytes_to_base64url(b"test-credential")
            conn = main.get_conn()
            main.upsert_user(
                conn,
                (
                    "BEACON-OPTIONS-STUDENT", "", "Beacon Student", "Student", "Verified Resident",
                    "TESTCOLLEGE", "Beacon Options Hostel", "1st Year", "102", "9999999999",
                    "beacon.student@example.edu", "Civil", "", "Wing A",
                ),
            )
            main.db_exec(
                conn,
                """
                UPDATE users
                SET biometric_status = 'Locked', biometric_cred_id = ?, device_hardware_id = ?
                WHERE college_id = ? AND UPPER(user_id) = ?
                """,
                (credential_id, "device-binding-id-1234", "TESTCOLLEGE", "BEACON-OPTIONS-STUDENT"),
            )
            main.db_exec(
                conn,
                """
                INSERT INTO webauthn_credentials
                    (college_id, credential_id, user_id, public_key, sign_count, transports, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                ("TESTCOLLEGE", credential_id, "BEACON-OPTIONS-STUDENT", "test-key", 0, "[]", "2026-01-01"),
            )
            conn.commit()
            conn.close()

            request = build_request([(b"host", b"portal.example.edu"), (b"origin", b"https://portal.example.edu")])
            request.state.tenant = main.get_tenant_by_id("TESTCOLLEGE")
            request.state.user = {"user_id": "BEACON-OPTIONS-STUDENT", "role": "Student"}
            body = main.AttendanceBeaconOptionsReq(
                biometric_cred_id=credential_id,
                device_hardware_id="device-binding-id-1234",
                wing_beacon_id="A-BEACON",
                rssi=-45,
                latitude=21.0,
                longitude=72.9,
                accuracy_m=10,
            )
            with self.assertRaises(HTTPException) as disabled:
                main.attendance_beacon_mark_options(body, request)
            self.assertEqual(disabled.exception.status_code, 410)
            with self.assertRaises(HTTPException) as legacy_mark_disabled:
                main.mark_attendance("session", None, None)
            self.assertEqual(legacy_mark_disabled.exception.status_code, 410)
            with self.assertRaises(HTTPException) as legacy_options_disabled:
                main.attendance_mark_options("session", None, None)
            self.assertEqual(legacy_options_disabled.exception.status_code, 410)
        finally:
            main.ACTIVE_COLLEGE_ID.reset(tenant_context)

    def test_beacon_attendance_checks_device_and_wing_without_gps(self):
        request = build_request([(b"host", b"portal.example.edu"), (b"origin", b"https://portal.example.edu")])
        student = {
            "user_id": "BEACON-STUDENT",
            "hostel_block": "Beacon Hostel",
            "wing": "Wing A",
            "biometric_status": "Locked",
            "biometric_cred_id": "locked-credential",
            "device_hardware_id": "locked-device-binding",
        }
        hostel = {
            "wing_beacons_json": '{"Wing A":"A-BEACON"}',
            "geofence_latitude": 21.0,
            "geofence_longitude": 72.9,
            "geofence_radius_m": 150,
            "geofence_max_accuracy_m": 80,
        }
        request_body = main.AttendanceBeaconOptionsReq(
            biometric_cred_id="locked-credential",
            device_hardware_id="locked-device-binding",
            wing_beacon_id="A-BEACON",
            rssi=-45,
        )
        main.verify_attendance_beacon(student, request_body, hostel, request)

        with self.assertRaises(HTTPException) as wrong_device:
            main.verify_attendance_beacon(
                student,
                request_body.model_copy(update={"device_hardware_id": "different-device-binding"}),
                hostel,
                request,
            )
        self.assertEqual(wrong_device.exception.status_code, 403)

        with self.assertRaises(HTTPException) as wrong_beacon:
            main.verify_attendance_beacon(
                student,
                request_body.model_copy(update={"wing_beacon_id": "B-BEACON"}),
                hostel,
                request,
            )
        self.assertEqual(wrong_beacon.exception.status_code, 403)

    def test_vidyut_beacon_identity_rejects_legacy_hms_prefix(self):
        self.assertTrue(main.is_valid_vidyut_beacon_id("VIDYUT-A-0123abcd"))
        self.assertFalse(main.is_valid_vidyut_beacon_id("HMS-A-0123abcd"))
        self.assertFalse(main.is_valid_vidyut_beacon_id("VIDYUT-A-1234567"))

    def test_attendance_beacon_window_uses_college_local_date(self):
        hostel = {"attendance_start_time": "21:00", "attendance_end_time": "02:00"}
        zone = main.ZoneInfo("Asia/Kolkata")
        after_midnight = datetime(2026, 1, 2, 1, 30, tzinfo=zone)
        self.assertEqual(main.attendance_window_date(hostel, "Asia/Kolkata", after_midnight), "2026-01-01")
        outside = datetime(2026, 1, 2, 12, 0, tzinfo=zone)
        with self.assertRaises(HTTPException) as error:
            main.attendance_window_date(hostel, "Asia/Kolkata", outside)
        self.assertEqual(error.exception.status_code, 403)

    def test_expired_attendance_session_marks_unrecorded_residents_absent(self):
        conn = main.get_conn()
        main.db_exec(
            conn,
            "INSERT OR REPLACE INTO hostels (college_id, hostel_id, name, wings_json, enabled) VALUES (?, ?, ?, ?, 1)",
            ("SVNIT", "EXPIRY-HOSTEL", "Expiry Hostel", "[]"),
        )
        main.upsert_user(
            conn,
            (
                "EXPIRY-STUDENT", "", "Expiry Student", "Student", "Verified Resident",
                "SVNIT", "Expiry Hostel", "1st Year", "202", "", "expiry@example.edu",
                "Civil", "", "Wing A",
            ),
        )
        session_id = "AS-EXPIRED-TEST"
        expired_at = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(timespec="seconds")
        main.db_exec(
            conn,
            """
            INSERT OR REPLACE INTO attendance_sessions
                (college_id, session_id, hostel_block, hostel_key, session_date,
                 started_by, started_at, closes_at, session_secret, status)
            VALUES ('SVNIT', ?, 'Expiry Hostel', 'expiry hostel', '2000-01-01',
                    'WARDEN', ?, ?, 'test-secret', 'Open')
            """,
            (session_id, expired_at, expired_at),
        )
        conn.commit()
        conn.close()

        tenant_context = main.ACTIVE_COLLEGE_ID.set("*")
        try:
            main.close_expired_attendance_sessions()
        finally:
            main.ACTIVE_COLLEGE_ID.reset(tenant_context)
        conn = main.get_conn()
        record = main.db_exec(
            conn,
            "SELECT college_id, status, method FROM attendance_records WHERE session_id = ? AND UPPER(student_id) = ?",
            (session_id, "EXPIRY-STUDENT"),
        ).fetchone()
        conn.close()
        self.assertEqual(record["college_id"], "SVNIT")
        self.assertEqual(record["status"], "Absent")
        self.assertEqual(record["method"], "automatic")

        request = build_request([(b"host", b"api.example.edu")])
        request.state.user = {"user_id": "TEST-WARDEN", "role": "Warden", "hostel_block": "Expiry Hostel"}
        request.state.tenant = main.get_tenant_by_id("TESTCOLLEGE")
        main.record_attendance_exception(
            main.AttendanceExceptionReq(
                session_id=session_id,
                student_id="EXPIRY-STUDENT",
                status="Present",
                reason="Verified at the hostel office.",
            ),
            request,
        )
        conn = main.get_conn()
        record = main.db_exec(
            conn,
            "SELECT status, method, exception_reason FROM attendance_records WHERE session_id = ? AND UPPER(student_id) = ?",
            (session_id, "EXPIRY-STUDENT"),
        ).fetchone()
        conn.close()
        self.assertEqual(record["status"], "Present")
        self.assertEqual(record["method"], "manual")
        self.assertEqual(record["exception_reason"], "Verified at the hostel office.")


if __name__ == "__main__":
    unittest.main()
