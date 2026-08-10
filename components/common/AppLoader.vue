<script setup lang="ts">
import Progress from '../ui/progress/Progress.vue'

const progress = ref(10)

onMounted(() => {
  const timer = setInterval(() => {
    progress.value += Math.floor(Math.random() * 10) + 5

    if (progress.value >= 90) {
      clearInterval(timer)
    }
  }, 400)

  onUnmounted(() => {
    clearInterval(timer)
  })
})
</script>

<template>
  <div
    class="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
  >
    <div class="flex flex-col items-center gap-6 w-full max-w-xs px-4">
      <div class="text-center">
        <h2 class="text-xl font-semibold text-foreground">
          Загружаем наш магазин
        </h2>
        <p class="text-sm text-muted-foreground">
          Пожалуйста, подождите немного
        </p>
      </div>

      <Progress v-model="progress" class="w-full h-2" />
    </div>
  </div>
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
  .v-enter-active,
  .v-leave-active {
    transition: opacity 0.3s ease;
  }

  .v-enter-from,
  .v-leave-to {
    opacity: 0;
  }
}
</style>
