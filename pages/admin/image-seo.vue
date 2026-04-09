<script setup lang="ts">
import { RefreshCw, Image, CheckCircle2, AlertCircle } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

definePageMeta({ layout: 'admin' })

const isGenerating = ref(false)
const stats = ref({
  total: 0,
  updated: 0,
  skipped: 0,
  errors: 0
})

async function generateAltTexts() {
  if (isGenerating.value) return
  
  isGenerating.value = true
  stats.value = { total: 0, updated: 0, skipped: 0, errors: 0 }
  
  try {
    const response = await $fetch('/api/generate-alt-texts', {
      method: 'POST'
    })
    
    stats.value = {
      total: response.total,
      updated: response.updated,
      skipped: response.skipped,
      errors: 0
    }
    
    toast.success('Alt-тексты обновлены', {
      description: `Обновлено: ${response.updated}, Пропущено: ${response.skipped}`
    })
  } catch (error: any) {
    toast.error('Ошибка генерации', {
      description: error.message || 'Не удалось сгенерировать alt-тексты'
    })
    stats.value.errors = 1
  } finally {
    isGenerating.value = false
  }
}
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto">
    <div class="mb-6">
      <h1 class="text-2xl font-bold mb-2">Генерация Alt-текстов для изображений</h1>
      <p class="text-muted-foreground">
        Автоматическая генерация SEO-оптимизированных alt-текстов для всех изображений товаров
      </p>
    </div>

    <!-- Информация -->
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <h3 class="font-semibold mb-2 flex items-center gap-2">
        <Image class="w-5 h-5" />
        Как это работает
      </h3>
      <ul class="text-sm space-y-1 text-muted-foreground">
        <li>• Генерирует alt-тексты по формуле: [Бренд] [Название] [Серия] [Контекст]</li>
        <li>• Первое фото: "купить в Казахстане" (локальное SEO)</li>
        <li>• Второе фото: "вид сбоку"</li>
        <li>• Третье фото: "детальное фото"</li>
        <li>• Последнее фото: "в упаковке"</li>
        <li>• Пропускает изображения с уже качественными alt-текстами</li>
      </ul>
    </div>

    <!-- Кнопка генерации -->
    <div class="bg-white border rounded-lg p-6 mb-6">
      <Button
        @click="generateAltTexts"
        :disabled="isGenerating"
        size="lg"
        class="w-full"
      >
        <RefreshCw :class="['w-5 h-5 mr-2', isGenerating && 'animate-spin']" />
        {{ isGenerating ? 'Генерация...' : 'Сгенерировать Alt-тексты' }}
      </Button>
    </div>

    <!-- Статистика -->
    <div v-if="stats.total > 0" class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-white border rounded-lg p-4">
        <div class="flex items-center gap-2 mb-2">
          <CheckCircle2 class="w-5 h-5 text-green-600" />
          <span class="font-semibold">Обновлено</span>
        </div>
        <p class="text-3xl font-bold text-green-600">{{ stats.updated }}</p>
      </div>

      <div class="bg-white border rounded-lg p-4">
        <div class="flex items-center gap-2 mb-2">
          <Image class="w-5 h-5 text-blue-600" />
          <span class="font-semibold">Пропущено</span>
        </div>
        <p class="text-3xl font-bold text-blue-600">{{ stats.skipped }}</p>
        <p class="text-xs text-muted-foreground mt-1">Уже есть качественные alt-тексты</p>
      </div>

      <div class="bg-white border rounded-lg p-4">
        <div class="flex items-center gap-2 mb-2">
          <AlertCircle class="w-5 h-5 text-orange-600" />
          <span class="font-semibold">Всего</span>
        </div>
        <p class="text-3xl font-bold">{{ stats.total }}</p>
      </div>
    </div>

    <!-- Примеры -->
    <div class="bg-white border rounded-lg p-6 mt-6">
      <h3 class="font-semibold mb-4">Примеры сгенерированных alt-текстов</h3>
      <div class="space-y-2 text-sm">
        <div class="flex items-start gap-2">
          <CheckCircle2 class="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
          <span class="text-muted-foreground">LEGO Конструктор Железный Человек Marvel купить в Казахстане</span>
        </div>
        <div class="flex items-start gap-2">
          <CheckCircle2 class="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
          <span class="text-muted-foreground">Barbie Кукла Принцесса Disney вид сбоку</span>
        </div>
        <div class="flex items-start gap-2">
          <CheckCircle2 class="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
          <span class="text-muted-foreground">Hot Wheels Трек Мертвая петля детальное фото</span>
        </div>
      </div>
    </div>
  </div>
</template>
