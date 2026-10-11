import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {generate,sanitize,entryOptions,venueOptions} from '../engine.js';
import {linkIndex,searchLink,bandLink,bandedItems,linkAttrs,bandAttrs,urlProblem,MAX_BAND_BUTTONS} from '../links.js';
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
assert.equal(typeof catalog.affiliateEnabled,'boolean');
if(catalog.affiliateEnabled){
  assert.ok(catalog.affiliateLinks.length>0,'Enabled catalog should contain active links');
  assert.equal((await linkIndex(catalog)).size,catalog.affiliateLinks.length,'Every published affiliate link must validate');
}else assert.equal(catalog.affiliateLinks.length,0);
assert.equal(entryOptions(catalog.db.member).length,8);assert.ok(venueOptions(catalog.db).length);
const rows=Object.entries(catalog.db).filter(([k])=>k!=='rules').flatMap(([k,v])=>v);
assert.equal(rows.filter(r=>String(r.pilot01_use).toUpperCase()==='TRUE').length,248);
for(const row of rows)assert.deepEqual(Object.keys(row),['entry_key','canonical','alias','alias_kind','pilot01_use','priority','search_step']);
for(const filename of ['engine.js','app.js','index.html','data/catalog.json'])assert.ok(!/google\.script|SpreadsheetApp|FROZEN_B64|c\.media\.satoru/i.test(await readFile(new URL('../'+filename,import.meta.url),'utf8')),filename+' contains private or GAS data');
const matrix={};for(const key of ['group','member','release','store','type']){const cols=Object.keys(catalog.db[key][0]);matrix[key.toUpperCase()+'_DB']=[cols,...catalog.db[key].map(r=>cols.map(c=>r[c]))];}
matrix.SEARCH_RULES=[['part','count','json_chunk'],[1,1,JSON.stringify(catalog.db.rules)]];
matrix.PILOT02_SETTINGS=[['key','value'],['affiliate_enabled',String(catalog.affiliateEnabled).toUpperCase()]];
matrix.AFFILIATE_LINKS=[['normalized_query','affiliate_url','status','source','url_sha256','verified_at'],...catalog.affiliateLinks.map(r=>[r.query,r.url,r.status,r.source,r.sha256,r.verifiedAt])];
assert.equal(publicCatalog(matrix,catalog).updatedAt,catalog.updatedAt,'No timestamp churn');
// Browser export (display text only) converts back to the same public catalog.
const asText=rows=>rows.map(r=>r.map(c=>c===true?'TRUE':c===false?'FALSE':String(c??'')));
const exported={format:'toreca-sheet-export-v1',matrix:Object.fromEntries(Object.entries(matrix).map(([k,v])=>[k,asText(v)]))};
assert.equal(JSON.stringify(publicCatalog(matrixFromExport(exported),catalog)),JSON.stringify(catalog),'Browser export round-trips to the published catalog');
assert.throws(()=>matrixFromExport({format:'toreca-sheet-export-v1',matrix:{}}),/missing/);
const affiliateMatrix=structuredClone(matrix);
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
assert.ok(leak(c=>{c.affiliateEnabled=false;c.affiliateLinks=[{query:'q',url:'u',status:'ACTIVE',source:'s',verifiedAt:'d',sha256:'h'}];}),'Links while disabled are rejected');
const query='BABYMONSTER ラミ DRIP トレカ';
const url='https://jp.mercari.com/search?keyword='+encodeURIComponent(query)+'&afid=123456';
const row={query,url,status:'ACTIVE',source:'mercari_official_link_only',verifiedAt:'2026-10-11T00:00:00Z',sha256:createHash('sha256').update(url).digest('hex')};
// Exercise the same Sheets -> publicCatalog -> browser link pipeline with both settings.
affiliateMatrix.AFFILIATE_LINKS=[['normalized_query','affiliate_url','status','source','url_sha256','verified_at'],[row.query,row.url,row.status,row.source,row.sha256,row.verifiedAt]];
affiliateMatrix.PILOT02_SETTINGS=[['key','value'],['affiliate_enabled','FALSE']];
const disabledCatalog=publicCatalog(affiliateMatrix);
assert.equal(disabledCatalog.affiliateEnabled,false);
assert.equal(disabledCatalog.affiliateLinks.length,0);
assert.deepEqual(validateCatalog(disabledCatalog),[]);
affiliateMatrix.PILOT02_SETTINGS[1][1]='TRUE';
const enabledCatalog=publicCatalog(affiliateMatrix);
assert.equal(enabledCatalog.affiliateEnabled,true);
assert.equal(enabledCatalog.affiliateLinks.length,1);
assert.equal(enabledCatalog.affiliateLinks[0].url,url,'Do not alter the official URL');
assert.deepEqual(enabledCatalog.db,disabledCatalog.db,'Affiliate state must not change search data');
assert.deepEqual(validateCatalog(enabledCatalog),[]);
const enabledIndex=await linkIndex(enabledCatalog);
assert.equal(searchLink({query},enabledIndex).url,url);
assert.equal(searchLink({query},enabledIndex).pr,true);
assert.equal(searchLink({query:'BABYMONSTER アサ トレカ'},enabledIndex).pr,false);
const make=affiliateLinks=>linkIndex({affiliateEnabled:true,affiliateLinks});
assert.equal(searchLink({query},await make([row])).url,url,'Preserve official URL byte-for-byte');
assert.equal(searchLink({query},await make([row])).pr,true);
assert.equal((await make([row,row])).size,0,'Ambiguous registry fails closed');
for(const bad of [{...row,status:'HELD'},{...row,sha256:'f'.repeat(64)},{...row,query:'BABYMONSTER ルカ トレカ'},{...row,source:'manual'},{...row,verifiedAt:'bad'}])assert.equal((await make([bad])).size,0);
for(const invalidUrl of ['javascript:alert(1)','https://evil.example/search?afid=123','https://jp.mercari.com/search?keyword=x&afid=123','https://name@jp.mercari.com/search?keyword='+encodeURIComponent(query)+'&afid=123','https://jp.mercari.com/search?keyword='+encodeURIComponent(query)+'&afid=123&afid=456'])assert.equal((await make([{...row,url:invalidUrl,sha256:createHash('sha256').update(invalidUrl).digest('hex')}])).size,0);
assert.equal((await linkIndex({affiliateEnabled:false,affiliateLinks:[row]})).size,0);
assert.equal(searchLink({query:'BABYMONSTER ルカ トレカ'},await make([row])).pr,false,'Unregistered condition uses normal URL');
// The real AFFILIATE_LINKS layout and the URL form the official link tool issues (afid first, '+' for spaces).
const officialQuery='BABYMONSTER ラミ トレカ',officialUrl='https://jp.mercari.com/search?afid=1722203408&keyword=BABYMONSTER+%E3%83%A9%E3%83%9F+%E3%83%88%E3%83%AC%E3%82%AB';
const sheetRow=(q,u,status='ACTIVE',sha=createHash('sha256').update(u).digest('hex'))=>['p2_x','babymonster','','','','',q,u,status,'2026-10-11T04:00:00Z','mercari_official_link_only',sha,'note'];
const sheetMatrix=structuredClone(affiliateMatrix);
sheetMatrix.AFFILIATE_LINKS=[['pattern_id','group_id','member_id','series_id','benefit_id','type_id','normalized_query','affiliate_url','status','verified_at','source','url_sha256','note'],
  sheetRow(officialQuery,officialUrl),sheetRow('BABYMONSTER アサ トレカ','','UNREGISTERED',''),sheetRow('BABYMONSTER ルカ トレカ',officialUrl),sheetRow('BABYMONSTER ローラ トレカ',officialUrl+'x',undefined,'0'.repeat(64))];
