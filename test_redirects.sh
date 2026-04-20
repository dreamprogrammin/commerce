#!/bin/bash

# 🧪 Скрипт для проверки 301 редиректов

echo "🔍 Проверка 301 редиректов для несуществующих страниц"
echo "=================================================="
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция проверки редиректа
check_redirect() {
    local url=$1
    local expected_location=$2
    
    echo -n "Проверка: $url ... "
    
    # Получаем статус и location
    response=$(curl -s -I "$url")
    status=$(echo "$response" | grep -i "^HTTP" | awk '{print $2}')
    location=$(echo "$response" | grep -i "^location:" | awk '{print $2}' | tr -d '\r')
    
    if [ "$status" = "301" ]; then
        if [[ "$location" == *"$expected_location"* ]]; then
            echo -e "${GREEN}✅ OK${NC} (301 → $location)"
        else
            echo -e "${YELLOW}⚠️  WARN${NC} (301 → $location, ожидалось: $expected_location)"
        fi
    else
        echo -e "${RED}❌ FAIL${NC} (статус: $status, ожидалось: 301)"
    fi
}

echo "📦 Проверка несуществующих брендов:"
echo "-----------------------------------"
check_redirect "https://uhti.kz/brand/nonexistent-brand" "/brands"
check_redirect "https://uhti.kz/brand/cada" "/brands"
check_redirect "https://uhti.kz/brand/test-brand-123" "/brands"
echo ""

echo "🎨 Проверка несуществующих линеек бренда:"
echo "------------------------------------------"
check_redirect "https://uhti.kz/brand/nonexistent/marvel" "/brands"
check_redirect "https://uhti.kz/brand/lego/nonexistent-line" "/brand/lego"
echo ""

echo "📂 Проверка несуществующих категорий:"
echo "--------------------------------------"
check_redirect "https://uhti.kz/catalog/nonexistent-category" "/catalog"
check_redirect "https://uhti.kz/catalog/spinners" "/catalog"
check_redirect "https://uhti.kz/catalog/test-category-123" "/catalog"
echo ""

echo "✅ Проверка существующих страниц (должны отдавать 200):"
echo "--------------------------------------------------------"
echo -n "Проверка: https://uhti.kz/catalog ... "
status=$(curl -s -I "https://uhti.kz/catalog" | grep -i "^HTTP" | awk '{print $2}')
if [ "$status" = "200" ]; then
    echo -e "${GREEN}✅ OK${NC} (200)"
else
    echo -e "${RED}❌ FAIL${NC} (статус: $status)"
fi

echo -n "Проверка: https://uhti.kz/brands ... "
status=$(curl -s -I "https://uhti.kz/brands" | grep -i "^HTTP" | awk '{print $2}')
if [ "$status" = "200" ]; then
    echo -e "${GREEN}✅ OK${NC} (200)"
else
    echo -e "${RED}❌ FAIL${NC} (статус: $status)"
fi

echo ""
echo "=================================================="
echo "🎯 Проверка завершена!"
echo ""
echo "💡 Совет: Если видите ❌ FAIL, убедитесь что:"
echo "   1. Сервер запущен (npm run dev или production)"
echo "   2. Изменения задеплоены"
echo "   3. URL корректный"
