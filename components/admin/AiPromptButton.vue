<script setup lang="ts">
import type { AdminPromptKind } from '@/constants/adminPrompts'
import { toast } from 'vue-sonner'
import { buildAdminPrompt } from '@/constants/adminPrompts'

/**
 * Кнопка «Скопировать промпт» в формах товара, раздела и бренда: кладёт в
 * буфер обмена промпт для нейросети с тем, что уже заполнено в форме
 * (constants/adminPrompts.ts). Контент-менеджер вставляет его в ChatGPT или
 * Claude, дописывает факты с коробки, а ответ раскладывает по полям формы.
 */
const props = defineProps<{
  kind: AdminPromptKind
  data?: Record<string, string | number | null | undefined>
}>()

const copied = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | null = null

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  // Без https (локальный стенд по IP) Clipboard API нет — старый способ.
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  if (!ok)
    throw new Error('copy failed')
}

async function copy() {
  try {
    await writeClipboard(buildAdminPrompt(props.kind, props.data))
    copied.value = true
    if (resetTimer)
      clearTimeout(resetTimer)
    resetTimer = setTimeout(() => (copied.value = false), 2500)
    toast.success('Промпт скопирован', {
      description: 'Вставьте в ChatGPT или Claude, допишите факты с коробки в блок ДАННЫЕ.',
    })
  }
  catch {
    toast.error('Не удалось скопировать', { description: 'Браузер не дал доступ к буферу обмена.' })
  }
}

onBeforeUnmount(() => {
  if (resetTimer)
    clearTimeout(resetTimer)
})
</script>

<template>
  <Button type="button" variant="outline" size="sm" @click="copy">
    <Icon :name="copied ? 'lucide:check' : 'lucide:clipboard-copy'" class="w-4 h-4 mr-1.5" />
    {{ copied ? 'Скопировано' : 'Промпт для нейросети' }}
  </Button>
</template>
