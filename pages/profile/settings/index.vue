<script setup lang="ts">
import type { ProfileUpdate } from '@/types'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'
import { toast } from 'vue-sonner'

import TelegramNotifyRow from '@/components/profile/TelegramNotifyRow.vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useProfileStore } from '@/stores/core/profileStore'

definePageMeta({
  layout: 'profile',
  profileBare: true, // страница рисует собственные карточки, обёртка layout не нужна
})

useHead({ title: 'Настройка профиля' })

/*
 * Размеры поля из макета (48px, радиус 13, 15px/500) задаются утилитами, а не
 * классом в <style scoped>: свой класс лежит в @layer components и по правилам
 * каскада слоёв проигрывает `h-9 rounded-md text-base`, которые Input ставит
 * себе сам в @layer utilities. Через `class` они попадают в cn() → tailwind-merge
 * и штатные значения вытесняются. `md:text-[15px]` нужен из-за `md:text-sm` там же.
 */
const INPUT_CLASS = 'h-12 rounded-[13px] px-[15px] text-[15px] font-medium shadow-none md:text-[15px] focus-visible:border-primary focus-visible:ring-primary/20'

const user = useSupabaseUser()
const profileStore = useProfileStore()
// `profile` — «чистовик» из стора, источник правды.
const { profile, isSaving, isLoading } = storeToRefs(profileStore)

/*
 * Редактируемые поля перечислены один раз. Раньше тот же список стоял в трёх
 * местах — инициализация черновика, resetForm и hasChanges, — и добавление
 * четвёртого поля требовало не забыть про все три.
 */
const EDITABLE_FIELDS = ['first_name', 'last_name', 'phone'] as const
type EditableField = typeof EDITABLE_FIELDS[number]

// `editForm` — «черновик», локальная копия для редактирования.
const editForm = ref<ProfileUpdate>({})

function resetForm() {
  if (!profile.value)
    return
  editForm.value = Object.fromEntries(
    EDITABLE_FIELDS.map(field => [field, profile.value![field]]),
  )
}

/*
 * Следим за «чистовиком»: он меняется после загрузки и после успешного
 * сохранения — черновик обязан идти следом. `deep` здесь не нужен: стор
 * всегда присваивает profile.value новый объект и ни разу не правит поля
 * на месте, так что обычный watch по ссылке ловит все изменения дешевле.
 */
watch(profile, resetForm, { immediate: true })

onMounted(() => {
  // onAuthStateChange в authStore уже зовёт loadProfile, это подстраховка
  // для новых пользователей, у которых профиль ещё создаётся.
  if (!profile.value)
    profileStore.loadProfile(false, true)
})

// Адаптер v-model: в базе поля nullable, <Input> null не принимает.
function fieldModel(field: EditableField) {
  return computed({
    get: () => editForm.value[field] ?? '',
    set: (value: string) => { editForm.value[field] = value || null },
  })
}

const firstName = fieldModel('first_name')
const lastName = fieldModel('last_name')
const phone = fieldModel('phone')

const hasChanges = computed(() => {
  const saved = profile.value
  if (!saved)
    return false
  return EDITABLE_FIELDS.some(field => editForm.value[field] !== saved[field])
})

// Блока «Фото профиля» из макета здесь нет намеренно: загрузка аватара не нужна.
const email = computed(() => user.value?.email ?? '')
const isEmailConfirmed = computed(() => !!user.value?.email_confirmed_at)

// --- Сохранение ---
// Кнопка на две секунды переходит в зелёное «Сохранено» — состояние из макета.
const justSaved = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | null = null

onUnmounted(() => {
  if (savedTimer)
    clearTimeout(savedTimer)
})

/*
 * Подпись, иконка и цвет кнопки менялись тремя отдельными тернарниками по одним
 * и тем же двум флагам — состояния легко было рассинхронить. Теперь описание
 * состояния одно.
 */
const saveButton = computed(() => {
  if (justSaved.value) {
    return {
      label: 'Сохранено',
      icon: 'lucide:check-check',
      tone: 'bg-gradient-to-b from-green-500 to-green-600 shadow-[0_8px_20px_rgba(0,166,62,0.32)]',
    }
  }
  return {
    label: isSaving.value ? 'Сохранение...' : 'Сохранить изменения',
    icon: 'lucide:check',
    tone: 'bg-gradient-to-b from-blue-400 to-blue-600 shadow-[0_8px_20px_rgba(43,127,255,0.3)]',
  }
})

async function handleUpdate() {
  if (!hasChanges.value) {
    toast.info('Нет изменений для сохранения.')
    return
  }

  const ok = await profileStore.updateProfile(toRaw(editForm.value))
  if (!ok)
    return

  justSaved.value = true
  if (savedTimer)
    clearTimeout(savedTimer)
  savedTimer = setTimeout(() => {
    justSaved.value = false
  }, 2000)
}
</script>

