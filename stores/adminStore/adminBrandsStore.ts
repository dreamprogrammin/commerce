// stores/adminStore/useAdminBrandsStore.ts

import type { Brand, BrandInsert, BrandUpdate, Database } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS } from '@/constants'

export const useAdminBrandsStore = defineStore('adminBrandsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile, getPublicUrl } = useSupabaseStorage()

  const brands = ref<Brand[]>([])
  const currentBrand = ref<Brand | null>(null)
  const isLoading = ref(false)

  // --- SEO: Уведомление поисковиков о изменениях брендов ---
  async function notifySearchEngines(brandSlug: string) {
    try {
      await $fetch('/api/seo/notify-indexing', {
        method: 'POST',
        body: { urls: [`/brand/${brandSlug}`], type: 'updated' },
      })
    }
    catch {
      // Не блокируем основной флоу если SEO уведомление не прошло
    }
  }

  // -- ЧТЕНИЕ --
  async function fetchBrands() {
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .order('name', { ascending: true })
      if (error)
        throw error
      brands.value = data || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки брендов', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  async function fetchBrandById(id: string) {
    isLoading.value = true
    currentBrand.value = null
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .eq('id', id)
        .single()
      if (error)
        throw error
      currentBrand.value = data
    }
    catch (error: any) {
      toast.error('Ошибка загрузки бренда', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  async function createBrand(brandData: BrandInsert, logoFile: File | null): Promise<Brand | null> {
    isLoading.value = true
    try {
      if (logoFile) {
        const filePath = `${uuidv4()}-${logoFile.name}`
        const uploadedPath = await uploadFile(logoFile, {
          bucketName: BUCKET_NAME_BRANDS,
          filePathPrefix: filePath,
        })
        if (!uploadedPath)
          throw new Error('Не удалось загрузить логотип.')
        brandData.logo_url = uploadedPath
      }

      const { data: newBrand, error } = await supabase
        .from('brands')
        .insert(brandData)
        .select() // <-- 1. Запрашиваем созданную запись обратно
        .single() // <-- 2. Указываем, что ожидаем одну запись

      if (error || !newBrand)
        throw error

      toast.success(`Бренд "${newBrand.name}" успешно создан.`)
      await fetchBrands()

      // 🔍 SEO: Уведомляем поисковики о новом бренде
      if (newBrand.slug) {
        notifySearchEngines(newBrand.slug)
      }

      return newBrand
    }
    catch (error: any) {
      toast.error('Ошибка создания бренда', { description: error.message })
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  async function updateBrand(id: string, brandData: BrandUpdate, newLogoFile: File | null) {
    isLoading.value = true
    try {
      if (newLogoFile) {
        // Если есть старый логотип, удаляем его
        if (brandData.logo_url) {
          await removeFile(BUCKET_NAME_BRANDS, [brandData.logo_url])
        }
        // Загружаем новый
        const filePath = `${uuidv4()}-${newLogoFile.name}`
        const uploadedPath = await uploadFile(newLogoFile, {
          bucketName: BUCKET_NAME_BRANDS,
          filePathPrefix: filePath,
        })
        if (!uploadedPath)
          throw new Error('Не удалось загрузить новый логотип.')
        brandData.logo_url = uploadedPath
      }

      const { error } = await supabase.from('brands').update(brandData).eq('id', id)
      if (error)
        throw error

      toast.success(`Бренд "${brandData.name}" успешно обновлен.`)
      await fetchBrands() // Обновляем список

      // 🔍 SEO: Уведомляем поисковики об обновлённом бренде
      if (brandData.slug) {
        notifySearchEngines(brandData.slug)
      }

      return true
    }
    catch (error: any) {
      toast.error('Ошибка обновления бренда', { description: error.message })
      return false
    }
    finally {
      isLoading.value = false
    }
  }

  async function deleteBrand(brandToDelete: Brand) {
    try {
      // Сначала удаляем логотип из хранилища
      if (brandToDelete.logo_url) {
        await removeFile(BUCKET_NAME_BRANDS, [brandToDelete.logo_url])
      }
      // Затем удаляем запись из БД
      const { error } = await supabase.from('brands').delete().eq('id', brandToDelete.id)
      if (error)
        throw error

      toast.success(`Бренд "${brandToDelete.name}" удален.`)
      // Обновляем локальное состояние
      brands.value = brands.value.filter(b => b.id !== brandToDelete.id)
    }
    catch (error: any) {
      toast.error('Ошибка удаления бренда', { description: error.message })
    }
  }

  return {
    brands,
    currentBrand,
    isLoading,
    getPublicUrl,
    fetchBrands,
    fetchBrandById,
    createBrand,
    updateBrand,
    deleteBrand,
  }
})
