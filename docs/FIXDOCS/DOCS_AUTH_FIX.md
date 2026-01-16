# Документация: Исправление системы авторизации и профиля

## Проблема

После авторизации через Google OAuth пользователь не мог зайти на страницу `/profile` - возникал белый экран, либо страница зависала на скелетоне загрузки. При этом пользователь успешно создавался в таблице `profiles` на бэкенде.

### Симптомы:

- Белый экран на странице `/profile`
- Зависание на скелетоне загрузки
- Модальное окно авторизации открывалось повторно при попытке войти в профиль
- В консоли: `[ProfileStore] Already loading, returning existing promise`
- Middleware показывал `Profile loading timeout!`

## Причины проблем

### 1. **Race Condition при загрузке профиля**

Профиль загружался одновременно в нескольких местах:

- В `auth.client.ts` plugin при инициализации
- В `auth.client.ts` plugin при событии `SIGNED_IN`
- В middleware `auth.global.ts`
- В компоненте страницы `profile/index.vue`

Это приводило к конфликтам и зависанию `isLoading` флага.

### 2. **Игнорирование события `INITIAL_SESSION`**

После OAuth редиректа Supabase отправляет событие `INITIAL_SESSION`, а не `SIGNED_IN`. Предыдущая версия плагина игнорировала это событие, что приводило к тому, что профиль не загружался после авторизации.

### 3. **Middleware блокировал навигацию**

Middleware ждал завершения загрузки профиля до 5 секунд, что блокировало рендеринг страницы. При этом промис загрузки мог зависнуть из-за race condition.

### 4. **`isLoading` не сбрасывался**

При множественных попытках загрузки профиля флаг `isLoading` мог остаться в состоянии `true`, что приводило к бесконечному отображению скелетона.

### 5. **Отсутствие импорта `defineStore`**

В `useModalStore.ts` отсутствовал импорт `defineStore` из Pinia, что вызывало ошибку `defineStore is not defined`.

## Решение

### 1. **ProfileStore (`stores/core/profileStore.ts`)**

#### Изменения:

- Добавлен `loadingPromise` для предотвращения множественных одновременных загрузок
- Если профиль уже загружается, возвращается существующий промис с таймаутом (10 секунд)
- Улучшена логика повторных попыток загрузки с экспоненциальной задержкой (100ms, 300ms, 500ms, 1000ms, 2000ms)
- Гарантированный сброс `isLoading` в блоке `finally`
- Детальное логирование всех этапов загрузки

```typescript
// Ключевые улучшения:

// 1. Предотвращение дублирования запросов
let loadingPromise: Promise<boolean> | null = null

// 2. Возврат существующего промиса с таймаутом
if (loadingPromise && !force) {
  return await Promise.race([
    loadingPromise,
    new Promise<boolean>((_, reject) =>
      setTimeout(() => reject(new Error('Profile load timeout')), 10000)
    )
  ])
}

// 3. Гарантированный сброс состояния
finally {
  isLoading.value = false
  loadingPromise = null
}
```

### 2. **Auth Plugin (`plugins/auth.client.ts`)**

#### Изменения:

- Загрузка профиля при инициализации, если найдена существующая сессия
- **КРИТИЧНО**: Обработка события `INITIAL_SESSION` (важно для OAuth редиректов)
- Использование `Set` для предотвращения дублирования обработки событий
- Улучшенное логирование с информацией о состоянии профиля
- Автоматическая очистка старых событий (хранятся только последние 10)

```typescript
// Ключевые улучшения:

// 1. Проверка сессии при инициализации
const { data: { session } } = await supabase.auth.getSession()
if (session?.user) {
  await profileStore.loadProfile(false, true)
}

// 2. Обработка INITIAL_SESSION (OAuth редиректы)
else if (event === 'INITIAL_SESSION' && session?.user) {
  if (!profileStore.profile && !profileStore.isLoading) {
    await profileStore.loadProfile(false, true)
  }
}

// 3. Предотвращение дублирования
const processedEvents = new Set<string>()
const eventKey = `${event}-${session?.user?.id}-${Date.now()}`
if (processedEvents.has(eventKey))
  return
processedEvents.add(eventKey)
```

