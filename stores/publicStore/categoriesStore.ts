import type { AdditionalMenuItem, CategoryMenuItem, CategoryRow, Database } from '@/types'

export const useCategoriesStore = defineStore('categories', () => {
  const supabase = useSupabaseClient<Database>()

  const allCategories = ref<CategoryRow[]>([])
  const menuTree = ref<CategoryMenuItem[]>([])
  const additionalMenuItems = ref<AdditionalMenuItem[]>([])
  const isLoading = ref(false)
  const brandsLoading = ref(false)
  const brandsLoadedForMenu = ref(false)

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

  async function loadBrandsForMenuCategories() {
    if (import.meta.server)
      return
    if (brandsLoadedForMenu.value || brandsLoading.value)
      return

    brandsLoading.value = true
    try {
      const { useProductsStore } = await import('@/stores/publicStore/productsStore')
      const productsStore = useProductsStore()

      // Бренды в меню только для конструкторов
      const BRAND_MENU_ROOT_SLUGS = ['constructors-root']

      const level2Categories: CategoryMenuItem[] = []
      for (const root of menuTree.value) {
        if (root.children && BRAND_MENU_ROOT_SLUGS.includes(root.slug)) {
          level2Categories.push(...root.children)
        }
      }

      if (level2Categories.length === 0)
        return

      const results = await Promise.allSettled(
        level2Categories.map(cat => productsStore.fetchBrandsForCategory(cat.slug)),
      )

      results.forEach((result, index) => {
        const cat = level2Categories[index]
        if (result.status === 'fulfilled') {
          cat.brands = result.value.slice(0, 6)
        }
        else {
          cat.brands = []
        }
        cat.brandsLoaded = true
      })

      brandsLoadedForMenu.value = true
    }
    catch (e) {
      console.error('Ошибка загрузки брендов для меню:', e)
    }
    finally {
      brandsLoading.value = false
    }
  }

  async function forceRefetch() {
    allCategories.value = []
    additionalMenuItems.value = []
    brandsLoadedForMenu.value = false
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
    brandsLoading,
    brandsLoadedForMenu,
    getBreadcrumbs,
    getSubcategories,
    fetchCategoryData,
    fetchAdditionalMenuItems,
    loadBrandsForMenuCategories,
    forceRefetch,
  }
})
