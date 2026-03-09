<script setup lang="ts">
import type { BrandInsert } from '@/types'
import { ArrowLeft } from 'lucide-vue-next'
import BrandForm from '@/components/admin/brands/BrandForm.vue'
import { useAdminBrandsStore } from '@/stores/adminStore/adminBrandsStore'

definePageMeta({ layout: 'admin' })

const brandsStore = useAdminBrandsStore()
const router = useRouter()

async function handleCreate(payload: { data: BrandInsert, file: File | null }) {
  const success = await brandsStore.createBrand(payload.data, payload.file)
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
        <span class="text-foreground">Новый бренд</span>
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
            Добавление нового бренда
          </h1>
          <p class="text-sm text-muted-foreground mt-1">
            Заполните информацию о бренде
          </p>
        </div>
      </div>

      <!-- Форма создания -->
      <BrandForm @submit="handleCreate" />
    </div>
  </div>
</template>
