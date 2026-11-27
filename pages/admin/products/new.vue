<script setup lang="ts">
import type { AttributeValuePayload, Database, ProductInsert } from '@/types'
import type { AiProductFill, SavedOfferProduct, WrittenOfferProduct } from '@/utils/aiWriter'
import type { OfferDraftSource } from '@/utils/supplierOfferList'
import { useLocalStorage } from '@vueuse/core'
import { LoaderCircle, Plus, RefreshCw, Sparkles } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import ProductForm from '@/components/admin/products/ProductForm.vue'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'
import { adminFetch } from '@/utils/adminFetch'
import { aiBudgetLines, aiUsageLines } from '@/utils/aiCost'
import { pluralPositions } from '@/utils/restockOrder'
import { modelLabel, productDraft } from '@/utils/supplierOfferList'

definePageMeta({ layout: 'admin' })

const adminProductsStore = useAdminProductsStore()
const router = useRouter()

// ✅ Добавляем SEO composable
const { notifyProduct } = useSeoIndexing()

/**
 * «На сайт» из «Товаров поставщиков» (5 ноября 2026): ?offer=<id>&item=<номер
 * товара в посте>. Форма получает, что прочитал ИИ, и фото поста; созданный
 * товар отмечается у поставщика «Добавлен».
 */
const route = useRoute()
const supabase = useSupabaseClient<Database>()
const offerId = typeof route.query.offer === 'string' ? route.query.offer : null
const offerItem = Number(route.query.item) || 0
const offer = ref<OfferDraftSource | null>(null)
const draft = computed(() => offer.value && { ...productDraft(offer.value, offerItem), photoUrl: offer.value.photoUrl })
/** Такой артикул уже есть на сайте — товар, скорее всего, выложен */
const existingBySku = ref<{ id: string, name: string } | null>(null)

/*
 * «На сайт» → заказ поставщику (26.11.2026). Владелец: «товар, который
 * добавляется на сайт, автоматически должен добавляться в заказ к
 * поставщику». Сколько штук — поле здесь: из «В заказ» на «Товарах
 * поставщиков», если там отмечено, иначе 5; 0 — не заказывать. Товар ложится
 * в формирующийся заказ своего поставщика («Поставки») и до первой приёмки
 * скрыт с сайта: не привезёт поставщик — пустой карточки на сайте не будет.
 * Товар с остатком уже на складе — его не скрываем.
 */
const DEFAULT_ORDER_QUANTITY = 5
const orderQuantity = ref<number | ''>(DEFAULT_ORDER_QUANTITY)
const pickedQuantity = ref<number | null>(null)
const picks = useLocalStorage<Record<string, { quantity?: number }>>('admin-supplier-order', {})
// Ключ отметки — как на «Товарах поставщиков»: пост без разобранных товаров — «-»
const pickKeys = offerId ? [`${offerId}:${offerItem}`, ...(offerItem === 0 ? [`${offerId}:-`] : [])] : []

onMounted(async () => {
  if (!offerId)
    return
  // Отмеченное в «В заказ» на «Товарах поставщиков» — сколько заказать
  pickedQuantity.value = pickKeys.map(k => picks.value[k]?.quantity).find((q): q is number => Number.isInteger(q) && q! >= 1 && q! <= 9999) ?? null
  if (pickedQuantity.value)
    orderQuantity.value = pickedQuantity.value
  try {
    offer.value = await adminFetch<OfferDraftSource>('/api/admin/supplier-offers/draft', { query: { id: offerId } })
  }
  catch (e: any) {
    toast.error(e?.data?.message || 'Товар поставщика не загрузился')
    return
  }
  // ИИ — только кнопкой «Сгенерировать» (26.11.2026); уже написанное — сразу
  const saved = offer.value.written?.[String(offerItem)]
  if (saved) {
    // Черновик ложится в форму раньше: ответ ИИ заменяет прочитанное с фото, а не наоборот
    await nextTick()
    restoreTexts(saved)
  }
  // Своим запросом, не fetchProductBySku: тот на «не найдено» отвечает 406 и тянет весь товар
  const sku = draft.value?.sku
  if (sku) {
    const { data } = await supabase.from('products').select('id, name').eq('sku', sku).limit(1)
    existingBySku.value = data?.[0] ?? null
  }
})

