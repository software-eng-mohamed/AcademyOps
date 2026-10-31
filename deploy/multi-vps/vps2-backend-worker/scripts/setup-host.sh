#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - VPS 2 (Backend, Worker, WhatsApp OTP) Host Setup & Hardening
# OS: Ubuntu 22.04 / 24.04 LTS
# ==============================================================================
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: This script must be run as root (or with sudo)." >&2
  exit 1
fi

echo "=== 1. Updating System & Installing Base Packages ==="
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
  wireguard \
  openssl \
  jq

echo "=== 2. Kernel & Sysctl Optimization ==="
cat > /etc/sysctl.d/99-plg-vps2.conf <<'EOF'
vm.max_map_count=262144
vm.overcommit_memory=1
net.core.somaxconn=65535
net.ipv4.tcp_max_syn_backlog=8192
net.ipv4.tcp_slow_start_after_idle=0
net.ipv4.tcp_tw_reuse=1
net.ipv4.ip_forward=1
EOF
sysctl --system

echo "=== 3. Installing Docker Engine & Compose v2 ==="
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

echo "=== 4. Configuring UFW Firewall for VPS 2 ==="
# VPS 2 has NO public web ports open!
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 51820/udp comment 'WireGuard VPN Mesh'

# Allow incoming traffic exclusively from WireGuard mesh interface (wg0)
if ip link show wg0 >/dev/null 2>&1; then
  ufw allow in on wg0 comment 'Allow private traffic from VPS 1 and VPS 3 over WireGuard'
fi

ufw --force enable

echo "=== 5. Configuring Fail2Ban ==="
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

echo "=== VPS 2 Host Setup Complete ==="
echo "Only SSH (22) and WireGuard (51820) are open publicly."
echo "API, Worker, and WhatsApp OTP services are completely isolated from the internet."
