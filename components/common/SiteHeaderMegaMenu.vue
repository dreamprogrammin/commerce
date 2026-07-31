<script setup lang="ts">
import type { CategoryMenuItem } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

/**
 * Мега-меню «Каталог» (SiteHeader.dc.html — панель с рельсом 274px).
 *
 * Слева — рельс корневых категорий (переключение по наведению/клику),
 * справа — группы (2-й уровень) с сеткой карточек-картинок (3-й уровень).
 * Данные — реальные из `categoriesStore.menuTree`, поэтому структура
 * адаптивна: у листовой категории 2-го уровня показываем её саму карточкой.
 *
 * Панель телепортируется в body и лежит НИЖЕ шапки (z:99 < шапка z:100),
 * чтобы кнопка-переключатель «Каталог/✕» оставалась кликабельной.
 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const categoriesStore = useCategoriesStore()
const { getVariantUrl } = useSupabaseStorage()

const menuTree = computed(() => categoriesStore.menuTree)
const activeIndex = ref(0)

// Тёплые пастельные подложки карточек — по корневой категории (как в прототипе).
const TINTS = ['#dff0ff', '#ffe9f3', '#fff3d9', '#e6f7e9', '#f1e9ff', '#e0f5f7']
const tint = computed(() => TINTS[activeIndex.value % TINTS.length])
const cardStyle = computed(() => ({
  background: `linear-gradient(165deg, color-mix(in oklch, ${tint.value} 55%, #fff), ${tint.value})`,
}))

const activeRoot = computed<CategoryMenuItem | undefined>(() => menuTree.value[activeIndex.value])

interface MegaItem { id: string, name: string, href: string, image: string | null, showCaption: boolean }
interface MegaGroup { id: string, name: string, href: string, items: MegaItem[] }

const groups = computed<MegaGroup[]>(() => {
  const root = activeRoot.value
  if (!root?.children?.length)
    return []
  return root.children.map((l2) => {
    const kids = l2.children ?? []
    const hasKids = kids.length > 0
    const source = hasKids ? kids : [l2]
    return {
      id: l2.id,
      name: l2.name,
      href: l2.href,
      items: source.map(it => ({
        id: it.id,
        name: it.name,
        href: it.href,
        image: catImage(it.image_url),
        showCaption: hasKids,
      })),
    }
  })
})

function catImage(url: string | null): string | null {
  return url ? getVariantUrl(BUCKET_NAME_CATEGORY, url, 'sm') : null
}

function railThumb(root: CategoryMenuItem): string | null {
  return catImage(root.image_url)
}

const panelRef = ref<HTMLElement | null>(null)

onMounted(() => {
  // Идемпотентно: стор не перезапрашивает, если данные уже есть.
  categoriesStore.fetchCategoryData()
})

// Между открытиями сохраняем последнюю активную категорию (как в прототипе);
// на первую сбрасываем ТОЛЬКО если индекс вышел за пределы дерева. При открытии
// переносим фокус в панель — иначе клавиатурный юзер остаётся на кнопке.
watch(() => props.open, (isOpen) => {
  if (!isOpen)
    return
  if (activeIndex.value >= menuTree.value.length)
    activeIndex.value = 0
  categoriesStore.fetchCategoryData()
  nextTick(() => panelRef.value?.querySelector<HTMLElement>('.sh-rail')?.focus())
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sh-scrim">
      <div v-if="open" class="sh-scrim" @click="emit('close')" />
    </Transition>

    <Transition name="sh-mega">
      <div v-if="open" id="sh-catalog-panel" ref="panelRef" class="sh-mega" role="group" aria-label="Каталог товаров">
        <!-- Рельс корневых категорий -->
        <div class="sh-mega__rail">
          <button
            v-for="(root, i) in menuTree"
            :key="root.id"
            type="button"
            class="sh-rail"
            :class="{ 'sh-rail--active': i === activeIndex }"
            @mouseenter="activeIndex = i"
            @focus="activeIndex = i"
            @click="activeIndex = i"
          >
            <span class="sh-rail__icon">
              <Icon v-if="root.icon_name" :name="root.icon_name" class="size-5" />
              <img v-else-if="railThumb(root)" :src="railThumb(root)!" :alt="root.name" class="sh-rail__thumb" loading="lazy">
              <Icon v-else name="lucide:shapes" class="size-5" />
            </span>
            <span class="sh-rail__name">{{ root.name }}</span>
            <Icon v-if="i === activeIndex" name="lucide:chevron-right" class="size-4 shrink-0 opacity-60" />
          </button>

          <div v-if="!menuTree.length" class="sh-rail__skeleton">
            <div v-for="n in 6" :key="n" class="sh-rail__skeleton-row" />
          </div>
        </div>

        <!-- Контент активной категории -->
        <div class="sh-mega__content">
          <NuxtLink
            v-if="activeRoot"
            :to="activeRoot.href"
            class="sh-mega__title"
            @click="emit('close')"
          >
            {{ activeRoot.name }}
            <Icon name="lucide:arrow-right" class="size-5 opacity-50" />
          </NuxtLink>

          <div v-for="group in groups" :key="group.id" class="sh-group">
            <NuxtLink :to="group.href" class="sh-group__title" @click="emit('close')">
              {{ group.name }}
              <Icon name="lucide:chevron-right" class="size-[15px] opacity-50" />
            </NuxtLink>
            <div class="sh-group__grid">
              <NuxtLink
                v-for="item in group.items"
                :key="item.id"
                :to="item.href"
                class="sh-card-link"
                @click="emit('close')"
              >
                <span class="sh-card" :style="cardStyle">
                  <img
                    v-if="item.image"
                    :src="item.image"
                    :alt="item.name"
                    class="sh-card__img"
                    loading="lazy"
                    decoding="async"
                  >
                  <Icon v-else name="lucide:image" class="size-7 text-muted-foreground/40" />
                </span>
                <span v-if="item.showCaption" class="sh-card__caption">{{ item.name }}</span>
              </NuxtLink>
            </div>
          </div>

          <div v-if="menuTree.length && !groups.length" class="sh-mega__empty">
            <Icon name="lucide:package-open" class="size-10 text-muted-foreground/50" />
            <p>В этой категории пока нет подкатегорий</p>
          </div>
          <div v-else-if="!menuTree.length" class="sh-mega__empty">
            <Icon name="lucide:loader-2" class="size-6 animate-spin text-primary" />
            <p>Загружаем каталог…</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sh-scrim {
  position: fixed;
  inset: 0;
  z-index: 98;
  background: rgb(15 23 42 / 0.42);
}

.sh-mega {
  position: fixed;
  top: 88px;
  left: 50%;
  transform: translateX(-50%);
  width: min(1160px, 94vw);
  height: min(80vh, 720px);
  z-index: 99;
  background: var(--popover);
  border-radius: 20px;
  box-shadow: 0 30px 70px rgb(15 23 42 / 0.28);
  overflow: hidden;
  display: flex;
}

/* ---- Рельс ---- */
.sh-mega__rail {
  width: 274px;
  flex: none;
  border-right: 1px solid var(--border);
  padding: 16px 12px;
  overflow-y: auto;
  background: color-mix(in oklch, var(--muted) 40%, var(--popover));
}

