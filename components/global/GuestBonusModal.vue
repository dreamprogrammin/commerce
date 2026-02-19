<script setup lang="ts">
import { Gift, Sparkles, Star } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const authStore = useAuthStore()

function handleRegister() {
  authStore.signInWithOAuth('google', '/checkout')
}

function handleClose() {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-2xl">
          <Gift class="w-6 h-6 text-primary" />
          Получите подарок!
        </DialogTitle>
        <DialogDescription class="text-base">
          Зарегистрируйтесь за 5 секунд и получите бонусы
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-6 py-4">
        <!-- Главное предложение -->
        <div class="bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl p-8 text-center border-2 border-primary/50 relative overflow-hidden">
          <div class="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
          <div class="absolute bottom-0 left-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />

          <div class="relative">
            <Sparkles class="w-12 h-12 text-primary mx-auto mb-3 animate-pulse" />
            <p class="text-4xl font-bold text-primary mb-2 animate-in zoom-in">
              1000 бонусов
            </p>
            <p class="text-sm text-muted-foreground">
              после подтверждения первого заказа = 1000 ₸ скидки
            </p>
          </div>
        </div>

        <!-- Как это работает -->
        <div class="space-y-3 text-sm">
          <p class="text-muted-foreground text-center font-medium">
            Войдите через Google и получите приветственный бонус!
          </p>

          <div class="space-y-2 bg-muted/30 rounded-lg p-3">
            <div class="flex items-start gap-2 text-xs text-muted-foreground">
              <span class="font-bold text-primary">1.</span>
              <span>Бонусы начисляются при подтверждении заказа администратором</span>
            </div>

            <div class="flex items-start gap-2 text-xs text-muted-foreground">
              <span class="font-bold text-primary">2.</span>
              <span>Активация через 14 дней после подтверждения</span>
            </div>

            <div class="flex items-start gap-2 text-xs text-muted-foreground">
              <span class="font-bold text-primary">3.</span>
              <span>1 бонус = 1 ₸ скидки на следующие покупки</span>
            </div>
          </div>

          <div class="flex items-center gap-2 text-muted-foreground text-xs">
            <Star class="w-4 h-4 text-primary flex-shrink-0" />
            <span>Накапливайте бонусы за каждый заказ и экономьте!</span>
          </div>
        </div>
      </div>

      <DialogFooter class="flex-col sm:flex-col gap-2">
        <Button size="lg" class="w-full" @click="handleRegister">
          <Gift class="w-4 h-4 mr-2" />
          Зарегистрироваться и получить бонусы
        </Button>
        <Button variant="ghost" size="sm" class="w-full" @click="handleClose">
          Нет, спасибо
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
