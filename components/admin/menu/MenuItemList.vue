<script setup lang="ts">
import Button from "~/components/ui/button/Button.vue";
import { staticMainMenuItems } from "~/config/staticItems";
import { useTopMenuItemsStore } from "~/stores/menuItems/useTopMenuItems";
import type { MenuItemRow } from "~/types";

const menuItemsStore = useTopMenuItemsStore();

const emit = defineEmits<{
  (e: "edit-item", item: MenuItemRow): void;
  (e: "create-new"): void;
}>();

async function handleDeleteClicked(item: MenuItemRow) {
  await menuItemsStore.deleteItem(item);
}
</script>
<template>
  <div class="bg-card p-4 rounded-lg shadow-md">
    <h2 class="text-xl font-semibold mb-3 text-foreground">Пункты меню</h2>
    <p class="text-sm text-muted-foreground mb-4">
      Здесь отображаются статические разделы. Вы можете добавлять и
      редактировать подкатегории для них.
    </p>
    <Button @click="emit('create-new')" class="mb-4 w-full"
      >Создать новую подкатегорию</Button
    >

    <div v-if="menuItemsStore.isLoading && menuItemsStore.items.length === 0">
      <p class="text-muted-foreground mt-2">...Загрузка</p>
    </div>

    <ul v-else class="space-y-4">
      <li
        v-for="staticParent in staticMainMenuItems.filter(
          (item) => item.isTrigger,
        )"
        :key="staticParent.slug"
      >
        <div class="p-2 rounded bg-muted">
          <span class="font-semibold text-foreground">{{
            staticParent.title
          }}</span>
          <span class="text-xs text-muted-foreground ml-1"
            >(slug: {{ staticParent.slug }})</span
          >
        </div>

        <ul
          v-if="menuItemsStore.getChildren(staticParent.slug).length > 0"
          class="mt-2 ml-4 pl-3 border-l border-dashed space-y-1"
        >
          <li
            v-for="child in menuItemsStore.getChildren(staticParent.slug)"
            :key="child.id"
          >
            <div
              class="p-2 rounded-md hover:bg-accent cursor-pointer flex justify-between items-center group"
            >
              <span @click="emit('edit-item', child)" class="flex-1 text-sm">{{
                child.title
              }}</span>
              <Button
                @click.stop="handleDeleteClicked(child)"
                variant="ghost"
                size="icon"
                class="text-destructive hover:bg-destructive/10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Удалить"
              >
                Удалить
              </Button>
            </div>
          </li>
        </ul>
        <p v-else>Нет подкатегории</p>
      </li>
    </ul>
  </div>
</template>
