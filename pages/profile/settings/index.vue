<script setup lang="ts">
import type { ProfileUpdate } from '@/types'
import { Loader2 } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, toRaw, watch } from 'vue'

import { toast } from 'vue-sonner'

import TelegramLinkButton from '@/components/profile/TelegramLinkButton.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfileStore } from '@/stores/core/profileStore'

// --- Метаданные страницы ---
definePageMeta({
  layout: 'profile', // Используем специальный layout для личного кабинета
})
useHead({ title: 'Редактирование профиля' })

// --- Инициализация сторов ---
const profileStore = useProfileStore()
// `profile` - это "чистовик" из стора, наш источник правды.
// `isSaving`, `isLoading` - флаги для управления состоянием UI.
const { profile, isSaving, isLoading } = storeToRefs(profileStore)

// `editForm` - это "черновик", локальная копия данных профиля для редактирования.
const editForm = ref<ProfileUpdate>({
  first_name: '',
  last_name: '',
  phone: '',
})

// --- Логика формы ---

/**
 * Сбрасывает форму-черновик (`editForm`), копируя в нее свежие данные из стора (`profile`).
 */
function resetForm() {
  if (profile.value) {
    editForm.value = {
      first_name: profile.value.first_name,
      last_name: profile.value.last_name,
      phone: profile.value.phone,
    }
  }
}

// `watch` следит за "чистовиком" (`profile`). Если он меняется (например, после
// первоначальной загрузки или после успешного сохранения), мы немедленно
// обновляем наш "черновик" (`editForm`), чтобы они были синхронизированы.
watch(profile, resetForm, {
  immediate: true,
  deep: true,
})

/**
 * Инициируем загрузку профиля при монтировании компонента, если его еще нет.
 */
onMounted(() => {
  // `onAuthStateChange` в `authStore` уже вызывает `loadProfile`,
  // но этот вызов является дополнительной подстраховкой.
  // ✅ ИСПРАВЛЕНО: Ждем создания профиля для новых пользователей
  if (!profile.value) {
    profileStore.loadProfile(false, true)
  }
})

// --- Адаптеры v-model ---
// Эти computed-свойства служат "переводчиками" между `editForm` (где может быть `null`)
// и компонентами `<Input>` (которые не принимают `null`).
const firstName = computed({
  get: () => editForm.value.first_name ?? '',
  set: (value: string) => { editForm.value.first_name = value || null },
})
const lastName = computed({
  get: () => editForm.value.last_name ?? '',
  set: (value: string) => { editForm.value.last_name = value || null },
})
const phone = computed({
  get: () => editForm.value.phone ?? '',
  set: (value: string) => { editForm.value.phone = value || null },
})

/**
 * Вычисляемое свойство, которое проверяет, были ли внесены изменения в форму.
 * Используется для блокировки/разблокировки кнопки "Сохранить".
 */
const hasChanges = computed(() => {
  if (!profile.value)
    return false
  return (
    editForm.value.first_name !== profile.value.first_name
    || editForm.value.last_name !== profile.value.last_name
    || editForm.value.phone !== profile.value.phone
  )
})

/**
 * Вызывается при отправке формы.
 */
async function handleUpdate() {
  if (!hasChanges.value) {
    toast.info('Нет изменений для сохранения.')
    return
  }
  await profileStore.updateProfile(toRaw(editForm.value))
}
</script>

<template>
  <div>
    <Card class="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle class="text-2xl">
          Настройка профиля
        </CardTitle>
        <CardDescription>Здесь вы можете обновить информацию о себе.</CardDescription>
      </CardHeader>
      <CardContent>
        <!--
          Оборачиваем всю динамическую часть в <ClientOnly>,
          чтобы избежать ошибок гидратации.
        -->
        <ClientOnly>
          <!-- Состояние 1: Загрузка данных -->
          <div v-if="isLoading && !profile" class="space-y-6">
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
            <Skeleton class="h-10 w-48 mt-4" />
          </div>

          <!-- Состояние 2: Данные загружены, показываем форму -->
          <form v-else-if="profile" class="space-y-6" @submit.prevent="handleUpdate">
            <div class="grid w-full items-center gap-1.5">
              <Label for="first_name">Имя</Label>
              <Input id="first_name" v-model="firstName" type="text" placeholder="Иван" />
            </div>
            <div class="grid w-full items-center gap-1.5">
              <Label for="last_name">Фамилия</Label>
              <Input id="last_name" v-model="lastName" type="text" placeholder="Петров" />
            </div>
            <div class="grid w-full items-center gap-1.5">
              <Label for="phone">Телефон</Label>
              <Input id="phone" v-model="phone" type="tel" placeholder="+7 (777) 123-45-67" />
            </div>
            <div class="flex flex-col sm:flex-row gap-4 pt-4">
              <Button type="submit" :disabled="isSaving || !hasChanges" class="w-full sm:w-auto">
                <Loader2 v-if="isSaving" class="mr-2 h-4 w-4 animate-spin" />
                {{ isSaving ? "Сохранение..." : "Сохранить изменения" }}
              </Button>
              <Button type="button" variant="ghost" :disabled="isSaving" @click="resetForm">
                Отменить
              </Button>
            </div>

            <Separator class="my-2" />

            <TelegramLinkButton />
          </form>

          <!-- Состояние 3: Ошибка загрузки -->
          <div v-else class="text-center py-10">
            <p class="text-muted-foreground">
              Не удалось загрузить данные профиля.
            </p>
            <Button variant="outline" class="mt-4" @click="profileStore.loadProfile(true, true)">
              Попробовать снова
            </Button>
          </div>

          <!--
            Заглушка для серверного рендеринга.
            Она должна совпадать с начальным состоянием загрузки (Состояние 1).
          -->
          <template #fallback>
            <div class="space-y-6">
              <div class="space-y-2">
                <Skeleton class="h-4 w-24" />
                <Skeleton class="h-10 w-full" />
              </div>
              <div class="space-y-2">
                <Skeleton class="h-4 w-24" />
                <Skeleton class="h-10 w-full" />
              </div>
            </div>
          </template>
        </ClientOnly>
      </CardContent>
    </Card>
  </div>
</template>
