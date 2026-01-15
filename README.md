# Invoke - Serverless Function Management Platform

Invoke is a modern microservices-based serverless function management platform that allows you to deploy, manage, and execute serverless functions with advanced versioning, authentication, logging, and monitoring capabilities.

## Architecture

The platform consists of 2 microservices with containerized deployment:

### 🚀 invoke-admin (Next.js)
- **Port**: 3000
- **Purpose**: Admin panel with React frontend + API routes
- **Features**: Function management, versioning system, user authentication, execution logs, dashboard, API key management, MinIO integration
- **Technology**: Next.js 14.2.35, React, TypeScript, TailwindCSS, PostgreSQL, MinIO client

### ⚡ invoke-execution (Express.js)
- **Port**: 3001
- **Purpose**: Function execution service with caching and package management
- **Features**: Secure function execution, VM2 sandboxing, API key auth, distributed caching, async function support, MinIO integration
- **Technology**: Express.js, VM2 sandboxing, PostgreSQL, MinIO client
- **Scalable**: Yes (horizontal scaling supported)

### 🗄️ MinIO Object Storage
- **Port**: 9000 (API), 9001 (Console)
- **Purpose**: Function package storage
- **Features**: S3-compatible storage, versioned packages, web console
- **Technology**: MinIO server

### 🐘 PostgreSQL Database
- **Port**: 5432
- **Purpose**: Metadata and execution logs
- **Features**: Function metadata, versioning system, user management, execution history
- **Technology**: PostgreSQL 15

## Quick Start with Docker

### Prerequisites
- Docker and Docker Compose
- Git

### 1. Clone and Setup
```bash
git clone <your-repo>
cd invoke

# Start all services with Docker Compose
docker-compose up -d
```

### 2. Initialize Database
```bash
# Run database schema
docker exec -i postgres_container psql -U postgres -d invoke_db < database/schema.sql
```

### 3. Create Admin User
```bash
cd cli && npm install
node index.js user:create
```

### 4. Access Services
- **Admin Panel**: http://localhost:3000
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)
- **Execution Service**: http://localhost:3001

## Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- MinIO server
- Git

### 1. Install Dependencies
```bash
# Install dependencies for all services
cd shared && npm install && cd ..
cd invoke-execution && npm install && cd ..
cd invoke-admin && npm install && cd ..
cd cli && npm install && cd ..
```

### 2. Start Infrastructure
```bash
# Start only database and MinIO
docker-compose up postgres minio -d
```

### 3. Configure Environment
```bash
# Environment files are pre-configured for Docker setup
# For local development, adjust database and MinIO URLs as needed
```

### 4. Start Services in Development
```bash
# Terminal 1: Execution Service
cd invoke-execution && npm run dev

# Terminal 2: Admin Service (Next.js)
cd invoke-admin && npm run dev
```

## VSCode Debugging

The project includes VSCode debug configurations:

### Available Debug Configurations
- **Debug Invoke Admin (Next.js)**: Debug the admin service
- **Debug Invoke Execution Service**: Debug the execution service

### Usage
1. Open the project in VSCode
2. Go to Run and Debug panel (Ctrl+Shift+D)
3. Select desired configuration
4. Press F5 to start debugging

## Environment Configuration

### Docker Environment (Default)
All services are pre-configured to work with Docker Compose setup.

### Local Development Environment

