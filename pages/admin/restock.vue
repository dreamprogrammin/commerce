<script setup lang="ts">
import type { Database } from '@/types'
import type { DraftRow, OrderTotals, RestockItem } from '@/utils/restockOrder'
import type { OrderMoney, SupplierOrder, SupplierOrderStatus } from '@/utils/supplierOrders'
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileSpreadsheet,
  FileText,
  Link,
  MessageCircle,
  Package,
  PackageCheck,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Truck,
  Undo2,
  User,
  X,
} from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { jpegForSheet, saveOrderFile } from '@/composables/useOrderSheetFile'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useAdminRestockStore } from '@/stores/adminStore/adminRestockStore'
import { useAdminRevalidateStore } from '@/stores/adminStore/adminRevalidateStore'
import { buildOrderWorkbook, groupOrderLines, orderFileName } from '@/utils/orderSheet'
import { draftRows, needsRestock, orderText, orderTotals, plural, pluralPositions, whatsappUrl } from '@/utils/restockOrder'
import { isOpenOrder, ORDER_STATUS_LABEL, orderMoney, orderSheetLines, orderSummary, receiveDefaults, receiveMoney, receivePlan, remaining, salePriceOf, savedOrderMoney, supplierOrderText } from '@/utils/supplierOrders'

definePageMeta({ layout: 'admin' })

const supabase = useSupabaseClient<Database>()
const { getVariantUrl } = useSupabaseStorage()

/*
 * Заказы поставщикам (30.10.2026, владелец: «заказы должны собираться по
 * поставщику», «смотрим спрос не только по корзинам»). Каждый поставщик —
 * черновик заказа: товары на пороге попадают сами, любые другие его товары —
 * кнопкой. Данные — `/api/admin/restock` (server/utils/adminRestock.ts).
 *
 * Шаг 2 (31.10.2026): «Заказал» сохраняет черновик в базу заказом поставщику;
 * у заказа — «В пути», «Принять» (остаток прибавляется, ждавшие получают
 * «Товар снова в наличии»), «Отменить». Заказанное и не пришедшее товар в
 * новый заказ не возвращает (`needsRestock` с `pending`).
 */
interface RestockSupplier {
  id: string
  name: string
  contact: string | null
  phone: string | null
  address: string | null
}

interface RestockProduct extends RestockItem {
  slug: string | null
  imageUrl: string | null
  price: number
  supplierId: string | null
  sold30: number
  sold90: number
  cartCustomers: number
  cartUnits: number
  alerts: number
  wishlist: number
  pending: number
}

const suppliers = ref<RestockSupplier[]>([])
const products = ref<RestockProduct[]>([])
const orders = ref<SupplierOrder[]>([])
/** false — миграция заказов на базе ещё не применена: страница работает как в шаге 1 */
const ordersReady = ref(true)
const isLoading = ref(true)

async function fetchRestock() {
  isLoading.value = true
  try {
    const data = await adminFetch<{ suppliers: RestockSupplier[], products: RestockProduct[], orders: SupplierOrder[] | null }>('/api/admin/restock')
    suppliers.value = data.suppliers
    products.value = data.products
    orders.value = data.orders ?? []
    ordersReady.value = data.orders !== null
  }
  catch (error: any) {
    toast.error('Ошибка загрузки списка закупок', { description: error.data?.message || error.message })
  }
  finally {
    isLoading.value = false
  }
}

/*
 * Спрос из корзин (31.10.2026, просьба владельца: «знать, что клиенты кладут
 * в корзину … а потом к закупке»). Корзины только вошедших покупателей —
 * у гостей она живёт в браузере. Красным — чего не хватит на все корзины.
 */
interface CartDemandRow {
  productId: string
  name: string
  slug: string | null
  price: number
  stock: number
  quantity: number
  customers: { id: string | null, guest: boolean, name: string | null, quantity: number, updatedAt: string }[]
}
const cartDemand = ref<CartDemandRow[]>([])
const isLoadingDemand = ref(true)

async function fetchCartDemand() {
  isLoadingDemand.value = true
  try {
    cartDemand.value = await adminFetch<CartDemandRow[]>('/api/admin/cart-demand')
  }
  catch (error: any) {
    toast.error('Не удалось загрузить корзины', { description: error.message })
  }
  finally {
    isLoadingDemand.value = false
  }
}

function refreshAll() {
  fetchRestock()
  fetchCartDemand()
}

onMounted(refreshAll)

const restockStore = useAdminRestockStore()
const { drafts } = storeToRefs(restockStore)

const NO_SUPPLIER = 'none'

interface SupplierBlock {
  key: string
  supplier: RestockSupplier | null
  /** Открытые заказы поставщику — заказаны или в пути */
  orders: SupplierOrder[]
  /** Закрытые за 30 дней — принятые и отменённые */
  closed: SupplierOrder[]
  rows: DraftRow<RestockProduct>[]
  /** Товары поставщика, которых ещё нет в заказе, — для «Добавить товар» */
  addable: RestockProduct[]
  autoCount: number
  edited: boolean
  order: { totals: OrderTotals, money: OrderMoney, text: string, whatsapp: string | null }
}

/** Деньги черновика: закупка — карточка товара, отпуск — цена на сайте со скидкой */
function draftMoney(rows: DraftRow<RestockProduct>[]): OrderMoney {
  return orderMoney(rows.map(r => ({ quantity: r.quantity, costPrice: r.item.costPrice, salePrice: r.item.price > 0 ? r.item.price : null })))
}

const blocks = computed<SupplierBlock[]>(() => {
  const bySupplier = new Map<string, RestockProduct[]>()
  for (const product of products.value) {
    const key = product.supplierId ?? NO_SUPPLIER
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), product])
  }
  const ordersBySupplier = new Map<string, SupplierOrder[]>()
  for (const order of orders.value)
    ordersBySupplier.set(order.supplierId, [...(ordersBySupplier.get(order.supplierId) ?? []), order])
  const result: SupplierBlock[] = []
  for (const supplier of suppliers.value) {
    const items = bySupplier.get(supplier.id) ?? []
    const supplierOrders = ordersBySupplier.get(supplier.id) ?? []
    if (!items.length && !supplierOrders.length)
      continue
    const edits = drafts.value[supplier.id] ?? {}
    const rows = draftRows(items, edits)
    const inOrder = new Set(rows.map(r => r.item.id))
    const text = orderText(rows, new Date())
    result.push({
      key: supplier.id,
      supplier,
      orders: supplierOrders.filter(isOpenOrder),
      closed: supplierOrders.filter(o => !isOpenOrder(o)),
      rows,
      addable: items.filter(p => !inOrder.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      autoCount: rows.filter(r => !r.manual).length,
      edited: Object.keys(edits).some(id => items.some(p => p.id === id)),
      order: { totals: orderTotals(rows), money: draftMoney(rows), text, whatsapp: whatsappUrl(supplier.phone, text) },
    })
  }
  result.sort((a, b) => Number(b.autoCount > 0) - Number(a.autoCount > 0)
    || Number(b.orders.length > 0) - Number(a.orders.length > 0)
    || a.supplier!.name.localeCompare(b.supplier!.name, 'ru'))

  // Без поставщика заказать нельзя — только назначить
  const orphans = draftRows(bySupplier.get(NO_SUPPLIER) ?? [])
  if (orphans.length) {
    result.push({
      key: NO_SUPPLIER,
      supplier: null,
      orders: [],
      closed: [],
      rows: orphans,
      addable: [],
      autoCount: orphans.length,
      edited: false,
      order: { totals: orderTotals([]), money: draftMoney([]), text: '', whatsapp: null },
    })
  }
  return result
})

