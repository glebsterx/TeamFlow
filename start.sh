#!/bin/bash

echo "🚀 Starting TaskFlow MVP..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "📦 Building and starting containers..."
docker-compose up --build -d

echo ""
echo "⏳ Waiting for database to be ready..."
sleep 10

echo ""
echo "🌱 Seeding initial data..."
docker-compose exec backend python seed_data.py

echo ""
echo "✅ TaskFlow is ready!"
echo ""
echo "📍 Access the application:"
echo "   Frontend: http://localhost:5173"
echo "   Backend API: http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "👤 Test users:"
echo "   admin@taskflow.com / admin123"
echo "   john@taskflow.com / john123"
echo "   jane@taskflow.com / jane123"
echo ""
echo "📊 View logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 Stop application:"
echo "   docker-compose down"
