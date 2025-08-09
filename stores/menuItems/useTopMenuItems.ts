import type {
  Database,
  IItemToDelete,
  MenuItemInsert,
  MenuItemRow,
  MenuItemUpdate,
} from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'

export const useMenuAdminStore = defineStore('menuAdminStore', () => {
  const supabase = useSupabaseClient<Database>()
  const { removeFile } = useSupabaseStorage()
  const BUCKET_NAME = 'menu-item-images'

  const items = ref<MenuItemRow[]>([])
  const isLoading = ref(false)
  const storeError = ref<string | null>(null)

  const allItems = ref<MenuItemRow[]>([])
  const featuredItems = ref<MenuItemRow[]>([])

  function getChildren(parentSlug: string | null): MenuItemRow[] {
    if (!parentSlug)
      return []
    return items.value
      .filter(item => item.parent_slug === parentSlug)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
  }

  async function fetchItems() {
    isLoading.value = true
    storeError.value = null
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .order('display_order', { ascending: true })
      if (error)
        throw error
      items.value = data || []
    }
    catch (e) {
      storeError.value = handleSupabaseError(e, {
        operationName: 'загрузке списка меню',
      })
    }
    finally {
      isLoading.value = false
    }
  }

  async function addItem(newItem: MenuItemInsert): Promise<MenuItemRow | null> {
    isLoading.value = true
    storeError.value = null
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .insert(newItem)
        .select()
        .single()
      if (error)
        throw error
      if (data) {
        toast.success('Успех', {
          description: `Пункт меню "${data.title}" добавлен.`,
        })
      }
      return data as MenuItemRow
    }
    catch (e) {
      storeError.value = handleSupabaseError(e, {
        operationName: 'добавлении пункта меню',
      })
      throw e
    }
    finally {
      isLoading.value = false
    }
  }

  async function updateItem(
    itemId: string,
    updates: MenuItemUpdate,
  ): Promise<MenuItemRow | null> {
    isLoading.value = true
    storeError.value = null
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .update(updates)
        .eq('id', itemId)
        .select()
        .single()
      if (error)
        throw error
      if (data) {
        toast.success('Успех', {
          description: `Пункт меню "${data.title}" обновлен.`,
        })
      }
      return data as MenuItemRow
    }
    catch (e) {
      storeError.value = handleSupabaseError(e, {
        operationName: 'обновлении пункта меню',
      })
      throw e
    }
    finally {
      isLoading.value = false
    }
  }

  async function deleteItem(itemToDelete: IItemToDelete) {
    if (!confirm(`Вы уверены, что хотите удалить "${itemToDelete.title}"?`))
      return
    isLoading.value = true
    storeError.value = null
    try {
      if (itemToDelete.image_url) {
        await removeFile(BUCKET_NAME, itemToDelete.image_url)
      }
      const { error } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', itemToDelete.id)
      if (error)
        throw error
      await fetchItems()
      toast.success('Успех', {
        description: `Элемент "${itemToDelete.title}" удален.`,
      })
    }
    catch (e) {
      storeError.value = handleSupabaseError(e, {
        operationName: 'удалении пункта меню',
      })
      throw e
    }
    finally {
      isLoading.value = false
    }
  }

  async function fetchItemsAndSeparate(force: boolean = false) {
    if (!force && allItems.value.length > 0)
      return // Загружаем только один раз
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .order('title', { ascending: true }) // Сортируем по алфавиту для удобства

      if (error)
        throw error

      allItems.value = data || []
      featuredItems.value = allItems.value.filter(
        item => item.is_featured_on_homepage,
      )
    }
    catch (e) {
      handleSupabaseError(e, { operationName: 'загрузке списка меню' })
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * НОВАЯ, СУПЕР-НАДЕЖНАЯ ФУНКЦИЯ СОХРАНЕНИЯ
   * Принимает финальный список ID "избранных".
   */
  async function saveFeaturedList(featuredIds: string[]): Promise<boolean> {
    try {
      // 1. Устанавливаем is_featured_on_homepage = TRUE для всех ID из списка
      const { error: errorFeatured } = await supabase
        .from('menu_items')
        .update({ is_featured_on_homepage: true } as MenuItemUpdate)
        .in('id', featuredIds)
      if (errorFeatured)
        throw errorFeatured

      // 2. Устанавливаем is_featured_on_homepage = FALSE для ВСЕХ ОСТАЛЬНЫХ
      const { error: errorNotFeatured } = await supabase
        .from('menu_items')
        .update({ is_featured_on_homepage: false } as MenuItemUpdate)
        .not('id', 'in', `(${featuredIds.join(',')})`) // Условие "где ID НЕ в списке"
      if (errorNotFeatured)
        throw errorNotFeatured

      toast.success('Успех', {
        description: 'Список популярных категорий обновлен.',
      })

      // Перезагружаем данные, чтобы все было синхронизировано
      await fetchItemsAndSeparate(true)
      return true
    }
    catch (err) {
      handleSupabaseError(err, { operationName: 'сохранении списка' })
      return false
    }
  }

  return {
    items,
    isLoading,
    storeError,
    fetchItems,
    addItem,
    updateItem,
    deleteItem,
    getChildren,
    allItems,
    featuredItems,
    saveFeaturedList,
    fetchItemsAndSeparate,
  }
})
