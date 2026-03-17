<script setup lang="ts">
import type { Database } from '@/types'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Link,
  Package,
  Phone,
  RefreshCw,
  ShoppingCart,
  User,
} from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useAdminSuppliersStore } from '@/stores/adminStore/adminSuppliersStore'

definePageMeta({ layout: 'admin' })

const supabase = useSupabaseClient<Database>()
const { getVariantUrl } = useSupabaseStorage()

const suppliersStore = useAdminSuppliersStore()
const { suppliers } = storeToRefs(suppliersStore)

interface RestockProduct {
  id: string
  name: string
  sku: string | null
  price: number
  stock_quantity: number
  min_stock_level: number
  restock_quantity: number
  sales_count: number
  image_url: string | null
}

interface SupplierGroup {
  supplier_id: string | null
  supplier_name: string
  supplier_contact: string | null
  supplier_phone: string | null
  supplier_address: string | null
  products: RestockProduct[]
  product_count: number
}

const groups = ref<SupplierGroup[]>([])
const isLoading = ref(true)
const collapsedGroups = ref<Set<string>>(new Set())

async function fetchRestockList() {
  isLoading.value = true
  try {
    const { data, error } = await supabase.rpc('get_restock_list' as any)
    if (error)
      throw error
    groups.value = (data as unknown as SupplierGroup[]) || []
  }
  catch (error: any) {
    toast.error('Ошибка загрузки списка закупок', { description: error.message })
  }
  finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchRestockList()
  if (suppliers.value.length === 0)
    suppliersStore.fetchSuppliers()
})

const totalProducts = computed(() =>
  groups.value.reduce((sum, g) => sum + (g.product_count || 0), 0),
)

function toggleGroup(groupKey: string) {
  if (collapsedGroups.value.has(groupKey))
    collapsedGroups.value.delete(groupKey)
  else
    collapsedGroups.value.add(groupKey)
}

function isCollapsed(groupKey: string): boolean {
  return collapsedGroups.value.has(groupKey)
}

function getProductImage(imageUrl: string | null): string | undefined {
  if (!imageUrl)
    return undefined
  return getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'sm') || undefined
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value))
}

// Назначение поставщика товару прямо со страницы закупок
const assigningProductId = ref<string | null>(null)

