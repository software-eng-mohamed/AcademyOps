CREATE TABLE certificate_file_upload_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  certificate_id UUID NOT NULL,
  idempotency_record_id UUID NOT NULL,
  storage_key TEXT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  size_bytes BIGINT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  created_by UUID NOT NULL,
  completed_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT certificate_upload_attempt_size CHECK (size_bytes > 0),
  CONSTRAINT certificate_upload_attempt_status CHECK (
    status IN ('PENDING', 'CLEAN', 'REJECTED', 'FAILED')
  ),
  CONSTRAINT certificate_upload_attempt_terminal_time CHECK (
    (status = 'PENDING' AND completed_at IS NULL)
    OR (status <> 'PENDING' AND completed_at IS NOT NULL)
  ),
  CONSTRAINT certificate_upload_attempt_org_fk FOREIGN KEY (organization_id)
    REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT certificate_upload_attempt_certificate_fk FOREIGN KEY (organization_id, certificate_id)
    REFERENCES certificates(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT certificate_upload_attempt_user_fk FOREIGN KEY (organization_id, created_by)
    REFERENCES users(organization_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX certificate_upload_attempt_org_id_key
  ON certificate_file_upload_attempts (organization_id, id);
CREATE UNIQUE INDEX certificate_upload_attempt_idempotency_key
  ON certificate_file_upload_attempts (organization_id, idempotency_record_id);
CREATE UNIQUE INDEX certificate_upload_attempt_one_pending_content
  ON certificate_file_upload_attempts (organization_id, certificate_id, storage_key)
  WHERE status = 'PENDING';
CREATE INDEX certificate_upload_attempt_cleanup_idx
  ON certificate_file_upload_attempts (status, updated_at)
  WHERE status = 'PENDING';

CREATE FUNCTION guard_certificate_upload_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Certificate upload attempts cannot be deleted'
      USING ERRCODE = '55000', CONSTRAINT = 'certificate_upload_attempt_no_delete';
  END IF;
  IF OLD.id <> NEW.id
    OR OLD.organization_id <> NEW.organization_id
    OR OLD.certificate_id <> NEW.certificate_id
    OR OLD.idempotency_record_id <> NEW.idempotency_record_id
    OR OLD.storage_key <> NEW.storage_key
    OR OLD.sha256 <> NEW.sha256
    OR OLD.size_bytes <> NEW.size_bytes
    OR OLD.created_by <> NEW.created_by
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'Certificate upload attempt identity is immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'certificate_upload_attempt_identity_immutable';
  END IF;
  IF OLD.status <> 'PENDING'
    OR NEW.status NOT IN ('CLEAN', 'REJECTED', 'FAILED')
    OR NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'Invalid certificate upload attempt transition'
      USING ERRCODE = '55000', CONSTRAINT = 'certificate_upload_attempt_transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER certificate_upload_attempt_lifecycle
BEFORE UPDATE OR DELETE ON certificate_file_upload_attempts
FOR EACH ROW EXECUTE FUNCTION guard_certificate_upload_attempt();
