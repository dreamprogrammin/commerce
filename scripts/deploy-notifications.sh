#!/bin/bash

# Деплой системы уведомлений (Email + In-app)
# Использование: ./scripts/deploy-notifications.sh

set -e

echo "🔔 Деплой системы уведомлений"
echo ""

# Проверка RESEND_API_KEY
if [ -z "$RESEND_API_KEY" ]; then
  echo "⚠️  RESEND_API_KEY не установлен!"
  echo ""
  echo "Получите ключ: https://resend.com/api-keys"
  echo "Затем установите:"
  echo "  export RESEND_API_KEY=re_..."
  echo ""
  read -p "Продолжить без email уведомлений? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  echo "✅ RESEND_API_KEY найден"
  echo "📤 Установка секрета в Supabase..."
  supabase secrets set RESEND_API_KEY="$RESEND_API_KEY"
fi

echo ""
echo "🔐 Установка TRIGGER_SECRET..."
supabase secrets set TRIGGER_SECRET="uhti-internal-trigger-2026"

echo ""
echo "🌐 Установка SITE_URL..."
supabase secrets set SITE_URL="https://uhti.kz"

echo ""
echo "📦 Применение миграций..."
supabase db reset --confirm

echo ""
echo "🔧 Деплой Edge Function (notify-question-answered)..."
supabase functions deploy notify-question-answered

echo ""
echo "✅ Система уведомлений успешно развёрнута!"
echo ""
echo "📋 Установленные секреты:"
supabase secrets list
echo ""
echo "🧪 Тестирование:"
echo "  1. Задайте вопрос на любом товаре"
echo "  2. Ответьте в админке (или через SQL)"
echo "  3. Подождите 2+ минуты"
echo "  4. Проверьте колокольчик уведомлений"
echo "  5. Проверьте email (если настроен RESEND_API_KEY)"
echo ""
echo "📖 Документация: docs/NOTIFICATIONS_DEPLOYMENT.md"
echo ""
echo "🔍 Просмотр логов:"
echo "  supabase functions logs notify-question-answered --tail"
