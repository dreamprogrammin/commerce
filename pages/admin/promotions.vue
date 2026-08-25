<script setup lang="ts">
import type { Database } from '@/types'
import { Loader2 } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useAdminPromotionsStore } from '@/stores/adminStore/adminPromotionsStore'
import { formatPrice } from '@/utils/formatPrice'

definePageMeta({
  layout: 'admin',
})
useHead({ title: 'Акции и скидки' })

const supabase = useSupabaseClient<Database>()
const promotionsStore = useAdminPromotionsStore()
const { campaigns, products, isLoading, isLoadingProducts, isSaving } = storeToRefs(promotionsStore)
const { getImageUrl } = useSupabaseStorage()

// --- Form state ---
const title = ref('')
const description = ref('')
const sourceType = ref<'category' | 'brand'>('category')
const selectedSourceId = ref('')
const discountPercentage = ref(10)
const selectedProductIds = ref<string[]>([])

// --- Source options ---
const categories = ref<{ id: string, name: string }[]>([])
const brands = ref<{ id: string, name: string }[]>([])

// --- Notification dialog ---
const showNotifyDialog = ref(false)
const notifyMessage = ref('')
const notifyTitle = ref('')
const notifyLink = ref('')
const isSendingNotification = ref(false)

// --- Completed campaigns toggle ---
const showCompleted = ref(false)

// Computed
const activeCampaigns = computed(() => campaigns.value.filter(c => c.is_active))
const completedCampaigns = computed(() => campaigns.value.filter(c => !c.is_active))

const allSelected = computed(() => {
  return products.value.length > 0 && selectedProductIds.value.length === products.value.length
})

