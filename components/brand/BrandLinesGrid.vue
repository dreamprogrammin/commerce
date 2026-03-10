<script setup lang="ts">
import type { ProductLine } from '@/types'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
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
       Desktop: glass-панель с поиском + раскрывающаяся сетка
  ──────────────────────────────────────────────────────── -->
  <div
    class="hidden md:block rounded-2xl border border-white/40 bg-white/50 backdrop-blur-md shadow-sm shadow-black/5 overflow-hidden"
  >
    <!-- Glass-шапка: заголовок + счётчик + поиск -->
    <div class="flex items-center gap-3 px-4 py-3 border-b border-black/5 bg-white/20">
      <div class="flex items-center gap-2 shrink-0">
        <span class="text-sm font-semibold">Коллекции</span>
        <span class="text-[11px] text-muted-foreground bg-black/6 rounded-full px-2 py-0.5 tabular-nums">
          {{ filteredLines.length }}
        </span>
      </div>
      <div class="flex-1 max-w-xs">
        <BrandSearchInput
          v-model="searchQuery"
          placeholder="Поиск..."
          aria-label="Поиск по коллекциям бренда"
        />
      </div>
    </div>

    <!-- Тело: карточки -->
    <div class="p-3">
      <!-- Первые N -->
      <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        <NuxtLink
          v-for="line in visibleLines"
          :key="line.id"
          :to="getCatalogLink(line.id)"
          class="group relative aspect-[3/2] rounded-xl overflow-hidden border border-white/30 hover:border-primary/40 hover:shadow-md transition-all duration-200"
        >
          <template v-if="line.logo_url">
            <ProgressiveImage
              :src="getLogoUrl(line.logo_url)"
              :alt="line.name"
              object-fit="cover"
              placeholder-type="shimmer"
              class="w-full h-full group-hover:scale-105 transition-transform duration-300"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
            <div class="absolute inset-x-0 bottom-0 px-2 py-1.5">
              <span class="text-white text-[11px] md:text-xs font-semibold line-clamp-1 drop-shadow">{{ line.name }}</span>
            </div>
          </template>
          <div
            v-else
            class="w-full h-full bg-gradient-to-br from-primary/70 to-secondary/70 flex items-end p-2"
          >
            <span class="text-white text-[11px] md:text-xs font-semibold line-clamp-2">{{ line.name }}</span>
          </div>
        </NuxtLink>
      </div>

      <!-- Раскрывающийся блок -->
      <div
        class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out"
        :style="{
          maxHeight: isExpanded ? `${Math.ceil(extraLines.length / 6) * 180}px` : '0px',
          opacity: isExpanded ? 1 : 0,
          marginTop: isExpanded && extraLines.length ? '0.5rem' : '0',
        }"
      >
        <NuxtLink
          v-for="line in extraLines"
          :key="line.id"
          :to="getCatalogLink(line.id)"
          class="group relative aspect-[3/2] rounded-xl overflow-hidden border border-white/30 hover:border-primary/40 hover:shadow-md transition-all duration-200"
        >
          <template v-if="line.logo_url">
            <ProgressiveImage
              :src="getLogoUrl(line.logo_url)"
              :alt="line.name"
              object-fit="cover"
              placeholder-type="shimmer"
              class="w-full h-full group-hover:scale-105 transition-transform duration-300"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
            <div class="absolute inset-x-0 bottom-0 px-2 py-1.5">
              <span class="text-white text-[11px] md:text-xs font-semibold line-clamp-1 drop-shadow">{{ line.name }}</span>
            </div>
          </template>
          <div
            v-else
            class="w-full h-full bg-gradient-to-br from-primary/70 to-secondary/70 flex items-end p-2"
          >
            <span class="text-white text-[11px] md:text-xs font-semibold line-clamp-2">{{ line.name }}</span>
          </div>
        </NuxtLink>
      </div>

      <!-- Пустой поиск -->
      <div v-if="filteredLines.length === 0 && searchQuery" class="py-8 text-center text-muted-foreground text-sm">
        Ничего не найдено
      </div>
    </div>

    <!-- Glass-футер: кнопка раскрытия -->
    <div
      v-if="hasMore"
      class="border-t border-black/5 bg-white/10 flex justify-center py-2"
    >
      <button
        class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-lg hover:bg-black/5"
        @click="isExpanded = !isExpanded"
      >
        <ChevronDown
          class="w-3.5 h-3.5 transition-transform duration-300"
          :class="isExpanded ? 'rotate-180' : ''"
        />
        {{ isExpanded ? 'Свернуть' : `Ещё ${extraLines.length} коллекций` }}
      </button>
    </div>
  </div>

  <!-- Drawer со всеми коллекциями (только мобилка) -->
  <BrandLinesDrawer
    v-model="isDrawerOpen"
    :lines="allLines"
    :brand-id="brandId"
  />
</template>
