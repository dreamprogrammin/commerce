import { config } from '@vue/test-utils'
import { defineStore } from 'pinia'
import { vi } from 'vitest'
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'

// Make Pinia and Vue composables available globally (Nuxt auto-imports)
globalThis.defineStore = defineStore
globalThis.ref = ref
globalThis.computed = computed
globalThis.toRaw = toRaw
globalThis.watch = watch
globalThis.onMounted = onMounted
globalThis.onUnmounted = onUnmounted

// ✅ Создаем фабрику query builder для правильной работы моков
function createMockQueryBuilder() {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    // upsert стор вызывает наравне с insert; без заглушки тест падает
    // не ассертом, а Unhandled Rejection «upsert is not a function»
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    match: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
  }
  return builder
}

// Глобальный query builder для доступа в тестах
const mockQueryBuilder = createMockQueryBuilder()

// Mock для Supabase Realtime channel
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
  unsubscribe: vi.fn(),
}

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(() => mockQueryBuilder),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  channel: vi.fn(() => mockChannel),
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
}

const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
}

// Mock toast globally
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  loading: vi.fn(),
}

// Make Nuxt composables available globally
globalThis.useSupabaseClient = () => mockSupabaseClient
globalThis.useSupabaseUser = () => ({ value: null })
globalThis.useRouter = () => mockRouter
globalThis.navigateTo = vi.fn()
globalThis.toast = mockToast

/**
 * Автоимпорт из pinia-plugin-persistedstate/nuxt. Стор объявляет
 * `storage: piniaPluginPersistedstate.localStorage()` на верхнем уровне
 * (stores/core/profileStore.ts, stores/publicStore/cartStore.ts), поэтому
 * без заглушки файл теста падает целиком на ReferenceError ещё до первого it().
 * localStorage в happy-dom есть, отдаём его — persist работает как в браузере.
 */
// globalThis, а не global: в файле исторически `globalThis.*`, но линтер это
// запрещает — новую строку добавляем в правильной форме, старые не трогаем
globalThis.piniaPluginPersistedstate = {
  localStorage: () => localStorage,
  sessionStorage: () => sessionStorage,
  cookies: () => localStorage,
}

// Mock vue-sonner globally
vi.mock('vue-sonner', () => ({
  toast: mockToast,
}))

// Export mocks for test files
export { mockChannel, mockQueryBuilder, mockRouter, mockSupabaseClient, mockToast }

// Configure Vue Test Utils
config.global.stubs = {
  teleport: true,
}
