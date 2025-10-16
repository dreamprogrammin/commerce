<!-- pages/admin/brands/new.vue -->
<script setup lang="ts">
import type { BrandInsert, BrandUpdate } from '@/types'
import BrandForm from '@/components/admin/brands/BrandForm.vue'
import { useAdminBrandsStore } from '@/stores/adminStore/adminBrandsStore'

definePageMeta({ layout: 'admin' })

const brandsStore = useAdminBrandsStore()
const router = useRouter()

async function handleCreate(payload: { data: BrandInsert | BrandUpdate, file: File | null }) {
  const success = await brandsStore.createBrand(payload.data as BrandInsert, payload.file)
  if (success)
    router.push('/admin/brands')
}
</script>

<template>
  <div class="p-4 md:p-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold mb-6">
        Новый бренд
      </h1>
      <BrandForm @submit="handleCreate" />
    </div>
  </div>
</template>
