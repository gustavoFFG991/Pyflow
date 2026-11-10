'use strict';
/* Núcleo do PyFlow: código-fonte → árvore → grafo (Mermaid) + resumo em passos. Sem dependências. */
let LANG = 'py';
const TYPES = 'let|const|var|int|float|double|long|char|String|boolean|bool';

function langOf(id) {
  if (id === 'python') return 'py';
  if (id === 'java') return 'java';
  if (id === 'c' || id === 'cpp') return 'c';
  if (/^(javascript|typescript)(react)?$/.test(id)) return 'js';
  return null;
}

/* ---------- Pré-processamento: linhas com indentação ---------- */
function toLines(src, lang) {
  const out = [];
  if (lang === 'py') {
    src.replace(/\t/g, '    ').split('\n').forEach(raw => {
      const ind = raw.match(/^ */)[0].length;
      let t = raw.trim();
      if (!t || t[0] === '#') return;
      t = t.replace(/\s+#.*$/, '');
      const open = t.endsWith(':');
      if (open) t = t.slice(0, -1).trim();
      out.push({ ind, text: t, open });
    });
    return out;
  }
  let d = 0;
  src.split('\n').forEach(raw => {
    let t = raw.trim().replace(/\s\/\/.*$/, '');
    if (!t || /^(\/\/|\/\*|\*|#|import\b|package\b|using\b)/.test(t)) return;
    while (t[0] === '}') { d = Math.max(0, d - 1); t = t.slice(1).trim(); }
    t = t.replace(/^;+/, '').trim();
    if (!t) return;
    const open = t.endsWith('{');
    if (open) t = t.slice(0, -1).trim();
    t = t.replace(/;$/, '').trim();
    if (!t && open) { d++; return; }
    out.push({ ind: d, text: t, open });
    if (open) d++;
  });
  return out;
}

/* ---------- Parser ---------- */
const kind = t =>
  /^(elif|else\s+if)\b/.test(t) ? 'elif' :
  /^else\b/.test(t) ? 'else' :
  /^if\b/.test(t) ? 'if' :
  /^while\b/.test(t) ? 'while' :
  /^for\b/.test(t) ? 'for' : null;

function unp(s) {
  s = s.trim();
  if (s[0] === '(' && s.slice(-1) === ')') {
    let k = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') k++;
      else if (s[i] === ')') { k--; if (k === 0 && i < s.length - 1) return s; }
    }
    return s.slice(1, -1).trim();
  }
  return s;
}

function defInfo(t) {
  let m = t.match(/^(?:async\s+)?def\s+(\w+)\s*\((.*)\)/) || t.match(/^(?:async\s+)?function\s*\*?\s*(\w*)\s*\((.*)\)/);
  if (m) return { name: m[1] || 'anônima', p: m[2] };
  m = t.match(/^(?:[\w<>\[\],.*&]+\s+)+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s.]+)?$/) || t.match(/^(\w+)\s*\(([^)]*)\)$/);
  if (m && !/^(if|else|for|while|switch|catch|try|do|synchronized|return)$/.test(m[1])) return { name: m[1], p: m[2] };
  return null;
}

function body(L, i) {
  const nx = L[i + 1];
  if (nx && nx.ind > L[i].ind) { const r = parseBlock(L, i + 1, nx.ind); return { b: r.out, i: r.i }; }
  return { b: [], i: i + 1 };
}
function parseBlock(L, i, ind) {
  const out = [];
  while (i < L.length && L[i].ind >= ind) { const r = parseStmt(L, i); out.push(r.n); i = r.i; }
  return { out, i };
}
function parseStmt(L, i) {
  const l = L[i], t = l.text;
  if (!l.open) {
    let m;
    if ((m = t.match(/^return\b\s*(.*)$/))) return { n: { k: 'ret', v: m[1] }, i: i + 1 };
    if (t === 'break' || t === 'continue') return { n: { k: t === 'break' ? 'brk' : 'cnt' }, i: i + 1 };
    return { n: { k: 'act', t }, i: i + 1 };
  }
  const kd = kind(t);
  if (kd === 'if') {
    const r = body(L, i);
    const n = { k: 'if', c: unp(t.replace(/^if\b/, '')), a: r.b, b: [] };
    let cur = n; i = r.i;
    while (i < L.length && L[i].ind === l.ind && L[i].open) {
      const t2 = L[i].text, k2 = kind(t2);
      if (k2 === 'elif') {
        const rb = body(L, i);
        const n2 = { k: 'if', el: 1, c: unp(t2.replace(/^(elif|else\s+if)\b/, '')), a: rb.b, b: [] };
        cur.b = [n2]; cur = n2; i = rb.i;
      } else if (k2 === 'else') {
        const rb = body(L, i); cur.b = rb.b; i = rb.i; break;
      } else break;
    }
    return { n, i };
  }
  if (kd === 'while' || kd === 'for') {
    const r = body(L, i);
    return { n: { k: kd, c: unp(t.replace(/^(while|for)\b/, '')), a: r.b }, i: r.i };
  }
  const r = body(L, i), di = defInfo(t);
  if (di && !(di.name === 'main' && LANG !== 'py')) return { n: { k: 'def', name: di.name, p: di.p, a: r.b }, i: r.i };
  return { n: { k: 'flat', a: r.b }, i: r.i };
}

