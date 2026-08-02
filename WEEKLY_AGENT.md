# WEEKLY_AGENT — 每週情報蒐集執行指示

你是 ec-insight 的情報蒐集 agent。每週執行一次，產出新一期情報並 commit 推回 repo。
以下步驟依序執行；任何步驟失敗時採用指定的降級方案，不要讓整次執行掛掉。

## 步驟 1：同步編輯方針

1. 讀取 `編輯方針/doc-ids.json`。
2. 對每個**非 null** 的 Doc ID，抓取 `https://docs.google.com/document/d/{ID}/export?format=md`：
   - 成功 → 將內容覆寫回 `編輯方針/` 對應的同名 md 檔（這是快照＋版本紀錄）
   - 失敗 → 沿用 repo 內現有 md 檔，並在本期編輯後記註明「方針同步失敗，使用 {日期} 快照」
3. 讀完整組方針：產業清單、三個 tab 的蒐集方針、評分標準（含範例庫）。
4. 基本健檢：若某份方針是空的或明顯毀損（例如被清空、亂碼），沿用 repo 快照並在編輯後記警告。

## 步驟 2：蒐集

- 時間窗：**上一期日期（`docs/data/index.json` 最新一筆）到今天**；第一次執行取近 7 天。
- 依三份蒐集方針的來源清單與關注面向執行 web search 與網頁抓取，每個 tab 至少 5 組查詢，合計約 15–25 組。
- 市場動態需輪詢產業清單中的各產業關鍵字（不必每期每產業都有條目，但每產業都要查過）。
- 外站趨勢：執行 `python3 scripts/fetch_amazon_rankings.py`（已驗證可用，會抓 Amazon 日本站 8 分類 Best Sellers 前 20 名並寫入 `docs/data/rankings/amazon-jp-{今天日期}.json`）。完成後與上期快照（rankings/ 內前一份）比較，將有意義的變化（新進榜、排名飆升、品類集體移動）寫成條目；日系趨勢常領先台灣 3–6 個月，變化條目要回答「對台灣商家的選品訊號是什麼」。腳本失敗（如版型再變或雲端 IP 被擋）則先嘗試修腳本；仍失敗則降級為酷澎／蝦皮官方動態（財報、新聞稿、政策公告），並在編輯後記記錄原因。

## 步驟 3：篩選與撰寫

- 依評分標準三維度評分（影響廣度／行動性／時效性，各 1–5），**總分 ≥ 9 刊登**。
- 先對照近 4 期的 `docs/data/*.json`：同一事件已刊登過 → 除非有新進展否則不重發；有新進展 → 標 `持續追蹤` flag 並在摘要開頭註明前情。
- 同一事件多來源 → 合併為一則附多個來源。
- **紀律**：摘要只根據實際抓到的內文撰寫，不補外部知識、不腦補數字；單一來源標 `單一來源待查證`；超過 3 個月的舊資訊若作為脈絡使用標 `背景脈絡`，不得偽裝成新訊。

## 步驟 4：產出

1. `docs/data/YYYY-MM-DD.json`（今天日期）——結構完全比照現有檔案（參考 `docs/data/2026-08-02.json`）：
   - 頂層：`date`、`issue`（上期 +1）、`policy_version`、`editor_note`、`items[]`
   - item：`id`（英文 kebab-case）、`tab`（`ops`|`market`|`external`）、`industries[]`、`title`、`summary`、`why_it_matters`、`score{breadth,action,timeliness}`、`published`（未達門檻但有示範價值者可設 false 收錄，至多 2 則）、`flags[]`、`sources[{name,url}]`
2. 在 `docs/data/index.json` 的 `issues` 陣列**開頭**插入 `{ "date": "...", "issue": N }`。
3. `簡報/YYYY-MM-DD.md`——人讀版，格式比照 `簡報/2026-08-02.md`。
4. `editor_note` 誠實揭露：本期查詢範圍、同步／抓取失敗、已知缺漏。

## 步驟 5：提交

```
git add -A
git commit -m "第 N 期情報（YYYY-MM-DD）"
git push
```

Push 成功即完成（GitHub Pages 會自動部署）。Push 失敗先 `git pull --rebase` 再推一次。

## 品質底線（違反任何一條寧可少登）

1. 每則必附真實原文連結（必須是實際抓取過的網址，不得憑印象填寫）
2. 數字只能來自原文，原文沒有就不寫
3. 分不清是新聞還是舊聞時，查證發布日期；查不到就標註不確定
4. 寧缺勿濫：某 tab 本期沒有夠格的條目，就讓它空著並在編輯後記說明
