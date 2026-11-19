// 레벨테스트 듣기 음성 작업 목록 만들기
// 사용: node tools/export_lt_jobs.js > lt_jobs.json   (그다음 python3 tools/make_audio.py lt_jobs.json audio)
// 이전 lt_jobs.json 과 비교해 내용이 바뀐 문항의 mp3는 지워서 다시 만들게 합니다.
const fs=require('fs'), vm=require('vm'), path=require('path');
const ctx={window:{}}; ctx.window=ctx; vm.createContext(ctx);
for(let i=1;i<=8;i++) vm.runInContext(fs.readFileSync(`data/lt${i}.js`,'utf8'),ctx);
const SPEED={basic:0.82, elem:0.88, mid:0.95, adv:1.0};
function lines(script, narrator){
  return script.split('\n').filter(Boolean).map(l=>{
    const m=l.match(/^(男|女|问)：(.*)$/);
    if(!m) return {v:narrator,t:l,pause:0.5};
    return {v:m[1]==='男'?'M':m[1]==='女'?'F':'N', t:m[2], pause:m[1]==='问'?0.8:0.45};
  });
}
const jobs=[];
for(const s of ctx.HSK_SETS) for(const sec of s.sections) for(const p of sec.parts){
  if(sec.key!=='L') continue;
  if(p.type==='lmc'||p.type==='tf') for(const it of p.items){
    let segs;
    const m=it.script.match(/^问：(.+)，\1$/);           // 발음 문항: 같은 단어를 두 번, 천천히
    if(m) segs=[{v:'N',t:m[1]+'。',pause:1.2},{v:'N',t:m[1]+'。',pause:0.6}];
    else segs=lines(it.script,'P');
    jobs.push({out:`${s.id}/${it.id}.mp3`, speed:SPEED[it.tier], segs});
  }
  if(p.type==='lgroup') p.groups.forEach((g,gi)=>{
    const segs=lines(g.script, gi%2?'Q':'P');
    for(const it of g.items) segs.push({v:'N',t:`第${it.id.replace(/\D/g,'')}题：${it.q}`,pause:1.4});
    jobs.push({out:`${s.id}/${g.id}.mp3`, speed:SPEED[g.items[0].tier], segs});
  });
}
let old={}; try{ for(const j of JSON.parse(fs.readFileSync('lt_jobs.json','utf8'))) old[j.out]=JSON.stringify(j); }catch(e){}
for(const j of jobs){ const f=path.join('audio',j.out); if(old[j.out] && old[j.out]!==JSON.stringify(j) && fs.existsSync(f)) fs.unlinkSync(f); }
process.stdout.write(JSON.stringify(jobs,null,1));
