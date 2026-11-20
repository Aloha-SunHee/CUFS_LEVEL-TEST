/**
 * CUFS 중국어학부 레벨테스트 — 구글시트 기록 + AI 피드백 백엔드
 *
 * 설치 순서
 *  1. 새 구글시트 → 확장 프로그램 → Apps Script → 이 파일 내용을 붙여 넣고 저장
 *  2. 함수 목록에서 setup 을 한 번 실행 (권한 허용) → 시트 5개가 생성됩니다
 *  3. 프로젝트 설정(톱니바퀴) → 스크립트 속성 추가
 *       TEACHER_PIN    : 교수자 화면 비밀번호 (예: 2580)
 *       GEMINI_API_KEY : (선택) Google AI Studio API 키 → 문항별 AI 심층 해설
 *       GEMINI_MODEL   : (선택) 먼저 쓸 모델. 비우면 gemini-3.5-flash-lite → 3.6-flash → flash-latest 순서로 자동 시도
 *  4. 배포 → 새 배포 → 유형: 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → 배포
 *  5. 웹 앱 URL 을 config.js 의 SCRIPT_URL 에 붙여 넣기
 */
const SCOPE_KO = { exam: '전체 진단', all: '전체', L: '듣기', R: '독해', retry: '오답 복습', recheck: '재확인' };
const TIERS = ['basic', 'elem', 'mid', 'adv'];
function ct_(s) { const m = String(s || '').replace(/^'/, '').match(/^(\d+)\/(\d+)$/); return m ? { c: +m[1], t: +m[2] } : null; }
function pct_(v) { return v && v.t ? Math.round(v.c / v.t * 100) : null; }
function tierAvg_(tiers) { const v = TIERS.map(k => pct_(tiers[k])).filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; }
const SH = { sub: '제출기록', ans: '문항기록', fb: 'AI해설기록', stu: '학생', prog: '진행상황' };
const HEAD = {
  stu: ['학번', '이름', '가입일', '최근접속'],
  prog: ['학번', '세트', '진행률', '저장시간', '데이터(JSON)'],
  sub: ['시간', '학번', '이름', '세트', '응시구분', '모드', '점수', '만점', '정답률', '듣기', '독해', '진단등급', '소요(분)', '오답문항',
        '입문', '초급', '중급', '고급', '공통문항', '재확인(또틀림/문항)'],
  ans: ['시간', '학번', '이름', '세트', '응시구분', '모드', '문항', '영역', '유형', '학생답', '정답', '정오'],  // 모드: exam / retry / recheck(학기말 재확인 문항, 세트·문항은 원래 것)
  fb:  ['시간', '학번', '이름', '세트', '문항', '질문', 'AI해설']
};

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(SH).forEach(k => {
    let sh = ss.getSheetByName(SH[k]);
    if (!sh) sh = ss.insertSheet(SH[k]);
    sh.getRange(1, 1, 1, HEAD[k].length).setValues([HEAD[k]]).setFontWeight('bold').setBackground('#E1EFEA');
    sh.setFrozenRows(1);
  });
  const def = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 5) ss.deleteSheet(def);
}

function sheet_(k) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SH[k]);
  if (!sh) { setup(); sh = ss.getSheetByName(SH[k]); }
  return sh;
}
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function now_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'); }
function prop_(k, d) { return PropertiesService.getScriptProperties().getProperty(k) || d; }

