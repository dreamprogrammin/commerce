# Исправление зависания авторизации в Safari/Firefox/iOS

## Проблема
После успешной авторизации в Safari, Firefox и iOS приложение зависает на бесконечной загрузке профиля. В логах: `hasProfile: false` при наличии авторизованного пользователя.

## Причины
1. **requestIdleCallback в Safari** - не работает стабильно, особенно при критичной загрузке данных
2. **Отсутствие таймаутов** - `loadProfile()` может зависнуть без ограничения времени
3. **Проблемы с localStorage/cookies** - Safari имеет ограничения на хранение данных в некоторых режимах
4. **Race condition** - `loadingPromise` может не очищаться при ошибках

## Исправления

### 1. `/plugins/auth-init.client.ts`
- ✅ Убран `requestIdleCallback` для initial session - теперь синхронная загрузка
- ✅ Добавлен таймаут 5 секунд для `loadProfile()` в событии `SIGNED_IN`
- ✅ Добавлена обработка ошибок timeout с fallback
- ✅ Заменен `requestIdleCallback` на простой `setTimeout` для слияния корзины
- ✅ Добавлено подробное логирование событий

### 2. `/stores/core/profileStore.ts`
- ✅ Добавлена явная очистка `loadingPromise = null` при отсутствии пользователя
- ✅ Расширено логирование на всех этапах загрузки профиля
- ✅ Логи показывают: параметры вызова, состояние кеша, результаты запросов, попытки повтора

### 3. `/pages/profile/index.vue`
- ✅ Добавлен таймаут 5 секунд для `loadProfile()` в `onMounted`
- ✅ Обработка timeout не блокирует отображение страницы

### 4. `/nuxt.config.ts` - Supabase настройки
- ✅ `cookieOptions.sameSite: 'lax'` (вместо strict) для Safari/iOS
- ✅ `cookieOptions.maxAge: 1 год` для длительного хранения сессии
- ✅ `clientOptions.auth.storageKey: 'supabase-auth-token'` - явный ключ
- ✅ `clientOptions.auth.autoRefreshToken: true` - автообновление токена
- ✅ `clientOptions.auth.detectSessionInUrl: true` - детект OAuth callback
- ✅ `clientOptions.auth.flowType: 'pkce'` - более надежный flow для Safari

## Отладка

После деплоя проверьте логи в Safari/Firefox консоли:

```
[ProfileStore] loadProfile called: { force, waitForCreation, silent, hasUser, hasProfile, isLoading }
[ProfileStore] Fetching profile for user: <id>
[ProfileStore] Profile fetch result: { found: true/false, waitForCreation }
[ProfileStore] Profile loaded successfully
[ProfileStore] loadProfile finally block, setting isLoading=false
```

Если видите зависание:
1. Проверьте, вызывается ли `finally` блок
2. Посмотрите, достигает ли таймаут 5 секунд
3. Проверьте наличие ошибок в Supabase запросах
4. Убедитесь, что профиль существует в БД для этого user ID

## Тестирование

1. Очистите localStorage и cookies в Safari/Firefox
2. Выполните OAuth авторизацию через Google
3. Следите за логами в консоли
4. Убедитесь, что:
   - Профиль загружается в течение 5 секунд
   - При таймауте показывается ошибка вместо вечной загрузки
   - Страница профиля отображается корректно
   - Повторная авторизация работает из кеша

## Дополнительная отладка

Если проблема сохраняется:

1. Проверьте RLS политики в Supabase для таблицы `profiles`
2. Убедитесь, что триггер создания профиля работает
3. Проверьте RPC функцию `ensure_profile_exists`
4. Протестируйте в режиме инкогнито Safari (строгий режим cookies)
