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

      /*
       * Чистим только протухшие коды, а не все свои.
       *
       * На одной странице привязку готовит больше одного компонента: на
       * /profile это баннер и промо-модалка, каждый зовёт prepareLink при
       * своём монтировании. При «удалить все мои коды» второй вызов сносил
       * только что вставленный код первого — и кнопка первого вела на
       * несуществующий код. Пользователь уходил в Telegram, жал «Начать» и
       * получал приветствие вместо привязки, без единой ошибки на экране.
       *
       * Копить мусор мы при этом не начинаем: у кодов есть expires_at (10
       * минут), вебхук после успешной привязки сам удаляет все коды
       * пользователя, а протухшие подчищает вот эта строка.
       */
      await supabase
        .from('telegram_link_codes')
        .delete()
        .eq('user_id', user.value.id)
        .lt('expires_at', new Date().toISOString())

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