/*
 * «Тексты для сайта» (23 ноября 2026): ИИ пишет название, описание и
 * SEO-описание, подбирает раздел и бренд (server/utils/contentWriter.ts).
 * Бренда на сайте нет — ИИ только называет его, а заполняет бренд человек:
 * кнопка открывает окно «Создать новый бренд» формы с этим названием. Поиск
 * бренда в интернете убран 24.11.2026 — «чтобы не уходила много денег на бренд».
 *
 * С 26.11.2026 ИИ пишет только по кнопке «Сгенерировать»: владелец — «будут
 * ситуации, когда я не захочу добавлять такой товар, а токены были уже
 * потрачены». Ответ сервер сохраняет у товара поставщика, и после
 * перезагрузки форма берёт его, не тратя токенов снова (`restored`).
 */
const errorText = (e: any, fallback: string) => e?.data?.message || e?.statusMessage || fallback
type WriterState
  = | { state: 'writing' }
    | { state: 'done', result: WrittenOfferProduct, filled: string[] | null, restored: boolean }
    | { state: 'error', message: string }
const writer = ref<WriterState | null>(null)
const aiFill = ref<AiProductFill | null>(null)
const productForm = ref<InstanceType<typeof ProductForm> | null>(null)
/** Бренд, созданный в окне формы, — карточка говорит, что он выбран */
const createdBrand = ref<{ id: string, name: string } | null>(null)
/**
 * «Расход: … токенов ≈ … ₸» под ответом ИИ (24.11.2026); ответ старой сборки
 * без usage — строки нет. У сохранённого ответа это расход того раза.
 */
const writerUsage = computed(() => {
  if (writer.value?.state !== 'done' || !writer.value.result.usage)
    return null
  const lines = aiUsageLines(writer.value.result.model, writer.value.result.usage)
  return writer.value.restored ? { ...lines, spent: lines.spent.replace(/^Расход:/, 'Расход тогда:') } : lines
})
/** «Описания … с …: N токенов» и «Бюджет ИИ: осталось … — примерно на N таких описаний» (24.11.2026) */
const writerBudgetLines = computed(() => writer.value?.state === 'done' && writer.value.result.usage && writer.value.result.budget
  ? aiBudgetLines(writer.value.result.model, writer.value.result.budget, writer.value.result.usage)
  : null)

async function writeTexts() {
  // Товар не прочитан — писать не из чего; карточка «Из поста» об этом уже говорит
  if (!offerId || !draft.value?.name || writer.value?.state === 'writing')
    return
  writer.value = { state: 'writing' }
  try {
    const result = await adminFetch<WrittenOfferProduct>('/api/admin/content-writer/product', { method: 'POST', body: { id: offerId, item: offerItem } })
    writer.value = { state: 'done', result, filled: null, restored: false }
    fillForm(result)
  }
  catch (e) {
    writer.value = { state: 'error', message: errorText(e, 'ИИ не ответил') }
  }
}

/** Ответ, написанный раньше: токены за него уже заплачены — второй раз не просим */
function restoreTexts(saved: SavedOfferProduct) {
  const result: WrittenOfferProduct = { ...saved, savedAt: saved.writtenAt }
  writer.value = { state: 'done', result, filled: null, restored: true }
  fillForm(result)
}

function fillForm(result: WrittenOfferProduct) {
  aiFill.value = {
    name: result.name,
    description: result.description,
    seoDescription: result.seoDescription,
    categoryId: result.category?.id ?? null,
    brandId: result.brand?.id ?? null,
  }
}

/** «26.11 в 14:05» — по Алматы */
/** «1 200 в мес.» — неразрывные пробелы, как у цен */
function formatSearches(n: number): string {
  return `${n.toLocaleString('ru-RU').replace(/\s/g, '\u00A0')}\u00A0в\u00A0мес.`
}

function savedWhen(iso: string): string {
  const parts = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
  return `${part('day')}.${part('month')} в ${part('hour')}:${part('minute')}`
}

