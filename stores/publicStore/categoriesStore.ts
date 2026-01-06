import type { AdditionalMenuItem, CategoryMenuItem, CategoryRow, Database } from '@/types'

export const useCategoriesStore = defineStore('categories', () => {
  const supabase = useSupabaseClient<Database>()

  const allCategories = ref<CategoryRow[]>([])
  const menuTree = ref<CategoryMenuItem[]>([])
  const additionalMenuItems = ref<AdditionalMenuItem[]>([])
  const isLoading = ref(false)

  const categoriesById = computed(() => new Map(allCategories.value.map(cat => [cat.id, cat])))
  const categoriesBySlug = computed(() => new Map(allCategories.value.map(cat => [cat.slug, cat])))

  function getBreadcrumbs(leafSlug: string | null): CategoryRow[] {
    if (!leafSlug || allCategories.value.length === 0) {
      return []
    }

    const breadcrumbs: CategoryRow[] = []
    let currentCategory = categoriesBySlug.value.get(leafSlug)

    while (currentCategory) {
      breadcrumbs.unshift(currentCategory)
      currentCategory = currentCategory.parent_id
        ? categoriesById.value.get(currentCategory.parent_id)
        : undefined
    }

    return breadcrumbs
  }

  async function fetchCategoryData(): Promise<CategoryRow[]> {
    if (allCategories.value.length > 0)
      return allCategories.value
    isLoading.value = true
    try {
      const { data, error } = await supabase.from('categories').select('*').order('display_order')
      if (error)
        throw error

      const fetchedCategories = data || []
      allCategories.value = fetchedCategories

      const menuItems = fetchedCategories.filter(c => c.display_in_menu)
      const categoryMap = new Map<string, CategoryMenuItem>()
      const rootItems: CategoryMenuItem[] = []

      menuItems.forEach((item) => {
        const categoryItem: CategoryMenuItem = { ...item, children: [] }
        categoryMap.set(item.id, categoryItem)
        if (item.is_root_category)
          rootItems.push(categoryItem)
      })

      menuItems.forEach((item) => {
        if (item.parent_id) {
          const parent = categoryMap.get(item.parent_id)
          parent?.children?.push(categoryMap.get(item.id)!)
        }
      })
      menuTree.value = rootItems
      return fetchedCategories
    }
    catch (e) {
      console.error('Ошибка при загрузке данных категорий:', e)
      return []
    }
    finally {
      isLoading.value = false
    }
  }

  async function fetchAdditionalMenuItems(): Promise<AdditionalMenuItem[]> {
    if (additionalMenuItems.value.length > 0)
      return additionalMenuItems.value

    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'additional_menu_items')
        .single()

      if (error) {
        console.warn('Дополнительные пункты меню не найдены:', error)
        additionalMenuItems.value = []
        return []
      }

      // Правильное приведение типа из Json
      const items = Array.isArray(data?.value)
        ? (data.value as unknown as AdditionalMenuItem[])
        : []

      // Сортируем по display_order если есть
      items.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))

      additionalMenuItems.value = items
      return items
    }
    catch (e) {
      console.error('Ошибка загрузки дополнительных пунктов меню:', e)
      additionalMenuItems.value = []
      return []
    }
  }

  async function forceRefetch() {
    allCategories.value = []
    additionalMenuItems.value = []
    await Promise.all([
      fetchCategoryData(),
      fetchAdditionalMenuItems(),
    ])
  }

  function getSubcategories(parentSlug: string | null): CategoryRow[] {
    if (!parentSlug)
      return []
    const parentNode = categoriesBySlug.value.get(parentSlug)
    if (!parentNode || !parentNode.id)
      return []
    return allCategories.value.filter(c => c.parent_id === parentNode.id)
  }

  return {
    allCategories,
    menuTree,
    additionalMenuItems,
    isLoading,
    getBreadcrumbs,
    getSubcategories,
    fetchCategoryData,
    fetchAdditionalMenuItems,
    forceRefetch,
  }
})
