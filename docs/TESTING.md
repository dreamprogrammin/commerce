# Руководство по тестированию Uhti Commerce

## Обзор

Проект использует **Vitest** для unit-тестирования с фокусом на Pinia stores, где обнаружены критические баги (race conditions, memory leaks).

## Настройка

### Установленные пакеты

```bash
pnpm add -D vitest @vitest/ui @vue/test-utils @vitejs/plugin-vue happy-dom @pinia/testing
```

### Конфигурация

- `vitest.config.ts` - основная конфигурация Vitest
- `tests/setup.ts` - глобальные моки для Nuxt auto-imports
- `tests/mocks/` - переиспользуемые моки

## Команды для тестирования

```bash
# Запуск тестов в watch mode
pnpm test

# Запуск один раз (CI mode)
pnpm test:run

# Запуск с UI интерфейсом
pnpm test:ui

# Запуск с coverage отчетом
pnpm test:coverage
```

## Структура тестов

```
tests/
├── setup.ts                    # Глобальная настройка
├── mocks/
│   └── nuxt.ts                # Моки для Nuxt composables
├── stores/
│   ├── cartStore.test.ts      # Тесты для корзины
│   ├── profileStore.test.ts   # Тесты для профиля
│   └── wishlistStore.test.ts  # Тесты для избранного
├── components/                 # TODO: тесты компонентов
└── composables/                # TODO: тесты composables
```

## Написание тестов для Pinia Stores

### Базовый шаблон

```typescript
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useYourStore } from '@/stores/yourStore'

describe('yourStore', () => {
  beforeEach(() => {
    // Создаем новый экземпляр Pinia для каждого теста
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('должен выполнить действие', async () => {
    const store = useYourStore()

    // Настройка моков
    const mockSupabase = global.useSupabaseClient()
    mockSupabase.from().select().eq().single.mockResolvedValue({
      data: { /* ваши данные */ },
      error: null
    })

    // Действие
    await store.yourAction()

    // Проверка
    expect(store.yourState).toBe('expected value')
  })
})
```

### Тестирование асинхронных операций

```typescript
it('должен обработать асинхронную загрузку', async () => {
  const store = useYourStore()

  // Симуляция медленного запроса
  mockSupabase.from().single.mockImplementation(
    () => new Promise((resolve) => {
      setTimeout(() => resolve({ data: mockData, error: null }), 500)
    })
  )

  const promise = store.loadData()
  expect(store.isLoading).toBe(true)

  await promise
  expect(store.isLoading).toBe(false)
})
```

### Тестирование Race Conditions

```typescript
it('должен предотвратить параллельные запросы', async () => {
  const store = useYourStore()

  // Медленный запрос
  mockSupabase.from().single.mockImplementation(
    () => new Promise(resolve => setTimeout(() => resolve({ data, error: null }), 500))
  )

  // Два параллельных вызова
  const promise1 = store.loadData()
  const promise2 = store.loadData()

  await Promise.all([promise1, promise2])

  // Должен быть только ОДИН запрос
  expect(mockSupabase.from().single).toHaveBeenCalledTimes(1)
})
```

## Текущие проблемы и их тесты

### 1. cartStore - Race Condition при addItem

**Проблема**: Двойной клик добавляет товар дважды
**Тест**: `tests/stores/cartStore.test.ts` → "BUG: позволяет параллельные запросы"
**Статус**: ❌ Тест документирует баг, требуется исправление

**Решение**:

```typescript
// stores/publicStore/cartStore.ts
const isAddingItem = ref(false)

async function addItem(productId: string, quantity: number = 1) {
  if (isAddingItem.value)
    return
  isAddingItem.value = true
  try {
    // ... операции
  }
  finally {
    isAddingItem.value = false
  }
}
```

### 2. profileStore - Timeout при загрузке

**Проблема**: Промис может зависнуть при таймауте
**Тест**: `tests/stores/profileStore.test.ts` → "EDGE CASE: должен обработать таймаут"
**Статус**: ⚠️ Частично исправлено, требуется улучшение

### 3. wishlistStore - Некорректный error handling

**Проблема**: `${error}` выводит "[object Object]"
**Тест**: `tests/stores/wishlistStore.test.ts` → "BUG: должен правильно форматировать ошибку"
**Статус**: ❌ Требуется исправление

