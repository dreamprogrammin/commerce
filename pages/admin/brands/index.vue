<script setup lang="ts">
import type { Brand } from '@/types'
import { Eye, MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useBrandQuestions } from '@/composables/useBrandQuestions'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_BRANDS } from '@/constants'
import { useAdminBrandsStore } from '@/stores/adminStore/adminBrandsStore'
import { useAdminProductLinesStore } from '@/stores/adminStore/adminProductLinesStore'

definePageMeta({ layout: 'admin' })

const brandsStore = useAdminBrandsStore()
const productLinesStore = useAdminProductLinesStore()
const { brands, isLoading } = storeToRefs(brandsStore)
const { getImageUrl } = useSupabaseStorage()
const { generateQuestionsForAllBrands } = useBrandQuestions()

// Генерация FAQ
const isGeneratingAll = ref(false)

async function handleGenerateAllQuestions() {
  isGeneratingAll.value = true

  toast.info('Запуск генерации FAQ для всех брендов...')

  const result = await generateQuestionsForAllBrands()

  isGeneratingAll.value = false

  if (result) {
    toast.success(`FAQ сгенерировано для ${result.total} брендов!`, {
      description: `Из них ${result.premium_count} популярных брендов`,
    })
  }
  else {
    toast.error('Ошибка при генерации FAQ')
  }
}

// Кеш линеек по брендам
const brandLinesCount = ref<Record<string, number>>({})

// Загружаем количество линеек для каждого бренда
async function loadLinesCount() {
  await productLinesStore.fetchProductLines()
  const lines = productLinesStore.productLines
  const counts: Record<string, number> = {}
  for (const line of lines) {
    counts[line.brand_id] = (counts[line.brand_id] || 0) + 1
  }
  brandLinesCount.value = counts
}

// Поиск
const searchQuery = ref('')
const filteredBrands = computed(() => {
  if (!searchQuery.value)
    return brands.value

  const query = searchQuery.value.toLowerCase()
  return brands.value.filter(brand =>
    brand.name.toLowerCase().includes(query)
    || brand.slug?.toLowerCase().includes(query),
  )
})

onMounted(async () => {
  await brandsStore.fetchBrands()
  await loadLinesCount()
})

// Логика удаления с AlertDialog
const brandToDelete = ref<Brand | null>(null)
const showDeleteDialog = ref(false)

function openDeleteDialog(brand: Brand) {
  brandToDelete.value = brand
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!brandToDelete.value)
    return

  const success = await brandsStore.deleteBrand(brandToDelete.value)

  if (success) {
    toast.success(`Бренд "${brandToDelete.value.name}" успешно удален`)
  }

  showDeleteDialog.value = false
  brandToDelete.value = null
}

