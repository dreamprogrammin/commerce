<script setup lang="ts">
import type { OfflineSaleResult, PosProduct } from '@/stores/adminStore/adminPosStore'
import { useDebounceFn, useEventListener } from '@vueuse/core'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { matchesPosQuery, useAdminPosStore } from '@/stores/adminStore/adminPosStore'

/*
 * Касса магазина. С 31 октября 2026 — на весь экран, под компьютер со
 * сканером (просьба владельца: «мелкие кнопки, тесно», «долго искать товар»,
 * «считать сдачу», «сканер штрихкодов»):
 *  - без меню админки — макет `blank`, своя верхняя строка;
 *  - товары видны сразу: ходовые сверху, фильтр по категориям, поиск
 *    мгновенный по уже загруженному каталогу;
 *  - сканер печатает код и Enter в поле поиска: товар сразу в корзине,
 *    повторный скан — +1 шт.; незнакомый код касса предлагает привязать к
 *    товару — штрихкод был только у 3 товаров из 186;
 *  - наличные: «Получено» и сдача;
 *  - клавиши: F2 — поиск, F4 — телефон, F9 — оформить, Esc — очистить поиск.
 * Доступ к данным закрывает база (RLS и проверка роли в функциях кассы), а
 * не меню админки — макет на это не влияет.
 */
definePageMeta({
  layout: 'blank',
})

useHead({ title: 'Касса' })

const { getVariantUrl } = useSupabaseStorage()
const supabase = useSupabaseClient()

const store = useAdminPosStore()
const {
  searchQuery,
  catalog,
  categoryId,
  isLoadingCatalog,
  topCategories,
  visibleProducts,
  cart,
  phoneQuery,
  customer,
  isLookingUpCustomer,
  unknownPhone,
  isCreatingCustomer,
  paymentMethod,
  bonusesToSpend,
  isProcessing,
  cartTotal,
  cartBonusAward,
  maxBonusesToSpend,
  finalTotal,
} = storeToRefs(store)

onMounted(() => {
  store.loadCatalog()
  focusSearch()
})

const searchInput = ref<{ $el?: HTMLInputElement } | HTMLInputElement | null>(null)
const phoneInput = ref<{ $el?: HTMLInputElement } | HTMLInputElement | null>(null)
function inputEl(r: typeof searchInput.value): HTMLInputElement | null {
  if (!r)
    return null
  return r instanceof HTMLInputElement ? r : (r.$el ?? null)
}
function focusSearch(select = false) {
  nextTick(() => {
    const el = inputEl(searchInput.value)
    el?.focus()
    if (select)
      el?.select()
  })
}

// Сколько каждого товара уже в корзине — метка на карточке
const inCart = computed(() => new Map(cart.value.map(i => [i.product.id, i.quantity])))

function add(product: PosProduct) {
  store.addToCart(product)
  focusSearch()
}

/*
 * Enter в поле поиска. Сканер присылает код и Enter: код известен — товар в
 * корзину; найден ровно один товар — тоже в корзину (удобно и с клавиатуры);
 * код из цифр, которого нет ни у кого, — предложить привязать.
 */
function handleSearchEnter() {
  const q = searchQuery.value.trim()
  if (!q)
    return
  const byCode = store.findByBarcode(q)
  if (byCode) {
    add(byCode)
    searchQuery.value = ''
    return
  }
  if (visibleProducts.value.length === 1) {
    add(visibleProducts.value[0]!)
    searchQuery.value = ''
    return
  }
  if (/^\d{6,}$/.test(q) && visibleProducts.value.length === 0) {
    openBind(q)
    searchQuery.value = ''
  }
}

// --- Привязка незнакомого штрихкода к товару ---
const bindCode = ref<string | null>(null)
const bindQuery = ref('')
const bindSaving = ref(false)
const bindMatches = computed(() => bindQuery.value.trim()
  ? catalog.value.filter(p => matchesPosQuery(p, bindQuery.value)).slice(0, 8)
  : [])

// Товар уже со своим штрихкодом: первый клик спрашивает, второй заменяет
const bindReplace = ref<string | null>(null)
watch(bindQuery, () => {
  bindReplace.value = null
})

function openBind(code: string) {
  bindCode.value = code
  bindQuery.value = ''
  bindReplace.value = null
}

