# 拾字 Word Garden

拾字是一款以每日任務為核心的英文單字本。首頁會引導使用者完成到期複習、收集新字與每日閱讀；系統依「非常困難／困難／尚可／簡單」安排下次複習，並說明每張卡今天出現的原因。每日閱讀支援點字看中文、一鍵收藏生字與原句，以及在文章內展開整篇中文翻譯。

## 線上版

此專案可由 Render 部署，並以 Supabase 保存單字、複習紀錄、設定與每日閱讀。資料不依賴家中電腦，因此電腦關機後仍能使用。開啟網址即可直接進入共用單字本；Supabase 的管理金鑰只放在 Render 的私密環境變數，不會送到瀏覽器。

1. 在 Supabase SQL Editor 執行 `supabase/schema.sql`。
2. 在 Render 以本專案的 `render.yaml` 建立 Blueprint。
3. 設定 `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY`。
4. 等待健康檢查 `/health` 通過後開啟 Render 網址。

Render 免費服務閒置後可能需要短時間喚醒。Supabase 免費方案也有其用量與閒置政策，請以兩個服務當下顯示的方案內容為準。

## 本機版

在上層資料夾雙擊「開啟拾字新版.bat」，或在此目錄執行 `npm start`，再開啟 `http://127.0.0.1:8788/app/?v=cloud-20260929a`。需要 Node.js 22.13 以上；首次執行先使用 `npm install`。

本機資料保存在 `%LOCALAPPDATA%/WordGarden/data`。本機服務只監聽這台電腦；雲端環境則改用 Supabase。兩種模式都可匯出與合併匯入備份。

## 字典與文章來源

預設字典為 ECDICT 與 OpenCC，授權見 `ECDICT-LICENSE.txt`、`OPENCC-JS-LICENSE.txt`。若設定 Merriam-Webster Learner’s API，會優先使用官方簡明義項與 IPA。每日閱讀取自 NASA 官方 RSS；顯示的是來源摘要及原文連結。文章中文優先使用使用者設定的 DeepL，未設定時使用 Google 翻譯。

瀏覽器朗讀使用裝置的系統語音。尚未包含 AI 故事、例句批改、自動五字推薦、閱讀理解題生成、完整字根分析與固定時間提醒。

## 驗證

執行 `npm test` 與 `node integration-test.js`。測試涵蓋間隔複習、分類連動、單字合併、備份、匯入、刪除還原、API 保護與離線查字。
