<script setup lang="ts">
/**
 * `/register` — остаток от регистрации по паролю, которой на сайте нет.
 *
 * Страница отдавала 500 и на проде, и локально: шаблон читал
 * `authStore.errors.register`, а поля `errors` в сторе нет. Форма отправляла
 * данные в метод, которого тоже нет.
 *
 * Отдельной регистрации у магазина не существует: профиль заводится сам при
 * первом входе через Google (триггер на `profiles`). Адрес оставлен живым
 * ради старых ссылок и закладок.
 */
import { pageShell } from '@/lib/shell'
import { useModalStore } from '@/stores/modal/useModalStore'

definePageMeta({ layout: 'shell', shell: pageShell })

const modalStore = useModalStore()

useSeoMeta({
  title: 'Регистрация — Ухтышка',
  description: 'Аккаунт в Ухтышке создаётся автоматически при первом входе через Google.',
  robots: 'noindex, follow',
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
    <span class="grid size-14 place-content-center rounded-2xl bg-primary/10">
      <Icon name="lucide:user-plus" class="size-7 text-primary" />
    </span>

    <h1 class="text-2xl font-bold tracking-tight">
      Отдельной регистрации нет
    </h1>

    <p class="text-muted-foreground">
      Аккаунт создаётся сам при первом входе через Google. Бонусы, заказы и
      избранное привяжутся к нему автоматически.
    </p>

    <button
      type="button"
      class="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground"
      @click="modalStore.openLoginModal()"
    >
      <Icon name="lucide:log-in" class="size-5" />
      Войти через Google
    </button>

    <NuxtLink to="/" class="text-sm text-primary hover:underline">
      Вернуться на главную
    </NuxtLink>
  </div>
</template>
