<script setup lang="ts">
import { ref } from 'vue'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const dialog = ref(false)

const confirmAction = () => {
  // Действие при нажатии кнопки "Подтвердить"
  console.log('Действие подтверждено!')
  dialog.value = false
}
</script>
<template>
    <div>
      <Button variant="destructive" @click="dialog = true">Открыть диалог</Button>
      
      <Dialog :open="dialog" @update:open="dialog = $event">
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Диалоговое окно</DialogTitle>
            <DialogDescription>
              Пример диалогового окна с использованием компонентов shadcn/ui в Nuxt 3.
            </DialogDescription>
          </DialogHeader>
          
          <div class="py-4">
            <p>Здесь может быть любое содержимое вашего диалогового окна.</p>
          </div>
          
          <DialogFooter>
            <Button variant="outline" @click="dialog = false">Отмена</Button>
            <Button @click="confirmAction">Подтвердить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </template>