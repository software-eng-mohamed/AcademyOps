ALTER TABLE refund_requests ADD COLUMN decided_by UUID, ADD COLUMN decision_reason TEXT;
ALTER TABLE payment_reversal_requests ADD COLUMN decided_by UUID, ADD COLUMN decision_reason TEXT;

UPDATE refund_requests SET decided_by = approved_by WHERE status = 'APPROVED';
UPDATE payment_reversal_requests SET decided_by = approved_by WHERE status = 'APPROVED';

ALTER TABLE refund_requests ADD CONSTRAINT refund_request_decision_check CHECK (
  status NOT IN ('REJECTED', 'WITHDRAWN') OR (
    decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_reason IS NOT NULL
    AND length(btrim(decision_reason)) BETWEEN 3 AND 1000
    AND approved_by IS NULL
    AND ((status = 'REJECTED' AND decided_by <> requested_by) OR (status = 'WITHDRAWN' AND decided_by = requested_by))
  )
);
ALTER TABLE payment_reversal_requests ADD CONSTRAINT reversal_request_decision_check CHECK (
  status NOT IN ('REJECTED', 'WITHDRAWN') OR (
    decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_reason IS NOT NULL
    AND length(btrim(decision_reason)) BETWEEN 3 AND 1000
    AND approved_by IS NULL
    AND ((status = 'REJECTED' AND decided_by <> requested_by) OR (status = 'WITHDRAWN' AND decided_by = requested_by))
  )
);
