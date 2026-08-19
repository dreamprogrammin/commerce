<script setup lang="ts">
import type { SlideRow } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_SLIDES } from '@/constants'

/**
 * Полноэкранный герой главной (Homepage.dc.html: секция HERO).
 *
 * Отличие от CommonAppCarousel: тот рисует «подглядывающую» карточку со
 * стрелками (basis-4/5, aspect-21/9). Здесь — full-bleed кроссфейд с
 * точечной пагинацией и автоплеем 6с.
 *
 * Раскладка через CSS-медиазапросы (а не JS), чтобы SSR сразу отдавал верную
 * разметку и на телефоне не мелькал десктопный герой:
 *   • < 1024px — position:fixed за листом контента (лист наезжает сверху);
 *   • ≥ 1024px — обычный relative-герой, шапка-overlay поверх него.
 * Порог 1024 совпадает с lg-разделением шапки в layouts/Home.vue.
 *
 * Конвейер изображений скопирован из AppCarousel: art-directed <picture>
 * (мобильный источник < 768px) + LQIP-подложка из blur_placeholder.
 */
const props = withDefaults(
  defineProps<{
    slides?: SlideRow[] | null
    isLoading?: boolean
    error?: Error | null
    autoplay?: boolean
  }>(),
  { autoplay: true },
)

const { getVariantUrlWide } = useSupabaseStorage()

const AUTOPLAY_MS = 6000

function slideUrl(imageUrl: string | null, size: 'sm' | 'md' | 'lg'): string | null {
  if (!imageUrl || imageUrl.startsWith('http'))
    return imageUrl
  return getVariantUrlWide(BUCKET_NAME_SLIDES, imageUrl, size)
}

function buildSrcset(imageUrl: string | null): string | undefined {
  if (!imageUrl || imageUrl.startsWith('http'))
    return undefined
  const parts: string[] = []
  const sm = slideUrl(imageUrl, 'sm')
  const md = slideUrl(imageUrl, 'md')
  const lg = slideUrl(imageUrl, 'lg')
  if (sm)
    parts.push(`${sm} 640w`)
  if (md)
    parts.push(`${md} 1280w`)
  if (lg)
    parts.push(`${lg} 1920w`)
  return parts.length ? parts.join(', ') : undefined
}

const processed = computed(() => {
  if (!props.slides || !Array.isArray(props.slides))
    return []
  return props.slides.map((slide) => {
    const desktopUrl = slideUrl(slide.image_url, 'lg')
    const mobileUrl = slide.image_url_mobile
      ? slideUrl(slide.image_url_mobile, 'md')
      : desktopUrl
    return {
      id: slide.id,
      title: slide.title,
      alt: slide.alt_text || slide.title || 'Слайд',
      href: slide.cta_link || slide.link_url || '',
      external: !!(slide.cta_link || slide.link_url || '').startsWith('http'),
      blur: slide.blur_placeholder,
      desktopUrl,
      desktopSrcset: buildSrcset(slide.image_url),
      mobileUrl,
      mobileSrcset: buildSrcset(slide.image_url_mobile || slide.image_url),
    }
  })
})

const showSkeleton = computed(
  () => props.isLoading && processed.value.length === 0,
)

const active = ref(0)
const loadedIds = reactive(new Set<string>())
function onLoaded(id: string) {
  loadedIds.add(id)
}

watch(
  () => processed.value.length,
  (len) => {
    if (active.value >= len)
      active.value = 0
  },
)

function goTo(i: number) {
  active.value = i
}

// --- автоплей ---
let timer: ReturnType<typeof setInterval> | null = null
const paused = ref(false)

function tick() {
  const len = processed.value.length
  if (len > 1 && !paused.value)
    active.value = (active.value + 1) % len
}

function start() {
  stop()
  if (props.autoplay)
    timer = setInterval(tick, AUTOPLAY_MS)
}

function stop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function onVisibility() {
  paused.value = document.hidden
}

onMounted(() => {
  start()
  document.addEventListener('visibilitychange', onVisibility)
})

onUnmounted(() => {
  stop()
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <section
    class="home-hero"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <!-- скелетон / пустое состояние: просто нейтральный фон героя -->
    <div v-if="showSkeleton" class="home-hero__skeleton" />

    <template v-else>
      <component
        :is="slide.href ? 'a' : 'div'"
        v-for="(slide, i) in processed"
        :key="slide.id"
        :href="slide.href || undefined"
        :target="slide.external ? '_blank' : undefined"
        :rel="slide.external ? 'noopener' : undefined"
        class="home-hero__slide"
        :style="{
          opacity: i === active ? 1 : 0,
          zIndex: i === active ? 2 : 1,
          pointerEvents: i === active && slide.href ? 'auto' : 'none',
        }"
        :aria-hidden="i === active ? undefined : 'true'"
      >
        <img
          v-if="slide.blur && !loadedIds.has(slide.id)"
          :src="slide.blur"
          alt=""
          class="home-hero__lqip"
        >
        <picture>
          <source
            v-if="slide.mobileSrcset"
            media="(max-width: 767px)"
            :srcset="slide.mobileSrcset"
            sizes="100vw"
          >
          <img
            v-if="slide.desktopUrl"
            :src="slide.desktopUrl"
            :srcset="slide.desktopSrcset"
            sizes="100vw"
            :alt="slide.alt"
            class="home-hero__img"
            :fetchpriority="i === 0 ? 'high' : 'auto'"
            :loading="i === 0 ? 'eager' : 'lazy'"
            decoding="async"
            @load="onLoaded(slide.id)"
            @error="onLoaded(slide.id)"
          >
        </picture>
      </component>

      <!-- точки -->
      <div v-if="processed.length > 1" class="home-hero__dots">
        <button
          v-for="(slide, i) in processed"
          :key="`dot-${slide.id}`"
          type="button"
          class="home-hero__dot"
          :class="{ 'home-hero__dot--active': i === active }"
          :aria-label="`Слайд ${i + 1}`"
          :aria-current="i === active ? 'true' : undefined"
          @click="goTo(i)"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .home-hero {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: min(62vh, 540px);
    overflow: hidden;
    background: #dfe7ee;
    z-index: 0;
  }

  .home-hero__skeleton {
    position: absolute;
    inset: 0;
    background: #dfe7ee;
  }

  .home-hero__slide {
    position: absolute;
    inset: 0;
    display: block;
    cursor: pointer;
    transition: opacity 0.7s ease;
  }

  .home-hero__lqip {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: blur(24px);
    transform: scale(1.1);
  }

  .home-hero__img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .home-hero__dots {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 30px;
    z-index: 6;
    display: flex;
    justify-content: center;
    gap: 7px;
  }

  .home-hero__dot {
    width: 9px;
    height: 9px;
    padding: 0;
    border: none;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    transition: all 0.25s ease;
  }

  .home-hero__dot--active {
    width: 26px;
    background: #fff;
  }

  @media (min-width: 1024px) {
    .home-hero {
      position: relative;
      height: clamp(560px, 80vh, 760px);
    }

    .home-hero__dots {
      bottom: clamp(20px, 3vw, 34px);
    }
  }
}
</style>
