import {createSign,createHash} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const catalogPath=fileURLToPath(new URL('../data/catalog.json',import.meta.url));
const tabs=['GROUP_DB','MEMBER_DB','RELEASE_DB','STORE_DB','TYPE_DB'];
const columns=['entry_key','canonical','alias','alias_kind','pilot01_use','priority','search_step'];
const objects=rows=>{if(!rows?.length)throw new Error('Required sheet is empty');return rows.slice(1).filter(r=>r[0]).map(row=>Object.fromEntries(rows[0].map((name,i)=>[name,row[i]??''])));};
const clean=value=>String(value??'');
export function publicCatalog(matrix,previous) {
  const db={};
  for(const tab of tabs) {
    const rows=objects(matrix[tab]);
    for(const key of columns)if(!matrix[tab][0].includes(key))throw new Error('Missing required public column');
    if(!rows.length||rows.length>10000)throw new Error('Unexpected dictionary size');
    db[tab.replace('_DB','').toLowerCase()]=rows.map(row=>Object.fromEntries(columns.map(k=>[k,k==='canonical'&&/種別.*その他/.test(String(row[k]))?'その他 / シリーズ未特定':k==='alias_kind'&&/_bucket$/.test(String(row[k]))?'internal_bucket':typeof row[k]==='string'?clean(row[k]):row[k]])));
  }
  if(!db.group.some(r=>r.alias==='BABYMONSTER'))throw new Error('Missing target group');
  const parts=matrix.SEARCH_RULES?.slice(1).filter(r=>r[0]).sort((a,b)=>Number(a[0])-Number(b[0]));
  const rules=JSON.parse(parts.map(r=>r[2]??'').join(''));
  db.rules={advisory_notes:JSON.parse(clean(JSON.stringify(rules.advisory_notes||{codes:[]})))};
  const settings=Object.fromEntries((matrix.PILOT02_SETTINGS||[]).slice(1).map(r=>[r[0],r[1]]));
  const enabled=String(settings.affiliate_enabled).toUpperCase()==='TRUE';
  const affiliateLinks=[];
  const rows=matrix.AFFILIATE_LINKS?.length?objects(matrix.AFFILIATE_LINKS):[];
  const normalize=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  const counts=new Map();rows.forEach(row=>{const k=normalize(row.normalized_query);counts.set(k,(counts.get(k)||0)+1);});
  if(enabled)for(const row of rows) {
    if(row.status!=='ACTIVE')continue;
    try {
      const url=new URL(row.affiliate_url),key=normalize(row.normalized_query);
      const hash=createHash('sha256').update(row.affiliate_url).digest('hex');
      if(counts.get(key)!==1 || row.source!=='mercari_official_link_only' || hash!==row.url_sha256 || !Number.isFinite(Date.parse(row.verified_at)))continue;
      if(url.protocol!=='https:'||url.hostname!=='jp.mercari.com'||url.pathname!=='/search'||url.username||url.password||url.port||url.hash)continue;
      if(url.searchParams.getAll('keyword').length!==1||normalize(url.searchParams.get('keyword'))!==key||url.searchParams.getAll('afid').length!==1||!/^\d+$/.test(url.searchParams.get('afid')))continue;
      affiliateLinks.push({query:row.normalized_query,url:row.affiliate_url,status:'ACTIVE',source:row.source,verifiedAt:row.verified_at,sha256:hash});
    }catch { /* Invalid rows are never published as affiliate links. */ }
  }
  const catalog={schema:'toreca-public-v1',updatedAt:new Date().toISOString(),affiliateEnabled:enabled,affiliateLinks,db};
  const stable=x=>JSON.stringify({...x,updatedAt:''});
  if(previous&&stable(previous)===stable(catalog))catalog.updatedAt=previous.updatedAt;
  return catalog;
}
async function fetchJson(url,options) {
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Google request failed: HTTP '+response.status);
  return response.json();
}
export async function sync() {
  const sheetId=process.env.GOOGLE_SHEET_ID;
  if(!sheetId||!process.env.GOOGLE_SERVICE_ACCOUNT_JSON)throw new Error('Set GOOGLE_SHEET_ID and GOOGLE_SERVICE_ACCOUNT_JSON in the administrator environment.');
  const service=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const now=Math.floor(Date.now()/1000),encode=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:service.client_email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();
  const assertion=unsigned+'.'+signer.sign(service.private_key,'base64url');
  const token=await fetchJson('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  const names=[...tabs,'SEARCH_RULES','AFFILIATE_LINKS','PILOT02_SETTINGS'];
  const url=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sheetId)+'/values:batchGet');
  names.forEach(name=>url.searchParams.append('ranges',name+'!A1:M1001'));url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
  const response=await fetchJson(url,{headers:{Authorization:'Bearer '+token.access_token}});
  const matrix=Object.fromEntries(names.map((name,i)=>[name,response.valueRanges[i]?.values||[]]));
  const previous=JSON.parse(await readFile(catalogPath,'utf8')),catalog=publicCatalog(matrix,previous);
  const text=JSON.stringify(catalog)+'\n';if(text===JSON.stringify(previous)+'\n'){console.log('Public catalog is unchanged.');return;}
  await writeFile(catalogPath+'.tmp',text);await rename(catalogPath+'.tmp',catalogPath);
  console.log('Published dictionary rows:',tabs.reduce((n,name)=>n+catalog.db[name.replace('_DB','').toLowerCase()].length,0));
}
if(process.argv[1]===fileURLToPath(import.meta.url))sync().catch(error=>{console.error(error.message);process.exitCode=1;});
