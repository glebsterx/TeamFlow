#!/bin/bash
# Быстрая пересборка и перезапуск

echo "🔄 Останавливаем контейнеры..."
docker-compose down

echo "🧹 Очистка..."
docker rm -f teamflow-backend teamflow-frontend 2>/dev/null || true

echo "🔨 Пересборка..."
docker-compose build --no-cache

echo "🚀 Запуск..."
docker-compose up -d

echo ""
echo "⏳ Ожидание запуска (30 сек)..."
sleep 30

echo ""
echo "📊 Статус:"
docker-compose ps

echo ""
echo "📝 Логи backend (последние 20 строк):"
docker-compose logs --tail=20 backend

echo ""
echo "✅ Готово!"
echo "Web UI: http://localhost:5180"
echo "API: http://localhost:8180"
