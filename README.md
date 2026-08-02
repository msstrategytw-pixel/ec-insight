# ec-insight — 電商情報蒐集 Agent

自動蒐集並分析產業新知、電商經營趨勢與市場動態，彙整為每週情報，供顧問團隊快速掌握重點、評估影響、發想策略。

## 架構總覽

```
編輯方針/（顧問直接改 md，repo 即唯一來源）
   ↓ 每週一 07:00
排程雲端 agent（Claude Code routine，走訂閱額度，無 API 金鑰）
   讀方針 → 讀上期回饋 → 蒐集 → 評分 → 產出新一期 → commit push
   ↓
GitHub repo（存檔＋版本紀錄）
   ↓ 自動
GitHub Pages（情報網站，main 分支 /docs）
```

- 分工、執行流程、修改流程 → [流程說明.md](流程說明.md)
- Agent 每次執行的完整指示（runbook）→ [WEEKLY_AGENT.md](WEEKLY_AGENT.md)

## 目錄結構

```
ec-insight/
├── 流程說明.md        ← 分工與流程（流程有變動時更新這份）
├── WEEKLY_AGENT.md   ← 排程 agent 的執行指示（人也可讀，即 runbook）
├── 編輯方針/          ← agent 的「大腦設定」，顧問可改（見其 README）
│   ├── 產業清單.md
│   ├── 電商經營-蒐集方針.md
│   ├── 市場動態-蒐集方針.md
│   ├── 外站趨勢-蒐集方針.md
│   └── 評分標準.md
├── 簡報/              ← 每期產出（Markdown，給人讀＋當存檔）
└── docs/              ← 情報網站（零依賴靜態站，GitHub Pages 出站目錄）
    ├── index.html / styles.css / app.js
    └── data/          ← 網站讀的結構化資料，一期一個 JSON
        ├── index.json（期別索引）
        └── YYYY-MM-DD.json
```

## 本機預覽網站

```bash
python3 -m http.server 4173 --directory docs
```

開 http://localhost:4173 即可。新增一期＝寫入 `docs/data/YYYY-MM-DD.json` 並在 `index.json` 加一筆，網站本身不用改。

## 階段規劃

- [x] **第一階段**：方針文件 v0.1 ＋ 原型簡報（2026-08-02 第 1 期）
- [x] **第二階段**：三 tab 靜態網站、每週排程自動化
- [ ] **第三階段**：酷澎榜單追蹤、蝦皮資料實驗、顧問「有用／沒用」回饋機制、榜單歷史趨勢
- [ ] **之後**：電子報推播、AI 策略建議草稿（顧問修訂定稿）

## 原則

- 摘要只根據抓到的原文撰寫、必附連結，不腦補數字；單一來源標註待查證
- 篩選標準全部外置於「編輯方針」，顧問改文件即改行為，不需動程式
- 榜單資料重「變化」不重快照，必留歷史
