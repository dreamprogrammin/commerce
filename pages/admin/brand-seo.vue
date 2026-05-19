<script setup lang="ts">
import type { Database } from '@/types/supabase'
import { Plus, Save, Search, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useSeoTemplates } from '@/composables/useSeoTemplates'

definePageMeta({ layout: 'admin' })

const supabase = useSupabaseClient<Database>()

interface CategoryBrandSeoEntry {
  id: string
  category_id: string
  brand_id: string
  seo_h1: string | null
  seo_title: string | null
  seo_description: string | null
  seo_text: string | null
  category_name?: string
  category_slug?: string
  brand_name?: string
  brand_slug?: string
}

const entries = ref<CategoryBrandSeoEntry[]>([])
const categories = ref<{ id: string, name: string, slug: string }[]>([])
const brands = ref<{ id: string, name: string, slug: string }[]>([])
const isLoading = ref(true)
const searchQuery = ref('')
const isDialogOpen = ref(false)
const editingEntry = ref<CategoryBrandSeoEntry | null>(null)

// Форма
const form = ref({
  category_id: '',
  brand_id: '',
  seo_h1: '',
  seo_title: '',
  seo_description: '',
  seo_text: '',
})

const isSaving = ref(false)
const isGenerating = ref(false)
const isGeneratingFaq = ref(false)
const { generateSeoForAllCategoryBrands } = useSeoTemplates()

onMounted(async () => {
  await Promise.all([loadEntries(), loadCategories(), loadBrands()])
})

async function handleGenerateFaq() {
  if (!confirm('Автоматически создать FAQ для всех существующих SEO-текстов категория+бренд?')) {
    return
  }

  isGeneratingFaq.value = true
  try {
    const { data, error } = await supabase.rpc('generate_faq_for_all_category_brands')
    
    if (error) throw error
    
    const totalFaq = data?.reduce((sum: number, item: any) => sum + item.faq_count, 0) || 0
    toast.success(`Создано ${totalFaq} FAQ для ${data?.length || 0} комбинаций`, {
      description: 'FAQ успешно сгенерированы',
    })
  }
  catch (error: any) {
    toast.error('Ошибка генерации FAQ', { description: error.message })
  }
  finally {
    isGeneratingFaq.value = false
  }
}

async function handleAutoGenerate() {
  if (!confirm('Автоматически создать SEO-тексты для всех комбинаций категория+бренд (где ≥3 товаров)? Существующие записи не будут изменены.')) {
    return
  }

  isGenerating.value = true
  try {
    const results = await generateSeoForAllCategoryBrands({ dryRun: false })
    
    if (results) {
      const newCount = results.length
      toast.success(`Создано ${newCount} SEO-текстов`, {
        description: 'Автогенерация завершена успешно',
      })
      await loadEntries()
    }
  }
  catch (error: any) {
    toast.error('Ошибка автогенерации', { description: error.message })
  }
  finally {
    isGenerating.value = false
  }
}

