import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

/**
 * 🎨 Варианты контейнеров для каруселей и секций
 *
 * Боковой отступ во всех вариантах берётся из --page-gutter
 * (объявлена в assets/css/tailwind.css) — это единственный источник правды
 * по ширине контента. Никаких «своих» px-* здесь быть не должно, иначе
 * секции разъезжаются относительно рельсов, которые бликуют за край
 * через margin-inline: calc(-1 * var(--page-gutter)).
 *
 * contained: 'desktop' - На mobile full width (без padding), на desktop контейнер (для каруселей)
 * contained: 'always'  - Всегда ограниченный контейнер с padding (для заголовков, контента)
 * contained: false     - Всегда full width с padding (для обычных секций)
 */
export const carouselContainerVariants = cva(
  // Базовые классы (всегда применяются)
  'w-full',
  {
    variants: {
      // Размеры контейнера
      contained: {
        // На mobile: full width БЕЗ padding, на desktop: ограниченный контейнер.
        // Для лент каруселей до lg окно прокрутки обязано быть full-bleed,
        // поэтому левый отступ живёт не здесь, а на самой флекс-ленте
        // (см. components/global/ProductCarousel.vue): в покое первая карточка
        // стоит по gutter'у, при листании карточки едут от края до края.
        desktop: 'lg:container lg:max-w-screen-2xl lg:mx-auto lg:px-[var(--page-gutter)]',

        // Всегда ограниченный контейнер с padding на всех экранах
        // Используется для заголовков, текста, обычного контента
        always: 'container max-w-screen-2xl mx-auto px-[var(--page-gutter)]',

        // Всегда full width с padding на всех экранах
        // Используется для секций, которые должны занимать всю ширину
        false: 'px-[var(--page-gutter)]',
      },
    },
    defaultVariants: {
      contained: 'desktop',
    },
  },
)

// TypeScript тип для пропсов
export type CarouselContainerVariants = VariantProps<typeof carouselContainerVariants>

/**
 * 📏 Вертикальные отступы секций (домашняя страница и т.п.)
 *
 * Единая шкала py-*, чтобы отступы обёртки в pages/index.vue и корневого
 * <section> внутри соответствующего компонента всегда совпадали (иначе при
 * переходе skeleton → контент высота блока «прыгает»).
 */
export const sectionSpacingVariants = cva('', {
  variants: {
    // Вертикальный ритм секции
    size: {
      xs: 'py-4', // стандартные секции (карусели, сетки категорий/брендов)
      sm: 'py-8', // карточная карусель ProductCarousel (без десктоп-эскалации)
      md: 'py-8 md:py-12', // акцентные секции (Акции и бонусы)
      lg: 'py-12 md:py-16', // финальный SEO-блок
    },
  },
  defaultVariants: {
    size: 'xs',
  },
})

export type SectionSpacingVariants = VariantProps<typeof sectionSpacingVariants>
