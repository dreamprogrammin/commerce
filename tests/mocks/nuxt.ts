import { vi } from 'vitest'

// ✅ Создаем query builder один раз, чтобы моки работали правильно
export const mockQueryBuilder = {
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

export const mockSupabaseClient = {
  from: vi.fn(() => mockQueryBuilder),
  rpc: vi.fn(),
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signOut: vi.fn(),
  },
}

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
}

export const mockUser = { value: null }

// Setup global mocks for #app module
vi.mock('#app', () => ({
  useSupabaseClient: () => mockSupabaseClient,
  useSupabaseUser: () => mockUser,
  useRouter: () => mockRouter,
  navigateTo: vi.fn(),
  defineStore: (name: string, setup: any) => setup,
}))

// Setup global mocks for vue-sonner
vi.mock('vue-sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))
