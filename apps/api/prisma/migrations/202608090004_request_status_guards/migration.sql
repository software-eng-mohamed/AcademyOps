DROP INDEX IF EXISTS payment_reversal_requests_one_pending_per_payment;
DROP INDEX IF EXISTS refund_requests_one_pending_per_payment;

CREATE UNIQUE INDEX payment_reversal_requests_one_open_per_payment
  ON payment_reversal_requests (organization_id, payment_id)
  WHERE status = 'REQUESTED';

CREATE UNIQUE INDEX refund_requests_one_open_per_payment
  ON refund_requests (organization_id, payment_id)
  WHERE status = 'REQUESTED';
