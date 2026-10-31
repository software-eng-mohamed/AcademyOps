ALTER TABLE attendance_policy_versions
  ADD COLUMN check_in_opens_before_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN check_in_closes_after_minutes integer NOT NULL DEFAULT 30;

ALTER TABLE attendance_policy_versions
  DROP CONSTRAINT attendance_policy_ratio_check,
  ADD CONSTRAINT attendance_policy_ratio_check CHECK (
    minimum_ratio BETWEEN 0.8000 AND 1.0000
    AND lock_after_minutes BETWEEN 1 AND 10080
    AND check_in_opens_before_minutes BETWEEN 0 AND 1440
    AND check_in_closes_after_minutes BETWEEN 0 AND 1440
    AND (effective_to IS NULL OR effective_to > effective_from)
  );

CREATE UNIQUE INDEX attendance_policy_versions_scope_version_key
  ON attendance_policy_versions (
    organization_id,
    program_version_id,
    COALESCE(cohort_id, '00000000-0000-0000-0000-000000000000'::uuid),
    version
  );

ALTER TABLE attendance_policy_versions
  ADD CONSTRAINT attendance_policy_versions_no_overlap
  EXCLUDE USING gist (
    organization_id WITH =,
    program_version_id WITH =,
    (COALESCE(cohort_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    tstzrange(effective_from, effective_to, '[)') WITH &&
  );

CREATE OR REPLACE FUNCTION guard_attendance_policy_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Attendance policy versions cannot be deleted'
      USING ERRCODE = '23514', CONSTRAINT = 'attendance_policy_versions_immutable';
  END IF;

  IF OLD.organization_id = NEW.organization_id
    AND OLD.program_version_id = NEW.program_version_id
    AND OLD.cohort_id IS NOT DISTINCT FROM NEW.cohort_id
    AND OLD.version = NEW.version
    AND OLD.minimum_ratio = NEW.minimum_ratio
    AND OLD.lock_after_minutes = NEW.lock_after_minutes
    AND OLD.check_in_opens_before_minutes = NEW.check_in_opens_before_minutes
    AND OLD.check_in_closes_after_minutes = NEW.check_in_closes_after_minutes
    AND OLD.effective_from = NEW.effective_from
    AND OLD.created_by = NEW.created_by
    AND OLD.created_at = NEW.created_at
    AND OLD.effective_to IS NULL
    AND NEW.effective_to > OLD.effective_from THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Attendance policy versions are immutable except when closing an open period'
    USING ERRCODE = '23514', CONSTRAINT = 'attendance_policy_versions_immutable';
END;
$$;

CREATE TRIGGER attendance_policy_versions_mutation_guard
BEFORE UPDATE OR DELETE ON attendance_policy_versions
FOR EACH ROW EXECUTE FUNCTION guard_attendance_policy_version_mutation();

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_version_check CHECK (version >= 1),
  ADD CONSTRAINT attendance_records_status_check CHECK (
    current_status IN ('UNMARKED', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED')
  ),
  ADD CONSTRAINT attendance_records_source_check CHECK (
    source IN ('QR', 'MANUAL', 'SYSTEM_CLOSE', 'LEGACY_IMPORT')
  );

ALTER TABLE attendance_events
  ADD CONSTRAINT attendance_events_version_check CHECK (version >= 1),
  ADD CONSTRAINT attendance_events_from_status_check CHECK (
    from_status IS NULL OR from_status IN ('UNMARKED', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED')
  ),
  ADD CONSTRAINT attendance_events_to_status_check CHECK (
    to_status IN ('UNMARKED', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED')
  );

CREATE OR REPLACE FUNCTION validate_attendance_roster_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_cohort_id uuid;
  session_starts_at timestamptz;
  session_status text;
BEGIN
  IF NEW.source = 'LEGACY_IMPORT' THEN
    RETURN NEW;
  END IF;

  SELECT cohort_id, starts_at, status
  INTO session_cohort_id, session_starts_at, session_status
  FROM sessions
  WHERE organization_id = NEW.organization_id
    AND id = NEW.session_id;

  IF session_starts_at IS NULL OR session_status NOT IN ('SCHEDULED', 'COMPLETED') THEN
    RAISE EXCEPTION 'Operational attendance requires a scheduled, dated session'
      USING ERRCODE = '23514', CONSTRAINT = 'attendance_operational_session_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM enrollment_cohort_assignments assignment
    WHERE assignment.organization_id = NEW.organization_id
      AND assignment.enrollment_id = NEW.enrollment_id
      AND assignment.cohort_id = session_cohort_id
      AND assignment.starts_at <= session_starts_at
      AND (assignment.ends_at IS NULL OR assignment.ends_at > session_starts_at)
  ) THEN
    RAISE EXCEPTION 'Enrollment was not in the session roster'
      USING ERRCODE = '23514', CONSTRAINT = 'attendance_roster_membership';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_records_roster_guard
BEFORE INSERT OR UPDATE OF organization_id, session_id, enrollment_id, source
ON attendance_records
FOR EACH ROW EXECUTE FUNCTION validate_attendance_roster_membership();

CREATE OR REPLACE FUNCTION guard_attendance_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Attendance records cannot be deleted'
      USING ERRCODE = '23514', CONSTRAINT = 'attendance_records_no_delete';
  END IF;

  IF OLD.organization_id <> NEW.organization_id
    OR OLD.session_id <> NEW.session_id
    OR OLD.enrollment_id <> NEW.enrollment_id THEN
    RAISE EXCEPTION 'Attendance identity fields are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'attendance_records_identity_immutable';
  END IF;

  IF (OLD.current_status, OLD.source, OLD.recorded_at, OLD.recorded_by)
       IS DISTINCT FROM
     (NEW.current_status, NEW.source, NEW.recorded_at, NEW.recorded_by)
    AND NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Attendance changes must increment version exactly once'
      USING ERRCODE = '23514', CONSTRAINT = 'attendance_records_version_increment';
  END IF;

  IF NEW.version < OLD.version OR NEW.version > OLD.version + 1 THEN
    RAISE EXCEPTION 'Attendance version is invalid'
      USING ERRCODE = '23514', CONSTRAINT = 'attendance_records_version_increment';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_records_mutation_guard
BEFORE UPDATE OR DELETE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION guard_attendance_record_mutation();

CREATE OR REPLACE FUNCTION validate_attendance_record_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM attendance_events event
    WHERE event.organization_id = NEW.organization_id
      AND event.attendance_record_id = NEW.id
      AND event.version = NEW.version
      AND event.to_status = NEW.current_status
  ) THEN
    RAISE EXCEPTION 'Attendance record version requires a matching event'
      USING ERRCODE = '23514', CONSTRAINT = 'attendance_record_event_required';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER attendance_record_event_guard
AFTER INSERT OR UPDATE OF current_status, version ON attendance_records
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_attendance_record_event();

CREATE OR REPLACE FUNCTION validate_makeup_credit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  missed_enrollment_id uuid;
  missed_session_id uuid;
  missed_status text;
  makeup_enrollment_id uuid;
  makeup_session_id uuid;
  makeup_status text;
BEGIN
  SELECT enrollment_id, session_id, current_status
  INTO missed_enrollment_id, missed_session_id, missed_status
  FROM attendance_records
  WHERE organization_id = NEW.organization_id AND id = NEW.missed_record_id;

  SELECT enrollment_id, session_id, current_status
  INTO makeup_enrollment_id, makeup_session_id, makeup_status
  FROM attendance_records
  WHERE organization_id = NEW.organization_id AND id = NEW.makeup_record_id;

  IF missed_status <> 'ABSENT'
    OR makeup_status NOT IN ('PRESENT', 'LATE')
    OR missed_enrollment_id <> makeup_enrollment_id
    OR missed_session_id = makeup_session_id THEN
    RAISE EXCEPTION 'Makeup credit requires one absence and one attended different session for the same enrollment'
      USING ERRCODE = '23514', CONSTRAINT = 'makeup_credit_valid';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER makeup_credits_valid_guard
BEFORE INSERT ON makeup_credits
FOR EACH ROW EXECUTE FUNCTION validate_makeup_credit();

CREATE TRIGGER makeup_credits_append_only
BEFORE UPDATE OR DELETE ON makeup_credits
FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();

ALTER TABLE qr_challenges
  ADD CONSTRAINT qr_challenges_expiry_check CHECK (expires_at > created_at);

CREATE TABLE attendance_anomalies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  session_id uuid,
  challenge_id uuid,
  actor_user_id uuid,
  student_person_id uuid,
  reason_code varchar(60) NOT NULL,
  metadata jsonb,
  occurred_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attendance_anomalies_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_anomalies_reason_check CHECK (
    reason_code IN (
      'MALFORMED_TOKEN',
      'CHALLENGE_INVALID_OR_EXPIRED',
      'WINDOW_NOT_OPEN',
      'STUDENT_CONTEXT_REQUIRED',
      'NOT_IN_ROSTER'
    )
  ),
  CONSTRAINT attendance_anomalies_session_fk
    FOREIGN KEY (organization_id, session_id)
    REFERENCES sessions (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT attendance_anomalies_challenge_fk
    FOREIGN KEY (organization_id, challenge_id)
    REFERENCES qr_challenges (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT attendance_anomalies_actor_fk
    FOREIGN KEY (organization_id, actor_user_id)
    REFERENCES users (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT attendance_anomalies_student_fk
    FOREIGN KEY (organization_id, student_person_id)
    REFERENCES persons (organization_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX attendance_anomalies_organization_id_id_key
  ON attendance_anomalies (organization_id, id);
CREATE INDEX attendance_anomalies_session_occurred_idx
  ON attendance_anomalies (organization_id, session_id, occurred_at DESC);
CREATE INDEX attendance_anomalies_actor_occurred_idx
  ON attendance_anomalies (organization_id, actor_user_id, occurred_at DESC);

CREATE TRIGGER attendance_anomalies_append_only
BEFORE UPDATE OR DELETE ON attendance_anomalies
FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();

CREATE INDEX sessions_attendance_maintenance_idx
  ON sessions (ends_at, id)
  WHERE attendance_window_state = 'CLOSED'
    AND status IN ('SCHEDULED', 'COMPLETED')
    AND ends_at IS NOT NULL;
