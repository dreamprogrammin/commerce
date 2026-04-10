<script setup lang="ts">
const route = useRoute()

const currentStep = computed(() => {
  if (route.path.includes('/cart')) return 1
  if (route.path.includes('/checkout')) return 2
  if (route.path.includes('/order/success')) return 3
  return 1
})
</script>

<template>
  <div>
    <div class="hidden md:block">
      <CommonHeader />
    </div>

    <!-- Checkout Stepper -->
    <div class="bg-background border-b">
      <div class="container mx-auto px-4">
        <Stepper v-model="currentStep" class="flex items-center justify-center py-4 md:py-6">
          <StepperItem v-slot="{ state }" :step="1" class="relative flex items-center">
            <StepperTrigger as-child>
              <div
                class="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full border-2 transition-all"
                :class="
                  state === 'completed' || state === 'active'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted bg-background text-muted-foreground'
                "
              >
                <Icon name="lucide:shopping-cart" class="w-4 h-4 md:w-5 md:h-5" />
              </div>
            </StepperTrigger>
            <StepperTitle
              class="ml-2 text-sm hidden sm:block"
              :class="
                state === 'completed' || state === 'active'
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              "
            >
              Корзина
            </StepperTitle>
          </StepperItem>

          <StepperSeparator class="flex-1 mx-2 md:mx-4" />

          <StepperItem v-slot="{ state }" :step="2" class="relative flex items-center">
            <StepperTrigger as-child>
              <div
                class="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full border-2 transition-all"
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
              class="ml-2 text-sm hidden sm:block"
              :class="
                state === 'completed' || state === 'active'
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              "
            >
              Оформление
            </StepperTitle>
          </StepperItem>

          <StepperSeparator class="flex-1 mx-2 md:mx-4" />

          <StepperItem v-slot="{ state }" :step="3" class="relative flex items-center">
            <StepperTrigger as-child>
              <div
                class="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full border-2 transition-all"
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
              class="ml-2 text-sm hidden sm:block"
              :class="
                state === 'completed' || state === 'active'
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              "
            >
              Готово
            </StepperTitle>
          </StepperItem>
        </Stepper>
      </div>
    </div>

    <slot />
  </div>
</template>
