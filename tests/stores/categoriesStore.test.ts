import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

/*
 * Состояние Pinia целиком уезжает в HTML каждой страницы (`__NUXT_DATA__`).
 * Дерево меню, собранное из копий строк, везло все категории второй раз —
 * 33 КБ из 131 КБ данных главной (замер 13 октября 2026). Дерево — производное
 * от `allCategories`, и в состоянии его быть не должно.
 */

const fetchBrandsForCategory = vi.fn()
vi.mock('@/stores/publicStore/productsStore', () => ({
  useProductsStore: () => ({ fetchBrandsForCategory }),
}))

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    slug: id,
    href: `/catalog/${id}`,
    description: 'текст раздела',
    parent_id: null,
    is_root_category: true,
    display_in_menu: true,
    display_order: 1,
    ...overrides,
  }
}

const ROWS = [
  row('girls'),
  row('kukly', { parent_id: 'girls', is_root_category: false }),
  row('hidden', { display_in_menu: false }),
  row('constructors-root'),
  row('konstruktory-malchikam', { parent_id: 'constructors-root', is_root_category: false }),
]

describe('categoriesStore: дерево меню', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(ROWS))
    fetchBrandsForCategory.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('дерева нет в состоянии, которое уезжает в HTML', async () => {
    const store = useCategoriesStore()
    await store.fetchCategoryData()

    expect(store.menuTree).toHaveLength(2)
    expect(Object.keys(pinia.state.value.categories)).not.toContain('menuTree')
  })

  it('корни и дети — из allCategories, скрытые из меню не попадают', async () => {
    const store = useCategoriesStore()
    await store.fetchCategoryData()

    expect(store.menuTree.map(c => c.slug)).toEqual(['girls', 'constructors-root'])
    expect(store.menuTree[0]!.children!.map(c => c.slug)).toEqual(['kukly'])
  })

  it('правка allCategories видна в дереве — как при догрузке подложек', async () => {
    const store = useCategoriesStore()
    await store.fetchCategoryData()

    store.allCategories = store.allCategories.map(c =>
      c.id === 'kukly' ? { ...c, blur_placeholder: 'data:image/webp;base64,AA' } : c,
    )

    expect(store.menuTree[0]!.children![0]!.blur_placeholder).toBe('data:image/webp;base64,AA')
  })

  it('бренды мобильного каталога держатся и после пересборки дерева', async () => {
    fetchBrandsForCategory.mockResolvedValue([{ id: 'b1', name: 'LEGO', slug: 'lego' }])
    const store = useCategoriesStore()
    await store.fetchCategoryData()
    await store.loadBrandsForMenuCategories()

    const constructorsChild = () => store.menuTree[1]!.children![0]!
    expect(constructorsChild().brands).toEqual([{ id: 'b1', name: 'LEGO', slug: 'lego' }])
    expect(constructorsChild().brandsLoaded).toBe(true)

    // пересборка дерева (например, догрузились подложки) брендов не теряет
    store.allCategories = [...store.allCategories]
    expect(constructorsChild().brands).toHaveLength(1)
    expect(constructorsChild().brandsLoaded).toBe(true)
  })
})