#### Database Settings (All Services)
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=invoke_db
DB_USER=postgres
DB_PASSWORD=postgres
```

#### MinIO Settings
```env
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=invoke-packages
MINIO_USE_SSL=false
```
## Function Versioning System

Invoke now supports advanced function versioning with rollback capabilities:

### Key Features
- **Integer-based versioning**: Functions use simple integer versions (1, 2, 3...)
- **Active version management**: Switch active versions instantly
- **Version history**: Complete history of all function versions
- **Rollback capability**: Switch back to any previous version
- **Version deletion**: Remove inactive versions while preserving active ones
- **MinIO cleanup**: Automatic cleanup of package files when versions are deleted

### Versioning Workflow
1. **Upload function**: Creates version 1
2. **Update function**: Creates version 2, 3, etc.
3. **Switch versions**: Activate any version instantly
4. **View history**: See all versions with creation dates and authors
5. **Delete versions**: Remove inactive versions to save storage

## Usage Examples

### 1. Deploy a Function via Admin Panel

1. Login to admin panel at http://localhost:3000
2. Navigate to "Upload Function"
3. Create a function supporting both sync and async patterns:

**Synchronous Function (index.js)**
```javascript
module.exports = (req, res) => {
  const { name = 'World' } = req.query;
  
  console.log('Processing request for:', name);
  
  res.json({
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString(),
    method: req.method,
    version: '1.0'
  });
};
```

**Asynchronous Function (index.js)**
```javascript
const fetch = require('node-fetch'); // If available in sandbox

module.exports = async (req, res) => {
  const { name = 'World' } = req.query;
  
  console.log('Processing async request for:', name);
  
  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 100));
  
  res.json({
    message: `Hello async, ${name}!`,
    timestamp: new Date().toISOString(),
    method: req.method,
    processed_at: Date.now()
  });
};
```

4. Package as `.tgz` file and upload via admin panel
5. Note the function ID and version returned

### 2. Manage Function Versions

#### Access Versioning Page
1. Go to Functions list
2. Click on any function card (entire card is clickable)
3. Navigate to "Versioning" tab
4. Upload new versions, switch active versions, or delete old versions

#### Version Operations
- **Upload new version**: Drag & drop new .tgz file
- **Switch active version**: Click "Activate" on any version
- **Delete inactive version**: Click delete button (active version protected)
- **View execution logs**: Click function name in logs to navigate to function details

### 3. Execute Functions

#### Simple GET Request
```bash
curl "http://localhost:3001/invoke/YOUR_FUNCTION_ID?name=John"
```

#### With API Key Authentication
```bash
curl -H "X-API-Key: your_api_key" \
     "http://localhost:3001/invoke/YOUR_FUNCTION_ID?name=John"
```

#### POST Request with JSON Body
```bash
curl -X POST \
     -H "Content-Type: application/json" \
     -H "X-API-Key: your_api_key" \
     -d '{"name":"John","age":30}' \
     "http://localhost:3001/invoke/YOUR_FUNCTION_ID"
```

### 4. Monitor Function Activity

#### Dashboard Features
- **Recent Activity**: Click activity cards to navigate to function details
- **Execution Stats**: View success rates, response times, error counts
- **Function Status**: Monitor active/inactive functions
- **Quick Actions**: Direct links to upload, manage, logs, and API keys

#### Logs and Monitoring
- **Execution Logs**: Detailed execution history with full request/response data
- **Console Output**: Capture console.log, console.warn, console.error from functions
- **Error Tracking**: Detailed error messages and stack traces
- **Performance Metrics**: Response times, execution counts, success rates

## API Documentation

### Updated Endpoints

#### Function Versioning API
```http
# Get function versions
GET /api/functions/:functionId/versions
Authorization: Bearer <jwt_token>

# Upload new version
POST /api/functions/:functionId/versions
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data

# Switch active version
POST /api/functions/:functionId/switch-version
Authorization: Bearer <jwt_token>
{
  "versionId": "version_id"
}

# Delete inactive version
DELETE /api/functions/:functionId/versions/:versionId
Authorization: Bearer <jwt_token>
```

#### Execution Logs API
```http
# Get execution logs with pagination
GET /api/functions/:functionId/execution-logs?page=1&limit=20&filter=all
Authorization: Bearer <jwt_token>

# Get detailed log entry
GET /api/functions/:functionId/execution-logs/:logId
Authorization: Bearer <jwt_token>
```

#### Dashboard API
```http
# Get dashboard stats
GET /api/dashboard/stats
Authorization: Bearer <jwt_token>

