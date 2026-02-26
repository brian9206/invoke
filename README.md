# Invoke - Serverless Function Management Platform

[![Docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue?style=for-the-badge&logo=github)](https://brianchoi.me/invoke/)

Invoke is a modern microservices-based serverless function management platform that allows you to deploy, manage, and execute serverless functions with advanced versioning, authentication, logging, and monitoring capabilities.

## Quick Start with Docker

### Prerequisites
- Docker and Docker Compose
- Git

### 1. Clone and Configure

```bash
git clone https://github.com/brian9206/invoke.git
cd invoke

# Copy and edit the environment file
cp .env.example .env
```

Edit `.env` and set a strong `JWT_SECRET` before starting.

### 2. Start All Services

```bash
docker-compose up -d
```

The database schema is automatically applied on first run. The first admin user is created automatically on first launch.

### 3. Access Services

- **Admin Panel**: http://localhost:3000
- **Execution Service**: http://localhost:3001
- **API Gateway**: http://localhost:3002
- **MinIO Console**: http://localhost:9001

## Development Setup

### Prerequisites
- Node.js 24+
- PostgreSQL 15
- MinIO server
- Git

### 1. Install Dependencies

```bash
cd invoke-execution && npm install && cd ..
cd invoke-admin && npm install && cd ..
```

### 2. Start Infrastructure

```bash
# Start only database and MinIO
docker-compose up postgres minio -d
```

### 3. Configure Environment

```bash
# Copy and configure per-service environment files
cp invoke-admin/.env.example invoke-admin/.env
cp invoke-execution/.env.example invoke-execution/.env
# Edit each .env to point to localhost instead of Docker service hostnames
```

### 4. Start Services in Development

```bash
# Terminal 1: Execution Service
cd invoke-execution && npm run dev

# Terminal 2: Admin Panel (Next.js)
cd invoke-admin && npm run dev
```

## VSCode Debugging

The project includes VSCode debug configurations in `.vscode/launch.json`:

### Available Debug Configurations
- **Debug Invoke Admin (Next.js)**: Launch the admin panel in dev mode with debugger attached (Node.js debug port 9229)
- **Debug Invoke Execution Service**: Launch the execution service with debugger attached
- **Attach to Invoke Admin**: Attach to an already-running admin process on port 9229
- **Attach to Invoke Execution**: Attach to an already-running execution process on port 9230
- **Debug Both Services**: Launch both services together via `scripts/debug-all.js`
- **Debug All Services** *(compound)*: Simultaneously launches Admin and Execution debug configurations

### Usage
1. Open the project in VSCode
2. Go to Run and Debug panel (Ctrl+Shift+D)
3. Select the desired configuration from the dropdown
4. Press F5 to start debugging

## Environment Configuration

All services are configured via environment variables. A root `.env.example` is provided for Docker Compose, and each service also has its own `.env.example` for local development.

### Docker Environment (Default — root `.env`)

#### Database
```env
DB_HOST=postgres
DB_PORT=5432
DB_NAME=invoke_db
DB_USER=postgres
DB_PASSWORD=invoke_password_123
```

#### MinIO
```env
MINIO_ROOT_USER=invoke-minio
MINIO_ROOT_PASSWORD=invoke-minio-password-123
MINIO_ACCESS_KEY=invoke-minio
MINIO_SECRET_KEY=invoke-minio-password-123
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_BUCKET=invoke-packages
```

> `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` are the MinIO server credentials. `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` are the client access credentials used by the application services.

#### Application
```env
JWT_SECRET=your_jwt_secret_change_in_production
ADMIN_PORT=3000
EXECUTION_PORT=3001
EXECUTION_SERVICE_URL=http://execution:3001
```

#### Cloudflare Turnstile (CAPTCHA)
```env
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

> The default keys always pass (test mode). Replace with real keys from https://dash.cloudflare.com/ for production.

#### Execution Service Tuning
```env
EXECUTION_TIMEOUT=30000
RATE_LIMIT=100
MAX_CACHE_SIZE_GB=10
CACHE_TTL_DAYS=7
CACHE_DIR=/app/cache
```

#### Scheduler
```env
SCHEDULER_INTERVAL=60000
TZ=Asia/Hong_Kong
```

### Local Development Environment

For local development, use `DB_HOST=localhost` and `MINIO_ENDPOINT=localhost` in each service's `.env` file.

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Development Workflow
1. Use Docker Compose for consistent development environment
2. Follow TypeScript/JavaScript best practices
3. Add tests for new features
4. Update documentation
5. Ensure backward compatibility

## Architecture

The platform consists of several microservices with containerized deployment:

### 🚀 invoke-admin (Next.js)
- **Port**: 3000 (configurable via `ADMIN_PORT`)
- **Purpose**: Admin panel with React frontend + API routes
- **Features**: Function management, versioning system, user authentication, execution logs, dashboard, API key management, API gateway configuration, MinIO integration
- **Technology**: Next.js 16.x, React 19.x, TypeScript, TailwindCSS, PostgreSQL, MinIO client

### ⚡ invoke-execution (Express.js)
- **Port**: 3001 (configurable via `EXECUTION_PORT`)
- **Purpose**: Function execution service with caching and package management
- **Features**: Secure function execution, isolated-vm sandboxing, API key auth, distributed caching, async function support, MinIO integration
- **Technology**: Express.js v5, isolated-vm sandboxing, PostgreSQL, MinIO client
- **Scalable**: Yes (horizontal scaling supported)

### 🌐 invoke-gateway (Express.js)
- **Port**: 3002 (configurable via `GATEWAY_PORT`)
- **Purpose**: API gateway that exposes deployed functions as public HTTP endpoints
- **Features**: Route-based proxying to execution service, per-route authentication (Basic Auth, Bearer JWT, API Key), CORS policies, allowed methods enforcement, real-IP forwarding, in-memory route cache with instant PostgreSQL NOTIFY invalidation, custom domain and project-slug URL patterns
- **Technology**: Express.js, PostgreSQL (pg-notify), Node.js HTTP/HTTPS proxy
- **Scalable**: Yes (stateless; route cache refreshes independently per instance)

### ⏰ invoke-scheduler
- **Port**: 8080 (internal)
- **Purpose**: Cron/scheduled function execution
- **Features**: Runs scheduled functions against the execution service at configured intervals
- **Technology**: Node.js

### 🗄️ MinIO Object Storage
- **Port**: 9000 (API), 9001 (Console)
- **Purpose**: Function package storage
- **Features**: S3-compatible storage, versioned packages, web console
- **Technology**: MinIO server

### 🐘 PostgreSQL Database
- **Port**: 5432
- **Purpose**: Metadata and execution logs
- **Features**: Function metadata, versioning system, user management, execution history, API gateway route and auth method configuration
- **Technology**: PostgreSQL 15

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: GitHub Issues for bugs and feature requests
- **Documentation**: Visit [http://brianchoi.me/invoke](http://brianchoi.me/invoke)
- **Admin Guide**: Access admin panel for visual management
