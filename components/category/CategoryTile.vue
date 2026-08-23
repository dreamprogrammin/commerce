<script setup lang="ts">
/**
 * Плитка категории. Порт `CategoryTile.dc.html` (Claude Design, проект
 * «Прототип для покупателей»). Прототип обобщает две разошедшиеся реализации,
 * которые до него жили каждая своей вёрсткой: плитки «Популярных категорий»
 * на главной и плитки мобильного каталога.
 *
 * Раскладки:
 *   • stack  — картинка по центру плитки, подпись под ней (`below`),
 *              внутри неё стеклянной плашкой (`inside`) или без подписи;
 *   • corner — заголовок в левом верхнем углу, картинка в правом нижнем.
 *              Размер `md` (радиус 18) или `lg` (радиус 22).
 *
 * Отличия от прототипа и почему:
 *  • Картинка — честный <img> с srcset и lazy, а не background-image:
 *    файлы лежат в Supabase Storage вариантами sm/md, а background-image
 *    выбирать между ними не умеет.
 *  • `sourceMedia` — добавка сверх прототипа. С ней картинка уезжает в
 *    <source media>, а в <img src> остаётся прозрачный пиксель. Нужна там,
 *    где блок скрыт через display:none на другой ширине: display:none
 *    загрузку НЕ отменяет, и без этого десктоп качал бы всю мобильную
 *    вёрстку вхолостую.
 *  • `blend` — mix-blend-mode: multiply. Картинки категорий в боевой базе —
 *    PNG с белым ореолом по краю, multiply сажает их на подложку без видимой
 *    рамки. В прототипе картинки чистые, и режима наложения там нет.
 *    С `blend` несовместим `imgShadow`: тень тоже попадает под умножение и
 *    расплывается грязным пятном. На таких плитках ставим `imgShadow` = 0.
 *  • Подпись ПОД плиткой — `var(--foreground)`, а не литерал #334155 из
 *    прототипа: она лежит на фоне страницы, который в тёмной теме
 *    переворачивается, а тинты плиток — нет. Заголовок ВНУТРИ плитки,
 *    наоборот, оставлен литералом #0f172a — он на непереворачивающемся тинте,
 *    и `var(--foreground)` там стал бы белым по пастели.
 *  • Цвет строки `meta` — `var(--brand-on-tint)`, то есть blue-800, тогда как
 *    прототип ставит blue-700. Строка лежит на пастельном тинте плитки, и
 *    замер канвасом по всем шести тинтам дал у blue-700 4.13–4.67 при пороге
 *    WCAG AA 4.5 (13.5px/600 — обычный текст). Blue-800 даёт худшие 5.33.
 *    Рассуждения тут не годятся: `--primary` «на глаз» выглядел уместным, а
 *    по замеру давал 3.35. Токен и его обоснование — в assets/css/tailwind.css.
 *  • `interaction` — реакция на курсор и тап. В прототипе она одна
 *    (`brightness(.96)`), в приложении их исторически две: подъём плитки на
 *    главной и нажатие с масштабом в мобильном каталоге.
 */

