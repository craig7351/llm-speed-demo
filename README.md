# LLM 速度體感模擬器

報告上寫「27B 推理 11.28 tok/s」，沒有人有感覺。這個頁面把 tok/s 換算成**看得見的速度**：先讓你盯著空白畫面等 TTFT，再用實際速率一個字一個字吐出來，還能左右並排比兩組硬體。

**線上版：** https://craig7351.github.io/llm-speed-demo/

- 下拉選單挑「模型／硬體組合」與 context 長度，立刻看到 TTFT、總耗時、以及「等於一般人閱讀速度的幾倍」
- 按「開始模擬」看逐字產生的過程，可 2×／5×／10× 加速觀看
- 勾「左右對比模式」讓兩組同時起跑，跑完自動標出快幾倍
- 「複製分享連結」把當下的選擇寫進網址，貼進報告或 Slack，對方點開就是同一組畫面

純靜態頁面，零依賴、零 build。

---

## Fork 成你自己的版本

### 1. Fork 這個 repo

### 2. 開啟 Pages 與 Actions（只需做一次）

GitHub 對 fork 來的 repo 預設會關掉這兩項，必須手動開：

| 位置 | 要做的事 |
|---|---|
| **Actions** 分頁 | 按 **I understand my workflows, go ahead and enable them** |
| **Settings → Pages → Build and deployment** | 把 **Source** 改成 **GitHub Actions** |

> Pages 免費方案只支援 public repo。私有 repo 需要 GitHub Pro 以上。

### 3. 改 `data.js`，commit 到 `main`

推上去約 40 秒後自動上線，網址是 `https://<你的帳號>.github.io/<repo 名稱>/`。

改壞了也不會炸掉線上版本 —— CI 會先驗證 `data.js`，欄位有問題就直接讓 build 失敗；本地也可以先跑：

```bash
node scripts/validate-data.mjs
```

---

## 檔案結構

```
├─ index.html                    # 骨架與樣式，通常不用改
├─ app.js                        # 模擬引擎，通常不用改
├─ data.js                       # ★ 你只需要改這一個檔案
├─ scripts/validate-data.mjs     # 零依賴的資料驗證（CI 與本地共用）
└─ .github/workflows/
   ├─ deploy.yml                 # push 到 main → 驗證 → 部署 Pages
   └─ validate.yml               # PR 與其他分支只驗證
```

本地預覽直接**雙擊 `index.html`** 就行。資料刻意存成 `data.js`（`window.LLM_SPEED_DATA = {…}`）而不是 `.json`，就是為了避免 `file://` 下 `fetch()` 被 CORS 擋住 —— 內容仍然只用 JSON 表達得出來的型別，要搬去別處很容易。

---

## `data.js` 欄位說明

### 每一筆模型／硬體組合

```js
{
  id: 'q36-5090-mtp',                    // 必填，唯一。會出現在分享網址裡
  group: '② 桌上型 GPU',                  // 必填。直接當下拉選單的分組標題
  name: 'Qwen3.6-27B Q4_K_M + MTP',      // 必填
  hw: 'RTX 5090',                        // 必填
  prefill: 2000,                         // 必填，tok/s。決定 TTFT = context ÷ prefill
  decode: 122.28,                        // 必填，tok/s。決定吐字速度
  source: 'm',                           // 必填。要對應到 sourceTypes 的 key
  prefillEstimated: true,                // 選填。true 時卡片標「推估」
  note: '開啟推測解碼後…',                 // 選填。顯示在數字下方的說明
  url: 'https://…',                      // 選填。來源連結
  sourceName: 'DFlash vs llama.cpp 實測'  // 選填。連結文字
}
```

只有 `prefill` 和 `decode` 會影響模擬，其餘都是文案。

### 其他可調整的區塊

| 欄位 | 作用 |
|---|---|
| `site` | 標題、副標、頁尾說明（副標與頁尾吃 HTML） |
| `site.links` | 推廣／社群按鈕，顯示在頁面頂端標題右側。每筆填 `label`、`url`、選填 `note`（hover 提示）與 `icon`（`facebook` / `youtube` / `github` / `line` / `x`，省略則顯示 🔗）。整個陣列清空按鈕就不出現 |
| `readingSpeedCharsPerSec` | 舒適閱讀速度，用來算「等於你閱讀的幾倍」。中文預設 6.7（≈ 400 字/分），英文語系可改成約 5（≈ 250 wpm） |
| `feelScale` | decode 速度 → 主觀評語（極慢／偏慢／流暢…）。由上往下比對第一個 `under` 成立的項目，最後一項不寫 `under` 當 catch-all |
| `contextPresets` / `replyLengths` | 兩個數字下拉選單的選項，`default: true` 決定預設值 |
| `speedMultipliers` | 觀看倍速按鈕，例如 `[1, 2, 5, 10]` |
| `defaults` | 預設的 A／B 組合、是否開對比模式、是否模擬 TTFT、預設倍速 |
| `sourceTypes` | 可信度標籤字典。key 供 `models[].source` 引用，`level` 決定顏色（`good` 綠／`info` 藍／`warn` 黃／`bad` 紅）。想加一組「自家實測」就自己加 |
| `demo.prompt` / `demo.reply` | 模擬對話的內容。回覆越長，能選的「回覆長度」上限就越高 |

---

## 網址參數

| 參數 | 說明 |
|---|---|
| `a` / `b` | 模型 id（A 組與對照組 B） |
| `ctx` | context tokens 數 |
| `len` | 回覆 tokens 數 |
| `cmp` | `1` 開啟左右對比 |
| `ttft` | `0` 關閉首字等待模擬 |
| `x` | 觀看倍速 |

例：`?a=glm-air-gb10&b=q36-5090-mtp&ctx=62200&cmp=1&x=10`

---

## 模擬方式與已知簡化

- **TTFT** = `context ÷ prefill`，**出字速率** = `decode × 倍速`
- Token 換算是近似的：CJK 1 字 ≈ 1 token，其他字元 4 個 ≈ 1 token
- 每一筆的 `prefill`／`decode` 都當成常數，**不會隨 context 長度衰減**。實務上長 context 會拖慢 decode，所以長 context 情境下的模擬會比真實情況樂觀一些
- 標「推估」的 `prefill` 表示原始來源只公布了 decode，該欄是推估值，只影響 TTFT

## 資料來源

預設資料集的出處都寫在每一筆的 `url` 欄位，頁面上可直接點。主要來自：

- [llama.cpp on NVIDIA DGX Spark — Benchmarks (JetsonHacks)](https://jetsonhacks.com/wp-content/uploads/2025/10/spark-llamacpp-bench.html)
- [Performance of llama.cpp on NVIDIA DGX Spark（llama.cpp Discussion #16578）](https://github.com/ggml-org/llama.cpp/discussions/16578)
- [DFlash vs llama.cpp on RTX 5090（Qwen3.6-27B 實測）](https://note.com/zephel01/n/ne5f86c7f16c8)
- [Unsloth — Qwen3.6 / MTP 文件](https://unsloth.ai/docs/models/qwen3.6)
- [Artificial Analysis — 雲端模型輸出速度](https://artificialanalysis.ai/models)
- [M4 Max llama.cpp benchmark](https://markaicode.com/benchmarks/llamacpp-m4-max-benchmark/)

⚠️ 桌上型 GPU、Apple Silicon 與雲端那幾組來自品質不一的 benchmark 文章 —— 同一張 5090 跑 Llama 8B 在不同來源就有 42～178 tok/s 的落差（框架、batch size、context 長度都不同）。要引用進正式報告前請自己複核，或換成你自己實機量到的數字。

## License

MIT
