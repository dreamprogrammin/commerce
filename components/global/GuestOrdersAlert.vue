<script setup lang="ts">
import { ArrowRight, Info } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const props = defineProps<{
  currentEmail: string
  enteredEmail: string
}>()

const router = useRouter()

// Проверяем, отличаются ли email
const emailsDifferent = computed(() => {
  if (!props.currentEmail || !props.enteredEmail)
    return false
  return props.currentEmail.toLowerCase() !== props.enteredEmail.toLowerCase()
})

function goToProfile() {
  router.push('/profile')
}
</script>

<template>
  <!-- Показываем подсказку только если email отличаются -->
  <Alert v-if="emailsDifferent" variant="default" class="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
    <Info class="h-4 w-4 text-amber-600" />
    <AlertTitle class="text-amber-900 dark:text-amber-100">
      Внимание: используется другой email
    </AlertTitle>
    <AlertDescription class="space-y-2">
      <p class="text-sm text-amber-800 dark:text-amber-200">
        Вы вошли как <strong>{{ currentEmail }}</strong>, но указываете email
        <strong>{{ enteredEmail }}</strong> для заказа.
      </p>
      <p class="text-sm text-amber-800 dark:text-amber-200">
        Этот заказ не будет автоматически привязан к вашему аккаунту.
        Вы сможете привязать его позже в профиле.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="mt-2"
        @click="goToProfile"
      >
        Перейти к привязке заказов
        <ArrowRight class="w-4 h-4 ml-2" />
      </Button>
    </AlertDescription>
  </Alert>
</template>
