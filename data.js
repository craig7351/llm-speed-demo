/* ═══════════════════════════════════════════════════════════════════════
   LLM 速度體感模擬器 — 資料檔
   Fork 這個專案的人只需要改這一個檔案，不必碰 index.html 或 app.js。
   改完 commit 到 main，GitHub Actions 會自動重新部署。

   結構雖然是 JS，但內容刻意寫成純 JSON 可表達的形式（只有字串／數字／
   布林／陣列／物件），方便你直接搬到別的地方用。用 .js 而非 .json 的
   唯一理由：這樣直接用瀏覽器打開本地的 index.html 也能跑（file:// 下
   fetch() 會被 CORS 擋掉）。
   ═══════════════════════════════════════════════════════════════════════ */

window.LLM_SPEED_DATA = {

  /* ── 頁面文案 ────────────────────────────────────────────────────── */
  site: {
    title: 'LLM 速度體感模擬器',
    subtitle: '報告上的 <code>xxx tok/s</code> 沒人有感覺。選一組模型與硬體，按下模擬，用眼睛看它到底有多慢。',
    footerNote: '模擬僅重現「速度感」：TTFT = context ÷ prefill 速度，出字速率 = decode 速度 × 倍速。中文以 1 字 ≈ 1 token、英文以 4 字元 ≈ 1 token 近似換算。',

    /* 推廣連結／社群按鈕。會同時出現在頁面頂端與頁尾。
       icon 可填 facebook / youtube / github / line / x，或省略（顯示 🔗）。
       整個 links 陣列拿掉或清空，按鈕就不會出現。                        */
    links: [
      {
        label: 'Book Ai 粉絲頁',
        url: 'https://www.facebook.com/people/Book-Ai/61584339789020/',
        icon: 'facebook',
        note: '更多 AI 實測與工具分享'
      }
    ]
  },

  /* ── 一般人的舒適閱讀速度（中文字／秒）。用來換算「這速度是你閱讀的幾倍」
        6.7 ≈ 400 字／分。英文語系可改成約 5（≈ 250 wpm）。 ────────── */
  readingSpeedCharsPerSec: 6.7,

  /* ── decode 速度 → 主觀評語。由上往下比對第一個 under 成立的項目。
        最後一項不寫 under，當作 catch-all。level: good | warn | bad ── */
  feelScale: [
    { under: 10,   label: '極慢',              level: 'bad'  },
    { under: 20,   label: '偏慢，明顯要等',      level: 'bad'  },
    { under: 35,   label: '堪用，勉強跟上閱讀',   level: 'warn' },
    { under: 80,   label: '流暢',              level: 'good' },
    {              label: '幾乎瞬間',           level: 'good' }
  ],

  /* ── 下拉選單：輸入 context 長度 ─────────────────────────────────── */
  contextPresets: [
    { tokens: 512,    label: '512 tokens（一句話）' },
    { tokens: 2000,   label: '2K tokens（短文件）' },
    { tokens: 8000,   label: '8K tokens（一份規格書）', default: true },
    { tokens: 32000,  label: '32K tokens（多輪 Agent 對話）' },
    { tokens: 62200,  label: '62.2K tokens（長時間 Agent 工作階段）' },
    { tokens: 128000, label: '128K tokens（塞滿 context）' }
  ],

  /* ── 下拉選單：回覆長度 ──────────────────────────────────────────── */
  replyLengths: [
    { tokens: 90,  label: '短（約 90 tokens）' },
    { tokens: 260, label: '中（約 260 tokens）', default: true },
    { tokens: 620, label: '長（約 620 tokens）' }
  ],

  /* ── 觀看倍速按鈕 ───────────────────────────────────────────────── */
  speedMultipliers: [1, 2, 5, 10],

  /* ── 預設狀態（也可用網址參數覆寫：?a=&b=&ctx=&len=&cmp=1&ttft=0&x=2）─ */
  defaults: {
    a: 'glm-air-gb10',
    b: 'q36-5090-mtp',
    compare: false,
    ttft: true,
    speed: 1
  },

  /* ── 資料可信度標籤。key 會被下面每筆 models[].source 引用，
        你可以自由增減，例如加一組 "own": 自家實測。 ───────────────── */
  sourceTypes: {
    m: { label: '公開實測',   level: 'info', desc: '公開的 llama-bench／實測報告數據，附來源連結。' },
    r: { label: '參考／推估', level: 'warn', desc: '公開資料的典型區間或推估值，僅供對照。' }
  },

  /* ── Demo 對話內容 ─────────────────────────────────────────────── */
  demo: {
    prompt: '幫我看一下這份 spec，Multi-Token Prediction (MTP) 到底為什麼能加速？我們的 Agent 適合開嗎？',
    reply: `MTP（Multi-Token Prediction）的核心想法很單純：讓模型在一次前向傳播裡，同時預測接下來的好幾個 token，而不是一次只吐一個。

傳統的 autoregressive decoding 是嚴格串列的——要產生第 N 個 token，必須先算完第 N-1 個。這代表每個 token 都要把整個模型的權重從顯存搬進運算單元一次。此時瓶頸不在算力，而在記憶體頻寬，GPU 的運算單元其實大半時間都在等資料。

MTP 在訓練階段額外掛上幾個輕量的預測頭，讓模型學會一次猜出後面 2 到 4 個 token。推論時先用這些頭快速產生一小段候選序列，再用主模型一次性平行驗證：猜對的部分整段留下，猜錯的從第一個分歧點截斷重算。因為驗證是平行的，一次前向就能確認多個 token，等於把原本閒置的算力拿來換頻寬。

實際加速比取決於「接受率」。候選被接受得越多，加速越明顯；程式碼、格式化輸出、重複性高的文字接受率通常很高，可以看到接近兩倍的提升。反之，高度發散的創意寫作接受率低，加速幅度就會縮水，甚至因為多出來的驗證成本而略微變慢。

要注意 MTP 只加速 decode 階段，對 prefill 幾乎沒有幫助。如果你的 Agent 每輪都塞進幾萬個 token 的長 context，首字延遲仍然由 prefill 速度決定，這部分要靠 KV cache 重用或縮短 prompt 來解決。

回到你的 Agent：如果它大量產生結構化輸出，像是 JSON、tool call 參數或程式碼，那 MTP 值得開，接受率會偏高。但請務必固定一組 prompt 做 A／B 實測，因為加速效果對工作負載非常敏感，別直接照抄官方數字。另外也要確認你的推論框架版本確實支援對應的 MTP 權重，否則會靜默退回一般 decoding，量出來的數字看起來就像沒效果。`
  },

  /* ── 速度資料 ───────────────────────────────────────────────────
     必填：id（唯一）、group、name、hw、prefill、decode、source
     選填：prefillEstimated（true 時卡片上標「推估」）、note、url、sourceName
     group 直接當下拉選單的分組標題，改字串即可重新分組。            */
  models: [

    /* ① DGX Spark / GB10 —— 公開 llama-bench 實測 */
    {
      id: 'oss20-gb10', group: '① DGX Spark / GB10', source: 'm',
      name: 'gpt-oss 20B MXFP4 (MoE)', hw: 'DGX Spark',
      prefill: 3610.56, decode: 79.74,
      note: 'MoE 架構每個 token 只啟用少量參數，因此在頻寬受限的 GB10 上遠快於同級 dense 模型。',
      url: 'https://jetsonhacks.com/wp-content/uploads/2025/10/spark-llamacpp-bench.html',
      sourceName: 'JetsonHacks llama.cpp bench'
    },
    {
      id: 'oss120-gb10', group: '① DGX Spark / GB10', source: 'm',
      name: 'gpt-oss 120B MXFP4 (MoE)', hw: 'DGX Spark',
      prefill: 1689.47, decode: 52.87,
      note: '120B 參數仍有 52.87 tok/s — MoE 是 GB10 這類大記憶體、低頻寬平台的正解。',
      url: 'https://jetsonhacks.com/wp-content/uploads/2025/10/spark-llamacpp-bench.html',
      sourceName: 'JetsonHacks llama.cpp bench'
    },
    {
      id: 'qwen30a3-gb10', group: '① DGX Spark / GB10', source: 'm',
      name: 'Qwen3 Coder 30B A3B Q8_0', hw: 'DGX Spark',
      prefill: 2933.39, decode: 59.95,
      note: '30B 總參數、每 token 僅啟用 3B（A3B）。即使用 Q8，也比同平台的 27–32B dense Q4（約 11 tok/s）快 5 倍以上。',
      url: 'https://jetsonhacks.com/wp-content/uploads/2025/10/spark-llamacpp-bench.html',
      sourceName: 'JetsonHacks llama.cpp bench'
    },
    {
      id: 'glm-air-gb10', group: '① DGX Spark / GB10', source: 'm',
      name: 'GLM 4.5 Air Q4_K (67.9 GiB)', hw: 'DGX Spark',
      prefill: 841.44, decode: 22.59,
      note: '塞進 128GB 統一記憶體的大模型，速度仍有 22.59 tok/s。',
      url: 'https://jetsonhacks.com/wp-content/uploads/2025/10/spark-llamacpp-bench.html',
      sourceName: 'JetsonHacks llama.cpp bench'
    },
    {
      id: 'gemma4-gb10', group: '① DGX Spark / GB10', source: 'm',
      name: 'Gemma 3 4B Q4_0', hw: 'DGX Spark',
      prefill: 5694.21, decode: 79.83,
      note: 'GB10 的 prefill 上限展示：小模型可達 5,694 tok/s，算力其實很足，瓶頸在頻寬。',
      url: 'https://jetsonhacks.com/wp-content/uploads/2025/10/spark-llamacpp-bench.html',
      sourceName: 'JetsonHacks llama.cpp bench'
    },

    /* ② 桌上型 GPU —— 同一顆 27B 換平台的對照 */
    {
      id: 'q36-5090', group: '② 桌上型 GPU', source: 'm', prefillEstimated: true,
      name: 'Qwen3.6-27B Q4_K_M（無 MTP）', hw: 'RTX 5090',
      prefill: 2000, decode: 76.91,
      note: '27B dense Q4 在 5090 上的 llama.cpp 基準值 76.91 tok/s，約為同尺寸模型在 GB10 上的 6.8 倍（1792 GB/s vs 273 GB/s 頻寬差距）。prefill 為推估。',
      url: 'https://note.com/zephel01/n/ne5f86c7f16c8', sourceName: 'DFlash vs llama.cpp 實測'
    },
    {
      id: 'q36-5090-mtp', group: '② 桌上型 GPU', source: 'm', prefillEstimated: true,
      name: 'Qwen3.6-27B Q4_K_M + MTP', hw: 'RTX 5090',
      prefill: 2000, decode: 122.28,
      note: '開啟推測解碼後 122.28 tok/s（接受長度 5.22，加速 1.59×）。對照官方宣稱的「超過 90 tok/s」，此實測更高。prefill 為推估（MTP 不加速 prefill）。',
      url: 'https://note.com/zephel01/n/ne5f86c7f16c8', sourceName: 'DFlash vs llama.cpp 實測'
    },
    {
      id: 'q36-6000-mtp', group: '② 桌上型 GPU', source: 'r', prefillEstimated: true,
      name: 'Qwen3.6-27B + MTP', hw: 'RTX 6000 (官方)',
      prefill: 2500, decode: 160,
      note: '官方公布數據：27B MTP 達 160 tok/s、35B-A3B 達 240 tok/s。MTP 官稱可帶來 1.4–2.2× 加速。',
      url: 'https://unsloth.ai/docs/models/qwen3.6', sourceName: 'Unsloth Qwen3.6 文件'
    },
    {
      id: 'l8b-5090', group: '② 桌上型 GPU', source: 'r', prefillEstimated: true,
      name: 'Llama 3.1 8B Q4_K_M', hw: 'RTX 5090',
      prefill: 4500, decode: 178,
      note: '小模型在 5090 上的單串流速度。各家測值差異大（42–178 tok/s），取決於推論框架與設定。',
      url: 'https://insiderllm.com/guides/rtx-5090-local-ai-benchmarks/', sourceName: 'RTX 5090 benchmarks'
    },

    /* ③ Apple Silicon */
    {
      id: 'l8b-m4max', group: '③ Apple Silicon', source: 'r', prefillEstimated: true,
      name: 'Llama 3.1 8B Q4_K_M', hw: 'M4 Max',
      prefill: 450, decode: 51.2,
      note: 'M4 Max 統一記憶體約 400–546 GB/s，介於 GB10 與桌機獨顯之間。',
      url: 'https://markaicode.com/benchmarks/llamacpp-m4-max-benchmark/', sourceName: 'M4 Max llama.cpp bench'
    },
    {
      id: 'l70b-m4max', group: '③ Apple Silicon', source: 'r', prefillEstimated: true,
      name: 'Llama 3.1 70B Q4_K_M', hw: 'M4 Max',
      prefill: 90, decode: 12.5,
      note: '70B Q4 約 42GB，在 400 GB/s 頻寬下理論上限約 9.5–13 tok/s。與 GB10 上的 dense 大模型體感相近。',
      url: 'https://markaicode.com/benchmarks/llamacpp-m4-max-benchmark/', sourceName: 'M4 Max llama.cpp bench'
    },
    {
      id: 'q30-m4max', group: '③ Apple Silicon', source: 'r', prefillEstimated: true,
      name: 'Qwen3 30B-A3B (MLX)', hw: 'M4 Max',
      prefill: 600, decode: 100,
      note: 'MoE + MLX 後端可破 100 tok/s；同機 llama.cpp 後端約 43 tok/s，框架選擇影響巨大。',
      url: 'https://modelpiper.com/blog/local-llm-benchmarks-apple-silicon', sourceName: 'Apple Silicon LLM benchmarks'
    },

    /* ④ 雲端 API 與極端值 */
    {
      id: 'cloud-reason', group: '④ 雲端 API 與極端值', source: 'r', prefillEstimated: true,
      name: '雲端旗艦推理模型（中位數）', hw: '服務商叢集',
      prefill: 8000, decode: 74,
      note: 'Artificial Analysis 同級推理模型輸出速度中位數約 73.7–74.9 tok/s（GPT-5.5 high 為 73.9）。這就是使用者已經習慣的速度基準線。',
      url: 'https://artificialanalysis.ai/models', sourceName: 'Artificial Analysis'
    },
    {
      id: 'cloud-fast', group: '④ 雲端 API 與極端值', source: 'r', prefillEstimated: true,
      name: '最快雲端模型（擴散式 Mercury 2）', hw: '服務商叢集',
      prefill: 20000, decode: 939,
      note: '目前榜首約 939 tok/s，第二名 HyperNova 60B 約 436 tok/s。用來當「速度天花板」的對照。',
      url: 'https://artificialanalysis.ai/models', sourceName: 'Artificial Analysis'
    },
    {
      id: '8b-cpu', group: '④ 雲端 API 與極端值', source: 'r', prefillEstimated: true,
      name: '8B Q4（純 CPU DDR5）', hw: '無 GPU',
      prefill: 60, decode: 6,
      note: '另一端的極端值：完全沒有 GPU 時的體感，用來標出速度地板。'
    }
  ]
};
