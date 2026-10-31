ALTER TABLE lead_stages
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT lead_stages_version_check CHECK (version >= 1),
  ADD CONSTRAINT lead_stages_ordinal_check CHECK (ordinal > 0);

ALTER TABLE leads
  ADD CONSTRAINT leads_version_check CHECK (version >= 1),
  ADD CONSTRAINT leads_state_check CHECK (
    state IN ('NEW', 'OPEN', 'QUALIFIED', 'WON', 'LOST', 'DISQUALIFIED')
  );

ALTER TABLE lead_status_history
  ADD CONSTRAINT lead_status_history_from_state_check CHECK (
    from_state IS NULL OR from_state IN ('NEW', 'OPEN', 'QUALIFIED', 'WON', 'LOST', 'DISQUALIFIED')
  ),
  ADD CONSTRAINT lead_status_history_to_state_check CHECK (
    to_state IN ('NEW', 'OPEN', 'QUALIFIED', 'WON', 'LOST', 'DISQUALIFIED')
  );

CREATE TRIGGER lead_activities_append_only
BEFORE UPDATE OR DELETE ON lead_activities
FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();

CREATE TRIGGER lead_status_history_append_only
BEFORE UPDATE OR DELETE ON lead_status_history
FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();

CREATE TRIGGER lead_conversions_append_only
BEFORE UPDATE OR DELETE ON lead_conversions
FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();