sheetMatrix.PILOT02_SETTINGS=[['key','value'],['affiliate_enabled','FALSE']];
assert.equal(publicCatalog(sheetMatrix).affiliateLinks.length,0,'ACTIVE rows are not published while disabled');
sheetMatrix.PILOT02_SETTINGS[1][1]='TRUE';
const sheetCatalog=publicCatalog(sheetMatrix);
assert.deepEqual(validateCatalog(sheetCatalog),[]);
assert.deepEqual(sheetCatalog.affiliateLinks.map(l=>[l.query,l.url]),[[officialQuery,officialUrl]],'Only the valid ACTIVE row is published, byte-for-byte');
const sheetIndex=await linkIndex(sheetCatalog),cards=Object.values(generate(sanitize({member:'RAMI'}),sheetCatalog.db).steps).flat();
assert.ok(cards.some(q=>q.query===officialQuery),'Registered query is generated by the engine');
for(const q of cards){
  const link=searchLink(q,sheetIndex),attrs=linkAttrs(link);
  if(q.query===officialQuery){assert.deepEqual(link,{url:officialUrl,pr:true});assert.match(attrs.text,/（PR）/);assert.match(attrs.rel,/sponsored/);}
  else{assert.deepEqual(link,{url:q.mercariUrl,pr:false});assert.doesNotMatch(attrs.text,/PR/);assert.doesNotMatch(attrs.rel,/sponsored/);}
}
// Release dropdown values are canonical names: lead with the official alias, keep the long alias as the second STEP 1 query.
const step1=input=>generate(sanitize(input),catalog.db).steps[1].map(q=>q.query);
assert.deepEqual(step1({member:'RAMI',release:'DRIP (1st FULL ALBUM)'}).slice(0,2),['BABYMONSTER ラミ DRIP トレカ','BABYMONSTER ラミ 1st FULL ALBUM トレカ']);
assert.deepEqual(step1({member:'RUKA',release:'CHOOM / 춤 (3rd MINI ALBUM)'}).slice(0,2),['BABYMONSTER ルカ CHOOM トレカ','BABYMONSTER ルカ 3rd MINI ALBUM トレカ']);
assert.equal(step1({member:'RAMI',release:'1st FULL ALBUM'})[0],'BABYMONSTER ラミ 1st FULL ALBUM トレカ','An alias typed as the release is used as given');
assert.ok(!step1({member:'RAMI',release:'HOT SAUCE'}).some(q=>/HOT SOURCE/.test(q)),'Misspelled aliases are not promoted to STEP 1');
// Discovery terms: a channel the user picked brings in the word sellers use for it, as a group-level STEP 2 query.
const steps=input=>generate(sanitize(input),catalog.db).steps;
const step2=input=>steps(input)[2].map(q=>q.query);
const allQueries=input=>Object.values(steps(input)).flat().map(q=>q.query);
const DISCOVERY=['BABYMONSTER ヨントン トレカ','BABYMONSTER サノク トレカ','BABYMONSTER タワレコカフェ トレカ','BABYMONSTER 中華 トレカ','BABYMONSTER 京セラ ラントレ'];
const WINNER='当選者限定（ヨントン / サイン会）',TOWER='タワーレコード',TOUR2='2nd WORLD TOUR [춤 (CHOOM)]';
for(const [input,query] of [
  [{member:'RAMI',type:WINNER},'BABYMONSTER ヨントン トレカ'],
  [{freeform:'ラミ ヨントン'},'BABYMONSTER ヨントン トレカ'],
  [{member:'ASA',release:'DRIP (1st FULL ALBUM)',type:'サノク / 公開放送（事前収録）'},'BABYMONSTER サノク トレカ'],
  [{member:'RUKA',store:TOWER},'BABYMONSTER タワレコカフェ トレカ'],
  [{freeform:'タワレコ ルカ'},'BABYMONSTER タワレコカフェ トレカ'],
  [{member:'CHIQUITA',store:'QQ MUSIC / QQ MUSIC STARLIGHT'},'BABYMONSTER 中華 トレカ'],
  [{store:'JINGDONG（京東）'},'BABYMONSTER 中華 トレカ'],
  [{member:'RORA',store:'TME / TMEA（Tencent Music）'},'BABYMONSTER 中華 トレカ'],
  [{member:'PHARITA',region:'中華限定'},'BABYMONSTER 中華 トレカ'],
  [{member:'ASA',release:TOUR2},'BABYMONSTER 京セラ ラントレ'],
  [{member:'ASA',venue:'京セラドーム'},'BABYMONSTER 京セラ ラントレ'],
  [{type:'会場限定 / 複数会場'},'BABYMONSTER 京セラ ラントレ']
])assert.ok(step2(input).includes(query),JSON.stringify(input)+' should suggest '+query);
assert.ok(!allQueries({member:'ASA',venue:'ソウルコン'}).includes('BABYMONSTER 京セラ ラントレ'),'Another venue does not bring in the Kyocera term');
for(const input of [{member:'RAMI'},{member:'RAMI',release:'DRIP (1st FULL ALBUM)'},{member:'RAMI',store:'MAKESTAR'},{member:'RAMI',type:'ラキドロ（抽選特典 / lucky draw）'}])
  assert.deepEqual(allQueries(input).filter(q=>DISCOVERY.includes(q)),[],'No discovery term without a matching channel: '+JSON.stringify(input));
