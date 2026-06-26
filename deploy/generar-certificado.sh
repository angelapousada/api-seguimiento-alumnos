#!/usr/bin/env bash
# Genera un certificado autofirmado para la API válido para la IP o dominio de la VM.
# Úsalo SOLO si no dispones de un certificado real (Let's Encrypt / emitido por la UO).
#
# Uso:
#   ./deploy/generar-certificado.sh <ip-o-dominio> [dias]
# Ejemplos:
#   ./deploy/generar-certificado.sh 10.20.30.40
#   ./deploy/generar-certificado.sh seguimiento.uniovi.es 825
#
# Genera certs/key.pem y certs/cert.pem. La app móvil debe compilarse con el
# MISMO host:  flutter build apk --dart-define=API_HOST=<ip-o-dominio>
set -euo pipefail

HOST="${1:-}"
DIAS="${2:-825}"

if [[ -z "$HOST" ]]; then
  echo "Error: indica la IP o dominio de la VM." >&2
  echo "Uso: $0 <ip-o-dominio> [dias]" >&2
  exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/certs"
mkdir -p "$DIR"

# ¿El host es una IP o un dominio? Ajusta el campo SAN en consecuencia.
if [[ "$HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  SAN="IP:$HOST"
else
  SAN="DNS:$HOST"
fi

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$DIR/key.pem" \
  -out "$DIR/cert.pem" \
  -days "$DIAS" \
  -subj "/C=ES/ST=Asturias/L=Gijon/O=UO/CN=$HOST" \
  -addext "subjectAltName=$SAN"

echo "Certificado generado en $DIR para '$HOST' (válido $DIAS días)."
echo "Recuerda compilar la app con: flutter build apk --dart-define=API_HOST=$HOST"
