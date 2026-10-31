#!/usr/bin/env sh
set -eu

usage() {
  echo 'Usage: bootstrap-ubuntu-host.sh SSH_PUBLIC_KEY_FILE [prepare|lockdown]' >&2
  exit 2
}

[ "$#" -eq 2 ] || usage
key_file=$1
phase=$2
case "$phase" in prepare | lockdown) ;; *) usage ;; esac
[ "$(id -u)" -eq 0 ] || { echo 'Run this script as root' >&2; exit 1; }
[ -f "$key_file" ] && [ ! -L "$key_file" ] || {
  echo 'SSH public key must be a regular, non-symlink file' >&2
  exit 2
}
[ "$(wc -l < "$key_file")" -eq 1 ] || { echo 'SSH public key must contain one line' >&2; exit 2; }
grep -Eq '^(ssh-ed25519|sk-ssh-ed25519@openssh.com|rsa-sha2-512) [A-Za-z0-9+/=]+' "$key_file" || {
  echo 'Unsupported SSH public key format' >&2
  exit 2
}

. /etc/os-release
[ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = 22.04 ] || {
  echo 'This bootstrap is restricted to Ubuntu 22.04' >&2
  exit 1
}
deploy_user=${DEPLOY_USER:-plgdeploy}
case "$deploy_user" in '' | *[!a-z0-9_-]*) echo 'DEPLOY_USER is invalid' >&2; exit 2 ;; esac
ssh_port=${SSH_PORT:-$(sshd -T | awk '$1 == "port" { print $2; exit }')}
case "$ssh_port" in '' | *[!0-9]*) echo 'SSH_PORT is invalid' >&2; exit 2 ;; esac
[ "$ssh_port" -ge 1 ] && [ "$ssh_port" -le 65535 ] || { echo 'SSH_PORT is invalid' >&2; exit 2; }

if [ "$phase" = prepare ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl gnupg age rclone ufw fail2ban unattended-upgrades

  if ! command -v docker >/dev/null 2>&1; then
    install -d -m 0755 /etc/apt/keyrings
    key_temp=$(mktemp)
    trap 'rm -f "$key_temp"' EXIT HUP INT TERM
    curl --fail --silent --show-error --location https://download.docker.com/linux/ubuntu/gpg --output "$key_temp"
    fingerprints=$(gpg --show-keys --with-colons "$key_temp" | awk -F: '$1 == "fpr" { print $10 }')
    printf '%s\n' "$fingerprints" | grep -qx '9DC858229FC7DD38854AE2D88D81803C0EBFCD88' || {
      echo 'Docker repository signing-key fingerprint is unexpected' >&2
      exit 1
    }
    gpg --dearmor --yes --output /etc/apt/keyrings/docker.gpg "$key_temp"
    chmod 0644 /etc/apt/keyrings/docker.gpg
    printf '%s\n' \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi

  id "$deploy_user" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$deploy_user"
  usermod --append --groups docker "$deploy_user"
  home_dir=$(getent passwd "$deploy_user" | cut -d: -f6)
  install -d -m 0700 -o "$deploy_user" -g "$deploy_user" "$home_dir/.ssh"
  touch "$home_dir/.ssh/authorized_keys"
  grep -qxF -f "$key_file" "$home_dir/.ssh/authorized_keys" || \
    cat "$key_file" >> "$home_dir/.ssh/authorized_keys"
  chown "$deploy_user:$deploy_user" "$home_dir/.ssh/authorized_keys"
  chmod 0600 "$home_dir/.ssh/authorized_keys"

  cat > /etc/sysctl.d/60-plg-hardening.conf <<'EOF'
fs.protected_fifos = 2
fs.protected_hardlinks = 1
fs.protected_regular = 2
fs.protected_symlinks = 1
kernel.unprivileged_bpf_disabled = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.all.send_redirects = 0
net.ipv4.tcp_syncookies = 1
net.ipv6.conf.all.accept_redirects = 0
EOF
  sysctl --system >/dev/null
  printf '%s\n' '[sshd]' 'enabled = true' > /etc/fail2ban/jail.d/plg-sshd.conf
  printf '%s\n' 'APT::Periodic::Update-Package-Lists "1";' \
    'APT::Periodic::Unattended-Upgrade "1";' > /etc/apt/apt.conf.d/20auto-upgrades
  systemctl enable --now docker fail2ban unattended-upgrades
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow "$ssh_port/tcp"
  ufw --force enable
  echo "Prepare phase complete. Verify a second key-only SSH session as $deploy_user before lockdown."
  exit 0
fi

[ "${PLG_LOCKDOWN_ACK:-}" = verified-key-only-session ] || {
  echo 'Set PLG_LOCKDOWN_ACK=verified-key-only-session only from a verified second session' >&2
  exit 2
}
who | awk -v user="$deploy_user" '$1 == user { found = 1 } END { exit !found }' || {
  echo "No active TTY login was found for $deploy_user; refusing SSH lockdown" >&2
  exit 1
}
rm -f /etc/ssh/sshd_config.d/60-plg-hardening.conf
cat > /etc/ssh/sshd_config.d/00-plg-hardening.conf <<EOF
Port $ssh_port
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers $deploy_user
EOF
sshd -t
systemctl reload ssh
echo 'SSH lockdown applied after configuration and active-session checks.'
