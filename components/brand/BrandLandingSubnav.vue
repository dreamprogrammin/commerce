<script setup lang="ts">
/**
 * Панель разделов лендинга — в том же виде, что панель каталога
 * (`components/category/CategoryScrollBar.vue`): плавающая стеклянная
 * капсула, которая выезжает сверху после прокрутки.
 *
 * Почему не липкая полоса, как было. Липкая шапка сайта на этой странице
 * погашена (`setShellOverride` в `pages/brand/[slug].vue`) — ровно как в
 * каталоге, где `SiteHeader` нелипкий и сверху плавает капсула. Две липкие
 * полосы друг над другом съедали треть экрана на телефоне.
 *
 * Порог 400px и подход к анимации взяты у каталожной панели: появление —
 * только сдвигом, без `opacity`. Любое промежуточное значение прозрачности
 * делает элемент новым backdrop-root, и `backdrop-filter` капсулы перестаёт
 * размывать страницу.
 */
const props = defineProps<{
  items: { key: string, label: string }[]
}>()

const emit = defineEmits<{ jump: [key: string] }>()

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

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  applyScroll()
})

onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <div v-if="props.items.length" class="blsn" :class="{ 'blsn--shown': shown }">
    <div class="blsn__inner">
      <nav class="blsn__capsule" aria-label="Разделы страницы">
        <button
          v-for="item in props.items"
          :key="item.key"
          type="button"
          class="blsn__pill"
          @click="emit('jump', item.key)"
        >
          {{ item.label }}
        </button>
      </nav>
    </div>
  </div>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .blsn {
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
    z-index: 90;
    padding: 10px 0 4px;
    transform: translateY(-130%);
    visibility: hidden;
    pointer-events: none;
    transition:
      transform 0.3s cubic-bezier(0.32, 0.72, 0.33, 1),
      visibility 0s linear 0.3s;
  }

  .blsn--shown {
    transform: translateY(0);
    visibility: visible;
    pointer-events: auto;
    transition:
      transform 0.3s cubic-bezier(0.32, 0.72, 0.33, 1),
      visibility 0s;
  }

  /* Ширина и отступы — как у содержимого страницы, чтобы капсула встала по
     тем же краям. */
  .blsn__inner {
    max-width: 1536px;
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }

  .blsn__capsule {
    display: flex;
    gap: 9px;
    align-items: center;
    /*
     * Капсула по содержимому, а не во всю ширину. В каталоге её заполняет
     * поиск, здесь же четыре кнопки — растянутая полоса выглядела бы пустой.
     * На телефоне кнопки и так шире экрана, и капсула занимает всю ширину.
     */
    width: max-content;
    max-width: 100%;
    padding: 7px 8px;
    border: 1px solid rgb(255 255 255 / 0.7);
    border-radius: 24px;
    background: linear-gradient(150deg, rgb(255 255 255 / 0.62), rgb(255 255 255 / 0.26));
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.85),
      inset 0 -1px 1px rgb(15 23 42 / 0.05),
      0 12px 32px rgb(15 23 42 / 0.16);
    backdrop-filter: blur(24px) saturate(1.9);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .blsn__capsule::-webkit-scrollbar {
    display: none;
  }

  .blsn__pill {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 15px;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 999px;
    background: linear-gradient(150deg, rgb(255 255 255 / 0.9), rgb(224 233 247 / 0.55));
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.95),
      inset 0 -1px 2px rgb(15 23 42 / 0.06),
      0 6px 18px rgb(15 23 42 / 0.1);
    backdrop-filter: blur(14px) saturate(1.7);
    color: var(--foreground);
    font-weight: 600;
    font-size: 13.5px;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .blsn__pill:hover {
    border-color: rgb(43 127 255 / 0.35);
    color: var(--primary);
  }
}
</style>
