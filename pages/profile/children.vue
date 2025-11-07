<script setup lang="ts">
import type { ChildrenInsert, ChildrenRow, ChildrenUpdate } from '@/types'
import { ChevronRight } from 'lucide-vue-next'
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

const formData = ref<{ name: string, gender: 'male' | 'female', birth_date: string }>({
  name: '',
  gender: 'male',
  birth_date: '',
})

function openForNew() {
  editingChild.value = null
  formData.value = { name: '', gender: 'male', birth_date: '' }
  isDialogOpen.value = true
}

function openForEdit(child: ChildrenRow) {
  editingChild.value = child
  formData.value = {
    name: child.name,
    gender: child.gender as 'male' | 'female',
    birth_date: new Date(child.birth_date).toISOString().split('T')[0] ?? '',
  }
  isDialogOpen.value = true
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
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">
        Мои дети
      </h1>
      <Button @click="openForNew">
        <PlusCircle class="w-4 h-4 mr-2" />
        Добавить ребенка
      </Button>
    </div>

    <!-- Состояния загрузки и пустого списка -->
    <div v-if="isLoading && children.length === 0" class="text-center py-10">
      <p>Загрузка данных...</p>
    </div>
    <div v-else-if="children.length === 0" class="text-center py-20 border-2 border-dashed rounded-lg bg-muted/20">
      <h2 class="text-xl font-semibold">
        У вас пока нет добавленных детей
      </h2>
      <p class="text-muted-foreground mt-2">
        Добавьте информацию, чтобы мы могли делать для вас персональные подборки.
      </p>
    </div>

    <!-- НОВЫЙ УНИКАЛЬНЫЙ ДИЗАЙН СПИСКА -->
    <Card v-else>
      <div class="p-2 sm:p-4">
        <div
          v-for="(child) in children"
          :key="child.id"
          class="flex items-center gap-4 p-3 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
          @click="openForEdit(child)"
        >
          <!-- Аватар с цветным фоном -->
          <div
            class="flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0"
            :class="child.gender === 'male' ? 'bg-blue-100 dark:bg-blue-900' : 'bg-pink-100 dark:bg-pink-900'"
          >
            <Icon
              :name="child.gender === 'male' ? 'fluent-emoji-flat:boy' : 'fluent-emoji-flat:girl'"
              class="text-4xl"
            />
          </div>

          <!-- Основная информация -->
          <div class="flex-grow">
            <p class="font-semibold text-card-foreground">
              {{ child.name }}
            </p>
            <p class="text-sm text-muted-foreground">
              {{ formatAge(child.birth_date) }} • {{ new Date(child.birth_date).toLocaleDateString('ru-RU') }}
            </p>
          </div>

          <!-- Иконка-индикатор -->
          <ChevronRight class="w-5 h-5 text-muted-foreground ml-auto flex-shrink-0" />
        </div>
      </div>
    </Card>

    <!-- Диалоговые окна (без изменений в структуре) -->
    <Dialog v-model:open="isDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ editingChild ? 'Редактировать данные' : 'Добавить ребенка' }}</DialogTitle>
          <DialogDescription>
            Эта информация поможет нам рекомендовать вам наиболее подходящие товары.
          </DialogDescription>
        </DialogHeader>
        <form class="space-y-4 py-4" @submit.prevent="handleSubmit">
          <!-- Поля формы -->
          <div>
            <Label for="name">Имя</Label>
            <Input id="name" v-model="formData.name" required />
          </div>
          <div>
            <Label for="gender">Пол</Label>
            <Select v-model="formData.gender">
              <SelectTrigger><SelectValue placeholder="Выберите пол" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">
                  Мальчик
                </SelectItem>
                <SelectItem value="female">
                  Девочка
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label for="birth_date">Дата рождения</Label>
            <Input id="birth_date" v-model="formData.birth_date" type="date" required />
          </div>

          <!-- Футер формы -->
          <DialogFooter class="flex justify-between items-center sm:justify-between w-full pt-4">
            <div>
              <Button v-if="editingChild" type="button" variant="destructive" @click="triggerDeleteConfirmation">
                Удалить
              </Button>
            </div>
            <div class="flex gap-2">
              <Button type="button" variant="ghost" @click="isDialogOpen = false">
                Отмена
              </Button>
              <Button type="submit" :disabled="isLoading">
                {{ isLoading ? 'Сохранение...' : 'Сохранить' }}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog v-model:open="isDeleteConfirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
          <AlertDialogDescription>
            Это действие необратимо. Все данные о ребенке "{{ childToDelete?.name }}" будут удалены.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="childToDelete = null">
            Отмена
          </AlertDialogCancel>
          <AlertDialogAction @click="handleDeleteConfirm">
            Да, удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
