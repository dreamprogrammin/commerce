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
    
    <Stepper v-model="currentStep" orientation="vertical" class="gap-3 md:gap-4">
      <StepperItem v-slot="{ state }" :step="1">
        <StepperTrigger as-child>
          <div
            class="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full border-2 transition-all flex-shrink-0"
            :class="
              state === 'completed' || state === 'active'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted bg-background text-muted-foreground'
            "
          >
            <Icon name="lucide:file-text" class="w-4 h-4 md:w-5 md:h-5" />
          </div>
        </StepperTrigger>
        <StepperTitle
          class="text-sm md:text-base"
          :class="
            state === 'completed' || state === 'active'
              ? 'text-foreground font-semibold'
              : 'text-muted-foreground'
          "
        >
          Заказ создан
        </StepperTitle>
        <StepperDescription class="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1">
          Принят в обработку
        </StepperDescription>
      </StepperItem>

      <StepperSeparator />

      <StepperItem v-slot="{ state }" :step="2">
        <StepperTrigger as-child>
          <div
            class="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full border-2 transition-all flex-shrink-0"
            :class="
              state === 'completed' || state === 'active'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted bg-background text-muted-foreground'
            "
          >
            <Icon name="lucide:check-circle" class="w-4 h-4 md:w-5 md:h-5" />
          </div>
        </StepperTrigger>
        <StepperTitle
          class="text-sm md:text-base"
          :class="
            state === 'completed' || state === 'active'
              ? 'text-foreground font-semibold'
              : 'text-muted-foreground'
          "
        >
          Подтвержден
        </StepperTitle>
        <StepperDescription class="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1">
          Готовим к отправке
        </StepperDescription>
      </StepperItem>

      <StepperSeparator />

      <StepperItem v-slot="{ state }" :step="3">
        <StepperTrigger as-child>
          <div
            class="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full border-2 transition-all flex-shrink-0"
            :class="
              state === 'completed' || state === 'active'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted bg-background text-muted-foreground'
            "
          >
            <Icon name="lucide:truck" class="w-4 h-4 md:w-5 md:h-5" />
          </div>
        </StepperTrigger>
        <StepperTitle
          class="text-sm md:text-base"
          :class="
            state === 'completed' || state === 'active'
              ? 'text-foreground font-semibold'
              : 'text-muted-foreground'
          "
        >
          Отправлен
        </StepperTitle>
        <StepperDescription class="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1">
          В пути
        </StepperDescription>
      </StepperItem>

      <StepperSeparator />

      <StepperItem v-slot="{ state }" :step="4">
        <StepperTrigger as-child>
          <div
            class="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full border-2 transition-all flex-shrink-0"
            :class="
              state === 'completed' || state === 'active'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted bg-background text-muted-foreground'
            "
          >
            <Icon name="lucide:package-check" class="w-4 h-4 md:w-5 md:h-5" />
          </div>
        </StepperTrigger>
        <StepperTitle
          class="text-sm md:text-base"
          :class="
            state === 'completed' || state === 'active'
              ? 'text-foreground font-semibold'
              : 'text-muted-foreground'
          "
        >
          Доставлен
        </StepperTitle>
        <StepperDescription class="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1">
          Спасибо за покупку!
        </StepperDescription>
      </StepperItem>
    </Stepper>
  </div>
</template>
