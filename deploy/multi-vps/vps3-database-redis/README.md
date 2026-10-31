# VPS 3: Database & Redis Data Tier | خادم قواعد البيانات والذاكرة المؤقتة

[English](#english) | [العربية](#arabic)

---

<a name="english"></a>

## English Overview

VPS 3 hosts the persistent state and caching layers of the AcademyOps cluster. It is isolated from the public internet and accessible exclusively through the encrypted WireGuard mesh network.

### Services Hosted

- **PostgreSQL 17.6**: Relational storage running with optimized memory buffers (`shared_buffers=512MB`, `max_connections=300`), query profiling (`pg_stat_statements`), and SSD transaction commit parameters.
- **Redis 7.4**: High-throughput in-memory cache and BullMQ job queue broker with AOF persistence (`appendfsync everysec`) and strict password authentication.
- **PostgreSQL Exporter 0.17**: Exposes internal query execution times, connection pool saturation, and table dead tuple ratios on `10.10.0.3:9187` for Prometheus on VPS 1.
- **Redis Exporter 1.67**: Exposes cache hit ratios, queue lengths, memory usage, and command latency on `10.10.0.3:9121` for Prometheus on VPS 1.
- **Grafana Alloy**: Log forwarder transmitting PostgreSQL query logs and Redis system logs to central Loki on VPS 1.
- **Node Exporter**: System resource metrics on `10.10.0.3:9100`.

### Security Hardening

- **No Public Access**: All database and cache ports are bound strictly to the WireGuard private interface (`10.10.0.3`).
- **Separation of Privileges**: `plg_migrate` owns the schema; `plg_app` has CRUD permissions; `plg_monitor` is read-only for monitoring metrics.
- **Automated Atomic Backups**: Custom-format `pg_dump` with age encryption and automated 7-day retention pruning.

### Quick Start

1. **Prepare Host**:
   ```bash
   sudo sh scripts/setup-host.sh
   ```
2. **Configure WireGuard Mesh**:
   Run `wireguard/setup-wireguard-mesh.sh` to assign private IP `10.10.0.3/24` to this node.
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
5. **Run Backup**:
   ```bash
   sh scripts/backup.sh
   ```

---

<a name="arabic"></a>

## نظرة عامة بالعربية

يحتوي الخادم الثالث (VPS 3) على طبقة البيانات الثابتة والتخزين المؤقت لمنظومة AcademyOps، وهو معزول تماماً عن شبكة الإنترنت ولا يمكن الوصول إليه إلا عبر شبكة WireGuard الخاصة والمشفرة.

### الخدمات المدارة على هذا السيرفر

1. **PostgreSQL 17**: قاعدة البيانات الرئيسية بإعدادات محسنة للأداء وسرعة الاستجابة ومراقبة بطء الاستعلامات (`pg_stat_statements`).
2. **Redis 7.4**: مخزن الذاكرة السريعة وطوابير المهام لـ BullMQ مع الحفظ المستمر على القرص (AOF Persistence) وتفعيل كلمة المرور.
3. **PostgreSQL & Redis Exporters**: مصدّرات المؤشرات التشغيلية الخاصة بقواعد البيانات لقراءتها بواسطة Prometheus في السيرفر الأول.
4. **Grafana Alloy & Node Exporter**: شحن السجلات التشغيلية ومؤشرات الخادم إلى منظومة المراقبة المركزية.
5. **نظام النسخ الاحتياطي الذاتي**: سكريبت مخصص لعمل نسخ احتياطي فوري مشفر بأداة `age` مع دعم الرفع التلقائي السحابي عبر `rclone`.

### معايير الأمان

- **عزل كلي عن الإنترنت**: كافة منافذ قواعد البيانات وريديس مربوطة حصرياً بالآي بي الخاص `10.10.0.3` ولا تفتح أي منفذ على الإنترنت العام.
- **تدرج الصلاحيات في PostgreSQL**: فصل كامل بين حساب التهجير (`plg_migrate`) وحساب تشغيل التطبيق (`plg_app`) وحساب المراقبة (`plg_monitor`).
- **الجدار الناري الصارم**: يسمح بالاتصال فقط من السيرفرين الشقيقين (VPS 1 و VPS 2) عبر نفق WireGuard.

### خطوات التشغيل السريع

1. **تأمين السيرفر والجدار الناري**:
   ```bash
   sudo sh scripts/setup-host.sh
   ```
2. **تجهيز شبكة WireGuard**:
   قم بتشغيل سكريبت الربط الشبكي لإعطاء السيرفر الآي بي الخاص `10.10.0.3`.
3. **إعداد المتغيرات البيئية**:
   انسخ `runtime.env.example` إلى `runtime.env` وضع كلمات المرور القوية.
4. **النشر والتفعيل**:
   ```bash
   sh scripts/deploy.sh
   ```
5. **أخذ نسخة احتياطية**:
   ```bash
   sh scripts/backup.sh
   ```
