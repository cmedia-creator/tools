// Imports a JSON export made by scripts/sheet-export.browser.js and rewrites data/catalog.json.
// Usage: npm run import -- <export.json>   (keep the export outside the repository; it contains internal columns)
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {DICTIONARY_TABS} from './catalog-schema.mjs';
import {writeCatalog} from './sync-sheet.mjs';

const NAMES=[...DICTIONARY_TABS,'SEARCH_RULES','AFFILIATE_LINKS','PILOT02_SETTINGS'];
// The HTML view shows display text. Restore the cell types the Sheets API returns for dictionary
// tabs (TRUE/FALSE checkboxes and plain numbers); every other value stays text.
const typed=value=>value==='TRUE'?true:value==='FALSE'?false:/^-?\d+(\.\d+)?$/.test(value)?Number(value):value;

export function matrixFromExport(data) {
  if(data?.format!=='toreca-sheet-export-v1')throw new Error('Not a toreca sheet export');
  const matrix={};
  for(const name of NAMES) {
    const rows=data.matrix?.[name];
    if(!Array.isArray(rows)||!rows.length||!rows.every(r=>Array.isArray(r)&&r.every(c=>typeof c==='string')))throw new Error('Export is missing '+name);
    matrix[name]=DICTIONARY_TABS.includes(name)?[rows[0],...rows.slice(1).map(r=>r.map(typed))]:rows;
  }
  return matrix;
}

async function main(file) {
  if(!file)throw new Error('Usage: npm run import -- <export.json>');
  const data=JSON.parse((await readFile(file,'utf8')).replace(/^﻿/,''));
  console.log('Export:',data.title,data.exportedAt);
  await writeCatalog(matrixFromExport(data));
}
if(process.argv[1]===fileURLToPath(import.meta.url))main(process.argv[2]).catch(error=>{console.error(error.message);process.exitCode=1;});
