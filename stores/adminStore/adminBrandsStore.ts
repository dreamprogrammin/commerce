// stores/adminStore/useAdminBrandsStore.ts

import type { Brand, BrandInsert, BrandPageLayout, BrandUpdate, Database } from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_OPTIMIZATION_ENABLED, IMAGE_VARIANTS, IMAGE_VARIANTS_WIDE } from '@/config/images'
import { BUCKET_NAME_BANNERS, BUCKET_NAME_BRANDS } from '@/constants'
import { generateBlurPlaceholder, generateImageVariants, generateImageVariantsWide } from '@/utils/imageOptimizer'
import { getVariantPathsWide } from '@/utils/storageVariants'

export const useAdminBrandsStore = defineStore('adminBrandsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile, getPublicUrl, generateSeoFileName } = useSupabaseStorage()

  /**
   * Проверяет, является ли путь старым форматом (с расширением файла)
   */
  function _isLegacyPath(url: string): boolean {
    return /\.\w{3,4}$/.test(url)
  }

  /**
   * Возвращает пути всех вариантов для удаления из Storage
   */
  function _getVariantPaths(url: string): string[] {
    if (_isLegacyPath(url)) {
      return [url]
    }
    return Object.values(IMAGE_VARIANTS).map(v => `${url}${v.suffix}.webp`)
  }

  /**
   * Загружает 3 варианта изображения (sm/md/lg) и возвращает базовый путь
   */
  async function _uploadVariants(
    file: File,
    seoName?: string,
  ): Promise<{ basePath: string, blurPlaceholder?: string } | null> {
    if (IMAGE_OPTIMIZATION_ENABLED) {
      // Платный тариф: загружаем оригинал
      let blurDataUrl: string | undefined
      try {
        const blurResult = await generateBlurPlaceholder(file)
        blurDataUrl = blurResult.dataUrl
      }
      catch { /* ignore */ }

      const filePath = await uploadFile(file, {
        bucketName: BUCKET_NAME_BRANDS,
        seoName,
      })
      if (!filePath) {
        return null
      }
      return { basePath: filePath, blurPlaceholder: blurDataUrl }
    }

    // Бесплатный тариф: генерируем 3 варианта
    const variants = await generateImageVariants(file)
    const baseSeoName = generateSeoFileName(file, seoName).replace(/\.[^.]+$/, '')

    const uploadResults = await Promise.all(
      (['sm', 'md', 'lg'] as const).map(variant =>
        uploadFile(variants[variant], {
          bucketName: BUCKET_NAME_BRANDS,
          customFileName: `${baseSeoName}${IMAGE_VARIANTS[variant].suffix}.webp`,
        }),
      ),
    )

    if (!uploadResults[0]) {
      return null
    }

    // Базовый путь без суффикса и расширения
    const basePath = baseSeoName
    return { basePath, blurPlaceholder: variants.blurPlaceholder }
  }

  /**
   * Загружает 3 варианта wide-изображения (sm/md/lg) для баннера бренда
   */
  async function _uploadBannerVariants(
    file: File,
    seoName?: string,
  ): Promise<{ basePath: string, blurPlaceholder?: string } | null> {
    if (IMAGE_OPTIMIZATION_ENABLED) {
      let blurDataUrl: string | undefined
      try {
        const blurResult = await generateBlurPlaceholder(file)
        blurDataUrl = blurResult.dataUrl
      }
      catch { /* ignore */ }

      const filePath = await uploadFile(file, {
        bucketName: BUCKET_NAME_BANNERS,
        seoName,
      })
      if (!filePath) {
        return null
      }
      return { basePath: filePath, blurPlaceholder: blurDataUrl }
    }

    const variants = await generateImageVariantsWide(file)
    const baseSeoName = generateSeoFileName(file, seoName).replace(/\.[^.]+$/, '')

    const uploadResults = await Promise.all(
      (['sm', 'md', 'lg'] as const).map(variant =>
        uploadFile(variants[variant], {
          bucketName: BUCKET_NAME_BANNERS,
          customFileName: `${baseSeoName}${IMAGE_VARIANTS_WIDE[variant].suffix}.webp`,
        }),
      ),
    )

    if (!uploadResults[0]) {
      return null
    }

    return { basePath: baseSeoName, blurPlaceholder: variants.blurPlaceholder }
  }

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

  async function createBrand(brandData: BrandInsert, logoFile: File | null, bannerFile?: File | null, mobileBannerFile?: File | null): Promise<Brand | null> {
    isLoading.value = true
    try {
      if (logoFile) {
        const result = await _uploadVariants(logoFile, brandData.name ? `brand-${brandData.name}` : undefined)
        if (!result)
          throw new Error('Не удалось загрузить логотип.')
        brandData.logo_url = result.basePath
      }

      // Загрузка баннера для кастомной страницы
      if (bannerFile && brandData.is_custom_page) {
        const bannerResult = await _uploadBannerVariants(bannerFile, brandData.name ? `brand-banner-${brandData.name}` : undefined)
        if (!bannerResult)
          throw new Error('Не удалось загрузить баннер.')
        const currentLayout = (brandData.page_layout as BrandPageLayout | null) || { heroBanner: null, heroBannerBlur: null, featuredLineIds: [] }
        currentLayout.heroBanner = bannerResult.basePath
        currentLayout.heroBannerBlur = bannerResult.blurPlaceholder || null
        brandData.page_layout = currentLayout as unknown as BrandInsert['page_layout']
      }

      // Загрузка мобильного баннера
      if (mobileBannerFile && brandData.is_custom_page) {
        const mobileResult = await _uploadBannerVariants(mobileBannerFile, brandData.name ? `brand-banner-mobile-${brandData.name}` : undefined)
        if (!mobileResult)
          throw new Error('Не удалось загрузить мобильный баннер.')
        const currentLayout = (brandData.page_layout as BrandPageLayout | null) || { heroBanner: null, heroBannerBlur: null, featuredLineIds: [] }
        currentLayout.heroBannerMobile = mobileResult.basePath
        currentLayout.heroBannerMobileBlur = mobileResult.blurPlaceholder || null
        brandData.page_layout = currentLayout as unknown as BrandInsert['page_layout']
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

  async function updateBrand(id: string, brandData: BrandUpdate, newLogoFile: File | null, bannerFile?: File | null, mobileBannerFile?: File | null) {
    isLoading.value = true
    try {
      if (newLogoFile) {
        // Удаляем старый логотип (все варианты)
        if (brandData.logo_url) {
          await removeFile(BUCKET_NAME_BRANDS, _getVariantPaths(brandData.logo_url))
        }
        const result = await _uploadVariants(newLogoFile, brandData.name ? `brand-${brandData.name}` : undefined)
        if (!result)
          throw new Error('Не удалось загрузить новый логотип.')
        brandData.logo_url = result.basePath
      }

      // Загрузка/обновление баннера для кастомной страницы
      if (bannerFile && brandData.is_custom_page) {
        // Удаляем старый баннер если есть
        const oldLayout = brandData.page_layout as BrandPageLayout | null
        if (oldLayout?.heroBanner) {
          await removeFile(BUCKET_NAME_BANNERS, getVariantPathsWide(oldLayout.heroBanner))
        }
        const bannerResult = await _uploadBannerVariants(bannerFile, brandData.name ? `brand-banner-${brandData.name}` : undefined)
        if (!bannerResult)
          throw new Error('Не удалось загрузить баннер.')
        const currentLayout = oldLayout || { heroBanner: null, heroBannerBlur: null, featuredLineIds: [] }
        currentLayout.heroBanner = bannerResult.basePath
        currentLayout.heroBannerBlur = bannerResult.blurPlaceholder || null
        brandData.page_layout = currentLayout as unknown as BrandUpdate['page_layout']
      }

      // Загрузка/обновление мобильного баннера
      if (mobileBannerFile && brandData.is_custom_page) {
        const oldLayout = brandData.page_layout as BrandPageLayout | null
        if (oldLayout?.heroBannerMobile) {
          await removeFile(BUCKET_NAME_BANNERS, getVariantPathsWide(oldLayout.heroBannerMobile))
        }
        const mobileResult = await _uploadBannerVariants(mobileBannerFile, brandData.name ? `brand-banner-mobile-${brandData.name}` : undefined)
        if (!mobileResult)
          throw new Error('Не удалось загрузить мобильный баннер.')
        const currentLayout = (brandData.page_layout as BrandPageLayout | null) || { heroBanner: null, heroBannerBlur: null, featuredLineIds: [] }
        currentLayout.heroBannerMobile = mobileResult.basePath
        currentLayout.heroBannerMobileBlur = mobileResult.blurPlaceholder || null
        brandData.page_layout = currentLayout as unknown as BrandUpdate['page_layout']
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
      // Удаляем все варианты логотипа из хранилища
      if (brandToDelete.logo_url) {
        await removeFile(BUCKET_NAME_BRANDS, _getVariantPaths(brandToDelete.logo_url))
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
