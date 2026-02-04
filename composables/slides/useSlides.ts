import type { Database } from '@/types'
import { useQuery } from '@tanstack/vue-query'

/**
 * 🎬 Композабл для работы со слайдами карусели
 *
 * Особенности:
 * - Загружает только активные слайды с blur_placeholder
 * - Сортирует по display_order
 * - Использует TanStack Query для кеширования (5-10 мин)
 * - Автоматически обрабатывает ошибки
 */
export function useSlides() {
  const supabase = useSupabaseClient<Database>()

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['global-slides'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('slides')
        .select(`
          id,
          title,
          subtitle,
          description,
          image_url,
          image_url_mobile,
          blur_placeholder,
          blur_placeholder_mobile,
          blur_data_url,
          blur_data_url_mobile,
          cta_link,
          cta_text,
          link_url,
          alt_text,
          meta_description,
          is_active,
          display_order,
          created_at,
          updated_at
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (error) {
        console.error('❌ Ошибка при загрузке слайдов:', error)
        throw createError({
          statusCode: 500,
          statusMessage: 'Не удалось загрузить слайды',
          fatal: false,
        })
      }

      // 🎯 Логируем информацию о загруженных слайдах (только в dev)
      if (import.meta.dev && data) {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 СЛАЙДЫ ЗАГРУЖЕНЫ (TanStack Query)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Всего: ${data.length} активных слайдов
${data.map((slide, i) => `  ${i + 1}. ${slide.title}
     ${slide.image_url ? '✅ Изображение' : '❌ Нет изображения'}
     ${slide.blur_placeholder ? '✨ LQIP' : '⚠️ Без LQIP'}
     ${slide.cta_link ? `🔗 ${slide.cta_link}` : ''}`).join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      }

      return data || []
    },
    staleTime: 5 * 60 * 1000, // 5 минут - данные свежие
    gcTime: 10 * 60 * 1000, // 10 минут - время жизни в кэше
  })

  // ✅ ИСПРАВЛЕНО: Используем только isLoading для skeleton
  // isLoading = true только при первой загрузке без данных
  // isFetching НЕ используем, так как он true при любом background refetch
  // Это предотвращает показ skeleton при возврате из фона

  /**
   * 🔄 Обновить слайды (например, после изменения в админке)
   */
  async function refresh() {
    await refetch()
  }

  /**
   * 📊 Статистика по слайдам
   */
  const stats = computed(() => {
    const slides = data.value || []
    return {
      total: slides.length,
      withImages: slides.filter(s => s.image_url).length,
      withBlur: slides.filter(s => s.blur_placeholder).length,
      withCTA: slides.filter(s => s.cta_link).length,
    }
  })

  return {
    // 📊 Данные
    slides: data,
    error,
    isLoading, // ✅ ИСПРАВЛЕНО: Только первая загрузка, без isFetching
    isFetching, // Экспортируем отдельно для индикаторов обновления (если нужно)
    stats,

    // 🔄 Методы
    refresh,

    // 🎯 Утилиты
    isEmpty: computed(() => (data.value?.length || 0) === 0),
    hasError: computed(() => !!error.value),
  }
}
