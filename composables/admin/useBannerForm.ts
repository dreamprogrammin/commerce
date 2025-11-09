import type { Banner, BannerInsert, BannerUpdate, Database } from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BANNERS } from '@/constants'

interface UseBannerFormOptions {
  onSuccess?: () => void
}

export function useBannerForm(
  initialData: Ref<Banner | null>,
  options: UseBannerFormOptions = {},
) {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile } = useSupabaseStorage()
  const user = useSupabaseUser()

  const isSaving = ref(false)
  const isEditMode = computed(() => !!initialData.value)

  // Реактивная форма с SEO полями
  const formData = ref<Partial<BannerInsert & {
    seo_title?: string | null
    seo_description?: string | null
  }>>({})

  // Переменные для управления загрузкой изображения
  const imageFile = ref<File | null>(null)
  const imagePreviewUrl = ref<string | null>(null)
  const isImageRemoved = ref(false)

  // Инициализация формы при изменении initialData
  watch(initialData, (newData) => {
    formData.value = {
      title: newData?.title ?? '',
      description: newData?.description ?? null,
      image_url: newData?.image_url ?? null,
      cta_link: newData?.cta_link ?? null,
      is_active: newData?.is_active ?? true,
      display_order: newData?.display_order ?? 0,
      placement: 'homepage_gender', // Фиксированное значение
      // SEO поля
      seo_title: (newData as any)?.seo_title ?? null,
      seo_description: (newData as any)?.seo_description ?? null,
    }
    imageFile.value = null
    imagePreviewUrl.value = null
    isImageRemoved.value = false
  }, { immediate: true, deep: true })

  // Обработчик изменения файла
  function handleImageChange(event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]

    if (!file)
      return

    // Валидация размера файла (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой', {
        description: 'Максимальный размер файла 5MB',
      })
      return
    }

    // Валидация типа файла
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Неверный формат файла', {
        description: 'Разрешены только JPEG, PNG, WebP и GIF',
      })
      return
    }

    imageFile.value = file
    imagePreviewUrl.value = URL.createObjectURL(file)
    isImageRemoved.value = false
  }

  // Удаление изображения
  function removeImage() {
    if (formData.value.image_url) {
      isImageRemoved.value = true
    }
    imageFile.value = null
    imagePreviewUrl.value = null
    formData.value.image_url = null
  }

  // Логика сохранения (создание/обновление)
  async function handleSubmit() {
    if (!user.value) {
      toast.error('Ошибка', { description: 'Вы не авторизованы' })
      return
    }

    // Валидация
    if (!formData.value.title?.trim()) {
      toast.error('Ошибка', { description: 'Заголовок обязателен' })
      return
    }

    isSaving.value = true
    let imageUrlToSave = formData.value.image_url

    try {
      // 1. Обработка изображения
      if (isImageRemoved.value && initialData.value?.image_url) {
        await removeFile(BUCKET_NAME_BANNERS, initialData.value.image_url)
        imageUrlToSave = null
      }

      if (imageFile.value) {
        if (initialData.value?.image_url) {
          await removeFile(BUCKET_NAME_BANNERS, initialData.value.image_url)
        }
        const newPath = await uploadFile(imageFile.value, {
          bucketName: BUCKET_NAME_BANNERS,
        })
        if (newPath) {
          imageUrlToSave = newPath
        }
      }

      // 2. Подготовка данных для отправки
      if (isEditMode.value) {
        // Обновление - используем BannerUpdate
        const dataToUpdate: BannerUpdate & {
          seo_title?: string | null
          seo_description?: string | null
        } = {
          title: formData.value.title,
          description: formData.value.description,
          image_url: imageUrlToSave,
          cta_link: formData.value.cta_link,
          is_active: formData.value.is_active,
          display_order: formData.value.display_order ?? 0,
          placement: 'homepage_gender',
          seo_title: formData.value.seo_title,
          seo_description: formData.value.seo_description,
          updated_at: new Date().toISOString(),
        }

        const { error } = await supabase
          .from('banners')
          .update(dataToUpdate)
          .eq('id', initialData.value!.id)

        if (error)
          throw error
        toast.success('Баннер успешно обновлен')
      }
      else {
        // Создание - используем BannerInsert
        const dataToInsert: BannerInsert & {
          seo_title?: string | null
          seo_description?: string | null
        } = {
          title: formData.value.title!,
          description: formData.value.description,
          image_url: imageUrlToSave,
          cta_link: formData.value.cta_link,
          is_active: formData.value.is_active ?? true,
          display_order: formData.value.display_order ?? 0,
          placement: 'homepage_gender',
          seo_title: formData.value.seo_title,
          seo_description: formData.value.seo_description,
        }

        const { error } = await supabase
          .from('banners')
          .insert(dataToInsert)

        if (error)
          throw error
        toast.success('Баннер успешно создан')
      }

      options.onSuccess?.()
    }
    catch (e: any) {
      console.error('Ошибка сохранения баннера:', e)
      toast.error('Ошибка сохранения', { description: e.message })
    }
    finally {
      isSaving.value = false
    }
  }

  // Computed для nullable полей
  const descriptionValue = computed({
    get: () => formData.value.description ?? '',
    set: val => (formData.value.description = val || null),
  })

  const ctaLinkValue = computed({
    get: () => formData.value.cta_link ?? '',
    set: val => (formData.value.cta_link = val || null),
  })

  const seoTitleValue = computed({
    get: () => formData.value.seo_title ?? '',
    set: val => (formData.value.seo_title = val || null),
  })

  const seoDescriptionValue = computed({
    get: () => formData.value.seo_description ?? '',
    set: val => (formData.value.seo_description = val || null),
  })

  return {
    formData,
    isSaving,
    isEditMode,
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
