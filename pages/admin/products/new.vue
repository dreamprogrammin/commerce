<script setup lang="ts">
import type { AttributeValuePayload, Database, ProductInsert } from '@/types'
import type { OfferDraftSource } from '@/utils/supplierOfferList'
import { toast } from 'vue-sonner'
import ProductForm from '@/components/admin/products/ProductForm.vue'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'
import { adminFetch } from '@/utils/adminFetch'
import { productDraft } from '@/utils/supplierOfferList'

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
  const sku = draft.value?.sku
  if (sku) {
    const { data } = await supabase.from('products').select('id, name').eq('sku', sku).limit(1)
    existingBySku.value = data?.[0] ?? null
  }
})

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
async function handleCreate(payload: {
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
              Подставлено, что прочитал ИИ: название, артикул, закупочная цена, поставщик и фото. Проверьте и задайте розничную цену, категорию и бренд.
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

      <ProductForm :draft="draft" @create="handleCreate" />
    </div>
  </div>
</template>
