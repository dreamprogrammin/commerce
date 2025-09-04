<script setup lang="ts">
import { Gift, History, LogIn } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useProfileStore } from '@/stores/core/profileStore'
import { useModalStore } from '@/stores/modal/useModalStore'

const profileStore = useProfileStore()
const modalStore = useModalStore()

const { profile, isLoading, bonusBalance, isLoggedIn } = storeToRefs(profileStore)

// Эта логика на клиенте остается, она нужна для обновления данных
// после того, как сессия восстановилась.
onMounted(() => {
  if (isLoggedIn.value && !profile.value) {
    profileStore.loadProfile()
  }
})
</script>

<template>
  <section class="container py-8 md:py-16">
    <div class="max-w-4xl mx-auto">
      <Card
        class="bg-gradient-to-br from-primary/10 via-background to-background dark:from-primary/20 dark:via-background text-center shadow-lg border-2 border-primary/20"
      >
        <CardHeader class="items-center">
          <div class="p-4 bg-background rounded-full mb-4 ring-2 ring-yellow-400/50">
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

          <!--
            Оборачиваем в ClientOnly ВЕСЬ БЛОК, который зависит от состояния пользователя.
            Это решит все ошибки гидратации внутри CardContent и CardFooter.
          -->
          <ClientOnly>
            <div v-if="isLoggedIn" class="mt-6 pt-6 border-t border-dashed">
              <div v-if="isLoading" class="h-16 flex items-center justify-center">
                <div class="w-8 h-8 border-4 border-dashed rounded-full animate-spin border-primary" />
              </div>
              <div v-else-if="profile">
                <p class="text-muted-foreground">
                  На вашем счету:
                </p>
                <p class="text-4xl font-bold text-amber-500 flex items-center justify-center gap-2">
                  {{ bonusBalance }} ✨
                  <span class="text-2xl font-normal text-muted-foreground">бонусов</span>
                </p>
              </div>
            </div>

            <!--
              Fallback - это то, что будет отрендерено на сервере и показано
              до того, как клиентский JS "оживит" компонент.
              Мы покажем нейтральное приглашение, которое верно для всех.
            -->
            <template #fallback>
              <div class="mt-6 pt-6 border-t border-dashed">
                <p class="h-16 flex items-center justify-center text-muted-foreground">
                  Авторизуйтесь, чтобы увидеть ваш баланс
                </p>
              </div>
            </template>
          </ClientOnly>
        </CardContent>

        <CardFooter class="flex flex-col items-center gap-4 pt-6">
          <!-- Оборачиваем в ClientOnly и этот блок с кнопками -->
          <ClientOnly>
            <!-- Кнопка для залогиненного пользователя (будет отрендерена на клиенте) -->
            <NuxtLink v-if="isLoggedIn" to="/profile/bonuses">
              <Button size="lg" variant="default">
                <History class="w-4 h-4 mr-2" />
                История начислений
              </Button>
            </NuxtLink>

            <!-- Кнопка для гостя (будет отрендерена на клиенте) -->
            <div v-else>
              <Button size="lg" variant="default" @click="modalStore.openLoginModal()">
                <LogIn class="w-4 h-4 mr-2" />
                Войти и начать копить
              </Button>
            </div>

            <!-- Fallback для кнопок -->
            <template #fallback>
              <!-- Показываем на сервере универсальную кнопку, ведущую на страницу входа -->
              <NuxtLink to="/profile">
                <Button size="lg" variant="default">
                  <LogIn class="w-4 h-4 mr-2" />
                  Войти или Зарегистрироваться
                </Button>
              </NuxtLink>
            </template>
          </ClientOnly>

          <!-- Эта ссылка не зависит от состояния пользователя, ее можно оставить как есть -->
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
