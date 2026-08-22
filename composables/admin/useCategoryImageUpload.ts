import { toast } from 'vue-sonner'
import {
  formatFileSize,
  getOptimizationInfo,
  optimizeImageBeforeUpload,
} from '@/utils/imageOptimizer'

/**
 * Выбор картинки категории в админке.
 *
 * Вынесено из `RecursiveMenuItemFormNode.vue`, когда та же форма понадобилась
 * корневым категориям: у них своя карточка в `pages/admin/categories/index.vue`,
 * а рекурсивным узлом рисуются только потомки. Логика одна на оба места —
 * разъехаться она тут может только молча.
 *
 * Композабл НЕ грузит ничего в Storage. Он лишь готовит файл на клиенте и
 * возвращает патч полей `EditableCategory`; загрузку делает
 * `adminCategoriesStore.saveChanges`, и делает её одинаково для любого узла
 * дерева, включая корни: три варианта sm/md/lg (400/800/1440px) под srcset
 * плюс LQIP-подложка. См. `config/images.ts` и docs/IMAGES.md.
 */

/** Поля `EditableCategory`, описывающие выбранную картинку. */
export interface CategoryImagePatch {
  _imageFile?: File
  _imagePreview?: string
  _blurPlaceholder?: string
  image_url: string | null
  blur_placeholder?: string | null
}

/** То, что композаблу нужно знать о категории, чтобы отдать патч. */
interface ImageBearingCategory {
  _imagePreview?: string
  image_url?: string | null
}

export function useCategoryImageUpload() {
  const isProcessing = ref(false)
  const optimizationInfo = computed(() => getOptimizationInfo())

  /**
   * Готовит выбранный файл: сжимает до ≤800KB/1440px и снимает LQIP.
   * Возвращает патч или null, если файла нет либо обработка упала.
   *
   * `image_url: null` в патче обязателен: пока новый файл не уехал в Storage,
   * старый путь указывает на картинку, которую `saveChanges` вот-вот удалит.
   */
  async function buildPatchFromEvent(event: Event): Promise<CategoryImagePatch | null> {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file)
      return null

    isProcessing.value = true
    const toastId = toast.loading(`${optimizationInfo.value.icon} Обработка изображения...`)

    try {
      const result = await optimizeImageBeforeUpload(file)
      const processedFile = result.file

      toast.success(`Изображение готово ${optimizationInfo.value.icon}`, {
        id: toastId,
        description: [
          `${formatFileSize(result.originalSize)} → ${formatFileSize(result.optimizedSize)}`,
          result.blurPlaceholder ? 'подложка снята' : null,
        ].filter(Boolean).join(', '),
      })

      return {
        _imageFile: processedFile,
        _imagePreview: URL.createObjectURL(processedFile),
        _blurPlaceholder: result.blurPlaceholder,
        image_url: null,
      }
    }
    catch (error) {
      toast.error('Ошибка при обработке файла', {
        id: toastId,
        description: (error as Error).message,
      })
      console.error('handleImageChange:', error)
      return null
    }
    finally {
      isProcessing.value = false
    }
  }

  /**
   * Патч на снятие картинки. Заодно отзывает blob-URL превью: без этого
   * каждый повторный выбор файла в одной сессии подтекает памятью.
   *
   * `blur_placeholder: null` гасит подложку в базе — иначе от удалённой
   * картинки осталось бы размытое пятно.
   */
  function buildClearPatch(item: ImageBearingCategory): CategoryImagePatch {
    if (item._imagePreview)
      URL.revokeObjectURL(item._imagePreview)

    return {
      _imageFile: undefined,
      _imagePreview: undefined,
      _blurPlaceholder: undefined,
      image_url: null,
      blur_placeholder: null,
    }
  }

  /** Есть ли что показывать: свежий выбор или уже сохранённая картинка. */
  function hasImage(item: ImageBearingCategory): boolean {
    return Boolean(item._imagePreview || item.image_url)
  }

  return {
    isProcessing,
    optimizationInfo,
    buildPatchFromEvent,
    buildClearPatch,
    hasImage,
  }
}
