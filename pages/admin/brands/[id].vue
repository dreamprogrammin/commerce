<script setup lang="ts">
import type { BrandInsert, BrandUpdate, ProductLine, ProductLineInsert } from '@/types'
import { ArrowLeft, Package, Pencil, Plus, Sparkles, Trash2 } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import BrandForm from '@/components/admin/brands/BrandForm.vue'
import ProductLineForm from '@/components/admin/product-lines/ProductLineForm.vue'
import { useAdminBrandsStore } from '@/stores/adminStore/adminBrandsStore'
import { useAdminProductLinesStore } from '@/stores/adminStore/adminProductLinesStore'

definePageMeta({ layout: 'admin' })

const brandsStore = useAdminBrandsStore()
const productLinesStore = useAdminProductLinesStore()
const { currentBrand, isLoading } = storeToRefs(brandsStore)

const route = useRoute()
const router = useRouter()
const brandId = route.params.id as string

// Активная вкладка (из query или default)
const activeTab = ref((route.query.tab as string) || 'info')

// Линейки бренда
const brandLines = ref<ProductLine[]>([])
const isLoadingLines = ref(false)
const isLineDialogOpen = ref(false)
const editingLine = ref<ProductLine | null>(null)
const lineToDelete = ref<ProductLine | null>(null)
const isDeleteDialogOpen = ref(false)

onMounted(async () => {
  await brandsStore.fetchBrandById(brandId)
  await loadProductLines()
})

async function loadProductLines() {
  isLoadingLines.value = true
  try {
    brandLines.value = await productLinesStore.fetchProductLinesByBrand(brandId)
  }
  finally {
    isLoadingLines.value = false
  }
}

async function handleUpdate(payload: { data: BrandInsert | BrandUpdate, file: File | null }) {
  const success = await brandsStore.updateBrand(brandId, payload.data as BrandUpdate, payload.file)
  if (success)
    router.push('/admin/brands')
}

function goBack() {
  router.push('/admin/brands')
}

// --- Линейки ---

function openNewLineDialog() {
  editingLine.value = null
  isLineDialogOpen.value = true
}

function openEditLineDialog(line: ProductLine) {
  editingLine.value = line
  isLineDialogOpen.value = true
}

function openDeleteDialog(line: ProductLine) {
  lineToDelete.value = line
  isDeleteDialogOpen.value = true
}

async function handleLineSubmit(payload: { data: ProductLineInsert, file: File | null }) {
  if (editingLine.value) {
    // Редактирование
    const success = await productLinesStore.updateProductLine(
      editingLine.value.id,
      payload.data,
      payload.file,
      editingLine.value.logo_url,
    )
    if (success) {
      isLineDialogOpen.value = false
      await loadProductLines()
    }
  }
  else {
    // Создание
    const newLine = await productLinesStore.createProductLine(payload.data, payload.file)
    if (newLine) {
      isLineDialogOpen.value = false
      await loadProductLines()
    }
  }
}

async function handleDeleteLine() {
  if (!lineToDelete.value)
    return

  const success = await productLinesStore.deleteProductLine(lineToDelete.value)
  if (success) {
    isDeleteDialogOpen.value = false
    lineToDelete.value = null
    await loadProductLines()
  }
}
</script>

