'use strict';

/**
 * 從抽樣的資料裡整理出寫核心地圖需要的兩件事:
 *   - json 欄位裡出現過哪些 key
 *   - 狀態類欄位(status / type / role …)出現過哪些值
 * 只回報 key 名與短的列舉值,不回報整筆資料。
 */

const ENUM_HINT = /(^|_)(status|type|role|method|tier|provider|kind|mode|visibility|access|layout|interval|period|currency|category|state)$/;
const MAX_VALUES = 12;
const MAX_VALUE_LENGTH = 32;
const MAX_KEYS = 30;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** SQLite 的 json 是存成字串,先試著解開;解不開就當不是 json */
function asJson(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text.startsWith('{') && !text.startsWith('[')) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    return undefined;
  }
}

function jsonKeys(values) {
  const keys = new Set();
  let arrays = 0;
  for (const raw of values) {
    const value = asJson(raw);
    if (Array.isArray(value)) {
      arrays += 1;
      for (const item of value.slice(0, 5)) {
        if (isPlainObject(item)) Object.keys(item).forEach((key) => keys.add(key));
      }
    } else if (isPlainObject(value)) {
      Object.keys(value).forEach((key) => keys.add(key));
    }
  }
  return { keys: [...keys].slice(0, MAX_KEYS), isArray: arrays > 0 };
}

/** SQLite 常把 json 存在 TEXT 欄位:有值的那些全都解得開成物件或陣列,就當它是 json */
function holdsJsonText(column, values) {
  if (column.type !== 'string' && column.type !== 'any') return false;
  const present = values.filter((value) => value !== null && value !== undefined && value !== '');
  return present.length > 0 && present.every((value) => typeof asJson(value) === 'object' && asJson(value) !== null);
}

function enumValues(values) {
  const distinct = [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
  const printable = distinct.every((value) => String(value).length <= MAX_VALUE_LENGTH);
  if (distinct.length > MAX_VALUES || !printable) return { values: null, distinct: distinct.length };
  return { values: distinct.map(String), distinct: distinct.length };
}

/**
 * @param {{ name: string, columns: Array }} table 正規化後的資料表
 * @param {Array<object>} rows 抽樣到的資料
 * @returns {Array<{ name, type, optional, fk, keys?, isArray?, values?, distinct? }>}
 */
function summarizeRows(table, rows) {
  return table.columns.map((column) => {
    const values = rows.map((row) => row[column.name]);
    const base = { name: column.name, type: column.type, optional: column.optional, pk: column.pk, fk: column.fk };
    if (column.type === 'json' || column.type === 'json[]' || holdsJsonText(column, values)) {
      return { ...base, ...jsonKeys(values) };
    }
    if (ENUM_HINT.test(column.name) && column.type !== 'boolean') {
      return { ...base, ...enumValues(values) };
    }
    return base;
  });
}

/** 一張表的抽樣結果 → 可以直接貼進核心地圖改的文字 */
function renderProbe(table, summary, total) {
  const lines = summary.map((column) => {
    const optional = column.optional ? '?' : '';
    const notes = [column.pk ? 'PK' : null, column.fk ? `-> ${column.fk.table}.${column.fk.column}` : null].filter(Boolean);
    const head = `- ${column.name}${optional}: ${column.type}${notes.length > 0 ? `  (${notes.join(', ')})` : ''}`;
    if (column.keys) {
      const keys = column.keys.length > 0 ? `\n    ${column.keys.join(', ')}` : '';
      return `${head}${column.isArray ? '   # 陣列,每一項的 key:' : ''}${keys}`;
    }
    if (column.values) return `${head}   { ${column.values.join(' | ')} }`;
    if (column.distinct !== undefined) return `${head}   # ${column.distinct} 種值,太多不列`;
    return head;
  });
  return [`${table.name}   # ${total} 筆`, ...lines].join('\n');
}

module.exports = { summarizeRows, renderProbe };
