ALTER TABLE persons
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT persons_version_check CHECK (version >= 1),
  ADD CONSTRAINT persons_name_required CHECK (name_ar IS NOT NULL OR name_en IS NOT NULL);

ALTER TABLE student_profiles
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT student_profiles_version_check CHECK (version >= 1),
  ADD CONSTRAINT student_profiles_portal_status_check CHECK (
    portal_status IN ('PENDING', 'ACTIVE', 'SUSPENDED')
  );

ALTER TABLE person_contacts
  ADD CONSTRAINT person_contacts_type_check CHECK (type IN ('PHONE', 'EMAIL'));

CREATE UNIQUE INDEX person_contacts_value_per_person
  ON person_contacts (organization_id, person_id, type, normalized_value)
  WHERE normalized_value IS NOT NULL;

CREATE UNIQUE INDEX person_contacts_one_primary
  ON person_contacts (organization_id, person_id, type)
  WHERE is_primary;

ALTER TABLE business_accounts
  ADD COLUMN owning_branch_id uuid NOT NULL,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT business_accounts_version_check CHECK (version >= 1),
  ADD CONSTRAINT business_accounts_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  ADD CONSTRAINT business_accounts_branch_fk
    FOREIGN KEY (organization_id, owning_branch_id)
    REFERENCES branches (organization_id, id)
    ON DELETE RESTRICT;

CREATE INDEX business_accounts_org_branch_status_idx
  ON business_accounts (organization_id, owning_branch_id, status);

ALTER TABLE billing_accounts
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT billing_accounts_version_check CHECK (version >= 1),
  ADD CONSTRAINT billing_accounts_kind_currency_check CHECK (
    kind IN ('INDIVIDUAL', 'CORPORATE') AND currency_code = 'EGP'
  );

CREATE UNIQUE INDEX billing_accounts_individual_owner_key
  ON billing_accounts (organization_id, person_id)
  WHERE kind = 'INDIVIDUAL';

CREATE UNIQUE INDEX billing_accounts_corporate_owner_key
  ON billing_accounts (organization_id, business_account_id)
  WHERE kind = 'CORPORATE';

CREATE UNIQUE INDEX business_account_contacts_one_primary
  ON business_account_contacts (organization_id, business_account_id)
  WHERE is_primary;