async function assignSupplier(productId: string, supplierId: string) {
  assigningProductId.value = productId
  try {
    const { error } = await supabase
      .from('products')
      .update({ supplier_id: supplierId } as any)
      .eq('id', productId)
    if (error)
      throw error

    toast.success('Поставщик назначен')
    await fetchRestockList()
  }
  catch (error: any) {
    toast.error('Ошибка назначения поставщика', { description: error.message })
  }
  finally {
    assigningProductId.value = null
  }
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8 space-y-6">
    <!-- Заголовок -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
          К закупке
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          Товары, у которых остаток ниже минимального уровня
        </p>
      </div>
      <div class="flex items-center gap-3">
        <Badge v-if="!isLoading && totalProducts > 0" variant="destructive" class="text-sm px-3 py-1">
          {{ totalProducts }} {{ totalProducts === 1 ? 'товар' : 'товаров' }}
        </Badge>
        <Button variant="outline" size="sm" :disabled="isLoading" @click="fetchRestockList">
          <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': isLoading }" />
          Обновить
        </Button>
      </div>
    </div>

    <!-- Скелетон -->
    <template v-if="isLoading">
      <Card v-for="i in 3" :key="i">
        <CardHeader>
          <Skeleton class="h-6 w-64" />
          <Skeleton class="h-4 w-40 mt-1" />
        </CardHeader>
        <CardContent class="space-y-3">
          <div v-for="j in 3" :key="j" class="flex items-center gap-3">
            <Skeleton class="w-10 h-10 rounded-md" />
            <div class="flex-1 space-y-1">
              <Skeleton class="h-4 w-48" />
              <Skeleton class="h-3 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <!-- Пусто -->
    <Card v-else-if="groups.length === 0">
      <CardContent class="py-16 text-center">
        <div class="flex flex-col items-center gap-3 text-muted-foreground">
          <ShoppingCart class="w-12 h-12 opacity-40" />
          <p class="text-lg font-medium">
            Все товары в наличии
          </p>
          <p class="text-sm">
            Ни один товар не опустился ниже минимального остатка
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- Группы по поставщикам -->
    <template v-else>
      <Card
        v-for="group in groups"
        :key="group.supplier_id || 'no-supplier'"
        class="overflow-hidden"
      >
        <!-- Заголовок поставщика -->
        <CardHeader
          class="cursor-pointer hover:bg-muted/50 transition-colors px-4 md:px-6"
          @click="toggleGroup(group.supplier_id || 'no-supplier')"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-3 min-w-0">
              <div
                class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                :class="group.supplier_id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
              >
                <User class="w-5 h-5" />
              </div>
              <div class="min-w-0">
                <CardTitle class="text-base truncate">
                  {{ group.supplier_name }}
                </CardTitle>
                <p v-if="group.supplier_contact" class="text-sm text-muted-foreground truncate">
                  {{ group.supplier_contact }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <Badge variant="outline">
                {{ group.product_count }} шт
              </Badge>
              <ChevronUp
                v-if="!isCollapsed(group.supplier_id || 'no-supplier')"
                class="w-5 h-5 text-muted-foreground"
              />
              <ChevronDown
                v-else
                class="w-5 h-5 text-muted-foreground"
              />
            </div>
          </div>

          <!-- Телефон — большая кнопка на мобилке -->
          <a
            v-if="group.supplier_phone"
            :href="`tel:${group.supplier_phone}`"
            class="flex items-center justify-center gap-2 mt-3 py-2.5 px-4 rounded-lg border bg-primary/5 text-primary font-medium text-sm md:inline-flex md:w-auto md:mt-2 md:py-1.5 md:text-xs"
            @click.stop
          >
            <Phone class="w-4 h-4" />
            {{ group.supplier_phone }}
          </a>

          <!-- Адрес (десктоп) -->
          <p
            v-if="group.supplier_address"
            class="text-xs text-muted-foreground mt-1 hidden md:block"
          >
            {{ group.supplier_address }}
          </p>
        </CardHeader>

        <!-- Товары -->
        <CardContent
          v-if="!isCollapsed(group.supplier_id || 'no-supplier')"
          class="pt-0 px-4 md:px-6"
        >
          <!-- Десктоп: таблица -->
          <div class="border rounded-lg overflow-hidden hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-12" />
                  <TableHead>Товар</TableHead>
                  <TableHead class="text-center w-24">
                    Остаток
                  </TableHead>
                  <TableHead class="text-center w-28">
                    Дозаказать
                  </TableHead>
                  <TableHead class="text-right w-28">
                    Цена
                  </TableHead>
                  <TableHead v-if="!group.supplier_id" class="w-48">
                    Поставщик
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="product in group.products"
                  :key="product.id"
                >
                  <TableCell>
                    <div class="w-10 h-10 rounded-md bg-muted overflow-hidden flex-shrink-0">
                      <img
                        v-if="getProductImage(product.image_url)"
                        :src="getProductImage(product.image_url)"
                        :alt="product.name"
                        class="w-full h-full object-cover"
                      >
                      <div v-else class="w-full h-full flex items-center justify-center">
                        <Package class="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <NuxtLink
                      :to="`/admin/products/${product.id}`"
                      class="font-medium hover:underline"
                    >
                      {{ product.name }}
                    </NuxtLink>
                    <div class="text-xs text-muted-foreground mt-0.5">
                      <span v-if="product.sku">SKU: {{ product.sku }}</span>
                    </div>
                  </TableCell>
                  <TableCell class="text-center">
                    <Badge
                      :variant="product.stock_quantity === 0 ? 'destructive' : 'outline'"
                      class="font-mono"
                    >
                      <AlertTriangle
                        v-if="product.stock_quantity === 0"
                        class="w-3 h-3 mr-1"
                      />
                      {{ product.stock_quantity }} шт
                    </Badge>
                  </TableCell>
                  <TableCell class="text-center">
                    <span class="font-semibold text-primary">
                      +{{ product.restock_quantity }} шт
                    </span>
                  </TableCell>
                  <TableCell class="text-right text-muted-foreground">
                    {{ formatPrice(product.price) }} ₸
                  </TableCell>
                  <TableCell v-if="!group.supplier_id">
                    <Select
                      :disabled="assigningProductId === product.id"
                      @update:model-value="(val) => assignSupplier(product.id, String(val))"
                    >
                      <SelectTrigger class="h-8 text-xs">
                        <SelectValue placeholder="Назначить..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="s in suppliers"
                          :key="s.id"
                          :value="s.id"
                        >
                          {{ s.name }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <!-- Мобайл: компактный список -->
          <div class="md:hidden space-y-2">
            <div
              v-for="product in group.products"
              :key="product.id"
              class="rounded-lg border bg-card"
            >
              <NuxtLink
                :to="`/admin/products/${product.id}`"
                class="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
              >
                <!-- Картинка -->
                <div class="w-11 h-11 rounded-md bg-muted overflow-hidden flex-shrink-0">
                  <img
                    v-if="getProductImage(product.image_url)"
                    :src="getProductImage(product.image_url)"
                    :alt="product.name"
                    class="w-full h-full object-cover"
                  >
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <Package class="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>

                <!-- Инфо -->
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">
                    {{ product.name }}
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {{ formatPrice(product.price) }} ₸
                  </p>
                </div>

                <!-- Остаток + Дозаказать -->
                <div class="flex flex-col items-end gap-1 flex-shrink-0">
                  <Badge
                    :variant="product.stock_quantity === 0 ? 'destructive' : 'outline'"
                    class="font-mono text-[10px]"
                  >
                    <AlertTriangle
                      v-if="product.stock_quantity === 0"
                      class="w-2.5 h-2.5 mr-0.5"
                    />
                    {{ product.stock_quantity }} шт
                  </Badge>
                  <span class="text-xs font-semibold text-primary">
                    +{{ product.restock_quantity }}
                  </span>
                </div>
              </NuxtLink>
              <!-- Назначить поставщика (мобайл) -->
              <div v-if="!group.supplier_id" class="px-3 pb-3">
                <Select
                  :disabled="assigningProductId === product.id"
                  @update:model-value="(val) => assignSupplier(product.id, String(val))"
                >
                  <SelectTrigger class="h-9 text-xs">
                    <Link class="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder="Назначить поставщика..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="s in suppliers"
                      :key="s.id"
                      :value="s.id"
                    >
                      {{ s.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
