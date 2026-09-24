(function installGlobalNotifications(){
  const typeLabel={request_pending:'طلبات الموظفين',request_decision:'نتيجة طلب',stock_low:'مخزون منخفض',stock_out:'صنف نفد',expiry_near:'صلاحية قريبة'};
  const esc=value=>{const el=document.createElement('div');el.textContent=value??'';return el.innerHTML};
  const fmt=value=>new Date(value).toLocaleString('ar-EG',{timeZone:'Africa/Cairo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  function mount(){
    if(document.querySelector('.farma-global-notifications'))return;
    const header=document.querySelector('header');if(!header)return;
    const host=header.querySelector('.headerbar')||header.querySelector(':scope > div:last-child')||header;
    const wrap=document.createElement('div');wrap.className='farma-global-notifications';wrap.style.cssText='position:relative;display:inline-flex;align-items:center;margin-inline:8px';
    wrap.innerHTML='<button type="button" class="farma-global-notif-btn" aria-label="الإشعارات" style="position:relative;background:transparent;border:1px solid var(--border,#d8dee8);border-radius:10px;padding:6px 10px;cursor:pointer;font-size:16px;line-height:1">🔔<span class="farma-global-notif-badge" style="display:none;position:absolute;top:-6px;right:-6px;background:#dc2626;color:#fff;border-radius:999px;font-size:10px;padding:1px 5px;font-weight:800;min-width:16px;text-align:center"></span></button><div class="farma-global-notif-panel" style="display:none;position:absolute;top:120%;right:0;background:#fff;color:#1f2937;border:1px solid var(--border,#d8dee8);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.15);width:320px;max-height:390px;overflow:auto;z-index:2500;padding:8px"><div style="font-weight:800;padding:6px 8px;border-bottom:1px solid #e5e7eb;margin-bottom:6px">الإشعارات</div><div class="farma-global-notif-list"></div></div>';
    host.insertBefore(wrap,host.querySelector('#logoutBtn')||null);
    const button=wrap.querySelector('.farma-global-notif-btn'),panel=wrap.querySelector('.farma-global-notif-panel'),badge=wrap.querySelector('.farma-global-notif-badge'),list=wrap.querySelector('.farma-global-notif-list');
    async function load(){const {data,error}=await sb.from('app_notifications').select('id,type,title,body,link,created_at,read_at').order('created_at',{ascending:false}).limit(50);if(error){console.warn('Notifications unavailable:',error);return}const rows=data||[],unread=rows.filter(n=>!n.read_at).length;badge.textContent=unread>99?'99+':String(unread);badge.style.display=unread?'inline-block':'none';list.innerHTML=rows.length?rows.map(n=>`<div data-id="${esc(n.id)}" style="padding:9px 8px;border-radius:8px;margin-bottom:4px;cursor:pointer;background:${n.read_at?'transparent':'#ecfdf5'};border-right:3px solid ${n.read_at?'transparent':'#0f766e'}"><strong>${esc(n.title)}</strong><div style="font-size:12px;margin-top:3px">${esc(n.body)}</div><div style="font-size:10px;color:#6b7280;margin-top:4px">${esc(typeLabel[n.type]||'إشعار عام')} — ${esc(fmt(n.created_at))}</div></div>`).join(''):'<div style="padding:18px;text-align:center;color:#6b7280">لا توجد إشعارات جديدة.</div>'}
    button.onclick=async event=>{event.stopPropagation();panel.style.display=panel.style.display==='none'?'block':'none';if(panel.style.display==='block')await load()};
    list.onclick=async event=>{const item=event.target.closest('[data-id]');if(!item)return;const id=item.dataset.id;const row=(await sb.from('app_notifications').select('id,link').eq('id',id).limit(1)).data?.[0];await sb.from('app_notifications').update({read_at:new Date().toISOString()}).eq('id',id);panel.style.display='none';if(row?.link)location.href=row.link};
    document.addEventListener('click',event=>{if(!event.target.closest('.farma-global-notifications'))panel.style.display='none'});
    load();setInterval(load,60000);
    const requestId=new URLSearchParams(location.search).get('notification')?.replace(/^request-/,'');if(requestId&&typeof window.openDecision==='function')setTimeout(()=>window.openDecision(requestId),1000);
  }
  document.addEventListener('DOMContentLoaded',async()=>{const session=await getStableSession();if(session)setTimeout(mount,250)});
})();
