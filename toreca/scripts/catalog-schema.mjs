// Public catalog whitelist. Every key that reaches data/catalog.json must be listed here.
import {VARIANTS} from '../links.js';
export const SCHEMA='toreca-public-v1';
export const DICTIONARY_TABS=['GROUP_DB','MEMBER_DB','RELEASE_DB','STORE_DB','TYPE_DB'];
export const DICTIONARY_KEYS=DICTIONARY_TABS.map(tab=>tab.replace('_DB','').toLowerCase());
export const DICTIONARY_COLUMNS=['entry_key','canonical','alias','alias_kind','pilot01_use','priority','search_step'];
export const ADVISORY_KEYS=['id','show'];
// Internal AFFILIATE_LINKS columns (category, eval, evaluated_at, review_due, note) are never published.
export const AFFILIATE_KEYS=['query','variant','url','status','source','verifiedAt','sha256'];
const TOP_KEYS=['schema','updatedAt','affiliateEnabled','affiliateLinks','db'];
// Text that only appears in internal notes, logs or the admin account.
export const PRIVATE_PATTERNS=[/google\.script|SpreadsheetApp|FROZEN_B64/i,/[\w.+-]+@[\w-]+\.[\w.]+/,/\.md\b|§/,/PILOT\s*0\d/i,/人力リサーチ|研究|research/i,/session_id|researcher_note|retention_days|telemetry/i];

// Keep only the user-facing advisory text that engine.js reads (codes[].id / codes[].show).
export function publicRules(rules) {
  const codes=Array.isArray(rules?.advisory_notes?.codes)?rules.advisory_notes.codes:[];
  return {advisory_notes:{codes:codes.filter(c=>typeof c?.id==='string'&&typeof c?.show==='string').map(c=>({id:c.id,show:c.show}))}};
}

const exact=(obj,keys,where,errors)=>{
  if(!obj||typeof obj!=='object'||Array.isArray(obj)){errors.push(where+' must be an object');return;}
  const actual=Object.keys(obj);
  if(actual.length!==keys.length||actual.some((k,i)=>k!==keys[i]))errors.push(where+' keys must be '+keys.join(','));
};

// Returns a list of problems; an empty list means the catalog is safe and usable to publish.
export function validateCatalog(catalog) {
  const errors=[];
  exact(catalog,TOP_KEYS,'catalog',errors);
  if(errors.length)return errors;
  if(catalog.schema!==SCHEMA)errors.push('schema must be '+SCHEMA);
  if(!Number.isFinite(Date.parse(catalog.updatedAt)))errors.push('updatedAt must be a date');
  if(typeof catalog.affiliateEnabled!=='boolean')errors.push('affiliateEnabled must be boolean');
  if(!Array.isArray(catalog.affiliateLinks))errors.push('affiliateLinks must be an array');
  else catalog.affiliateLinks.forEach((row,i)=>{exact(row,AFFILIATE_KEYS,'affiliateLinks['+i+']',errors);if(!Object.hasOwn(VARIANTS,row?.variant))errors.push('affiliateLinks['+i+'] has an unknown variant');});
  if(catalog.affiliateEnabled!==true&&catalog.affiliateLinks?.length)errors.push('affiliateLinks must be empty while affiliate is disabled');
  exact(catalog.db,[...DICTIONARY_KEYS,'rules'],'db',errors);
  if(errors.length)return errors;
  for(const key of DICTIONARY_KEYS) {
    const rows=catalog.db[key];
    if(!Array.isArray(rows)||!rows.length||rows.length>10000){errors.push('db.'+key+' has an unexpected size');continue;}
    rows.forEach((row,i)=>exact(row,DICTIONARY_COLUMNS,'db.'+key+'['+i+']',errors));
    if(!rows.some(r=>String(r.pilot01_use).toUpperCase()==='TRUE'))errors.push('db.'+key+' has no active rows');
  }
  if(!catalog.db.group.some(r=>r.alias==='BABYMONSTER'))errors.push('Missing target group');
  if(!catalog.db.member.some(r=>String(r.pilot01_use).toUpperCase()==='TRUE'))errors.push('Missing members');
  exact(catalog.db.rules,['advisory_notes'],'db.rules',errors);
  exact(catalog.db.rules?.advisory_notes,['codes'],'db.rules.advisory_notes',errors);
  const codes=catalog.db.rules?.advisory_notes?.codes;
  if(!Array.isArray(codes))errors.push('advisory codes must be an array');
  else codes.forEach((code,i)=>{exact(code,ADVISORY_KEYS,'advisory_notes.codes['+i+']',errors);if(typeof code?.show!=='string')errors.push('advisory show must be text');});
  // Scan values only: whitelisted key names such as pilot01_use are not private.
  const values=[];const walk=v=>{if(v&&typeof v==='object')Object.values(v).forEach(walk);else values.push(String(v));};walk(catalog);
  const text=values.join('\n');
  for(const pattern of PRIVATE_PATTERNS)if(pattern.test(text))errors.push('catalog contains private text: '+pattern);
  return errors;
}
