<script setup lang="ts">
import type { BrandFilterState } from '@/composables/useBrandPageFilters'
import { RotateCcw, SlidersHorizontal } from 'lucide-vue-next'

const props = defineProps<{
  state: BrandFilterState
}>()

const { state } = props

const isOpen = computed({
  get: () => state.mobileFiltersOpen.value,
  set: val => state.mobileFiltersOpen.value = val,
})
</script>

<template>
  <Drawer v-model:open="isOpen">
    <DrawerContent class="max-h-[85vh]">
      <DrawerHeader>
        <DrawerTitle class="flex items-center gap-2">
          <SlidersHorizontal class="w-5 h-5" />
          Фильтры
        </DrawerTitle>
        <DrawerDescription v-if="state.activeFiltersCount.value > 0">
          Активно фильтров: {{ state.activeFiltersCount.value }}
        </DrawerDescription>
        <DrawerDescription v-else>
          Настройте параметры поиска
        </DrawerDescription>
      </DrawerHeader>

      <div class="px-4 pb-4 space-y-4 max-h-[55vh] overflow-y-auto">
        <!-- Product Lines -->
        <div v-if="!state.hideProductLines.value && state.availableProductLines.value.length > 0" class="space-y-2">
          <h4 class="font-semibold text-sm text-muted-foreground">
            Коллекции
          </h4>
          <div class="space-y-1.5">
            <button
              v-for="line in state.availableProductLines.value"
              :key="line.id"
              type="button"
              class="w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200"
              :class="[
                state.selectedProductLineIds.value.includes(line.id)
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                  : 'bg-muted/40 hover:bg-muted/60 active:scale-[0.98]',
              ]"
              @click="state.toggleProductLine(line.id)"
            >
              <div
                class="w-5 h-5 rounded border flex items-center justify-center shrink-0"
                :class="state.selectedProductLineIds.value.includes(line.id)
                  ? 'bg-primary border-primary text-white' : 'border-border'"
              >
                <Icon
                  v-if="state.selectedProductLineIds.value.includes(line.id)"
                  name="lucide:check"
                  class="w-3.5 h-3.5"
                />
              </div>
              <span class="font-medium text-sm">{{ line.name }}</span>
            </button>
          </div>
        </div>

        <!-- Price -->
        <div class="space-y-3 pt-3 border-t">
          <h4 class="font-semibold text-sm text-muted-foreground">
            Цена
          </h4>
          <ClientOnly>
            <div class="px-1">
              <Slider
                v-model="state.localPrice.value"
                :min="state.priceRange.value.min"
                :max="state.priceRange.value.max"
                :step="100"
                @value-commit="state.commitPrice"
              />
            </div>
            <div class="flex justify-between items-center gap-2 mt-2">
              <div class="flex-1 p-2.5 rounded-lg bg-muted/60 text-center">
                <div class="text-xs text-muted-foreground mb-0.5">
                  От
                </div>
                <div class="font-semibold text-sm">
                  {{ new Intl.NumberFormat('ru-RU').format(Math.round(state.localPrice.value[0])) }} ₸
                </div>
              </div>
              <span class="text-muted-foreground">—</span>
              <div class="flex-1 p-2.5 rounded-lg bg-muted/60 text-center">
                <div class="text-xs text-muted-foreground mb-0.5">
                  До
                </div>
                <div class="font-semibold text-sm">
                  {{ new Intl.NumberFormat('ru-RU').format(Math.round(state.localPrice.value[1])) }} ₸
                </div>
              </div>
            </div>
            <template #fallback>
              <Skeleton class="h-10 w-full" />
            </template>
          </ClientOnly>
        </div>

        <!-- Materials -->
        <div v-if="state.availableMaterials.value.length > 0" class="space-y-2 pt-3 border-t">
          <h4 class="font-semibold text-sm text-muted-foreground">
            Материал
          </h4>
          <div class="space-y-1.5">
            <button
              v-for="material in state.availableMaterials.value"
              :key="material.id"
              type="button"
              class="w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200"
              :class="[
                state.selectedMaterialIds.value.includes(String(material.id))
                  ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30'
                  : 'bg-muted/40 hover:bg-muted/60 active:scale-[0.98]',
              ]"
              @click="state.toggleMaterial(String(material.id))"
            >
              <div
                class="w-5 h-5 rounded border flex items-center justify-center shrink-0"
                :class="state.selectedMaterialIds.value.includes(String(material.id))
                  ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-border'"
              >
                <Icon
                  v-if="state.selectedMaterialIds.value.includes(String(material.id))"
                  name="lucide:check"
                  class="w-3.5 h-3.5"
                />
              </div>
              <span class="font-medium text-sm">{{ material.name }}</span>
            </button>
          </div>
        </div>

        <!-- Countries -->
        <div v-if="state.availableCountries.value.length > 0" class="space-y-2 pt-3 border-t">
          <h4 class="font-semibold text-sm text-muted-foreground">
            Страна
          </h4>
          <div class="space-y-1.5">
            <button
              v-for="country in state.availableCountries.value"
              :key="country.id"
              type="button"
              class="w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200"
              :class="[
                state.selectedCountryIds.value.includes(String(country.id))
                  ? 'bg-orange-500/10 text-orange-700 ring-1 ring-orange-500/30'
                  : 'bg-muted/40 hover:bg-muted/60 active:scale-[0.98]',
              ]"
              @click="state.toggleCountry(String(country.id))"
            >
              <div
                class="w-5 h-5 rounded border flex items-center justify-center shrink-0"
                :class="state.selectedCountryIds.value.includes(String(country.id))
                  ? 'bg-orange-600 border-orange-600 text-white' : 'border-border'"
              >
                <Icon
                  v-if="state.selectedCountryIds.value.includes(String(country.id))"
                  name="lucide:check"
                  class="w-3.5 h-3.5"
                />
              </div>
              <span class="font-medium text-sm">{{ country.name }}</span>
            </button>
          </div>
        </div>
      </div>

      <DrawerFooter>
        <Button
          v-if="state.activeFiltersCount.value > 0"
          variant="outline"
          class="w-full"
          @click="state.resetFilters()"
        >
          <RotateCcw class="w-4 h-4 mr-2" />
          Сбросить фильтры
        </Button>
        <DrawerClose as-child>
          <Button class="w-full">
            <Icon name="lucide:check" class="w-4 h-4 mr-2" />
            Показать результаты
          </Button>
        </DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>
