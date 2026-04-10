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
  <div class="bg-background border rounded-lg p-6">
    <h3 class="text-lg font-semibold mb-6">Статус заказа</h3>
    
    <Stepper v-model="currentStep" orientation="vertical" class="gap-4">
      <StepperItem v-slot="{ state }" :step="1">
        <div class="flex items-start gap-4">
          <StepperTrigger as-child>
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all flex-shrink-0"
              :class="
                state === 'completed' || state === 'active'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted bg-background text-muted-foreground'
              "
            >
              <Icon name="lucide:file-text" class="w-5 h-5" />
            </div>
          </StepperTrigger>
          <div class="flex-1">
            <StepperTitle
              class="text-base"
              :class="
                state === 'completed' || state === 'active'
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground'
              "
            >
              Заказ создан
            </StepperTitle>
            <StepperDescription class="text-sm text-muted-foreground mt-1">
              Ваш заказ принят в обработку
            </StepperDescription>
          </div>
        </div>
      </StepperItem>

      <StepperSeparator class="ml-5 h-8" />

      <StepperItem v-slot="{ state }" :step="2">
        <div class="flex items-start gap-4">
          <StepperTrigger as-child>
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all flex-shrink-0"
              :class="
                state === 'completed' || state === 'active'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted bg-background text-muted-foreground'
              "
            >
              <Icon name="lucide:check-circle" class="w-5 h-5" />
            </div>
          </StepperTrigger>
          <div class="flex-1">
            <StepperTitle
              class="text-base"
              :class="
                state === 'completed' || state === 'active'
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground'
              "
            >
              Заказ подтвержден
            </StepperTitle>
            <StepperDescription class="text-sm text-muted-foreground mt-1">
              Мы подтвердили ваш заказ и готовим к отправке
            </StepperDescription>
          </div>
        </div>
      </StepperItem>

      <StepperSeparator class="ml-5 h-8" />

      <StepperItem v-slot="{ state }" :step="3">
        <div class="flex items-start gap-4">
          <StepperTrigger as-child>
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all flex-shrink-0"
              :class="
                state === 'completed' || state === 'active'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted bg-background text-muted-foreground'
              "
            >
              <Icon name="lucide:truck" class="w-5 h-5" />
            </div>
          </StepperTrigger>
          <div class="flex-1">
            <StepperTitle
              class="text-base"
              :class="
                state === 'completed' || state === 'active'
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground'
              "
            >
              Заказ отправлен
            </StepperTitle>
            <StepperDescription class="text-sm text-muted-foreground mt-1">
              Ваш заказ в пути
            </StepperDescription>
          </div>
        </div>
      </StepperItem>

      <StepperSeparator class="ml-5 h-8" />

      <StepperItem v-slot="{ state }" :step="4">
        <div class="flex items-start gap-4">
          <StepperTrigger as-child>
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all flex-shrink-0"
              :class="
                state === 'completed' || state === 'active'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted bg-background text-muted-foreground'
              "
            >
              <Icon name="lucide:package-check" class="w-5 h-5" />
            </div>
          </StepperTrigger>
          <div class="flex-1">
            <StepperTitle
              class="text-base"
              :class="
                state === 'completed' || state === 'active'
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground'
              "
            >
              Заказ доставлен
            </StepperTitle>
            <StepperDescription class="text-sm text-muted-foreground mt-1">
              Спасибо за покупку!
            </StepperDescription>
          </div>
        </div>
      </StepperItem>
    </Stepper>
  </div>
</template>
