import { NAV_ITEMS } from '../../config/navigation'

export default function Sidebar({ profile }) {
  const items = NAV_ITEMS.filter(item => item.href !== 'inventory-audit.html' || profile?.role === 'admin')
  return <aside className="sidebar"><div className="sidebar-brand"><div className="brand-mark small">F</div><div><b>Farma</b><small>إدارة الصيدلية</small></div></div><nav>{items.map(item => <a key={item.href} className={item.href === 'inventory.html' ? 'active' : ''} href={`/${item.href}`}><span>{item.icon}</span>{item.label}</a>)}</nav></aside>
}
