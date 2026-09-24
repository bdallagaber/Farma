import { useEffect, useState } from 'react'
import { getCurrentSession, getProfile, subscribeToAuthChanges } from './services/authService'
import LoginForm from './components/auth/LoginForm'
import Sidebar from './components/layout/Sidebar'
import Topbar from './components/layout/Topbar'
import InventoryPage from './pages/InventoryPage'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [checking, setChecking] = useState(true)
  useEffect(() => { getCurrentSession().then(setSession).catch(() => setSession(null)).finally(() => setChecking(false)); return subscribeToAuthChanges(setSession) }, [])
  useEffect(() => { if (!session) { setProfile(null); return } getProfile(session.user.id).then(setProfile).catch(() => setProfile({ role: 'employee', full_name: session.user.email, allowed_pages: [] })) }, [session])
  if (checking) return <div className="loading-screen">جاري تحميل Farma...</div>
  if (!session) return <LoginForm onLoggedIn={setSession} />
  if (!profile) return <div className="loading-screen">جاري تحميل بيانات المستخدم...</div>
  return <div className="app-shell"><Sidebar /><div className="main-area"><Topbar profile={profile} /><InventoryPage /></div></div>
}