assert.ok(step2({member:'RAMI',store:TOWER,type:WINNER,venue:'京セラドーム'}).filter(q=>DISCOVERY.includes(q)).length<=2,'At most two discovery terms per search');
// Discovery terms take the lowest-ranked slots; the member's and the series' base queries stay (both are registered PR links).
assert.ok(step2({member:'RUKA',release:'WE GO UP',store:TOWER,type:'ラキドロ'}).includes('BABYMONSTER ルカ トレカ'));
for(const input of [{member:'RAMI',release:'DRIP (1st FULL ALBUM)',store:TOWER},{member:'RAMI',release:'DRIP (1st FULL ALBUM)',store:'QQ MUSIC / QQ MUSIC STARLIGHT'}]){
  assert.ok(step2(input).includes('BABYMONSTER ラミ トレカ'),'Member base query kept: '+JSON.stringify(input));
  assert.ok(step2(input).includes('BABYMONSTER DRIP トレカ'),'Series base query kept: '+JSON.stringify(input));
}
// The seller's spelling variant leads STEP 2 and says what it finds; group-wide 特典/限定 go last when a member is given.
const chiquita=steps({member:'CHIQUITA'});
assert.equal(chiquita[2][0].query,'BABYMONSTER チキタ トレカ');assert.match(chiquita[2][0].why,/チキタ.*チキータ/);
const memberStep3=steps({member:'RAMI'})[3].map(q=>q.query);
assert.ok(memberStep3.indexOf('BABYMONSTER トレカ 特典')>memberStep3.indexOf('BABYMONSTER ラミ まとめ売り'),'特典 goes after the member queries');
assert.ok(steps({})[3].some(q=>q.query==='BABYMONSTER トレカ 特典'),'Without a member the generic words stay');

