# Expense Tracker OCR

Aplicacion de seguimiento de gastos con escaneo de recibos mediante IA. Construida con Next.js, Prisma y PostgreSQL.

![Screenshot](public/screenshot.png)

## Caracteristicas

- Autenticacion de usuarios (registro/login con JWT)
- CRUD de gastos con categorias
- Escaneo de recibos con OCR via MiniMax/OpenAI
- Auto-categorizacion de gastos con IA
- Administracion de categorias (nombre, icono, color)
- Presupuestos mensuales por categoria
- Dashboard con graficos (Recharts)
- Desglose completo de tickets sin guardar imagenes
- Exportacion de gastos
- Drag & drop para subir recibos

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4
- **Backend:** Next.js API Routes
- **Base de datos:** PostgreSQL + Prisma ORM
- **IA/OCR:** MiniMax MCP Understand Image / OpenAI fallback
- **Graficos:** Recharts

## Instalacion

```bash
# Clonar el repositorio
git clone https://github.com/fazt/expense-tracker-ocr.git
cd expense-tracker-ocr

# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales
```

En PowerShell de Windows, si `cp` no funciona, usa:

```powershell
Copy-Item .env.example .env
```

## Variables de Entorno

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5448/expense_tracker"
DIRECT_URL="postgresql://postgres:postgres@localhost:5448/expense_tracker"
MINIMAX_API_KEY="tu-api-key"
MINIMAX_API_HOST="https://api.minimax.io"
OPENAI_API_KEY="tu-api-key-opcional"
```

Para Docker Compose (red interna de Docker), usa `.env.docker` basado en `.env.docker.example` y el host `db`:

```env
DATABASE_URL="postgresql://expense_user:expense_pass@db:5432/expense_tracker"
DIRECT_URL="postgresql://expense_user:expense_pass@db:5432/expense_tracker"
```

En produccion con Supabase, usa `DATABASE_URL` para la conexion pooled/runtime y `DIRECT_URL` para migraciones de Prisma.

## Base de Datos

El proyecto incluye un `docker-compose.yml` con PostgreSQL 16.

```bash
# Levantar la base de datos
docker compose up -d

# Sincronizar schema con la base de datos
npx prisma db push

# Ejecutar seed (categorias iniciales)
npx prisma db seed
```

## Modos de Ejecucion

### 1) Local completo (app + DB local)

Usa PostgreSQL instalado en tu maquina (`localhost:5432`) y ejecuta:

```bash
pnpm dev
```

### 2) Docker completo (app + DB en Docker)

```bash
# 1) Crear archivo de entorno para Docker
cp .env.docker.example .env.docker

# 2) Levantar servicios
pnpm docker:up
```

En este modo, la DB vive en la intranet Docker (`expense_tracker_intranet`) y no expone puertos al host.

### 3) Modo hibrido (app local + DB Docker)

```bash
# Levanta solo la DB Docker y la publica en 5433
pnpm docker:db:up
```

Usa este `DATABASE_URL` en tu `.env` local:

```env
DATABASE_URL="postgresql://expense_user:expense_pass@localhost:5433/expense_tracker"
DIRECT_URL="postgresql://expense_user:expense_pass@localhost:5433/expense_tracker"
```

Luego corre la app local:

```bash
pnpm dev
```

Para detener la DB Docker del modo hibrido:

```bash
pnpm docker:db:down
```

## Desarrollo

```bash
# 1. Levantar la base de datos
docker compose up -d

# 2. Instalar dependencias
pnpm install

# 3. Iniciar el servidor
pnpm dev
```

Abrir [http://localhost:3000](http://localhost:3000) en el navegador.

## Docker

Esta configuracion levanta la app y PostgreSQL en una intranet de Docker (`expense_tracker_intranet`).
El contenedor de PostgreSQL **no publica puertos al host**, evitando conflictos con tu PostgreSQL local.

```bash
# 1) Crear archivo de entorno para Docker
cp .env.docker.example .env.docker

# 2) Levantar servicios
pnpm docker:up
```

Luego abre [http://localhost:3000](http://localhost:3000).

Comandos utiles:

```bash
pnpm docker:logs
pnpm docker:down
```

## Ver y Revisar la DB en Docker

### Estado de contenedores

```bash
docker compose ps
```

### Logs de PostgreSQL

```bash
docker compose logs -f db
```

### Entrar a PostgreSQL (psql) dentro del contenedor

```bash
docker compose exec db psql -U expense_user -d expense_tracker
```

Comandos utiles dentro de `psql`:

```sql
\dt
\d "User"
\d "Expense"
SELECT COUNT(*) FROM "Expense";
SELECT * FROM "Category" LIMIT 10;
```

Para salir de `psql`:

```bash
\q
```

### Ver tablas en interfaz visual (Prisma Studio)

Si estas en modo hibrido (DB en `localhost:5433`) o local, corre:

```bash
npx prisma studio
```

Si estas en Docker completo y quieres abrir Prisma Studio localmente, exporta temporalmente la URL apuntando al puerto publicado (modo hibrido) o usa `psql` dentro del contenedor.
