<script setup lang="ts">
import type { ChildrenInsert, ChildrenRow, ChildrenUpdate } from '@/types'
import { toast } from 'vue-sonner'
import { useChildrenStore } from '@/stores/publicStore/childrenStore'

definePageMeta({
  layout: 'profile',
  profileBare: true, // страница рисует собственные карточки, обёртка layout не нужна
})

useHead({
  title: 'Мои дети',
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

const GENDERS = [
  { value: 'female', label: 'Девочка', icon: 'fluent-emoji-flat:girl' },
  { value: 'male', label: 'Мальчик', icon: 'fluent-emoji-flat:boy' },
] as const

function openForNew() {
  editingChild.value = null
  formData.value = { name: '', gender: 'female', birth_date: '' }
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
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <!-- Шапка раздела -->
    <div
      class="rounded-[clamp(18px,2vw,22px)] border border-border bg-white p-[clamp(16px,2.2vw,24px)] shadow-sm"
    >
      <div class="flex flex-wrap items-start justify-between gap-3.5">
        <div>
          <h1 class="mb-[5px] text-[clamp(24px,2.8vw,30px)] font-extrabold tracking-[-0.025em]">
            Мои дети
          </h1>
          <p class="max-w-[520px] text-sm font-medium text-muted-foreground">
            Управляйте информацией о детях для персонализированных рекомендаций
          </p>
        </div>
        <button type="button" class="ch-add-btn bg-gradient-to-br from-blue-400 to-blue-600" @click="openForNew">
          <Icon name="lucide:plus" class="size-[19px]" />
          Добавить
        </button>
      </div>
    </div>

    <ClientOnly>
      <!-- Скелетон: та же сетка, чтобы высота не прыгала -->
      <div v-if="isLoading && children.length === 0" class="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div
          v-for="i in 2"
          :key="i"
          class="flex animate-pulse items-center gap-4 rounded-[20px] border border-border bg-white p-[18px] shadow-sm"
        >
          <div class="size-16 flex-none rounded-[18px] bg-muted" />
          <div class="min-w-0 flex-1">
            <div class="mb-2.5 h-5 w-32 rounded bg-muted" />
            <div class="flex gap-2">
              <div class="h-6 w-24 rounded-full bg-muted" />
              <div class="h-6 w-24 rounded-full bg-muted" />
            </div>
          </div>
        </div>
      </div>

      <!--
        Пустого состояния отдельной карточкой нет: пунктирная плитка «Добавить
        ребёнка» замыкает сетку и при нуле детей остаётся единственной — так же,
        как в макете.
      -->
      <div v-else class="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <button
          v-for="child in children"
          :key="child.id"
          type="button"
          class="ch-card"
          @click="openForEdit(child)"
        >
          <span
            class="ch-avatar"
            :class="child.gender === 'male'
              ? 'border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100'
              : 'border-pink-200 bg-gradient-to-br from-pink-50 to-pink-100'"
          >
            <Icon
              :name="child.gender === 'male' ? 'fluent-emoji-flat:boy' : 'fluent-emoji-flat:girl'"
              class="size-10"
            />
          </span>

          <span class="min-w-0 flex-1 text-left">
            <span class="block truncate text-lg font-extrabold text-foreground">
              {{ child.name }}
            </span>
            <span class="mt-2.5 flex flex-wrap gap-2">
              <span class="ch-chip">
                <Icon name="lucide:cake" class="size-[13px] text-muted-foreground" />
                {{ formatAge(child.birth_date) }}
              </span>
              <span class="ch-chip">
                <Icon name="lucide:calendar" class="size-[13px] text-muted-foreground" />
                {{ new Date(child.birth_date).toLocaleDateString('ru-RU') }}
              </span>
            </span>
          </span>

          <!-- Декоративный, а не кнопка: кликабельна вся карточка -->
          <span class="ch-chevron">
            <Icon name="lucide:chevron-right" class="size-5" />
          </span>
        </button>

        <button type="button" class="ch-add-tile" @click="openForNew">
          <span class="ch-add-tile__icon">
            <Icon name="lucide:plus" class="size-6" />
          </span>
          <span class="text-[14.5px] font-bold">Добавить ребёнка</span>
        </button>
      </div>

      <template #fallback>
        <div class="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          <div
            v-for="i in 2"
            :key="i"
            class="h-[100px] animate-pulse rounded-[20px] border border-border bg-white shadow-sm"
          />
        </div>
      </template>
    </ClientOnly>

    <!-- Диалог добавления/редактирования -->
    <Dialog v-model:open="isDialogOpen">
      <!--
        [&>button]:hidden убирает штатный крестик shadcn. Именно утилитой, а не
        scoped-правилом: класс из этого пропа `cn()` кладёт прямо на элемент
        контента, тогда как scoped-атрибут data-v-* уходит на корень обёртки
        (DialogPortal → Teleport) и до контента не доезжает.
        Наши кнопки лежат внутри DialogHeader и form, прямыми потомками не
        являются и под селектор не попадают.
      -->
      <DialogContent
        class="rounded-3xl sm:max-w-[460px] [&>button]:hidden"
        @open-auto-focus.prevent
      >
        <DialogHeader>
          <div class="flex items-center justify-between gap-3">
            <DialogTitle class="text-[21px] font-extrabold tracking-[-0.02em]">
              {{ editingChild ? 'Редактировать данные' : 'Добавить ребёнка' }}
            </DialogTitle>
            <!-- Свой крестик вместо штатного: в макете это кружок 38px с рамкой.
                 Править общий components/ui/dialog/DialogContent.vue нельзя —
                 он обслуживает все диалоги приложения. -->
            <button
              type="button"
              class="ch-close"
              aria-label="Закрыть"
              @click="isDialogOpen = false"
            >
              <Icon name="lucide:x" class="size-[19px]" />
            </button>
          </div>
          <DialogDescription class="sr-only">
            Эта информация поможет нам рекомендовать наиболее подходящие товары.
          </DialogDescription>
        </DialogHeader>

        <form class="space-y-[18px]" @submit.prevent="handleSubmit">
          <div>
            <Label for="name" class="mb-[7px] block text-[13.5px] font-bold">Имя</Label>
            <Input
              id="name"
              v-model="formData.name"
              placeholder="Например, Алма"
              class="h-12 rounded-[13px] text-[15px]"
              required
            />
          </div>

          <div>
            <span class="mb-[7px] block text-[13.5px] font-bold">Пол</span>
            <div class="flex gap-2.5">
              <button
                v-for="option in GENDERS"
                :key="option.value"
                type="button"
                class="ch-gender"
                :class="formData.gender === option.value ? 'ch-gender--on' : ''"
                :aria-pressed="formData.gender === option.value"
                @click="formData.gender = option.value"
              >
                <Icon :name="option.icon" class="size-[19px]" />
                {{ option.label }}
              </button>
            </div>
          </div>

          <div>
            <Label for="birth_date" class="mb-[7px] block text-[13.5px] font-bold">Дата рождения</Label>
            <Input
              id="birth_date"
              v-model="formData.birth_date"
              type="date"
              class="h-12 rounded-[13px] text-[15px]"
              required
            />
          </div>

          <DialogFooter class="flex flex-col-reverse gap-2.5 pt-1.5 sm:flex-row sm:justify-between">
            <button
              v-if="editingChild"
              type="button"
              class="ch-btn-ghost text-destructive"
              @click="triggerDeleteConfirmation"
            >
              <Icon name="lucide:trash-2" class="size-[18px]" />
              Удалить
            </button>
            <div class="flex justify-end gap-2.5">
              <button type="button" class="ch-btn-ghost" @click="isDialogOpen = false">
                Отмена
              </button>
              <button
                type="submit"
                class="ch-add-btn ch-add-btn--wide bg-gradient-to-br from-blue-400 to-blue-600"
                :disabled="isLoading"
              >
                <Icon name="lucide:check" class="size-[18px]" />
                {{ isLoading ? 'Сохранение...' : 'Сохранить' }}
              </button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- Диалог подтверждения удаления -->
    <AlertDialog v-model:open="isDeleteConfirmOpen">
      <AlertDialogContent class="rounded-3xl" @open-auto-focus.prevent>
        <AlertDialogHeader>
          <div class="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10">
            <Icon name="lucide:alert-circle" class="size-8 text-destructive" />
          </div>
          <AlertDialogTitle class="text-center text-xl">
            Вы уверены?
          </AlertDialogTitle>
          <AlertDialogDescription class="text-center text-base">
            Это действие необратимо. Все данные о ребенке <strong>«{{ childToDelete?.name }}»</strong> будут удалены безвозвратно.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter class="flex-col-reverse gap-2 sm:flex-row">
          <AlertDialogCancel class="w-full rounded-full sm:w-auto" @click="childToDelete = null">
            Отмена
          </AlertDialogCancel>
          <AlertDialogAction
            class="w-full rounded-full bg-destructive hover:bg-destructive/90 sm:w-auto"
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
/*
 * Основная кнопка-пилюля. Сам градиент задаётся утилитами
 * (bg-gradient-to-br from-blue-400 to-blue-600) на элементе, а не здесь:
 * var(--color-blue-*) существует только пока какая-то утилита их использует,
 * иначе Tailwind 4 вырежет переменные и в проде кнопка станет прозрачной.
 */
.ch-add-btn {
  flex: none;
  height: 46px;
  padding: 0 20px;
  border-radius: 999px;
  border: none;
  color: #fff;
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 8px 20px rgb(43 127 255 / 0.3);
  transition:
    transform 0.14s ease,
    box-shadow 0.14s ease;
}

.ch-add-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 26px rgb(43 127 255 / 0.4);
}

.ch-add-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

/* «Сохранить» в макете шире «Отмены»: 0 24px против 0 20px */
.ch-add-btn--wide {
  padding: 0 24px;
}

.ch-close {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--muted-foreground);
  cursor: pointer;
  display: grid;
  place-content: center;
  transition: background 0.15s ease;
}

.ch-close:hover {
  background: var(--muted);
}

.ch-btn-ghost {
  height: 46px;
  padding: 0 20px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.15s ease;
}

.ch-btn-ghost:hover {
  background: var(--muted);
}

/* Карточка ребёнка — кликабельна целиком, поэтому button, а не div */
.ch-card {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--card);
  box-shadow: var(--elevation-card);
  cursor: pointer;
  text-align: left;
  transition:
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.ch-card:hover {
  box-shadow: var(--elevation-card-hover);
  transform: translateY(-2px);
}

.ch-avatar {
  flex: none;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  border-width: 1px;
  border-style: solid;
  display: grid;
  place-content: center;
}

.ch-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border-radius: 999px;
  background: var(--muted);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--foreground);
}

.ch-chevron {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--muted-foreground);
  display: grid;
  place-content: center;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.ch-card:hover .ch-chevron {
  border-color: var(--primary);
  color: var(--primary);
}

/* Пунктирная плитка — она же пустое состояние */
.ch-add-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 112px;
  padding: 20px;
  border: 2px dashed var(--rating-empty);
  border-radius: 20px;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: all 0.16s ease;
}

.ch-add-tile:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--brand-surface);
}

.ch-add-tile__icon {
  display: grid;
  place-content: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: var(--brand-surface);
  color: var(--primary);
}

/* Переключатель пола вместо Select — как в макете */
.ch-gender {
  flex: 1;
  height: 48px;
  border-radius: 13px;
  border: 1px solid var(--input);
  background: var(--card);
  color: var(--foreground);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.15s ease;
}

.ch-gender--on {
  border: 2px solid var(--primary);
  background: var(--brand-surface);
  color: var(--primary);
}
</style>
