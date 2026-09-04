// إصلاح آمن لقسم الحضور: إضافة حسابات الأدمن لقائمة تعيين الشيفت فقط.
(function(){
  if(!/attendance\.html$/i.test(location.pathname)) return;
  async function addAdmins(){
    const select=document.getElementById('scheduleEmployee');
    if(!select || !select.options.length) return false;
    const hasRealEmployeeOption=Array.from(select.options).some(o=>o.value);
    if(!hasRealEmployeeOption) return false;
    if(select.dataset.adminFixApplied==='1') return true;
    try{
      const {data,error}=await sb.from('profiles').select('id,full_name,role').eq('role','admin').order('full_name',{ascending:true});
      if(error) return true;
      const existing=new Set(Array.from(select.options).map(o=>o.value));
      (data||[]).forEach(a=>{
        if(existing.has(a.id)) return;
        const option=document.createElement('option');
        option.value=a.id;
        option.textContent=(a.full_name||'أدمن')+' (أدمن)';
        select.appendChild(option);
      });
      select.dataset.adminFixApplied='1';
      return true;
    }catch(e){
      console.warn('Attendance admin list fix failed:',e);
      return true;
    }
  }
  const timer=setInterval(async()=>{if(await addAdmins()) clearInterval(timer)},300);
  setTimeout(()=>clearInterval(timer),15000);
})();
