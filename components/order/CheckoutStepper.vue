<script setup lang="ts">
defineProps<{ currentStep: number }>()

const steps = [
  { id: 1, name: 'Корзина', icon: 'lucide:shopping-cart' },
  { id: 2, name: 'Оформление', icon: 'lucide:truck' },
  { id: 3, name: 'Готово', icon: 'lucide:package-check' }
]
</script>

<template>
  <div class="flex justify-between items-center w-full max-w-2xl mx-auto py-4 px-4">
    <div v-for="(step, index) in steps" :key="step.id" class="flex flex-col items-center flex-1 relative">
      <!-- Линия соединения -->
      <div v-if="index !== 0" class="absolute top-4 -left-1/2 w-full h-[2px] -z-10" 
           :class="currentStep >= step.id ? 'bg-primary' : 'bg-muted'" />
      
      <div class="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors border-2"
           :class="currentStep >= step.id ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-muted text-muted-foreground'">
        <Icon :name="step.icon" class="w-4 h-4 md:w-5 md:h-5" />
      </div>
      <span class="text-xs mt-2 font-medium hidden sm:block" 
            :class="currentStep >= step.id ? 'text-primary' : 'text-muted-foreground'">
        {{ step.name }}
      </span>
    </div>
  </div>
</template>
