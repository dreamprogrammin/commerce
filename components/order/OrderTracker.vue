<script setup lang="ts">
const props = defineProps<{
  orderId: string
  initialStatus: string
}>()

const supabase = useSupabaseClient()
const orderStatus = ref(props.initialStatus)

// Маппинг статусов на шаги
const statusToStep = {
  new: 1,
  confirmed: 2,
  shipped: 3,
  delivered: 4,
}

const currentStep = computed(() => statusToStep[orderStatus.value as keyof typeof statusToStep] || 1)

const steps = [
  { id: 1, title: 'Заказ создан', description: 'Принят в обработку', icon: 'lucide:file-text' },
  { id: 2, title: 'Подтвержден', description: 'Готовим к отправке', icon: 'lucide:check-circle' },
  { id: 3, title: 'Отправлен', description: 'В пути', icon: 'lucide:truck' },
  { id: 4, title: 'Доставлен', description: 'Спасибо за покупку!', icon: 'lucide:package-check' },
]

// Подписка на изменения статуса заказа
onMounted(() => {
  const channel = supabase
    .channel('order-status')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${props.orderId}`,
      },
      (payload) => {
        orderStatus.value = payload.new.status
      }
    )
    .subscribe()

  onUnmounted(() => {
    supabase.removeChannel(channel)
  })
})
</script>

<template>
  <div class="bg-background border rounded-lg p-4 md:p-6">
    <h3 class="text-base md:text-lg font-semibold mb-4 md:mb-6">Статус заказа</h3>
    
    <div class="space-y-4">
      <div v-for="(step, index) in steps" :key="step.id" class="flex gap-4">
        <!-- Icon & Line -->
        <div class="flex flex-col items-center">
          <div
            class="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full border-2 transition-all flex-shrink-0"
            :class="
              currentStep >= step.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted bg-background text-muted-foreground'
            "
          >
            <Icon :name="step.icon" class="w-4 h-4 md:w-5 md:h-5" />
          </div>
          <div
            v-if="index < steps.length - 1"
            class="w-0.5 h-12 mt-2"
            :class="currentStep > step.id ? 'bg-primary' : 'bg-muted'"
          />
        </div>

        <!-- Content -->
        <div class="flex-1 pb-4">
          <h4
            class="text-sm md:text-base font-semibold"
            :class="
              currentStep >= step.id
                ? 'text-foreground'
                : 'text-muted-foreground'
            "
          >
            {{ step.title }}
          </h4>
          <p class="text-xs md:text-sm text-muted-foreground mt-0.5">
            {{ step.description }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
