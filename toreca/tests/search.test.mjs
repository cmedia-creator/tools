import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {generate,sanitize,entryOptions,venueOptions} from '../engine.js';
import {linkIndex,searchLink} from '../links.js';
import {publicCatalog} from '../scripts/sync-sheet.mjs';
import {validateCatalog} from '../scripts/catalog-schema.mjs';
import {matrixFromExport} from '../scripts/import-sheet-export.mjs';
const catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
const cases=JSON.parse(await readFile(new URL('./fixtures.json',import.meta.url),'utf8'));
const normalize=q=>q.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ');
let pass=0,review=0;
for(const test of cases) {
  const result=generate(sanitize(test.user_input||{}),catalog.db);
  const all=Object.values(result.steps).flat();
  assert.equal(new Set(all.map(q=>normalize(q.query))).size,all.length,'No repeated query across steps: '+test.case_id);
  for(const step of [1,2,3]) {
    assert.ok(result.steps[step].length<={1:5,2:7,3:8}[step]);
    for(const q of result.steps[step]){assert.ok(q.query.split(/\s+/).length<=6);assert.equal(new URL(q.mercariUrl).searchParams.get('keyword'),q.query);}
  }
  if(test.pilot01_status==='REVIEW'){review++;continue;}
  for(const step of [1,2,3])for(const query of test['step'+step+'_expected']||[])assert.ok([1,2,3].filter(s=>s<=step).some(s=>result.steps[s].some(q=>normalize(q.query)===normalize(query))),test.case_id+' missing '+query);
  pass++;
}
assert.equal(pass,35);assert.equal(review,1);
assert.equal(Object.entries(catalog.db).filter(([k])=>k!=='rules').reduce((n,[k,rows])=>n+rows.length,0),275);
assert.equal(catalog.affiliateEnabled,false);assert.equal(catalog.affiliateLinks.length,0);
assert.equal(entryOptions(catalog.db.member).length,8);assert.ok(venueOptions(catalog.db).length);
const rows=Object.entries(catalog.db).filter(([k])=>k!=='rules').flatMap(([k,v])=>v);
assert.equal(rows.filter(r=>String(r.pilot01_use).toUpperCase()==='TRUE').length,248);
for(const row of rows)assert.deepEqual(Object.keys(row),['entry_key','canonical','alias','alias_kind','pilot01_use','priority','search_step']);
for(const filename of ['engine.js','app.js','index.html','data/catalog.json'])assert.ok(!/google\.script|SpreadsheetApp|FROZEN_B64|c\.media\.satoru/i.test(await readFile(new URL('../'+filename,import.meta.url),'utf8')),filename+' contains private or GAS data');
const matrix={};for(const key of ['group','member','release','store','type']){const cols=Object.keys(catalog.db[key][0]);matrix[key.toUpperCase()+'_DB']=[cols,...catalog.db[key].map(r=>cols.map(c=>r[c]))];}
matrix.SEARCH_RULES=[['part','count','json_chunk'],[1,1,JSON.stringify(catalog.db.rules)]];
matrix.PILOT02_SETTINGS=[['key','value'],['affiliate_enabled','FALSE']];
matrix.AFFILIATE_LINKS=[['normalized_query','affiliate_url','status']];
assert.equal(publicCatalog(matrix,catalog).updatedAt,catalog.updatedAt,'No timestamp churn');
// Browser export (display text only) converts back to the same public catalog.
const asText=rows=>rows.map(r=>r.map(c=>c===true?'TRUE':c===false?'FALSE':String(c??'')));
const exported={format:'toreca-sheet-export-v1',matrix:Object.fromEntries(Object.entries(matrix).map(([k,v])=>[k,asText(v)]))};
assert.equal(JSON.stringify(publicCatalog(matrixFromExport(exported),catalog)),JSON.stringify(catalog),'Browser export round-trips to the published catalog');
assert.throws(()=>matrixFromExport({format:'toreca-sheet-export-v1',matrix:{}}),/missing/);
matrix.GROUP_DB[1].push('not exported');assert.ok(!JSON.stringify(publicCatalog(matrix)).includes('not exported'));
// Public data whitelist: internal rule notes are dropped, and anything outside the whitelist fails validation.
assert.deepEqual(validateCatalog(catalog),[],'Published catalog matches the public whitelist');
matrix.SEARCH_RULES=[['part','count','json_chunk'],[1,1,JSON.stringify({steps:{internal:true},advisory_notes:{note:'人力リサーチへは送らない',codes:catalog.db.rules.advisory_notes.codes.map(c=>({...c,when:'internal',basis:'notes.md §2',action:'x',must_not:'y'}))}})]];
assert.deepEqual(publicCatalog(matrix,catalog).db.rules,catalog.db.rules,'Only advisory id/show are exported');
const leak=mutate=>{const copy=structuredClone(catalog);mutate(copy);return validateCatalog(copy).length>0;};
assert.ok(leak(c=>{c.db.rules.advisory_notes.codes[0].basis='x';}),'Extra advisory key is rejected');
assert.ok(leak(c=>{c.db.rules.steps={};}),'Extra rule section is rejected');
assert.ok(leak(c=>{c.db.member[0].note='x';}),'Extra dictionary column is rejected');
assert.ok(leak(c=>{c.internal=1;}),'Extra top-level key is rejected');
assert.ok(leak(c=>{c.db.store[0].alias='admin@example.com';}),'Email address is rejected');
assert.ok(leak(c=>{c.db.rules.advisory_notes.codes[0].show='research-notes.md を参照';}),'Internal document reference is rejected');
assert.ok(leak(c=>{c.affiliateLinks=[{query:'q',url:'u',status:'ACTIVE',source:'s',verifiedAt:'d',sha256:'h'}];}),'Links while disabled are rejected');
const query='BABYMONSTER ラミ DRIP トレカ';
const url='https://jp.mercari.com/search?keyword='+encodeURIComponent(query)+'&afid=123456';
const row={query,url,status:'ACTIVE',source:'mercari_official_link_only',verifiedAt:'2026-10-11T00:00:00Z',sha256:createHash('sha256').update(url).digest('hex')};
const make=affiliateLinks=>linkIndex({affiliateEnabled:true,affiliateLinks});
assert.equal(searchLink({query},await make([row])).url,url,'Preserve official URL byte-for-byte');
assert.equal(searchLink({query},await make([row])).pr,true);
assert.equal((await make([row,row])).size,0,'Ambiguous registry fails closed');
for(const bad of [{...row,status:'HELD'},{...row,sha256:'f'.repeat(64)},{...row,query:'BABYMONSTER ルカ トレカ'},{...row,source:'manual'},{...row,verifiedAt:'bad'}])assert.equal((await make([bad])).size,0);
for(const invalidUrl of ['javascript:alert(1)','https://evil.example/search?afid=123','https://jp.mercari.com/search?keyword=x&afid=123','https://name@jp.mercari.com/search?keyword='+encodeURIComponent(query)+'&afid=123','https://jp.mercari.com/search?keyword='+encodeURIComponent(query)+'&afid=123&afid=456'])assert.equal((await make([{...row,url:invalidUrl,sha256:createHash('sha256').update(invalidUrl).digest('hex')}])).size,0);
assert.equal((await linkIndex({affiliateEnabled:false,affiliateLinks:[row]})).size,0);
assert.equal(searchLink({query:'BABYMONSTER ルカ トレカ'},await make([row])).pr,false,'Unregistered condition uses normal URL');
console.log(JSON.stringify({regression:{pass,fail:0,review},dictionary:{total:275,active:248},linkValidation:'PASS',publicExport:'PASS',publicWhitelist:'PASS'}));
