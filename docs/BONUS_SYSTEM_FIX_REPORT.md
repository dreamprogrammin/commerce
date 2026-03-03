# Отчёт: Ревизия и фикс бонусной системы

**Дата:** 2026-03-04
**Статус:** Завершено

---

## 1. Проверка бэкенда

### RPC `create_user_order`
**Статус:** Корректен

- Вставляет `earned` транзакцию в `bonus_transactions` со статусом `pending`
- Заполняет `balance_after` и `pending_balance_after`
- Описание: "Бонусы за покупку (активируются через 14 дней после подтверждения)"

### RPC `get_bonus_history`
**Статус:** Корректен

- Запрос **без фильтров по типу** — возвращает ВСЕ транзакции
- Сортировка: `ORDER BY created_at DESC` (новые первые)
- Пагинация: `p_limit` / `p_offset`

### Триггер `award_bonus_for_review`
**Статус:** Исправлен (была проблема)

**Проблема:** Не заполнялись поля `balance_after`, `pending_balance_after`, `status`. Дефолтные значения: `0`, `0`, `'completed'`. Из-за этого:
- В колонке "Баланс после" всегда отображался `0 ₸`
- Статус показывался как "Завершено" вместо "Ожидает активации"

**Решение:** Создана миграция `20260304000001_fix_review_bonus_trigger.sql`:
- `balance_after` = текущий `active_bonus_balance` пользователя
- `pending_balance_after` = текущий `pending_bonus_balance` + 500
- `status` = `'pending'` (бонусы за отзыв тоже ждут 14 дней)

### Триггер `grant_welcome_bonus_on_first_order`
**Статус:** Корректен, но НЕ создаёт запись в `bonus_transactions`

**Примечание:** Приветственный бонус логируется только при вызове `process_confirmed_order()`. Это ожидаемое поведение — бонус фиксируется при подтверждении заказа администратором.

### Функция `activate_pending_bonuses`
**Статус:** Корректна

- Запускается ежедневно в 2:00 AM UTC (pg_cron)
- Дополнительно вызывается при загрузке профиля (`activatePendingBonuses()` в profileStore)
- Корректно обновляет `balance_after` и `pending_balance_after`

---

## 2. Проверка фронтенда

### Запрос истории бонусов
**Статус:** Корректен

- Вызывает `supabase.rpc('get_bonus_history')` без дополнительных фильтров
- Типы `earned`, `review`, и другие **НЕ отсекаются**

### Найденные проблемы и исправления

| # | Файл | Проблема | Исправление |
|---|------|----------|-------------|
| 1 | `pages/profile/index.vue:421` | Ссылка `/profile/bonus` (404) | Исправлена на `/profile/bonuses` |
| 2 | `pages/profile/index.vue` | Тип `review` отсутствовал в локализации | Добавлены все 9 типов транзакций |
| 3 | `pages/profile/index.vue` | Неполные иконки и цвета для типов | Добавлены `review`, `activation`, `birthday`, `expiration` |
| 4 | `pages/profile/bonuses/index.vue` | Тип `review` отсутствовал в `getTransactionIcon` | Добавлена иконка `MessageSquare` |
| 5 | `pages/profile/bonuses/index.vue` | Тип `review` отсутствовал в `getTransactionColor` | Добавлен зелёный цвет |
| 6 | `pages/profile/bonuses/index.vue` | Тип `review` отсутствовал в `getTransactionName` | Добавлено "Бонусы за отзыв" |
| 7 | `pages/profile/bonuses/index.vue` | "Баланс после" = `0 ₸` для всех | Скрывается если оба баланса = 0, показывается "—" |

---

## 3. Реактивность и авто-синхронизация

### Проблема
Пользователю приходилось перезаходить в аккаунт, чтобы увидеть обновлённые бонусы.

### Исправления

| Событие | Файл | Что добавлено |
|---------|------|--------------|
| **Вход (SIGNED_IN)** | `app.vue` | `supabase.auth.onAuthStateChange` → `profileStore.loadProfile(true, true, true)` |
| **Выход (SIGNED_OUT)** | `app.vue` | `profileStore.clearProfile()` |
| **После заказа** | `stores/publicStore/cartStore.ts` | `loadProfile(true)` → `loadProfile(true, false, true)` (silent mode) |
| **После отзыва (Dialog)** | `components/product/ReviewFormDialog.vue` | Добавлен `profileStore.loadProfile(true, false, true)` |
| **После отзыва (Inline)** | `components/product/ProductReviews.vue` | Добавлен `profileStore.loadProfile(true, false, true)` |

**Флаг `silent: true`** — обновляет данные в фоне без показа скелетона/лоадера.

---

## 4. Полировка UI

### Локализация типов транзакций

| Ключ БД | Отображение в UI |
|---------|-----------------|
| `earned` | Начислено за покупку |
| `spent` | Списание за заказ |
| `welcome` | Приветственные бонусы |
| `review` | Бонусы за отзыв |
| `refund_spent` | Возврат бонусов |
| `refund_earned` | Отмена начисления |
| `activation` | Активация бонусов |
| `birthday` | Бонусы ко дню рождения |
| `expiration` | Сгорело бонусов |

### Колонка "Баланс после"
- Если `balance_after = 0` И `pending_balance_after = 0` → показывается `—` (прочерк)
- Если есть значения → отображается как раньше с суммой в ожидании

### Сортировка
- Уже корректна: `ORDER BY created_at DESC` в SQL функции `get_bonus_history`
- Новые транзакции всегда первые в списке

---

## 5. Список изменённых файлов

### Фронтенд
1. `app.vue` — добавлен `onAuthStateChange` listener
2. `pages/profile/index.vue` — фикс ссылки + локализация всех типов
3. `pages/profile/bonuses/index.vue` — добавлен тип `review`, улучшен показ баланса
4. `stores/publicStore/cartStore.ts` — silent profile reload после checkout
5. `components/product/ReviewFormDialog.vue` — profile reload после отзыва
6. `components/product/ProductReviews.vue` — profile reload после инлайн-отзыва

### Бэкенд (SQL)
7. `supabase/migrations/20260304000001_fix_review_bonus_trigger.sql` — фикс триггера бонусов за отзыв

---

## 6. Расхождение "Ожидают активации" vs история

**Описание проблемы:** В виджете "Ожидают активации" показывается 2000 ₸, в истории 4 записи по 500 ₸ (review), но "Доступные" = 0 и нет записей `earned`.

**Объяснение:**
- 4 x 500 ₸ = 2000 ₸ в `pending_bonus_balance` — это бонусы за отзывы
- Записи типа `earned` появляются **при создании заказа** в функции `create_user_order`
- Бонусы из `pending` переходят в `active` через `activate_pending_bonuses()` (14 дней)
- После исправления триггера `award_bonus_for_review`, новые записи `review` будут корректно показывать статус "Ожидает активации" и заполненные балансы

**Рекомендация:** Для уже существующих записей с `balance_after = 0` можно выполнить одноразовый скрипт обновления в Supabase Studio, но это необязательно — UI теперь корректно скрывает нулевые балансы.

---

## 7. Деплой

Для применения изменений:

```bash
# 1. Применить миграцию на production
supabase db push

# 2. Деплой фронтенда
pnpm build
```
