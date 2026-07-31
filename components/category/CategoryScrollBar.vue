<script setup lang="ts">
import type { BrandForFilter, CategoryRow, SortByType } from '@/types'
import { useCartStore } from '@/stores/publicStore/cartStore'

const props = withDefaults(defineProps<{
  subcategories?: CategoryRow[]
  activeSubcategoryIds?: string[]
  brands?: BrandForFilter[]
  activeBrandIds?: string[]
}>(), {
  subcategories: () => [],
  activeSubcategoryIds: () => [],
  brands: () => [],
  activeBrandIds: () => [],
})

const emit = defineEmits<{ toggleSubcategory: [id: string], toggleBrand: [id: string] }>()

const sortBy = defineModel<SortByType>('sortBy', { required: true })

const cartStore = useCartStore()
const cartCount = computed(() => cartStore.items.length)

const sortOptions: { value: SortByType, label: string }[] = [
  { value: 'popularity', label: 'Популярные' },
  { value: 'newest', label: 'По новизне' },
  { value: 'price_asc', label: 'Цена: по возрастанию' },
  { value: 'price_desc', label: 'Цена: по убыванию' },
]

const currentSortLabel = computed(
  () => sortOptions.find(o => o.value === sortBy.value)?.label ?? sortOptions[0].label,
)

const sortOpen = ref(false)
const catOpen = ref(false)
const brandOpen = ref(false)

// Three independent Popovers, but only one open at a time (mirrors the
// catToggle()/brandToggle()/onCloseSort() coupling in CatalogScrollBar.dc.html).
watch(sortOpen, (open) => {
  if (open) {
    catOpen.value = false
    brandOpen.value = false
  }
})
watch(catOpen, (open) => {
  if (open) {
    sortOpen.value = false
    brandOpen.value = false
  }
})
watch(brandOpen, (open) => {
  if (open) {
    sortOpen.value = false
    catOpen.value = false
  }
})

function selectSort(value: SortByType) {
  sortBy.value = value
  sortOpen.value = false
}

function onToggleSubcategory(id: string) {
  emit('toggleSubcategory', id)
}

function onToggleBrand(id: string) {
  emit('toggleBrand', id)
}

// Self-contained scroll visibility, same convention as CategoryMobileHeader:
// hidden until the user has scrolled well past the category header, so the
// bar only appears once the page's own in-flow controls are out of reach.
const shown = ref(false)
let ticking = false

function applyScroll() {
  ticking = false
  shown.value = window.scrollY > 400
}

function onScroll() {
  if (!ticking) {
    ticking = true
    requestAnimationFrame(applyScroll)
  }
}

