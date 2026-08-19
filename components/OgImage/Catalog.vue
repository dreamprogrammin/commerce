<script setup lang="ts">
/**
 * Картинка для шаринга страниц каталога.
 *
 * Стили здесь ИНЛАЙНОВЫЕ, а не классами Tailwind, и это не вкусовщина.
 * Картинку рисует satori, и утилиты Tailwind этого проекта (v4) его
 * препроцессор не разбирает: в SVG уходили `width="NaN"`, `stdDeviation="NaN"`
 * и прочее, после чего растеризатор resvg падал с паникой
 * («called Option::unwrap() on a None value»), а /__og-image__/…/og.png
 * отдавал 500 на всех страницах категорий — и на проде тоже.
 *
 * Проверено подстановкой: тот же макет на инлайновых стилях даёт ноль NaN
 * и PNG 200. Правила, выведенные из этих проверок:
 *   • только inline-стили, никаких классов;
 *   • у каждого контейнера с несколькими детьми явный display: flex —
 *     satori других раскладок не знает и падает с ошибкой про display;
 *   • никаких blur / backdrop-filter / drop-shadow: satori считает размытие
 *     в NaN, и на этом падает уже растеризатор;
 *   • никаких эмодзи: satori подставляет их картинкой с width="NaN" —
 *     ровно тот же обрыв;
 *   • размеры в пикселях, без процентов и grid.
 *
 * Макет намеренно одноколоночный. Горизонтальные ряды у satori разъезжаются:
 * даже при явном flex-direction: row (проверено — в HTML он доходит) элементы
 * всё равно встают друг под другом. Спорить с этим ради OG-картинки незачем,
 * поэтому здесь только вертикальный поток.
 *
 * Фоновая картинка категории убрана: она шла под градиентом на opacity-20,
 * то есть почти не читалась, а тянула удалённый файл на каждый рендер.
 */
withDefaults(defineProps<{
  title: string
  description?: string
  productsCount?: number
  /** Надстрочная подпись. По умолчанию — для страниц категорий. */
  kicker?: string
}>(), { kicker: 'КАТАЛОГ' })

const WHITE_SOFT = 'rgba(255,255,255,0.86)'
</script>

<template>
  <div
    :style="{
      width: '1200px',
      height: '630px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '80px',
      background: 'linear-gradient(135deg, #3b82f6 0%, #4f46e5 55%, #7c3aed 100%)',
    }"
  >
    <div
      :style="{
        display: 'flex',
        color: WHITE_SOFT,
        fontSize: '26px',
        fontWeight: 600,
        letterSpacing: '2px',
      }"
    >
      УХТЫШКА · {{ kicker }}
    </div>

    <div
      :style="{
        display: 'flex',
        color: '#fff',
        fontSize: '78px',
        fontWeight: 900,
        lineHeight: 1.05,
        marginTop: '28px',
      }"
    >
      {{ title }}
    </div>

    <div
      v-if="description"
      :style="{
        display: 'flex',
        color: WHITE_SOFT,
        fontSize: '30px',
        lineHeight: 1.3,
        marginTop: '24px',
      }"
    >
      {{ description }}
    </div>

    <div
      :style="{
        display: 'flex',
        color: WHITE_SOFT,
        fontSize: '26px',
        marginTop: '44px',
      }"
    >
      {{ productsCount ? `${productsCount}+ товаров · ` : '' }}Доставка по Алматы за 1 день
    </div>
  </div>
</template>
