<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useCartStore } from '@/stores/publicStore/cartStore'

/**
 * Мобильная локейшн-панель — порт строк 69–79 Корзина.dc.html.
 *
 * Липнет под шапкой и на шаге «Корзина», и на шаге «Оформление»: город со
 * способом получения сверху, адрес снизу. Пока адреса нет, вторая строка —
 * синий призыв «Укажите адрес доставки», клик по ней ведёт на оформление
 * (в макете `focusAddr: () => this.go(2)`).
 *
 * На шаге «Заказ принят» не показывается — `showLocBar: mob && S.step !== 3`.
 */
const props = defineProps<{ currentStep: number }>()

const cartStore = useCartStore()
const authStore = useAuthStore()
const modalStore = useModalStore()

const { deliveryMethod, deliveryAddress, deliverySlotLabel }
  = storeToRefs(cartStore)
const { isLoggedIn } = storeToRefs(authStore)

/**
 * Адрес и способ получения persist'ятся, то есть на сервере пусты, а на
 * клиенте восстанавливаются до гидратации. Держим первый клиентский рендер
 * равным серверному — иначе Vue ругается на разъехавшийся текст.
 */
const isMounted = ref(false)
onMounted(() => {
  isMounted.value = true
})

const isCourier = computed(
  () => !isMounted.value || deliveryMethod.value === 'courier',
)

const addressLine = computed(() =>
  isMounted.value ? deliveryAddress.value.line1.trim() : '',
)

const city = computed(() => deliveryAddress.value.city || 'Алматы')

/**
 * Как в макете: у курьера — город и выбранный интервал («Алматы, 12:00–14:00»),
 * у самовывоза — «Алматы · самовывоз». До монтирования интервал не показываем:
 * выбор восстанавливается из localStorage и на сервере ещё неизвестен.
 */
const topLine = computed(() => {
  if (!isCourier.value)
    return `${city.value} · самовывоз`
  return isMounted.value && deliverySlotLabel.value
    ? `${city.value}, ${deliverySlotLabel.value}`
    : `${city.value} · доставка курьером`
})

const bottomLine = computed(() => {
  if (addressLine.value)
    return addressLine.value
  return isCourier.value ? 'Укажите адрес доставки' : 'Заберёте сами из магазина'
})

// Синим подсвечиваем только незаполненный адрес — это призыв к действию.
const isBottomLineCta = computed(() => isCourier.value && !addressLine.value)

function focusAddress() {
  if (props.currentStep !== 2) {
    navigateTo('/checkout')
    return
  }

  // Уже на оформлении — доводим до поля вместо бессмысленной навигации.
  const input = document.getElementById('address')
  input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  input?.focus({ preventScroll: true })
}

function openChat() {
  toast.info('Поддержка скоро ответит')
}
</script>

<template>
  <div class="loc-bar flex items-center gap-3 border-b bg-background">
    <Icon name="lucide:map-pin" class="size-5 shrink-0 text-primary" />

    <button
      type="button"
      class="flex min-w-0 flex-1 flex-col gap-px text-left"
      @click="focusAddress"
    >
      <span class="truncate text-[13px] font-bold text-foreground">
        {{ topLine }}
      </span>
      <span
        class="truncate text-xs font-medium"
        :class="isBottomLineCta ? 'text-primary' : 'text-muted-foreground'"
      >
        {{ bottomLine }}
      </span>
    </button>

    <ClientOnly>
      <button
        v-if="!isLoggedIn"
        type="button"
        class="h-10 shrink-0 rounded-xl bg-brand-surface px-[15px] text-[13px] font-bold text-primary"
        @click="modalStore.openLoginModal()"
      >
        Войти
      </button>
    </ClientOnly>

    <button
      type="button"
      aria-label="Написать в поддержку"
      class="grid size-10 shrink-0 place-content-center rounded-xl bg-muted transition-colors hover:bg-border"
      @click="openChat"
    >
      <Icon name="lucide:message-circle" class="size-5 text-foreground" />
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
  /* Липнет не к нулю, а под мобильную плашку шапки: у .sh-mobile в
     components/common/SiteHeader.vue padding 10px сверху и снизу плюс кнопки
     40px — ровно 60px. Обе панели sticky, и без этого сдвига они наложились бы
     друг на друга при скролле. */
  .loc-bar {
    position: sticky;
    top: 60px;
    z-index: 30;
    padding: 11px clamp(14px, 4vw, 20px);
  }
}
</style>
