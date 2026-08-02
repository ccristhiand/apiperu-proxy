# ApiPeru Proxy — Consultas RUC y DNI con caché en MySQL

API REST en Node.js que actúa como proxy inteligente sobre [ApiPeruDev](https://apiperu.dev):
- Si el RUC/DNI ya fue consultado antes → responde desde **tu base de datos MySQL** (gratis, instantáneo).
- Si no existe → consulta **ApiPeruDev** (API de pago), guarda el resultado en BD, y lo devuelve.
- Todas las rutas de consulta están protegidas con **JWT**.

---

## Estructura del proyecto

```
apiperu-proxy/
├── sql/
│   └── schema.sql          ← Script para crear la BD y tablas
├── src/
│   ├── config/
│   │   └── db.js           ← Pool de conexiones MySQL
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── ruc.controller.js
│   │   └── dni.controller.js
│   ├── middleware/
│   │   └── auth.js         ← Verificación JWT
│   ├── routes/
│   │   └── index.js
│   ├── services/
│   │   └── apiPeru.service.js  ← Cliente HTTP para ApiPeruDev
│   └── index.js            ← Entrada principal
├── .env.example
├── package.json
└── README.md
```

---

## Instalación

### 1. Clonar e instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Edita .env con tus datos reales
```

Variables importantes:
| Variable | Descripción |
|---|---|
| `DB_HOST` | Host de MySQL |
| `DB_USER` | Usuario MySQL |
| `DB_PASSWORD` | Password MySQL |
| `DB_NAME` | Nombre de la BD (por defecto: `apiperu_cache`) |
| `JWT_SECRET` | Secreto largo y aleatorio para firmar tokens |
| `APIPERU_TOKEN` | Tu token de [apiperu.dev](https://apiperu.dev) |

### 3. Crear la base de datos

```bash
mysql -u root -p < sql/schema.sql
```

Esto crea la BD, las tablas y un usuario admin inicial:
- **Email:** `admin@tudominio.com`
- **Password:** `Admin123!`

> ⚠️ Cambia la password inmediatamente después de instalar.

### 4. Iniciar el servidor

```bash
# Producción
npm start

# Desarrollo (con auto-reload)
npm run dev
```

---

## Endpoints

### Auth

#### `POST /api/auth/login`
```json
// Request
{ "email": "admin@tudominio.com", "password": "Admin123!" }

// Response
{
  "ok": true,
  "token": "eyJhbGci...",
  "usuario": { "id": 1, "nombre": "Administrador", "email": "admin@tudominio.com" }
}
```

#### `POST /api/auth/registro`
```json
// Request
{ "nombre": "Juan Pérez", "email": "juan@ejemplo.com", "password": "MiPass123" }
```

#### `GET /api/auth/perfil` 🔒
Requiere: `Authorization: Bearer <token>`

---

### Consultas (todas requieren JWT)

#### `GET /api/ruc/:ruc` 🔒
```
GET /api/ruc/20100070970
Authorization: Bearer eyJhbGci...

// Response (desde caché)
{
  "ok": true,
  "fuente": "cache",
  "datos": {
    "ruc": "20100070970",
    "razon_social": "TELEFONICA DEL PERU S.A.A.",
    "estado_contribuyente": "ACTIVO",
    "condicion_contribuyente": "HABIDO",
    "direccion": "...",
    ...
  }
}

// Response (desde ApiPeruDev)
{
  "ok": true,
  "fuente": "api",
  "datos": { ... }
}
```

#### `GET /api/dni/:dni` 🔒
```
GET /api/dni/12345678
Authorization: Bearer eyJhbGci...

// Response
{
  "ok": true,
  "fuente": "cache",  // o "api"
  "datos": {
    "dni": "12345678",
    "nombres": "JUAN CARLOS",
    "apellido_paterno": "PÉREZ",
    "apellido_materno": "GARCÍA",
    "nombre_completo": "PÉREZ GARCÍA JUAN CARLOS",
    ...
  }
}
```

#### `GET /api/health`
```json
{ "ok": true, "mensaje": "API funcionando" }
```

---

## Uso con PM2 (producción)

```bash
npm install -g pm2
pm2 start src/index.js --name apiperu-proxy
pm2 save
pm2 startup
```

## Nginx (proxy reverso)

```nginx
location /apiperu/ {
    proxy_pass http://localhost:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