/* ---------- Rótulos em português ---------- */
function actInfo(t) {
  let m;
  if ((m = t.match(/^(?:print|println|console\.log|System\.out\.println|System\.out\.print|printf)\s*\((.*)\)$/))) return { l: 'Exibir: ' + m[1], s: 'Exibe ' + m[1] };
  if ((m = t.match(/^(\w+)(\+\+|--)$/))) return { l: t, s: (m[2] === '++' ? 'Incrementa ' : 'Decrementa ') + m[1] };
  m = t.match(new RegExp('^(?:(?:' + TYPES + ')(?:\\[\\])?\\s+)?([\\w.\\[\\]]+)\\s*(=|\\+=|-=|\\*=|/=)(?!=)\\s*(.+)$'));
  if (m) {
    const v = m[1], val = m[3], o = m[2];
    const s = o === '=' ? 'Define ' + v + ' como ' + val : o === '+=' ? 'Soma ' + val + ' a ' + v : o === '-=' ? 'Subtrai ' + val + ' de ' + v : o === '*=' ? 'Multiplica ' + v + ' por ' + val : 'Divide ' + v + ' por ' + val;
    return { l: t.replace(new RegExp('^(?:' + TYPES + ')(?:\\[\\])?\\s+'), ''), s };
  }
  if ((m = t.match(new RegExp('^(?:' + TYPES + ')(?:\\[\\])?\\s+(\\w+)$')))) return { l: 'Declarar ' + m[1], s: 'Declara a variável ' + m[1] };
  return { l: t, s: 'Executa: ' + t };
}
function loopLbl(s) {
  const m = s.c.match(/^(\w+)\s+in\s+(.+)$/);
  if (s.k === 'while') return 'Enquanto ' + s.c;
  return m ? 'Para cada ' + m[1] + ' em ' + m[2] : 'Para ' + s.c;
}

/* ---------- Grafo ---------- */
function build(tree) {
  let n = 0;
  const N = [], E = [], defs = [];
  const nd = (t, l) => { const id = 'N' + (++n); N.push({ id, t, l }); return id; };
  const ln = (ex, to) => ex.forEach(e => E.push({ f: e.id, to, l: e.l }));
  function seq(st, ex, cx) { for (const s of st) ex = one(s, ex, cx); return ex; }
  function one(s, ex, cx) {
    switch (s.k) {
      case 'act': { const id = nd('act', actInfo(s.t).l); ln(ex, id); return [{ id }]; }
      case 'ret': { const id = nd('act', 'Retornar' + (s.v ? ' ' + s.v : '')); ln(ex, id); cx.rets.push(id); return []; }
      case 'brk': { const f = cx.loops[cx.loops.length - 1]; const id = nd('act', 'Sair do laço'); ln(ex, id); if (f) f.brk.push({ id }); return []; }
      case 'cnt': { const f = cx.loops[cx.loops.length - 1]; const id = nd('act', 'Próxima repetição'); ln(ex, id); if (f) ln([{ id }], f.id); return []; }
      case 'if': {
        const d = nd('dec', s.c + '?'); ln(ex, d);
        const a = seq(s.a, [{ id: d, l: 'Sim' }], cx);
        const b = s.b.length ? seq(s.b, [{ id: d, l: 'Não' }], cx) : [{ id: d, l: 'Não' }];
        return a.concat(b);
      }
      case 'while': case 'for': {
        const f = { id: nd('loop', loopLbl(s)), brk: [] };
        ln(ex, f.id); cx.loops.push(f);
        const bx = seq(s.a, [{ id: f.id, l: 'Sim' }], cx);
        cx.loops.pop(); ln(bx, f.id);
        return [{ id: f.id, l: 'Não' }].concat(f.brk);
      }
      case 'def': defs.push(s); return ex;
      default: return seq(s.a || [], ex, cx);
    }
  }
  const cx = { rets: [], loops: [] };
  const st = nd('term', 'Início');
  const ex = seq(tree, [{ id: st }], cx);
  const en = nd('term', 'Fim'); ln(ex, en); cx.rets.forEach(r => ln([{ id: r }], en));
  for (let k = 0; k < defs.length; k++) {
    const d = defs[k], c2 = { rets: [], loops: [] };
    const s2 = nd('term', 'Função ' + d.name + '(' + d.p + ')');
    const x = seq(d.a, [{ id: s2 }], c2);
    const e2 = nd('term', 'Fim de ' + d.name); ln(x, e2); c2.rets.forEach(r => ln([{ id: r }], e2));
  }
  return { N, E };
}

