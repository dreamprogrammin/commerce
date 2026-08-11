import type { Database } from '@/types'
import { toast } from 'vue-sonner'
import { TELEGRAM_BOT_USERNAME } from '@/constants'

/**
 * Готовит одноразовую ссылку привязки Telegram.
 *
 * Тело было продублировано дословно в четырёх местах — TelegramBanner,
 * TelegramSubscribeDialog, TelegramSubscribeDrawer и строке уведомлений в
 * настройках. Отличался только флаг `isPreparing`, поэтому логика вынесена
 * целиком: имя бота, генерация кода, чистка прежних кодов и текст ошибки
 * должны меняться в одном месте.
 *
 * Ссылка готовится заранее, до клика: иначе кнопку приходится делать через
 * `window.open()` после `await`, и её режет блокировщик всплывающих окон.
 */
export function useTelegramLink() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const telegramUrl = ref<string | null>(null)
  const isPreparing = ref(false)

  async function prepareLink() {
    if (!user.value)
      return

    isPreparing.value = true
    telegramUrl.value = null
    try {
      const code = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

      await supabase
        .from('telegram_link_codes')
        .delete()
        .eq('user_id', user.value.id)

      const { error } = await supabase
        .from('telegram_link_codes')
        .insert({ user_id: user.value.id, code })

      if (error)
        throw error

      telegramUrl.value = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${code}`
    }
    catch (error: any) {
      console.error('Error preparing Telegram link:', error)
      toast.error('Ошибка при создании ссылки', { description: error.message })
    }
    finally {
      isPreparing.value = false
    }
  }

  return { telegramUrl, isPreparing, prepareLink }
}
