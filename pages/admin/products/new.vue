<script setup lang="ts">
import type { AttributeValuePayload, Database, ProductInsert } from '@/types'
import type { AiProductFill, WrittenOfferProduct } from '@/utils/aiWriter'
import type { OfferDraftSource } from '@/utils/supplierOfferList'
import { LoaderCircle, Plus, RefreshCw, Sparkles } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import ProductForm from '@/components/admin/products/ProductForm.vue'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'
import { adminFetch } from '@/utils/adminFetch'
import { aiBudgetLines, aiUsageLines } from '@/utils/aiCost'
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

onMounted(async () => {
  if (!offerId)
    return
  try {
    offer.value = await adminFetch<OfferDraftSource>('/api/admin/supplier-offers/draft', { query: { id: offerId } })
  }
  catch (e: any) {
    toast.error(e?.data?.message || 'Товар поставщика не загрузился')
    return
  }
  // Своим запросом, не fetchProductBySku: тот на «не найдено» отвечает 406 и тянет весь товар
  writeTexts()
  const sku = draft.value?.sku
  if (sku) {
    const { data } = await supabase.from('products').select('id, name').eq('sku', sku).limit(1)
    existingBySku.value = data?.[0] ?? null
  }
})

/*
 * «Тексты для сайта» (23 ноября 2026): сразу после «На сайт» ИИ пишет
 * название, описание и SEO-описание, подбирает раздел и бренд
 * (server/utils/contentWriter.ts). Бренда на сайте нет — ИИ только называет
 * его, а заполняет бренд человек: кнопка открывает окно «Создать новый бренд»
 * формы с этим названием. Поиск бренда в интернете убран 24.11.2026 —
 * «чтобы не уходила много денег на бренд».
 */
const errorText = (e: any, fallback: string) => e?.data?.message || e?.statusMessage || fallback
type WriterState
  = | { state: 'writing' }
    | { state: 'done', result: WrittenOfferProduct, filled: string[] | null }
    | { state: 'error', message: string }
const writer = ref<WriterState | null>(null)
const aiFill = ref<AiProductFill | null>(null)
const productForm = ref<InstanceType<typeof ProductForm> | null>(null)
/** Бренд, созданный в окне формы, — карточка говорит, что он выбран */
const createdBrand = ref<{ id: string, name: string } | null>(null)
/** «Расход: … токенов ≈ … ₸» под ответом ИИ (24.11.2026); ответ старой сборки без usage — строки нет */
const writerUsage = computed(() => writer.value?.state === 'done' && writer.value.result.usage
  ? aiUsageLines(writer.value.result.model, writer.value.result.usage)
  : null)
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
    writer.value = { state: 'done', result, filled: null }
    aiFill.value = {
      name: result.name,
      description: result.description,
      seoDescription: result.seoDescription,
      categoryId: result.category?.id ?? null,
      brandId: result.brand?.id ?? null,
    }
  }
  catch (e) {
    writer.value = { state: 'error', message: errorText(e, 'ИИ не ответил') }
  }
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
    const valuesToSave = payload.attributeValues.map(value => ({
      ...value,
      product_id: newProduct.id, // Используем ID из `newProduct`
    }))
    await adminProductsStore.saveProductAttributeValues(newProduct.id, valuesToSave)

    // 🔥 КРИТИЧНО: Очищаем список товаров в Pinia store после создания
    // Это нужно, чтобы на странице списка товаров появился новый товар
    adminProductsStore.products = []

    // ✅ Уведомляем поисковики о новом товаре
    if (newProduct.slug) {
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

      <Card v-if="writer" class="mb-8" data-testid="ai-writer">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Sparkles class="w-5 h-5" />
            Тексты от ИИ
          </CardTitle>
          <CardDescription>
            <template v-if="writer.state === 'writing'">
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
          <p v-if="writer.state === 'writing'" class="flex items-center gap-2 text-muted-foreground" data-testid="ai-writer-status">
            <LoaderCircle class="w-4 h-4 animate-spin" />
            Пишу…
          </p>
          <p v-else-if="writer.state === 'error'" class="text-destructive" data-testid="ai-writer-error">
            {{ writer.message }}
          </p>
          <template v-else>
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
              </template>
              <span v-if="writerUsage.rate" class="block text-xs">{{ writerUsage.rate }}</span>
            </p>
          </template>

          <div v-if="writer.state === 'done' && writer.result.newBrand" class="space-y-2 rounded-md border p-3" data-testid="ai-brand">
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
            v-if="writer.state !== 'writing'"
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

      <ProductForm ref="productForm" :draft="draft" :ai-fill="aiFill" @create="handleCreate" @ai-filled="onAiFilled" @brand-created="createdBrand = $event" />
    </div>
  </div>
</template>
