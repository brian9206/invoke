#!/bin/bash

# Invoke Setup Script
# This script helps you set up the Invoke platform quickly

set -e

echo "🚀 Invoke Platform Setup"
echo "======================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are available"

# Create environment files if they don't exist
create_env_file() {
    local service=$1
    local env_file="$service/.env"
    local example_file="$service/.env.example"
    
    if [ ! -f "$env_file" ] && [ -f "$example_file" ]; then
        echo "📝 Creating $env_file from example..."
        cp "$example_file" "$env_file"
        echo "✅ Created $env_file"
    fi
}

echo ""
echo "📁 Setting up environment files..."

# Create environment files for each service
create_env_file "invoke-repository"
create_env_file "invoke-execution"
create_env_file "invoke-admin"

echo ""
echo "🔧 Building and starting services..."

# Build and start all services
docker-compose up --build -d

echo ""
echo "⏳ Waiting for services to be healthy..."

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
while ! docker-compose exec postgres pg_isready -U postgres &> /dev/null; do
    sleep 2
done
echo "✅ PostgreSQL is ready"

# Wait for services to be healthy
check_service_health() {
    local service=$1
    local url=$2
    local max_attempts=30
    local attempt=1
    
    echo "Waiting for $service..."
    while [ $attempt -le $max_attempts ]; do
        if curl -f "$url" &> /dev/null; then
            echo "✅ $service is healthy"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo "❌ $service failed to start within timeout"
    return 1
}

check_service_health "Repository Service" "http://localhost:3002/health"
check_service_health "Execution Service" "http://localhost:3001/health"
check_service_health "Admin Service" "http://localhost:3000/"

echo ""
echo "👤 Setting up admin user..."

# Create admin user using CLI
cd cli
npm install &> /dev/null

echo "Creating admin user. Please enter the details:"
node index.js user:create

cd ..

echo ""
echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "Your Invoke platform is now running:"
echo ""
echo "🌐 Admin Panel:    http://localhost:3000"
echo "⚡ Execution API:  http://localhost:3001"
echo "📦 Repository API: http://localhost:3002"
echo ""
echo "Services running:"
docker-compose ps

echo ""
echo "📋 Next Steps:"
echo "1. Login to the admin panel with the credentials you just created"
echo "2. Upload your first function via the admin interface"
echo "3. Test function execution using the API"
echo ""
echo "📖 For detailed documentation, see README.md"
echo ""
echo "🛑 To stop all services: docker-compose down"
echo "🔄 To view logs: docker-compose logs -f [service-name]"