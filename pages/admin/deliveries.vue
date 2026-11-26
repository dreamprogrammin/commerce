<script setup lang="ts">
import type { DeliveriesData, SupplierOrder, SupplierOrderLine, SupplierOrderStatus } from '@/utils/supplierOrders'
import {
  Ban,
  CalendarDays,
  Check,
  Copy,
  FileSpreadsheet,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  Send,
  Trash2,
  Truck,
  Undo2,
  X,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import ReceiveOrderDialog from '@/components/admin/purchasing/ReceiveOrderDialog.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { jpegForSheet, saveOrderFile } from '@/composables/useOrderSheetFile'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { adminFetch } from '@/utils/adminFetch'
import { buildOrderWorkbook, groupOrderLines, orderFileName } from '@/utils/orderSheet'
import { plural, pluralPositions, whatsappUrl } from '@/utils/restockOrder'
import {
  addDays,
  almatyDay,
  daysBetween,
  DEFAULT_LEAD_DAYS,
  deliveryDay,
  expectedState,
  isOpenOrder,
  lineCheck,
  ORDER_STATUS_LABEL,
  orderCheck,
  orderSheetLines,
  orderSummary,
  savedOrderMoney,
  supplierOrderText,
} from '@/utils/supplierOrders'

definePageMeta({ layout: 'admin' })

/*
 * «Поставки» (26 ноября 2026). Владелец: «ещё один раздел — поставки от
 * поставщиков, в которых будут сформированы заказы при добавлении, с
 * примерной датой ожидания, и там должна происходить сверка товаров: сколько
 * пришло и сколько нет, как в SAP-портале. Как только я поставку оприходую,
 * она уже появляется в основном складе; пока поставка не принята, товары не
 * добавляются, а если тот же товар — остатки увеличиваются».
 *
 * Формируются — товары из «На сайт» копятся по поставщику, пока не нажато
 * «Заказано» (тогда — дата поставки, по умолчанию через 3 дня). Ждём —
 * заказанные и в пути, по дате. Закрытые — за 60 дней. «Принять» — то же
 * окно, что в «К закупке»: остаток прибавляется, скрытый новый товар
 * появляется на сайте. Данные — `/api/admin/deliveries`.
 */
const { getVariantUrl } = useSupabaseStorage()

const data = ref<DeliveriesData | null>(null)
const isLoading = ref(true)
let loaded = false

async function load() {
  isLoading.value = true
  try {
    data.value = await adminFetch<DeliveriesData>('/api/admin/deliveries')
    loaded = true
  }
  catch (error: any) {
    toast.error('Не удалось загрузить поставки', { description: error.data?.message || error.message })
  }
  finally {
    isLoading.value = false
  }
}
onMounted(load)
// Страницы админки держатся в памяти (app.vue, keepalive): вернулись сюда —
// заказы свежие, «На сайт» мог положить товар в формирующийся
onActivated(() => {
  if (loaded && !isLoading.value)
    load()
})

const today = computed(() => data.value?.today ?? almatyDay(new Date()))
const supplierById = computed(() => new Map((data.value?.suppliers ?? []).map(s => [s.id, s])))
const productMap = computed(() => new Map(Object.entries(data.value?.products ?? {})))
const supplierName = (id: string) => supplierById.value.get(id)?.name ?? 'Поставщик'

const orders = computed(() => data.value?.orders ?? [])
const forming = computed(() => orders.value.filter(o => o.status === 'draft')
  .sort((a, b) => supplierName(a.supplierId).localeCompare(supplierName(b.supplierId), 'ru')))
// Ждём — по дате: раньше всех те, что уже опаздывают; без даты — в конце
const waiting = computed(() => orders.value.filter(isOpenOrder)
  .sort((a, b) => (a.expectedAt ?? '9999-12-31').localeCompare(b.expectedAt ?? '9999-12-31') || a.number - b.number))
const closed = computed(() => orders.value.filter(o => o.status === 'received' || o.status === 'cancelled')
  .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '') || b.number - a.number))
const lateCount = computed(() => waiting.value.filter(o => expectedState(o, today.value)?.kind === 'late').length)
const showClosed = ref(false)

