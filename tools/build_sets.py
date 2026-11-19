"""CUFS 중국어 레벨테스트 8세트 생성기 (2026-11 개편)

- 8세트(lt1~lt8)의 문항이 서로 하나도 겹치지 않게, 각 문항 풀을 세트 수만큼 나눠 배정합니다.
- 난이도 표시(tier): basic=입문(발음·한자), elem=초급(HSK1~2), mid=중급(HSK3~4), adv=고급(HSK5~6)
- 객관식 정답 위치는 세트마다 A~D(3지선다는 A~C)에 고르게 섞습니다.

실행 (레벨테스트 폴더에서):  python3 tools/build_sets.py
"""
import json, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pools_base as B
import pools_new_L as NL
import pools_new_R as NR

N_SETS = 8
L = 'ABCDEF'


def front(opts, ans):
    """기존 문항(정답 글자 지정)을 '정답이 첫 번째' 형태로 바꿈."""
    i = L.index(ans)
    return [opts[i]] + opts[:i] + opts[i + 1:]


def pool(name, items, per_set):
    rnd = random.Random('pool-' + name)
    items = list(items)
    rnd.shuffle(items)
    if items and isinstance(items[0], dict) and items[0].get('ans') in ('√', '×'):
        # O/X 문항은 세트마다 O와 X가 비슷한 수가 되도록 차례로 나눠 줌
        o = [x for x in items if x['ans'] == '√']; x_ = [x for x in items if x['ans'] == '×']
        need = per_set * N_SETS
        assert len(items) >= need, f'{name}: {len(items)}개 < 필요 {need}개'
        sets = [[] for _ in range(N_SETS)]
        for i, it in enumerate((o + x_)[:need] if len(items) == need else o + x_):
            if len(sets[i % N_SETS]) < per_set: sets[i % N_SETS].append(it)
        for x in sets: rnd.shuffle(x)
        return sets
    need = per_set * N_SETS
    assert len(items) >= need, f'{name}: {len(items)}개 < 필요 {need}개'
    return [items[s * per_set:(s + 1) * per_set] for s in range(N_SETS)]


# ── 문항 풀 정리: 모두 dict 로 통일 (opts는 정답이 첫 번째) ──
P = {}
P['pron'] = pool('pron', [dict(script=f'问：{w}，{w}', opts=front(o, a), exp=e) for w, o, a, e in B.L_KR_PRON], 6)
P['pydis'] = pool('pydis', [dict(script=f'问：{w}，{w}', q=q, opts=front(o, a), exp=e) for w, q, o, a, e in B.L_PY_DIS]
                  + [dict(script=f'问：{w}，{w}', q=q, opts=o, exp=e) for w, q, o, e in NL.PY_DIS_NEW], 6)
P['btf'] = pool('btf', [dict(script=s, stem=st, ans=a, exp=e) for s, st, a, e in B.L_BASIC_TF], 3)
P['qa'] = pool('qa', [dict(script='女：' + q, opts=front(o, a), exp=e) for q, o, a, e in B.L_QA_ELEM]
               + [dict(script='女：' + q, opts=o, exp=e) for q, o, e in NL.QA_ELEM_NEW], 5)
P['short'] = pool('short', [dict(script=s, opts=front(o, a), exp=e) for s, o, a, e in B.L_SHORT_DIALOG]
                  + [dict(script=s, opts=o, exp=e) for s, o, e in NL.SHORT_ELEM_NEW], 5)
_mtf = []
for ss, a, e in B.L_MID_TF:
    s, st = ss.split('\n★ ')
    _mtf.append(dict(script=s, stem='★ ' + st, ans=a, exp=e))
_mtf += [dict(script=s, stem='★ ' + st, ans=a, exp=e) for s, st, a, e in NL.MID_TF_NEW]
P['mtf'] = pool('mtf', _mtf, 8)
P['mc3'] = pool('mc3', [dict(script=s, opts=front(o, a), exp=e) for s, o, a, e in B.L_MID_MC3]
                + [dict(script=s, opts=o, exp=e) for s, o, e in NL.MID_MC3_NEW], 7)
P['ladv'] = pool('ladv', [dict(script=s, qs=[dict(q=q, opts=o, exp=e) for q, o, e in qs]) for s, qs in NL.ADV_L_GROUPS], 5)

P['hz'] = pool('hz', [dict(stem=s, ans=a, exp=e) for s, a, e in B.R_HANZI_TF]
               + [dict(stem=s, ans=a, exp=e) for s, a, e in NR.HANZI_NEW], 5)
P['voc'] = pool('voc', [dict(q=w, opts=front(o, a), exp=e) for w, o, a, e in B.R_VOCAB_KO]
                + [dict(q=w, opts=o, exp=e) for w, o, e in NR.VOCAB_NEW], 5)