# Get recent activity (includes functionId for navigation)
GET /api/dashboard/recent-activity
Authorization: Bearer <jwt_token>
```

## Security Features

### Enhanced Security
- **VM2 Sandboxing**: Isolated execution environment
- **Async Function Support**: Secure execution of both sync and async functions
- **MinIO Integration**: Secure object storage with access control
- **JWT Authentication**: Token-based admin authentication
- **API Key Management**: Per-function optional authentication
- **Input Sanitization**: XSS and injection protection
- **Rate Limiting**: Configurable rate limits per function
- **Execution Timeout**: Prevents runaway functions
- **Memory Constraints**: Configurable memory limits

### File Storage Security
- **MinIO Access Control**: Bucket-level access restrictions
- **Package Integrity**: SHA-256 hash verification
- **Secure Upload**: Validation of package format and structure
- **Automatic Cleanup**: Orphaned file cleanup on deletion

## Monitoring & Logging

### Database Schema (Updated)
- **functions**: Function metadata with active_version_id reference
- **function_versions**: Version history with package paths and metadata
- **execution_logs**: Detailed execution history with console output
- **users**: Admin user accounts with role management
- **api_keys**: Authentication keys with usage tracking

### Health and Monitoring
- **Service Health**: Individual health endpoints for all services
- **Database Monitoring**: Connection status and query performance
- **MinIO Integration**: Storage health and usage metrics
- **Cache Statistics**: Execution cache hit rates and performance
- **Function Metrics**: Per-function execution statistics

### Comprehensive Logging
- **Execution Traces**: Complete request/response logging
- **Console Capture**: Function console output (log, warn, error)
- **Error Details**: Stack traces and error context
- **Performance Data**: Execution times and resource usage
- **User Activity**: Admin panel usage and function management actions

## Scaling & Production Deployment

### Container Orchestration
```yaml
# docker-compose.yml (Production)
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: invoke_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      replicas: 1

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ACCESS_KEY: ${MINIO_ACCESS_KEY}
      MINIO_SECRET_KEY: ${MINIO_SECRET_KEY}
    volumes:
      - minio_data:/data
    deploy:
      replicas: 1

  invoke-execution:
    build: ./invoke-execution
    environment:
      DB_HOST: postgres
      MINIO_ENDPOINT: minio
    deploy:
      replicas: 3  # Horizontal scaling
    depends_on:
      - postgres
      - minio

  invoke-admin:
    build: ./invoke-admin
    environment:
      DB_HOST: postgres
      MINIO_ENDPOINT: minio
    deploy:
      replicas: 2  # Horizontal scaling
    depends_on:
      - postgres
      - minio
```

### Production Considerations
1. **Load Balancing**: Use nginx or cloud load balancers for both services
2. **Database**: PostgreSQL cluster with read replicas
3. **Object Storage**: MinIO cluster or cloud storage (S3, Azure Blob)
4. **Caching**: Redis for distributed caching (future enhancement)
5. **Monitoring**: Prometheus, Grafana, ELK stack
6. **Security**: HTTPS, VPN, firewall rules, secret management
7. **Backup**: Database and object storage backup strategies
8. **Scalability**: Both invoke-admin and invoke-execution support horizontal scaling

## Function Development Guidelines

### Supported Function Patterns
```javascript
// Pattern 1: Synchronous function
module.exports = (req, res) => {
  console.log('Sync function called');
  res.json({ message: 'Hello World', sync: true });
};

// Pattern 2: Asynchronous function
module.exports = async (req, res) => {
  console.log('Async function called');
  await new Promise(resolve => setTimeout(resolve, 100));
  res.json({ message: 'Hello Async World', async: true });
};

// Pattern 3: Promise-returning function
module.exports = (req, res) => {
  return new Promise(async (resolve) => {
    await someAsyncOperation();
    res.json({ message: 'Promise-based response' });
    resolve();
  });
};

