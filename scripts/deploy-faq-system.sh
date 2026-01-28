#!/bin/bash

# Деплой системы автогенерации FAQ
# Использование: ./scripts/deploy-faq-system.sh

set -e

echo "🚀 Деплой системы автогенерации FAQ"
echo ""

# Проверка API ключа
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "⚠️  ANTHROPIC_API_KEY не установлен!"
  echo ""
  echo "Установите ключ:"
  echo "  export ANTHROPIC_API_KEY=sk-ant-..."
  echo "  supabase secrets set ANTHROPIC_API_KEY=\$ANTHROPIC_API_KEY"
  echo ""
  read -p "Продолжить без AI-генерации? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  echo "✅ ANTHROPIC_API_KEY найден"
  echo "📤 Установка секрета в Supabase..."
  supabase secrets set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"
fi

echo ""
echo "📦 Применение миграций..."
supabase db reset --confirm

echo ""
echo "🔧 Деплой Edge Function..."
supabase functions deploy generate-premium-questions

echo ""
echo "✅ Система автогенерации FAQ успешно развёрнута!"
echo ""
echo "📋 Следующие шаги:"
echo "  1. Админка → Товары → Выбрать товар → 'Сгенерировать FAQ'"
echo "  2. Или массово: Админка → Товары → 'Сгенерировать FAQ для всех'"
echo ""
echo "📖 Документация:"
echo "  - Обзор: docs/FAQ_GENERATION_SUMMARY.md"
echo "  - Быстрый старт: docs/QUICK_START_FAQ.md"
echo "  - Полная: docs/AUTO_GENERATED_FAQ.md"
