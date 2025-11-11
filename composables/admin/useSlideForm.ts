import type { Database, SlideInsert, SlideRow, SlideUpdate } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import {
  formatFileSize,
  generateBlurPlaceholder,
  getOptimizationInfo,
  optimizeImageBeforeUpload,
  shouldOptimizeImage,
} from '@/utils/imageOptimizer'

const BUCKET_NAME = 'slides-images'

interface UseSlideFromOptions {
  onSuccess?: () => void
}

interface NewImageFile {
  file: File
  previewUrl: string
  blurDataUrl?: string
}

export function useSlideForm(
  initialData: Ref<SlideRow | null>,
  options: UseSlideFromOptions,
) {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile } = useSupabaseStorage()

  const isSaving = ref(false)
  const imagePreviewUrl = ref<string | null>(null)
  const newImageFile = ref<NewImageFile | null>(null)
  const imageToDelete = ref<string | null>(null)
  const isProcessingImage = ref(false)

  const optimizationInfo = computed(() => getOptimizationInfo())

  const formData = ref<SlideInsert | SlideUpdate>({
    title: '',
    description: '',
    image_url: null,
    blur_placeholder: null, // 🆕 Добавляем blur
    cta_link: '',
    cta_text: '',
    is_active: true,
    display_order: 0,
  })

  const isEditMode = computed(() => !!initialData.value)

  function initialize() {
    newImageFile.value = null
    imagePreviewUrl.value = null
    imageToDelete.value = null

    if (isEditMode.value && initialData.value) {
      formData.value = {
        ...initialData.value,
      }
      // Сохраняем старый путь к изображению для последующего удаления
      imageToDelete.value = initialData.value.image_url || null
    }
    else {
      formData.value = {
        title: '',
        description: '',
        image_url: null,
        blur_placeholder: null,
        cta_link: '',
        cta_text: '',
        is_active: true,
        display_order: 0,
      }
    }
  }

  function removeImage() {
    if (newImageFile.value) {
      URL.revokeObjectURL(newImageFile.value.previewUrl)
      newImageFile.value = null
    }

    if (formData.value.image_url) {
      imageToDelete.value = formData.value.image_url
      formData.value.image_url = null
      formData.value.blur_placeholder = null // 🆕 Удаляем blur
    }

    imagePreviewUrl.value = null
  }

  /**
   * 🎯 Обработка загрузки изображения с генерацией blur
   */
  async function handleImageChange(event: Event) {
    const target = event.target as HTMLInputElement
    if (!target.files || target.files.length === 0) {
      return
    }

    const file = target.files[0]

    // 🔒 Проверка на существование файла
    if (!file) {
      return
    }

    isProcessingImage.value = true

    const toastId = toast.loading(
      `${optimizationInfo.value.icon} Обработка изображения...`,
    )

    try {
    // Проверяем нужна ли оптимизация
      if (shouldOptimizeImage(file)) {
        const result = await optimizeImageBeforeUpload(file)

        console.log(
          `✅ ${file.name}: ${formatFileSize(result.originalSize)} → ${formatFileSize(result.optimizedSize)} (↓${result.savings.toFixed(0)}%) ${result.blurPlaceholder ? '+ LQIP ✨' : ''}`,
        )

        newImageFile.value = {
          file: result.file,
          previewUrl: URL.createObjectURL(result.file),
          blurDataUrl: result.blurPlaceholder,
        }
      }
      else {
      // Файл маленький - генерируем только blur
        const blurResult = await generateBlurPlaceholder(file)
        console.log(`📤 ${file.name}: ${formatFileSize(file.size)} + LQIP ✨`)

        newImageFile.value = {
          file,
          previewUrl: URL.createObjectURL(file),
          blurDataUrl: blurResult.dataUrl,
        }
      }

      imagePreviewUrl.value = newImageFile.value.previewUrl

      // Помечаем старое изображение на удаление
      if (formData.value.image_url && isEditMode.value) {
        imageToDelete.value = formData.value.image_url
      }

      toast.success(
        `✅ Изображение загружено ${optimizationInfo.value.icon}`,
        { id: toastId },
      )
    }
    catch (error) {
      toast.error('❌ Ошибка при обработке файла', { id: toastId })
      console.error('handleImageChange error:', error)
    }
    finally {
      isProcessingImage.value = false
    }
  }

  async function handleSubmit() {
    isSaving.value = true
    const toastId = toast.loading('Сохранение данных...')

    try {
      let finalImagePath = formData.value.image_url
      let finalBlurDataUrl = formData.value.blur_placeholder

      // 📤 Загружаем новое изображение если есть
      if (newImageFile.value) {
        const fileName = `${uuidv4()}.webp`

        // Загружаем через useSupabaseStorage с использованием fileName
        const uploadedPath = await uploadFile(newImageFile.value.file, {
          bucketName: BUCKET_NAME,
          filePathPrefix: fileName, // 🔧 Используем сгенерированное имя
          upsert: false,
          contentType: 'image/webp',
        })

        if (!uploadedPath) {
          throw new Error('Не удалось загрузить изображение')
        }

        finalImagePath = uploadedPath
        finalBlurDataUrl = newImageFile.value.blurDataUrl || null

        // 🗑️ Удаляем старое изображение
        if (isEditMode.value && imageToDelete.value && imageToDelete.value !== finalImagePath) {
          await removeFile(BUCKET_NAME, imageToDelete.value)
        }
      }

      const dataToSave = {
        ...formData.value,
        image_url: finalImagePath,
        blur_placeholder: finalBlurDataUrl,
      }

      if (isEditMode.value) {
        const { error } = await supabase
          .from('slides')
          .update(dataToSave)
          .eq('id', initialData.value!.id)

        if (error)
          throw error
        toast.success('Слайд успешно обновлен!', { id: toastId })
      }
      else {
        const { error } = await supabase
          .from('slides')
          .insert(dataToSave as SlideInsert)
        if (error)
          throw error
        toast.success('Слайд успешно создан!', { id: toastId })
      }

      options.onSuccess?.()
    }
    catch (e: any) {
      toast.error('Ошибка при сохранении', {
        id: toastId,
        description: e.message,
      })
    }
    finally {
      isSaving.value = false
    }
  }

  const ctaTextValue = computed({
    get: () => formData.value.cta_text as string,
    set: (value: string) => {
      formData.value.cta_text = value
    },
  })

  const ctaLinkValue = computed({
    get: () => formData.value.cta_link as string,
    set: (value: string) => {
      formData.value.cta_link = value
    },
  })

  const descriptionValue = computed({
    get: () => formData.value.description as string,
    set: (value: string) => {
      formData.value.description = value
    },
  })

  watch(initialData, initialize, { immediate: true })

  return {
    formData,
    isSaving,
    isEditMode,
    imagePreviewUrl,
    isProcessingImage, // 🆕 Экспортируем для UI
    optimizationInfo, // 🆕 Экспортируем для отображения информации
    handleSubmit,
    removeImage,
    handleImageChange,
    ctaTextValue,
    ctaLinkValue,
    descriptionValue,
  }
}
