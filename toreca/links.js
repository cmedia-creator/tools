const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
// Link variants. 'all' is the plain official search link (the original 24); 'band_2000_39999' is the official
// link issued from a search narrowed to ¥2,000-39,999 and on sale. Each variant fixes the exact extra parameters.
export const VARIANTS = {
  all: {},
  band_2000_39999: {price_max:'39999',price_min:'2000',status:'on_sale'}
};
export const BAND = 'band_2000_39999';
// At most this many price-band PR buttons in one set of results.
export const MAX_BAND_BUTTONS = 3;
const indexKey = (query,variant) => normalize(query)+'\n'+variant;

// Returns '' when the official URL is acceptable for this query and variant, otherwise the reason.
// Shared with scripts/sync-sheet.mjs so the browser and the publisher check the same rules.
export function urlProblem(value,query,variant) {
  const fixed=VARIANTS[variant];
  if(!fixed)return 'unknown variant';
  let url;
  try{url=new URL(value);}catch{return 'not a URL';}
  if(url.protocol!=='https:' || url.hostname!=='jp.mercari.com' || url.pathname!=='/search' || url.username || url.password || url.port || url.hash)return 'not a Mercari search URL';
  const allowed=['afid','keyword',...Object.keys(fixed)];
  if([...url.searchParams.keys()].length!==allowed.length || allowed.some(name=>url.searchParams.getAll(name).length!==1))return 'unexpected parameters';
  if(normalize(url.searchParams.get('keyword'))!==normalize(query) || !/^\d+$/.test(url.searchParams.get('afid')))return 'keyword or afid mismatch';
  if(Object.entries(fixed).some(([name,expected])=>url.searchParams.get(name)!==expected))return 'variant condition mismatch';
  return '';
}

export async function linkIndex(catalog) {
  const index = new Map();
  if (catalog.affiliateEnabled !== true) return index;
  const rows = catalog.affiliateLinks || [];
  const variantOf = row => row.variant || 'all';
  const counts = new Map();
  for (const row of rows) { const key=indexKey(row.query,variantOf(row)); counts.set(key,(counts.get(key)||0)+1); }
  for (const row of rows) {
    try {
      const key=indexKey(row.query,variantOf(row));
      // A query may have one link per variant; two rows for the same query and variant fail closed.
      if(counts.get(key)!==1 || row.status!=='ACTIVE' || row.source!=='mercari_official_link_only') continue;
      if(urlProblem(row.url,row.query,variantOf(row))) continue;
      if(!Number.isFinite(Date.parse(row.verifiedAt)) || !/^[a-f0-9]{64}$/.test(row.sha256)) continue;
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(row.url));
      const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
      if(digest!==row.sha256) continue;
      index.set(key,row.url);
    } catch { /* Unregistered or invalid URLs use a normal search. */ }
  }
  return index;
}

// The card's main button. An 'all' link replaces the normal search URL as before, unless the query also has a
// price-band link: a card never shows two PR buttons, and the band link is the one that was evaluated and adopted.
export function searchLink(item,index) {
  const registered=index.has(indexKey(item.query,BAND)) ? null : index.get(indexKey(item.query,'all'));
  return registered ? {url:registered,pr:true} : {url:'https://jp.mercari.com/search?keyword='+encodeURIComponent(item.query),pr:false};
}
// The second, price-band PR button, or null when the query has no adopted band link.
export function bandLink(item,index) {
  const registered=index.get(indexKey(item.query,BAND));
  return registered ? {url:registered,pr:true} : null;
}
// Button text and rel for a link from searchLink(); affiliate links are labelled PR and marked sponsored.
export function linkAttrs(link) {
  return link.pr ? {text:'メルカリで探す（PR） ↗',rel:'noopener sponsored'} : {text:'メルカリで探す ↗',rel:'noopener noreferrer'};
}
// The cards (in display order) that get a band button: at most MAX_BAND_BUTTONS per set of results.
export function bandedItems(items,index) {
  return new Set(items.filter(item=>bandLink(item,index)).slice(0,MAX_BAND_BUTTONS));
}
export const bandAttrs = {text:'¥2,000〜の販売中を見る（PR） ↗',rel:'noopener sponsored'};
