<script setup lang="ts">
import type { ChildrenInsert, ChildrenRow, ChildrenUpdate } from '@/types'
import { toast } from 'vue-sonner'
import { useChildrenStore } from '@/stores/publicStore/childrenStore'

definePageMeta({
  layout: 'profile',
})
const childrenStore = useChildrenStore()
const { children, isLoading } = storeToRefs(childrenStore)

useAsyncData('children-list', () => childrenStore.fetchChildren())

const isDialogOpen = ref(false)
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

async function handleDeleteConfirm() {
  if (!childToDelete.value)
    return
  await childrenStore.deleteChild(childToDelete.value.id)
  toast.success(`Данные о ребенке "${childToDelete.value.name}" удалены.`)
  childToDelete.value = null // Сбрасываем состояние
}
// --- Обработка отправки формы ---
async function handleSubmit() {
  if (editingChild.value) {
    // Режим редактирования
    const payload: ChildrenUpdate = { ...formData.value }
    await childrenStore.updateChild(editingChild.value.id, payload)
  }
  else {
    // Режим создания
    const payload: ChildrenInsert = { ...formData.value }
    await childrenStore.addChild(payload)
  }
  isDialogOpen.value = false
}

// --- Вспомогательные функции ---
function calculateAge(birthDate: string): number {
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
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

    <div v-if="isLoading && children.length === 0" class="text-center py-10">
      <p>Загрузка данных...</p>
    </div>
    <div v-else-if="children.length === 0" class="text-center py-20 border-2 border-dashed rounded-lg">
      <h2 class="text-xl font-semibold">
        У вас пока нет добавленных детей
      </h2>
      <p class="text-muted-foreground mt-2">
        Добавьте информацию, чтобы мы могли делать для вас персональные подборки.
      </p>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card
        v-for="child in children"
        :key="child.id"
        class="overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-300"
      >
        <!-- Горизонтальная карточка как удостоверение -->
        <div class="flex items-stretch min-h-[280px]">
          <!-- Левая часть: информация -->
          <div class="flex-1 flex flex-col p-6">
            <div class="flex-grow space-y-4">
              <div class="space-y-1">
                <p class="text-sm text-muted-foreground font-medium uppercase tracking-wide">
                  Имя ребенка
                </p>
                <CardTitle class="text-3xl font-bold">
                  {{ child.name }}
                </CardTitle>
              </div>

              <div class="space-y-3 pt-2">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-muted-foreground font-medium w-24">Пол:</span>
                  <Badge variant="secondary" class="text-sm px-3 py-1">
                    {{ child.gender === 'male' ? 'Мальчик' : 'Девочка' }}
                  </Badge>
                </div>

                <div class="flex items-center gap-2">
                  <span class="text-sm text-muted-foreground font-medium w-24">Возраст:</span>
                  <Badge variant="outline" class="text-sm px-3 py-1">
                    {{ calculateAge(child.birth_date) }} лет
                  </Badge>
                </div>

                <div class="flex items-center gap-2">
                  <span class="text-sm text-muted-foreground font-medium w-24">Дата рожд.:</span>
                  <span class="text-sm">{{ new Date(child.birth_date).toLocaleDateString('ru-RU') }}</span>
                </div>
              </div>
            </div>

            <!-- Кнопки -->
            <div class="flex gap-2 mt-6 pt-4 border-t">
              <Button variant="outline" class="flex-1" size="sm" @click="openForEdit(child)">
                Изменить
              </Button>
              <AlertDialog>
                <AlertDialogTrigger as-child>
                  <Button variant="destructive" class="flex-1" size="sm" @click="childToDelete = child">
                    Удалить
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Это действие необратимо. Все данные о ребенке "{{ child.name }}" будут удалены.
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
          </div>

          <!-- Правая часть: большая иконка -->
          <div class="w-48 bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center border-l">
            <Icon
              :name="child.gender === 'male' ? 'fluent-emoji-flat:boy' : 'fluent-emoji-flat:girl'"
              class="w-32 h-32"
            />
          </div>
        </div>
      </Card>
    </div>
    <!-- Диалоговое окно для формы -->
    <Dialog v-model:open="isDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ editingChild ? 'Редактировать данные' : 'Добавить ребенка' }}</DialogTitle>
          <DialogDescription>
            Эта информация поможет нам рекомендовать вам наиболее подходящие товары.
          </DialogDescription>
        </DialogHeader>
        <form class="space-y-4 py-4" @submit.prevent="handleSubmit">
          <div>
            <Label for="name">Имя</Label>
            <Input id="name" v-model="formData.name" required />
          </div>
          <div>
            <Label for="gender">Пол</Label>
            <Select v-model="formData.gender">
              <SelectTrigger>
                <SelectValue placeholder="Выберите пол" />
              </SelectTrigger>
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
          <DialogFooter>
            <Button type="button" variant="ghost" @click="isDialogOpen = false">
              Отмена
            </Button>
            <Button type="submit" :disabled="isLoading">
              {{ isLoading ? 'Сохранение...' : 'Сохранить' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
