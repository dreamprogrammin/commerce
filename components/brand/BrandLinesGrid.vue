<script setup lang="ts">
import type { ProductLine } from '@/types'
import { ChevronDown, ChevronRight, Search } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT_LINES } from '@/constants'

const props = defineProps<{
  /** Коллекции для десктоп-сетки (обычно без featured) */
  lines: ProductLine[]
  /** Все коллекции — для мобильного Drawer и счётчика */
  allLines: ProductLine[]
  brandId: string
}>()

const { getVariantUrl } = useSupabaseStorage()

const DESKTOP_VISIBLE_LIMIT = 8

const searchQuery = ref('')
const isExpanded = ref(false)
const isDrawerOpen = ref(false)

// ── Desktop ─────────────────────────────────────────────

const filteredLines = computed(() =>
  props.lines.filter(l =>
    l.name.toLowerCase().includes(searchQuery.value.toLowerCase()),
  ),
)

const visibleLines = computed(() =>
  filteredLines.value.slice(0, DESKTOP_VISIBLE_LIMIT),
)

const extraLines = computed(() =>
  filteredLines.value.slice(DESKTOP_VISIBLE_LIMIT),
)

const hasMore = computed(() =>
  filteredLines.value.length > DESKTOP_VISIBLE_LIMIT,
)

// Сворачиваем при изменении поиска
watch(searchQuery, () => {
  isExpanded.value = false
})

// ── Mobile ───────────────────────────────────────────────

const previewLines = computed(() => props.allLines.slice(0, 3))

const mobileCountLabel = computed(() => {
  const n = props.allLines.length
  return n === 1 ? 'коллекция' : n < 5 ? 'коллекции' : 'коллекций'
})

// ── Shared helpers ───────────────────────────────────────

function getLogoUrl(logoUrl: string | null): string | null {
  if (!logoUrl)
    return null
  return getVariantUrl(BUCKET_NAME_PRODUCT_LINES, logoUrl, 'sm')
}

function getCatalogLink(lineId: string): string {
  return `/catalog/all?brands=${props.brandId}&lines=${lineId}`
}
</script>

<template>
  <!-- ────────────────────────────────────────────────────
       Mobile: компактная строка-превью → открывает Drawer
  ──────────────────────────────────────────────────────── -->
  <button
    class="md:hidden w-full flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border active:bg-muted/60 transition-colors text-left"
    @click="isDrawerOpen = true"
  >
    <!-- 3 миниатюры с лёгким перекрытием -->
    <div class="flex shrink-0">
      <div
        v-for="(line, i) in previewLines"
        :key="line.id"
        class="w-11 h-11 rounded-lg overflow-hidden border-2 border-background shadow-sm"
        :class="i > 0 ? '-ml-2' : ''"
      >
        <img
          v-if="line.logo_url"
          :src="getLogoUrl(line.logo_url) ?? undefined"
          :alt="line.name"
          class="w-full h-full object-cover"
          loading="lazy"
        >
        <div v-else class="w-full h-full bg-gradient-to-br from-primary/80 to-secondary/80" />
      </div>
    </div>

    <!-- Подпись -->
    <div class="flex-1 min-w-0">
      <p class="text-sm font-semibold leading-tight">
        Коллекции
      </p>
      <p class="text-xs text-muted-foreground">
        {{ allLines.length }} {{ mobileCountLabel }}
      </p>
    </div>
    <ChevronRight class="w-4 h-4 text-muted-foreground shrink-0" />
  </button>

  <!-- ────────────────────────────────────────────────────
       Desktop: сетка с поиском + плавное раскрытие
  ──────────────────────────────────────────────────────── -->
  <div class="hidden md:block">
    <!-- Заголовок + поиск -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      <h2 class="text-xl md:text-2xl font-bold shrink-0">
        Коллекции
      </h2>
      <div class="relative sm:max-w-xs w-full">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          v-model="searchQuery"
          placeholder="Поиск коллекции..."
          class="pl-9"
        />
      </div>
    </div>

    <!-- Первые N карточек -->
    <div class="grid grid-cols-4 gap-4">
      <NuxtLink
        v-for="line in visibleLines"
        :key="line.id"
        :to="getCatalogLink(line.id)"
        class="group relative aspect-[4/3] rounded-xl overflow-hidden border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-200"
      >
        <template v-if="line.logo_url">
          <ProgressiveImage
            :src="getLogoUrl(line.logo_url)"
            :alt="line.name"
            object-fit="cover"
            placeholder-type="shimmer"
            class="w-full h-full group-hover:scale-105 transition-transform duration-300"
          />
          <div class="absolute inset-x-0 bottom-0 bg-black/50 backdrop-blur-sm px-3 py-2">
            <span class="text-white text-sm font-semibold line-clamp-1">{{ line.name }}</span>
          </div>
        </template>

        <div
          v-else
          class="w-full h-full bg-gradient-to-br from-primary/80 to-secondary/80 flex items-center justify-center p-3 group-hover:scale-105 transition-transform duration-300"
        >
          <span class="text-white text-base font-bold text-center line-clamp-3">{{ line.name }}</span>
        </div>
      </NuxtLink>
    </div>

    <!-- Раскрывающийся блок с остальными карточками -->
    <div
      class="grid grid-cols-4 gap-4 overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out"
      :style="{
        maxHeight: isExpanded ? `${extraLines.length * 400}px` : '0px',
        opacity: isExpanded ? 1 : 0,
        marginTop: isExpanded && extraLines.length ? '1rem' : '0',
      }"
    >
      <NuxtLink
        v-for="line in extraLines"
        :key="line.id"
        :to="getCatalogLink(line.id)"
        class="group relative aspect-[4/3] rounded-xl overflow-hidden border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-200"
      >
        <template v-if="line.logo_url">
          <ProgressiveImage
            :src="getLogoUrl(line.logo_url)"
            :alt="line.name"
            object-fit="cover"
            placeholder-type="shimmer"
            class="w-full h-full group-hover:scale-105 transition-transform duration-300"
          />
          <div class="absolute inset-x-0 bottom-0 bg-black/50 backdrop-blur-sm px-3 py-2">
            <span class="text-white text-sm font-semibold line-clamp-1">{{ line.name }}</span>
          </div>
        </template>

        <div
          v-else
          class="w-full h-full bg-gradient-to-br from-primary/80 to-secondary/80 flex items-center justify-center p-3 group-hover:scale-105 transition-transform duration-300"
        >
          <span class="text-white text-base font-bold text-center line-clamp-3">{{ line.name }}</span>
        </div>
      </NuxtLink>
    </div>

    <!-- Кнопка раскрытия / схлопывания -->
    <div v-if="hasMore" class="flex justify-center mt-4">
      <Button
        variant="outline"
        size="sm"
        class="gap-2"
        @click="isExpanded = !isExpanded"
      >
        <ChevronDown
          class="w-4 h-4 transition-transform duration-300"
          :class="isExpanded ? 'rotate-180' : ''"
        />
        {{ isExpanded ? 'Свернуть' : `Показать ещё коллекции (${extraLines.length})` }}
      </Button>
    </div>

    <!-- Пустой поиск -->
    <div v-if="filteredLines.length === 0 && searchQuery" class="py-10 text-center text-muted-foreground text-sm">
      Коллекции не найдены
    </div>
  </div>

  <!-- Drawer со всеми коллекциями (только мобилка) -->
  <BrandLinesDrawer
    v-model="isDrawerOpen"
    :lines="allLines"
    :brand-id="brandId"
  />
</template>