async function loadEntries() {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('category_brand_seo')
      .select(`
        *,
        categories(name, slug),
        brands(name, slug)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    entries.value = (data || []).map((e: any) => ({
      ...e,
      category_name: e.categories?.name,
      category_slug: e.categories?.slug,
      brand_name: e.brands?.name,
      brand_slug: e.brands?.slug,
    }))
  }
  catch (error: any) {
    toast.error('Ошибка загрузки', { description: error.message })
  }
  finally {
    isLoading.value = false
  }
}

async function loadCategories() {
  const { data } = await supabase
    .from('categories')
    .select('id, name, slug')
    .order('name')
  categories.value = data || []
}

async function loadBrands() {
  const { data } = await supabase
    .from('brands')
    .select('id, name, slug')
    .order('name')
  brands.value = data || []
}

const filteredEntries = computed(() => {
  if (!searchQuery.value)
    return entries.value
  const q = searchQuery.value.toLowerCase()
  return entries.value.filter(
    e => e.category_name?.toLowerCase().includes(q)
      || e.brand_name?.toLowerCase().includes(q)
      || e.seo_h1?.toLowerCase().includes(q),
  )
})

function openNewDialog() {
  editingEntry.value = null
  form.value = {
    category_id: '',
    brand_id: '',
    seo_h1: '',
    seo_title: '',
    seo_description: '',
    seo_text: '',
  }
  isDialogOpen.value = true
}

function openEditDialog(entry: CategoryBrandSeoEntry) {
  editingEntry.value = entry
  form.value = {
    category_id: entry.category_id,
    brand_id: entry.brand_id,
    seo_h1: entry.seo_h1 || '',
    seo_title: entry.seo_title || '',
    seo_description: entry.seo_description || '',
    seo_text: entry.seo_text || '',
  }
  isDialogOpen.value = true
}

async function handleSave() {
  if (!form.value.category_id || !form.value.brand_id) {
    toast.error('Выберите категорию и бренд')
    return
  }

  isSaving.value = true
  try {
    const payload = {
      category_id: form.value.category_id,
      brand_id: form.value.brand_id,
      seo_h1: form.value.seo_h1 || null,
      seo_title: form.value.seo_title || null,
      seo_description: form.value.seo_description || null,
      seo_text: form.value.seo_text || null,
    }

    if (editingEntry.value) {
      const { error } = await supabase
        .from('category_brand_seo')
        .update(payload)
        .eq('id', editingEntry.value.id)
      if (error) throw error
      toast.success('SEO-текст обновлён')
    }
    else {
      const { error } = await supabase
        .from('category_brand_seo')
        .insert(payload)
      if (error) throw error
      toast.success('SEO-текст создан')
    }

    isDialogOpen.value = false
    await loadEntries()
  }
  catch (error: any) {
    toast.error('Ошибка сохранения', { description: error.message })
  }
  finally {
    isSaving.value = false
  }
}

async function handleDelete(entry: CategoryBrandSeoEntry) {
  try {
    const { error } = await supabase
      .from('category_brand_seo')
      .delete()
      .eq('id', entry.id)
    if (error) throw error
    toast.success('Удалено')
    await loadEntries()
  }
  catch (error: any) {
    toast.error('Ошибка удаления', { description: error.message })
  }
}

// Превью URL
const previewUrl = computed(() => {
  const cat = categories.value.find(c => c.id === form.value.category_id)
  const brand = brands.value.find(b => b.id === form.value.brand_id)
  if (cat && brand) {
    return `/catalog/${cat.slug}?brand=${brand.slug}`
  }
  return null
})
</script>

<template>
  <div class="space-y-6">
    <!-- Заголовок -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          SEO: Бренд + Категория
        </h1>
        <p class="text-muted-foreground mt-1">
          Управление SEO-текстами для связки бренд+категория (Brand Landing Pages)
        </p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" @click="handleGenerateFaq" :disabled="isGeneratingFaq">
          <svg v-if="isGeneratingFaq" class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {{ isGeneratingFaq ? 'Генерация FAQ...' : '❓ Генерация FAQ' }}
        </Button>
        <Button variant="outline" @click="handleAutoGenerate" :disabled="isGenerating">
          <svg v-if="isGenerating" class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {{ isGenerating ? 'Генерация...' : '🤖 Автогенерация' }}
        </Button>
        <Button @click="openNewDialog">
          <Plus class="w-4 h-4 mr-2" />
          Добавить
        </Button>
      </div>
    </div>

    <!-- Поиск -->
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        v-model="searchQuery"
        placeholder="Поиск по категории или бренду..."
        class="pl-10"
      />
    </div>

    <!-- Таблица -->
    <div class="border rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="text-left p-3 font-medium">
              Категория
            </th>
            <th class="text-left p-3 font-medium">
              Бренд
            </th>
            <th class="text-left p-3 font-medium">
              H1
            </th>
            <th class="text-left p-3 font-medium">
              URL
            </th>
            <th class="text-right p-3 font-medium">
              Действия
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="isLoading">
            <td colspan="5" class="p-8 text-center text-muted-foreground">
              Загрузка...
            </td>
          </tr>
          <tr v-else-if="filteredEntries.length === 0">
            <td colspan="5" class="p-8 text-center text-muted-foreground">
              Нет записей
            </td>
          </tr>
          <tr
            v-for="entry in filteredEntries"
            v-else
            :key="entry.id"
            class="border-t hover:bg-muted/30 transition-colors"
          >
            <td class="p-3">
              {{ entry.category_name }}
            </td>
            <td class="p-3 font-medium">
              {{ entry.brand_name }}
            </td>
            <td class="p-3 text-muted-foreground max-w-xs truncate">
              {{ entry.seo_h1 || '—' }}
            </td>
            <td class="p-3">
              <code class="text-xs bg-muted px-1.5 py-0.5 rounded">
                /catalog/{{ entry.category_slug }}?brand={{ entry.brand_slug }}
              </code>
            </td>
            <td class="p-3 text-right">
              <div class="flex items-center justify-end gap-1">
                <Button variant="ghost" size="sm" @click="openEditDialog(entry)">
                  Редактировать
                </Button>
                <Button variant="ghost" size="icon" class="text-destructive" @click="handleDelete(entry)">
                  <Trash2 class="w-4 h-4" />
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Диалог создания/редактирования -->
    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {{ editingEntry ? 'Редактировать SEO-текст' : 'Новый SEO-текст' }}
          </DialogTitle>
          <DialogDescription>
            Настройте SEO-тексты для связки бренд+категория
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-4">
          <!-- Категория и Бренд -->
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label>Категория</Label>
              <select
                v-model="form.category_id"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                :disabled="!!editingEntry"
              >
                <option value="">
                  Выберите...
                </option>
                <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                  {{ cat.name }}
                </option>
              </select>
            </div>
            <div class="space-y-2">
              <Label>Бренд</Label>
              <select
                v-model="form.brand_id"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                :disabled="!!editingEntry"
              >
                <option value="">
                  Выберите...
                </option>
                <option v-for="brand in brands" :key="brand.id" :value="brand.id">
                  {{ brand.name }}
                </option>
              </select>
            </div>
          </div>

          <!-- Превью URL -->
          <div v-if="previewUrl" class="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            URL: <code class="text-primary">{{ previewUrl }}</code>
          </div>

          <!-- SEO H1 -->
          <div class="space-y-2">
            <Label>H1 заголовок</Label>
            <Input v-model="form.seo_h1" placeholder="Конструкторы LEGO для мальчиков в Алматы" />
            <p class="text-xs text-muted-foreground">
              Если пусто — генерируется автоматически: «{Категория} {Бренд} в Алматы»
            </p>
          </div>

          <!-- SEO Title -->
          <div class="space-y-2">
            <Label>Meta Title</Label>
            <Input v-model="form.seo_title" placeholder="Купить конструкторы LEGO для мальчиков | Ухтышка" />
            <p class="text-xs text-muted-foreground">
              Если пусто — генерируется автоматически
            </p>
          </div>

          <!-- SEO Description -->
          <div class="space-y-2">
            <Label>Meta Description</Label>
            <Textarea v-model="form.seo_description" placeholder="Описание страницы для поисковых систем..." :rows="3" />
          </div>

          <!-- SEO Text -->
          <div class="space-y-2">
            <Label>SEO-текст (HTML)</Label>
            <Textarea
              v-model="form.seo_text"
              placeholder="<h2>Конструкторы LEGO для мальчиков</h2><p>Текст для SEO...</p>"
              :rows="6"
            />
            <p class="text-xs text-muted-foreground">
              Если пусто — генерируется автоматически. Поддерживает HTML.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="isDialogOpen = false">
            Отмена
          </Button>
          <Button :disabled="isSaving" @click="handleSave">
            <Save class="w-4 h-4 mr-2" />
            {{ isSaving ? 'Сохранение...' : 'Сохранить' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