const totalToRestock = computed(() => blocks.value.reduce((sum, b) => sum + b.autoCount, 0))

// Свёрнутость: по умолчанию раскрыт поставщик, у которого есть что заказывать
const toggled = ref<Record<string, boolean>>({})
function isExpanded(block: SupplierBlock): boolean {
  return toggled.value[block.key] ?? (block.autoCount > 0 || block.edited || block.orders.length > 0)
}
function toggleBlock(block: SupplierBlock) {
  toggled.value = { ...toggled.value, [block.key]: !isExpanded(block) }
}

function setQuantity(block: SupplierBlock, row: DraftRow<RestockProduct>, quantity: number) {
  // Совпало с правилом — правка не нужна; вручную добавленный с нулём — убран
  if ((!row.manual && quantity === row.item.restockQty) || (row.manual && quantity === 0))
    restockStore.setQuantity(block.key, row.item.id, null)
  else
    restockStore.setQuantity(block.key, row.item.id, quantity)
}

function onQuantityChange(block: SupplierBlock, row: DraftRow<RestockProduct>, event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number.parseInt(input.value, 10)
  // Стёртое или не число — вернуть в поле то, что в заказе
  if (Number.isNaN(value)) {
    input.value = String(row.quantity)
    return
  }
  setQuantity(block, row, Math.min(Math.max(value, 0), 999))
}

const addOpenFor = ref<string | null>(null)

function addToOrder(block: SupplierBlock, product: RestockProduct) {
  restockStore.setQuantity(block.key, product.id, product.restockQty)
  addOpenFor.value = null
}

const textShownFor = ref<string | null>(null)

async function copyOrder(block: SupplierBlock) {
  try {
    await navigator.clipboard.writeText(block.order.text)
    toast.success('Заказ скопирован', { description: block.supplier?.name })
  }
  catch {
    toast.error('Не удалось скопировать — откройте «Текст заказа» и выделите его')
  }
}

// ── Заказы поставщикам (шаг 2) ──────────────────────────────────────────────
const revalidateStore = useAdminRevalidateStore()
const productsById = computed(() => new Map(products.value.map(p => [p.id, p])))
const busy = ref<string | null>(null)

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit' }).format(new Date(iso))
}

const STATUS_VARIANT: Record<SupplierOrderStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  ordered: 'secondary',
  in_transit: 'default',
  received: 'outline',
  cancelled: 'outline',
}

/** «Заказал»: черновик уходит в базу заказом, браузерный черновик сбрасывается. */
async function placeOrder(block: SupplierBlock) {
  const items = block.rows.filter(r => r.quantity > 0).map(r => ({ productId: r.item.id, quantity: r.quantity }))
  if (!block.supplier || !items.length)
    return
  busy.value = `place:${block.key}`
  try {
    const saved = await adminFetch<{ number: number }>('/api/admin/restock/orders', {
      method: 'POST',
      body: { supplierId: block.supplier.id, items },
    })
    restockStore.reset(block.key)
    toast.success(`Заказ №${saved.number} сохранён`, { description: `${block.supplier.name} — товары из него больше не просятся в заказ` })
    await fetchRestock()
  }
  catch (error: any) {
    toast.error('Не удалось сохранить заказ', { description: error.data?.message || error.message })
  }
  finally {
    busy.value = null
  }
}

async function setOrderStatus(order: SupplierOrder, status: SupplierOrderStatus) {
  busy.value = `status:${order.id}`
  try {
    await adminFetch(`/api/admin/restock/orders/${order.id}/status`, { method: 'POST', body: { status } })
    toast.success(`Заказ №${order.number}: ${ORDER_STATUS_LABEL[status].toLowerCase()}`)
    await fetchRestock()
  }
  catch (error: any) {
    toast.error('Не удалось изменить заказ', { description: error.data?.message || error.message })
  }
  finally {
    busy.value = null
  }
}

async function copySavedOrder(order: SupplierOrder) {
  try {
    await navigator.clipboard.writeText(supplierOrderText(order))
    toast.success(`Текст заказа №${order.number} скопирован`)
  }
  catch {
    toast.error('Не удалось скопировать')
  }
}

// Отменить и закрыть — необратимо, поэтому через подтверждение. Открыто ли
// окно и что подтверждаем — разные состояния: кнопка AlertDialogAction сама
// закрывает окно раньше своего @click, и общий ref обнулялся бы до действия
const confirming = ref<{ order: SupplierOrder, status: 'cancelled' | 'received' } | null>(null)
const confirmOpen = ref(false)

function askConfirm(order: SupplierOrder, status: 'cancelled' | 'received') {
  confirming.value = { order, status }
  confirmOpen.value = true
}

function confirmStatus() {
  const target = confirming.value
  confirmOpen.value = false
  if (target)
    setOrderStatus(target.order, target.status)
}

// Приёмка: сколько пришло по каждой строке; по умолчанию — всё, что ждём
// Таблица Excel для поставщика: фото, артикул, его цена, количество (6.11.2026)
const sheetBusy = ref<string | null>(null)
function photoOf(productId: string | null): string | null {
  const product = productId ? productsById.value.get(productId) : undefined
  return product?.imageUrl ? getVariantUrl(BUCKET_NAME_PRODUCT, product.imageUrl, 'sm') || null : null
}
async function downloadSheet(key: string, supplier: string, lines: Parameters<typeof orderSheetLines>[1], number?: number) {
  if (sheetBusy.value)
    return
  sheetBusy.value = key
  const id = toast.loading('Собираю таблицу с фото…')
  try {
    const groups = groupOrderLines(orderSheetLines(supplier, lines)).map(g => ({ ...g, number }))
    const now = new Date()
    saveOrderFile(await buildOrderWorkbook(groups, now, jpegForSheet), orderFileName(now, supplier, number))
    toast.success('Таблица скачана', { id, description: 'Её можно отправить поставщику — цен продажи в ней нет' })
  }
  catch {
    toast.error('Не удалось собрать таблицу', { id })
  }
  finally {
    sheetBusy.value = null
  }
}
function downloadDraftSheet(block: SupplierBlock) {
  downloadSheet(`draft:${block.key}`, block.supplier!.name, block.rows.map(r => ({ name: r.item.name, sku: r.item.sku, costPrice: r.item.costPrice, quantity: r.quantity, photoUrl: photoOf(r.item.id) })))
}
function downloadSavedSheet(block: SupplierBlock, order: SupplierOrder) {
  downloadSheet(`order:${order.id}`, block.supplier!.name, order.lines.map(l => ({ name: l.name, sku: l.sku, costPrice: l.costPrice, quantity: l.quantity, photoUrl: photoOf(l.productId) })), order.number)
}
const money = (n: number) => `${formatPrice(n)}\u00A0₸`