/** Приёмки заказа — одна приёмка пишет строки журнала с одним временем */
const receiptsByOrder = computed(() => {
  const map = new Map<string, { at: string, units: number, positions: number }[]>()
  for (const r of data.value?.receipts ?? []) {
    const list = map.get(r.orderId) ?? []
    const last = list.at(-1)
    if (last && last.at === r.receivedAt) {
      last.units += r.quantity
      last.positions++
    }
    else {
      list.push({ at: r.receivedAt, units: r.quantity, positions: 1 })
    }
    map.set(r.orderId, list)
  }
  return map
})

const STATUS_VARIANT: Record<SupplierOrderStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  ordered: 'secondary',
  in_transit: 'default',
  received: 'outline',
  cancelled: 'outline',
}

const money = (n: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))}\u00A0₸`
const count = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`
function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit' }).format(new Date(iso))
}
function formatMoment(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function photoOf(productId: string | null): string | null {
  const product = productId ? data.value?.products[productId] : undefined
  return product?.imageUrl ? getVariantUrl(BUCKET_NAME_PRODUCT, product.imageUrl, 'sm') || null : null
}
const isHidden = (line: SupplierOrderLine) => Boolean(line.productId && data.value?.products[line.productId]?.active === false)
/** Новых товаров заказа, которые ждут приёмки скрытыми, — у отменённого так и останутся скрытыми */
const hiddenWaiting = (order: SupplierOrder) => order.lines.filter(l => l.showOnReceipt && isHidden(l)).length

// ── Сверка, как в SAP-портале: заказано, пришло, не пришло ─────────────────
type LineKind = 'ok' | 'short' | 'over' | 'waiting' | 'none' | 'cancelled'
function lineState(order: SupplierOrder, line: SupplierOrderLine): { kind: LineKind, text: string } {
  const c = lineCheck(line)
  if (order.status === 'cancelled')
    return { kind: 'cancelled', text: 'отменён' }
  const open = isOpenOrder(order)
  if (c.extra)
    return { kind: 'over', text: `лишние ${c.extra} шт.` }
  if (!c.missing)
    return { kind: 'ok', text: 'сошлось' }
  if (!c.received)
    return open ? { kind: 'waiting', text: 'ждём' } : { kind: 'none', text: 'не пришло' }
  return open ? { kind: 'short', text: `ждём ещё ${c.missing} шт.` } : { kind: 'short', text: `недостача ${c.missing} шт.` }
}
const LINE_CLASS: Record<LineKind, string> = {
  ok: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  short: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  over: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  waiting: 'bg-muted text-muted-foreground',
  none: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300',
  cancelled: 'bg-muted text-muted-foreground',
}

function checkText(order: SupplierOrder): string {
  const c = orderCheck(order)
  if (!c.received && isOpenOrder(order))
    return `пока ничего не пришло — ждём ${c.ordered} шт.`
  const units = [`пришло ${c.received} из ${c.ordered} шт.`]
  if (c.missing)
    units.push(isOpenOrder(order) ? `ждём ещё ${c.missing}` : `не пришло ${c.missing}`)
  if (c.extra)
    units.push(`лишних ${c.extra}`)
  const lines = [
    c.full && `сошлось ${c.full}`,
    c.short && `${isOpenOrder(order) ? 'частично' : 'недостача'} ${c.short}`,
    c.none && `${isOpenOrder(order) ? 'ждём' : 'не пришло'} ${c.none}`,
    c.over && `с излишком ${c.over}`,
  ].filter(Boolean)
  return `${units.join(' · ')} — позиции: ${lines.join(', ')}`
}

const EXPECTED_CLASS = {
  none: 'text-muted-foreground',
  ahead: 'text-muted-foreground',
  today: 'text-amber-700 dark:text-amber-400',
  late: 'text-destructive',
} as const

// ── Действия ────────────────────────────────────────────────────────────────
const busy = ref<string | null>(null)

async function run(key: string, action: () => Promise<void>, fail: string) {
  busy.value = key
  try {
    await action()
  }
  catch (error: any) {
    toast.error(fail, { description: error.data?.message || error.message })
  }
  finally {
    busy.value = null
  }
}

/** Количество строки формирующегося; 0 — убрать */
function saveLine(order: SupplierOrder, line: SupplierOrderLine, quantity: number) {
  if (!line.id)
    return
  return run(`line:${line.id}`, async () => {
    const res = await adminFetch<{ positions: number, deleted: boolean }>(`/api/admin/deliveries/${order.id}/lines`, {
      method: 'POST',
      body: { items: [{ lineId: line.id, quantity }] },
    })
    if (res.deleted)
      toast.success(`Заказ №${order.number} удалён — строк в нём не осталось`)
    else if (!quantity)
      toast.success(`«${line.name}» убран из заказа №${order.number}`, { description: isHidden(line) ? 'Товар остаётся скрытым с сайта — показать его можно в карточке товара.' : undefined })
    await load()
  }, 'Не удалось изменить заказ')
}

function onDraftQuantity(order: SupplierOrder, line: SupplierOrderLine, event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number.parseInt(input.value, 10)
  const quantity = Number.isNaN(value) ? line.quantity : Math.min(Math.max(value, 0), 9999)
  input.value = String(quantity)
  if (quantity !== line.quantity)
    saveLine(order, line, quantity)
}

function deleteDraft(order: SupplierOrder) {
  return run(`delete:${order.id}`, async () => {
    await adminFetch(`/api/admin/deliveries/${order.id}/lines`, {
      method: 'POST',
      body: { items: order.lines.filter(l => l.id).map(l => ({ lineId: l.id, quantity: 0 })) },
    })
    toast.success(`Заказ №${order.number} удалён`, { description: hiddenWaiting(order) ? 'Новые товары из него остаются скрытыми с сайта — показать их можно в карточке товара.' : undefined })
    await load()
  }, 'Не удалось удалить заказ')
}

function setStatus(order: SupplierOrder, status: SupplierOrderStatus) {
  return run(`status:${order.id}`, async () => {
    await adminFetch(`/api/admin/restock/orders/${order.id}/status`, { method: 'POST', body: { status } })
    toast.success(`Заказ №${order.number}: ${ORDER_STATUS_LABEL[status].toLowerCase()}`)
    await load()
  }, 'Не удалось изменить заказ')
}

// «Заказано» и дата поставки — одно окно: у формирующегося оно отправляет
// заказ, у открытого — только переносит дату
const dating = ref<{ order: SupplierOrder, place: boolean } | null>(null)
const dateValue = ref('')
const dateOpen = computed({
  get: () => dating.value !== null,
  set: (open: boolean) => {
    if (!open)
      dating.value = null
  },
})
const maxDay = computed(() => addDays(today.value, 366))
const dateHint = computed(() => {
  if (!dateValue.value)
    return null
  const days = daysBetween(today.value, dateValue.value)
  return days === 0 ? 'сегодня' : days > 0 ? `через ${count(days, 'день', 'дня', 'дней')}` : 'дата уже прошла'
})

function openPlace(order: SupplierOrder) {
  dating.value = { order, place: true }
  dateValue.value = addDays(today.value, DEFAULT_LEAD_DAYS)
}
function openExpected(order: SupplierOrder) {
  dating.value = { order, place: false }
  dateValue.value = order.expectedAt && order.expectedAt >= today.value ? order.expectedAt : addDays(today.value, DEFAULT_LEAD_DAYS)
}

function submitDate() {
  const target = dating.value
  if (!target)
    return
  const expectedAt = dateValue.value || null
  return run(`date:${target.order.id}`, async () => {
    await adminFetch(`/api/admin/deliveries/${target.order.id}/${target.place ? 'place' : 'expected'}`, {
      method: 'POST',
      body: { expectedAt },
    })
    dating.value = null
    toast.success(target.place ? `Заказ №${target.order.number} — заказано` : `Заказ №${target.order.number}: ${expectedAt ? `ждём ${deliveryDay(expectedAt)}` : 'дата поставки снята'}`, {
      description: target.place
        ? `${expectedAt ? `Ждём ${deliveryDay(expectedAt)}. ` : ''}Новые товары этого поставщика пойдут уже в следующий заказ.`
        : undefined,
    })
    await load()
  }, target.place ? 'Не удалось отметить «Заказано»' : 'Не удалось изменить дату')
}

// Отменить, закрыть, удалить — необратимо, через подтверждение. Открыто ли
// окно и что подтверждаем — разные состояния: AlertDialogAction закрывает
// окно раньше своего @click (как в «К закупке»)
const confirming = ref<{ order: SupplierOrder, action: 'cancelled' | 'received' | 'delete' } | null>(null)
const confirmOpen = ref(false)
function askConfirm(order: SupplierOrder, action: 'cancelled' | 'received' | 'delete') {
  confirming.value = { order, action }
  confirmOpen.value = true
}
function confirmAction() {
  const target = confirming.value
  confirmOpen.value = false
  if (!target)
    return
  if (target.action === 'delete')
    deleteDraft(target.order)
  else
    setStatus(target.order, target.action)
}

const receivingOrder = ref<SupplierOrder | null>(null)

async function copyText(order: SupplierOrder) {
  try {
    await navigator.clipboard.writeText(supplierOrderText(order))
    toast.success(`Текст заказа №${order.number} скопирован`)
  }
  catch {
    toast.error('Не удалось скопировать')
  }
}
const whatsappOf = (order: SupplierOrder) => whatsappUrl(supplierById.value.get(order.supplierId)?.phone, supplierOrderText(order))

// Таблица Excel для поставщика — как в «К закупке»: фото, артикул, его цена, количество
const sheetBusy = ref<string | null>(null)
async function downloadSheet(order: SupplierOrder) {
  if (sheetBusy.value)
    return
  sheetBusy.value = order.id
  const id = toast.loading('Собираю таблицу с фото…')
  try {
    const supplier = supplierName(order.supplierId)
    const lines = order.lines.map(l => ({ name: l.name, sku: l.sku, costPrice: l.costPrice, quantity: l.quantity, photoUrl: photoOf(l.productId) }))
    const groups = groupOrderLines(orderSheetLines(supplier, lines)).map(g => ({ ...g, number: order.number }))
    const now = new Date()
    saveOrderFile(await buildOrderWorkbook(groups, now, jpegForSheet), orderFileName(now, supplier, order.number))
    toast.success('Таблица скачана', { id, description: 'Её можно отправить поставщику — цен продажи в ней нет' })
  }
  catch {
    toast.error('Не удалось собрать таблицу', { id })
  }
  finally {
    sheetBusy.value = null
  }
}
</script>

<template>
  <div class="container mx-auto space-y-6 p-4 md:p-8" data-testid="deliveries-page">
    <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h1 class="text-2xl font-bold tracking-tight md:text-3xl">
          Поставки
        </h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          Заказы поставщикам — от «Формируется» до приёмки. Товары из «На сайт» копятся в заказ своего поставщика;
          отправили — «Заказано» с датой поставки; пришло — «Принять»: остаток прибавится, новый товар появится на сайте.
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="isLoading" @click="load">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
        Обновить
      </Button>
    </div>

    <div v-if="isLoading && !data" class="space-y-3">
      <Skeleton v-for="i in 3" :key="i" class="h-28 w-full rounded-xl" />
    </div>

    <template v-else-if="data">
      <p v-if="!data.ordersReady" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="deliveries-no-orders">
        Заказов поставщикам на базе ещё нет — раздел заработает после миграции заказов.
      </p>
      <p v-else-if="!data.ready" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="deliveries-no-migration">
        Формирующиеся заказы и даты поставки заработают после миграции базы. Принимать по заказам из «К закупке» можно уже сейчас.
      </p>

      <div class="flex flex-wrap gap-2 text-sm" data-testid="deliveries-summary">
        <a v-if="data.ready" href="#forming" class="rounded-full bg-muted px-3 py-1">Формируются: <span class="font-medium tabular-nums">{{ forming.length }}</span></a>
        <a href="#waiting" class="rounded-full bg-muted px-3 py-1">Ждём: <span class="font-medium tabular-nums">{{ waiting.length }}</span><template v-if="lateCount">, <span class="text-destructive">{{ plural(lateCount, 'опаздывает', 'опаздывают', 'опаздывают') }} {{ lateCount }}</span></template></a>
        <a href="#closed" class="rounded-full bg-muted px-3 py-1">Закрытые за 60 дней: <span class="font-medium tabular-nums">{{ closed.length }}</span></a>
      </div>

      <!-- Формируются -->
      <section v-if="data.ready" id="forming" class="scroll-mt-20 space-y-3" data-testid="deliveries-forming">
        <h2 class="text-lg font-semibold">
          Формируются
        </h2>
        <p v-if="!forming.length" class="text-sm text-muted-foreground">
          Пусто. Товар, добавленный через «На сайт» в «Товарах поставщиков», ляжет сюда — в заказ своего поставщика.
        </p>
        <Card v-for="order in forming" :key="order.id" data-testid="delivery-order" :data-number="order.number" :data-status="order.status">
          <CardContent class="space-y-3 px-4 md:px-6">
            <div class="flex flex-col justify-between gap-2 lg:flex-row lg:items-start">
              <div class="space-y-1 text-sm">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span class="font-medium">№{{ order.number }} · {{ supplierName(order.supplierId) }}</span>
                  <Badge :variant="STATUS_VARIANT[order.status]">
                    {{ ORDER_STATUS_LABEL[order.status] }}
                  </Badge>
                  <span class="text-muted-foreground">с {{ formatDay(order.createdAt) }}</span>
                </div>
                <div class="text-muted-foreground tabular-nums" data-testid="delivery-totals">
                  {{ orderSummary(order).positions }} {{ pluralPositions(orderSummary(order).positions) }}, {{ orderSummary(order).units }} шт.<template v-if="savedOrderMoney(order, productMap).cost">
                    · по закупке {{ money(savedOrderMoney(order, productMap).cost) }}
                  </template>
                </div>
              </div>
              <div class="flex flex-wrap gap-2 lg:justify-end">
                <Button size="sm" :disabled="busy !== null" data-testid="draft-place" @click="openPlace(order)">
                  <Send class="mr-1.5 h-4 w-4" />
                  Заказано
                </Button>
                <Button variant="outline" size="sm" :disabled="sheetBusy !== null" data-testid="draft-sheet" @click="downloadSheet(order)">
                  <FileSpreadsheet class="mr-1.5 h-4 w-4" />
                  Таблица
                </Button>
                <Button variant="ghost" size="sm" data-testid="draft-copy" @click="copyText(order)">
                  <Copy class="mr-1.5 h-4 w-4" />
                  Текст
                </Button>
                <Button
                  v-if="whatsappOf(order)"
                  as="a"
                  variant="ghost"
                  size="sm"
                  :href="whatsappOf(order)!"
                  target="_blank"
                  rel="noopener"
                  data-testid="draft-whatsapp"
                >
                  <MessageCircle class="mr-1.5 h-4 w-4" />
                  WhatsApp
                </Button>
                <Button variant="ghost" size="sm" class="text-destructive" :disabled="busy !== null" data-testid="draft-delete" @click="askConfirm(order, 'delete')">
                  <Trash2 class="mr-1.5 h-4 w-4" />
                  Удалить
                </Button>
              </div>
            </div>
            <p class="text-xs text-muted-foreground">
              Скачайте таблицу или скопируйте текст, отправьте поставщику и нажмите «Заказано». Пока не нажато — новые товары этого поставщика добавляются сюда же.
            </p>
            <ul class="divide-y rounded-lg border">
              <li
                v-for="(line, i) in order.lines"
                :key="line.id ?? `d${i}`"
                class="flex items-center gap-3 p-2"
                data-testid="delivery-line"
                :data-product="line.productId ?? ''"
              >
                <img v-if="photoOf(line.productId)" :src="photoOf(line.productId)!" alt="" class="h-10 w-10 shrink-0 rounded object-cover" loading="lazy">
                <div v-else class="h-10 w-10 shrink-0 rounded bg-muted" />
                <div class="min-w-0 flex-1 text-sm">
                  <div class="line-clamp-2 font-medium">
                    {{ line.name }}
                  </div>
                  <div class="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span v-if="line.sku">{{ line.sku }}</span>
                    <span v-if="line.costPrice != null" class="tabular-nums">× {{ money(line.costPrice) }} = {{ money(line.costPrice * line.quantity) }}</span>
                    <span v-if="!line.productId">товар удалён</span>
                    <span v-else-if="isHidden(line)" class="text-amber-700 dark:text-amber-400" data-testid="line-hidden">
                      {{ line.showOnReceipt ? 'скрыт с сайта — появится после приёмки' : 'скрыт с сайта' }}
                    </span>
                  </div>
                </div>
                <Input
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="9999"
                  class="h-9 w-20 shrink-0 text-center tabular-nums"
                  :model-value="line.quantity"
                  :disabled="busy !== null"
                  :aria-label="`Сколько заказать: ${line.name}`"
                  data-testid="draft-qty"
                  @change="(e: Event) => onDraftQuantity(order, line, e)"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-9 w-9 shrink-0"
                  :disabled="busy !== null"
                  :aria-label="`Убрать из заказа: ${line.name}`"
                  data-testid="draft-remove"
                  @click="saveLine(order, line, 0)"
                >
                  <X class="h-4 w-4" />
                </Button>
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <!-- Ждём -->
      <section id="waiting" class="scroll-mt-20 space-y-3" data-testid="deliveries-waiting">
        <h2 class="text-lg font-semibold">
          Ждём поставку
        </h2>
        <p v-if="!waiting.length" class="text-sm text-muted-foreground">
          Открытых заказов нет.
        </p>
        <Card v-for="order in waiting" :key="order.id" data-testid="delivery-order" :data-number="order.number" :data-status="order.status">
          <CardContent class="space-y-3 px-4 md:px-6">
            <div class="flex flex-col justify-between gap-2 lg:flex-row lg:items-start">
              <div class="space-y-1 text-sm">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span class="font-medium">№{{ order.number }} · {{ supplierName(order.supplierId) }}</span>
                  <Badge :variant="STATUS_VARIANT[order.status]">
                    {{ ORDER_STATUS_LABEL[order.status] }}
                  </Badge>
                  <span class="text-muted-foreground">заказан {{ formatDay(order.orderedAt ?? order.createdAt) }}<template v-if="order.shippedAt"> · в пути с {{ formatDay(order.shippedAt) }}</template></span>
                </div>
                <div
                  class="flex items-center gap-1.5 font-medium"
                  :class="EXPECTED_CLASS[expectedState(order, today)!.kind]"
                  :data-kind="expectedState(order, today)!.kind"
                  data-testid="delivery-expected"
                >
                  <CalendarDays class="h-4 w-4" />
                  {{ expectedState(order, today)!.label }}
                </div>
                <div class="text-muted-foreground tabular-nums" data-testid="delivery-check">
                  {{ checkText(order) }}
                </div>
              </div>
              <div class="flex flex-wrap gap-2 lg:justify-end">
                <Button size="sm" :disabled="busy !== null" data-testid="order-receive" @click="receivingOrder = order">
                  <PackageCheck class="mr-1.5 h-4 w-4" />
                  Принять
                </Button>
                <Button v-if="data.ready" variant="outline" size="sm" :disabled="busy !== null" data-testid="order-expected" @click="openExpected(order)">
                  <CalendarDays class="mr-1.5 h-4 w-4" />
                  Дата
                </Button>
                <Button
                  v-if="order.status === 'ordered'"
                  variant="outline"
                  size="sm"
                  :disabled="busy !== null"
                  data-testid="order-shipped"
                  @click="setStatus(order, 'in_transit')"
                >
                  <Truck class="mr-1.5 h-4 w-4" />
                  В пути
                </Button>
                <Button
                  v-if="order.status === 'in_transit' && !orderSummary(order).receivedUnits"
                  variant="ghost"
                  size="sm"
                  title="«В пути» нажали по ошибке"
                  :disabled="busy !== null"
                  @click="setStatus(order, 'ordered')"
                >
                  <Undo2 class="mr-1.5 h-4 w-4" />
                  Не в пути
                </Button>
                <Button variant="ghost" size="sm" data-testid="order-copy" @click="copyText(order)">
                  <Copy class="mr-1.5 h-4 w-4" />
                  Текст
                </Button>
                <Button variant="ghost" size="sm" :disabled="sheetBusy !== null" data-testid="order-sheet" @click="downloadSheet(order)">
                  <FileSpreadsheet class="mr-1.5 h-4 w-4" />
                  Таблица
                </Button>
                <Button v-if="orderSummary(order).receivedUnits" variant="ghost" size="sm" :disabled="busy !== null" data-testid="order-close" @click="askConfirm(order, 'received')">
                  <Check class="mr-1.5 h-4 w-4" />
                  Закрыть
                </Button>
                <Button v-else variant="ghost" size="sm" class="text-destructive" :disabled="busy !== null" data-testid="order-cancel" @click="askConfirm(order, 'cancelled')">
                  <Ban class="mr-1.5 h-4 w-4" />
                  Отменить
                </Button>
              </div>
            </div>

            <!-- Сверка по строкам -->
            <div class="overflow-hidden rounded-lg border">
              <div class="hidden grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_5.5rem_9rem] gap-2 bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground md:grid">
                <span>Товар</span>
                <span class="text-right">Заказано</span>
                <span class="text-right">Пришло</span>
                <span class="text-right">Не пришло</span>
                <span>Сверка</span>
              </div>
              <ul class="divide-y">
                <li
                  v-for="(line, i) in order.lines"
                  :key="line.id ?? line.productId ?? `d${i}`"
                  class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2 text-sm md:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_5.5rem_9rem]"
                  data-testid="delivery-line"
                  :data-product="line.productId ?? ''"
                  :data-state="lineState(order, line).kind"
                >
                  <div class="flex min-w-0 items-center gap-2">
                    <img v-if="photoOf(line.productId)" :src="photoOf(line.productId)!" alt="" class="h-9 w-9 shrink-0 rounded object-cover" loading="lazy">
                    <div v-else class="h-9 w-9 shrink-0 rounded bg-muted" />
                    <div class="min-w-0">
                      <div class="line-clamp-2">
                        {{ line.name }}
                      </div>
                      <div class="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span v-if="line.sku">{{ line.sku }}</span>
                        <span v-if="!line.productId">товар удалён</span>
                        <span v-else-if="isHidden(line)" class="text-amber-700 dark:text-amber-400" data-testid="line-hidden">
                          {{ line.showOnReceipt ? 'скрыт с сайта — появится после приёмки' : 'скрыт с сайта' }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span class="text-right tabular-nums md:block" data-testid="line-ordered"><span class="text-xs text-muted-foreground md:hidden">заказано </span>{{ lineCheck(line).ordered }}</span>
                  <span class="col-start-1 text-xs text-muted-foreground tabular-nums md:col-start-auto md:text-right md:text-sm md:text-foreground" data-testid="line-received"><span class="md:hidden">пришло </span>{{ lineCheck(line).received }}</span>
                  <span class="hidden text-right tabular-nums md:block" data-testid="line-missing">{{ lineCheck(line).missing || '—' }}</span>
                  <span class="justify-self-end md:justify-self-start">
                    <span class="inline-block rounded-full px-2 py-0.5 text-xs font-medium" :class="LINE_CLASS[lineState(order, line).kind]" data-testid="line-state">
                      {{ lineState(order, line).text }}
                    </span>
                  </span>
                </li>
              </ul>
            </div>
            <p v-if="receiptsByOrder.get(order.id)?.length" class="text-xs text-muted-foreground" data-testid="delivery-receipts">
              Приёмки:
              <template v-for="(r, k) in receiptsByOrder.get(order.id)" :key="r.at">
                {{ k ? '; ' : '' }}{{ formatMoment(r.at) }} — {{ r.units }} шт. ({{ count(r.positions, 'позиция', 'позиции', 'позиций') }})
              </template>
            </p>
          </CardContent>
        </Card>
      </section>

      <!-- Закрытые -->
      <section id="closed" class="scroll-mt-20 space-y-3" data-testid="deliveries-closed">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">
            Закрытые за 60 дней
          </h2>
          <Button v-if="closed.length" variant="ghost" size="sm" data-testid="closed-toggle" @click="showClosed = !showClosed">
            {{ showClosed ? 'Свернуть' : `Показать (${closed.length})` }}
          </Button>
        </div>
        <p v-if="!closed.length" class="text-sm text-muted-foreground">
          Закрытых нет.
        </p>
        <template v-if="showClosed">
          <Card v-for="order in closed" :key="order.id" data-testid="delivery-order" :data-number="order.number" :data-status="order.status">
            <CardContent class="space-y-2 px-4 md:px-6">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span class="font-medium">№{{ order.number }} · {{ supplierName(order.supplierId) }}</span>
                <Badge :variant="STATUS_VARIANT[order.status]">
                  {{ ORDER_STATUS_LABEL[order.status] }}
                </Badge>
                <span class="text-muted-foreground">заказан {{ formatDay(order.orderedAt ?? order.createdAt) }}<template v-if="order.closedAt"> · {{ order.status === 'cancelled' ? 'отменён' : 'закрыт' }} {{ formatDay(order.closedAt) }}</template></span>
              </div>
              <div v-if="order.status === 'received'" class="text-sm text-muted-foreground tabular-nums" data-testid="delivery-check">
                {{ checkText(order) }}
              </div>
              <p v-if="order.status === 'cancelled' && hiddenWaiting(order)" class="text-xs text-amber-700 dark:text-amber-400">
                {{ count(hiddenWaiting(order), 'новый товар', 'новых товара', 'новых товаров') }} из него так и не пришли и скрыты с сайта.
              </p>
              <ul class="divide-y rounded-lg border">
                <li
                  v-for="(line, i) in order.lines"
                  :key="line.id ?? line.productId ?? `d${i}`"
                  class="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
                  data-testid="delivery-line"
                  :data-product="line.productId ?? ''"
                  :data-state="lineState(order, line).kind"
                >
                  <span class="min-w-0 flex-1 truncate">{{ line.name }}<template v-if="!line.productId"> (товар удалён)</template></span>
                  <span class="shrink-0 text-xs text-muted-foreground tabular-nums">{{ lineCheck(line).received }} из {{ lineCheck(line).ordered }}</span>
                  <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" :class="LINE_CLASS[lineState(order, line).kind]" data-testid="line-state">
                    {{ lineState(order, line).text }}
                  </span>
                </li>
              </ul>
              <p v-if="receiptsByOrder.get(order.id)?.length" class="text-xs text-muted-foreground" data-testid="delivery-receipts">
                Приёмки:
                <template v-for="(r, k) in receiptsByOrder.get(order.id)" :key="r.at">
                  {{ k ? '; ' : '' }}{{ formatMoment(r.at) }} — {{ r.units }} шт. ({{ count(r.positions, 'позиция', 'позиции', 'позиций') }})
                </template>
              </p>
            </CardContent>
          </Card>
        </template>
      </section>
    </template>

    <!-- Приёмка — то же окно, что в «К закупке» -->
    <ReceiveOrderDialog v-model:order="receivingOrder" :products="productMap" @received="load" />

    <!-- «Заказано» / дата поставки -->
    <Dialog v-model:open="dateOpen">
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle>{{ dating?.place ? `Заказ №${dating.order.number} — заказано` : `Дата поставки — заказ №${dating?.order.number}` }}</DialogTitle>
          <DialogDescription>
            {{ dating?.place
              ? `Заказ уходит поставщику «${supplierName(dating.order.supplierId)}». Когда примерно ждать поставку?`
              : 'Когда примерно ждать поставку? Пустая дата — не указана.' }}
          </DialogDescription>
        </DialogHeader>
        <form v-if="dating" class="space-y-4" data-testid="date-dialog" @submit.prevent="submitDate">
          <div class="flex items-center gap-2">
            <Input v-model="dateValue" type="date" :min="today" :max="maxDay" class="h-10 w-44" aria-label="Примерная дата поставки" data-testid="date-input" />
            <span v-if="dateHint" class="text-sm text-muted-foreground" data-testid="date-hint">
              {{ dateHint }}
            </span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="dating = null">
              Отмена
            </Button>
            <Button type="submit" :disabled="busy !== null || (Boolean(dateValue) && (dateValue < today || dateValue > maxDay))" data-testid="date-submit">
              {{ dating.place ? 'Заказано' : 'Сохранить' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- Отменить / закрыть / удалить -->
    <AlertDialog v-model:open="confirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ confirming?.action === 'delete' ? 'Удалить' : confirming?.action === 'cancelled' ? 'Отменить' : 'Закрыть' }} заказ №{{ confirming?.order.number }}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            <template v-if="confirming?.action === 'delete'">
              Заказ ещё не отправлен — он просто исчезнет.
            </template>
            <template v-else-if="confirming?.action === 'cancelled'">
              Поставщик ничего не привёз — заказ закроется без приёмки.
            </template>
            <template v-else>
              Остального не будет — заказ закроется с тем, что уже принято.
            </template>
            <template v-if="confirming && hiddenWaiting(confirming.order)">
              {{ count(hiddenWaiting(confirming.order), 'новый товар', 'новых товара', 'новых товаров') }} из него так и останутся скрытыми с сайта — показать их можно в карточке товара.
            </template>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Назад</AlertDialogCancel>
          <AlertDialogAction data-testid="confirm-order-action" @click="confirmAction">
            {{ confirming?.action === 'delete' ? 'Удалить' : confirming?.action === 'cancelled' ? 'Отменить заказ' : 'Закрыть заказ' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
