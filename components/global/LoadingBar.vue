<script setup lang="ts">
import { Progress } from '@/components/ui/progress'

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

      <Progress
        :model-value="progress"
        class="rounded-none border-none bg-transparent"
        :class="heightConfig[props.height]"
        :indicator-class="indicatorClass"
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
      </Progress>
    </div>
  </Transition>
</template>

<style scoped>
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
</style>
