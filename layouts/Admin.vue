<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import { useAuth } from '@/composables/auth/useAuth'
import { useCacheManager } from '@/composables/useCacheManager'
import { useAdminQuestionsStore } from '@/stores/adminStore/adminQuestionsStore'

const { handleOut } = useAuth()
const { clearAllQueryCache, hardReset } = useCacheManager()
const adminQuestionsStore = useAdminQuestionsStore()

onMounted(() => {
  adminQuestionsStore.fetchUnansweredCount()
})
</script>

<template>
  <div class="hidden md:block">
    <CommonHeader />
  </div>
  <div class="flex min-h-screen w-full bg-muted/40">
    <aside class="hidden w-64 flex-col border-r bg-background sm:flex">
      <div class="flex h-16 items-center border-b px-6">
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold">
          <span>Мой проект</span>
        </NuxtLink>
      </div>

      <nav class="flex-1 space-y-2 p-4">
        <NuxtLink
          to="/admin/categories"
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

        <NuxtLink
          to="/admin/products"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
          active-class="bg-muted text-primary"
        >
          Управление товарами
        </NuxtLink>
        <NuxtLink
          to="/admin/brands"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
          active-class="bg-muted text-primary"
        >
          Добавление бренда
        </NuxtLink>
        <NuxtLink
          to="/admin/attributes"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
          active-class="bg-muted text-primary"
        >
          Управление атрибутами
        </NuxtLink>
        <NuxtLink
          to="/admin/banners"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
          active-class="bg-muted text-primary"
        >
          Управление банерами
        </NuxtLink>
        <NuxtLink
          to="/admin/questions"
          class="flex items-center justify-between rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
          active-class="bg-muted text-primary"
        >
          <span>Вопросы</span>
          <Badge v-if="adminQuestionsStore.unansweredCount > 0" variant="destructive" class="text-xs">
            {{ adminQuestionsStore.unansweredCount }}
          </Badge>
        </NuxtLink>

        <NuxtLink
          to="/admin/pos"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
          active-class="bg-muted text-primary"
        >
          Оффлайн касса
        </NuxtLink>

        <NuxtLink
          to="/admin/returns"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
          active-class="bg-muted text-primary"
        >
          Возвраты
        </NuxtLink>

        <NuxtLink
          to="/admin/reports"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
          active-class="bg-muted text-primary"
        >
          Отчёты
        </NuxtLink>

        <NuxtLink
          to="/admin/broadcast"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
          active-class="bg-muted text-primary"
        >
          Рассылка
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
        <div class="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            @click="clearAllQueryCache"
          >
            <Icon name="lucide:trash-2" class="w-4 h-4 sm:mr-2" />
            <span class="hidden sm:inline">Очистить кеш</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            @click="hardReset"
          >
            <Icon name="lucide:refresh-cw" class="w-4 h-4 sm:mr-2" />
            <span class="hidden sm:inline">Полный сброс</span>
          </Button>
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
