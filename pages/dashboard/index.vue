// pages/admin/index.vue (НОВОЕ СОДЕРЖИМОЕ)
<script setup lang="ts">
definePageMeta({
  layout: "admin",
});

// Здесь можно было бы загружать какую-то статистику в будущем
// const { data: stats } = useAsyncData('admin-stats', async () => { ... });
</script>

<template>
  <div class="container mx-auto p-4 md:p-8">
    <h1 class="text-3xl font-bold text-foreground mb-6">Приборная панель</h1>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Карточка-ссылка на Управление меню -->
      <NuxtLink to="/admin/menu" class="block">
        <Card class="hover:border-primary transition-colors">
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium">Управление меню</CardTitle>
            <Icon
              name="lucide:list-tree"
              class="h-4 w-4 text-muted-foreground"
            />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">Меню сайта</div>
            <p class="text-xs text-muted-foreground">
              Редактирование структуры навигации и подкатегорий.
            </p>
          </CardContent>
        </Card>
      </NuxtLink>

      <!-- Карточка-ссылка на Управление слайдами -->
      <NuxtLink to="/admin/slides" class="block">
        <Card class="hover:border-primary transition-colors">
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium"
              >Управление слайдами</CardTitle
            >
            <Icon
              name="lucide:gallery-horizontal"
              class="h-4 w-4 text-muted-foreground"
            />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">Слайдер</div>
            <p class="text-xs text-muted-foreground">
              Добавление и редактирование слайдов на главной странице.
            </p>
          </CardContent>
        </Card>
      </NuxtLink>

      <!-- Здесь можно будет добавлять другие карточки -->
    </div>
  </div>
</template>