function onAiFilled(fields: string[]) {
  if (writer.value?.state === 'done')
    writer.value.filled = fields
}

/** Окно «Создать новый бренд» формы — с названием, которое прочитал ИИ */
function createNewBrand() {
  if (writer.value?.state === 'done' && writer.value.result.newBrand)
    productForm.value?.openBrandDialog(writer.value.result.newBrand)
}

/** Уже в заказе — из таблицы «В заказ» убираем, иначе поставщику ушло бы дважды */
function forgetPick() {
  if (pickKeys.some(k => picks.value[k]))
    picks.value = Object.fromEntries(Object.entries(picks.value).filter(([k]) => !pickKeys.includes(k)))
}

/** Товар — в формирующийся заказ поставщика; не вышло — скрытым он не останется */
async function addToSupplierOrder(product: { id: string, slug: string | null }, quantity: number, showOnReceipt: boolean): Promise<{ hidden: boolean }> {
  try {
    const res = await adminFetch<{ number: number, positions: number, created: boolean }>('/api/admin/deliveries/add', {
      method: 'POST',
      body: { productId: product.id, quantity, showOnReceipt },
    })
    forgetPick()
    toast.success(`В заказ №${res.number} поставщику — ${quantity} шт.`, {
      description: [
        `${res.created ? 'Новый заказ' : 'Заказ формируется'}: ${res.positions} ${pluralPositions(res.positions)}.`,
        showOnReceipt ? 'Товар скрыт с сайта и появится, когда поставку примут.' : '',
      ].filter(Boolean).join(' '),
      action: { label: 'Поставки', onClick: () => router.push('/admin/deliveries') },
      duration: 10000,
    })
    return { hidden: showOnReceipt }
  }
  catch (e) {
    let hidden = false
    if (showOnReceipt) {
      const { error } = await supabase.from('products').update({ is_active: true }).eq('id', product.id)
      hidden = Boolean(error)
    }
    toast.warning('Товар создан, но в заказ поставщику не попал', {
      description: `${errorText(e, 'Сервер не ответил')}. ${hidden ? 'Товар скрыт с сайта — включите «Активен» в карточке товара.' : 'Он на сайте; заказать его можно в «К закупке».'}`,
      duration: 15000,
    })
    return { hidden }
  }
}

const initialSku = ref('')
const isSearchingSku = ref(false)
const initialBarcode = ref('')
const isSearchingBarcode = ref(false)

/**
 * Ищет товар по артикулу (SKU).
 * Если найден - перенаправляет на страницу редактирования.
 * Если не найден - уведомляет пользователя.
 */
async function searchProductBySku() {
  const sku = initialSku.value.trim()
  if (!sku) {
    return
  }
  isSearchingSku.value = true
  const product = await adminProductsStore.fetchProductBySku(sku)
  isSearchingSku.value = false

  if (product) {
    // Товар найден, перенаправляем на страницу редактирования
    toast.success(`Товар с артикулом "${sku}" найден.`, {
      description: 'Перенаправление на страницу редактирования...',
    })
    router.push(`/admin/products/${product.id}`)
  }
  else {
    // Товар не найден, уведомляем и позволяем создавать новый
    toast.info(`Товар с артикулом "${sku}" не найден.`, {
      description: 'Вы можете создать новый товар с этим артикулом.',
    })
  }
}

async function searchProductByBarcode() {
  const barcode = initialBarcode.value.trim()
  if (!barcode)
    return

  isSearchingBarcode.value = true
  const product = await adminProductsStore.fetchProductByBarcode(barcode)
  isSearchingBarcode.value = false

  if (product) {
    toast.success(`Товар со штрихкодом "${barcode}" найден.`)
    router.push(`/admin/products/${product.id}`)
  }
  else {
    toast.info(`Товар со штрихкодом "${barcode}" не найден.`)
  }
}

/**
 * Обработчик события @create от компонента ProductForm.
 */
const isCreating = ref(false)

