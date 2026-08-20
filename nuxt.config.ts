import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'

/**
 * Превью (`dev.uhti.kz`) — не боевой сайт, и в индексе ему не место.
 *
 * `VERCEL_ENV` платформа выставляет сама: `production` на боевом деплое,
 * `preview` на всех остальных. Локально переменной нет вовсе, поэтому
 * `isPreview` там ложно и сборка ведёт себя как боевая.
 *
 * Работает здесь robots.txt, и он же — настоящий запрет: закрытые в нём
 * адреса робот просто не запрашивает.
 *
 * Мета-тег и заголовок — вторая линия, и закрыты они НЕ ВЕЗДЕ. Замер на
 * сборке превью (`VERCEL_ENV=preview`, девять адресов):
 *
 *   /about /terms /catalog /catalog/new /catalog/promotions   и мета, и заголовок закрыты
 *   /catalog/boys, карточка товара                            мета закрыта, заголовок нет
 *   /, /brand/**                                              оба остались index, follow
 *
 * Ради этого перепробовано и оставлено в коде три рычага: композабл
 * `useRobotsContent` на страницах (он и закрыл мета-теги), запрещающая
 * группа в `robots.groups` и ключ `robots` в правиле маршрута. Отдельно
 * испробованы и отброшены серверный плагин на хуке `request` и на
 * `render:response` — заголовок перезаписывался в обоих случаях.
 *
 * Почему так: в собранном сервере видно, что `@nuxtjs/robots` сам вычисляет
 * строку и сам ставит и заголовок, и мета-тег, добавляя его ПОСЛЕ страницы.
 * На части адресов его значение выигрывает у страничного, и ни один из
 * перечисленных входов на него не повлиял. Докопаться до конца не удалось.
 *
 * На запрет обхода это не влияет: robots.txt отдаёт `Disallow: /`, и
 * закрытые в нём адреса робот не запрашивает вовсе — а значит ни заголовка,
 * ни мета-тега не видит.
 *
 * Следствие, о котором важно помнить: сборка превью несёт запрет внутри
 * себя. Если такую сборку продвинуть в продакшн через `vercel promote`,
 * боевой сайт уедет с `Disallow: /`. Продвигать нужно сборку с `master`.
 */
