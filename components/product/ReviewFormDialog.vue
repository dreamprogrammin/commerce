<script setup lang="ts">
import { useReviewsStore } from '@/stores/publicStore/reviewsStore'
import { optimizeImageBeforeUpload, shouldOptimizeImage } from '@/utils/imageOptimizer'
import StarRating from './StarRating.vue'

const props = defineProps<{
  productId: string
  productName: string
  orderId: string
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'submitted': []
}>()

const reviewsStore = useReviewsStore()

const rating = ref(0)
const text = ref('')
const isSubmitting = ref(false)

// Фото
const MAX_IMAGES = 5
const imageFiles = ref<{ file: File, preview: string, blurPlaceholder?: string }[]>([])
const isOptimizing = ref(false)

async function handleImageSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files)
    return

  const remaining = MAX_IMAGES - imageFiles.value.length
  const toAdd = Array.from(files).slice(0, remaining)

  isOptimizing.value = true
  for (const file of toAdd) {
    let processedFile = file
    let blur: string | undefined

    if (shouldOptimizeImage(file)) {
      const result = await optimizeImageBeforeUpload(file)
      processedFile = result.file
      blur = result.blurPlaceholder || undefined
    }

    const preview = URL.createObjectURL(processedFile)
    imageFiles.value.push({ file: processedFile, preview, blurPlaceholder: blur })
  }
  isOptimizing.value = false
  input.value = ''
}

function removeImage(index: number) {
  const removed = imageFiles.value.splice(index, 1)
  if (removed[0]) {
    URL.revokeObjectURL(removed[0].preview)
  }
}

async function submit() {
  if (rating.value === 0)
    return

  isSubmitting.value = true

  const images = imageFiles.value.length
    ? imageFiles.value.map(img => ({ file: img.file, blurPlaceholder: img.blurPlaceholder }))
    : undefined

  const result = await reviewsStore.submitReview(
    props.productId,
    rating.value,
    text.value,
    props.orderId,
    images,
  )

  isSubmitting.value = false

  if (result) {
    // Cleanup
    imageFiles.value.forEach(img => URL.revokeObjectURL(img.preview))
    imageFiles.value = []
    rating.value = 0
    text.value = ''
    emit('update:open', false)
    emit('submitted')
  }
}

function handleOpenChange(value: boolean) {
  if (!value) {
    // Cleanup при закрытии
    imageFiles.value.forEach(img => URL.revokeObjectURL(img.preview))
    imageFiles.value = []
    rating.value = 0
    text.value = ''
  }
  emit('update:open', value)
}

onUnmounted(() => {
  imageFiles.value.forEach(img => URL.revokeObjectURL(img.preview))
})
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>Оставить отзыв</DialogTitle>
        <DialogDescription>
          {{ productName }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <!-- Оценка -->
        <div>
          <label class="text-sm text-muted-foreground mb-1 block">Оценка</label>
          <StarRating v-model="rating" size="lg" />
        </div>

        <!-- Текст -->
        <Textarea
          v-model="text"
          placeholder="Расскажите о вашем опыте использования товара..."
          :rows="3"
        />

        <!-- Загрузка фото -->
        <div>
          <label class="text-sm text-muted-foreground mb-2 block">
            Фото ({{ imageFiles.length }} / {{ MAX_IMAGES }})
          </label>

          <div v-if="imageFiles.length" class="flex flex-wrap gap-2 mb-2">
            <div
              v-for="(img, idx) in imageFiles"
              :key="idx"
              class="relative w-20 h-20 rounded-lg overflow-hidden border group"
            >
              <img :src="img.preview" :alt="`Фото ${idx + 1}`" class="w-full h-full object-cover">
              <button
                class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                @click="removeImage(idx)"
              >
                <Icon name="lucide:x" class="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          <label
            v-if="imageFiles.length < MAX_IMAGES"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg cursor-pointer hover:bg-muted transition-colors"
            :class="{ 'opacity-50 pointer-events-none': isOptimizing }"
          >
            <Icon name="lucide:camera" class="w-4 h-4" />
            <span>{{ isOptimizing ? 'Оптимизация...' : 'Добавить фото' }}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              class="hidden"
              @change="handleImageSelect"
            >
          </label>
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          :disabled="isSubmitting"
          @click="handleOpenChange(false)"
        >
          Отмена
        </Button>
        <Button
          :disabled="rating === 0 || isSubmitting"
          @click="submit"
        >
          {{ isSubmitting ? 'Отправка...' : 'Отправить отзыв' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
