# 🎨 Паттерны кода и примеры для ИИ

> Практические примеры кода для работы с Uhti Commerce Platform

---

## 📋 Содержание

1. [Работа с Pinia Stores](#работа-с-pinia-stores)
2. [Работа с Supabase](#работа-с-supabase)
3. [Компоненты Vue](#компоненты-vue)
4. [Composables](#composables)
5. [RPC функции](#rpc-функции)
6. [Edge Functions](#edge-functions)
7. [Типичные задачи](#типичные-задачи)

---

## 🗄️ Работа с Pinia Stores

### Создание нового Store

```typescript
// stores/publicStore/exampleStore.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useExampleStore = defineStore('example', () => {
  // State
  const items = ref<Item[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const itemCount = computed(() => items.value.length)
  const hasItems = computed(() => items.value.length > 0)

  // Actions
  async function fetchItems() {
    isLoading.value = true
    error.value = null
    
    try {
      const supabase = useSupabaseClient<Database>()
      const { data, error: fetchError } = await supabase
        .from('items')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      items.value = data || []
    } catch (err: any) {
      error.value = err.message
      toast.error('Ошибка загрузки', { description: err.message })
    } finally {
      isLoading.value = false
    }
  }

  async function addItem(item: NewItem) {
    isLoading.value = true
    
    try {
      const supabase = useSupabaseClient<Database>()
      const { data, error: insertError } = await supabase
        .from('items')
        .insert(item)
        .select()
        .single()

      if (insertError) throw insertError
      
      items.value.unshift(data)
      toast.success('Товар добавлен')
    } catch (err: any) {
      toast.error('Ошибка добавления', { description: err.message })
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function clearCache() {
    items.value = []
    error.value = null
  }

  return {
    // State
    items,
    isLoading,
    error,
    // Getters
    itemCount,
    hasItems,
    // Actions
    fetchItems,
    addItem,
    clearCache
  }
}, {
  persist: {
    key: 'uhti-example-store',
    pick: ['items'] // Сохранять только items в localStorage
  }
})
```

### Использование Store в компоненте

```vue
<script setup lang="ts">
const exampleStore = useExampleStore()
const { items, isLoading, itemCount } = storeToRefs(exampleStore)

onMounted(async () => {
  if (!exampleStore.hasItems) {
    await exampleStore.fetchItems()
  }
})

async function handleAdd() {
  try {
    await exampleStore.addItem({ name: 'New Item' })
  } catch (error) {
    // Error already handled in store
  }
}
</script>

<template>
  <div>
    <div v-if="isLoading">
      <Skeleton class="h-10 w-full" />
    </div>
    
    <div v-else-if="exampleStore.hasItems">
      <p>Всего товаров: {{ itemCount }}</p>
      <div v-for="item in items" :key="item.id">
        {{ item.name }}
      </div>
    </div>
    
    <div v-else>
      <p>Нет товаров</p>
    </div>
    
    <Button @click="handleAdd">Добавить</Button>
  </div>
</template>
```

---

## 🔌 Работа с Supabase

### Базовые запросы

```typescript
// Получение данных
const supabase = useSupabaseClient<Database>()

// SELECT с фильтрами
const { data, error } = await supabase
  .from('products')
  .select('*, brands(*), product_images(*)')
  .eq('is_active', true)
  .gte('price', 1000)
  .lte('price', 5000)
  .order('created_at', { ascending: false })
  .limit(10)

// INSERT
const { data, error } = await supabase
  .from('products')
  .insert({
    name: 'Новый товар',
    price: 2500,
    category_id: 'uuid-here'
  })
  .select()
  .single()

// UPDATE
const { data, error } = await supabase
  .from('products')
  .update({ price: 3000 })
  .eq('id', productId)
  .select()
  .single()

// DELETE
const { error } = await supabase
  .from('products')
  .delete()
  .eq('id', productId)
```

### Вызов RPC функций

```typescript
// Простой RPC
const { data, error } = await supabase
  .rpc('get_personalized_recommendations', {
    p_user_id: userId,
    p_limit: 10
  })

// RPC с массивами
const { data, error } = await supabase
  .rpc('get_filtered_products', {
    p_category_slug: 'toys',
    p_brand_ids: ['uuid1', 'uuid2'],
    p_price_min: 1000,
    p_price_max: 5000,
    p_sort_by: 'popularity',
    p_page_number: 1,
    p_page_size: 20
  })

// RPC с JSONB
const { data, error } = await supabase
  .rpc('create_user_order', {
    p_cart_items: JSON.stringify([
      { product_id: 'uuid', quantity: 2, price: 1500 }
    ]),
    p_delivery_method: 'courier',
    p_payment_method: 'cash',
    p_delivery_address: JSON.stringify({
      city: 'Алматы',
      street: 'ул. Абая',
      building: '10'
    }),
    p_bonuses_to_spend: 500
  })
```

### Работа с Storage

```typescript
// Загрузка файла
const file = event.target.files[0]
const fileName = `${Date.now()}-${file.name}`

const { data, error } = await supabase.storage
  .from('product-images')
  .upload(fileName, file, {
    cacheControl: '3600',
    upsert: false
  })

// Получение публичного URL
const { data: { publicUrl } } = supabase.storage
  .from('product-images')
  .getPublicUrl(fileName)

// Удаление файла
const { error } = await supabase.storage
  .from('product-images')
  .remove([fileName])
```

### Realtime подписки

```typescript
// Подписка на изменения
const channel = supabase
  .channel('orders-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'orders',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      console.log('Change received!', payload)
      // Обновить локальное состояние
    }
  )
  .subscribe()

// Отписка
onUnmounted(() => {
  supabase.removeChannel(channel)
})
```

---

## 🧩 Компоненты Vue

### Базовый компонент с TypeScript

```vue
<script setup lang="ts">
interface Props {
  title: string
  description?: string
  isLoading?: boolean
  variant?: 'default' | 'primary' | 'secondary'
}

const props = withDefaults(defineProps<Props>(), {
  description: '',
  isLoading: false,
  variant: 'default'
})

interface Emits {
  (e: 'click'): void
  (e: 'update:modelValue', value: string): void
}

const emit = defineEmits<Emits>()

const handleClick = () => {
  emit('click')
}
</script>

<template>
  <div :class="['component', `variant-${variant}`]">
    <h2>{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    
    <Skeleton v-if="isLoading" class="h-10 w-full" />
    <slot v-else />
    
    <Button @click="handleClick">
      Действие
    </Button>
  </div>
</template>

<style scoped>
.component {
  @apply p-4 rounded-lg border;
}

.variant-primary {
  @apply bg-primary text-primary-foreground;
}

.variant-secondary {
  @apply bg-secondary text-secondary-foreground;
}
</style>
```

### Компонент с формой

```vue
<script setup lang="ts">
import { z } from 'zod'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'

const schema = z.object({
  name: z.string().min(3, 'Минимум 3 символа'),
  email: z.string().email('Неверный email'),
  phone: z.string().regex(/^\+7\d{10}$/, 'Формат: +7XXXXXXXXXX')
})

const form = useForm({
  validationSchema: toTypedSchema(schema),
  initialValues: {
    name: '',
    email: '',
    phone: ''
  }
})

const onSubmit = form.handleSubmit(async (values) => {
  try {
    // Отправка данных
    await submitData(values)
    toast.success('Данные сохранены')
    form.resetForm()
  } catch (error: any) {
    toast.error('Ошибка', { description: error.message })
  }
})
</script>

<template>
  <form @submit="onSubmit">
    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel>Имя</FormLabel>
        <FormControl>
          <Input v-bind="componentField" placeholder="Введите имя" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="email">
      <FormItem>
        <FormLabel>Email</FormLabel>
        <FormControl>
          <Input v-bind="componentField" type="email" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <Button type="submit" :disabled="form.isSubmitting.value">
      Сохранить
    </Button>
  </form>
</template>
```

---

## 🎣 Composables

### Создание Composable

```typescript
// composables/useExample.ts
export function useExample() {
  const data = ref<Data[]>([])
  const isLoading = ref(false)
  const error = ref<Error | null>(null)

  async function fetchData() {
    isLoading.value = true
    error.value = null

    try {
      const supabase = useSupabaseClient<Database>()
      const { data: result, error: fetchError } = await supabase
        .from('table')
        .select('*')

      if (fetchError) throw fetchError
      data.value = result || []
    } catch (err: any) {
      error.value = err
      toast.error('Ошибка загрузки', { description: err.message })
    } finally {
      isLoading.value = false
    }
  }

  return {
    data: readonly(data),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchData
  }
}
```

### Composable с TanStack Query

```typescript
// composables/useProducts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'

export function useProducts() {
  const supabase = useSupabaseClient<Database>()
  const queryClient = useQueryClient()

  // Query
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)

      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000, // 5 минут
    gcTime: 10 * 60 * 1000 // 10 минут
  })

  // Mutation
  const { mutateAsync: addProduct } = useMutation({
    mutationFn: async (product: NewProduct) => {
      const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      // Инвалидация кеша
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Товар добавлен')
    },
    onError: (error: any) => {
      toast.error('Ошибка', { description: error.message })
    }
  })

  return {
    products: data,
    isLoading,
    error,
    refetch,
    addProduct
  }
}
```

---

## 🔧 RPC функции

### Создание RPC функции

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_create_example_rpc.sql

CREATE OR REPLACE FUNCTION public.get_example_data(
    p_category_id UUID,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    price NUMERIC,
    category_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.price,
        c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.category_id = p_category_id
      AND p.is_active = true
    ORDER BY p.created_at DESC
    LIMIT p_limit;
END;
$$;

-- Комментарий для документации
COMMENT ON FUNCTION public.get_example_data IS 
'Получает товары по категории с именем категории';
```

### RPC с массивами

```sql
CREATE OR REPLACE FUNCTION public.filter_products(
    p_brand_ids UUID[],
    p_material_ids INT[]
)
RETURNS SETOF products
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT p.*
    FROM products p
    WHERE (
        p_brand_ids IS NULL 
        OR p.brand_id = ANY(p_brand_ids)
    )
    AND (
        p_material_ids IS NULL 
        OR p.material_id = ANY(p_material_ids)
    );
END;
$$;
```

### RPC с JSONB

```sql
CREATE OR REPLACE FUNCTION public.create_order(
    p_items JSONB,
    p_delivery_info JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id UUID;
    v_item JSONB;
BEGIN
    -- Создание заказа
    INSERT INTO orders (user_id, delivery_info)
    VALUES (auth.uid(), p_delivery_info)
    RETURNING id INTO v_order_id;

    -- Добавление товаров
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO order_items (
            order_id,
            product_id,
            quantity,
            price
        ) VALUES (
            v_order_id,
            (v_item->>'product_id')::UUID,
            (v_item->>'quantity')::INT,
            (v_item->>'price')::NUMERIC
        );
    END LOOP;

    RETURN v_order_id;
END;
$$;
```

---

## ⚡ Edge Functions

### Базовая Edge Function

```typescript
// supabase/functions/example-function/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Создание Supabase клиента
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Получение данных из запроса
    const { record } = await req.json()

    // Бизнес-логика
    const result = await processData(record)

    // Возврат результата
    return new Response(
      JSON.stringify({ success: true, data: result }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
```

### Edge Function с Telegram

```typescript
// supabase/functions/notify-telegram/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID')

serve(async (req) => {
  try {
    const { message, order_id } = await req.json()

    // Отправка сообщения в Telegram
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              {
                text: '✅ Подтвердить',
                callback_data: `confirm_${order_id}`
              },
              {
                text: '❌ Отменить',
                callback_data: `cancel_${order_id}`
              }
            ]]
          }
        })
      }
    )

    const data = await response.json()

    return new Response(
      JSON.stringify({ success: true, message_id: data.result.message_id }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

---

## 🎯 Типичные задачи

### Добавление нового товара

```typescript
async function addProduct(productData: NewProduct) {
  const supabase = useSupabaseClient<Database>()
  
  // 1. Загрузка изображений
  const imageUrls: string[] = []
  for (const file of productData.images) {
    const fileName = `${Date.now()}-${file.name}`
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(fileName, file)
    
    if (error) throw error
    imageUrls.push(fileName)
  }

  // 2. Создание товара
  const { data: product, error: productError } = await supabase
    .from('products')
    .insert({
      name: productData.name,
      price: productData.price,
      category_id: productData.category_id,
      brand_id: productData.brand_id,
      stock_quantity: productData.stock_quantity
    })
    .select()
    .single()

  if (productError) throw productError

  // 3. Добавление изображений
  const imageInserts = imageUrls.map((url, index) => ({
    product_id: product.id,
    image_url: url,
    display_order: index
  }))

  const { error: imagesError } = await supabase
    .from('product_images')
    .insert(imageInserts)

  if (imagesError) throw imagesError

  return product
}
```

### Создание заказа с бонусами

```typescript
async function createOrder(cartItems: CartItem[], bonusesToSpend: number) {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  if (!user.value) {
    // Гостевой заказ
    return await supabase.rpc('create_guest_checkout', {
      p_cart_items: JSON.stringify(cartItems),
      p_guest_info: JSON.stringify({
        name: guestName,
        email: guestEmail,
        phone: guestPhone
      }),
      p_delivery_method: deliveryMethod,
      p_delivery_address: JSON.stringify(deliveryAddress),
      p_payment_method: paymentMethod
    })
  } else {
    // Заказ зарегистрированного пользователя
    return await supabase.rpc('create_user_order', {
      p_cart_items: JSON.stringify(cartItems),
      p_delivery_method: deliveryMethod,
      p_payment_method: paymentMethod,
      p_delivery_address: JSON.stringify(deliveryAddress),
      p_bonuses_to_spend: bonusesToSpend
    })
  }
}
```

### Фильтрация каталога

```typescript
async function filterProducts(filters: CatalogFilters) {
  const supabase = useSupabaseClient<Database>()

  const { data, error } = await supabase.rpc('get_filtered_products', {
    p_category_slug: filters.categorySlug,
    p_subcategory_ids: filters.subcategoryIds || [],
    p_brand_ids: filters.brandIds || [],
    p_price_min: filters.priceMin || 0,
    p_price_max: filters.priceMax || 999999,
    p_sort_by: filters.sortBy || 'popularity',
    p_page_number: filters.page || 1,
    p_page_size: filters.pageSize || 20,
    p_attributes: filters.attributes || [],
    p_material_ids: filters.materialIds || [],
    p_country_ids: filters.countryIds || []
  })

  if (error) throw error
  return data
}
```

---

**Дата создания:** 21 мая 2026  
**Версия:** 1.0
