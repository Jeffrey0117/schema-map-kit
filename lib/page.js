'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseMap } = require('./parse-map');

const TEMPLATE_PATH = path.resolve(__dirname, '..', 'page.template.html');
const DATA_SLOT = '/*__DATA__*/';
const PARSER_SLOT = '/*__PARSER__*/';
const TITLE_SLOT = '__TITLE__';

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 放進 <script type="application/json"> 的資料。
 * JSON.stringify 不會跳脫小於符號,內容裡出現 script 結束標籤會把頁面切斷,所以一律換成 unicode 跳脫。
 */
function embedJson(data) {
  return JSON.stringify(data).split('<').join(String.fromCharCode(92) + 'u003c');
}

/**
 * 產生單頁網頁的 HTML。
 * @param {{ all: string, core?: string, title?: string, generatedAt?: string, template?: string }} opts
 *   all  全部資料表清單的文字(必填)
 *   core 核心地圖的文字(沒有就只出「全部資料表」一個分頁)
 */
function buildPage(opts) {
  if (!opts || typeof opts.all !== 'string' || !opts.all.trim()) {
    throw new Error('buildPage 需要 all(全部資料表清單的文字)');
  }
  const template = opts.template || fs.readFileSync(TEMPLATE_PATH, 'utf8');
  for (const slot of [DATA_SLOT, PARSER_SLOT, TITLE_SLOT]) {
    if (!template.includes(slot)) throw new Error(`網頁樣板缺少插入點 ${slot}`);
  }
  const title = opts.title || '資料地圖';
  const data = {
    title,
    core: typeof opts.core === 'string' && opts.core.trim() ? opts.core : null,
    all: opts.all,
    generatedAt: opts.generatedAt || new Date().toISOString().slice(0, 10),
  };
  return template
    .split(TITLE_SLOT).join(escapeHtml(title))
    .split(PARSER_SLOT).join(parseMap.toString())
    .split(DATA_SLOT).join(embedJson(data));
}

module.exports = { buildPage, embedJson, escapeHtml };
