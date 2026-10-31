#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
runtime_dir="$script_dir/../runtime/mailpit"

if [ -e "$runtime_dir/ca.key" ] || [ -e "$runtime_dir/server.key" ]; then
  echo "Refusing to overwrite existing Mailpit keys in $runtime_dir" >&2
  exit 1
fi

umask 077
mkdir -p "$runtime_dir"
openssl genrsa -out "$runtime_dir/ca.key" 3072
openssl req -x509 -new -sha256 -days 30 \
  -key "$runtime_dir/ca.key" \
  -subj "/CN=PLG synthetic SMTP CA" \
  -out "$runtime_dir/ca.crt"
openssl genrsa -out "$runtime_dir/server.key" 3072
openssl req -new -sha256 \
  -key "$runtime_dir/server.key" \
  -subj "/CN=mailpit" \
  -out "$runtime_dir/server.csr"
printf '%s\n' 'subjectAltName=DNS:mailpit' 'extendedKeyUsage=serverAuth' > "$runtime_dir/server.ext"
openssl x509 -req -sha256 -days 30 \
  -in "$runtime_dir/server.csr" \
  -CA "$runtime_dir/ca.crt" \
  -CAkey "$runtime_dir/ca.key" \
  -CAcreateserial \
  -extfile "$runtime_dir/server.ext" \
  -out "$runtime_dir/server.crt"
rm "$runtime_dir/server.csr" "$runtime_dir/server.ext" "$runtime_dir/ca.srl"
chmod 600 "$runtime_dir"/*.key
chmod 644 "$runtime_dir"/*.crt
echo "Created a 30-day synthetic SMTP CA and server certificate in $runtime_dir"
