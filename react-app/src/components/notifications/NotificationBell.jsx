import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NOTIFICATION_TYPES } from '../../config/navigation'
import { loadNotifications, markNotificationRead } from '../../services/notificationService'
import { createNotificationSound } from './notificationSound'

function formatDate(value) { return new Date(value).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }

export default function NotificationBell() {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const previousUnread = useRef(null)
  const sound = useMemo(() => createNotificationSound(), [])
  const load = useCallback(async () => {
    try {
      const next = await loadNotifications()
      const unread = next.filter(row => !row.read_at).length
      if (previousUnread.current !== null && unread > previousUnread.current) sound.play()
      previousUnread.current = unread
      setRows(next)
    } catch (error) { console.warn('Notifications unavailable:', error) }
  }, [sound])
  useEffect(() => { load(); const timer = setInterval(load, 60000); return () => clearInterval(timer) }, [load])
  const unread = rows.filter(row => !row.read_at).length
  async function openNotification(row) { sound.unlock(); try { await markNotificationRead(row.id) } finally { setOpen(false); if (row.link) window.location.href = row.link } }
  return <div className="notification-wrap">
    <button className="icon-button" onClick={() => { sound.unlock(); setOpen(value => !value) }} aria-label="الإشعارات">🔔{unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}</button>
    {open && <div className="notification-panel"><strong>الإشعارات</strong>{rows.length ? rows.map(row => <button className={`notification-row ${row.read_at ? '' : 'unread'}`} key={row.id} onClick={() => openNotification(row)}><b>{row.title}</b><span>{row.body}</span><small>{NOTIFICATION_TYPES[row.type] || 'إشعار عام'} — {formatDate(row.created_at)}</small></button>) : <div className="empty-state">لا توجد إشعارات جديدة.</div>}</div>}
  </div>
}
