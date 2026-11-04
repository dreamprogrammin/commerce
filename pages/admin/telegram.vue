<script setup lang="ts">
import { ExternalLink, KeyRound, Lock, RefreshCw, Send, ShieldAlert } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { codeDeliveryText, normalizeCode, normalizePhone } from '@/utils/telegramLogin'

/*
 * «Аккаунт Telegram» (4 ноября 2026). Закрытые каналы поставщиков (ссылка
 * t.me/+…) читает только их участник. Владелец заводит отдельный аккаунт
 * (решено 3.11), вступает им в каналы и входит здесь: приложение с
 * my.telegram.org → телефон → код из Telegram → пароль, если включён. Код и
 * пароль уходят на сервер и дальше в Telegram, в чат их не присылают. Назад
 * страница не получает ни сессию, ни api_hash, ни телефон — только последние
 * 4 цифры. Сервер — server/utils/telegramAccount.ts.
 */
definePageMeta({ layout: 'admin' })

interface Account { displayName: string, username: string | null, phoneLast4: string | null, loggedInAt: string }
interface Status {
  installed: true
  app: { configured: boolean, updatedAt: string | null }
  login: { step: 'code' | 'password', phoneLast4: string, via: string, hint: string | null, startedAt: string } | null
  account: Account | null
  channels: { id: string, title: string, supplierName: string }[]
}
type InviteState
  = | { state: 'member', title: string, lastPostAt: string | null }
    | { state: 'not_member', title: string | null }
    | { state: 'expired' }

const { data, pending, error, refresh }
  = useAsyncData('admin-telegram', () => adminFetch<Status | { installed: false }>('/api/admin/telegram'), { server: false })
const status = computed(() => data.value?.installed ? data.value : null)

const errorText = (e: any, fallback: string) => e?.data?.message || e?.statusMessage || fallback
function date(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''
}

/*
 * Один запрос за раз. Сессию с двух соединений одновременно Telegram может
 * счесть угоном и закрыть (AUTH_KEY_DUPLICATED), поэтому, пока запрос идёт,
 * все кнопки страницы ждут.
 */
const busy = ref<string | null>(null)
async function run<T>(what: string, fn: () => Promise<T>, fallback: string): Promise<T | undefined> {
  if (busy.value)
    return
  busy.value = what
  try {
    return await fn()
  }
  catch (e) {
    toast.error(errorText(e, fallback))
  }
  finally {
    busy.value = null
  }
}

// --- Приложение ---
const app = reactive({ apiId: '', apiHash: '' })
const editApp = ref(false)
const appValid = computed(() => /^[1-9]\d{0,11}$/.test(app.apiId.trim()) && /^[0-9a-f]{32}$/i.test(app.apiHash.trim()))

async function saveApp() {
  if (!appValid.value)
    return
  const ok = await run('app', () => adminFetch('/api/admin/telegram/app', {
    method: 'PUT',
    body: { apiId: app.apiId.trim(), apiHash: app.apiHash.trim() },
  }), 'Не удалось сохранить приложение')
  if (ok) {
    app.apiId = ''
    app.apiHash = ''
    editApp.value = false
    toast.success('Приложение сохранено')
    await refresh()
  }
}

// --- Вход ---
const phone = ref('')
const code = ref('')
const password = ref('')

async function requestCode() {
  if (!normalizePhone(phone.value))
    return
  const res = await run('phone', () => adminFetch<{ via: string }>('/api/admin/telegram/login', { method: 'POST', body: { phone: phone.value } }), 'Не удалось запросить код')
  if (res) {
    phone.value = ''
    toast.success(`Код отправлен ${codeDeliveryText(res.via)}`)
    await refresh()
  }
}

async function submitCode() {
  if (!normalizeCode(code.value))
    return
  const res = await run('code', () => adminFetch<{ step: 'password' | 'done' }>('/api/admin/telegram/login/code', { method: 'POST', body: { code: code.value } }), 'Не удалось войти')
  if (res) {
    code.value = ''
    if (res.step === 'done')
      toast.success('Аккаунт подключён')
    await refresh()
  }
}

