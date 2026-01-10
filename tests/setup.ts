import { vi } from 'vitest'
import { config } from '@vue/test-utils'
import { defineStore } from 'pinia'
import { computed, ref, toRaw, watch, onMounted, onUnmounted } from 'vue'

// Make Pinia and Vue composables available globally (Nuxt auto-imports)
global.defineStore = defineStore
global.ref = ref
global.computed = computed
global.toRaw = toRaw
global.watch = watch
global.onMounted = onMounted
global.onUnmounted = onUnmounted

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
global.useSupabaseClient = () => mockSupabaseClient
global.useSupabaseUser = () => ({ value: null })
global.useRouter = () => mockRouter
global.navigateTo = vi.fn()
global.toast = mockToast

// Mock vue-sonner globally
vi.mock('vue-sonner', () => ({
  toast: mockToast,
}))

// Export mocks for test files
export { mockSupabaseClient, mockQueryBuilder, mockRouter, mockChannel, mockToast }

// Configure Vue Test Utils
config.global.stubs = {
  teleport: true,
}

