<script setup lang="ts">
import Button from "~/components/ui/button/Button.vue";
import { useMenuItems } from "~/stores/menuItems/useMenuItems";
import type { MenuItemRow } from "~/types";

const menuItemsStore = useMenuItems();

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
    <h2 class="text-xl font-semibold mb-4 text-foreground">Пункты меню</h2>
    <Button @click="emit('create-new')" class="mb-4 w-full">
      Создать новый пункт
    </Button>

    <div
      v-if="menuItemsStore.isLoading && menuItemsStore.menuItems.length === 0"
      class="text-center py-6"
    >
      <p class="text-muted-foreground my-2">Загрузка списка...</p>
    </div>

    <ul v-else-if="menuItemsStore.topLevelItems.length > 0" class="space-y-1">
      <template v-for="item in menuItemsStore.topLevelItems" :key="item.id">
        <li class="border-b border-border last:border-b-0 py-1">
          <div
            @click="emit('edit-item', item)"
            class="p-2 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer flex justify-between items-center group"
          >
            <span class="font-medium">{{ item.title }}</span>
            <span
              class="text-xs text-muted-foreground group-hover:text-accent-foreground"
              >{{ item.slug }}</span
            >
            <Button
              @click.stop="handleDeleteClicked(item)"
              variant="ghost"
              size="icon"
              class="text-destructive hover:bg-destructive/10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Удалить"
              >Удалить</Button
            >
          </div>
          <ul
            v-if="menuItemsStore.getChildren(item.slug).length > 0"
            class="ml-5 pl-3 border-l border-dashed border-border space-y-1 mt-1"
          >
            <li
              v-for="child in menuItemsStore.getChildren(item.slug)"
              :key="child.id"
              class="py-1"
            >
              <div
                @click="emit('edit-item', child)"
                class="p-2 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer flex justify-between items-center group"
              >
                <div class="flex items-center">
                  <span class="text-sm">{{ child.title }}</span>
                  <span
                    class="text-xs text-muted-foreground ml-2 group-hover:text-accent-foreground"
                    >{{ child.slug }}</span
                  >
                  <Button
                    @click.stop="handleDeleteClicked(child)"
                    variant="ghost"
                    size="icon"
                    class="text-destructive hover:bg-destructive/10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Удалить"
                    >Удалить</Button
                  >
                </div>
              </div>
            </li>
          </ul>
        </li>
      </template>
    </ul>
    <p
      v-else-if="!menuItemsStore.isLoading"
      class="text-muted-foreground text-center py-6"
    >
      Меню пока пусто. Добавьте первый пункт
    </p>
  </div>
</template>
