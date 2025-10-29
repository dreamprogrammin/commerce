import type { VariantProps } from 'class-variance-authority'
// lib/variants.ts
import { cva } from 'class-variance-authority'

export const carouselContainerVariants = cva(
  // Базовые классы (всегда применяются)
  'w-full',
  {
    variants: {
      // Размеры контейнера
      contained: {
        true: 'lg:container lg:max-w-screen-2xl lg:mx-auto sm:px-6 md:px-8 lg:px-12',
        false: 'px-4 sm:px-6 md:px-8 lg:px-12',
      },
    },
    defaultVariants: {
      contained: true,
    },
  },
)

// TypeScript тип для пропсов
export type CarouselContainerVariants = VariantProps<typeof carouselContainerVariants>
