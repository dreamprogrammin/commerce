import type { Database, MenuItemRow } from '@/types'

export const usePopularMenuStore = defineStore('popularMenu', () => {
  const supabase = useSupabaseClient<Database>()

  const popularMenuItems = ref<Partial<MenuItemRow>[]>([])
  const isLoading = ref(false)

  async function fetchPopularCategories() {
    if (popularMenuItems.value.length > 0) {
      console.log('Популярные категории уже загружены, используем кеш.')
      return
    }
    isLoading.value = true

    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, title, slug, href, image_url')
        .eq('is_featured_on_homepage', true)
        .not('image_url', 'is', null)
        .order('display_order', { ascending: true })

      if (error) {
        console.error('Ошибка при загрузке популярных категорий:', error)
        throw error
      }

      console.log(data)

      popularMenuItems.value = data || []
    }
    catch (error) {
      console.error(
        'Не удалось выполнить запрос fetchPopularCategories:',
        error,
      )
      popularMenuItems.value = [] // В случае ошибки сбрасываем в пустой массив
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    isLoading,
    popularMenuItems,
    fetchPopularCategories,
  }
})
