<script setup lang="ts">
import { toast } from 'vue-sonner'

const { reindexAllProducts } = useSeoIndexing()
const loading = ref(false)
const showConfirm = ref(false)

async function handleReindex() {
  if (!showConfirm.value) {
    showConfirm.value = true
    return
  }

  loading.value = true
  showConfirm.value = false

  try {
    const result = await reindexAllProducts()

    toast.success(
      `✅ Успешно! Отправлено ${result.submitted} из ${result.total} товаров`,
      { duration: 5000 },
    )

    if (result.failedBatches > 0) {
      toast.warning(
        `⚠️ ${result.failedBatches} батчей не удалось отправить`,
        { duration: 5000 },
      )
    }
  }
  catch (error: any) {
    toast.error(`❌ Ошибка: ${error.data?.message || error.message}`)
  }
  finally {
    loading.value = false
  }
}

function cancelReindex() {
  showConfirm.value = false
}
</script>

<template>
  <div class="space-y-2">
    <button
      v-if="!showConfirm"
      :disabled="loading"
      class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      @click="handleReindex"
    >
      <Icon v-if="!loading" name="lucide:refresh-cw" class="w-4 h-4" />
      <Icon v-else name="lucide:loader-2" class="w-4 h-4 animate-spin" />
      <span>{{ loading ? 'Отправка...' : 'Переиндексировать все товары' }}</span>
    </button>

    <!-- Подтверждение -->
    <div v-if="showConfirm" class="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <div class="flex items-start gap-3">
        <Icon name="lucide:alert-triangle" class="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div class="flex-1">
          <h3 class="font-semibold text-yellow-900 mb-1">
            Подтвердите массовую переиндексацию
          </h3>
          <p class="text-sm text-yellow-800 mb-3">
            Это отправит все активные товары в Yandex и Bing.
            Процесс может занять несколько минут.
          </p>
          <div class="flex gap-2">
            <button
              :disabled="loading"
              class="px-3 py-1.5 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 text-sm font-medium"
              @click="handleReindex"
            >
              Да, начать переиндексацию
            </button>
            <button
              class="px-3 py-1.5 bg-white border border-yellow-300 text-yellow-900 rounded hover:bg-yellow-50 text-sm font-medium"
              @click="cancelReindex"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Описание -->
    <p class="text-sm text-gray-600">
      💡 Используйте это один раз для отправки существующих товаров.
      Новые товары отправляются автоматически при сохранении.
    </p>
  </div>
</template>
