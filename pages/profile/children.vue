<script setup lang="ts">
import type { ChildrenInsert, ChildrenRow, ChildrenUpdate } from '@/types'
import { ChevronRight, PlusCircle } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useChildrenStore } from '@/stores/publicStore/childrenStore'

definePageMeta({
  layout: 'profile',
})

const childrenStore = useChildrenStore()
const { children, isLoading } = storeToRefs(childrenStore)

useAsyncData('children-list', () => childrenStore.fetchChildren(), {
  server: false,
})

const isDialogOpen = ref(false)
const isDeleteConfirmOpen = ref(false)
const childToDelete = ref<ChildrenRow | null>(null)
const editingChild = ref<ChildrenRow | null>(null)
const showCards = ref(false)

const formData = ref<{ name: string, gender: 'male' | 'female', birth_date: string }>({
  name: '',
  gender: 'male',
  birth_date: '',
})

// Показываем карточки с небольшой задержкой для анимации
watch(children, () => {
  if (children.value.length > 0) {
    setTimeout(() => {
      showCards.value = true
    }, 100)
  }
}, { immediate: true })

function openForNew() {
  editingChild.value = null
  formData.value = { name: '', gender: 'male', birth_date: '' }
  nextTick(() => {
    isDialogOpen.value = true
  })
}

function openForEdit(child: ChildrenRow) {
  editingChild.value = child
  formData.value = {
    name: child.name,
    gender: child.gender as 'male' | 'female',
    birth_date: new Date(child.birth_date).toISOString().split('T')[0] ?? '',
  }
  nextTick(() => {
    isDialogOpen.value = true
  })
}

function triggerDeleteConfirmation() {
  if (!editingChild.value)
    return
  childToDelete.value = editingChild.value
  isDialogOpen.value = false
  nextTick(() => {
    isDeleteConfirmOpen.value = true
  })
}

async function handleDeleteConfirm() {
  if (!childToDelete.value)
    return
  await childrenStore.deleteChild(childToDelete.value.id)
  toast.success(`Данные о ребенке "${childToDelete.value.name}" удалены.`)
  childToDelete.value = null
  isDeleteConfirmOpen.value = false
}

async function handleSubmit() {
  if (editingChild.value) {
    const payload: ChildrenUpdate = { ...formData.value }
    await childrenStore.updateChild(editingChild.value.id, payload)
    toast.success('Данные успешно обновлены!')
  }
  else {
    const payload: ChildrenInsert = { ...formData.value }
    await childrenStore.addChild(payload)
    toast.success('Ребенок успешно добавлен!')
  }
  isDialogOpen.value = false
}

