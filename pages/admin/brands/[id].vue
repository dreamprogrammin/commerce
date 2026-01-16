<script setup lang="ts">
import type { BrandInsert, BrandUpdate } from '@/types'
import { ArrowLeft } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import BrandForm from '@/components/admin/brands/BrandForm.vue'
import { useAdminBrandsStore } from '@/stores/adminStore/adminBrandsStore'

definePageMeta({ layout: 'admin' })

const brandsStore = useAdminBrandsStore()
const { currentBrand, isLoading } = storeToRefs(brandsStore)

const route = useRoute()
const router = useRouter()
const brandId = route.params.id as string

onMounted(() => {
  brandsStore.fetchBrandById(brandId)
})

async function handleUpdate(payload: { data: BrandInsert | BrandUpdate, file: File | null }) {
  const success = await brandsStore.updateBrand(brandId, payload.data as BrandUpdate, payload.file)
  if (success)
    router.push('/admin/brands')
}

function goBack() {
  router.push('/admin/brands')
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
            <!-- Skeleton для формы -->
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
            <div class="flex gap-2 justify-end">
              <Skeleton class="h-10 w-24" />
              <Skeleton class="h-10 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Форма редактирования -->
      <BrandForm
        v-else
        :initial-data="currentBrand"
        @submit="handleUpdate"
      />
    </div>
  </div>
</template>
