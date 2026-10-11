import {generate,sanitize,entryOptions,venueOptions} from './engine.js';
import {linkIndex,searchLink,linkAttrs} from './links.js';
const form=document.querySelector('#search-form'),content=document.querySelector('#result-content'),status=document.querySelector('#load-status');
let catalog,index;
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
function fill(id,values) {
  const el=document.getElementById(id);el.replaceChildren(new Option('指定なし',''));
  values.forEach(value=>el.add(new Option(typeof value==='string'?value:value.name,typeof value==='string'?value:value.name)));
  el.disabled=false;
}
async function load() {
  try {
    const response=await fetch('./data/catalog.json',{cache:'no-cache'});
    if(!response.ok)throw new Error('Unable to load catalog');
    catalog=await response.json();
    if(catalog.schema!=='toreca-public-v1' || !catalog.db?.member?.length)throw new Error('Invalid catalog');
    index=await linkIndex(catalog);
    const db=catalog.db;
    ['member','release','store'].forEach(id=>fill(id,entryOptions(db[id])));
    fill('type',entryOptions(db.type,row=>!['cardword','condition','vague','region','overseas_venue'].includes(row.entry_key)));
    fill('venue',venueOptions(db));
    fill('region',db.type.filter(r=>r.entry_key==='region'&&String(r.pilot01_use).toLowerCase()==='true').sort((a,b)=>Number(a.priority)-Number(b.priority)).map(r=>r.alias));
    db.type.filter(r=>r.alias_kind==='ja_design'&&String(r.pilot01_use).toLowerCase()==='true').forEach(r=>document.querySelector('#versions').append(new Option(r.alias,r.alias)));
    document.querySelector('#search-button').disabled=false;status.textContent='';
    const date=new Date(catalog.updatedAt);if(!Number.isNaN(date.getTime()))document.querySelector('#data-date').textContent='辞書更新：'+date.toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'});
    if(index.size)document.querySelector('#link-disclosure').textContent='「PR」と表示したボタンはアフィリエイトリンクです。そのリンク経由の購入により運営者に報酬が入る場合があります。それ以外は通常の検索リンクです。';
    const params=new URLSearchParams(location.search);
    let hasParams=false;
    for(const name of ['member','release','store','type','venue','version','region','want','freeform'])if(params.has(name)){const value=params.get(name);form.elements[name].value=value.slice(0,300);hasParams=true;}
    if(hasParams)render(false);
  } catch {
    status.textContent='辞書を読み込めませんでした。ページを再読み込みしてください。';
    const retry=node('button','もう一度読み込む','copy-button');retry.type='button';retry.addEventListener('click',()=>location.reload());status.append(' ',retry);
  }
}
async function copyQuery(query,button) {
  try{await navigator.clipboard.writeText(query);button.textContent='コピー済み';setTimeout(()=>{button.textContent='コピー';},1600);}
  catch{const field=node('textarea');field.value=query;field.readOnly=true;button.closest('.query-card').append(field);field.select();button.textContent='検索語を選択しました';}
}
function queryCard(item) {
  const article=node('article',undefined,'query-card');article.append(node('p',item.query,'query-text'),node('p',item.why,'query-why'));
  const actions=node('div',undefined,'query-actions'),link=searchLink(item,index),attrs=linkAttrs(link),a=node('a',attrs.text,'mercari-link');
  a.href=link.url;a.target='_blank';a.rel=attrs.rel;a.setAttribute('aria-label',item.query+'をメルカリで探す'+(link.pr?'（PR・アフィリエイトリンク）':'')+'（新しいタブ）');
  const button=node('button','コピー','copy-button');button.type='button';button.setAttribute('aria-label',item.query+'をコピー');button.addEventListener('click',()=>copyQuery(item.query,button));actions.append(a,button);article.append(actions);return article;
}
function render(scroll=true) {
  if(!catalog)return;
  const raw=Object.fromEntries(new FormData(form)),input=sanitize(raw),result=generate(input,catalog.db),fragment=document.createDocumentFragment();
  const names=['memberName','releaseName','storeName','typeName','venueName','versionName','regionName'].map(k=>result.resolved[k]).filter(Boolean);
  fragment.append(node('div',names.length?names.join(' / '):'BABYMONSTERのトレカを広く探します','resolved'));
  result.advisoryNotes.forEach(n=>fragment.append(node('p',n.text,'advisory')));
  if(input.freeform&&!names.length)fragment.append(node('p','手がかりを辞書で特定できませんでした。選択欄も使って条件を指定してください。','advisory'));
  if(Object.values(result.steps).flat().some(item=>searchLink(item,index).pr))fragment.append(node('p','「PR」と表示したボタンはアフィリエイトリンクです。そのリンク経由の購入により運営者に報酬が入る場合があります。','pr-note'));
  const titles={1:'まずは絞って探す',2:'表記を変えて探す',3:'条件を減らして探す'},descriptions={1:'シリーズや店舗名を使う、最初の検索候補。',2:'見つからなければ、略称や別の表記を試します。',3:'結果が広がります。カード以外やセットも含むため、画像を確かめてください。'};
  for(const step of [1,2,3]) {
    const items=result.steps[String(step)];if(!items.length)continue;
    let outer,section;
    if(step===1){outer=section=node('section',undefined,'step');const title=node('h3',undefined,'step-title');title.append(node('b','STEP 1'),node('span',titles[step]));section.append(title);}
    else{outer=node('details',undefined,'later-step');const summary=node('summary','STEP '+step+' · '+titles[step]+'（'+items.length+'候補）');outer.append(summary);section=node('div');outer.append(section);if(step===2)outer.open=true;}
    section.append(node('p',descriptions[step],'step-description'));items.forEach(item=>section.append(queryCard(item)));fragment.append(outer);
  }
  fragment.append(node('p','検索結果の在庫や価格はメルカリで確認してください。','results-end'));content.replaceChildren(fragment);
  const params=new URLSearchParams();for(const [key,value]of Object.entries(raw))if(value)params.set(key,value);
  try{history.replaceState(null,'',location.pathname+(params.size?'?'+params.toString():'')+location.hash);}catch{}
  if(scroll&&window.matchMedia('(max-width:730px)').matches)document.querySelector('#results').scrollIntoView({behavior:'smooth'});
}
form.addEventListener('submit',event=>{event.preventDefault();try{render();}catch{status.textContent='検索語を作成できませんでした。条件を減らして試してください。';}});
document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{if(!catalog)return;form.reset();const presets={rami:{member:'RAMI',release:'DRIP (1st FULL ALBUM)'},chiquita:{member:'CHIQUITA'},rora:{member:'RORA',store:'MAKESTAR'}};Object.entries(presets[button.dataset.example]).forEach(([k,v])=>form.elements[k].value=v);render();}));
load();