// Close any open menu when the bar itself slides away, so a teleported
// Popover never floats detached from its (now invisible) trigger.
watch(shown, (visible) => {
  if (!visible) {
    sortOpen.value = false
    catOpen.value = false
    brandOpen.value = false
  }
})

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  shown.value = window.scrollY > 400
})
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <div class="hidden lg:block csb-bar" :class="{ 'csb-bar--shown': shown }">
    <div class="csb-inner">
      <div class="csb-capsule">
        <div class="csb-search">
          <CommonSiteHeaderSearch dense show-submit-button />
        </div>

        <Popover v-model:open="sortOpen">
          <PopoverTrigger as-child>
            <button type="button" class="csb-pill" :class="{ 'csb-pill--active': sortOpen }">
              {{ currentSortLabel }}
              <Icon name="lucide:chevron-down" class="csb-chev" :class="{ 'csb-chev--open': sortOpen }" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            :side-offset="8"
            class="w-56 p-1.5 rounded-2xl bg-white/90 backdrop-blur-xl border-white/70 shadow-xl flex flex-col gap-0.5"
          >
            <button
              v-for="opt in sortOptions"
              :key="opt.value"
              type="button"
              class="csb-item"
              :class="{ 'csb-item--active': sortBy === opt.value }"
              @click="selectSort(opt.value)"
            >
              {{ opt.label }}
            </button>
          </PopoverContent>
        </Popover>

        <Popover v-if="props.subcategories.length > 0" v-model:open="catOpen">
          <PopoverTrigger as-child>
            <button type="button" class="csb-pill" :class="{ 'csb-pill--active': catOpen }">
              <span>Категории</span>
              <span v-if="props.activeSubcategoryIds.length > 0" class="csb-pill-badge">{{ props.activeSubcategoryIds.length }}</span>
              <Icon name="lucide:chevron-down" class="csb-chev" :class="{ 'csb-chev--open': catOpen }" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            :side-offset="8"
            class="w-64 p-1.5 rounded-2xl bg-white/90 backdrop-blur-xl border-white/70 shadow-xl flex flex-col gap-0.5 max-h-[70vh] overflow-y-auto"
          >
            <button
              v-for="cat in props.subcategories"
              :key="cat.id"
              type="button"
              class="csb-item"
              :class="{ 'csb-item--active': props.activeSubcategoryIds.includes(cat.id) }"
              @click="onToggleSubcategory(cat.id)"
            >
              <span class="csb-item__label">{{ cat.name }}</span>
              <Icon v-if="props.activeSubcategoryIds.includes(cat.id)" name="lucide:check" class="csb-item__check" />
            </button>
          </PopoverContent>
        </Popover>

        <!-- Бренды — из обновлённого CatalogScrollBar.dc.html. «Возраст» из того же
           макета сознательно не портирован: нет ни одного реального атрибута/колонки
           под возрастные диапазоны в каталоге (min_age_years/max_age_years есть только
           у персональных рекомендаций по детям, не у фильтрации каталога) — фиктивные
           бакеты вида «0–1 год» добавлять не стали, тот же принцип, что и со «Скидкой»
           в Категория.dc.html. -->
        <Popover v-if="props.brands.length > 0" v-model:open="brandOpen">
          <PopoverTrigger as-child>
            <button type="button" class="csb-pill" :class="{ 'csb-pill--active': brandOpen }">
              <span>Бренды</span>
              <span v-if="props.activeBrandIds.length > 0" class="csb-pill-badge">{{ props.activeBrandIds.length }}</span>
              <Icon name="lucide:chevron-down" class="csb-chev" :class="{ 'csb-chev--open': brandOpen }" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            :side-offset="8"
            class="w-60 p-1.5 rounded-2xl bg-white/90 backdrop-blur-xl border-white/70 shadow-xl flex flex-col gap-0.5 max-h-[70vh] overflow-y-auto"
          >
            <button
              v-for="brand in props.brands"
              :key="brand.id"
              type="button"
              class="csb-item"
              :class="{ 'csb-item--active': props.activeBrandIds.includes(brand.id) }"
              @click="onToggleBrand(brand.id)"
            >
              <span class="csb-item__label">{{ brand.name }}</span>
              <Icon v-if="props.activeBrandIds.includes(brand.id)" name="lucide:check" class="csb-item__check" />
            </button>
          </PopoverContent>
        </Popover>

        <NuxtLink to="/cart" aria-label="Корзина" class="csb-cart">
          <Icon name="solar:cart-3-bold" class="csb-cart__icon" />
          <ClientOnly>
            <span v-if="cartCount > 0" class="csb-cart-badge">{{ cartCount > 9 ? '9+' : cartCount }}</span>
          </ClientOnly>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.csb-bar {
  /* top:0, not 74px — SiteHeader renders non-sticky on this page
     (:sticky="false" in layouts/CatalogListing.vue), so nothing fixed sits
     above this bar to dock under. Transparent + just vertical padding: the
     bar itself carries no chrome any more, the floating glass capsule below
     is what's actually visible (matches the updated .dc.html). */
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 90;
  padding: 10px 0 4px;
  opacity: 0;
  transform: translateY(-130%);
  pointer-events: none;
  transition:
    transform 0.3s cubic-bezier(0.32, 0.72, 0.33, 1),
    opacity 0.3s ease;
}

