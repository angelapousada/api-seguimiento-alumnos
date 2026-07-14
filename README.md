# API de Seguimiento de Alumnos — Universidad de Oviedo

API REST (Node.js + Express) para la app Flutter `app_seguimiento_alumnos`.
Gestiona autenticación, asignaturas, grupos, sesiones, exámenes, alumnos y
seguimiento de asistencia y trabajo.

- **BD:** SQLite (`better-sqlite3`), fichero local, sin servidor aparte.
- **Auth:** JWT + bcrypt.
- **Extras:** `multer` (imágenes), `xlsx` (importación/exportación Excel).

---

## Puesta en marcha (local)

Requiere **Node.js 18+** y **npm**.

```bash
npm install              # 1. dependencias (solo la primera vez)
cp .env.example .env      # 2. crear config y editar JWT_SECRET
npm start                 # 3. arrancar  (o `npm run dev` con recarga)
```

Verás en consola: `Servidor HTTPS escuchando en https://localhost:3000`.

La base de datos (`data/seguimiento.db`) se crea sola en el primer arranque, con
el catálogo de asignaturas y un **admin inicial**:

- Correo: `uo271160@uniovi.es`
- Contraseña: `admin123`  ← **cámbiala tras el primer inicio de sesión.**

---

## Configuración (`.env`)

| Variable         | Descripción                                                        |
|------------------|--------------------------------------------------------------------|
| `PORT`           | Puerto de escucha (por defecto `3000`).                            |
| `JWT_SECRET`     | Clave de firma de tokens. **Obligatoria**: sin ella el server aborta. |
| `JWT_EXPIRES_IN` | Caducidad de los tokens (p. ej. `24h`).                            |
| `SSL_KEY`        | Ruta a la clave privada del certificado (activa HTTPS).            |
| `SSL_CERT`       | Ruta al certificado (activa HTTPS).                                |

Con `SSL_KEY` y `SSL_CERT` el server arranca por **HTTPS**; si no, por **HTTP**.
El certificado autofirmado incluido está en `certs/` y solo es válido para el
host configurado; si cambia la IP, regenéralo.

---

## Despliegue en producción (VM de la UO)

VM interna (red UO / VPN), proxy inverso **Caddy** en el 443 sirviendo web + API,
y **certificado autofirmado**. Guía completa en la memoria. Pasos:

1. **Node 18** (NodeSource) + `build-essential python3 g++-10` (`better-sqlite3`
   necesita C++20).
2. **API** en `/opt/api-seguimiento-alumnos`, `.env` con `HOST=127.0.0.1`,
   `PORT=3000`, `JWT_SECRET` nuevo y `SSL_KEY`/`SSL_CERT` comentadas (el TLS lo
   pone Caddy). Arranque con `systemd` (`deploy/api-seguimiento.service`).
3. **Certificado**: `./deploy/generar-cert.sh <ip-o-dominio>` → copiar a
   `/etc/caddy/certs/`.
4. **Web**: `flutter build web --dart-define=API_HOST=<host>` → `/opt/app-seguimiento-web`.
5. **Caddy**: usar `deploy/Caddyfile` (solo 443).
6. **APK**: `flutter build apk --release --dart-define=API_HOST=<host>`.

Tras el primer arranque: cambiar la contraseña del admin y hacer **copias de
seguridad** de `data/seguimiento.db` y `uploads/perfiles/` (todo el estado).

---

## Endpoints

Cuelgan de `/api`; la mayoría requieren `Authorization: Bearer <token>`.

| Prefijo            | Descripción                                               |
|--------------------|-----------------------------------------------------------|
| `/api/auth`        | Inicio de sesión y emisión de tokens.                     |
| `/api/usuarios`    | Gestión de profesores y administradores.                  |
| `/api/asignaturas` | Asignaturas, detalles y exportación del seguimiento.      |
| `/api/grupos`      | Grupos, horarios y alumnos de cada grupo.                 |
| `/api/sesiones`    | Sesiones, conceptos, asistencias, valoraciones, entregas. |
| `/api/examenes`    | Exámenes y asistencias a exámenes.                        |
| `/api/estudiantes` | Alumnos, estadísticas y cambios de grupo.                 |
| `/api/carga`       | Importación de asignaturas y alumnos desde Excel.         |
| `/api/admin`       | Administración (restaurar catálogo, etc.).                |

Las imágenes subidas se sirven de forma estática desde `/uploads`.

---

## Estructura

```
src/
  app.js          # entrada: middlewares, rutas y arranque (HTTP/HTTPS)
  config/db.js    # conexión SQLite, esquema y datos iniciales
  middlewares/    # auth (JWT) e isAdmin
  routes/         # un fichero por recurso de la API
certs/            # certificado autofirmado (key.pem, cert.pem)
data/             # base de datos SQLite (se crea sola)
uploads/          # imágenes de perfil subidas
seed_catalogo.js  # repoblar el catálogo de asignaturas
database.sql      # referencia del esquema relacional
```
