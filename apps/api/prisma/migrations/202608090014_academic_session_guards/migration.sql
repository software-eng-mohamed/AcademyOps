ALTER TABLE sessions
  ADD CONSTRAINT sessions_version_check CHECK (version >= 1),
  ADD CONSTRAINT sessions_status_check CHECK (
    status IN ('DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED')
  ),
  ADD CONSTRAINT sessions_delivery_mode_check CHECK (
    delivery_mode IN ('IN_PERSON', 'ONLINE', 'HYBRID')
  ),
  ADD CONSTRAINT sessions_attendance_window_state_check CHECK (
    attendance_window_state IN ('SCHEDULED', 'OPEN', 'CLOSED', 'LOCKED')
  );

ALTER TABLE session_trainers
  ADD CONSTRAINT session_trainers_role_check CHECK (role IN ('PRIMARY', 'ASSISTANT')),
  ADD CONSTRAINT session_trainers_booking_status_check CHECK (
    booking_status IN ('CONFIRMED', 'CANCELLED')
  );

CREATE OR REPLACE FUNCTION validate_session_catalog_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  module_cohort_id uuid;
  cohort_branch_id uuid;
BEGIN
  SELECT cm.cohort_id, c.owning_branch_id
  INTO module_cohort_id, cohort_branch_id
  FROM cohort_modules cm
  JOIN cohorts c
    ON c.organization_id = cm.organization_id
   AND c.id = cm.cohort_id
  WHERE cm.organization_id = NEW.organization_id
    AND cm.id = NEW.cohort_module_id;

  IF module_cohort_id IS NULL OR module_cohort_id <> NEW.cohort_id THEN
    RAISE EXCEPTION 'Session module must belong to the selected cohort'
      USING ERRCODE = '23514', CONSTRAINT = 'session_cohort_module_match';
  END IF;

  IF NEW.room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM rooms r
    WHERE r.organization_id = NEW.organization_id
      AND r.id = NEW.room_id
      AND r.branch_id = cohort_branch_id
      AND r.is_active
  ) THEN
    RAISE EXCEPTION 'Session room must be active and belong to the cohort branch'
      USING ERRCODE = '23514', CONSTRAINT = 'session_room_branch_match';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sessions_catalog_links_guard
BEFORE INSERT OR UPDATE OF organization_id, cohort_module_id, cohort_id, room_id ON sessions
FOR EACH ROW EXECUTE FUNCTION validate_session_catalog_links();

CREATE OR REPLACE FUNCTION validate_session_trainer_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_starts_at timestamptz;
  session_ends_at timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM trainer_profiles trainer
    WHERE trainer.organization_id = NEW.organization_id
      AND trainer.id = NEW.trainer_id
      AND trainer.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Session trainer must be active'
      USING ERRCODE = '23514', CONSTRAINT = 'session_trainer_active';
  END IF;

  SELECT starts_at, ends_at
  INTO session_starts_at, session_ends_at
  FROM sessions
  WHERE organization_id = NEW.organization_id
    AND id = NEW.session_id;

  IF NEW.starts_at IS DISTINCT FROM session_starts_at
    OR NEW.ends_at IS DISTINCT FROM session_ends_at THEN
    RAISE EXCEPTION 'Session trainer timeslot must match the session'
      USING ERRCODE = '23514', CONSTRAINT = 'session_trainer_timeslot_match';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER session_trainers_assignment_guard
BEFORE INSERT OR UPDATE OF organization_id, session_id, trainer_id, starts_at, ends_at
ON session_trainers
FOR EACH ROW EXECUTE FUNCTION validate_session_trainer_assignment();

CREATE OR REPLACE FUNCTION sync_session_trainer_timeslots()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE session_trainers
  SET starts_at = NEW.starts_at,
      ends_at = NEW.ends_at,
      updated_at = clock_timestamp()
  WHERE organization_id = NEW.organization_id
    AND session_id = NEW.id
    AND (starts_at IS DISTINCT FROM NEW.starts_at OR ends_at IS DISTINCT FROM NEW.ends_at);
  RETURN NEW;
END;
$$;

CREATE TRIGGER sessions_sync_trainer_timeslots
AFTER UPDATE OF starts_at, ends_at ON sessions
FOR EACH ROW EXECUTE FUNCTION sync_session_trainer_timeslots();
