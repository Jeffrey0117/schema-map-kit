'use strict';

const { postgresTypeName } = require('./format');

const FK_PATTERN = /<fk table='([^']+)' column='([^']+)'\/>/;

function authHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function restBase(url) {
  return `${String(url).replace(/\/+$/, '')}/rest/v1`;
}

/** PostgREST OpenAPI 的一個欄位定義 → 正規化欄位 */
function normalizeColumn(name, column, required) {
  const format = column.format || column.type || 'unknown';
  const isArray = column.type === 'array' || format.endsWith('[]');
  const baseFormat = isArray ? format.replace(/\[\]$/, '') : format;
  const base = Array.isArray(column.enum) ? column.enum.join(' | ') : postgresTypeName(baseFormat);
  const description = column.description || '';
  const fk = FK_PATTERN.exec(description);
  return {
    name,
    type: isArray ? `${base}[]` : base,
    rawType: baseFormat,
    optional: !required.includes(name),
    pk: description.includes('<pk/>'),
    fk: fk ? { table: fk[1], column: fk[2] } : null,
  };
}

/** OpenAPI 的 definitions → 正規化資料表 */
function tablesFromOpenApi(spec) {
  const definitions = (spec && spec.definitions) || {};
  return Object.keys(definitions).map((name) => {
    const definition = definitions[name];
    const required = definition.required || [];
    const columns = Object.entries(definition.properties || {}).map(([column, value]) =>
      normalizeColumn(column, value, required)
    );
    return { name, columns };
  });
}

/**
 * 讀 Supabase / PostgREST 自己回報的結構。只讀結構,不讀資料。
 * @param {{ url: string, key: string, fetch?: Function }} opts
 */
async function readPostgrestTables(opts) {
  const { url, key } = opts;
  if (!url || !key) throw new Error('readPostgrestTables 需要 url 與 key');
  const doFetch = opts.fetch || fetch;
  const response = await doFetch(`${restBase(url)}/`, {
    headers: { ...authHeaders(key), Accept: 'application/openapi+json' },
  });
  if (!response.ok) throw new Error(`讀不到資料庫結構(HTTP ${response.status})`);
  return tablesFromOpenApi(await response.json());
}

/**
 * 抽樣一張表的資料(唯讀)。回傳 { rows, total }。
 * @param {{ url: string, key: string, table: string, limit?: number, fetch?: Function }} opts
 */
async function samplePostgrestRows(opts) {
  const { url, key, table } = opts;
  const limit = opts.limit || 400;
  const doFetch = opts.fetch || fetch;
  const response = await doFetch(`${restBase(url)}/${encodeURIComponent(table)}?select=*&limit=${limit}`, {
    headers: { ...authHeaders(key), Prefer: 'count=exact' },
  });
  if (!response.ok) throw new Error(`讀不到 ${table}(HTTP ${response.status})`);
  const range = response.headers.get('content-range') || '';
  const total = range.includes('/') ? range.split('/')[1] : '?';
  return { rows: await response.json(), total };
}

module.exports = { tablesFromOpenApi, readPostgrestTables, samplePostgrestRows };