async function bindTo(product: PosProduct) {
  if (!bindCode.value || bindSaving.value)
    return
  if (product.barcode && product.barcode !== bindCode.value && bindReplace.value !== product.id) {
    bindReplace.value = product.id
    return
  }
  bindSaving.value = true
  const ok = await store.bindBarcode(product, bindCode.value)
  bindSaving.value = false
  if (ok) {
    bindCode.value = null
    add(product)
  }
}

const bindOpen = computed({
  get: () => bindCode.value !== null,
  set: (v) => {
    if (!v) {
      bindCode.value = null
      focusSearch()
    }
  },
})

// --- Покупатель по телефону ---
const debouncedLookup = useDebounceFn((phone: string) => {
  store.lookupCustomer(phone)
}, 600)

watch(phoneQuery, (phone) => {
  if (phone.length >= 11) {
    debouncedLookup(phone)
  }
  else if (!phone) {
    store.clearCustomer()
  }
})

// Новая карточка магазина: имя для покупателя, которого не нашли по номеру
const newFirstName = ref('')
const newLastName = ref('')
watch(unknownPhone, () => {
  newFirstName.value = ''
  newLastName.value = ''
})

// --- Наличные: получено и сдача ---
const cashReceived = ref<number | null>(null)
const change = computed(() => cashReceived.value === null ? null : cashReceived.value - finalTotal.value)
/** Быстрые суммы: без сдачи и ближайшие круглые купюрами */
const quickCash = computed(() => {
  const total = finalTotal.value
  if (!total)
    return []
  const options = [total, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000, 10000, 20000]
  return [...new Set(options)].filter(v => v >= total).sort((a, b) => a - b).slice(0, 4)
})
watch(paymentMethod, () => {
  cashReceived.value = null
})

// --- Продажа ---
const saleResult = ref<OfflineSaleResult | null>(null)
const saleCash = ref<{ received: number, change: number } | null>(null)
const showReceiptDialog = ref(false)

/**
 * Номер продажи для чека — цифрами.
 *
 * Здесь показывали первый блок UUID («9F5A9A»): продиктовать такое покупателю
 * на кассе невозможно. Номер лежит в самом заказе, но RPC продажи его не
 * возвращает, поэтому спрашиваем отдельно — по тому же id.
 */
const saleNumber = ref<string | null>(null)

const canSell = computed(() => cart.value.length > 0 && !isProcessing.value)

async function handleCompleteSale() {
  if (!canSell.value)
    return
  const cash = paymentMethod.value === 'cash' && cashReceived.value !== null && change.value !== null && change.value >= 0
    ? { received: cashReceived.value, change: change.value }
    : null
  const result = await store.completeSale()
  if (result) {
    saleResult.value = result
    saleCash.value = cash
    saleNumber.value = null
    cashReceived.value = null
    showReceiptDialog.value = true

    const { data } = await supabase.rpc('order_number_by_id', { p_order_id: result.order_id })
    if (data)
      saleNumber.value = String(data)
  }
}

watch(showReceiptDialog, (open) => {
  if (!open)
    focusSearch()
})

// --- Клавиши ---
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  const dialogOpen = showReceiptDialog.value || bindOpen.value
  if (e.key === 'F2') {
    e.preventDefault()
    focusSearch(true)
    return
  }
  if (e.key === 'F4') {
    e.preventDefault()
    if (!customer.value)
      inputEl(phoneInput.value)?.focus()
    return
  }
  if (e.key === 'F9' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
    e.preventDefault()
    if (!dialogOpen)
      handleCompleteSale()
    return
  }
  // Печать «в пустоту» (фокус не в поле) — в поиск: сканер не теряет коды
  const target = e.target as HTMLElement | null
  const typing = target?.closest('input, textarea, select, [contenteditable="true"]')
  if (!dialogOpen && !typing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)
    focusSearch()
})

function formatPrice(price: number) {
  return `${new Intl.NumberFormat('ru-RU').format(price)} ₸`
}

/*
 * Вариант `sm`, а не голый public URL: в `image_url` лежит путь без
 * расширения, самого файла по нему в бакете нет — залиты только
 * `_sm/_md/_lg.webp`. Прежняя ссылка отдавала 400, и в кассе вместо товаров
 * были заглушки.
 */
function getImageUrl(product: PosProduct): string | null {
  return getVariantUrl(BUCKET_NAME_PRODUCT, product.image_url, 'sm')
}
</script>