const receiving = reactive({ order: null as SupplierOrder | null, quantities: {} as Record<string, number>, close: false, saving: false })
const receiveOpen = computed({
  get: () => receiving.order !== null,
  set: (open: boolean) => {
    if (!open)
      receiving.order = null
  },
})
const receivePreview = computed(() => receiving.order
  ? receivePlan(receiving.order, receiving.quantities, productsById.value)
  : { units: 0, notified: 0, short: false })
const receiveSum = computed(() => receiving.order ? receiveMoney(receiving.order, receiving.quantities, productsById.value) : null)

/** Сколько человек ждут товар, которого сейчас 0, — если его принимают, им придёт уведомление. */
function waitingFor(productId: string | null): number {
  const product = productId ? productsById.value.get(productId) : undefined
  if (!product || product.stock !== 0 || !(receiving.quantities[product.id] > 0))
    return 0
  return product.alerts
}

function openReceive(order: SupplierOrder) {
  Object.assign(receiving, { order, quantities: receiveDefaults(order), close: false, saving: false })
}

function onReceiveQuantity(productId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number.parseInt(input.value, 10)
  receiving.quantities = { ...receiving.quantities, [productId]: Number.isNaN(value) ? 0 : Math.min(Math.max(value, 0), 9999) }
  input.value = String(receiving.quantities[productId])
}

async function submitReceive() {
  const order = receiving.order
  if (!order)
    return
  receiving.saving = true
  try {
    const result = await adminFetch<{ status: SupplierOrderStatus, units: number, notified: number, received: { product_id: string }[] }>(
      `/api/admin/restock/orders/${order.id}/receive`,
      {
        method: 'POST',
        body: {
          items: Object.entries(receiving.quantities).map(([productId, quantity]) => ({ productId, quantity })),
          close: receivePreview.value.short && receiving.close,
        },
      },
    )
    receiving.order = null
    // Кеш карточек сразу: уведомление «снова в наличии» ведёт на карточку,
    // а закешированная на сутки страница показала бы «нет в наличии»
    const productIds = result.received.map(r => r.product_id)
    if (productIds.length) {
      revalidateStore.enqueue({ productIds })
      revalidateStore.flushNow()
    }
    toast.success(`Принято ${result.units} шт. по заказу №${order.number}`, {
      description: [
        result.status === 'received' ? 'Заказ закрыт' : 'Заказ открыт — ждём остальное',
        result.notified ? `«Товар снова в наличии» ушло ${result.notified} ${plural(result.notified, 'покупателю', 'покупателям', 'покупателям')}` : '',
      ].filter(Boolean).join('. '),
    })
    await fetchRestock()
  }
  catch (error: any) {
    toast.error('Не удалось принять', { description: error.data?.message || error.message })
  }
  finally {
    receiving.saving = false
  }
}

// Правило товара: при каком остатке заказывать и сколько брать. Строка
// товара есть и в таблице, и в мобильном списке — окно открывается у той,
// где нажали (`place`), иначе открылись бы оба.
const rule = reactive({ productId: null as string | null, place: '', minStock: 0, restockQty: 1, saving: false })

function isRuleOpen(product: RestockProduct, place: string): boolean {
  return rule.productId === product.id && rule.place === place
}

function openRule(product: RestockProduct, place: string, open: boolean) {
  if (!open) {
    rule.productId = null
    return
  }
  Object.assign(rule, { productId: product.id, place, minStock: product.minStock, restockQty: product.restockQty, saving: false })
}

async function saveRule(product: RestockProduct) {
  rule.saving = true
  try {
    const saved = await adminFetch<{ minStock: number, restockQty: number }>('/api/admin/restock/rule', {
      method: 'PUT',
      body: { productId: product.id, minStock: Number(rule.minStock), restockQty: Number(rule.restockQty) },
    })
    product.minStock = saved.minStock
    product.restockQty = saved.restockQty
    rule.productId = null
    toast.success('Правило сохранено', {
      description: needsRestock(product) ? product.name : `${product.name} — пока не к закупке`,
    })
  }
  catch (error: any) {
    toast.error('Не удалось сохранить правило', { description: error.data?.message || error.message })
  }
  finally {
    rule.saving = false
  }
}

function getProductImage(imageUrl: string | null): string | undefined {
  if (!imageUrl)
    return undefined
  return getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'sm') || undefined
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value))
}

// Назначение поставщика товару прямо со страницы закупок
const assigningProductId = ref<string | null>(null)