async function submitPassword() {
  if (!password.value)
    return
  const res = await run('password', () => adminFetch('/api/admin/telegram/login/password', { method: 'POST', body: { password: password.value } }), 'Не удалось войти')
  if (res) {
    password.value = ''
    toast.success('Аккаунт подключён')
    await refresh()
  }
}

async function cancelLogin() {
  const res = await run('cancel', () => adminFetch('/api/admin/telegram/login', { method: 'DELETE' }), 'Не удалось отменить вход')
  if (res) {
    code.value = ''
    password.value = ''
    await refresh()
  }
}

const invites = ref<Record<string, InviteState> | null>(null)
const confirmLogout = ref(false)
async function logout() {
  // Первый клик спрашивает, второй выходит
  if (!confirmLogout.value) {
    confirmLogout.value = true
    return
  }
  confirmLogout.value = false
  const res = await run('logout', () => adminFetch('/api/admin/telegram', { method: 'DELETE' }), 'Не удалось выйти')
  if (res) {
    invites.value = null
    toast.success('Вышли из аккаунта Telegram')
    await refresh()
  }
}

// --- Закрытые каналы ---
async function checkChannels() {
  const res = await run('channels', () => adminFetch<{ channels: ({ id: string } & InviteState)[] }>('/api/admin/telegram/channels', { method: 'POST' }), 'Не удалось проверить каналы')
  if (res)
    invites.value = Object.fromEntries(res.channels.map(c => [c.id, c]))
  else
    await refresh() // Telegram закрыл сессию — сервер её стёр, страница позовёт войти заново
}

function inviteText(s: InviteState | undefined) {
  if (!s)
    return null
  if (s.state === 'member')
    return s.lastPostAt ? `аккаунт в канале · последний пост ${date(s.lastPostAt)}` : 'аккаунт в канале · постов нет'
  if (s.state === 'not_member')
    return 'аккаунт не вступил — откройте ссылку-приглашение в Telegram этим аккаунтом и вступите'
  return 'приглашение устарело — попросите у поставщика новую ссылку и замените её на странице «Поставщики»'
}
</script>

