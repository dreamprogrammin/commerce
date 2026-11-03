<script setup lang="ts">
import type { Supplier, SupplierChannel, SupplierInsert, SupplierUpdate } from '@/types'
import { Loader2, Lock, MoreHorizontal, Pencil, Phone, Plus, Search, Send, Trash2, X } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useAdminSuppliersStore } from '@/stores/adminStore/adminSuppliersStore'
import { plural } from '@/utils/restockOrder'
import { channelUrl, parseChannelLink, sameChannel } from '@/utils/telegramChannel'

definePageMeta({ layout: 'admin' })

const suppliersStore = useAdminSuppliersStore()
const { suppliers, isLoading, channels, channelsInstalled } = storeToRefs(suppliersStore)

// Каналы в Telegram по поставщикам — из них будем отбирать товары по спросу
const channelsBySupplier = computed(() => {
  const map = new Map<string, SupplierChannel[]>()
  for (const c of channels.value)
    map.set(c.supplier_id, [...(map.get(c.supplier_id) ?? []), c])
  return map
})
function supplierChannels(id: string): SupplierChannel[] {
  return channelsBySupplier.value.get(id) ?? []
}
const channelRef = (c: SupplierChannel) => ({ username: c.username, inviteHash: c.invite_hash })

// Поиск
const searchQuery = ref('')
const filteredSuppliers = computed(() => {
  if (!searchQuery.value)
    return suppliers.value
  const q = searchQuery.value.toLowerCase()
  return suppliers.value.filter(s =>
    s.name.toLowerCase().includes(q)
    || s.contact_person?.toLowerCase().includes(q)
    || s.phone?.includes(q)
    || s.address?.toLowerCase().includes(q)
    || supplierChannels(s.id).some(c => c.title.toLowerCase().includes(q) || c.username?.includes(q)),
  )
})

onMounted(() => {
  suppliersStore.fetchSuppliers()
  suppliersStore.fetchChannels()
})

// Диалог создания/редактирования
const isDialogOpen = ref(false)
const isSaving = ref(false)
const editingSupplier = ref<Supplier | null>(null)
const formData = ref<Partial<SupplierInsert>>({})

// Канал в окне поставщика: записанный (есть id) или новый — запишется при сохранении
interface ChannelDraft {
  id?: string
  /** Что вставили в поле — при сохранении сервер проверит ссылку заново */
  link: string
  username: string | null
  inviteHash: string | null
  title: string
  type: 'channel' | 'group'
  webPreview: boolean
  members?: number | null
  lastPostAt?: string | null
}
const channelDrafts = ref<ChannelDraft[]>([])
const removedChannelIds = ref<string[]>([])
const channelInput = ref('')
const channelError = ref('')
const isCheckingChannel = ref(false)

function draftOf(c: SupplierChannel): ChannelDraft {
  return { id: c.id, link: channelUrl(channelRef(c)), username: c.username, inviteHash: c.invite_hash, title: c.title, type: c.chat_type, webPreview: c.web_preview }
}

function resetChannelDrafts(supplierId: string | null) {
  channelDrafts.value = supplierId ? supplierChannels(supplierId).map(draftOf) : []
  removedChannelIds.value = []
  channelInput.value = ''
  channelError.value = ''
}

/** Как читать канал: без аккаунта или только аккаунтом-участником. */
function channelNote(c: { username: string | null, type: 'channel' | 'group', webPreview: boolean }): string {
  if (c.type === 'group')
    return 'группа — читать через аккаунт'
  if (!c.username)
    return 'закрытый — читать через аккаунт'
  return c.webPreview ? 'открытый, читается без аккаунта' : 'без просмотра на сайте — читать через аккаунт'
}

function membersText(c: { type: 'channel' | 'group', members?: number | null }): string {
  const n = c.members ?? 0
  return `${n.toLocaleString('ru-RU')} ${c.type === 'group' ? plural(n, 'участник', 'участника', 'участников') : plural(n, 'подписчик', 'подписчика', 'подписчиков')}`
}

function postDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', d.getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' })
}

async function addChannelDraft() {
  channelError.value = ''
  const raw = channelInput.value.trim()
  const link = parseChannelLink(raw)
  if (link.kind === 'invalid') {
    channelError.value = link.reason
    return
  }
  if (channelDrafts.value.some(c => sameChannel(c, link))) {
    channelError.value = 'Этот канал уже в списке'
    return
  }
  // Убрали в этом же окне и передумали — просто не убирать
  const restored = channels.value.find(c => removedChannelIds.value.includes(c.id) && sameChannel(channelRef(c), link))
  if (restored) {
    removedChannelIds.value = removedChannelIds.value.filter(id => id !== restored.id)
    channelDrafts.value.push(draftOf(restored))
    channelInput.value = ''
    return
  }
  isCheckingChannel.value = true
  try {
    const { existing, ...found } = await suppliersStore.checkChannel(raw)
    if (existing) {
      channelError.value = `Этот канал уже у поставщика «${existing.supplierName}»`
      return
    }
    channelDrafts.value.push({ link: raw, ...found })
    // Новый поставщик из канала: название — как у канала, поправить можно
    if (!formData.value.name?.trim())
      formData.value.name = found.title
    channelInput.value = ''
  }
  catch (error: any) {
    channelError.value = error.data?.message || error.message || 'Не удалось проверить канал'
  }
  finally {
    isCheckingChannel.value = false
  }
}

function removeChannelDraft(draft: ChannelDraft) {
  if (draft.id)
    removedChannelIds.value.push(draft.id)
  channelDrafts.value = channelDrafts.value.filter(c => c !== draft)
}

/** Убранные — удалить, новые — записать. false — что-то не прошло, окно остаётся открытым. */
async function saveChannels(supplierId: string): Promise<boolean> {
  if (!channelsInstalled.value)
    return true
  const failed: string[] = []
  for (const id of [...removedChannelIds.value]) {
    try {
      await suppliersStore.removeChannel(id)
    }
    catch (error: any) {
      // 404 — канал уже убрали (другая вкладка): то, что и нужно
      if (error.statusCode !== 404) {
        failed.push(error.data?.message || error.message)
        continue
      }
    }
    removedChannelIds.value = removedChannelIds.value.filter(x => x !== id)
  }
  for (const draft of channelDrafts.value.filter(c => !c.id)) {
    try {
      draft.id = (await suppliersStore.addChannel(supplierId, draft.link)).id
    }
    catch (error: any) {
      failed.push(`«${draft.title}»: ${error.data?.message || error.message}`)
    }
  }
  await suppliersStore.fetchChannels()
  if (failed.length)
    toast.error('Не все каналы сохранились', { description: failed.join('\n') })
  return !failed.length
}

function openCreateDialog() {
  editingSupplier.value = null
  formData.value = {
    name: '',
    contact_person: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
  }
  resetChannelDrafts(null)
  isDialogOpen.value = true
}

function openEditDialog(supplier: Supplier) {
  editingSupplier.value = supplier
  formData.value = {
    name: supplier.name,
    contact_person: supplier.contact_person,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    notes: supplier.notes,
  }
  resetChannelDrafts(supplier.id)
  isDialogOpen.value = true
}

async function handleSave() {
  if (!formData.value.name?.trim()) {
    toast.error('Название поставщика обязательно')
    return
  }
  // Ссылку вставили, а «Добавить» не нажали — молча её не терять
  if (channelInput.value.trim()) {
    channelError.value = 'Нажмите «Добавить» или очистите поле'
    return
  }

  isSaving.value = true
  try {
    let supplierId: string
    if (editingSupplier.value) {
      const success = await suppliersStore.updateSupplier(
        editingSupplier.value.id,
        formData.value as SupplierUpdate,
      )
      if (!success)
        return
      supplierId = editingSupplier.value.id
    }
    else {
      const result = await suppliersStore.createSupplier(formData.value as SupplierInsert)
      if (!result)
        return
      // Дальше окно — про созданного: если канал не запишется, повторное
      // «Сохранить» не заведёт второго такого же поставщика
      editingSupplier.value = result
      supplierId = result.id
    }
    if (await saveChannels(supplierId))
      isDialogOpen.value = false
  }
  finally {
    isSaving.value = false
  }
}

