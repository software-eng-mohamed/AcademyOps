# AcademyOps - 3-VPS Production Cluster Runbook

# دليل التشغيل والرفع لبيئة الإنتاج الموزعة على 3 سيرفرات (VPS)

[English](#english) | [العربية](#arabic)

---

<a name="english"></a>

## Local inventory and provisioning

The repository contains `cluster-nodes.example.json` with documentation-only addresses. Copy it
to `cluster-nodes.local.json` and supply your own instance IDs, server IPs, and the unique roles
`vps1`, `vps2`, and `vps3`. The local inventory and generated WireGuard keys are ignored by Git.

The optional PowerShell helpers accept explicit inputs rather than embedding a machine path,
cloud account, or server address:

```powershell
# Preview only. Actual provisioning creates billable AWS resources.
.\launch-instances.ps1 -ImageId 'ami-REPLACE' -SecurityGroupId 'sg-REPLACE' `
  -KeyName 'your-key-pair' -Region 'your-region' -WhatIf

.\scripts\run-bootstrap-all.ps1 -SshKeyPath 'C:\private\cluster.pem' -WhatIf
.\scripts\deploy-wireguard-mesh.ps1 -SshKeyPath 'C:\private\cluster.pem' -WhatIf
```

Replace the placeholders with valid values before invoking a helper. Verify the SSH host keys of
your servers first; the batch scripts preserve host-key checking and fail on unknown hosts.
The launcher writes an ignored `cluster-nodes.local.json` and refuses to overwrite an existing
inventory. Keep a private record of provisioned instances, especially after a partial failure.

For initial application data use the reviewed Prisma seed (`pnpm db:seed`) with your own
`BOOTSTRAP_OWNER_EMAIL` and `BOOTSTRAP_OWNER_PASSWORD`. There is no public script that resets
every account to one shared password. Deployment templates and source availability do not
establish that the cluster or any external provider has passed live acceptance testing.

## Architectural Overview

The 3-VPS production architecture isolates application layers according to performance profiles, security boundaries, and scalability needs:

```
[ Internet / Students ]
          │
          ▼ (Ports 80 / 443)
┌────────────────────────────────────────────────────────────────────────┐
│ VPS 1: Frontend & Central Observability Hub                            │
│ Private IP: 10.10.0.1/24                                               │
│                                                                        │
│  ┌──────────────┐         ┌───────────────┐                            │
│  │    Caddy     │────────▶│  Next.js 16   │ (Port 3100)                │
│  │ (TLS & WAF)  │         │   Frontend    │                            │
│  └──────┬───────┘         └───────────────┘                            │
│         │ (WireGuard encrypted mesh)                                   │
│  ┌──────┴────────────────────────────────────────────────────────┐     │
│  │ Observability Platform:                                       │     │
│  │ • Prometheus 3.5 (Port 9090 - Scrapes VPS 1, 2, 3)            │     │
│  │ • Alertmanager 0.28 (Port 9093 - Evaluates alerts)            │     │
│  │ • Grafana 12.1 (Port 3300 - Dashboards & Analytics)           │     │
│  │ • Loki 3.5 (Port 3100 - Central Log Store)                    │     │
│  └───────────────────────────────────────────────────────────────┘     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           WireGuard Mesh Network   │ (10.10.0.0/24 via UDP 51820)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ VPS 2: Backend Core, Background Worker & WhatsApp OTP                  │
│ Private IP: 10.10.0.2/24                                               │
│ (Zero public ingress - Accessible ONLY via WireGuard)                  │
│                                                                        │
│  • NestJS API Instance A (Port 3001)                                   │
│  • NestJS API Instance B (Port 3003)                                   │
│  • BullMQ Background Worker (Processes queues & transactional mail)    │
│  • WhatsApp OTP Connector (Port 3002 - whatsapp-web.js)                │
│  • ClamAV Antivirus Daemon (Port 3310 - File upload security)          │
│  • Grafana Alloy (Streams local container logs to VPS 1 Loki)          │
│  • Node Exporter (Exposes system metrics on port 9100)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ (WireGuard encrypted mesh)
┌────────────────────────────────────────────────────────────────────────┐
│ VPS 3: High-Performance Database & Cache Tier                          │
│ Private IP: 10.10.0.3/24                                               │
│ (Zero public ingress - Accessible ONLY via WireGuard)                  │
│                                                                        │
│  • PostgreSQL 17.6 Relational Database (Port 5432)                     │
│  • Redis 7.4 In-Memory Cache & Job Queue Broker (Port 6379)            │
│  • Prometheus PostgreSQL Exporter (Port 9187)                          │
│  • Prometheus Redis Exporter (Port 9121)                               │
│  • Atomic Snapshot Backup Engine (pg_dump + age encryption)            │
│  • Grafana Alloy (Streams DB logs to VPS 1 Loki)                       │
│  • Node Exporter (Exposes system metrics on port 9100)                 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Network & Firewall Topology

| Server    | Role                  | WireGuard IP | Public Ingress Allowed                              | Private Ingress (WireGuard)                                          |
| --------- | --------------------- | ------------ | --------------------------------------------------- | -------------------------------------------------------------------- |
| **VPS 1** | Frontend & Monitoring | `10.10.0.1`  | 22 (SSH), 80 (HTTP), 443 (HTTPS), 51820 (WireGuard) | 3100 (Loki Log Push from VPS 2 & 3)                                  |
| **VPS 2** | Backend & Workers     | `10.10.0.2`  | 22 (SSH), 51820 (WireGuard)                         | 3001 (API A), 3003 (API B), 9100 (Node Exporter)                     |
| **VPS 3** | PostgreSQL & Redis    | `10.10.0.3`  | 22 (SSH), 51820 (WireGuard)                         | 5432 (Postgres), 6379 (Redis), 9187 (PG Exp), 9121 (Redis Exp), 9100 |

---

## Step-by-Step Production Deployment Procedure

### Phase 1: Host Hardening & Prerequisites

On all three VPSs (Ubuntu 22.04 or 24.04 LTS):

1. SSH into **VPS 1**:
   ```bash
   cd /opt/plg-cluster/deploy/multi-vps/vps1-frontend-monitoring
   sudo sh scripts/setup-host.sh
   ```
2. SSH into **VPS 2**:
   ```bash
   cd /opt/plg-cluster/deploy/multi-vps/vps2-backend-worker
   sudo sh scripts/setup-host.sh
   ```
3. SSH into **VPS 3**:
   ```bash
   cd /opt/plg-cluster/deploy/multi-vps/vps3-database-redis
   sudo sh scripts/setup-host.sh
   ```

### Phase 2: WireGuard Private Mesh Network

On your deployment control machine (or on VPS 1):

1. Navigate to the `wireguard/` directory:
   ```bash
   cd deploy/multi-vps/wireguard
   sh setup-wireguard-mesh.sh <VPS1_PUBLIC_IP> <VPS2_PUBLIC_IP> <VPS3_PUBLIC_IP>
   ```
2. Distribute the generated configs:
   - Copy `generated/wg0-vps1.conf` to VPS 1 at `/etc/wireguard/wg0.conf`
   - Copy `generated/wg0-vps2.conf` to VPS 2 at `/etc/wireguard/wg0.conf`
   - Copy `generated/wg0-vps3.conf` to VPS 3 at `/etc/wireguard/wg0.conf`
3. Start and enable WireGuard on each VPS:
   ```bash
   sudo chmod 600 /etc/wireguard/wg0.conf
   sudo systemctl enable --now wg-quick@wg0
   ```
4. Verify mesh connectivity:
   From VPS 1, ping both peers:
   ```bash
   ping -c 3 10.10.0.2
   ping -c 3 10.10.0.3
   ```

### Phase 3: Cluster Secrets Generation

Generate synchronized cryptographic secrets across the entire cluster in one shot:

```bash
cd deploy/multi-vps/scripts
sh generate-cluster-secrets.sh
```

This generates:

- `vps1-frontend-monitoring/runtime.env`
- `vps2-backend-worker/runtime.env`
- `vps3-database-redis/runtime.env`

Copy each `runtime.env` file to its corresponding server under the respective folder, and edit your production domain name and external provider keys (Paymob, Cloudflare R2, SendGrid SMTP).

### Phase 4: Deploy VPS 3 (Database & Redis Tier First)

```bash
cd deploy/multi-vps/vps3-database-redis
sh scripts/deploy.sh
```

This starts PostgreSQL 17, Redis 7.4, runs `db-observability-init` to provision restricted roles, starts exporters, and verifies all 6 health checks.

### Phase 5: Deploy VPS 2 (Backend & Workers)

```bash
cd deploy/multi-vps/vps2-backend-worker
sh scripts/deploy.sh
```

This builds backend images, executes Prisma migrations against VPS 3 PostgreSQL, starts API instances A & B, the BullMQ worker, ClamAV, and the WhatsApp OTP connector.

### Phase 6: Deploy VPS 1 (Frontend & Monitoring Hub)

```bash
cd deploy/multi-vps/vps1-frontend-monitoring
sh scripts/deploy.sh
```

This builds the Next.js frontend, launches Caddy with automatic HTTPS, and activates the Prometheus, Alertmanager, Grafana, and Loki observability stack.

### Phase 7: Cluster-Wide Health Verification

Verify end-to-end routing, database transactions, and metric ingestion:

```bash
cd deploy/multi-vps/scripts
sh cluster-healthcheck.sh
```

---

## Secure Monitoring Access via SSH Tunneling

Grafana (Port 3300) and Prometheus (Port 9090) are bound exclusively to `127.0.0.1` on VPS 1 and are NOT exposed to the public internet.

To open the dashboards on your local workstation:

```bash
ssh -L 3300:127.0.0.1:3300 -L 9090:127.0.0.1:9090 user@vps1-ip
```

Then navigate to:

- **Grafana Dashboards**: `http://localhost:3300` (Default user: `admin`, password in `vps1/runtime.env`)
- **Prometheus Core**: `http://localhost:9090`

---

## Backups & Disaster Recovery

On **VPS 3**:

- Trigger an on-demand encrypted backup:
  ```bash
  cd deploy/multi-vps/vps3-database-redis
  sh scripts/backup.sh
  ```
- To restore a backup:
  ```bash
  sh scripts/restore.sh backups/plg_academy_20260909T180000Z.dump
  ```

---

<a name="arabic"></a>

## الدليل التشغيلي الشامل بالعربية (نظام 3 خوادم)

تم تصميم هذا التوزيع ليمنح منظومة AcademyOps أعلى درجات الاستقرار والأمان وعزل الصدمات التشغيلية، بحيث يعمل كل سيرفر بوظيفة محددة ومنفصلة:

### تفصيل الخوادم الثلاثة:

1. **الخادم الأول (VPS 1) - الواجهة والمراقبة المركزية (`10.10.0.1`)**:
   - يستقبل زوار الموقع عبر المنفذين 80 و 443 ويدير شهادات الأمان تلقائياً عبر Caddy.
   - يستضيف واجهة المستخدم المبنية بـ Next.js 16.
   - يحتوي على مركز التحليلات والـ Observability الكامل (Grafana, Prometheus, Alertmanager, Loki).
2. **الخادم الثاني (VPS 2) - المحرك الخلفي والواتساب (`10.10.0.2`)**:
   - يحتوي على نسختين متوازيتين من الـ API لتوزيع الأحمال.
   - معالج مهام الخلفية وإرسال الإيميلات (BullMQ Worker).
   - خادم الواتساب لإرسال أكواد التحقق (OTP Connector).
   - فاحص الفيروسات للملفات المرفوعة (ClamAV).
   - **معزول تماماً عن الإنترنت العام** (لا يفتح أي منفذ خارجي سوى نفق WireGuard المشفر).
3. **الخادم الثالث (VPS 3) - قواعد البيانات والذاكرة السريعة (`10.10.0.3`)**:
   - قاعدة بيانات PostgreSQL 17 مهيأة ومحسنة للضغط العالي.
   - ذاكرة Redis 7.4 مع تفعيل الحفظ الدائم على القرص (AOF).
   - سكريبتات النسخ الاحتياطي التلقائي والمشفر.
   - **معزول تماماً عن الإنترنت العام**.

---

### خطوات الرفع والنشر خطوة بخطوة

#### الخطوة 1: تهيئة الخوادم والجدران النارية

في كل خادم من الخوادم الثلاثة، قم بتشغيل سكريبت التهيئة المناسب:

- على VPS 1: `sudo sh deploy/multi-vps/vps1-frontend-monitoring/scripts/setup-host.sh`
- على VPS 2: `sudo sh deploy/multi-vps/vps2-backend-worker/scripts/setup-host.sh`
- على VPS 3: `sudo sh deploy/multi-vps/vps3-database-redis/scripts/setup-host.sh`

#### الخطوة 2: تفعيل شبكة WireGuard المشفرة

من جهاز التحكم أو من السيرفر الأول:

```bash
cd deploy/multi-vps/wireguard
sh setup-wireguard-mesh.sh <آي_بي_VPS1> <آي_بي_VPS2> <آي_بي_VPS3>
```

قم بنسخ ملفات الإعداد الناتجة إلى `/etc/wireguard/wg0.conf` على كل سيرفر، ثم شغل الخدمة:

```bash
sudo systemctl enable --now wg-quick@wg0
```

#### الخطوة 3: توليد مفاتيح التشفير الموحدة

```bash
cd deploy/multi-vps/scripts
sh generate-cluster-secrets.sh
```

سيقوم السكريبت بإنشاء ملفات `runtime.env` متطابقة ومشفرة لكافة السيرفرات.

#### الخطوة 4: تشغيل السيرفرات بالترتيب الصحيح

1. **ابدأ بالسيرفر الثالث أولاً (قواعد البيانات)**:
   ```bash
   cd deploy/multi-vps/vps3-database-redis && sh scripts/deploy.sh
   ```
2. **ثم شغل السيرفر الثاني (الباك إند والعمال)**:
   ```bash
   cd deploy/multi-vps/vps2-backend-worker && sh scripts/deploy.sh
   ```
3. **أخيراً شغل السيرفر الأول (الفرونت إند والبروكسي)**:
   ```bash
   cd deploy/multi-vps/vps1-frontend-monitoring && sh scripts/deploy.sh
   ```

#### الخطوة 5: التحقق الشامل من سلامة العنقود

```bash
cd deploy/multi-vps/scripts
sh cluster-healthcheck.sh
```

---

### الدخول الآمن للوحات المراقبة والتحكم

لوحات Grafana و Prometheus محمية ومربوطة محلياً فقط لمنع أي اختراق، للدخول إليها من جهازك الشخصي:

```bash
ssh -L 3300:127.0.0.1:3300 -L 9090:127.0.0.1:9090 user@vps1-ip
```

ثم توجه في متصفحك إلى: `http://localhost:3300`
