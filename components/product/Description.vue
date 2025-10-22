<script setup lang="ts">
defineProps<{
  description: string
}>()
</script>

<template>
  <div>
    <h3 class="text-xl font-semibold mb-4">
      Описание
    </h3>
    <Collapsible class="prose prose-sm max-w-none text-muted-foreground">
      <!-- Контент, который виден всегда (например, первые 200 символов) -->
      <p class="line-clamp-3">
        {{ description }}
      </p>
      <!-- Скрытый контент -->
      <CollapsibleContent>
        <p>{{ description }}</p>
      </CollapsibleContent>
      <!-- Кнопка "Читать полностью / Свернуть" -->
      <CollapsibleTrigger as-child>
        <Button variant="link" class="p-0 h-auto">
          Читать полностью
        </Button>
      </CollapsibleTrigger>
    </Collapsible>
  </div>
</template>
