<script setup lang="ts">
/*
 * Полоска нарисована своей разметкой, а НЕ обёрткой `components/ui/progress`.
 *
 * Причина не в красоте, а в весе. Этот компонент лежит в `components/global/`
 * и рисуется прямо в `app.vue`, то есть он жадный на каждой странице. Через
 * `@/components/ui/progress` он импортировал бочку `reka-ui` — а она статически
 * реэкспортирует ВСЮ библиотеку. Граф импортов, снятый плагином Rollup на
 * `generateBundle`, показал: из 81 импортёра бочки в жадном чанке был ровно
 * один — вот этот путь. И он затаскивал туда 157 модулей reka-ui на 309.5 КБ
 * (134.2 КБ после минификации), включая Select, Slider, Listbox и Menu, нужные
 * только админке и фильтрам.
 *
 * Разметка ниже повторяет то, что рисовал `Progress`: внешний контейнер с
 * `overflow-hidden` и индикатор, сдвигаемый `translateX`. Роль
 * `progressbar` и aria-атрибуты сохранены — их ставил `ProgressRoot`.
 *
 * Сама обёртка `components/ui/progress` жива и используется в
 * `components/common/AppLoader.vue` — там она в ленивом чанке и никому не
 * мешает. Трогать её не нужно.
 */

interface Props {
  loading: boolean
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'pink' | 'gradient'
  showGlow?: boolean
  showShimmer?: boolean
  height?: 'thin' | 'medium' | 'thick'
}

const props = withDefaults(defineProps<Props>(), {
  color: 'blue',
  showGlow: true,
  showShimmer: true,
  height: 'medium',
})

const progress = ref(0)
const isActive = ref(false)
let progressInterval: ReturnType<typeof setInterval> | null = null

// Расширенные цветовые конфигурации с градиентами
const colorConfig = {
  blue: {
    indicator: 'bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600',
    glow: 'shadow-[0_0_20px_rgba(59,130,246,0.6),0_0_40px_rgba(59,130,246,0.3)]',
    shimmer: 'from-transparent via-white/40 to-transparent',
    trail: 'bg-blue-500/10',
  },
  green: {
    indicator: 'bg-gradient-to-r from-emerald-400 via-green-500 to-emerald-600',
    glow: 'shadow-[0_0_20px_rgba(34,197,94,0.6),0_0_40px_rgba(34,197,94,0.3)]',
    shimmer: 'from-transparent via-white/40 to-transparent',
    trail: 'bg-green-500/10',
  },
  purple: {
    indicator: 'bg-gradient-to-r from-purple-400 via-purple-500 to-purple-600',
    glow: 'shadow-[0_0_20px_rgba(168,85,247,0.6),0_0_40px_rgba(168,85,247,0.3)]',
    shimmer: 'from-transparent via-white/40 to-transparent',
    trail: 'bg-purple-500/10',
  },
  orange: {
    indicator: 'bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600',
    glow: 'shadow-[0_0_20px_rgba(249,115,22,0.6),0_0_40px_rgba(249,115,22,0.3)]',
    shimmer: 'from-transparent via-white/40 to-transparent',
    trail: 'bg-orange-500/10',
  },
  red: {
    indicator: 'bg-gradient-to-r from-red-400 via-red-500 to-red-600',
    glow: 'shadow-[0_0_20px_rgba(239,68,68,0.6),0_0_40px_rgba(239,68,68,0.3)]',
    shimmer: 'from-transparent via-white/40 to-transparent',
    trail: 'bg-red-500/10',
  },
  pink: {
    indicator: 'bg-gradient-to-r from-pink-400 via-pink-500 to-pink-600',
    glow: 'shadow-[0_0_20px_rgba(236,72,153,0.6),0_0_40px_rgba(236,72,153,0.3)]',
    shimmer: 'from-transparent via-white/40 to-transparent',
    trail: 'bg-pink-500/10',
  },
  gradient: {
    indicator: 'bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500',
    glow: 'shadow-[0_0_20px_rgba(168,85,247,0.6),0_0_40px_rgba(236,72,153,0.3)]',
    shimmer: 'from-transparent via-white/50 to-transparent',
    trail: 'bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-blue-500/10',
  },
}