P['rpy'] = pool('rpy', [dict(q=w, opts=front(o, a), exp=e) for w, o, a, e in B.R_PINYIN]
                + [dict(q=w, opts=o, exp=e) for w, o, e in NR.PINYIN_NEW], 5)
P['rqa'] = pool('rqa', [dict(q=q, opts=front(o, a), exp=e) for q, o, a, e in B.R_QA_MATCH]
                + [dict(q=q, opts=o, exp=e) for q, o, e in NR.QA_R_NEW], 5)
P['bs'] = pool('bs', B.R_BANK_SENT + NR.BANK_SENT_NEW, 1)
P['bv'] = pool('bv', B.R_BANK_VOCAB1 + B.R_BANK_VOCAB2, 1)
_rmc3 = []
for pq, o, a, e in B.R_SHORT_MC3:
    pas, q = pq.split('\n★ ')
    _rmc3.append(dict(passage=pas, q='★ ' + q, opts=front(o, a), exp=e))
_rmc3 += [dict(passage=p, q='★ ' + q, opts=o, exp=e) for p, q, o, e in NR.SHORT_MC3_NEW]
P['rmc3'] = pool('rmc3', _rmc3, 5)
P['advb'] = pool('advb', NR.ADV_BANKS, 1)
_pm = []
for pq, o, a, e in B.R_PASS_MID:
    pas, q = pq.split('\n★ ')
    _pm.append(dict(passage=pas, q='★ ' + q, opts=front(o, a), exp=e))
_pm += [dict(passage=p, q='★ ' + q, opts=o, exp=e) for p, q, o, e in NR.PASS_MID_NEW]
P['pm'] = pool('pm', _pm, 4)
P['radv'] = pool('radv', [dict(passage=p, qs=[dict(q='★ ' + q, opts=o, exp=e) for q, o, e in qs]) for p, qs in NR.ADV_R_GROUPS], 3)


