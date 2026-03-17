<script setup lang="ts">
import type { Supplier, SupplierInsert, SupplierUpdate } from '@/types'
import { MoreHorizontal, Pencil, Phone, Plus, Search, Trash2 } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useAdminSuppliersStore } from '@/stores/adminStore/adminSuppliersStore'

definePageMeta({ layout: 'admin' })

const suppliersStore = useAdminSuppliersStore()
const { suppliers, isLoading } = storeToRefs(suppliersStore)

// Поиск
const searchQuery = ref('')
const filteredSuppliers = computed(() => {
  if (!searchQuery.value)
    return suppliers.value
  const q = searchQuery.value.toLowerCase()
  return suppliers.value.filter(s =>
    s.name.toLowerCase().includes(q)
    || s.contact_person?.toLowerCase().includes(q)
    || s.phone?.includes(q)
    || s.address?.toLowerCase().includes(q),
  )
})

onMounted(() => {
  suppliersStore.fetchSuppliers()
})

// Диалог создания/редактирования
const isDialogOpen = ref(false)
const editingSupplier = ref<Supplier | null>(null)
const formData = ref<Partial<SupplierInsert>>({})

function openCreateDialog() {
  editingSupplier.value = null
  formData.value = {
    name: '',
    contact_person: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
  }
  isDialogOpen.value = true
}

function openEditDialog(supplier: Supplier) {
  editingSupplier.value = supplier
  formData.value = {
    name: supplier.name,
    contact_person: supplier.contact_person,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    notes: supplier.notes,
  }
  isDialogOpen.value = true
}

async function handleSave() {
  if (!formData.value.name?.trim()) {
    toast.error('Название поставщика обязательно')
    return
  }

  if (editingSupplier.value) {
    const success = await suppliersStore.updateSupplier(
      editingSupplier.value.id,
      formData.value as SupplierUpdate,
    )
    if (success)
      isDialogOpen.value = false
  }
  else {
    const result = await suppliersStore.createSupplier(formData.value as SupplierInsert)
    if (result)
      isDialogOpen.value = false
  }
}

// Удаление
const supplierToDelete = ref<Supplier | null>(null)
const showDeleteDialog = ref(false)

