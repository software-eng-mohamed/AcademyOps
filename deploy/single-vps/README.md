# دليل تشغيل المنظومة على خادم واحد (Single VPS Runbook)

هذا الدليل يشرح كيفية رفع وتشغيل منصة **AcademyOps** بالكامل على خادم VPS واحد يعمل بنظام Ubuntu 22.04 أو 24.04 LTS.

---

## 1. مواصفات الخادم الموصى بها (Recommended Specs)

- **المعالج**: 4 vCPUs على الأقل (يفضل Compute-optimized).
- **الذاكرة**: 8 GB RAM كحد أدنى (16 GB موصى بها مع ClamAV والمراقبة).
- **التخزين**: 50+ GB NVMe SSD.
- **نظام التشغيل**: Ubuntu 22.04 LTS أو Ubuntu 24.04 LTS.

---

## 2. خطوات الإعداد الأولي (First-time Setup)

### الخطوة 1: تجهيز وتأمين الخادم (Host Bootstrap)

قم بالدخول إلى السيرفر كـ `root` ثم نفّذ إسكربت التهيئة الذي يثبت Docker ويفعل جدار الحماية `UFW` و`Fail2ban` وإعدادات الكيرنل:

```bash
cd deploy/single-vps
sudo sh scripts/bootstrap.sh
```

### الخطوة 2: توليد الأسرار والمفاتيح التشفيرية

قم بتشغيل إسكربت التوليد التلقائي لإنشاء ملف `runtime.env` بكل كلمات المرور والمفاتيح العشوائية ذات الأمان العالي:

```bash
sh scripts/generate-secrets.sh
```

### الخطوة 3: تعديل إعدادات الدومين والخدمات الخارجية

افتح ملف `runtime.env` وقم بضبط:

1. `SITE_ADDRESS`: اسم النطاق الخاص بك (مثال: `academy.example.com`).
2. `PUBLIC_ORIGIN`: الرابط الكامل بالنطاق والبروتوكول (مثال: `https://academy.example.com`).
3. `ACME_EMAIL`: بريدك الإلكتروني لإصدار شهادات Let's Encrypt التلقائية.
4. مفاتيح Paymob (بوابات الدفع) وCloudflare R2 (لتخزين الشهادات والملفات) وبيانات SMTP (لإرسال الإيميلات).

---

## 3. التشغيل والنشر (Deployment)

لبدء تشغيل المنظومة بالكامل (إنشاء قاعدة البيانات، تشغيل الترحيلات، وبدء الخدمات):

```bash
sh scripts/deploy.sh
```

الإسكربت يقوم تلقائياً بـ:

1. التحقق من صلاحيات `runtime.env`.
2. تشغيل PostgreSQL وRedis والانتظار حتى اجتياز فحص الصحة.
3. تشغيل إسكربت الصلاحيات `db-observability-init` وترحيلات Prisma (`prisma migrate deploy`).
4. تشغيل خوادم التطبيق (API Instances)، الواجهة (Next.js PWA)، متصل واتساب (WhatsApp Web)، ومجموعة المراقبة.
5. تشغيل الفحص الشامل لصحة كافة الحاويات.

---

## 4. فحص الصحة والمراقبة (Monitoring & Healthchecks)

### فحص الصحة السريع:

```bash
sh scripts/healthcheck.sh
```

يقوم بفحص 12 نقطة تشغيلية (DB, Redis, ClamAV, WhatsApp, API A, API B, Web, Caddy, Prometheus, Alertmanager, Grafana, Loki).

### الوصول إلى لوحات التحكم (عبر نفق SSH آمن):

المنافذ الداخلية للمراقبة مغلقة عن الإنترنت الخارجي حمايةً للمنظومة. للوصول إليها من جهازك الشخصي:

```bash
ssh -L 3300:127.0.0.1:3300 -L 9090:127.0.0.1:9090 deploy@YOUR_SERVER_IP
```

ثم افتح في المتصفح:

- **Grafana**: `http://localhost:3300` (اسم المستخدم: `admin`، كلمة المرور تجدها في `runtime.env`).
- **Prometheus**: `http://localhost:9090`.

---

## 5. النسخ الاحتياطي والاستعادة (Backup & Restore)

### إنشاء نسخة احتياطية فورية:

```bash
sh scripts/backup.sh
```

يتم حفظ النسخة في مجلد `backups/` مع تشفيرها بـ `age` ورفعها إلى Cloudflare R2 / S3 إذا كانت بيانات التخزين الخارجي مضبوطة.

### استعادة نسخة احتياطية:

```bash
sh scripts/restore.sh backups/plg_academy_YYYYMMDDTHHMMSSZ.dump
```
