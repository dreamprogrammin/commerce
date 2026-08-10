<script setup lang="ts">
import { toast } from 'vue-sonner'

const props = defineProps<{
  productId: string
  productName: string
  thumbUrl?: string | null
  backTo?: string
}>()

const router = useRouter()
const { isWishlisted, toggleWishlist } = useProductWishlist(
  () => props.productId,
  () => props.productName,
)

async function share() {
  const url = window.location.href
  try {
    if (navigator.share) {
      await navigator.share({ title: props.productName, url })
      return
    }
    await navigator.clipboard.writeText(url)
    toast.success('Ссылка скопирована')
  }
  catch {
    // Пользователь закрыл системный шит — это не ошибка
  }
}

function goBack() {
  if (props.backTo) {
    router.push(props.backTo)
    return
  }
  if (window.history.length > 1)
    router.back()
  else router.push('/catalog')
}
</script>

<template>
  <div class="pmh-bar lg:hidden">
    <div class="pmh-pill">
      <button type="button" class="pmh-icon-btn" aria-label="Назад" @click="goBack">
        <Icon name="lucide:arrow-left" class="size-[22px]" />
      </button>

      <span class="pmh-thumb">
        <ProgressiveImage
          v-if="thumbUrl"
          :src="thumbUrl"
          :alt="productName"
          object-fit="contain"
          placeholder-type="shimmer"
          class="size-[30px]"
        />
        <Icon v-else name="lucide:package" class="size-4 text-muted-foreground" />
      </span>

      <span class="pmh-title">{{ productName }}</span>

      <button type="button" class="pmh-icon-btn" aria-label="Поделиться" @click="share">
        <Icon name="lucide:share" class="size-5" />
      </button>

      <button
        type="button"
        class="pmh-icon-btn"
        :class="{ 'pmh-icon-btn--wished': isWishlisted }"
        :aria-pressed="isWishlisted"
        :aria-label="isWishlisted ? 'Убрать из избранного' : 'В избранное'"
        @click="toggleWishlist"
      >
        <Icon
          :name="isWishlisted ? 'line-md:heart-filled' : 'line-md:heart'"
          class="size-[21px]"
        />
      </button>
    </div>
  </div>
</template>

<style scoped>
.pmh-bar {
  position: sticky;
  top: 0;
  z-index: 60;
  padding: 8px var(--page-gutter) 6px;
  background: linear-gradient(180deg, var(--page-surface) 62%, transparent);
}

.pmh-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 7px;
  border-radius: 20px;
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.26));
  -webkit-backdrop-filter: blur(24px) saturate(1.9);
  backdrop-filter: blur(24px) saturate(1.9);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.85),
    inset 0 -1px 1px rgba(15, 23, 42, 0.05),
    0 12px 32px rgba(15, 23, 42, 0.16);
}

.pmh-icon-btn {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  border: none;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
  display: grid;
  place-content: center;
  transition: color 0.15s ease;
}

.pmh-icon-btn:hover {
  color: var(--primary);
}

.pmh-icon-btn--wished {
  background: rgba(244, 63, 94, 0.12);
  color: var(--destructive);
}

.pmh-icon-btn--wished:hover {
  color: var(--destructive);
}

.pmh-thumb {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--border);
  display: grid;
  place-items: center;
  overflow: hidden;
}

.pmh-title {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  font-size: 14px;
  color: var(--foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
