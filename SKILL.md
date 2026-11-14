---
name: schema-map-kit
description: 要了解或整理一個專案的資料表長相時用 — 「資料表有哪些」「把資料整理成地圖」「這個專案的資料設計 OK 嗎」「開新專案要設計資料表」。從 Supabase / SQLite 產出「表名 + 欄位: 型別」清單與可搜尋網頁,並附資料設計守則。
---

# schema-map-kit — 打法

**把資料庫現況變成工程師看得懂的地圖:一份自動產生的全表清單、一份手寫的主幹地圖、一頁可搜尋的網頁。**

## 何時觸發

- 使用者想看「這個專案的資料長什麼樣」、要規劃功能前先看資料表、接手一個不熟的專案。
- 要開新專案、或要加表加欄位 → 先讀 `DESIGN-RULES.md`(八條守則,每條都有實例)。
- 專案裡已經有 `docs/schema/`:資料庫結構變了就重跑;改了主幹表就改 `core-map.txt`。
- 不要自己寫腳本去讀 PostgREST 的 OpenAPI 或 `PRAGMA table_info` 來列表 — 這個 kit 就是做這件事的。

## 接線(照抄能跑)

不用安裝,不加依賴(不會動到 lockfile)。在專案的 `package.json`:

```json
{
  "scripts": {
    "schema:outline": "npx -y github:Jeffrey0117/schema-map-kit outline --title \"專案名\" --regen \"npm run schema:outline\"",
    "schema:page": "npx -y github:Jeffrey0117/schema-map-kit page --title \"專案名 資料地圖\""
  }
}
```

SQLite 的專案在 `outline` 後面加 `--db data/app.db`。Supabase 的專案什麼都不用加,
它會從環境變數或 `./.env` 讀 `NEXT_PUBLIC_SUPABASE_URL`(或 `SUPABASE_URL`)與 `SUPABASE_SERVICE_ROLE_KEY`。

第一次做地圖的順序:

1. `npm run schema:outline` → `docs/schema/all-tables.txt`(全部的表,自動產生)。
2. 從清單裡挑主幹的十幾二十張表。挑法:畫得出「誰開的 → 賣什麼 → 誰買了 → 錢怎麼走」這條線的那些。
3. `npx -y github:Jeffrey0117/schema-map-kit probe <表1> <表2> ...` → 每張表的欄位、json 裡的 key、狀態值。
4. `npx -y github:Jeffrey0117/schema-map-kit init` 放空白範本,把 probe 的輸出貼進去,
   **刪掉規劃時用不到的欄位**,按領域分組,每張表補一句「這是幹嘛的」。
5. `npm run schema:page` → `docs/schema/schema.html`。

## 模式

**核心地圖該放什麼(價值都在這份手寫的):**

- 每張表一句話說明。寫「這張表是幹嘛的」,不要寫「這是 X 表」。
- json 欄位底下列出 key、可能的值、缺省是什麼。這是資料庫自己說不出來的東西。
- `{ a | b }` 列實際出現過的值,並在檔頭註明「不保證是全部合法值」。
- `fn()` 行:這件事的判斷寫在哪支程式。目的是讓下一個人不要重寫一份。
- 表底下頂格的 `#` 提醒:坑、舊欄位、容易搞錯的地方、「這張表其實是空的」這種事實。
- 最後一區列出「沒放進來的」表,按功能一行一組,讓人知道去全表清單找。

**不要放的:** 時間戳、每張表都有的 `created_at`、純顯示用的欄位。整份超過 400 行就是放太多了。

**probe 之後要驗證的:** 地圖上寫的每一句「事實」(哪張表是空的、哪個欄位是舊的、哪個前綴代表什麼)
都要用資料查過。probe 只抽樣前幾百筆,看到的值不是全部。

**維護:** 全表清單不用維護,重跑就好。核心地圖是手寫的 — 在專案的 CLAUDE.md 寫一行
「改了主幹表的結構、或在 json 裡加了 key,要跟著改 `docs/schema/core-map.txt`」。

## 地雷

- **讀 SQLite 要 Node 22.5 以上**(用內建的 `node:sqlite`,會印一行 experimental 警告,正常)。
- **SQLite 的型別是宣告什麼就是什麼。** 沒宣告型別的欄位顯示 `any`;json 常被宣告成 TEXT,
  清單上只會看到 `string`,要靠 probe 才看得出裡面是 json。
- **PostgREST 只回報對外公開的 schema。** 清單上沒有的表,可能是不存在,也可能是放在別的 schema。
  要下「這張表不存在」的結論之前,直接對那張表發一次查詢確認(404 才是真的沒有)。
- **view 也會出現在清單裡**,而且每個欄位都是可空的。看到一張「表」全部欄位都帶 `?`、又沒有主鍵,多半是 view。
- **金鑰:** Supabase 要用 service role key 才看得到全部的表。它只從環境變數或 `.env` 讀,
  不要寫進 `package.json` 的指令裡,也不要用 `--key-var` 指到會被 commit 的檔案。
- **網頁裡包了完整的資料表結構。** 私有專案的 `schema.html` 不要放到公開的地方;
  要公開示範,照 `examples/course-platform/` 的做法另外寫一份改寫過的。
- **probe 只印 key 名與短的列舉值,不印整筆資料。** 但「狀態值」本身如果是敏感資訊
  (例如把人名當分類),它還是會印出來 — 貼到別處之前看一眼。
