<script setup lang="ts">
/**
 * Текст и вопросы под сеткой разделов каталога.
 *
 * Зачем. `/catalog` с 28 апреля 2026 числится в Search Console как «Crawled —
 * currently not indexed»: на странице были только плитки разделов, то есть то
 * же меню, что и в шапке, — добавить к страницам категорий ей было нечего.
 *
 * Три решения, которые стоит помнить:
 *
 * 1. Блок рисуется ОДИН раз, вне мобильной и десктопной веток страницы. Обе
 *    ветки лежат в разметке всегда (прячет их CSS, а не `v-if`), и текст
 *    внутри одной из них приехал бы роботу дважды — на этой же странице так
 *    уже случилось с двумя заголовками «Каталог».
 * 2. Вопросы лежат ВНУТРИ `<article>` вместе с текстом. Извлекатели основного
 *    содержимого берут статью и отбрасывают соседние блоки: на лендинге LEGO
 *    из-за этого trafilatura возвращала 791 слово и ни одного вопроса.
 * 3. Типографика задана здесь, а не классами `prose`. Плагина
 *    `@tailwindcss/typography` в проекте НЕТ: `prose` ничего не значит, и
 *    первый заход дал заголовки одного размера с текстом и ссылки, неотличимые
 *    от обычных слов (проверено скриншотом). Стили — в `@layer components`,
 *    как велит docs/SCOPED_STYLES_TAILWIND_LAYERS.md, и через `:deep`, потому
 *    что содержимое приходит через `v-html`.
 */
import { catalogFaq, catalogStaticHtml } from '@/constants/catalogStaticText'
</script>

<template>
  <section class="cht">
    <div class="cht__inner">
      <article>
        <!-- eslint-disable-next-line vue/no-v-html (текст свой, из репозитория) -->
        <div class="cht__text" v-html="catalogStaticHtml" />

        <h2 class="cht__faq-title">
          Частые вопросы
        </h2>
        <div class="cht__faq">
          <div v-for="item in catalogFaq" :key="item.q" class="cht__item">
            <h3 class="cht__q">
              {{ item.q }}
            </h3>
            <p class="cht__a">
              {{ item.a }}
            </p>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .cht {
    border-top: 1px solid var(--border);
    background: var(--muted);
  }

  .cht__inner {
    max-width: 880px;
    margin: 0 auto;
    padding: 36px var(--page-gutter, 16px) 44px;
  }

  .cht__text :deep(h2),
  .cht__faq-title {
    margin: 30px 0 12px;
    color: var(--foreground);
    font-weight: 800;
    font-size: 21px;
    letter-spacing: -0.025em;
    text-wrap: pretty;
  }

  .cht__text :deep(h2:first-child) {
    margin-top: 0;
  }

  .cht__text :deep(h3) {
    margin: 22px 0 8px;
    color: var(--foreground);
    font-weight: 700;
    font-size: 17px;
    letter-spacing: -0.015em;
  }

  .cht__text :deep(p) {
    margin: 0 0 16px;
    color: var(--foreground);
    font-size: 15px;
    line-height: 1.72;
    text-wrap: pretty;
  }

  .cht__text :deep(a) {
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .cht__text :deep(ul) {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin: 0 0 16px;
    padding: 0;
    list-style: none;
  }

  /* Галочка вместо маркера — как в тексте о бренде. */
  .cht__text :deep(li) {
    position: relative;
    padding-left: 27px;
    color: var(--foreground);
    font-size: 14.5px;
    line-height: 1.6;
    text-wrap: pretty;
  }

  .cht__text :deep(li)::before {
    content: '';
    position: absolute;
    top: 4px;
    left: 0;
    width: 17px;
    height: 17px;
    background-color: var(--success);
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")
      center / contain no-repeat;
  }

  .cht__faq {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .cht__item {
    padding: 16px 18px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
  }

  .cht__q {
    margin: 0 0 6px;
    color: var(--foreground);
    font-weight: 700;
    font-size: 15.5px;
    line-height: 1.4;
    text-wrap: pretty;
  }

  .cht__a {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 14.5px;
    line-height: 1.65;
    text-wrap: pretty;
  }

  @media (min-width: 760px) {
    .cht__inner {
      padding: 56px 24px 64px;
    }

    .cht__item {
      padding: 18px 22px;
    }
  }
}
</style>
