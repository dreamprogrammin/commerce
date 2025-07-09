<script setup lang="ts">
import RecursiveMenuItemFormNode from "~/components/admin/menu/RecursiveMenuItemFormNode.vue";
import { Button } from "@/components/ui/button";
import { toast } from "vue-sonner";
import { v4 as uuidv4 } from "uuid";
import { useMenuAdminStore } from "~/stores/menuItems/useTopMenuItems";
import type { IEditableMenuItem, IStaticMainMenuItem } from "~/types";
import { useRecursiveMenuForm } from "~/composables/menuItems/useRecursiveMenuForm";
import { staticMainMenuItems } from "~/config/staticItems";

const menuAdminStore = useMenuAdminStore();
const selectedParent = ref<IStaticMainMenuItem | null>(null);

const parentSlugRef = computed(() => selectedParent.value?.slug || null);

const { formTree, isSaving, addChildTo, saveAllChanges } =
  useRecursiveMenuForm(parentSlugRef);

onMounted(() => {
  menuAdminStore.fetchItems();
});

function selectParent(parent: IStaticMainMenuItem) {
  selectedParent.value = parent;
}

function handleAddChild(
  parentItem:
    | IEditableMenuItem
    | { children: IEditableMenuItem[]; slug: string },
) {
  if (!parentItem.children) {
    parentItem.children = [];
  }

  if (!parentItem.slug) {
    toast.error("Невозможно добавить подпункт", {
      description:
        "Родительский пункт должен быть сначала сохранен (чтобы получить слаг).",
    });
    return;
  }

  // Создаем новый дочерний элемент
  const newChild: IEditableMenuItem = {
    _tempId: uuidv4(),
    title: "",
    slug: "",
    href: "",
    parent_slug: parentItem.slug, // Привязываем к родителю
    display_order: parentItem.children.length,
    children: [], // Новый элемент сам не имеет детей
  };

  // Добавляем его в массив детей родителя
  parentItem.children.push(newChild);
}

// Функция-обработчик для кнопки "Добавить пункт 2-го уровня"
function addTopLevelNode() {
  if (!selectedParent.value) return;

  // Мы добавляем ребенка не к IEditableMenuItem, а к самому корню дерева `formTree`.
  // Для этого мы передаем объект, имитирующий IEditableMenuItem,
  // в функцию handleAddChild.
  addChildTo({
    children: formTree.value,
    slug: selectedParent.value.slug,
  });
}
definePageMeta({
  layout: "admin",
});
</script>

<template>
  <div class="container mx-auto p-4 md:p-8">
    <div
      class="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6"
    >
      <h1 class="text-3xl font-bold text-foreground">
        Управление содержимым меню
      </h1>
      <Button
        v-if="selectedParent"
        @click="saveAllChanges"
        :disabled="isSaving"
      >
        Сохранить все изменения для "{{ selectedParent.title }}"
      </Button>
    </div>

    <!-- Общий индикатор загрузки/ошибки -->
    <div v-if="menuAdminStore.isLoading" class="text-center py-20">
      <p class="text-muted-foreground mt-4 text-lg">Загрузка данных...</p>
    </div>
    <div
      v-else-if="menuAdminStore.storeError"
      class="my-6 p-4 bg-destructive/10 text-destructive border rounded-md shadow"
    >
      <strong>Ошибка загрузки:</strong> {{ menuAdminStore.storeError }}
    </div>

    <!-- Основная сетка админки -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <!-- Левая колонка: выбор родительского раздела 1-го уровня -->
      <aside class="lg:col-span-1">
        <h2 class="text-lg font-semibold mb-3">1. Выберите основной раздел</h2>
        <div class="space-y-1">
          <Button
            v-for="staticParent in staticMainMenuItems.filter(
              (i) => i.isTrigger,
            )"
            :key="staticParent.slug"
            @click="selectParent(staticParent)"
            variant="ghost"
            class="w-full justify-start text-base h-auto py-2 text-left"
            :class="{
              'bg-accent text-accent-foreground font-semibold':
                selectedParent?.slug === staticParent.slug,
            }"
          >
            <span class="flex-1">{{ staticParent.title }}</span>
          </Button>
        </div>
      </aside>

      <!-- Правая колонка: форма с рекурсивным редактором -->
      <main class="lg:col-span-3">
        <div
          v-if="selectedParent"
          class="bg-card p-6 rounded-lg shadow-md space-y-4"
        >
          <h2 class="text-xl font-bold">
            Редактирование подменю для:
            <span class="text-primary">{{ selectedParent.title }}</span>
          </h2>

          <div
            v-if="formTree.length === 0"
            class="text-muted-foreground text-center py-5 border-dashed border-2 rounded-md"
          >
            Нет подпунктов. Нажмите кнопку ниже, чтобы добавить.
          </div>

          <!-- Начало рекурсии: передаем каждый элемент 2-го уровня (из formTree) в рекурсивный компонент -->
          <div
            v-for="(itemL2, index) in formTree"
            :key="itemL2.id || itemL2._tempId!"
          >
            <RecursiveMenuItemFormNode
              :item="itemL2"
              :level="0"
              :parent-href="selectedParent.href || ''"
              @add-child="handleAddChild"
              @remove-self="formTree.splice(index, 1)"
            />
          </div>

          <!-- Кнопка для добавления нового элемента 2-го уровня -->
          <div class="pt-4 border-t">
            <Button
              @click="addTopLevelNode"
              variant="outline"
              class="w-full border-dashed"
            >
              <Icon name="lucide:plus" class="mr-2" /> Добавить пункт в "{{
                selectedParent.title
              }}" (Уровень 2)
            </Button>
          </div>
        </div>
        <div
          v-else
          class="flex items-center justify-center h-64 bg-card rounded-lg text-muted-foreground shadow-md"
        >
          <p>Выберите раздел слева для редактирования его содержимого.</p>
        </div>
      </main>
    </div>
  </div>
</template>
