ALTER TABLE attendance_policy_versions
  ALTER COLUMN minimum_ratio SET DEFAULT 0.8000;

ALTER TABLE certificate_rule_versions
  ALTER COLUMN minimum_ratio SET DEFAULT 0.8000;

UPDATE attendance_policy_versions
SET minimum_ratio = 0.8000
WHERE minimum_ratio = 0.7500;

UPDATE certificate_rule_versions
SET minimum_ratio = 0.8000
WHERE minimum_ratio < 0.8000;

ALTER TABLE certificate_rule_versions
  ADD CONSTRAINT certificate_rules_minimum_80_check
  CHECK (minimum_ratio >= 0.8000 AND minimum_ratio <= 1.0000);