async function handleCreate(payload: {
  data: ProductInsert
  newImageFiles: File[]
  attributeValues: AttributeValuePayload[]
}) {
  // Второй клик, пока создаётся товар, — не второй товар
  if (isCreating.value)
    return
  isCreating.value = true
  try {
    await createFromForm(payload)
  }
  finally {
    isCreating.value = false
  }
}

async function createFromForm(payload: {
  data: ProductInsert
  newImageFiles: File[]
  attributeValues: AttributeValuePayload[]
}) {
  const sku = initialSku.value.trim()
  if (sku && !payload.data.sku) {
    payload.data.sku = sku
  }

  const quantity = Math.min(Math.max(Math.round(Number(orderQuantity.value) || 0), 0), 9999)
  const ordering = Boolean(offerId) && quantity > 0 && Boolean(payload.data.supplier_id)
  // Скрыт до первой приёмки — если «Активен» не выключен вручную и остатка нет
  const showOnReceipt = ordering && payload.data.is_active !== false && !(Number(payload.data.stock_quantity) > 0)
  if (showOnReceipt)
    payload.data.is_active = false

  // Вызываем обновленный метод стора, который теперь проще
  const newProduct = await adminProductsStore.createProduct(
    payload.data,
    payload.newImageFiles,
  )

  if (newProduct) {
    if (offerId) {
      await adminFetch('/api/admin/supplier-offers/status', { method: 'POST', body: { ids: [offerId], status: 'added' } })
        .catch(() => toast.warning('Товар создан, но у поставщика не отмечен «Добавлен» — отметьте вручную'))
    }
    let hidden = payload.data.is_active === false
    if (ordering) {
      const added = await addToSupplierOrder(newProduct, quantity, showOnReceipt)
      if (showOnReceipt)
        hidden = added.hidden
    }
    else if (offerId && quantity > 0) {
      toast.warning('В заказ поставщику товар не попал — в форме не выбран поставщик')
    }
    const valuesToSave = payload.attributeValues.map(value => ({
      ...value,
      product_id: newProduct.id, // Используем ID из `newProduct`
    }))
    await adminProductsStore.saveProductAttributeValues(newProduct.id, valuesToSave)

    // 🔥 КРИТИЧНО: Очищаем список товаров в Pinia store после создания
    // Это нужно, чтобы на странице списка товаров появился новый товар
    adminProductsStore.products = []

    // ✅ Уведомляем поисковики о новом товаре — скрытый скажет о себе при приёмке
    if (newProduct.slug && !hidden) {
      try {
        await notifyProduct(newProduct.slug)
        toast.success('✅ Товар создан и отправлен в поисковики')
      }
      catch (error) {
        console.error('SEO notification error:', error)
        toast.warning('⚠️ Товар создан, но не удалось уведомить поисковики')
      }
    }

    router.push('/admin/products')
  }
}
</script>

