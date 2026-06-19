# Чеклист тестирования исправлений авторизации Safari/Firefox/iOS

## Перед тестированием

- [ ] Выполнен деплой изменений
- [ ] Очищен кеш CDN (если используется)
- [ ] Готовы тестовые устройства:
  - [ ] Safari (macOS)
  - [ ] Firefox (macOS/Windows)
  - [ ] Safari (iOS - iPhone/iPad)
  - [ ] Chrome (для сравнения - должно работать)

## Тест 1: Первая авторизация (новый пользователь)

### Safari Desktop
- [ ] Открыть в режиме инкогнито (⌘⇧N)
- [ ] Перейти на сайт
- [ ] Нажать "Войти" → "Войти через Google"
- [ ] Завершить OAuth авторизацию
- [ ] **Ожидаемый результат:**
  - [ ] Редирект на `/profile`
  - [ ] Появляется toast "Добро пожаловать!"
  - [ ] Профиль загружается в течение 5 секунд
  - [ ] Страница профиля отображается корректно
  - [ ] В консоли логи `[ProfileStore] Profile loaded successfully`

### Firefox Desktop
- [ ] Повторить шаги из Safari Desktop
- [ ] Проверить те же результаты

### Safari iOS
- [ ] Повторить шаги на iPhone/iPad
- [ ] Проверить те же результаты

## Тест 2: Повторный вход (существующий пользователь)

### Safari Desktop
- [ ] Не закрывая браузер из Теста 1, перейти на главную
- [ ] Выйти из аккаунта
- [ ] Войти снова через Google
- [ ] **Ожидаемый результат:**
  - [ ] Профиль загружается из кеша мгновенно
  - [ ] Toast "С возвращением, [Имя]!"
  - [ ] Данные профиля корректны

### Firefox Desktop
- [ ] Повторить шаги

### Safari iOS
- [ ] Повторить шаги

## Тест 3: Вход после перезагрузки браузера

### Safari Desktop
- [ ] Полностью закрыть Safari (⌘Q)
- [ ] Открыть Safari снова
- [ ] Перейти на сайт
- [ ] **Ожидаемый результат:**
  - [ ] Автоматический вход (сессия сохранена)
  - [ ] Профиль загружается
  - [ ] Все данные доступны

### Firefox Desktop
- [ ] Повторить шаги

### Safari iOS
- [ ] Повторить шаги (свайп закрыть Safari полностью)

## Тест 4: Проверка таймаута (edge case)

### Если профиль не создается
Для теста можно временно отключить триггер создания профиля в Supabase:

- [ ] Попытаться войти с новым Google аккаунтом
- [ ] **Ожидаемый результат:**
  - [ ] Максимум через 5 секунд появляется toast "Профиль не найден"
  - [ ] Приложение НЕ зависает
  - [ ] В консоли логи попыток повтора и RPC

## Тест 5: Навигация по защищенным роутам

### После успешной авторизации
- [ ] Перейти на `/profile`
- [ ] Перейти на `/profile/orders`
- [ ] Перейти на `/profile/settings`
- [ ] Перейти на `/profile/bonus`
- [ ] **Ожидаемый результат:**
  - [ ] Все страницы загружаются без зависаний
  - [ ] Данные профиля доступны на всех страницах

## Тест 6: Проверка localStorage

### Safari Desktop
- [ ] Войти в систему
- [ ] Открыть DevTools → Storage → Local Storage
- [ ] Проверить наличие ключей:
  - [ ] `supabase-auth-token` (Supabase auth)
  - [ ] `profile-store` (Pinia persist)
- [ ] Проверить, что токены валидны (не expired)

## Логи для отладки

При любых проблемах проверьте консоль на наличие:

```
✅ Успешная загрузка:
[Auth Plugin] Event: SIGNED_IN, User: <id>
[ProfileStore] loadProfile called: { force: false, waitForCreation: true, ... }
[ProfileStore] Fetching profile for user: <id>
[ProfileStore] Profile fetch result: { found: true, waitForCreation: true }
[ProfileStore] Profile loaded successfully
[ProfileStore] loadProfile finally block, setting isLoading=false

❌ Проблема - зависание:
[ProfileStore] loadProfile called: ...
[ProfileStore] Fetching profile for user: <id>
// НЕТ "Profile fetch result" - запрос завис
// Должен появиться через 5 сек:
[Auth Plugin] Profile load error or timeout: Profile load timeout

❌ Проблема - профиль не найден:
[ProfileStore] Profile fetch result: { found: false, waitForCreation: true }
[ProfileStore] Profile not found, waiting for creation with retries...
[ProfileStore] Retry attempt 1/5, waiting 100ms
...
[ProfileStore] Profile not found after retries, calling ensure_profile_exists RPC...
```

## Критические проверки

- [ ] НЕТ бесконечной загрузки (спиннер исчезает через max 5 сек)
- [ ] НЕТ белого экрана после авторизации
- [ ] НЕТ редиректа на главную после успешного входа
- [ ] Корзина сохраняется при входе (товары не пропадают)
- [ ] Избранное синхронизируется

## Если проблема НЕ решена

1. Соберите логи из консоли Safari/Firefox
2. Проверьте Network tab - какие запросы зависают
3. Проверьте в Supabase Dashboard:
   - Существует ли профиль для этого user_id
   - Работает ли RLS политика на profiles
   - Есть ли ошибки в Edge Functions
4. Добавьте информацию в FIX_SAFARI_AUTH.md

## Production rollout

После успешного тестирования:
- [ ] Отметить issue как resolved
- [ ] Обновить документацию
- [ ] Мониторинг логов Sentry/LogRocket на новые ошибки auth
- [ ] Проверить метрики:
  - Время загрузки профиля (должно быть < 2 сек)
  - Процент успешных авторизаций (должен вырасти)
  - Bounce rate на /profile (должен снизиться)
