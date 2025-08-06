<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import { useAuth } from '@/composables/auth/useAuth'

const { handleOut } = useAuth()
</script>

<template>
  <div class="flex min-h-screen w-full bg-muted/40">
    <aside class="hidden w-64 flex-col border-r bg-background sm:flex">
      <div class="flex h-16 items-center border-b px-6">
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold">
          <span>Мой проект</span>
        </NuxtLink>
      </div>

      <nav class="flex-1 space-y-2 p-4">
        <NuxtLink
          to="/admin/menu"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
          active-class="bg-muted text-primary"
        >
          Управление меню
        </NuxtLink>

        <NuxtLink
          to="/admin/popular-categories"
          active-class="bg-muted text-primary"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
        >
          Популярные категории
        </NuxtLink>

        <NuxtLink
          to="/admin/slides"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
          active-class="bg-muted text-primary"
        >
          Управление слайдами
        </NuxtLink>

        <NuxtLink
          to="/admin/users"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
          active-class="bg-muted text-primary"
        >
          Управление пользователями
        </NuxtLink>
      </nav>
    </aside>

    <div class="flex flex-1 flex-col">
      <header
        class="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-6"
      >
        <h1 class="text-xl font-semibold">
          Панель администратора
        </h1>
        <div class="ml-auto flex items-center gap-4">
          <Button @click="handleOut">
            Выйти
          </Button>
        </div>
      </header>
      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>
  </div>
</template>
