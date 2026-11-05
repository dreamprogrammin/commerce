<script setup lang="ts">
import { ExternalLink, KeyRound, RefreshCw, Sparkles } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

/*
 * «Модели ИИ» (31 октября 2026). Владелец: ключ API вводить «не через код, а
 * через прямой интерфейс в админке». Ключ уходит на сервер, проверяется у
 * провайдера и ложится в Supabase Vault зашифрованным; назад страница его не
 * получает — только последние 4 символа.
 *
 * Провайдеры — только официальные API (решение владельца 31.10.2026).
 * Модель на задачу выбирается из живого списка провайдера.
 */
definePageMeta({ layout: 'admin' })

interface ProviderRow {
  id: 'anthropic' | 'openai' | 'gemini'
  label: string
  keyUrl: string
  configured: boolean
  last4: string | null
  updatedAt: string | null
}
interface TaskRow {
  task: string
  label: string
  hint: string
  model: string | null
  default: string
  updatedAt: string | null
}
interface AiModel { id: string, label: string, vision: boolean | null }

const { data, pending, error, refresh }
  = useAsyncData('admin-ai-settings', () => adminFetch<{ providers: ProviderRow[], tasks: TaskRow[] }>('/api/admin/ai-settings'), { server: false })

const errorText = (e: any, fallback: string) => e?.data?.message || e?.statusMessage || fallback
function date(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''
}

// --- Ключи ---
const keyInput = reactive<Record<string, string>>({})
const savingKey = ref<string | null>(null)
const confirmDelete = ref<string | null>(null)

async function saveKey(p: ProviderRow) {
  const key = (keyInput[p.id] ?? '').trim()
  if (!key || savingKey.value)
    return
  savingKey.value = p.id
  try {
    const res = await adminFetch<{ last4: string, models: AiModel[] }>('/api/admin/ai-settings/key', {
      method: 'POST',
      body: { provider: p.id, key },
    })
    keyInput[p.id] = ''
    toast.success(`Ключ ${p.label} проверен и сохранён: ••••${res.last4}, моделей доступно ${res.models.length}`)
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось сохранить ключ'))
  }
  finally {
    savingKey.value = null
  }
}

async function deleteKey(p: ProviderRow) {
  // Первый клик спрашивает, второй удаляет
  if (confirmDelete.value !== p.id) {
    confirmDelete.value = p.id
    return
  }
  confirmDelete.value = null
  try {
    await adminFetch(`/api/admin/ai-settings/key?provider=${p.id}`, { method: 'DELETE' })
    toast.success(`Ключ ${p.label} удалён`)
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось удалить ключ'))
  }
}

// --- Модель на задачу ---
const configured = computed(() => (data.value?.providers ?? []).filter(p => p.configured))
const choice = reactive<Record<string, { provider: string, model: string }>>({})
const models = reactive<Record<string, AiModel[]>>({})
const loadingModels = ref<string | null>(null)
const savingTask = ref<string | null>(null)

async function loadModels(provider: string) {
  if (models[provider] || !provider)
    return
  loadingModels.value = provider
  try {
    const list = await adminFetch<AiModel[]>(`/api/admin/ai-settings/models?provider=${provider}`)
    // Не понимающие картинок — прочь; понимающие — вперёд
    models[provider] = list.filter(m => m.vision !== false).sort((a, b) => Number(b.vision === true) - Number(a.vision === true))
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось получить список моделей'))
  }
  finally {
    loadingModels.value = null
  }
}

watch(data, (d) => {
  for (const t of d?.tasks ?? []) {
    const [provider = '', ...rest] = (t.model ?? t.default).split('/')
    const usable = configured.value.some(p => p.id === provider)
    choice[t.task] = usable ? { provider, model: rest.join('/') } : { provider: configured.value[0]?.id ?? '', model: '' }
    if (choice[t.task]!.provider)
      loadModels(choice[t.task]!.provider)
  }
}, { immediate: true })

function onProviderChange(task: string) {
  choice[task]!.model = ''
  loadModels(choice[task]!.provider)
}

async function saveModel(t: TaskRow) {
  const c = choice[t.task]
  if (!c?.provider || !c.model || savingTask.value)
    return
  savingTask.value = t.task
  try {
    await adminFetch('/api/admin/ai-settings/model', { method: 'PUT', body: { task: t.task, model: `${c.provider}/${c.model}` } })
    toast.success(`${t.label}: модель ${c.model}`)
    await refresh()
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось сохранить модель'))
  }
  finally {
    savingTask.value = null
  }
}

/** Модель в задаче стоит, а ключа её провайдера уже нет */
function keyMissing(t: TaskRow) {
  const provider = (t.model ?? t.default).split('/')[0]
  return !configured.value.some(p => p.id === provider)
}

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50'
</script>

