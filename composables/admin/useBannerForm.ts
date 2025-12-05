// composables/admin/useBannerForm.ts
import type { Banner } from '@/types'
import { toast } from 'vue-sonner'
import { BUCKET_NAME_BANNERS } from '@/constants'
import { generateBlurPlaceholder, validateImageFile } from '@/utils/imageOptimizer'

interface UseBannerFormOptions {
  onSuccess?: () => void
}

export function useBannerForm(
  banner: Ref<Banner | null>,
  options: UseBannerFormOptions = {},
) {
  const supabase = useSupabaseClient()
  const isSaving = ref(false)
  const isGeneratingBlur = ref(false)
  const selectedImage = ref<File | null>(null)
  const imagePreviewUrl = ref<string | null>(null)

  const isEditMode = computed(() => !!banner.value)

  // Форма данных
  const formData = ref({
    title: '',
    description: '',
    image_url: '',
    blur_data_url: '', // 👈 Добавили поле для blur
    cta_link: '',
    is_active: true,
    display_order: 0,
    placement: 'homepage_gender',
    seo_title: '',
    seo_description: '',
    seo_keywords: [] as string[],
  })

  // Computed для nullable полей
  const descriptionValue = computed({
    get: () => formData.value.description || '',
    set: (val) => { formData.value.description = val },
  })

  const ctaLinkValue = computed({
    get: () => formData.value.cta_link || '',
    set: (val) => { formData.value.cta_link = val },
  })

  const seoTitleValue = computed({
    get: () => formData.value.seo_title || '',
    set: (val) => { formData.value.seo_title = val },
  })

  const seoDescriptionValue = computed({
    get: () => formData.value.seo_description || '',
    set: (val) => { formData.value.seo_description = val },
  })

  // Инициализация формы при изменении баннера
  watch(banner, (newBanner) => {
    if (newBanner) {
      formData.value = {
        title: newBanner.title,
        description: newBanner.description || '',
        image_url: newBanner.image_url || '',
        blur_data_url: newBanner.blur_data_url || '', // 👈 Загружаем существующий blur
        cta_link: newBanner.cta_link || '',
        is_active: newBanner.is_active,
        display_order: newBanner.display_order,
        placement: newBanner.placement,
        seo_title: newBanner.seo_title || '',
        seo_description: newBanner.seo_description || '',
        seo_keywords: newBanner.seo_keywords || [],
      }
    }
    else {
      // Сброс формы для нового баннера
      formData.value = {
        title: '',
        description: '',
        image_url: '',
        blur_data_url: '',
        cta_link: '',
        is_active: true,
        display_order: 0,
        placement: 'homepage_gender',
        seo_title: '',
        seo_description: '',
        seo_keywords: [],
      }
      selectedImage.value = null
      imagePreviewUrl.value = null
    }
  }, { immediate: true })

  // Обработчик выбора изображения
  async function handleImageChange(event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]

    if (!file) {
      selectedImage.value = null
      imagePreviewUrl.value = null
      return
    }

    // Валидация файла
    const validation = validateImageFile(file)
    if (!validation.isValid) {
      toast.error('Ошибка валидации', {
        description: validation.error,
      })
      selectedImage.value = null
      imagePreviewUrl.value = null
      return
    }

    selectedImage.value = file

    // Создаём превью
    imagePreviewUrl.value = URL.createObjectURL(file)

    // 🎨 Генерируем blur placeholder
    try {
      isGeneratingBlur.value = true
      const blurResult = await generateBlurPlaceholder(file, 20, 0.5)
      formData.value.blur_data_url = blurResult.dataUrl

      console.log('✅ Blur generated:', `${blurResult.dataUrl.slice(0, 50)}...`)

      toast.success('Превью сгенерировано', {
        description: 'Размытое превью готово для загрузки',
      })
    }
    catch (error) {
      console.error('Failed to generate blur:', error)
      toast.warning('Не удалось создать превью', {
        description: 'Баннер будет загружен без превью',
      })
      formData.value.blur_data_url = ''
    }
    finally {
      isGeneratingBlur.value = false
    }
  }

  // Удаление изображения
  function removeImage() {
    selectedImage.value = null
    formData.value.image_url = ''
    formData.value.blur_data_url = '' // 👈 Удаляем и blur
    if (imagePreviewUrl.value) {
      URL.revokeObjectURL(imagePreviewUrl.value)
      imagePreviewUrl.value = null
    }
  }

  // Отправка формы
  async function handleSubmit() {
    if (isSaving.value)
      return

    isSaving.value = true

    try {
      let imageUrl = formData.value.image_url
      const blurDataUrl = formData.value.blur_data_url

      // Загружаем новое изображение если выбрано
      if (selectedImage.value) {
        const fileName = `${Date.now()}-${selectedImage.value.name}`

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(BUCKET_NAME_BANNERS)
          .upload(fileName, selectedImage.value)

        if (uploadError)
          throw uploadError

        imageUrl = uploadData.path

        // Если удалили старое изображение в режиме редактирования
        if (isEditMode.value && banner.value?.image_url) {
          await supabase.storage
            .from(BUCKET_NAME_BANNERS)
            .remove([banner.value.image_url])
        }
      }

      // Подготавливаем данные для сохранения
      const dataToSave = {
        title: formData.value.title,
        description: formData.value.description || null,
        image_url: imageUrl || null,
        blur_data_url: blurDataUrl || null, // 👈 Сохраняем blur
        cta_link: formData.value.cta_link || null,
        is_active: formData.value.is_active,
        display_order: formData.value.display_order,
        placement: formData.value.placement,
        seo_title: formData.value.seo_title || null,
        seo_description: formData.value.seo_description || null,
        seo_keywords: formData.value.seo_keywords.length > 0 ? formData.value.seo_keywords : null,
      }

      if (isEditMode.value && banner.value) {
        // Обновление существующего баннера
        const { error } = await supabase
          .from('banners')
          .update(dataToSave)
          .eq('id', banner.value.id)

        if (error)
          throw error

        toast.success('Баннер обновлён')
      }
      else {
        // Создание нового баннера
        const { error } = await supabase
          .from('banners')
          .insert([dataToSave])

        if (error)
          throw error

        toast.success('Баннер создан')
      }

      options.onSuccess?.()
    }
    catch (error) {
      console.error('Error saving banner:', error)
      toast.error('Ошибка сохранения', {
        description: (error as Error).message,
      })
    }
    finally {
      isSaving.value = false
    }
  }

  // Очистка при unmount
  onUnmounted(() => {
    if (imagePreviewUrl.value) {
      URL.revokeObjectURL(imagePreviewUrl.value)
    }
  })

  return {
    formData,
    isSaving,
    isGeneratingBlur, // 👈 Экспортируем статус генерации
    isEditMode,
    selectedImage,
    imagePreviewUrl,
    handleSubmit,
    removeImage,
    handleImageChange,
    descriptionValue,
    ctaLinkValue,
    seoTitleValue,
    seoDescriptionValue,
  }
}