const isPreview = !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',

  devServer: {
    host: 'localhost',
    port: 3000,
  },

  runtimeConfig: {
    indexnowKey: process.env.INDEXNOW_KEY || '07d3f5086f59e65326ce9d66b1d1f57c',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    public: {
      siteUrl: 'https://uhti.kz',
    },
  },

  modules: [
    '@pinia/nuxt',
    '@nuxtjs/supabase',
    'shadcn-nuxt',
    'pinia-plugin-persistedstate/nuxt',
    '@nuxt/image',
    '@nuxt/icon',
    '@nuxtjs/robots',
    '@nuxtjs/sitemap',
    'nuxt-og-image',
    'nuxt-schema-org',
    '@nuxt/fonts',
    'nuxt-gtag',
    // 🔥 Отключаем Storybook в dev режиме
    ...(process.env.NODE_ENV === 'production' ? ['@nuxtjs/storybook'] : []),
  ],

  gtag: {
    id: process.env.NUXT_PUBLIC_GTAG_ID,
    loadingStrategy: 'defer',
    enabled: true,
    config: {
      id: process.env.NUXT_PUBLIC_GTAG_ID,
    },
  },

  // @nuxt/fonts — font-display: swap убирает блокировку рендера шрифтами
  fonts: {
    defaults: {
      // 800/900 нужны заголовкам и ценам в дизайне главной — без них
      // браузер синтезирует псевдожирное начертание
      weights: [400, 500, 600, 700, 800, 900],
      styles: ['normal'],
      subsets: ['cyrillic', 'latin'],
    },
    families: [
      // Montserrat Alternates используется только для логотипа-словомарки
      // («Ухтышка» в шапке, подвале и на бонусной карте) — тянем один вес
      { name: 'Montserrat Alternates', weights: [800] },
    ],
    display: 'swap',
    // Предзагружаем шрифты для быстрого первого рендера
    preload: true,
  },

  // @nuxt/icon — оптимизируем иконки
  icon: {
    // CSS иконок — в отдельный слой, иначе он бьёт утилиты Tailwind.
    //
    // По умолчанию @nuxt/icon отдаёт `:where(.i-lucide\:x){width:1em;height:1em}`
    // ВНЕ слоёв. Беслойное правило бьёт любой слой независимо от специфичности,
    // поэтому утилиты Tailwind на иконках не работали вовсе: `size-[26px]`
    // рисовался как 16px, `size-5` — как 14px. Нулевая специфичность у :where()
    // сделана как раз чтобы правило легко перебивали, но слои этот замысел
    // ломают.
    //
    // Имя слоя СВОЁ, а не 'components'. Стили иконок Nuxt подмешивает
    // отдельными <style> раньше entry.css, и слой регистрируется первым.
    // С именем 'components' это переставляло весь порядок в
    // `components → properties → theme → base → utilities`: preflight из base
    // оказывался ПОСЛЕ компонентов и сносил им рамки и фон — проверено, вёрстка
    // оформления разваливалась.
    //
    // Со своим именем всё встаёт правильно:
    // `icons → properties → theme → base → components → utilities`.
    // Иконки слабее всех: размер задаёт разметка (utilities), а компонент,
    // задающий размер своим классом, тоже сильнее. Порядок слоёв Tailwind
    // при этом не меняется.
    cssLayer: 'icons',
    serverBundle: {
      collections: ['lucide', 'streamline-plump', 'streamline-emojis', 'fluent-emoji-flat', 'line-md', 'simple-icons', 'gravity-ui', 'mdi', 'logos', 'ic', 'solar'],
    },
    clientBundle: {
      scan: true,
      sizeLimitKb: 256,
    },
  },

  site: {
    // Отсюда `@nuxtjs/robots` берёт решение по robots.txt: на превью он
    // отдаёт `Disallow: /`. Это и есть настоящий запрет — закрытые здесь
    // адреса робот просто не запрашивает. Заголовок выше — вторая линия,
    // на случай если robots.txt проигнорируют.
    indexable: !isPreview,
    url: 'https://uhti.kz',
    name: 'Ухтышка',
    description: 'Интернет-магазин с широким ассортиментом игрушек.',
    defaultLocale: 'ru',
  },

  ogImage: {
    runtimeCacheStorage: true,
    defaults: {
      width: 1200,
      height: 630,
    },
    fonts: ['Inter:400', 'Inter:700', 'Inter:900'],
  },

  /*
   * `schemaOrg.identity` намеренно НЕ задан.
   *
   * Модуль строит из него отдельный узел `Organization` с `@id` вида
   * `.../#identity`, а свой, полный, узел организации у нас объявлен в
   * `app.vue` под `@id` `.../#organization` — с логотипом, `legalName`,
   * `foundingDate` и `sameAs` на Instagram. На него же ссылаются
   * `WebSite.publisher` и `WebPage.about`.
   *
   * Пока identity был задан здесь, в разметке КАЖДОЙ страницы лежали два
   * узла `Organization` про один и тот же бизнес, причём узел от модуля был
   * беднее: `sameAs: []`, ни логотипа, ни телефона, и на него не ссылался
   * никто. Проверено переобходом прода 20 августа 2026.
   */

  sitemap: {
    sources: ['/api/sitemap-routes'],

    /*
     * Единственный источник адресов — `/api/sitemap-routes`. Обход
     * `pages/**` модулем отключён.
     *
     * Зачем. Модуль по умолчанию складывает свой источник с нашим, и
     * файловые маршруты попадают в карту, ЧЕГО БЫ ни решил генератор. На
     * этом обжёгся 20 августа 2026: `/catalog/new` перестала отдаваться
     * генератором (в базе ноль товаров с `is_new`), а в боевой карте
     * осталась — модуль добавил её сам. Опознаётся такая запись по
     * отсутствию `<lastmod>`: генератор дату ставит всегда, а обход
     * страниц — нет.
     *
     * Проверять надо ГОТОВУЮ карту `/sitemap.xml`, а не только ответ
     * `/api/sitemap-routes` — на этой разнице я и промахнулся.
     *
     * Потерь от отключения нет: сверка боевой карты с генератором показала,
     * что своим обходом модуль добавлял ровно один адрес, и это как раз тот,
     * которого там быть не должно. Остальные 307 приходят из генератора.
     */
    excludeAppSources: ['nuxt:pages'],

    exclude: [
      '/admin/**',
      '/confirm/**',
      '/forgot-password/**',
      '/order/**',
      '/profile/**',
      '/register/**',
      '/reset-password/**',
      '/cart',
      '/checkout',
      '/search',
      '/notifications',
      /*
       * '/brands' ОТСЮДА УБРАН — намеренно, не забыт.
       *
       * Это не служебная страница, а хаб: она отдаёт в разметке ссылки на все
       * 32 бренда и сама лежит в индексе Google. Единственный путь робота
       * к страницам брендов идёт через неё.
       *
       * Пока она была исключена, Google заходил на неё раз в два с половиной
       * месяца (последний обход 3 июня по данным URL Inspection) — и ссылки,
       * которые она раздаёт, в очередь не попадали. Показательный случай:
       * бренд Polese создан 20 апреля, к 3 июня уже был в её разметке, а
       * `/brand/polese` Google не знает до сих пор — «URL is unknown».
       *
       * lastmod для неё задаётся в server/api/sitemap-routes.ts.
       */
      '/contacts',
      '/auth/**',
    ],
  },

  robots: {
    /*
     * На превью — одна запрещающая группа вместо всего набора ниже.
     *
     * Дело не только в robots.txt: движок правил модуля решает и то, какой
     * `X-Robots-Tag` уйдёт в ответ, и на части страниц он перебивает и
     * правило маршрута, и мета-тег самой страницы. Пока здесь стояли
     * `allow: ['/', '/catalog/**', …]`, модуль считал адреса разрешёнными
     * и ставил `index, follow` — проверено запуском: главная отдавала
     * ровно его, причём без суффиксов `max-image-preview`, то есть значение
     * приходило от модуля, а не со страницы.
     */
    groups: isPreview
      ? [{ userAgent: ['*'], disallow: ['/'] }]
      : [
          {
            userAgent: ['*'],
            allow: ['/', '/catalog/**', '/brand/**'],
            disallow: [
              '/admin',
              '/confirm',
              '/forgot-password',
              '/login',
              '/order',
              '/profile',
              '/register',
              '/reset-password',
              '/cart',
              '/checkout',
              '/search',
              '/notifications',
              '/auth',
              '/api/**',
              // ЗДЕСЬ НЕ ДОЛЖНО БЫТЬ правила из слэша, двух звёздочек и
              // слэша. Оно тут стояло и убрано 20 августа 2026 — ниже почему,
              // чтобы не вернули. (Записано строчными комментариями нарочно:
              // сам шаблон содержит последовательность, закрывающую блочный
              // комментарий, и на этом уже спотыкались при правке.)
              //
              // Откуда взялось: неверно прочли отчёт Search Console
              // (см. docs/FIX_ROBOTS_TXT_BLOCKED.md). Google перечислял этот
              // шаблон среди «заблокированных в robots.txt» — то есть
              // показывал строку из самого robots.txt, а её приняли за адрес,
              // который надо закрыть.
              //
              // Что оно делало: Google выбирает правило по самому длинному
              // совпадению, а в этом шаблоне 4 знака. Он перекрывал ЛЮБОЙ
              // путь из двух и более сегментов, кроме спасённых более
              // длинными `Allow: /catalog/**` (12 знаков) и `Allow: /brand/**`
              // (10). Под запретом оказывались:
              //
              //   /__og-image__/** — все генерируемые OG-картинки, а на них
              //                      ссылается og:image каталога, категорий,
              //                      бренд-разделов и /brands;
              //   /promo/**        — маршрут pages/promo/[slug].vue целиком.
              //
              // Приватные разделы от удаления не открываются: у каждого есть
              // своё правило по префиксу (/admin, /profile, /order, /auth,
              // /api/**, /_nuxt, /__nuxt и остальные выше).
              //
              // Проверять такое питоновским `robotparser` бесполезно: у него
              // побеждает первое подходящее правило, и он объявляет
              // разрешённым всё, включая /admin.
              '/__nuxt',
              '/_nuxt',
            ],
          },
          // Yandex-специфичная конфигурация для очистки параметров фильтров
          {
            userAgent: ['Yandex'],
            cleanParam: [
              // Сортировка и пагинация
              'sort_by',
              'page',

              // Фильтры каталога
              'brands',
              'subcategories',
              'materials',
              'countries',
              'price_min',
              'price_max',

              // Динамические атрибуты (возраст, размер и т.д.)
              'attr_age',
              'attr_size',
              'attr_color',
              'attr_material',
              'attr_gender',

              // UTM метки и tracking
              'utm_source',
              'utm_medium',
              'utm_campaign',
              'utm_content',
              'utm_term',
              'fbclid',
              'gclid',
              'yclid',
            ],
          },
        ],
    sitemap: ['https://uhti.kz/sitemap.xml'],
  },

  experimental: {
    payloadExtraction: true,
    renderJsonPayloads: true,
    componentIslands: true,
    treeshakeClientOnly: true,
    watcher: 'parcel',
  },

  features: {
    // Отключаем inlineStyles, так как при использовании Tailwind 4 и большого количества компонентов
    // это раздувает HTML и замедляет парсинг и Layout.
    inlineStyles: false,
  },

  nitro: {
    routeRules: {
      // 🔒 Базовые security-заголовки для всех страниц.
      // CSP пока в Report-Only режиме — собираем нарушения перед принудительным включением,
      // т.к. на сайте используются сторонние origin'ы (Supabase Storage, Google Fonts, GTM/GA).
      '/**': {
        /*
         * Ключ `robots` в правиле маршрута — то самое место, откуда
         * `@nuxtjs/robots` берёт значение. Видно в собранном сервере:
         * модуль вычисляет строку из правила (иначе берёт свой
         * `robotsEnabledValue`, то есть `index, follow`) и дальше сам ставит
         * и заголовок `X-Robots-Tag`, и мета-тег `robots`.
         *
         * Поэтому ни запрещающая группа в `robots.groups`, ни
         * `site.indexable`, ни заголовок, выставленный руками, заголовок на
         * страницах не меняли: модуль перезаписывал его своим значением.
         * Всё это было испробовано и проверено запуском.
         */
        ...(isPreview ? { robots: 'noindex, nofollow' } : {}),
        headers: {
          // Только на превью; на боевой сборке ключа здесь нет вовсе.
          // Доезжает не до всех страниц — почему, см. комментарий к isPreview.
          ...(isPreview ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Content-Security-Policy-Report-Only': [
            `default-src 'self'`,
            `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com`,
            `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
            `font-src 'self' https://fonts.gstatic.com`,
            `img-src 'self' data: blob: https://gvsdevsvzgcivpphcuai.supabase.co https://www.google-analytics.com https://www.googletagmanager.com`,
            `connect-src 'self' https://gvsdevsvzgcivpphcuai.supabase.co https://www.google-analytics.com https://www.googletagmanager.com`,
            `frame-ancestors 'self'`,
          ].join('; '),
        },
      },
      // ... (keep existing rules)
      '/': { swr: 600 },
      /*
       * Кеш страниц категорий. Включён после того, как бренд-лендинги
       * переехали с `?brand=` на путь `/catalog/<категория>/brand/<бренд>`.
       *
       * Даёт первый байт 0.49 с вместо 2.7-3.8 и LCP 2492 мс вместо 4976 —
       * то есть под порог Google в 2500.
       *
       * Почему это стало возможно только сейчас. Vercel-пресет генерирует
       * маршрут
       *
       *   src:  (?<__isr_route>/catalog/(?:.*))
       *   dest: /catalog/[...]-isr?__isr_route=$__isr_route
       *
       * и query-строка из `dest` заменяет исходную — функция не получала
       * `brand=`. Правило дважды включалось и дважды снималось именно из-за
       * этого: бренд-лендинг отдавал всю категорию, 12 карточек вместо одной,
       * с категорийным H1. Теперь бренд лежит в пути, подменять нечего.
       *
       * `isr`, а не `swr`, намеренно. В сборке видна разница: `swr: N` даёт
       * пресету `{"expiration": false}` — кеш живёт до следующей выкатки и сам
       * не обновляется, так сейчас устроены `/` и карточки товара. `isr: N`
       * даёт `{"expiration": 1800}`: страница сама переспрашивает данные раз
       * в полчаса. Для списка товаров это важнее — туда приходят новинки и
       * уходит распроданное.
       *
       * ЧТО ЭТО ПРАВИЛО ЛОМАЕТ, И ПОЧЕМУ ЭТО ОСТАВЛЕНО. Переезд бренда на
       * путь снял только половину проблемы: в query остались СОРТИРОВКА и
       * ФИЛЬТРЫ, и до функции они не доезжают ровно так же. Замер 18 августа
       * на превью: `/catalog/boys`, `?sort_by=price_asc` и
       * `?sort_by=price_desc` отдают побайтово один и тот же порядок товаров.
       * Та же сборка локально, без ISR, сортирует правильно: `price_asc`
       * начинается с вертолёта за минимум, `price_desc` — с трека Hot Wheels.
       * Клиент не спасает: он честно слал первый запрос с
       * `p_sort_by=price_desc`, но сетка оставалась серверной.
       *
       * `allowQuery` ПРОБОВАЛСЯ И НЕ ПОМОГ — проверять третий раз незачем.
       * Список `['sort_by', 'brands', …]` доезжает до сборки (видно в
       * `.vercel/output/functions/catalog/[...]-isr.prerender-config.json`),
       * но выдача не меняется: `dest` ISR-маршрута дописывает
       * `?__isr_route=$__isr_route` и затирает исходную query РАНЬШЕ, чем
       * список успевает на что-то повлиять. Проверено и по алиасу, и по
       * прямому адресу деплоя, чтобы исключить неподнятый алиас.
       *
       * Значит выбор такой: либо ISR и неотсортированная выдача по прямой
       * ссылке с фильтром, либо фильтры и первый байт 2.7-3.8 с.
       *
       * РЕШЕНИЕ ВЛАДЕЛЬЦА ОТ 19 АВГУСТА 2026: оставляем ISR, дефект внесён в
       * технический долг (см. `docs/HANDOFF.md`, раздел «Технический долг»).
       * Это не забытая недоделка — не «чинить» её мимоходом и не предлагать
       * в отчётах как открытый пункт.
       *
       * Почему приемлемо: внутри сайта фильтры работают (переход клиентский,
       * сервера не касается), а сами фильтрованные адреса закрыты `noindex`.
       * Ломается только прямой заход по присланной ссылке с параметром.
       *
       * ЧЕМ ПРОВЕРЯТЬ при следующем касании, если снова тронут адреса
       * лендингов: открыть путь из sitemap и сравнить число карточек с числом
       * товаров бренда в базе, плюс canonical. Заголовок бренд показывает
       * правильно даже когда выдача нефильтрованная — глазами не видно, на
       * этом уже ошибались.
       */
      '/catalog/**': { isr: 1800 },
      '/catalog': { swr: 1800 },
      '/catalog/products/**': {
        swr: 3600,
        headers: {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      },
      // Корзина и оформление рисуются только на клиенте.
      //
      // Их состояние живёт в localStorage (cartStore персистится под ключом
      // uhti-cart-v1), а на сервере localStorage нет. Из-за этого SSR отдавал
      // ветку «Корзина пуста», клиент гидратировал ветку с товарами, и патч
      // оставлял DOM в перепутанном виде: колонка с товарами оказывалась
      // вложенной внутрь блока пустой корзины. Наружу это вылезало
      // горизонтальной прокруткой на 920px при ширине 390px и ошибкой
      // «Hydration completed but contains mismatches» в консоли.
      //
      // Кешировать эти страницы всё равно нельзя — они у каждого свои.
      '/cart': { ssr: false },
      '/checkout': { ssr: false },
      //
      // Личный кабинет — та же болезнь, что у корзины, и тем же лекарством.
      //
      // `layouts/Profile.vue` выбирает ветку по `isLoggedIn`, а на сервере
      // сессии нет: SSR отдавал «Проверка авторизации…», клиент гидратировал
      // ветку с контентом, и патч оставлял разметку вложенной внутрь
      // центрирующего `flex items-center justify-center` из ветки-загрузчика.
      // Наружу это вылезало так: при заходе по прямой ссылке (закладка,
      // перезагрузка, ссылка из письма) вся секция профиля уезжала вправо за
      // край экрана — `main` оказывался на x=1238 при ширине окна 1280, а
      // scrollWidth раздувался до 1705. При переходе роутером внутри сайта
      // страница рисовалась нормально, поэтому баг долго не попадался.
      //
      // Индексации не теряем: профиль и так закрыт `noindex` в layouts/Profile.vue
      // и исключён из карты сайта.
      '/profile/**': { ssr: false },
    },
    // В dev файловый драйвер кэша хранит SWR-payload по пути маршрута,
    // из-за чего «/catalog» (файл) конфликтует с «/catalog/products/**» (нужна директория)
    // и вложенные страницы падают с ENOTDIR. На проде драйвер другой, поэтому только для dev.
    devStorage: {
      cache: { driver: 'memory' },
    },
    // Локально `pnpm build` падал с ELOOP: трассируя внешние зависимости, Nitro
    // раскладывает их в .output/server/node_modules/.nitro/ по образцу pnpm,
    // а пары вроде vue ↔ @vue/server-renderer дают взаимные симлинки —
    // рекурсивный обход упирается в лимит вложенности ядра.
    // На Vercel сборка проходит штатно, поэтому там оставляем поведение
    // по умолчанию и трогаем только локальные сборки.
    ...(process.env.VERCEL
      ? {}
      : { externals: { trace: false } }),
    compressPublicAssets: {
      gzip: true,
      brotli: true,
    },
    minify: true,
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
  },

  image: {
    domains: ['gvsdevsvzgcivpphcuai.supabase.co'],
    format: ['webp', 'jpg', 'png'],
    quality: 80,
    screens: {
      xs: 320,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      xxl: 1536,
    },
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'ru-KZ',
      },
      link: [
        {
          rel: 'preconnect',
          href: 'https://gvsdevsvzgcivpphcuai.supabase.co',
          crossorigin: 'anonymous',
        },
        {
          rel: 'dns-prefetch',
          href: 'https://gvsdevsvzgcivpphcuai.supabase.co',
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.googleapis.com',
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: 'anonymous',
        },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        // ...
      ],
      // ...
    },
  },

  supabase: {
    redirect: false,
    types: 'types/supabase.ts',
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    cookieOptions: {
      // ✅ Для Safari/iOS: используем lax вместо strict
      sameSite: 'lax',
      // ✅ Увеличиваем время жизни сессии
      maxAge: 60 * 60 * 24 * 365, // 1 год
    },
    clientOptions: {
      auth: {
        // ✅ Используем localStorage вместо cookie storage для лучшей совместимости
        storageKey: 'supabase-auth-token',
        // ✅ Включаем автоматическое обновление токена
        autoRefreshToken: true,
        // ✅ Определяем сессию при загрузке
        detectSessionInUrl: true,
        // ✅ Использовать PKCE flow (более безопасен и работает лучше в Safari)
        flowType: 'pkce',
      },
    },
  },

  css: ['~/assets/css/tailwind.css'],

  vite: {
    plugins: [tailwindcss()],
    server: {
      hmr: {
        protocol: 'ws',
        host: 'localhost',
      },
    },
    css: {
      lightningcss: {
        /*
         * Без targets Lightning CSS не знает, каким браузерам нужны префиксы,
         * и оставляет ровно одно объявление из пары. Со стеклянными панелями
         * это било насмерть: `backdrop-filter` + `-webkit-backdrop-filter`
         * схлопывались в одно, и результат зависел от порядка в исходнике.
         *
         * Формат targets — упакованная версия: (major << 16) | (minor << 8).
         * Safari 15.4 — там `backdrop-filter` только под префиксом, и это
         * заметная доля iPhone; Chrome/Firefox/Edge — стандартное свойство.
         * Проверено на реальном выводе: с этими targets Lightning CSS
         * печатает ОБА объявления, без них — только стандартное.
         */
        targets: {
          safari: (15 << 16) | (4 << 8),
          ios_saf: (15 << 16) | (4 << 8),
          chrome: 100 << 16,
          firefox: 100 << 16,
          edge: 100 << 16,
        },
      },
    },
    build: {
      cssMinify: 'lightningcss',
      // Оптимизируем загрузку JS через агрессивное разбиение и preload
      modulePreload: {
        polyfill: false,
      },
      rollupOptions: {
        output: {
          // Упрощенное разбиение для предотвращения ReferenceError при инициализации
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Группируем только реально тяжелые и независимые библиотеки
              if (id.includes('gsap'))
                return 'vendor-gsap'
              if (id.includes('lottie') || id.includes('dotlottie'))
                return 'vendor-lottie'
              if (id.includes('embla-carousel'))
                return 'vendor-carousel'
              // vue-draggable-next используется только в админке
              // (components/admin/products/ProductForm.vue) — на публичных
              // страницах (в т.ч. на LCP-критичной главной) не нужен.
              if (id.includes('vue-draggable-next') || id.includes('sortablejs'))
                return 'vendor-admin-dnd'

              // Ниже — только ЛИСТОВЫЕ библиотеки: их никто не импортирует на
              // старте приложения, и от порядка инициализации ядра они не
              // зависят. Именно поэтому их можно безопасно вынести, в отличие
              // от vue / vue-router / pinia / supabase / reka-ui, попытка
              // раздробить которые и приводила к ReferenceError (см. ниже).
              // Каждая нужна одному-двум маршрутам, а лежала в общем чанке и
              // ехала на все страницы, включая главную.

              // Сжатие картинок при загрузке — только админка (utils/imageOptimizer.ts)
              if (id.includes('browser-image-compression'))
                return 'vendor-admin-image'
              // Работа с таблицами — только админка (components/ui/table)
              if (id.includes('@tanstack/vue-table'))
                return 'vendor-admin-table'
              // lodash-es — только admin/products/ProductForm.vue
              if (id.includes('lodash'))
                return 'vendor-admin-lodash'
              // Транслитерация slug — только админка (utils/slugify.ts)
              if (id.includes('transliteration') || id.includes('slugify'))
                return 'vendor-admin-slug'
              // Конфетти — одна страница: pages/order/success/[id].vue
              if (id.includes('canvas-confetti'))
                return 'vendor-confetti'
              // Маски телефонов — формы чекаута и профиля, не каталог
              if (id.includes('maska'))
                return 'vendor-forms'
              // Санитайзер HTML — composables/useSafeHtml.ts
              if (id.includes('dompurify'))
                return 'vendor-sanitize'

              /*
               * vaul-vue отдаём на откуп Rollup — возврат undefined значит
               * «решай сам». Библиотека нужна только выдвижным панелям
               * (модалки входа и телеграма), а лежала в общем vendor, который
               * грузится на каждой странице до гидратации.
               *
               * Замерено на сборке: жадный чанк 895 → 847 КБ. Из них 23.5 КБ
               * дал именно этот возврат, остальное — префикс Lazy у модалок
               * в app.vue. Одно без другого не работает: пока библиотека
               * приколочена к vendor, ленивость компонента ничего не меняет.
               *
               * Почему это не повторяет прежнюю поломку с ReferenceError.
               * Та возникала при дроблении ЯДРА — vue, vue-router, pinia,
               * supabase: между их чанками появлялись взаимные ссылки, и
               * порядок инициализации ломался. vaul-vue импортирует только
               * «вниз» (vue, reka-ui, @vueuse остаются в vendor), и никто из
               * vendor не импортирует его обратно — цикла не возникает.
               *
               * reka-ui отпущен туда же, и это САМАЯ КРУПНАЯ правка: жадный
               * чанк 844 → 712 КБ, все 157 модулей библиотеки (309.5 КБ до
               * минификации) ушли в ленивые чанки.
               *
               * Работает только В ПАРЕ с правкой `components/global/LoadingBar.vue`.
               * Пока полоска загрузки импортировала бочку `reka-ui` через
               * `components/ui/progress`, отпускание здесь не давало ничего:
               * граф импортов показывал ровно одного жадного импортёра бочки
               * из 81, и он затаскивал в жадный чанк ВСЮ библиотеку — включая
               * Select, Slider, Listbox и Menu, нужные только админке и
               * фильтрам. Убрали тот импорт — жадных импортёров стало ноль,
               * и только тогда эта строка сработала.
               *
               * Граф снимался плагином Rollup на `generateBundle`:
               * `entry.modules` даёт реальный состав чанка, а
               * `this.getModuleInfo(id).importers` — статических импортёров.
               * Тот же приём пригодится, если понадобится найти следующего.
               *
               * ЧТО ПРОБОВАЛОСЬ И НЕ ДАЛО НИЧЕГО, чтобы не повторяли:
               *  • отпустить `vue-sonner` и сделать Toaster асинхронным —
               *    ноль: `toast` импортируют ещё 75 файлов, и библиотека
               *    остаётся жадной независимо от Toaster;
               *  • искать причину в глобальной регистрации из
               *    `components/global/` (после чистки мёртвых компонентов
               *    чанк сдвинулся всего на 3 КБ) и в регистрации компонентов
               *    shadcn как глобальных — признака `global` в модуле
               *    `shadcn-nuxt` нет вовсе.
               */
              if (id.includes('vaul-vue') || id.includes('reka-ui'))
                return undefined

              // Остальное оставляем в общем вендоре или основном чанке
              // чтобы избежать проблем с порядком инициализации core-библиотек
              return 'vendor'
            }
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    // Оптимизируем зависимости
    optimizeDeps: {
      include: [
        'gsap',
        // Именно прямые зависимости: сам `embla-carousel` лежит в дереве pnpm
        // транзитивно и из корня проекта не резолвится, из-за чего Vite ругался
        // на нерезолвимую запись. Ядро всё равно попадёт в пребандл через них.
        'embla-carousel-vue',
        'embla-carousel-autoplay',
        '@tanstack/vue-query',
        'lucide-vue-next',
      ],
    },
  },

  debug: false,

  shadcn: {
    prefix: '',
    componentDir: './components/ui',
  },

  build: {
    // vue-sonner v2+ поддерживает ESM нативно, transpile не нужен
    transpile: [],
  },

  devtools: { enabled: process.env.NODE_ENV === 'development' },
})
