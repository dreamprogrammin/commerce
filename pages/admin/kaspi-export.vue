<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'vue-sonner'

definePageMeta({ layout: 'Admin' })

const supabase = useSupabaseClient()

const { data: products, refresh } = await useAsyncData('kaspi-products', async () => {
  const { data, error } = await supabase.rpc('get_kaspi_admin_list')
  if (error) throw error
  return data
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
        💡 Топ-10 самых просматриваемых товаров на сайте (рекомендуем к выгрузке)
      </AlertDescription>
    </Alert>

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
              <div class="font-medium" :class="{ 'text-blue-600': index < 10 }">{{ row.name }}</div>
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
