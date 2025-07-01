<script setup lang="ts">
import { ref, onMounted } from "vue";
import type { Database } from "~/types/supabase";
import MenuItemList from "~/components/admin/menu/MenuItemList.vue";
import MenuItemForm from "~/components/admin/menu/MenuItemForm.vue";
import { useTopMenuItemsStore } from "~/stores/menuItems/useTopMenuItems";

definePageMeta({
  layout: "admin",
});

type MenuItemRow = Database["public"]["Tables"]["menu_items"]["Row"];

const menuAdminStore = useTopMenuItemsStore();
const currentSelectedItem = ref<MenuItemRow | null>(null);
const showForm = ref(false);

onMounted(() => {
  menuAdminStore.fetchItems();
});

function handleEditItem(item: MenuItemRow) {
  currentSelectedItem.value = item;
  showForm.value = true;
}

function handleCreateNew() {
  currentSelectedItem.value = null;
  showForm.value = true;
}

function handleFormSaved() {
  showForm.value = false;
  currentSelectedItem.value = null;
}

function handleFormCancel() {
  showForm.value = false;
  currentSelectedItem.value = null;
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-6">Управление подкатегориями меню</h1>

    <div
      v-if="menuAdminStore.storeError"
      class="my-6 p-4 bg-destructive/10 text-destructive border border-destructive rounded-md shadow"
    >
      <h3 class="font-semibold text-lg mb-2">Произошла ошибка</h3>
      <p>{{ menuAdminStore.storeError }}</p>
      <Button
        @click="menuAdminStore.fetchItems()"
        variant="destructive"
        class="mt-3"
        >Попробовать снова</Button
      >
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Список меню слева -->
      <div class="lg:col-span-1">
        <MenuItemList
          @edit-item="handleEditItem"
          @create-new="handleCreateNew"
        />
      </div>

      <!-- Форма справа -->
      <div class="lg:col-span-1">
        <MenuItemForm
          v-if="showForm"
          :selected-item="currentSelectedItem"
          @form-saved="handleFormSaved"
          @form-cancel="handleFormCancel"
          class="sticky top-8"
        />
        <div
          v-else
          class="flex items-center justify-center h-64 bg-card rounded-lg shadow-md text-muted-foreground"
        >
          <p>Выберите подкатегорию для редактирования или создайте новую.</p>
        </div>
      </div>
    </div>
  </div>
</template>
