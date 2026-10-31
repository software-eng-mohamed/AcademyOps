#!/usr/bin/env bash
set -euo pipefail

# 1. Setup swap if not already present
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2. Update and install prerequisites
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release wireguard wireguard-tools ufw jq

# 3. Install Docker
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  usermod -aG docker ubuntu
  systemctl enable docker
  systemctl start docker
fi

# 4. Enable IPv4 forwarding for WireGuard
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-wireguard.conf
sysctl -p /etc/sysctl.d/99-wireguard.conf

echo "NODE_BOOTSTRAP_COMPLETE: $(hostname) at $(date)"