// Удаление
const supplierToDelete = ref<Supplier | null>(null)
const showDeleteDialog = ref(false)

function openDeleteDialog(supplier: Supplier) {
  supplierToDelete.value = supplier
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!supplierToDelete.value)
    return
  await suppliersStore.deleteSupplier(supplierToDelete.value)
  showDeleteDialog.value = false
  supplierToDelete.value = null
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8 space-y-6">
    <!-- Заголовок -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
          Поставщики
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          База контактов поставщиков и их каналы в Telegram
        </p>
      </div>
      <Button class="w-full sm:w-auto" @click="openCreateDialog">
        <Plus class="w-4 h-4 mr-2" />
        Добавить поставщика
      </Button>
    </div>

    <!-- Поиск -->
    <Card>
      <CardContent class="pt-6">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="Поиск по названию, контакту, телефону или адресу..."
            class="pl-10"
          />
        </div>
      </CardContent>
    </Card>

    <!-- Загрузка -->
    <div v-if="isLoading" class="space-y-4">
      <div v-for="i in 5" :key="i" class="flex items-center gap-4">
        <div class="flex-1 space-y-2">
          <Skeleton class="h-4 w-1/3" />
          <Skeleton class="h-3 w-1/4" />
        </div>
        <Skeleton class="h-8 w-24" />
      </div>
    </div>

    <template v-else>
      <!-- Пустое состояние -->
      <Card v-if="filteredSuppliers.length === 0">
        <CardContent class="py-16 text-center">
          <div class="flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Search class="w-8 h-8 opacity-50" />
            <p v-if="searchQuery">
              Поставщики не найдены по запросу "{{ searchQuery }}"
            </p>
            <p v-else>
              Поставщиков пока нет. Добавьте первого.
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- Десктоп: таблица -->
      <Card v-else class="hidden md:block">
        <CardContent class="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Контактное лицо</TableHead>
                <TableHead>Телефон</TableHead>
                <TableHead v-if="channelsInstalled">
                  Telegram
                </TableHead>
                <TableHead class="hidden lg:table-cell">
                  Адрес
                </TableHead>
                <TableHead class="text-right">
                  Действия
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="supplier in filteredSuppliers" :key="supplier.id" class="group">
                <TableCell class="font-medium">
                  {{ supplier.name }}
                </TableCell>
                <TableCell>
                  {{ supplier.contact_person || '—' }}
                </TableCell>
                <TableCell>
                  <a
                    v-if="supplier.phone"
                    :href="`tel:${supplier.phone}`"
                    class="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Phone class="w-3.5 h-3.5" />
                    {{ supplier.phone }}
                  </a>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>
                <TableCell v-if="channelsInstalled">
                  <div v-if="supplierChannels(supplier.id).length" class="flex flex-wrap gap-1.5">
                    <a
                      v-for="c in supplierChannels(supplier.id)"
                      :key="c.id"
                      :href="channelUrl(channelRef(c))"
                      target="_blank"
                      rel="noopener"
                      class="inline-flex max-w-48 items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
                      :title="channelNote({ username: c.username, type: c.chat_type, webPreview: c.web_preview })"
                      data-testid="supplier-channel"
                    >
                      <Send class="size-3 shrink-0 text-muted-foreground" />
                      <span class="truncate">{{ c.title }}</span>
                      <Lock v-if="!c.web_preview" class="size-3 shrink-0 text-muted-foreground" />
                    </a>
                  </div>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>
                <TableCell class="hidden lg:table-cell text-muted-foreground text-sm">
                  {{ supplier.address || '—' }}
                </TableCell>
                <TableCell class="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal class="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="openEditDialog(supplier)">
                        <Pencil class="w-4 h-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        class="text-destructive focus:text-destructive"
                        @click="openDeleteDialog(supplier)"
                      >
                        <Trash2 class="w-4 h-4 mr-2" />
                        Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Мобайл: карточки -->
      <div v-if="filteredSuppliers.length > 0" class="md:hidden space-y-3">
        <Card v-for="supplier in filteredSuppliers" :key="supplier.id">
          <CardContent class="p-4">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-medium truncate">
                  {{ supplier.name }}
                </p>
                <p v-if="supplier.contact_person" class="text-sm text-muted-foreground">
                  {{ supplier.contact_person }}
                </p>
                <p v-if="supplier.address" class="text-xs text-muted-foreground mt-0.5">
                  {{ supplier.address }}
                </p>
                <div v-if="supplierChannels(supplier.id).length" class="mt-2 flex flex-wrap gap-1.5">
                  <a
                    v-for="c in supplierChannels(supplier.id)"
                    :key="c.id"
                    :href="channelUrl(channelRef(c))"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                    data-testid="supplier-channel"
                  >
                    <Send class="size-3 shrink-0 text-muted-foreground" />
                    <span class="truncate">{{ c.title }}</span>
                    <Lock v-if="!c.web_preview" class="size-3 shrink-0 text-muted-foreground" />
                  </a>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="sm" class="flex-shrink-0">
                    <MoreHorizontal class="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem @click="openEditDialog(supplier)">
                    <Pencil class="w-4 h-4 mr-2" />
                    Редактировать
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    class="text-destructive focus:text-destructive"
                    @click="openDeleteDialog(supplier)"
                  >
                    <Trash2 class="w-4 h-4 mr-2" />
                    Удалить
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <!-- Кнопка звонка -->
            <a
              v-if="supplier.phone"
              :href="`tel:${supplier.phone}`"
              class="flex items-center justify-center gap-2 mt-3 py-2.5 rounded-lg border bg-primary/5 text-primary font-medium text-sm w-full"
            >
              <Phone class="w-4 h-4" />
              {{ supplier.phone }}
            </a>
          </CardContent>
        </Card>
      </div>
    </template>

    <!-- Счётчик -->
    <div v-if="!isLoading" class="text-sm text-muted-foreground text-center">
      Всего поставщиков: {{ filteredSuppliers.length }}
      <span v-if="searchQuery"> (отфильтровано из {{ suppliers.length }})</span>
    </div>

    <!-- Диалог создания/редактирования -->
    <Dialog v-model:open="isDialogOpen">
      <!-- С каналами окно высокое. На ≥lg сверху фиксированная шапка сайта
           (z-index 100, выше окон): окно держится ниже неё -->
      <DialogContent class="sm:max-w-[525px] max-h-[90dvh] lg:max-h-[calc(100dvh-12rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {{ editingSupplier ? 'Редактировать поставщика' : 'Новый поставщик' }}
          </DialogTitle>
        </DialogHeader>

        <div class="space-y-4 py-4">
          <div>
            <Label for="supplier-name">Название *</Label>
            <Input
              id="supplier-name"
              v-model="formData.name"
              placeholder="Например: Ялян Маркет, Барахолка точка 45"
            />
          </div>

          <div v-if="channelsInstalled" class="space-y-2" data-testid="channels-field">
            <Label for="supplier-channel">Каналы в Telegram</Label>
            <ul v-if="channelDrafts.length" class="space-y-2">
              <li
                v-for="c in channelDrafts"
                :key="c.id ?? c.link"
                class="flex items-start gap-3 rounded-md border p-2.5"
                data-testid="channel-draft"
              >
                <Send class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div class="min-w-0 flex-1">
                  <a
                    :href="channelUrl(c)"
                    target="_blank"
                    rel="noopener"
                    class="block truncate text-sm font-medium hover:underline"
                  >{{ c.title }}</a>
                  <p class="text-xs text-muted-foreground">
                    {{ c.username ? `@${c.username}` : 'по приглашению' }} · {{ channelNote(c) }}
                  </p>
                  <p v-if="c.members != null || c.lastPostAt" class="text-xs text-muted-foreground">
                    <template v-if="c.members != null">
                      {{ membersText(c) }}
                    </template>
                    <template v-if="c.members != null && c.lastPostAt">
                      ·
                    </template>
                    <template v-if="c.lastPostAt">
                      последний пост {{ postDate(c.lastPostAt) }}
                    </template>
                  </p>
                  <p v-if="!c.id" class="text-xs text-primary">
                    Новый — запишется при сохранении
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-7 shrink-0"
                  :aria-label="`Убрать канал «${c.title}»`"
                  data-testid="channel-remove"
                  @click="removeChannelDraft(c)"
                >
                  <X class="size-4" />
                </Button>
              </li>
            </ul>
            <div class="flex gap-2">
              <Input
                id="supplier-channel"
                v-model="channelInput"
                placeholder="t.me/имя, @имя или t.me/+приглашение"
                autocomplete="off"
                :aria-invalid="!!channelError"
                @keydown.enter.prevent="addChannelDraft"
              />
              <Button
                variant="outline"
                class="shrink-0"
                :disabled="isCheckingChannel || !channelInput.trim()"
                data-testid="channel-add"
                @click="addChannelDraft"
              >
                <Loader2 v-if="isCheckingChannel" class="size-4 animate-spin" />
                <Plus v-else class="size-4" />
                Добавить
              </Button>
            </div>
            <p v-if="channelError" class="text-sm text-destructive" data-testid="channel-error">
              {{ channelError }}
            </p>
            <p v-else class="text-xs text-muted-foreground">
              Вставьте ссылку из Telegram — проверим, что это канал. Открытый читается без аккаунта, закрытый — только аккаунтом-участником.
            </p>
          </div>
          <p v-else class="text-xs text-muted-foreground" data-testid="channels-not-installed">
            Каналы в Telegram появятся, когда к базе применят миграцию 20261103120000_supplier_channels.
          </p>

          <div>
            <Label for="supplier-contact">Контактное лицо</Label>
            <Input
              id="supplier-contact"
              v-model="formData.contact_person"
              placeholder="Имя менеджера"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <Label for="supplier-phone">Телефон</Label>
              <Input
                id="supplier-phone"
                v-model="formData.phone"
                placeholder="+7 (777) 123-45-67"
              />
            </div>
            <div>
              <Label for="supplier-email">Email</Label>
              <Input
                id="supplier-email"
                v-model="formData.email"
                type="email"
                placeholder="email@example.com"
              />
            </div>
          </div>

          <div>
            <Label for="supplier-address">Адрес / Точка на рынке</Label>
            <Input
              id="supplier-address"
              v-model="formData.address"
              placeholder="Барахолка, контейнер 15, ряд 3"
            />
          </div>

          <div>
            <Label for="supplier-notes">Заметки</Label>
            <Textarea
              id="supplier-notes"
              v-model="formData.notes"
              placeholder="Условия работы, минимальный заказ, способ оплаты..."
              rows="3"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="isDialogOpen = false">
            Отмена
          </Button>
          <Button :disabled="isLoading || isSaving || isCheckingChannel" data-testid="supplier-save" @click="handleSave">
            {{ editingSupplier ? 'Сохранить' : 'Создать' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- AlertDialog удаления -->
    <AlertDialog v-model:open="showDeleteDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
          <AlertDialogDescription>
            Вы собираетесь удалить поставщика <strong>"{{ supplierToDelete?.name }}"</strong>.
            <br><br>
            У товаров, связанных с этим поставщиком, связь будет удалена (supplier_id станет NULL).
            <template v-if="supplierToDelete && supplierChannels(supplierToDelete.id).length">
              <br><br>
              Его каналы в Telegram уберутся из списка вместе с ним.
            </template>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleDelete"
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
