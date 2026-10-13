import type { AdditionalMenuItem, BrandForFilter, CategoryMenuItem, CategoryRow, Database } from '@/types'

export const useCategoriesStore = defineStore('categories', () => {
  const supabase = useSupabaseClient<Database>()

  const allCategories = ref<CategoryRow[]>([])
  /** Бренды пунктов меню конструкторов (мобильный каталог) по id категории. */
  const menuBrands = ref<Record<string, BrandForFilter[]>>({})

  /*
   * Дерево меню — производное от `allCategories`, а не своё состояние.
   *
   * Состояние Pinia целиком уезжает в HTML каждой страницы (`__NUXT_DATA__`).
   * Дерево, собранное из копий строк, везло все категории второй раз со всеми
   * полями: 33 КБ из 131 КБ данных главной (замер 13 октября 2026), столько же
   * на каждом разделе и каждой карточке. `computed` в состояние не попадает и
   * собирается одинаково на сервере и в браузере из одних и тех же строк.
   *
   * Бренды для мобильного каталога лежат отдельно (`menuBrands`) и
   * подклеиваются при сборке: вписанные прямо в пункты, они терялись бы при
   * каждой пересборке дерева.
   */
  const menuTree = computed<CategoryMenuItem[]>(() => {
    const menuItems = allCategories.value.filter(c => c.display_in_menu)
    const categoryMap = new Map<string, CategoryMenuItem>()
    const rootItems: CategoryMenuItem[] = []

    for (const item of menuItems) {
      const brands = menuBrands.value[item.id]
      const categoryItem: CategoryMenuItem = brands
        ? { ...item, children: [], brands, brandsLoaded: true }
        : { ...item, children: [] }
      categoryMap.set(item.id, categoryItem)
      if (item.is_root_category)
        rootItems.push(categoryItem)
    }

    for (const item of menuItems) {
      if (item.parent_id)
        categoryMap.get(item.parent_id)?.children?.push(categoryMap.get(item.id)!)
    }

    return rootItems
  })
  const additionalMenuItems = ref<AdditionalMenuItem[]>([])
  const isLoading = ref(false)
  const brandsLoading = ref(false)
  const brandsLoadedForMenu = ref(false)
  const blurLoading = ref(false)
  const blurLoaded = ref(false)

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
      /*
       * Через собственный /api/categories, а не напрямую в Supabase.
       * Этот запрос делается на каждый рендер — его зовут главная,
       * `/catalog`, страница категории, карточка товара, мега-меню и
       * мобильная панель, — и стоит 97 КБ и около полутора секунд, из
       * которых 400-650 мс это просто круг до Supabase. Категорий 64 и
       * меняются они раз в месяц, поэтому выборка кешируется на сервере
       * (server/api/categories.get.ts). На сервере вызов внутренний, без
       * сетевого круга вовсе.
       */
      const fetchedCategories = (await $fetch<CategoryRow[]>('/api/categories')) || []
      // Дерево меню (`menuTree`) соберётся из этих строк само.
      allCategories.value = fetchedCategories
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

  /**
   * Догрузка LQIP-подложек категорий. Только на клиенте и только по запросу
   * того, кто их правда рисует.
   *
   * Из общей выборки поле убрано намеренно (см. комментарий к
   * PUBLIC_CATEGORY_COLUMNS): в SSR-разметке подложки категорий не
   * участвуют ни на одной странице, а весили половину документа.
   *
   * Правится только `allCategories`: `menuTree` собирается из него, так что
   * `HomePopularCategories`, читающий подложку из дерева, увидит её тоже.
   */
  async function loadCategoryBlurPlaceholders() {
    if (import.meta.server)
      return
    if (blurLoaded.value || blurLoading.value)
      return

    blurLoading.value = true
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, blur_placeholder')
        .not('blur_placeholder', 'is', null)
      if (error)
        throw error

      const blurById = new Map(
        (data || []).map(row => [row.id, row.blur_placeholder]),
      )
      if (blurById.size === 0) {
        blurLoaded.value = true
        return
      }

      allCategories.value = allCategories.value.map(category =>
        blurById.has(category.id)
          ? { ...category, blur_placeholder: blurById.get(category.id)! }
          : category,
      )

      blurLoaded.value = true
    }
    catch (e) {
      // Не критично: ProgressiveImage сам откатится на shimmer.
      console.error('Не удалось загрузить LQIP-подложки категорий:', e)
    }
    finally {
      blurLoading.value = false
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

      // В отдельную карту, а не в пункты: дерево пересобирается из
      // allCategories, и вписанное в пункт пропало бы при первой пересборке.
      const loaded: Record<string, BrandForFilter[]> = {}
      results.forEach((result, index) => {
        loaded[level2Categories[index]!.id] = result.status === 'fulfilled'
          ? result.value.slice(0, 6)
          : []
      })
      menuBrands.value = { ...menuBrands.value, ...loaded }

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
    menuBrands.value = {}
    brandsLoadedForMenu.value = false
    // Иначе после перезагрузки списка подложки уже не догрузятся:
    // флаг остался бы поднятым, а сами значения ушли вместе со строками.
    blurLoaded.value = false
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
    loadCategoryBlurPlaceholders,
    forceRefetch,
  }
})
