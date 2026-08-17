import type { AdditionalMenuItem, CategoryMenuItem, CategoryRow, Database } from '@/types'

/**
 * Колонки категорий для публичной части — всё, кроме `seo_text` и подложек.
 *
 * Раньше здесь стоял `select('*')`, и на КАЖДУЮ страницу сайта уезжали
 * SEO-тексты всех 64 категорий: 76 КБ в базе, а в payload Nuxt — 115 КБ
 * (63 строки вида `<h2 data-icon=…>` примерно по 1.8 КБ). Публично это поле
 * не выводится нигде: единственный его читатель — форма в админке, а она
 * работает через adminCategoriesStore со своим запросом.
 *
 * По той же причине здесь нет `blur_placeholder` и `blur_data_url`.
 * Замерено на превью: data:URI составляли 50-56% сжатого веса КАЖДОГО
 * документа (`/catalog/boys` — 78.5 КБ brotli против 39.2 КБ без них,
 * главная — 55.9 против 24.6), и подложки всех 51 категории с картинкой
 * уезжали на каждую страницу сайта. При этом в первой отрисовке они не
 * участвуют нигде: сетка `/catalog` рисует картинки внутри `ClientOnly` и
 * только при `!isMobile`, `HomePopularCategories` монтируется по
 * `requestIdleCallback`, а `components/category/CategoryDescription.vue`
 * (третий читатель поля) вообще ни на одной странице не подключён.
 * Поэтому подложки догружаются на клиенте — `loadCategoryBlurPlaceholders`.
 *
 * `blur_data_url` — отдельная история: у категорий поле не заполнено ни в
 * одной строке и не читается ни одним компонентом. Это поле баннеров и
 * слайдов, здесь оно оказалось по недоразумению.
 *
 * Перечислено списком, а не вычитанием: PostgREST не умеет «всё кроме», а
 * `select('*')` вернул бы поле обратно при любом изменении схемы.
 */
const PUBLIC_CATEGORY_COLUMNS = [
  'id',
  'name',
  'slug',
  'href',
  'description',
  'parent_id',
  'is_root_category',
  'display_in_menu',
  'display_order',
  'image_url',
  'icon_name',
  'created_at',
  'updated_at',
  'is_featured',
  'featured_order',
  'seo_title',
  'seo_h1',
  'seo_keywords',
  'allowed_brand_ids',
  'allowed_product_line_ids',
  'meta_title',
  'meta_description',
  'meta_keywords',
  'seo_description',
  'canonical_url',
  'og_title',
  'og_description',
  'og_image',
].join(', ')

export const useCategoriesStore = defineStore('categories', () => {
  const supabase = useSupabaseClient<Database>()

  const allCategories = ref<CategoryRow[]>([])
  const menuTree = ref<CategoryMenuItem[]>([])
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
      const { data, error } = await supabase
        .from('categories')
        .select(PUBLIC_CATEGORY_COLUMNS)
        .order('display_order')
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

  /**
   * Догрузка LQIP-подложек категорий. Только на клиенте и только по запросу
   * того, кто их правда рисует.
   *
   * Из общей выборки поле убрано намеренно (см. комментарий к
   * PUBLIC_CATEGORY_COLUMNS): в SSR-разметке подложки категорий не
   * участвуют ни на одной странице, а весили половину документа.
   *
   * Патчатся ОБА хранилища. `menuTree` собирается из копий строк
   * (`{ ...item, children: [] }`), поэтому правка `allCategories` до него
   * не доезжает, а `HomePopularCategories` читает подложку именно из дерева.
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

      const patchTree = (items: CategoryMenuItem[]) => {
        for (const item of items) {
          if (blurById.has(item.id))
            item.blur_placeholder = blurById.get(item.id)!
          if (item.children?.length)
            patchTree(item.children)
        }
      }
      patchTree(menuTree.value)

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