**Решение**:

```typescript
// stores/publicStore/wishlistStore.ts (строка 84)
catch (error: any) {
  toast.error('Ошибка при обновлении избранного', {
    description: error?.message || 'Неизвестная ошибка'
  })
}
```

## Моки и заглушки

### Supabase Client

Глобальный мок доступен через `global.useSupabaseClient()`:

```typescript
const supabase = global.useSupabaseClient()

// Мокирование успешного ответа
supabase.from().select().eq().single.mockResolvedValue({
  data: mockProduct,
  error: null
})

// Мокирование ошибки
supabase.from().select().eq().single.mockResolvedValue({
  data: null,
  error: new Error('Database error')
})
```

### Router

```typescript
const router = global.useRouter()

// Проверка навигации
await store.someActionThatNavigates()
expect(router.push).toHaveBeenCalledWith('/expected-route')
```

### Toast notifications

```typescript
// Проверка уведомлений (мокируется в tests/mocks/nuxt.ts)
import { toast } from 'vue-sonner'

await store.someAction()
expect(toast.success).toHaveBeenCalledWith('Ожидаемое сообщение')
```

## Best Practices

### 1. Изоляция тестов

✅ **Хорошо**:

```typescript
beforeEach(() => {
  setActivePinia(createPinia()) // Новый экземпляр для каждого теста
  vi.clearAllMocks() // Очистка всех моков
})
```

❌ **Плохо**:

```typescript
// Переиспользование store между тестами
const store = useYourStore() // НЕ создавать вне тестов!
```

### 2. Явные ожидания

✅ **Хорошо**:

```typescript
expect(store.items).toHaveLength(1)
expect(store.items[0].id).toBe('expected-id')
expect(store.isLoading).toBe(false)
```

❌ **Плохо**:

```typescript
expect(store.items.length).toBeGreaterThan(0) // Нечеткое ожидание
```

### 3. Тестирование edge cases

```typescript
it('должен обработать null/undefined', () => {
  const store = useYourStore()

  // @ts-expect-error - намеренно тестируем невалидный ввод
  await store.someAction(null)

  expect(store.error).toBeDefined()
})
```

## Отладка тестов

### Verbose output

```bash
pnpm test -- --reporter=verbose
```

### Запуск конкретного теста

```bash
pnpm test -- cart # Все тесты с "cart" в названии
pnpm test -- tests/stores/cartStore.test.ts # Конкретный файл
```

### Watch mode для быстрой разработки

```bash
pnpm test # Автоматически перезапускает при изменении
```

### UI для визуальной отладки

```bash
pnpm test:ui # Откроется браузер с интерфейсом
```

## Coverage

Запуск с отчетом покрытия:

```bash
pnpm test:coverage
```

Отчет сохраняется в `coverage/`:

- `coverage/index.html` - визуальный отчет
- `coverage/coverage-final.json` - JSON данные

### Целевые показатели

- **Stores**: 80%+ coverage (критические части бизнес-логики)
- **Composables**: 70%+ coverage
- **Components**: 60%+ coverage (базовый функционал)

## Интеграция с CI/CD

### GitHub Actions (пример)

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm test:run
      - run: pnpm test:coverage
```

## TODO: Следующие шаги

1. ✅ Настроить Vitest
2. ✅ Написать тесты для критических stores (cart, profile, wishlist)
3. ⏳ Исправить найденные баги
4. ⏳ Добавить тесты для компонентов (с помощью Storybook)
5. ⏳ Настроить E2E тесты (Playwright/Cypress)
6. ⏳ Интеграция с CI/CD

## Storybook (планируется)

Для визуального тестирования компонентов планируется внедрение Storybook:

```bash
# Установка (планируется)
pnpm dlx storybook@latest init

# Запуск (планируется)
pnpm storybook
```

## Полезные ссылки

- [Vitest Documentation](https://vitest.dev/)
- [Vue Test Utils](https://test-utils.vuejs.org/)
- [Pinia Testing](https://pinia.vuejs.org/cookbook/testing.html)
- [Testing Library Best Practices](https://testing-library.com/docs/guiding-principles)

---

**Последнее обновление**: 2025-12-26
**Автор**: Claude Code
**Версия**: 1.0.0
