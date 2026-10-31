# WireGuard Mesh Private Network | شبكة النفق المشفرة بين السيرفرات

[English](#english) | [العربية](#arabic)

---

<a name="english"></a>

## Overview

The 3-VPS production architecture relies on an encrypted peer-to-peer WireGuard VPN mesh (`10.10.0.0/24`). All inter-service communications (API to Database, Caddy to API, Prometheus scraping, and Loki log ingestion) occur strictly across this mesh.

### Node Topology

| Node      | Role                              | Private WireGuard IP | Allowed Ports (Cluster Only)                                             |
| --------- | --------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| **VPS 1** | Frontend & Central Monitoring     | `10.10.0.1`          | 3100 (Loki Ingestion)                                                    |
| **VPS 2** | Backend API, Worker, WhatsApp OTP | `10.10.0.2`          | 3001 (API A), 3003 (API B), 9100 (Node Exporter)                         |
| **VPS 3** | PostgreSQL 17 & Redis 7.4         | `10.10.0.3`          | 5432 (Postgres), 6379 (Redis), 9187 (PG Exporter), 9121 (Redis Exporter) |

### How It Works

1. Run `sh setup-wireguard-mesh.sh <VPS1_IP> <VPS2_IP> <VPS3_IP>`.
2. The script creates 3 unique private/public keypairs and a preshared quantum-resistant key (`PSK`).
3. Deploy the resulting `wg0.conf` file to `/etc/wireguard/wg0.conf` on each host.
4. Enable the service: `sudo systemctl enable --now wg-quick@wg0`.
5. Every host can now securely ping each other over `10.10.0.1`, `10.10.0.2`, and `10.10.0.3`.

---

<a name="arabic"></a>

## نظرة عامة بالعربية

تعتمد بنية الـ 3 سيرفرات على شبكة مشفرة خاصة وسريعة للغاية باستخدام WireGuard (`10.10.0.0/24`). كافة الاتصالات الداخلية بين السيرفرات (اتصال الـ API بقاعدة البيانات وريديس، وتحويل الطلبات من Caddy، وجمع المؤشرات وسجلات Loki) تتم حصرياً عبر هذا النفق المشفر.

### جدول توزيع العناوين الخاصة

| الخادم    | الدور الوظيفي               | العنوان الخاص (WireGuard) | المنافذ المفتوحة داخلياً فقط                                             |
| --------- | --------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| **VPS 1** | الواجهة ومنظومة المراقبة    | `10.10.0.1`               | 3100 (استقبال سجلات Loki)                                                |
| **VPS 2** | الباك إند والعمال والواتساب | `10.10.0.2`               | 3001 و 3003 (تطبيقات API), 9100 (مؤشرات الخادم)                          |
| **VPS 3** | قواعد بيانات بوستجرس وريديس | `10.10.0.3`               | 5432 (Postgres), 6379 (Redis), 9187 (PG Exporter), 9121 (Redis Exporter) |

### خطوات التشغيل

1. قم بتشغيل السكريبت المرفق:
   ```bash
   sh setup-wireguard-mesh.sh <VPS1_PUBLIC_IP> <VPS2_PUBLIC_IP> <VPS3_PUBLIC_IP>
   ```
2. سيقوم السكريبت بتوليد المفاتيح والتشفير المسبق (PSK) وملفات الإعداد لكل سيرفر في المجلد `generated/`.
3. انقل كل ملف إلى السيرفر الخاص به في المسار `/etc/wireguard/wg0.conf`.
4. فعل الخدمة في كل سيرفر:
   ```bash
   sudo systemctl enable --now wg-quick@wg0
   ```
5. تحقق من الاتصال الداخلي عن طريق فحص الـ `ping` بين العناوين الثلاثة (`10.10.0.1`, `10.10.0.2`, `10.10.0.3`).
