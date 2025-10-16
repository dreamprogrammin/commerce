<script setup lang="ts">
import type { BrandInsert, BrandUpdate } from '@/types'
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
</script>

<template>
  <div class="p-4 md:p-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold mb-6">
        Редактирование бренда
      </h1>
      <div v-if="isLoading && !currentBrand">
        Загрузка...
      </div>
      <BrandForm
        v-else
        :initial-data="currentBrand"
        @submit="handleUpdate"
      />
    </div>
  </div>
</template>
