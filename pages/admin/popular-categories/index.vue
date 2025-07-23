<script setup lang="ts">
import { useMenuAdminStore } from '@/stores/menuItems/useTopMenuItems';
import type { MenuItemRow } from '@/types';
import { ref, onMounted } from 'vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

definePageMeta({ layout: 'admin' });

const menuAdminStore = useMenuAdminStore();
const isSaving = ref(false);

// Локальные копии для управления UI
const available = ref<MenuItemRow[]>([]);
const featured = ref<MenuItemRow[]>([]);

// ID, выбранные в каждом из списков
const selectedAvailable = ref<string[]>([]);
const selectedFeatured = ref<string[]>([]);

// Загружаем данные и инициализируем локальные списки
onMounted(async () => {
  await menuAdminStore.fetchItemsAndSeparate();
  // Вычисляем начальный список доступных
  updateLocalList()
});

function updateLocalList () {
  const featuredIds = new Set(menuAdminStore.featuredItems.map(i => i.id));
  available.value = menuAdminStore.allItems.filter(item => !featuredIds.has(item.id));
  featured.value = [...menuAdminStore.featuredItems]; // Создаем копию
  console.log('Локальные списки обновлены!');
}

// Функции для выбора элементов в списках
function toggleSelection(list: 'available' | 'featured', id: string) {
  const selectionRef = list === 'available' ? selectedAvailable : selectedFeatured;
  const index = selectionRef.value.indexOf(id);
  if (index > -1) {
    selectionRef.value.splice(index, 1);
  } else {
    selectionRef.value.push(id);
  }
}

// Функции для перемещения
function moveToFeatured() {
  const toMove = available.value.filter(item => selectedAvailable.value.includes(item.id));
  featured.value.push(...toMove);
  available.value = available.value.filter(item => !selectedAvailable.value.includes(item.id));
  selectedAvailable.value = [];
}

function moveToAvailable() {
  const toMove = featured.value.filter(item => selectedFeatured.value.includes(item.id));
  available.value.push(...toMove);
  featured.value = featured.value.filter(item => !selectedFeatured.value.includes(item.id));
  selectedFeatured.value = [];
}

async function saveChanges() {
  isSaving.value = true;
  const featuredIds = featured.value.map(item => item.id);
  const success = await menuAdminStore.saveFeaturedList(featuredIds);
  if (success) {
    updateLocalList()
  }
  isSaving.value = false;
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8">
    <div class="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
      <h1 class="text-3xl font-bold text-foreground">
        Управление популярными категориями
      </h1>
      <Button @click="saveChanges" :disabled="isSaving">
        Сохранить список
      </Button>
    </div>

    <div v-if="menuAdminStore.isLoading" class="text-center py-20">Загрузка...</div>
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
      
      <!-- Левая колонка: Доступные категории -->
      <Card>
        <CardHeader>
          <CardTitle>Доступные категории</CardTitle>
        </CardHeader>
        <CardContent class="h-96 overflow-y-auto space-y-1">
          <div
            v-for="item in available"
            :key="item.id"
            @click="toggleSelection('available', item.id)"
            class="p-2 rounded-md cursor-pointer border transition-colors"
            :class="selectedAvailable.includes(item.id) ? 'bg-primary/20 border-primary' : 'hover:bg-muted/50'"
          >
            {{ item.title }}
            <span v-if="!item.image_url" class="text-xs text-destructive ml-2">(нет фото)</span>
          </div>
        </CardContent>
      </Card>

      <!-- Правая колонка: Популярные категории -->
      <Card>
        <CardHeader class="flex flex-row items-center justify-between">
          <CardTitle>Популярные на главной</CardTitle>
          <div class="flex gap-2">
            <Button variant="outline" size="icon" @click="moveToFeatured" :disabled="selectedAvailable.length === 0">
            </Button>
            <Button variant="outline" size="icon" @click="moveToAvailable" :disabled="selectedFeatured.length === 0">
            </Button>
          </div>
        </CardHeader>
        <CardContent class="h-96 overflow-y-auto space-y-1">
          <div
            v-for="item in featured"
            :key="item.id"
            @click="toggleSelection('featured', item.id)"
            class="p-2 rounded-md cursor-pointer border transition-colors"
            :class="selectedFeatured.includes(item.id) ? 'bg-primary/20 border-primary' : 'hover:bg-muted/50'"
          >
            {{ item.title }}
          </div>
        </CardContent>
      </Card>

    </div>
  </div>
</template>