<template>
  <div class="flex h-dvh flex-col bg-muted/30 text-foreground">
    <!-- Верхняя строка -->
    <header class="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink to="/admin">
          <Icon name="lucide:arrow-left" class="mr-2 h-4 w-4" />
          Админка
        </NuxtLink>
      </Button>
      <h1 class="text-lg font-semibold">
        Касса
      </h1>
      <div class="ml-auto hidden items-center gap-3 text-xs text-muted-foreground xl:flex">
        <span><kbd class="rounded border bg-muted px-1.5 py-0.5 font-mono">F2</kbd> поиск</span>
        <span><kbd class="rounded border bg-muted px-1.5 py-0.5 font-mono">F4</kbd> телефон</span>
        <span><kbd class="rounded border bg-muted px-1.5 py-0.5 font-mono">F9</kbd> оформить</span>
        <span><kbd class="rounded border bg-muted px-1.5 py-0.5 font-mono">Esc</kbd> очистить поиск</span>
      </div>
      <Button variant="outline" size="sm" class="ml-auto xl:ml-0" :disabled="isLoadingCatalog" @click="store.loadCatalog()">
        <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoadingCatalog }" />
        Обновить товары
      </Button>
    </header>

    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <!-- ============ Товары ============ -->
      <section class="flex min-h-[60vh] min-w-0 flex-1 flex-col lg:min-h-0">
        <div class="space-y-3 border-b bg-background p-4">
          <div class="relative">
            <Icon name="lucide:scan-barcode" class="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref="searchInput"
              v-model="searchQuery"
              placeholder="Название, артикул или штрихкод — сканер работает здесь"
              class="h-14 pl-14 pr-12 text-lg"
              autocomplete="off"
              @keydown.enter.prevent="handleSearchEnter"
              @keydown.esc.prevent="searchQuery = ''"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Очистить поиск"
              @click="searchQuery = ''; focusSearch()"
            >
              <Icon name="lucide:x" class="h-5 w-5" />
            </button>
          </div>

          <div class="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              class="h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors"
              :class="!categoryId ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:border-primary/50'"
              @click="categoryId = null; focusSearch()"
            >
              Все
            </button>
            <button
              v-for="c in topCategories"
              :key="c.id"
              type="button"
              class="h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors"
              :class="categoryId === c.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:border-primary/50'"
              @click="categoryId = c.id; focusSearch()"
            >
              {{ c.name }} <span class="opacity-60">{{ c.count }}</span>
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          <p class="mb-3 text-sm text-muted-foreground">
            <template v-if="searchQuery.trim() || categoryId">
              Найдено: {{ visibleProducts.length }}
            </template>
            <template v-else>
              Ходовые товары сверху · всего в наличии {{ catalog.length }}
            </template>
          </p>

          <div v-if="isLoadingCatalog && !catalog.length" class="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
            <Skeleton v-for="i in 12" :key="i" class="h-64 w-full" />
          </div>

          <div
            v-else-if="!visibleProducts.length"
            class="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground"
          >
            <Icon name="lucide:package-x" class="h-12 w-12 opacity-30" />
            <p>Ничего не нашлось</p>
            <Button
              v-if="/^\d{6,}$/.test(searchQuery.trim())"
              variant="outline"
              @click="openBind(searchQuery.trim()); searchQuery = ''"
            >
              Привязать штрихкод {{ searchQuery.trim() }} к товару
            </Button>
          </div>

          <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
            <button
              v-for="product in visibleProducts"
              :key="product.id"
              type="button"
              class="relative flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all hover:border-primary hover:shadow-md active:scale-[0.98]"
              :class="{ 'border-primary ring-2 ring-primary/30': inCart.has(product.id) }"
              @click="add(product)"
            >
              <div class="relative aspect-square w-full bg-muted">
                <img
                  v-if="getImageUrl(product)"
                  :src="getImageUrl(product)!"
                  alt=""
                  loading="lazy"
                  class="h-full w-full object-cover"
                >
                <div v-else class="flex h-full items-center justify-center">
                  <Icon name="lucide:image" class="h-8 w-8 text-muted-foreground/30" />
                </div>
                <Badge
                  :variant="product.stock_quantity <= 3 ? 'destructive' : 'secondary'"
                  class="absolute right-2 top-2"
                >
                  {{ product.stock_quantity }} шт.
                </Badge>
                <span
                  v-if="inCart.has(product.id)"
                  class="absolute left-2 top-2 flex h-8 min-w-8 items-center justify-center rounded-full bg-primary px-2 text-sm font-bold text-primary-foreground"
                >
                  {{ inCart.get(product.id) }}
                </span>
              </div>
              <div class="flex flex-1 flex-col gap-1 p-3">
                <p class="line-clamp-2 text-sm font-medium leading-snug">
                  {{ product.name }}
                </p>
                <div class="mt-auto">
                  <p class="whitespace-nowrap text-lg font-bold text-primary">
                    {{ formatPrice(product.price) }}
                    <s v-if="product.full_price && product.full_price > product.price" class="text-xs font-normal text-muted-foreground">
                      {{ formatPrice(product.full_price) }}
                    </s>
                  </p>
                  <p v-if="product.bonus_points_award > 0" class="text-xs text-amber-600">
                    +{{ product.bonus_points_award }} бонусов
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>

      <!-- ============ Чек ============ -->
      <aside class="flex w-full shrink-0 flex-col border-t bg-background lg:w-[440px] lg:overflow-y-auto lg:border-l lg:border-t-0 xl:w-[480px]">
        <div class="flex items-center justify-between border-b px-4 py-3">
          <h2 class="text-lg font-semibold">
            Чек
            <span v-if="cart.length" class="text-muted-foreground">· {{ cart.reduce((n, i) => n + i.quantity, 0) }} шт.</span>
          </h2>
          <Button
            v-if="cart.length"
            variant="ghost"
            class="text-destructive hover:text-destructive"
            @click="store.clearCart(); focusSearch()"
          >
            <Icon name="lucide:trash-2" class="mr-1 h-4 w-4" />
            Очистить
          </Button>
        </div>

        <div class="min-h-[160px] flex-1 overflow-y-auto">
          <div v-if="!cart.length" class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <Icon name="lucide:scan-barcode" class="h-10 w-10 opacity-30" />
            <p class="text-sm">
              Отсканируйте товар или нажмите на карточку слева
            </p>
          </div>
          <div
            v-for="item in cart"
            :key="item.product.id"
            class="flex items-center gap-3 border-b px-4 py-3"
          >
            <div class="min-w-0 flex-1">
              <p class="line-clamp-2 text-sm font-medium leading-snug">
                {{ item.product.name }}
              </p>
              <p class="text-xs text-muted-foreground">
                {{ formatPrice(item.product.price) }} за шт.
              </p>
            </div>
            <div class="flex items-center gap-1">
              <Button variant="outline" size="icon" class="h-10 w-10" aria-label="Меньше" @click="store.updateQuantity(item.product.id, item.quantity - 1)">
                <Icon name="lucide:minus" class="h-4 w-4" />
              </Button>
              <span class="w-8 text-center text-lg font-semibold tabular-nums">{{ item.quantity }}</span>
              <Button variant="outline" size="icon" class="h-10 w-10" aria-label="Больше" @click="store.updateQuantity(item.product.id, item.quantity + 1)">
                <Icon name="lucide:plus" class="h-4 w-4" />
              </Button>
            </div>
            <p class="w-24 text-right font-semibold tabular-nums whitespace-nowrap">
              {{ formatPrice(item.product.price * item.quantity) }}
            </p>
            <Button variant="ghost" size="icon" class="h-10 w-10 text-muted-foreground hover:text-destructive" aria-label="Убрать" @click="store.removeFromCart(item.product.id)">
              <Icon name="lucide:x" class="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div class="shrink-0 space-y-2 border-t bg-muted/30 p-3">
          <!-- Покупатель; списание бонусов — в том же блоке, чтобы чек не сжимался -->
          <div v-if="customer" class="space-y-2 rounded-lg border bg-background px-3 py-2">
            <div class="flex items-center justify-between gap-2">
              <p class="min-w-0 truncate font-medium">
                {{ store.getCustomerName(customer) }}
                <span v-if="customer.kind === 'offline'" class="ml-1 rounded border px-1 text-[10px] font-normal text-muted-foreground">карточка магазина</span>
                <span class="ml-2 text-sm font-normal text-muted-foreground">бонусы: <span class="font-medium text-amber-600">{{ customer.active_bonus_balance }}</span></span>
              </p>
              <Button variant="ghost" size="icon" class="h-9 w-9 shrink-0 text-muted-foreground" aria-label="Убрать покупателя" @click="store.clearCustomer()">
                <Icon name="lucide:x" class="h-5 w-5" />
              </Button>
            </div>
            <div v-if="customer.active_bonus_balance > 0 && cart.length" class="flex items-center gap-2">
              <span class="shrink-0 text-sm text-muted-foreground">Списать</span>
              <Input
                v-model.number="bonusesToSpend"
                type="number"
                :min="0"
                :max="maxBonusesToSpend"
                aria-label="Сколько бонусов списать"
                class="h-9"
              />
              <Button variant="outline" class="h-9 shrink-0" @click="bonusesToSpend = maxBonusesToSpend">
                Все {{ maxBonusesToSpend }}
              </Button>
            </div>
          </div>
          <div v-else class="relative">
            <Icon name="lucide:user-search" class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref="phoneInput"
              v-model="phoneQuery"
              placeholder="Телефон покупателя (F4), необязательно"
              aria-label="Телефон покупателя"
              inputmode="tel"
              class="h-12 pl-10 text-base"
            />
            <Icon
              v-if="isLookingUpCustomer"
              name="lucide:loader-2"
              class="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          </div>

          <form
            v-if="!customer && unknownPhone"
            class="space-y-2 rounded-lg border border-dashed bg-background p-3"
            @submit.prevent="store.createOfflineCustomer(newFirstName, newLastName)"
          >
            <p class="text-xs text-muted-foreground">
              Покупателя с номером {{ unknownPhone }} нет. Завести карточку — покупки и бонусы будут копиться на ней.
            </p>
            <div class="flex gap-2">
              <Input v-model="newFirstName" placeholder="Имя" aria-label="Имя покупателя" class="h-10" />
              <Input v-model="newLastName" placeholder="Фамилия" aria-label="Фамилия покупателя" class="h-10" />
            </div>
            <Button type="submit" variant="outline" class="h-10 w-full" :disabled="!newFirstName.trim() || isCreatingCustomer">
              <Icon name="lucide:user-plus" class="mr-2 h-4 w-4" />
              {{ isCreatingCustomer ? 'Завожу…' : 'Завести карточку' }}
            </Button>
          </form>

          <!-- Оплата -->
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="method in [
                { value: 'cash', label: 'Наличные', icon: 'lucide:banknote' },
                { value: 'card', label: 'Карта', icon: 'lucide:credit-card' },
                { value: 'transfer', label: 'Перевод', icon: 'lucide:smartphone' },
              ]"
              :key="method.value"
              type="button"
              class="flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors"
              :class="paymentMethod === method.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'bg-background text-muted-foreground hover:border-primary/50'"
              @click="paymentMethod = method.value as 'cash' | 'card' | 'transfer'"
            >
              <Icon :name="method.icon" class="h-5 w-5" />
              {{ method.label }}
            </button>
          </div>

          <!-- Наличные: получено и сдача -->
          <div v-if="paymentMethod === 'cash' && cart.length" class="space-y-2 rounded-lg border bg-background p-2">
            <div class="flex items-center gap-2">
              <span class="shrink-0 text-sm text-muted-foreground">Получено</span>
              <Input
                v-model.number="cashReceived"
                type="number"
                :min="0"
                step="100"
                inputmode="numeric"
                aria-label="Получено от покупателя"
                class="h-10 w-32 text-right text-lg"
              />
              <div v-if="change !== null" class="ml-auto text-right leading-tight">
                <div class="text-xs text-muted-foreground">
                  {{ change >= 0 ? 'Сдача' : 'Не хватает' }}
                </div>
                <div class="whitespace-nowrap text-xl font-bold tabular-nums" :class="change >= 0 ? 'text-green-600' : 'text-destructive'">
                  {{ formatPrice(Math.abs(change)) }}
                </div>
              </div>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <Button
                v-for="v in quickCash"
                :key="v"
                variant="outline"
                size="sm"
                class="h-8"
                @click="cashReceived = v"
              >
                {{ v === finalTotal ? 'Без сдачи' : formatPrice(v) }}
              </Button>
            </div>
          </div>

          <!-- Итог -->
          <div class="space-y-1">
            <div v-if="bonusesToSpend > 0" class="flex justify-between text-sm text-muted-foreground">
              <span>Сумма {{ formatPrice(cartTotal) }}</span>
              <span class="text-amber-600">− {{ formatPrice(bonusesToSpend) }} бонусами</span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-lg font-medium">Итого</span>
              <span class="text-3xl font-bold tabular-nums text-primary">{{ formatPrice(finalTotal) }}</span>
            </div>
            <p v-if="cart.length && cartBonusAward > 0" class="text-right text-xs text-amber-600">
              Начислится {{ cartBonusAward }} бонусов через 14 дней
            </p>
          </div>

          <Button
            class="h-14 w-full text-lg"
            :disabled="!canSell"
            @click="handleCompleteSale"
          >
            <Icon v-if="isProcessing" name="lucide:loader-2" class="mr-2 h-5 w-5 animate-spin" />
            <Icon v-else name="lucide:check-circle" class="mr-2 h-5 w-5" />
            Оформить продажу
            <kbd class="ml-3 rounded border border-primary-foreground/40 px-1.5 py-0.5 font-mono text-xs opacity-80">F9</kbd>
          </Button>
        </div>
      </aside>
    </div>

    <!-- Привязка штрихкода -->
    <Dialog v-model:open="bindOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Штрихкод {{ bindCode }} не найден</DialogTitle>
          <DialogDescription>
            Найдите товар — код запомнится, и следующий скан сразу положит его в чек.
          </DialogDescription>
        </DialogHeader>
        <Input v-model="bindQuery" placeholder="Название или артикул" aria-label="Найти товар для штрихкода" class="h-12 text-base" autofocus />
        <div class="max-h-80 space-y-1 overflow-y-auto">
          <p v-if="bindQuery.trim() && !bindMatches.length" class="py-4 text-center text-sm text-muted-foreground">
            Ничего не нашлось
          </p>
          <button
            v-for="p in bindMatches"
            :key="p.id"
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left hover:border-primary disabled:opacity-50"
            :disabled="bindSaving"
            @click="bindTo(p)"
          >
            <span class="min-w-0">
              <span class="line-clamp-2 text-sm font-medium">{{ p.name }}</span>
              <span v-if="bindReplace === p.id" class="text-xs font-medium text-destructive">
                У товара уже штрихкод {{ p.barcode }} — нажмите ещё раз, чтобы заменить
              </span>
              <span v-else-if="p.barcode" class="text-xs text-muted-foreground">сейчас: {{ p.barcode }}</span>
            </span>
            <span class="shrink-0 font-semibold">{{ formatPrice(p.price) }}</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Чек после продажи -->
    <Dialog v-model:open="showReceiptDialog">
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-green-600">
            <Icon name="lucide:check-circle-2" class="h-5 w-5" />
            Продажа оформлена
          </DialogTitle>
        </DialogHeader>

        <div v-if="saleResult" class="space-y-3 py-2">
          <div class="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Сумма</span>
              <span>{{ formatPrice(saleResult.total) }}</span>
            </div>
            <div v-if="saleResult.discount > 0" class="flex justify-between text-amber-600">
              <span>Списано бонусов</span>
              <span>− {{ formatPrice(saleResult.discount) }}</span>
            </div>
            <div class="flex justify-between border-t pt-1 font-bold">
              <span>Оплачено</span>
              <span>{{ formatPrice(saleResult.final) }}</span>
            </div>
            <template v-if="saleCash">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Получено</span>
                <span>{{ formatPrice(saleCash.received) }}</span>
              </div>
              <div class="flex justify-between text-lg font-bold text-green-600">
                <span>Сдача</span>
                <span>{{ formatPrice(saleCash.change) }}</span>
              </div>
            </template>
            <div v-if="saleResult.bonuses_awarded > 0" class="flex justify-between text-xs text-amber-600">
              <span>Начислится бонусов (через 14 дней)</span>
              <span>+{{ saleResult.bonuses_awarded }}</span>
            </div>
          </div>

          <p class="text-center text-xs text-muted-foreground">
            №&nbsp;{{ saleNumber ?? saleResult.order_id.split('-')[0]!.toUpperCase() }}
          </p>
        </div>

        <DialogFooter>
          <Button class="h-12 w-full text-base" autofocus @click="showReceiptDialog = false">
            Новая продажа
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
