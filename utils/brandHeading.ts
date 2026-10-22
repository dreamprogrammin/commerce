/**
 * Слово о товаре для заголовка страницы бренда: «Конструкторы LEGO».
 *
 * Зачем вообще. Голое «LEGO» в H1 и шаблонное «LEGO - Купить товары бренда в
 * Алматы» в title не говорят, ЧТО продаётся. По Search Console (лето 2026)
 * страница бренда висела на 28-й позиции по «лего алматы купить», а
 * бренд-лендинг в категории с заголовком «Конструкторы Мальчикам LEGO —
 * купить в Алматы» — на 20-й по тем же запросам.
 *
 * Почему не берём имя корневой категории как есть. Дерево каталога смешивает
 * два разных основания: часть корней — это ТИП товара («Конструкторы»,
 * «Игры»), часть — АУДИТОРИЯ («Мальчикам», «Девочкам», «Малышам»). Подставив
 * имя вслепую, получаем «Мальчикам Zuru — купить в Алматы» — по-русски так
 * не говорят. Поэтому корень аудитории отображается в нейтральное
 * «Игрушки», а типовые корни — в своё слово в именительном падеже.
 *
 * Новый корень в каталоге ничего не ломает: незнакомый слаг даёт «Игрушки».
 */
const WORD_BY_ROOT_SLUG: Record<string, string> = {
  'constructors-root': 'Конструкторы',
  'games': 'Игры',
  'myagkie-igrushki': 'Мягкие игрушки',
  'creativity': 'Товары для творчества',
  'accessories': 'Аксессуары',
  // Корни-аудитории: тип товара из них не следует.
  'boys': 'Игрушки',
  'girls': 'Игрушки',
  'kiddy': 'Игрушки',
  'holyday': 'Игрушки',
}

/** Запасное слово, когда корень незнаком или товаров у бренда нет вовсе. */
export const DEFAULT_BRAND_HEADING_WORD = 'Игрушки'

/**
 * Корневая категория, в которой у бренда больше всего активных товаров, —
 * её слаг. Им пользуются страница бренда и предпросмотр выдачи в админке
 * (`components/admin/brands/BrandForm.vue`), чтобы заголовок совпадал.
 *
 * Берём именно корень дерева, а не категорию товара: «Конструкторы»
 * читается как раздел, «Конструкторы Мальчикам» в заголовке бренда звучит
 * криво. При равенстве — корень, встреченный первым.
 */
export function findTopRootSlug(
  products: readonly { category_id: string | null }[],
  categories: readonly { id: string, parent_id: string | null, slug: string | null }[],
): string | null {
  const byId = new Map(categories.map(c => [c.id, c]))
  const rootCounts = new Map<string, number>()
  for (const product of products) {
    let current = product.category_id ? byId.get(product.category_id) : undefined
    // Ограничение глубины — страховка от петли `parent_id` в данных.
    for (let depth = 0; current?.parent_id && depth < 10; depth++)
      current = byId.get(current.parent_id)
    if (current)
      rootCounts.set(current.id, (rootCounts.get(current.id) ?? 0) + 1)
  }
  const topRootId = [...rootCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return topRootId ? byId.get(topRootId)?.slug ?? null : null
}

/**
 * Слово для заголовка по слагу корневой категории, где у бренда больше всего
 * товаров. `null` — если корень неизвестен: заголовок тогда остаётся прежним.
 */
export function brandHeadingWord(rootSlug: string | null | undefined): string | null {
  if (!rootSlug)
    return null
  return WORD_BY_ROOT_SLUG[rootSlug] ?? DEFAULT_BRAND_HEADING_WORD
}
