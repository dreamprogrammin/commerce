<script setup lang="ts">
import { useModalStore } from '@/stores/modal/useModalStore'
import { useProfileStore } from '@/stores/profile'

const user = useSupabaseUser()
const profileStore = useProfileStore()
const modalStore = useModalStore()

const { isLoading, bonusBalance, displayProfile } = storeToRefs(profileStore)

function openLoginModal() {
  // Например, если метод называется `showLoginModal = true`
  // modalStore.showLoginModal = true;
  // или если это функция:
  // modalStore.open();

  // Я предположу, что у вас есть метод, который делает что-то вроде этого:
  // modalStore.setModalState('login', true);
  // Напишите здесь тот код, который у вас открывает модалку
  console.log('Открытие модального окна входа...')
  // Например: modalStore.showLogin();
}
</script>

<template>
  <section class="container py-8 md:py-16">
    <div class="max-w-4xl mx-auto">
      <Card
        class="bg-gradient-to-br from-primary/10 via-background to-background dark:from-primary/20 dark:via-background text-center shadow-lg border-2 border-primary/20"
      >
        <CardHeader class="items-center">
          <div
            class="p-4 bg-background rounded-full mb-4 ring-2 ring-yellow-400/50"
          >
            <Gift class="w-10 h-10 text-primary" />
          </div>
          <CardTitle class="text-2xl md:text-3xl">
            Наша Бонусная Программа
          </CardTitle>
          <CardDescription class="text-base">
            Копите и тратьте бонусы на свои мечты!
          </CardDescription>
        </CardHeader>

        <CardContent class="text-lg space-y-4">
          <p>
            Получайте <span class="font-bold">кэшбек</span> с каждой покупки и
            используйте его для оплаты следующих заказов.
          </p>
          <p class="font-extrabold text-primary text-2xl tracking-tight">
            1 бонус = 1 тенге
          </p>

          <!-- Адаптивный блок -->
          <div v-if="user" class="mt-6 pt-6 border-t border-dashed">
            <!-- Спиннер во время загрузки профиля -->
            <div v-if="isLoading" class="h-16 flex items-center justify-center">
              <div
                class="w-8 h-8 border-4 border-dashed rounded-full animate-spin border-primary"
              />
            </div>
            <!-- Баланс после загрузки -->
            <div v-else-if="displayProfile">
              <p class="text-muted-foreground">
                На вашем счету:
              </p>
              <p
                class="text-4xl font-bold text-amber-500 flex items-center justify-center gap-2"
              >
                {{ bonusBalance }} ✨
                <span class="text-2xl font-normal text-muted-foreground">бонусов</span>
              </p>
            </div>
          </div>
        </CardContent>

        <CardFooter class="flex flex-col items-center gap-4 pt-6">
          <!-- Кнопка для залогиненного пользователя -->
          <NuxtLink v-if="user" to="/profile/bonuses">
            <Button size="lg" variant="default">
              <History class="w-4 h-4 mr-2" />
              История начислений
            </Button>
          </NuxtLink>
          <!-- Кнопка для гостя, открывающая модалку -->
          <div v-else>
            <Button size="lg" variant="default" @click="openLoginModal">
              <LogIn class="w-4 h-4 mr-2" />
              Войти и начать копить
            </Button>
          </div>
          <!-- Общая ссылка на правила -->
          <NuxtLink to="/bonus-program-rules">
            <Button variant="link" class="text-muted-foreground">
              Подробнее о правилах программы
            </Button>
          </NuxtLink>
        </CardFooter>
      </Card>
    </div>
  </section>
</template>