// Pattern 4: Mixed sync/async operations
module.exports = async (req, res) => {
  console.log('Processing request...'); // Sync operation
  
  const data = await fetchExternalData(); // Async operation
  const processed = processData(data); // Sync operation
  
  res.json({ 
    result: processed,
    timestamp: new Date().toISOString()
  });
};
```

### Request/Response Objects
```javascript
// Request object structure
{
  method: 'GET|POST|PUT|DELETE',
  body: {}, // Parsed JSON body (POST requests)
  query: {}, // URL query parameters
  headers: {}, // Filtered HTTP headers
  params: { functionId: 'uuid' },
  url: '/invoke/functionId?param=value',
  ip: '127.0.0.1' // Client IP address
}

// Response object methods
{
  status(code),              // Set HTTP status code
  json(data),               // Send JSON response
  send(data),               // Send raw response
  setHeader(name, value),   // Set response header
  redirect(url),            // Send redirect response
  cookie(name, value, options) // Set cookie
}
```

### Package Structure
```
function-package.tgz
├── index.js          # Main entry point (required)
├── package.json      # Package metadata (optional)
├── lib/             # Additional modules (optional)
│   └── utils.js
└── config/          # Configuration files (optional)
    └── settings.json
```

### Best Practices
1. **Error Handling**: Always wrap async operations in try-catch
2. **Timeouts**: Functions timeout after 30 seconds by default
3. **Memory Usage**: Keep memory usage under 128MB per function
4. **Logging**: Use console.log/warn/error for debugging
5. **Dependencies**: Limited to approved modules for security
6. **Response Format**: Always send proper JSON responses
7. **Async Operations**: Properly await all async operations

## Troubleshooting

### Common Issues and Solutions

#### Docker Compose Issues
```bash
# Check service status
docker-compose ps

# View service logs
docker-compose logs invoke-admin
docker-compose logs invoke-execution
docker-compose logs postgres
docker-compose logs minio

# Restart specific service
docker-compose restart invoke-admin

# Rebuild and restart
docker-compose up --build -d
```

#### Database Issues
```bash
# Access database directly
docker exec -it postgres_container psql -U postgres -d invoke_db

# Check function versions
SELECT f.name, fv.version, fv.created_at 
FROM functions f 
JOIN function_versions fv ON f.active_version_id = fv.id;

# Reset database
docker-compose down
docker volume rm invoke_postgres_data
docker-compose up -d
```

#### MinIO Storage Issues
```bash
# Access MinIO console
# Visit http://localhost:9001
# Login: minioadmin/minioadmin

# Check bucket contents
# Navigate to 'invoke-packages' bucket

# Reset MinIO data
docker-compose down
docker volume rm invoke_minio_data
docker-compose up -d
```

#### Function Execution Issues
- **Syntax Errors**: Check function code syntax and structure
- **Async Issues**: Ensure proper async/await usage
- **Module Not Found**: Use only approved modules in sandbox
- **Timeout**: Functions must complete within 30 seconds
- **Memory Errors**: Reduce memory usage or optimize code

#### Admin Panel Issues
- **Login Failed**: Check user exists and password is correct
- **Version Switch Failed**: Ensure target version exists and is valid
- **Upload Failed**: Verify .tgz format and index.js presence
- **Navigation Issues**: Clear browser cache and cookies

### Debug Mode
```bash
# Enable debug logging
export DEBUG=invoke:*

# Start services with debug
cd invoke-execution && DEBUG=invoke:* npm run dev
cd invoke-admin && DEBUG=invoke:* npm run dev
```

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

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: GitHub Issues for bugs and feature requests
- **Documentation**: See inline code documentation
- **CLI Help**: `cd cli && node index.js --help`
- **Admin Guide**: Access admin panel for visual management
- **API Reference**: See API documentation section above