async function assignSupplier(productId: string, supplierId: string) {
  assigningProductId.value = productId
  try {
    const { error } = await supabase
      .from('products')
      .update({ supplier_id: supplierId } as any)
      .eq('id', productId)
    if (error)
      throw error

    toast.success('Поставщик назначен')
    await fetchRestock()
  }
  catch (error: any) {
    toast.error('Ошибка назначения поставщика', { description: error.message })
  }
  finally {
    assigningProductId.value = null
  }
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8 space-y-6">
    <!-- Заголовок -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
          К закупке
        </h1>
        <p class="text-sm text-muted-foreground mt-1 max-w-2xl">
          Заказы поставщикам. Товары, дошедшие до порога, попадают в заказ сами, любые другие товары
          поставщика — кнопкой «Добавить товар». Новый заказ собирается в этом браузере; «Заказал» сохраняет
          его для всех, «Принять» пополняет остаток, когда товар пришёл.
        </p>
        <p v-if="!isLoading && !ordersReady" class="text-xs text-amber-700 dark:text-amber-400 mt-1" data-testid="orders-not-ready">
          Сохранение заказов и приёмка заработают после применения миграции заказов поставщикам.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <Badge v-if="!isLoading && totalToRestock > 0" variant="destructive" class="text-sm px-3 py-1">
          {{ totalToRestock }} {{ plural(totalToRestock, 'товар', 'товара', 'товаров') }} на пороге
        </Badge>
        <Button variant="outline" size="sm" :disabled="isLoading" @click="refreshAll">
          <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': isLoading }" />
          Обновить
        </Button>
      </div>
    </div>

    <!-- Спрос из корзин -->
    <Card v-if="!isLoadingDemand">
      <CardHeader class="px-4 md:px-6">
        <CardTitle class="text-base flex items-center gap-2">
          <ShoppingCart class="w-4 h-4" />
          В корзинах у покупателей
        </CardTitle>
        <CardDescription>
          Положили, но ещё не оформили — и вошедшие покупатели, и гости (без имени, за 30 дней).
        </CardDescription>
      </CardHeader>
      <CardContent class="px-4 md:px-6">
        <p v-if="!cartDemand.length" class="text-sm text-muted-foreground">
          Сейчас ни у кого нет товаров в корзине
        </p>
        <div v-else class="divide-y">
          <div
            v-for="row in cartDemand"
            :key="row.productId"
            class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2 text-sm"
          >
            <div class="min-w-0 flex-1">
              <NuxtLink v-if="row.slug" :to="`/catalog/products/${row.slug}`" target="_blank" class="font-medium hover:underline">
                {{ row.name }}
              </NuxtLink>
              <span v-else class="font-medium">{{ row.name }}</span>
              <div class="text-xs text-muted-foreground">
                <template v-for="(c, i) in row.customers" :key="c.id ?? `g${i}`">
                  <span v-if="i">, </span>
                  <span v-if="c.guest">гость</span>
                  <NuxtLink v-else :to="`/admin/users/${c.id}`" class="hover:underline">
                    {{ c.name || 'Без имени' }}
                  </NuxtLink>
                  <span v-if="c.quantity > 1"> ({{ c.quantity }} шт.)</span>
                </template>
              </div>
            </div>
            <div class="shrink-0 text-right tabular-nums whitespace-nowrap">
              <div>в корзинах {{ row.quantity }} шт.</div>
              <div class="text-xs" :class="row.stock < row.quantity ? 'text-destructive font-medium' : 'text-muted-foreground'">
                на складе {{ row.stock }}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Скелетон -->
    <template v-if="isLoading">
      <Card v-for="i in 3" :key="i">
        <CardHeader>
          <Skeleton class="h-6 w-64" />
          <Skeleton class="h-4 w-40 mt-1" />
        </CardHeader>
        <CardContent class="space-y-3">
          <div v-for="j in 3" :key="j" class="flex items-center gap-3">
            <Skeleton class="w-10 h-10 rounded-md" />
            <div class="flex-1 space-y-1">
              <Skeleton class="h-4 w-48" />
              <Skeleton class="h-3 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <!-- Пусто -->
    <Card v-else-if="blocks.length === 0">
      <CardContent class="py-16 text-center">
        <div class="flex flex-col items-center gap-3 text-muted-foreground">
          <ShoppingCart class="w-12 h-12 opacity-40" />
          <p class="text-lg font-medium">
            Нет поставщиков с товарами
          </p>
          <p class="text-sm">
            Назначьте товарам поставщиков в карточке товара
          </p>
        </div>
      </CardContent>
    </Card>

    <template v-else>
      <p class="text-xs text-muted-foreground -mb-2">
        Продано — заказы сайта и кассы за 30 и 90 дней, без отменённых и возвратов. Ждут — подписаны на
        «Сообщить о поступлении». Правило — при каком остатке товар попадает в заказ и сколько брать.
      </p>

      <!-- Поставщики -->
      <Card
        v-for="block in blocks"
        :key="block.key"
        class="overflow-hidden"
        data-testid="supplier-block"
        :data-supplier="block.supplier?.name ?? 'none'"
      >
        <!-- Заголовок поставщика -->
        <CardHeader
          class="cursor-pointer hover:bg-muted/50 transition-colors px-4 md:px-6"
          @click="toggleBlock(block)"
        >
          <!-- min-w-0: CardHeader — сетка, и без него строка не уже названия —
               длинное имя поставщика выталкивало бейджи за край карточки -->
          <div class="flex items-center justify-between gap-2 min-w-0">
            <div class="flex items-center gap-3 min-w-0">
              <div
                class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                :class="block.supplier ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
              >
                <User class="w-5 h-5" />
              </div>
              <div class="min-w-0">
                <CardTitle class="text-base truncate">
                  {{ block.supplier?.name ?? 'Без поставщика' }}
                </CardTitle>
                <p v-if="block.supplier?.contact" class="text-sm text-muted-foreground truncate">
                  {{ block.supplier.contact }}
                </p>
                <p v-else-if="!block.supplier" class="text-sm text-muted-foreground">
                  Назначьте поставщика — тогда товар попадёт в его заказ
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <Badge v-if="block.orders.length" variant="secondary" data-testid="open-orders-badge">
                {{ block.orders.length }} {{ plural(block.orders.length, 'заказ', 'заказа', 'заказов') }}
              </Badge>
              <Badge :variant="block.autoCount ? 'destructive' : 'outline'">
                на пороге {{ block.autoCount }}
              </Badge>
              <ChevronUp v-if="isExpanded(block)" class="w-5 h-5 text-muted-foreground" />
              <ChevronDown v-else class="w-5 h-5 text-muted-foreground" />
            </div>
          </div>

          <!-- Телефон — большая кнопка на мобилке -->
          <a
            v-if="block.supplier?.phone"
            :href="`tel:${block.supplier.phone}`"
            class="flex items-center justify-center gap-2 mt-3 py-2.5 px-4 rounded-lg border bg-primary/5 text-primary font-medium text-sm md:inline-flex md:w-auto md:mt-2 md:py-1.5 md:text-xs"
            @click.stop
          >
            <Phone class="w-4 h-4" />
            {{ block.supplier.phone }}
          </a>

          <!-- Адрес (десктоп) -->
          <p
            v-if="block.supplier?.address"
            class="text-xs text-muted-foreground mt-1 hidden md:block"
          >
            {{ block.supplier.address }}
          </p>
        </CardHeader>

        <CardContent v-if="isExpanded(block)" class="pt-0 px-4 md:px-6 space-y-4">
          <!-- Заказы поставщику: заказаны или в пути -->
          <div v-if="block.orders.length" class="space-y-2" data-testid="supplier-orders">
            <div
              v-for="order in block.orders"
              :key="order.id"
              class="rounded-lg border p-3 space-y-2"
              data-testid="supplier-order"
              :data-number="order.number"
              :data-status="order.status"
            >
              <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span class="font-medium">Заказ №{{ order.number }}</span>
                  <Badge :variant="STATUS_VARIANT[order.status]">
                    {{ ORDER_STATUS_LABEL[order.status] }}
                  </Badge>
                  <span class="text-muted-foreground">от {{ formatDay(order.createdAt) }}<template v-if="order.shippedAt"> · в пути с {{ formatDay(order.shippedAt) }}</template></span>
                  <span class="text-muted-foreground tabular-nums">· {{ orderSummary(order).positions }} {{ pluralPositions(orderSummary(order).positions) }}, {{ orderSummary(order).units }} шт.<template v-if="orderSummary(order).receivedUnits"> · принято {{ orderSummary(order).receivedUnits }}</template></span>
                  <span class="basis-full text-xs text-muted-foreground tabular-nums" data-testid="order-saved-money">
                    закупка {{ money(savedOrderMoney(order, productsById).cost) }} · в продаже {{ money(savedOrderMoney(order, productsById).sale) }}<template v-if="savedOrderMoney(order, productsById).margin != null">
                      · наценка {{ money(savedOrderMoney(order, productsById).margin!) }}</template><template v-if="orderSummary(order).receivedUnits">
                      · принято на {{ money(savedOrderMoney(order, productsById, 'received').cost) }}</template>
                  </span>
                </div>
                <div class="flex flex-wrap gap-2">
                  <Button
                    v-if="order.status === 'ordered'"
                    variant="outline"
                    size="sm"
                    :disabled="busy === `status:${order.id}`"
                    data-testid="order-shipped"
                    @click="setOrderStatus(order, 'in_transit')"
                  >
                    <Truck class="w-4 h-4 mr-1.5" />
                    В пути
                  </Button>
                  <Button size="sm" data-testid="order-receive" @click="openReceive(order)">
                    <PackageCheck class="w-4 h-4 mr-1.5" />
                    Принять
                  </Button>
                  <Button variant="ghost" size="sm" data-testid="order-saved-copy" @click="copySavedOrder(order)">
                    <Copy class="w-4 h-4 mr-1.5" />
                    Текст
                  </Button>
                  <Button variant="ghost" size="sm" :disabled="sheetBusy !== null" data-testid="order-saved-sheet" @click="downloadSavedSheet(block, order)">
                    <FileSpreadsheet class="w-4 h-4 mr-1.5" />
                    Таблица
                  </Button>
                  <Button
                    v-if="order.status === 'in_transit' && !orderSummary(order).receivedUnits"
                    variant="ghost"
                    size="sm"
                    title="«В пути» нажали по ошибке"
                    :disabled="busy === `status:${order.id}`"
                    @click="setOrderStatus(order, 'ordered')"
                  >
                    <Undo2 class="w-4 h-4 mr-1.5" />
                    Не в пути
                  </Button>
                  <Button
                    v-if="orderSummary(order).receivedUnits"
                    variant="ghost"
                    size="sm"
                    data-testid="order-close"
                    @click="askConfirm(order, 'received')"
                  >
                    <Check class="w-4 h-4 mr-1.5" />
                    Закрыть
                  </Button>
                  <Button
                    v-else
                    variant="ghost"
                    size="sm"
                    class="text-destructive"
                    data-testid="order-cancel"
                    @click="askConfirm(order, 'cancelled')"
                  >
                    <Ban class="w-4 h-4 mr-1.5" />
                    Отменить
                  </Button>
                </div>
              </div>
              <ul class="grid grid-cols-1 gap-x-6 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
                <li v-for="(line, i) in order.lines" :key="line.productId ?? `d${i}`" class="flex min-w-0 flex-wrap justify-between gap-x-2" data-testid="supplier-order-line">
                  <span class="min-w-0 flex-1 truncate">{{ line.name }}<template v-if="!line.productId"> (товар удалён)</template></span>
                  <span class="tabular-nums whitespace-nowrap">{{ line.received ? `${line.received} из ${line.quantity}` : line.quantity }} шт.</span>
                  <span v-if="line.costPrice != null || salePriceOf(line, productsById) != null" class="basis-full tabular-nums"><template v-if="line.costPrice != null">× {{ money(line.costPrice) }} = {{ money(line.costPrice * line.quantity) }}</template><template v-if="salePriceOf(line, productsById) != null">{{ line.costPrice != null ? ' · ' : '' }}продажа {{ money(salePriceOf(line, productsById)!) }}</template></span>
                </li>
              </ul>
            </div>
          </div>

          <Collapsible v-if="block.closed.length">
            <CollapsibleTrigger class="text-xs text-muted-foreground hover:underline" data-testid="closed-orders-toggle">
              Закрытые за 30 дней — {{ block.closed.length }}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul class="mt-2 space-y-1 text-xs text-muted-foreground" data-testid="closed-orders">
                <li v-for="order in block.closed" :key="order.id">
                  №{{ order.number }} от {{ formatDay(order.createdAt) }} · {{ ORDER_STATUS_LABEL[order.status].toLowerCase() }}<template v-if="order.closedAt">
                    {{ formatDay(order.closedAt) }}
                  </template>
                  <template v-if="order.status === 'received'">
                    · принято {{ orderSummary(order).receivedUnits }} из {{ orderSummary(order).units }} шт.
                  </template>
                </li>
              </ul>
            </CollapsibleContent>
          </Collapsible>

          <p v-if="!block.rows.length" class="text-sm text-muted-foreground">
            У этого поставщика ничего не дошло до порога. Заказ можно собрать вручную — «Добавить товар».
          </p>

          <!-- Десктоп: таблица -->
          <div v-if="block.rows.length" class="border rounded-lg overflow-hidden hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-12" />
                  <TableHead>Товар</TableHead>
                  <TableHead class="text-center w-20">
                    Остаток
                  </TableHead>
                  <TableHead class="w-56">
                    Спрос
                  </TableHead>
                  <TableHead v-if="block.supplier" class="w-28">
                    Правило
                  </TableHead>
                  <TableHead v-if="block.supplier" class="text-center w-28">
                    В заказ
                  </TableHead>
                  <TableHead v-if="block.supplier" class="text-right w-28">
                    Закупка
                  </TableHead>
                  <TableHead v-else class="w-48">
                    Поставщик
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="row in block.rows"
                  :key="row.item.id"
                  data-testid="restock-row"
                  :data-product="row.item.id"
                  :class="{ 'opacity-60': row.quantity === 0 }"
                >
                  <TableCell>
                    <div class="w-10 h-10 rounded-md bg-muted overflow-hidden flex-shrink-0">
                      <img
                        v-if="getProductImage(row.item.imageUrl)"
                        :src="getProductImage(row.item.imageUrl)"
                        :alt="row.item.name"
                        class="w-full h-full object-cover"
                      >
                      <div v-else class="w-full h-full flex items-center justify-center">
                        <Package class="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </TableCell>
                  <!-- Ячейка таблицы по умолчанию не переносит строки: длинное название
                       раздувало таблицу шире экрана, и начало названий уезжало за край -->
                  <TableCell class="whitespace-normal min-w-56">
                    <NuxtLink :to="`/admin/products/${row.item.id}`" class="font-medium hover:underline">
                      {{ row.item.name }}
                    </NuxtLink>
                    <div class="text-xs text-muted-foreground mt-0.5">
                      <span v-if="row.item.sku">Арт. {{ row.item.sku }}</span>
                      <span v-if="row.manual" class="ml-2 text-primary">добавлен вручную</span>
                      <span v-else-if="row.quantity === 0" class="ml-2">не берём</span>
                      <span v-if="row.item.pending" class="ml-2 text-amber-700 dark:text-amber-400" data-testid="row-pending">уже заказано {{ row.item.pending }} шт.</span>
                    </div>
                  </TableCell>
                  <TableCell class="text-center">
                    <Badge :variant="row.item.stock === 0 ? 'destructive' : 'outline'" class="font-mono">
                      <AlertTriangle v-if="row.item.stock === 0" class="w-3 h-3 mr-1" />
                      {{ row.item.stock }} шт
                    </Badge>
                  </TableCell>
                  <TableCell class="text-xs leading-5 whitespace-normal" data-testid="demand">
                    <!-- В одну строку: перенос между тегами Vue выбрасывает вместе с пробелом -->
                    <div>
                      продано <span class="font-medium tabular-nums">{{ row.item.sold30 }}</span><span class="text-muted-foreground"> за 30 дн. · </span><span class="font-medium tabular-nums">{{ row.item.sold90 }}</span><span class="text-muted-foreground"> за 90</span>
                    </div>
                    <div v-if="row.item.cartCustomers || row.item.alerts || row.item.wishlist" class="text-muted-foreground">
                      <span
                        v-if="row.item.cartCustomers"
                        :class="{ 'text-destructive font-medium': row.item.cartUnits > row.item.stock }"
                      >в корзинах {{ row.item.cartCustomers }} ({{ row.item.cartUnits }} шт.)</span>
                      <span v-if="row.item.alerts"><span v-if="row.item.cartCustomers"> · </span>ждут {{ row.item.alerts }}</span>
                      <span v-if="row.item.wishlist"><span v-if="row.item.cartCustomers || row.item.alerts"> · </span>в избранном {{ row.item.wishlist }}</span>
                    </div>
                  </TableCell>
                  <template v-if="block.supplier">
                    <TableCell>
                      <Popover :open="isRuleOpen(row.item, 'table')" @update:open="(open) => openRule(row.item, 'table', open)">
                        <PopoverTrigger as-child>
                          <Button variant="ghost" size="sm" class="h-8 px-2 font-mono text-xs" data-testid="rule-button">
                            ≤{{ row.item.minStock }} → +{{ row.item.restockQty }}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent class="w-72 space-y-3" align="start">
                          <p class="text-sm font-medium">
                            Правило закупки
                          </p>
                          <div class="grid grid-cols-2 gap-3">
                            <div class="space-y-1">
                              <Label :for="`min-${row.item.id}`" class="text-xs">Заказывать при остатке ≤</Label>
                              <Input :id="`min-${row.item.id}`" v-model="rule.minStock" type="number" min="0" max="999" class="h-9" data-testid="rule-min" />
                            </div>
                            <div class="space-y-1">
                              <Label :for="`qty-${row.item.id}`" class="text-xs">Брать, шт.</Label>
                              <Input :id="`qty-${row.item.id}`" v-model="rule.restockQty" type="number" min="1" max="999" class="h-9" data-testid="rule-qty" />
                            </div>
                          </div>
                          <Button class="w-full" size="sm" :disabled="rule.saving" data-testid="rule-save" @click="saveRule(row.item)">
                            Сохранить
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell class="text-center">
                      <div class="flex items-center justify-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          max="999"
                          class="h-8 w-16 text-center tabular-nums"
                          :model-value="row.quantity"
                          :aria-label="`Сколько заказать: ${row.item.name}`"
                          data-testid="order-qty"
                          @change="(e: Event) => onQuantityChange(block, row, e)"
                        />
                        <Button
                          v-if="row.manual || row.quantity > 0"
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 text-muted-foreground"
                          :title="row.manual ? 'Убрать из заказа' : 'Не брать'"
                          data-testid="order-remove"
                          @click="setQuantity(block, row, 0)"
                        >
                          <X class="w-4 h-4" />
                        </Button>
                        <Button
                          v-else
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 text-muted-foreground"
                          title="Вернуть по правилу"
                          @click="restockStore.setQuantity(block.key, row.item.id, null)"
                        >
                          <RotateCcw class="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell class="text-right text-muted-foreground tabular-nums whitespace-nowrap">
                      <div v-if="row.item.costPrice != null && row.quantity > 0" class="text-foreground">
                        {{ formatPrice(row.item.costPrice * row.quantity) }}&nbsp;₸
                      </div>
                      <div class="text-xs" data-testid="row-prices">
                        {{ row.item.costPrice != null ? `по ${money(row.item.costPrice)}` : 'закупка —' }}
                      </div>
                      <div class="text-xs">
                        продажа {{ row.item.price > 0 ? money(row.item.price) : '—' }}
                      </div>
                    </TableCell>
                  </template>
                  <TableCell v-else>
                    <Select
                      :disabled="assigningProductId === row.item.id"
                      @update:model-value="(val) => assignSupplier(row.item.id, String(val))"
                    >
                      <SelectTrigger class="h-8 text-xs">
                        <SelectValue placeholder="Назначить..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="s in suppliers" :key="s.id" :value="s.id">
                          {{ s.name }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <!-- Мобайл: компактный список -->
          <div v-if="block.rows.length" class="md:hidden space-y-2">
            <div
              v-for="row in block.rows"
              :key="row.item.id"
              class="rounded-lg border bg-card p-3 space-y-2"
              :class="{ 'opacity-60': row.quantity === 0 }"
            >
              <div class="flex items-start gap-3">
                <div class="w-11 h-11 rounded-md bg-muted overflow-hidden flex-shrink-0">
                  <img
                    v-if="getProductImage(row.item.imageUrl)"
                    :src="getProductImage(row.item.imageUrl)"
                    :alt="row.item.name"
                    class="w-full h-full object-cover"
                  >
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <Package class="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <NuxtLink :to="`/admin/products/${row.item.id}`" class="text-sm font-medium line-clamp-2 hover:underline">
                    {{ row.item.name }}
                  </NuxtLink>
                  <p class="text-xs text-muted-foreground">
                    <span v-if="row.item.sku">Арт. {{ row.item.sku }} · </span>продано {{ row.item.sold30 }} / {{ row.item.sold90 }} за 30/90 дн.
                  </p>
                  <p v-if="block.supplier" class="text-xs text-muted-foreground tabular-nums">
                    закупка {{ row.item.costPrice != null ? money(row.item.costPrice) : '—' }} · продажа {{ row.item.price > 0 ? money(row.item.price) : '—' }}<template v-if="row.item.costPrice != null && row.quantity > 0">
                      · сумма {{ money(row.item.costPrice * row.quantity) }}
                    </template>
                  </p>
                  <p v-if="row.item.pending" class="text-xs text-amber-700 dark:text-amber-400">
                    уже заказано {{ row.item.pending }} шт.
                  </p>
                  <p v-if="row.item.cartCustomers || row.item.alerts || row.item.wishlist" class="text-xs text-muted-foreground">
                    <span
                      v-if="row.item.cartCustomers"
                      :class="{ 'text-destructive font-medium': row.item.cartUnits > row.item.stock }"
                    >в корзинах {{ row.item.cartCustomers }} ({{ row.item.cartUnits }} шт.)</span>
                    <span v-if="row.item.alerts"><span v-if="row.item.cartCustomers"> · </span>ждут {{ row.item.alerts }}</span>
                    <span v-if="row.item.wishlist"><span v-if="row.item.cartCustomers || row.item.alerts"> · </span>в избранном {{ row.item.wishlist }}</span>
                  </p>
                </div>
                <Badge :variant="row.item.stock === 0 ? 'destructive' : 'outline'" class="font-mono text-[10px] flex-shrink-0">
                  <AlertTriangle v-if="row.item.stock === 0" class="w-2.5 h-2.5 mr-0.5" />
                  {{ row.item.stock }} шт
                </Badge>
              </div>

              <div v-if="block.supplier" class="flex items-center justify-between gap-2">
                <Popover :open="isRuleOpen(row.item, 'list')" @update:open="(open) => openRule(row.item, 'list', open)">
                  <PopoverTrigger as-child>
                    <Button variant="outline" size="sm" class="h-9 font-mono text-xs">
                      ≤{{ row.item.minStock }} → +{{ row.item.restockQty }}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-72 space-y-3" align="start">
                    <p class="text-sm font-medium">
                      Правило закупки
                    </p>
                    <div class="grid grid-cols-2 gap-3">
                      <div class="space-y-1">
                        <Label :for="`mmin-${row.item.id}`" class="text-xs">Заказывать при остатке ≤</Label>
                        <Input :id="`mmin-${row.item.id}`" v-model="rule.minStock" type="number" min="0" max="999" class="h-9" />
                      </div>
                      <div class="space-y-1">
                        <Label :for="`mqty-${row.item.id}`" class="text-xs">Брать, шт.</Label>
                        <Input :id="`mqty-${row.item.id}`" v-model="rule.restockQty" type="number" min="1" max="999" class="h-9" />
                      </div>
                    </div>
                    <Button class="w-full" size="sm" :disabled="rule.saving" @click="saveRule(row.item)">
                      Сохранить
                    </Button>
                  </PopoverContent>
                </Popover>
                <div class="flex items-center gap-1">
                  <span class="text-xs text-muted-foreground">в заказ</span>
                  <Input
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="999"
                    class="h-9 w-16 text-center tabular-nums"
                    :model-value="row.quantity"
                    :aria-label="`Сколько заказать: ${row.item.name}`"
                    @change="(e: Event) => onQuantityChange(block, row, e)"
                  />
                  <Button
                    v-if="row.manual || row.quantity > 0"
                    variant="ghost"
                    size="icon"
                    class="h-9 w-9 text-muted-foreground"
                    :title="row.manual ? 'Убрать из заказа' : 'Не брать'"
                    @click="setQuantity(block, row, 0)"
                  >
                    <X class="w-4 h-4" />
                  </Button>
                  <Button
                    v-else
                    variant="ghost"
                    size="icon"
                    class="h-9 w-9 text-muted-foreground"
                    title="Вернуть по правилу"
                    @click="restockStore.setQuantity(block.key, row.item.id, null)"
                  >
                    <RotateCcw class="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <Select
                v-else
                :disabled="assigningProductId === row.item.id"
                @update:model-value="(val) => assignSupplier(row.item.id, String(val))"
              >
                <SelectTrigger class="h-9 text-xs">
                  <Link class="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Назначить поставщика..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="s in suppliers" :key="s.id" :value="s.id">
                    {{ s.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <!-- Заказ поставщику -->
          <div v-if="block.supplier" class="rounded-lg border bg-muted/30 p-3 md:p-4 space-y-3" data-testid="order-panel">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div class="text-sm" data-testid="order-totals">
                <template v-if="block.order.totals.positions">
                  <span class="font-medium">
                    В заказе {{ block.order.totals.positions }} {{ pluralPositions(block.order.totals.positions) }},
                    {{ block.order.totals.units }} шт.
                  </span>
                  <span class="block text-muted-foreground" data-testid="order-money">
                    закупка <span class="tabular-nums text-foreground">{{ money(block.order.money.cost) }}</span>
                    · в продаже <span class="tabular-nums text-foreground">{{ money(block.order.money.sale) }}</span><template v-if="block.order.money.margin != null">
                      · наценка <span class="tabular-nums text-foreground">{{ money(block.order.money.margin) }}</span></template><template v-if="block.order.money.withoutCost">
                      · без цены закупки — {{ block.order.money.withoutCost }}</template><template v-if="block.order.money.withoutSale">
                      · без цены на сайте — {{ block.order.money.withoutSale }}</template>
                  </span>
                </template>
                <span v-else class="text-muted-foreground">Заказ пуст</span>
              </div>
              <div class="flex flex-wrap gap-2">
                <Popover :open="addOpenFor === block.key" @update:open="(open) => addOpenFor = open ? block.key : null">
                  <PopoverTrigger as-child>
                    <Button variant="outline" size="sm" :disabled="!block.addable.length" data-testid="order-add">
                      <Plus class="w-4 h-4 mr-1.5" />
                      Добавить товар
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Название или артикул..." />
                      <CommandList>
                        <CommandEmpty>Не нашлось</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            v-for="product in block.addable"
                            :key="product.id"
                            :value="`${product.name} ${product.sku ?? ''}`"
                            data-testid="order-add-item"
                            @select="addToOrder(block, product)"
                          >
                            <div class="flex w-full items-center justify-between gap-3">
                              <div class="min-w-0">
                                <div class="truncate">
                                  {{ product.name }}
                                </div>
                                <div class="text-xs text-muted-foreground">
                                  <span v-if="product.sku">Арт. {{ product.sku }} · </span>продано {{ product.sold90 }} за 90 дн.<span v-if="product.pending"> · заказано {{ product.pending }}</span>
                                </div>
                              </div>
                              <span class="text-xs text-muted-foreground tabular-nums whitespace-nowrap">остаток {{ product.stock }}</span>
                            </div>
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="!block.order.totals.positions"
                  data-testid="order-text-toggle"
                  @click="textShownFor = textShownFor === block.key ? null : block.key"
                >
                  <FileText class="w-4 h-4 mr-1.5" />
                  Текст заказа
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="!block.order.totals.positions"
                  data-testid="order-copy"
                  @click="copyOrder(block)"
                >
                  <Copy class="w-4 h-4 mr-1.5" />
                  Скопировать
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="!block.order.totals.positions || sheetBusy !== null"
                  title="Excel с фото и артикулами — отправить поставщику"
                  data-testid="order-sheet"
                  @click="downloadDraftSheet(block)"
                >
                  <FileSpreadsheet class="w-4 h-4 mr-1.5" />
                  Таблица
                </Button>
                <Button
                  v-if="block.order.whatsapp && block.order.totals.positions"
                  as="a"
                  size="sm"
                  :href="block.order.whatsapp!"
                  target="_blank"
                  rel="noopener"
                  data-testid="order-whatsapp"
                >
                  <MessageCircle class="w-4 h-4 mr-1.5" />
                  WhatsApp
                </Button>
                <Button
                  v-else
                  size="sm"
                  disabled
                  :title="block.order.whatsapp ? 'Заказ пуст' : 'У поставщика нет телефона'"
                >
                  <MessageCircle class="w-4 h-4 mr-1.5" />
                  WhatsApp
                </Button>
                <Button
                  v-if="ordersReady"
                  size="sm"
                  :disabled="!block.order.totals.positions || busy === `place:${block.key}`"
                  data-testid="order-place"
                  @click="placeOrder(block)"
                >
                  <Check class="w-4 h-4 mr-1.5" />
                  Заказал
                </Button>
                <Button
                  v-if="block.edited"
                  variant="ghost"
                  size="sm"
                  data-testid="order-reset"
                  @click="restockStore.reset(block.key)"
                >
                  <RotateCcw class="w-4 h-4 mr-1.5" />
                  Сбросить
                </Button>
              </div>
            </div>
            <pre
              v-if="textShownFor === block.key && block.order.totals.positions"
              class="whitespace-pre-wrap rounded-md border bg-background p-3 text-xs font-sans"
              data-testid="order-text"
            >{{ block.order.text }}</pre>
            <p v-if="ordersReady && block.order.totals.positions" class="text-xs text-muted-foreground">
              Отправили поставщику — нажмите «Заказал»: заказ сохранится, а его товары перестанут проситься в новый заказ.
            </p>
          </div>
        </CardContent>
      </Card>
    </template>

    <!-- Приёмка -->
    <Dialog v-model:open="receiveOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Приёмка — заказ №{{ receiving.order?.number }}</DialogTitle>
          <DialogDescription>
            Сколько пришло сейчас. Остаток товара увеличится на эти штуки.
          </DialogDescription>
        </DialogHeader>
        <form v-if="receiving.order" class="space-y-4" data-testid="receive-dialog" @submit.prevent="submitReceive">
          <div class="max-h-[50vh] overflow-y-auto divide-y">
            <div
              v-for="(line, i) in receiving.order.lines"
              :key="line.productId ?? `d${i}`"
              class="flex items-center justify-between gap-3 py-2"
              data-testid="receive-line"
            >
              <div class="min-w-0 text-sm">
                <div class="font-medium line-clamp-2">
                  {{ line.name }}
                </div>
                <div class="text-xs text-muted-foreground">
                  <span class="tabular-nums" data-testid="receive-line-prices">закупка {{ line.costPrice != null ? money(line.costPrice) : '—' }} · продажа {{ salePriceOf(line, productsById) != null ? money(salePriceOf(line, productsById)!) : '—' }}</span>
                  <br>
                  заказано {{ line.quantity }}<template v-if="line.received">
                    , принято {{ line.received }}
                  </template><template v-if="line.productId && productsById.get(line.productId)">
                    · на складе {{ productsById.get(line.productId)?.stock }}
                  </template>
                </div>
                <div v-if="!line.productId" class="text-xs text-muted-foreground">
                  товар удалён — принять нельзя
                </div>
                <div v-else-if="waitingFor(line.productId)" class="text-xs text-amber-700 dark:text-amber-400" data-testid="receive-waiting">
                  {{ plural(waitingFor(line.productId), 'ждёт', 'ждут', 'ждут') }} {{ waitingFor(line.productId) }} — {{ plural(waitingFor(line.productId), 'получит', 'получат', 'получат') }} «Товар снова в наличии»
                </div>
                <div v-else-if="!remaining(line)" class="text-xs text-muted-foreground">
                  пришло всё
                </div>
              </div>
              <Input
                v-if="line.productId"
                type="number"
                inputmode="numeric"
                min="0"
                max="9999"
                class="h-9 w-20 shrink-0 text-center tabular-nums"
                :model-value="receiving.quantities[line.productId] ?? 0"
                :aria-label="`Пришло: ${line.name}`"
                data-testid="receive-qty"
                @change="(e: Event) => onReceiveQuantity(line.productId!, e)"
              />
            </div>
          </div>
          <label v-if="receivePreview.short" class="flex items-start gap-2 text-sm">
            <Checkbox v-model="receiving.close" class="mt-0.5" data-testid="receive-close" />
            <span>
              Остального не будет — закрыть заказ
              <span class="block text-xs text-muted-foreground">Иначе заказ останется «В пути», а недостающее — заказанным.</span>
            </span>
          </label>
          <p class="text-sm" data-testid="receive-summary">
            Будет принято <span class="font-medium tabular-nums">{{ receivePreview.units }}</span> шт.<template v-if="receiveSum && receivePreview.units">
              на <span class="font-medium tabular-nums">{{ money(receiveSum.cost) }}</span> по закупке, в продаже <span class="font-medium tabular-nums">{{ money(receiveSum.sale) }}</span>.
            </template><template v-if="receivePreview.notified">
              «Товар снова в наличии» сразу уйдёт <span class="font-medium tabular-nums">{{ receivePreview.notified }}</span>
              {{ plural(receivePreview.notified, 'покупателю', 'покупателям', 'покупателям') }}.
            </template>
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" @click="receiving.order = null">
              Отмена
            </Button>
            <Button
              type="submit"
              :disabled="receiving.saving || (!receivePreview.units && !(receivePreview.short && receiving.close))"
              data-testid="receive-submit"
            >
              {{ receiving.saving ? 'Принимаю…' : 'Принять' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- Отменить / закрыть заказ -->
    <AlertDialog v-model:open="confirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ confirming?.status === 'cancelled' ? 'Отменить' : 'Закрыть' }} заказ №{{ confirming?.order.number }}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            <template v-if="confirming?.status === 'cancelled'">
              Его товары снова начнут проситься в заказ. Вернуть отменённый заказ нельзя.
            </template>
            <template v-else>
              Недопринятое перестанет считаться заказанным, принять по этому заказу больше ничего будет нельзя.
            </template>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Назад</AlertDialogCancel>
          <AlertDialogAction data-testid="confirm-order-action" @click="confirmStatus">
            {{ confirming?.status === 'cancelled' ? 'Отменить заказ' : 'Закрыть заказ' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
