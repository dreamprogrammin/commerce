<script setup lang="ts">
import type { Database } from '@/types'
import type { DraftRow, OrderTotals, RestockItem } from '@/utils/restockOrder'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Link,
  MessageCircle,
  Package,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  User,
  X,
} from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useAdminRestockStore } from '@/stores/adminStore/adminRestockStore'
import { draftRows, needsRestock, orderText, orderTotals, plural, pluralPositions, whatsappUrl } from '@/utils/restockOrder'

definePageMeta({ layout: 'admin' })

const supabase = useSupabaseClient<Database>()
const { getVariantUrl } = useSupabaseStorage()

/*
 * Заказы поставщикам (30.10.2026, владелец: «заказы должны собираться по
 * поставщику», «смотрим спрос не только по корзинам»). Каждый поставщик —
 * черновик заказа: товары на пороге попадают сами, любые другие его товары —
 * кнопкой. Данные — `/api/admin/restock` (server/utils/adminRestock.ts).
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
}

const suppliers = ref<RestockSupplier[]>([])
const products = ref<RestockProduct[]>([])
const isLoading = ref(true)

async function fetchRestock() {
  isLoading.value = true
  try {
    const data = await adminFetch<{ suppliers: RestockSupplier[], products: RestockProduct[] }>('/api/admin/restock')
    suppliers.value = data.suppliers
    products.value = data.products
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
  rows: DraftRow<RestockProduct>[]
  /** Товары поставщика, которых ещё нет в заказе, — для «Добавить товар» */
  addable: RestockProduct[]
  autoCount: number
  edited: boolean
  order: { totals: OrderTotals, text: string, whatsapp: string | null }
}

const blocks = computed<SupplierBlock[]>(() => {
  const bySupplier = new Map<string, RestockProduct[]>()
  for (const product of products.value) {
    const key = product.supplierId ?? NO_SUPPLIER
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), product])
  }
  const result: SupplierBlock[] = []
  for (const supplier of suppliers.value) {
    const items = bySupplier.get(supplier.id)
    if (!items?.length)
      continue
    const edits = drafts.value[supplier.id] ?? {}
    const rows = draftRows(items, edits)
    const inOrder = new Set(rows.map(r => r.item.id))
    const text = orderText(rows, new Date())
    result.push({
      key: supplier.id,
      supplier,
      rows,
      addable: items.filter(p => !inOrder.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      autoCount: rows.filter(r => !r.manual).length,
      edited: Object.keys(edits).some(id => items.some(p => p.id === id)),
      order: { totals: orderTotals(rows), text, whatsapp: whatsappUrl(supplier.phone, text) },
    })
  }
  result.sort((a, b) => Number(b.autoCount > 0) - Number(a.autoCount > 0) || a.supplier!.name.localeCompare(b.supplier!.name, 'ru'))

  // Без поставщика заказать нельзя — только назначить
  const orphans = draftRows(bySupplier.get(NO_SUPPLIER) ?? [])
  if (orphans.length) {
    result.push({
      key: NO_SUPPLIER,
      supplier: null,
      rows: orphans,
      addable: [],
      autoCount: orphans.length,
      edited: false,
      order: { totals: orderTotals([]), text: '', whatsapp: null },
    })
  }
  return result
})

const totalToRestock = computed(() => blocks.value.reduce((sum, b) => sum + b.autoCount, 0))

// Свёрнутость: по умолчанию раскрыт поставщик, у которого есть что заказывать
const toggled = ref<Record<string, boolean>>({})
function isExpanded(block: SupplierBlock): boolean {
  return toggled.value[block.key] ?? (block.autoCount > 0 || block.edited)
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
          поставщика — кнопкой «Добавить товар». Состав заказов запоминается в этом браузере.
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
          <div class="flex items-center justify-between gap-2">
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
                      <template v-if="row.item.costPrice != null && row.quantity > 0">
                        {{ formatPrice(row.item.costPrice * row.quantity) }}&nbsp;₸
                      </template>
                      <template v-else>
                        —
                      </template>
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
                  <span class="text-muted-foreground">
                    · по закупке ≈ {{ formatPrice(block.order.totals.cost) }}&nbsp;₸<template v-if="block.order.totals.withoutCost">, без цены закупки — {{ block.order.totals.withoutCost }}</template>
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
                                  <span v-if="product.sku">Арт. {{ product.sku }} · </span>продано {{ product.sold90 }} за 90 дн.
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
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
