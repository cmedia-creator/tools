import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {generate,sanitize,entryOptions,venueOptions} from '../engine.js';
import {linkIndex,searchLink} from '../links.js';
import {publicCatalog} from '../scripts/sync-sheet.mjs';
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
matrix.GROUP_DB[1].push('not exported');assert.ok(!JSON.stringify(publicCatalog(matrix)).includes('not exported'));
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
console.log(JSON.stringify({regression:{pass,fail:0,review},dictionary:{total:275,active:248},linkValidation:'PASS',publicExport:'PASS'}));
