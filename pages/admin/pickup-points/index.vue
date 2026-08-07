<script setup lang="ts">
import type {
  PickupPoint,
  PickupPointInput,
} from '@/stores/adminStore/adminPickupPointsStore'
import { storeToRefs } from 'pinia'
import { useAdminPickupPointsStore } from '@/stores/adminStore/adminPickupPointsStore'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Пункты самовывоза' })

const store = useAdminPickupPointsStore()
const { points, isLoading } = storeToRefs(store)

const isDialogOpen = ref(false)
const editingId = ref<string | null>(null)
const isSaving = ref(false)
const pointToDelete = ref<PickupPoint | null>(null)

function emptyForm(): PickupPointInput {
  return {
    name: '',
    address: '',
    working_hours: '',
    phone: '',
    note: '',
    is_active: true,
    display_order: 0,
  }
}

const form = ref<PickupPointInput>(emptyForm())

// Название и адрес — единственное, без чего пункт бесполезен покупателю.
const isValid = computed(
  () => form.value.name.trim().length > 0 && form.value.address.trim().length > 0,
)

function openCreate() {
  editingId.value = null
  form.value = emptyForm()
  // Новый пункт встаёт в конец списка, а не вклинивается в середину.
  form.value.display_order = points.value.length
    ? Math.max(...points.value.map(p => p.display_order)) + 1
    : 0
  isDialogOpen.value = true
}

function openEdit(point: PickupPoint) {
  editingId.value = point.id
  form.value = {
    name: point.name,
    address: point.address,
    working_hours: point.working_hours ?? '',
    phone: point.phone ?? '',
    note: point.note ?? '',
    is_active: point.is_active,
    display_order: point.display_order,
  }
  isDialogOpen.value = true
}

async function save() {
  if (!isValid.value)
    return

  isSaving.value = true
  // Пустые строки храним как NULL: иначе под названием появится пустая строка
  // вместо часов работы.
  const payload: PickupPointInput = {
    ...form.value,
    name: form.value.name.trim(),
    address: form.value.address.trim(),
    working_hours: form.value.working_hours?.trim() || null,
    phone: form.value.phone?.trim() || null,
    note: form.value.note?.trim() || null,
  }

  const ok = editingId.value
    ? await store.updatePoint(editingId.value, payload)
    : await store.createPoint(payload)

  isSaving.value = false
  if (ok)
    isDialogOpen.value = false
}

async function confirmDelete() {
  if (!pointToDelete.value)
    return
  await store.deletePoint(pointToDelete.value)
  pointToDelete.value = null
}

onMounted(store.fetchPoints)
</script>

<template>
  <div class="container mx-auto max-w-4xl px-4 py-8">
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold md:text-3xl">
          Пункты самовывоза
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Адреса, из которых покупатель может забрать заказ. В оформлении
          показываются только опубликованные.
        </p>
      </div>
      <Button class="shrink-0" @click="openCreate">
        <Icon name="lucide:plus" class="mr-2 size-4" />
        Добавить
      </Button>
    </div>

    <div v-if="isLoading" class="py-12 text-center text-muted-foreground">
      Загружаем…
    </div>

    <div
      v-else-if="points.length === 0"
      class="rounded-xl border border-dashed py-12 text-center"
    >
      <Icon name="lucide:store" class="mx-auto mb-3 size-8 text-muted-foreground" />
      <p class="font-medium">
        Пунктов самовывоза пока нет
      </p>
      <p class="mt-1 text-sm text-muted-foreground">
        Пока список пуст, покупатель не сможет выбрать самовывоз в оформлении.
      </p>
    </div>

    <div v-else class="flex flex-col gap-3">
      <Card v-for="point in points" :key="point.id">
        <CardContent class="flex flex-wrap items-start gap-4 p-4">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold">{{ point.name }}</span>
              <Badge v-if="!point.is_active" variant="secondary">
                Снят с публикации
              </Badge>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ point.address }}
            </p>
            <p v-if="point.working_hours" class="mt-1 text-sm text-muted-foreground">
              <Icon name="lucide:clock" class="mr-1 inline size-3.5" />
              {{ point.working_hours }}
            </p>
            <p v-if="point.phone" class="mt-1 text-sm text-muted-foreground">
              <Icon name="lucide:phone" class="mr-1 inline size-3.5" />
              {{ point.phone }}
            </p>
            <p v-if="point.note" class="mt-1 text-sm text-muted-foreground">
              {{ point.note }}
            </p>
          </div>

          <div class="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" @click="openEdit(point)">
              <Icon name="lucide:pencil" class="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="text-destructive"
              @click="pointToDelete = point"
            >
              <Icon name="lucide:trash-2" class="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Создание и редактирование -->
    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {{ editingId ? 'Изменить пункт' : 'Новый пункт самовывоза' }}
          </DialogTitle>
        </DialogHeader>

        <div class="flex flex-col gap-4 py-2">
          <div>
            <Label for="pp-name">Название</Label>
            <Input
              id="pp-name"
              v-model="form.name"
              placeholder="ТРЦ «Мега Алматы», 1 этаж"
              class="mt-1.5"
            />
          </div>

          <div>
            <Label for="pp-address">Адрес</Label>
            <Input
              id="pp-address"
              v-model="form.address"
              placeholder="Алматы, пр. Розыбакиева 247А"
              class="mt-1.5"
            />
          </div>

          <div>
            <Label for="pp-hours">Часы работы</Label>
            <Input
              id="pp-hours"
              v-model="form.working_hours"
              placeholder="ежедневно 10:00–22:00"
              class="mt-1.5"
            />
          </div>

          <div>
            <Label for="pp-phone">Телефон</Label>
            <Input
              id="pp-phone"
              v-model="form.phone"
              placeholder="+7 (727) 000-00-00"
              class="mt-1.5"
            />
          </div>

          <div>
            <Label for="pp-note">Как найти</Label>
            <Input
              id="pp-note"
              v-model="form.note"
              placeholder="вход со двора, 2 этаж"
              class="mt-1.5"
            />
          </div>

          <div>
            <Label for="pp-order">Порядок в списке</Label>
            <Input
              id="pp-order"
              v-model.number="form.display_order"
              type="number"
              class="mt-1.5"
            />
            <p class="mt-1 text-xs text-muted-foreground">
              Чем меньше число, тем выше пункт в списке у покупателя.
            </p>
          </div>

          <div class="flex items-center gap-3">
            <Switch id="pp-active" v-model:checked="form.is_active" />
            <Label for="pp-active" class="cursor-pointer">
              Показывать в оформлении
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" :disabled="isSaving" @click="isDialogOpen = false">
            Отмена
          </Button>
          <Button :disabled="!isValid || isSaving" @click="save">
            {{ isSaving ? 'Сохраняем…' : 'Сохранить' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog :open="!!pointToDelete" @update:open="(v) => { if (!v) pointToDelete = null }">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить пункт самовывоза?</AlertDialogTitle>
          <AlertDialogDescription>
            «{{ pointToDelete?.name }}» исчезнет из списка. Заказы, оформленные
            на этот пункт, останутся, но потеряют ссылку на него — если адрес
            нужен для истории, лучше снять пункт с публикации.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="confirmDelete"
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
