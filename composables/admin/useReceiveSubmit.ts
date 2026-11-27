import type { ReceiveResult, SupplierOrder } from '@/utils/supplierOrders'
import { toast } from 'vue-sonner'
import { useAdminRevalidateStore } from '@/stores/adminStore/adminRevalidateStore'
import { adminFetch } from '@/utils/adminFetch'
import { plural } from '@/utils/restockOrder'

/**
 * «Принять» — одно на окно приёмки (components/admin/purchasing/ReceiveOrderDialog.vue)
 * и экран «Приёмка по факту» (pages/admin/deliveries/receive/[order].vue, 27.11.2026):
 * пришедшее — к остатку, кеш карточек — сразу, показанные новые товары —
 * поисковикам, итог — тостом. Ошибку бросает: что с ней делать, решает страница.
 */
export function useReceiveSubmit() {
  const revalidateStore = useAdminRevalidateStore()
  const { notifyProducts } = useSeoIndexing()

  async function receive(order: Pick<SupplierOrder, 'id' | 'number'>, quantities: Record<string, number>, close: boolean): Promise<ReceiveResult> {
    const result = await adminFetch<ReceiveResult>(`/api/admin/restock/orders/${order.id}/receive`, {
      method: 'POST',
      body: {
        items: Object.entries(quantities).map(([productId, quantity]) => ({ productId, quantity })),
        close,
      },
    })
    // Кеш карточек сразу: уведомление «снова в наличии» ведёт на карточку,
    // а закешированная на сутки страница показала бы «нет в наличии»
    const productIds = result.received.map(r => r.product_id)
    if (productIds.length) {
      revalidateStore.enqueue({ productIds })
      revalidateStore.flushNow()
    }
    // Новый товар только что появился на сайте — поисковикам
    const shown = result.shown ?? []
    if (shown.length)
      void notifyProducts(shown.map(s => s.slug))
    toast.success(`Принято ${result.units} шт. по заказу №${order.number}`, {
      description: [
        result.status === 'received' ? 'Заказ закрыт' : 'Заказ открыт — ждём остальное',
        result.notified ? `«Товар снова в наличии» ушло ${result.notified} ${plural(result.notified, 'покупателю', 'покупателям', 'покупателям')}` : '',
        shown.length ? `На сайте ${plural(shown.length, 'появился', 'появились', 'появились')} ${shown.length} ${plural(shown.length, 'новый товар', 'новых товара', 'новых товаров')}` : '',
      ].filter(Boolean).join('. '),
    })
    return result
  }

  return { receive }
}