const generatedSlug = computed(() => {
  return title.value
    .toLowerCase()
    // eslint-disable-next-line regexp/no-obscure-range
    .replace(/[а-яё]/g, (char) => {
      const map: Record<string, string> = {
        а: 'a',
        б: 'b',
        в: 'v',
        г: 'g',
        д: 'd',
        е: 'e',
        ё: 'yo',
        ж: 'zh',
        з: 'z',
        и: 'i',
        й: 'j',
        к: 'k',
        л: 'l',
        м: 'm',
        н: 'n',
        о: 'o',
        п: 'p',
        р: 'r',
        с: 's',
        т: 't',
        у: 'u',
        ф: 'f',
        х: 'h',
        ц: 'ts',
        ч: 'ch',
        ш: 'sh',
        щ: 'sch',
        ъ: '',
        ы: 'y',
        ь: '',
        э: 'e',
        ю: 'yu',
        я: 'ya',
      }
      return map[char] || char
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
})

const canCreate = computed(() => {
  return title.value.trim() && selectedSourceId.value && discountPercentage.value > 0 && selectedProductIds.value.length > 0
})

// Load data
onMounted(async () => {
  promotionsStore.fetchCampaigns()
  await loadSources()
})

async function loadSources() {
  const [catResult, brandResult] = await Promise.all([
    supabase.from('categories').select('id, name').order('name'),
    supabase.from('brands').select('id, name').order('name'),
  ])
  categories.value = catResult.data ?? []
  brands.value = brandResult.data ?? []
}

// Watch source changes
watch([sourceType, selectedSourceId], async ([type, id]) => {
  if (!id) {
    products.value = []
    selectedProductIds.value = []
    return
  }

  selectedProductIds.value = []
  if (type === 'category') {
    await promotionsStore.fetchProductsByCategory(id)
  }
  else {
    await promotionsStore.fetchProductsByBrand(id)
  }
})

watch(sourceType, () => {
  selectedSourceId.value = ''
  products.value = []
  selectedProductIds.value = []
})

// Actions
function toggleSelectAll() {
  if (allSelected.value) {
    selectedProductIds.value = []
  }
  else {
    selectedProductIds.value = products.value.map(p => p.id)
  }
}

function toggleProduct(productId: string) {
  const idx = selectedProductIds.value.indexOf(productId)
  if (idx > -1) {
    selectedProductIds.value.splice(idx, 1)
  }
  else {
    selectedProductIds.value.push(productId)
  }
}

function previewPrice(price: number) {
  const discounted = price - (price * discountPercentage.value / 100)
  return Math.round(discounted)
}

function getProductImageUrl(product: { product_images: { image_url: string | null }[] | null }) {
  const imageUrl = product.product_images?.[0]?.image_url
  if (!imageUrl)
    return null
  return getImageUrl(BUCKET_NAME_PRODUCT, imageUrl, { width: 60, height: 60 })
}

async function handleCreate(notify = false) {
  // Сохраняем значения до сброса формы
  const savedTitle = title.value.trim()
  const savedSlug = generatedSlug.value
  const savedDescription = description.value.trim()
  const savedDiscount = discountPercentage.value
  const savedSourceType = sourceType.value
  const savedSourceId = selectedSourceId.value

  const campaignId = await promotionsStore.createCampaign({
    title: savedTitle,
    slug: savedSlug,
    description: savedDescription,
    sourceType: savedSourceType,
    categoryId: savedSourceType === 'category' ? savedSourceId : null,
    brandId: savedSourceType === 'brand' ? savedSourceId : null,
    discountPercentage: savedDiscount,
    productIds: selectedProductIds.value,
  })

  if (campaignId) {
    // Reset form
    title.value = ''
    description.value = ''
    selectedSourceId.value = ''
    discountPercentage.value = 10
    selectedProductIds.value = []
    products.value = []

    if (notify) {
      const sourceName = savedSourceType === 'category'
        ? categories.value.find(c => c.id === savedSourceId)?.name
        : brands.value.find(b => b.id === savedSourceId)?.name
      notifyMessage.value = `🔥 Акция!\n\n${savedTitle || `Скидки до ${savedDiscount}%`}\n\n${savedDescription || `Скидки на ${sourceName || 'товары'}!`}\n\nСмотрите на uhti.kz`
      notifyTitle.value = savedTitle || `Скидки до ${savedDiscount}%`
      notifyLink.value = `/promo/${savedSlug}`
      showNotifyDialog.value = true
    }
  }
}

async function handleSendNotification() {
  isSendingNotification.value = true
  await promotionsStore.sendPromoNotification({
    message: notifyMessage.value,
    title: notifyTitle.value,
    link: notifyLink.value,
  })
  isSendingNotification.value = false
  showNotifyDialog.value = false
  notifyMessage.value = ''
  notifyTitle.value = ''
  notifyLink.value = ''
}

async function handleDeactivate(campaignId: string) {
  await promotionsStore.deactivateCampaign(campaignId)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('ru-RU', {
    timeZone: 'Asia/Almaty',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-5xl">
    <!-- Блок 1: Создание акции -->
    <Card>
      <CardHeader>
        <CardTitle class="text-2xl">
          Создание акции
        </CardTitle>
        <CardDescription>Массовое применение скидок на товары по категории или бренду</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <!-- Заголовок -->
        <div class="space-y-2">
          <Label>Заголовок акции</Label>
          <Input v-model="title" placeholder="Скидки на LEGO до 30%!" />
          <p v-if="generatedSlug" class="text-xs text-muted-foreground">
            Ссылка: /promo/{{ generatedSlug }}
          </p>
        </div>

        <!-- Описание -->
        <div class="space-y-2">
          <Label>Описание (для промо-страницы)</Label>
          <Textarea v-model="description" placeholder="Только до конца недели..." :rows="3" />
        </div>

        <!-- Источник -->
        <div class="space-y-3">
          <Label>Источник товаров</Label>
          <RadioGroup v-model="sourceType" class="flex gap-6">
            <div class="flex items-center gap-2">
              <RadioGroupItem id="src-category" value="category" />
              <Label for="src-category" class="cursor-pointer">Категория</Label>
            </div>
            <div class="flex items-center gap-2">
              <RadioGroupItem id="src-brand" value="brand" />
              <Label for="src-brand" class="cursor-pointer">Бренд</Label>
            </div>
          </RadioGroup>

          <Select v-model="selectedSourceId">
            <SelectTrigger class="w-full max-w-md">
              <SelectValue :placeholder="sourceType === 'category' ? 'Выберите категорию' : 'Выберите бренд'" />
            </SelectTrigger>
            <SelectContent>
              <template v-if="sourceType === 'category'">
                <SelectItem v-for="cat in categories" :key="cat.id" :value="cat.id">
                  {{ cat.name }}
                </SelectItem>
              </template>
              <template v-else>
                <SelectItem v-for="brand in brands" :key="brand.id" :value="brand.id">
                  {{ brand.name }}
                </SelectItem>
              </template>
            </SelectContent>
          </Select>
        </div>

        <!-- Скидка -->
        <div class="space-y-2">
          <Label>Скидка (%)</Label>
          <Input
            v-model.number="discountPercentage"
            type="number"
            min="1"
            max="100"
            class="w-32"
          />
        </div>

        <!-- Таблица товаров -->
        <div v-if="isLoadingProducts" class="text-center py-8 text-muted-foreground">
          <Loader2 class="h-6 w-6 animate-spin mx-auto mb-2" />
          Загрузка товаров...
        </div>

        <div v-else-if="products.length > 0" class="space-y-3">
          <div class="flex items-center justify-between">
            <Label>Товары ({{ selectedProductIds.length }} / {{ products.length }})</Label>
            <Button variant="ghost" size="sm" @click="toggleSelectAll">
              {{ allSelected ? 'Снять все' : 'Выбрать все' }}
            </Button>
          </div>

          <div class="border rounded-lg overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted/50">
                <tr>
                  <th class="p-3 w-10">
                    <Checkbox :checked="allSelected" @update:checked="toggleSelectAll" />
                  </th>
                  <th class="p-3 w-16" />
                  <th class="p-3 text-left">
                    Название
                  </th>
                  <th class="p-3 text-right">
                    Цена
                  </th>
                  <th class="p-3 text-right">
                    Скидка
                  </th>
                  <th class="p-3 text-right">
                    Новая цена
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="product in products"
                  :key="product.id"
                  class="border-t hover:bg-muted/30 cursor-pointer"
                  @click="toggleProduct(product.id)"
                >
                  <td class="p-3">
                    <Checkbox
                      :checked="selectedProductIds.includes(product.id)"
                      @update:checked="toggleProduct(product.id)"
                      @click.stop
                    />
                  </td>
                  <td class="p-3">
                    <img
                      v-if="getProductImageUrl(product)"
                      :src="getProductImageUrl(product)!"
                      :alt="product.name"
                      class="w-10 h-10 object-contain rounded"
                    >
                    <div v-else class="w-10 h-10 bg-muted rounded flex items-center justify-center text-xs">
                      --
                    </div>
                  </td>
                  <td class="p-3 font-medium">
                    {{ product.name }}
                  </td>
                  <td class="p-3 text-right">
                    {{ formatPrice(product.price) }}&nbsp;₸
                  </td>
                  <td class="p-3 text-right">
                    <span v-if="product.discount_percentage > 0" class="text-orange-600">
                      {{ product.discount_percentage }}%
                    </span>
                    <span v-else class="text-muted-foreground">—</span>
                  </td>
                  <td class="p-3 text-right font-semibold text-green-600">
                    {{ formatPrice(previewPrice(product.price)) }}&nbsp;₸
                    <span class="text-xs text-muted-foreground ml-1">(-{{ discountPercentage }}%)</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-else-if="selectedSourceId" class="text-center py-8 text-muted-foreground">
          Товаров не найдено
        </div>

        <!-- Кнопки -->
        <div class="flex gap-3 pt-2">
          <AlertDialog>
            <AlertDialogTrigger as-child>
              <Button :disabled="!canCreate || isSaving">
                <Loader2 v-if="isSaving" class="mr-2 h-4 w-4 animate-spin" />
                Создать акцию
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Подтвердите создание</AlertDialogTitle>
                <AlertDialogDescription>
                  Скидка {{ discountPercentage }}% будет применена к {{ selectedProductIds.length }} товарам.
                  Текущие скидки будут сохранены и восстановятся при завершении акции.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction @click="handleCreate(false)">
                  Создать
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger as-child>
              <Button variant="outline" :disabled="!canCreate || isSaving">
                Создать и уведомить
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Создать акцию и отправить уведомление?</AlertDialogTitle>
                <AlertDialogDescription>
                  Скидка {{ discountPercentage }}% будет применена к {{ selectedProductIds.length }} товарам,
                  а подписчики Telegram получат уведомление.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction @click="handleCreate(true)">
                  Создать и уведомить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>

    <Separator />

    <!-- Блок 2: Активные акции -->
    <Card>
      <CardHeader>
        <CardTitle>Активные акции</CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="isLoading" class="text-center py-8 text-muted-foreground">
          Загрузка...
        </div>

        <div v-else-if="activeCampaigns.length === 0" class="text-center py-8 text-muted-foreground">
          Нет активных акций
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="campaign in activeCampaigns"
            :key="campaign.id"
            class="rounded-lg border p-4 flex items-center justify-between gap-4"
          >
            <div class="space-y-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-semibold truncate">{{ campaign.title }}</span>
                <Badge variant="secondary">
                  {{ campaign.source_type === 'category' ? 'Категория' : 'Бренд' }}
                </Badge>
                <Badge variant="destructive">
                  -{{ campaign.discount_percentage }}%
                </Badge>
              </div>
              <p class="text-xs text-muted-foreground">
                {{ formatDate(campaign.created_at) }}
              </p>
            </div>

            <div class="flex items-center gap-2 flex-shrink-0">
              <NuxtLink :to="`/promo/${campaign.slug}`" target="_blank">
                <Button variant="outline" size="sm">
                  Открыть
                </Button>
              </NuxtLink>

              <AlertDialog>
                <AlertDialogTrigger as-child>
                  <Button variant="destructive" size="sm" :disabled="isSaving">
                    Завершить
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Завершить акцию?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Скидки будут восстановлены к исходным значениям для всех товаров этой акции.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction @click="handleDeactivate(campaign.id)">
                      Завершить
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Блок 3: Завершённые акции -->
    <Collapsible v-if="completedCampaigns.length > 0" v-model:open="showCompleted">
      <Card>
        <CardHeader class="cursor-pointer" @click="showCompleted = !showCompleted">
          <CollapsibleTrigger as-child>
            <div class="flex items-center justify-between">
              <CardTitle>Завершённые акции ({{ completedCampaigns.length }})</CardTitle>
              <Icon
                name="lucide:chevron-down"
                class="w-5 h-5 text-muted-foreground transition-transform"
                :class="{ 'rotate-180': showCompleted }"
              />
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent class="pt-0">
            <div class="space-y-3">
              <div
                v-for="campaign in completedCampaigns"
                :key="campaign.id"
                class="rounded-lg border p-4 opacity-60"
              >
                <div class="flex items-center gap-2">
                  <span class="font-medium">{{ campaign.title }}</span>
                  <Badge variant="outline">
                    {{ campaign.source_type === 'category' ? 'Категория' : 'Бренд' }}
                  </Badge>
                  <Badge variant="outline">
                    -{{ campaign.discount_percentage }}%
                  </Badge>
                </div>
                <p class="text-xs text-muted-foreground mt-1">
                  {{ formatDate(campaign.created_at) }}
                </p>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Диалог отправки уведомления -->
    <AlertDialog :open="showNotifyDialog" @update:open="showNotifyDialog = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Отправить уведомление</AlertDialogTitle>
          <AlertDialogDescription>
            Сообщение будет отправлено в Telegram и как in-app уведомление всем пользователям.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea v-model="notifyMessage" :rows="6" class="my-4" />
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="isSendingNotification">
            Пропустить
          </AlertDialogCancel>
          <AlertDialogAction :disabled="!notifyMessage.trim() || isSendingNotification" @click="handleSendNotification">
            <Loader2 v-if="isSendingNotification" class="mr-2 h-4 w-4 animate-spin" />
            Отправить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
