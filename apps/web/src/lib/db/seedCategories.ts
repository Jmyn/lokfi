export interface DbCategory {
  id: string
  name: string
  color: string // hex
  icon?: string // lucide icon name
  isIncome: boolean
}

export const defaultCategories: DbCategory[] = [
  { id: 'cat_food', name: 'Food & Dining', color: '#f97316', icon: 'Utensils', isIncome: false },
  { id: 'cat_transport', name: 'Transport', color: '#3b82f6', icon: 'Car', isIncome: false },
  {
    id: 'cat_groceries',
    name: 'Groceries',
    color: '#10b981',
    icon: 'ShoppingCart',
    isIncome: false,
  },
  { id: 'cat_shopping', name: 'Shopping', color: '#ec4899', icon: 'ShoppingBag', isIncome: false },
  {
    id: 'cat_health',
    name: 'Health & Fitness',
    color: '#ef4444',
    icon: 'HeartPulse',
    isIncome: false,
  },
  {
    id: 'cat_utilities',
    name: 'Bills & Utilities',
    color: '#8b5cf6',
    icon: 'Lightbulb',
    isIncome: false,
  },
  { id: 'cat_home', name: 'Home', color: '#14b8a6', icon: 'Home', isIncome: false },
  {
    id: 'cat_entertainment',
    name: 'Entertainment',
    color: '#84cc16',
    icon: 'Gamepad2',
    isIncome: false,
  },
  {
    id: 'cat_subscriptions',
    name: 'Subscriptions',
    color: '#6366f1',
    icon: 'Repeat',
    isIncome: false,
  },
  { id: 'cat_income', name: 'Income', color: '#22c55e', icon: 'ArrowDownToLine', isIncome: true },
  {
    id: 'cat_transfer',
    name: 'Transfers',
    color: '#64748b',
    icon: 'ArrowRightLeft',
    isIncome: false,
  },
]
