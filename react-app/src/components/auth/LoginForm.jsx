import { useState } from 'react'
import { signIn } from '../../services/authService'

export default function LoginForm({ onLoggedIn }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try { onLoggedIn(await signIn(identifier, password)) }
    catch { setError('بيانات الدخول غير صحيحة أو الحساب غير متاح.') }
    finally { setBusy(false) }
  }

  return <main className="login-screen"><form className="login-card" onSubmit={submit}>
    <div className="brand-mark">F</div><h1>Farma</h1><p>نظام إدارة الصيدلية</p>
    <label>البريد الإلكتروني أو اسم المستخدم<input value={identifier} onChange={event => setIdentifier(event.target.value)} autoComplete="username" required /></label>
    <label>كلمة المرور<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></label>
    {error && <div className="error-text">{error}</div>}
    <button className="primary-button" disabled={busy}>{busy ? 'جاري الدخول...' : 'تسجيل الدخول'}</button>
  </form></main>
}
