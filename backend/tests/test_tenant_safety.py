import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

os.environ["DATABASE_URL"] = ""
_test_db_dir = tempfile.TemporaryDirectory(prefix="hms-tenant-safety-")
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

    def test_verified_student_emails_can_use_college_subdomains(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("SVNIT")
        try:
            for email in (
                "u26ce011@ced.svnit.ac.in",
                "student@ee.svnit.ac.in",
                "student@med.svnit.ac.in",
                "student@svnit.ac.in",
            ):
                with self.subTest(email=email):
                    self.assertTrue(main.is_tenant_email(email))
            self.assertFalse(main.is_tenant_email("student@svnit.ac.in.example.com"))
            self.assertFalse(main.is_tenant_email("student@example.com"))
        finally:
            main.ACTIVE_COLLEGE_ID.reset(context_token)

    def test_google_branch_email_links_to_existing_student_id(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("TESTCOLLEGE")
        try:
            conn = main.get_conn()
            main.db_exec(
                conn,
                """
                INSERT INTO users
                    (college_id, user_id, password, full_name, role, authority_title,
                     institute_id, hostel_block, year, room, phone, email, department, dob, wing)
                VALUES (?, ?, '', ?, 'Student', 'Verified Student', ?, '', '', '', '', ?, '', '', '')
                """,
                ("TESTCOLLEGE", "BRANCH-STUDENT", "Branch Student", "TESTCOLLEGE", "branch-student@example.edu"),
            )
            conn.commit()
            conn.close()
            account = main.get_account_for_google_claims(
                {
                    "email": "branch-student@dept.example.edu",
                    "email_verified": True,
                    "name": "Branch Student",
                }
            )
            self.assertEqual(account["user_id"], "BRANCH-STUDENT")
            self.assertEqual(account["email"], "branch-student@dept.example.edu")
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
                "SELECT password FROM users WHERE password IS NOT NULL AND password != ''",
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
            with patch.object(main, "_encrypt_face_reference", return_value="encrypted-test-face-reference"):
                registered = main.register_device_binding(
                    main.DeviceBindingRegisterReq(
                        device_binding_token=device_token,
                        reference_image_base64="data:image/jpeg;base64," + ("A" * 100),
                        consent_confirmed=True,
                    ),
                    request,
                )
            self.assertTrue(registered["device_binding_ready"])
            self.assertTrue(registered["face_enrolled"])
            self.assertNotIn("device_token_hash", registered)
            attendance_request = main.DeviceBeaconMarkReq(
                device_binding_token=device_token,
                wing_beacon_id="A-BEACON",
                rssi=-52,
                live_image_base64="data:image/jpeg;base64," + ("A" * 100),
            )
            with patch.object(main, "_verify_face_image", return_value=False):
                with self.assertRaises(HTTPException) as mismatch:
                    main.verify_identity_and_mark_attendance(attendance_request, request)
            self.assertEqual(mismatch.exception.status_code, 401)
            self.assertEqual(
                mismatch.exception.detail,
                "Biometric 3D Mesh Mismatch: Face does not match enrolled resident",
            )
            with self.assertRaises(HTTPException) as legacy_bypass:
                main.mark_beacon_attendance(attendance_request, request)
            self.assertEqual(legacy_bypass.exception.status_code, 410)
            with patch.object(main, "_verify_face_image", return_value=True):
                marked = main.verify_identity_and_mark_attendance(attendance_request, request)
            self.assertEqual(marked["attendance_log"]["status"], "Present (Server Face Verification + Beacon)")
            request.state.user = {"user_id": "W_ATTENDANCE", "role": "Warden", "hostel_block": "Attendance Hostel"}
            active_detail = main.get_attendance_session(restarted["session"]["session_id"], request)
            self.assertEqual(active_detail["records"][0]["status"], "Present")
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

    def test_staff_passwords_are_hashed_and_admin_can_reset_and_sign_in(self):
        context_token = main.ACTIVE_COLLEGE_ID.set("SVNIT")
        try:
            request = build_request([(b"host", b"api.svnitcampus.in")])
            request.state.user = {"role": "Dean", "user_id": "DEAN"}
            password = "Unique-Warden-Access-2026!"
            result = main.set_staff_account_password(
                main.StaffPasswordSetReq(user_id="CW_GAJJAR", password=password),
                request,
            )
            self.assertTrue(result["success"])

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

            with patch.object(
                main,
                "verify_google_credential",
                return_value={
                    "email": "founder@svnit.ac.in",
                    "email_verified": True,
                },
            ):
                with self.assertRaises(HTTPException) as google_error:
                    main.google_login(main.GoogleLoginReq(credential="test-google-token"))
                self.assertEqual(google_error.exception.status_code, 403)

            main.set_staff_account_password(
                main.StaffPasswordSetReq(
                    user_id="CW_GAJJAR",
                    password="Another-Warden-Access-2026!",
                ),
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
        self.assertTrue(main.can_manage_staff_account(warden, {"role": "Staff", "managed_by": "CW_GAJJAR"}))
        self.assertFalse(main.can_manage_staff_account(warden, {"role": "Staff", "managed_by": "CW_BHABHA"}))

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
                    biometric_cred_id = 'old-credential', device_hardware_id = 'old-device'
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
        try:
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
                SET biometric_status = 'Locked', device_token_hash = ?
                WHERE college_id = ? AND UPPER(user_id) = ?
                """,
                (token_hash, "TESTCOLLEGE", "LEAVE-RETURN-STUDENT"),
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
                wing_beacon_id="A-BEACON",
                rssi=-42,
                liveness_passed=True,
            )
            with patch.object(
                main,
                "attendance_config_for_hostel",
                return_value={"wing_beacons_json": '{"Wing A":"A-BEACON"}', "attendance_test_mode": 0},
            ):
                result = main.mark_leave_return(mark_body, request)

            returned_pass = result["leave_pass"]
            self.assertEqual(returned_pass["return_status"], "Returned Late")
            self.assertTrue(returned_pass["actual_return_at"])
            self.assertEqual(returned_pass["return_beacon_id"], "A-BEACON")
            self.assertTrue(returned_pass["return_timing"].startswith("Late by "))
            self.assertNotIn("qr_token", returned_pass)
            with self.assertRaises(HTTPException) as duplicate:
                main.mark_leave_return(mark_body, request)
            self.assertEqual(duplicate.exception.status_code, 409)
        finally:
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
