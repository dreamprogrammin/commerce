# 🔒 Исправление: SECURITY DEFINER View

## 🐛 Проблема

**Предупреждение Supabase:**

```
View public.bonus_system_status is defined with the SECURITY DEFINER property
```

**Что это значит:**

- View выполняется с правами **создателя** (обычно `postgres` суперпользователь)
- Любой пользователь может обойти RLS (Row Level Security)
- Потенциальная уязвимость безопасности

---

## 🔍 Разница между SECURITY DEFINER и SECURITY INVOKER

### SECURITY DEFINER (по умолчанию, небезопасно):

```sql
CREATE VIEW my_view AS SELECT * FROM sensitive_table;
-- Выполняется с правами создателя (postgres)
-- Обходит RLS!
```

### SECURITY INVOKER (безопасно):

```sql
CREATE VIEW my_view WITH (security_invoker = true) AS SELECT * FROM sensitive_table;
-- Выполняется с правами текущего пользователя
-- Соблюдает RLS!
```

---

## ✅ Решение

### Миграция: `20260510000000_fix_bonus_system_status_security.sql`

```sql
-- Переключаем view на SECURITY INVOKER
ALTER VIEW public.bonus_system_status SET (security_invoker = true);
```

### Что изменилось:

**До:**

- View выполнялся с правами `postgres`
- Любой пользователь мог видеть все данные
- Обход RLS

**После:**

- View выполняется с правами текущего пользователя
- Соблюдаются все RLS политики
- Безопасно ✅

---

## 📊 Проверка

После применения миграции проверь в Supabase Dashboard:

1. **Database** → **Database Linter**
2. Предупреждение `Security Definer View` должно исчезнуть

Или через SQL:

```sql
SELECT
  viewname,
  viewowner,
  definition
FROM pg_views
WHERE viewname = 'bonus_system_status';
```

---

## 🎯 Когда использовать SECURITY DEFINER?

**Используй SECURITY DEFINER только если:**

- View должен показывать данные, к которым у пользователя нет прямого доступа
- Ты полностью контролируешь логику фильтрации внутри view
- Это осознанное решение для обхода RLS

**В большинстве случаев используй SECURITY INVOKER** (безопаснее)

---

## 📝 Дата исправления

**10.05.2026** - View `bonus_system_status` переключен на SECURITY INVOKER
