<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'vue-sonner'

definePageMeta({ layout: 'Admin' })

const supabase = useSupabaseClient()

const selectedCategory = ref<string>('all')
const selectedBrand = ref<string>('all')

const { data: categories } = await useAsyncData('categories', async () => {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .order('name')
  if (error) throw error
  return data
})

const { data: brands } = await useAsyncData('brands', async () => {
  const { data, error } = await supabase
    .from('brands')
    .select('id, name')
    .order('name')
  if (error) throw error
  return data
})

const { data: allProducts, refresh, error: productsError } = await useAsyncData('kaspi-products', async () => {
  const { data, error } = await supabase.rpc('get_kaspi_admin_list')
  if (error) {
    console.error('RPC Error:', error)
    throw error
  }
  console.log('Products loaded:', data?.length)
  return data
})

const products = computed(() => {
  if (!allProducts.value) return []
  
  let filtered = allProducts.value
  
  if (selectedCategory.value !== 'all') {
    filtered = filtered.filter(p => p.category_id === selectedCategory.value)
  }
  
  if (selectedBrand.value !== 'all') {
    filtered = filtered.filter(p => p.brand_id === selectedBrand.value)
  }
  
  return filtered
})

async function toggleExport(productId: string, currentValue: boolean) {
  const { error } = await supabase
    .from('products')
    .update({ export_to_kaspi: !currentValue })
    .eq('id', productId)
  
  if (error) {
    toast.error('Ошибка', { description: error.message })
  } else {
    toast.success('Сохранено')
    refresh()
  }
}

function copyFeedUrl() {
  const url = `${window.location.origin}/api/kaspi-feed.xml`
  navigator.clipboard.writeText(url)
  toast.success('Ссылка скопирована', { description: url })
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-bold">Выгрузка на Kaspi Магазин</h1>
      <Button @click="copyFeedUrl">
        📋 Скопировать ссылку на XML-фид
      </Button>
    </div>

    <Alert>
      <AlertDescription>
        📦 Выберите товары для выгрузки на Kaspi Магазин
      </AlertDescription>
    </Alert>

    <Alert v-if="productsError" variant="destructive">
      <AlertDescription>
        Ошибка загрузки: {{ productsError.message }}
      </AlertDescription>
    </Alert>

    <div v-if="!productsError" class="text-sm text-muted-foreground mb-2">
      Найдено товаров: {{ products?.length || 0 }}
    </div>

    <div class="flex gap-4">
      <div class="flex-1">
        <label class="text-sm font-medium mb-2 block">Категория</label>
        <Select v-model="selectedCategory">
          <SelectTrigger>
            <SelectValue placeholder="Все категории" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            <SelectItem v-for="cat in categories" :key="cat.id" :value="cat.id">
              {{ cat.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex-1">
        <label class="text-sm font-medium mb-2 block">Бренд</label>
        <Select v-model="selectedBrand">
          <SelectTrigger>
            <SelectValue placeholder="Все бренды" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все бренды</SelectItem>
            <SelectItem v-for="brand in brands" :key="brand.id" :value="brand.id">
              {{ brand.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <div class="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название / SKU</TableHead>
            <TableHead>Остаток</TableHead>
            <TableHead>Цена на сайте (Вы получаете 100%)</TableHead>
            <TableHead>Цена на Kaspi (Уже включает +15% наценок)</TableHead>
            <TableHead>Выгружать на Kaspi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="(row, index) in products" :key="row.id">
            <TableCell>
              <div class="font-medium">{{ row.name }}</div>
              <div class="text-sm text-muted-foreground">{{ row.sku }}</div>
            </TableCell>
            <TableCell>
              <span :class="row.stock_quantity > 0 ? 'text-green-600' : 'text-red-600'">
                {{ row.stock_quantity }}
              </span>
            </TableCell>
            <TableCell class="font-semibold">{{ row.final_price }} ₸</TableCell>
            <TableCell class="font-semibold text-orange-600">{{ row.kaspi_price }} ₸</TableCell>
            <TableCell>
              <Switch 
                :checked="row.export_to_kaspi" 
                @update:checked="toggleExport(row.id, row.export_to_kaspi)"
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
