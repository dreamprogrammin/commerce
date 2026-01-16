/**
 * Композабл для инвалидации кеша товаров
 *
 * Используется для обновления данных после:
 * - Изменения товара в админке
 * - Подтверждения заказа (изменение остатков)
 * - Изменения цен
 */
import { useQueryClient } from '@tanstack/vue-query'

export function useProductCacheInvalidation() {
  const queryClient = useQueryClient()

  /**
   * Инвалидировать кеш конкретного товара
   * @param productSlug - slug товара
   */
  function invalidateProduct(productSlug: string) {
    queryClient.invalidateQueries({
      queryKey: ['product', productSlug],
    })
    console.log(`🔄 Invalidated cache for product: ${productSlug}`)
  }

  /**
   * Инвалидировать кеш всех товаров в каталоге
   * Используется после массовых изменений
   */
  function invalidateAllCatalogProducts() {
    queryClient.invalidateQueries({
      queryKey: ['catalog-products'],
    })
    console.log('🔄 Invalidated cache for all catalog products')
  }

  /**
   * Инвалидировать кеш товаров на главной странице
   */
  function invalidateHomeProducts() {
    queryClient.invalidateQueries({
      queryKey: ['home-popular'],
    })
    queryClient.invalidateQueries({
      queryKey: ['home-newest'],
    })
    queryClient.invalidateQueries({
      queryKey: ['home-recommendations'],
    })
    console.log('🔄 Invalidated cache for home products')
  }

  /**
   * Инвалидировать кеш конкретной категории
   * @param categorySlug - slug категории
   */
  function invalidateCategoryProducts(categorySlug: string) {
    queryClient.invalidateQueries({
      queryKey: ['catalog-products', categorySlug],
      exact: false, // Инвалидирует все запросы, начинающиеся с этого ключа
    })
    console.log(`🔄 Invalidated cache for category: ${categorySlug}`)
  }

  /**
   * Инвалидировать весь кеш товаров
   * Используется после подтверждения заказа или массовых изменений
   */
  function invalidateAllProducts() {
    invalidateAllCatalogProducts()
    invalidateHomeProducts()

    // Также инвалидируем все отдельные товары
    queryClient.invalidateQueries({
      queryKey: ['product'],
      exact: false,
    })

    console.log('🔄 Invalidated ALL product caches')
  }

  /**
   * Перезагрузить весь кеш товаров ПРИНУДИТЕЛЬНО
   * Используется для Realtime обновлений - данные загружаются сразу
   */
  function refetchAllProducts() {
    // Принудительно перезагружаем все запросы с товарами
    queryClient.refetchQueries({
      queryKey: ['catalog-products'],
      exact: false,
      type: 'active', // Только активные запросы
    })

    queryClient.refetchQueries({
      queryKey: ['home-popular'],
      type: 'active',
    })

    queryClient.refetchQueries({
      queryKey: ['home-newest'],
      type: 'active',
    })

    queryClient.refetchQueries({
      queryKey: ['home-recommendations'],
      type: 'active',
    })

    queryClient.refetchQueries({
      queryKey: ['product'],
      exact: false,
      type: 'active',
    })

    console.log('🔄 Refetched ALL active product queries')
  }

  /**
   * Очистить весь кеш приложения
   * ВНИМАНИЕ: Используйте осторожно!
   */
  function clearAllCache() {
    queryClient.clear()
    console.log('🧹 Cleared entire application cache')
  }

  return {
    invalidateProduct,
    invalidateAllCatalogProducts,
    invalidateHomeProducts,
    invalidateCategoryProducts,
    invalidateAllProducts,
    refetchAllProducts,
    clearAllCache,
  }
}
