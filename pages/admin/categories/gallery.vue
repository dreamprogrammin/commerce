<script setup lang="ts">
import type { CategoryRow } from '@/types'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { useAdminCategoriesStore } from '@/stores/adminStore/adminCategoriesStore'

definePageMeta({ layout: 'admin' })

const adminCategoriesStore = useAdminCategoriesStore()
const { getVariantUrl, getPublicUrl } = useSupabaseStorage()

const { pending: isLoading } = useAsyncData(
  'admin-categories-gallery',
  async () => {
    await adminCategoriesStore.fetchAllCategories()
    return true
  },
)

const search = ref('')
const filterMode = ref<'all' | 'with-image' | 'no-image'>('all')

const categoryMap = computed(() => {
  const map = new Map<string, CategoryRow>()
  adminCategoriesStore.allCategories.forEach(cat => map.set(cat.id, cat))
  return map
})

function getBreadcrumb(cat: CategoryRow): string[] {
  const path: string[] = []
  let current: CategoryRow | undefined = cat
  const visited = new Set<string>()

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    path.unshift(current.name)
    current = current.parent_id ? categoryMap.value.get(current.parent_id) : undefined
  }

  return path
}

function getRootId(cat: CategoryRow): string {
  let current = cat
  const visited = new Set<string>()

  while (current.parent_id && !visited.has(current.id)) {
    visited.add(current.id)
    const parent = categoryMap.value.get(current.parent_id)
    if (!parent)
      break
    current = parent
  }

  return current.id
}

interface CategorySection {
  root: CategoryRow
  items: (CategoryRow & { breadcrumb: string[] })[]
}

const sections = computed<CategorySection[]>(() => {
  const bySection = new Map<string, CategorySection>()
  const query = search.value.trim().toLowerCase()

  adminCategoriesStore.allCategories.forEach((cat) => {
    if (filterMode.value === 'with-image' && !cat.image_url)
      return
    if (filterMode.value === 'no-image' && cat.image_url)
      return
    if (query && !cat.name.toLowerCase().includes(query))
      return

    const rootId = getRootId(cat)
    const root = categoryMap.value.get(rootId)
    if (!root)
      return

    if (!bySection.has(rootId)) {
      bySection.set(rootId, { root, items: [] })
    }

    bySection.get(rootId)!.items.push({ ...cat, breadcrumb: getBreadcrumb(cat) })
  })

  return Array.from(bySection.values())
    .sort((a, b) => a.root.display_order - b.root.display_order)
    .map(section => ({
      ...section,
      items: section.items.sort((a, b) => {
        if (a.breadcrumb.length !== b.breadcrumb.length)
          return a.breadcrumb.length - b.breadcrumb.length
        return a.display_order - b.display_order
      }),
    }))
})

const totalCount = computed(() => adminCategoriesStore.allCategories.length)
const withImageCount = computed(() => adminCategoriesStore.allCategories.filter(c => c.image_url).length)
const noImageCount = computed(() => totalCount.value - withImageCount.value)

function getFullImageUrl(imageUrl: string | null): string | null {
  return getVariantUrl(BUCKET_NAME_CATEGORY, imageUrl, 'lg') || getPublicUrl(BUCKET_NAME_CATEGORY, imageUrl)
}

async function copyImageUrl(imageUrl: string | null) {
  const url = getFullImageUrl(imageUrl)
  if (!url) {
    toast.error('У категории нет изображения')
    return
  }

  await navigator.clipboard.writeText(url)
  toast.success('Ссылка на изображение скопирована')
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8 space-y-6">
    <div class="flex flex-col md:flex-row justify-between md:items-center gap-4">
      <div>
        <h1 class="text-3xl font-bold text-foreground">
          Галерея категорий
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          Все категории с изображениями — для выгрузки референсов в Figma
        </p>
      </div>
      <div class="flex gap-2">
        <Badge variant="secondary">
          Всего: {{ totalCount }}
        </Badge>
        <Badge variant="default">
          С фото: {{ withImageCount }}
        </Badge>
        <Badge variant="destructive">
          Без фото: {{ noImageCount }}
        </Badge>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row gap-3">
      <Input
        v-model="search"
        placeholder="Поиск по названию категории..."
        class="sm:max-w-xs"
      />
      <div class="flex gap-2">
        <Button
          size="sm"
          :variant="filterMode === 'all' ? 'default' : 'outline'"
          @click="filterMode = 'all'"
        >
          Все
        </Button>
        <Button
          size="sm"
          :variant="filterMode === 'with-image' ? 'default' : 'outline'"
          @click="filterMode = 'with-image'"
        >
          С фото
        </Button>
        <Button
          size="sm"
          :variant="filterMode === 'no-image' ? 'default' : 'outline'"
          @click="filterMode = 'no-image'"
        >
          Без фото
        </Button>
      </div>
    </div>

    <div v-if="isLoading" class="text-center py-20 text-muted-foreground">
      Загрузка категорий...
    </div>

    <div v-else-if="sections.length === 0" class="text-center py-20 text-muted-foreground">
      Ничего не найдено
    </div>

    <div v-else class="space-y-10">
      <section v-for="section in sections" :key="section.root.id">
        <h2 class="text-lg font-semibold mb-3 flex items-center gap-2">
          <Icon name="lucide:folder-tree" class="w-5 h-5 text-primary" />
          {{ section.root.name }}
          <span class="text-sm font-normal text-muted-foreground">({{ section.items.length }})</span>
        </h2>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <div
            v-for="item in section.items"
            :key="item.id"
            class="group rounded-xl border bg-card overflow-hidden flex flex-col"
          >
            <div class="relative aspect-square bg-white flex items-center justify-center">
              <img
                v-if="item.image_url"
                :src="getFullImageUrl(item.image_url) || ''"
                :alt="item.name"
                class="w-full h-full object-contain p-2"
                loading="lazy"
              >
              <div v-else class="flex flex-col items-center gap-2 text-muted-foreground">
                <Icon :name="item.icon_name || 'lucide:image-off'" class="w-8 h-8" />
                <span class="text-xs">нет фото</span>
              </div>

              <Button
                v-if="item.image_url"
                size="icon"
                variant="secondary"
                class="absolute top-2 right-2 w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity shadow"
                title="Скопировать ссылку на изображение"
                @click="copyImageUrl(item.image_url)"
              >
                <Icon name="lucide:copy" class="w-4 h-4" />
              </Button>
            </div>

            <div class="p-3 space-y-1">
              <p class="text-sm font-medium leading-snug truncate" :title="item.name">
                {{ item.name }}
              </p>
              <p class="text-xs text-muted-foreground truncate" :title="item.breadcrumb.join(' / ')">
                {{ item.breadcrumb.join(' / ') }}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
