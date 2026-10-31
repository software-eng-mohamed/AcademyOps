# VPS 2: Backend, Worker & WhatsApp OTP | الخادم الخلفي، معالج المهام والواتساب

[English](#english) | [العربية](#arabic)

---

<a name="english"></a>

## English Overview

VPS 2 is the computational powerhouse of the AcademyOps cluster. It handles all business logic, database transactions, background job processing, antivirus file scanning, and automated WhatsApp OTP delivery.

### Services Hosted

- **API Instance A & B (`api-a`, `api-b`)**: Dual-instance NestJS REST API and Socket.IO WebSocket gateway. Instance A listens on `10.10.0.2:3001` and Instance B on `10.10.0.2:3003`. All requests arrive securely from Caddy on VPS 1 over the WireGuard VPN mesh.
- **BullMQ Background Worker (`worker`)**: Asynchronous worker processing queues from Redis on VPS 3 (transactional emails, student enrollment notifications, document processing, cleanup tasks).
- **WhatsApp OTP Connector (`otp-connector`)**: Puppeteer/Chromium microservice with persistent session state delivering verified OTP codes via WhatsApp Baileys protocol.
- **ClamAV (`clamav`)**: Antivirus scanning daemon scanning all incoming student identity and certificate uploads before persistence to Cloudflare R2.
- **Grafana Alloy**: Log collector streaming all container logs directly to central Loki on VPS 1.
- **Node Exporter**: Hardware metrics exposed on `10.10.0.2:9100` for scraping by Prometheus on VPS 1.

### Security Architecture

- **Zero Public Ingress**: VPS 2 opens NO ports to the public internet except SSH (22) and WireGuard (51820).
- **Strict Network Isolation**: All API, database, and Redis traffic flows over the encrypted WireGuard mesh network (`10.10.0.0/24`).
- **Read-Only Filesystems**: All application containers run with `read_only: true` and minimal tmpfs allocations.

### Quick Start

1. **Prepare Host**:
   ```bash
   sudo sh scripts/setup-host.sh
   ```
2. **Configure WireGuard Mesh**:
   Run `wireguard/setup-wireguard-mesh.sh` to assign private IP `10.10.0.2/24` to this node.
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

---

<a name="arabic"></a>

## نظرة عامة بالعربية

يعد الخادم الثاني (VPS 2) قلب المعالجة لمنظومة AcademyOps، حيث يدير كافة العمليات البرمجية، اتصال قواعد البيانات، معالجة الطوابير الخلفية، فحص الملفات ضد الفيروسات، وإرسال رموز التحقق عبر الواتساب.

### الخدمات المدارة على هذا السيرفر

1. **نسختا التطبيق الخلفي (`api-a` و `api-b`)**: نسختان متوازيتان من NestJS API تعملان خلف Caddy وتوفران استمرارية العمل دون انقطاع.
2. **معالج المهام (`worker`)**: تطبيق BullMQ لمعالجة الرسائل والبريد الإلكتروني والمهام الثقيلة في الخلفية اعتماداً على Redis في السيرفر الثالث.
3. **خدمة الواتساب (`otp-connector`)**: خادم دقيق مدمج بتقنية Chromium للاتصال بحساب الواتساب وإرسال أكواد التحقق (OTP) بشكل فوري للطلاب.
4. **فاحص الفيروسات (`clamav`)**: خدمة حماية تفحص جميع الملفات المرفوعة من الطلاب قبل اعتمادها وتخزينها في Cloudflare R2.
5. **Grafana Alloy & Node Exporter**: إرسال السجلات التشغيلية ومؤشرات الأداء إلى السيرفر الأول.

### معايير الأمان

- **عزل كامل عن الإنترنت**: السيرفر لا يفتح أي منافذ ويب للعامة (لا يوجد منفذ 80 أو 443).
- **التواصل المشفر**: يتم التخاطب بين VPS 1 و VPS 2 و VPS 3 حصرياً عبر نفق شبكة WireGuard المشفر (`10.10.0.0/24`).
- **حاويات محمية**: جميع الحاويات تعمل بملفات قراءة فقط (Read-Only) مع إسقاط كافة الصلاحيات الجذرية.

### خطوات التشغيل السريع

1. **تأمين السيرفر والجدار الناري**:
   ```bash
   sudo sh scripts/setup-host.sh
   ```
2. **تجهيز شبكة WireGuard**:
   قم بتشغيل سكريبت الربط الشبكي لإعطاء السيرفر الآي بي الخاص `10.10.0.2`.
3. **إعداد المتغيرات البيئية**:
   انسخ `runtime.env.example` إلى `runtime.env` وتأكد من ضبط بيانات الاتصال بـ VPS 3.
4. **النشر والتفعيل**:
   ```bash
   sh scripts/deploy.sh
   ```
