CREATE TABLE report_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  report_type varchar(50) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'QUEUED',
  parameters jsonb NOT NULL,
  scope_snapshot jsonb NOT NULL,
  file_asset_id uuid,
  error_message text,
  version integer NOT NULL DEFAULT 1,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_export_jobs_type_check CHECK (
    report_type IN ('FINANCE_RECEIVABLES')
  ),
  CONSTRAINT report_export_jobs_status_check CHECK (
    status IN ('QUEUED', 'RUNNING', 'AVAILABLE', 'FAILED')
  ),
  CONSTRAINT report_export_jobs_version_check CHECK (version >= 1),
  CONSTRAINT report_export_jobs_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT report_export_jobs_state_fields_check CHECK (
    (
      status = 'QUEUED'
      AND started_at IS NULL
      AND completed_at IS NULL
      AND file_asset_id IS NULL
      AND error_message IS NULL
    ) OR (
      status = 'RUNNING'
      AND started_at IS NOT NULL
      AND completed_at IS NULL
      AND file_asset_id IS NULL
      AND error_message IS NULL
    ) OR (
      status = 'AVAILABLE'
      AND started_at IS NOT NULL
      AND completed_at IS NOT NULL
      AND file_asset_id IS NOT NULL
      AND error_message IS NULL
    ) OR (
      status = 'FAILED'
      AND completed_at IS NOT NULL
      AND file_asset_id IS NULL
      AND length(trim(error_message)) > 0
    )
  )
);

CREATE UNIQUE INDEX report_export_jobs_organization_id_id_key
  ON report_export_jobs (organization_id, id);

CREATE INDEX report_export_jobs_requester_created_idx
  ON report_export_jobs (organization_id, requested_by, created_at DESC);

CREATE INDEX report_export_jobs_queue_idx
  ON report_export_jobs (organization_id, status, created_at)
  WHERE status IN ('QUEUED', 'RUNNING');

ALTER TABLE report_export_jobs
  ADD CONSTRAINT report_export_jobs_organization_fk
    FOREIGN KEY (organization_id)
    REFERENCES organizations (id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT report_export_jobs_requested_by_fk
    FOREIGN KEY (organization_id, requested_by)
    REFERENCES users (organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT report_export_jobs_file_asset_fk
    FOREIGN KEY (organization_id, file_asset_id)
    REFERENCES file_assets (organization_id, id)
    ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION guard_report_export_job_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Report export jobs cannot be deleted'
      USING ERRCODE = '23514', CONSTRAINT = 'report_export_jobs_no_delete';
  END IF;

  IF OLD.organization_id <> NEW.organization_id
    OR OLD.requested_by <> NEW.requested_by
    OR OLD.report_type <> NEW.report_type
    OR OLD.parameters <> NEW.parameters
    OR OLD.scope_snapshot <> NEW.scope_snapshot
    OR OLD.expires_at <> NEW.expires_at
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'Report export job identity is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'report_export_jobs_identity_immutable';
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Report export job mutations must increment version exactly once'
      USING ERRCODE = '23514', CONSTRAINT = 'report_export_jobs_version_increment';
  END IF;

  IF NOT (
    (OLD.status = 'QUEUED' AND NEW.status IN ('RUNNING', 'FAILED'))
    OR (OLD.status = 'RUNNING' AND NEW.status IN ('AVAILABLE', 'FAILED'))
  ) THEN
    RAISE EXCEPTION 'Invalid report export job transition'
      USING ERRCODE = '23514', CONSTRAINT = 'report_export_jobs_state_transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER report_export_jobs_mutation_guard
BEFORE UPDATE OR DELETE ON report_export_jobs
FOR EACH ROW EXECUTE FUNCTION guard_report_export_job_mutation();
