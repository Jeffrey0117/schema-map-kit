'use strict';

/**
 * 把「正規化後的資料表」寫成純文字清單。
 *
 * 正規化格式(兩種資料庫來源都轉成這個):
 *   [{ name, columns: [{ name, type, optional, pk, fk: { table, column } | null }] }]
 */

const POSTGRES_TYPES = Object.freeze({
  'character varying': 'string',
  character: 'string',
  text: 'string',
  uuid: 'uuid',
  boolean: 'boolean',
  integer: 'int',
  bigint: 'int',
  smallint: 'int',
  numeric: 'number',
  'double precision': 'number',
  real: 'number',
  jsonb: 'json',
  json: 'json',
  'timestamp with time zone': 'datetime',
  'timestamp without time zone': 'datetime',
  date: 'date',
});

const SQLITE_TYPES = Object.freeze([
  [/^(tiny|small|medium|big)?int(eger)?$/, 'int'],
  [/^(var)?char|^n(var)?char|^text$|^clob$|^string$/, 'string'],
  [/^(real|float|double|numeric|decimal)/, 'number'],
  [/^bool(ean)?$/, 'boolean'],
  [/^(datetime|timestamp)/, 'datetime'],
  [/^date$/, 'date'],
  [/^jsonb?$/, 'json'],
  [/^blob$/, 'blob'],
  [/^uuid$/, 'uuid'],
]);

/** PostgREST 回報的型別 → 好讀的名字;不認得的原樣回傳 */
function postgresTypeName(format) {
  return POSTGRES_TYPES[format] || format;
}

/** SQLite 宣告的型別(例 VARCHAR(255))→ 好讀的名字;沒宣告回 any */
function sqliteTypeName(declared) {
  const base = String(declared || '').trim().toLowerCase().replace(/\s*\(.*\)$/, '');
  if (!base) return 'any';
  const hit = SQLITE_TYPES.find(([pattern]) => pattern.test(base));
  return hit ? hit[1] : base;
}

function columnLine(column) {
  const notes = [
    column.pk ? 'PK' : null,
    column.fk ? `-> ${column.fk.table}.${column.fk.column}` : null,
  ].filter(Boolean);
  const optional = column.optional ? '?' : '';
  const suffix = notes.length > 0 ? `  (${notes.join(', ')})` : '';
  return `- ${column.name}${optional}: ${column.type}${suffix}`;
}

function tableBlock(table) {
  return [table.name, ...table.columns.map(columnLine)].join('\n');
}

function countColumns(tables) {
  return tables.reduce((sum, table) => sum + table.columns.length, 0);
}

/**
 * 整份清單的文字。
 * @param {Array} tables 正規化後的資料表
 * @param {{ title?: string, regen?: string }} [opts]
 */
function renderOutline(tables, opts = {}) {
  const title = opts.title ? `${opts.title} ` : '';
  const regen = opts.regen || 'npx github:Jeffrey0117/schema-map-kit outline';
  const header = [
    `# ${title}資料表總覽(自動產生,不要手改)`,
    `# 重新產生:${regen}`,
    '# 讀法:名稱後面有 ? = 可以是空的;(PK) = 主鍵;(-> 表.欄位) = 指向另一張表',
    '# json 欄位裡面有哪些 key 這裡看不到,主幹表的請看 core-map.txt',
  ].join('\n');
  const sorted = [...tables].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return `${header}\n\n${sorted.map(tableBlock).join('\n\n')}\n`;
}

module.exports = { postgresTypeName, sqliteTypeName, columnLine, tableBlock, countColumns, renderOutline };