// Link variants: a query can have an 'all' link and a price-band link. Each variant fixes its exact parameters.
const sha=u=>createHash('sha256').update(u).digest('hex');
const officialSearch=(query,extra={})=>'https://jp.mercari.com/search?'+new URLSearchParams({afid:'1722203408',keyword:query,...extra});
const BAND_PARAMS={price_max:'39999',price_min:'2000',status:'on_sale'};
const fq='BABYMONSTER ファリタ トレカ',bandUrl=officialSearch(fq,BAND_PARAMS);
assert.equal(bandUrl,'https://jp.mercari.com/search?afid=1722203408&keyword=BABYMONSTER+%E3%83%95%E3%82%A1%E3%83%AA%E3%82%BF+%E3%83%88%E3%83%AC%E3%82%AB&price_max=39999&price_min=2000&status=on_sale','Same form as the official toolbar link');
const linkRow=(query,url,variant)=>({query,variant,url,status:'ACTIVE',source:'mercari_official_link_only',verifiedAt:'2026-10-11T00:00:00Z',sha256:sha(url)});
const bandRow=linkRow(fq,bandUrl,'band_2000_39999');
const bandIndex=await make([bandRow]);
assert.equal(bandIndex.size,1);
assert.deepEqual(bandLink({query:fq},bandIndex),{url:bandUrl,pr:true},'Band URL is used byte-for-byte');
assert.deepEqual(searchLink({query:fq},bandIndex),{url:'https://jp.mercari.com/search?keyword='+encodeURIComponent(fq),pr:false},'The main button stays a normal search');
assert.equal(bandLink({query},bandIndex),null,'Queries without a band link get no band button');
assert.equal(urlProblem(bandUrl,fq,'band_2000_39999'),'');
for(const [url,variant] of [
  [bandUrl,'all'],                                                     // band URL registered as a plain link
  [officialSearch(fq),'band_2000_39999'],                              // plain URL registered as a band link
  [officialSearch(fq,{...BAND_PARAMS,price_min:'3000'}),'band_2000_39999'],
  [officialSearch(fq,{price_max:'39999',price_min:'2000'}),'band_2000_39999'],
  [officialSearch(fq,{...BAND_PARAMS,sort:'price'}),'band_2000_39999'],
  [bandUrl+'&price_min=2000','band_2000_39999'],
  [officialSearch(fq,{sort:'price'}),'all'],
  [bandUrl,'band_x']
]){
  assert.ok(urlProblem(url,fq,variant),'Rejected: '+variant+' '+url);
  assert.equal((await make([linkRow(fq,url,variant)])).size,0,'Index rejects: '+variant+' '+url);
}
// Same query with both variants: both are valid, the card shows one PR button (the band one) and a normal main button.
const allUrl=officialSearch(fq),both=await make([linkRow(fq,allUrl,'all'),bandRow]);
assert.equal(both.size,2,'Duplicate check is per query and variant');
assert.equal(searchLink({query:fq},both).pr,false);assert.equal(bandLink({query:fq},both).url,bandUrl);
assert.deepEqual(searchLink({query:fq},await make([linkRow(fq,allUrl,'all')])),{url:allUrl,pr:true},'An all-only query keeps its PR main button');
const dup=await make([linkRow(fq,allUrl,'all'),bandRow,{...bandRow}]);
assert.equal(dup.size,1,'Two band rows for one query fail closed, the all link stays');assert.equal(bandLink({query:fq},dup),null);assert.equal(searchLink({query:fq},dup).pr,true);
// At most MAX_BAND_BUTTONS band buttons per result, in display order.
const many=['A','B','C','D','E'].map(x=>'BABYMONSTER '+x+' トレカ');
const manyIndex=await make(many.map(q=>linkRow(q,officialSearch(q,BAND_PARAMS),'band_2000_39999')));
assert.deepEqual([...bandedItems([{query:'x'},...many.map(query=>({query}))],manyIndex)].map(i=>i.query),many.slice(0,MAX_BAND_BUTTONS));
assert.equal(bandAttrs.rel.includes('sponsored'),true);assert.match(bandAttrs.text,/（PR）/);