<template>
  <div class="p-4 md:p-8">
    <div class="max-w-4xl mx-auto space-y-6">
      <!-- Breadcrumbs -->
      <nav class="flex items-center gap-2 text-sm text-muted-foreground">
        <NuxtLink to="/admin" class="hover:text-foreground transition-colors">
          Панель управления
        </NuxtLink>
        <span>/</span>
        <NuxtLink to="/admin/brands" class="hover:text-foreground transition-colors">
          Бренды
        </NuxtLink>
        <span>/</span>
        <span class="text-foreground">Редактирование</span>
      </nav>

      <!-- Заголовок с кнопкой назад -->
      <div class="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          @click="goBack"
        >
          <ArrowLeft class="w-5 h-5" />
          <span class="sr-only">Назад</span>
        </Button>
        <div class="flex-1">
          <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
            Редактирование бренда
          </h1>
          <p v-if="currentBrand" class="text-sm text-muted-foreground mt-1">
            {{ currentBrand.name }}
          </p>
        </div>
      </div>

      <!-- Skeleton загрузки -->
      <Card v-if="isLoading && !currentBrand">
        <CardContent class="p-6">
          <div class="space-y-6">
            <div class="space-y-2">
              <Skeleton class="h-4 w-24" />
              <Skeleton class="h-10 w-full" />
            </div>
            <div class="space-y-2">
              <Skeleton class="h-4 w-24" />
              <Skeleton class="h-10 w-full" />
            </div>
            <div class="space-y-2">
              <Skeleton class="h-4 w-32" />
              <Skeleton class="h-32 w-32 rounded-md" />
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Контент с вкладками -->
      <Tabs v-else v-model="activeTab" class="w-full">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="info" class="flex items-center gap-2">
            <Package class="w-4 h-4" />
            Информация
          </TabsTrigger>
          <TabsTrigger value="lines" class="flex items-center gap-2">
            <Sparkles class="w-4 h-4" />
            Линейки
            <Badge v-if="brandLines.length > 0" variant="secondary" class="ml-1">
              {{ brandLines.length }}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <!-- Вкладка: Основная информация -->
        <TabsContent value="info" class="mt-6">
          <Card>
            <CardContent class="p-6">
              <BrandForm
                :initial-data="currentBrand"
                @submit="handleUpdate"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <!-- Вкладка: Линейки -->
        <TabsContent value="lines" class="mt-6">
          <Card>
            <CardHeader>
              <div class="flex items-center justify-between">
                <div>
                  <CardTitle>Линейки бренда</CardTitle>
                  <CardDescription>
                    Управление линейками продуктов (Barbie, Hot Wheels и т.д.)
                  </CardDescription>
                </div>
                <Button @click="openNewLineDialog">
                  <Plus class="w-4 h-4 mr-2" />
                  Добавить линейку
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <!-- Загрузка -->
              <div v-if="isLoadingLines" class="space-y-3">
                <Skeleton v-for="i in 3" :key="i" class="h-16 w-full" />
              </div>

              <!-- Пустой список -->
              <div
                v-else-if="brandLines.length === 0"
                class="text-center py-12 text-muted-foreground"
              >
                <Sparkles class="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p class="text-lg font-medium">
                  Нет линеек
                </p>
                <p class="text-sm mt-1">
                  Добавьте первую линейку для бренда {{ currentBrand?.name }}
                </p>
                <Button class="mt-4" @click="openNewLineDialog">
                  <Plus class="w-4 h-4 mr-2" />
                  Создать линейку
                </Button>
              </div>

              <!-- Список линеек -->
              <div v-else class="space-y-3">
                <div
                  v-for="line in brandLines"
                  :key="line.id"
                  class="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <!-- Логотип -->
                  <div class="w-12 h-12 rounded-lg bg-muted border overflow-hidden flex-shrink-0 flex items-center justify-center">
                    <img
                      v-if="line.logo_url"
                      :src="productLinesStore.getPublicUrl('product-line-logos', line.logo_url)"
                      :alt="line.name"
                      class="w-full h-full object-contain p-1"
                    >
                    <Sparkles v-else class="w-6 h-6 text-muted-foreground" />
                  </div>

                  <!-- Информация -->
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold truncate">
                      {{ line.name }}
                    </p>
                    <p class="text-sm text-muted-foreground truncate">
                      /{{ line.slug }}
                    </p>
                  </div>

                  <!-- Действия -->
                  <div class="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      @click="openEditLineDialog(line)"
                    >
                      <Pencil class="w-4 h-4" />
                      <span class="sr-only">Редактировать</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="text-destructive hover:text-destructive"
                      @click="openDeleteDialog(line)"
                    >
                      <Trash2 class="w-4 h-4" />
                      <span class="sr-only">Удалить</span>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <!-- Диалог создания/редактирования линейки -->
      <Dialog v-model:open="isLineDialogOpen">
        <DialogContent class="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>
              {{ editingLine ? 'Редактировать линейку' : 'Новая линейка' }}
            </DialogTitle>
            <DialogDescription>
              Линейка для бренда: {{ currentBrand?.name }}
            </DialogDescription>
          </DialogHeader>
          <ProductLineForm
            :brand-id="brandId"
            :initial-data="editingLine"
            @submit="handleLineSubmit"
          />
        </DialogContent>
      </Dialog>

      <!-- Диалог подтверждения удаления -->
      <AlertDialog v-model:open="isDeleteDialogOpen">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить линейку?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить линейку "{{ lineToDelete?.name }}"?
              Это действие нельзя отменить. Товары, привязанные к этой линейке,
              потеряют связь с ней.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              @click="handleDeleteLine"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </div>
</template>
