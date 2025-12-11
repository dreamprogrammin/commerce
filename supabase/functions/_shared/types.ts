export interface OrderPayload {
  record: { id: string }
}

export interface OrderItem {
  quantity: number
  product: { name: string | null } | null
}

export interface OrderProfile {
  first_name: string | null
  last_name: string | null
  phone: string | null
}

export interface DeliveryAddress {
  city: string
  line1: string
  postalCode?: string
}

export interface OrderData {
  id: string
  final_amount: number
  created_at: string
  delivery_method: 'pickup' | 'courier'
  payment_method: string | null
  delivery_address: DeliveryAddress | null
  guest_name: string | null
  guest_phone: string | null
  guest_email: string | null
  profile: OrderProfile | null
  order_items: OrderItem[]
}