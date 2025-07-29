<script setup lang="ts">
import { useProfileStore } from '@/stores/profile';
import { Loader2 } from 'lucide-vue-next';

definePageMeta({
  layout: "profile",
});

const firstName = computed({
  // `get` срабатывает, когда Input читает значение
  get() {
    // Если в сторе `null` или `undefined`, возвращаем пустую строку для Input'а
    return editProfile.value?.first_name ?? '';
  },
  // `set` срабатывает, когда пользователь вводит текст в Input
  set(value: string) {
    if (editProfile.value) {
      // Если пользователь стер текст, сохраняем `null` в стор, иначе - саму строку.
      editProfile.value.first_name = value || null;
    }
  }
});

const lastName = computed({
  get() {
    return editProfile.value?.last_name ?? '';
  },
  set(value: string) {
    if (editProfile.value) {
      editProfile.value.last_name = value || null;
    }
  }
});

const phone = computed({
  get() {
    return editProfile.value?.phone ?? '';
  },
  set(value: string) {
    if (editProfile.value) {
      editProfile.value.phone = value || null;
    }
  }
});

const profileStore = useProfileStore();

// Используем storeToRefs для удобного доступа к реактивным переменным
const { editProfile, isSaving, isLoading } = storeToRefs(profileStore);

// Адаптированная и более безопасная функция обновления
async function handleUpdate() {
  if (!editProfile.value) {
    console.error("Попытка сохранить пустой профиль.");
    return;
  }
  
  const updates = {
    first_name: editProfile.value.first_name,
    last_name: editProfile.value.last_name,
    phone: editProfile.value.phone,
  };

  await profileStore.updateProfile(updates);
}
</script>

<template>
  <div>
    <!-- Используем Card для красивой обертки -->
    <Card class="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle class="text-2xl">Настройка профиля</CardTitle>
        <CardDescription>
          Здесь вы можете обновить информацию о себе.
        </CardDescription>
      </CardHeader>
      <CardContent>

        <!-- === Состояние загрузки с использованием Skeleton === -->
        <div v-if="isLoading" class="space-y-6">
          <div class="space-y-2">
            <Skeleton class="h-4 w-24" />
            <Skeleton class="h-10 w-full" />
          </div>
          <div class="space-y-2">
            <Skeleton class="h-4 w-24" />
            <Skeleton class="h-10 w-full" />
          </div>
          <div class="space-y-2">
            <Skeleton class="h-4 w-24" />
            <Skeleton class="h-10 w-full" />
          </div>
          <Skeleton class="h-10 w-32 mt-4" />
        </div>

        <!-- === Форма редактирования (показывается после загрузки) === -->
        <form v-else-if="editProfile" class="space-y-6" @submit.prevent="handleUpdate">
          
          <!-- Поле "Имя" -->
          <div class="grid w-full items-center gap-1.5">
            <Label for="first_name">Имя</Label>
            <Input
              id="first_name"
              v-model="firstName"
              type="text"
              placeholder="Иван"
            />
          </div>
          
          <!-- Поле "Фамилия" -->
          <div class="grid w-full items-center gap-1.5">
            <Label for="last_name">Фамилия</Label>
            <Input
              id="last_name"
              v-model="lastName"
              type="text"
              placeholder="Петров"
            />
          </div>

          <!-- Поле "Телефон" -->
          <div class="grid w-full items-center gap-1.5">
            <Label for="phone">Телефон</Label>
            <Input
              id="phone"
              type="tel"
              v-model="phone"
              placeholder="+7 (777) 123-45-67"
            />
          </div>

          <!-- Кнопка "Сохранить" с состоянием загрузки -->
          <Button type="submit" :disabled="isSaving" class="w-full sm:w-auto">
            <Loader2 v-if="isSaving" class="mr-2 h-4 w-4 animate-spin" />
            {{ isSaving ? "Сохранение..." : "Сохранить изменения" }}
          </Button>

        </form>
        
        <!-- === Сообщение об ошибке загрузки === -->
        <div v-else class="text-center py-10">
          <p class="text-muted-foreground">Не удалось загрузить данные профиля.</p>
          <Button variant="outline" class="mt-4" @click="profileStore.loadProfile()">
            Попробовать снова
          </Button>
        </div>

      </CardContent>
    </Card>
  </div>
</template>