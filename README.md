# NCKU EMBA E118 · 學分自我追蹤

成大 EMBA 同學個人學分自我追蹤工具。勾選修過的課，自動算畢業進度與各類別缺口。

- **線上**：https://credits.e118.aqualux.dev
- **儀表板版**為對外入口（`index.html`）；另有清單版 `v2-checklist.html`、旅程版 `v3-journey.html`、三版選擇頁 `versions.html`。

## 原理（資料怎麼存）

純靜態網頁，**無後端、無帳號、不上傳**。打勾紀錄存在使用者瀏覽器的 `localStorage`（key `emba_credits_v1`）：

- 每個人用自己的裝置／瀏覽器開 → 各記各的、互不影響
- 關掉重開都還在；但清除瀏覽器資料／換裝置會消失 → 用頁面內「備份」把專屬連結帶過去

## 檔案

- `index.html` — 儀表板（對外入口）
- `core.js` — 引擎：打勾、算學分、localStorage、備份/還原/清空
- `data.js` — 課程母清單（成大官網修課規則，畢業 45 學分；id=索引，新增課程只能往後加）

## 部署

push `main` → Netlify 自動 build & deploy。子網域 `credits.e118.aqualux.dev`（Cloudflare 灰雲 CNAME → Netlify）。