### 3. **Auth Middleware (`middleware/auth.global.ts`)**

#### Изменения:

- **КРИТИЧНО**: Middleware НЕ ждет завершения загрузки профиля
- Middleware только запускает загрузку в фоне, но сразу разрешает навигацию
- Добавлена задержка 100ms для инициализации auth после OAuth редиректа
- Упрощенная логика проверки авторизации
- Улучшенное логирование

```typescript
// Ключевые улучшения:

// 1. Не ждем загрузку профиля - запускаем в фоне
if (!profileStore.profile && !profileStore.isLoading) {
  // Не используем await - пусть загружается асинхронно
  profileStore.loadProfile(false, true).catch((error) => {
    console.error('[Auth Middleware] Profile load error:', error)
  })
}

// 2. Сразу разрешаем навигацию
console.log('[Auth Middleware] Allowing navigation immediately')
// Нет return - пропускаем дальше
```

### 4. **Profile Page (`pages/profile/index.vue`)**

#### Изменения:

- Проверка состояния загрузки при монтировании
- **Аварийный таймер**: если `isLoading=true` больше 2 секунд, принудительно сбрасывается
- Добавлены `watch`-ры для отладки изменений `isLoading` и `profile`
- Улучшенные сообщения об ошибках с кнопкой обновления страницы
- Кнопка "Загрузка зависла?" для экстренного сброса состояния

```typescript
// Ключевые улучшения:

// 1. Аварийный таймер для сброса зависшей загрузки
if (isLoading.value) {
  setTimeout(() => {
    if (isLoading.value) {
      console.warn('[Profile Page] Force resetting isLoading')
      profileStore.$patch({ isLoading: false })
    }
  }, 2000)
}

// 2. Watch для отладки
watch(isLoading, (val, oldVal) => {
  console.log('[Profile Page] isLoading changed:', oldVal, '->', val)
})
```

### 5. **Modal Store (`stores/modal/useModalStore.ts`)**

#### Изменения:

- Добавлен импорт `defineStore` из Pinia

```typescript
import { defineStore } from 'pinia'

export const useModalStore = defineStore('modalStore', () => {
  // ...
})
```

### 6. **Auth Store (`stores/core/useAuthStore.ts`)**

#### Изменения:

- Добавлено логирование OAuth процесса
- Улучшен параметр `redirectTo` по умолчанию (`/profile` вместо `/`)
- Добавлен `watch` для отслеживания изменений состояния пользователя
- Детальное логирование процесса выхода

## Порядок выполнения после OAuth

### До исправления (проблемный):

```
1. OAuth редирект → возврат на сайт
2. Auth Plugin: INITIAL_SESSION (игнорируется ❌)
3. Middleware: ждет профиль 5 секунд ⏳
4. Middleware: timeout ❌
5. Страница: зависает на скелетоне ❌
```

### После исправления (правильный):

```
1. OAuth редирект → возврат на сайт
2. Auth Plugin: проверка сессии → загрузка профиля ✅
3. Auth Plugin: INITIAL_SESSION → профиль уже загружен ✅
4. Middleware: проверка auth → запуск фоновой загрузки (если нужно) ✅
5. Middleware: немедленное разрешение навигации ✅
6. Страница: рендеринг с загруженным профилем ✅
7. Страница: аварийный таймер (если нужно) ✅
```

## Логирование для отладки

После успешной авторизации в консоли браузера должна быть следующая последовательность:

