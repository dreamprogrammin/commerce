<script setup lang="ts">
import type { Database } from '@/types'

import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { profilePageShell } from '@/lib/shell'
import { useProfileStore } from '@/stores/core/profileStore'
import { formatPrice } from '@/utils/formatPrice'

definePageMeta({
  layout: 'shell',
  shell: profilePageShell,
  profileBare: true, // страница рисует собственные карточки, обёртка layout не нужна
})

useHead({ title: 'История бонусов' })

type BonusTransaction = Database['public']['Functions']['get_bonus_history']['Returns'][number]

const profileStore = useProfileStore()
const { bonusBalance, pendingBonuses } = storeToRefs(profileStore)

const supabase = useSupabaseClient<Database>()

const transactions = ref<BonusTransaction[]>([])
const isLoading = ref(false)

async function loadBonusHistory() {
  isLoading.value = true
  try {
    const { data, error } = await supabase.rpc('get_bonus_history', {
      p_limit: 50,
      p_offset: 0,
    })

    if (error)
      throw error

    transactions.value = data || []
  }
  catch (error: any) {
    toast.error('Ошибка загрузки истории', { description: error.message })
  }
  finally {
    isLoading.value = false
  }
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const activationFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/*
 * В макете под названием операции стоит одна строка с датой. Дату активации
 * (её знают только незавершённые начисления) приписываем туда же через
 * разделитель, чтобы не заводить третью строку и не ломать высоту ряда.
 */
function rowDate(transaction: BonusTransaction) {
  const created = dateFormatter.format(new Date(transaction.created_at))
  if (transaction.status !== 'pending' || !transaction.activation_date)
    return created

  return `${created} · активация ${activationFormatter.format(new Date(transaction.activation_date))}`
}

const TRANSACTION_ICONS: Record<string, string> = {
  earned: 'lucide:shopping-bag',
  spent: 'lucide:minus',
  welcome: 'lucide:gift',
  review: 'lucide:message-square-heart',
  refund_spent: 'lucide:rotate-ccw',
  refund_earned: 'lucide:rotate-ccw',
  activation: 'lucide:circle-check',
  birthday: 'lucide:cake',
  expiration: 'lucide:timer',
}

const TRANSACTION_NAMES: Record<string, string> = {
  earned: 'Начисление за заказ',
  spent: 'Списание за заказ',
  welcome: 'Приветственные бонусы',
  review: 'Бонусы за отзыв',
  refund_spent: 'Возврат бонусов',
  refund_earned: 'Отмена начисления',
  activation: 'Активация бонусов',
  birthday: 'Бонусы ко дню рождения',
  expiration: 'Сгорело бонусов',
}

/*
 * Статусов у операции три, в макете нарисованы два. «Отменено» оформлено
 * по образцу «Ожидает», но в красной паре — она уже используется на этой
 * странице для отрицательных сумм.
 */
const STATUS_LABELS: Record<string, string> = {
  completed: 'Завершено',
  pending: 'Ожидает',
  cancelled: 'Отменено',
}

const STATUS_CLASSES: Record<string, string> = {
  completed: 'bg-muted text-muted-foreground',
  pending: 'bg-orange-50 text-orange-600',
  cancelled: 'bg-red-50 text-red-600',
}

const rows = computed(() => transactions.value.map((transaction) => {
  const isPositive = transaction.amount > 0
  const balance = transaction.balance_after

  return {
    id: transaction.id,
    icon: TRANSACTION_ICONS[transaction.transaction_type] ?? 'lucide:clock',
    title: TRANSACTION_NAMES[transaction.transaction_type] ?? transaction.transaction_type,
    date: rowDate(transaction),
    // Знак минуса из макета — типографский U+2212, а не дефис
    amount: `${isPositive ? '+' : '−'}${formatPrice(Math.abs(transaction.amount))} ₸`,
    isPositive,
    hasBalance: balance > 0,
    balance: `Баланс ${formatPrice(balance)} ₸`,
    status: STATUS_LABELS[transaction.status] ?? transaction.status,
    statusClass: STATUS_CLASSES[transaction.status] ?? 'bg-muted text-muted-foreground',
  }
}))

onMounted(loadBonusHistory)
</script>

<template>
  <ProfileShell>
    <div class="flex flex-col gap-[18px]">
      <div>
        <h1 class="mb-1 text-[clamp(24px,2.8vw,30px)] font-extrabold tracking-[-0.025em]">
          История бонусов
        </h1>
        <p class="text-sm font-medium text-muted-foreground">
          Следите за начислениями и тратами ваших бонусов
        </p>
      </div>

      <!-- 💳 Балансы -->
      <div class="grid gap-3 md:gap-4 md:[grid-template-columns:1.15fr_1fr]">
        <!-- Доступные -->
        <div
          class="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-blue-500 to-blue-600 p-[clamp(20px,2.6vw,28px)] text-white shadow-[0_14px_34px_rgba(43,127,255,0.34)]"
        >
          <Icon
            name="lucide:coins"
            class="pointer-events-none absolute -right-[18px] -top-[14px] size-[120px] text-white/15"
            aria-hidden="true"
          />
          <div class="relative">
            <span class="inline-flex items-center gap-[7px] text-sm font-semibold text-white/90">
              <Icon name="lucide:wallet" class="size-[17px]" />
              Доступные бонусы
            </span>
            <div
              class="mb-0.5 mt-2 whitespace-nowrap text-[clamp(38px,4.6vw,52px)] font-black leading-none tracking-[-0.03em]"
            >
              <ClientOnly fallback="—">
                {{ formatPrice(bonusBalance) }}
              </ClientOnly>
              <!-- Отступ вместо пробела: Vue выкусывает whitespace-узел с переносом
                 строки, а знак ₸ в макете отделён от числа. -->
              <span class="ml-[0.5em] text-[0.5em] font-extrabold">₸</span>
            </div>
            <div class="text-[13.5px] font-medium text-white/85">
              Можно использовать прямо сейчас
            </div>
            <span
              class="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-[13px] py-[7px] text-[13px] font-bold text-white backdrop-blur-[6px]"
            >
              1 бонус = 1&nbsp;₸ · кешбэк до 10%
            </span>
          </div>
        </div>

        <!-- Ожидают активации -->
        <div
          class="flex flex-col justify-center rounded-[22px] border border-border bg-white p-[clamp(20px,2.6vw,28px)] shadow-sm"
        >
          <span class="inline-flex items-center gap-[9px]">
            <span class="grid size-[38px] flex-none place-content-center rounded-xl bg-orange-50 text-orange-600">
              <Icon name="lucide:clock" class="size-5" />
            </span>
            <span class="text-sm font-semibold text-muted-foreground">Ожидает активации</span>
          </span>
          <div
            class="mb-0.5 mt-3.5 whitespace-nowrap text-[clamp(30px,3.4vw,40px)] font-black leading-none tracking-[-0.03em] text-foreground"
          >
            <ClientOnly fallback="—">
              {{ formatPrice(pendingBonuses) }}
            </ClientOnly>
            <span class="ml-[0.5em] text-[0.55em] font-extrabold text-muted-foreground">₸</span>
          </div>
          <div class="text-[13.5px] font-medium text-muted-foreground">
            Станут доступны через 14 дней после начисления
          </div>
        </div>
      </div>

      <!-- 📜 История операций -->
      <div
        class="rounded-[clamp(18px,2vw,22px)] border border-border bg-white p-[clamp(16px,2.2vw,24px)] shadow-sm"
      >
        <h2 class="mb-[3px] text-[clamp(18px,2vw,22px)] font-extrabold tracking-[-0.02em]">
          История операций
        </h2>
        <p class="mb-1.5 text-[13.5px] font-medium text-muted-foreground">
          Полная история начислений и трат бонусов
        </p>

        <!-- Загрузка -->
        <div v-if="isLoading">
          <div
            v-for="n in 5"
            :key="`skeleton-${n}`"
            class="flex items-center gap-3.5 border-t border-border px-1 py-3.5"
          >
            <span class="size-[38px] flex-none animate-pulse rounded-xl bg-muted" />
            <span class="flex min-w-0 flex-1 flex-col gap-1.5">
              <span class="h-3.5 w-40 max-w-full animate-pulse rounded bg-muted" />
              <span class="h-3 w-28 max-w-full animate-pulse rounded bg-muted" />
            </span>
            <span class="h-4 w-16 flex-none animate-pulse rounded bg-muted" />
          </div>
        </div>

        <!-- Пусто -->
        <div v-else-if="!rows.length" class="border-t border-border px-1 py-12 text-center">
          <span
            class="mb-4 inline-grid size-[72px] place-content-center rounded-full bg-blue-50 text-primary"
          >
            <Icon name="lucide:clock" class="size-[34px]" />
          </span>
          <p class="mb-1.5 text-[19px] font-extrabold text-foreground">
            История пока пуста
          </p>
          <p class="text-sm font-medium text-muted-foreground">
            Совершите первую покупку, чтобы начать зарабатывать бонусы
          </p>
        </div>

        <!-- Операции -->
        <div v-else>
          <div
            v-for="row in rows"
            :key="row.id"
            class="flex items-center gap-3.5 border-t border-border px-1 py-3.5"
          >
            <span
              class="grid size-[38px] flex-none place-content-center rounded-xl"
              :class="row.isPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'"
            >
              <Icon :name="row.icon" class="size-[19px]" />
            </span>

            <span class="flex min-w-0 flex-1 flex-col leading-[1.3]">
              <span class="text-[14.5px] font-bold text-foreground">{{ row.title }}</span>
              <span class="text-[12.5px] font-medium text-muted-foreground">{{ row.date }}</span>
            </span>

            <span class="flex flex-none flex-col items-end gap-[5px]">
              <span
                class="whitespace-nowrap text-[15.5px] font-extrabold"
                :class="row.isPositive ? 'text-green-600' : 'text-red-600'"
              >
                {{ row.amount }}
              </span>
              <!-- Баланс и статус в макете стоят в строку. На узком экране такая
                 пара забирает половину ряда и рубит название операции на три
                 строки, поэтому до 768px они складываются столбиком. -->
              <span class="flex flex-col items-end gap-1 md:flex-row md:items-center md:gap-[7px]">
                <span v-if="row.hasBalance" class="whitespace-nowrap text-xs font-medium text-muted-foreground">
                  {{ row.balance }}
                </span>
                <span
                  class="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-bold"
                  :class="row.statusClass"
                >
                  {{ row.status }}
                </span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </ProfileShell>
</template>
