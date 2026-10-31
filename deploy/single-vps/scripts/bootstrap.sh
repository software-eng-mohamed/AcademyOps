#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - Single VPS Host Bootstrap Script
# Hardens an Ubuntu 22.04 / 24.04 server for production single-VPS deployment
# ==============================================================================
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root (or with sudo)." >&2
  exit 1
fi

echo "=== 1. System Updates & Prerequisites ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  ufw \
  fail2ban \
  unattended-upgrades \
  openssl \
  jq

echo "=== 2. Kernel & Sysctl Hardening ==="
cat > /etc/sysctl.d/99-plg.conf <<'EOF'
# Virtual memory & TCP optimization
vm.max_map_count=262144
vm.overcommit_memory=1
net.core.somaxconn=65535
net.ipv4.tcp_max_syn_backlog=8192
net.ipv4.tcp_slow_start_after_idle=0
net.ipv4.tcp_tw_reuse=1
net.ipv4.ip_forward=1
EOF
sysctl --system

echo "=== 3. Install Docker Engine & Compose v2 ==="
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y
  apt-get install -y --no-install-recommends \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin
fi

systemctl enable docker
systemctl start docker

echo "=== 4. Configure Firewall (UFW) ==="
# Allow SSH, HTTP, HTTPS only
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP Caddy'
ufw allow 443/tcp comment 'HTTPS Caddy'
ufw --force enable

echo "=== 5. Configure Fail2Ban ==="
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = 22
EOF
systemctl enable fail2ban
systemctl restart fail2ban

echo "=== 6. Create plg Deploy User (Optional) ==="
if ! id -u plg >/dev/null 2>&1; then
  useradd -m -s /bin/bash plg
  usermod -aG docker plg
  echo "Created 'plg' user with docker group access."
fi

echo "=== Bootstrap Complete! ==="
echo "The host is now hardened and ready for PLG single-vps deployment."
