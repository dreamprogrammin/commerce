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
       Desktop: Liquid Glass панель
  ──────────────────────────────────────────────────────── -->
  <div class="hidden md:block liquid-glass-panel relative rounded-[20px] overflow-hidden">
    <!-- Highlight-блик (верхний свет) -->
    <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

    <!-- ── Шапка: заголовок + pill-счётчик + поиск ── -->
    <div class="relative flex items-center gap-3 px-5 py-3.5 border-b border-white/15">
      <div class="flex items-center gap-2.5 shrink-0">
        <span class="text-sm font-semibold tracking-tight">Коллекции</span>
        <span
          class="text-[10px] tabular-nums font-medium px-2 py-0.5 rounded-full
                 bg-white/25 border border-white/30 text-foreground/70
                 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
        >
          {{ filteredLines.length }}
        </span>
      </div>
      <div class="flex-1 max-w-56">
        <BrandSearchInput
          v-model="searchQuery"
          placeholder="Найти серию..."
          aria-label="Поиск по коллекциям бренда"
          glass
        />
      </div>
    </div>

    <!-- ── Тело: сетка карточек ── -->
    <div class="p-3">
      <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
        <NuxtLink
          v-for="line in visibleLines"
          :key="line.id"
          :to="getCatalogLink(line.id)"
          class="liquid-glass-card group"
        >
          <template v-if="line.logo_url">
            <ProgressiveImage
              :src="getLogoUrl(line.logo_url)"
              :alt="line.name"
              object-fit="cover"
              placeholder-type="shimmer"
              class="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-out"
            />
            <div class="absolute inset-x-0 bottom-0 px-2.5 py-2">
              <span class="text-white text-[11px] font-semibold line-clamp-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{{ line.name }}</span>
            </div>
          </template>
          <div v-else class="w-full h-full bg-gradient-to-br from-primary/60 via-primary/40 to-secondary/60 flex items-end p-2.5">
            <span class="text-white text-[11px] font-semibold line-clamp-2 drop-shadow-sm">{{ line.name }}</span>
          </div>
          <!-- Карточка: inner highlight -->
          <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </NuxtLink>
      </div>

      <!-- Раскрывающийся блок -->
      <div
        class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out"
        :style="{
          maxHeight: isExpanded ? `${Math.ceil(extraLines.length / 6) * 200}px` : '0px',
          opacity: isExpanded ? 1 : 0,
          marginTop: isExpanded && extraLines.length ? '0.625rem' : '0',
        }"
      >
        <NuxtLink
          v-for="line in extraLines"
          :key="line.id"
          :to="getCatalogLink(line.id)"
          class="liquid-glass-card group"
        >
          <template v-if="line.logo_url">
            <ProgressiveImage
              :src="getLogoUrl(line.logo_url)"
              :alt="line.name"
              object-fit="cover"
              placeholder-type="shimmer"
              class="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-out"
            />
            <div class="absolute inset-x-0 bottom-0 px-2.5 py-2">
              <span class="text-white text-[11px] font-semibold line-clamp-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{{ line.name }}</span>
            </div>
          </template>
          <div v-else class="w-full h-full bg-gradient-to-br from-primary/60 via-primary/40 to-secondary/60 flex items-end p-2.5">
            <span class="text-white text-[11px] font-semibold line-clamp-2 drop-shadow-sm">{{ line.name }}</span>
          </div>
          <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </NuxtLink>
      </div>

      <!-- Пустой поиск -->
      <div v-if="filteredLines.length === 0 && searchQuery" class="py-10 text-center">
        <p class="text-sm text-muted-foreground/70">Ничего не найдено</p>
      </div>
    </div>

    <!-- ── Футер: кнопка раскрытия ── -->
    <div
      v-if="hasMore"
      class="border-t border-white/15 flex justify-center py-2.5"
    >
      <button
        class="flex items-center gap-1.5 text-[11px] font-medium text-foreground/50
               hover:text-foreground/80 transition-colors px-3.5 py-1 rounded-full
               hover:bg-white/20 active:bg-white/30"
        @click="isExpanded = !isExpanded"
      >
        <ChevronDown
          class="w-3 h-3 transition-transform duration-300"
          :class="isExpanded ? 'rotate-180' : ''"
        />
        {{ isExpanded ? 'Свернуть' : `Ещё ${extraLines.length}` }}
      </button>
    </div>

    <!-- Bottom highlight -->
    <div class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
  </div>

  <!-- Drawer со всеми коллекциями (только мобилка) -->
  <BrandLinesDrawer
    v-model="isDrawerOpen"
    :lines="allLines"
    :brand-id="brandId"
  />
</template>

<style scoped>
/* ── Liquid Glass: панель-контейнер ── */
.liquid-glass-panel {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    0 8px 32px rgba(31, 38, 135, 0.08),
    0 1.5px 4px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

/* ── Liquid Glass: карточка коллекции ── */
.liquid-glass-card {
  position: relative;
  aspect-ratio: 3 / 2;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.06),
    0 0.5px 0 rgba(255, 255, 255, 0.3) inset;
  transition:
    box-shadow 0.3s ease,
    border-color 0.3s ease,
    transform 0.3s ease;
}

.liquid-glass-card:hover {
  border-color: rgba(255, 255, 255, 0.45);
  box-shadow:
    0 8px 24px rgba(31, 38, 135, 0.12),
    0 2px 6px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  transform: translateY(-2px);
}
</style>
