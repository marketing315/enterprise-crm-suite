// Sales Management Types

export type SalesOrderStatus = 
  | 'draft' 
  | 'confirmed' 
  | 'invoiced' 
  | 'partially_paid' 
  | 'paid' 
  | 'cancelled' 
  | 'refunded';

export type PaymentMethod = 
  | 'cash' 
  | 'card' 
  | 'bank_transfer' 
  | 'stripe' 
  | 'other';

export type PaymentStatus = 
  | 'pending' 
  | 'completed' 
  | 'failed' 
  | 'refunded';

export type CommissionStatus = 
  | 'pending' 
  | 'approved' 
  | 'paid';

export type SalesVisibilityCallcenter = 
  | 'none' 
  | 'aggregates' 
  | 'readonly';

// Product (catalog)
export interface Product {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  default_price: number;
  vat_rate: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Sales Order
export interface SalesOrder {
  id: string;
  brand_id: string;
  deal_id: string | null;
  contact_id: string;
  assigned_user_id: string | null;
  order_number: string;
  status: SalesOrderStatus;
  subtotal: number;
  discount_amount: number;
  discount_percent: number | null;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
}

// Extended with relations
export interface SalesOrderWithRelations extends SalesOrder {
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
  assigned_user?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  items?: SalesOrderItem[];
  payments?: Payment[];
}

// Sales Order Item
export interface SalesOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number | null;
  vat_rate: number | null;
  line_total: number;
  sort_order: number;
  created_at: string;
  product?: Product | null;
}

// Payment
export interface Payment {
  id: string;
  brand_id: string;
  order_id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  notes: string | null;
  paid_at: string | null;
  recorded_by_user_id: string | null;
  created_at: string;
  recorded_by?: {
    id: string;
    full_name: string | null;
  } | null;
}

// Commission
export interface SalesCommission {
  id: string;
  brand_id: string;
  user_id: string;
  order_id: string | null;
  commission_percent: number | null;
  commission_fixed: number | null;
  commission_amount: number;
  status: CommissionStatus;
  approved_by_user_id: string | null;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  user?: {
    id: string;
    full_name: string | null;
    email: string;
  };
  order?: SalesOrder | null;
}

// Target
export interface SalesTarget {
  id: string;
  brand_id: string;
  user_id: string | null;
  period_start: string;
  period_end: string;
  target_amount: number;
  target_count: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    full_name: string | null;
  } | null;
}

// Order History (audit)
export interface SalesOrderHistory {
  id: string;
  order_id: string;
  action: string;
  old_status: SalesOrderStatus | null;
  new_status: SalesOrderStatus | null;
  changed_by_user_id: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
  changed_by?: {
    id: string;
    full_name: string | null;
  } | null;
}

// KPI Response
export interface SalesKpis {
  total_revenue: number;
  total_orders: number;
  orders_paid: number;
  orders_pending: number;
  avg_order_value: number;
  conversion_rate: number;
}

// Form types for creating/editing
export interface CreateOrderItemInput {
  product_id?: string;
  name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  vat_rate?: number;
}

export interface RecordPaymentInput {
  order_id: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  paid_at?: string;
}

// Status labels and colors for UI
export const ORDER_STATUS_CONFIG: Record<SalesOrderStatus, { label: string; color: string }> = {
  draft: { label: 'Bozza', color: 'bg-gray-100 text-gray-800' },
  confirmed: { label: 'Confermato', color: 'bg-blue-100 text-blue-800' },
  invoiced: { label: 'Fatturato', color: 'bg-purple-100 text-purple-800' },
  partially_paid: { label: 'Pagamento parziale', color: 'bg-yellow-100 text-yellow-800' },
  paid: { label: 'Pagato', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Annullato', color: 'bg-red-100 text-red-800' },
  refunded: { label: 'Rimborsato', color: 'bg-orange-100 text-orange-800' },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Contanti',
  card: 'Carta',
  bank_transfer: 'Bonifico',
  stripe: 'Stripe',
  other: 'Altro',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'In attesa',
  completed: 'Completato',
  failed: 'Fallito',
  refunded: 'Rimborsato',
};
