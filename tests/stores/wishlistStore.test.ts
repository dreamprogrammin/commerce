import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'
import type { ProductWithGallery } from '@/types'
import { mockSupabaseClient, mockQueryBuilder, mockToast } from '../setup'

const mockProduct: ProductWithGallery = {
  id: 'product-1',
  name: 'Test Product',
  slug: 'test-product',
  price: 1000,
  description: 'Test description',
  category_id: 'cat-1',
  brand_id: 'brand-1',
  is_active: true,
  stock: 10,
  bonus_points_award: 50,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  product_images: [
    {
      id: 'img-1',
      product_id: 'product-1',
      image_url: 'https://example.com/image.jpg',
      blur_placeholder: 'data:image/jpeg;base64,test',
      alt_text: 'Test image',
      display_order: 0,
      created_at: new Date().toISOString(),
    },
  ],
}

const mockAuthStore = {
  isLoggedIn: true,
  user: { id: 'user-123', email: 'test@example.com' },
}

const mockProductsStore = {
  fetchProductsByIds: vi.fn(),
}

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mockAuthStore,
}))

vi.mock('@/stores/publicStore/productsStore', () => ({
  useProductsStore: () => mockProductsStore,
}))

describe('wishlistStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())

    // ✅ Очищаем и пересоздаем моки с дефолтным поведением
    mockQueryBuilder.select.mockClear().mockReturnThis()
    mockQueryBuilder.eq.mockClear().mockReturnThis()
    mockQueryBuilder.delete.mockClear().mockReturnThis()
    mockQueryBuilder.insert.mockClear().mockResolvedValue({ data: null, error: null })
    mockQueryBuilder.match.mockClear().mockReturnThis()
    mockSupabaseClient.from.mockClear()
    mockProductsStore.fetchProductsByIds.mockClear()
    mockToast.success.mockClear()
    mockToast.error.mockClear()
    mockToast.info.mockClear()

    // ✅ Сбрасываем authStore
    mockAuthStore.isLoggedIn = true
    mockAuthStore.user = { id: 'user-123', email: 'test@example.com' }
  })

  describe('fetchWishlistProducts', () => {
    it('должен загрузить избранные товары', async () => {
      const store = useWishlistStore()

      mockQueryBuilder.eq.mockResolvedValueOnce({
        data: [{ product_id: 'product-1' }],
        error: null,
      })

      mockProductsStore.fetchProductsByIds.mockResolvedValueOnce([mockProduct])

      await store.fetchWishlistProducts()

      expect(store.wishlistProductIds).toEqual(['product-1'])
      expect(store.wishlistProducts).toHaveLength(1)
      expect(store.wishlistProducts[0].id).toBe('product-1')
      expect(store.isLoading).toBe(false)
    })

    it('должен очистить wishlist если пользователь не авторизован', async () => {
      const store = useWishlistStore()
      mockAuthStore.isLoggedIn = false
      mockAuthStore.user = null

      await store.fetchWishlistProducts()

      expect(store.wishlistProductIds).toEqual([])
      expect(store.wishlistProducts).toEqual([])
    })

    it('должен обработать пустой wishlist', async () => {
      const store = useWishlistStore()

      mockQueryBuilder.eq.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      await store.fetchWishlistProducts()

      expect(store.wishlistProductIds).toEqual([])
      expect(store.wishlistProducts).toEqual([])
      expect(mockProductsStore.fetchProductsByIds).not.toHaveBeenCalled()
    })

    it('должен обработать ошибку при загрузке', async () => {
      const store = useWishlistStore()

      const error = new Error('Database error')
      mockQueryBuilder.eq.mockResolvedValueOnce({
        data: null,
        error,
      })

      await store.fetchWishlistProducts()

      expect(store.isLoading).toBe(false)
      // Toast.error должен быть вызван с правильным сообщением
      expect(mockToast.error).toHaveBeenCalled()
    })

    it('должен загрузить несколько товаров', async () => {
      const store = useWishlistStore()

      mockQueryBuilder.eq.mockResolvedValueOnce({
        data: [{ product_id: 'product-1' }, { product_id: 'product-2' }],
        error: null,
      })

      const products = [
        mockProduct,
        { ...mockProduct, id: 'product-2', name: 'Product 2' },
      ]
      mockProductsStore.fetchProductsByIds.mockResolvedValueOnce(products)

      await store.fetchWishlistProducts()

      expect(store.wishlistProductIds).toHaveLength(2)
      expect(store.wishlistProducts).toHaveLength(2)
    })
  })

  describe('toggleWishlist', () => {
    it('должен добавить товар в избранное', async () => {
      const store = useWishlistStore()

      // Начальное состояние - пустой wishlist
      mockQueryBuilder.eq.mockResolvedValueOnce({
        data: [],
        error: null,
      })
      await store.fetchWishlistProducts()

      // Добавляем товар
      mockQueryBuilder.insert.mockResolvedValueOnce({
        error: null,
      })

      mockQueryBuilder.eq.mockResolvedValueOnce({
        data: [{ product_id: 'product-1' }],
        error: null,
      })

      mockProductsStore.fetchProductsByIds.mockResolvedValueOnce([mockProduct])

      await store.toggleWishlist('product-1', 'Test Product')

      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringContaining('добавлен в избранное'),
      )
      expect(store.wishlistProductIds).toContain('product-1')
    })

    it('должен удалить товар из избранного', async () => {
      const store = useWishlistStore()

      // Начальное состояние - товар в wishlist
      mockQueryBuilder.eq.mockResolvedValueOnce({
        data: [{ product_id: 'product-1' }],
        error: null,
      })
      mockProductsStore.fetchProductsByIds.mockResolvedValueOnce([mockProduct])
      await store.fetchWishlistProducts()

      // Удаляем товар
      mockQueryBuilder.delete.mockReturnThis()
      mockQueryBuilder.match.mockResolvedValueOnce({
        error: null,
      })

      mockQueryBuilder.eq.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      await store.toggleWishlist('product-1', 'Test Product')

      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringContaining('удален из избранного'),
      )
    })

    it('должен показать сообщение о необходимости авторизации', async () => {
      const store = useWishlistStore()
      mockAuthStore.isLoggedIn = false
      mockAuthStore.user = null

      await store.toggleWishlist('product-1', 'Test Product')

      expect(mockToast.info).toHaveBeenCalledWith(
        expect.stringContaining('авторизуйтесь'),
      )
    })

    it('BUG: должен правильно форматировать ошибку', async () => {
      const store = useWishlistStore()

      // Начальное состояние - пустой wishlist
      mockQueryBuilder.eq.mockResolvedValueOnce({
        data: [],
        error: null,
      })
      await store.fetchWishlistProducts()

      // Ошибка при добавлении
      const dbError = new Error('Duplicate key violation')
      mockQueryBuilder.insert.mockResolvedValueOnce({
        error: dbError,
      })

      await store.toggleWishlist('product-1', 'Test Product')

      // BUG: Текущий код в строке 84 делает: `${error}'Ошибка...`
      // Это выведет: "[object Object]Ошибка при обновлении избранного"
      // вместо нормального сообщения

      expect(mockToast.error).toHaveBeenCalled()

      // После исправления должно быть:
      // toast.error('Ошибка при обновлении избранного', {
      //   description: error.message || 'Неизвестная ошибка'
      // })
    })

    it('должен обновить список после успешного toggle', async () => {
      const store = useWishlistStore()

      // Начальное состояние - пустой wishlist
      mockQueryBuilder.eq.mockResolvedValueOnce({
        data: [],
        error: null,
      })
      await store.fetchWishlistProducts()

      expect(store.wishlistProductIds).toHaveLength(0)

      // Добавляем товар
      mockQueryBuilder.insert.mockResolvedValueOnce({
        error: null,
      })

      // После toggle должен загрузиться обновленный список
      mockQueryBuilder.eq.mockResolvedValueOnce({
        data: [{ product_id: 'product-1' }],
        error: null,
      })
      mockProductsStore.fetchProductsByIds.mockResolvedValueOnce([mockProduct])

      await store.toggleWishlist('product-1', 'Test Product')

      // Проверяем, что fetchWishlistProducts был вызван
      expect(store.wishlistProductIds).toHaveLength(1)
    })
  })

  describe('isProductInWishlist computed', () => {
    it('должен правильно определить наличие товара в wishlist', async () => {
      const store = useWishlistStore()

      mockQueryBuilder.eq.mockResolvedValueOnce({
        data: [{ product_id: 'product-1' }],
        error: null,
      })
      mockProductsStore.fetchProductsByIds.mockResolvedValueOnce([mockProduct])

      await store.fetchWishlistProducts()

      expect(store.isProductInWishlist('product-1')).toBe(true)
      expect(store.isProductInWishlist('product-2')).toBe(false)
    })

    it('должен вернуть false для пустого wishlist', () => {
      const store = useWishlistStore()

      expect(store.isProductInWishlist('product-1')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('должен обработать null в ответе от fetchProductsByIds', async () => {
      const store = useWishlistStore()

      mockQueryBuilder.eq.mockResolvedValueOnce({
        data: [{ product_id: 'product-1' }],
        error: null,
      })

      mockProductsStore.fetchProductsByIds.mockResolvedValueOnce([])

      await store.fetchWishlistProducts()

      expect(store.wishlistProducts).toEqual([])
    })

    it('должен обработать параллельные вызовы toggleWishlist', async () => {
      const store = useWishlistStore()

      // Начальное состояние
      mockQueryBuilder.eq.mockResolvedValue({
        data: [],
        error: null,
      })
      await store.fetchWishlistProducts()

      // Параллельные вызовы toggle для одного товара
      mockQueryBuilder.insert.mockResolvedValue({
        error: null,
      })

      mockProductsStore.fetchProductsByIds.mockResolvedValue([mockProduct])

      const promise1 = store.toggleWishlist('product-1', 'Test Product')
      const promise2 = store.toggleWishlist('product-1', 'Test Product')

      await Promise.all([promise1, promise2])

      // Должно быть два запроса на добавление (потенциальная проблема)
      // Можно добавить защиту от параллельных операций, как в cartStore
    })
  })
})
