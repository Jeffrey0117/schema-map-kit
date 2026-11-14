# schema-map-kit

把資料庫現況變成工程師看得懂的地圖。零依賴、不用安裝。

```
lessons
- id: uuid  (PK)
- course_id: uuid  (-> courses.id)
- title: string
- order_index: int
- video_url?: string
- is_free_preview?: boolean
```

三樣產出:

| 檔案 | 怎麼來的 | 用途 |
|---|---|---|
| `docs/schema/all-tables.txt` | `outline` 從資料庫自動產生 | 全部的表,永遠跟現況一致 |
| `docs/schema/core-map.txt` | 手寫(`probe` 幫你起頭) | 主幹的十幾二十張表:json 裡的 key、狀態值、判斷邏輯在哪、坑 |
| `docs/schema/schema.html` | `page` 把上面兩份包起來 | 一頁可搜尋的網頁,關聯可以點 |

資料庫來源:**Supabase / PostgREST**,或 **SQLite 檔**。

另外附一份 [資料設計守則](DESIGN-RULES.md):八條,每條都是從一個真的在營運的系統學到的。

## 用法

```bash
# Supabase:從環境變數或 ./.env 讀 NEXT_PUBLIC_SUPABASE_URL(或 SUPABASE_URL)與 SUPABASE_SERVICE_ROLE_KEY
npx -y github:Jeffrey0117/schema-map-kit outline --title "My App"

# SQLite(需要 Node 22.5 以上)
npx -y github:Jeffrey0117/schema-map-kit outline --db data/app.db --title "My App"

# 抽樣幾張主幹表:json 欄位裡的 key、狀態欄位出現過的值(唯讀,只印到畫面)
npx -y github:Jeffrey0117/schema-map-kit probe users orders products

# 放一份核心地圖的空白範本(已存在就不動)
npx -y github:Jeffrey0117/schema-map-kit init

# 包成網頁
npx -y github:Jeffrey0117/schema-map-kit page --title "My App 資料地圖"
```

收進專案的 `package.json`(不加依賴,不動 lockfile):

```json
{
  "scripts": {
    "schema:outline": "npx -y github:Jeffrey0117/schema-map-kit outline --title \"My App\" --regen \"npm run schema:outline\"",
    "schema:page": "npx -y github:Jeffrey0117/schema-map-kit page --title \"My App 資料地圖\""
  }
}
```

### 選項

| 選項 | 說明 |
|---|---|
| `--db <檔案>` | 讀 SQLite 檔。沒給就讀 Supabase / PostgREST |
| `--env <檔案>` | `.env` 的位置(預設 `./.env`)。行程的環境變數優先 |
| `--url-var <名稱>` | 資料庫網址的變數名 |
| `--key-var <名稱>` | 金鑰的變數名(預設 `SUPABASE_SERVICE_ROLE_KEY`) |
| `--dir <資料夾>` | 地圖檔放哪(預設 `docs/schema`) |
| `--title <標題>` | 清單檔頭與網頁的標題 |
| `--regen <指令>` | 寫在清單檔頭的「重新產生」指令 |
| `--limit <筆數>` | `probe` 每張表抽樣幾筆(預設 400,上限 5000) |

找不到網址或金鑰會直接報錯,不會退回任何預設值。資料庫回報 0 張表時不會覆寫既有的清單。

## probe 會給你什麼

```
tenants   # 20 筆
- id: uuid  (PK)
- slug: string
- plan_tier?: string   { free | pro }
- enabled_features?: json
    business_type, home_style
```

這是寫核心地圖最花工的一步:資料庫的結構只會告訴你「這欄是 json」,不會告訴你裡面有什麼。
`probe` 抽樣實際的資料,列出 json 欄位裡出現過的 key,以及 `status` / `type` / `role` 這類欄位出現過的值。

- 只讀,不寫任何東西到資料庫。
- 只印 key 名與短的列舉值(12 種以內、每個 32 字以內),不印整筆資料。
- 抽樣不是全部:看到的值不保證是所有合法值,地圖上要註明。

## 核心地圖的寫法

```
==================================================
一、分站
==================================================

tenants                                   # 一個分站 = /{slug}
- id: uuid  (PK)
- owner_id: uuid  (-> profiles.id)
- plan_tier?: string                      { free | pro }
- enabled_features?: json
    business_type: courses | shop         # 缺省 = courses
- businessTypeOf()                        lib/business-type.ts
# 這張表容易搞錯的地方寫在這裡。
```

- 兩條 `=====` 中間那一行是領域標題。
- 頂格、小寫的一行是表名,後面可接 `#` 一句話說明。
- `- 欄位?: 型別`,後面可接 `(PK)`、`(-> 表.欄位)`、`{ 值 | 值 }`、`# 說明`。
- 欄位底下縮排的行是 json 裡的 key。
- `- 函式名()` 後面接檔案路徑:這件事的判斷寫在哪。
- 表底下頂格的 `#` 是提醒。

完整範例:[`examples/course-platform/core-map.txt`](examples/course-platform/core-map.txt)
(一個多租戶線上課程平台,保留了它長到現在的毛病,對照守則看)。

## 當函式庫用

```js
const kit = require('schema-map-kit');

const tables = await kit.readTables({ sqlite: 'data/app.db' });
// 或 kit.readTables({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY })

const all = kit.renderOutline(tables, { title: 'My App' });           // 清單文字
const probe = await kit.probeTables({ sqlite: 'data/app.db' }, ['users']); // 抽樣結果文字
const html = kit.buildPage({ all, core: coreMapText, title: 'My App' });   // 網頁 HTML
const sections = kit.parseMap(coreMapText);                            // 地圖文字 → 結構
```

`readTables` 回傳的格式(兩種來源一樣):

```js
[{ name: 'lessons', columns: [{ name, type, optional, pk, fk: { table, column } | null }] }]
```

連線資訊一律由呼叫的人傳入,函式庫自己不讀環境變數。

## 跑範例與測試

```bash
node example.js   # 用示範的結構建一個暫存 SQLite,走完整條流程,網頁寫在系統暫存資料夾
npm test          # node 內建的 test runner
```

## 限制

- SQLite 來源需要 Node 22.5 以上(內建的 `node:sqlite`)。Supabase 來源 Node 18 以上即可。
- PostgREST 只回報對外公開的 schema;view 也會被列出來。
- `schema.html` 裡包了完整的資料表結構,私有專案不要把它放到公開的地方。

## License

MIT © Jeffrey0117