function formatAge(birthDate: string): string {
  const today = new Date()
  const birth = new Date(birthDate)
  let ageYears = today.getFullYear() - birth.getFullYear()
  let ageMonths = today.getMonth() - birth.getMonth()

  if (today.getDate() < birth.getDate())
    ageMonths--

  if (ageMonths < 0) {
    ageYears--
    ageMonths += 12
  }

  if (ageYears > 0) {
    const yearsStr = (ageYears % 10 === 1 && ageYears % 100 !== 11) ? 'год' : (ageYears % 10 >= 2 && ageYears % 10 <= 4 && (ageYears % 100 < 10 || ageYears % 100 >= 20)) ? 'года' : 'лет'
    return `${ageYears} ${yearsStr}`
  }
  else {
    if (ageMonths === 0)
      return 'Меньше месяца'
    const monthsStr = (ageMonths % 10 === 1 && ageMonths % 100 !== 11) ? 'месяц' : (ageMonths % 10 >= 2 && ageMonths % 10 <= 4 && (ageMonths % 100 < 10 || ageMonths % 100 >= 20)) ? 'месяца' : 'месяцев'
    return `${ageMonths} ${monthsStr}`
  }
}
const nameInputClass = computed(() => {
  // Если мы добавляем нового ребенка, не применяем никаких кастомных классов
  if (!editingChild.value) {
    return ''
  }

  // Если редактируем мальчика, возвращаем классы для СВЕТЛО-ГОЛУБОГО ФОНА
  if (formData.value.gender === 'male') {
    // bg-sky-50 - очень светлый голубой для светлой темы
    // dark:bg-sky-950 - очень темный голубой (почти черный) для темной темы
    return 'bg-sky-50 dark:bg-sky-950'
  }

  // Если редактируем девочку, возвращаем классы для СВЕТЛО-РОЗОВОГО ФОНА
  if (formData.value.gender === 'female') {
    // bg-pink-50 - очень светлый розовый для светлой темы
    // dark:bg-pink-950 - очень темный розовый для темной темы
    return 'bg-pink-50 dark:bg-pink-950'
  }

  // На всякий случай, если пол не определен
  return ''
})
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <!-- Заголовок с градиентом -->
    <div class="mb-8">
      <div class="flex items-center justify-between mb-2">
        <h1 class="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          Мои дети
        </h1>
        <Button
          class="shadow-sm hover:shadow-md transition-shadow"
          @click="openForNew"
        >
          <PlusCircle class="w-4 h-4 mr-2" />
          Добавить
        </Button>
      </div>
      <p class="text-muted-foreground text-sm">
        Управляйте информацией о детях для персонализированных рекомендаций
      </p>
    </div>

    <!-- Состояние загрузки -->
    <div v-if="isLoading && children.length === 0" class="text-center py-16">
      <div class="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-muted/50">
        <div class="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p class="text-muted-foreground font-medium">
          Загрузка данных...
        </p>
      </div>
    </div>

    <!-- Пустое состояние -->
    <Card v-else-if="children.length === 0" class="border-dashed border-2">
      <div class="text-center py-16 px-6">
        <div class="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10">
          <Icon name="fluent-emoji-flat:family" class="text-5xl" />
        </div>
        <h2 class="text-2xl font-bold mb-3">
          У вас пока нет детей в списке
        </h2>
        <p class="text-muted-foreground mb-6 max-w-md mx-auto">
          Добавьте информацию о детях, чтобы получать персонализированные рекомендации товаров и услуг
        </p>
        <Button size="lg" class="shadow-sm" @click="openForNew">
          <PlusCircle class="w-5 h-5 mr-2" />
          Добавить первого ребенка
        </Button>
      </div>
    </Card>

    <!-- Список детей -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card
        v-for="(child, index) in children"
        :key="child.id"
        class="child-card cursor-pointer overflow-hidden p-0 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
        :style="{ animationDelay: `${index * 100}ms` }"
        :class="{ 'animate-fade-in': showCards }"
        @click="openForEdit(child)"
      >
        <div class="p-5 sm:p-6 relative">
          <!-- Тонкий цветной оверлей -->
          <div
            class="color-overlay absolute inset-0 opacity-0 pointer-events-none transition-opacity duration-300"
            :class="child.gender === 'male' ? 'bg-blue-500/8' : 'bg-pink-500/8'"
          />

          <div class="flex items-center gap-4 relative z-10">
            <!-- Аватар -->
            <div class="relative">
              <div
                class="child-avatar flex items-center justify-center w-16 h-16 rounded-2xl ring-2 ring-offset-2 ring-offset-background transition-transform duration-300"
                :class="child.gender === 'male'
                  ? 'bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 ring-blue-500/20'
                  : 'bg-gradient-to-br from-pink-100 to-pink-200 dark:from-pink-900 dark:to-pink-800 ring-pink-500/20'"
              >
                <Icon
                  :name="child.gender === 'male' ? 'fluent-emoji-flat:boy' : 'fluent-emoji-flat:girl'"
                  class="text-5xl"
                />
              </div>
            </div>

            <!-- Информация -->
            <div class="flex-grow min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-bold text-lg text-card-foreground truncate">
                  {{ child.name }}
                </h3>
                <span
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  :class="child.gender === 'male'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    : 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300'"
                >
                  {{ child.gender === 'male' ? 'Мальчик' : 'Девочка' }}
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <div class="flex items-center gap-1.5">
                  <Icon name="mdi:cake-variant" class="text-base" />
                  <span class="font-medium">{{ formatAge(child.birth_date) }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <Icon name="mdi:calendar" class="text-base" />
                  <span>{{ new Date(child.birth_date).toLocaleDateString('ru-RU') }}</span>
                </div>
              </div>
            </div>

            <!-- Кнопка -->
            <div class="flex-shrink-0">
              <div class="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
                <ChevronRight class="chevron-icon w-5 h-5 text-muted-foreground transition-transform duration-300" />
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>

    <!-- Диалог добавления/редактирования -->
    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="sm:max-w-[500px]" @open-auto-focus.prevent>
        <DialogHeader>
          <DialogTitle class="text-2xl">
            {{ editingChild ? 'Редактировать данные' : 'Добавить ребенка' }}
          </DialogTitle>
          <DialogDescription class="text-base">
            Эта информация поможет нам рекомендовать вам наиболее подходящие товары.
          </DialogDescription>
        </DialogHeader>
        <form class="space-y-5 py-4" @submit.prevent="handleSubmit">
          <div class="space-y-2">
            <Label for="name" class="text-base font-medium">Имя ребенка</Label>
            <Input
              id="name"
              v-model="formData.name"
              placeholder="Введите имя"
              class="h-11"
              :class="nameInputClass"
              required
            />
          </div>

          <div class="space-y-2">
            <Label for="gender" class="text-base font-medium">Пол</Label>
            <Select v-model="formData.gender">
              <SelectTrigger class="h-11">
                <SelectValue placeholder="Выберите пол" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">
                  <div class="flex items-center gap-2">
                    <Icon name="fluent-emoji-flat:boy" class="text-xl" />
                    <span>Мальчик</span>
                  </div>
                </SelectItem>
                <SelectItem value="female">
                  <div class="flex items-center gap-2">
                    <Icon name="fluent-emoji-flat:girl" class="text-xl" />
                    <span>Девочка</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label for="birth_date" class="text-base font-medium">Дата рождения</Label>
            <Input
              id="birth_date"
              v-model="formData.birth_date"
              type="date"
              class="h-11"
              required
            />
          </div>

          <DialogFooter class="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-4 border-t">
            <div>
              <Button
                v-if="editingChild"
                type="button"
                variant="destructive"
                size="lg"
                @click="triggerDeleteConfirmation"
              >
                <Icon name="mdi:delete" class="w-4 h-4 mr-2" />
                Удалить
              </Button>
            </div>
            <div class="flex gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                size="lg"
                class="flex-1 sm:flex-initial"
                @click="isDialogOpen = false"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                size="lg"
                class="flex-1 sm:flex-initial"
                :disabled="isLoading"
              >
                <Icon v-if="!isLoading" name="mdi:check" class="w-4 h-4 mr-2" />
                {{ isLoading ? 'Сохранение...' : 'Сохранить' }}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- Диалог подтверждения удаления -->
    <AlertDialog v-model:open="isDeleteConfirmOpen">
      <AlertDialogContent @open-auto-focus.prevent>
        <AlertDialogHeader>
          <div class="mx-auto mb-4 w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <Icon name="mdi:alert-circle" class="w-8 h-8 text-destructive" />
          </div>
          <AlertDialogTitle class="text-center text-xl">
            Вы уверены?
          </AlertDialogTitle>
          <AlertDialogDescription class="text-center text-base">
            Это действие необратимо. Все данные о ребенке <strong>"{{ childToDelete?.name }}"</strong> будут удалены безвозвратно.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter class="flex-col-reverse sm:flex-row gap-2">
          <AlertDialogCancel
            class="w-full sm:w-auto"
            @click="childToDelete = null"
          >
            Отмена
          </AlertDialogCancel>
          <AlertDialogAction
            class="w-full sm:w-auto bg-destructive hover:bg-destructive/90"
            @click="handleDeleteConfirm"
          >
            Да, удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<style scoped>
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.5s ease-out forwards;
  opacity: 0;
}

.child-card:hover .child-avatar {
  transform: scale(1.1) rotate(5deg);
}

.child-card:hover .chevron-icon {
  transform: translateX(5px);
}

.child-card:hover .color-overlay {
  opacity: 1;
}

.child-card:active {
  transform: scale(0.98) !important;
}
</style>
