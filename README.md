# API de Seguimiento de Alumnos — Universidad de Oviedo

API REST que da servicio a la app Flutter de seguimiento de alumnos
(`app_seguimiento_alumnos`). Gestiona la autenticación, las asignaturas, los
grupos, las sesiones, los exámenes, los alumnos y el seguimiento de asistencia
y trabajo.

- **Stack:** Node.js + Express.
- **Base de datos:** SQLite mediante `better-sqlite3` (fichero local, sin servidor
  de base de datos aparte).
- **Autenticación:** JWT + bcrypt.
- **Otros:** `multer` (subida de imágenes), `xlsx` (importación/exportación Excel).

---

## Requisitos previos

- **Node.js** 18 o superior y **npm**.

---

## Instalación y ejecución

```bash
npm install                 # instalar dependencias (solo la primera vez)
cp .env.example .env        # crear la configuración (y editar JWT_SECRET)
npm start                   # arrancar la API
# durante el desarrollo, con recarga automática (nodemon):
npm run dev
```

Al arrancar verás en consola la dirección de escucha, por ejemplo:

```
Servidor HTTPS escuchando en https://localhost:3000
```

---

## Configuración (`.env`)

La configuración se toma del fichero `.env` (hay una plantilla en `.env.example`):

| Variable         | Descripción                                                                 |
|------------------|-----------------------------------------------------------------------------|
| `PORT`           | Puerto de escucha (por defecto `3000`).                                     |
| `JWT_SECRET`     | Clave para firmar los tokens JWT. **Obligatoria**: el servidor aborta si falta. |
| `JWT_EXPIRES_IN` | Caducidad de los tokens (p. ej. `24h`).                                     |
| `SSL_KEY`        | Ruta a la clave privada del certificado (activa HTTPS).                     |
| `SSL_CERT`       | Ruta al certificado (activa HTTPS).                                         |

- Si `SSL_KEY` y `SSL_CERT` están definidas, el servidor arranca por **HTTPS**;
  si no, por **HTTP**.
- El certificado autofirmado incluido está en `certs/` (`key.pem`, `cert.pem`).
  La app cliente solo confía en él para el host configurado en su `apiHost`. Si la
  IP de la máquina cambia, regenera el certificado con la nueva dirección.

---

## Base de datos

- Es **SQLite** y se crea sola en `data/seguimiento.db` la primera vez que arranca
  el servidor. No requiere ninguna variable de conexión.
- En esa primera ejecución se rellena el **catálogo de asignaturas** (titulaciones
  GIISOF y GIITT) y se crea un **usuario administrador inicial**:
  - Correo: `uo271160@uniovi.es`
  - Contraseña: `admin123`
- El esquema completo está en `src/config/db.js`.

---

## Despliegue en una VM (producción)

Pasos para poner la API en una máquina de la Universidad. Los ficheros de apoyo
están en `deploy/`.

### 1. Preparar la máquina

```bash
# Node 18+ y herramientas de compilación (better-sqlite3 es un módulo nativo).
sudo apt update && sudo apt install -y nodejs npm build-essential python3
node -v   # comprobar >= 18
```

### 2. Desplegar el código

```bash
sudo mkdir -p /opt/api-seguimiento-alumnos
# copia el proyecto a /opt/api-seguimiento-alumnos (git clone, scp, rsync...)
sudo useradd -r -s /usr/sbin/nologin seguimiento   # usuario sin privilegios
sudo chown -R seguimiento:seguimiento /opt/api-seguimiento-alumnos
cd /opt/api-seguimiento-alumnos
sudo -u seguimiento npm install --omit=dev
```

### 3. Configuración (`.env`)

```bash
cp .env.example .env
# Edita .env y, como mínimo:
#  - JWT_SECRET: genera uno nuevo y único:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
#  - PORT y rutas SSL_KEY / SSL_CERT
```

### 4. Certificado HTTPS

- **Recomendado:** certificado real (Let's Encrypt o emitido por la UO) si la VM
  tiene un dominio. Apunta `SSL_KEY`/`SSL_CERT` a esos ficheros.
- **Alternativa (autofirmado)** para la IP/dominio de la VM:

  ```bash
  ./deploy/generar-certificado.sh <ip-o-dominio-de-la-vm>
  ```

### 5. Arranque automático con systemd

```bash
# Ajusta User / WorkingDirectory / ExecStart en el fichero si cambian.
sudo cp deploy/api-seguimiento.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now api-seguimiento
sudo systemctl status api-seguimiento
journalctl -u api-seguimiento -f      # ver logs
```

### 6. Red y seguridad

- Abre el **puerto** elegido en el firewall de la VM (interno de la UO, o vía
  reverse proxy nginx en 443 si se expone a internet).
- **Cambia la contraseña del admin** (`uo271160@uniovi.es` / `admin123`) tras el
  primer arranque.
- Haz **copias de seguridad** periódicas de `data/seguimiento.db` y de
  `uploads/perfiles/` (son todo el estado de la aplicación).

### 7. App cliente

Compila el APK apuntando al host de la VM (sin editar el código):

```bash
flutter build apk --release \
  --dart-define=API_HOST=<ip-o-dominio-de-la-vm> \
  --dart-define=API_PORT=3000
```

El host indicado debe coincidir con el del certificado del servidor.

---

## Endpoints principales

Todas las rutas cuelgan de `/api` y la mayoría requieren un token JWT en la
cabecera `Authorization: Bearer <token>`.

| Prefijo               | Descripción                                              |
|-----------------------|----------------------------------------------------------|
| `/api/auth`           | Inicio de sesión y emisión de tokens.                    |
| `/api/usuarios`       | Gestión de profesores y administradores.                 |
| `/api/asignaturas`    | Asignaturas, detalles y exportación del seguimiento.     |
| `/api/grupos`         | Grupos, horarios y alumnos de cada grupo.                |
| `/api/sesiones`       | Sesiones, conceptos, asistencias, valoraciones, entregas.|
| `/api/examenes`       | Exámenes y asistencias a exámenes.                       |
| `/api/estudiantes`    | Alumnos, estadísticas y cambios de grupo.                |
| `/api/carga`          | Importación de asignaturas y alumnos desde Excel.        |
| `/api/admin`          | Operaciones de administración (restaurar catálogo, etc.).|

Las imágenes subidas se sirven de forma estática desde `/uploads`.

---

## Estructura del proyecto

```
src/
  app.js                 # punto de entrada: middlewares, rutas y arranque (HTTP/HTTPS)
  config/db.js           # conexión SQLite, esquema y datos iniciales
  middlewares/           # auth (JWT) e isAdmin
  routes/                # un fichero por recurso de la API
certs/                   # certificado autofirmado (key.pem, cert.pem)
data/                    # base de datos SQLite (se crea sola)
uploads/                 # imágenes de perfil subidas
seed_catalogo.js         # script para repoblar el catálogo de asignaturas
database.sql             # referencia del esquema relacional
```
