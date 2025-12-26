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

// ✅ Создаем query builder один раз, чтобы моки работали правильно
const mockQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  insert: vi.fn(),
  match: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
}

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(() => mockQueryBuilder),
  rpc: vi.fn(),
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signOut: vi.fn(),
  },
}

const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
}

// Make Nuxt composables available globally
global.useSupabaseClient = () => mockSupabaseClient
global.useSupabaseUser = () => ({ value: null })
global.useRouter = () => mockRouter
global.navigateTo = vi.fn()

// Export mocks for test files
export { mockSupabaseClient, mockQueryBuilder, mockRouter }

// Configure Vue Test Utils
config.global.stubs = {
  teleport: true,
}

