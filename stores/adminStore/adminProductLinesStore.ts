// stores/adminStore/adminProductLinesStore.ts
// Управление линейками продуктов (подбренды/франшизы: Barbie, Hot Wheels и т.д.)

import type { Database, ProductLine, ProductLineInsert, ProductLineUpdate } from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT_LINES } from '@/constants'

export const useAdminProductLinesStore = defineStore('adminProductLinesStore', () => {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile, getPublicUrl } = useSupabaseStorage()

  const productLines = ref<ProductLine[]>([])
  const currentProductLine = ref<ProductLine | null>(null)
  const isLoading = ref(false)

  // --- SEO: Уведомление поисковиков ---
  async function notifySearchEngines(lineSlug: string) {
    try {
      await $fetch('/api/seo/notify-indexing', {
        method: 'POST',
        body: { urls: [`/line/${lineSlug}`], type: 'updated' },
      })
    }
    catch {
      // Не блокируем основной флоу
    }
  }

  // -- ЧТЕНИЕ --

  /**
   * Загрузить все линейки продуктов
   */
  async function fetchProductLines() {
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('product_lines')
        .select('*')
        .order('name', { ascending: true })

      if (error)
        throw error
      productLines.value = (data || []) as ProductLine[]
    }
    catch (error: any) {
      toast.error('Ошибка загрузки линеек', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Загрузить линейки определенного бренда
   */
  async function fetchProductLinesByBrand(brandId: string): Promise<ProductLine[]> {
    try {
      const { data, error } = await supabase
        .from('product_lines')
        .select('*')
        .eq('brand_id', brandId)
        .order('name', { ascending: true })

      if (error)
        throw error
      return (data || []) as ProductLine[]
    }
    catch (error: any) {
      toast.error('Ошибка загрузки линеек бренда', { description: error.message })
      return []
    }
  }

  /**
   * Загрузить одну линейку по ID
   */
  async function fetchProductLineById(id: string) {
    isLoading.value = true
    currentProductLine.value = null
    try {
      const { data, error } = await supabase
        .from('product_lines')
        .select('*')
        .eq('id', id)
        .single()

      if (error)
        throw error
      currentProductLine.value = data as ProductLine
    }
    catch (error: any) {
      toast.error('Ошибка загрузки линейки', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  // -- СОЗДАНИЕ --

  async function createProductLine(
    lineData: ProductLineInsert,
    logoFile: File | null,
  ): Promise<ProductLine | null> {
    isLoading.value = true
    try {
      let logoUrl: string | null = null

      if (logoFile) {
        const uploadedPath = await uploadFile(logoFile, {
          bucketName: BUCKET_NAME_PRODUCT_LINES,
          seoName: lineData.name ? `line-${lineData.name}` : undefined,
        })
        if (!uploadedPath)
          throw new Error('Не удалось загрузить логотип.')
        logoUrl = uploadedPath
      }

      const { data: newLine, error } = await supabase
        .from('product_lines')
        .insert({
          ...lineData,
          logo_url: logoUrl,
        })
        .select()
        .single()

      if (error || !newLine)
        throw error

      toast.success(`Линейка "${newLine.name}" успешно создана.`)
      await fetchProductLines()

      if (newLine.slug) {
        notifySearchEngines(newLine.slug)
      }

      return newLine as ProductLine
    }
    catch (error: any) {
      toast.error('Ошибка создания линейки', { description: error.message })
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  // -- ОБНОВЛЕНИЕ --

  async function updateProductLine(
    id: string,
    lineData: ProductLineUpdate,
    newLogoFile: File | null,
    oldLogoUrl: string | null,
  ): Promise<boolean> {
    isLoading.value = true
    try {
      let logoUrl = lineData.logo_url

      if (newLogoFile) {
        // Удаляем старый логотип
        if (oldLogoUrl) {
          await removeFile(BUCKET_NAME_PRODUCT_LINES, [oldLogoUrl])
        }

        const uploadedPath = await uploadFile(newLogoFile, {
          bucketName: BUCKET_NAME_PRODUCT_LINES,
          seoName: lineData.name ? `line-${lineData.name}` : undefined,
        })
        if (!uploadedPath)
          throw new Error('Не удалось загрузить новый логотип.')
        logoUrl = uploadedPath
      }

      const { error } = await supabase
        .from('product_lines')
        .update({
          ...lineData,
          logo_url: logoUrl,
        })
        .eq('id', id)

      if (error)
        throw error

      toast.success(`Линейка "${lineData.name}" успешно обновлена.`)
      await fetchProductLines()

      if (lineData.slug) {
        notifySearchEngines(lineData.slug)
      }

      return true
    }
    catch (error: any) {
      toast.error('Ошибка обновления линейки', { description: error.message })
      return false
    }
    finally {
      isLoading.value = false
    }
  }

  // -- УДАЛЕНИЕ --

  async function deleteProductLine(line: ProductLine): Promise<boolean> {
    try {
      // Удаляем логотип из хранилища
      if (line.logo_url) {
        await removeFile(BUCKET_NAME_PRODUCT_LINES, [line.logo_url])
      }

      const { error } = await supabase
        .from('product_lines')
        .delete()
        .eq('id', line.id)

      if (error)
        throw error

      toast.success(`Линейка "${line.name}" удалена.`)
      productLines.value = productLines.value.filter(l => l.id !== line.id)

      return true
    }
    catch (error: any) {
      toast.error('Ошибка удаления линейки', { description: error.message })
      return false
    }
  }

  return {
    productLines,
    currentProductLine,
    isLoading,
    getPublicUrl,
    fetchProductLines,
    fetchProductLinesByBrand,
    fetchProductLineById,
    createProductLine,
    updateProductLine,
    deleteProductLine,
  }
})
