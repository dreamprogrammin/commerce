<script setup lang="ts">
import type { DeliveryMethod } from '@/utils/orderStatus'
import { orderStatusToStep, orderSteps } from '@/utils/orderStatus'

/**
 * Статус заказа — порт блока «Статус заказа» из OrderSuccess.dc.html.
 *
 * Четыре шага вертикальной лентой: кружок 40px с иконкой и соединительная
 * линия под ним. Пройденные и текущий залиты синим градиентом, будущие —
 * белые с серой обводкой; линия окрашивается только между пройденными.
 *
 * Реалтайм-подписка на статус заказа сохранена от прежней версии компонента:
 * оператор меняет статус в админке, и покупатель видит это, не перезагружая
 * страницу.
 */
const props = defineProps<{
  orderId: string
  initialStatus: string
  /** См. пояснение в OrderProgressBar: у самовывоза свои подписи шагов. */
  deliveryMethod?: DeliveryMethod
}>()

const steps = computed(() => orderSteps(props.deliveryMethod))

const supabase = useSupabaseClient()
const orderStatus = ref(props.initialStatus)

watch(
  () => props.initialStatus,
  value => (orderStatus.value = value),
)

const activeStep = computed(() => orderStatusToStep(orderStatus.value))

onMounted(() => {
  const channel = supabase
    .channel(`order-status-${props.orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${props.orderId}`,
      },
      (payload) => {
        orderStatus.value = (payload.new as { status: string }).status
      },
    )
    .subscribe()

  onUnmounted(() => {
    supabase.removeChannel(channel)
  })
})
</script>

<template>
  <section class="os-card flex flex-col gap-5 p-6">
    <span class="text-[17px] font-bold">Статус заказа</span>

    <div class="flex flex-col gap-1">
      <div
        v-for="(step, index) in steps"
        :key="step.title"
        class="flex items-stretch gap-4"
      >
        <div class="flex w-10 shrink-0 flex-col items-center gap-1.5">
          <span
            class="ot-dot"
            :class="{ 'ot-dot--done': index <= activeStep }"
          >
            <Icon :name="step.icon" class="size-[18px]" />
          </span>
          <span
            v-if="index < steps.length - 1"
            class="ot-line"
            :class="{ 'ot-line--done': index < activeStep }"
          />
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-0.5 pb-[18px]">
          <span
            class="text-[15px] font-bold"
            :class="index <= activeStep ? 'text-foreground' : 'text-muted-foreground'"
          >
            {{ step.title }}
          </span>
          <span class="text-[13px] leading-[1.45] text-muted-foreground">
            {{ step.sub }}
          </span>
        </div>
      </div>
    </div>
  </section>
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
  /* Белая карточка макета: те же значения, что у .cart-surface в корзине —
     страницы обязаны читаться как один материал. Литералами, а не через
     var(--color-*): Tailwind 4 выкидывает переменную темы, если её не
     использует ни одна утилита. */
  .os-card {
    border-radius: 22px;
    background: var(--background);
    border: 1px solid var(--border);
    box-shadow:
      inset 0 1.5px 0 rgb(255 255 255 / 0.98),
      inset 0 -2px 4px rgb(15 23 42 / 0.07),
      0 1px 0 rgb(15 23 42 / 0.05);
  }

  .ot-dot {
    flex: none;
    display: grid;
    place-content: center;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    border: 2px solid var(--border);
    background: var(--background);
    box-shadow: inset 0 -1px 3px rgb(15 23 42 / 0.06);
    color: var(--muted-foreground);
    transition:
      background 0.2s ease,
      color 0.2s ease,
      border-color 0.2s ease;
  }
  .ot-dot--done {
    border: 1px solid rgb(255 255 255 / 0.5);
    background: linear-gradient(150deg, rgb(77 148 255 / 0.95), rgb(23 101 235 / 0.85));
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      0 6px 14px rgb(43 127 255 / 0.3);
    color: #fff;
  }

  .ot-line {
    width: 2px;
    flex: 1;
    min-height: 18px;
    border-radius: 999px;
    background: var(--border);
    transition: background 0.2s ease;
  }
  .ot-line--done {
    background: var(--primary);
  }
}
</style>
