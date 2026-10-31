#!/usr/bin/env bash
set -euo pipefail

v1_priv=$(wg genkey)
v1_pub=$(echo "$v1_priv" | wg pubkey)
v2_priv=$(wg genkey)
v2_pub=$(echo "$v2_priv" | wg pubkey)
v3_priv=$(wg genkey)
v3_pub=$(echo "$v3_priv" | wg pubkey)
psk=$(wg genpsk)

cat <<EOF
{
  "v1_priv": "$v1_priv",
  "v1_pub": "$v1_pub",
  "v2_priv": "$v2_priv",
  "v2_pub": "$v2_pub",
  "v3_priv": "$v3_priv",
  "v3_pub": "$v3_pub",
  "psk": "$psk"
}
EOF
