<script setup lang="ts">
/**
 * Липкая панель разделов лендинга — макет `Бренд LEGO v2.dc.html`.
 *
 * Страница длинная, и без неё до подборки надо прокрутить два экрана.
 * Клеится под шапкой сайта: на телефоне её роль играет фиксированный таббар
 * (76px, см. `pageShell`), на десктопе — липкая шапка.
 */
const props = defineProps<{
  items: { key: string, label: string }[]
}>()

const emit = defineEmits<{ jump: [key: string] }>()
</script>

<template>
  <nav v-if="props.items.length" class="blsn" aria-label="Разделы страницы">
    <div class="blsn__inner">
      <button
        v-for="item in props.items"
        :key="item.key"
        type="button"
        class="blsn__item"
        @click="emit('jump', item.key)"
      >
        {{ item.label }}
      </button>
    </div>
  </nav>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .blsn {
    position: sticky;
    top: 76px;
    z-index: 30;
    border-bottom: 1px solid var(--border);
    background: rgb(255 255 255 / 0.92);
    backdrop-filter: blur(14px) saturate(1.5);
  }

  .blsn__inner {
    display: flex;
    gap: 6px;
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 9px var(--page-gutter);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .blsn__inner::-webkit-scrollbar {
    display: none;
  }

  .blsn__item {
    flex: none;
    height: 38px;
    padding: 0 16px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--muted-foreground);
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    cursor: pointer;
  }

  .blsn__item:hover {
    background: var(--muted);
    color: var(--foreground);
  }

  @media (min-width: 1024px) {
    .blsn {
      top: 74px;
    }
  }
}
</style>