// AFFILIATE_LINKS with the five PILOT 03 columns: only query/variant/url/status/source/verifiedAt/sha256 are published.
const head=['pattern_id','group_id','member_id','series_id','benefit_id','type_id','normalized_query','affiliate_url','status','verified_at','source','url_sha256','note','link_variant','category','eval','evaluated_at','review_due'];
const pRow=(q,u,variant,status='ACTIVE')=>['p3_x','babymonster','','','','',q,u,status,'2026-10-11T04:00:00Z','mercari_official_link_only',sha(u),'採用理由メモ',variant,'表記揺れ','D107 P87 R101','2026-10-11','2027-01-09'];
const p3=structuredClone(sheetMatrix);
p3.AFFILIATE_LINKS=[head,pRow(officialQuery,officialUrl,'all'),pRow(fq,bandUrl,'band_2000_39999'),pRow(fq,allUrl,''),pRow(fq,bandUrl,'band_9'),pRow('BABYMONSTER ロラ トレカ',officialSearch('BABYMONSTER ロラ トレカ',BAND_PARAMS),'band_2000_39999','HELD')];
const p3Catalog=publicCatalog(p3);
assert.deepEqual(validateCatalog(p3Catalog),[]);
assert.deepEqual(p3Catalog.affiliateLinks.map(l=>[l.query,l.variant,l.url]),[[officialQuery,'all',officialUrl],[fq,'band_2000_39999',bandUrl],[fq,'all',allUrl]],'Blank link_variant is all; unknown variants and HELD rows are not published');
assert.deepEqual(Object.keys(p3Catalog.affiliateLinks[0]),['query','variant','url','status','source','verifiedAt','sha256']);
assert.ok(!/D107|表記揺れ|2027-01-09|採用理由/.test(JSON.stringify(p3Catalog)),'Evaluation columns never reach the public catalog');
p3.AFFILIATE_LINKS.push(pRow(fq,bandUrl,'band_2000_39999'));
assert.deepEqual(publicCatalog(p3).affiliateLinks.map(l=>l.variant),['all','all'],'A duplicated query+variant is dropped, other variants stay');
assert.ok(leak(c=>{c.affiliateLinks[0].variant='band_x';}),'Unknown variant is rejected');
assert.ok(leak(c=>{delete c.affiliateLinks[0].variant;}),'Missing variant is rejected');
assert.ok(leak(c=>{c.affiliateLinks[0].eval='D1';}),'Evaluation key is rejected');
assert.ok(catalog.affiliateLinks.every(l=>l.variant==='all'),'The 24 live links are all-variant links');
console.log(JSON.stringify({regression:{pass,fail:0,review},dictionary:{total:275,active:248},linkValidation:'PASS',publicExport:'PASS',publicWhitelist:'PASS',affiliateStates:'PASS',discoveryTerms:'PASS',linkVariants:'PASS'}));