<template>
  <div class="container mx-auto max-w-3xl p-4 md:p-8 space-y-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
          Аккаунт Telegram
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          Закрытые каналы поставщиков читает только их участник. Войдите сюда аккаунтом, который вступил в эти каналы.
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="pending" @click="refresh()">
        <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': pending }" />
        Обновить
      </Button>
    </div>

    <ClientOnly>
      <p v-if="error" class="text-sm text-destructive">
        Не удалось загрузить: {{ error.data?.message || error.message }}
      </p>
      <Skeleton v-else-if="pending && !data" class="h-64 w-full" />
      <Card v-else-if="data && !status" data-testid="tg-not-installed">
        <CardContent class="pt-6 text-sm text-muted-foreground">
          Заработает после миграции базы 20261104120000_telegram_account.
        </CardContent>
      </Card>
      <template v-else-if="status">
        <!-- Приложение -->
        <Card data-testid="tg-app">
          <CardHeader>
            <CardTitle class="flex flex-wrap items-center gap-2">
              <KeyRound class="w-5 h-5" />
              Приложение Telegram
              <Badge v-if="status.app.configured" class="bg-green-100 text-green-900 hover:bg-green-100">
                задано
              </Badge>
              <Badge v-else variant="outline">
                не задано
              </Badge>
            </CardTitle>
            <CardDescription>
              Сторонние программы Telegram пускает только через своё приложение. Создаётся один раз и бесплатно.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <template v-if="status.app.configured && !editApp">
              <p class="text-sm text-muted-foreground" data-testid="tg-app-state">
                Задано {{ date(status.app.updatedAt) }}. Значения после сохранения не показываются.
              </p>
              <Button variant="outline" size="sm" :disabled="!!busy" @click="editApp = true">
                Заменить
              </Button>
            </template>
            <template v-else>
              <ol class="list-decimal space-y-1 pl-5 text-sm">
                <li>
                  Откройте
                  <a href="https://my.telegram.org/apps" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-primary hover:underline">my.telegram.org <ExternalLink class="w-3 h-3" /></a>
                  и войдите номером этого аккаунта — код придёт в Telegram.
                </li>
                <li>«API development tools»: App title и Short name — любые слова латиницей, Platform — Other. «Create application».</li>
                <li>Скопируйте сюда App api_id и App api_hash.</li>
              </ol>
              <form class="grid gap-3 sm:grid-cols-[10rem_1fr]" data-testid="tg-app-form" @submit.prevent="saveApp">
                <div class="space-y-1.5">
                  <Label for="tg-api-id">api_id</Label>
                  <Input id="tg-api-id" v-model="app.apiId" inputmode="numeric" autocomplete="off" spellcheck="false" class="font-mono" placeholder="1234567" />
                </div>
                <div class="space-y-1.5">
                  <Label for="tg-api-hash">api_hash</Label>
                  <Input id="tg-api-hash" v-model="app.apiHash" type="password" autocomplete="off" spellcheck="false" class="font-mono" placeholder="32 знака" />
                </div>
                <div class="flex flex-wrap gap-2 sm:col-span-2">
                  <Button type="submit" :disabled="!appValid || !!busy">
                    {{ busy === 'app' ? 'Сохраняю…' : 'Сохранить' }}
                  </Button>
                  <Button v-if="status.app.configured" type="button" variant="outline" :disabled="!!busy" @click="editApp = false">
                    Отмена
                  </Button>
                </div>
              </form>
            </template>
          </CardContent>
        </Card>

        <!-- Вход -->
        <Card v-if="status.app.configured" data-testid="tg-login">
          <CardHeader>
            <CardTitle class="flex flex-wrap items-center gap-2">
              <Send class="w-5 h-5" />
              Вход
              <Badge v-if="status.account" class="bg-green-100 text-green-900 hover:bg-green-100">
                подключён
              </Badge>
              <Badge v-else variant="outline">
                не подключён
              </Badge>
            </CardTitle>
            <CardDescription v-if="!status.account">
              Код и пароль уходят прямо в Telegram — в переписке их не присылайте.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Вошли -->
            <template v-if="status.account">
              <div class="text-sm" data-testid="tg-account">
                <p class="font-medium">
                  {{ status.account.displayName }}<span v-if="status.account.username" class="font-normal text-muted-foreground"> · @{{ status.account.username }}</span>
                </p>
                <p class="text-muted-foreground">
                  <template v-if="status.account.phoneLast4">
                    Телефон …{{ status.account.phoneLast4 }} ·
                  </template>
                  вошли {{ date(status.account.loggedInAt) }}
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="!!busy"
                  :class="confirmLogout ? 'border-destructive text-destructive' : ''"
                  @click="logout"
                >
                  {{ busy === 'logout' ? 'Выхожу…' : confirmLogout ? 'Точно выйти?' : 'Выйти' }}
                </Button>
                <span class="text-xs text-muted-foreground">Сессия закроется и в самом Telegram: пропадёт из «Настройки → Устройства».</span>
              </div>
            </template>

            <!-- Код -->
            <form v-else-if="status.login?.step === 'code'" class="space-y-3" data-testid="tg-code-form" @submit.prevent="submitCode">
              <p class="text-sm">
                Код отправлен {{ codeDeliveryText(status.login.via) }}, номер …{{ status.login.phoneLast4 }}.
              </p>
              <div class="flex flex-col gap-2 sm:flex-row">
                <Input
                  v-model="code"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  aria-label="Код из Telegram"
                  placeholder="Код из Telegram"
                  class="font-mono sm:max-w-48"
                />
                <Button type="submit" class="shrink-0" :disabled="!normalizeCode(code) || !!busy">
                  {{ busy === 'code' ? 'Вхожу…' : 'Войти' }}
                </Button>
                <Button type="button" variant="outline" class="shrink-0" :disabled="!!busy" @click="cancelLogin">
                  Другой номер
                </Button>
              </div>
            </form>

            <!-- Пароль -->
            <form v-else-if="status.login?.step === 'password'" class="space-y-3" data-testid="tg-password-form" @submit.prevent="submitPassword">
              <p class="text-sm">
                У аккаунта включена двухэтапная проверка — нужен её пароль.
                <span v-if="status.login.hint" class="text-muted-foreground">Подсказка: {{ status.login.hint }}</span>
              </p>
              <div class="flex flex-col gap-2 sm:flex-row">
                <Input v-model="password" type="password" autocomplete="current-password" aria-label="Пароль двухэтапной проверки" placeholder="Пароль" class="sm:max-w-64" />
                <Button type="submit" class="shrink-0" :disabled="!password || !!busy">
                  {{ busy === 'password' ? 'Вхожу…' : 'Войти' }}
                </Button>
                <Button type="button" variant="outline" class="shrink-0" :disabled="!!busy" @click="cancelLogin">
                  Отменить
                </Button>
              </div>
            </form>

            <!-- Телефон -->
            <form v-else class="space-y-3" data-testid="tg-phone-form" @submit.prevent="requestCode">
              <div class="flex flex-col gap-2 sm:flex-row">
                <Input
                  v-model="phone"
                  type="tel"
                  autocomplete="tel"
                  aria-label="Номер аккаунта"
                  placeholder="+7 777 123 45 67"
                  class="sm:max-w-64"
                />
                <Button type="submit" class="shrink-0" :disabled="!normalizePhone(phone) || !!busy">
                  {{ busy === 'phone' ? 'Отправляю…' : 'Прислать код' }}
                </Button>
              </div>
              <p class="text-xs text-muted-foreground">
                Код придёт в Telegram на устройстве, где этот аккаунт уже открыт, или по SMS.
              </p>
            </form>

            <p v-if="!status.account" class="flex gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
              <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0" />
              Только отдельный аккаунт для закупа, не личный: войдя, сайт получает к нему полный доступ.
            </p>
          </CardContent>
        </Card>

        <!-- Закрытые каналы -->
        <Card data-testid="tg-channels">
          <CardHeader class="flex flex-row items-start justify-between gap-3">
            <div class="space-y-1.5">
              <CardTitle class="flex items-center gap-2">
                <Lock class="w-5 h-5" />
                Закрытые каналы
              </CardTitle>
              <CardDescription>Каналы поставщиков по ссылке-приглашению. Добавляются на странице «Поставщики».</CardDescription>
            </div>
            <Button v-if="status.account && status.channels.length" variant="outline" size="sm" class="shrink-0" :disabled="!!busy" @click="checkChannels">
              {{ busy === 'channels' ? 'Проверяю…' : 'Проверить' }}
            </Button>
          </CardHeader>
          <CardContent>
            <p v-if="!status.channels.length" class="text-sm text-muted-foreground">
              Закрытых каналов нет.
            </p>
            <ul v-else class="divide-y text-sm">
              <li v-for="c in status.channels" :key="c.id" class="py-2 first:pt-0 last:pb-0" data-testid="tg-channel-row">
                <p class="font-medium">
                  {{ c.title }}<span v-if="c.supplierName" class="font-normal text-muted-foreground"> · {{ c.supplierName }}</span>
                </p>
                <p
                  v-if="invites && inviteText(invites[c.id])"
                  class="text-xs"
                  :class="invites[c.id]?.state === 'member' ? 'text-green-700' : 'text-destructive'"
                  data-testid="tg-channel-state"
                >
                  {{ inviteText(invites[c.id]) }}
                </p>
              </li>
            </ul>
            <p v-if="status.channels.length && !status.account" class="mt-3 text-xs text-muted-foreground">
              После входа здесь будет видно, вступил ли аккаунт в эти каналы.
            </p>
          </CardContent>
        </Card>
      </template>
    </ClientOnly>
  </div>
</template>
