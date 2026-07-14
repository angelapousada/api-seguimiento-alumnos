#!/usr/bin/env bash
#
# Genera un certificado TLS autofirmado. Las direcciones (IP/dominio) que se
# pasan como argumentos se incluyen en el SAN. Salida: certs/cert.pem y certs/key.pem.
#
# Uso: ./generar-cert.sh 156.35.163.125 [más direcciones...]
#
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"
mkdir -p "$DIR"

if [ "$#" -eq 0 ]; then
  echo "Uso: $0 <ip-o-dominio> [más direcciones...]" >&2
  echo "Ejemplo: $0 156.35.163.125" >&2
  exit 1
fi

PRINCIPAL="$1"

# localhost y 127.0.0.1 se incluyen siempre (útil para desarrollo local).
ALTS=("DNS:localhost" "IP:127.0.0.1")
for a in "$@"; do
  if [[ "$a" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    ALTS+=("IP:$a")
  else
    ALTS+=("DNS:$a")
  fi
done

# Elimina duplicados conservando el orden.
declare -A vistos
UNICOS=()
for a in "${ALTS[@]}"; do
  if [ -z "${vistos[$a]:-}" ]; then vistos[$a]=1; UNICOS+=("$a"); fi
done
SAN=$(IFS=, ; echo "${UNICOS[*]}")

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$DIR/key.pem" -out "$DIR/cert.pem" -days 3650 \
  -subj "/C=ES/ST=Asturias/L=Gijon/O=UO/CN=$PRINCIPAL" \
  -addext "subjectAltName=$SAN"

chmod 600 "$DIR/key.pem"
chmod 644 "$DIR/cert.pem"

echo "Certificado generado en $DIR"
echo "  Subject CN : $PRINCIPAL"
echo "  SAN        : $SAN"
