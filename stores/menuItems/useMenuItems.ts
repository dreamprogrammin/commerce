import { toast } from "vue-sonner"
import type { Database, MenuItem, MenuItemCreate } from "~/types"

export const useMenuItems = defineStore('menuItems', () => {
    const supabase = useSupabaseClient<Database>()
    const user = useSupabaseUser()

    //state 
    const isLoading = ref(false)
    const items = ref<MenuItem[]>([])

    //getter
    const parentSlugOptions = computed(() => {
        return items.value.map((item) => ({value : item.slug, label: item.title}))    
    })
    //action
    async function fetchItems() {
        isLoading.value = true
        try {
            const {data, error} = await supabase.from('menu_items').select('*').order('display_order', {ascending: true}).order('title', {ascending: true})
            if (error) throw error
            items.value = data || []
        } catch (error) {
            let errorMessage = "Произошла ошибка"
           if (error instanceof Error) {
              errorMessage = error.message  
           }
           toast.error('Ошибка при загрузке данных', {description: errorMessage})
        } finally {
            isLoading.value = false
        }      
    }

    async function addItem(newItem : MenuItem) {
       isLoading.value = true 
       try {
        const {data, error} = await supabase.from('menu_items').insert(newItem).select().single()

        if (error) throw error

        if (data) {
            items.value.push(data)

            toast.success('Успех', {
            description: `Элемент ${data.title} добавлен.`
        })
        }
       } catch (error) {
        let errorMessage = "Произошла ошибка"
        if (error instanceof Error) {
            errorMessage = error.message  
        }
        toast.error('Ошибка', {description: errorMessage})
       } finally {
            isLoading.value = false
       }
    }

    async function updateMenu(id : string, updates : MenuItemCreate) {
        isLoading.value = true
        try {
            const {data, error} = await supabase.from('menu_items').update(updates).eq('id', id).select().single()

            if (error) throw error

            if (data) {
                const index = items.value.findIndex((item) => item.id === id)
                if (index !== -1) items.value[index] = data

                toast.success('Успех' ,{
                    description: `Элемент ${data.title} обновлен`
                })
            }
        } catch (error) {
            let errorMessage = "Произошла ошибка"
            if (error instanceof Error) {
                errorMessage = error.message  
            }
            toast.error('Ошибка', {description: errorMessage})
        } finally {
           isLoading.value = false 
        }
    }

    async function deleteItem(itemToDelete : MenuItem) {
        const conformation = confirm(`Вы уверены что хотите удалить "${itemToDelete.title}" ?`)

        if (!conformation) return

        isLoading.value = true
        try {
            if (itemToDelete.image_url) {
                const fileName = itemToDelete.image_url.split('/').pop()
                if (fileName) await deleteImage(fileName)
            }
        
            const {error } = await supabase.from('menu_items').delete().eq('id', itemToDelete.id).select().single()

            if (error) throw error

            items.value = items.value.filter((item) => item.id === itemToDelete.id)

            toast.success('Успех', {
                description: `Элемент ${itemToDelete.title} удален.`
            })
        } catch (error) {
            let errorMessage = "Произошла ошибка"
            if (error instanceof Error) {
                errorMessage = error.message  
            }
            toast.error('Ошибка', {description: errorMessage})
        } finally {
            isLoading.value = false 
        }
    }

    async function deleteImage (fileName : string) {
        try {
            const {error} = await supabase.storage.from('menu-item-image').remove([fileName])
            if (error) throw error
        } catch (error) {
            console.log('ошибка')            
        }
    }
})