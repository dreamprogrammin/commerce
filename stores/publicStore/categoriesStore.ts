import type { CategoryMenuItem, CategoryRow, Database } from '@/types'

export const useCategoriesStore = defineStore('categories', () => {
  const supabase = useSupabaseClient<Database>()

  const menuTree = ref<CategoryMenuItem[]>([])
  const isLoading = ref(false)
  const allCategories = ref<CategoryRow[]>([])

  const categoriesById = computed(() =>
    new Map(allCategories.value
      .map(cat => [cat.id, cat]),
    ))

  const categoriesBySlug = computed(() =>
    new Map(allCategories.value
      .map(cat => [cat.slug, cat]),
    ),
  )

  const getBreadcrumbs = computed(() => {
    return (leafSlug: string | null): CategoryRow[] => {
      if (!leafSlug || allCategories.value.length === 0)
        return []
      const breadcrumbs: CategoryRow[] = []
      let currentCategory = categoriesBySlug.value.get(leafSlug)

      while (currentCategory) {
        breadcrumbs.unshift(currentCategory)
        currentCategory = currentCategory.parent_id ? categoriesById.value.get(currentCategory.parent_id) : undefined
      }
      return breadcrumbs
    }
  })

  async function performFetchAndBuildTree() {
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('display_in_menu', true)
        .order('display_order', { ascending: true })

      if (error)
        throw error

      // Логика построения дерева (без изменений)
      const categoryMap = new Map<string, CategoryMenuItem>()
      const rootItems: CategoryMenuItem[] = []

      data.forEach((item) => {
        const categoryItem: CategoryMenuItem = { ...item, children: [] }
        categoryMap.set(item.id, categoryItem)
        if (item.is_root_category) {
          rootItems.push(categoryItem)
        }
      })

      data.forEach((item) => {
        if (item.parent_id) {
          const parent = categoryMap.get(item.parent_id)
          parent?.children?.push(categoryMap.get(item.id)!)
        }
      })

      // Сортируем детей внутри каждого узла
      categoryMap.forEach((node) => {
        node.children?.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
      })

      menuTree.value = rootItems
    }
    catch (e) {
      console.error('Ошибка при загрузке дерева меню:', e)
    }
    finally {
      isLoading.value = false
    }
  }
  /**
   * Загружает все данные о категориях с сервера.
   * - Заполняет `allCategories` для breadcrumbs и поиска.
   * - Строит `menuTree` для навигационного меню.
   */

  async function fetchCategoryData() {
    // Защита от повторной загрузки.
    if (allCategories.value.length > 0)
      return

    isLoading.value = true
    try {
      // Один запрос, чтобы получить ВСЕ категории.
      const { data, error } = await supabase.from('categories').select('*').order('display_order')
      if (error)
        throw error

      // 1. Сохраняем полный плоский список.
      allCategories.value = data || []

      // 2. Строим `menuTree` из тех, что нужно показывать.
      const menuItems = allCategories.value.filter(c => c.display_in_menu)
      const categoryMap = new Map<string, CategoryMenuItem>()
      const rootItems: CategoryMenuItem[] = []

      menuItems.forEach((item) => {
        const categoryItem: CategoryMenuItem = { ...item, children: [] }
        categoryMap.set(item.id, categoryItem)
        if (item.is_root_category) {
          rootItems.push(categoryItem)
        }
      })
      menuItems.forEach((item) => {
        if (item.parent_id) {
          const parent = categoryMap.get(item.parent_id)
          parent?.children?.push(categoryMap.get(item.id)!)
        }
      })
      menuTree.value = rootItems
    }
    catch (e) {
      console.error('Ошибка при загрузке данных категорий:', e)
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Находит категорию по слагу и возвращает список ее прямых дочерних категорий.
   * Используется в сайдбаре каталога для отображения фильтров по подкатегориям.
   */

  function getSubcategories(parentSlug: string | null): CategoryMenuItem[] {
    if (!parentSlug)
      return []

    const parentNode = categoriesBySlug.value.get(parentSlug)
    if (!parentNode || !parentNode.id)
      return []

    // Фильтруем `allCategories` чтобы найти детей
    return allCategories.value
      .filter(c => c.parent_id === parentNode.id)
      .map(c => ({ ...c, children: [] })) // Возвращаем как `CategoryMenuItem`
  }

  async function forceRefetchMenuTree() {
    await performFetchAndBuildTree()
  }
  return {
    menuTree,
    isLoading,
    getBreadcrumbs,
    fetchCategoryData,
    forceRefetchMenuTree,
    getSubcategories,
  }
})
