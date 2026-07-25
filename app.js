/* ═══════════════════════════════════════════════════════════════════════
   LLM 速度體感模擬器 — 模擬引擎
   整個 UI 由 data.js 建出來。要改內容請改 data.js，不用動這支檔案。
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── 資料出問題時，給看得懂的錯誤，而不是空白頁 ──────────────────── */
  function fail(title, issues) {
    $('banner').innerHTML =
      `<strong>${esc(title)}</strong><ul>${issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` +
      `<div class="hint">請修正 <code>data.js</code> 後重新整理。欄位說明見 README。</div>`;
    $('banner').hidden = false;
  }

  function validate(D) {
    const e = [];
    const need = (cond, msg) => { if (!cond) e.push(msg); };

    need(D.site && typeof D.site.title === 'string', 'site.title 必須是字串');
    need(+D.readingSpeedCharsPerSec > 0, 'readingSpeedCharsPerSec 必須是大於 0 的數字');
    need(Array.isArray(D.feelScale) && D.feelScale.length, 'feelScale 必須是非空陣列');
    need(Array.isArray(D.contextPresets) && D.contextPresets.length, 'contextPresets 必須是非空陣列');
    need(Array.isArray(D.replyLengths) && D.replyLengths.length, 'replyLengths 必須是非空陣列');
    need(D.demo && D.demo.prompt && D.demo.reply, 'demo.prompt 與 demo.reply 都必須有內容');
    need(D.sourceTypes && Object.keys(D.sourceTypes).length, 'sourceTypes 必須至少有一組');
    need(Array.isArray(D.models) && D.models.length, 'models 必須是非空陣列');

    if (Array.isArray(D.models)) {
      const seen = new Set();
      D.models.forEach((m, i) => {
        const at = `models[${i}]${m && m.id ? ` (id: ${m.id})` : ''}`;
        if (!m || typeof m !== 'object') return e.push(`${at} 不是物件`);
        need(typeof m.id === 'string' && m.id, `${at} 缺少 id`);
        if (m.id) {
          need(!seen.has(m.id), `id 重複：${m.id}`);
          seen.add(m.id);
        }
        ['group', 'name', 'hw'].forEach(k => need(typeof m[k] === 'string' && m[k], `${at} 缺少 ${k}`));
        need(+m.prefill > 0, `${at} 的 prefill 必須是大於 0 的數字`);
        need(+m.decode > 0, `${at} 的 decode 必須是大於 0 的數字`);
        need(D.sourceTypes && D.sourceTypes[m.source], `${at} 的 source "${m.source}" 不存在於 sourceTypes`);
      });
      ['a', 'b'].forEach(k => {
        const id = D.defaults && D.defaults[k];
        need(id && seen.has(id), `defaults.${k} = "${id}" 找不到對應的模型 id`);
      });
    }
    return e;
  }

  const D = window.LLM_SPEED_DATA;
  if (!D) return fail('找不到資料', ['data.js 沒有載入，或沒有設定 window.LLM_SPEED_DATA。']);
  const problems = validate(D);
  if (problems.length) return fail(`data.js 有 ${problems.length} 個問題`, problems);

  /* ── 套用文案 ───────────────────────────────────────────────────── */
  document.title = `${D.site.title} — tok/s 到底有多快？`;
  $('title').textContent = D.site.title;
  $('subtitle').innerHTML = D.site.subtitle || '';
  $('legend').innerHTML =
    Object.entries(D.sourceTypes)
      .map(([k, v]) => `<span class="tag ${esc(v.level || 'info')}">${esc(v.label)}</span>${esc(v.desc || '')}`)
      .join(' ') +
    ' 標「推估」的 prefill 表示來源只公布 decode，該欄為推估值，只影響 TTFT 模擬。<br>' +
    (D.site.footerNote || '');

  /* ── 近似 tokenizer：CJK 1 字 ≈ 1 token，其餘約 4 字元 ≈ 1 token ── */
  function tokenize(s) {
    const out = [];
    let buf = '';
    const flush = () => { while (buf.length) { out.push(buf.slice(0, 4)); buf = buf.slice(4); } };
    for (const ch of s) {
      if (/[　-〿㐀-鿿＀-￯]/.test(ch)) { flush(); out.push(ch); } else buf += ch;
    }
    flush();
    return out;
  }
  const TOKENS = tokenize(D.demo.reply);

  /* ── 網址參數：?a=&b=&ctx=&len=&cmp=1&ttft=0&x=2 ─────────────────── */
  const q = new URLSearchParams(location.search);
  const has = id => D.models.some(m => m.id === id);
  const pick = (key, fallback) => (has(q.get(key)) ? q.get(key) : fallback);
  const flag = (key, fallback) => (q.has(key) ? q.get(key) === '1' : fallback);

  const selA = $('selA'), selB = $('selB'), selCtx = $('selCtx'), selLen = $('selLen');
  const cmp = $('cmp'), ttftOn = $('ttft'), stage = $('stage'), stats = $('stats');
  let mult = 1, running = false, paused = false, raf = null, lanes = [];

  /* ── 由資料建出下拉選單 ─────────────────────────────────────────── */
  function fillModels(sel, want) {
    const groups = new Map();
    D.models.forEach(m => {
      if (!groups.has(m.group)) groups.set(m.group, []);
      groups.get(m.group).push(m);
    });
    sel.innerHTML = '';
    groups.forEach((list, label) => {
      const og = document.createElement('optgroup');
      og.label = label;
      list.forEach(m => {
        const o = document.createElement('option');
        o.value = m.id;
        o.textContent = `${m.name} @ ${m.hw} — ${m.decode} tok/s`;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    sel.value = want;
  }
  function fillNumbers(sel, list, want) {
    sel.innerHTML = '';
    const def = list.find(x => x.default) || list[0];
    list.forEach(x => {
      const o = document.createElement('option');
      o.value = x.tokens;
      o.textContent = x.label;
      sel.appendChild(o);
    });
    sel.value = list.some(x => +x.tokens === +want) ? want : def.tokens;
  }

  fillModels(selA, pick('a', D.defaults.a));
  fillModels(selB, pick('b', D.defaults.b));
  fillNumbers(selCtx, D.contextPresets, q.get('ctx'));
  fillNumbers(selLen, D.replyLengths, q.get('len'));
  cmp.checked = flag('cmp', !!D.defaults.compare);
  ttftOn.checked = flag('ttft', D.defaults.ttft !== false);
  $('fieldB').hidden = !cmp.checked;
  $('lblA').textContent = cmp.checked ? 'A' : '';

  const speeds = D.speedMultipliers && D.speedMultipliers.length ? D.speedMultipliers : [1, 2, 5, 10];
  const wantSpeed = +(q.get('x') || D.defaults.speed || 1);
  mult = speeds.includes(wantSpeed) ? wantSpeed : speeds[0];
  $('mult').innerHTML = speeds
    .map(s => `<button data-m="${s}"${s === mult ? ' class="on"' : ''}>${s}×</button>`)
    .join('');

  /* ── 讓網址永遠反映當前狀態，方便直接複製貼到報告裡 ──────────────── */
  function syncURL() {
    const p = new URLSearchParams({
      a: selA.value, ctx: selCtx.value, len: selLen.value,
      cmp: cmp.checked ? '1' : '0', ttft: ttftOn.checked ? '1' : '0', x: String(mult)
    });
    if (cmp.checked) p.set('b', selB.value);
    history.replaceState(null, '', `${location.pathname}?${p}`);
  }

  /* ── 換算 ───────────────────────────────────────────────────────── */
  const get = id => D.models.find(m => m.id === id);
  const fmt = n => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const secs = s => (s < 1 ? s.toFixed(2) + ' 秒'
    : s < 60 ? s.toFixed(1) + ' 秒'
      : `${Math.floor(s / 60)} 分 ${Math.round(s % 60)} 秒`);
  const feel = d => D.feelScale.find(f => f.under == null || d < f.under) || D.feelScale[D.feelScale.length - 1];

  function renderStats() {
    const m = get(selA.value), ctx = +selCtx.value, len = +selLen.value;
    const ttft = ctx / m.prefill, gen = len / m.decode;
    const ratio = m.decode / D.readingSpeedCharsPerSec;   // 中文 ≈ 1 字/token
    const f = feel(m.decode);
    const st = D.sourceTypes[m.source];

    stats.innerHTML = `
      <div class="card"><div class="k">Prefill 預加載</div>
        <div class="v acc">${fmt(m.prefill)}<span class="u">tok/s</span>${m.prefillEstimated ? '<span class="est">推估</span>' : ''}</div>
        <div class="s">讀完 ${(ctx / 1000).toFixed(ctx < 1000 ? 1 : 0)}K context 的速度</div></div>
      <div class="card"><div class="k">Decode 推理</div>
        <div class="v acc">${fmt(m.decode)}<span class="u">tok/s</span></div>
        <div class="s">吐字的速度</div></div>
      <div class="card"><div class="k">TTFT 首字等待</div>
        <div class="v ${ttft > 10 ? 'bad' : ttft > 3 ? 'warn' : 'good'}">${secs(ttft)}</div>
        <div class="s">盯著空白畫面的時間</div></div>
      <div class="card"><div class="k">回覆寫完</div>
        <div class="v ${gen > 30 ? 'bad' : gen > 12 ? 'warn' : 'good'}">${secs(ttft + gen)}</div>
        <div class="s">從送出到看完全文</div></div>
      <div class="card"><div class="k">換成人話</div>
        <div class="v ${esc(f.level)}">${m.decode.toFixed(1)}<span class="u">中文字/秒</span></div>
        <div class="s">舒適閱讀速度的 ${ratio.toFixed(2)} 倍 · <b class="t-${esc(f.level)}">${esc(f.label)}</b></div></div>`;

    $('srcnote').innerHTML =
      `<span class="tag ${esc(st.level || 'info')}">${esc(st.label)}</span>` +
      `<b>${esc(m.name)} @ ${esc(m.hw)}</b>${m.note ? ' — ' + esc(m.note) : ''}` +
      (m.url ? ` <a href="${esc(m.url)}" target="_blank" rel="noreferrer">來源：${esc(m.sourceName || m.url)}</a>` : '');
  }

  /* ── 建立聊天視窗 ───────────────────────────────────────────────── */
  function buildLanes() {
    const ids = cmp.checked ? [selA.value, selB.value] : [selA.value];
    stage.className = 'stage' + (cmp.checked ? ' dual' : '');
    stage.innerHTML = '';
    lanes = ids.map(id => {
      const m = get(id), ctx = +selCtx.value, n = +selLen.value;
      const el = document.createElement('div');
      el.className = 'chat';
      el.innerHTML = `
        <h3><span>${esc(m.name)} <span class="hw">@ ${esc(m.hw)}</span></span>
          <span class="live">0.0s · <b>0.0</b> tok/s</span></h3>
        <div class="body">
          <div class="msg u"><div class="who">你</div><div class="txt">${esc(D.demo.prompt)}</div></div>
          <div class="msg a"><div class="who">AI</div><div class="txt"></div></div>
        </div>
        <div class="done">按下「開始模擬」</div>
        <div class="bar"><i></i></div>`;
      stage.appendChild(el);
      return {
        m, el, n, ttft: ttftOn.checked ? ctx / m.prefill : 0,
        out: el.querySelector('.msg.a .txt'), live: el.querySelector('.live'),
        foot: el.querySelector('.done'), bar: el.querySelector('.bar i'),
        shown: -1, phase: 'idle'
      };
    });
  }

  /* ── 模擬迴圈 ───────────────────────────────────────────────────── */
  let t0 = 0, accum = 0;   // accum 記的是「已模擬秒數」，不是實際經過時間
  function tick(now) {
    if (!t0) t0 = now;
    const e = accum + (now - t0) / 1000 * mult;
    let allDone = true;

    for (const L of lanes) {
      const g = Math.max(0, e - L.ttft);
      const k = Math.min(L.n, Math.floor(g * L.m.decode));

      if (e < L.ttft) {
        if (L.phase !== 'wait') {
          L.phase = 'wait';
          L.out.innerHTML = '<span class="think">預加載 context<span class="dots"><i></i><i></i><i></i></span></span>';
        }
        L.foot.textContent = `等待首字… ${e.toFixed(1)}s / ${L.ttft.toFixed(1)}s`;
        L.bar.style.width = (e / L.ttft * 100).toFixed(1) + '%';
        L.bar.style.background = 'var(--dim2)';
        allDone = false;
      } else {
        // 只在「等待 → 產生」的交界清空一次；已完成(end)後再收到 tick 不能清掉內容
        if (L.phase === 'idle' || L.phase === 'wait') {
          L.phase = 'gen'; L.out.textContent = ''; L.bar.style.background = 'var(--acc)';
        }
        if (k !== L.shown) {
          L.shown = k;
          L.out.textContent = TOKENS.slice(0, k).join('');
          if (k < L.n) L.out.insertAdjacentHTML('beforeend', '<span class="cursor"></span>');
          L.bar.style.width = (k / L.n * 100).toFixed(1) + '%';
          L.el.querySelector('.body').scrollTop = 1e6;
        }
        if (k < L.n) {
          allDone = false;
          L.foot.textContent = `產生中… ${k}/${L.n} tokens`;
        } else if (L.phase !== 'end') {
          L.phase = 'end';
          const tot = L.ttft + L.n / L.m.decode;
          L.foot.innerHTML = `✓ 完成 <b>${L.n} tokens</b> · 總耗時 <b>${tot.toFixed(1)}s</b>`
            + `（首字 ${L.ttft.toFixed(1)}s + 產生 ${(L.n / L.m.decode).toFixed(1)}s）`;
        }
      }
      const gcap = Math.min(g, L.n / L.m.decode);   // 完成後速率凍結，不被多餘時間稀釋
      L.live.innerHTML = `${Math.min(e, L.ttft + L.n / L.m.decode).toFixed(1)}s · `
        + `<b>${(gcap > 0 ? Math.max(0, L.shown) / gcap : 0).toFixed(1)}</b> tok/s`;
    }

    if (allDone) return finish();
    raf = requestAnimationFrame(tick);
  }

  function finish() {
    if (!running) return;              // 防止重複收尾（會重複追加勝出標記）
    running = false; raf = null;
    $('run').textContent = '▶ 開始模擬'; $('run').disabled = false; $('pause').disabled = true;
    if (lanes.length === 2) {
      const t = lanes.map(L => L.ttft + L.n / L.m.decode);
      const w = t[0] <= t[1] ? 0 : 1;
      lanes[w].el.classList.add('win');
      lanes[w].foot.innerHTML += ` <span class="t-good">— 快 ${(t[1 - w] / t[w]).toFixed(1)}×</span>`;
    }
  }

  function start() {
    if (paused) {
      paused = false; t0 = 0; running = true;
      $('pause').textContent = '⏸ 暫停'; $('run').disabled = true;
      raf = requestAnimationFrame(tick);
      return;
    }
    reset(); buildLanes();
    running = true; t0 = 0; accum = 0;
    $('run').disabled = true; $('pause').disabled = false; $('reset').disabled = false;
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    if (!running) return;
    accum += (performance.now() - t0) / 1000 * mult; t0 = 0; running = false; paused = true;
    cancelAnimationFrame(raf); raf = null;
    $('pause').textContent = '⏸ 已暫停'; $('run').textContent = '▶ 繼續'; $('run').disabled = false;
  }
  function reset() {
    cancelAnimationFrame(raf); raf = null; running = false; paused = false; accum = 0; t0 = 0;
    $('run').textContent = '▶ 開始模擬'; $('run').disabled = false;
    $('pause').disabled = true; $('pause').textContent = '⏸ 暫停'; $('reset').disabled = true;
    buildLanes();
  }

  /* ── 事件 ───────────────────────────────────────────────────────── */
  $('run').onclick = start;
  $('pause').onclick = pause;
  $('reset').onclick = reset;
  $('mult').onclick = ev => {
    const b = ev.target.closest('button[data-m]');
    if (!b) return;
    [...$('mult').children].forEach(x => x.classList.toggle('on', x === b));
    if (running) { accum += (performance.now() - t0) / 1000 * mult; t0 = 0; }  // 換速率前先結算已模擬進度
    mult = +b.dataset.m;
    syncURL();
  };
  $('share').onclick = async () => {
    syncURL();
    try {
      await navigator.clipboard.writeText(location.href);
      $('share').textContent = '✓ 已複製連結';
    } catch {
      $('share').textContent = '複製失敗，請手動複製網址';
    }
    setTimeout(() => { $('share').textContent = '🔗 複製分享連結'; }, 2000);
  };
  cmp.onchange = () => {
    $('fieldB').hidden = !cmp.checked;
    $('lblA').textContent = cmp.checked ? 'A' : '';
    syncURL(); reset();
  };
  [selA, selB, selCtx, selLen, ttftOn].forEach(el => {
    el.onchange = () => { syncURL(); renderStats(); reset(); };
  });

  syncURL();
  renderStats();
  buildLanes();

  // 給自動化測試用（正常使用不需要）
  window.__sim = { tick, get lanes() { return lanes; } };
})();
