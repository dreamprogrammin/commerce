<script setup lang="ts">
import { useMenuAdminStore } from '@/stores/menuItems/useTopMenuItems';
import type { MenuItemRow } from '@/types';

definePageMeta({ layout: 'admin' });

const menuAdminStore = useMenuAdminStore();

// Загружаем все пункты меню при монтировании
onMounted(() => {
  if (menuAdminStore.items.length === 0) {
    menuAdminStore.fetchItems();
  }
});

// Функция для переключения статуса. Мы добавим ее в store.
async function handleToggle(item: MenuItemRow) {
  await menuAdminStore.toggleFeaturedStatus(item);
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8">
    <h1 class="text-3xl font-bold text-foreground mb-6">
      Управление популярными категориями
    </h1>

    <Card>
      <CardHeader>
        <CardTitle>Список категорий</CardTitle>
        <p class="text-muted-foreground text-sm mt-1">
          Включите переключатель для тех категорий, которые должны отображаться на главной странице.
          Рекомендуется выбирать не более 6-8 категорий с изображениями.
        </p>
      </CardHeader>
      <CardContent>
        <div v-if="menuAdminStore.isLoading" class="text-center py-10">
          Загрузка...
        </div>
        <div v-else class="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название категории</TableHead>
                <TableHead>Путь (Slug)</TableHead>
                <TableHead class="text-right">Показывать на главной</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="item in menuAdminStore.items" :key="item.id">
                <TableCell class="font-medium flex items-center gap-2">
                  <span>{{ item.title }}</span>
                  <Badge v-if="!item.image_url" variant="destructive" class="text-xs">Нет фото</Badge>
                </TableCell>
                <TableCell class="text-muted-foreground">{{ item.href }}</TableCell>
                <TableCell class="text-right">
                  <Switch
                    :checked="item.is_featured_on_homepage"
                    @update:checked="() => handleToggle(item)"
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  </div>
</template>