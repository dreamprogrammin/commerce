import type { Database } from '@/types'
import { useDebounceFn } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { useProductsStore } from '@/stores/publicStore/productsStore'

interface SearchHistoryItem {
  text: string
  timestamp: number
}

interface ProductSearchResult {
  id: string
  name: string
  slug: string
  price: number
  discount_percentage: number
  product_images: {
    image_url: string
    blur_placeholder?: string | null
  }[]
  brands: { id: string, name: string, slug: string } | null
  category_id: string | null
  stock_quantity: number
}

export function useProductSearch() {
  const supabase = useSupabaseClient<Database>()
  const router = useRouter()
  const productsStore = useProductsStore()

  // ============================================
  // 🔍 STATE
  // ============================================
  const searchQuery = ref('')
  const searchResults = ref<ProductSearchResult[]>([])
  const isSearching = ref(false)
  const searchHistory = ref<SearchHistoryItem[]>([])
  const popularSearches = ref<string[]>([])
  const brandSuggestions = ref<{ id: string, name: string, slug: string }[]>([])

  // ============================================
  // 🗄️ ИСТОРИЯ ПОИСКА (LocalStorage)
  // ============================================
  const HISTORY_KEY = 'toy_shop_search_history'
  const MAX_HISTORY_ITEMS = 10

  function loadSearchHistory() {
    if (typeof window === 'undefined')
      return

    try {
      const stored = localStorage.getItem(HISTORY_KEY)
      if (stored) {
        searchHistory.value = JSON.parse(stored)
      }
    }
    catch (error) {
      console.error('Ошибка загрузки истории поиска:', error)
    }
  }

  function saveToHistory(query: string) {
    if (!query.trim())
      return

    const normalized = query.trim().toLowerCase()

    // Удаляем дубликаты
    searchHistory.value = searchHistory.value.filter(
      item => item.text.toLowerCase() !== normalized,
    )

    // Добавляем новый элемент в начало
    searchHistory.value.unshift({
      text: query.trim(),
      timestamp: Date.now(),
    })

    // Ограничиваем размер истории
    if (searchHistory.value.length > MAX_HISTORY_ITEMS) {
      searchHistory.value = searchHistory.value.slice(0, MAX_HISTORY_ITEMS)
    }

    // Сохраняем в localStorage
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory.value))
    }
    catch (error) {
      console.error('Ошибка сохранения истории поиска:', error)
    }
  }

  function clearSearchHistory() {
    searchHistory.value = []
    try {
      localStorage.removeItem(HISTORY_KEY)
    }
    catch (error) {
      console.error('Ошибка очистки истории:', error)
    }
  }

  function removeHistoryItem(text: string) {
    searchHistory.value = searchHistory.value.filter(item => item.text !== text)
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory.value))
    }
    catch (error) {
      console.error('Ошибка удаления элемента истории:', error)
    }
  }

  // ============================================
  // 🔍 ПОИСК ТОВАРОВ
  // ============================================
  async function searchProducts(query: string): Promise<ProductSearchResult[]> {
    if (!query.trim()) {
      searchResults.value = []
      brandSuggestions.value = []
      return []
    }

    isSearching.value = true

    try {
      /*
       * Поиск живёт в базе — функции `search_products` и `search_brands`.
       *
       * Здесь был запрос `name.ilike.%запрос%` прямо из браузера, и он не
       * работал сразу в четырёх местах (проверено на боевых данных
       * 4 сентября 2026): «лего» не находил ни одного из 22 товаров LEGO,
       * «машинки» находили втрое меньше, чем «машинка», «конструктор лего»
       * искалось одной строкой целиком, а запятая в запросе роняла его совсем —
       * в PostgREST она разделяет условия `or=()`, и покупатель видел
       * «Ошибка при поиске». Разбор запроса на слова, транслитерация и
       * ранжирование — всё это в SQL, здесь остаётся только вызов.
       */
      const [productsData, brandsData] = await Promise.all([
        supabase.rpc('search_products', { p_query: query, p_limit: 20 }),
        supabase.rpc('search_brands', { p_query: query, p_limit: 3 }),
      ])

      if (productsData.error)
        throw productsData.error

      const results = (productsData.data || []).map((row) => {
        const images = Array.isArray(row.images) ? row.images : []
        const brand = row.brand as { id: string, name: string, slug: string } | null

        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          price: row.price,
          discount_percentage: row.discount_percentage,
          stock_quantity: row.stock_quantity,
          category_id: row.category_id,
          product_images: images.map((img: any) => ({
            image_url: img?.image_url || '',
            blur_placeholder: img?.blur_placeholder || null,
          })),
          brands: brand ? { id: brand.id, name: brand.name, slug: brand.slug } : null,
        }
      }) as ProductSearchResult[]

      searchResults.value = results
      brandSuggestions.value = brandsData.data || []

      return results
    }
    catch (error: any) {
      console.error('Ошибка поиска товаров:', error)
      toast.error('Ошибка при поиске', { description: error.message })
      return []
    }
    finally {
      isSearching.value = false
    }
  }

  // Дебаунсированный поиск для живого ввода
  const debouncedSearch = useDebounceFn(async (query: string) => {
    await searchProducts(query)
  }, 300)

  // ============================================
  // 🎯 ДЕЙСТВИЯ
  // ============================================
  function performSearch(query?: string) {
    const finalQuery = query || searchQuery.value

    if (!finalQuery.trim())
      return

    saveToHistory(finalQuery)
    /*
     * Результаты — на `/search?q=`, а не в каталог: каталог параметр `q`
     * не читает вовсе (проверено на проде — `/catalog/all?q=lego` отдавал тот
     * же список, что и без запроса), да и schema.org в app.vue давно обещает
     * поисковикам именно этот адрес.
     */
    router.push(`/search?q=${encodeURIComponent(finalQuery.trim())}`)
  }

  function selectSuggestion(suggestion: string) {
    searchQuery.value = suggestion
    performSearch(suggestion)
  }

  // ============================================
  // 🎨 COMPUTED
  // ============================================
  const suggestions = computed(() => {
    // Если есть результаты поиска, не показываем историю
    if (searchResults.value.length > 0) {
      return []
    }

    // Если нет запроса, показываем историю + популярные
    if (!searchQuery.value.trim()) {
      const history = searchHistory.value.slice(0, 5).map(item => ({
        text: item.text,
        type: 'history' as const,
      }))

      const popular = popularSearches.value
        .filter(p => !history.some(h => h.text.toLowerCase() === p.toLowerCase()))
        .slice(0, 5 - history.length)
        .map(text => ({
          text,
          type: 'suggestion' as const,
        }))

      return [...history, ...popular]
    }

    // Если есть запрос, фильтруем историю
    const filtered = searchHistory.value
      .filter(item => item.text.toLowerCase().includes(searchQuery.value.toLowerCase()))
      .slice(0, 5)
      .map(item => ({
        text: item.text,
        type: 'history' as const,
      }))

    return filtered
  })

  const hasResults = computed(() => searchResults.value.length > 0)
  const hasQuery = computed(() => searchQuery.value.trim().length > 0)

  // ============================================
  // 🔄 LIFECYCLE
  // ============================================
  onMounted(() => {
    loadSearchHistory()
    // Загружаем популярные запросы из store
    popularSearches.value = productsStore.getPopularSearchQueries()
  })

  return {
    // State
    searchQuery,
    searchResults,
    isSearching,
    searchHistory,
    suggestions,
    hasResults,
    hasQuery,
    brandSuggestions,

    // Methods
    searchProducts,
    debouncedSearch,
    performSearch,
    selectSuggestion,
    clearSearchHistory,
    removeHistoryItem,
  }
}