.csb-bar--shown {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.csb-inner {
  /* Matches the real page container (carouselContainerVariants({ contained:
     'always' }) → container max-w-screen-2xl + px-[var(--page-gutter)]), not
     the .dc.html mockup's own isolated-preview 1360px/clamp() — this bar sits
     directly above that container's content and must line up with its edges.
     Отступ берём из той же переменной, а не числом. */
  max-width: 1536px;
  margin: 0 auto;
  padding: 0 var(--page-gutter);
}

.csb-capsule {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 8px;
  border-radius: 24px;
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.26));
  backdrop-filter: blur(24px) saturate(1.9);
  -webkit-backdrop-filter: blur(24px) saturate(1.9);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.85),
    inset 0 -1px 1px rgba(15, 23, 42, 0.05),
    0 12px 32px rgba(15, 23, 42, 0.16);
}

.csb-search {
  /* Capped, not left to fill all remaining space: at the real container's
     1536px width (see .csb-inner) an uncapped SiteHeaderSearch (itself
     flex:1 internally) ballooned to ~900px, swamping the row and reducing
     Сортировка/Категории/Бренды to a squeezed cluster at the far right.
     Bounded back to a normal pill-sized search field; the freed-up space
     flows to the gap before .csb-cart via its own margin-left:auto. */
  flex: 1 1 320px;
  min-width: 290px;
  max-width: 420px;
}

/* Более явный вид поисковой строки в этой капсуле — стандартный
   .sh-search--dense рассчитан на мобильную плашку (там фон и так
   контрастирует, а прямоугольная rounded-12px форма не соседствует с
   pill-кнопками). Здесь та же полупрозрачность сливалась со стеклянной
   капсулой, а прямые углы читались как случайный прямоугольник среди
   круглых .csb-pill — из-за этого поиск не опознавался как часть общего
   ряда управляющих элементов. Форма и тень теперь буквально повторяют
   .csb-pill (капсула + тот же 3-слойный inset/drop shadow), просто с
   непрозрачным белым фоном вместо стеклянного градиента — читается как
   явный, приподнятый контрол, а не плоский прямоугольник. Переопределяем
   только для этого потребителя, не трогая CommonSiteHeaderSearch.vue —
   мобильная плашка использует те же классы. */
.csb-search :deep(.sh-search--dense) {
  background: #fff;
  border-radius: 999px;
  border-color: rgba(255, 255, 255, 0.9);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    inset 0 -1px 2px rgba(15, 23, 42, 0.06),
    0 6px 18px rgba(15, 23, 42, 0.1);
}

.csb-pill {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 15px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.9), rgba(224, 233, 247, 0.55));
  backdrop-filter: blur(14px) saturate(1.7);
  -webkit-backdrop-filter: blur(14px) saturate(1.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    inset 0 -1px 2px rgba(15, 23, 42, 0.06),
    0 6px 18px rgba(15, 23, 42, 0.1);
  font: 600 13.5px var(--font-sans);
  color: var(--foreground);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.csb-pill--active {
  border-color: var(--primary);
  background: linear-gradient(150deg, rgba(219, 234, 254, 0.95), rgba(191, 219, 254, 0.6));
}

.csb-pill-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--primary);
  color: #fff;
  font: 700 11px var(--font-sans);
}

.csb-chev {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--primary);
  transition: transform 0.2s ease;
}

.csb-chev--open {
  transform: rotate(180deg);
}

.csb-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: none;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
  font: 400 14.5px var(--font-sans);
  color: var(--foreground);
  white-space: nowrap;
  transition: background 0.12s ease;
}

.csb-item:hover {
  background: var(--muted);
}

.csb-item--active {
  font-weight: 700;
}

.csb-item__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.csb-item__check {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--primary);
}

.csb-cart {
  position: relative;
  flex: none;
  margin-left: auto;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.9), rgba(224, 233, 247, 0.55));
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    0 4px 12px rgba(15, 23, 42, 0.1);
  display: grid;
  place-content: center;
  text-decoration: none;
  transition: background 0.15s ease;
}

.csb-cart:hover {
  background: rgba(43, 127, 255, 0.12);
}

.csb-cart__icon {
  width: 20px;
  height: 20px;
  color: var(--primary);
}

.csb-cart-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font: 700 10.5px var(--font-sans);
  display: grid;
  place-content: center;
  border: 2px solid #fff;
}
</style>