function openDeleteDialog(supplier: Supplier) {
  supplierToDelete.value = supplier
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!supplierToDelete.value)
    return
  await suppliersStore.deleteSupplier(supplierToDelete.value)
  showDeleteDialog.value = false
  supplierToDelete.value = null
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8 space-y-6">
    <!-- Заголовок -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
          Поставщики
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          База контактов поставщиков и дистрибьюторов
        </p>
      </div>
      <Button class="w-full sm:w-auto" @click="openCreateDialog">
        <Plus class="w-4 h-4 mr-2" />
        Добавить поставщика
      </Button>
    </div>

    <!-- Поиск -->
    <Card>
      <CardContent class="pt-6">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="Поиск по названию, контакту, телефону или адресу..."
            class="pl-10"
          />
        </div>
      </CardContent>
    </Card>

    <!-- Таблица поставщиков -->
    <Card>
      <CardContent class="p-0">
        <!-- Skeleton -->
        <div v-if="isLoading" class="p-6">
          <div class="space-y-4">
            <div v-for="i in 5" :key="i" class="flex items-center gap-4">
              <div class="flex-1 space-y-2">
                <Skeleton class="h-4 w-1/3" />
                <Skeleton class="h-3 w-1/4" />
              </div>
              <Skeleton class="h-8 w-24" />
            </div>
          </div>
        </div>

        <!-- Таблица -->
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead class="hidden md:table-cell">
                Контактное лицо
              </TableHead>
              <TableHead class="hidden md:table-cell">
                Телефон
              </TableHead>
              <TableHead class="hidden lg:table-cell">
                Адрес
              </TableHead>
              <TableHead class="text-right">
                Действия
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <!-- Пустое состояние -->
            <TableRow v-if="filteredSuppliers.length === 0">
              <TableCell colspan="5" class="h-32 text-center">
                <div class="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Search class="w-8 h-8 opacity-50" />
                  <p v-if="searchQuery">
                    Поставщики не найдены по запросу "{{ searchQuery }}"
                  </p>
                  <p v-else>
                    Поставщиков пока нет. Добавьте первого.
                  </p>
                </div>
              </TableCell>
            </TableRow>

            <!-- Строки -->
            <TableRow v-for="supplier in filteredSuppliers" :key="supplier.id" class="group">
              <TableCell>
                <div class="font-medium">
                  {{ supplier.name }}
                </div>
                <div class="text-xs text-muted-foreground md:hidden">
                  {{ supplier.contact_person }}
                </div>
              </TableCell>

              <TableCell class="hidden md:table-cell">
                {{ supplier.contact_person || '—' }}
              </TableCell>

              <TableCell class="hidden md:table-cell">
                <a
                  v-if="supplier.phone"
                  :href="`tel:${supplier.phone}`"
                  class="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Phone class="w-3.5 h-3.5" />
                  {{ supplier.phone }}
                </a>
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>

              <TableCell class="hidden lg:table-cell text-muted-foreground text-sm">
                {{ supplier.address || '—' }}
              </TableCell>

              <TableCell class="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal class="w-4 h-4" />
                      <span class="sr-only">Открыть меню</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Действия</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @click="openEditDialog(supplier)">
                      <Pencil class="w-4 h-4 mr-2" />
                      Редактировать
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      class="text-destructive focus:text-destructive"
                      @click="openDeleteDialog(supplier)"
                    >
                      <Trash2 class="w-4 h-4 mr-2" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Счётчик -->
    <div v-if="!isLoading" class="text-sm text-muted-foreground text-center">
      Всего поставщиков: {{ filteredSuppliers.length }}
      <span v-if="searchQuery"> (отфильтровано из {{ suppliers.length }})</span>
    </div>

    <!-- Диалог создания/редактирования -->
    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>
            {{ editingSupplier ? 'Редактировать поставщика' : 'Новый поставщик' }}
          </DialogTitle>
        </DialogHeader>

        <div class="space-y-4 py-4">
          <div>
            <Label for="supplier-name">Название *</Label>
            <Input
              id="supplier-name"
              v-model="formData.name"
              placeholder="Например: Ялян Маркет, Барахолка точка 45"
            />
          </div>

          <div>
            <Label for="supplier-contact">Контактное лицо</Label>
            <Input
              id="supplier-contact"
              v-model="formData.contact_person"
              placeholder="Имя менеджера"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <Label for="supplier-phone">Телефон</Label>
              <Input
                id="supplier-phone"
                v-model="formData.phone"
                placeholder="+7 (777) 123-45-67"
              />
            </div>
            <div>
              <Label for="supplier-email">Email</Label>
              <Input
                id="supplier-email"
                v-model="formData.email"
                type="email"
                placeholder="email@example.com"
              />
            </div>
          </div>

          <div>
            <Label for="supplier-address">Адрес / Точка на рынке</Label>
            <Input
              id="supplier-address"
              v-model="formData.address"
              placeholder="Барахолка, контейнер 15, ряд 3"
            />
          </div>

          <div>
            <Label for="supplier-notes">Заметки</Label>
            <Textarea
              id="supplier-notes"
              v-model="formData.notes"
              placeholder="Условия работы, минимальный заказ, способ оплаты..."
              rows="3"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="isDialogOpen = false">
            Отмена
          </Button>
          <Button :disabled="isLoading" @click="handleSave">
            {{ editingSupplier ? 'Сохранить' : 'Создать' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- AlertDialog удаления -->
    <AlertDialog v-model:open="showDeleteDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
          <AlertDialogDescription>
            Вы собираетесь удалить поставщика <strong>"{{ supplierToDelete?.name }}"</strong>.
            <br><br>
            У товаров, связанных с этим поставщиком, связь будет удалена (supplier_id станет NULL).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleDelete"
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
