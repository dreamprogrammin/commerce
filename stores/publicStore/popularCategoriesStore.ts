import { useCategoriesStore } from './categoriesStore'

export const usePopularCategoriesStore = defineStore('popularMenu', () => {
  const categoriesStore = useCategoriesStore()

  const popularCategories = computed(() => {
    if (categoriesStore.allCategories.length === 0) {
      return []
    }
    return categoriesStore.allCategories
      .filter(cat => cat.is_featured && cat.image_url)
      .sort((a, b) => a.display_order - b.display_order)
  })

  async function fetchPopularCategories() {
    await categoriesStore.fetchCategoryData()
  }

  return {
    popularCategories,
    isLoading: computed(() => categoriesStore.isLoading),
    fetchPopularCategories,
  }
})
