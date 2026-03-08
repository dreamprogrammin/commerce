# 📚 Документация проекта

Этот файл содержит ссылки на всю техническую документацию проекта.

## 🏗️ Архитектура проекта

- [**PROJECT_ARCHITECTURE.md**](./PROJECT_ARCHITECTURE.md) — **Полная архитектурная документация проекта** (структура, технологии, компоненты, backend, маршрутизация).

## 🖼️ Изображения и Медиа

- [**IMAGES.md**](./IMAGES.md) — Общий гайд по работе с изображениями.
- [**IMAGE_OPTIMIZATION_GUIDE.md**](./IMAGE_OPTIMIZATION_GUIDE.md) — Руководство по оптимизации изображений.
- [**LQIP_IMPLEMENTATION.md**](./LQIP_IMPLEMENTATION.md) — Реализация Low Quality Image Placeholders (блюр при загрузке).
- [**MASONRY_GUIDE.md**](./MASONRY_GUIDE.md) — Гайд по использованию Masonry раскладки.
- [**VARIANTS.md**](./VARIANTS.md) — Описание вариантов компонентов (Variants).

## 🔐 Авторизация и профиль

- [**GOOGLE_OAUTH_PROFILE_FIX.md**](./GOOGLE_OAUTH_PROFILE_FIX.md) — Фикс ошибки 500 при Google OAuth (пустое имя пользователя): триггер `handle_new_user`, RPC `ensure_profile_exists`, middleware wait.
- [**MIGRATION_CLEAN_PROFILES.md**](./MIGRATION_CLEAN_PROFILES.md) — Миграция: очистка логики Profiles и Auth (2025-12-24).

## 🏷️ Товарные линейки

- [**PRODUCT_LINES.md**](./PRODUCT_LINES.md) — **Полная документация Product Lines** (БД, админка, каталог, фильтрация, страницы бренда/линейки, SEO, кеширование, FAQ).

## 🛒 Оформление заказа

- [**CHECKOUT_CONTACT_INFO.md**](./CHECKOUT_CONTACT_INFO.md) — Автосохранение имени/телефона из формы чекаута в заказ и профиль; race-free контакты в Telegram-уведомлениях.

## 🛠️ Технические настройки

- [**VUE_QUERY_SETUP.md**](./VUE_QUERY_SETUP.md) — Настройка и использование Vue Query.
- [**TANSTACK_QUERY_PERSISTENCE.md**](./TANSTACK_QUERY_PERSISTENCE.md) — TanStack Query persistence в localStorage (кеш между перезагрузками).
- [**MIGRATION_CODE.md**](./MIGRATION_CODE.md) — Заметки по миграции кода.

## 🔍 SEO и Индексация

- [**SEO_SETUP.md**](./SEO_SETUP.md) — Полное руководство по SEO настройке и индексации в Google (sitemap, structured data, meta tags, robots.txt).
- [**GOOGLE_SEARCH_PREVIEW.md**](./GOOGLE_SEARCH_PREVIEW.md) — 📊 **Визуализация отображения в Google** (как сайт будет выглядеть в поисковой выдаче с Rich Snippets, категориями, брендами и товарными линейками).

## 🤖 Интеграции

- [**TELEGRAM_SETUP.md**](./TELEGRAM_SETUP.md) — **Полная документация Telegram-бота** (настройка, команды, привязка, уведомления, troubleshooting).
- [**telegram_troubleshooting.md**](./telegram_troubleshooting.md) — Устранение неполадок с Telegram ботом.
- [**telegram_v3_update.md**](./telegram_v3_update.md) — Обновление интеграции с Telegram (v3).

## 💬 Автогенерация FAQ

- [**FAQ_GENERATION_SUMMARY.md**](./FAQ_GENERATION_SUMMARY.md) — 📋 **Обзор системы** (архитектура, файлы, настройка)
- [**QUICK_START_FAQ.md**](./QUICK_START_FAQ.md) — 🚀 **Быстрый старт** (как использовать за 5 минут)
- [**AUTO_GENERATED_FAQ.md**](./AUTO_GENERATED_FAQ.md) — 📖 **Полная документация** (кастомизация, API, примеры)

## 🔔 Система уведомлений

- [**NOTIFICATIONS_DEPLOYMENT.md**](./NOTIFICATIONS_DEPLOYMENT.md) — 🚀 **Деплой и troubleshooting** (секреты, Edge Functions, проверка)

---

_Документация обновляется автоматически._
