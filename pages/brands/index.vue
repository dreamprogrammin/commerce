<script setup lang="ts">
import type { Brand } from '@/types'
import { useQuery } from '@tanstack/vue-query'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_BRANDS } from '@/constants'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'

definePageMeta({
  layout: 'default',
})

const supabase = useSupabaseClient()
const { getImageUrl } = useSupabaseStorage()

// SSR prefetch всех брендов
const { data: brandsSsrData } = await useAsyncData('all-brands-ssr', async () => {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .order('name')

  if (error) {
    console.error('Error fetching brands:', error)
    return []
  }

  return data as Brand[]
}, { server: true, lazy: false })

// Загрузка брендов с TanStack Query для persistence
const { data: brands } = useQuery<Brand[]>({
  queryKey: ['catalog-brands-all'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .order('name')

    if (error) {
      console.error('Error fetching brands:', error)
      return []
    }

    return data as Brand[]
  },
  staleTime: 5 * 60 * 1000, // 5 минут
  gcTime: 15 * 60 * 1000, // 15 минут
  initialData: brandsSsrData.value || undefined,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
})

// SEO
const siteName = 'Ухтышка'
const siteUrl = 'https://uhti.kz'

useSeoMeta({
  title: `Все бренды игрушек | ${siteName}`,
  description: 'Широкий выбор брендов детских игрушек и товаров для детей. LEGO, Mattel, Hasbro и другие популярные производители. Доставка по Казахстану.',
  ogTitle: `Все бренды игрушек | ${siteName}`,
  ogDescription: 'Широкий выбор брендов детских игрушек и товаров для детей. LEGO, Mattel, Hasbro и другие популярные производители.',
  ogImage: `${siteUrl}/og-brands.jpeg`,
  ogUrl: `${siteUrl}/brands`,
})

useSchemaOrg([
  {
    '@type': 'CollectionPage',
    'name': 'Все бренды игрушек',
    'description': 'Каталог брендов детских игрушек и товаров для детей',
    'url': `${siteUrl}/brands`,
  },
])

// Получить URL логотипа бренда
function getBrandLogoUrl(logoUrl: string | null) {
  if (!logoUrl) return null
  return getImageUrl(BUCKET_NAME_BRANDS, logoUrl, IMAGE_SIZES.BRAND_LOGO)
}

// Группировка брендов по первой букве
const groupedBrands = computed(() => {
  if (!brands.value) return {}

  const groups: Record<string, Brand[]> = {}

  brands.value.forEach((brand) => {
    const firstLetter = brand.name.charAt(0).toUpperCase()
    if (!groups[firstLetter]) {
      groups[firstLetter] = []
    }
    groups[firstLetter].push(brand)
  })

  return groups
})

const alphabetLetters = computed(() => Object.keys(groupedBrands.value).sort())
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-background to-muted/20">
    <div class="container mx-auto px-4 py-8 md:py-12">
      <!-- Заголовок -->
      <div class="mb-8 md:mb-12 text-center">
        <h1 class="text-3xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-4">
          Все бренды
        </h1>
        <p class="text-muted-foreground text-sm md:text-base max-w-2xl mx-auto">
          Широкий выбор брендов детских игрушек и товаров для детей
        </p>

        <!-- Счётчик брендов -->
        <div v-if="brands && brands.length > 0" class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full">
          <Icon name="lucide:package" class="w-4 h-4 text-primary" />
          <span class="text-sm font-medium">
            {{ brands.length }} {{ brands.length === 1 ? 'бренд' : brands.length < 5 ? 'бренда' : 'брендов' }}
          </span>
        </div>
      </div>

      <!-- Алфавитная навигация -->
      <div v-if="alphabetLetters.length > 0" class="mb-8 sticky top-16 z-10 bg-background/95 backdrop-blur-sm border-y py-4">
        <div class="flex flex-wrap justify-center gap-2">
          <a
            v-for="letter in alphabetLetters"
            :key="letter"
            :href="`#letter-${letter}`"
            class="w-8 h-8 flex items-center justify-center rounded-md bg-muted hover:bg-primary hover:text-primary-foreground transition-colors text-sm font-medium"
          >
            {{ letter }}
          </a>
        </div>
      </div>

      <!-- Бренды по буквам -->
      <div v-if="brands && brands.length > 0" class="space-y-12">
        <section
          v-for="letter in alphabetLetters"
          :id="`letter-${letter}`"
          :key="letter"
          class="scroll-mt-32"
        >
          <!-- Буква-заголовок -->
          <h2 class="text-2xl md:text-3xl font-bold mb-6 text-primary">
            {{ letter }}
          </h2>

          <!-- Сетка брендов -->
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            <NuxtLink
              v-for="brand in groupedBrands[letter]"
              :key="brand.id"
              :to="`/brand/${brand.slug}`"
              class="group"
            >
              <Card class="h-full overflow-hidden hover:shadow-lg transition-all duration-300 hover:scale-105">
                <CardContent class="p-4 flex flex-col items-center justify-center gap-3 h-32">
                  <!-- Логотип бренда -->
                  <div v-if="brand.logo_url" class="w-full h-16 flex items-center justify-center">
                    <ProgressiveImage
                      :src="getBrandLogoUrl(brand.logo_url) || ''"
                      :alt="`Логотип ${brand.name}`"
                      aspect-ratio="auto"
                      object-fit="contain"
                      placeholder-type="shimmer"
                      class="max-w-full max-h-full"
                    />
                  </div>

                  <!-- Название бренда (если нет логотипа или как подпись) -->
                  <p class="text-sm font-medium text-center line-clamp-2 group-hover:text-primary transition-colors">
                    {{ brand.name }}
                  </p>
                </CardContent>
              </Card>
            </NuxtLink>
          </div>
        </section>
      </div>

      <!-- Пустое состояние -->
      <div v-else-if="!brands || brands.length === 0" class="text-center py-16">
        <Icon name="lucide:package-x" class="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h3 class="text-xl font-semibold mb-2">
          Бренды не найдены
        </h3>
        <p class="text-muted-foreground">
          В данный момент нет доступных брендов
        </p>
      </div>
    </div>
  </div>
</template>
