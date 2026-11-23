<script setup lang="ts">
import type { AttributeValuePayload, Database, ProductInsert } from '@/types'
import type { AiProductFill, BrandPage, BrandResearch, WrittenOfferProduct } from '@/utils/aiWriter'
import type { OfferDraftSource } from '@/utils/supplierOfferList'
import { ExternalLink, LoaderCircle, RefreshCw, Sparkles } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import ProductForm from '@/components/admin/products/ProductForm.vue'
import { useAdminBrandsStore } from '@/stores/adminStore/adminBrandsStore'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'
import { adminFetch } from '@/utils/adminFetch'
import { modelLabel, productDraft } from '@/utils/supplierOfferList'

definePageMeta({ layout: 'admin' })

const adminProductsStore = useAdminProductsStore()
const brandsStore = useAdminBrandsStore()
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
 * (server/utils/contentWriter.ts). Бренда на сайте нет — ищет его в интернете
 * и пишет страницу; бренд создаётся по «Создать товар», если галочка стоит.
 */
const errorText = (e: any, fallback: string) => e?.data?.message || e?.statusMessage || fallback
type WriterState
  = | { state: 'writing' }
    | { state: 'done', result: WrittenOfferProduct, filled: string[] | null }
    | { state: 'error', message: string }
type FoundBrand = Extract<BrandResearch, { found: true }>
type BrandState
  = | { state: 'searching', name: string }
    | { state: 'found', name: string, research: FoundBrand, create: boolean }
    | { state: 'existing', name: string, existing: { id: string, name: string } }
    | { state: 'missing', name: string, reason: string, searches: number }
    | { state: 'error', name: string, message: string }
    | { state: 'created', name: string, id: string }
const writer = ref<WriterState | null>(null)
const brandAi = ref<BrandState | null>(null)
const aiFill = ref<AiProductFill | null>(null)

async function writeTexts() {
  // Товар не прочитан — писать не из чего; карточка «Из поста» об этом уже говорит
  if (!offerId || !draft.value?.name || writer.value?.state === 'writing')
    return
  writer.value = { state: 'writing' }
  // «Написать заново» — бренд не ищем второй раз: поиск в интернете платный
  const searched = brandAi.value && brandAi.value.state !== 'searching' && brandAi.value.state !== 'error' ? brandAi.value : null
  brandAi.value = searched
  try {
    const result = await adminFetch<WrittenOfferProduct>('/api/admin/content-writer/product', { method: 'POST', body: { id: offerId, item: offerItem } })
    writer.value = { state: 'done', result, filled: null }
    const createdId = brandAi.value?.state === 'created' ? brandAi.value.id : null
    aiFill.value = {
      name: result.name,
      description: result.description,
      seoDescription: result.seoDescription,
      categoryId: result.category?.id ?? null,
      brandId: result.brand?.id ?? createdId,
    }
    if (searched?.state === 'existing')
      aiFill.value.brandId ??= searched.existing.id
    else if (!result.brand && result.newBrand && !createdId && searched?.name !== result.newBrand)
      researchBrand(result.newBrand, result.name || draft.value.name)
    else if (!result.newBrand && searched?.state !== 'created')
      brandAi.value = null
  }
  catch (e) {
    writer.value = { state: 'error', message: errorText(e, 'ИИ не ответил') }
  }
}

function onAiFilled(fields: string[]) {
  if (writer.value?.state === 'done')
    writer.value.filled = fields
}

async function researchBrand(name: string, product: string) {
  brandAi.value = { state: 'searching', name }
  try {
    const research = await adminFetch<BrandResearch>('/api/admin/content-writer/brand', {
      method: 'POST',
      body: { name, product, article: draft.value?.sku ?? null },
    })
    if (!research.found) {
      brandAi.value = { state: 'missing', name, reason: research.reason, searches: research.searches }
    }
    else if (research.existing) {
      brandAi.value = { state: 'existing', name, existing: research.existing }
      if (aiFill.value)
        aiFill.value = { ...aiFill.value, brandId: research.existing.id }
    }
    else if (research.page) {
      brandAi.value = { state: 'found', name, research, create: true }
    }
  }
  catch (e) {
    brandAi.value = { state: 'error', name, message: errorText(e, 'Поиск бренда не ответил') }
  }
}

/** Поля страницы бренда — для просмотра перед созданием */
function brandPageRows(page: BrandPage) {
  return [
    { label: 'Заголовок страницы', value: page.meta_title },
    { label: 'H1', value: page.seo_h1 },
    { label: 'SEO описание', value: page.seo_description },
    { label: 'Ключевые слова', value: page.seo_keywords.join(', ') },
  ]
}

/** Страница бренда — текстом для просмотра: разметку покажет сайт */
const pageText = (html: string) => html.replace(/<\/(?:h2|h3|p|li)>/g, '\n').replace(/<[^>]*>/g, '').replace(/\n{2,}/g, '\n').trim()

/**
 * Бренд из поиска — по «Создать товар», если галочка стоит и бренд в форме
 * не выбран руками. Создан — тот же id и при повторной попытке.
 */
