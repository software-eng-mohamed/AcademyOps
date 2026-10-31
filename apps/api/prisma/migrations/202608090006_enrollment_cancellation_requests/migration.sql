CREATE TABLE enrollment_cancellation_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  enrollment_version integer NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'REQUESTED',
  reason text NOT NULL,
  requested_by uuid NOT NULL,
  decided_by uuid,
  decision_reason text,
  decided_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL,
  CONSTRAINT enrollment_cancellation_requests_pkey PRIMARY KEY (id),
  CONSTRAINT enrollment_cancellation_requests_status_check
    CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED')),
  CONSTRAINT enrollment_cancellation_requests_maker_checker
    CHECK (decided_by IS NULL OR decided_by <> requested_by)
);

CREATE UNIQUE INDEX enrollment_cancellation_requests_organization_id_id_key
  ON enrollment_cancellation_requests (organization_id, id);

CREATE INDEX enrollment_cancellation_requests_enrollment_status_idx
  ON enrollment_cancellation_requests (organization_id, enrollment_id, status);

CREATE UNIQUE INDEX enrollment_cancellation_requests_one_open
  ON enrollment_cancellation_requests (organization_id, enrollment_id)
  WHERE status = 'REQUESTED';

ALTER TABLE enrollment_cancellation_requests
  ADD CONSTRAINT enrollment_cancellation_requests_enrollment_fk
  FOREIGN KEY (organization_id, enrollment_id)
  REFERENCES enrollments (organization_id, id)
  ON DELETE RESTRICT;

ALTER TABLE enrollment_cancellation_requests
  ADD CONSTRAINT enrollment_cancellation_requests_requested_by_fk
  FOREIGN KEY (organization_id, requested_by)
  REFERENCES users (organization_id, id)
  ON DELETE RESTRICT;

ALTER TABLE enrollment_cancellation_requests
  ADD CONSTRAINT enrollment_cancellation_requests_decided_by_fk
  FOREIGN KEY (organization_id, decided_by)
  REFERENCES users (organization_id, id)
  ON DELETE RESTRICT;
