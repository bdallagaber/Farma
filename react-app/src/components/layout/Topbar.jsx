import NotificationBell from '../notifications/NotificationBell'
import { signOut } from '../../services/authService'

export default function Topbar({ profile }) {
  return <header className="topbar"><div><span className="eyebrow">لوحة الإدارة</span><h1>نظام إدارة الصيدلية</h1></div><div className="top-actions"><span className="user-chip">{profile.full_name || 'مستخدم'} · {profile.role === 'admin' ? 'أدمن' : 'موظف'}</span><NotificationBell /><button className="logout-button" onClick={() => signOut()}>خروج</button></div></header>
}