def build(s):
    n = [0, 0]  # L, R 번호

    def nid(sec):
        k = 0 if sec == 'L' else 1
        n[k] += 1
        return f'{sec}{n[k]}'

    def items(sec, key, tier, fields):
        out = []
        for d in P[key][s]:
            it = {'id': nid(sec), 'tier': tier}
            for f in fields:
                if f in d:
                    it[f] = d[f]
            out.append(it)
        return out

    def groups(sec, key, tier, head):
        out = []
        for d in P[key][s]:
            g = {'id': None, head: d[head], 'items': []}
            for qd in d['qs']:
                it = {'id': nid(sec), 'tier': tier, 'q': qd['q'], 'opts': qd['opts'], 'exp': qd['exp']}
                g['items'].append(it)
            g['id'] = g['items'][0]['id']
            out.append(g)
        return out

    def bank(sec, key, tier):
        b = P[key][s][0]
        its = [{'id': nid(sec), 'tier': tier, 'text': t, 'ans': a, 'exp': e} for t, a, e in b['items']]
        return b['bank'], its

    F_LMC = ['script', 'q', 'opts', 'exp']
    F_TF = ['script', 'stem', 'ans', 'exp']
    Lp = []
    Lp.append(dict(type='lmc', title='제1부분 · 음절 발음 듣기 (1~6번)', ko='음성을 듣고 들리는 중국어 발음과 가장 가까운 한국어 표기를 고르세요.', items=items('L', 'pron', 'basic', F_LMC)))
    Lp.append(dict(type='lmc', title='제2부분 · 성모·운모 변별 (7~12번)', ko='음성을 듣고 질문에 맞는 성모(첫소리) 또는 운모(모음)를 고르세요.', items=items('L', 'pydis', 'basic', F_LMC)))
    Lp.append(dict(type='tf', title='제3부분 · 기초 문장 일치 판단 (13~15번)', ko='음성을 듣고 제시된 핵심 단어/내용과 일치하면 O, 다르면 X를 고르세요.', items=items('L', 'btf', 'elem', F_TF)))
    Lp.append(dict(type='lmc', title='제4부분 · 기초 회화 즉답 (16~20번)', ko='질문을 듣고 가장 자연스러운 대답을 고르세요.', items=items('L', 'qa', 'elem', F_LMC)))
    Lp.append(dict(type='lmc', title='제5부분 · 짧은 대화 이해 (21~25번)', ko='대화와 질문을 듣고 알맞은 답을 고르세요.', items=items('L', 'short', 'elem', F_LMC)))
    Lp.append(dict(type='tf', title='제6부분 · 단문 내용 일치 (26~33번)', ko='녹음을 듣고 ★ 문장의 내용과 일치하면 O, 다르면 X를 고르세요.', items=items('L', 'mtf', 'mid', F_TF)))
    Lp.append(dict(type='lmc', title='제7부분 · 중급 대화 이해 (34~40번)', ko='대화와 질문을 듣고 알맞은 답을 고르세요.', items=items('L', 'mc3', 'mid', F_LMC)))
    Lp.append(dict(type='lgroup', title='제8부분 · 고급 담화 이해 (41~50번)', ko='녹음을 듣고 이어지는 두 질문에 답하세요.', groups=groups('L', 'ladv', 'adv', 'script')))

    F_R = ['passage', 'q', 'opts', 'exp']
    Rp = []
    Rp.append(dict(type='tf', title='제1부분 · 한자 표기 정오 판단 (1~5번)', ko='제시된 한국어 뜻에 해당하는 간체자·번체자 표기가 맞으면 O, 틀리면 X를 고르세요.', items=items('R', 'hz', 'basic', ['stem', 'ans', 'exp'])))
    Rp.append(dict(type='rmc', title='제2부분 · 기초 어휘 뜻 고르기 (6~10번)', ko='제시된 중국어 단어의 알맞은 한국어 뜻을 고르세요.', items=items('R', 'voc', 'elem', F_R)))
    Rp.append(dict(type='rmc', title='제3부분 · 한어병음 및 성조 (11~15번)', ko='제시된 한자의 정확한 한어병음과 성조를 고르세요.', items=items('R', 'rpy', 'basic', F_R)))
    Rp.append(dict(type='rmc', title='제4부분 · 기초 회화 응답 (16~20번)', ko='앞사람의 말에 이어질 가장 자연스러운 대답을 고르세요.', items=items('R', 'rqa', 'elem', F_R)))
    bk, its = bank('R', 'bs', 'mid')
    Rp.append(dict(type='bank', title='제5부분 · 문장 연결하기 (21~25번)', ko='보기(A~F)에서 빈칸에 들어갈 가장 알맞은 문장을 고르세요.', bank=bk, items=its))
    bk, its = bank('R', 'bv', 'mid')
    Rp.append(dict(type='bank', title='제6부분 · 중급 어휘 채우기 (26~30번)', ko='보기(A~F)에서 빈칸에 들어갈 가장 알맞은 단어를 고르세요.', bank=bk, items=its))
    Rp.append(dict(type='rmc', title='제7부분 · 단문 독해 (31~35번)', ko='글을 읽고 질문에 알맞은 답을 고르세요.', items=items('R', 'rmc3', 'mid', F_R)))
    bk, its = bank('R', 'advb', 'adv')
    Rp.append(dict(type='bank', title='제8부분 · 고급 어휘 채우기 (36~40번)', ko='보기(A~F)에서 빈칸에 들어갈 가장 알맞은 어휘를 고르세요.', bank=bk, items=its))
    Rp.append(dict(type='rmc', title='제9부분 · 중급 단락 독해 (41~44번)', ko='글을 읽고 질문에 알맞은 답을 고르세요.', items=items('R', 'pm', 'mid', F_R)))
    Rp.append(dict(type='rgroup', title='제10부분 · 고급 장문 독해 (45~50번)', ko='글을 읽고 이어지는 두 질문에 답하세요.', groups=groups('R', 'radv', 'adv', 'passage')))

    data = dict(id=f'lt{s + 1}', level=s + 1, label=f'{s + 1}회', source='CUFS', title=f'중국어 레벨테스트 {s + 1}회',
                corner='exam', minutes={'L': 30, 'R': 40},
                sections=[dict(key='L', name='听力', ko='듣기', parts=Lp), dict(key='R', name='阅读', ko='읽기', parts=Rp)])

    # 정답 위치 균등 배치 (보기 수별로 따로)
    rnd = random.Random(f'lt{s + 1}-answers')
    mc = []
    for sec in data['sections']:
        for p in sec['parts']:
            for it in (p.get('items') or [x for g in p.get('groups', []) for x in g['items']]):
                if 'opts' in it:
                    mc.append(it)
    for k in (3, 4):
        group = [it for it in mc if len(it['opts']) == k]
        targets = [L[i % k] for i in range(len(group))]
        rnd.shuffle(targets)
        for it, t in zip(group, targets):
            correct, others = it['opts'][0], it['opts'][1:]
            rnd.shuffle(others)
            ti = L.index(t)
            it['opts'] = others[:ti] + [correct] + others[ti:]
            it['ans'] = t
    # 보기 키 순서 정리
    for sec in data['sections']:
        for p in sec['parts']:
            for it in (p.get('items') or [x for g in p.get('groups', []) for x in g['items']]):
                exp = it.pop('exp', None)
                it['exp'] = exp
    return data


if __name__ == '__main__':
    os.makedirs('data', exist_ok=True)
    for s in range(N_SETS):
        d = build(s)
        with open(f'data/{d["id"]}.js', 'w', encoding='utf8') as f:
            f.write('window.HSK_SETS = window.HSK_SETS || [];\nHSK_SETS.push(')
            f.write(json.dumps(d, ensure_ascii=False, indent=1))
            f.write(');\n')
    print('완료: data/lt1.js ~ lt8.js')