async function brandForProduct(chosen: string | null | undefined): Promise<string | null | false> {
  const b = brandAi.value
  if (chosen)
    return chosen
  if (b?.state === 'created')
    return b.id
  if (b?.state !== 'found' || !b.create || !b.research.page)
    return null
  const page = b.research.page
  const created = await brandsStore.createBrand({
    name: page.name,
    slug: page.slug,
    meta_title: page.meta_title || null,
    seo_h1: page.seo_h1 || null,
    seo_description: page.seo_description || null,
    seo_keywords: page.seo_keywords.length ? page.seo_keywords : null,
    description: page.description || null,
  }, null)
  // Ошибку показал стор; товар не создаём, чтобы не потерять бренд молча
  if (!created)
    return false
  brandAi.value = { state: 'created', name: created.name, id: created.id }
  await adminProductsStore.fetchAllBrands()
  if (aiFill.value)
    aiFill.value = { ...aiFill.value, brandId: created.id }
  return created.id
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
  // Второй клик, пока создаётся бренд или товар, — не второй товар
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

  const brandId = await brandForProduct(payload.data.brand_id)
  if (brandId === false)
    return
  payload.data.brand_id = brandId

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
                «{{ writer.result.newBrand }}» — такого на сайте нет, подробности ниже
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
          </template>

          <div v-if="brandAi" class="space-y-2 rounded-md border p-3" data-testid="ai-brand">
            <p v-if="brandAi.state === 'searching'" class="flex items-center gap-2 text-muted-foreground">
              <LoaderCircle class="w-4 h-4 animate-spin" />
              Ищу бренд «{{ brandAi.name }}» в интернете и пишу его страницу — до минуты.
            </p>
            <template v-else-if="brandAi.state === 'found' && brandAi.research.page">
              <p>
                Бренда «{{ brandAi.name }}» на сайте нет. ИИ нашёл его в интернете и написал страницу «{{ brandAi.research.page.name }}».
              </p>
              <label class="flex items-start gap-2 font-medium">
                <input v-model="brandAi.create" type="checkbox" class="mt-0.5 h-4 w-4" data-testid="ai-brand-create">
                Создать бренд «{{ brandAi.research.page.name }}» вместе с товаром
              </label>
              <p class="text-xs text-muted-foreground">
                Логотипа у нового бренда не будет — добавьте его потом в «Брендах». Выберете бренд в форме сами — этот не создастся.
              </p>
              <details class="rounded bg-muted/50 p-2" data-testid="ai-brand-page">
                <summary class="cursor-pointer">
                  Страница бренда
                </summary>
                <dl class="mt-2 space-y-1">
                  <div v-for="row in brandPageRows(brandAi.research.page)" :key="row.label">
                    <dt class="inline text-muted-foreground">
                      {{ row.label }}:
                    </dt>
                    <dd class="inline">
                      {{ row.value }}
                    </dd>
                  </div>
                </dl>
                <p class="mt-2 whitespace-pre-line">
                  {{ pageText(brandAi.research.page.description) }}
                </p>
              </details>
              <details class="rounded bg-muted/50 p-2">
                <summary class="cursor-pointer">
                  Что нашёл поиск{{ brandAi.research.searches ? ` — запросов в интернет: ${brandAi.research.searches}` : '' }}
                </summary>
                <p class="mt-2 whitespace-pre-line">
                  {{ brandAi.research.facts }}
                </p>
                <ul v-if="brandAi.research.sources.length" class="mt-2 space-y-1">
                  <li v-for="src in brandAi.research.sources" :key="src.url">
                    <a :href="src.url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 break-all text-primary hover:underline">
                      <ExternalLink class="h-3 w-3 shrink-0" />{{ src.title }}
                    </a>
                  </li>
                </ul>
              </details>
              <ul v-if="brandAi.research.warnings.length" class="list-disc space-y-1 pl-5 text-amber-700">
                <li v-for="w in brandAi.research.warnings" :key="w">
                  {{ w }}
                </li>
              </ul>
            </template>
            <p v-else-if="brandAi.state === 'existing'">
              Бренд «{{ brandAi.name }}» есть на сайте как «{{ brandAi.existing.name }}» — выбран в форме.
            </p>
            <p v-else-if="brandAi.state === 'missing'">
              Бренда «{{ brandAi.name }}» на сайте нет, а поиск не подтвердил, что это бренд игрушек: {{ brandAi.reason }} Бренд не создаётся — выберите его в форме или оставьте пустым.
            </p>
            <template v-else-if="brandAi.state === 'error'">
              <p class="text-destructive">
                Бренд «{{ brandAi.name }}» найти не удалось: {{ brandAi.message }}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                @click="researchBrand(brandAi.name, aiFill?.name || draft?.name || brandAi.name)"
              >
                Искать бренд снова
              </Button>
            </template>
            <p v-else-if="brandAi.state === 'created'">
              Бренд «{{ brandAi.name }}» создан.
            </p>
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

      <ProductForm :draft="draft" :ai-fill="aiFill" @create="handleCreate" @ai-filled="onAiFilled" />
    </div>
  </div>
</template>
