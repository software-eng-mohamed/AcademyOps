# AcademyOps single-VPS deployment

This stack is a production-like validation target for one Ubuntu 22.04 VPS. It is not a claim that a single machine is highly available or can serve 10,000 concurrent users. Run load generators from other hosts and promote only after the measured acceptance gates pass.

## What is included

- Caddy terminates HTTPS and balances `/api/*`, exact `/socket.io`, and `/socket.io/*` across two API processes. Everything else goes to the Next.js standalone container.
- PostgreSQL 17 and Redis 7 are private Docker-network services with persistent volumes.
- Official pinned ClamAV scans certificate PDFs over private `clamd` INSTREAM before storage.
- An isolated `whatsapp-web.js` connector owns the linked-device QR session and sends only bounded OTP messages; it has no database, Redis, SMTP, R2, Paymob, or API-session credentials.
- The worker uses the same immutable backend image and a separate `SERVICE_ROLE`.
- Prometheus, Alertmanager, Grafana, Loki, Alloy, node-exporter, database exporters, and blackbox probes provide infrastructure visibility. The API exports authenticated process/HTTP/realtime metrics. The worker exports authenticated process, BullMQ, and outbox health metrics on its private monitoring network only. Alertmanager sends redacted rule payloads to the configured off-host HTTPS webhook.
- Only Caddy ports 80/443 are public. Grafana (`127.0.0.1:3300`), Prometheus (`127.0.0.1:9090`), Alertmanager (`127.0.0.1:9093`), and the synthetic mail UI (`127.0.0.1:8025`) require an SSH tunnel.

## First deployment

Install Docker Engine with the official Ubuntu repository and Docker Compose v2. Create a non-root deploy user, use SSH keys, expose only SSH at the host firewall when the origin is Cloudflare Tunnel-only, and rotate any password that has been shared. Do not disable the working SSH session until a second key-only session succeeds.

For an empty Ubuntu 22.04 host, the idempotent bootstrap prepares the official Docker repository, age/rclone, unattended upgrades, fail2ban, sysctls, a key-only deploy user, and an SSH-only UFW policy suitable for the Cloudflare Tunnel origin. It deliberately leaves the current root/password login intact during `prepare`. Open a second TTY key session first; only then run the separately acknowledged `lockdown` phase, which also requires detecting that live deploy-user session:

```sh
sh scripts/bootstrap-ubuntu-host.sh /secure/operator.pub prepare
# In a second key-only TTY session, then from the original root session:
PLG_LOCKDOWN_ACK=verified-key-only-session \
  sh scripts/bootstrap-ubuntu-host.sh /secure/operator.pub lockdown
```

On the target, prepare the private runtime configuration only. Production images must arrive as a checksum-verified release bundle built from a clean, reviewed Git commit; never build them on the target:

```sh
cp runtime.env.example runtime.env
chmod 600 runtime.env
# Replace every placeholder; generate every secret independently.
openssl rand -hex 32
openssl rand -base64 32
```

Create DNS records for `SITE_ADDRESS` before starting Caddy. `PUBLIC_ORIGIN` must be exactly `https://SITE_ADDRESS`. Never commit `runtime.env`; the local ignore rules exclude it.

The safe one-shot database init enables required extensions and creates separate roles: `plg_migrate` owns the schema without superuser rights, `plg_app` receives only default runtime CRUD/sequence/function grants, and read-only `plg_monitor` receives `pg_monitor`. The bootstrap superuser is never passed to API, worker, migrations, or exporters. Then `migrate` must exit successfully before API and worker startup. API pools are explicitly bounded to 35 connections each, worker to 10, and migrations to 5. Review init/migration logs and both `/api/v1/health/live` and `/api/v1/health/ready`. Keep query-stat access private. An empty database still needs an approved production bootstrap/restore procedure for the first Owner; development demo seeds intentionally refuse production.

The worker receives only its database, Redis, metrics, SMTP, R2, action-token, and private OTP-connector credentials. API authentication, attendance QR, MFA, password, file-signing, and WhatsApp QR-at-rest secrets remain API-only. `FILE_SIGNING_SECRET` is intentionally absent: report jobs write private objects, while only the API creates or validates download signatures.

`preflight.sh` renders the ignored Prometheus runtime configuration from a 64-hex `METRICS_TOKEN` and the ignored Alertmanager configuration from `ALERT_WEBHOOK_URL`; production validation accepts only HTTPS alert receivers. Prometheus sends its token only over private networks. Caddy returns 404 for the API metrics route before the general proxy and has no route to the worker's dedicated port `9464`; the worker has no published host port.

