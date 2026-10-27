<script setup lang="ts">
import { SHOP, SHOP_ADDRESS_FULL } from '@/constants/shop'
import { DELIVERY_TERMS } from '@/utils/seoDescription'

/**
 * Подвал сайта — макет `SiteFooter.dc.html` (claude.ai/design, проект
 * «Прототип для покупателей»): синяя плашка «Есть вопрос?» с телефоном и
 * мессенджерами, колонка магазина и три колонки ссылок (на телефоне —
 * раскрывающиеся), нижняя строка и крупная надпись «Ухтышка».
 *
 * Отличия от макета, все — по настоящим данным магазина (23.10.2026):
 * - «Привезём за 1–2 дня» в макете — неправда: по `/terms` 1–3 рабочих дня по
 *   Алматы и 3–7 по Казахстану. Срок берётся из `DELIVERY_TERMS`, как на
 *   главной и в описаниях страниц;
 * - «Мягкие игрушки» убраны: в разделе ноль товаров, пустые разделы спрятаны
 *   из навигации (13.10). «Новинки» ведут на каталог по новизне — у
 *   `/catalog/new` флаг `is_new` не стоит ни у одного товара, страница пуста;
 * - добавлены «Конструкторы LEGO» и «Радиоуправляемые машинки» — владелец
 *   23.09.2026 назвал их главными для поиска, ссылка из подвала стоит на
 *   каждой странице (стражи `check-lego-rc-seo`, `check-ai-visibility`);
 * - «Пункты выдачи» → «Самовывоз»: пункт выдачи у магазина один;
 * - часы работы видимым текстом — 42 заказа из 45 забирают самовывозом
 *   (были в прежнем подвале, в макете их нет);
 * - синяя плашка темнее макетной, а «стеклянные» кнопки затемняют фон, а не
 *   осветляют, — ровно как у баннера бонусов на главной (`LoyaltyBanner`):
 *   белым по макетному светлому концу выходило 2,66:1 при пороге 4,5.
 *
 * Данных из базы подвал больше не берёт. Прежний делал два запроса на каждую
 * сборку страницы — избранные разделы и «хиты», ~3 КБ ответа (сжато ~1,7 КБ,
 * замер 27.10.2026), а сборок ISR — тысячи в сутки (см. docs/HANDOFF.md,
 * Egress Supabase). Вместе с ними из подвала ушли ссылки на избранные разделы
 * и пять новых товаров — на карточках товара они были единственными.
 */

interface FooterLink {
  label: string
  to: string
}

interface FooterColumn {
  title: string
  links: FooterLink[]
}

const COLUMNS: FooterColumn[] = [
  {
    title: 'Каталог',
    links: [
      { label: 'Новинки', to: '/catalog/all?sort_by=newest' },
      { label: 'Акции', to: '/catalog/promotions' },
      { label: 'Мальчикам', to: '/catalog/boys' },
      { label: 'Девочкам', to: '/catalog/girls' },
      { label: 'Малышам', to: '/catalog/kiddy' },
      { label: 'Конструкторы LEGO', to: '/brand/lego' },
      { label: 'Радиоуправляемые машинки', to: '/catalog/boys/mashinki/radioupravlyaemye-mashinki' },
    ],
  },
  {
    title: 'Покупателям',
    links: [
      { label: 'Доставка и оплата', to: '/terms#dostavka' },
      { label: 'Бонусная программа', to: '/terms#bonusy' },
      { label: 'Возврат и обмен', to: '/returns' },
      { label: 'Корзина', to: '/cart' },
      { label: 'Избранное', to: '/profile/wishlist' },
    ],
  },
  {
    title: 'О магазине',
    links: [
      { label: 'О нас', to: '/about' },
      { label: 'Бренды', to: '/brands' },
      { label: 'Контакты', to: '/about#kontakty' },
      { label: 'Самовывоз', to: '/terms#samovyvoz' },
    ],
  },
]

