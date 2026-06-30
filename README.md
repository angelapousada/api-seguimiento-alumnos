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

El despliegue real se hace sobre una VM de la Universidad de **uso interno** (red UO
/ VPN, sin exposición a Internet), con un proxy inverso **Caddy** en el 443 que
sirve la web Flutter y la API bajo la misma dirección, y un **certificado
autofirmado** (no Let's Encrypt, que requeriría acceso desde Internet).

La guía paso a paso está en **[`deploy/README-despliegue.md`](deploy/README-despliegue.md)**.
Resumen:

1. **Node 18** desde NodeSource + `build-essential python3 g++-10` (`better-sqlite3`
   necesita C++20, que el g++ 9 de Ubuntu 20.04 no soporta).
2. **API** en `/opt/api-seguimiento-alumnos`, `.env` con `HOST=127.0.0.1`, `PORT=3000`,
   `JWT_SECRET` nuevo y `SSL_KEY`/`SSL_CERT` comentadas (el TLS lo pone Caddy).
   Arranque como servicio `systemd` (`deploy/api-seguimiento.service`) con el usuario
   sin privilegios `seguimiento`.
3. **Certificado autofirmado** con `./deploy/generar-certificado.sh <ip-o-dominio>`,
   copiado a `/etc/caddy/certs/`.
4. **Web** (`flutter build web --dart-define=API_HOST=<host>`) copiada a
   `/opt/app-seguimiento-web`.
5. **Caddy** con `deploy/Caddyfile` (escucha solo en 443; `auto_https disable_redirects`).
6. **APK**: `flutter build apk --release --dart-define=API_HOST=<host>` (sin `API_PORT`).

Recuerda tras el primer arranque: **cambiar la contraseña del admin**
(`uo271160@uniovi.es` / `admin123`) y hacer **copias de seguridad** de
`data/seguimiento.db` y `uploads/perfiles/` (son todo el estado de la aplicación).

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
