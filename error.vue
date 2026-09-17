<script setup lang="ts">
import type { NuxtError } from '#app'

/**
 * Страница ошибки.
 *
 * Зачем своя. До 17 сентября 2026 её не было вовсе, и на снятый товар Nuxt
 * отдавал дефолтную заглушку: «404 - Товар не найден | Nuxt», задвоенный
 * текст и ссылка «Go back home» по-английски. Для сайта, куда из поиска
 * приходят по артикулам снятых товаров, это тупик: ни поиска, ни разделов.
 *
 * Здесь намеренно нет обращений к хранилищам и к базе. Страница ошибки
 * рисуется в том числе тогда, когда что-то уже сломалось, и тянуть за собой
 * данные — верный способ получить ошибку внутри ошибки.
 */
const props = defineProps<{ error: NuxtError }>()

const isNotFound = computed(() => props.error?.statusCode === 404)

const heading = computed(() =>
  isNotFound.value ? 'Такой страницы нет' : 'Что-то сломалось',
)

const explanation = computed(() =>
  isNotFound.value
    ? 'Возможно, товар сняли с продажи или адрес набран с опечаткой. Поищите по названию или загляните в разделы — скорее всего, нужное найдётся.'
    : 'Мы уже знаем о поломке и чиним. Попробуйте обновить страницу через минуту или напишите нам в WhatsApp.',
)

/** Корневые разделы каталога — те же, что в меню. */
const SECTIONS = [
  { to: '/catalog/boys', label: 'Мальчикам' },
  { to: '/catalog/girls', label: 'Девочкам' },
  { to: '/catalog/kiddy', label: 'Малышам' },
  { to: '/catalog/constructors-root', label: 'Конструкторы' },
  { to: '/catalog/creativity', label: 'Творчество' },
  { to: '/catalog/games', label: 'Игры' },
]

const query = ref('')

useHead({
  title: computed(() => (isNotFound.value ? 'Страница не найдена | Ухтышка' : 'Ошибка | Ухтышка')),
  meta: [{ name: 'robots', content: 'noindex, follow' }],
})
</script>

<template>
  <div class="ep">
    <div class="ep__inner">
      <NuxtLink to="/" class="ep__brand">
        Ухтышка
      </NuxtLink>

      <p class="ep__code">
        {{ error?.statusCode ?? 404 }}
      </p>
      <h1 class="ep__title">
        {{ heading }}
      </h1>
      <p class="ep__text">
        {{ explanation }}
      </p>

      <!--
        Форма обычная, method="get" — работает и без JavaScript. Страница
        ошибки обязана быть полезной даже тогда, когда на клиенте что-то не
        загрузилось.
      -->
      <form class="ep__search" action="/search" method="get" role="search">
        <label class="sr-only" for="ep-q">Поиск по каталогу</label>
        <input
          id="ep-q"
          v-model="query"
          name="q"
          type="search"
          class="ep__input"
          placeholder="Найти игрушку, бренд или артикул"
          autocomplete="off"
        >
        <button type="submit" class="ep__submit">
          Найти
        </button>
      </form>

      <nav class="ep__sections" aria-label="Разделы каталога">
        <NuxtLink v-for="s in SECTIONS" :key="s.to" :to="s.to" class="ep__chip">
          {{ s.label }}
        </NuxtLink>
      </nav>

      <p class="ep__links">
        <NuxtLink to="/catalog">
          Весь каталог
        </NuxtLink>
        <span aria-hidden="true">·</span>
        <NuxtLink to="/">
          На главную
        </NuxtLink>
      </p>
    </div>
  </div>
</template>

<style scoped>
@layer components {
  .ep {
    display: flex;
    min-height: 100dvh;
    align-items: center;
    justify-content: center;
    padding: 32px 20px;
    background: var(--background);
    color: var(--foreground);
  }

  .ep__inner {
    width: 100%;
    max-width: 640px;
    text-align: center;
  }

  .ep__brand {
    display: inline-block;
    margin-bottom: 28px;
    font-size: 20px;
    font-weight: 800;
    color: var(--primary);
    text-decoration: none;
  }

  .ep__code {
    margin: 0;
    font-size: 64px;
    font-weight: 800;
    line-height: 1;
    color: var(--primary);
    opacity: 0.25;
  }

  .ep__title {
    margin: 8px 0 0;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.2;
  }

  .ep__text {
    margin: 12px auto 0;
    max-width: 480px;
    font-size: 15px;
    line-height: 1.55;
    color: var(--muted-foreground);
  }

  .ep__search {
    display: flex;
    gap: 8px;
    margin: 24px auto 0;
    max-width: 480px;
  }

  .ep__input {
    flex: 1;
    min-width: 0;
    height: 46px;
    padding: 0 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    font-size: 15px;
    color: inherit;
  }

  .ep__submit {
    height: 46px;
    padding: 0 20px;
    border: 0;
    border-radius: 12px;
    background: var(--primary);
    color: var(--primary-foreground);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }

  .ep__sections {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 24px;
  }

  .ep__chip {
    padding: 8px 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    font-size: 14px;
    text-decoration: none;
    color: inherit;
  }

  .ep__links {
    margin-top: 24px;
    display: flex;
    justify-content: center;
    gap: 10px;
    font-size: 14px;
    color: var(--muted-foreground);
  }

  .ep__links a {
    color: var(--primary);
    text-decoration: none;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
</style>
