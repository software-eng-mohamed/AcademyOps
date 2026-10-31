-- A provider/bank transaction reference can only fund one payment per method and organization.
-- This intentionally stops if historical duplicates exist so they can be reconciled safely.
CREATE UNIQUE INDEX IF NOT EXISTS payments_method_external_reference_unique
  ON payments (organization_id, method_id, upper(btrim(external_reference)))
  WHERE external_reference IS NOT NULL;
