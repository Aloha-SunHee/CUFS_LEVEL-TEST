// node tools/check_sets.js  — 8세트 형식·정답·겹침 검사
const vm=require('vm'),fs=require('fs');
const S=[];for(let i=1;i<=8;i++){const c={window:{}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(`data/lt${i}.js`,'utf8'),c);S.push(c.HSK_SETS[0]);}
let err=0; const E=(...a)=>{err++;console.log('ERR',...a)};
const flat=s=>s.sections.flatMap(sec=>sec.parts.flatMap(p=>(p.items||p.groups.flatMap(g=>g.items.map(it=>({...it,_g:g})))).map(it=>({...it,_p:p,_sec:sec.key}))));
const sig=it=>[it.script,it._g&&(it._g.script||it._g.passage),it.passage,it.q,it.stem,it.text].filter(Boolean).join('|');
const seen={};
for(const s of S){const F=flat(s),ids=new Set(),tiers={},dist={},tf={'√':0,'×':0};
 if(F.length!==100)E(s.id,'count',F.length);
 for(const it of F){ if(ids.has(it.id))E(s.id,'dup id',it.id);ids.add(it.id);
  if(!it.id.startsWith(it._sec))E(s.id,'prefix',it.id);
  if(!it.exp)E(s.id,'no exp',it.id);
  tiers[it.tier]=(tiers[it.tier]||0)+1;
  if(it.opts){ if(!'ABCDEF'.slice(0,it.opts.length).includes(it.ans))E(s.id,'range',it.id); if(new Set(it.opts).size!==it.opts.length)E(s.id,'dup opt',it.id); dist[it.ans]=(dist[it.ans]||0)+1;}
  if(it._p.type==='tf'){ if(!(it.ans in tf))E(s.id,'tf',it.id); else tf[it.ans]++; }
  if(it._p.type==='bank'&&!it._p.bank[it.ans])E(s.id,'bank',it.id);
  const k=sig(it); if(it._g? it._g.items[0].id===it.id||true:true){ (seen[k]=seen[k]||new Set()).add(s.id); }
 }
 const bankAns=s.sections.flatMap(x=>x.parts.filter(p=>p.type==='bank').map(p=>p.items.map(i=>i.ans)));
 bankAns.forEach(a=>{if(new Set(a).size!==a.length)E(s.id,'bank dup ans')});
 console.log(s.id,'tiers',JSON.stringify(tiers),'ans',JSON.stringify(dist),'tf',JSON.stringify(tf));
}
const dup=Object.entries(seen).filter(([k,v])=>v.size>1);
console.log('문항이 2개 이상 세트에 나오는 경우:',dup.length); dup.slice(0,5).forEach(d=>console.log('  ',[...d[1]].join(','),d[0].slice(0,60)));
console.log('오류',err); process.exit(err?1:0);
