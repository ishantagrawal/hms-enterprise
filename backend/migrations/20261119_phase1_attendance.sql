BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS hostel_wings (
    college_id text NOT NULL,
    wing_id uuid NOT NULL DEFAULT gen_random_uuid(),
    hostel_name text NOT NULL,
    name text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    PRIMARY KEY (college_id, wing_id),
    UNIQUE (college_id, hostel_name, name)
);

CREATE TABLE IF NOT EXISTS attendance_courses (
    college_id text NOT NULL,
    course_id uuid NOT NULL DEFAULT gen_random_uuid(),
    faculty_id text NOT NULL,
    subject_name text NOT NULL,
    subject_code text,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (college_id, course_id),
    UNIQUE (college_id, faculty_id, subject_code)
);

CREATE TABLE IF NOT EXISTS attendance_course_rosters (
    college_id text NOT NULL,
    course_id uuid NOT NULL,
    student_id text NOT NULL,
    roll_number text NOT NULL,
    added_by text NOT NULL,
    added_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (college_id, course_id, student_id),
    UNIQUE (college_id, course_id, roll_number),
    FOREIGN KEY (college_id, course_id)
        REFERENCES attendance_courses(college_id, course_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance_nonces (
    college_id text NOT NULL,
    session_id text NOT NULL,
    nonce_hash text NOT NULL,
    starts_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (college_id, session_id, nonce_hash),
    CHECK (expires_at > starts_at)
);

CREATE TABLE IF NOT EXISTS attendance_override_log (
    college_id text NOT NULL,
    override_id uuid NOT NULL DEFAULT gen_random_uuid(),
    session_id text NOT NULL,
    student_id text NOT NULL,
    previous_status text,
    new_status text NOT NULL,
    reason text NOT NULL CHECK (btrim(reason) <> ''),
    overridden_by text NOT NULL,
    overridden_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (college_id, override_id)
);

CREATE TABLE IF NOT EXISTS attendance_beacons (
    college_id text NOT NULL,
    beacon_id uuid NOT NULL DEFAULT gen_random_uuid(),
    beacon_kind text NOT NULL CHECK (beacon_kind IN ('class', 'hostel')),
    name text NOT NULL,
    uuid_value uuid NOT NULL,
    major integer NOT NULL CHECK (major BETWEEN 0 AND 65535),
    minor integer NOT NULL CHECK (minor BETWEEN 0 AND 65535),
    min_rssi integer NOT NULL CHECK (min_rssi BETWEEN -85 AND -65),
    course_id uuid,
    wing_id uuid,
    enabled boolean NOT NULL DEFAULT true,
    created_by text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (college_id, beacon_id),
    UNIQUE (college_id, uuid_value, major, minor),
    CHECK (
        (beacon_kind = 'class' AND course_id IS NOT NULL AND wing_id IS NULL)
        OR
        (beacon_kind = 'hostel' AND wing_id IS NOT NULL AND course_id IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS attendance_face_templates (
    college_id text NOT NULL,
    face_template_id uuid NOT NULL DEFAULT gen_random_uuid(),
    student_id text NOT NULL,
    template_hash text NOT NULL,
    encrypted_template bytea,
    algorithm text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    revoked_at timestamptz,
    PRIMARY KEY (college_id, face_template_id),
    UNIQUE (college_id, student_id, template_hash)
);

CREATE TABLE IF NOT EXISTS attendance_device_bindings (
    college_id text NOT NULL,
    binding_id uuid NOT NULL DEFAULT gen_random_uuid(),
    student_id text NOT NULL,
    credential_id text NOT NULL,
    face_template_id uuid,
    hardware_key_hash text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'approved', 'locked', 'reset_pending')),
    approved_by text,
    approved_at timestamptz,
    reset_by text,
    reset_at timestamptz,
    reset_reason text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (college_id, binding_id),
    UNIQUE (college_id, student_id)
);

CREATE TABLE IF NOT EXISTS attendance_enrollment_windows (
    college_id text NOT NULL,
    window_id uuid NOT NULL DEFAULT gen_random_uuid(),
    wing_id uuid,
    course_id uuid,
    opened_by text NOT NULL,
    opens_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    closes_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'open',
    PRIMARY KEY (college_id, window_id),
    CHECK (closes_at > opens_at),
    CHECK (
        (wing_id IS NOT NULL AND course_id IS NULL)
        OR
        (course_id IS NOT NULL AND wing_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS attendance_course_rosters_student_idx
    ON attendance_course_rosters (college_id, student_id);
CREATE INDEX IF NOT EXISTS attendance_nonces_expiry_idx
    ON attendance_nonces (college_id, session_id, expires_at);
CREATE INDEX IF NOT EXISTS attendance_override_session_idx
    ON attendance_override_log (college_id, session_id, overridden_at DESC);
CREATE INDEX IF NOT EXISTS attendance_beacons_class_lookup_idx
    ON attendance_beacons (college_id, course_id, enabled);
CREATE INDEX IF NOT EXISTS attendance_beacons_hostel_lookup_idx
    ON attendance_beacons (college_id, wing_id, enabled);
CREATE INDEX IF NOT EXISTS attendance_face_templates_active_idx
    ON attendance_face_templates (college_id, student_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS attendance_device_bindings_status_idx
    ON attendance_device_bindings (college_id, status);

DO $$
BEGIN
    IF to_regclass('public.attendance_sessions') IS NOT NULL THEN
        ALTER TABLE attendance_sessions
            ADD COLUMN IF NOT EXISTS session_nonce_hash text,
            ADD COLUMN IF NOT EXISTS nonce_expires_at timestamptz,
            ADD COLUMN IF NOT EXISTS session_type text DEFAULT 'hostel',
            ADD COLUMN IF NOT EXISTS course_id uuid,
            ADD COLUMN IF NOT EXISTS wing_id uuid,
            ADD COLUMN IF NOT EXISTS duration_seconds integer;
        UPDATE attendance_sessions SET session_type = 'hostel'
            WHERE session_type IS NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.attendance_records') IS NOT NULL THEN
        ALTER TABLE attendance_records
            ADD COLUMN IF NOT EXISTS face_verified boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS beacon_verified boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS nonce_verified boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS device_binding_id uuid;
        CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_session_student_unique
            ON attendance_records (session_id, student_id);
        CREATE INDEX IF NOT EXISTS attendance_records_session_status_idx
            ON attendance_records (session_id, status);
        CREATE INDEX IF NOT EXISTS attendance_records_student_marked_idx
            ON attendance_records (student_id, marked_at DESC);
    END IF;
END $$;

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

ALTER TABLE attendance_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_course_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_override_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_beacons ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_face_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_device_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_enrollment_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_course_select ON attendance_courses;
CREATE POLICY attendance_course_select ON attendance_courses FOR SELECT USING (
    college_id = app_college_id()
    AND (
        (app_role() = 'Faculty' AND faculty_id = app_user_id())
        OR (
            app_role() = 'Student'
            AND EXISTS (
                SELECT 1 FROM attendance_course_rosters r
                WHERE r.college_id = attendance_courses.college_id
                  AND r.course_id = attendance_courses.course_id
                  AND r.student_id = app_user_id()
            )
        )
    )
);

DROP POLICY IF EXISTS attendance_course_write ON attendance_courses;
CREATE POLICY attendance_course_write ON attendance_courses FOR ALL USING (
    college_id = app_college_id()
    AND app_role() = 'Faculty'
    AND faculty_id = app_user_id()
) WITH CHECK (
    college_id = app_college_id()
    AND app_role() = 'Faculty'
    AND faculty_id = app_user_id()
);

DROP POLICY IF EXISTS attendance_roster_faculty ON attendance_course_rosters;
CREATE POLICY attendance_roster_faculty ON attendance_course_rosters FOR ALL USING (
    college_id = app_college_id()
    AND app_role() = 'Faculty'
    AND EXISTS (
        SELECT 1 FROM attendance_courses c
        WHERE c.college_id = attendance_course_rosters.college_id
          AND c.course_id = attendance_course_rosters.course_id
          AND c.faculty_id = app_user_id()
    )
) WITH CHECK (
    college_id = app_college_id()
    AND app_role() = 'Faculty'
    AND EXISTS (
        SELECT 1 FROM attendance_courses c
        WHERE c.college_id = attendance_course_rosters.college_id
          AND c.course_id = attendance_course_rosters.course_id
          AND c.faculty_id = app_user_id()
    )
);

DROP POLICY IF EXISTS attendance_roster_student ON attendance_course_rosters;
CREATE POLICY attendance_roster_student ON attendance_course_rosters FOR SELECT USING (
    college_id = app_college_id()
    AND student_id = app_user_id()
);

DROP POLICY IF EXISTS attendance_nonce_staff ON attendance_nonces;
CREATE POLICY attendance_nonce_staff ON attendance_nonces FOR ALL USING (
    college_id = app_college_id()
    AND app_role() IN ('Faculty', 'Warden')
) WITH CHECK (
    college_id = app_college_id()
    AND app_role() IN ('Faculty', 'Warden')
);

DROP POLICY IF EXISTS attendance_beacon_read ON attendance_beacons;
CREATE POLICY attendance_beacon_read ON attendance_beacons FOR SELECT USING (
    college_id = app_college_id()
);

DROP POLICY IF EXISTS attendance_beacon_write ON attendance_beacons;
CREATE POLICY attendance_beacon_write ON attendance_beacons FOR ALL USING (
    college_id = app_college_id()
    AND (
        (app_role() = 'Faculty' AND beacon_kind = 'class')
        OR (app_role() = 'Warden' AND beacon_kind = 'hostel')
    )
) WITH CHECK (
    college_id = app_college_id()
    AND (
        (app_role() = 'Faculty' AND beacon_kind = 'class')
        OR (app_role() = 'Warden' AND beacon_kind = 'hostel')
    )
);

DROP POLICY IF EXISTS attendance_face_student ON attendance_face_templates;
CREATE POLICY attendance_face_student ON attendance_face_templates FOR ALL USING (
    college_id = app_college_id()
    AND student_id = app_user_id()
) WITH CHECK (
    college_id = app_college_id()
    AND student_id = app_user_id()
);

DROP POLICY IF EXISTS attendance_face_warden ON attendance_face_templates;
CREATE POLICY attendance_face_warden ON attendance_face_templates FOR SELECT USING (
    college_id = app_college_id()
    AND app_role() = 'Warden'
);

DROP POLICY IF EXISTS attendance_binding_student ON attendance_device_bindings;
CREATE POLICY attendance_binding_student ON attendance_device_bindings FOR SELECT USING (
    college_id = app_college_id()
    AND student_id = app_user_id()
);

DROP POLICY IF EXISTS attendance_binding_warden ON attendance_device_bindings;
CREATE POLICY attendance_binding_warden ON attendance_device_bindings FOR ALL USING (
    college_id = app_college_id()
    AND app_role() = 'Warden'
) WITH CHECK (
    college_id = app_college_id()
    AND app_role() = 'Warden'
);

DROP POLICY IF EXISTS attendance_window_read ON attendance_enrollment_windows;
CREATE POLICY attendance_window_read ON attendance_enrollment_windows FOR SELECT USING (
    college_id = app_college_id()
);

DROP POLICY IF EXISTS attendance_window_write ON attendance_enrollment_windows;
CREATE POLICY attendance_window_write ON attendance_enrollment_windows FOR ALL USING (
    college_id = app_college_id()
    AND app_role() IN ('Faculty', 'Warden')
) WITH CHECK (
    college_id = app_college_id()
    AND app_role() IN ('Faculty', 'Warden')
);

DO $$
BEGIN
    IF to_regclass('public.attendance_sessions') IS NOT NULL THEN
        ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
        EXECUTE 'DROP POLICY IF EXISTS attendance_session_select ON attendance_sessions';
        EXECUTE $policy$
            CREATE POLICY attendance_session_select ON attendance_sessions FOR SELECT USING (
                college_id = app_college_id()
                AND (
                    app_role() = 'Student'
                    AND (
                        (COALESCE(session_type, 'hostel') = 'class'
                         AND course_id IS NOT NULL
                         AND EXISTS (
                             SELECT 1 FROM attendance_course_rosters r
                             WHERE r.college_id = attendance_sessions.college_id
                               AND r.course_id = attendance_sessions.course_id
                               AND r.student_id = app_user_id()
                         ))
                        OR
                        (COALESCE(session_type, 'hostel') = 'hostel'
                         AND EXISTS (
                             SELECT 1 FROM users u
                             WHERE u.college_id = attendance_sessions.college_id
                               AND UPPER(u.user_id) = UPPER(app_user_id())
                               AND LOWER(COALESCE(u.hostel_block, '')) =
                                   LOWER(COALESCE(attendance_sessions.hostel_block, ''))
                         ))
                    )
                    OR app_role() = 'Faculty'
                    OR app_role() = 'Warden'
                )
            )
        $policy$;
    END IF;

    IF to_regclass('public.attendance_records') IS NOT NULL THEN
        ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
        EXECUTE 'DROP POLICY IF EXISTS attendance_record_select ON attendance_records';
        EXECUTE $policy$
            CREATE POLICY attendance_record_select ON attendance_records FOR SELECT USING (
                college_id = app_college_id()
                AND (
                    UPPER(student_id) = UPPER(app_user_id())
                    OR app_role() = 'Faculty'
                    OR app_role() = 'Warden'
                )
            )
        $policy$;
        EXECUTE 'DROP POLICY IF EXISTS attendance_record_student_insert ON attendance_records';
        EXECUTE $policy$
            CREATE POLICY attendance_record_student_insert ON attendance_records FOR INSERT
            WITH CHECK (
                college_id = app_college_id()
                AND app_role() = 'Student'
                AND UPPER(student_id) = UPPER(app_user_id())
            )
        $policy$;
        EXECUTE 'DROP POLICY IF EXISTS attendance_record_override ON attendance_records';
        EXECUTE $policy$
            CREATE POLICY attendance_record_override ON attendance_records FOR UPDATE USING (
                college_id = app_college_id()
                AND app_role() IN ('Faculty', 'Warden')
            ) WITH CHECK (
                college_id = app_college_id()
                AND app_role() IN ('Faculty', 'Warden')
                AND exception_reason IS NOT NULL
                AND btrim(exception_reason) <> ''
            )
        $policy$;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.attendance_records') IS NOT NULL
       AND to_regclass('public.attendance_sessions') IS NOT NULL THEN
        EXECUTE $sql$
            CREATE OR REPLACE FUNCTION validate_attendance_handshake()
            RETURNS trigger LANGUAGE plpgsql AS $fn$
            DECLARE
                active_session attendance_sessions%ROWTYPE;
            BEGIN
                IF LOWER(COALESCE(NEW.status, '')) = 'present'
                   AND NEW.method NOT IN ('manual', 'manual_override') THEN
                    SELECT * INTO active_session
                    FROM attendance_sessions
                    WHERE college_id = NEW.college_id
                      AND session_id = NEW.session_id
                      AND status IN ('Open', 'open')
                      AND closes_at::text >= to_char(clock_timestamp(), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');

                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'attendance session is not active';
                    END IF;
                END IF;
                RETURN NEW;
            END;
            $fn$
        $sql$;

        EXECUTE 'DROP TRIGGER IF EXISTS attendance_handshake_guard ON attendance_records';
        EXECUTE $sql$
            CREATE TRIGGER attendance_handshake_guard
            BEFORE INSERT OR UPDATE ON attendance_records
            FOR EACH ROW EXECUTE FUNCTION validate_attendance_handshake()
        $sql$;
    END IF;
END $$;

COMMIT;