// Простой SVG плейсхолдер для бренда (data URI)
const BRAND_PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='1.5'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cpath d='M9 12h6M12 9v6'/%3E%3C/svg%3E`

// Получить URL логотипа бренда
function getBrandLogoUrl(logoUrl: string | null): string {
  if (!logoUrl)
    return BRAND_PLACEHOLDER
  return getImageUrl(BUCKET_NAME_BRANDS, logoUrl, IMAGE_SIZES.CATEGORY_MENU) || BRAND_PLACEHOLDER
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8 space-y-6">
    <!-- Заголовок и кнопки -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
          Управление брендами
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          Просмотр и редактирование брендов товаров
        </p>
      </div>
      <div class="flex gap-2 w-full sm:w-auto">
        <Button
          variant="outline"
          :disabled="isGeneratingAll"
          class="flex-1 sm:flex-initial"
          @click="handleGenerateAllQuestions"
        >
          <Sparkles class="w-4 h-4 mr-2" />
          {{ isGeneratingAll ? 'Генерация...' : 'Сгенерировать FAQ для всех' }}
        </Button>
        <NuxtLink to="/admin/brands/new" class="flex-1 sm:flex-initial">
          <Button class="w-full">
            <Plus class="w-4 h-4 mr-2" />
            Добавить бренд
          </Button>
        </NuxtLink>
      </div>
    </div>

    <!-- Поиск -->
    <Card>
      <CardContent class="pt-6">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="Поиск по названию или слагу..."
            class="pl-10"
          />
        </div>
      </CardContent>
    </Card>

    <!-- Таблица брендов -->
    <Card>
      <CardContent class="p-0">
        <!-- Skeleton загрузки -->
        <div v-if="isLoading" class="p-6">
          <div class="space-y-4">
            <div v-for="i in 5" :key="i" class="flex items-center gap-4">
              <Skeleton class="w-12 h-12 rounded-md" />
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
              <TableHead class="w-16">
                Лого
              </TableHead>
              <TableHead>Название</TableHead>
              <TableHead class="hidden md:table-cell">
                Слаг (URL)
              </TableHead>
              <TableHead class="hidden md:table-cell">
                Линеек
              </TableHead>
              <TableHead class="hidden lg:table-cell">
                Товаров
              </TableHead>
              <TableHead class="text-right">
                Действия
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <!-- Пустое состояние -->
            <TableRow v-if="filteredBrands.length === 0">
              <TableCell colspan="6" class="h-32 text-center">
                <div class="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Search class="w-8 h-8 opacity-50" />
                  <p v-if="searchQuery">
                    Бренды не найдены по запросу "{{ searchQuery }}"
                  </p>
                  <p v-else>
                    Бренды отсутствуют. Добавьте первый бренд.
                  </p>
                </div>
              </TableCell>
            </TableRow>

            <!-- Строки брендов -->
            <TableRow v-for="brand in filteredBrands" :key="brand.id" class="group">
              <!-- Логотип -->
              <TableCell>
                <div class="w-12 h-12 rounded-md bg-gray-50 flex items-center justify-center overflow-hidden border">
                  <img
                    :src="getBrandLogoUrl(brand.logo_url)"
                    :alt="brand.name"
                    class="w-full h-full object-contain p-1"
                  >
                </div>
              </TableCell>

              <!-- Название -->
              <TableCell>
                <div class="font-medium">
                  {{ brand.name }}
                </div>
                <div class="text-xs text-muted-foreground md:hidden">
                  {{ brand.slug }}
                </div>
              </TableCell>

              <!-- Слаг (скрыт на мобильных) -->
              <TableCell class="hidden md:table-cell text-muted-foreground">
                <code class="text-xs bg-muted px-2 py-1 rounded">{{ brand.slug }}</code>
              </TableCell>

              <!-- Количество линеек -->
              <TableCell class="hidden md:table-cell">
                <NuxtLink
                  v-if="brandLinesCount[brand.id]"
                  :to="`/admin/brands/${brand.id}?tab=lines`"
                  class="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Sparkles class="w-3.5 h-3.5" />
                  {{ brandLinesCount[brand.id] }}
                </NuxtLink>
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>

              <!-- Количество товаров (скрыто на планшетах) -->
              <TableCell class="hidden lg:table-cell">
                <Badge variant="secondary">
                  {{ brand.product_count || 0 }} товаров
                </Badge>
              </TableCell>

              <!-- Действия -->
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

                    <!-- Просмотр на сайте -->
                    <DropdownMenuItem as-child>
                      <NuxtLink :to="`/brand/${brand.slug}`" target="_blank">
                        <Eye class="w-4 h-4 mr-2" />
                        Просмотр на сайте
                      </NuxtLink>
                    </DropdownMenuItem>

                    <!-- Редактировать -->
                    <DropdownMenuItem as-child>
                      <NuxtLink :to="`/admin/brands/${brand.id}`">
                        <Pencil class="w-4 h-4 mr-2" />
                        Редактировать
                      </NuxtLink>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <!-- Удалить -->
                    <DropdownMenuItem
                      class="text-destructive focus:text-destructive"
                      @click="openDeleteDialog(brand)"
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

    <!-- Информация о количестве -->
    <div v-if="!isLoading" class="text-sm text-muted-foreground text-center">
      Всего брендов: {{ filteredBrands.length }}
      <span v-if="searchQuery"> (отфильтровано из {{ brands.length }})</span>
    </div>

    <!-- AlertDialog для подтверждения удаления -->
    <AlertDialog v-model:open="showDeleteDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
          <AlertDialogDescription>
            Вы собираетесь удалить бренд <strong>"{{ brandToDelete?.name }}"</strong>.
            <br><br>
            Это действие необратимо и может повлиять на товары, связанные с этим брендом.
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