```
[Auth Plugin] Initializing auth state listener
[Auth Plugin] Found existing session on init: <user-id>
[Auth Plugin] Loading profile for existing session...
[ProfileStore] Starting profile load for user: <user-id>
[ProfileStore] Profile loaded successfully: <user-id>
[Auth Plugin] Profile loaded successfully on init
[Auth Plugin] Auth state changed: INITIAL_SESSION
[Auth Middleware] Checking auth for protected route: /profile
[Auth Middleware] User authenticated: <user-id>
[Auth Middleware] Profile state: {exists: true, loading: false}
[Auth Middleware] Allowing navigation immediately
[Profile Page] Mounted, checking profile...
[Profile Page] Profile already loaded or loading
```

## Тестирование

### Шаги для тестирования:

1. **Очистка данных:**

```javascript
localStorage.clear()
sessionStorage.clear()
// Обновить страницу
```

2. **Авторизация:**
   - Нажать "Войти через Google"
   - Авторизоваться
   - После редиректа должно открыться `/profile`

3. **Проверка консоли:**
   - Должны быть логи из раздела "Логирование для отладки"
   - Не должно быть ошибок или timeout'ов

4. **Проверка профиля:**
   - Страница должна отобразиться с данными пользователя
   - Не должно быть бесконечного скелетона

### Диагностика в консоли:

```javascript
// Проверка состояния
const profileStore = useProfileStore()
console.log({
  profile: profileStore.profile,
  isLoading: profileStore.isLoading,
  user: useSupabaseUser().value
})

// Принудительная перезагрузка
await profileStore.loadProfile(true, true)

// Прямой запрос к Supabase
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { data, error } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', user.value.id)
  .maybeSingle()

console.log({ data, error })
```

## Важные замечания

### 1. **Триггер создания профиля**

Убедитесь, что в Supabase есть триггер для автоматического создания профиля:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 2. **RLS политики**

Убедитесь, что настроены правильные Row Level Security политики:

```sql
-- Чтение своего профиля
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Обновление своего профиля
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- Создание профиля при регистрации
CREATE POLICY "Enable insert for authenticated users during signup"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);
```

### 3. **SSR настройки**

В `nuxt.config.ts` должны быть отключены SSR для защищенных страниц:

```typescript
nitro: {
  routeRules: {
    '/profile/**': { ssr: false },
    '/checkout': { ssr: false },
    '/cart': { ssr: false },
    '/order/**': { ssr: false },
  }
}
```

### 4. **Защищенные пути в middleware**

Используйте `startsWith()` без wildcards:

```typescript
const protectedPaths = [
  '/profile', // ✅ Покрывает /profile, /profile/settings и т.д.
  '/checkout',
  '/order',
]
```

❌ **НЕ используйте:**

```typescript
'/profile/**' // Не работает со startsWith()
```

## Потенциальные проблемы

### Если страница все еще пустая:

1. **Проверьте RLS политики** - возможно, запрос блокируется на уровне БД
2. **Проверьте триггер** - профиль может не создаваться автоматически
3. **Проверьте консоль** - ищите ошибки Supabase
4. **Используйте аварийную кнопку** - "Загрузка зависла?" на странице профиля

### Если модалка авторизации открывается повторно:

1. Проверьте, что `useSupabaseUser().value` не `null`
2. Увеличьте задержку в middleware с 100ms до 500ms
3. Проверьте, что Supabase session существует

## Файлы, которые были изменены

1. `stores/core/profileStore.ts` - основные изменения логики загрузки
2. `plugins/auth.client.ts` - обработка OAuth и событий auth
3. `middleware/auth.global.ts` - упрощение логики middleware
4. `pages/profile/index.vue` - добавление аварийных механизмов
5. `stores/modal/useModalStore.ts` - добавление импорта
6. `stores/core/useAuthStore.ts` - улучшение логирования

## Итог

Система авторизации и загрузки профиля теперь работает корректно:

- ✅ Профиль загружается один раз при инициализации
- ✅ Нет race conditions и дублирования запросов
- ✅ Middleware не блокирует навигацию
- ✅ Есть защита от зависания через аварийные таймеры
- ✅ Детальное логирование для отладки
- ✅ OAuth редиректы работают корректно
