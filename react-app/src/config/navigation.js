export const NAV_ITEMS = [
  { href: 'inventory.html', label: 'المخزون', icon: '📦' },
  { href: 'sales.html', label: 'المبيعات', icon: '🛒' },
  { href: 'attendance.html', label: 'الحضور والانصراف', icon: '🕘' },
  { href: 'customers.html', label: 'العملاء', icon: '👥' },
  { href: 'shortages.html', label: 'النواقص والصلاحية', icon: '⚠️' },
  { href: 'orders.html', label: 'أوامر الشراء', icon: '🧾' },
  { href: 'expenses.html', label: 'المصروفات', icon: '💳' },
  { href: 'profit.html', label: 'الأرباح والتقارير', icon: '📊' },
  { href: 'search.html', label: 'البحث عن دواء', icon: '🔎' },
]

export const NOTIFICATION_TYPES = {
  request_pending: 'طلب موظف',
  request_decision: 'نتيجة طلب',
  stock_low: 'مخزون منخفض',
  stock_out: 'نفد من المخزون',
  expiry_near: 'صلاحية قريبة',
}
