<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'

const isVisible = ref(false)
const isTelegramBrowser = ref(false)

onMounted(() => {
  isTelegramBrowser.value = /Telegram/i.test(navigator.userAgent)
  if (!isTelegramBrowser.value)
    return

  const dismissed = localStorage.getItem('tg_browser_banner_dismissed')
  if (dismissed)
    return

  isVisible.value = true
})

function dismiss() {
  isVisible.value = false
  localStorage.setItem('tg_browser_banner_dismissed', '1')
}

async function copyAndOpen() {
  const url = window.location.href
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Ссылка скопирована!', {
      description: 'Вставьте в Safari или Chrome',
    })
  }
  catch {
    const input = document.createElement('input')
    input.value = url
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    toast.success('Ссылка скопирована!')
  }
}
</script>

<template>
  <Transition name="slide">
    <div
      v-if="isVisible"
      class="fixed top-0 inset-x-0 z-[100] bg-sky-500 text-white px-4 py-2.5 flex items-center gap-3 shadow-md"
    >
      <div class="flex-1 min-w-0 text-sm leading-tight">
        Для покупок откройте сайт в браузере телефона
      </div>
      <Button
        size="sm"
        variant="secondary"
        class="shrink-0 text-xs h-8 px-3"
        @click="copyAndOpen"
      >
        Скопировать
      </Button>
      <button
        class="shrink-0 p-1 opacity-70 hover:opacity-100"
        aria-label="Закрыть"
        @click="dismiss"
      >
        <Icon name="lucide:x" class="w-4 h-4" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