const currentYear = new Date().getFullYear()
const phoneHref = `tel:${SHOP.phone.replace(/-/g, '')}`
const whatsappHref = `https://wa.me/${SHOP.phone.replace(/\D/g, '')}`
const telegramHref = 'https://t.me/uhtikz'
const hours = SHOP.openingHoursHuman.charAt(0).toUpperCase() + SHOP.openingHoursHuman.slice(1)

// Раскрытые колонки — только на телефоне; на широком экране списки видны всегда.
const open = ref<boolean[]>(COLUMNS.map(() => false))
function toggle(i: number) {
  open.value[i] = !open.value[i]
}
</script>

<template>
  <div class="ft-outer">
    <footer class="ft">
      <div class="ft-container">
        <section class="ft-help" aria-labelledby="ft-help-title">
          <span class="ft-help__blob ft-help__blob--1" aria-hidden="true" />
          <span class="ft-help__blob ft-help__blob--2" aria-hidden="true" />
          <div class="ft-help__intro">
            <span class="ft-help__icon" aria-hidden="true">
              <Icon name="lucide:headset" class="size-[26px]" />
            </span>
            <div class="ft-help__text">
              <h2 id="ft-help-title" class="ft-help__title">
                Есть вопрос? Поможем выбрать игрушку
              </h2>
              <p class="ft-help__sub">
                Подскажем по возрасту, наличию и доставке по Алматы и Казахстану.
              </p>
            </div>
          </div>
          <div class="ft-help__actions">
            <a :href="phoneHref" class="ft-btn ft-btn--phone">
              <Icon name="lucide:phone" class="size-[18px] shrink-0" />{{ SHOP.phoneHuman }}
            </a>
            <a :href="whatsappHref" target="_blank" rel="noopener noreferrer" class="ft-btn ft-btn--glass">
              <Icon name="simple-icons:whatsapp" class="size-[18px] shrink-0" />WhatsApp
            </a>
            <a :href="telegramHref" target="_blank" rel="noopener noreferrer" class="ft-btn ft-btn--glass">
              <Icon name="simple-icons:telegram" class="size-[18px] shrink-0" />Telegram
            </a>
          </div>
        </section>

        <div class="ft-main">
          <div class="ft-brand">
            <NuxtLink to="/" class="ft-logo" aria-label="Ухтышка — на главную">
              <span class="ft-logo__badge">
                <!-- Знак — тот же, что в шапке (SiteHeader.vue). -->
                <svg viewBox="11 0 64 78" width="24" height="29" aria-hidden="true">
                  <g transform="translate(2 0)">
                    <g transform="rotate(-9 42 72)">
                      <rect x="37.5" y="4" width="9" height="13" rx="4.5" fill="#fff" />
                      <rect x="34" y="15.5" width="16" height="5.5" rx="2.75" fill="rgba(255,255,255,.65)" />
                      <path d="M16 36 C16 22.5 68 22.5 68 36 L68 36.5 C68 40.6 64.6 44 60.5 44 L23.5 44 C19.4 44 16 40.6 16 36.5 Z" fill="#fff" />
                      <rect x="20" y="46.5" width="44" height="6" rx="3" fill="#ffd34d" />
                      <path d="M23 55 L61 55 C57.5 61.5 50 64 45 70 A3.8 3.8 0 0 1 39 70 C34 64 26.5 61.5 23 55 Z" fill="#ff8ac2" />
                    </g>
                  </g>
                </svg>
              </span>
              <span class="ft-logo__word">Ухтышка</span>
            </NuxtLink>
            <p class="ft-brand__lead">
              Интернет-магазин детских игрушек в&nbsp;Алматы. Доставка {{ DELIVERY_TERMS }}.
            </p>
            <ul class="ft-contacts">
              <li class="ft-contacts__item">
                <Icon name="lucide:map-pin" class="ft-contacts__icon" />{{ SHOP_ADDRESS_FULL }}
              </li>
              <li class="ft-contacts__item">
                <Icon name="lucide:clock" class="ft-contacts__icon" />{{ hours }}
              </li>
              <li>
                <a href="mailto:info@uhti.kz" class="ft-contacts__item ft-contacts__link">
                  <Icon name="lucide:mail" class="ft-contacts__icon" />info@uhti.kz
                </a>
              </li>
            </ul>
          </div>

          <!-- Одна разметка на все ширины: ссылки всегда в серверном HTML, на
               телефоне список свёрнут стилем, а не v-if. Заголовок колонки —
               текстом на широком экране и кнопкой на телефоне. -->
          <div class="ft-cols">
            <nav
              v-for="(col, i) in COLUMNS"
              :key="col.title"
              class="ft-col"
              :class="{ 'ft-col--open': open[i] }"
              :aria-labelledby="`ft-col-${i}`"
            >
              <h3 :id="`ft-col-${i}`" class="ft-col__title">
                <span class="ft-col__label">{{ col.title }}</span>
                <button
                  type="button"
                  class="ft-col__toggle"
                  :aria-expanded="open[i]"
                  :aria-controls="`ft-links-${i}`"
                  @click="toggle(i)"
                >
                  {{ col.title }}
                  <Icon name="lucide:chevron-down" class="ft-col__chev size-[19px]" />
                </button>
              </h3>
              <ul :id="`ft-links-${i}`" class="ft-col__links">
                <li v-for="link in col.links" :key="link.to">
                  <NuxtLink :to="link.to" class="ft-link">
                    {{ link.label }}
                  </NuxtLink>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div class="ft-bottom">
          <span class="ft-copy">© {{ currentYear }} Ухтышка. Все права защищены.</span>
          <div class="ft-legal">
            <NuxtLink to="/privacy-policy" class="ft-legal__link">
              Политика конфиденциальности
            </NuxtLink>
            <NuxtLink to="/terms" class="ft-legal__link">
              Условия использования
            </NuxtLink>
          </div>
        </div>
      </div>

      <div class="ft-watermark" aria-hidden="true">
        Ухтышка
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md

   Значения — из макета. Ширины как в макете: телефон до 640px (колонки
   раскрываются), планшет до 1024 (колонка магазина над тремя колонками
   ссылок), дальше — четыре колонки. Контейнер — общий сайта (96rem и
   --page-gutter), а не макетные 1440px. */

