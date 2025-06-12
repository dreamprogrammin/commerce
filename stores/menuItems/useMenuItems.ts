import type { Database } from "~/types";

type MenuItemRow = Database['public']['Tables']['menu_items']['Row']
type MenuItemInsert = Database['public']['Tables']['menu_items']['Insert']
type MenuItemUpdate = Database['public']['Tables']['menu_items']['Update']

export const useMenuItems = defineStore('menu-items', () => {
    const supabase = useSupabaseClient<Database>()

    //state
    const menuItems = ref<MenuItemRow[]>([])
    const isLoading = ref(false)
    const error = ref<string | null>(null)
    
    //getter
    const parentSlugOptions = computed(() => {
        return [
            {value: null, label: 'Нет родителя (верхний уровень)'},
            ...menuItems.value
            .filter((item) => item.item_type === 'trigger' || item.item_type === 'trigger_and_link')
            .map((item) =>  ({value: item.slug, label: `${item.title} (${item.slug})`}))
        ]
    })

    const topLevelItems = computed(() =>          
        menuItems.value
        .filter((item) => !item.parent_slug)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
    )

    function getChildren (parentSlug: string) : MenuItemRow[] {
        return menuItems.value
        .filter((item) => item.parent_slug === parentSlug)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
    }

    //actions

    async function fetchItems() {
        isLoading.value = true
        error.value = null
        try {
            const {data, error : fetchError} = await supabase
            .from('menu_items')
            .select('*')
            .order('parent_slug', {nullsFirst : true})
            .order('display_order', {nullsFirst: true})

            if (fetchError) throw fetchError

            menuItems.value = data || []
        } catch (e) {
            error.value = handleSupabaseError(e, {operationName : 'Ошибка при загрузке'})          
        } finally {
            isLoading.value = false
        }
    }

    async function addItem(newItem : MenuItemInsert) {
        isLoading.value = true
        error.value = null
        try {
            
        } catch (error) {
            
        } finally {

        }
    }
})