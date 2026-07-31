<script setup lang="ts">
defineProps<{
  sortActive: boolean
  filtersActive: boolean
  hasActiveFilters: boolean
}>()

defineEmits<{
  sort: []
  filters: []
}>()

// Scroll-aware visibility: hide once scrolled past 280px while moving down,
// reveal again on any upward scroll or once back near the top. Mirrors
// MobileBottomNav.vue's thresholds for a consistent feel across the app's
// scroll-hiding chrome (this one slides up instead of down).
const isHidden = ref(false)
let lastScrollY = 0
let ticking = false

function applyScroll() {
  ticking = false
  const y = window.scrollY
  const dy = y - lastScrollY
  if (dy > 6 && y > 280)
    isHidden.value = true
  else if (dy < -6 || y < 120)
    isHidden.value = false
  lastScrollY = y
}

function onScroll() {
  if (!ticking) {
    ticking = true
    requestAnimationFrame(applyScroll)
  }
}

onMounted(() => {
  lastScrollY = window.scrollY
  window.addEventListener('scroll', onScroll, { passive: true })
})
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <div class="cmh-bar lg:hidden" :class="{ 'cmh-bar--hidden': isHidden }">
    <div class="cmh-pill">
      <NuxtLink to="/" class="cmh-logo" aria-label="Ухтышка — на главную">
        <svg viewBox="11 0 64 78" width="22" height="27" aria-hidden="true">
          <g transform="translate(2 0)"><g transform="rotate(-9 42 72)">
            <rect x="37.5" y="4" width="9" height="13" rx="4.5" fill="#fff" />
            <rect x="34" y="15.5" width="16" height="5.5" rx="2.75" fill="rgba(255,255,255,.65)" />
            <path d="M16 36 C16 22.5 68 22.5 68 36 L68 36.5 C68 40.6 64.6 44 60.5 44 L23.5 44 C19.4 44 16 40.6 16 36.5 Z" fill="#fff" />
            <rect x="20" y="46.5" width="44" height="6" rx="3" fill="#ffd34d" />
            <path d="M23 55 L61 55 C57.5 61.5 50 64 45 70 A3.8 3.8 0 0 1 39 70 C34 64 26.5 61.5 23 55 Z" fill="#ff8ac2" />
          </g></g>
        </svg>
      </NuxtLink>

      <CommonSiteHeaderSearch dense />

      <button
        type="button"
        class="cmh-icon-btn"
        :class="{ 'cmh-icon-btn--active': sortActive }"
        aria-label="Сортировка"
        @click="$emit('sort')"
      >
        <Icon name="lucide:arrow-up-down" class="cmh-icon" />
      </button>

      <ClientOnly>
        <button
          type="button"
          class="cmh-icon-btn"
          :class="{ 'cmh-icon-btn--active': filtersActive }"
          aria-label="Фильтры"
          @click="$emit('filters')"
        >
          <Icon name="lucide:sliders-horizontal" class="cmh-icon" />
          <span v-if="hasActiveFilters" class="cmh-badge bg-orange-500" />
        </button>
      </ClientOnly>
    </div>
  </div>
</template>

<style scoped>
.cmh-bar {
  position: sticky;
  top: 0;
  z-index: 40;
  padding: 10px 12px 4px;
  transition:
    opacity 0.28s ease,
    transform 0.28s cubic-bezier(0.32, 0.72, 0.33, 1);
}

.cmh-bar--hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-140%);
}

.cmh-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 8px;
  border-radius: 20px;
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.26));
  backdrop-filter: blur(24px) saturate(1.9);
  -webkit-backdrop-filter: blur(24px) saturate(1.9);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.85),
    inset 0 -1px 1px rgba(15, 23, 42, 0.05),
    0 12px 32px rgba(15, 23, 42, 0.16);
}

.cmh-logo {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: var(--primary);
  display: grid;
  place-content: center;
  box-shadow: var(--shadow-brand);
  text-decoration: none;
}

.cmh-icon-btn {
  position: relative;
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
  display: grid;
  place-content: center;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.cmh-icon-btn--active {
  background: rgba(43, 127, 255, 0.16);
  color: var(--primary);
}

.cmh-icon {
  width: 19px;
  height: 19px;
}

.cmh-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 11px;
  height: 11px;
  border-radius: 999px;
  border: 2px solid #fff;
}
</style>
