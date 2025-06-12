import { useMenuItems } from "~/stores/menuItems/useMenuItems";
import type { Database } from "~/types";

type MenuItemRow = Database['public']['Tables']['menu_items']['Row']
type MenuItemInsert = Database['public']['Tables']['menu_items']['Insert']
type MenuItemUpdate = Database['public']['Tables']['menu_items']['Update']

type MenuItemFormData = Omit<Partial<MenuItemRow>, 'created_id' | 'updated_id'>

export function useMenuItemFormData (initialSelectItem : Ref<MenuItemRow | null>) {
    const menuItemsStore = useMenuItems()
}