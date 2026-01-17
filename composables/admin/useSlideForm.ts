import type { Database, SlideInsert, SlideRow, SlideUpdate } from '@/types'
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
  const isProcessingImage = ref(false)
  // ✨ Состояние для ДЕСКТОПНОГО изображения
  const imagePreviewUrl = ref<string | null>(null)
  const newImageFile = ref<NewImageFile | null>(null)
  const imageToDelete = ref<string | null>(null)

  // 🆕 Состояние для МОБИЛЬНОГО изображения
  const imagePreviewUrlMobile = ref<string | null>(null)
  const newImageFileMobile = ref<NewImageFile | null>(null)
  const imageToDeleteMobile = ref<string | null>(null)

  const optimizationInfo = computed(() => getOptimizationInfo())

  const formData = ref<SlideInsert | SlideUpdate>({
    title: '',
    description: '',
    image_url: null,
    blur_placeholder: null,
    image_url_mobile: null,
    blur_placeholder_mobile: null,
    cta_link: '',
    cta_text: '',
    is_active: true,
    display_order: 0,
  })

  const isEditMode = computed(() => !!initialData.value)

  function initialize() {
    // ... сброс десктопных полей
    newImageFile.value = null
    imagePreviewUrl.value = null
    imageToDelete.value = null
    // 🆕 Сброс мобильных полей
    newImageFileMobile.value = null
    imagePreviewUrlMobile.value = null
    imageToDeleteMobile.value = null

    if (isEditMode.value && initialData.value) {
      formData.value = {
        ...initialData.value,
      }
      // Сохраняем старый путь к изображению для последующего удаления
      imageToDelete.value = initialData.value.image_url || null
      imageToDeleteMobile.value = initialData.value.image_url_mobile || null // 🆕
    }
    else {
      formData.value = {
        title: '',
        description: '',
        image_url: null,
        blur_placeholder: null,
        image_url_mobile: null,
        blur_placeholder_mobile: null,
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
      formData.value.blur_placeholder = null
    }
    imagePreviewUrl.value = null
  }

  function removeImageMobile() {
    if (newImageFileMobile.value) {
      URL.revokeObjectURL(newImageFileMobile.value.previewUrl)
      newImageFileMobile.value = null
    }
    if (formData.value.image_url_mobile) {
      imageToDeleteMobile.value = formData.value.image_url_mobile
      formData.value.image_url_mobile = null
      formData.value.blur_placeholder_mobile = null
    }
    imagePreviewUrlMobile.value = null
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

  async function handleImageChangeMobile(event: Event) {
    const target = event.target as HTMLInputElement
    if (!target.files || target.files.length === 0)
      return
    const file = target.files[0]
    if (!file)
      return

    isProcessingImage.value = true
    const toastId = toast.loading(`${optimizationInfo.value.icon} Обработка мобильного изображения...`)

    try {
      if (shouldOptimizeImage(file)) {
        const result = await optimizeImageBeforeUpload(file)
        newImageFileMobile.value = { file: result.file, previewUrl: URL.createObjectURL(result.file), blurDataUrl: result.blurPlaceholder }
      }
      else {
        const blurResult = await generateBlurPlaceholder(file)
        newImageFileMobile.value = { file, previewUrl: URL.createObjectURL(file), blurDataUrl: blurResult.dataUrl }
      }
      imagePreviewUrlMobile.value = newImageFileMobile.value.previewUrl
      if (formData.value.image_url_mobile && isEditMode.value) {
        imageToDeleteMobile.value = formData.value.image_url_mobile
      }
      toast.success(`✅ Мобильное изображение загружено ${optimizationInfo.value.icon}`, { id: toastId })
    }
    catch (error) {
      toast.error('❌ Ошибка при обработке файла', { id: toastId })
      console.error('handleImageChangeMobile error:', error)
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
      let finalImagePathMobile = formData.value.image_url_mobile
      let finalBlurDataUrlMobile = formData.value.blur_placeholder_mobile

      // 📤 Загружаем новое ДЕСКТОПНОЕ изображение если есть (🔍 SEO: имя файла содержит название слайда)
      if (newImageFile.value) {
        const uploadedPath = await uploadFile(newImageFile.value.file, {
          bucketName: BUCKET_NAME,
          seoName: formData.value.title ? `slide-${formData.value.title}` : 'slide',
        })
        if (!uploadedPath)
          throw new Error('Не удалось загрузить десктопное изображение')
        finalImagePath = uploadedPath
        finalBlurDataUrl = newImageFile.value.blurDataUrl || null
        if (isEditMode.value && imageToDelete.value) {
          await removeFile(BUCKET_NAME, imageToDelete.value)
        }
      }

      // 🆕 📤 Загружаем новое МОБИЛЬНОЕ изображение если есть (🔍 SEO: имя файла содержит название слайда)
      if (newImageFileMobile.value) {
        const uploadedPath = await uploadFile(newImageFileMobile.value.file, {
          bucketName: BUCKET_NAME,
          seoName: formData.value.title ? `slide-mobile-${formData.value.title}` : 'slide-mobile',
        })
        if (!uploadedPath)
          throw new Error('Не удалось загрузить мобильное изображение')
        finalImagePathMobile = uploadedPath
        finalBlurDataUrlMobile = newImageFileMobile.value.blurDataUrl || null
        if (isEditMode.value && imageToDeleteMobile.value) {
          await removeFile(BUCKET_NAME, imageToDeleteMobile.value)
        }
      }

      const dataToSave = {
        ...formData.value,
        image_url: finalImagePath,
        blur_placeholder: finalBlurDataUrl,
        image_url_mobile: finalImagePathMobile, // 🆕
        blur_placeholder_mobile: finalBlurDataUrlMobile, // 🆕
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
    isProcessingImage,
    optimizationInfo,
    handleSubmit,
    removeImage,
    handleImageChange,
    ctaTextValue,
    ctaLinkValue,
    descriptionValue,
    // 🆕 Экспортируем все для мобильного изображения
    imagePreviewUrlMobile,
    handleImageChangeMobile,
    removeImageMobile,
  }
}
