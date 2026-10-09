/**
 * Сброс кеша страниц сайта после правки в админке — в фоне, ошибки только в
 * консоль: сохранение от сброса не зависит (9 октября 2026).
 *
 * Кеш страниц суточный (ради лимита трафика Supabase), поэтому правка должна
 * доезжать до сайта сразу. Что сбросить, решает сервер по тому, что
 * изменилось, — см. server/api/admin/revalidate.post.ts.
 */
export interface RevalidatePagesBody {
  productIds?: string[]
  categoryIds?: string[]
  brandIds?: string[]
  lineIds?: string[]
  campaignIds?: string[]
  paths?: string[]
  scope?: 'catalog'
}

export function revalidatePages(body: RevalidatePagesBody): void {
  $fetch('/api/admin/revalidate', { method: 'POST', body }).catch((error) => {
    console.warn('[revalidate] не удалось сбросить кеш страниц', error)
  })
}
