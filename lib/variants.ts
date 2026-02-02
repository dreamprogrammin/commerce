import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

/**
 * 🎨 Варианты контейнеров для каруселей и секций
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
        // На mobile: full width БЕЗ padding, на desktop: ограниченный контейнер
        // Используется для каруселей, чтобы карточки "выглядывали" на mobile
        desktop: 'lg:container lg:max-w-screen-2xl lg:mx-auto lg:px-12',

        // Всегда ограниченный контейнер с padding на всех экранах
        // Используется для заголовков, текста, обычного контента
        always: 'container max-w-screen-2xl mx-auto px-2 sm:px-6 md:px-8 lg:px-12',

        // Всегда full width с padding на всех экранах
        // Используется для секций, которые должны занимать всю ширину
        false: 'px-2 sm:px-6 md:px-8 lg:px-12',
      },
    },
    defaultVariants: {
      contained: 'desktop',
    },
  },
)

// TypeScript тип для пропсов
export type CarouselContainerVariants = VariantProps<typeof carouselContainerVariants>
