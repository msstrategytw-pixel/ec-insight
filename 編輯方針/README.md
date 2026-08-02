# 編輯方針（Editorial Config）

這五份文件是整個情報蒐集 agent 的「大腦設定」。Agent 每週執行時會先讀取它們，再據此決定：去哪裡找資料、什麼算重要、怎麼寫摘要。

**改這些文件 = 調整 agent 的行為，不需要動任何程式碼、不用找工程。**

## 五份方針文件（點連結直接編輯）

| 文件 | 內容 | 誰會想改它 |
|------|------|-----------|
| [產業清單](https://docs.google.com/document/d/153R4XvwLDTdE5JzKoKJf-iMDhIOHx9jpN4AdRuL629g/edit) | 八大產業定義、關鍵字、各產業特別關注面向 | 顧問 |
| [電商經營-蒐集方針](https://docs.google.com/document/d/1dY5fkOP7qUAjsEysXw_pfoBgR-xDGkkliNXYYOMeIsY/edit) | 工具與方法 tab 的來源與選材標準 | 顧問 |
| [市場動態-蒐集方針](https://docs.google.com/document/d/1RJmBrUs-83s6eRyb2AZslvjewrab9F3Bk0AYUX_OdvY/edit) | 產業新知 tab 的來源與選材標準 | 顧問 |
| [外站趨勢-蒐集方針](https://docs.google.com/document/d/1cl_4FAdfVMquG7QyUxTd1Zx6fGdDH1xTUgTeGBvAP7s/edit) | Amazon JP 榜單、酷澎／蝦皮等外站資料目標 | 顧問＋工程 |
| [評分標準](https://docs.google.com/document/d/18ogvO_Y7qQk2Kd5Uy_f-hNgHyg5kawA1_SrIwzHRSf8/edit) | 刊登門檻、評分框架、**好壞範例庫** | 顧問 |

情報網站：https://msstrategytw-pixel.github.io/ec-insight/

## 修改守則

1. **用自然語言寫就好**。這些文件是給 AI 讀的，寫得像在跟一個新進同事交接即可，不需要任何特殊格式。
2. **改範例比改定義有效**。覺得 agent 選材不準時，優先去「評分標準」的範例庫加一筆「這篇不該選（原因）」或「這種要多選（原因）」，比修改抽象定義見效快。
3. **改完直接存檔就好**，下一次每週執行（每週一早上）就會生效，不需要通知任何人。
4. 每次修改請在文件最下方的「修改紀錄」加一行：日期、誰、改了什麼、為什麼。這讓之後對照「有用率」變化時知道是哪次修改造成的。

## 運作方式（給好奇的人）

Google Docs 是唯一的編輯入口；agent 每次執行會把五份文件匯出成 Markdown 快照存回 GitHub repo，留下「當週實際用了哪個版本」的紀錄。所以：

- **請只在 Google Docs 改**，repo 裡的 `.md` 檔會被下次執行覆寫
- `doc-ids.json` 是 agent 用來找到這五份文件的設定檔，放在 repo，不需要也不應該放進這個 Docs 資料夾
- 文件的分享權限請維持「知道連結的人可檢視」以上，否則 agent 讀不到（會自動改用上次的快照並在網站的編輯後記註明）

## 目前狀態

- 版本：v0.1 初版草稿（2026-08-02，由 AI 起草，待顧問團隊審閱修訂）
- 待確認事項：
  - [ ] 八大產業清單是否符合商家分佈（建議拉平台商家產業別 × GMV 佔比驗證）
  - [ ] 各產業「特別關注面向」由熟悉該產業的顧問補充
  - [ ] 評分門檻（目前暫定總分 ≥ 9）跑一週後檢討