const esc = s => {
  s = s.length > 70 ? s.slice(0, 67) + '…' : s;
  return s.replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');
};
function toMermaid(N, E) {
  const sh = { term: x => `(["${x}"])`, act: x => `["${x}"]`, dec: x => `{"${x}"}`, loop: x => `{{"${x}"}}` };
  let s = 'flowchart TD\n';
  N.forEach(o => { s += `  ${o.id}${sh[o.t](esc(o.l))}\n`; });
  E.forEach(e => { s += `  ${e.f} -->${e.l ? `|${e.l}|` : ''} ${e.to}\n`; });
  s += '  classDef tTerm fill:#1e293b,stroke:#1e293b,color:#ffffff\n  classDef tAct fill:#dbeafe,stroke:#2563eb,color:#0f172a\n  classDef tDec fill:#fef3c7,stroke:#d97706,color:#0f172a\n  classDef tLoop fill:#ede9fe,stroke:#7c3aed,color:#0f172a\n';
  const cn = { term: 'tTerm', act: 'tAct', dec: 'tDec', loop: 'tLoop' };
  for (const t in cn) { const ids = N.filter(o => o.t === t).map(o => o.id); if (ids.length) s += `  class ${ids.join(',')} ${cn[t]}\n`; }
  return s;
}

/* ---------- Resumo em passos ---------- */
function summarize(tree) {
  const out = [];
  const P = (d, t) => out.push({ d, t });
  function sm(st, d) {
    for (const s of st) {
      if (s.k === 'act') P(d, actInfo(s.t).s);
      else if (s.k === 'ret') P(d, s.v ? 'Retorna ' + s.v : 'Encerra a função');
      else if (s.k === 'brk') P(d, 'Interrompe o laço');
      else if (s.k === 'cnt') P(d, 'Pula para a próxima repetição');
      else if (s.k === 'if') sif(s, d, true);
      else if (s.k === 'while' || s.k === 'for') { P(d, loopLbl(s) + (s.k === 'while' ? ', repete:' : ' — repete:')); sm(s.a, d + 1); }
      else if (s.k === 'def') { P(d, 'Define a função ' + s.name + '(' + s.p + '):'); sm(s.a, d + 1); }
      else sm(s.a || [], d);
    }
  }
  function sif(s, d, first) {
    P(d, (first ? 'Se ' : 'Senão, se ') + s.c + ':');
    sm(s.a, d + 1);
    if (s.b.length === 1 && s.b[0].k === 'if' && s.b[0].el) sif(s.b[0], d, false);
    else if (s.b.length) { P(d, 'Caso contrário:'); sm(s.b, d + 1); }
  }
  sm(tree, 0);
  return out;
}

/* ---------- API pública ---------- */
function analyze(src, lang) {
  LANG = lang;
  const L = toLines(src, lang);
  if (!L.length) return { empty: true, mermaid: '', steps: [] };
  const tree = parseBlock(L, 0, Math.min(...L.map(x => x.ind))).out;
  const { N, E } = build(tree);
  return { empty: false, mermaid: toMermaid(N, E), steps: summarize(tree) };
}

module.exports = { analyze, langOf };
