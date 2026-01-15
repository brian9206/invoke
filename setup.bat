@echo off
REM Invoke Setup Script for Windows
REM This script helps you set up the Invoke platform quickly

echo 🚀 Invoke Platform Setup
echo =======================

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker Desktop first.
    pause
    exit /b 1
)

REM Check if Docker Compose is installed
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose is not installed. Please install Docker Desktop with Docker Compose.
    pause
    exit /b 1
)

echo ✅ Docker and Docker Compose are available

echo.
echo 📁 Setting up environment files...

REM Create environment files if they don't exist
if not exist "invoke-repository\.env" (
    if exist "invoke-repository\.env.example" (
        echo 📝 Creating invoke-repository\.env from example...
        copy "invoke-repository\.env.example" "invoke-repository\.env" >nul
        echo ✅ Created invoke-repository\.env
    )
)

if not exist "invoke-execution\.env" (
    if exist "invoke-execution\.env.example" (
        echo 📝 Creating invoke-execution\.env from example...
        copy "invoke-execution\.env.example" "invoke-execution\.env" >nul
        echo ✅ Created invoke-execution\.env
    )
)

if not exist "invoke-admin\.env" (
    if exist "invoke-admin\.env.example" (
        echo 📝 Creating invoke-admin\.env from example...
        copy "invoke-admin\.env.example" "invoke-admin\.env" >nul
        echo ✅ Created invoke-admin\.env
    )
)

echo.
echo 🔧 Building and starting services...

REM Build and start all services
docker-compose up --build -d

echo.
echo ⏳ Waiting for services to be healthy...

REM Wait for PostgreSQL to be ready
echo Waiting for PostgreSQL...
:wait_postgres
docker-compose exec postgres pg_isready -U postgres >nul 2>&1
if %errorlevel% neq 0 (
    timeout /t 2 >nul
    goto wait_postgres
)
echo ✅ PostgreSQL is ready

REM Wait for services to be healthy
echo Waiting for Repository Service...
:wait_repository
curl -f "http://localhost:3002/health" >nul 2>&1
if %errorlevel% neq 0 (
    timeout /t 2 >nul
    goto wait_repository
)
echo ✅ Repository Service is healthy

echo Waiting for Execution Service...
:wait_execution
curl -f "http://localhost:3001/health" >nul 2>&1
if %errorlevel% neq 0 (
    timeout /t 2 >nul
    goto wait_execution
)
echo ✅ Execution Service is healthy

echo Waiting for Admin Service...
:wait_admin
curl -f "http://localhost:3000/" >nul 2>&1
if %errorlevel% neq 0 (
    timeout /t 2 >nul
    goto wait_admin
)
echo ✅ Admin Service is healthy

echo.
echo 👤 Setting up admin user...

REM Create admin user using CLI
cd cli
call npm install >nul 2>&1

echo Creating admin user. Please enter the details:
node index.js user:create

cd ..

echo.
echo 🎉 Setup Complete!
echo ==================
echo.
echo Your Invoke platform is now running:
echo.
echo 🌐 Admin Panel:    http://localhost:3000
echo ⚡ Execution API:  http://localhost:3001
echo 📦 Repository API: http://localhost:3002
echo.
echo Services running:
docker-compose ps

echo.
echo 📋 Next Steps:
echo 1. Login to the admin panel with the credentials you just created
echo 2. Upload your first function via the admin interface
echo 3. Test function execution using the API
echo.
echo 📖 For detailed documentation, see README.md
echo.
echo 🛑 To stop all services: docker-compose down
echo 🔄 To view logs: docker-compose logs -f [service-name]
echo.
pause