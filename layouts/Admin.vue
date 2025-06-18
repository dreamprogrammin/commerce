<template>
  <div class="admin-layout bg-muted/40 min-h-screen">
    <header class="bg-background border-b p-4 shadow-sm">
      <nav class="container mx-auto flex justify-between items-center">
        <NuxtLink to="/admin" class="text-xl font-bold text-primary"
          >Админ-панель</NuxtLink
        >
        <div>
          <!-- Ссылки на другие разделы админки -->
          <NuxtLink to="/admin/menu" class="px-3 py-2 hover:text-primary"
            >Меню</NuxtLink
          >
          <NuxtLink to="/admin/users" class="px-3 py-2 hover:text-primary"
            >Пользователи</NuxtLink
          >
          <!-- Кнопка выхода и т.д. -->
        </div>
      </nav>
    </header>
    <main class="py-8">
      <slot />
      <!-- Сюда будет рендериться содержимое страницы /admin/menu -->
    </main>
    <footer class="text-center p-4 border-t text-sm text-muted-foreground">
      © {{ new Date().getFullYear() }} Админка Магазина
    </footer>
  </div>
</template>

<script setup lang="ts">
// Логика для layout, если нужна (например, проверка аутентификации на уровне layout)
</script>

<style scoped>
/* Стили для админского layout */
</style>
