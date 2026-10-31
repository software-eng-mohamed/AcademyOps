ALTER TABLE certificates
  DROP CONSTRAINT certificates_pdf_status_check,
  DROP CONSTRAINT certificates_pdf_file_check;

UPDATE certificates
SET pdf_status = 'PENDING_UPLOAD'
WHERE pdf_status IN ('QUEUED', 'FAILED');

ALTER TABLE certificates
  ALTER COLUMN pdf_status SET DEFAULT 'PENDING_UPLOAD',
  ADD CONSTRAINT certificates_pdf_status_check CHECK (
    pdf_status IN ('PENDING_UPLOAD', 'AVAILABLE')
  ),
  ADD CONSTRAINT certificates_pdf_file_check CHECK (
    (pdf_status = 'AVAILABLE' AND file_asset_id IS NOT NULL)
    OR (pdf_status = 'PENDING_UPLOAD' AND file_asset_id IS NULL)
  );

ALTER TABLE certificate_events
  DROP CONSTRAINT certificate_events_type_check;

ALTER TABLE certificate_events
  ADD CONSTRAINT certificate_events_type_check CHECK (
    type IN (
      'ISSUED',
      'REISSUED',
      'REVOKED',
      'FULFILLMENT_CHANGED',
      'PDF_AVAILABLE',
      'PDF_FAILED',
      'PDF_UPLOADED',
      'PDF_REPLACED'
    )
  );

CREATE OR REPLACE FUNCTION guard_certificate_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Certificates cannot be deleted'
      USING ERRCODE = '23514', CONSTRAINT = 'certificates_no_delete';
  END IF;

  IF OLD.organization_id <> NEW.organization_id
    OR OLD.enrollment_id <> NEW.enrollment_id
    OR OLD.evaluation_id <> NEW.evaluation_id
    OR OLD.supersedes_id IS DISTINCT FROM NEW.supersedes_id
    OR OLD.serial <> NEW.serial
    OR OLD.verification_digest <> NEW.verification_digest
    OR OLD.issued_at <> NEW.issued_at
    OR OLD.issued_by <> NEW.issued_by
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'Issued certificate identity is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'certificates_identity_immutable';
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Certificate mutations must increment version exactly once'
      USING ERRCODE = '23514', CONSTRAINT = 'certificates_version_increment';
  END IF;

  IF OLD.validity_status <> NEW.validity_status
    AND NOT (OLD.validity_status = 'ISSUED' AND NEW.validity_status = 'REVOKED') THEN
    RAISE EXCEPTION 'Invalid certificate validity transition'
      USING ERRCODE = '23514', CONSTRAINT = 'certificate_validity_transition';
  END IF;

  IF OLD.fulfillment_status <> NEW.fulfillment_status THEN
    IF OLD.validity_status <> 'ISSUED'
      OR NEW.validity_status <> 'ISSUED'
      OR NOT (
        (OLD.fulfillment_status = 'NOT_PRINTED' AND NEW.fulfillment_status = 'PRINTED')
        OR (
          OLD.fulfillment_status = 'PRINTED'
          AND NEW.fulfillment_status = 'READY_FOR_COLLECTION'
        )
        OR (
          OLD.fulfillment_status = 'READY_FOR_COLLECTION'
          AND NEW.fulfillment_status = 'COLLECTED'
        )
      ) THEN
      RAISE EXCEPTION 'Invalid certificate fulfillment transition'
        USING ERRCODE = '23514', CONSTRAINT = 'certificate_fulfillment_transition';
    END IF;
    IF NEW.fulfillment_status = 'PRINTED' AND NEW.pdf_status <> 'AVAILABLE' THEN
      RAISE EXCEPTION 'Certificate file must be available before printing'
        USING ERRCODE = '23514', CONSTRAINT = 'certificate_file_required_for_print';
    END IF;
  END IF;

  IF OLD.pdf_status <> NEW.pdf_status
    AND NOT (
      OLD.pdf_status = 'PENDING_UPLOAD'
      AND NEW.pdf_status = 'AVAILABLE'
    ) THEN
    RAISE EXCEPTION 'Invalid certificate PDF transition'
      USING ERRCODE = '23514', CONSTRAINT = 'certificate_pdf_transition';
  END IF;

  IF OLD.file_asset_id IS DISTINCT FROM NEW.file_asset_id THEN
    IF NEW.pdf_status <> 'AVAILABLE'
      OR OLD.validity_status <> 'ISSUED'
      OR NEW.validity_status <> 'ISSUED'
      OR OLD.fulfillment_status <> 'NOT_PRINTED'
      OR NEW.fulfillment_status <> 'NOT_PRINTED' THEN
      RAISE EXCEPTION 'Certificate file can only be uploaded before printing an active certificate'
        USING ERRCODE = '23514', CONSTRAINT = 'certificate_file_replacement_guard';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