const props = withDefaults(defineProps<{
  /** Название категории: подпись, заголовок и alt картинки. */
  name: string
  href: string

  /** Готовый URL картинки (getVariantUrl), а не путь как в прототипе. */
  src?: string | null
  srcset?: string | null
  sizes?: string
  /** Медиавыражение для <source>. См. `sourceMedia` в шапке файла. */
  sourceMedia?: string
  loading?: 'lazy' | 'eager'
  /** Полноразмерное фото на всю плитку вместо вписанной картинки. */
  photo?: string | null
  /** Иконка, когда картинки у категории нет. */
  fallbackIcon?: string

  layout?: 'stack' | 'corner'
  size?: 'md' | 'lg'
  /** Пропорции плитки в раскладке stack. */
  aspect?: string | number
  /** Минимальная высота плитки в раскладке corner. */
  minHeight?: number
  tint?: string
  radius?: number
  /** Доля плитки под картинку в раскладке stack, %. */
  imgScale?: number
  /** Сила тени под картинкой, 0–60. 0 — без тени. */
  imgShadow?: number
  /** false — «стеклянная» подложка: градиент, кромка и внутренние тени. */
  flat?: boolean
  blend?: boolean
  /** Белая скруглённая подложка под картинкой (раскладка corner). */
  plate?: boolean

  labelPlacement?: 'below' | 'inside' | 'none'
  labelSize?: number
  labelWeight?: number

  /** Счётчик-пилюля в правом верхнем углу. */
  count?: number | string | null
  /** Строка со стрелкой под заголовком, только в раскладке corner. */
  meta?: string | null
  badge?: string | null
  badgeIcon?: string

  interaction?: 'dim' | 'lift' | 'press'
}>(), {
  loading: 'lazy',
  fallbackIcon: 'lucide:package',
  layout: 'stack',
  size: 'md',
  aspect: '1',
  tint: '#9fd3ea',
  imgScale: 72,
  imgShadow: 30,
  flat: true,
  blend: false,
  plate: false,
  labelPlacement: 'below',
  labelSize: 13,
  labelWeight: 400,
  badgeIcon: 'lucide:sparkles',
  interaction: 'dim',
})

/** Прозрачный 1×1 GIF — заглушка в <img src> при заданном `sourceMedia`. */
const BLANK_PIXEL
  = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const isCorner = computed(() => props.layout === 'corner')
const isLg = computed(() => props.size === 'lg')
const isPhoto = computed(() => Boolean(props.photo))

/** В раскладке corner подпись занята заголовком в углу — своей у плитки нет. */
const placement = computed(() => (isCorner.value ? 'none' : props.labelPlacement))
const showBelow = computed(() => placement.value === 'below')
const showInside = computed(() => placement.value === 'inside')

/** Стекло — только у неплоской плитки без фото: под фото его не видно. */
const isGlass = computed(() => !props.flat && !isPhoto.value)

const radius = computed(() =>
  props.radius ?? (isCorner.value ? (isLg.value ? 22 : 18) : 12),
)

/** Пилюля со счётчиком мешает и заголовку в углу, и плашке внутри. */
const showCount = computed(() =>
  props.count !== null && props.count !== undefined && props.count !== ''
  && !showInside.value && !isCorner.value,
)

/**
 * Две тени под картинкой: короткая контактная и длинная рассеянная.
 * Коэффициенты и потолки прозрачности — из прототипа.
 */
const imgFilter = computed(() => {
  const s = props.imgShadow
  if (!s || s <= 0 || isPhoto.value)
    return 'none'
  const near = `drop-shadow(0 ${Math.round(s * 0.22)}px ${Math.round(s * 0.2)}px rgb(15 23 42 / ${Math.min(0.55, s / 55).toFixed(2)}))`
  const far = `drop-shadow(0 ${Math.round(s * 0.38)}px ${Math.round(s * 0.36)}px rgb(15 23 42 / ${Math.min(0.32, s / 110).toFixed(2)}))`
  return `${near} ${far}`
})

const rootStyle = computed(() => ({
  '--ct-tint': props.tint,
  '--ct-radius': `${radius.value}px`,
  '--ct-aspect': String(props.aspect),
  '--ct-min-h': `${props.minHeight ?? (isLg.value ? 180 : 150)}px`,
  '--ct-img-scale': `${props.imgScale}%`,
  '--ct-img-filter': imgFilter.value,
  '--ct-label-size': `${props.labelSize}px`,
  '--ct-label-weight': String(props.labelWeight),
  // Резерв под две строки подписи, чтобы соседние плитки в сетке не прыгали.
  // Крупная подпись переносится реже — ей резерв не нужен.
  '--ct-label-min-h': props.labelSize > 15 ? '0px' : '34px',
}))

const imageUrl = computed(() => props.photo || props.src || null)

/**
 * Название уже озвучено видимым текстом (подпись, заголовок в углу или
 * плашка внутри) — картинка при нём декоративная. Без текста она остаётся
 * единственным именем ссылки.
 */
