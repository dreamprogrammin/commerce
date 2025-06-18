<script setup lang="ts">
import MenuItemForm from "~/components/admin/menu/MenuItemForm.vue";
import MenuItemList from "~/components/admin/menu/MenuItemList.vue";
import { useAuth } from "~/composables/auth/useAuth";
import { useMenuItems } from "~/stores/menuItems/useMenuItems";
import type { MenuItemRow } from "~/types";
const { handleOut } = useAuth();

definePageMeta({
  layout: "admin",
});

const menuItemsStore = useMenuItems();

const currentSelectedItem = ref<MenuItemRow | null>(null);

const isFormVisible = ref(false);

onMounted(() => {
  menuItemsStore.fetchItems();
});

function handleEditItem(item: MenuItemRow) {
  currentSelectedItem.value = item;
  isFormVisible.value = true;
}

function handleCreateNew() {
  currentSelectedItem.value = null;
  isFormVisible.value = true;
}

function handleFormSaved() {
  isFormVisible.value = false;
  currentSelectedItem.value = null;
}

function handleFormCancel() {
  isFormVisible.value = false;
  currentSelectedItem.value = null;
}

const pageTitle = computed(() => {
  if (isFormVisible.value) {
    return currentSelectedItem.value
      ? `Редактирование: ${currentSelectedItem.value.title}`
      : "Создание нового пункта меню";
  }
  return "Управление пунктами меню";
});
</script>
<template>
  <div>
    <h1>Страница для авторизованных и подтвержденных пользователей</h1>
    <div><nuxt-link to="/">На главную</nuxt-link></div>
    <div>
      <button @click="handleOut">Выйти с аккаунта:</button>
    </div>
  </div>

  <div class="container mx-auto px-4 py-8">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-foreground">{{ pageTitle }}</h1>
      <Button v-if="isFormVisible" @click="handleFormCancel" variant="outline">
        К списку меню
      </Button>
    </div>

    <div
      v-if="
        menuItemsStore.isLoading &&
        !menuItemsStore.menuItems.length &&
        !isFormVisible
      "
      class="text-center py-20"
    >
      <p class="text-muted-foreground mt-4 text-lg">Загрузка данных меню...</p>
    </div>
    <div
      v-else-if="menuItemsStore.error && !isFormVisible"
      class="my-6 p-4 bg-destructive/10 text-destructive border border-destructive rounded-md shadow"
    >
      <h3 class="font-semibold text-lg mb-2">Произошла ошибка</h3>
      <p>{{ menuItemsStore.error }}</p>
      <Button
        @click="menuItemsStore.fetchItems()"
        variant="destructive"
        class="mt-3"
      >
        Попробовать снова
      </Button>
    </div>

    <div v-if="!isFormVisible" class="mt-4">
      <MenuItemList @edit-item="handleEditItem" @create-new="handleCreateNew" />
    </div>

    <div v-if="isFormVisible" class="mt-4">
      <MenuItemForm
        :selected-item="currentSelectedItem"
        @form-saved="handleFormSaved"
        @form-cancel="handleFormCancel"
      />
    </div>
  </div>
</template>
