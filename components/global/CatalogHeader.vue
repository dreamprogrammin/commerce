<script setup lang="ts">
const sortBy = defineModel<string>('sortBy', { required: true })
</script>

<template>
  <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
    <div>
      <Select v-model="sortBy">
        <SelectTrigger class="w-[220px]">
          <SelectValue placeholder="Сортировка" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="popularity">
            Популярные
          </SelectItem>
          <SelectItem value="newest">
            По новизне
          </SelectItem>
          <SelectItem value="price_asc">
            Цена: по возрастанию
          </SelectItem>
          <SelectItem value="price_desc">
            Цена: по убыванию
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</template>
