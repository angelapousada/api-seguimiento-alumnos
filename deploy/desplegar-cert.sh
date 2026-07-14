#!/usr/bin/env bash
#
# Despliega el certificado TLS (certs/cert.pem + certs/key.pem) en la VM y
# reinicia Caddy. Ejecútalo DESDE TU PORTÁTIL, dentro de la red/VPN de la UO.
#
# Requisitos previos:
#   - Haber generado el certificado con el SAN correcto:
#       ./deploy/generar-cert.sh 156.35.163.96
#   - Acceso SSH a la VM (pedirá la contraseña de sudo en la VM).
#
# Uso:
#   ./deploy/desplegar-cert.sh                 # usa angela@156.35.163.125
#   ./deploy/desplegar-cert.sh usuario@IP      # otra máquina
#
set -euo pipefail

VM="${1:-angela@156.35.163.125}"
IP="${VM##*@}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"

if [ ! -f "$DIR/cert.pem" ] || [ ! -f "$DIR/key.pem" ]; then
  echo "ERROR: no encuentro cert.pem/key.pem en $DIR" >&2
  echo "Genéralos antes con: ./deploy/generar-cert.sh $IP" >&2
  exit 1
fi

echo ">> Verificando que el certificado local cubre $IP ..."
if ! openssl x509 -in "$DIR/cert.pem" -noout -ext subjectAltName | grep -q "$IP"; then
  echo "AVISO: el SAN del certificado local no contiene $IP." >&2
  echo "       Regénералo con: ./deploy/generar-cert.sh $IP" >&2
  exit 1
fi

echo ">> Copiando certificados a $VM ..."
scp "$DIR/cert.pem" "$DIR/key.pem" "$VM:~/"

echo ">> Instalando en la VM y reiniciando Caddy ..."
# Los comandos remotos se pasan COMO ARGUMENTO de ssh (no por here-doc/stdin),
# de modo que stdin sigue siendo tu terminal: así «ssh -t» sí reserva el
# pseudo-terminal y «sudo» puede pedir la contraseña en la VM. El here-doc solo
# se usa para construir la orden en una variable, con $IP ya sustituido aquí.
REMOTE_CMD="$(cat <<EOF
set -e
sudo cp ~/cert.pem ~/key.pem /etc/caddy/certs/
sudo chown caddy:caddy /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem
sudo chmod 644 /etc/caddy/certs/cert.pem
sudo chmod 600 /etc/caddy/certs/key.pem
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl restart caddy
echo "== Estado de Caddy =="
sudo systemctl --no-pager status caddy | head -n 5
echo "== Certificado que sirve Caddy (debe mostrar CN=$IP y el SAN con esa IP) =="
echo | openssl s_client -connect "$IP:443" -servername "$IP" 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
rm -f ~/cert.pem ~/key.pem
EOF
)"
ssh -t "$VM" "$REMOTE_CMD"

echo ">> Hecho. Comprobación final desde tu portátil:"
echo "   curl --cacert '$DIR/cert.pem' https://$IP/api/ -o /dev/null -s -w 'TLS verify: %{ssl_verify_result} (0=OK)\n'"