@layer components {
  /* Отступ над подвалом — прозрачный, у обёртки: у самого подвала свой фон
     и скругление. `margin-top: auto` прижимает подвал к низу короткой
     страницы, как раньше. */
  .ft-outer {
    margin-top: auto;
    padding-top: clamp(24px, 4vw, 48px);
  }

  .ft {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    border-top: 1px solid var(--border);
    /* blue-50 пополам с белым, как в макете. */
    background: color-mix(in oklch, oklch(97% 0.014 254.604) 50%, #fff);
    /* Резерв под нижнюю навигацию (видна до 1024px) и липкую панель покупки
       на карточке: 96px, как в макете. Раньше он висел на <main> (у страниц
       без подвала он там и остался, см. layouts/Shell.vue) — и низ подвала,
       копирайт, на карточке товара прятался под панелью «В корзину». */
    padding-bottom: calc(96px + env(safe-area-inset-bottom));
  }

  .ft-container {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 96rem;
    margin: 0 auto;
    padding: 20px var(--page-gutter) 0;
  }

  /* ---- Плашка «Есть вопрос?» ---- */
  .ft-help {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 18px;
    margin-bottom: 26px;
    padding: 20px 18px;
    border-radius: 22px;
    /* Темнее макета (#0f52d9 → #2b7fff → #5aa0ff), как LoyaltyBanner.vue:
       белым по светлому концу макета было 2,66:1, здесь худший случай 4,59. */
    background: linear-gradient(120deg, #0b3f9e 0%, #1e5cc4 52%, #3573d6 100%);
    color: #fff;
    box-shadow: 0 20px 46px -20px rgb(43 127 255 / 0.7);
  }
  .ft-help__blob {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
  }
  .ft-help__blob--1 {
    top: -90px;
    left: -40px;
    width: 260px;
    height: 260px;
    background: rgb(255 255 255 / 0.1);
  }
  .ft-help__blob--2 {
    bottom: -120px;
    right: 30%;
    width: 240px;
    height: 240px;
    background: rgb(255 255 255 / 0.07);
  }
  .ft-help__intro {
    position: relative;
    display: flex;
    flex: none;
    align-items: center;
    gap: 16px;
    min-width: 0;
  }
  .ft-help__icon {
    flex: none;
    display: grid;
    place-content: center;
    width: 52px;
    height: 52px;
    border: 1px solid rgb(255 255 255 / 0.32);
    border-radius: 16px;
    background: rgb(255 255 255 / 0.16);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    color: #fff;
  }
  .ft-help__text {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .ft-help__title {
    margin: 0;
    color: #fff;
    font-family: var(--font-sans);
    font-size: 20px;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }
  .ft-help__sub {
    margin: 0;
    color: rgb(255 255 255 / 0.88);
    font-family: var(--font-sans);
    font-size: 14.5px;
    line-height: 1.5;
    text-wrap: pretty;
  }
  .ft-help__actions {
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .ft-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 50px;
    border-radius: 999px;
    font-family: var(--font-sans);
    font-size: 15px;
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.15s ease;
  }
  .ft-btn:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
  .ft-btn--phone {
    grid-column: 1 / -1;
    gap: 9px;
    padding: 0 20px;
    background: #fff;
    color: var(--primary);
    box-shadow: 0 8px 20px rgb(6 24 80 / 0.18);
  }
  .ft-btn--phone:hover {
    background: oklch(97% 0.014 254.604); /* blue-50 */
    color: var(--primary);
  }
  /* Стекло затемняет, а не осветляет: белая подложка роняла контраст
     надписи (у LoyaltyBanner замер 2,28:1). Светлая рамка держит вид. */
  .ft-btn--glass {
    gap: 8px;
    padding: 0 18px;
    border: 1px solid rgb(255 255 255 / 0.32);
    background: rgb(0 0 0 / 0.18);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    color: #fff;
  }
  .ft-btn--glass:hover {
    background: rgb(0 0 0 / 0.28);
    color: #fff;
  }

  /* ---- Колонка магазина и колонки ссылок ---- */
  .ft-main {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding-bottom: 8px;
  }
  .ft-brand {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .ft-logo {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
  }
  .ft-logo__badge {
    display: grid;
    place-content: center;
    width: 42px;
    height: 42px;
    border-radius: 13px;
    background: var(--primary);
    box-shadow: 0 10px 15px -3px oklch(0.623 0.214 259.815 / 0.3);
  }
  .ft-logo__word {
    color: var(--primary);
    font: 800 22px var(--font-display);
    letter-spacing: -0.02em;
  }
  .ft-brand__lead {
    margin: 0;
    max-width: 300px;
    color: var(--muted-foreground);
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.6;
    text-wrap: pretty;
  }
  .ft-contacts {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ft-contacts__item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    color: var(--foreground);
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 500;
    line-height: 1.45;
  }
  .ft-contacts__icon {
    flex: none;
    width: 17px;
    height: 17px;
    margin-top: 1px;
    color: var(--primary);
  }
  .ft-contacts__link {
    align-items: center;
    line-height: normal;
    text-decoration: none;
  }
  .ft-contacts__link .ft-contacts__icon {
    margin-top: 0;
  }
  .ft-contacts__link:hover {
    color: var(--primary);
  }

  /* Телефон: колонки — раскрывающиеся строки. */
  .ft-cols {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--border);
  }
  .ft-col {
    min-width: 0;
    border-bottom: 1px solid var(--border);
  }
  /* Высота строки — обычная, как в макете: у сайта по умолчанию 1.5, и
     каждая строка колонки выходила на 2px выше. */
  .ft-col__title {
    margin: 0;
    color: var(--foreground);
    font-family: var(--font-sans);
    font-size: 15px;
    font-weight: 700;
    line-height: normal;
  }
  .ft-col__label {
    display: none;
  }
  .ft-col__toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 54px;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .ft-col__chev {
    flex: none;
    color: var(--muted-foreground);
    transition: transform 0.2s ease;
  }
  .ft-col--open .ft-col__chev {
    transform: rotate(180deg);
  }
  .ft-col__links {
    display: none;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 16px;
    margin: 0;
    padding: 0 0 12px;
    /* Размер шрифта — у списка, а не только у ссылки: строку пункта задаёт
       шрифт самого пункта (16px от body), и ряд выходил на 3px выше макета. */
    font-size: 14px;
    line-height: normal;
    list-style: none;
  }
  .ft-col--open .ft-col__links {
    display: grid;
  }
  .ft-link {
    display: flex;
    align-items: center;
    min-height: 42px;
    color: var(--muted-foreground);
    font-family: var(--font-sans);
    font-size: 14px;
    text-decoration: none;
  }
  .ft-link:hover {
    color: var(--primary);
  }

  /* ---- Нижняя строка и надпись ---- */
  .ft-bottom {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px 24px;
    padding: 18px 0;
    line-height: normal;
  }
  .ft-copy,
  .ft-legal__link {
    color: var(--muted-foreground);
    font-family: var(--font-sans);
    font-size: 13px;
    text-decoration: none;
  }
  .ft-legal {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 20px;
  }
  .ft-legal__link:hover {
    color: var(--primary);
  }

  .ft-watermark {
    position: relative;
    z-index: 0;
    display: block;
    overflow: hidden;
    margin: 6px 0 0;
    background: linear-gradient(180deg, rgb(43 127 255 / 0.16) 0%, rgb(43 127 255 / 0) 92%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    font: 800 min(16vw, 90px) / 0.8 var(--font-display);
    letter-spacing: -0.04em;
    text-align: center;
    white-space: nowrap;
    user-select: none;
    pointer-events: none;
  }

  /* ---- Планшет и шире ---- */
  @media (min-width: 640px) {
    .ft {
      border: 1px solid color-mix(in oklch, oklch(93.2% 0.032 255.585) 70%, #fff); /* blue-100 */
      border-bottom: none;
      border-radius: 32px 32px 0 0;
    }
    .ft-container {
      padding-top: clamp(24px, 3vw, 40px);
    }

    .ft-help {
      flex-direction: row;
      align-items: center;
      gap: 24px;
      margin-bottom: clamp(28px, 3.5vw, 44px);
      padding: 26px 30px;
      border-radius: 24px;
    }
    .ft-help__intro {
      flex: 1 1 360px;
    }
    .ft-help__title {
      font-size: clamp(20px, 1.9vw, 26px);
    }
    .ft-help__actions {
      display: flex;
      flex-wrap: wrap;
    }
    .ft-btn--phone {
      grid-column: auto;
    }

    .ft-main {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 28px 24px;
      padding-bottom: 36px;
    }
    .ft-brand {
      grid-column: 1 / -1;
    }
    /* Колонки ссылок встают в сетку сами, обёртка не участвует. */
    .ft-cols {
      display: contents;
    }
    .ft-col {
      display: flex;
      flex-direction: column;
      gap: 14px;
      border-bottom: none;
    }
    .ft-col__label {
      display: inline;
    }
    .ft-col__toggle {
      display: none;
    }
    .ft-col__links,
    .ft-col--open .ft-col__links {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 0;
    }
    .ft-link {
      display: inline;
      min-height: 0;
    }

    .ft-bottom {
      flex-direction: row;
      align-items: center;
      border-top: 1px solid var(--border);
    }

    .ft-watermark {
      margin: 4px 0 -0.14em;
      font-size: clamp(96px, 16.5vw, 250px);
    }
  }

  @media (min-width: 1024px) {
    .ft {
      padding-bottom: 0;
    }
    .ft-main {
      grid-template-columns: minmax(260px, 1.4fr) repeat(3, minmax(0, 1fr));
      gap: 32px;
    }
    .ft-brand {
      grid-column: auto;
    }
  }
}
</style>