const heightConfig = {
  thin: 'h-0.5',
  medium: 'h-1',
  thick: 'h-1.5',
}

const currentColorConfig = computed(() => colorConfig[props.color])

const indicatorClass = computed(() => {
  const classes = [
    currentColorConfig.value.indicator,
    'transition-all duration-500 ease-out',
    'relative overflow-hidden',
    'rounded-r-full', // Скругленный правый край
  ]

  if (props.showGlow) {
    classes.push(currentColorConfig.value.glow)
  }

  return classes.join(' ')
})

watch(() => props.loading, (loading) => {
  if (loading) {
    startProgress()
  }
  else {
    completeProgress()
  }
})

function startProgress() {
  isActive.value = true
  progress.value = 0

  // Очень быстрый старт с анимацией
  requestAnimationFrame(() => {
    progress.value = 40
  })

  if (progressInterval) {
    clearInterval(progressInterval)
  }

  // Более плавное ускорение
  progressInterval = setInterval(() => {
    if (progress.value < 92) {
      const increment = (92 - progress.value) * 0.08
      progress.value += Math.max(increment, 0.3)
    }
  }, 250)
}

function completeProgress() {
  if (progressInterval) {
    clearInterval(progressInterval)
    progressInterval = null
  }

  progress.value = 100

  // Плавное исчезновение
  setTimeout(() => {
    isActive.value = false
    setTimeout(() => {
      progress.value = 0
    }, 400)
  }, 300)
}

onUnmounted(() => {
  if (progressInterval) {
    clearInterval(progressInterval)
  }
})
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300"
    leave-active-class="transition-all duration-500"
    enter-from-class="opacity-0 -translate-y-full"
    leave-to-class="opacity-0 -translate-y-full"
  >
    <div
      v-if="isActive"
      class="fixed top-0 left-0 right-0 z-[9999] overflow-hidden"
    >
      <!-- Светящийся след за прогресс-баром -->
      <div
        v-if="showGlow"
        class="absolute inset-0 blur-xl opacity-50"
        :class="currentColorConfig.trail"
        :style="`width: ${progress}%; transition: width 0.5s ease-out;`"
      />

      <div
        role="progressbar"
        aria-label="Загрузка страницы"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(progress)"
        class="relative w-full overflow-hidden rounded-none border-none bg-transparent"
        :class="heightConfig[props.height]"
      >
        <div
          class="h-full w-full"
          :class="indicatorClass"
          :style="`transform: translateX(-${100 - progress}%);`"
        >
          <!-- Основной shimmer эффект -->
          <div
            v-if="showShimmer"
            class="absolute inset-0 bg-gradient-to-r animate-shimmer-smooth"
            :class="currentColorConfig.shimmer"
          />

          <!-- Дополнительные искорки -->
          <div
            v-if="showShimmer"
            class="absolute inset-0 bg-gradient-to-r animate-sparkle"
            :class="currentColorConfig.shimmer"
          />

          <!-- Пульсирующее свечение на конце -->
          <div
            v-if="showGlow && progress < 100"
            class="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white/60 to-transparent animate-pulse-glow"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  @keyframes shimmer-smooth {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(200%);
    }
  }

  @keyframes sparkle {
    0%,
    100% {
      opacity: 0;
      transform: translateX(-100%) scale(0.5);
    }
    50% {
      opacity: 1;
      transform: translateX(100%) scale(1.5);
    }
  }

  @keyframes pulse-glow {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 0.8;
    }
  }

  .animate-shimmer-smooth {
    animation: shimmer-smooth 1.8s ease-in-out infinite;
  }

  .animate-sparkle {
    animation: sparkle 2.5s ease-in-out infinite;
    animation-delay: 0.3s;
  }

  .animate-pulse-glow {
    animation: pulse-glow 1.2s ease-in-out infinite;
  }
}
</style>