.sh-rail {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 12px;
  text-align: left;
  color: var(--foreground);
  font: 600 15px var(--font-sans);
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.sh-rail--active {
  background: var(--brand-surface);
  color: var(--primary);
  font-weight: 700;
}

.sh-rail__icon {
  flex: none;
  display: grid;
  place-content: center;
  width: 28px;
  height: 28px;
}

.sh-rail__thumb {
  width: 26px;
  height: 26px;
  object-fit: contain;
  mix-blend-mode: multiply;
}

.sh-rail__name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sh-rail__skeleton {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sh-rail__skeleton-row {
  height: 44px;
  border-radius: 12px;
  background: var(--muted);
  animation: sh-pulse 1.2s ease-in-out infinite;
}

/* ---- Контент ---- */
.sh-mega__content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 22px 30px 30px;
}

.sh-mega__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font: 700 24px var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--foreground);
  text-decoration: none;
}

.sh-mega__title:hover {
  color: var(--primary);
}

.sh-group {
  margin-top: 22px;
}

.sh-group__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 0 13px;
  font: 700 16px var(--font-sans);
  color: var(--foreground);
  text-decoration: none;
}

.sh-group__title:hover {
  color: var(--primary);
}

.sh-group__grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 18px 16px;
}

@media (max-width: 1100px) {
  .sh-group__grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.sh-card-link {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-decoration: none;
  transition: transform 0.15s ease;
}

.sh-card-link:hover {
  transform: translateY(-3px);
}

.sh-card {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1.2;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 0.75);
  box-shadow:
    inset 0 1.5px 0 rgb(255 255 255 / 0.9),
    inset 0 -12px 20px rgb(15 23 42 / 0.07),
    0 6px 16px rgb(15 23 42 / 0.09);
}

.sh-card__img {
  width: 82%;
  height: 82%;
  object-fit: contain;
  mix-blend-mode: multiply;
}

.sh-card__caption {
  font: 600 13px var(--font-sans);
  color: var(--foreground);
  line-height: 1.25;
}

.sh-mega__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 0;
  color: var(--muted-foreground);
  font-size: 14px;
  font-weight: 500;
}

/* ---- Анимации ---- */
.sh-scrim-enter-active,
.sh-scrim-leave-active {
  transition: opacity 0.22s ease;
}
.sh-scrim-enter-from,
.sh-scrim-leave-to {
  opacity: 0;
}

.sh-mega-enter-active {
  transition:
    opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.sh-mega-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.sh-mega-enter-from,
.sh-mega-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-14px) scale(0.985);
}

@keyframes sh-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sh-mega-enter-active,
  .sh-mega-leave-active {
    transition: opacity 0.2s ease;
  }
  .sh-mega-enter-from,
  .sh-mega-leave-to {
    transform: translateX(-50%);
  }
  .sh-card-link:hover {
    transform: none;
  }
}

:global(.dark) .sh-rail__thumb,
:global(.dark) .sh-card__img {
  mix-blend-mode: normal;
}
</style>
