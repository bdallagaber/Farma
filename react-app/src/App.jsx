import { useEffect, useState } from 'react'
import { getCurrentSession, getProfile, subscribeToAuthChanges } from './services/authService'
import LoginForm from './components/auth/LoginForm'
import Sidebar from './components/layout/Sidebar'
import Topbar from './components/layout/Topbar'
import InventoryPage from './pages/InventoryPage'
import SalesPage from './pages/SalesPage'
import CustomersPage from './pages/CustomersPage'
import ShortagesPage from './pages/ShortagesPage'
import PurchaseOrdersPage from './pages/PurchaseOrdersPage'
import InventoryAuditPage from './pages/InventoryAuditPage'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [checking, setChecking] = useState(true)
  useEffect(() => { getCurrentSession().then(setSession).catch(() => setSession(null)).finally(() => setChecking(false)); return subscribeToAuthChanges(setSession) }, [])
  useEffect(() => { if (!session) { setProfile(null); return } getProfile(session.user.id).then(setProfile).catch(() => setProfile({ role: 'employee', full_name: session.user.email, allowed_pages: [] })) }, [session])
  if (checking) return <div className="loading-screen">جاري تحميل Farma...</div>
  if (!session) return <LoginForm onLoggedIn={setSession} />
  if (!profile) return <div className="loading-screen">جاري تحميل بيانات المستخدم...</div>
  const isSalesPreview = window.location.pathname.endsWith('/sales')
  const isCustomersPreview = window.location.pathname.endsWith('/customers')
  const isShortages = window.location.pathname.endsWith('/shortages')
  const isOrders = window.location.pathname.endsWith('/orders')
  const isAudit = window.location.pathname.endsWith('/inventory-audit')
  return <div className="app-shell"><Sidebar profile={profile} /><div className="main-area"><Topbar profile={profile} />{isSalesPreview ? <SalesPage /> : isCustomersPreview ? <CustomersPage userId={session.user.id} /> : isShortages ? <ShortagesPage /> : isOrders ? <PurchaseOrdersPage isAdmin={profile.role === 'admin'} /> : isAudit && profile.role === 'admin' ? <InventoryAuditPage /> : <InventoryPage userId={session.user.id} isAdmin={profile.role === 'admin'} />}</div></div>
}
