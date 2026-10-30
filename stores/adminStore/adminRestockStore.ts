import type { DraftEdits } from '@/utils/restockOrder'
import { defineStore } from 'pinia'

/**
 * Черновики заказов поставщикам со страницы «К закупке» (30.10.2026):
 * правки к автоматическому списку — сколько брать, что убрать, что добавить
 * вручную. Живут в браузере, пока нет таблицы заказов поставщикам (шаг 2:
 * «Заказал» → «В пути» → «Принять»).
 */
export const useAdminRestockStore = defineStore('adminRestockStore', () => {
  /** id поставщика → правки его заказа */
  const drafts = ref<Record<string, DraftEdits>>({})

  /** `quantity` — null: вернуть количество по правилу товара */
  function setQuantity(supplierId: string, productId: string, quantity: number | null) {
    const edits = { ...drafts.value[supplierId] }
    if (quantity == null)
      delete edits[productId]
    else
      edits[productId] = quantity
    drafts.value = { ...drafts.value, [supplierId]: edits }
  }

  function reset(supplierId: string) {
    const { [supplierId]: _, ...rest } = drafts.value
    drafts.value = rest
  }

  return { drafts, setQuantity, reset }
}, {
  persist: {
    key: 'uhti-admin-restock-v1',
    pick: ['drafts'],
    storage: piniaPluginPersistedstate.localStorage(),
  },
})
