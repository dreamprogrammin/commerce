<script setup lang="ts">
import type { Database } from '@/types'
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useProfileStore } from '@/stores/core/profileStore'

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const profileStore = useProfileStore()
const { profile } = storeToRefs(profileStore)

const BOT_USERNAME = 'babyShopOfficialStoreKz_bot'

const telegramUrl = ref<string | null>(null)
const isUnlinking = ref(false)

const isLinked = computed(() => !!profile.value?.telegram_chat_id)

async function prepareLink() {
  if (!user.value)
    return

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

    telegramUrl.value = `https://t.me/${BOT_USERNAME}?start=${code}`
  }
  catch (error: any) {
    console.error('Error preparing Telegram link:', error)
    toast.error('Ошибка при создании ссылки', { description: error.message })
  }
}

// Ссылка готовится заранее, чтобы переключатель отрисовался нативным <a href>.
// Иначе window.open() после await режет блокировщик всплывающих окон.
onMounted(() => {
  if (user.value && !isLinked.value)
    prepareLink()
})

// Пользователь вернулся из Telegram — тихо перечитываем профиль, чтобы
// переключатель встал во «включено» без видимой загрузки.
if (import.meta.client) {
  useEventListener(document, 'visibilitychange', () => {
    if (!document.hidden && user.value && !isLinked.value)
      profileStore.loadProfile(true, false, true)
  })
}

function handleLinkClick() {
  toast.info('Перейдите в Telegram и нажмите «Начать»', {
    description: 'После привязки вернитесь на эту страницу',
    duration: 10000,
  })
}

async function unlinkTelegram() {
  if (!user.value)
    return

  isUnlinking.value = true
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ telegram_chat_id: null })
      .eq('id', user.value.id)

    if (error)
      throw error

    if (profile.value)
      profile.value = { ...profile.value, telegram_chat_id: null }

    toast.success('Telegram отключён')
    // Код привязки одноразовый — готовим новый, чтобы включить можно было сразу.
    prepareLink()
  }
  catch (error: any) {
    console.error('Error unlinking telegram:', error)
    toast.error('Ошибка при отключении', { description: error.message })
  }
  finally {
    isUnlinking.value = false
  }
}
</script>

<template>
  <div class="stg-row">
    <span
      class="stg-row__icon"
      :class="isLinked ? 'bg-brand-surface text-primary' : 'bg-muted text-muted-foreground'"
    >
      <Icon name="lucide:send" class="size-5" />
    </span>

    <div class="min-w-0 flex-1 leading-[1.35]">
      <div class="text-[15px] font-bold text-foreground">
        Telegram-уведомления
      </div>
      <div
        class="text-[13px] font-medium"
        :class="isLinked ? 'text-green-600' : 'text-muted-foreground'"
      >
        {{ isLinked ? 'Telegram подключён' : 'Telegram отключён' }}
      </div>
    </div>

    <!--
      Включение уводит в Telegram, поэтому во «выключено» переключатель — это
      нативная ссылка с заранее подготовленным href (см. prepareLink выше).
      Выключение делается запросом, там уже обычная кнопка.
    -->
    <a
      v-if="!isLinked && telegramUrl"
      :href="telegramUrl"
      target="_blank"
      rel="noopener noreferrer"
      role="switch"
      aria-checked="false"
      aria-label="Telegram-уведомления"
      class="stg-switch justify-start bg-gray-300"
      @click="handleLinkClick"
    >
      <span class="stg-switch__knob" />
    </a>
    <button
      v-else
      type="button"
      role="switch"
      :aria-checked="isLinked"
      :aria-busy="isUnlinking"
      aria-label="Telegram-уведомления"
      :disabled="!isLinked || isUnlinking"
      class="stg-switch"
      :class="isLinked ? 'justify-end bg-primary' : 'justify-start bg-gray-300'"
      @click="unlinkTelegram"
    >
      <span class="stg-switch__knob" />
    </button>
  </div>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .stg-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 4px;
    border-top: 1px solid var(--border);
  }

  .stg-row__icon {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: grid;
    place-content: center;
    transition: all 0.18s ease;
  }

  /*
   * Фон переключателя задаётся утилитами (bg-primary / bg-gray-300), а не здесь:
   * var(--color-gray-*) существует только пока на них ссылается какая-то утилита,
   * иначе Tailwind 4 вырежет переменную и дорожка станет прозрачной.
   * По той же причине здесь нет justify-content — им управляют justify-start/justify-end.
   */
  .stg-switch {
    flex: none;
    width: 48px;
    height: 28px;
    padding: 3px;
    border: none;
    border-radius: 999px;
    display: flex;
    align-items: center;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .stg-switch:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .stg-switch__knob {
    display: block;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 1px 3px rgb(15 23 42 / 0.3);
  }
}
</style>
