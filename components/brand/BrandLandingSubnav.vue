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
 *
 * ТЁМНАЯ, в отличие от каталожной. Там капсула светлая и висит над пёстрой
 * сеткой товаров, а тут под ней почти всё белое: мозаика серий, карточки
 * подборки, текст о бренде. Светлое стекло на белом не читалось вовсе.
 * Тёмно-синий берём из шапки лендинга — полоса, тёмная карточка хита и
 * нижний блок заявки сделаны тем же цветом.
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
    gap: 8px;
    align-items: center;
    /*
     * Капсула по содержимому, а не во всю ширину. В каталоге её заполняет
     * поиск, здесь же четыре кнопки — растянутая полоса выглядела бы пустой.
     * На телефоне кнопки и так шире экрана, и капсула занимает всю ширину.
     */
    width: max-content;
    max-width: 100%;
    padding: 7px 8px;
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 24px;
    background: linear-gradient(150deg, rgb(11 36 68 / 0.92), rgb(0 57 106 / 0.88));
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.16),
      0 14px 34px rgb(6 20 44 / 0.32);
    backdrop-filter: blur(24px) saturate(1.6);
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
    border: 1px solid rgb(255 255 255 / 0.16);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.1);
    color: #eaf2ff;
    font-weight: 600;
    font-size: 13.5px;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }

  /* Наведение — жёлтым: тот же акцент, что у кнопки «Подобрать набор». */
  .blsn__pill:hover {
    border-color: rgb(253 199 0 / 0.55);
    background: rgb(253 199 0 / 0.16);
    color: #ffd84d;
  }
}
</style>
