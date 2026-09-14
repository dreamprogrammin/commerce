<script setup lang="ts">
/**
 * `/forgot-password` — остаток от входа по паролю, которого на сайте нет.
 *
 * Страница отдавала 500 и на проде, и локально: шаблон читал
 * `authStore.errors.forgotPassword`, а поля `errors` в сторе нет вовсе, как
 * нет и метода `handleForgotPassword`. Форма не сработала бы, даже если бы
 * страница отрисовалась.
 *
 * Восстанавливать пароль не из чего: единственный способ входа — Google
 * (`components/auth/LoginModal.vue`). Адрес оставлен живым, потому что он
 * встречается в старых письмах и в закладках, но теперь он говорит правду и
 * ведёт ко входу.
 */
import { pageShell } from '@/lib/shell'
import { useModalStore } from '@/stores/modal/useModalStore'

definePageMeta({ layout: 'shell', shell: pageShell })

const modalStore = useModalStore()

useSeoMeta({
  title: 'Восстановление доступа — Ухтышка',
  description: 'Вход в Ухтышку выполняется через аккаунт Google, пароль не нужен.',
  robots: 'noindex, follow',
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
    <span class="grid size-14 place-content-center rounded-2xl bg-primary/10">
      <Icon name="lucide:key-round" class="size-7 text-primary" />
    </span>

    <h1 class="text-2xl font-bold tracking-tight">
      Пароль не нужен
    </h1>

    <p class="text-muted-foreground">
      Вход в Ухтышку выполняется через аккаунт Google — восстанавливать
      нечего. Нажмите кнопку ниже и войдите тем же аккаунтом, что и раньше.
    </p>

    <button
      type="button"
      class="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground"
      @click="modalStore.openLoginModal()"
    >
      <Icon name="lucide:log-in" class="size-5" />
      Войти
    </button>

    <NuxtLink to="/" class="text-sm text-primary hover:underline">
      Вернуться на главную
    </NuxtLink>
  </div>
</template>
