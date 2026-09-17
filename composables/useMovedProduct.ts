import type { Database } from '@/types'

/**
 * Куда переехала карточка, если её адрес сменился.
 *
 * Зачем. Правка названия в админке перегенерирует slug, и прежний адрес
 * начинает отдавать 404 вместе со всеми накопленными позициями. Замер Search
 * Console 17 сентября 2026: пять таких адресов продолжали получать показы,
 * крупнейший — 165 показов на позиции 4.8. Прежние адреса теперь пишет триггер
 * `trg_product_slug_history`, а эта функция по ним ищет живую карточку.
 *
 * Возвращает `null`, когда адреса в истории нет (обычный несуществующий slug —
 * ему положен 404) или когда товар удалён: строка в истории остаётся следом,
 * но `product_id` у неё обнулён, и вести оттуда некуда.
 */
export async function findMovedProductSlug(
  client: ReturnType<typeof useSupabaseClient<Database>>,
  oldSlug: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('product_slug_history')
    .select('products(slug)')
    .eq('old_slug', oldSlug)
    .maybeSingle()

  /*
   * Ошибку глушим намеренно: не найти замену — это 404, а не сбой страницы.
   * Падать здесь нельзя, иначе отсутствующая карточка начнёт отдавать 500.
   */
  if (error)
    return null

  const moved = (data as { products?: { slug?: string | null } | null } | null)?.products
  return moved?.slug ?? null
}
