/* CI 用的 data.js 驗證腳本（零依賴）。
   本地執行：node scripts/validate-data.mjs                              */
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../data.js', import.meta.url), 'utf8');

// data.js 只做一件事：設定 window.LLM_SPEED_DATA。這裡給它一個假的 window。
const win = {};
new Function('window', src)(win);
const D = win.LLM_SPEED_DATA;

const errors = [];
const need = (cond, msg) => { if (!cond) errors.push(msg); };

need(D && typeof D === 'object', 'data.js 沒有設定 window.LLM_SPEED_DATA');
if (D) {
  need(D.site && typeof D.site.title === 'string' && D.site.title, 'site.title 必須是非空字串');
  need(+D.readingSpeedCharsPerSec > 0, 'readingSpeedCharsPerSec 必須大於 0');
  need(Array.isArray(D.feelScale) && D.feelScale.length, 'feelScale 必須是非空陣列');
  need(Array.isArray(D.contextPresets) && D.contextPresets.length, 'contextPresets 必須是非空陣列');
  need(Array.isArray(D.replyLengths) && D.replyLengths.length, 'replyLengths 必須是非空陣列');
  need(D.demo && D.demo.prompt && D.demo.reply, 'demo.prompt 與 demo.reply 都必須有內容');
  need(D.sourceTypes && Object.keys(D.sourceTypes).length, 'sourceTypes 必須至少有一組');
  need(Array.isArray(D.models) && D.models.length, 'models 必須是非空陣列');

  (D.contextPresets || []).forEach((c, i) => need(+c.tokens > 0 && c.label, `contextPresets[${i}] 需要 tokens > 0 與 label`));
  (D.replyLengths || []).forEach((c, i) => need(+c.tokens > 0 && c.label, `replyLengths[${i}] 需要 tokens > 0 與 label`));

  const ids = new Set();
  (D.models || []).forEach((m, i) => {
    const at = `models[${i}]${m?.id ? ` (id: ${m.id})` : ''}`;
    if (!m || typeof m !== 'object') return errors.push(`${at} 不是物件`);
    need(typeof m.id === 'string' && m.id, `${at} 缺少 id`);
    if (m.id) {
      need(!ids.has(m.id), `id 重複：${m.id}`);
      ids.add(m.id);
    }
    for (const k of ['group', 'name', 'hw']) need(typeof m[k] === 'string' && m[k], `${at} 缺少 ${k}`);
    need(+m.prefill > 0, `${at} 的 prefill 必須大於 0`);
    need(+m.decode > 0, `${at} 的 decode 必須大於 0`);
    need(D.sourceTypes?.[m.source], `${at} 的 source "${m.source}" 不存在於 sourceTypes`);
    if (m.url) need(/^https?:\/\//.test(m.url), `${at} 的 url 必須以 http(s):// 開頭`);
  });

  for (const k of ['a', 'b']) {
    const id = D.defaults?.[k];
    need(id && ids.has(id), `defaults.${k} = "${id}" 找不到對應的模型 id`);
  }
  const speeds = D.speedMultipliers;
  if (speeds !== undefined) {
    need(Array.isArray(speeds) && speeds.length && speeds.every(s => +s > 0),
      'speedMultipliers 必須是一組大於 0 的數字');
    need(!D.defaults?.speed || speeds.includes(D.defaults.speed),
      `defaults.speed = ${D.defaults?.speed} 不在 speedMultipliers 裡`);
  }
}

if (errors.length) {
  console.error(`✗ data.js 有 ${errors.length} 個問題：`);
  for (const e of errors) console.error('  · ' + e);
  process.exit(1);
}
console.log(`✓ data.js 通過驗證（${D.models.length} 筆模型／硬體組合，${new Set(D.models.map(m => m.group)).size} 個分組）`);
