<script setup lang="ts">
import type { AttributeValuePayload, ProductImageRow, ProductUpdate } from '@/types'
import { toast } from 'vue-sonner'
import ProductForm from '@/components/admin/products/ProductForm.vue'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'

definePageMeta({ layout: 'admin' })

const adminProductsStore = useAdminProductsStore()
const route = useRoute()
const router = useRouter()
const productId = route.params.id as string
const { clearProductCache } = useCacheManager()

// ✅ Добавляем SEO composable
const { notifyProduct } = useSeoIndexing()

// ✅ Генерация вопросов
const { generateQuestionsForProduct } = useProductQuestions()
const isGeneratingQuestions = ref(false)

async function handleGenerateQuestions() {
  const price = data.value?.price || 0
  const isPremium = price > 50000

  if (isPremium) {
    const confirmed = confirm(
      `💎 Премиум-товар (${price.toLocaleString('ru-KZ')} ₸)\n\n`
      + 'Будут сгенерированы:\n'
      + '✅ Базовые вопросы (SQL)\n'
      + '✨ AI-вопросы через Claude (уникальные)\n\n'
      + 'Продолжить?',
    )
    if (!confirmed)
      return
  }

  isGeneratingQuestions.value = true
  const success = await generateQuestionsForProduct(productId)
  isGeneratingQuestions.value = false

  if (success) {
    toast.success(
      isPremium
        ? '✨ Умные вопросы сгенерированы (базовые + AI)!'
        : '✨ Базовые вопросы сгенерированы!',
      { duration: 4000 },
    )
    await hardRefresh()
  }
  else {
    toast.error('Ошибка генерации вопросов')
  }
}

// 🔄 Функция для принудительного обновления данных
async function hardRefresh() {
  await clearProductCache(productId)
  await refresh()
  toast.success('🔄 Данные обновлены')
}

// --- 1. ЗАГРУЗКА ДАННЫХ ---
// Мы используем `data`, `pending`, `error` как есть, без переименования.
const { data, pending, error, refresh } = await useAsyncData(
  `admin-product-${productId}`,
  async () => {
    const product = await adminProductsStore.fetchProductById(productId)
    if (!product) {
      // Выбрасываем ошибку, которую Nuxt обработает
      throw createError({ statusCode: 404, statusMessage: 'Товар не найден', fatal: true })
    }
    return product
  },
  {
    // 🔥 При входе на страницу редактирования всегда загружаем свежие данные
    server: true, // Загружать на сервере
    lazy: false, // Не откладывать загрузку
    immediate: true, // Загружать сразу
  },
)

// --- 2. ОБРАБОТЧИК СОБЫТИЯ ---
async function handleUpdate(payload: {
  data: ProductUpdate
  newImageFiles: File[]
  imagesToDelete: string[]
  existingImages: ProductImageRow[]
  attributeValues: AttributeValuePayload[]
}) {
  const updatedProduct = await adminProductsStore.updateProduct(
    productId,
    payload.data,
    payload.newImageFiles,
    payload.imagesToDelete,
    payload.existingImages,
  )

  if (updatedProduct) {
    const valuesToSave = payload.attributeValues.map(value => ({
      ...value,
      product_id: productId,
    }))
    await adminProductsStore.saveProductAttributeValues(productId, valuesToSave)

    // 🔥 КРИТИЧНО: Очищаем кеш товара
    await clearProductCache(productId)

    // 4. Очищаем список товаров в Pinia store, чтобы он перезагрузился
    adminProductsStore.products = []

    // 🔄 ВАЖНО: Перезагружаем данные на странице
    await refresh()

    // ✅ Уведомляем поисковики об обновлении товара
    if (updatedProduct.slug) {
      try {
        await notifyProduct(updatedProduct.slug)
        toast.success('✅ Товар обновлен успешно')
      }
      catch (error) {
        console.error('SEO notification error:', error)
        toast.success('✅ Товар обновлен')
      }
    }

    // Не делаем редирект сразу - пользователь видит обновленные данные
    // router.push('/admin/products')
  }
}
</script>

<template>
  <div class="p-4 md:p-8">
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-3xl font-bold">
          Редактирование товара
        </h1>
        <div class="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            @click="router.push('/admin/products')"
          >
            <Icon name="lucide:arrow-left" class="w-4 h-4 mr-2" />
            К списку
          </Button>
          <Button
            variant="secondary"
            size="sm"
            :disabled="isGeneratingQuestions"
            @click="handleGenerateQuestions"
          >
            <Icon
              :name="isGeneratingQuestions ? 'lucide:loader-2' : 'lucide:sparkles'"
              class="w-4 h-4 mr-2"
              :class="{ 'animate-spin': isGeneratingQuestions }"
            />
            {{ isGeneratingQuestions ? 'Генерация...' : 'Сгенерировать FAQ' }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            @click="hardRefresh"
          >
            <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-2" />
            Обновить данные
          </Button>
        </div>
      </div>
      <div v-if="pending" class="text-center py-20">
        Загрузка данных о товаре...
      </div>
      <ProductForm
        v-else-if="data"
        :initial-data="data"
        @update="handleUpdate"
      />
      <div v-else class="text-center py-20 text-destructive">
        <p>Не удалось загрузить товар. Возможно, он был удален или произошла ошибка.</p>
        <p v-if="error">
          {{ error.statusMessage }}
        </p>
      </div>
    </div>
  </div>
</template>
