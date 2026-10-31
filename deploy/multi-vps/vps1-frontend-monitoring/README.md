# VPS 1: Frontend & Monitoring Hub | واجهة المستخدم ومنظومة المراقبة

[English](#english) | [العربية](#arabic)

---

<a name="english"></a>

## English Overview

VPS 1 hosts the edge reverse proxy, public web application, and the central observability platform for the entire AcademyOps cluster.

### Services Hosted

- **Caddy (Reverse Proxy)**: Automatic TLS issuance (Let's Encrypt / ZeroSSL), HTTP/2 & HTTP/3 termination, security headers, rate limiting, and reverse proxy to Next.js and the backend on VPS 2 via the secure private network (WireGuard).
- **Next.js 16 Web Application**: Production standalone build of the web frontend with strict security profiles and read-only root filesystems.
- **Prometheus 3.5**: Scrapes metrics from VPS 1, VPS 2 (`api-a`, `api-b`, `otp-connector`, `node-exporter`), and VPS 3 (`postgres-exporter`, `redis-exporter`, `node-exporter`).
- **Alertmanager 0.28**: Evaluates alerting rules for latency, error rate, high CPU/memory, database connectivity, and queue lag.
- **Grafana 12.1**: Centralized visualization dashboards with pre-provisioned datasources (Prometheus & Loki).
- **Loki 3.5**: Central log store receiving structured logs from Grafana Alloy instances on VPS 1, VPS 2, and VPS 3.
- **Grafana Alloy**: Log collector shipping local Docker container logs to Loki.
- **Node Exporter**: System-level metrics (CPU, memory, disk, network).

### Directory Structure

```
vps1-frontend-monitoring/
├── compose.yml                          # Container definitions
├── Caddyfile                            # Edge proxy rules & upstream routing
├── runtime.env.example                  # Environment configuration template
├── alertmanager/
│   └── alertmanager.yml                 # Alertmanager routing and webhooks
├── prometheus/
│   ├── prometheus.yml                   # Target scraping configuration
│   └── alerts.yml                       # Health and saturation alert rules
├── loki/
│   └── config.yml                       # Loki TSDB & filesystem storage config
├── alloy/
│   └── config.alloy                     # Container log collector pipeline
├── grafana/provisioning/
│   ├── datasources/datasources.yml      # Auto-linked Prometheus & Loki
│   └── dashboards/dashboards.yml        # Provisioned dashboard definitions
└── scripts/
    ├── setup-host.sh                    # Host hardening, UFW firewall & docker
    ├── deploy.sh                        # Build & rolling deployment script
    └── healthcheck.sh                   # Automated validation suite
```

### Quick Start

1. **Prepare Host**:
   ```bash
   sudo sh scripts/setup-host.sh
   ```
2. **Configure WireGuard Mesh**:
   Run `wireguard/setup-wireguard-mesh.sh` to assign private IP `10.10.0.1/24` to this node.
3. **Configure Environment**:
   ```bash
   cp runtime.env.example runtime.env
   chmod 600 runtime.env
   nano runtime.env
   ```
4. **Deploy**:
   ```bash
   sh scripts/deploy.sh
   ```
5. **Access Dashboards Securely**:
   Grafana and Prometheus are bound to `127.0.0.1` and never exposed publicly. Access them via SSH tunnels:
   ```bash
   ssh -L 3300:127.0.0.1:3300 -L 9090:127.0.0.1:9090 user@vps1-ip
   ```
   Then open `http://localhost:3300` in your browser.

---

<a name="arabic"></a>

## نظرة عامة بالعربية

يحتوي الخادم الأول (VPS 1) على بوابة الدخول العامة، واجهة المستخدم (Next.js)، ومنظومة المراقبة والتحليلات المركزية لكامل العنقود (Cluster).

### الخدمات المدارة على هذا السيرفر

1. **Caddy (بوابة الدخول العكسية)**: يتولى إصدار وتجديد شهادات SSL التلقائية، رؤوس الحماية (HSTS, CSP)، وتمرير الطلبات إلى واجهة المستخدم أو إلى الباك إند على VPS 2 عبر شبكة WireGuard المشفرة.
2. **Next.js 16 Web**: واجهة التطبيق التي تم بناؤها للإنتاج بأعلى معايير الأمان (Read-only filesystem, non-root user).
3. **Prometheus 3.5**: مركز تجميع المؤشرات التشغيلية لجميع السيرفرات الثلاثة.
4. **Alertmanager 0.28**: إدارة التنبيهات وإرسال الإشعارات عند حدوث أي خلل.
5. **Grafana 12.1**: لوحات القيادة والتحليلات المجهزة مسبقاً لمراقبة الأداء واستهلاك الموارد.
6. **Loki 3.5**: مخزن السجلات المركزية الذي يستقبل سجلات الحاويات من السيرفرات الثلاثة.
7. **Grafana Alloy & Node Exporter**: جمع سجلات الحاويات ومؤشرات العتاد.

### خطوات التشغيل السريع

1. **تأمين السيرفر والجدار الناري**:
   ```bash
   sudo sh scripts/setup-host.sh
   ```
2. **تجهيز شبكة WireGuard**:
   قم بتشغيل سكريبت الربط الشبكي لإعطاء السيرفر الآي بي الخاص `10.10.0.1`.
3. **إعداد المتغيرات البيئية**:
   انسخ `runtime.env.example` إلى `runtime.env` وأدخل البيانات الحقيقية ومفاتيح التشفير.
4. **النشر والتفعيل**:
   ```bash
   sh scripts/deploy.sh
   ```
5. **الدخول الآمن للوحات المراقبة**:
   منافذ Grafana و Prometheus مغلقة تماماً عن الإنترنت ومربوطة فقط على `127.0.0.1`، للدخول افتح SSH Tunnel من جهازك:
   ```bash
   ssh -L 3300:127.0.0.1:3300 -L 9090:127.0.0.1:9090 user@vps1-ip
   ```
   ثم افتح `http://localhost:3300` في المتصفح.
