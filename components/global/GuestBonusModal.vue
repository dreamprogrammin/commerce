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
              = 1000 ₸ на следующие покупки
            </p>
          </div>
        </div>

        <!-- Как это работает -->
        <div class="space-y-3 text-sm">
          <p class="text-muted-foreground text-center">
            Просто войдите через Google и бонусы сразу на вашем счету!
          </p>

          <div class="flex items-center gap-2 text-muted-foreground">
            <Star class="w-4 h-4 text-primary flex-shrink-0" />
            <span>Накапливайте бонусы за каждую покупку</span>
          </div>

          <div class="flex items-center gap-2 text-muted-foreground">
            <Star class="w-4 h-4 text-primary flex-shrink-0" />
            <span>Оплачивайте ими до 100% заказа</span>
          </div>
        </div>
      </div>

      <DialogFooter class="flex-col sm:flex-col gap-2">
        <Button size="lg" class="w-full" @click="handleRegister">
          <Gift class="w-4 h-4 mr-2" />
          Получить 1000 бонусов
        </Button>
        <Button variant="ghost" size="sm" class="w-full" @click="handleClose">
          Нет, спасибо
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
