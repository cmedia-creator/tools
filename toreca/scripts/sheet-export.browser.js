// Run in the browser on the admin spreadsheet's edit page (signed-in session).
// Reads the sheets needed for the public catalog from the read-only HTML view and puts a JSON
// export into <textarea id="toreca-export"> at the top left; clicking it copies the export to the clipboard.
// The export is a local working file: import it with `npm run import -- <file>` and never commit it.
(async () => {
  const NAMES=['GROUP_DB','MEMBER_DB','RELEASE_DB','STORE_DB','TYPE_DB','SEARCH_RULES','AFFILIATE_LINKS','PILOT02_SETTINGS'];
  const id=location.pathname.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([^/]+)/)?.[1];
  if(!id)throw new Error('Open the spreadsheet edit page first');
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ','#39':"'"};
  const decode=s=>s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1))):entities[e]??m);
  const text=html=>decode(html.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,''));
  const unescapeJs=s=>s.replace(/\\(x[0-9a-f]{2}|u[0-9a-f]{4}|.)/gi,(m,e)=>e.length>1?String.fromCharCode(parseInt(e.slice(1),16)):e);
  const view=await (await fetch(location.pathname.replace(/\/edit.*$/,'')+'/htmlview')).text();
  const pages=Object.fromEntries([...view.matchAll(/name:\s*"([^"]+)",\s*pageUrl:\s*"([^"]+)"/g)].map(m=>[m[1],unescapeJs(m[2])]));
  const matrix={};
  for(const name of NAMES) {
    if(!pages[name])throw new Error('Sheet not found: '+name);
    const html=await (await fetch(pages[name])).text();
    const body=html.slice(html.indexOf('<tbody'),html.indexOf('</tbody>'));
    const rows=body.split(/<tr\b/).slice(1).map(tr=>[...tr.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)].filter(m=>!/freezebar-cell/.test(m[1])).map(m=>text(m[2])));
    const kept=rows.filter(r=>r.some(c=>c!==''));
    const width=Math.max(0,...kept.map(r=>{let n=r.length;while(n&&r[n-1]==='')n--;return n;}));
    matrix[name]=kept.map(r=>r.slice(0,width));
  }
  const payload=JSON.stringify({format:'toreca-sheet-export-v1',title:document.title.replace(/ - Google.*$/,''),exportedAt:new Date().toISOString(),matrix});
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload))),b=>b.toString(16).padStart(2,'0')).join('');
  document.getElementById('toreca-export')?.remove();
  const area=document.createElement('textarea');area.id='toreca-export';area.value=payload;
  area.style.cssText='position:fixed;top:8px;left:8px;width:240px;height:60px;z-index:99999';
  // Clipboard writes need a real user click, so the copy happens when the textarea is clicked.
  area.addEventListener('click',()=>{area.select();navigator.clipboard.writeText(area.value).then(()=>{area.style.outline='3px solid #2a7';});});
  document.body.append(area);area.focus();area.select();
  return {sha256:digest,chars:payload.length,rows:Object.fromEntries(Object.entries(matrix).map(([k,v])=>[k,v.length-1]))};
})();
