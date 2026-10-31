#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - WireGuard Mesh Provisioner
# Generates a fully-meshed private network across VPS 1, VPS 2, and VPS 3
# Topology:
#   VPS 1 (Frontend & Monitoring): 10.10.0.1
#   VPS 2 (Backend & Workers):     10.10.0.2
#   VPS 3 (PostgreSQL & Redis):    10.10.0.3
# ==============================================================================
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$script_dir"

if ! command -v wg >/dev/null 2>&1; then
  echo "WireGuard tools ('wg') not found. Installing wireguard-tools..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y && sudo apt-get install -y wireguard-tools
  fi
fi

output_dir="$script_dir/generated"
mkdir -p "$output_dir"
chmod 700 "$output_dir"

echo "=== 1. Generating Cluster Cryptographic Keys ==="
wg genkey > "$output_dir/vps1.key"
wg pubkey < "$output_dir/vps1.key" > "$output_dir/vps1.pub"

wg genkey > "$output_dir/vps2.key"
wg pubkey < "$output_dir/vps2.key" > "$output_dir/vps2.pub"

wg genkey > "$output_dir/vps3.key"
wg pubkey < "$output_dir/vps3.key" > "$output_dir/vps3.pub"

wg genpsk > "$output_dir/cluster.psk"

VPS1_PRIV=$(cat "$output_dir/vps1.key")
VPS1_PUB=$(cat "$output_dir/vps1.pub")

VPS2_PRIV=$(cat "$output_dir/vps2.key")
VPS2_PUB=$(cat "$output_dir/vps2.pub")

VPS3_PRIV=$(cat "$output_dir/vps3.key")
VPS3_PUB=$(cat "$output_dir/vps3.pub")

PSK=$(cat "$output_dir/cluster.psk")

echo "=== 2. Collecting Public IP Addresses ==="
VPS1_IP="${1:-}"
VPS2_IP="${2:-}"
VPS3_IP="${3:-}"

if [ -z "$VPS1_IP" ]; then
  printf "Enter Public IP for VPS 1 (Frontend & Monitoring): "
  read -r VPS1_IP
fi

if [ -z "$VPS2_IP" ]; then
  printf "Enter Public IP for VPS 2 (Backend & Workers): "
  read -r VPS2_IP
fi

if [ -z "$VPS3_IP" ]; then
  printf "Enter Public IP for VPS 3 (PostgreSQL & Redis): "
  read -r VPS3_IP
fi

echo "=== 3. Generating Node Configurations ==="

# VPS 1 Config
sed \
  -e "s|\${VPS1_WG_PRIVATE_KEY}|$VPS1_PRIV|g" \
  -e "s|\${VPS2_WG_PUBLIC_KEY}|$VPS2_PUB|g" \
  -e "s|\${VPS3_WG_PUBLIC_KEY}|$VPS3_PUB|g" \
  -e "s|\${CLUSTER_PRESHARED_KEY}|$PSK|g" \
  -e "s|\${VPS2_PUBLIC_IP}|$VPS2_IP|g" \
  -e "s|\${VPS3_PUBLIC_IP}|$VPS3_IP|g" \
  "$script_dir/wg0-vps1.conf.template" > "$output_dir/wg0-vps1.conf"
chmod 600 "$output_dir/wg0-vps1.conf"

# VPS 2 Config
sed \
  -e "s|\${VPS2_WG_PRIVATE_KEY}|$VPS2_PRIV|g" \
  -e "s|\${VPS1_WG_PUBLIC_KEY}|$VPS1_PUB|g" \
  -e "s|\${VPS3_WG_PUBLIC_KEY}|$VPS3_PUB|g" \
  -e "s|\${CLUSTER_PRESHARED_KEY}|$PSK|g" \
  -e "s|\${VPS1_PUBLIC_IP}|$VPS1_IP|g" \
  -e "s|\${VPS3_PUBLIC_IP}|$VPS3_IP|g" \
  "$script_dir/wg0-vps2.conf.template" > "$output_dir/wg0-vps2.conf"
chmod 600 "$output_dir/wg0-vps2.conf"

# VPS 3 Config
sed \
  -e "s|\${VPS3_WG_PRIVATE_KEY}|$VPS3_PRIV|g" \
  -e "s|\${VPS1_WG_PUBLIC_KEY}|$VPS1_PUB|g" \
  -e "s|\${VPS2_WG_PUBLIC_KEY}|$VPS2_PUB|g" \
  -e "s|\${CLUSTER_PRESHARED_KEY}|$PSK|g" \
  -e "s|\${VPS1_PUBLIC_IP}|$VPS1_IP|g" \
  -e "s|\${VPS2_PUBLIC_IP}|$VPS2_IP|g" \
  "$script_dir/wg0-vps3.conf.template" > "$output_dir/wg0-vps3.conf"
chmod 600 "$output_dir/wg0-vps3.conf"

echo "==================================================================="
echo "WireGuard Mesh Configurations Generated in: $output_dir"
echo ""
echo "Installation Instructions:"
echo "1. On VPS 1 ($VPS1_IP):"
echo "   sudo cp generated/wg0-vps1.conf /etc/wireguard/wg0.conf"
echo "   sudo chmod 600 /etc/wireguard/wg0.conf"
echo "   sudo systemctl enable --now wg-quick@wg0"
echo ""
echo "2. On VPS 2 ($VPS2_IP):"
echo "   sudo cp generated/wg0-vps2.conf /etc/wireguard/wg0.conf"
echo "   sudo chmod 600 /etc/wireguard/wg0.conf"
echo "   sudo systemctl enable --now wg-quick@wg0"
echo ""
echo "3. On VPS 3 ($VPS3_IP):"
echo "   sudo cp generated/wg0-vps3.conf /etc/wireguard/wg0.conf"
echo "   sudo chmod 600 /etc/wireguard/wg0.conf"
echo "   sudo systemctl enable --now wg-quick@wg0"
echo ""
echo "Verify connectivity between nodes:"
echo "   ping 10.10.0.1"
echo "   ping 10.10.0.2"
echo "   ping 10.10.0.3"
echo "==================================================================="
