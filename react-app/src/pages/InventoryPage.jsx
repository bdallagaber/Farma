import { useEffect, useMemo, useState } from 'react'
import { loadInventoryPage } from '../services/inventoryService'

const PAGE_SIZE = 200
export default function InventoryPage() {
  const [products, setProducts] = useState([])
  const [inventory, setInventory] = useState({})
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { let active = true; setLoading(true); loadInventoryPage({ page, pageSize: PAGE_SIZE, search: query }).then(result => { if (!active) return; setProducts(result.products); setInventory(Object.fromEntries(result.inventory.map(row => [row.product_id, row.quantity_smallest_unit]))); setTotal(result.total) }).catch(() => active && setError('تعذر تحميل بيانات المخزون.')).finally(() => active && setLoading(false)); return () => { active = false } }, [page, query])
  const filtered = useMemo(() => products, [products])
  function updateSearch(event) { setQuery(event.target.value); setPage(0) }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  return <section className="content"><div className="page-heading"><div><span className="eyebrow">React migration · المرحلة الأولى</span><h2>المخزون</h2><p>صفحة منظمة بتحميل جزئي للبيانات بدل تحميل كل الأصناف مرة واحدة.</p></div><div className="stat-card"><strong>{total}</strong><span>إجمالي الأصناف</span></div></div><div className="toolbar"><input value={query} onChange={updateSearch} placeholder="ابحث باسم الصنف..." /><span>{loading ? 'جاري التحميل...' : `${filtered.length} نتيجة في الصفحة`}</span></div>{error && <div className="error-text">{error}</div>}<div className="table-card"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>الحد الأدنى</th><th>الصلاحية</th><th>الحالة</th></tr></thead><tbody>{filtered.map(product => { const qty = Number(inventory[product.id] || 0); const low = qty <= Number(product.min_stock_threshold || 0); return <tr key={product.id}><td><b>{product.name}</b></td><td>{qty}</td><td>{product.min_stock_threshold ?? '—'}</td><td>{product.expiry_date || '—'}</td><td><span className={`status-pill ${qty === 0 ? 'danger' : low ? 'warning' : 'ok'}`}>{qty === 0 ? 'نفد' : low ? 'منخفض' : 'متاح'}</span></td></tr> })}</tbody></table>{!loading && !filtered.length && <div className="empty-state">لا توجد نتائج.</div>}</div><div className="pagination"><button disabled={page === 0} onClick={() => setPage(value => value - 1)}>السابق</button><span>صفحة {page + 1} من {pages}</span><button disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)}>التالي</button></div></section>
}
