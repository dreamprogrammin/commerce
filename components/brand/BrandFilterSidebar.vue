<script setup lang="ts">
import type { BrandFilterState } from '@/composables/useBrandPageFilters'
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-vue-next'

const props = defineProps<{
  state: BrandFilterState
}>()

const { state } = props
</script>

<template>
  <div class="bg-white border rounded-xl flex flex-col sticky top-4 max-h-[calc(100vh-2rem)]">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b shrink-0">
      <div class="flex items-center gap-2">
        <SlidersHorizontal class="w-4 h-4 text-muted-foreground" />
        <h3 class="font-semibold text-sm">
          Фильтры
        </h3>
      </div>
      <Badge v-if="state.activeFiltersCount.value > 0" variant="secondary" class="bg-primary/10 text-primary text-xs">
        {{ state.activeFiltersCount.value }}
      </Badge>
    </div>

    <!-- Scrollable filter sections -->
    <div class="flex-1 overflow-y-auto scrollbar-thin">
      <!-- Product Lines (hidden on line pages) -->
      <Collapsible
        v-if="!state.hideProductLines.value && state.availableProductLines.value.length > 0"
        :default-open="true"
      >
        <template #default="{ open }">
          <CollapsibleTrigger class="flex items-center justify-between w-full px-4 py-3 border-b hover:bg-muted/50 transition-colors text-left">
            <span class="text-sm font-medium">Коллекции</span>
            <div class="flex items-center gap-1.5">
              <span v-if="state.selectedProductLineIds.value.length > 0" class="text-[10px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                {{ state.selectedProductLineIds.value.length }}
              </span>
              <ChevronDown
                class="w-4 h-4 text-muted-foreground transition-transform duration-200"
                :class="{ '-rotate-180': open }"
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="p-3 space-y-1">
              <button
                v-for="line in state.availableProductLines.value"
                :key="line.id"
                type="button"
                class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all duration-150"
                :class="[
                  state.selectedProductLineIds.value.includes(line.id)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-muted/60 text-foreground/80',
                ]"
                @click="state.toggleProductLine(line.id)"
              >
                <div
                  class="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
                  :class="state.selectedProductLineIds.value.includes(line.id)
                    ? 'bg-primary border-primary text-white' : 'border-border'"
                >
                  <Icon
                    v-if="state.selectedProductLineIds.value.includes(line.id)"
                    name="lucide:check"
                    class="w-3 h-3"
                  />
                </div>
                <span class="truncate">{{ line.name }}</span>
              </button>
            </div>
          </CollapsibleContent>
        </template>
      </Collapsible>

      <!-- Price -->
      <Collapsible :default-open="true">
        <template #default="{ open }">
          <CollapsibleTrigger class="flex items-center justify-between w-full px-4 py-3 border-b hover:bg-muted/50 transition-colors text-left">
            <span class="text-sm font-medium">Цена</span>
            <div class="flex items-center gap-1.5">
              <span
                v-if="state.priceFilter.value[0] > state.priceRange.value.min || state.priceFilter.value[1] < state.priceRange.value.max"
                class="text-[10px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5"
              >
                1
              </span>
              <ChevronDown
                class="w-4 h-4 text-muted-foreground transition-transform duration-200"
                :class="{ '-rotate-180': open }"
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="p-4 space-y-3">
              <ClientOnly>
                <Slider
                  v-model="state.localPrice.value"
                  :min="state.priceRange.value.min"
                  :max="state.priceRange.value.max"
                  :step="100"
                  @value-commit="state.commitPrice"
                />
                <div class="flex justify-between items-center gap-2 mt-3">
                  <div class="flex-1 p-2 rounded-lg bg-muted/60 text-center">
                    <div class="text-[10px] text-muted-foreground">
                      От
                    </div>
                    <div class="font-semibold text-xs">
                      {{ new Intl.NumberFormat('ru-RU').format(Math.round(state.localPrice.value[0])) }} ₸
                    </div>
                  </div>
                  <span class="text-muted-foreground text-xs">—</span>
                  <div class="flex-1 p-2 rounded-lg bg-muted/60 text-center">
                    <div class="text-[10px] text-muted-foreground">
                      До
                    </div>
                    <div class="font-semibold text-xs">
                      {{ new Intl.NumberFormat('ru-RU').format(Math.round(state.localPrice.value[1])) }} ₸
                    </div>
                  </div>
                </div>
                <template #fallback>
                  <div class="space-y-3">
                    <Skeleton class="h-3 w-full" />
                    <Skeleton class="h-8 w-full" />
                  </div>
                </template>
              </ClientOnly>
            </div>
          </CollapsibleContent>
        </template>
      </Collapsible>

      <!-- Materials -->
      <Collapsible v-if="state.availableMaterials.value.length > 0">
        <template #default="{ open }">
          <CollapsibleTrigger class="flex items-center justify-between w-full px-4 py-3 border-b hover:bg-muted/50 transition-colors text-left">
            <span class="text-sm font-medium">Материал</span>
            <div class="flex items-center gap-1.5">
              <span v-if="state.selectedMaterialIds.value.length > 0" class="text-[10px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                {{ state.selectedMaterialIds.value.length }}
              </span>
              <ChevronDown
                class="w-4 h-4 text-muted-foreground transition-transform duration-200"
                :class="{ '-rotate-180': open }"
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="p-3 space-y-1">
              <button
                v-for="material in state.availableMaterials.value"
                :key="material.id"
                type="button"
                class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all duration-150"
                :class="[
                  state.selectedMaterialIds.value.includes(String(material.id))
                    ? 'bg-emerald-500/10 text-emerald-700 font-medium'
                    : 'hover:bg-muted/60 text-foreground/80',
                ]"
                @click="state.toggleMaterial(String(material.id))"
              >
                <div
                  class="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
                  :class="state.selectedMaterialIds.value.includes(String(material.id))
                    ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-border'"
                >
                  <Icon
                    v-if="state.selectedMaterialIds.value.includes(String(material.id))"
                    name="lucide:check"
                    class="w-3 h-3"
                  />
                </div>
                <span class="truncate">{{ material.name }}</span>
              </button>
            </div>
          </CollapsibleContent>
        </template>
      </Collapsible>

      <!-- Countries -->
      <Collapsible v-if="state.availableCountries.value.length > 0">
        <template #default="{ open }">
          <CollapsibleTrigger class="flex items-center justify-between w-full px-4 py-3 border-b hover:bg-muted/50 transition-colors text-left">
            <span class="text-sm font-medium">Страна</span>
            <div class="flex items-center gap-1.5">
              <span v-if="state.selectedCountryIds.value.length > 0" class="text-[10px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                {{ state.selectedCountryIds.value.length }}
              </span>
              <ChevronDown
                class="w-4 h-4 text-muted-foreground transition-transform duration-200"
                :class="{ '-rotate-180': open }"
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="p-3 space-y-1">
              <button
                v-for="country in state.availableCountries.value"
                :key="country.id"
                type="button"
                class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all duration-150"
                :class="[
                  state.selectedCountryIds.value.includes(String(country.id))
                    ? 'bg-orange-500/10 text-orange-700 font-medium'
                    : 'hover:bg-muted/60 text-foreground/80',
                ]"
                @click="state.toggleCountry(String(country.id))"
              >
                <div
                  class="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
                  :class="state.selectedCountryIds.value.includes(String(country.id))
                    ? 'bg-orange-600 border-orange-600 text-white' : 'border-border'"
                >
                  <Icon
                    v-if="state.selectedCountryIds.value.includes(String(country.id))"
                    name="lucide:check"
                    class="w-3 h-3"
                  />
                </div>
                <span class="truncate">{{ country.name }}</span>
              </button>
            </div>
          </CollapsibleContent>
        </template>
      </Collapsible>
    </div>

    <!-- Reset button -->
    <div v-if="state.activeFiltersCount.value > 0" class="p-3 border-t shrink-0">
      <Button
        variant="outline"
        size="sm"
        class="w-full"
        @click="state.resetFilters()"
      >
        <RotateCcw class="w-3 h-3 mr-2" />
        Сбросить фильтры
      </Button>
    </div>
  </div>
</template>
