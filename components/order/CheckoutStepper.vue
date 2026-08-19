<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useCartStore } from '@/stores/publicStore/cartStore'

/**
 * Шаги оформления — порт CheckoutSteps.dc.html.
 *
 * Три вкладки во всю ширину: «Корзина» · «Оформление» · «Заказ принят».
 * Пройденный и текущий шаги окрашены в primary, текущий вдобавок подчёркнут
 * снизу полосой 3px. Номер шага — кружок 26px: залит primary у пройденных и
 * текущего, серый (--muted) у будущих.
 *
 * Кликабельность повторяет `clickable` из макета: назад можно на любой
 * пройденный шаг, вперёд — только на «Оформление» и только пока заказ не
 * оформлен. Шаг 3 недостижим кликом по построению (условие `n < cur` при
 * n = 3 невыполнимо), поэтому маршрута страницы успеха здесь нет.
 */
const props = defineProps<{ currentStep: number }>()

const cartStore = useCartStore()
const { items } = storeToRefs(cartStore)

/**
 * Корзина живёт в localStorage, поэтому на сервере она всегда пуста, а на
 * клиенте наполняется до гидратации. Держим первый клиентский рендер равным
 * серверному и включаем реальную проверку только после mount — иначе Vue
 * ругается на несовпадение атрибута disabled у кнопки «Оформление».
 */
const isMounted = ref(false)
onMounted(() => {
  isMounted.value = true
})

const canCheckout = computed(() => isMounted.value && items.value.length > 0)

const LABELS = ['Корзина', 'Оформление', 'Заказ принят']

const steps = computed(() =>
  LABELS.map((label, index) => {
    const num = index + 1
    const active = props.currentStep === num
    const done = props.currentStep > num
    return {
      num,
      label,
      active,
      // Формула из макета: назад — всегда, вперёд — только шаг 2 и только
      // при непустой корзине, пока заказ не оформлен.
      clickable:
        num < props.currentStep
        || (num === 2 && canCheckout.value && props.currentStep < 3),
      // Пройденный и текущий окрашены одинаково, различает их подчёркивание.
      filled: active || done,
    }
  }),
)

function go(num: number) {
  if (num === props.currentStep)
    return

  // Тот же guard, что в go() макета: на оформление не пускаем с пустой корзиной.
  if (num >= 2 && items.value.length === 0) {
    toast.info('Добавьте товары в корзину')
    return
  }

  navigateTo(num === 1 ? '/cart' : '/checkout')
}
</script>

<template>
  <div class="flex w-full gap-1.5">
    <button
      v-for="step in steps"
      :key="step.num"
      type="button"
      class="cs-tab"
      :class="{ 'cs-tab--current': step.active, 'cs-tab--filled': step.filled }"
      :disabled="!step.clickable"
      @click="go(step.num)"
    >
      <span class="cs-num">{{ step.num }}</span>
      <span class="truncate">{{ step.label }}</span>
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
  .cs-tab {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    height: 52px;
    padding: 0 clamp(6px, 1.5vw, 16px);
    border: none;
    border-bottom: 3px solid var(--border);
    background: transparent;
    font-weight: 700;
    font-size: clamp(13px, 1.6vw, 16px);
    color: var(--muted-foreground);
    transition:
      color 0.15s ease,
      border-color 0.15s ease;
  }

  /* У недоступного шага в макете меняется только курсор — ни прозрачности,
     ни затемнения: это индикатор прогресса, а не набор кнопок. */
  .cs-tab:disabled {
    cursor: default;
  }
  .cs-tab:not(:disabled) {
    cursor: pointer;
  }

  /* Пройденный и текущий — цвет primary. */
  .cs-tab--filled {
    color: var(--primary);
  }

  /* Текущий шаг — единственный с синей полосой снизу. */
  .cs-tab--current {
    border-bottom-color: var(--primary);
  }

  .cs-num {
    flex: none;
    display: grid;
    place-content: center;
    width: 26px;
    height: 26px;
    border-radius: 999px;
    font-weight: 800;
    font-size: 13px;
    background: var(--muted);
    color: var(--muted-foreground);
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .cs-tab--filled .cs-num {
    background: var(--primary);
    color: var(--primary-foreground);
  }
}
</style>
