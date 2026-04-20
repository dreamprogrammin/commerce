/**
 * 🚨 ИНСТРУКЦИЯ: Как добавить 301 редирект для удаленной категории/бренда
 * 
 * 1. Откройте nuxt.config.ts
 * 2. Найдите секцию nitro.routeRules
 * 3. Добавьте новый редирект по шаблону ниже
 */

// ============================================
// ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ В nuxt.config.ts
// ============================================

// 📦 Категория удалена навсегда → редирект на родительскую категорию
"/catalog/old-category-slug": {
  redirect: { to: "/catalog/parent-category", statusCode: 301 }
},

// 🏷️ Бренд удален навсегда → редирект на страницу всех брендов
"/brand/old-brand-slug": {
  redirect: { to: "/brands", statusCode: 301 }
},

// 🔀 Категория переименована → редирект на новый URL
"/catalog/old-name": {
  redirect: { to: "/catalog/new-name", statusCode: 301 }
},

// ============================================
// ПРИМЕРЫ ИЗ ВАШЕГО ПРОЕКТА
// ============================================

// Если удалили категорию "Спиннеры" навсегда:
"/catalog/spinners": {
  redirect: { to: "/catalog", statusCode: 301 }
},

// Если удалили бренд "CADA" навсегда:
"/brand/cada": {
  redirect: { to: "/brands", statusCode: 301 }
},

// Если переименовали категорию:
"/catalog/old-toys": {
  redirect: { to: "/catalog/new-toys", statusCode: 301 }
},
