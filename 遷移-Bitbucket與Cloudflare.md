# 遷移計畫：GitHub → Bitbucket（＋ Cloudflare Pages 託管）

狀態：**尚未執行，僅評估與待辦紀錄**。最後更新：2026-08-04

## 為什麼

公司標準化在 Atlassian，為避免後續風險，要把本專案的 repo 從 GitHub 統一到 **Bitbucket**。網站託管改用 **Cloudflare Pages**（Bitbucket 原生 Pages 只能從 repo 根目錄出站、一 workspace 一站；Cloudflare Pages 可指定 `/docs` 目錄、無數量限制，我們的目錄結構不用改）。

## 目標架構

```
編輯方針/  顧問改（Bitbucket 網頁編輯 / 請 AI 改）
   ↓
Bitbucket repo（程式碼＋內容，唯一來源）
   ↓ 每次 push 觸發
Cloudflare Pages 監聽 Bitbucket → 自動部署
   ↓
網站上線（xxx.pages.dev，或接自訂網域）
```

Cloudflare Pages 設定：Framework preset = **None**、Build command = **留空**、Build output directory = **`docs`**、Production branch = **main**。接法是 Cloudflare Pages 後台「Connect to Git」→ 授權 Bitbucket（OAuth）→ 選 repo。之後 push 到 main 即自動部署，與現在 GitHub Pages 的自動部署等價。

## 費用（結論：增量 $0）

| 項目 | 免費額度 | 對我們 |
|------|---------|--------|
| Bitbucket Cloud | 5 人以下、無限私有 repo、50 分鐘 Pipelines/月 | 公司既有 Atlassian 方案應已涵蓋，$0 |
| Cloudflare Pages | 無限流量、無限請求、500 build/月、自訂網域免費 | 遠用不完，$0、**免綁卡** |
| 自訂網域（選配） | — | 域名本身約 US$10/年，與 Cloudflare 無關 |

**釐清一個容易混淆的點**：先前試 Cloudflare 放棄，是因為「登入才能看」的 **Cloudflare Access／Zero Trust 門禁要綁卡**。那跟託管是兩回事：

- Cloudflare Pages 託管公開網站 = 免費、**免綁卡** ✅
- Cloudflare Access／Zero Trust（把站鎖起來只給公司信箱看）= 50 人以下免費，但**啟用時帳戶要掛卡**（即使帳單 $0）

我們的網站是公開的、Google 登入只做個人化（收藏、回饋）不做門禁，**用不到 Zero Trust，不會綁卡**。

## 兩個要順帶知道的點

1. **部署不吃 Bitbucket Pipelines 分鐘數**：Cloudflare 直接拉 repo 部署，不經 Bitbucket CI。所以「免費只有 50 分鐘 build」對「網站託管」完全沒影響——那額度只有在之後要用 Pipelines 跑 agent 時才會用到。
2. **每週自動化仍是未解點**：搬到 Bitbucket 後，Claude Code 的雲端排程（綁 GitHub App）不能用了。屆時選項：用 Bitbucket Pipelines 跑 agent（吃那 50 分鐘／公司方案），或在別處排程再推回。與託管無關，但屬「全面轉 Bitbucket」的完整圖。

## 真正遷移時的切換清單（一次性）

搬家當下要改幾處硬寫網址，否則登入與電子報會壞：

- [ ] 建 Bitbucket repo，把現有 repo 完整 push 過去（含 git 歷史）
- [ ] Cloudflare Pages 連 Bitbucket repo，設定 output = `docs`，部署取得 `xxx.pages.dev`
- [ ] **Google Cloud Console → OAuth 用戶端**：已授權的 JavaScript 來源改成新網址（`https://xxx.pages.dev` 或自訂網域）
- [ ] **Apps Script `backend-appsscript.gs`**：`SITE_URL` 常數改成新網址；重新部署（管理部署作業 → 新版本）
- [ ] 專案內文件的網址引用（README、流程說明、編輯方針 README、顧問待辦）從 `msstrategytw-pixel.github.io/ec-insight/` 改為新網址
- [ ] 關掉舊的 GitHub Pages、視情況封存 GitHub repo
- [ ] 若之前 Cloudflare 上還留著舊的 `ec-insight` Pages 專案，先確認/清掉避免混淆

## 現況參考（遷移前）

- repo：GitHub `msstrategytw-pixel/ec-insight`（public）
- 網站：GitHub Pages `https://msstrategytw-pixel.github.io/ec-insight/`（main 分支 `/docs`）
- 後端：Google Apps Script（回饋／收藏／訂閱／電子報），Sheet ID 見 `docs/data/config.json`
- Google OAuth client id 見 `docs/data/config.json`