<template>
  <div class="container mx-auto max-w-3xl p-4 md:p-8 space-y-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
          Модели ИИ
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          Ключи хранятся в базе зашифрованными. После сохранения ключ не показывается — только последние 4 символа.
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="pending" @click="refresh()">
        <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': pending }" />
        Обновить
      </Button>
    </div>

    <ClientOnly>
      <p v-if="error" class="text-sm text-destructive">
        Не удалось загрузить: {{ error.statusMessage || error.message }}
      </p>
      <Skeleton v-else-if="pending && !data" class="h-64 w-full" />
      <template v-else-if="data">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <KeyRound class="w-5 h-5" />
              Ключи API
            </CardTitle>
            <CardDescription>
              Только официальные API разработчиков моделей. Перед сохранением ключ проверяется у провайдера — это бесплатно.
            </CardDescription>
          </CardHeader>
          <CardContent class="divide-y">
            <div v-for="p in data.providers" :key="p.id" class="space-y-2 py-4 first:pt-0 last:pb-0">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="font-medium">
                  {{ p.label }}
                  <Badge v-if="p.configured" class="ml-2 bg-green-100 text-green-900 hover:bg-green-100">
                    задан ••••{{ p.last4 }}
                  </Badge>
                  <Badge v-else variant="outline" class="ml-2">
                    не задан
                  </Badge>
                </div>
                <a :href="p.keyUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  Где взять ключ <ExternalLink class="w-3 h-3" />
                </a>
              </div>
              <p v-if="p.updatedAt" class="text-xs text-muted-foreground">
                Обновлён {{ date(p.updatedAt) }}
              </p>
              <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="saveKey(p)">
                <Input
                  v-model="keyInput[p.id]"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  :aria-label="`Ключ ${p.label}`"
                  :placeholder="p.configured ? 'Новый ключ — заменит текущий' : 'Вставьте ключ'"
                  class="font-mono"
                />
                <Button type="submit" class="shrink-0" :disabled="!keyInput[p.id]?.trim() || savingKey === p.id">
                  {{ savingKey === p.id ? 'Проверяю…' : 'Проверить и сохранить' }}
                </Button>
                <Button
                  v-if="p.configured"
                  type="button"
                  variant="outline"
                  class="shrink-0"
                  :class="confirmDelete === p.id ? 'border-destructive text-destructive' : ''"
                  @click="deleteKey(p)"
                >
                  {{ confirmDelete === p.id ? 'Точно удалить?' : 'Удалить' }}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        <Card v-for="t in data.tasks" :key="t.task">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Sparkles class="w-5 h-5" />
              {{ t.label }}
            </CardTitle>
            <CardDescription>{{ t.hint }}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <p class="text-sm">
              Сейчас: <span class="font-mono">{{ t.model ?? t.default }}</span>
              <span v-if="!t.model" class="text-muted-foreground"> (по умолчанию)</span>
              <span v-if="t.updatedAt" class="text-muted-foreground"> · выбрана {{ date(t.updatedAt) }}</span>
            </p>
            <p v-if="keyMissing(t)" class="text-sm text-destructive">
              Ключа для этой модели нет — задайте ключ выше или выберите модель другого провайдера.
            </p>
            <p v-if="!configured.length" class="text-sm text-muted-foreground">
              Чтобы выбрать модель, сначала задайте хотя бы один ключ.
            </p>
            <form v-else class="grid gap-2 sm:grid-cols-[12rem_1fr_auto]" @submit.prevent="saveModel(t)">
              <select v-model="choice[t.task]!.provider" :class="selectClass" aria-label="Провайдер" @change="onProviderChange(t.task)">
                <option v-for="p in configured" :key="p.id" :value="p.id">
                  {{ p.label }}
                </option>
              </select>
              <select
                v-model="choice[t.task]!.model"
                :class="selectClass"
                aria-label="Модель"
                :disabled="loadingModels === choice[t.task]!.provider || !models[choice[t.task]!.provider]?.length"
              >
                <option value="" disabled>
                  {{ loadingModels === choice[t.task]!.provider ? 'Загружаю список…' : 'Выберите модель' }}
                </option>
                <option v-for="m in models[choice[t.task]!.provider] ?? []" :key="m.id" :value="m.id">
                  {{ m.label }}{{ m.label !== m.id ? ` — ${m.id}` : '' }}{{ m.vision ? ' · картинки ✓' : '' }}
                </option>
              </select>
              <Button type="submit" :disabled="!choice[t.task]?.model || savingTask === t.task">
                {{ savingTask === t.task ? 'Сохраняю…' : 'Сохранить' }}
              </Button>
            </form>
          </CardContent>
        </Card>
      </template>
    </ClientOnly>
  </div>
</template>
