<script setup lang="ts">
/**
 * «Не нашли нужный набор?» — макет `Бренд LEGO v2.dc.html`, нижняя полоса.
 *
 * Форма не пишет в базу: таблицы заявок на товар, которого нет в каталоге,
 * не существует, а `stock_alerts` требует id уже заведённого товара. Запрос
 * уходит в WhatsApp магазина с подставленным номером набора — тем же каналом,
 * который указан в условиях возврата и в подвале сайта.
 */
const props = defineProps<{ brandName: string }>()

/** Номер из подвала сайта и со страницы возврата. */
const WHATSAPP = '77025379473'

const query = ref('')

const href = computed(() => {
  const set = query.value.trim()
  const text = set
    ? `Здравствуйте! Ищу набор ${props.brandName} ${set}. Подскажите цену и срок доставки.`
    : `Здравствуйте! Ищу набор ${props.brandName}, которого нет в каталоге.`
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`
})
</script>

<template>
  <section class="blq">
    <div class="blq__inner">
      <div class="blq__text">
        <span class="blq__title">Не нашли нужный набор?</span>
        <span class="blq__note">
          Напишите номер набора — проверим наличие у поставщика и назовём срок
          доставки.
        </span>
      </div>

      <form class="blq__form" @submit.prevent>
        <input
          v-model="query"
          class="blq__input"
          type="text"
          inputmode="numeric"
          placeholder="Например, 60380"
          aria-label="Номер набора"
        >
        <a :href="href" target="_blank" rel="noopener" class="blq__cta">
          Запросить
          <Icon name="lucide:send" class="size-[17px]" />
        </a>
      </form>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .blq {
    padding: 30px 0;
    background: linear-gradient(120deg, #0b2444 0%, #123a6e 60%, #0a2040 100%);
  }

  .blq__inner {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: space-between;
    gap: 18px;
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }

  .blq__text {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  }

  .blq__title {
    color: #fff;
    font-weight: 800;
    font-size: 24px;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }

  .blq__note {
    max-width: 46ch;
    color: rgb(255 255 255 / 0.76);
    font-size: 15px;
    line-height: 1.55;
    text-wrap: pretty;
  }

  .blq__form {
    display: flex;
    flex: none;
    gap: 10px;
    width: 100%;
  }

  .blq__input {
    flex: 1;
    min-width: 0;
    height: 54px;
    padding: 0 18px;
    border: 1px solid rgb(255 255 255 / 0.28);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.1);
    color: #fff;
    font-weight: 500;
    font-size: 15px;
    outline: none;
  }

  .blq__input::placeholder {
    color: rgb(255 255 255 / 0.55);
  }

  .blq__cta {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 9px;
    height: 54px;
    padding: 0 24px;
    border-radius: 999px;
    background: #ffd84d;
    color: #0b2444;
    font-weight: 700;
    font-size: 15px;
  }

  .blq__cta:hover {
    background: #ffe075;
    color: #0b2444;
  }

  @media (min-width: 760px) {
    .blq {
      padding: 56px 0;
    }

    .blq__inner {
      flex-direction: row;
      align-items: center;
      gap: 28px;
    }

    .blq__title {
      font-size: 34px;
    }

    .blq__form {
      width: 430px;
    }
  }
}
</style>
