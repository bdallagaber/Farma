// إصلاح قسم الحضور: الأدمن يمكن أن يكون ضمن الموظفين القابلين لتعيين الشيفت.
(function(){
  if(!/attendance\.html$/i.test(location.pathname)) return;
  const originalFrom=sb.from.bind(sb);
  sb.from=function(table){
    const query=originalFrom(table);
    if(table!=='profiles') return query;
    const originalEq=query.eq.bind(query);
    query.eq=function(column,value){
      if(column==='role' && value==='employee') return query.in('role',['employee','admin']);
      return originalEq(column,value);
    };
    return query;
  };
})();