// ───────── GET: 오답 목록 / 교수자 현황 / 학기별 성취도 ─────────
function doGet(e) {
  const p = e.parameter || {};
  try {
    if (p.action === 'wrong') return out_({ ok: true, wrong: wrongList_(String(p.sid || '')) });
    if (p.action === 'config') return out_({ ok: true, config: getConfig_() });
    if (p.action === 'summary') {
      if (!p.pin || p.pin !== prop_('TEACHER_PIN', '')) return out_({ ok: false, error: '교수자 PIN이 맞지 않습니다.' });
      return out_(summary_(String(p.set || '')));
    }
    if (p.action === 'growth') {
      if (!p.pin || p.pin !== prop_('TEACHER_PIN', '')) return out_({ ok: false, error: '교수자 PIN이 맞지 않습니다.' });
      return out_(growthReport_());
    }
    if (p.action === 'review') {
      if (!p.pin || p.pin !== prop_('TEACHER_PIN', '')) return out_({ ok: false, error: '교수자 PIN이 맞지 않습니다.' });
      return out_(review_(String(p.sets || '').split(',').filter(Boolean)));
    }
    return out_({ ok: true, msg: 'CUFS LevelTest backend running', ai: !!prop_('GEMINI_API_KEY', '') });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}

function wrongList_(sid) {
  const v = sheet_('ans').getDataRange().getValues();
  const last = {};
  for (let i = 1; i < v.length; i++) {
    const r = v[i];
    if (String(r[1]) !== sid || (r[11] !== 'O' && r[11] !== 'X')) continue;
    (last[r[3]] = last[r[3]] || {})[r[6]] = r[11];
  }
  const res = {};
  Object.keys(last).forEach(set => { res[set] = Object.keys(last[set]).filter(id => last[set][id] === 'X'); });
  return res;
}

function summary_(set) {
  const sv = sheet_('sub').getDataRange().getValues();
  const latest = {};
  for (let i = 1; i < sv.length; i++) {
    const r = sv[i]; if (r[3] !== set) continue;
    const sid = String(r[1]), prev = latest[sid];
    if (r[5] === 'retry') {
      if (prev) prev.retry = (prev.retry || 0) + 1;
      else latest[sid] = { sid: sid, name: r[2], term: r[4], mode: '오답복습', score: r[6], total: r[7], L: '', R: '', grade: '', time: String(r[0]).slice(5, 16), retry: 1 };
      continue;
    }
    latest[sid] = {
      sid: sid, name: r[2], term: r[4], mode: SCOPE_KO[r[5]] || r[5],
      score: r[6], total: r[7], L: r[9], R: r[10], grade: r[11],
      time: String(r[0]).slice(5, 16), retry: prev ? prev.retry || 0 : 0
    };
  }
  const av = sheet_('ans').getDataRange().getValues();
  const seen = {};
  for (let i = 1; i < av.length; i++) {
    const r = av[i];
    if (r[3] !== set || r[5] === 'retry' || r[5] === 'recheck' || (r[11] !== 'O' && r[11] !== 'X')) continue;
    seen[r[1] + '|' + r[6]] = { id: r[6], ok: r[11] === 'O' };
  }
  const items = {};
  Object.keys(seen).forEach(k => { const s = seen[k]; const it = items[s.id] = items[s.id] || { n: 0, wrong: 0 }; it.n++; if (!s.ok) it.wrong++; });
  const students = Object.keys(latest).map(k => latest[k]).sort((a, b) => a.sid < b.sid ? -1 : 1);
  const pv = sheet_('prog').getDataRange().getValues(), inprog = [];
  for (let i = 1; i < pv.length; i++) if (pv[i][1] === set) inprog.push({ sid: String(pv[i][0]), pct: pv[i][2], time: String(pv[i][3]).slice(5, 16) });
  return { ok: true, students: students, items: items, inprog: inprog };
}

// ───────── 학기별 성취도 비교 리포트 (교수자용) ─────────
function growthReport_() {
  const sv = sheet_('sub').getDataRange().getValues();
  const byStu = {};
  for (let i = 1; i < sv.length; i++) {
    const r = sv[i];
    if (r[5] === 'retry') continue; // 정규/진단 응시만 성취도 추적
    const sid = String(r[1]);
    const st = byStu[sid] = byStu[sid] || { sid: sid, name: r[2], records: [] };
    st.name = r[2];
    const tiers = {}; TIERS.forEach((k, j) => { const v = ct_(r[14 + j]); if (v) tiers[k] = v; });
    const rc = ct_(r[19]);
    st.records.push({
      time: String(r[0]).slice(0, 16), set: r[3], term: r[4],
      score: Number(r[6]) || 0, total: Number(r[7]) || 100,
      pct: Math.round((Number(r[6]) || 0) / Math.max(1, Number(r[7]) || 100) * 100),
      L: r[9], R: r[10], grade: r[11], wrongList: String(r[13] || '').split(' ').filter(Boolean),
      tiers: tiers, avg: tierAvg_(tiers), anchor: ct_(r[18]), recheck: rc ? { repeat: rc.c, t: rc.t } : null
    });
  }
  const list = Object.keys(byStu).map(sid => {
    const st = byStu[sid], recs = st.records;
    const first = recs[0], last = recs[recs.length - 1];
    let repeatWrong = 0;
    if (recs.length >= 2 && last.recheck) repeatWrong = last.recheck.repeat;   // 학기말 재확인 문항 중 또 틀린 수
    else if (recs.length >= 2 && first.set === last.set) {
      const prevSet = {}; first.wrongList.forEach(id => prevSet[id] = true);
      repeatWrong = last.wrongList.filter(id => prevSet[id]).length;
    }
    return {
      sid: st.sid, name: st.name, count: recs.length,
      first: first, last: last,
      diff: recs.length >= 2 ? (last.pct - first.pct) : null,
      // 총점 대신 난이도별 정답률로 비교 (회차마다 문항이 다르므로)
      avgDiff: recs.length >= 2 && first.avg != null && last.avg != null ? last.avg - first.avg : null,
      tierDiff: recs.length >= 2 ? TIERS.reduce((o, k) => { const a = pct_(first.tiers[k]), b = pct_(last.tiers[k]); if (a != null && b != null) o[k] = b - a; return o; }, {}) : null,
      anchorDiff: recs.length >= 2 && first.anchor && last.anchor ? last.anchor.c - first.anchor.c : null,
      repeatWrong: repeatWrong, records: recs
    };
  }).sort((a, b) => a.sid < b.sid ? -1 : 1);
  return { ok: true, students: list };
}

function review_(sets) {
  const want = {}; sets.forEach(s => want[s] = true);
  const av = sheet_('ans').getDataRange().getValues();
  const seen = {};
  for (let i = 1; i < av.length; i++) {
    const r = av[i];
    if (!want[r[3]] || r[5] === 'retry' || r[5] === 'recheck' || (r[11] !== 'O' && r[11] !== 'X')) continue;
    seen[r[3] + '|' + r[6] + '|' + r[1]] = { set: r[3], id: r[6], name: String(r[2] || r[1]), resp: String(r[9]), ok: r[11] === 'O' };
  }
  const items = {}, students = {};
  Object.keys(seen).forEach(k => {
    const s = seen[k], key = s.set + '|' + s.id;
    const it = items[key] = items[key] || { set: s.set, id: s.id, n: 0, wrong: 0, dist: {}, missed: [] };
    it.n++; students[s.name] = true;
    it.dist[s.resp || '(무응답)'] = (it.dist[s.resp || '(무응답)'] || 0) + 1;
    if (!s.ok) { it.wrong++; it.missed.push(s.name); }
  });
  const fixed = {};
  for (let i = 1; i < av.length; i++) {
    const r = av[i]; if (!want[r[3]] || r[5] !== 'retry') continue;
    const key = r[3] + '|' + r[6]; (fixed[key] = fixed[key] || {})[r[1]] = r[11] === 'O';
  }
  Object.keys(items).forEach(k => { const f = fixed[k] || {}; items[k].fixed = Object.keys(f).filter(x => f[x]).length; });
  return { ok: true, items: Object.keys(items).map(k => items[k]), students: Object.keys(students).length };
}

// ───────── 학생 오답노트 & 응시 이력 동기화 ─────────
function notebook_(p) {
  const sid = String(p.sid || '').trim();
  if (!sid) return { ok: false, error: 'sid required' };
  const av = sheet_('ans').getDataRange().getValues(), map = {};
  for (let i = 1; i < av.length; i++) {
    const r = av[i]; if (String(r[1]) !== sid || (r[11] !== 'O' && r[11] !== 'X')) continue;
    const key = r[3] + '|' + r[6];
    const it = map[key] = map[key] || { set: r[3], id: r[6], tries: 0, misses: 0, firstResp: '', lastResp: '', lastOk: false, lastAt: '', history: [] };
    it.tries++;
    if (r[11] === 'X') { it.misses++; if (!it.firstResp) it.firstResp = String(r[9]); }
    it.lastResp = String(r[9]); it.lastOk = r[11] === 'O'; it.lastAt = String(r[0]);
    it.history.push({ term: String(r[4]), mode: String(r[5]), resp: String(r[9]), ok: r[11] === 'O', at: String(r[0]).slice(0, 10) });
  }
  return { ok: true, items: Object.keys(map).map(k => map[k]).filter(x => x.misses > 0) };
}

function getConfig_() {
  try { return JSON.parse(prop_('CLASS_CONFIG', '{}')); } catch (e) { return {}; }
}

// ───────── POST: 로그인 / 제출 / 진행저장 / AI 해설 ─────────
function doPost(e) {
  let p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad json' }); }
  try {
    if (p.action === 'login') return out_(login_(p));
    if (p.action === 'submit') return out_(submit_(p));
    if (p.action === 'saveProgress') return out_(saveProgress_(p));
    if (p.action === 'loadProgress') return out_(loadProgress_(p));
    if (p.action === 'clearProgress') return out_(clearProgress_(p));
    if (p.action === 'explain') return out_(explain_(p));
    if (p.action === 'notebook') return out_(notebook_(p));
    if (p.action === 'setConfig') {
      if (!p.pin || p.pin !== prop_('TEACHER_PIN', '')) return out_({ ok: false, error: 'PIN이 맞지 않습니다.' });
      PropertiesService.getScriptProperties().setProperty('CLASS_CONFIG', JSON.stringify(p.config || {}));
      return out_({ ok: true, config: getConfig_() });
    }
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}

function findRow_(sh, pred) {
  const v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (pred(v[i])) return { row: i + 1, val: v[i] };
  return null;
}

function login_(p) {
  const sid = String(p.sid || '').trim(), name = String(p.name || '').trim();
  if (!sid || !name) return { ok: false, error: '학번과 이름을 모두 입력하세요.' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = sheet_('stu'), f = findRow_(sh, r => String(r[0]) === sid);
    if (!f) { sh.appendRow([sid, name, now_(), now_()]); return { ok: true, created: true }; }
    if (String(f.val[1]) !== name) {
      return { ok: false, error: '학번과 이름이 등록된 정보와 다릅니다. 다시 확인하세요.' };  // 다른 사람의 이름이 노출되지 않도록 이름을 보여 주지 않음
    }
    sh.getRange(f.row, 4).setValue(now_());
    return { ok: true, created: false };
  } finally { lock.releaseLock(); }
}

function submit_(p) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const t = now_(), per = p.per || {};
    const f = k => per[k] ? per[k].c + '/' + per[k].t : '';
    // 오답문항 열에는 본 문항(이번 세트)의 오답만. 재확인·공통 문항은 문항기록 시트에 원래 세트로 남습니다.
    const wrong = (p.answers || []).filter(a => a.ok === false && (a.set || p.setId) === p.setId && (a.mode || p.mode) === p.mode).map(a => a.id).join(' ');
    // '5/22' 같은 값이 날짜로 바뀌지 않도록 앞에 ' 를 붙여 글자로 저장합니다.
    const txt = (c, t) => "'" + c + '/' + t;
    const tiers = p.tiers || {}, tf = k => tiers[k] ? txt(tiers[k].c, tiers[k].t) : '';
    sheet_('sub').appendRow([
      t, p.sid, p.name, p.setId, p.term || '입학 진단', p.mode,
      p.score, p.total, p.total ? Math.round(p.score / p.total * 100) / 100 : 0,
      f('L'), f('R'), p.grade || '', Math.round((p.durationSec || 0) / 6) / 10, wrong,
      tf('basic'), tf('elem'), tf('mid'), tf('adv'),
      p.anchor ? txt(p.anchor.c, p.anchor.t) : '', p.recheck ? txt(p.recheck.repeat, p.recheck.t) : ''
    ]);
    const rows = (p.answers || []).map(a => [
      t, p.sid, p.name, a.set || p.setId, p.term || '입학 진단', a.mode || p.mode,
      a.id, a.sec, a.part, String(a.resp).slice(0, 500), a.key, a.ok === true ? 'O' : a.ok === false ? 'X' : ''
    ]);
    if (rows.length) {
      const sh = sheet_('ans');
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    sheet_('sub').getRange(sheet_('sub').getLastRow(), 9).setNumberFormat('0%');
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function saveProgress_(p) {
  const sid = String(p.sid || '').trim();
  if (!sid) return { ok: false, error: 'sid required' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = sheet_('prog');
    const f = findRow_(sh, r => String(r[0]) === sid && r[1] === p.setId);
    const row = [sid, p.setId, p.pct || 0, now_(), JSON.stringify(p.data || {}).slice(0, 49000)];
    if (f) sh.getRange(f.row, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function loadProgress_(p) {
  const sid = String(p.sid || '').trim();
  if (!sid) return { ok: false, error: 'sid required' };
  const v = sheet_('prog').getDataRange().getValues(), res = {};
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === sid) { try { res[v[i][1]] = JSON.parse(v[i][4]); } catch (e) {} }
  const sv = sheet_('sub').getDataRange().getValues(), history = [];
  for (let i = 1; i < sv.length; i++) {
    if (String(sv[i][1]) === sid) {
      history.push({
        set: sv[i][3], term: sv[i][4], mode: sv[i][5],
        c: sv[i][6], t: sv[i][7], L: sv[i][9], R: sv[i][10], grade: sv[i][11],
        wrong: String(sv[i][13] || '').split(' ').filter(Boolean), at: String(sv[i][0]),
        tiers: { basic: String(sv[i][14] || ''), elem: String(sv[i][15] || ''), mid: String(sv[i][16] || ''), adv: String(sv[i][17] || '') },
        anchor: String(sv[i][18] || ''), recheck: String(sv[i][19] || '')
      });
    }
  }
  return { ok: true, progress: res, history: history };
}

function clearProgress_(p) {
  const sid = String(p.sid || '').trim();
  if (!sid) return { ok: false, error: 'sid required' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = sheet_('prog');
    const f = findRow_(sh, r => String(r[0]) === sid && r[1] === p.setId);
    if (f) sh.deleteRow(f.row);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function explain_(p) {
  const key = prop_('GEMINI_API_KEY', '');
  if (!key) return { ok: true, explanation: null };
  const prompt = [
    '너는 사이버한국외대 중국어학부 학생들에게 중국어를 가르치는 친절한 교수자다. 아래 레벨테스트 문항의 정답 이유를 한국어로 짧고 정확하게 설명하라.',
    p.context ? '지문/녹음 원문:\n"""' + String(p.context).slice(0, 2500) + '"""' : '',
    p.question ? '문제: ' + p.question : '',
    (p.opts && p.opts.length) ? '선택지: ' + p.opts.map((o, i) => 'ABCDEF'[i] + ' ' + o).join(' / ') : '',
    '정답: ' + p.answer,
    p.mine ? '학생이 고른 답: ' + p.mine : '',
    '형식: ① 정답 근거(원문 또는 발음·한자 포인트) ② 왜 정답인지 1~2문장 ③ 학생 답이 틀렸다면 왜 틀렸는지 1문장 ④ 핵심 어휘·문법 2~3개(중국어-병음-뜻). 전체 6줄 이내, 마크다운 기호 없이 일반 텍스트.'
  ].filter(Boolean).join('\n\n');
  try {
    const j = callGemini_({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } });
    return { ok: true, explanation: j.candidates[0].content.parts.map(x => x.text || '').join('').trim() };
  } catch (e) { return { ok: false, error: String(e.message || e).slice(0, 200) }; }
}

// gemini-2.5-flash는 더 이상 제공되지 않습니다(404). 2026-11 기준 무료 키로 작동 확인된 모델 순서입니다.
const GEMINI_FALLBACKS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-flash-latest'];
function callGemini_(body) {
  const key = prop_('GEMINI_API_KEY', '');
  if (!key) throw new Error('GEMINI_API_KEY 없음');
  const models = [prop_('GEMINI_MODEL', '')].concat(GEMINI_FALLBACKS).filter((m, i, a) => m && a.indexOf(m) === i);
  let last = '';
  for (const m of models) {
    for (let t = 0; t < 2; t++) {
      const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'x-goog-api-key': key }, payload: JSON.stringify(body)
      });
      const code = res.getResponseCode();
      if (code === 200) return JSON.parse(res.getContentText());
      last = 'Gemini ' + code + ' (' + m + '): ' + res.getContentText().slice(0, 200);
      if (code === 503 || code === 429 || code === 500) { Utilities.sleep(1200 * (t + 1)); continue; }
      if (code === 404) break;
      throw new Error(last);
    }
  }
  throw new Error(last);
}