# Security policy

## Reporting a vulnerability

Do not open a public issue or include exploit details in logs, screenshots, or test data.
Use GitHub's **Security → Report a vulnerability** private-reporting flow for this repository.
Include the affected commit, route or component, impact, minimal reproduction, and any suggested
mitigation. Keep the initial report limited to the information needed to reproduce the issue.

## Supported version

Report issues against the current `main` branch. Verify security fixes with focused regression
tests, database constraint checks, and a production build before deployment.

## Disclosure

Please allow time to deploy and verify a fix before public disclosure. Production secrets, personal
data, authentication tokens, payment data, and imported workbook rows must never be attached to a
report; use synthetic examples instead.
