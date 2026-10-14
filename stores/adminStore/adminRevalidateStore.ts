import type { DeletedProductTarget, RevalidatePagesBody } from '@/utils/revalidatePages'
import { buildRevalidateRequests, mergeRevalidateBody } from '@/utils/revalidatePages'

/**
 * Очередь сброса кеша страниц сайта после правок в админке.
 *
 * Зачем. Каждое сохранение пересобирало на Vercel все страницы, где видна
 * правка: у товара это карточка, его разделы, связки с брендом, бренд,
 * серия, главная, «Новинки», «Акции» — около 10 страниц и столько же их
 * данных. Десять товаров в один раздел подряд пересобирали главную и раздел
 * десять раз, а каждая пересборка — записи ISR сверх лимита Hobby (разбор
 * 14 октября 2026, docs/HANDOFF.md). Теперь правки копятся, и через
 * `DELAY_MS` после ПОСЛЕДНЕЙ уходят одним пакетом: общие страницы
 * пересобираются один раз.
 *
 * Таймер живёт здесь, а не в виджете: пакет уйдёт с любой страницы админки.
 * Закрыли вкладку раньше — пакет уходит запросом `keepalive` с последним
 * токеном входа; не ушёл и он — страницы обновятся сами, когда истечёт их кеш
 * (главная — час, остальные — сутки).
 *
 * Почему 10 минут: заведение одного товара (фото, описание, характеристики)
 * занимает несколько минут, и с минутной паузой пакет уходил между товарами —
 * объединять было нечего (владелец, 14 октября 2026). Срочная правка (цена) —
 * кнопкой «Обновить сейчас» в виджете.
 */
export const DELAY_MS = 10 * 60_000

export interface RevalidateResult {
  at: number
  revalidated: number
  failed: number
  skipped?: string
  error?: string
}

export const useAdminRevalidateStore = defineStore('adminRevalidateStore', () => {
  const pending = ref<RevalidatePagesBody>({})
  const deletedProducts = ref<DeletedProductTarget[]>([])
  /** Сколько сохранений накопилось — для виджета. */
  const changes = ref(0)
  /** Когда уйдёт пакет (ms), null — очередь пуста. */
  const deadline = ref<number | null>(null)
  const flushing = ref(false)
  const lastResult = ref<RevalidateResult | null>(null)

  let timer: ReturnType<typeof setTimeout> | null = null
  // Токен на случай закрытия вкладки: в `pagehide` ждать getSession() нельзя.
  let lastToken: string | null = null

  function rememberToken() {
    useNuxtApp().$supabase.client.auth.getSession().then(({ data }) => {
      lastToken = data.session?.access_token ?? lastToken
    }).catch(() => {})
  }

  function schedule() {
    changes.value++
    deadline.value = Date.now() + DELAY_MS
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(() => void flushNow(), DELAY_MS)
    rememberToken()
  }

  function enqueue(body: RevalidatePagesBody) {
    pending.value = mergeRevalidateBody(pending.value, body)
    schedule()
  }

  function enqueueDeletedProduct(target: DeletedProductTarget) {
    deletedProducts.value = [...deletedProducts.value, target]
    schedule()
  }

  /** Забрать накопленное и обнулить очередь. */
  function take() {
    if (timer)
      clearTimeout(timer)
    timer = null
    const requests = buildRevalidateRequests(pending.value, deletedProducts.value)
    pending.value = {}
    deletedProducts.value = []
    changes.value = 0
    deadline.value = null
    return requests
  }

  async function flushNow() {
    if (flushing.value)
      return
    const requests = take()
    if (!requests.length)
      return
    flushing.value = true
    const settled = await Promise.allSettled(
      requests.map(r => adminFetch<{ revalidated?: number, failed?: unknown[], skipped?: string }>(r.url, { method: 'POST', body: r.body })),
    )
    const result: RevalidateResult = { at: Date.now(), revalidated: 0, failed: 0 }
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        result.revalidated += s.value?.revalidated ?? 0
        result.failed += s.value?.failed?.length ?? 0
        if (s.value?.skipped)
          result.skipped = s.value.skipped
      }
      else {
        result.failed++
        result.error = s.reason?.statusMessage || s.reason?.message || 'ошибка запроса'
        console.warn('[revalidate] не удалось сбросить кеш страниц', s.reason)
      }
    }
    lastResult.value = result
    flushing.value = false
  }

  if (import.meta.client) {
    // Вкладку закрыли до таймера — отправить накопленное, не дожидаясь ответа.
    window.addEventListener('pagehide', () => {
      if (!deadline.value)
        return
      for (const r of take()) {
        fetch(r.url, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json', ...(lastToken ? { Authorization: `Bearer ${lastToken}` } : {}) },
          body: JSON.stringify(r.body),
        }).catch(() => {})
      }
    })
  }

  return { pending, deletedProducts, changes, deadline, flushing, lastResult, enqueue, enqueueDeletedProduct, flushNow }
})
