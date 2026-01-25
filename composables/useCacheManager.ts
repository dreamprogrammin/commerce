import { useQueryClient } from '@tanstack/vue-query'
import { toast } from 'vue-sonner'

/**
 * 🔥 Composable для управления кешем приложения
 *
 * Позволяет очищать кеш TanStack Query и Nuxt Data
 */
export function useCacheManager() {
  const queryClient = useQueryClient()

  /**
   * Очистить весь кеш TanStack Query
   */
  function clearAllQueryCache() {
    queryClient.clear()
    toast.success('🧹 Кеш очищен')
  }

  /**
   * Очистить кеш для конкретного товара
   */
  async function clearProductCache(productId: string) {
    // Инвалидируем все запросы связанные с товаром
    await queryClient.invalidateQueries({ queryKey: [`admin-product-${productId}`] })
    await queryClient.invalidateQueries({ queryKey: ['product'] })
    await queryClient.invalidateQueries({ queryKey: ['product-accessories'] })
    await queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
  }

  /**
   * Очистить кеш каталога
   */
  async function clearCatalogCache() {
    await queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
    await queryClient.invalidateQueries({ queryKey: ['product'] })
    toast.success('🔄 Кеш каталога обновлен')
  }

  /**
   * Очистить кеш списка товаров в админке
   */
  async function clearAdminProductsCache() {
    await queryClient.invalidateQueries({ queryKey: ['admin-products'] })
    toast.success('🔄 Кеш админки обновлен')
  }

  /**
   * Очистить кеш заказов
   */
  async function clearOrdersCache() {
    await queryClient.invalidateQueries({ queryKey: ['orders'] })
    await queryClient.invalidateQueries({ queryKey: ['user-orders'] })
    toast.success('🔄 Кеш заказов обновлен')
  }

  /**
   * Полный сброс: TanStack Query + перезагрузка страницы
   */
  function hardReset() {
    queryClient.clear()

    // Очищаем localStorage от persistence кеша
    try {
      localStorage.removeItem('tanstack-query-cache')
    } catch (error) {
      console.warn('Не удалось очистить localStorage:', error)
    }

    toast.success('🔄 Выполняется полный сброс...', {
      duration: 2000,
    })

    setTimeout(() => {
      window.location.reload()
    }, 1000)
  }

  return {
    clearAllQueryCache,
    clearProductCache,
    clearCatalogCache,
    clearAdminProductsCache,
    clearOrdersCache,
    hardReset,
  }
}