ClamAV has no published host or Caddy port and listens only to containers on the internal data network. Its signature database persists in `clamav-signatures`, and API startup waits for `clamdcheck.sh`. The client and daemon both cap certificate streams at 10 MiB, and any timeout, protocol error, stale startup, or unavailable scanner blocks upload. Official ClamAV guidance recommends 3 GiB minimum and 4 GiB preferred RAM, with brief reload spikes; this stack reserves 3 GiB, limits ClamAV to 4 GiB, disables concurrent database reload, and preflight refuses hosts below 16 GiB RAM or 20 GiB free disk. Review the [official Docker memory guidance](https://docs.clamav.net/manual/Installing/Docker.html#memory-ram-requirements) before changing these limits.

## Synthetic delivery and object storage

The synthetic overlay captures email locally over authenticated STARTTLS and provides private S3-compatible MinIO. WhatsApp is a separate overlay and can send real OTPs only after an operator deliberately links a dedicated test number from the protected dashboard; leave the channel disabled for ordinary synthetic runs. The MinIO console is not routed.

Create DNS for `STORAGE_ADDRESS`, make `R2_ENDPOINT=https://STORAGE_ADDRESS`, choose long random `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, then:

```sh
sh scripts/generate-mailpit-cert.sh
docker compose --env-file runtime.env \
  -f compose.yml -f compose.clamav.yml -f compose.whatsapp.yml -f compose.synthetic.yml -f compose.monitoring.yml up -d --build
ssh -L 8025:127.0.0.1:8025 -L 3300:127.0.0.1:3300 deploy@SERVER
```

The generated SMTP CA expires after 30 days and is ignored by Git. Remove the synthetic overlay when moving to Cloudflare R2 and real TLS SMTP. Production R2 credentials should be bucket-scoped and must not be reused elsewhere.

## PostHog Cloud (optional)

PostHog is product analytics, separate from the infrastructure stack. Its privacy-limited frontend integration remains disabled until project-level IP anonymization is enabled and reviewed. It sends only sanitized route templates, navigation types, deployment environment, and Web Vitals; it does not identify users or enable persistence, autocapture, exception capture, console capture, or session replay.

Production analytics is supported only through the privacy-scrubbing same-origin path. Copy `caddy/posthog.caddy.example` to `caddy/optional/posthog.caddy`, keep `POSTHOG_INGEST_HOST=us.i.posthog.com`, set `NEXT_PUBLIC_POSTHOG_HOST=PUBLIC_ORIGIN/e`, choose `NEXT_PUBLIC_OBSERVABILITY_ENVIRONMENT`, set the public project token, enable PostHog, and rebuild the web image. The route forwards ingestion only; it does not expose the PostHog admin API or contain a token.

Never enable product analytics without repeating its privacy tests and confirming the project-level privacy settings in PostHog.

## Encrypted off-host backups and restore drills

Install `age` and `rclone` on the backup host. Keep the age identity offline; the VPS receives only its public recipient. Configure an authenticated rclone remote outside the repository, with immutable/versioned retention at the destination. Neither the rclone credentials nor the age identity belongs in `runtime.env` or Git.

A normal backup refuses to succeed without an off-host `remote:path`. It creates and validates the complete custom archive inside the maintenance-only `backup-tool` container's RAM-backed `/work` filesystem, streams it directly into age encryption, verifies the ciphertext SHA-256, uploads it, and downloads the encrypted object before reporting success. No plaintext dump is written to host storage. `BACKUP_WORK_TMPFS_SIZE` defaults to 4 GiB and `BACKUP_TOOL_MEM_LIMIT` to 5 GiB; size both above the largest expected compressed dump and alert on a capacity failure because the backup fails closed when the dump cannot fit.

```sh
export BACKUP_AGE_RECIPIENT='age1...'
export BACKUP_RCLONE_DESTINATION='offsite:plg-production/postgres'
sh scripts/backup-postgres.sh
```

Production also requires the hardened daily systemd timer. Put the public age recipient and rclone remote configuration in the root-owned environment file; the installer reads its metadata but never prints or copies its values into a unit:

```sh
sudo install -d -o root -g root -m 0755 /etc/plg
sudoedit /etc/plg/backup.env
sudo chmod 0600 /etc/plg/backup.env
# Required entries include BACKUP_AGE_RECIPIENT and BACKUP_RCLONE_DESTINATION.
# Configure rclone credentials here with RCLONE_CONFIG_<REMOTE>_* variables.
# Set BACKUP_LOCAL_RETENTION_DAYS=7 (the enforced range is 1..30).
sudo sh scripts/install-backup-schedule.sh
sudo systemctl start plg-postgres-backup.service
sudo systemctl status plg-postgres-backup.service
sudo journalctl -u plg-postgres-backup.service
```

The timer runs daily at 02:15 with up to 45 minutes randomized delay, catches up after downtime, and uses `flock` to reject overlapping runs. Its success metric is written atomically only after the encrypted remote object has been streamed back and its checksum matches. Only after that verification, exact regular non-symlink local backup artifacts older than `BACKUP_LOCAL_RETENTION_DAYS` are pruned; the retention helper rejects any backup-directory symlink or path escape. Node exporter reads the static metric without labels; Prometheus alerts if it is missing or older than 30 hours. A failed unit remains visible in `systemctl --failed` and the journal.

The production acceptance gate must independently prove that the named rclone backend is genuinely off-host and that provider-side versioning/object-lock retention prevents overwrite or deletion for the approved period. The `remote:path` syntax check cannot prove those provider controls and must never be satisfied by `:local:`, a local remote, or an alias that resolves to local storage. Retrieve a retained object from the provider during scheduled restore drills; a successful upload alone is not evidence of recoverability.

Download an encrypted backup plus its `.sha256` sidecar into `backups/` on an isolated recovery host. Restore validation authenticates the age payload and inspects the PostgreSQL archive in the same RAM-backed disposable client with database passwords removed; execution decrypts into RAM and exposes only the migration credential to `pg_restore`. `--execute` restores only to a strictly validated new database prefixed `plg_restore_`; `pg_restore` connects directly as non-superuser `plg_migrate` rather than connecting as bootstrap and using `SET ROLE`. Objects and schema are owned by `plg_migrate`, runtime grants are re-established, and a direct non-superuser `plg_app` connection must pass transactional create/read/update/delete checks.

```sh
export BACKUP_AGE_IDENTITY_FILE=/secure/offline/plg-production.agekey
sh scripts/restore-postgres.sh backups/plg-TIMESTAMP.dump.age plg_restore_incident
sh scripts/restore-postgres.sh backups/plg-TIMESTAMP.dump.age plg_restore_incident --execute
```

Run `sh scripts/drill-postgres-restore.sh` to exercise a reproducible encrypted local backup/restore/CRUD drill with an ephemeral key and disposable database. This checks the mechanism, but a scheduled DR drill must also retrieve a retained off-host object and use the separately held production identity. Database backup does not cover R2 objects: enable bucket versioning/retention and an independent off-host replication policy.

## Immutable release and rollback runbook

Every deployable tag is the full 40-character Git commit SHA. CI builds and vulnerability-scans both distroless images and validates the production/synthetic Compose and Caddy configurations. Release authenticity uses OpenSSH Ed25519 signatures with the fixed `plg-release` identity and namespace. Create the signing key once on an offline trusted workstation; never put the private key in the repository, VPS, runtime directory, or CI secrets used by pull requests:

```sh
ssh-keygen -t ed25519 -C plg-production-release -f /secure/offline/plg-release-signing
printf 'plg-release %s\n' "$(cat /secure/offline/plg-release-signing.pub)" \
  > /secure/transfer/trusted_release_signers
```

Install only the public trust file on the target through an independently authenticated channel. Its path and every path component must be root-owned, non-symlinked, and not group/world writable; the default path is `/etc/plg/trusted_release_signers`:

```sh
sudo install -d -o root -g root -m 0755 /etc/plg
sudo install -o root -g root -m 0644 \
  /secure/transfer/trusted_release_signers /etc/plg/trusted_release_signers
```

On a trusted clean build host, create a signed transport bundle:

```sh
sha=$(git rev-parse HEAD)
docker build -f deploy/Dockerfile.backend \
  --label "org.opencontainers.image.revision=$sha" -t "plg-backend:$sha" .
docker build -f deploy/Dockerfile.web \
  --build-arg API_ORIGIN=https://academy.example.com \
  --build-arg API_INTERNAL_URL=https://academy.example.com/api/v1 \
  --build-arg NEXT_PUBLIC_REALTIME_URL=https://academy.example.com \
  --build-arg NEXT_PUBLIC_POSTHOG_ENABLED=false \
    --label "org.opencontainers.image.revision=$sha" -t "plg-web:$sha" .
docker build -f deploy/Dockerfile.otp-connector \
  --label "org.opencontainers.image.revision=$sha" -t "plg-otp-connector:$sha" .
export RELEASE_SIGNING_KEY_FILE=/secure/offline/plg-release-signing
sh deploy/vps/scripts/create-release-bundle.sh /secure/release-out expand-only
```

Transfer the manifest, image archive, both `.sha256` files, and the generated manifest/archive-checksum `.sig` files through an approved artifact channel. Checksums detect corruption; the independently pinned signature is what rejects forged manifests and images. The repository deliberately does not guess a registry or artifact-provider credential. On the target, install and deploy without a build:

```sh
sh scripts/install-release-bundle.sh /secure/in/release-SHA.manifest /secure/in/images-SHA.tar
export BACKUP_AGE_RECIPIENT='age1...'
export BACKUP_RCLONE_DESTINATION='offsite:plg-production/postgres'
sh scripts/deploy-release.sh /secure/in/release-SHA.manifest
```

The install gate verifies both Ed25519 signatures before `docker image load`, then verifies manifest/archive checksums and loaded image IDs/revision labels. The deploy gate verifies source SHA and deployment-config hash; runs preflight; completes an encrypted off-host pre-migration backup; permits only an `expand-only` migration; rolls API replicas one at a time; and requires live, ready, and login HTTP smoke checks. The successful signed manifest becomes `runtime/releases/current.manifest`, with the prior signed manifest retained as `previous.manifest`.

For signing-key rotation, add a second `plg-release ssh-ed25519 ...` line to the root-owned trust file first, deploy and verify a release signed by the new key, then keep both keys trusted through the complete rollback window. Remove the old public key only after every release signed solely by it is no longer a rollback candidate. A lost or suspected private key is an incident: revoke it from the target trust file and rebuild/re-sign from a reviewed commit with the replacement key.

Schema changes follow expand/migrate/contract: first add backward-compatible structures, deploy code that tolerates both versions, migrate data separately with observability, and remove old structures only in a later approved maintenance release after rollback is intentionally closed. `contract` manifests are refused by the automated release and rollback scripts.

If smoke checks fail and the applied migration remains backward-compatible, roll application images back explicitly. This never rewinds the database:

```sh
sh scripts/rollback-release.sh runtime/releases/previous.manifest \
  --acknowledge-db-not-rolled-back
```

If compatibility is uncertain, stop writes and use the incident restore procedure; do not improvise an in-place production restore. A failed release may have completed its migration before a later smoke failure, so the operator must make this decision from the migration record and release manifest.

## Operations

The WhatsApp connector uses an unofficial linked-device client. WhatsApp can revoke or restrict it without notice, so use a dedicated disposable Business number, never a personal/critical number. The persisted `/sessions` volume contains sensitive linked-device credentials and hashed 24-hour send markers: restrict Docker/root access, include it in incident response, and use Dashboard Reset to delete the linked session. The connector processes no inbound messages, has no public port, and runs Chromium without its sandbox inside a capability-free, no-new-privileges container; this is an explicit residual risk accepted only because the unofficial QR workflow was selected. The worker ledger, connector memory, and volume markers suppress normal retries/restarts, but a crash in the narrow interval after WhatsApp accepts a message and before the local success marker is durable can still duplicate one OTP because WhatsApp Web exposes no server-side idempotency contract.

Set `ALERT_WEBHOOK_URL` to a secret HTTPS endpoint owned by the off-host on-call system, then run preflight. The URL is rendered into ignored `runtime/alertmanager.yml`; do not commit or print it. Alertmanager is attached to the private monitoring network and the egress network, groups duplicate alerts, sends recovery notifications, and forwards the missing/stale off-site-backup alerts. No provider account or real receiver is created by this repository.

Before configuring a real receiver, run `PLG_ALERT_TEST_ACK=local-containers-only sh scripts/test-alertmanager-delivery.sh`. It creates an internal-only Docker network, delivers `PostgresOffsiteBackupStale` through Alertmanager to a disposable Caddy webhook, and removes the containers/network. It cannot dispatch to the internet. Production acceptance separately requires an approved synthetic alert and recovery at the real on-call destination.

Open Grafana through an SSH tunnel and change its generated admin password on first use. Worker scrapes have a three-second limit and the worker bounds BullMQ/outbox refresh work to 1.25 seconds. Prisma preview pool metrics are intentionally disabled; `postgres-exporter` and PostgreSQL `pg_stat_activity` provide connection pressure instead. Loki retains seven days and Prometheus retains fifteen days; size these against disk capacity.

Use `deploy-release.sh` for every release. Direct `docker compose build`, a floating `IMAGE_TAG`, and target-side source builds are prohibited for production.

Do not run the 10,000-user generator on this VPS. Start with browser role flows, then staged external load ramps with stop conditions for errors, database connections, memory, CPU, file descriptors, Redis/outbox lag, and realtime delivery. Per-container cAdvisor was deliberately omitted because its privileged Docker/host access is incompatible with this threat model; use the application process metrics and host/exporter views instead.

This remains a single-host design: database, cache, application, and monitoring share one failure domain. Follow [external-monitoring.md](external-monitoring.md) to configure two-region HTTPS probes and an escalation path outside the VPS; local Alertmanager cannot report loss of its own host. Real high availability requires off-host PostgreSQL backups or managed PostgreSQL, an external object store, multiple application hosts, global realtime connection enforcement, and monitoring/alert delivery outside the target host.
