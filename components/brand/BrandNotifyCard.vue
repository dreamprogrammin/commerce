<script setup lang="ts">
/**
 * Карточка «Скоро новые модели» в конце сетки товаров. Порт блока notify
 * из `Бренд.dc.html`.
 *
 * Показывается только когда товаров мало: в макете она занимает две ячейки
 * и заполняет пустоту в неполном ряду. При полной сетке это лишний шум —
 * посетителю есть что смотреть.
 *
 * Порог 4 — половина ряда на десктопе (там 4 колонки). Больше четырёх
 * товаров ряд уже держит форму сам.
 *
 * Подписка ведёт на существующий механизм: тот же `StockAlertButton`, что
 * на карточке товара, здесь неприменим — он привязан к конкретному товару.
 * Поэтому кнопка просто открывает почтовый клиент: заводить отдельную
 * таблицу подписок на бренд ради макета не стоит, а обещать уведомление и
 * не отправить его — хуже, чем не обещать.
 */
const props = defineProps<{
  brandName: string
  productCount: number
}>()

/** Больше четырёх товаров — ряд заполнен, карточка не нужна. */
const VISIBLE_BELOW = 4

const show = computed(() => props.productCount > 0 && props.productCount < VISIBLE_BELOW)

const mailto = computed(
  () => `mailto:info@uhti.kz?subject=${encodeURIComponent(`Новинки ${props.brandName}`)}`,
)
</script>

<template>
  <div v-if="show" class="bnc">
    <span class="bnc__icon">
      <Icon name="lucide:bell-ring" class="size-6" />
    </span>
    <span class="bnc__text">
      <span class="bnc__title">Скоро новые модели {{ brandName }}</span>
      <span class="bnc__note">
        Везём новые серии. Напишите нам — сообщим первым, когда появятся в наличии.
      </span>
    </span>
    <a :href="mailto" class="bnc__button">
      <Icon name="lucide:mail" class="size-4" />
      Уведомить
    </a>
  </div>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .bnc {
    display: flex;
    flex-direction: column;
    grid-column: span 2;
    gap: 12px;
    justify-content: center;
    padding: 20px;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 20px;
    background: linear-gradient(155deg, #fff 0%, rgb(219 234 254 / 0.75) 100%);
    box-shadow:
      inset 0 1px 0 #fff,
      0 10px 26px rgb(15 23 42 / 0.07);
  }

  .bnc__icon {
    display: grid;
    place-content: center;
    width: 46px;
    height: 46px;
    border-radius: 15px;
    background: rgb(43 127 255 / 0.12);
    color: var(--primary);
  }

  .bnc__text {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bnc__title {
    color: var(--foreground);
    font-weight: 700;
    font-size: 17px;
  }

  .bnc__note {
    max-width: 38ch;
    color: var(--muted-foreground);
    font-size: 14px;
    line-height: 1.5;
    text-wrap: pretty;
  }

  .bnc__button {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 8px;
    height: 46px;
    margin-top: 2px;
    padding: 0 20px;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 999px;
    background: linear-gradient(150deg, #fff, rgb(224 233 247 / 0.65));
    box-shadow:
      inset 0 1px 0 #fff,
      0 6px 16px rgb(43 127 255 / 0.16);
    color: var(--primary);
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
  }

  .bnc__button:hover {
    background: linear-gradient(150deg, #fff, rgb(191 219 254 / 0.8));
    color: var(--primary);
  }

  @media (min-width: 900px) {
    .bnc {
      padding: 24px 26px;
    }
  }
}
</style>
