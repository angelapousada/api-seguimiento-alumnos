#!/usr/bin/env bash
#
# Genera un certificado TLS autofirmado válido para las direcciones (IP o
# dominio) desde las que se accede al servidor. Es IMPRESCINDIBLE que la
# dirección que se escribe en el navegador (p. ej. la IP de la VM de la UO)
# figure en el SAN del certificado; de lo contrario el navegador lo rechaza
# con un error del tipo "la conexión no es segura" / ERR_CERT_COMMON_NAME_INVALID.
#
# Uso:
#   ./generar-cert.sh 156.35.163.125
#   ./generar-cert.sh 156.35.163.125 seguimiento.uniovi.es 127.0.0.1
#
# Genera certs/cert.pem y certs/key.pem. Después hay que copiarlos a la VM:
#   scp certs/cert.pem certs/key.pem angela@156.35.163.125:~/
#   VM: sudo cp cert.pem key.pem /etc/caddy/certs/ && sudo systemctl restart caddy
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