const imageAlt = computed(() =>
  showBelow.value || showInside.value || isCorner.value ? '' : props.name,
)
</script>

<template>
  <NuxtLink
    :to="href"
    class="ct"
    :class="[
      `ct--${isCorner ? 'corner' : 'stack'}`,
      `ct--${isLg ? 'lg' : 'md'}`,
      `ct--${interaction}`,
      {
        'ct--glass': isGlass,
        'ct--photo': isPhoto,
        'ct--blend': blend,
        'ct--plate': plate,
        'ct--label-inside': showInside,
      },
    ]"
    :style="rootStyle"
  >
    <span class="ct__tile">
      <span v-if="imageUrl" class="ct__media">
        <!-- При заданном `sourceMedia` настоящий файл живёт только в
             <source>, а в <img src> лежит прозрачный пиксель: на ширине,
             где блок скрыт, медиавыражение не совпадает и браузер не
             качает ничего. См. комментарий в шапке файла. -->
        <picture v-if="sourceMedia">
          <source :media="sourceMedia" :srcset="srcset || imageUrl" :sizes="sizes">
          <img
            :src="BLANK_PIXEL"
            :alt="imageAlt"
            :loading="loading"
            decoding="async"
            class="ct__img"
          >
        </picture>
        <img
          v-else
          :src="imageUrl"
          :srcset="srcset || undefined"
          :sizes="sizes"
          :alt="imageAlt"
          :loading="loading"
          decoding="async"
          class="ct__img"
        >
      </span>
      <!-- Запасная иконка — только в раскладке stack. В corner плитка
           `display:block`, и иконка легла бы в поток поверх заголовка;
           а главное, там картинка декоративная — смысл несёт заголовок,
           и значок под ним читается как дефект вёрстки. Пустой тинт —
           ровно то, что эти плитки показывали и до переезда. -->
      <Icon
        v-else-if="!isCorner"
        :name="fallbackIcon"
        class="ct__fallback"
      />

      <!-- Затемнение снизу: под фото подпись и бейджи иначе теряются. -->
      <span v-if="isPhoto" class="ct__scrim" />

      <span v-if="isCorner" class="ct__corner">
        <span class="ct__corner-title">{{ name }}</span>
        <span v-if="meta" class="ct__meta">
          {{ meta }}
          <Icon name="lucide:arrow-right" class="ct__meta-icon" />
        </span>
      </span>

      <span v-if="showCount" class="ct__count">{{ count }}</span>

      <span v-if="badge" class="ct__badge">
        <Icon :name="badgeIcon" class="ct__badge-icon" />
        {{ badge }}
      </span>

      <span v-if="showInside" class="ct__inside-label">{{ name }}</span>
    </span>

    <span v-if="showBelow" class="ct__label">{{ name }}</span>
  </NuxtLink>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .ct {
    min-width: 0;
    color: var(--foreground);
    text-decoration: none;
    cursor: pointer;
  }

  .ct--stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ct--corner {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* --- подложка --- */

  .ct__tile {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: var(--ct-radius);
    background: var(--ct-tint);
    /* mix-blend-mode картинки обязан смешиваться с подложкой самой плитки,
       а не с тем, что под ней на странице. */
    isolation: isolate;
    transition:
      filter 0.16s ease,
      transform 0.16s ease,
      box-shadow 0.16s ease;
  }

  .ct--stack .ct__tile {
    display: grid;
    place-items: center;
    aspect-ratio: var(--ct-aspect);
  }

  .ct--corner .ct__tile {
    display: block;
    height: 100%;
    min-height: var(--ct-min-h);
  }

  .ct--glass .ct__tile {
    background: linear-gradient(165deg, color-mix(in oklch, var(--ct-tint) 84%, #fff), var(--ct-tint));
    border: 1px solid color-mix(in oklch, var(--ct-tint) 70%, #fff);
    box-shadow:
      inset 0 1.5px 0 rgb(255 255 255 / 0.55),
      inset 0 -14px 22px rgb(15 23 42 / 0.09),
      inset 0 0 20px rgb(255 255 255 / 0.16),
      0 6px 16px rgb(15 23 42 / 0.1);
  }

  /* --- картинка --- */

  /* Размер коробки задаётся шириной и aspect-ratio, а не процентной высотой:
     процентная высота внутри грид-ячейки, чья высота сама выведена из
     aspect-ratio, не резолвится, и картинка вытягивалась по своим пропорциям
     (портретные обрезались бы краем плитки). */
  .ct--stack .ct__media {
    display: block;
    width: var(--ct-img-scale);
    aspect-ratio: var(--ct-aspect);
  }

  /* Плашка с подписью занимает низ плитки — картинку приподнимаем над ней. */
  .ct--stack.ct--label-inside .ct__media {
    transform: translateY(-6px);
  }

  /* Без z-index намеренно. `position: absolute` + `z-index` создаёт
     stacking context, а элемент с `mix-blend-mode` смешивается с фоном
     ВНУТРИ своего контекста — то есть ни с чем, подложка плитки остаётся
     снаружи. Из-за этого `blend` на раскладке corner не работал вовсе:
     PNG с непрозрачным фоном ложился белым прямоугольником поверх тинта
     (видно было на «Мальчикам» на главной). В раскладке stack проблемы не
     было — там `.ct__media` обычный блок без позиционирования, поэтому
     мобильный каталог с тем же `blend` выглядел правильно.

     Порядок слоёв не страдает: `.ct__corner` идёт ниже по разметке и несёт
     свой z-index, так что заголовок по-прежнему поверх картинки. */
  .ct--corner .ct__media {
    position: absolute;
    right: 2px;
    bottom: 2px;
    display: block;
    width: 76%;
    height: 62%;
  }

  .ct--corner.ct--lg .ct__media {
    right: 0;
    bottom: 0;
    width: 82%;
  }

  .ct--photo .ct__media {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: block;
    width: 100%;
    height: 100%;
  }

  .ct__media picture {
    display: block;
    width: 100%;
    height: 100%;
  }

  .ct__img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: var(--ct-img-filter);
  }

  .ct--corner .ct__img {
    object-position: right bottom;
  }

  .ct--photo .ct__img {
    object-fit: cover;
    object-position: center;
    filter: none;
  }

  /* Картинки категорий — PNG с белым ореолом по краю; multiply сажает их
     на подложку без видимой рамки. */
  .ct--blend .ct__img {
    mix-blend-mode: multiply;
  }

  /* Своя подложка под картинкой в раскладке corner.

     Без неё выбор был из двух плохих: либо PNG с непрозрачным фоном ложится
     на тинт белым прямоугольником с острыми углами, либо `multiply` красит
     картинку в цвет плитки, и она теряет собственные цвета — синее яйцо
     сливалось с голубой плиткой.

     Белая скруглённая панель снимает и то, и другое: фон PNG совпадает с
     ней и границы не видно, а сама картинка остаётся в своих цветах.
     Прозрачным PNG панель тоже к лицу — они читаются как предмет на
     карточке, а не парят над заливкой.

     Скругление только сверху и слева: панель прижата к правому нижнему
     углу плитки и повторяет её форму. */
  .ct--corner.ct--plate .ct__media {
    background: #fff;
    border-radius: 18px 0 var(--ct-radius) 0;
    box-shadow: inset 0 0 0 1px rgb(15 23 42 / 0.04);
  }

  .ct--corner.ct--plate.ct--lg .ct__media {
    border-radius: 24px 0 var(--ct-radius) 0;
  }

  /* Под белой панелью умножать не с чем — картинка и так на белом. */
  .ct--plate .ct__img {
    mix-blend-mode: normal;
  }

  .ct__fallback {
    width: 40%;
    height: 40%;
    color: var(--muted-foreground);
    opacity: 0.45;
  }

  .ct__scrim {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(to top, rgb(15 23 42 / 0.28) 0%, rgb(15 23 42 / 0.06) 34%, rgb(15 23 42 / 0) 62%);
  }

  /* --- заголовок в углу --- */

  .ct__corner {
    position: absolute;
    z-index: 2;
    top: 14px;
    right: 10px;
    left: 12px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    /* Углы плитки кликабельны целиком — текст не должен перехватывать курсор. */
    pointer-events: none;
  }

  .ct--lg .ct__corner {
    top: 22px;
    right: 22px;
    left: 22px;
  }

  .ct__corner-title {
    display: block;
    max-width: 100%;
    padding-right: 6px;
    /* Литерал, а не var(--foreground): текст лежит на тинте, который в тёмной
       теме не переворачивается. См. шапку файла. */
    color: #0f172a;
    font-weight: 700;
    font-size: clamp(11px, 1.1vw, 14px);
    line-height: 1.2;
    text-wrap: balance;
  }

  .ct--lg .ct__corner-title {
    max-width: 72%;
    padding-right: 0;
    font-weight: 800;
    font-size: clamp(22px, 1.9vw, 30px);
    line-height: 1.08;
    letter-spacing: -0.02em;
  }

  .ct__meta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 11px;
    /* Не --primary: на пастельном тинте он даёт 3.35 при пороге 4.5.
       См. шапку файла и комментарий к токену в assets/css/tailwind.css. */
    color: var(--brand-on-tint);
    font-weight: 600;
    font-size: 13.5px;
  }

  .ct__meta-icon {
    width: 15px;
    height: 15px;
  }

  /* --- метки --- */

  .ct__count {
    position: absolute;
    top: 7px;
    right: 7px;
    z-index: 2;
    display: grid;
    place-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 7px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.82);
    color: #334155;
    font-weight: 700;
    font-size: 11.5px;
  }

  .ct__badge {
    position: absolute;
    top: 7px;
    left: 7px;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 10px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.86);
    color: var(--primary);
    font-weight: 700;
    font-size: 11.5px;
  }

  .ct__badge-icon {
    width: 13px;
    height: 13px;
  }

  .ct__inside-label {
    position: absolute;
    right: 10px;
    bottom: 10px;
    left: 10px;
    z-index: 2;
    display: -webkit-box;
    width: fit-content;
    max-width: calc(100% - 20px);
    padding: 9px 12px;
    overflow: hidden;
    border-radius: 14px;
    background: rgb(255 255 255 / 0.82);
    backdrop-filter: blur(10px) saturate(1.4);
    -webkit-backdrop-filter: blur(10px) saturate(1.4);
    box-shadow:
      inset 0 1px 0 #fff,
      0 4px 12px rgb(15 23 42 / 0.14);
    color: var(--foreground);
    font-weight: 600;
    font-size: var(--ct-label-size);
    line-height: 1.25;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .ct__label {
    display: -webkit-box;
    min-height: var(--ct-label-min-h);
    overflow: hidden;
    color: var(--foreground);
    font-weight: var(--ct-label-weight);
    font-size: var(--ct-label-size);
    line-height: 1.3;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  /* --- реакция на курсор и тап --- */

  .ct--dim:hover .ct__tile {
    filter: brightness(0.96);
  }

  /* Тени записаны литералами (значения Tailwind `shadow-md` / `shadow-lg`),
     а не через var(--shadow-md): Tailwind 4 выкидывает переменную темы, если
     для неё не сгенерирована ни одна утилита. Сейчас обе утилиты в проекте
     встречаются, но исчезнут вместе с последним местом, где их написали, —
     и плитка молча осталась бы без тени. См. assets/css/tailwind.css. */
  .ct--lift:hover .ct__tile {
    transform: translateY(-3px);
    box-shadow:
      0 4px 6px -1px rgb(0 0 0 / 0.1),
      0 2px 4px -2px rgb(0 0 0 / 0.1);
  }

  .ct--lift.ct--lg:hover .ct__tile {
    transform: translateY(-4px);
    box-shadow:
      0 10px 15px -3px rgb(0 0 0 / 0.1),
      0 4px 6px -4px rgb(0 0 0 / 0.1);
  }

  .ct--press:active .ct__tile {
    transform: scale(0.96);
  }
}
</style>
