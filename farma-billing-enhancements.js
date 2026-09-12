(function(){
  const path=(location.pathname.split('/').pop()||'').toLowerCase();
  const isSales=path==='sales.html';
  const isInvoices=path==='invoices.html';
  if(!isSales&&!isInvoices)return;

  function installSalesPatch(){
    if(window.__farmaBillingSalesPatchInstalled)return;
    if(!window.sb||typeof window.sb.from!=='function')return;
    window.__farmaBillingSalesPatchInstalled=true;
    const originalFrom=window.sb.from.bind(window.sb);
    window.sb.from=function(table){
      const query=originalFrom(table);
      if(table!=='invoices'||!query||typeof query.insert!=='function')return query;
      const originalInsert=query.insert.bind(query);
      query.insert=function(values,options){
        try{
          const row=Array.isArray(values)?values[0]:values;
          if(row && typeof row==='object' && document.getElementById('s_sale_type')){
            let totals=null;
            if(typeof window.recalcTotals==='function') totals=window.recalcTotals();
            const subtotal=Number(totals?.subtotal)||0;
            const discount=Number(totals?.discount)||0;
            const finalTotal=Number(totals?.finalTotal)||0;
            const discountType=document.getElementById('s_discount_type')?.value||'none';
            const discountValue=Number(document.getElementById('s_discount_value')?.value)||0;
            const saleType=document.getElementById('s_sale_type')?.value==='credit'?'credit':'cash';
            values={...values,
              sale_type:saleType,
              subtotal_amount:subtotal,
              discount_type:discountType,
              discount_value:discountValue,
              discount_amount:discount,
              total_amount:finalTotal,
              paid_amount:saleType==='cash'?finalTotal:0
            };
          }
        }catch(e){console.warn('Farma billing metadata patch failed:',e);}
        return originalInsert(values,options);
      };
    };
  }

  function money(n){return Number(n||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2})+' ج.م';}
  function esc(s){const d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}

  async function installInvoicesEnhancement(){
    if(window.__farmaBillingInvoiceEnhancementInstalled)return;
    if(typeof window.renderInvoices!=='function')return;
    window.__farmaBillingInvoiceEnhancementInstalled=true;

    const [{data:metaRows},{data:customers}]=await Promise.all([
      sb.from('invoices').select('sale_group_id,customer_id,notes,sale_type,subtotal_amount,discount_type,discount_value,discount_amount,total_amount,paid_amount'),
      sb.from('customers').select('id,name').order('name')
    ]);
    const metaByGroup={};
    (metaRows||[]).forEach(r=>{metaByGroup[r.sale_group_id]=r;});
    const customerById={};
    (customers||[]).forEach(c=>{customerById[c.id]=c.name;});

    function metaFor(inv){
      const m=metaByGroup[inv.sale_group_id];
      if(m)return m;
      return {sale_type:'cash',subtotal_amount:inv.total,discount_type:'none',discount_value:0,discount_amount:0,total_amount:inv.total,paid_amount:inv.total,customer_id:inv.customer_id||null};
    }
    function statusFor(inv){
      const m=metaFor(inv);
      const total=Number(m.total_amount||inv.total||0);
      const paid=Math.max(0,Math.min(Number(m.paid_amount||0),total));
      if(m.sale_type!=='credit')return 'cash';
      if(paid<=0)return 'unpaid';
      if(paid+0.005<total)return 'partial';
      return 'paid';
    }
    function statusLabel(s){return s==='unpaid'?'آجل — غير مسدد':s==='partial'?'آجل — مسدد جزئيًا':s==='paid'?'آجل — مسدد':'كاش';}
    function statusClass(s){return s==='unpaid'?'danger':s==='partial'?'warn':s==='paid'?'ok':'cash';}

    const toolbar=document.querySelector('.invoice-toolbar');
    if(toolbar&&!document.getElementById('billingFilter')){
      const wrap=document.createElement('div');
      wrap.className='filter-anchor';
      wrap.innerHTML='<select id="billingFilter" class="filter-btn" style="height:40px;min-width:155px;padding:0 10px"><option value="all">كل الفواتير</option><option value="unpaid">آجل — غير مسدد</option><option value="partial">آجل — مسدد جزئيًا</option><option value="paid">آجل — مسدد</option><option value="cash">كاش</option><option value="discounted">عليها خصم</option></select>';
      toolbar.querySelector('.filter-tools')?.appendChild(wrap) || toolbar.appendChild(wrap);
    }

    const card=document.querySelector('.card');
    if(card&&!document.getElementById('billingSummaryGrid')){
      const old=document.querySelector('.summary-grid');
      if(old){old.id='billingSummaryGrid';old.innerHTML='';}
      else{return;}
      for(const [id,label] of [['billingCount','عدد الفواتير'],['billingSubtotal','قبل الخصم'],['billingDiscount','إجمالي الخصومات'],['billingTotal','بعد الخصم'],['billingOutstanding','المتبقي آجل']]){
        old.insertAdjacentHTML('beforeend','<div class="summary-card"><div class="summary-label">'+label+'</div><div class="summary-value money" id="'+id+'">0.00 ج.م</div></div>');
      }
      old.insertAdjacentHTML('afterend','<div id="debtorsPanel" class="debtors-panel hidden"><div class="debtors-head"><strong>👥 العملاء عليهم آجل</strong><span id="debtorsCount">0</span></div><div id="debtorsList"></div></div>');
    }

    if(!document.getElementById('farmaBillingEnhancementStyle')){
      const style=document.createElement('style');style.id='farmaBillingEnhancementStyle';style.textContent=`
        #billingSummaryGrid{grid-template-columns:repeat(5,minmax(0,1fr))}
        #billingSummaryGrid .summary-card{min-width:0}
        .billing-status{display:inline-flex;align-items:center;justify-content:center;padding:4px 7px;border-radius:8px;font-size:10px;font-weight:700;white-space:nowrap}
        .billing-status.danger{background:#fee2e2;color:#b91c1c}.billing-status.warn{background:#fef3c7;color:#92400e}.billing-status.ok{background:#dcfce7;color:#166534}.billing-status.cash{background:#e2e8f0;color:#334155}
        .debtors-panel{margin:0 0 14px;border:1px solid var(--border);border-radius:11px;background:var(--surface);padding:12px 15px}.debtors-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:13px}.debtors-head span{font-size:11px;color:var(--text-muted)}.debtor-row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px}.debtor-row:last-child{border-bottom:0}.debtor-amount{color:var(--danger);font-weight:800}
        .invoice-financial-box{margin:0 0 14px;background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:11px 12px;font-size:12px}.invoice-financial-row{display:flex;justify-content:space-between;padding:4px 0}.invoice-financial-row.total{font-weight:800;color:var(--primary-dark);border-top:1px solid var(--border);margin-top:4px;padding-top:8px}.invoice-financial-row.outstanding{font-weight:800;color:var(--danger)}
        @media(max-width:900px){#billingSummaryGrid{grid-template-columns:repeat(3,1fr)}}
        @media(max-width:600px){#billingSummaryGrid{grid-template-columns:1fr 1fr}.invoice-toolbar .filter-tools{flex-wrap:wrap}.invoice-toolbar #billingFilter{max-width:100%;width:auto}}
      `;document.head.appendChild(style);
    }

    const originalRender=window.renderInvoices;
    window.renderInvoices=function(){
      originalRender();
      setTimeout(applyBillingFilter,0);
    };

    const originalShow=window.showInvoice;
    window.showInvoice=function(key){
      originalShow(key);
      setTimeout(()=>{
        const inv=(typeof allInvoices!=='undefined'?allInvoices:[]).find(x=>x.key===key);
        if(inv)renderInvoiceFinancial(inv);
      },0);
    };

    function getVisibleInvoices(){
      const keys=Array.from(document.querySelectorAll('#invoicesWrap .invoice-row')).map(r=>r.dataset.key);
      return (typeof allInvoices!=='undefined'?allInvoices:[]).filter(i=>keys.includes(i.key));
    }

    function applyBillingFilter(){
      const select=document.getElementById('billingFilter');
      const mode=select?.value||'all';
      const base=getVisibleInvoices();
      const filtered=base.filter(inv=>{
        const m=metaFor(inv);const s=statusFor(inv);const discount=Number(m.discount_amount||0);
        if(mode==='all')return true;
        if(mode==='discounted')return discount>0.005;
        return s===mode;
      });
      const allowed=new Set(filtered.map(i=>i.key));
      document.querySelectorAll('#invoicesWrap .invoice-row').forEach(r=>{r.style.display=allowed.has(r.dataset.key)?'':'none';});
      const wrap=document.getElementById('invoicesWrap');
      const existingEmpty=wrap.querySelector('.billing-empty');
      if(!filtered.length && base.length){if(!existingEmpty)wrap.insertAdjacentHTML('beforeend','<p class="loading billing-empty">مفيش فواتير مطابقة لفلتر الدفع الحالي</p>');}
      else if(existingEmpty)existingEmpty.remove();
      updateBillingSummary(filtered);
      renderDebtors();
      decorateInvoiceTable(filtered);
    }

    function updateBillingSummary(list){
      let subtotal=0,discount=0,total=0,outstanding=0;
      list.forEach(inv=>{const m=metaFor(inv);const t=Number(m.total_amount||inv.total||0);subtotal+=Number(m.subtotal_amount||t);discount+=Number(m.discount_amount||0);total+=t;if(m.sale_type==='credit')outstanding+=Math.max(0,t-Number(m.paid_amount||0));});
      document.getElementById('billingCount').textContent=Number(list.length).toLocaleString('ar-EG');
      document.getElementById('billingSubtotal').textContent=money(subtotal);
      document.getElementById('billingDiscount').textContent=money(discount);
      document.getElementById('billingTotal').textContent=money(total);
      document.getElementById('billingOutstanding').textContent=money(outstanding);
    }

    function decorateInvoiceTable(list){
      const table=document.querySelector('#invoicesWrap table');if(!table)return;
      const head=table.querySelector('thead tr');
      if(head&&!head.querySelector('.billing-status-head')){const th=document.createElement('th');th.className='billing-status-head';th.textContent='الحالة';const seller=head.lastElementChild;if(seller&&seller.textContent.trim()==='البائع')head.insertBefore(th,seller);else head.appendChild(th);}
      const byKey={};list.forEach(i=>byKey[i.key]=i);
      table.querySelectorAll('tbody tr.invoice-row').forEach(row=>{if(row.querySelector('.billing-status-cell'))return;const inv=byKey[row.dataset.key]||(typeof allInvoices!=='undefined'?allInvoices:[]).find(i=>i.key===row.dataset.key);if(!inv)return;const td=document.createElement('td');td.className='billing-status-cell';const s=statusFor(inv);td.innerHTML='<span class="billing-status '+statusClass(s)+'">'+statusLabel(s)+'</span>';const sellerCell=row.lastElementChild;if(sellerCell&&head.lastElementChild?.textContent.trim()==='البائع')row.insertBefore(td,sellerCell);else row.appendChild(td);});
    }

    function renderDebtors(){
      const panel=document.getElementById('debtorsPanel');if(!panel)return;
      const map={};
      (typeof allInvoices!=='undefined'?allInvoices:[]).forEach(inv=>{const m=metaFor(inv);if(m.sale_type!=='credit')return;const remaining=Math.max(0,Number(m.total_amount||inv.total||0)-Number(m.paid_amount||0));if(remaining<=0.005)return;const id=m.customer_id||inv.customer_id;if(!id)return;if(!map[id])map[id]={name:customerById[id]||inv.customer||'—',amount:0};map[id].amount+=remaining;});
      const rows=Object.values(map).sort((a,b)=>b.amount-a.amount);
      panel.classList.toggle('hidden',rows.length===0);
      document.getElementById('debtorsCount').textContent=rows.length.toLocaleString('ar-EG');
      document.getElementById('debtorsList').innerHTML=rows.map(r=>'<div class="debtor-row"><span>'+esc(r.name)+'</span><span class="debtor-amount">'+money(r.amount)+'</span></div>').join('');
    }

    function renderInvoiceFinancial(inv){
      const p=document.getElementById('invoicePaperContent');if(!p||p.querySelector('.invoice-financial-box'))return;
      const m=metaFor(inv);const subtotal=Number(m.subtotal_amount||inv.total||0);const discount=Number(m.discount_amount||0);const total=Number(m.total_amount||inv.total||0);const paid=Number(m.paid_amount||0);const remaining=Math.max(0,total-paid);
      const discountText=discount>0.005?(m.discount_type==='percent'?Number(m.discount_value||0).toFixed(2)+'%':money(discount)):'بدون خصم';
      p.querySelector('.invoice-meta')?.insertAdjacentHTML('afterend','<div class="invoice-financial-box"><div class="invoice-financial-row"><span>قبل الخصم</span><span>'+money(subtotal)+'</span></div><div class="invoice-financial-row"><span>الخصم</span><span>'+discountText+'</span></div><div class="invoice-financial-row total"><span>بعد الخصم</span><span>'+money(total)+'</span></div>'+(m.sale_type==='credit'?'<div class="invoice-financial-row"><span>المدفوع</span><span>'+money(paid)+'</span></div><div class="invoice-financial-row outstanding"><span>المتبقي</span><span>'+money(remaining)+'</span></div>':'')+'</div>');
    }

    document.getElementById('billingFilter')?.addEventListener('change',applyBillingFilter);
    await new Promise(resolve=>{let n=0;const timer=setInterval(()=>{if((typeof allInvoices!=='undefined'?allInvoices:[]).length||n++>100){clearInterval(timer);resolve();}},50);});
    window.renderInvoices();
  }

  if(isSales){
    installSalesPatch();
    document.addEventListener('DOMContentLoaded',installSalesPatch);
    setTimeout(installSalesPatch,500);
  }
  if(isInvoices){
    document.addEventListener('DOMContentLoaded',()=>{installInvoicesEnhancement().catch(e=>console.error('Farma billing enhancement:',e));});
    setTimeout(()=>installInvoicesEnhancement().catch(e=>console.error('Farma billing enhancement:',e)),800);
  }
})();
