<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/composables/auth/useAuth'
import { useModalStore } from '@/stores/modal/useModalStore'

const modalStore = useModalStore()
const { showLoginModal } = storeToRefs(modalStore)

const { handleAuthGoogle } = useAuth()
const isLoading = ref(false)

// ✅ Используем computed для двусторонней привязки со store
const isOpen = computed({
  get: () => showLoginModal.value,
  set: (value) => {
    if (value) {
      modalStore.openLoginModal()
    }
    else {
      modalStore.closeLoginModal()
    }
  },
})

async function onGoogleSignIn() {
  try {
    isLoading.value = true
    await handleAuthGoogle()
    toast.success('Перенаправление на Google...', {
      description: 'Вы будете перенаправлены на страницу входа Google',
    })
    // ✅ Закрываем модалку после успешного входа
    modalStore.closeLoginModal()
  }
  catch (error: any) {
    console.error('Google sign in failed:', error)
    toast.error('Ошибка входа', {
      description: error.message || 'Попробуйте еще раз',
    })
  }
  finally {
    isLoading.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br bg-primary">
          <Icon name="lucide:user-circle" class="h-8 w-8 text-white" />
        </div>
        <DialogTitle class="text-center text-2xl">
          Добро пожаловать!
        </DialogTitle>
        <DialogDescription class="text-center">
          Войдите, чтобы получить доступ ко всем функциям
        </DialogDescription>
      </DialogHeader>

      <!-- Преимущества авторизации -->
      <div class="space-y-2 py-2">
        <div class="flex items-center gap-3 text-sm">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
            <Icon name="lucide:gift" class="w-4 h-4 text-orange-600" />
          </div>
          <span class="text-muted-foreground">Накапливайте и тратьте бонусы</span>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <Icon name="lucide:package" class="w-4 h-4 text-blue-600" />
          </div>
          <span class="text-muted-foreground">Отслеживайте статус заказов</span>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center">
            <Icon name="lucide:heart" class="w-4 h-4 text-pink-600" />
          </div>
          <span class="text-muted-foreground">Сохраняйте избранные товары</span>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <Icon name="lucide:clock" class="w-4 h-4 text-green-600" />
          </div>
          <span class="text-muted-foreground">Просматривайте историю покупок</span>
        </div>
      </div>

      <div class="space-y-4">
        <!-- Кнопка Google -->
        <Button
          variant="outline"
          size="lg"
          class="w-full gap-3 text-base"
          :disabled="isLoading"
          @click="onGoogleSignIn"
        >
          <Icon
            v-if="!isLoading"
            name="logos:google-icon"
            class="h-5 w-5"
          />
          <Icon
            v-else
            name="line-md:loading-twotone-loop"
            class="h-5 w-5"
          />
          <span>{{ isLoading ? 'Загрузка...' : 'Войти через Google' }}</span>
        </Button>

        <!-- Информация о безопасности -->
        <div class="flex items-start gap-2 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
          <Icon name="lucide:shield-check" class="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
          <p class="text-sm text-blue-900 dark:text-blue-100">
            Мы не получаем доступ к вашему паролю. Аутентификация происходит через защищенное соединение Google.
          </p>
        </div>
      </div>

      <!-- Дополнительная информация -->
      <p class="mt-2 text-center text-xs text-muted-foreground">
        Нажимая «Войти через Google», вы даёте согласие на сбор и обработку
        персональных данных в соответствии с
        <NuxtLink to="/privacy-policy" class="underline underline-offset-4 hover:text-primary">
          Политикой конфиденциальности
        </NuxtLink>
        и законодательством Республики Казахстан
      </p>
    </DialogContent>
  </Dialog>
</template>
