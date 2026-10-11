const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
export async function linkIndex(catalog) {
  const index = new Map();
  if (catalog.affiliateEnabled !== true) return index;
  const rows = catalog.affiliateLinks || [];
  const counts = new Map();
  for (const row of rows) { const key=normalize(row.query); counts.set(key,(counts.get(key)||0)+1); }
  for (const row of rows) {
    try {
      const key=normalize(row.query), url=new URL(row.url);
      if(counts.get(key)!==1 || row.status!=='ACTIVE' || row.source!=='mercari_official_link_only') continue;
      if(url.protocol!=='https:' || url.hostname!=='jp.mercari.com' || url.pathname!=='/search' || url.username || url.password || url.port || url.hash) continue;
      // Only afid and keyword: one plain official link per query, no price or status filters.
      if([...url.searchParams.keys()].length!==2 || url.searchParams.getAll('keyword').length!==1 || normalize(url.searchParams.get('keyword'))!==key || url.searchParams.getAll('afid').length!==1 || !/^\d+$/.test(url.searchParams.get('afid'))) continue;
      if(!Number.isFinite(Date.parse(row.verifiedAt)) || !/^[a-f0-9]{64}$/.test(row.sha256)) continue;
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(row.url));
      const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
      if(digest!==row.sha256) continue;
      index.set(key,row.url);
    } catch { /* Unregistered or invalid URLs use a normal search. */ }
  }
  return index;
}
export function searchLink(item,index) {
  const registered=index.get(normalize(item.query));
  return registered ? {url:registered,pr:true} : {url:'https://jp.mercari.com/search?keyword='+encodeURIComponent(item.query),pr:false};
}
// Button text and rel for a link from searchLink(); affiliate links are labelled PR and marked sponsored.
export function linkAttrs(link) {
  return link.pr ? {text:'メルカリで探す（PR） ↗',rel:'noopener sponsored'} : {text:'メルカリで探す ↗',rel:'noopener noreferrer'};
}