<template>
  <div class="flex max-w-[720px] flex-col gap-[18px]">
    <!-- Карточка профиля -->
    <div class="stg-card">
      <h1 class="mb-[5px] text-[clamp(22px,2.6vw,28px)] font-extrabold tracking-[-0.025em]">
        Настройка профиля
      </h1>
      <p class="mb-[22px] text-sm font-medium text-muted-foreground">
        Здесь вы можете обновить информацию о себе
      </p>

      <ClientOnly>
        <SettingsFormSkeleton v-if="isLoading && !profile" />

        <template v-else-if="profile">
          <form @submit.prevent="handleUpdate">
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label for="first_name" class="mb-[7px] block text-[13.5px] font-bold">Имя</Label>
                <Input id="first_name" v-model="firstName" type="text" :class="INPUT_CLASS" placeholder="Иван" />
              </div>
              <div>
                <Label for="last_name" class="mb-[7px] block text-[13.5px] font-bold">Фамилия</Label>
                <Input id="last_name" v-model="lastName" type="text" :class="INPUT_CLASS" placeholder="Петров" />
              </div>
            </div>

            <div class="mt-4">
              <Label for="phone" class="mb-[7px] block text-[13.5px] font-bold">Телефон</Label>
              <Input
                id="phone"
                v-model="phone"
                type="tel"
                inputmode="tel"
                :class="INPUT_CLASS"
                placeholder="+7 (777) 123-45-67"
              />
            </div>

            <!-- Почта приходит из OAuth и не редактируется — это витрина, не поле -->
            <div class="mt-4">
              <span class="mb-[7px] block text-[13.5px] font-bold">Email</span>
              <div
                class="flex h-12 items-center gap-2.5 rounded-[13px] border border-border bg-muted px-[15px] text-[15px] font-medium text-muted-foreground"
              >
                <Icon name="lucide:mail" class="size-[17px] flex-none" />
                <span class="min-w-0 truncate">{{ email }}</span>
                <span
                  v-if="isEmailConfirmed"
                  class="ml-auto inline-flex flex-none items-center gap-1 text-xs font-bold text-green-600"
                >
                  <Icon name="lucide:badge-check" class="size-3.5" />
                  подтверждён
                </span>
              </div>
            </div>

            <div class="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                class="stg-btn-save"
                :class="saveButton.tone"
                :disabled="isSaving"
              >
                <Icon
                  :name="saveButton.icon"
                  class="size-[18px]"
                  :class="isSaving ? 'animate-pulse' : ''"
                />
                {{ saveButton.label }}
              </button>
              <button
                type="button"
                class="stg-btn-outline h-12 px-[22px] text-[14.5px]"
                :disabled="isSaving"
                @click="resetForm"
              >
                Отменить
              </button>
            </div>
          </form>
        </template>

        <!-- Профиль не загрузился -->
        <div v-else class="py-10 text-center">
          <p class="text-muted-foreground">
            Не удалось загрузить данные профиля.
          </p>
          <button
            type="button"
            class="stg-btn-outline mt-4 h-11 px-5 text-sm"
            @click="profileStore.loadProfile(true, true)"
          >
            Попробовать снова
          </button>
        </div>

        <template #fallback>
          <SettingsFormSkeleton />
        </template>
      </ClientOnly>
    </div>

    <!-- Уведомления -->
    <div class="stg-card">
      <h2 class="mb-[3px] text-[clamp(17px,1.9vw,20px)] font-extrabold tracking-[-0.02em]">
        Уведомления
      </h2>
      <p class="mb-2 text-[13.5px] font-medium text-muted-foreground">
        Выберите, как получать новости о заказах и акциях
      </p>

      <ClientOnly>
        <TelegramNotifyRow />
        <template #fallback>
          <div class="h-[72px] animate-pulse border-t border-border" />
        </template>
      </ClientOnly>
    </div>
  </div>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .stg-card {
    border: 1px solid var(--border);
    border-radius: clamp(18px, 2vw, 22px);
    background: var(--card);
    padding: clamp(18px, 2.4vw, 26px);
    box-shadow: var(--shadow-sm, 0 1px 3px rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1));
  }

  /*
   * Градиент «Сохранить» задаётся утилитами на элементе, а не здесь:
   * var(--color-blue-*) / var(--color-green-*) существуют, только пока на них
   * ссылается утилита, иначе Tailwind 4 вырежет переменные и в проде кнопка
   * станет прозрачной. По той же причине здесь нет тени — она в классе.
   */
  .stg-btn-save {
    height: 48px;
    padding: 0 24px;
    border: none;
    border-radius: 999px;
    color: #fff;
    font-size: 14.5px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition:
      transform 0.14s ease,
      box-shadow 0.2s ease,
      background 0.2s ease;
  }

  .stg-btn-save:hover:not(:disabled) {
    transform: translateY(-2px);
  }

  .stg-btn-save:disabled {
    opacity: 0.7;
    cursor: default;
  }

  /* Кнопка-контур: размеры задаются утилитами на месте (h-10/h-12) */
  .stg-btn-outline {
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--foreground);
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .stg-btn-outline:hover:not(:disabled) {
    background: var(--muted);
    border-color: var(--primary);
    color: var(--primary);
  }

  .stg-btn-outline:disabled {
    opacity: 0.55;
    cursor: default;
  }
}
</style>
