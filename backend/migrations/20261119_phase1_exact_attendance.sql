BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS beacons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('CLASS','HOSTEL')),
  owner_id text NOT NULL,
  uuid uuid NOT NULL,
  major integer NOT NULL CHECK (major BETWEEN 0 AND 65535),
  minor integer NOT NULL CHECK (minor BETWEEN 0 AND 65535),
  min_rssi integer NOT NULL DEFAULT -78 CHECK (min_rssi BETWEEN -85 AND -65),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  college_id text NOT NULL,
  UNIQUE (college_id, uuid, major, minor)
);

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  title text NOT NULL,
  faculty_id text NOT NULL,
  default_beacon_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  college_id text NOT NULL,
  UNIQUE (college_id, code),
  FOREIGN KEY (college_id, default_beacon_id) REFERENCES beacons(college_id,id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  student_id text NOT NULL,
  roll_no text NOT NULL,
  student_name text NOT NULL DEFAULT '',
  college_id text NOT NULL,
  UNIQUE (college_id, course_id, student_id),
  FOREIGN KEY (college_id, course_id) REFERENCES courses(college_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hostel_wing_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wing_name text NOT NULL,
  room_no text NOT NULL DEFAULT '',
  student_id text NOT NULL,
  roll_no text NOT NULL,
  student_name text NOT NULL DEFAULT '',
  college_id text NOT NULL,
  UNIQUE (college_id, wing_name, student_id)
);

CREATE TABLE IF NOT EXISTS student_devices (
  student_id text PRIMARY KEY,
  webauthn_credential_id text,
  public_key_cbor text,
  sign_count bigint NOT NULL DEFAULT 0,
  reference_face_embedding_enc text,
  locked_at timestamptz,
  approved_by text,
  college_id text NOT NULL,
  UNIQUE (college_id, student_id)
);

DO $$
BEGIN
  IF to_regclass('public.attendance_sessions') IS NOT NULL THEN
    ALTER TABLE attendance_sessions
      ADD COLUMN IF NOT EXISTS scope text,
      ADD COLUMN IF NOT EXISTS course_id text,
      ADD COLUMN IF NOT EXISTS wing_name text,
      ADD COLUMN IF NOT EXISTS beacon_id text,
      ADD COLUMN IF NOT EXISTS expires_at timestamptz,
      ADD COLUMN IF NOT EXISTS current_nonce text,
      ADD COLUMN IF NOT EXISTS nonce_expires_at timestamptz;
  END IF;
  IF to_regclass('public.attendance_records') IS NOT NULL THEN
    ALTER TABLE attendance_records
      ADD COLUMN IF NOT EXISTS measured_rssi integer,
      ADD COLUMN IF NOT EXISTS override_reason text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_beacons_lookup
  ON beacons (college_id, scope, is_active, uuid, major, minor);
CREATE INDEX IF NOT EXISTS idx_courses_faculty
  ON courses (college_id, faculty_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course_roll
  ON course_enrollments (college_id, course_id, roll_no);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_student
  ON course_enrollments (college_id, student_id);
CREATE INDEX IF NOT EXISTS idx_hostel_wing_members_wing_room
  ON hostel_wing_members (college_id, wing_name, room_no, roll_no);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_scope
  ON attendance_sessions (college_id, scope, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session_student
  ON attendance_records (session_id, student_id);

CREATE OR REPLACE FUNCTION app_college_id()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.college_id', true), '')
$$;
CREATE OR REPLACE FUNCTION app_user_id()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')
$$;
CREATE OR REPLACE FUNCTION app_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.role', true), '')
$$;

ALTER TABLE beacons ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_wing_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY beacon_tenant_read ON beacons FOR SELECT
USING (college_id = app_college_id());
CREATE POLICY beacon_owner_write ON beacons FOR ALL
USING (
  college_id = app_college_id()
  AND owner_id = app_user_id()
  AND app_role() IN ('Faculty','Warden')
) WITH CHECK (
  college_id = app_college_id()
  AND owner_id = app_user_id()
  AND app_role() IN ('Faculty','Warden')
);

CREATE POLICY course_faculty ON courses FOR ALL
USING (
  college_id = app_college_id()
  AND app_role() = 'Faculty'
  AND faculty_id = app_user_id()
) WITH CHECK (
  college_id = app_college_id()
  AND app_role() = 'Faculty'
  AND faculty_id = app_user_id()
);
CREATE POLICY course_student_read ON courses FOR SELECT
USING (
  college_id = app_college_id()
  AND app_role() = 'Student'
  AND EXISTS (
    SELECT 1 FROM course_enrollments e
    WHERE e.college_id = courses.college_id
      AND e.course_id = courses.id
      AND e.student_id = app_user_id()
  )
);

CREATE POLICY enrollment_faculty ON course_enrollments FOR ALL
USING (
  college_id = app_college_id()
  AND app_role() = 'Faculty'
  AND EXISTS (
    SELECT 1 FROM courses c
    WHERE c.college_id = course_enrollments.college_id
      AND c.id = course_enrollments.course_id
      AND c.faculty_id = app_user_id()
  )
) WITH CHECK (
  college_id = app_college_id()
  AND app_role() = 'Faculty'
);
CREATE POLICY enrollment_student_read ON course_enrollments FOR SELECT
USING (college_id = app_college_id() AND student_id = app_user_id());

CREATE POLICY wing_member_warden ON hostel_wing_members FOR ALL
USING (college_id = app_college_id() AND app_role() = 'Warden')
WITH CHECK (college_id = app_college_id() AND app_role() = 'Warden');
CREATE POLICY wing_member_student_read ON hostel_wing_members FOR SELECT
USING (college_id = app_college_id() AND student_id = app_user_id());

CREATE POLICY student_device_self ON student_devices FOR SELECT
USING (college_id = app_college_id() AND student_id = app_user_id());
CREATE POLICY student_device_warden ON student_devices FOR ALL
USING (college_id = app_college_id() AND app_role() = 'Warden')
WITH CHECK (college_id = app_college_id() AND app_role() = 'Warden');
COMMIT;
