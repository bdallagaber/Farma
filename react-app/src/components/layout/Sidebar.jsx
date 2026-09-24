import { NAV_ITEMS } from '../../config/navigation'

export default function Sidebar() {
  return <aside className="sidebar"><div className="sidebar-brand"><div className="brand-mark small">F</div><div><b>Farma</b><small>إدارة الصيدلية</small></div></div><nav>{NAV_ITEMS.map(item => <a key={item.href} className={item.href === 'inventory.html' ? 'active' : ''} href={`/${item.href}`}><span>{item.icon}</span>{item.label}</a>)}</nav></aside>
}