<template>
  <div class="p-4 md:p-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold mb-6">
        Новый товар
      </h1>

      <Card class="mb-8">
        <CardHeader>
          <CardTitle>Быстрый доступ по артикулу (SKU)</CardTitle>
          <CardDescription>
            Введите артикул существующего товара, чтобы перейти к его редактированию.
            Или оставьте поле пустым для создания нового товара.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex items-end gap-4">
            <div class="flex-grow">
              <Label for="sku-search">Артикул товара</Label>
              <Input
                id="sku-search"
                v-model="initialSku"
                placeholder="Например, LEGO-75313"
                @keyup.enter="searchProductBySku"
              />
            </div>
            <Button
              type="button"
              :disabled="isSearchingSku || !initialSku"
              @click="searchProductBySku"
            >
              <div v-if="isSearchingSku" class="flex items-center">
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Поиск...
              </div>
              <span v-else>Найти</span>
            </Button>
          </div>
          <div class="flex items-end gap-4">
            <div class="flex-grow">
              <Label for="barcode-search">Поиск по Штрихкоду</Label>
              <Input
                id="barcode-search" v-model="initialBarcode"
                @keyup.enter="searchProductByBarcode"
              />
            </div>
            <Button type="button" :disabled="isSearchingBarcode || !initialBarcode" @click="searchProductByBarcode">
              Найти
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card v-if="offer" class="mb-8" data-testid="draft-source">
        <CardHeader>
          <CardTitle>Из поста поставщика{{ offer.supplierName ? ` — ${offer.supplierName}` : '' }}</CardTitle>
          <CardDescription>
            <template v-if="draft?.name">
              Подставлено, что прочитал ИИ: название, артикул, закупочная цена, поставщик и фото. Тексты, раздел и бренд подбирает ИИ — ниже. Розничную цену задайте сами.
            </template>
            <template v-else>
              ИИ не прочитал товар в этом посте — подставлены только поставщик и фото.
            </template>
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <p v-if="existingBySku" class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="draft-duplicate">
            Артикул {{ draft?.sku }} уже есть на сайте: «{{ existingBySku.name }}».
            <NuxtLink :to="`/admin/products/${existingBySku.id}`" class="font-medium underline">
              Открыть товар
            </NuxtLink>
          </p>
          <p class="line-clamp-4 whitespace-pre-line break-words text-sm text-muted-foreground" data-testid="draft-caption">
            {{ offer.caption || 'Без подписи' }}
          </p>
          <a :href="offer.postUrl" target="_blank" rel="noopener" class="text-sm text-primary hover:underline">Пост в Telegram</a>
        </CardContent>
      </Card>

      <Card v-if="writer || (offer && draft?.name)" class="mb-8" data-testid="ai-writer">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Sparkles class="w-5 h-5" />
            Тексты от ИИ
          </CardTitle>
          <CardDescription>
            <template v-if="!writer">
              ИИ напишет название, описание и SEO-описание, подберёт раздел и бренд — обычно 10–30 секунд. Токены тратятся, только когда нажмёте «Сгенерировать»; ответ сохранится, и после перезагрузки страницы писать заново не придётся.
            </template>
            <template v-else-if="writer.state === 'writing'">
              ИИ пишет название и описание, подбирает раздел и бренд — обычно 10–30 секунд.
            </template>
            <template v-else-if="writer.state === 'done'">
              {{ modelLabel(writer.result.model) }}{{ writer.result.photo ? ', по фото и подписи поста' : ', по подписи поста' }}. Проверьте тексты перед сохранением.
            </template>
            <template v-else>
              Тексты не написаны — в форме то, что прочитано с фото.
            </template>
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-3 text-sm">
          <Button
            v-if="!writer"
            type="button"
            size="sm"
            data-testid="ai-writer-start"
            @click="writeTexts"
          >
            <Sparkles class="mr-2 h-4 w-4" />
            Сгенерировать
          </Button>
          <p v-else-if="writer.state === 'writing'" class="flex items-center gap-2 text-muted-foreground" data-testid="ai-writer-status">
            <LoaderCircle class="w-4 h-4 animate-spin" />
            Пишу…
          </p>
          <p v-else-if="writer.state === 'error'" class="text-destructive" data-testid="ai-writer-error">
            {{ writer.message }}
          </p>
          <template v-else>
            <p v-if="writer.result.savedAt" class="text-muted-foreground" data-testid="ai-writer-saved">
              <template v-if="writer.restored">
                Написано {{ savedWhen(writer.result.savedAt) }} — взято сохранённое, токены не потрачены.
              </template>
              <template v-else>
                Ответ сохранён — после перезагрузки страницы он вернётся без новых трат.
              </template>
            </p>
            <p v-if="writer.filled" data-testid="ai-writer-filled">
              {{ writer.filled.length ? `Подставлено в форму: ${writer.filled.join(', ')}.` : 'Эти поля вы уже заполнили сами — ответ ИИ не подставлен.' }}
            </p>
            <p data-testid="ai-writer-category">
              Раздел: {{ writer.result.category?.path ?? 'ИИ не подобрал — выберите в форме' }}
            </p>
            <p data-testid="ai-writer-brand">
              Бренд:
              <template v-if="writer.result.brand">
                {{ writer.result.brand.name }}
              </template>
              <template v-else-if="writer.result.newBrand">
                «{{ writer.result.newBrand }}» — такого на сайте нет
              </template>
              <template v-else>
                на товаре не указан — оставлен пустым
              </template>
            </p>
            <div v-if="writer.result.demand" data-testid="ai-writer-demand">
              <template v-if="writer.result.demand.length">
                <p>Написано под запросы покупателей:</p>
                <ul class="list-disc pl-5 break-words">
                  <li v-for="p in writer.result.demand" :key="p.phrase">
                    «{{ p.phrase }}» — {{ formatSearches(p.volume) }}
                  </li>
                </ul>
              </template>
              <p v-else class="text-muted-foreground">
                Спроса по этому товару нет — текст написан без запросов покупателей.
              </p>
            </div>
            <ul v-if="writer.result.warnings.length" class="list-disc space-y-1 pl-5 text-amber-700" data-testid="ai-writer-warnings">
              <li v-for="w in writer.result.warnings" :key="w">
                {{ w }}
              </li>
            </ul>
            <p v-if="writerUsage" class="text-muted-foreground" data-testid="ai-writer-usage">
              <span class="block">{{ writerUsage.spent }}</span>
              <template v-if="writerBudgetLines">
                <span class="block">{{ writerBudgetLines.writer }}</span>
                <span class="block font-medium text-foreground" data-testid="ai-writer-budget">{{ writerBudgetLines.left }}</span>
                <span v-if="writerBudgetLines.cache" class="block text-xs">{{ writerBudgetLines.cache }}</span>
              </template>
              <span v-if="writerUsage.rate" class="block text-xs">{{ writerUsage.rate }}</span>
            </p>
          </template>

          <div v-if="writer?.state === 'done' && writer.result.newBrand" class="space-y-2 rounded-md border p-3" data-testid="ai-brand">
            <p v-if="createdBrand">
              Бренд «{{ createdBrand.name }}» создан и выбран в форме.
            </p>
            <template v-else>
              <p class="text-muted-foreground">
                ИИ бренды в интернете не ищет — заполните бренд сами: в окне бренда есть кнопка «Промпт для нейросети» для его страницы.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-auto max-w-full whitespace-normal text-left"
                data-testid="ai-brand-create"
                @click="createNewBrand"
              >
                <Plus class="mr-2 h-4 w-4 shrink-0" />
                Создать бренд «{{ writer.result.newBrand }}»
              </Button>
            </template>
          </div>

          <Button
            v-if="writer && writer.state !== 'writing'"
            type="button"
            variant="outline"
            size="sm"
            data-testid="ai-writer-retry"
            @click="writeTexts"
          >
            <RefreshCw class="mr-2 h-4 w-4" />
            {{ writer.state === 'error' ? 'Повторить' : 'Написать заново' }}
          </Button>
        </CardContent>
      </Card>

      <Card v-if="offer" class="mb-8" data-testid="supplier-order">
        <CardContent class="space-y-2 text-sm">
          <div class="flex flex-wrap items-center gap-2">
            <Label for="supplier-order-qty" class="mb-0 font-medium">В заказ поставщику</Label>
            <Input
              id="supplier-order-qty"
              v-model.number="orderQuantity"
              type="number"
              inputmode="numeric"
              min="0"
              max="9999"
              class="h-9 w-20 text-center tabular-nums"
              data-testid="supplier-order-qty"
            />
            <span>шт.</span>
          </div>
          <p class="text-muted-foreground" data-testid="supplier-order-hint">
            <template v-if="Number(orderQuantity) > 0">
              После «Создать» товар ляжет в заказ своему поставщику — «Поставки» в «Умном закупе». До приёмки он скрыт с сайта:
              не привезёт поставщик — пустой карточки на сайте не будет.
            </template>
            <template v-else>
              0 — товар в заказ не попадёт и сразу будет на сайте.
            </template>
          </p>
          <p v-if="pickedQuantity" class="text-xs text-muted-foreground" data-testid="supplier-order-picked">
            Количество — из «В заказ» на «Товарах поставщиков».
          </p>
        </CardContent>
      </Card>

      <ProductForm ref="productForm" :draft="draft" :ai-fill="aiFill" @create="handleCreate" @ai-filled="onAiFilled" @brand-created="createdBrand = $event" />
    </div>
  </div>
</template>
