'use strict';
const GENS=[1,2,3,4],ROMAN={1:'I',2:'II',3:'III',4:'IV'};
const COLS=['pokemon','abilities','items','moves','effects','trainers','tms'];
/* Trainer encounters belong to an era: a generation plus, when the generation has more than one, a region.
   Remakes put two eras in one generation, like Gen III (Kanto) and Gen III (Hoenn). The era's generation decides
   the battle rules (DVs or EVs, items, abilities). "continues" names the era whose story it carries on, which is
   what "New" badges compare with. Eras come from "eras" in data/config.json, in the order the trainer page shows them.
   An encounter without one uses the first era of its generation. */
/* Each era sits in a timeline. The original games and the remakes tell the stories differently, so a trainer's
   page shows one timeline at a time. Timelines come from "timelines" in data/config.json, in display order. */
let TIMELINES=[{id:'original',name:'Original'},{id:'updated',name:'Updated'}];
const tlName=id=>TIMELINES.find(x=>x.id===id)?.name||id;
const tlOfEra=id=>{const x=ERAS.find(y=>y.id===id);return TIMELINES.some(t=>t.id===x?.timeline)?x.timeline:TIMELINES[0].id};
const tlOf=e=>tlOfEra(eraOf(e));
const erasIn=tl=>ERAS.filter(x=>tlOfEra(x.id)===tl);
let ERAS=[{id:'gen1',timeline:'original',gen:1,region:'Kanto'},{id:'gen2',timeline:'original',gen:2,region:'Johto',continues:'gen1'},{id:'gen3-kanto',timeline:'updated',gen:3,region:'Kanto'},{id:'gen3-hoenn',timeline:'updated',gen:3,region:'Hoenn'},{id:'gen4-johto',timeline:'updated',gen:4,region:'Johto',continues:'gen3-kanto'},{id:'gen4-sinnoh',timeline:'updated',gen:4,region:'Sinnoh'}];
const eraGet=id=>ERAS.find(x=>x.id===id);
const eraForGen=g=>(ERAS.find(x=>x.gen===g)||ERAS[0]).id;
const eraOf=e=>eraGet(e.era)?e.era:eraForGen(e.gen);
const eraIdx=id=>ERAS.findIndex(x=>x.id===id);
// The region shows only when its generation has more than one era: Gen I, Gen III (Kanto).
const eraShared=x=>ERAS.filter(y=>y.gen===x.gen).length>1;
const eraName=id=>{const x=eraGet(id);return x?`Gen ${ROMAN[x.gen]}${x.region&&eraShared(x)?` (${x.region})`:''}`:id};
const SLOT_NAMES=['Ability I','Ability II','Ability III'];
// From Gen IV a slot can share up to this many abilities, switched outside battle.
const SLOT_OPTS=3;
const STAT_MAX=255;
const NAV=[['dex','National Dex'],['types','Type Chart'],['abilities','Abilities'],['items','Items'],['moves','Moves'],['tms','TMs & HMs'],['mechanics','Battle Mechanics'],['trainers','Trainers'],['cmp','Compare'],['calc','Damage Calc']];
const CAT={Physical:'var(--hot)',Special:'var(--cool)',Variable:'linear-gradient(90deg,var(--hot) 50%,var(--cool) 50%)',Status:'var(--stat)'};
// Before Gen IV there is no per-move physical/special split: a damaging move's type decides it.
const SPLIT_FROM=4;
// Variable moves (Hidden Power) can be physical or special depending on the move. The category exists from Gen III.
const VARIABLE_FROM=3;
const catsAt=g=>Object.keys(CAT).filter(c=>c!=='Variable'||g>=VARIABLE_FROM);
const PHYSICAL_TYPES=['Normal','Fighting','Flying','Poison','Ground','Rock','Bug','Ghost','Steel','Dragon'];
const SPECIAL_TYPES=['Fire','Water','Grass','Electric','Psychic','Ice','Dark'];
const typeCat=t=>PHYSICAL_TYPES.includes(t)?'Physical':SPECIAL_TYPES.includes(t)?'Special':'';
// A move's data as it applies in gen g, with the category worked out from the type before the split.
function effMove(m,g){const e=eff(m,g);if(g<SPLIT_FROM&&e.category&&e.category!=='Status'&&!(e.category==='Variable'&&g>=VARIABLE_FROM))e.category=typeCat(e.type)||e.category;return e}
// Move targets. The double-battle ones only exist from Gen III.
const TARGETS={user:'The user',single:'One target',foes:'The opposing side',field:'The entire field'};
const DOUBLES_TARGETS=['foes','field'],CONTACT_FROM=3;
const targetsAt=g=>Object.keys(TARGETS).filter(k=>g>=3||!DOUBLES_TARGETS.includes(k));
const prioText=p=>p==null||p===''?'':p>0?'+'+p:String(p);
const contactText=c=>c===true?'Yes':c===false?'No':'';
const S={pokemon:{},abilities:{},items:{},moves:{},effects:{},trainers:{},tms:{},chart:null};
const UI={gen:4,route:'dex',arg:null,q:'',type:'All',cat:'All',group:'All',view:'all',when:'',timeline:'',tgroup:'all',newOnly:false,battleForms:false,sort:'dex',dir:1,msort:'name',mdir:1,sel:null,editChart:false,chartFuture:true,perPage:'all',page:0};
const PER_PAGE=[['25','25'],['50','50'],['100','100'],['all','Endless']];
let canEdit=false,loaded=false,failed=false,bodyFn=null,F=null,timer=0;
try{const g=+localStorage.getItem('gen');if(GENS.includes(g))UI.gen=g;const pp=localStorage.getItem('perPage');if(PER_PAGE.some(o=>o[0]===pp))UI.perPage=pp;const tg=localStorage.getItem('tgroup');if(['all','timeline','game'].includes(tg))UI.tgroup=tg}catch(e){}

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o??null));
const eq=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const blank=v=>v===undefined||v===null||v===''||(Array.isArray(v)&&v.length===0);
const pad=n=>n==null?'':String(n).padStart(4,'0');
const dash=v=>blank(v)?'—':esc(v);
/* A Pokémon can be renamed from a later generation on (gens[g].name); doc.name is the name it debuted with.
   pname gives the name in gen g. rows('pokemon') returns each Pokémon under its name in the generation being viewed. */
const pname=(v,g=UI.gen)=>{const p=typeof v==='string'?S.pokemon[v]:v;if(!p)return typeof v==='string'?v:'';return eff(p,g).name||p.name||''};
// Paradox Pokémon and the like: the descriptive name they had when first found, before getting their actual name.
const discName=(p,g=UI.gen)=>{const n=eff(p,g).discoveryName;return n&&n!==pname(p,g)?n:''};
const rows=c=>Object.entries(S[c]).map(([id,d])=>c==='pokemon'?{id,...d,name:pname(d),disc:discName(d)}:{id,...d});
// Pokémon names are matched in the given generation first, then by debut name, then by any generation's name.
const byName=(c,n,g=UI.gen)=>{const t=String(n||'').trim().toLowerCase(),ks=Object.keys(S[c]),is=x=>(x||'').toLowerCase()===t;
  if(c!=='pokemon')return ks.find(k=>is(S[c][k].name))||null;
  return ks.find(k=>is(pname(k,g)))||ks.find(k=>is(S.pokemon[k].name))||ks.find(k=>Object.values(S.pokemon[k].gens||{}).some(x=>is(x.name)||is(x.discoveryName)))||null};
const label=(c,v)=>c==='pokemon'?(S.pokemon[v]?pname(v):v??''):S[c][v]?.name??v??'';
const ref=(c,t)=>byName(c,t)||String(t||'').trim();
const slug=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
function newId(c,name){const b=slug(name)||('x'+Date.now().toString(36));let id=b,i=2;while(S[c][id])id=b+'-'+i++;return id}
function eff(doc,gen){const o={};for(const g of GENS)if(g<=gen&&doc?.gens?.[g])Object.assign(o,doc.gens[g]);return o}
const changed=(d,gen)=>gen>(d.debut||1)&&!eq(eff(d,gen),eff(d,gen-1));
function applyGen(doc,gen,patch){
  const before=eff(doc,gen-1),entry=clone(doc.gens?.[gen])||{};
  for(const k of Object.keys(patch)){const v=patch[k];if(eq(v,before[k])||(blank(v)&&blank(before[k])))delete entry[k];else entry[k]=v}
  doc.gens=doc.gens||{};
  if(Object.keys(entry).length)doc.gens[gen]=entry;else delete doc.gens[gen];
}
function typeColor(t){const m=(S.chart?.types||[]).find(x=>x.name===t);return /^#[0-9a-f]{6}$/i.test(m?.color||'')?m.color:'#8A94A1'}
function fgFor(hex){const n=parseInt(hex.slice(1),16),l=[n>>16,n>>8&255,n&255].map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});const L=.2126*l[0]+.7152*l[1]+.0722*l[2];return (1.05/(L+.05))>((L+.05)/.0578)?'#FFFFFF':'#10161F'}
function chipText(t){const c=typeColor(t);return `<span class="chip" style="background:${c};color:${fgFor(c)}">${esc(t)}</span>`}
function chip(t){const c=typeColor(t);return `<a class="chip" href="${typeHref(t)}" style="background:${c};color:${fgFor(c)}">${esc(t)}</a>`}
const chips=ts=>(ts||[]).length?`<span class="chips">${ts.map(t=>chip(t)).join('')}</span>`:'<span class="muted">No type set</span>';
const RAW='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/';
const artNo=p=>p.art!==undefined?(p.art||null):(p.dex&&p.dex<=493?p.dex:null);
function pokeArt(p,gen,e){
  if(e.sprite)return['data/sprites/'+e.sprite];
  const a=artNo(p);if(!a)return[];
  // Plain Dex numbers start at the Pokémon's debut gen; forms (422-east, 10013) try the viewed gen first, then later gens.
  const dexNo=/^\d+$/.test(String(a))&&+a<=493?+a:0,from=dexNo?Math.max(gen,dexNo<=151?1:dexNo<=251?2:dexNo<=386?3:4):Math.min(gen,4);
  const file={1:`generation-i/red-blue/transparent/${a}.png`,2:`generation-ii/crystal/transparent/${a}.png`,3:`generation-iii/emerald/${a}.png`,4:`generation-iv/platinum/${a}.png`};
  const out=[];for(let g=from;g<=4;g++)out.push(RAW+'pokemon/versions/'+file[g]);
  return[...out,RAW+`pokemon/${a}.png`];
}
function tile(name,type,srcs,size){
  const c=typeColor(type),has=srcs&&srcs.length;
  const s=`width:${size}px;height:${size}px;font-size:${Math.round(size*.55)}px;background:${has?'var(--well)':type?c:'var(--soft)'};color:${has||!type?'var(--ink)':fgFor(c)}`;
  return `<span class="tile" style="${s}" aria-hidden="true">${esc((name||'?')[0])}${has?`<img src="${esc(srcs[0])}" data-alt="${esc(srcs.slice(1).join('|'))}" alt="" loading="lazy">`:''}</span>`;
}
const pokeTile=(p,e,g,size)=>tile(pname(p,g),(e.types||[])[0],pokeArt(p,g,e),size);
const trainerTile=(t,size)=>tile(t.name,null,t.sprite?['data/sprites/'+t.sprite]:[`https://play.pokemonshowdown.com/sprites/trainers/${slug(t.name)}.png`],size);
const itemIcon=(id)=>S.items[id]||id?`<img class="icon" src="${esc(RAW+'items/'+(S.items[id]?id:slug(id))+'.png')}" alt="" loading="lazy">`:'';
const pokeLink=(v)=>S.pokemon[v]?`<a href="#p-${esc(v)}">${esc(pname(v))}</a>`:esc(v||'');
const moveLink=(v)=>S.moves[v]?`<a href="#m-${esc(v)}">${esc(S.moves[v].name)}</a>`:esc(v||'');

/* Type chart */
const typesAt=g=>(S.chart?.types||[]).filter(t=>(t.debut||1)<=g).map(t=>t.name);
function cell(g,a,d,c=S.chart){const k=a+'|'+d;for(let i=g;i>=1;i--){const m=c?.gens?.[i]?.cells;if(m&&k in m)return m[k]}return 1}
const mult=m=>m===.5?'½':m===.25?'¼':String(m);

/* Stats */
function statsAt(e,g){const s=e.stats||{};return g===1
  ?[['hp','HP',s.hp],['atk','Attack',s.atk],['def','Defense',s.def],['spc','Special',s.spc??s.spa],['spe','Speed',s.spe]]
  :[['hp','HP',s.hp],['atk','Attack',s.atk],['def','Defense',s.def],['spa','Sp. Atk',s.spa??s.spc],['spd','Sp. Def',s.spd??s.spc],['spe','Speed',s.spe]]}
// Lv. 100 stat range.
// Gen I-II: 0 DV/0 Stat Exp to 15 DV (+30) and 65,535 Stat Exp (floor(ceil(sqrt(65535))/4) = +64); no natures.
// Gen III+: HP 2B+110 to 2B+105+110; others floor((2B+5)*0.9) to floor((2B+105+5)*1.1).
// m multiplies the final stat, for abilities like Huge Power.
const statRange=(k,b,g,m=1)=>{if(b==null)return '—';const r=g<=2
  ?(k==='hp'?[2*b+110,2*b+204]:[2*b+5,2*b+99])
  :(k==='hp'?[2*b+110,2*b+215]:[Math.floor((2*b+5)*0.9),Math.floor((2*b+110)*1.1)]);return r.map(x=>Math.floor(x*m)).join(' - ')};
// Abilities that multiply the user's stats (Huge Power, Solar Power): statMults is {stat key: multiplier}, boostWhen an optional
// condition ("in sun"). Gives {a: id, name, when, mults}.
const BOOST_STATS=[['atk','Attack'],['def','Defense'],['spa','Sp. Atk'],['spd','Sp. Def'],['spe','Speed']];
const statBoosts=(slots,g)=>g<3?[]:[...new Set((slots||[]).flat())].map(a=>{const x=eff(S.abilities[a]||{},g),mults=Object.fromEntries(Object.entries(x.statMults||{}).filter(([k,m])=>BOOST_STATS.some(s=>s[0]===k)&&m>0&&m!==1));
  return Object.keys(mults).length?{a,name:label('abilities',a),when:x.boostWhen||'',mults}:null}).filter(Boolean);
const total=(e,g)=>{const v=statsAt(e,g).map(x=>x[2]);return v.some(x=>x==null)?null:v.reduce((a,b)=>a+b,0)};
const slotText=(sl)=>(sl||[]).map(o=>o.map(a=>label('abilities',a)).join(' / '));

/* Change notes for a Pokémon, worked out by comparing two generations */
function pokeChanges(p,g){
  if(g===(p.debut||1))return[`${pname(p,g)} debuts in Gen ${ROMAN[g]}.`];
  const a=eff(p,g-1),b=eff(p,g),out=[];
  if(pname(p,g-1)!==pname(p,g))out.push(`Renamed from ${pname(p,g-1)} to ${pname(p,g)}.`);
  if((a.discoveryName||'')!==(b.discoveryName||''))out.push(b.discoveryName?`Discovery name: ${b.discoveryName}.`:'Discovery name removed.');
  if(!blank(a.types)&&!eq(a.types,b.types))out.push(`Type: ${(a.types||[]).join('/')||'none'} to ${(b.types||[]).join('/')||'none'}.`);
  if(g===2&&a.stats?.spc!=null&&b.stats?.spa!=null&&!eq(a.stats,b.stats))out.push(`Special splits into Sp. Atk ${b.stats.spa} and Sp. Def ${b.stats.spd}.`);
  else{const x=statsAt(a,g),y=statsAt(b,g);x.forEach((s,i)=>{if(s[2]!==y[i][2]&&s[2]!=null)out.push(`${s[1]}: ${s[2]??'none'} to ${y[i][2]??'none'}.`)})}
  const sa=slotText(a.abilitySlots),sb=slotText(b.abilitySlots);
  for(let i=0;i<3;i++)if(sa[i]!==sb[i])out.push(sa[i]?`${SLOT_NAMES[i]}: ${sa[i]} to ${sb[i]||'none'}.`:`${SLOT_NAMES[i]}: adds ${sb[i]}.`);
  if((a.evolvesFrom||a.evoMethod)&&(a.evolvesFrom!==b.evolvesFrom||a.evoMethod!==b.evoMethod))out.push('Evolution changed.');
  if(!eq(a.evoAlts||[],b.evoAlts||[]))out.push((b.evoAlts||[]).length?`Can also evolve from ${b.evoAlts.map(x=>label('pokemon',x.from)+(x.method?` (${x.method})`:'')).join(', ')}.`:'Other evolution sources removed.');
  if((a.evoMethod2||'')!==(b.evoMethod2||''))out.push(!b.evoMethod2?'Second evolution method removed.':a.evoMethod2?`Second evolution method: ${a.evoMethod2} to ${b.evoMethod2}.`:`Adds a second evolution method: ${b.evoMethod2}.`);
  if((!blank(a.eggGroups)||a.eggCycles!=null||a.genderM!=null||a.hatchesAs)&&(!eq(a.eggGroups,b.eggGroups)||a.genderM!==b.genderM||a.eggCycles!==b.eggCycles||a.hatchesAs!==b.hatchesAs||!eq(a.hatchAlts||[],b.hatchAlts||[])))out.push('Breeding changed.');
  if(!blank(a.forms)&&!eq(a.forms,b.forms))out.push('Form changes updated.');
  if(hasVitals(a)&&(a.species!==b.species||a.height!==b.height||a.weight!==b.weight||a.growthRate!==b.growthRate))out.push('Vitals changed.');
  if(a.sprite&&a.sprite!==b.sprite)out.push('New sprite.');
  return out.length?out:['No changes from the previous generation.'];
}
/* Alternate forms (Darmanitan-Zen) are their own records pointing at the base Pokémon with formOf. */
const baseOf=id=>{const f=S.pokemon[id]?.formOf;return f&&S.pokemon[f]&&f!==id?f:id};
const isForm=id=>baseOf(id)!==id;
// How long a form lasts comes from the base Pokémon's form-change entry with the form's name.
const formKind=(id,g)=>{const b=baseOf(id);if(b===id)return '';const ns=[pname(id,g),S.pokemon[id].name].map(x=>x.toLowerCase());return (eff(S.pokemon[b],g).forms||[]).find(x=>ns.includes((x.name||'').toLowerCase()))?.kind||''};
// Permanent and reversible forms are listed in the Dex; battle-only forms only when that box is ticked.
const inDex=(p,g)=>(p.debut||1)<=g&&(!isForm(p.id)||UI.battleForms||formKind(p.id,g)!=='Battle only');
/* Regional variants (Alolan Vulpix) are forms with a "variant" name. Unlike form changes, a variant is its own line:
   it has its own evolution chain and is never switched to from the base Pokémon. */
const isVariant=id=>isForm(id)&&!!S.pokemon[id]?.variant;
const formsOf=(base,g)=>Object.keys(S.pokemon).filter(k=>k!==base&&S.pokemon[k].formOf===base&&(S.pokemon[k].debut||1)<=g).sort((a,b)=>pname(a,g).localeCompare(pname(b,g)));
function family(p,g){
  const seen=new Set();let root=p.id;
  for(;;){if(seen.has(root))break;seen.add(root);const up=eff(S.pokemon[root],g).evolvesFrom;if(!up||!S.pokemon[up]||(S.pokemon[up].debut||1)>g)break;root=up}
  const stages=[],visited=new Set([root]);let level=[root];
  while(level.length){stages.push(level);const next=[];for(const id of level)for(const c of Object.keys(S.pokemon))if(!visited.has(c)&&(S.pokemon[c].debut||1)<=g&&eff(S.pokemon[c],g).evolvesFrom===id){visited.add(c);next.push(c)}level=next}
  return stages;
}

/* Theme */
function themeNow(){const t=document.documentElement.dataset.theme;return t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}
function toggleTheme(){const t=themeNow()==='dark'?'light':'dark';document.documentElement.dataset.theme=t;try{localStorage.setItem('theme',t)}catch(e){}renderChrome()}

/* Rendering */
function schedule(){clearTimeout(timer);timer=setTimeout(render,30)}
function fillLists(){
  const opt=a=>[...new Set(a.filter(Boolean))].sort().map(n=>`<option value="${esc(n)}"></option>`).join('');
  $('dl-pokemon').innerHTML=opt(rows('pokemon').map(x=>x.name));
  $('dl-abilities').innerHTML=opt(rows('abilities').map(x=>x.name));
  $('dl-items').innerHTML=opt(rows('items').map(x=>x.name));
  $('dl-moves').innerHTML=opt(rows('moves').map(x=>x.name));
  $('dl-eggs').innerHTML=opt(rows('pokemon').flatMap(p=>GENS.flatMap(g=>p.gens?.[g]?.eggGroups||[])));
  $('dl-itemcats').innerHTML=opt(rows('items').flatMap(i=>GENS.map(g=>i.gens?.[g]?.category)));
  $('dl-groups').innerHTML=opt(['Weather','Terrain','Field','Major','Volatile',...rows('effects').flatMap(e=>GENS.map(g=>e.gens?.[g]?.group))]);
}
function renderChrome(){
  const dark=themeNow()==='dark';$('theme').textContent=dark?'Light mode':'Dark mode';$('addmon').hidden=!canEdit;
  const cur=({p:'dex',m:'moves',a:'abilities',t:'trainers',ty:'types',combos:'types'})[UI.route]||UI.route;
  $('nav').innerHTML=NAV.map(([k,l])=>`<a href="#${k}"${k===cur?' aria-current="page"':''}>${l}</a>`).join('');
  const allGens=cur==='trainers';
  $('genpick').innerHTML=allGens?'<span>All generations</span>':'<span>Generation</span>'+GENS.map(g=>`<button type="button" class="genbtn" data-act="gen" data-v="${g}" aria-pressed="${g===UI.gen}" aria-label="Generation ${ROMAN[g]}">${ROMAN[g]}</button>`).join('');
}
function render(){
  fillLists();renderChrome();bodyFn=null;
  const fn=PAGES[UI.route]||PAGES.dex;
  $('app').innerHTML=(failed?'<p class="error">The data files could not be read. Run the tracker with start.bat, not by opening index.html directly.</p>':'')+fn();
  if(bodyFn)renderBody();
  dmgFill();
}
function renderBody(){const b=$('body');if(b&&bodyFn)b.innerHTML=bodyFn()}
const titleBar=(t,sub,action)=>`<div class="title"><div><h1>${esc(t)}</h1>${sub?`<p class="sub">${sub}</p>`:''}</div>${action||''}</div>`;
const addBtn=(label,act,extra='')=>canEdit?`<button type="button" class="btn primary" data-act="${act}" ${extra}>${esc(label)}</button>`:'';
const search=(ph)=>`<label class="ctl" style="flex:1 1 240px;max-width:380px">Search by name<input id="q" type="search" data-model="q" value="${esc(UI.q)}" placeholder="${esc(ph)}"></label>`;
const viewToggle=(all)=>`<div class="btns push" role="group" aria-label="View">${[['all',all],['gen','By generation']].map(([k,l])=>`<button type="button" class="btn" data-act="view" data-v="${k}" aria-pressed="${UI.view===k}">${l}</button>`).join('')}</div>`;
const typeSelect=(id='type')=>`<label class="ctl" style="flex:0 1 180px">Type<select id="${id}" data-model="type"><option value="All">All types</option>${typesAt(UI.gen).map(t=>`<option${UI.type===t?' selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
const emptyMsg=(msg,act,lab)=>`<div class="empty"><p>${msg}</p>${canEdit&&act?`<button type="button" class="btn primary" data-act="${act}">${esc(lab)}</button>`:''}</div>`;
const loading=()=>`<div class="empty"><p>Loading your data.</p></div>`;
function grouped(list,table){
  if(UI.view!=='gen')return table(list);
  return GENS.filter(g=>g<=UI.gen).map(g=>{const r=list.filter(x=>(x.debut||1)===g);return r.length?`<h2 class="genhead">Gen ${ROMAN[g]}</h2>${table(r)}`:''}).join('');
}
const matchQ=(x)=>{const q=UI.q.trim().toLowerCase();return !q||(x.name||'').toLowerCase().includes(q)||(x.disc||'').toLowerCase().includes(q)};
const editCell=(act,id)=>canEdit?`<td class="mid"><button type="button" class="btn small" data-act="${act}" data-id="${esc(id)}" aria-label="Edit">Edit</button></td>`:'';
const editHead=()=>canEdit?'<th><span class="muted" style="color:inherit">Edit</span></th>':'';
const changedTag=(d)=>changed(d,UI.gen)?` <span class="pill">Changed in Gen ${ROMAN[UI.gen]}</span>`:'';

const PAGES={
  dex(){
    bodyFn=dexBody;
    return titleBar('National Dex',`Every Pokémon available in Gen ${ROMAN[UI.gen]}, shown with Gen ${ROMAN[UI.gen]} data.`,addBtn('Add Pokémon','new-pokemon'))+
    `<div class="toolbar">${search('Search')}${typeSelect()}${UI.gen>1?`<label class="check"><input id="newOnly" type="checkbox" data-model="newOnly"${UI.newOnly?' checked':''}>New in Gen ${ROMAN[UI.gen]} only</label>`:''}<label class="check"><input id="battleForms" type="checkbox" data-model="battleForms"${UI.battleForms?' checked':''}>Show battle-only forms</label><label class="ctl push" style="flex:0 1 150px">Pokémon per page<select id="perPage" data-model="perPage">${PER_PAGE.map(([k,l])=>`<option value="${k}"${UI.perPage===k?' selected':''}>${l}</option>`).join('')}</select></label></div><div id="body"></div>`;
  },
  types(){
    return titleBar('Type Chart',`Gen ${ROMAN[UI.gen]} matchups. Rows attack and columns defend.`,canEdit?`<div class="btns">${UI.editChart?'<button type="button" class="btn" data-act="add-type">Add type</button>':''}<button type="button" class="btn${UI.editChart?' primary':''}" data-act="edit-chart" aria-pressed="${UI.editChart}">${UI.editChart?'Done editing':'Edit chart'}</button></div>`:'')+chartTabs('types')+chartPage();
  },
  combos(){
    return titleBar('Type Combinations',`Every pure and dual typing, and whether any Pokémon has had it from Gen I through Gen ${ROMAN[UI.gen]}.`)+chartTabs('combos')+comboPage();
  },
  abilities(){bodyFn=abilityBody;return titleBar('Abilities','',addBtn('Add ability','new-abilities'))+`<div class="toolbar">${search('Search')}${viewToggle('All abilities')}</div><div id="body" style="display:flex;flex-direction:column;gap:18px"></div>`},
  items(){bodyFn=itemBody;const cats=[...new Set(rows('items').map(i=>eff(i,UI.gen).category).filter(Boolean))].sort();
    return titleBar('Items','',addBtn('Add item','new-items'))+`<div class="toolbar">${search('Search')}<label class="ctl" style="flex:0 1 200px">Category<select id="cat" data-model="cat"><option value="All">All categories</option>${cats.map(c=>`<option${UI.cat===c?' selected':''}>${esc(c)}</option>`).join('')}</select></label>${viewToggle('All items')}</div><div id="body" style="display:flex;flex-direction:column;gap:18px"></div>`},
  moves(){bodyFn=moveBody;return titleBar('Moves','',addBtn('Add move','new-moves'))+`<div class="toolbar">${search('Search')}${typeSelect()}<label class="ctl" style="flex:0 1 170px">Category<select id="cat" data-model="cat"><option value="All">All categories</option>${catsAt(UI.gen).map(c=>`<option${UI.cat===c?' selected':''}>${c}</option>`).join('')}</select></label>${viewToggle('All moves')}</div><div id="body" style="display:flex;flex-direction:column;gap:18px"></div>`},
  mechanics(){return mechanicsPage()},
  trainers(){return trainerList()},
  p(){return pokemonPage(UI.arg)},
  m(){return movePage(UI.arg)},
  a(){return abilityPage(UI.arg)},
  t(){return trainerPage(UI.arg)},
  ty(){return typePage(UI.arg)},
  cmp(){return comparePage()},
  tms(){return tmPage()},
  calc(){return calcPage()}
};

function dexBody(){
  if(!loaded)return loading();
  const g=UI.gen;
  let list=rows('pokemon').filter(p=>inDex(p,g)).filter(matchQ);
  if(UI.newOnly&&g>1)list=list.filter(p=>(p.debut||1)===g);
  if(UI.type!=='All')list=list.filter(p=>(eff(p,g).types||[]).includes(UI.type));
  if(!rows('pokemon').length)return emptyMsg('Your Dex is empty. Add your first Pokémon, new or existing, and fill in its typing, stats, abilities, evolution and breeding.','new-pokemon','Add Pokémon');
  if(!list.length)return emptyMsg('No Pokémon match these filters.');
  const keys=statsAt({},g).map(s=>s[0]);
  const val=(p)=>{const e=eff(p,g);if(UI.sort==='dex')return p.dex??1e9;if(UI.sort==='name')return p.name||'';if(UI.sort==='bst')return total(e,g)??-1;return (statsAt(e,g).find(s=>s[0]===UI.sort)||[])[2]??-1};
  list.sort((a,b)=>{const x=val(a),y=val(b);return (typeof x==='string'?x.localeCompare(y):x-y)*UI.dir||(a.dex??0)-(b.dex??0)||isForm(a.id)-isForm(b.id)||a.name.localeCompare(b.name)});
  const size=UI.perPage==='all'?list.length:+UI.perPage,pages=Math.max(1,Math.ceil(list.length/size)),count=list.length;
  UI.page=Math.min(Math.max(UI.page,0),pages-1);
  const start=UI.page*size;list=list.slice(start,start+size);
  const pager=(where)=>pages<2?'':`<nav class="pager" aria-label="Dex pages, ${where}"><button type="button" class="btn small" data-act="page" data-v="-1"${UI.page===0?' disabled':''} aria-label="Previous page">← Previous</button><span class="muted">Page ${UI.page+1} of ${pages} · ${start+1}–${start+list.length} of ${count}</span><button type="button" class="btn small" data-act="page" data-v="1"${UI.page===pages-1?' disabled':''} aria-label="Next page">Next →</button></nav>`;
  const arrow=k=>UI.sort===k?(UI.dir>0?' ↑':' ↓'):'';
  const short={hp:'HP',atk:'Atk',def:'Def',spa:'SpA',spd:'SpD',spc:'Spc',spe:'Spe'};
  const th=(k,l)=>`<th class="num"><button type="button" data-act="sort" data-v="${k}">${l}${arrow(k)}</button></th>`;
  return `${pager('top')}<div class="box" id="dextable"><table style="min-width:980px"><thead><tr><th><button type="button" data-act="sort" data-v="dex">No.${arrow('dex')}</button></th><th aria-label="Sprite"></th><th><button type="button" data-act="sort" data-v="name">Name${arrow('name')}</button></th><th>Type</th><th>Abilities</th>${keys.map(k=>th(k,short[k])).join('')}${th('bst','Total')}</tr></thead><tbody>${list.map(p=>{const e=eff(p,g),st=statsAt(e,g);
    return `<tr><td class="mono mid muted">${pad(p.dex)}</td><td class="mid">${pokeTile(p,e,g,40)}</td><td class="mid name"><a href="#p-${esc(p.id)}">${esc(p.name)}</a>${discName(p,g)?`<small class="discsmall">${esc(discName(p,g))}</small>`:''}${changedTag(p)}</td><td class="mid">${chips(e.types)}</td><td class="mid">${g<3?'<span class="muted">—</span>':(slotText(e.abilitySlots).map(esc).join('<br>')||'<span class="muted">Not set</span>')}</td>${st.map(s=>`<td class="num mono mid">${dash(s[2])}</td>`).join('')}<td class="num mono mid name">${dash(total(e,g))}</td></tr>`}).join('')}</tbody></table></div>${pages<2?`<p class="hint">${count} shown</p>`:pager('bottom')}`;
}

function abilityBody(){
  if(!loaded)return loading();
  const g=UI.gen;
  if(g<3)return emptyMsg('Abilities arrive in Gen III. Switch to Gen III or IV to see them.');
  const list=rows('abilities').filter(a=>(a.debut||3)<=g).filter(matchQ).sort((a,b)=>a.name.localeCompare(b.name));
  if(!rows('abilities').length)return emptyMsg('No abilities yet. Add your first one, or type a new ability on a Pokémon and it appears here.','new-abilities','Add ability');
  if(!list.length)return emptyMsg('No abilities match that search.');
  const users=a=>rows('pokemon').filter(p=>(p.debut||1)<=g&&(eff(p,g).abilitySlots||[]).some(o=>o.includes(a.id))).sort((x,y)=>(x.dex??0)-(y.dex??0));
  const table=r=>`<div class="box"><table style="min-width:900px"><thead><tr><th>Name</th><th>Flavor text</th><th>Actual effect</th><th>Users</th><th>Gen</th>${editHead()}</tr></thead><tbody>${r.map(a=>{const e=eff(a,g),u=users(a);
    return `<tr><td class="name"><a href="#a-${esc(a.id)}">${esc(a.name)}</a>${changedTag(a)}</td><td class="flavor">${dash(e.flavor)}</td><td>${dash(e.effect)}</td><td>${u.map(p=>pokeLink(p.id)).join(', ')||'<span class="muted">None yet</span>'}</td><td class="mono">${ROMAN[a.debut||3]}</td>${editCell('edit-abilities',a.id)}</tr>`}).join('')}</tbody></table></div>`;
  return grouped(list,table);
}
function itemBody(){
  if(!loaded)return loading();
  const g=UI.gen;
  let list=rows('items').filter(i=>(i.debut||1)<=g).filter(matchQ);
  if(UI.cat!=='All')list=list.filter(i=>eff(i,g).category===UI.cat);
  list.sort((a,b)=>a.name.localeCompare(b.name));
  if(!rows('items').length)return emptyMsg('No items yet. Add your first one.','new-items','Add item');
  if(!list.length)return emptyMsg('No items match these filters.');
  const table=r=>`<div class="box"><table style="min-width:860px"><thead><tr><th>Name</th><th>Category</th><th>Flavor text</th><th>Actual effect</th><th>Gen</th>${editHead()}</tr></thead><tbody>${r.map(i=>{const e=eff(i,g);return `<tr><td class="name"><span class="withicon">${itemIcon(i.id)}${esc(i.name)}</span>${changedTag(i)}</td><td>${dash(e.category)}</td><td class="flavor">${dash(e.flavor)}</td><td>${dash(e.effect)}</td><td class="mono">${ROMAN[i.debut||1]}</td>${editCell('edit-items',i.id)}</tr>`}).join('')}</tbody></table></div>`;
  return grouped(list,table);
}
function moveBody(){
  if(!loaded)return loading();
  const g=UI.gen;
  let list=rows('moves').filter(m=>(m.debut||1)<=g).filter(matchQ);
  if(UI.type!=='All')list=list.filter(m=>eff(m,g).type===UI.type);
  if(UI.cat!=='All')list=list.filter(m=>effMove(m,g).category===UI.cat);
  // Sort by the clicked column. Moves with no value for it always go last, whichever way it runs.
  const MV={name:m=>m.name||'',type:m=>effMove(m,g).type||'',category:m=>effMove(m,g).category||'',power:m=>effMove(m,g).power,accuracy:m=>effMove(m,g).accuracy,pp:m=>effMove(m,g).pp,effect:m=>effMove(m,g).effect||'',gen:m=>m.debut||1};
  const mv=MV[UI.msort]||MV.name,none=x=>x==null||x==='';
  list.sort((a,b)=>{const x=mv(a),y=mv(b);if(none(x)||none(y))return none(x)-none(y)||a.name.localeCompare(b.name);return (typeof x==='string'?x.localeCompare(y):x-y)*UI.mdir||a.name.localeCompare(b.name)});
  const mth=(k,l,num)=>{const on=UI.msort===k;return `<th${num?' class="num"':''}${on?` aria-sort="${UI.mdir>0?'ascending':'descending'}"`:''}><button type="button" data-act="msort" data-v="${k}">${l}${on?(UI.mdir>0?' ↑':' ↓'):''}</button></th>`};
  if(!rows('moves').length)return emptyMsg('No moves yet. Add your first one.','new-moves','Add move');
  if(!list.length)return emptyMsg('No moves match these filters.');
  const table=r=>`<div class="box"><table style="min-width:900px"><thead><tr>${mth('name','Name')}${mth('type','Type')}${mth('category','Category')}${mth('power','Power',1)}${mth('accuracy','Accuracy',1)}${mth('pp','PP',1)}${mth('effect','Effect')}${mth('gen','Gen')}</tr></thead><tbody>${r.map(m=>{const e=effMove(m,g);
    return `<tr><td class="name mid"><a href="#m-${esc(m.id)}">${esc(m.name)}</a>${changedTag(m)}</td><td class="mid">${e.type?chip(e.type):'—'}</td><td class="mid">${e.category?`<span class="cat" style="background:${CAT[e.category]||'var(--soft)'}">${esc(e.category)}</span>`:'—'}</td><td class="num mono mid">${dash(e.power)}</td><td class="num mono mid">${dash(e.accuracy)}</td><td class="num mono mid">${dash(e.pp)}</td><td class="mid">${dash(e.effect)}</td><td class="mono mid">${ROMAN[m.debut||1]}</td></tr>`}).join('')}</tbody></table></div>`;
  return grouped(list,table);
}
function effectBody(kind){
  if(!loaded)return loading();
  const g=UI.gen,all=rows('effects').filter(e=>e.kind===kind);
  let list=all.filter(e=>(e.debut||1)<=g).filter(matchQ);
  if(UI.group!=='All')list=list.filter(e=>eff(e,g).group===UI.group);
  list.sort((a,b)=>a.name.localeCompare(b.name));
  if(!all.length)return `<div class="empty"><p>Nothing here yet. Add your first ${kind==='battle'?'weather, terrain or field effect':'status effect'}.</p>${canEdit?`<button type="button" class="btn primary" data-act="new-effect" data-v="${kind}">Add effect</button>`:''}</div>`;
  if(!list.length)return emptyMsg('Nothing matches these filters.');
  const table=r=>`<div class="box"><table style="min-width:760px"><thead><tr><th>Name</th><th>Group</th><th>Flavor text</th><th>Actual effect</th><th>Gen</th>${editHead()}</tr></thead><tbody>${r.map(x=>{const e=eff(x,g);return `<tr><td class="name">${esc(x.name)}${changedTag(x)}</td><td>${dash(e.group)}</td><td class="flavor">${dash(e.flavor)}</td><td>${dash(e.effect)}</td><td class="mono">${ROMAN[x.debut||1]}</td>${editCell('edit-effects',x.id)}</tr>`}).join('')}</tbody></table></div>`;
  return grouped(list,table);
}

function chartPage(){
  if(!S.chart)return loaded?emptyMsg('The type chart has not been set up yet.'):loading();
  const g=UI.gen,ts=typesAt(g);
  if(!ts.length)return emptyMsg('No types in this generation yet.');
  const sel=ts.includes(UI.sel)?UI.sel:ts[0];
  const hdr=(t,cls)=>{const on=t===sel,c=typeColor(t);return `<button type="button" class="hdr ${cls}" data-act="sel" data-v="${esc(t)}" aria-label="Select ${esc(t)}" style="background:${on?'var(--ink)':c};color:${on?'var(--surface)':fgFor(c)}">${esc(cls?t:t.slice(0,3).toUpperCase())}</button>`};
  const cellHtml=(a,d)=>{const m=cell(g,a,d),lit=a===sel||d===sel;
    const st=m===2?['var(--hot)','var(--on-data)','2']:m===.5?['var(--cool)','var(--on-data)','½']:m===0?['var(--zero)','var(--on-zero)','0']:[lit?'var(--line)':'var(--soft)','var(--ink)',''];
    const style=`background:${st[0]};color:${st[1]}`,title=`${a} against ${d}: ×${mult(m)}`;
    return UI.editChart?`<button type="button" class="c" data-act="cell" data-a="${esc(a)}" data-d="${esc(d)}" style="${style}" aria-label="${esc(title)}. Change.">${st[2]}</button>`:`<span class="c" title="${esc(title)}" style="${style}">${st[2]}</span>`};
  const bucket=(list,val)=>[[2,'×2'],[.5,'×½'],[0,'×0']].map(([m,l])=>{const t=list.filter(x=>val(x)===m);return t.length?`<div style="margin-bottom:8px"><span class="muted" style="font-size:13px">${l}</span><div class="chips" style="margin-top:2px">${t.map(chip).join('')}</div></div>`:''}).join('')||'<p class="muted" style="margin:0 0 8px">Neutral against everything.</p>';
  const notes=[];
  if(g>1){(S.chart.types||[]).filter(t=>t.debut===g).forEach(t=>notes.push(`${t.name} joins the chart.`));
    const old=typesAt(g-1);old.forEach(a=>old.forEach(d=>{const x=cell(g-1,a,d),y=cell(g,a,d);if(x!==y)notes.push(`${a} against ${d}: ×${mult(x)} to ×${mult(y)}.`)}))}
  return `<div class="chartwrap"><div class="chartbox">
    <div class="legend"><span><b style="background:var(--hot)">2</b>Super effective</span><span><b style="background:var(--cool)">½</b>Not very effective</span><span><b style="background:var(--zero);color:var(--on-zero)">0</b>No effect</span></div>${UI.editChart?`<div class="chartopts"><span>Click a cell to change it in Gen ${ROMAN[g]}.</span>${g<4?`<label class="check"><input id="chartFuture" type="checkbox" data-model="chartFuture"${UI.chartFuture?' checked':''}>Apply to future generations</label>`:''}</div>`:''}
    <table class="grid"><thead><tr><th></th>${ts.map(t=>`<th>${hdr(t,'')}</th>`).join('')}</tr></thead><tbody>${ts.map(a=>`<tr><th>${hdr(a,'rowhdr')}</th>${ts.map(d=>`<td>${cellHtml(a,d)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="chartside"><section class="card"><h2><span class="chip" style="font-size:18px;padding:3px 12px;background:${typeColor(sel)};color:${fgFor(typeColor(sel))}">${esc(sel)}</span></h2>
    <h3 style="margin:0 0 6px;font-size:14px">When attacking</h3>${bucket(ts,t=>cell(g,sel,t))}
    <h3 style="margin:12px 0 6px;font-size:14px">When defending</h3>${bucket(ts,t=>cell(g,t,sel))}
    <a class="btn small" href="${typeHref(sel)}" style="margin-top:6px">Open the ${esc(sel)} page</a>
    ${UI.editChart?`<button type="button" class="btn small danger" data-act="del-type" data-v="${esc(sel)}">Remove ${esc(sel)}</button>`:''}</section>
    <section class="card"><h2 style="font-size:22px">Changed in Gen ${ROMAN[g]}</h2>${notes.length?`<ul style="margin:0;padding-left:18px">${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:`<p class="muted" style="margin:0">${g===1?'This is the starting chart.':'Same as the previous generation.'}</p>`}</section></div></div>`;
}

// Tabs between the type chart and its sub-pages.
const chartTabs=cur=>`<nav class="formtabs" aria-label="Type chart pages">${[['types','Matchups'],['combos','Type combinations']].map(([k,l])=>`<a href="#${k}"${k===cur?' aria-current="page"':''}>${l}</a>`).join('')}</nav>`;

/* Type combinations: which pure and dual typings any Pokémon has had, cumulatively up to the generation being viewed.
   A Pokémon counts with the typing it had in each generation, so Clefairy's Normal typing still counts after it changes. */
function comboPage(){
  if(!S.chart)return loaded?emptyMsg('The type chart has not been set up yet.'):loading();
  const g=UI.gen,ts=typesAt(g),idx=Object.fromEntries(ts.map((t,i)=>[t,i]));
  if(!ts.length)return emptyMsg('No types in this generation yet.');
  const keyOf=(a,b)=>idx[a]>=idx[b]?a+'|'+b:b+'|'+a;
  const used=new Map();
  for(const p of rows('pokemon'))for(const x of GENS){if(x<(p.debut||1)||x>g)continue;
    const t=[...new Set(eff(p,x).types||[])].filter(y=>y in idx);if(!t.length)continue;
    const k=keyOf(t[0],t[1]||t[0]),u=used.get(k)||{first:x,mons:new Map()};u.first=Math.min(u.first,x);if(!u.mons.has(p.id))u.mons.set(p.id,x);used.set(k,u)}
  const all=[];ts.forEach((a,i)=>ts.slice(0,i+1).forEach(b=>all.push(keyOf(a,b))));
  const unused=all.filter(k=>!used.has(k)),fresh=all.filter(k=>used.get(k)?.first===g);
  const sel=all.includes(UI.combo)?UI.combo:null;
  const pair=k=>{const [a,b]=k.split('|');return a===b?[a]:[b,a]};
  const pairHtml=k=>`<span class="combo">${pair(k).map(chip).join('')}</span>`;
  const comboBtn=k=>`<button type="button" class="combobtn" data-act="combo" data-v="${esc(k)}" aria-pressed="${k===sel}">${pair(k).map(chipText).join('')}</button>`;
  // The grid is mirrored: Water/Ground and Ground/Water are the same typing, so both squares show it.
  const cellHtml=(a,b)=>{const k=keyOf(a,b),u=used.get(k),n=u?u.mons.size:0,name=pair(k).join('/');
    return `<button type="button" class="c${u?'':' unused'}${k===sel?' on':''}" data-act="combo" data-v="${esc(k)}" title="${esc(name)}: ${u?`${n} Pokémon, first in Gen ${ROMAN[u.first]}`:'never used'}" aria-label="${esc(name)}, ${u?n+' Pokémon':'never used'}">${u?n:''}</button>`};
  const hdr=t=>{const c=typeColor(t);return `<span class="hdr" style="display:flex;align-items:center;justify-content:center;background:${c};color:${fgFor(c)}">${esc(t.slice(0,3).toUpperCase())}</span>`};
  const rowhdr=t=>{const c=typeColor(t);return `<span class="hdr rowhdr" style="display:flex;align-items:center;background:${c};color:${fgFor(c)}">${esc(t)}</span>`};
  let detail='<p class="muted" style="margin:0">Click a square to see which Pokémon have that typing.</p>';
  if(sel){const u=used.get(sel),mons=u?[...u.mons].map(([id,x])=>({p:S.pokemon[id],id,x})).sort((m,n)=>(m.p.dex??1e9)-(n.p.dex??1e9)||pname(m.p,g).localeCompare(pname(n.p,g))):[];
    detail=`<div style="margin-bottom:10px">${pairHtml(sel)}</div>${u?`<p class="hint" style="margin-bottom:8px">First used in Gen ${ROMAN[u.first]} · ${mons.length} Pokémon</p><ul class="combolist">${mons.map(m=>`<li><span class="mono muted">${pad(m.p.dex)}</span>${pokeLink(m.id)}${m.x>(m.p.debut||1)?`<span class="muted">from Gen ${ROMAN[m.x]}</span>`:''}</li>`).join('')}</ul>`:`<p class="muted" style="margin:0">No Pokémon has had this typing through Gen ${ROMAN[g]}.</p>`}`}
  return `<div class="chartwrap"><div class="chartbox">
    <div class="legend"><span><b style="background:var(--soft);color:var(--ink)">3</b>Used (number of Pokémon)</span><span><b class="unusedkey"></b>Never used</span><span class="muted">The diagonal is pure types.</span></div>
    <table class="grid combogrid"><thead><tr><th></th>${ts.map(t=>`<th>${hdr(t)}</th>`).join('')}</tr></thead><tbody>${ts.map(a=>`<tr><th>${rowhdr(a)}</th>${ts.map(b=>`<td>${cellHtml(a,b)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="chartside">
    ${g>1?`<section class="card"><h2 style="font-size:22px">First used in Gen ${ROMAN[g]} <span class="muted mono" style="font-size:16px">${fresh.length}</span></h2>${fresh.length?`<div class="combos">${fresh.map(comboBtn).join('')}</div>`:'<p class="muted" style="margin:0">No new typings this generation.</p>'}</section>`:''}
    <section class="card"><h2 style="font-size:22px">Used through Gen ${ROMAN[g]}</h2><p style="margin:0"><span class="mono" style="font-size:28px;font-weight:700">${all.length-unused.length}</span> <span class="muted">of ${all.length} typings (${ts.length} pure, ${all.length-ts.length} dual)</span></p></section>
    <section class="card"><h2 style="font-size:22px">Selected</h2>${detail}</section>
    ${(all.length-unused.length)/all.length>=.8?`<section class="card"><h2 style="font-size:22px">Never used <span class="muted mono" style="font-size:16px">${unused.length}</span></h2>${unused.length?`<div class="combos">${unused.map(comboBtn).join('')}</div>`:'<p class="muted" style="margin:0">Every typing has been used.</p>'}</section>`:''}
    </div></div>`;
}

/* Type pages: everything one type hits and gets hit by, its changes, and the Pokémon and moves that have it. */
const typeHref=t=>'#ty-'+encodeURIComponent(t);
// A small square in the type's colour with its first three letters, like the type chart headers.
function typeIcon(t,size=32){const c=typeColor(t);return `<span class="ticon" style="width:${size}px;height:${size}px;font-size:${Math.round(size*.34)}px;background:${c};color:${fgFor(c)}" aria-hidden="true">${esc(String(t).slice(0,3).toUpperCase())}</span>`}
function typePage(name){
  if(!S.chart)return loaded?emptyMsg('The type chart has not been set up yet.'):loading();
  const t=(S.chart.types||[]).find(x=>x.name===name);
  if(!t)return emptyMsg('This type is not in your type chart.');
  const g=UI.gen,debut=t.debut||1;
  if(debut>g)return notThere(name,debut,'#types');
  const ts=typesAt(g),c=typeColor(name);
  const group=(list,m,lab)=>{const hit=list.filter(x=>x[1]===m);return hit.length?`<div class="tgroup"><h3>${lab} <span class="muted mono">×${mult(m)}</span></h3><div class="chips">${hit.map(x=>chip(x[0])).join('')}</div></div>`:''};
  const atk=ts.map(d=>[d,cell(g,name,d)]),def=ts.map(a=>[a,cell(g,a,name)]);
  const atkHtml=group(atk,2,'Super effective against')+group(atk,.5,'Not very effective against')+group(atk,0,'Has no effect on')||'<p class="muted" style="margin:0">Hits every type for normal damage.</p>';
  const defHtml=group(def,2,'Weak to')+group(def,.5,'Resists')+group(def,0,'Immune to')||'<p class="muted" style="margin:0">Takes normal damage from every type.</p>';
  const changes=[];
  for(let h=debut+1;h<=4;h++){
    const before=typesAt(h-1);
    for(const o of typesAt(h)){
      const pairs=o===name?[[name,name]]:[[name,o],[o,name]];
      for(const [x,y] of pairs){
        const now=cell(h,x,y),was=before.includes(o)?cell(h-1,x,y):null,txt=x+' against '+y;
        if(was===null){if(now!==1)changes.push({h,txt:txt+': ×'+mult(now)+' ('+o+' is new)'})}
        else if(was!==now)changes.push({h,txt:txt+': ×'+mult(was)+' to ×'+mult(now)});
      }
    }
  }
  const mons=rows('pokemon').filter(p=>(p.debut||1)<=g&&(eff(p,g).types||[]).includes(name)).sort((a,b)=>(a.dex??1e9)-(b.dex??1e9));
  const moves=rows('moves').filter(m=>(m.debut||1)<=g&&effMove(m,g).type===name).sort((a,b)=>a.name.localeCompare(b.name));
  return `<a href="#types" style="align-self:flex-start;display:flex;align-items:center;min-height:44px;font-weight:600">Back to Type Chart</a>
  <section class="hero">${typeIcon(name,96)}<div class="grow"><span class="mono">Introduced in Gen ${ROMAN[debut]} · Showing Gen ${ROMAN[g]}</span><h1>${esc(name)}</h1>${g<SPLIT_FROM&&typeCat(name)?`<p style="margin:0;color:var(--band-muted)">Before Gen IV, damaging ${esc(name)} moves are all ${typeCat(name)}.</p>`:''}</div></section>
  <div class="tcols"><section class="card"><h2>Attacking</h2><p class="muted" style="margin:-6px 0 12px">${esc(name)} moves against each type.</p>${atkHtml}</section>
  <section class="card"><h2>Defending</h2><p class="muted" style="margin:-6px 0 12px">Moves against a ${esc(name)} Pokémon. Dual types multiply both.</p>${defHtml}</section></div>
  <section class="card"><h2>Changes across generations</h2>${changes.length?`<ul style="margin:0;padding-left:18px">${changes.map(x=>`<li><span class="pill">Gen ${ROMAN[x.h]}</span> ${esc(x.txt)}</li>`).join('')}</ul>`:`<p class="muted" style="margin:0">No matchup changes after Gen ${ROMAN[debut]}.</p>`}</section>
  <section class="card"><h2>${esc(name)} Pokémon <span class="muted mono" style="font-size:18px">${mons.length}</span></h2>${mons.length?`<div class="tmons">${mons.map(p=>{const e=eff(p,g);return `<a class="tmon" href="#p-${esc(p.id)}">${pokeTile(p,e,g,40)}<span><span class="name">${esc(p.name)}</span><span class="mono muted" style="display:block;font-size:12px">No. ${pad(p.dex)}${(e.types||[]).length>1?' · '+esc(e.types.join('/')):''}</span></span></a>`}).join('')}</div>`:'<p class="muted" style="margin:0">No Pokémon of this type in your Dex yet.</p>'}</section>
  <section class="card"><h2>${esc(name)} moves <span class="muted mono" style="font-size:18px">${moves.length}</span></h2>${moves.length?`<div class="box"><table style="min-width:560px"><thead><tr><th>Name</th><th>Category</th><th class="num">Power</th><th class="num">Accuracy</th><th class="num">PP</th></tr></thead><tbody>${moves.map(m=>{const e=effMove(m,g);return `<tr><td class="name mid"><a href="#m-${esc(m.id)}">${esc(m.name)}</a></td><td class="mid">${e.category?`<span class="cat" style="background:${CAT[e.category]||'var(--soft)'}">${esc(e.category)}</span>`:'—'}</td><td class="num mono mid">${dash(e.power)}</td><td class="num mono mid">${dash(e.accuracy)}</td><td class="num mono mid">${dash(e.pp)}</td></tr>`}).join('')}</tbody></table></div>`:'<p class="muted" style="margin:0">No moves of this type yet.</p>'}</section>`;
}

/* Battle Mechanics: your battle and status effects, then how stats, natures, damage and stat stages work in the generation you're viewing. */
const NATURE_STATS=[['atk','Attack'],['def','Defense'],['spe','Speed'],['spa','Sp. Atk'],['spd','Sp. Def']];
// Rows raise a stat, columns lower one. The diagonal changes nothing.
const NATURES=[['Hardy','Lonely','Brave','Adamant','Naughty'],['Bold','Docile','Relaxed','Impish','Lax'],['Timid','Hasty','Serious','Jolly','Naive'],['Modest','Mild','Quiet','Bashful','Rash'],['Calm','Gentle','Sassy','Careful','Quirky']];
const MECH_SECTIONS=[['mx-effects','Battle & field effects'],['mx-status','Status conditions'],['mx-stats','Stats'],['mx-natures','Natures'],['mx-damage','Damage'],['mx-stages','Stat stages']];
function mechanicsPage(){
  bodyFn=mechanicsBody;
  const g=UI.gen;
  const groups=[...new Set(rows('effects').map(e=>eff(e,g).group).filter(Boolean))].sort();
  const sec=(id,title,inner)=>`<section class="card" id="${id}"><h2>${title}</h2>${inner}</section>`;
  const formula=lines=>`<div class="formula">${lines.map(l=>`<div>${l}</div>`).join('')}</div>`;
  const stats=g<=2
    ?`<p>Each Pokémon has a <b>DV</b> from 0 to ${DV_MAX} for Attack, Defense, Speed and Special. Its HP DV is built from the other four: an odd Attack DV adds 8, Defense 4, Speed 2 and Special 1.</p>
      ${g===2?'<p>In Gen II the Special DV is used for both Sp. Atk and Sp. Def. DVs also decide gender (from the Attack DV) and whether a Pokémon is shiny.</p>':''}
      <p><b>Stat Experience</b> goes from 0 to 65,535 per stat. Every Pokémon you defeat adds its base stats to the Stat Experience of each Pokémon that battled it. Vitamins add 2,560 each, up to 25,600.</p>
      ${formula(['Stat = ⌊((Base + DV) × 2 + ⌊⌈√StatExp⌉ ÷ 4⌋) × Level ÷ 100⌋ + 5','HP = ⌊((Base + DV) × 2 + ⌊⌈√StatExp⌉ ÷ 4⌋) × Level ÷ 100⌋ + Level + 10'])}`
    :`<p>Each Pokémon has an <b>IV</b> from 0 to ${IV_MAX} in each of its six stats. They are fixed when you get it.</p>
      <p><b>EVs</b> are earned by defeating Pokémon, each of which gives EVs in certain stats. A Pokémon holds up to ${EV_MAX} EVs in one stat and ${EV_TOTAL} in total. Every ${EVS_PER_POINT} EVs add 1 to the stat at level 100.</p>
      ${formula([`Stat = ⌊(⌊(2 × Base + IV + ⌊EV ÷ ${EVS_PER_POINT}⌋) × Level ÷ 100⌋ + 5) × Nature⌋`,`HP = ⌊(2 × Base + IV + ⌊EV ÷ ${EVS_PER_POINT}⌋) × Level ÷ 100⌋ + Level + 10`])}
      <p class="hint">Nature is 1.1 for the stat it raises, 0.9 for the one it lowers and 1 otherwise. The limits above are the ones this tracker checks when you enter a trainer's team.</p>`;
  const natures=g<3?'<p class="muted" style="margin:0">Natures arrive in Gen III.</p>'
    :`<p>A nature raises one stat by 10% and lowers another by 10%. The five on the diagonal change nothing.</p>
      <div class="box"><table class="natgrid"><thead><tr><th>Raises ↓ · Lowers →</th>${NATURE_STATS.map(s=>`<th>${s[1]}</th>`).join('')}</tr></thead><tbody>${NATURES.map((row,i)=>`<tr><th>${NATURE_STATS[i][1]}</th>${row.map((n,j)=>`<td class="${i===j?'neutral':''}">${n}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const types=typesAt(g);
  const split=g<SPLIT_FROM
    ?`<p>Before Gen IV a damaging move's <b>type</b> decides whether it is physical or special.</p>
      <div class="tgroup"><h3>Physical, using Attack and Defense</h3><div class="chips">${PHYSICAL_TYPES.filter(t=>types.includes(t)).map(t=>chip(t)).join('')}</div></div>
      <div class="tgroup"><h3>Special, using ${g===1?'Special':'Sp. Atk and Sp. Def'}</h3><div class="chips">${SPECIAL_TYPES.filter(t=>types.includes(t)).map(t=>chip(t)).join('')}</div></div>`
    :'<p>From Gen IV each move has its own category. Physical moves use Attack and Defense. Special moves use Sp. Atk and Sp. Def.</p>';
  const variable=g>=VARIABLE_FROM?'<p><b>Variable</b> moves, like Hidden Power, can be physical or special depending on the move.</p>':'';
  const damage=`${split}${variable}
    ${formula(['Damage = (⌊⌊⌊2 × Level ÷ 5 + 2⌋ × Power × A ÷ D⌋ ÷ 50⌋ + 2) × STAB × Type × Random'])}
    <dl class="mechlist"><dt>A and D</dt><dd>The attacker's attacking stat and the target's defending stat for that category.</dd>
    <dt>STAB</dt><dd>×1.5 when the move's type matches one of the user's types.</dd>
    <dt>Type</dt><dd>From the <a href="#types">type chart</a>. Against two types, both multipliers apply, so ×4, ×2, ×1, ×½, ×¼ or ×0.</dd>
    <dt>Random</dt><dd>${g<=2?'217 to 255, divided by 255':'85% to 100%'}.</dd>
    <dt>Critical hit</dt><dd>${g===1?'Chance comes from the user\'s base Speed, and is much higher for high-critical moves. Roughly doubles damage and ignores stat stages on both sides.':'Base chance of 1 in 16, raised by Focus Energy, high-critical moves and some items. Doubles damage'+(g===2?' and ignores stat stages when the attacker\'s stages are no better than the target\'s.':' and ignores stat stages that would weaken the hit.')}</dd></dl>`;
  const stageRows=[-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6];
  const frac=(n,b)=>n>=0?`${b+n}/${b}`:`${b}/${b-n}`;
  const dec=(n,b)=>(n>=0?(b+n)/b:b/(b-n)).toFixed(2).replace(/\.?0+$/,'');
  const stages=`<p>Moves like Swords Dance or Growl change a stat by stages, from −6 to +6. Switching out resets them.</p>
    <div class="box"><table style="min-width:420px"><thead><tr><th>Stage</th><th class="num">Attack, Defense, ${g===1?'Special':'Sp. Atk, Sp. Def'}, Speed</th><th class="num">Accuracy and evasion</th></tr></thead><tbody>${stageRows.map(n=>`<tr${n===0?' class="neutralrow"':''}><td class="mono">${n>0?'+'+n:n}</td><td class="num mono">×${dec(n,2)} <span class="muted">(${frac(n,2)})</span></td><td class="num mono">×${dec(n,g<=2?2:3)} <span class="muted">(${frac(n,g<=2?2:3)})</span></td></tr>`).join('')}</tbody></table></div>`;
  return titleBar('Battle Mechanics',`How battles work in Gen ${ROMAN[g]}, plus your battle and status effects.`,canEdit?`<div class="btns">${addBtn('Add battle effect','new-effect','data-v="battle"')}${addBtn('Add status effect','new-effect','data-v="status"')}</div>`:'')+
  `<nav class="mechnav" aria-label="On this page">${MECH_SECTIONS.map(([id,l])=>`<button type="button" class="btn small" data-act="jump" data-v="${id}">${l}</button>`).join('')}</nav>
  <div class="toolbar">${search('Search effects')}<label class="ctl" style="flex:0 1 200px">Group<select id="grp" data-model="group"><option value="All">All groups</option>${groups.map(c=>`<option${UI.group===c?' selected':''}>${esc(c)}</option>`).join('')}</select></label>${viewToggle('All effects')}</div>
  <div id="body" style="display:flex;flex-direction:column;gap:18px"></div>
  ${sec('mx-stats',g<=2?'Stats: DVs and Stat Experience':'Stats: IVs and EVs',stats)}
  ${sec('mx-natures','Natures',natures)}
  ${sec('mx-damage','Damage',damage)}
  ${sec('mx-stages','Stat stages',stages)}`;
}
const mechanicsBody=()=>`<h2 class="genhead" id="mx-effects" style="margin:0">Battle &amp; field effects</h2>${effectBody('battle')}<h2 class="genhead" id="mx-status" style="margin:0">Status conditions</h2>${effectBody('status')}`;

function notThere(name,debut,back){return `<div class="empty"><p>${esc(name)} debuts in Gen ${ROMAN[debut]}, so it has no Gen ${ROMAN[UI.gen]} data.</p><div class="btns"><button type="button" class="btn primary" data-act="gen" data-v="${debut}">Go to Gen ${ROMAN[debut]}</button><a class="btn" href="${back}">Back</a></div></div>`}

// The Pokémon before and after this one in Dex number order, counting only those in the generation being viewed.
function dexNeighbours(id,g){
  const list=rows('pokemon').filter(p=>inDex(p,g)).sort((a,b)=>(a.dex??1e9)-(b.dex??1e9)||isForm(a.id)-isForm(b.id)||a.name.localeCompare(b.name));
  let i=list.findIndex(p=>p.id===id);if(i<0)i=list.findIndex(p=>p.id===baseOf(id));
  return i<0?[null,null]:[list[i-1]||null,list[i+1]||null];
}
// Gender ratio bar. Labels sit under the bar so small shares never get clipped.
function genderBar(m){
  const male=Math.min(Math.max(Number(m)||0,0),100),fem=+(100-male).toFixed(2);
  if(male===100||fem===0)return '<div class="gender" style="grid-template-columns:1fr" aria-hidden="true"><span style="background:var(--cool)"></span></div><div class="glabels"><span>Male only</span></div>';
  if(male===0)return '<div class="gender" style="grid-template-columns:1fr" aria-hidden="true"><span style="background:var(--hot)"></span></div><div class="glabels"><span>Female only</span></div>';
  return `<div class="gender" style="grid-template-columns:${male}fr ${fem}fr" aria-hidden="true"><span style="background:var(--cool)"></span><span style="background:var(--hot)"></span></div><div class="glabels"><span>${male}% male</span><span>${fem}% female</span></div>`;
}
// Vitals: height in metres and weight in kilograms, with feet/inches and pounds alongside.
const GROWTH=['Erratic','Fast','Medium Fast','Medium Slow','Slow','Fluctuating'];
function heightText(m){if(m==null)return '';const inches=Math.round(m/0.0254);return `${m} m (${Math.floor(inches/12)}′${String(inches%12).padStart(2,'0')}″)`}
function weightText(kg){if(kg==null)return '';return `${kg} kg (${(kg*2.20462).toFixed(1)} lbs)`}
const hasVitals=e=>!!(e.species||e.height!=null||e.weight!=null||e.growthRate);
// A Pokémon's moveset is stored on each move's "Pokémon that learn it" list, so the two pages always agree.
function learnOrder(a,b){
  const lv=h=>{const m=String(h||'').match(/^\s*(?:level|lv\.?)\s*(\d+)/i);return m?+m[1]:null};
  const x=lv(a),y=lv(b);
  if(x!=null||y!=null)return x==null?1:y==null?-1:x-y;
  return String(a||'').localeCompare(String(b||''),undefined,{numeric:true});
}
function movesetOf(pid,g){
  const out=[];
  for(const [mid,m] of Object.entries(S.moves)){if((m.debut||1)>g)continue;for(const l of eff(m,g).learners||[])if(l.p===pid)out.push({m:mid,how:l.how||''})}
  return out.sort((a,b)=>learnOrder(a.how,b.how)||label('moves',a.m).localeCompare(label('moves',b.m)));
}
function pokemonPage(id){
  const raw=S.pokemon[id];
  if(!raw)return loaded?emptyMsg('This Pokémon is not in your Dex.'):loading();
  const p={id,...raw,name:pname(raw)},g=UI.gen;
  if((p.debut||1)>g)return notThere(p.name,p.debut,'#dex');
  const e=eff(p,g),st=statsAt(e,g),ts=typesAt(g),slots=e.abilitySlots||[];
  const mults={};
  if((e.types||[]).length)ts.forEach(a=>{mults[a]=e.types.reduce((m,d)=>m*(ts.includes(d)?cell(g,a,d):1),1)});
  const defs=[[4,'×4','Weak','var(--hot)','var(--on-data)'],[2,'×2','Weak','var(--hot)','var(--on-data)'],[.5,'×½','Resists','var(--cool)','var(--on-data)'],[.25,'×¼','Resists','var(--cooler)','var(--on-data)'],[0,'×0','Immune','var(--zero)','var(--on-zero)']];
  /* Ability immunities move the type into the Immune row, labelled with the ability, and out of its usual row.
     An ability alone in its slot always applies. When a matchup-changing ability shares a slot with others, only one of them is
     active, so tabs pick which (the first is shown by default). */
  const changesMatchups=a=>!!eff(S.abilities[a]||{},g).immuneTo;
  const pick=i=>{const o=slots[i],v=UI.matchAb?.[id+':'+i];return o.includes(v)?v:o[0]};
  const varSlots=g<3?[]:slots.map((o,i)=>i).filter(i=>slots[i].length>1&&slots[i].some(changesMatchups));
  const allAbs=g<3?[]:[...new Set(slots.flatMap((o,i)=>varSlots.includes(i)?[pick(i)]:o))],abImm={};
  const matchTabs=varSlots.map(i=>`<div class="stattabs" role="group" aria-label="${SLOT_NAMES[i]}">${slots[i].map(a=>`<button type="button" data-act="match-ab" data-k="${esc(id+':'+i)}" data-v="${esc(a)}" aria-pressed="${a===pick(i)}">${esc(label('abilities',a))}</button>`).join('')}</div>`).join('');
  for(const a of allAbs){const t=eff(S.abilities[a],g).immuneTo;if(t&&ts.includes(t)&&mults[t]!==0)(abImm[t]=abImm[t]||[]).push(a)}
  const defMult=a=>abImm[a]?0:mults[a];
  const abChip=t=>`<span class="abimm">${chip(t)}<small>with ${abImm[t].map(a=>`<a href="#a-${esc(a)}">${esc(label('abilities',a))}</a>`).join(' or ')}</small></span>`;
  const match=defs.map(d=>{const t=ts.filter(a=>defMult(a)===d[0]&&!(d[0]===0&&abImm[a])),extra=d[0]===0?Object.keys(abImm):[];
    return t.length||extra.length?`<div class="match"><span class="mlabel" style="background:${d[3]};color:${d[4]}"><b>${d[1]}</b>${d[2]}</span><span class="chips">${t.map(chip).join('')}${extra.map(abChip).join('')}</span></div>`:''}).join('');
  // A variant has its own chain; a form change shares the base Pokémon's.
  const base=baseOf(id),chainOf=isVariant(id)?id:base,evo=family({id:chainOf,...S.pokemon[chainOf]},g);
  /* The chain is drawn as a tree: each Pokémon sits beside its own evolutions, one arrow per branch, so Oddish → Bellossom
     never looks like Gloom → Bellossom. A Pokémon with an extra source (Bagon → Salamence) appears under each Pokémon it can
     evolve from, with that route's method. Tiles share the card's width (--d is the tree's depth) and long methods wrap
     inside them. On narrow cards each evolution moves under the Pokémon it comes from. */
  const byDex=(a,b)=>(S.pokemon[a].dex??1e9)-(S.pokemon[b].dex??1e9)||isForm(a)-isForm(b)||pname(a,g).localeCompare(pname(b,g));
  const evoTree=(c,how,path)=>{const p2=new Set(path).add(c),kids=[];
    for(const k of Object.keys(S.pokemon).filter(k=>!p2.has(k)&&(S.pokemon[k].debut||1)<=g).sort(byDex)){const x=eff(S.pokemon[k],g);
      if(x.evolvesFrom===c)kids.push(evoTree(k,[x.evoMethod,x.evoMethod2&&(x.evoMethod?'or ':'')+x.evoMethod2].filter(Boolean),p2));
      else{const alt=(x.evoAlts||[]).find(a=>a.from===c);if(alt)kids.push(evoTree(k,[alt.method].filter(Boolean),p2))}}
    return {c,how,kids,depth:1+Math.max(0,...kids.map(k=>k.depth))}};
  const tree=evoTree(evo[0][0],[],new Set());
  const arrow='<svg class="evoarrow" aria-hidden="true" width="34" height="14" viewBox="0 0 34 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 7h30M25 1l6 6-6 6"/></svg>';
  const evoNode=n=>{const m=S.pokemon[n.c],x=eff(m,g);
    return `<div class="evonode"><a class="evotile" href="#p-${esc(n.c)}"${n.c===chainOf?' aria-current="true"':''}>${pokeTile(m,x,g,48)}<span>${esc(pname(m,g))}${n.how.map(h=>`<small>${esc(h)}</small>`).join('')}</span></a>${n.kids.length?`<div class="evokids">${n.kids.map(k=>`<div class="evobranch">${arrow}${evoNode(k)}</div>`).join('')}</div>`:''}</div>`};
  const evoHtml=tree.depth>1?`<div class="evowrap"><div class="evo d${Math.min(tree.depth,3)}" style="--d:${tree.depth}">${evoNode(tree)}</div></div>`:'<p class="muted" style="margin:0">Does not evolve.</p>';
  // Optional ability tag: shows the base stats as they work out with a stat-multiplying ability.
  // With more than one, an "All abilities" tab stacks every multiplier (multiplied together where they share a stat).
  const boosts=statBoosts(slots,g),ALL='*';
  const all=boosts.length>1?{a:ALL,mults:boosts.reduce((o,b)=>{for(const [k,m] of Object.entries(b.mults))o[k]=(o[k]||1)*m;return o},{})}:null;
  const on=UI.statAb===ALL?all:boosts.find(b=>b.a===UI.statAb),mOf=k=>on?.mults[k]||1;
  /* The boosted stat is shown as the base that would reach the same Lv. 100 stat on its own, with full investment
     (31 IVs, 252 EVs, neutral nature: stat = 2B + 99). Solving 2B' + 99 = m(2B + 99) gives B' = (m(2B + 99) - 99) / 2.
     Doubling the base alone undershoots, because the IV/EV part of the stat gets doubled too. */
  const effBase=(b,m)=>m===1?b:Math.round((m*(2*b+99)-99)/2);
  const shown=st.map(([k,lab,b])=>[k,lab,b==null?null:effBase(b,mOf(k)),b]);
  const t=on?(shown.some(x=>x[2]==null)?null:shown.reduce((a,x)=>a+x[2],0)):total(e,g);
  const statTab=(v,l,cur)=>`<button type="button" data-act="stat-ab" data-v="${esc(v)}" aria-pressed="${cur}">${esc(l)}</button>`;
  const boostTags=boosts.length?`<div class="stattabs" role="group" aria-label="Show stats with ability">${statTab('','Base',!on)}${boosts.map(b=>statTab(b.a,b.when?`${b.name} (${b.when})`:b.name,b===on)).join('')}${all?statTab(ALL,'All abilities',on===all):''}</div>`:'';
  const breeding=g<2?'<p class="muted" style="margin:0">Breeding arrives in Gen II.</p>':(blank(e.eggGroups)&&e.eggCycles==null&&e.genderM===undefined&&!e.hatchesAs&&blank(e.hatchAlts))?'<p class="muted" style="margin:0">Not set.</p>':`<dl class="defs"><div><dt>Egg groups</dt><dd>${dash((e.eggGroups||[]).join(', '))}</dd></div><div><dt>Egg cycles</dt><dd>${dash(e.eggCycles)}</dd></div><div><dt>Hatches as</dt><dd>${hatchLink(e.hatchesAs)}${hatchRest(e.hatchAlts)}</dd></div></dl>${hatchAltsHtml(e.hatchAlts)}<div style="margin-top:12px"><span class="muted" style="font-size:13px">Gender ratio</span>${e.genderM===null||e.genderM===undefined?'<div style="font-weight:600">Genderless</div>':genderBar(e.genderM)}</div>`;
  const hasAlt=slots.some(o=>o.length>1);
  const [prevP,nextP]=dexNeighbours(id,g);
  const step=(q,dir)=>q?`<a class="btn small" href="#p-${esc(q.id)}" data-nav="${dir}" aria-label="${dir==='prev'?'Previous':'Next'} Pokémon: ${esc(q.name)}"><span>${dir==='prev'?`← <span class="mono">${pad(q.dex)}</span> ${esc(q.name)}`:`${esc(q.name)} <span class="mono">${pad(q.dex)}</span> →`}</span></a>`:`<span class="btn small" aria-disabled="true">${dir==='prev'?'← First in Dex':'Last in Dex →'}</span>`;
  // Regional variants sit beside the base Pokémon; form changes follow under their own label.
  const others=formsOf(base,g),variants=others.filter(isVariant),changes=others.filter(k=>!isVariant(k));
  const tab=k=>`<a href="#p-${esc(k)}"${k===id?' aria-current="page"':''}>${esc(pname(k,g))}</a>`;
  const tabs=others.length?`<nav class="formtabs" aria-label="Variants and forms">${[base,...variants].map(tab).join('')}${changes.length?`${variants.length?'<span class="tablabel">Forms</span>':''}${changes.map(tab).join('')}`:''}</nav>`:'';
  const variantOf=isVariant(id)?` · ${esc(p.variant)} variant of <a href="#p-${esc(base)}">${esc(pname(base,g))}</a>`:'';
  return `<div class="pnav"><a href="#dex" style="display:flex;align-items:center;min-height:44px;font-weight:600">Back to National Dex</a><nav class="btns" aria-label="Previous and next Pokémon">${step(prevP,'prev')}${step(nextP,'next')}</nav></div>${tabs}
  <section class="hero">${pokeTile(p,e,g,132)}<div class="grow"><span class="mono">No. ${pad(p.dex)}${variantOf} · Debuted in Gen ${ROMAN[p.debut||1]}</span><h1>${esc(p.name)}</h1>${discName(p,g)?`<p class="discname">Discovered as ${esc(discName(p,g))}</p>`:''}${(e.types||[]).length?chips(e.types):'<span>No type set</span>'}</div><div class="btns"><a class="btn" href="#cmp-${esc(id)}">Compare</a><a class="btn" href="#calc-${esc(id)}">Damage calculator</a>${canEdit?`<button type="button" class="btn" data-act="edit-pokemon" data-id="${esc(id)}">Edit Gen ${ROMAN[g]} data</button>`:''}</div></section>
  <section class="note" aria-label="Changes"><strong>Gen ${ROMAN[g]}:</strong>${pokeChanges(p,g).map(c=>`<span>${esc(c)}</span>`).join('')}</section>
  <div class="cols"><div class="col">
    <section class="card"><div class="stathead"><h2>Base stats</h2>${boostTags}<span class="mono" style="font-weight:600;margin-left:auto">${t==null?'':'Total '+t}</span></div>${shown.map(s=>{const up=mOf(s[0])!==1&&s[2]!=null;return `<div class="stat${up?' boosted':''}"><span>${s[1]}</span><span class="mono" style="text-align:right"${up?` title="Real base ${s[3]}; ${s[2]} reaches the same Lv. 100 stat with full investment"`:''}>${dash(s[2])}</span><span class="bar" aria-hidden="true"><i style="width:${Math.min((s[2]||0)/STAT_MAX*100,100).toFixed(1)}%"></i></span><span class="mono muted" style="text-align:right">${statRange(s[0],s[3],g,mOf(s[0]))}</span></div>`}).join('')}<p class="muted" style="margin:8px 0 0;font-size:13px">Ranges are Lv. 100 stats, from minimum to maximum investment.</p></section>
    <section class="card"><h2>Vitals</h2>${hasVitals(e)?`<dl class="defs"><div><dt>Species</dt><dd>${dash(e.species)}</dd></div><div><dt>Height</dt><dd>${dash(heightText(e.height))}</dd></div><div><dt>Weight</dt><dd>${dash(weightText(e.weight))}</dd></div><div><dt>Growth rate</dt><dd>${dash(e.growthRate)}</dd></div></dl>`:'<p class="muted" style="margin:0">Not set.</p>'}</section>
    <section class="card"><h2>Evolution chain</h2>${evoHtml}</section>
    <section class="card"><h2>Form changes</h2>${formsHtml(e.forms,g)}</section>
  </div><div class="col">
    <section class="card"><h2>Abilities</h2>${g<3?'<p class="muted" style="margin:0">Abilities arrive in Gen III.</p>':slots.length?slots.map((o,i)=>`<div class="slot"><span class="muted">${SLOT_NAMES[i]}</span><span style="font-weight:600">${o.map(a=>`<a href="#a-${esc(a)}">${esc(label('abilities',a))}</a>`).join(' / ')}</span></div>`).join('')+(hasAlt?'<p class="hint" style="margin-top:8px">Abilities sharing a slot are switched outside battle.</p>':''):'<p class="muted" style="margin:0">Not set.</p>'}</section>
    <section class="card"><div class="stathead"><h2>Weaknesses and resistances</h2>${matchTabs}</div>${(e.types||[]).length?(match||'<p class="muted" style="margin:0">Neutral against every type.</p>'):'<p class="muted" style="margin:0">Set a type to see matchups.</p>'}</section>
    <section class="card"><h2>Breeding</h2>${breeding}</section>
  </div></div>
  ${movesetCard(id,g)}`;
}

function movesetCard(id,g){
  const own=movesetOf(id,g),shared=!own.length&&isForm(id)?movesetOf(baseOf(id),g):[],set=own.length?own:shared,btn=canEdit?`<button type="button" class="btn small" data-act="edit-moveset" data-id="${esc(id)}">Edit Gen ${ROMAN[g]} moveset</button>`:'';
  const row=x=>{const e=effMove(S.moves[x.m],g);return `<tr><td class="name mid"><a href="#m-${esc(x.m)}">${esc(label('moves',x.m))}</a></td><td class="mid">${e.type?chip(e.type):'—'}</td><td class="mid">${e.category?`<span class="cat" style="background:${CAT[e.category]||'var(--soft)'}">${esc(e.category)}</span>`:'—'}</td><td class="num mono mid">${dash(e.power)}</td><td class="num mono mid">${dash(e.accuracy)}</td><td class="num mono mid">${dash(e.pp)}</td><td class="mid">${dash(x.how)}</td></tr>`};
  return `<section class="card"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px 12px;margin-bottom:10px"><h2 style="margin:0">Moveset</h2>${btn}</div>${shared.length?`<p class="hint" style="margin-bottom:8px">Same as ${esc(pname(baseOf(id),g))}. Editing gives this form its own moveset.</p>`:''}${set.length?`<div class="box" style="border:0"><table style="min-width:640px"><thead><tr><th>Move</th><th>Type</th><th>Category</th><th class="num">Power</th><th class="num">Acc.</th><th class="num">PP</th><th>How it learns it</th></tr></thead><tbody>${set.map(row).join('')}</tbody></table></div>`:'<p class="muted" style="margin:0">No moves added yet.</p>'}</section>`;
}
/* Stat calculator. The formulas match the Battle Mechanics page, including this tracker's IV, EV and DV limits. */
const SE_MAX=65535;
// A nature's multiplier for each stat it changes, like {atk:1.1, spa:0.9}. Neutral or unknown natures change nothing.
function natureMods(name){
  const t=String(name||'').trim().toLowerCase();
  for(let i=0;i<NATURES.length;i++)for(let j=0;j<NATURES[i].length;j++)if(NATURES[i][j].toLowerCase()===t)return i===j?{}:{[NATURE_STATS[i][0]]:1.1,[NATURE_STATS[j][0]]:.9};
  return {};
}
// Gen I and II: HP's DV comes from the last bit of the other four.
const hpDV=dv=>((dv?.atk|0)&1)*8+((dv?.def|0)&1)*4+((dv?.spe|0)&1)*2+((dv?.spc|0)&1);
// Gen II's Sp. Atk and Sp. Def both use the Special DV and Special Stat Exp.
const oldKey=k=>k==='spa'||k==='spd'?'spc':k;
// o: {dv, se} for Gen I–II, or {iv, ev, nature} for Gen III+. o.mod forces one nature multiplier on every stat except HP (used for the min and max columns).
function calcStats(e,g,L,o){
  const mods=o.mod?null:natureMods(o.nature);
  return statsAt(e,g).map(([k,lab,b])=>{
    if(b==null||!L)return [k,lab,null];
    if(g<=2){
      const dv=k==='hp'?hpDV(o.dv):(o.dv?.[oldKey(k)]||0),se=o.se?.[oldKey(k)]||0;
      const core=Math.floor(((b+dv)*2+Math.floor(Math.min(255,Math.ceil(Math.sqrt(se)))/4))*L/100);
      return [k,lab,k==='hp'?core+L+10:core+5];
    }
    const core=Math.floor((2*b+(o.iv?.[k]||0)+Math.floor((o.ev?.[k]||0)/EVS_PER_POINT))*L/100);
    if(k==='hp')return [k,lab,b===1?1:core+L+10];
    return [k,lab,Math.floor((core+5)*(o.mod||mods[k]||1))];
  });
}
// A trainer's Pokémon's actual stats, when its level and every DV (Gen I–II) or IV (Gen III+) are filled in. Missing EVs count as 0.
function teamStats(m,e,gen){
  const L=Number(m.level),set=x=>x!=null&&x!=='';
  if(!L||!e.stats)return '';
  const keys=gen<=2?DV_KEYS:EV_KEYS,src=gen<=2?m.dvs:m.ivs;
  if(!keys.every(([k])=>set(src?.[k])))return '';
  const num=o=>Object.fromEntries(Object.entries(o||{}).map(([k,x])=>[k,Number(x)||0]));
  const r=calcStats(e,gen,L,gen<=2?{dv:num(m.dvs),se:{}}:{iv:num(m.ivs),ev:num(m.evs),nature:m.nature});
  if(r.some(x=>x[2]==null))return '';
  const short={hp:'HP',atk:'Atk',def:'Def',spa:'SpA',spd:'SpD',spe:'Spe',spc:'Spc'};
  return r.map(([k,,x])=>`<span><b>${short[k]}</b>${x}</span>`).join('');
}

/* Compare: up to three Pokémon side by side. The address holds the picks, like #cmp-bulbasaur,charmander. */
const CMP_MAX=3;
const cmpIds=()=>String(UI.arg||'').split(',').filter(x=>S.pokemon[x]).slice(0,CMP_MAX);
function comparePage(){
  const g=UI.gen,ids=cmpIds(),ts=typesAt(g);
  const pick=[0,1,2].map(i=>`<label class="ctl" style="flex:1 1 200px">Pokémon ${i+1}<input id="cmp-${i}" list="dl-pokemon" value="${esc(ids[i]?pname(ids[i]):'')}" placeholder="Type a name" autocomplete="off"></label>`).join('');
  const top=titleBar('Compare Pokémon',`Up to ${CMP_MAX} Pokémon side by side, with Gen ${ROMAN[g]} data.`)+`<div class="toolbar">${pick}${ids.length?'<button type="button" class="btn" data-act="cmp-clear">Clear</button>':''}</div>`;
  if(!loaded)return top+loading();
  if(!ids.length)return top+'<div class="empty"><p>Pick a Pokémon above to start. You can also open a Pokémon and press Compare.</p></div>';
  const mons=ids.map(id=>({id,p:S.pokemon[id],there:(S.pokemon[id].debut||1)<=g})).map(x=>({...x,e:x.there?eff(x.p,g):{}}));
  const cols=mons.length,na=`<td class="muted">Not in Gen ${ROMAN[g]}</td>`;
  const sec=t=>`<tr class="cmpsec"><th colspan="${cols+1}" scope="colgroup">${t}</th></tr>`;
  const line=(lab,f)=>`<tr><th scope="row">${lab}</th>${mons.map(x=>x.there?`<td>${f(x)}</td>`:na).join('')}</tr>`;
  const head=`<tr><th></th>${mons.map(x=>`<th scope="col" class="cmphead"><a href="#p-${esc(x.id)}">${pokeTile(x.p,x.e,g,56)}<span>${esc(pname(x.p,g))}</span></a><span class="mono muted">No. ${pad(x.p.dex)}</span></th>`).join('')}</tr>`;
  // Stats: the highest in each row is marked when there is more than one Pokémon.
  const st=statsAt({},g).map(([k,lab])=>{
    const vals=mons.map(x=>x.there?statsAt(x.e,g).find(s=>s[0]===k)[2]:null),top=Math.max(...vals.filter(v=>v!=null));
    return `<tr><th scope="row">${lab}</th>${mons.map((x,i)=>!x.there?na:`<td><div class="cmpstat${cols>1&&vals[i]===top?' best':''}"><span class="mono">${dash(vals[i])}</span><span class="bar" aria-hidden="true"><i style="width:${Math.min((vals[i]||0)/STAT_MAX*100,100).toFixed(1)}%"></i></span></div></td>`).join('')}</tr>`;
  }).join('');
  const tots=mons.map(x=>x.there?total(x.e,g):null),tTop=Math.max(...tots.filter(v=>v!=null));
  const totRow=`<tr><th scope="row">Total</th>${mons.map((x,i)=>!x.there?na:`<td class="mono${cols>1&&tots[i]===tTop?' cmpbest':''}">${dash(tots[i])}</td>`).join('')}</tr>`;
  // Type matchups: only types where at least one of them is not neutral.
  const defm=x=>Object.fromEntries(ts.map(a=>[a,(x.e.types||[]).filter(d=>ts.includes(d)).reduce((m,d)=>m*cell(g,a,d),1)]));
  const dm=mons.map(x=>x.there?defm(x):null);
  const mstyle=m=>m>=4?'background:var(--hot);color:var(--on-data);font-weight:700':m>=2?'background:var(--hot);color:var(--on-data)':m===0?'background:var(--zero);color:var(--on-zero)':m<=.25?'background:var(--cooler);color:var(--on-data)':m<1?'background:var(--cool);color:var(--on-data)':'';
  const matchRows=ts.filter(a=>dm.some(d=>d&&d[a]!==1)).map(a=>`<tr><th scope="row">${chip(a)}</th>${mons.map((x,i)=>!x.there?na:`<td class="mono cmpmult" style="${mstyle(dm[i][a])}">×${mult(dm[i][a])}</td>`).join('')}</tr>`).join('');
  // Resistances: how many attacking types each one takes ×½, ×¼ or ×0 from. The total counts all three, and the highest is marked.
  const count=(i,f)=>Object.values(dm[i]).filter(f).length;
  const resCounts=mons.map((x,i)=>x.there?{half:count(i,m=>m===.5),quarter:count(i,m=>m>0&&m<=.25),zero:count(i,m=>m===0)}:null);
  const resTot=resCounts.map(c=>c?c.half+c.quarter+c.zero:null),resTop=Math.max(...resTot.filter(v=>v!=null));
  const resLine=(lab,f,bold)=>`<tr><th scope="row">${lab}</th>${mons.map((x,i)=>!x.there?na:`<td class="mono${bold&&cols>1&&resTot[i]===resTop?' cmpbest':''}">${f(i)}</td>`).join('')}</tr>`;
  const resRows=resLine('×½',i=>resCounts[i].half)+resLine('×¼',i=>resCounts[i].quarter)+resLine('Immune (×0)',i=>resCounts[i].zero)+resLine('Total resistances',i=>resTot[i],true);
  // Movesets: every move any of them learns, with how each one learns it.
  const sets=mons.map(x=>x.there?movesetOf(x.id,g):[]);
  const allMoves=[...new Set(sets.flat().map(x=>x.m))].sort((a,b)=>label('moves',a).localeCompare(label('moves',b)));
  const shared=allMoves.filter(m=>sets.every((s,i)=>!mons[i].there||s.some(x=>x.m===m))).length;
  const moveRows=allMoves.map(m=>{const e=effMove(S.moves[m],g);return `<tr><th scope="row"><span class="cmpmove"><a href="#m-${esc(m)}">${esc(label('moves',m))}</a>${e.type?chipText(e.type):''}</span></th>${mons.map((x,i)=>!x.there?na:`<td>${sets[i].filter(s=>s.m===m).map(s=>esc(s.how||'Yes')).join('<br>')||'<span class="muted">—</span>'}</td>`).join('')}</tr>`}).join('');
  const body=[
    line('Type',x=>(x.e.types||[]).length?chips(x.e.types):'<span class="muted">Not set</span>'),
    sec('Base stats'),st,totRow,
    g>=3?sec('Abilities')+line('Abilities',x=>(x.e.abilitySlots||[]).map((o,i)=>`<div><span class="muted">${i+1}.</span> ${o.map(a=>`<a href="#a-${esc(a)}">${esc(label('abilities',a))}</a>`).join(' / ')}</div>`).join('')||'<span class="muted">Not set</span>'):'',
    sec('Vitals'),line('Growth rate',x=>dash(x.e.growthRate)),line('Height',x=>dash(heightText(x.e.height))),line('Weight',x=>dash(weightText(x.e.weight))),line('Evolves from',x=>x.e.evolvesFrom?`${pokeLink(x.e.evolvesFrom)}${x.e.evoMethod?` <span class="muted">(${esc(x.e.evoMethod)})</span>`:''}`:'<span class="muted">—</span>'),
    sec('Damage taken'),matchRows||`<tr><td colspan="${cols+1}" class="muted">Neutral against every type.</td></tr>`,
    sec('Resistances'),resRows,
    sec(`Moves <span class="muted" style="font-weight:400;text-transform:none">${allMoves.length} total${cols>1?`, ${shared} shared by all`:''}</span>`),moveRows||`<tr><td colspan="${cols+1}" class="muted">No moves added yet.</td></tr>`
  ].join('');
  return top+`<div class="box"><table class="cmp" style="min-width:${200+cols*200}px"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
function cmpPick(){
  const ids=[0,1,2].map(i=>byName('pokemon',$('cmp-'+i)?.value)).filter(Boolean);
  const h='cmp'+(ids.length?'-'+[...new Set(ids)].join(','):'');
  if(location.hash.slice(1)!==h)location.hash=h;
}
/* TMs and HMs. Each game has its own list, stored in data/tms.json as {name, gen, tms:[{n:'TM01', m:moveId, where, price}]}. */
// Reads "tm1", "TM 01" or "HM05" as {kind:'TM', num:1}. Anything else gives null.
function tmParse(s){const x=String(s||'').match(/^\s*(TM|HM)\s*0*(\d+)/i);return x?{kind:x[1].toUpperCase(),num:+x[2],rest:String(s).slice(x[0].length)}:null}
const tmLabel=t=>`${t.kind}${String(t.num).padStart(2,'0')}`;
const tmOrder=(a,b)=>{const x=tmParse(a.n),y=tmParse(b.n);if(!x||!y)return !x-!y;return (x.kind==='HM')-(y.kind==='HM')||x.num-y.num};
const gamesAt=g=>rows('tms').filter(x=>x.gen===g).sort((a,b)=>a.name.localeCompare(b.name));
function tmPage(){
  const g=UI.gen,games=gamesAt(g),cur=games.find(x=>x.id===UI.tmGame)||games[0];
  const top=titleBar('TMs & HMs',`Gen ${ROMAN[g]} games. Each game keeps its own list.`,addBtn('Add game','new-tms'));
  if(!loaded)return top+loading();
  if(!games.length)return top+emptyMsg(`No Gen ${ROMAN[g]} games have a TM list yet.${canEdit?' Add one, like Red & Blue, and fill in its TMs and HMs.':''}`,'new-tms','Add game');
  const tabs=games.length>1?`<div class="btns" role="group" aria-label="Game">${games.map(x=>`<button type="button" class="btn" data-act="tm-game" data-v="${esc(x.id)}" aria-pressed="${x.id===cur.id}">${esc(x.name)}</button>`).join('')}</div>`:'';
  const list=(cur.tms||[]).slice().sort(tmOrder);
  const row=t=>{const mv=S.moves[t.m],e=mv?effMove(mv,g):{};return `<tr><td class="mono mid" style="font-weight:600">${esc(t.n)}</td><td class="name mid">${moveLink(t.m)||'—'}</td><td class="mid">${e.type?chip(e.type):'—'}</td><td class="mid">${e.category?`<span class="cat" style="background:${CAT[e.category]||'var(--soft)'}">${esc(e.category)}</span>`:'—'}</td><td class="num mono mid">${dash(e.power)}</td><td class="num mono mid">${dash(e.accuracy)}</td><td class="num mono mid">${dash(e.pp)}</td><td class="mid">${dash(t.where)}</td><td class="num mono mid">${t.price==null?'—':'₽'+Number(t.price).toLocaleString()}</td></tr>`};
  const nTM=list.filter(t=>tmParse(t.n)?.kind==='TM').length,nHM=list.length-nTM;
  return top+`<div class="toolbar">${tabs}${canEdit?`<button type="button" class="btn push" data-act="edit-tms" data-id="${esc(cur.id)}">Edit ${esc(cur.name)}</button>`:''}</div>
  <section class="card"><h2>${esc(cur.name)} <span class="muted" style="font-size:16px;font-family:var(--body);text-transform:none">${nTM} TMs, ${nHM} HMs</span></h2>${list.length?`<div class="box" style="border:0"><table style="min-width:760px"><thead><tr><th>No.</th><th>Move</th><th>Type</th><th>Category</th><th class="num">Power</th><th class="num">Acc.</th><th class="num">PP</th><th>Where to get it</th><th class="num">Price</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`:'<p class="muted" style="margin:0">No TMs added yet.</p>'}</section>`;
}
function openTms(id){
  const d=id?S.tms[id]:{name:'',gen:UI.gen,tms:[]};
  F={col:'tms',id,rows:(d.tms||[]).slice().sort(tmOrder).map(t=>({n:t.n,m:label('moves',t.m),where:t.where||'',price:t.price??''}))};
  if(!F.rows.length)F.rows.push({n:'TM01',m:'',where:'',price:''});
  const others=rows('tms').filter(x=>x.id!==id).sort((a,b)=>a.gen-b.gen||a.name.localeCompare(b.name));
  const copy=others.length?`<div class="toolbar"><label class="ctl" style="flex:1 1 220px">Start from another game's list<select id="tm-src">${others.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} (Gen ${ROMAN[x.gen]})</option>`).join('')}</select></label><button type="button" class="btn" data-act="tm-copyfrom">Replace rows with this list</button></div>`:'';
  modal(`${id?'Edit':'Add'} TM list`,`<div class="formbody"><div class="fgrid">${input('name','Game',d.name,{ph:'Red & Blue'})}${genSelect('gen',d.gen,'Generation')}</div>${copy}<p class="hint">Number is like TM01 or HM05. New move names are added to Moves. Price is optional.</p><div id="tmrows" style="display:flex;flex-direction:column;gap:8px"></div></div>${foot(id,'del-tms')}`,saveTms);
  drawTms();
}
function drawTms(){
  $('tmrows').innerHTML=F.rows.map((x,i)=>`<div class="tmrow">${input(`tm${i}-n`,'No.',x.n,{ph:'TM01'})}${input(`tm${i}-m`,'Move',x.m,{list:'dl-moves'})}${input(`tm${i}-where`,'Where to get it',x.where)}${input(`tm${i}-price`,'Price',x.price,{type:'number',min:0})}<button type="button" class="btn small" data-act="tm-del" data-v="${i}" aria-label="Remove row ${i+1}">Remove</button></div>`).join('')+'<div class="btns"><button type="button" class="btn small" data-act="tm-add" data-v="TM">Add TM</button><button type="button" class="btn small" data-act="tm-add" data-v="HM">Add HM</button></div>';
}
function readTms(){F.rows=F.rows.map((_,i)=>({n:v(`tm${i}-n`),m:v(`tm${i}-m`),where:v(`tm${i}-where`),price:v(`tm${i}-price`)}))}
// New rows take the next free number of that kind.
function addTmRow(kind){
  readTms();
  const max=F.rows.map(r=>tmParse(r.n)).filter(t=>t&&t.kind===kind).reduce((m,t)=>Math.max(m,t.num),0);
  F.rows.push({n:tmLabel({kind,num:max+1}),m:'',where:'',price:''});drawTms();$(`f-tm${F.rows.length-1}-m`)?.focus();
}
function tmCopyFrom(){
  readTms();const src=S.tms[$('tm-src').value];if(!src)return;
  F.rows=(src.tms||[]).slice().sort(tmOrder).map(t=>({n:t.n,m:label('moves',t.m),where:t.where||'',price:t.price??''}));
  drawTms();toast(`Copied ${F.rows.length} rows from ${src.name}. Change what's different, then Save.`);
}
async function saveTms(){
  readTms();
  const name=v('name'),gen=+v('gen');
  if(!name)return fail('Give the game a name.');
  if(rows('tms').some(x=>x.id!==F.id&&x.name.toLowerCase()===name.toLowerCase()))return fail(`There's already a list called ${name}.`);
  const list=F.rows.filter(r=>r.n||r.m),seen=new Set();
  for(const r of list){
    const t=tmParse(r.n);
    if(!t||t.rest.trim())return fail(`"${r.n||'(blank)'}" isn't a TM or HM number. Use something like TM01 or HM05.`);
    if(!r.m)return fail(`${tmLabel(t)} needs a move.`);
    if(seen.has(tmLabel(t)))return fail(`${tmLabel(t)} is listed twice.`);seen.add(tmLabel(t));
    const mid=byName('moves',r.m);if(mid&&(S.moves[mid].debut||1)>gen)return fail(`${S.moves[mid].name} debuts in Gen ${ROMAN[S.moves[mid].debut]}, so it can't be a Gen ${ROMAN[gen]} TM.`);
    if(r.price!==''&&!(Number(r.price)>=0))return fail(`${tmLabel(t)}'s price must be 0 or more.`);
  }
  const tms=[];
  for(const r of list){const t=tmParse(r.n),o={n:tmLabel(t),m:await ensure('moves',r.m,gen)};if(r.where)o.where=r.where;if(r.price!=='')o.price=Number(r.price);tms.push(o)}
  const id=F.id||newId('tms',name),doc={name,gen,tms:tms.sort(tmOrder)};
  if(!await put('tms/'+id,doc))return;
  S.tms[id]=doc;UI.tmGame=id;
  if(gen!==UI.gen){UI.gen=gen;try{localStorage.setItem('gen',gen)}catch(e){}}
  closeModal();render();toast('Saved');
}

/* Copying the previous generation's moveset into this one. TMs and HMs are checked against one of this generation's games:
   ones that game doesn't have are dropped, and ones with a different number there are renumbered. */
function copyPrevMoveset(){
  const {pid,g}=F,game=S.tms[$('ms-game')?.value||''];
  const byMove=new Map();for(const t of (game?.tms||[]).slice().sort(tmOrder))if(!byMove.has(t.m))byMove.set(t.m,t.n);
  const kept=[],dropped=[],renum=[];let unchecked=0;
  for(const x of movesetOf(pid,g-1)){
    const t=tmParse(x.how),name=label('moves',x.m);
    if(!t){kept.push({m:name,how:x.how});continue}
    if(!game){unchecked++;kept.push({m:name,how:x.how});continue}
    const now=byMove.get(x.m);
    if(!now){dropped.push(`${name} (${tmLabel(t)})`);continue}
    if(now!==tmLabel(t))renum.push(`${name}: ${tmLabel(t)} to ${now}`);
    kept.push({m:name,how:now+t.rest});
  }
  F.ms=kept.length?kept:[{m:'',how:''}];
  drawMoveset();
  const out=[`Copied ${kept.length} move${kept.length===1?'':'s'} from Gen ${ROMAN[g-1]}. Nothing is saved until you press Save.`];
  if(game){
    out.push(dropped.length?`Removed ${dropped.length}, not a TM or HM in ${game.name}: ${dropped.join(', ')}.`:`Every TM and HM is also in ${game.name}.`);
    if(renum.length)out.push(`Renumbered ${renum.length}: ${renum.join('; ')}.`);
  }else if(unchecked)out.push(`${unchecked} TMs and HMs were copied unchanged because no Gen ${ROMAN[g]} game has a TM list. Add one on the TMs & HMs page to check them.`);
  $('ms-note').innerHTML=out.map(s=>`<span style="display:block">${esc(s)}</span>`).join('');$('ms-note').hidden=false;
}

/* Damage calculator, laid out like the Showdown calc: results on top, then Pokémon 1 · field · Pokémon 2.
   The address can name a Pokémon to put on the left, like #calc-venusaur.
   Items and abilities are free text in this tracker, so their effect goes in each side's "Extra multiplier". */
const WEATHER=[['','None',1],['sun','Sun',2],['rain','Rain',2],['sand','Sand',2],['hail','Hail',3]];
const WEATHER_IN={sun:'in Sun',rain:'in Rain',sand:'in Sand',hail:'in Hail'};
const STATUS_OPTS=[['','Healthy'],['brn','Burned'],['par','Paralyzed'],['other','Other status']];
// Barrier and Light Screen double the user's Defense or Special until it switches out (see their move pages). Crits ignore them.
const SIDE_TOGGLES=[['barrier','Barrier'],['light','Light Screen']];
const STAT_SHORT={hp:'HP',atk:'Atk',def:'Def',spa:'SpA',spd:'SpD',spe:'Spe',spc:'Spc'};
function dmgSide(){return {p:null,level:50,dv:{atk:DV_MAX,def:DV_MAX,spe:DV_MAX,spc:DV_MAX},se:{},iv:Object.fromEntries(EV_KEYS.map(([k])=>[k,IV_MAX])),ev:{},nature:'',stages:{},status:'',hpv:null,mult:1,moves:['','','',''],crits:[false,false,false,false],barrier:false,light:false}}
const dmgState=()=>UI.dmg||(UI.dmg={sides:[dmgSide(),dmgSide()],weather:'',sel:{i:0,j:0},applied:null});
const stageMul=n=>n>=0?(2+n)/2:2/(2-n);
function dmgStats(s,g){
  const p=S.pokemon[s.p];if(!p||(p.debut||1)>g)return null;
  const e=eff(p,g),raw=Object.fromEntries(calcStats(e,g,s.level||1,g<=2?{dv:s.dv,se:s.se}:{iv:s.iv,ev:s.ev,nature:s.nature}).map(([k,,x])=>[k,x]));
  return {e,raw:Object.values(raw).some(x=>x==null)?null:raw};
}
const dmgCurHP=(s,st)=>Math.min(Math.max(s.hpv??st.raw.hp,0),st.raw.hp);
// Final Speed after stages and paralysis (×¼ in Gens I–IV).
const dmgSpeed=(s,st)=>Math.floor(Math.floor(st.raw.spe*stageMul(s.stages.spe||0))*(s.status==='par'?.25:1));
// Every damage roll for one move. Returns {rolls, ...} or {why} when it can't be worked out.
function dmgRolls(g,A,a,D,d,mid,weather,crit){
  const mv=S.moves[mid];if(!mv)return {why:'Unknown move'};
  if((mv.debut||1)>g)return {why:`Debuts in Gen ${ROMAN[mv.debut]}`};
  const m=effMove(mv,g);
  if(!m.category)return {why:'No category set',m};
  if(m.category==='Status')return {why:'Status move',m};
  if(!m.power)return {why:'No power set',m};
  if(!m.type)return {why:'No type set',m};
  /* A Variable move counts as physical or special by its type before Gen IV (how Hidden Power works there). From Gen IV
     it uses whichever of the attacker's Attack or Sp. Atk is higher after stat stages. */
  const varPhys=()=>g<SPLIT_FROM?typeCat(m.type)!=='Special':Math.floor(a.raw.atk*stageMul(A.stages.atk||0))>=Math.floor(a.raw.spa*stageMul(A.stages.spa||0));
  const phys=m.category==='Variable'?varPhys():m.category==='Physical',aK=phys?'atk':g===1?'spc':'spa',dK=phys?'def':g===1?'spc':'spd';
  let as=A.stages[aK]||0,ds=D.stages[dK]||0;
  if(crit){if(g===1||(g===2&&as<=ds)){as=0;ds=0}else if(g>=3){as=Math.max(as,0);ds=Math.min(ds,0)}}
  let atk=Math.floor(a.raw[aK]*stageMul(as)),def=Math.floor(d.raw[dK]*stageMul(ds));
  const screen=!crit&&(phys?D.barrier:D.light),burn=phys&&A.status==='brn';
  if(screen)def*=2;
  if(g<=2){
    if(burn&&!(g===1&&crit))atk=Math.floor(atk/2);
    if(atk>255||def>255){atk=Math.max(1,Math.floor(atk/4));def=Math.max(1,Math.floor(def/4))}
  }
  const sandUp=g>=4&&weather==='sand'&&!phys&&(d.e.types||[]).includes('Rock');
  if(sandUp)def=Math.floor(def*1.5);
  const L=A.level||1,Lc=g===1&&crit?2*L:L;
  let base=Math.floor(Math.floor(Math.floor(2*Lc/5+2)*m.power*atk/Math.max(1,def))/50);
  const wm=g<2?1:weather==='sun'?(m.type==='Fire'?1.5:m.type==='Water'?.5:1):weather==='rain'?(m.type==='Water'?1.5:m.type==='Fire'?.5:1):1;
  if(g<=2){base=Math.min(base,997)+2;if(g===2&&crit)base*=2;base=Math.floor(base*wm)}
  else{if(burn)base=Math.floor(base/2);base=Math.floor(base*wm)+2;if(crit)base*=2}
  base=Math.floor(base*(Number(A.mult)||1));
  const ts=typesAt(g),each=(d.e.types||[]).filter(t=>ts.includes(t)).map(t=>cell(g,m.type,t)),te=each.reduce((x,y)=>x*y,1);
  const stab=(a.e.types||[]).includes(m.type)?1.5:1,info={m,te,stab,aK,dK,as,ds,screen,burn,weatherHit:wm!==1||sandUp,crit};
  if(te===0)return {rolls:[0],...info};
  const finish=x=>{let v=Math.floor(x*stab);for(const t of each)v=Math.floor(v*t);return v};
  const rolls=[];
  if(g<=2){const b=finish(base);for(let r=217;r<=255;r++)rolls.push(Math.max(1,Math.floor(b*r/255)))}
  else for(let r=85;r<=100;r++)rolls.push(Math.max(1,finish(Math.floor(base*r/100))));
  return {rolls,...info};
}
// Chance that n hits in a row (every roll equally likely) do at least hp damage, for n = 1 to 4.
function koText(rolls,hp){
  if(!rolls.length||rolls[rolls.length-1]===0)return 'no damage';
  let dist=new Map([[0,1]]);const p=1/rolls.length,name=n=>n===1?'OHKO':n+'HKO';
  for(let n=1;n<=4;n++){
    const next=new Map();for(const [s,q] of dist)for(const r of rolls){const t=Math.min(s+r,hp);next.set(t,(next.get(t)||0)+q*p)}
    dist=next;const ko=dist.get(hp)||0;
    if(ko>=.99995)return `guaranteed ${name(n)}`;
    if(ko>0)return `${(ko*100).toFixed(1).replace(/\.0$/,'')}% chance to ${name(n)}`;
  }
  const lo=Math.ceil(hp/rolls[rolls.length-1]),hi=Math.ceil(hp/rolls[0]);
  return lo===hi?`guaranteed ${name(lo)}`:`possible ${name(lo)}`;
}
// The one-line summary, like "+1 Lv. 50 252+ Atk Venusaur Razor Leaf vs. 0 HP / 0 Def Charizard: 23-28 (15 - 18.3%) -- guaranteed 6HKO".
function dmgDesc(g,A,a,D,d,mid,r,hp){
  const stage=n=>n?(n>0?'+'+n:String(n))+' ':'',lv=s=>s.level&&s.level!==100?`Lv. ${s.level} `:'';
  const sign=(s,k)=>{const x=natureMods(s.nature)[k];return x>1?'+':x<1?'-':''};
  const ev=(s,k)=>g>=3?`${s.ev[k]||0}${sign(s,k)} ${STAT_SHORT[k]} `:'';
  const aS=r.as,dS=r.ds;
  const left=`${stage(aS)}${lv(A)}${ev(A,r.aK)}${r.burn?'burned ':''}${esc(label('pokemon',A.p))}${Number(A.mult)!==1?` (×${A.mult})`:''} ${esc(label('moves',mid))}`;
  const right=`${stage(dS)}${lv(D)}${g>=3?`${D.ev.hp||0} HP / `:''}${ev(D,r.dK).trim()} ${esc(label('pokemon',D.p))}`.replace(/\s+/g,' ').trim();
  const extra=[r.screen?`through ${r.aK==='atk'?'Barrier':'Light Screen'}`:'',r.weatherHit?WEATHER_IN[dmgState().weather]:'',r.crit?'on a critical hit':''].filter(Boolean).join(' ');
  const lo=r.rolls[0],hi=r.rolls[r.rolls.length-1],pct=x=>+(x/d.raw.hp*100).toFixed(1);
  return `${left} vs. ${right}${extra?' '+extra:''}: ${lo}-${hi} (${pct(lo)} - ${pct(hi)}%) -- ${koText(r.rolls,hp)}`;
}
function dmgPanel(i,g){
  const s=dmgState().sides[i],p=S.pokemon[s.p],old=g<=2,st=p?dmgStats(s,g):null,pfx=`dc-${i}-`;
  const box=(key,val,max,lab,w)=>`<input class="calcin" id="${pfx}${key}" type="number" min="0" max="${max}" value="${esc(val??'')}" placeholder="0" aria-label="${esc(lab)}"${w?` style="width:${w}px"`:''}>`;
  // Trainer Pokémon from this generation's encounters, so you can load one in a step.
  const opts=[];
  for(const t of rows('trainers').sort((a,b)=>a.name.localeCompare(b.name)))(t.encounters||[]).forEach((e,ei)=>{if(e.gen!==g)return;encTeams(e).forEach((x,ti)=>x.team.forEach((m,mi)=>{if(m.p)opts.push([`${t.id}|${ei}|${ti}|${mi}`,`${t.name} · ${e.label||'Battle'}${x.when?` (${x.when})`:''} · ${label('pokemon',m.p)}${m.level?' Lv '+m.level:''}`])}))});
  const pick=`<div class="fgrid dcpick"><label class="ctl">Pokémon ${i+1}<input id="${pfx}p" list="dl-pokemon" value="${esc(p?pname(p):'')}" placeholder="Type a name" autocomplete="off"></label>${opts.length?`<label class="ctl">Load a trainer's Pokémon<select id="${pfx}load"><option value="">Choose</option>${opts.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`:''}</div>`;
  const msg=t=>`<section class="card dcpanel">${pick}<p class="muted" style="margin:0">${t}</p></section>`;
  if(!p)return msg('Pick a Pokémon.');
  if(!st)return msg(`${esc(pname(p))} debuts in Gen ${ROMAN[p.debut]}.`);
  if(!st.raw)return msg(`Fill in all of ${esc(pname(p))}'s base stats first.`);
  const e=st.e;
  const stageSel=k=>`<select class="calcin" id="${pfx}st-${k}" aria-label="${STAT_SHORT[k]} stage" style="width:62px">${[6,5,4,3,2,1,0,-1,-2,-3,-4,-5,-6].map(n=>`<option value="${n}"${(s.stages[k]||0)===n?' selected':''}>${n>0?'+'+n:n}</option>`).join('')}</select>`;
  const row=([k,lab,b])=>{
    let a,c;
    if(old){a=k==='hp'?`<span class="mono muted" id="${pfx}hpdv">${hpDV(s.dv)}</span>`:g===2&&k==='spd'?'<span class="muted">Same</span>':box('dv-'+oldKey(k),s.dv[oldKey(k)],DV_MAX,lab+' DV',54);c=g===2&&k==='spd'?'<span class="muted">Same</span>':box('se-'+oldKey(k),s.se[oldKey(k)],SE_MAX,lab+' Stat Exp',78)}
    else{a=box('iv-'+k,s.iv[k],IV_MAX,lab+' IV',54);c=box('ev-'+k,s.ev[k],EV_MAX,lab+' EV',62)}
    return `<tr><th scope="row">${STAT_SHORT[k]}<span class="natmark" id="${pfx}nat-${k}"></span></th><td class="num mono">${b}</td><td>${a}</td><td>${c}</td><td class="num mono calcres" id="${pfx}out-${k}"></td><td>${k==='hp'?'':stageSel(k)}</td></tr>`;
  };
  const nat=old?'':`<label class="ctl">Nature<select id="${pfx}nature"><option value="">Neutral</option>${NATURES.map((r,x)=>r.map((n,y)=>x===y?'':`<option${s.nature===n?' selected':''} value="${n}">${n} (+${STAT_SHORT[NATURE_STATS[x][0]]}, −${STAT_SHORT[NATURE_STATS[y][0]]})</option>`).join('')).join('')}</select></label>`;
  const moveRow=(m,j)=>`<div class="dcmove"><input class="calcin" id="${pfx}mv-${j}" list="dl-moves" value="${esc(m)}" autocomplete="off" aria-label="Move ${j+1}"><span class="mono muted" id="${pfx}mvbp-${j}"></span><span id="${pfx}mvtype-${j}"></span><span class="muted" id="${pfx}mvcat-${j}"></span><label class="check dccrit"><input type="checkbox" id="${pfx}crit-${j}"${s.crits[j]?' checked':''}>Crit</label></div>`;
  return `<section class="card dcpanel">${pick}
  <div class="dcid">${pokeTile(p,e,g,56)}<div style="min-width:0"><a class="name" href="#p-${esc(s.p)}" style="font-size:18px">${esc(pname(p))}</a>${(e.types||[]).length?chips(e.types):''}</div><label class="ctl" style="margin-left:auto;width:84px">Level<input id="${pfx}level" type="number" min="1" max="100" value="${esc(s.level)}"></label></div>
  <div class="box" style="border:0"><table class="calc"><thead><tr><th></th><th class="num">Base</th><th>${old?'DVs':'IVs'}</th><th>${old?'Stat Exp':'EVs'}</th><th class="num"></th><th>Boost</th></tr></thead><tbody>${statsAt(e,g).map(row).join('')}</tbody></table></div>
  <p class="hint" id="${pfx}evtot"></p>
  <div class="fgrid">${nat}<label class="ctl">Status<select id="${pfx}status">${STATUS_OPTS.map(([v,l])=>`<option value="${v}"${s.status===v?' selected':''}>${l}</option>`).join('')}</select></label><label class="ctl">Extra multiplier<input id="${pfx}mult" type="number" min="0" step="0.1" value="${esc(s.mult)}" title="Items and abilities, like 1.5 for a boosting item. Applies to this Pokémon's attacks."></label></div>
  <div class="dchp"><span style="font-weight:600">Current HP</span><input class="calcin" id="${pfx}hpv" type="number" min="0" max="${st.raw.hp}" value="${dmgCurHP(s,st)}" aria-label="Current HP"><span class="mono">/ ${st.raw.hp}</span><input class="calcin" id="${pfx}hp" type="number" min="0" max="100" value="${Math.floor(dmgCurHP(s,st)/st.raw.hp*100)}" aria-label="Current HP percent" style="width:64px"><span>%</span></div>
  <div class="hpbar" aria-hidden="true"><i id="${pfx}hpbar"></i></div>
  <div class="dcmoves">${s.moves.map(moveRow).join('')}</div></section>`;
}
function dmgField(g){
  const D=dmgState(),name=i=>esc(S.pokemon[D.sides[i].p]?pname(D.sides[i].p):`Pokémon ${i+1}`);
  const tog=(i,k,l)=>`<button type="button" class="btn small" data-act="dmg-tog" data-v="${i}|${k}" aria-pressed="${!!D.sides[i][k]}">${l}</button>`;
  return `<section class="card dcfield"><h2>Field</h2>
  ${g>=2?`<div class="dcgroup"><span class="dclbl">Weather</span><div class="btns" role="group" aria-label="Weather">${WEATHER.filter(x=>x[2]<=g).map(([v,l])=>`<button type="button" class="btn small" data-act="dmg-weather" data-v="${v}" aria-pressed="${D.weather===v}">${l}</button>`).join('')}</div></div>`:''}
  <div class="dcsides">${[0,1].map(i=>`<div class="dcgroup"><span class="dclbl">${name(i)}'s side</span><div class="btns" style="flex-direction:column;align-items:stretch">${SIDE_TOGGLES.map(([k,l])=>tog(i,k,l)).join('')}</div></div>`).join('')}</div>
  <div class="dcgroup"><span class="dclbl">Speed</span><div id="dc-speed" class="hint"></div></div>
  <button type="button" class="btn" data-act="dmg-swap" style="width:100%">Swap sides</button></section>`;
}
function calcPage(){
  const g=UI.gen,D=dmgState();
  if(loaded&&S.pokemon[UI.arg]&&D.applied!==UI.arg){D.applied=UI.arg;const s=D.sides[0];s.p=UI.arg;s.moves=['','','',''];s.stages={};s.hpv=null;s.crits=[false,false,false,false]}
  const top=titleBar('Damage Calculator',`Gen ${ROMAN[g]} formulas, from the Battle Mechanics page.`);
  if(!loaded)return top+loading();
  return top+`<section class="card dcres" id="dc-res"></section><div class="dcgrid">${dmgPanel(0,g)}${dmgField(g)}${dmgPanel(1,g)}</div>
  <p class="hint">Every random roll is worked out. KO chances assume each hit lands with the same settings. Fixed-damage moves, multi-hit moves and other move effects aren't worked out. Barrier and Light Screen double the defending stat, and crits ignore them.</p>`;
}
// Fills every number and the results. Called after drawing and on every edit, so the box you're typing in keeps focus.
function dmgFill(){
  if(UI.route!=='calc'||!$('dc-res'))return;
  const g=UI.gen,D=dmgState(),st=D.sides.map(s=>s.p?dmgStats(s,g):null),ok=st.map(x=>!!x?.raw),name=i=>esc(S.pokemon[D.sides[i].p]?pname(D.sides[i].p):`Pokémon ${i+1}`);
  const setVal=(id,v)=>{const el=$(id);if(el&&document.activeElement!==el)el.value=v};
  D.sides.forEach((s,i)=>{
    if(!ok[i])return;
    const x=st[i],mods=g<=2?{}:natureMods(s.nature),pfx=`dc-${i}-`;
    for(const [k] of statsAt(x.e,g)){const o=$(pfx+'out-'+k);if(o)o.textContent=x.raw[k];const nm=$(pfx+'nat-'+k);if(nm)nm.textContent=mods[k]>1?'+':mods[k]<1?'−':''}
    const hd=$(pfx+'hpdv');if(hd)hd.textContent=hpDV(s.dv);
    const et=$(pfx+'evtot');if(et){if(g>=3){const t=Object.values(s.ev).reduce((a,b)=>a+(b||0),0);et.textContent=`EVs: ${t} / ${EV_TOTAL}${t>EV_TOTAL?', over the limit':''}`}else et.hidden=true}
    const cur=dmgCurHP(s,x),pc=cur/x.raw.hp*100;
    setVal(pfx+'hpv',cur);setVal(pfx+'hp',Math.floor(pc));
    const bar=$(pfx+'hpbar');if(bar){bar.style.width=pc.toFixed(1)+'%';bar.className=pc>50?'good':pc>20?'mid':'low'}
    s.moves.forEach((nm,j)=>{const mid=byName('moves',nm),m=mid?effMove(S.moves[mid],g):{};
      const bp=$(pfx+'mvbp-'+j),ty=$(pfx+'mvtype-'+j),ca=$(pfx+'mvcat-'+j);
      if(bp)bp.textContent=m.power?m.power+' BP':'';if(ty)ty.innerHTML=m.type?chipText(m.type):'';if(ca)ca.textContent=m.category||''});
  });
  if(ok[0]&&ok[1]){
    const a=dmgSpeed(D.sides[0],st[0]),b=dmgSpeed(D.sides[1],st[1]);
    $('dc-speed').innerHTML=a===b?`Speed tie at ${a}.`:`<b>${name(a>b?0:1)}</b> moves first: ${Math.max(a,b)} to ${Math.min(a,b)}.`;
  }else $('dc-speed').textContent='Pick two Pokémon.';
  const res=$('dc-res');
  if(!ok[0]||!ok[1]){res.innerHTML='<p class="muted" style="margin:0">Pick a Pokémon on each side to see damage.</p>';return}
  // Every move's result, then the one picked for details.
  const R=[0,1].map(i=>{const j=1-i,A=D.sides[i],Df=D.sides[j],hp=Math.max(1,dmgCurHP(Df,st[j]));
    return A.moves.map((nm,k)=>{if(!nm.trim())return null;const mid=byName('moves',nm);return {mid,nm,hp,r:mid?dmgRolls(g,A,st[i],Df,st[j],mid,D.weather,A.crits[k]):{why:'Not in your Moves list'}}})});
  const valid=(i,k)=>R[i][k]&&!R[i][k].r.why;
  if(!valid(D.sel.i,D.sel.j)){const f=[[0,0],[0,1],[0,2],[0,3],[1,0],[1,1],[1,2],[1,3]].find(([i,k])=>valid(i,k));if(f)D.sel={i:f[0],j:f[1]}}
  const btns=i=>`<div class="dcmovebtns"><span class="dclbl">${name(i)}'s moves (select one for details)</span>${R[i].map((x,k)=>{if(!x)return '';const r=x.r,mx=st[1-i].raw.hp;
    const val=r.why?`<small>${esc(r.why==='Status move'?'Status':r.why)}</small>`:`<small class="mono">${+(r.rolls[0]/mx*100).toFixed(1)} - ${+(r.rolls[r.rolls.length-1]/mx*100).toFixed(1)}%</small>`;
    return `<button type="button" class="btn dcmb" data-act="dmg-sel" data-v="${i}|${k}" aria-pressed="${D.sel.i===i&&D.sel.j===k}"${r.why?' disabled':''}><span>${esc(x.mid?label('moves',x.mid):x.nm)}</span>${val}</button>`}).join('')}</div>`;
  const pick=valid(D.sel.i,D.sel.j)?R[D.sel.i][D.sel.j]:null;
  let detail='<p class="muted" style="margin:0">None of the moves do damage yet.</p>';
  if(pick){
    const i=D.sel.i,j=1-i,r=pick.r,mx=st[j].raw.hp,lo=r.rolls[0],hi=r.rolls[r.rolls.length-1],cur=pick.hp/mx*100,lp=Math.min(lo/mx*100,cur),hp2=Math.min(hi/mx*100,cur);
    detail=`<p class="dcdesc">${dmgDesc(g,D.sides[i],st[i],D.sides[j],st[j],pick.mid,r,pick.hp)}</p>
    <div class="dmgbar" aria-hidden="true"><i class="cur" style="width:${cur.toFixed(1)}%"></i><i class="lo" style="width:${lp.toFixed(1)}%"></i><i class="hi" style="left:${lp.toFixed(1)}%;width:${Math.max(0,hp2-lp).toFixed(1)}%"></i></div>
    <p class="hint" style="margin:6px 0 0"><span class="key lo"></span>lowest roll <span class="key hi"></span>highest roll <span class="key cur"></span>HP left</p>
    <p class="hint" style="margin-top:8px">Possible damage amounts: (${r.rolls.join(', ')})</p>`;
  }
  res.innerHTML=`<div class="dcbtnrow">${btns(0)}${btns(1)}</div>${detail}`;
}
function dmgInput(el){
  const D=dmgState(),x=el.id.match(/^dc-(\d)-(\w+)(?:-(\w+))?$/);if(!x)return;
  const i=+x[1],s=D.sides[i],f=x[2],k=x[3];
  if(f==='p'||f==='load')return; // handled on change
  if(el.type==='checkbox'){if(f==='crit')s.crits[+k]=el.checked}
  else if(f==='nature'||f==='status')s[f]=el.value;
  else if(f==='mv')s.moves[+k]=el.value;
  else if(f==='st')s.stages[k]=+el.value;
  else{
    const raw=el.value.trim(),num=raw===''?null:Number(raw),min=+el.min||0,max=el.max===''?Infinity:+el.max;
    const good=num===null||(num>=min&&num<=max&&(f==='mult'||Number.isInteger(num)));
    el.setAttribute('aria-invalid',String(!good));
    const val=num===null?null:Math.min(Math.max(f==='mult'?num:Math.round(num),min),max);
    if(f==='hp'){const st=dmgStats(s,UI.gen);if(st?.raw)s.hpv=val==null?null:Math.floor(st.raw.hp*val/100)}
    else if(f==='hpv')s.hpv=val;
    else if(k)s[f][k]=val;
    else s[f]=f==='mult'?(val??1):val;
  }
  dmgFill();
}
function dmgPick(el){
  const D=dmgState(),i=+el.id[3],s=D.sides[i];
  if(el.id.endsWith('-p')){const id=byName('pokemon',el.value);if(!id||id===s.p)return;Object.assign(s,{p:id,moves:['','','',''],stages:{},hpv:null,crits:[false,false,false,false]});render();return}
  const [tid,ei,ti,mi]=el.value.split('|'),e=S.trainers[tid]?.encounters?.[+ei];if(!e)return;
  const m=encTeams(e)[+ti]?.team?.[+mi];if(!m)return;
  const num=o=>Object.fromEntries(Object.entries(o||{}).filter(([,v])=>v!==''&&v!=null).map(([k,v])=>[k,Number(v)||0]));
  const fresh=dmgSide();
  Object.assign(fresh,{p:m.p,level:Number(m.level)||50,dv:{atk:0,def:0,spe:0,spc:0,...num(m.dvs)},iv:{...Object.fromEntries(EV_KEYS.map(([k])=>[k,0])),...num(m.ivs)},ev:num(m.evs),nature:m.nature||'',
    moves:[0,1,2,3].map(j=>m.moves?.[j]?label('moves',m.moves[j]):''),barrier:s.barrier,light:s.light});
  D.sides[i]=fresh;render();toast(`Loaded ${label('pokemon',m.p)}. Missing DVs or IVs count as 0.`);
}
function abilityPage(id){
  const raw=S.abilities[id];
  if(!raw)return loaded?emptyMsg('This ability is not in your list.'):loading();
  const a={id,...raw},g=UI.gen;
  if((a.debut||3)>g)return notThere(a.name,a.debut||3,'#abilities');
  const e=eff(a,g),mults=Object.entries(e.statMults||{}).filter(([k,m])=>m>0&&m!==1).map(([k,m])=>`${(BOOST_STATS.find(s=>s[0]===k)||[,k])[1]} ×${m}`);
  const users=rows('pokemon').filter(p=>(p.debut||1)<=g).map(p=>({p,i:(eff(p,g).abilitySlots||[]).findIndex(o=>o.includes(id))})).filter(x=>x.i>=0)
    .sort((x,y)=>(x.p.dex??1e9)-(y.p.dex??1e9)||pname(x.p,g).localeCompare(pname(y.p,g)));
  const defs=[e.immuneTo&&`<div><dt>Grants immunity to</dt><dd>${chip(e.immuneTo)}</dd></div>`,mults.length&&`<div><dt>Stat multipliers</dt><dd>${esc(mults.join(', '))}${e.boostWhen?` <span class="muted">(${esc(e.boostWhen)})</span>`:''}</dd></div>`].filter(Boolean).join('');
  return `<a href="#abilities" style="align-self:flex-start;display:flex;align-items:center;min-height:44px;font-weight:600">Back to Abilities</a>
  <section class="hero"><div class="grow"><span class="mono">Debuted in Gen ${ROMAN[a.debut||3]}</span><h1>${esc(a.name)}</h1></div>${canEdit?`<button type="button" class="btn" data-act="edit-abilities" data-id="${esc(id)}">Edit Gen ${ROMAN[g]} data</button>`:''}</section>
  <section class="card"><h2>Effect</h2>${defs?`<dl class="defs" style="margin-bottom:14px">${defs}</dl>`:''}<p style="margin:0">${dash(e.effect)}</p>${e.flavor?`<p class="flavor" style="margin:10px 0 0">${esc(e.flavor)}</p>`:''}</section>
  <section class="card"><h2>Pokémon with it in Gen ${ROMAN[g]}</h2>${users.length?`<div class="box" style="border:0"><table><thead><tr><th>No.</th><th>Pokémon</th><th>Slot</th></tr></thead><tbody>${users.map(x=>`<tr><td class="mono muted">${pad(x.p.dex)}</td><td class="name">${pokeLink(x.p.id)}</td><td>${SLOT_NAMES[x.i]||'—'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted" style="margin:0">No Pokémon have it yet.</p>'}</section>`;
}
function movePage(id){
  const raw=S.moves[id];
  if(!raw)return loaded?emptyMsg('This move is not in your list.'):loading();
  const m={id,...raw},g=UI.gen;
  if((m.debut||1)>g)return notThere(m.name,m.debut,'#moves');
  const e=effMove(m,g);
  const hist=[];GENS.filter(x=>x>=(m.debut||1)).forEach(x=>{const f=effMove(m,x),k=JSON.stringify([f.type,f.category,f.power,f.accuracy,f.pp,f.target,f.priority,x>=CONTACT_FROM?f.contact:null]);const last=hist[hist.length-1];if(last&&last.k===k)last.to=x;else hist.push({k,from:x,to:x,f})});
  const learn=(e.learners||[]).slice().sort((a,b)=>(S.pokemon[a.p]?.dex??1e9)-(S.pokemon[b.p]?.dex??1e9)||label('pokemon',a.p).localeCompare(label('pokemon',b.p))||learnOrder(a.how,b.how));
  return `<a href="#moves" style="align-self:flex-start;display:flex;align-items:center;min-height:44px;font-weight:600">Back to Moves</a>
  <section class="hero"><div class="grow"><h1>${esc(m.name)}</h1><div class="chips">${e.type?chip(e.type):''}${e.category?`<span class="cat" style="background:${CAT[e.category]||'var(--soft)'}">${esc(e.category)}</span>`:''}</div></div>
  <dl class="bigstats"><div><dt>Power</dt><dd>${dash(e.power)}</dd></div><div><dt>Accuracy</dt><dd>${dash(e.accuracy)}</dd></div><div><dt>PP</dt><dd>${dash(e.pp)}</dd></div><div><dt>Priority</dt><dd>${dash(prioText(e.priority))}</dd></div><div><dt>Debut</dt><dd>Gen ${ROMAN[m.debut||1]}</dd></div></dl>${canEdit?`<button type="button" class="btn" data-act="edit-moves" data-id="${esc(id)}">Edit Gen ${ROMAN[g]} data</button>`:''}</section>
  <section class="card"><h2>Effect</h2><dl class="defs" style="margin-bottom:14px"><div><dt>Target</dt><dd>${dash(TARGETS[e.target])}</dd></div>${g>=CONTACT_FROM?`<div><dt>Makes contact</dt><dd>${dash(contactText(e.contact))}</dd></div>`:''}</dl><p style="margin:0">${dash(e.effect)}</p>${e.flavor?`<p class="flavor" style="margin:10px 0 0">${esc(e.flavor)}</p>`:''}</section>
  <section class="card"><h2>By generation</h2><div class="box" style="border:0"><table><thead><tr><th>Gens</th><th>Type</th><th>Category</th><th class="num">Power</th><th class="num">Acc.</th><th class="num">PP</th><th class="num">Priority</th><th>Target</th><th>Contact</th></tr></thead><tbody>${hist.map(h=>`<tr><td class="name">${h.from===h.to?ROMAN[h.from]:ROMAN[h.from]+' to '+ROMAN[h.to]}</td><td>${dash(h.f.type)}</td><td>${dash(h.f.category)}</td><td class="num mono">${dash(h.f.power)}</td><td class="num mono">${dash(h.f.accuracy)}</td><td class="num mono">${dash(h.f.pp)}</td><td class="num mono">${dash(prioText(h.f.priority))}</td><td>${dash(TARGETS[h.f.target])}</td><td>${h.to<CONTACT_FROM?'<span class="muted">—</span>':dash(contactText(h.f.contact))}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="card"><h2>Pokémon that learn it in Gen ${ROMAN[g]}</h2>${learn.length?`<div class="box" style="border:0"><table><thead><tr><th>No.</th><th>Pokémon</th><th>How</th></tr></thead><tbody>${learn.map(l=>`<tr><td class="mono muted">${pad(S.pokemon[l.p]?.dex)}</td><td class="name">${pokeLink(l.p)}</td><td>${dash(l.how)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted" style="margin:0">No learners added yet.</p>'}</section>`;
}

function trainerList(){
  const list=rows("trainers").sort((a,b)=>a.name.localeCompare(b.name));
  // A card lists the eras of the encounters given, and opens the trainer page on their timeline.
  const card=(t,enc)=>{const eras=ERAS.filter(x=>enc.some(e=>eraOf(e)===x.id)),tl=enc.length?tlOf(enc[0]):"";return `<a class="tcard" href="#t-${esc(t.id)}"${tl?` data-tl="${esc(tl)}"`:""}>${trainerTile(t,64)}<div style="min-width:0"><div class="name" style="font-size:18px">${esc(t.name)}</div>${t.title?`<div class="muted">${esc(t.title)}</div>`:""}<div class="chips" style="margin-top:6px">${eras.map(x=>`<span class="pill">${UI.tgroup==="all"&&TIMELINES.length>1?esc(tlName(tlOfEra(x.id)))+" · ":""}${esc(eraName(x.id))}</span>`).join("")||'<span class="muted" style="font-size:13px">No encounters yet</span>'}</div></div></a>`};
  const grid=cards=>`<div class="tcards">${cards.join("")}</div>`;
  const head=(a,b)=>`<h2 class="genhead">${esc(a)}${b?` <span>${esc(b)}</span>`:""}</h2>`;
  let body;
  if(UI.tgroup==="timeline"){
    body=TIMELINES.map(tl=>{const r=list.map(t=>[t,(t.encounters||[]).filter(e=>tlOf(e)===tl.id)]).filter(([,e])=>e.length);
      return r.length?head(tl.name+" timeline",erasIn(tl.id).map(x=>eraName(x.id)).join(", "))+grid(r.map(([t,e])=>card(t,e))):""}).join("");
    const none=list.filter(t=>!(t.encounters||[]).length);if(none.length)body+=head("No encounters yet")+grid(none.map(t=>card(t,[])));
  }else if(UI.tgroup==="game"){
    // Games in the order of the earliest era they appear in.
    const games=new Map();
    for(const t of list)for(const e of t.encounters||[]){const g=e.game||"Game not set",k=ERAS.findIndex(x=>x.id===eraOf(e));const o=games.get(g)||{k,by:new Map()};o.k=Math.min(o.k,k);if(!o.by.has(t.id))o.by.set(t.id,[]);o.by.get(t.id).push(e);games.set(g,o)}
    body=[...games].sort((a,b)=>a[1].k-b[1].k||a[0].localeCompare(b[0])).map(([g,o])=>head(g,eraName(ERAS[o.k]?.id))+grid(list.filter(t=>o.by.has(t.id)).map(t=>card(t,o.by.get(t.id))))).join("");
    const none=list.filter(t=>!(t.encounters||[]).length);if(none.length)body+=head("No encounters yet")+grid(none.map(t=>card(t,[])));
  }else body=grid(list.map(t=>card(t,t.encounters||[])));
  const toggle=`<div class="btns" role="group" aria-label="Group trainers">${[["all","All trainers"],["timeline","By timeline"],["game","By game"]].map(([k,l])=>`<button type="button" class="btn" data-act="tgroup" data-v="${k}" aria-pressed="${UI.tgroup===k}">${l}</button>`).join("")}</div>`;
  return titleBar("Trainers","Prominent trainers and how their teams change across every encounter.",addBtn("Add trainer","new-trainer"))+
  (!loaded?loading():!list.length?emptyMsg("No trainers yet. Add your first one, then give them a blurb and an encounter with their team.","new-trainer","Add trainer"):toggle+body);
}
/* Trainer team members. Which fields exist depends on the encounter's generation:
   Gen I: DVs. Gen II: DVs and item. Gen III and IV: item, nature, EVs, IVs and up to three ability slots.
   Fields a generation does not use stay saved. They are just not shown. */
const DV_KEYS=[['atk','Attack'],['def','Defense'],['spe','Speed'],['spc','Special']];
const EV_KEYS=[['hp','HP'],['atk','Atk'],['def','Def'],['spa','SpA'],['spd','SpD'],['spe','Spe']];
const DV_MAX=15,IV_MAX=30,EV_MAX=300,EV_TOTAL=1000,EVS_PER_POINT=4;
const dexSlots=(p,gen)=>gen<3||!S.pokemon[p]?[]:(eff(S.pokemon[p],gen).abilitySlots||[]).filter(o=>o&&o.length);
const savedAbilities=m=>Array.isArray(m.abilities)?m.abilities:(m.ability?[m.ability]:[]);
// One ability id per slot ('' when a shared slot has not been chosen). A single "ability" from older saves still counts.
function chosenAbilities(m,gen){
  const slots=dexSlots(m.p,gen),saved=savedAbilities(m);
  if(!slots.length)return saved.slice(0,3);
  return slots.map((o,i)=>o.length===1?o[0]:o.includes(saved[i])?saved[i]:o.includes(m.ability)?m.ability:'');
}
const evSum=evs=>Object.values(evs||{}).reduce((a,b)=>a+(Number(b)||0),0);
const evText=t=>`EV total: ${t} / ${EV_TOTAL}. Up to ${EV_MAX} per stat. Every ${EVS_PER_POINT} EVs give +1 stat point.`;
function monCard(m,gen,isNew){
  const sp=S.pokemon[m.p],e=sp?eff(sp,gen):{},name=label('pokemon',m.p)||'Unknown';
  const short={hp:'HP',atk:'Atk',def:'Def',spa:'SpA',spd:'SpD',spe:'Spe',spc:'Spc'};
  const line=(o,keys,keep)=>{const ks=keys.filter(([k])=>keep(o?.[k]));return ks.length?ks.map(([k])=>`<span><b>${short[k]}</b>${esc(o[k])}</span>`).join(''):''};
  const set=x=>x!=null&&x!=='';
  const dvs=gen<=2?line(m.dvs,DV_KEYS,set):'',evs=gen>=3?line(m.evs,EV_KEYS,x=>!!x):'',ivs=gen>=3?line(m.ivs,EV_KEYS,set):'';
  const slots=dexSlots(m.p,gen);
  const abil=gen>=3?chosenAbilities(m,gen).map((a,i)=>{const txt=a?label('abilities',a):slots[i]?slots[i].map(x=>label('abilities',x)).join(' / ')+' (not chosen)':'';return txt?`<dt>${SLOT_NAMES[i]}</dt><dd>${esc(txt)}</dd>`:''}).join(''):'';
  const moves=(m.moves||[]).filter(Boolean);
  const meta=`${abil}${gen>=2&&m.item?`<dt>Item</dt><dd><span class="withicon">${itemIcon(m.item)}${esc(label('items',m.item))}</span></dd>`:''}${gen>=3&&m.nature?`<dt>Nature</dt><dd>${esc(m.nature)}</dd>`:''}`;
  const strips=[['Stats',sp?teamStats(m,e,gen):''],['DVs',dvs],['EVs',evs],['IVs',ivs]].filter(x=>x[1]).map(([l,h])=>`<div class="strip"><span class="striplbl">${l}</span><div class="stripvals">${h}</div></div>`).join('');
  return `<div class="mon">${isNew?'<span class="pill new monnew">New</span>':''}<div class="monid">${sp?pokeTile(sp,e,gen,72):tile(name,null,null,72)}
  <div class="monname">${pokeLink(m.p)||esc(name)}</div>${m.level?`<div class="muted mono monlv">Lv. ${esc(m.level)}</div>`:''}${(e.types||[]).length?chips(e.types):''}</div>
  <div class="monside">${moves.length?`<ul class="mvgrid">${moves.map(x=>moveTile(x,gen)).join('')}</ul>`:'<p class="hint">No moves added.</p>'}${meta?`<dl class="monmeta">${meta}</dl>`:''}${strips}${m.notes?`<p class="hint">${esc(m.notes)}</p>`:''}</div></div>`;
}
// A move in a team card: its name with its type beneath, coloured by that type like Bulbapedia's party boxes.
function moveTile(id,gen){
  const mv=S.moves[id],type=mv?effMove(mv,gen).type:'',c=type?typeColor(type):null;
  const style=c?` style="background:${c};color:${fgFor(c)}"`:'';
  const inner=`<span class="mvname">${esc(label('moves',id))}</span><span class="mvtype">${esc(type||'Unknown type')}</span>`;
  return `<li>${mv?`<a class="mv" href="#m-${esc(id)}"${style}>${inner}</a>`:`<span class="mv"${style}>${inner}</span>`}</li>`;
}
/* An encounter can have several teams, each depending on something ("Player chose Bulbasaur") and with its own picture.
   Older saves have a single "team" on the encounter. That reads as one team that always applies. */
const encTeams=e=>(e.teams&&e.teams.length?e.teams:[{team:e.team||[]}]).map(x=>({when:x.when||'',sprite:x.sprite||'',team:x.team||[]}));
// With a condition picked, show its team plus teams that always apply. An encounter that does not depend on it shows everything.
function shownTeams(e,pick){
  const all=encTeams(e);if(!pick)return all;
  return all.some(x=>x.when===pick)?all.filter(x=>x.when===pick||!x.when):all;
}
// The team a team is compared with for "New" badges: the previous encounter's team for the same condition, or its only team.
function prevTeam(prev,when){
  const all=encTeams(prev);
  return (all.find(x=>x.when===when)||(all.length===1?all[0]:null))?.team||null;
}
// Encounters show by era, then the order they were saved in.
const encOrder=list=>list.map((e,i)=>({...e,i})).sort((a,b)=>eraIdx(eraOf(a))-eraIdx(eraOf(b))||a.i-b.i);
// So one moves past its neighbour in the same era.
function encNeighbor(sorted,e,dir){const n=sorted[sorted.indexOf(e)+dir];return n&&eraOf(n)===eraOf(e)?n:null}
// The encounter whose story this one follows: the one before it in its era, or the last one of the era it continues.
function encBefore(sorted,e){
  const era=eraOf(e),mine=sorted.filter(x=>eraOf(x)===era),k=mine.indexOf(e);
  if(k>0)return mine[k-1];
  const from=eraGet(era)?.continues;
  return from?sorted.filter(x=>eraOf(x)===from).pop()||null:null;
}
async function moveEncounter(tid,i,dir){
  const doc=clone(S.trainers[tid]),sorted=encOrder(doc.encounters);
  const e=sorted.find(x=>x.i===i),n=e&&encNeighbor(sorted,e,dir);if(!n)return;
  [doc.encounters[e.i],doc.encounters[n.i]]=[doc.encounters[n.i],doc.encounters[e.i]];
  S.trainers[tid]=doc;render();await put('trainers/'+tid,doc);
}
function trainerPage(id){
  const raw=S.trainers[id];
  if(!raw)return loaded?emptyMsg('This trainer is not in your list.'):loading();
  const t={id,...raw},all=encOrder(t.encounters||[]);
  // One timeline at a time, since each tells the trainer's story its own way.
  const tls=TIMELINES.filter(x=>all.some(e=>tlOf(e)===x.id)).map(x=>x.id);
  const tl=tls.includes(UI.timeline)?UI.timeline:tls[0]||TIMELINES[0].id;
  const enc=all.filter(e=>tlOf(e)===tl),eras=ERAS.filter(x=>enc.some(e=>eraOf(e)===x.id));
  const ending=endingOf(t,tl);
  const tlPick=tls.length>1?`<div class="btns" role="group" aria-label="Timeline">${tls.map(k=>`<button type="button" class="btn" data-act="timeline" data-v="${esc(k)}" aria-pressed="${k===tl}">${esc(tlName(k))} timeline</button>`).join('')}</div>`:tls.length?`<p class="muted" style="margin:0">${esc(tlName(tl))} timeline</p>`:'';
  // Under the heading: the games in that section, or the region when none are set.
  const sub=x=>{const games=[...new Set(enc.filter(e=>eraOf(e)===x.id).map(e=>e.game).filter(Boolean))];return games.length?games.join(' · '):eraShared(x)?'':x.region||''};
  const conds=[...new Set(enc.flatMap(e=>encTeams(e).map(x=>x.when)).filter(Boolean))];
  const pick=conds.includes(UI.when)?UI.when:'';
  const filter=conds.length?`<div class="btns" role="group" aria-label="Show teams for">${[['','All teams'],...conds.map(c=>[c,c])].map(([k,l])=>`<button type="button" class="btn small" data-act="when" data-v="${esc(k)}" aria-pressed="${k===pick}">${esc(l)}</button>`).join('')}</div>`:'';
  const sections=eras.map(era=>{const g=era.gen,intro=t.stories?.[era.id];return `<h2 class="genhead">${esc(eraName(era.id))} <span>${esc(sub(era))}</span></h2>${intro?`<div class="story"><p class="blurb">${esc(intro)}</p></div>`:''}${enc.filter(e=>eraOf(e)===era.id).map(e=>{const prev=encBefore(enc,e);
    return `${e.story?`<div class="story"><p class="blurb">${esc(e.story)}</p></div>`:''}<article class="enc"><div class="enchead"><div><h3>${esc(e.label||'Battle')}</h3><p class="muted" style="margin:0">${[e.location,e.game].filter(Boolean).map(esc).join(' · ')||'Location not set'}</p></div>${canEdit?`<div class="btns">${encNeighbor(enc,e,-1)?`<button type="button" class="btn small" data-act="enc-move" data-id="${esc(id)}" data-v="${e.i}" data-d="-1">Move up</button>`:''}${encNeighbor(enc,e,1)?`<button type="button" class="btn small" data-act="enc-move" data-id="${esc(id)}" data-v="${e.i}" data-d="1">Move down</button>`:''}<button type="button" class="btn small" data-act="edit-enc" data-id="${esc(id)}" data-v="${e.i}">Edit</button><button type="button" class="btn small" data-act="copy-enc" data-id="${esc(id)}" data-v="${e.i}">Copy teams to new encounter</button><button type="button" class="btn small danger" data-act="del-enc" data-id="${esc(id)}" data-v="${e.i}">Delete</button></div>`:''}</div>
    ${shownTeams(e,pick).map(x=>{const pt=prev&&prevTeam(prev,x.when),prevSet=new Set((pt||[]).map(m=>m.p));
      return `<div class="vteam">${x.sprite?tile(t.name,null,['data/sprites/'+x.sprite],96):trainerTile(t,96)}<div class="vbody">${x.when?`<h4>${esc(x.when)}</h4>`:''}${x.team.length?`<div class="teams">${x.team.map(m=>monCard(m,g,pt&&!prevSet.has(m.p))).join('')}</div>`:'<p class="muted" style="margin:0">No team added yet.</p>'}</div></div>`}).join('')}</article>`}).join('')}`}).join('');
  return `<a href="#trainers" style="align-self:flex-start;display:flex;align-items:center;min-height:44px;font-weight:600">Back to Trainers</a>
  <section class="hero">${trainerTile(t,132)}<div class="grow">${t.title?`<span class="mono">${esc(t.title)}</span>`:''}<h1>${esc(t.name)}</h1></div>${canEdit?`<button type="button" class="btn" data-act="edit-trainer" data-id="${esc(id)}">Edit trainer</button>`:''}</section>
  ${t.blurb?`<section class="card"><p class="blurb">${esc(t.blurb)}</p></section>`:''}
  <div class="title"><h2 style="margin:0;font-family:var(--display);font-size:32px;text-transform:uppercase">Teams by generation</h2>${addBtn('Add encounter','new-enc',`data-id="${esc(id)}" data-v="${esc(tl)}"`)}</div>
  ${tlPick}
  ${filter}
  ${sections||'<div class="empty"><p>No encounters yet. Add one with its timeline, generation, battle location and team.</p></div>'}
  ${ending?`<div class="story"><p class="blurb">${esc(ending)}</p></div>`:''}`;
}
// Each timeline has its own ending. The older single ending counts as the first timeline's.
const endingOf=(t,tl)=>t.endings?.[tl]||(tl===TIMELINES[0].id?t.epilogue:'')||'';

/* Saving */
async function put(path,doc){
  if(!canEdit){toast('Editing only works in the copy running on your computer.');return false}
  try{const r=await fetch('api/'+path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(doc)});if(!r.ok)throw 0;return true}
  catch(e){toast('That did not save. Check that the tracker window is still open.');return false}
}
async function remove(path){
  try{const r=await fetch('api/'+path,{method:'DELETE'});if(!r.ok)throw 0;return true}
  catch(e){toast('That did not delete. Check that the tracker window is still open.');return false}
}
async function uploadSprite(file){
  const r=await fetch('api/sprite?name='+encodeURIComponent(file.name),{method:'POST',body:file});
  if(!r.ok)throw new Error('upload');
  return (await r.json()).file;
}
async function ensure(col,name,gen,extra={}){
  const t=String(name||'').trim();if(!t)return '';
  const found=byName(col,t);if(found)return found;
  const id=newId(col,t),doc={name:t,debut:gen,gens:{},...extra};
  S[col][id]=doc;await put(col+'/'+id,doc);return id;
}
// Several Pokémon can share a Dex number (gender differences, regional variants). Same-number entries list in the order they were added.
const dexShare=(dex,id)=>{const o=rows('pokemon').filter(p=>p.dex===dex&&p.id!==id&&dex);return o.length?`Shares No. ${pad(dex)} with ${o.map(p=>p.name).join(', ')}. That's fine for a variant or a gender difference.`:''};
const nextDex=()=>rows('pokemon').reduce((m,p)=>Math.max(m,p.dex||0),0)+1;
function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{t.hidden=true},3500)}

/* Dialogs */
function modal(title,inner,onSubmit){
  $('modal-root').innerHTML=`<div class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button type="button" class="btn small" data-act="close">Close</button></header><form id="dlg" novalidate>${inner}</form></div></div>`;
  $('dlg').onsubmit=e=>{e.preventDefault();onSubmit()};
  const first=$('dlg').querySelector('input,select,textarea');first&&first.focus();
}
const closeModal=()=>{$('modal-root').innerHTML='';F=null};
function confirmBox(title,msg,yes,fn){
  modal(title,`<div class="formbody"><p style="margin:0">${esc(msg)}</p></div><div class="formfoot"><button type="submit" class="btn primary">${esc(yes)}</button><button type="button" class="btn" data-act="close">Keep it</button></div>`,async()=>{await fn();closeModal();render()});
}
const v=k=>($('f-'+k)?.value??'').trim();
const n=k=>{const x=v(k);return x===''?null:Number(x)};
const genSelect=(k,val,lab)=>`<label class="ctl">${esc(lab)}<select id="f-${k}" >${GENS.map(g=>`<option value="${g}"${g===val?' selected':''}>Gen ${ROMAN[g]}</option>`).join('')}</select></label>`;
const input=(k,lab,val,o={})=>`<label class="ctl">${esc(lab)}<input id="f-${k}" type="${o.type||'text'}" value="${esc(val??'')}"${o.list?` list="${o.list}"`:''}${o.ph?` placeholder="${esc(o.ph)}"`:''}${o.min!=null?` min="${o.min}"`:''}${o.max!=null?` max="${o.max}"`:''}${o.step?` step="${o.step}"`:''}></label>`;
const area=(k,lab,val,ph)=>`<label class="ctl">${esc(lab)}<textarea id="f-${k}"${ph?` placeholder="${esc(ph)}"`:''}>${esc(val??'')}</textarea></label>`;
const select=(k,lab,val,opts,none)=>`<label class="ctl">${esc(lab)}<select id="f-${k}">${none!=null?`<option value="">${esc(none)}</option>`:''}${opts.map(o=>`<option${o===val?' selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
const foot=(id,del)=>`<p class="error" id="f-err" hidden style="padding:0 20px"></p><div class="formfoot"><button type="submit" class="btn primary">Save</button><button type="button" class="btn" data-act="close">Cancel</button>${id&&del?`<button type="button" class="btn danger push" data-act="${del}" data-id="${esc(id)}">Delete</button>`:''}</div>`;
function fail(m){const e=$('f-err');e.textContent=m;e.hidden=false}
const genNote=(doc,first)=>{
  if(!doc)return '<p class="hint">Saved from its debut generation onward.</p>';
  const opts=GENS.filter(g=>g>=first&&g<=UI.gen);if(!opts.length)opts.push(UI.gen);
  const def=Object.keys(doc.gens||{}).length?UI.gen:opts[0];
  return `<label class="ctl">Save starting from<select id="f-from">${opts.map(g=>`<option value="${g}"${g===def?' selected':''}>Gen ${ROMAN[g]}${g===UI.gen?' (the generation you are viewing)':''}</option>`).join('')}</select></label><p class="hint">Earlier generations stay as they are. Later generations pick this up unless they have their own value.</p>`};
function applyFrom(doc,from,patch){
  for(let g=from+1;g<=UI.gen;g++){const en=doc.gens?.[g];if(en){for(const k of Object.keys(patch))delete en[k];if(!Object.keys(en).length)delete doc.gens[g]}}
  applyGen(doc,from,patch);
}
const allTypes=()=>(S.chart?.types||[]).map(t=>t.name);

const SPEC={
  abilities:{title:'ability',debut:3,fields:(d)=>area('flavor','Flavor text',d.flavor)+area('effect','Actual effect',d.effect)+select('immuneTo','Grants immunity to',d.immuneTo,allTypes(),'None')+`<fieldset><legend>Stat multipliers</legend><p class="hint">Leave a stat blank for no change, e.g. 2 for Huge Power's Attack.</p><div class="fnarrow">${BOOST_STATS.map(([k,l])=>input('mult-'+k,l,d.statMults?.[k],{type:'number',min:0,step:'any'})).join('')}</div>${input('boostWhen','Only when (optional)',d.boostWhen,{ph:'in sun'})}</fieldset>`,
    read:()=>{const m={};for(const [k] of BOOST_STATS){const x=n('mult-'+k);if(x!=null&&x>0&&x!==1)m[k]=x}const any=Object.keys(m).length;return {flavor:v('flavor'),effect:v('effect'),immuneTo:v('immuneTo'),statMults:any?m:null,boostWhen:any&&v('boostWhen')||null}}},
  items:{title:'item',debut:1,fields:(d)=>input('category','Category',d.category,{list:'dl-itemcats',ph:'Hold items'})+area('flavor','Flavor text',d.flavor)+area('effect','Actual effect',d.effect),read:()=>({category:v('category'),flavor:v('flavor'),effect:v('effect')})},
  moves:{title:'move',debut:1,del:'del-moves',fields:(d)=>`<div class="fgrid">${select('type','Type',d.type,allTypes(),'Choose')}${UI.gen<SPLIT_FROM?select('category','Category',d.category&&!['Status','Variable'].includes(d.category)?'Damaging':d.category,UI.gen>=VARIABLE_FROM?['Damaging','Variable','Status']:['Damaging','Status'],'Choose'):select('category','Category',d.category,catsAt(UI.gen),'Choose')}${input('power','Power',d.power,{type:'number',min:0})}${input('accuracy','Accuracy',d.accuracy,{type:'number',min:0})}${input('pp','PP',d.pp,{type:'number',min:0})}</div>${UI.gen<SPLIT_FROM?`<p class="hint">Before Gen ${ROMAN[SPLIT_FROM]}, a damaging move is physical or special by its type: ${PHYSICAL_TYPES.join(', ')} are physical; ${SPECIAL_TYPES.join(', ')} are special.</p>`:''}<div class="fgrid"><label class="ctl">Target<select id="f-target"><option value="">Choose</option>${targetsAt(UI.gen).map(k=>`<option value="${k}"${d.target===k?' selected':''}>${TARGETS[k]}</option>`).join('')}</select></label>${input('priority','Priority',d.priority,{type:'number',ph:'0'})}${UI.gen>=CONTACT_FROM?`<label class="ctl">Makes contact<select id="f-contact"><option value="">Not set</option><option value="yes"${d.contact===true?' selected':''}>Yes</option><option value="no"${d.contact===false?' selected':''}>No</option></select></label>`:''}</div><p class="hint">${UI.gen<3?'The opposing side and the entire field are double-battle targets, so they start in Gen III. Contact also starts in Gen III.':'Priority is a whole number. Higher goes first, and blank counts as 0.'}</p>`+area('effect','Effect',d.effect)+area('flavor','Flavor text',d.flavor)+area('learners','Pokémon that learn it',(d.learners||[]).map(l=>label('pokemon',l.p)+(l.how?': '+l.how:'')).join('\n'),'One per line, like\nGengar: Level 33\nHaunter: TM30'),
    from3:['contact'],
    check:(p,from)=>p.category==='Damaging'?`Before Gen ${ROMAN[SPLIT_FROM]}, a damaging move is physical or special by its type. Choose a type first.`:p.category==='Variable'&&from<VARIABLE_FROM?`The Variable category starts in Gen ${ROMAN[VARIABLE_FROM]}. Save starting from Gen ${ROMAN[VARIABLE_FROM]}, or choose another category.`:DOUBLES_TARGETS.includes(p.target)&&from<3?`${TARGETS[p.target]} is a double-battle target, which starts in Gen III. Save starting from Gen III, or choose another target.`:p.priority!=null&&!Number.isInteger(p.priority)?'Priority must be a whole number, like 1, 0 or -3.':'',
    read:()=>({type:v('type'),category:v('category')==='Damaging'?typeCat(v('type'))||'Damaging':v('category'),power:n('power'),accuracy:n('accuracy'),pp:n('pp'),target:v('target'),priority:n('priority'),...($('f-contact')?{contact:v('contact')==='yes'?true:v('contact')==='no'?false:null}:{}),effect:v('effect'),flavor:v('flavor'),learners:v('learners').split('\n').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf(':');return {p:ref('pokemon',i<0?x:x.slice(0,i)),how:i<0?'':x.slice(i+1).trim()}})})},
  effects:{title:'effect',debut:1,fields:(d)=>input('group','Group',d.group,{list:'dl-groups',ph:'Weather'})+area('flavor','Flavor text',d.flavor)+area('effect','Actual effect',d.effect),read:()=>({group:v('group'),flavor:v('flavor'),effect:v('effect')})}
};
function openForm(col,id,kind){
  const sp=SPEC[col],doc=id?S[col][id]:null,d=id?eff(doc,UI.gen):{},debut=doc?(doc.debut||sp.debut):Math.max(UI.gen,sp.debut);
  F={col,id,kind:doc?.kind||kind};
  modal(`${id?'Edit':'Add'} ${sp.title}`,`<div class="formbody">${genNote(doc,debut)}<div class="fgrid">${input('name','Name',doc?.name)}${genSelect('debut',debut,'Generation introduced')}</div>${sp.fields(d)}</div>${foot(id,'del-record')}`,saveForm);
}
async function saveForm(){
  const {col,id,kind}=F,name=v('name'),debut=+v('debut');
  if(!name)return fail('Give it a name.');
  const dup=byName(col,name);if(dup&&dup!==id)return fail(`${name} already exists.`);
  const doc=id?clone(S[col][id]):{gens:{}};
  doc.name=name;doc.debut=debut;if(kind)doc.kind=kind;
  const sp=SPEC[col],patch=sp.read(),from=id?(+v('from')||UI.gen):debut;
  if(sp.check){const bad=sp.check(patch,from);if(bad)return fail(bad)}
  // Fields that only exist from Gen III (like contact) are saved from Gen III at the earliest.
  const late={};for(const k of sp.from3||[])if(k in patch){late[k]=patch[k];delete patch[k]}
  if(id)applyFrom(doc,from,patch);else applyGen(doc,debut,patch);
  if(Object.keys(late).length){if(id)applyFrom(doc,Math.max(from,3),late);else applyGen(doc,Math.max(debut,3),late)}
  const key=id||newId(col,name);
  S[col][key]=doc;
  const ok=await put(col+'/'+key,doc);if(!ok)return;
  closeModal();
  if(!id&&debut>UI.gen)setGen(debut);else render();
  toast('Saved');
}

/* Pokémon editor */
function pokeDyn(g,d){
  const st=statsAt(d,g);
  return `<fieldset><legend>Base stats</legend><div class="fnarrow">${st.map(s=>input('st-'+s[0],s[1],s[2],{type:'number',min:0,max:255})).join('')}</div></fieldset>
  ${g>=3?`<fieldset><legend>Abilities</legend><div id="slots"></div><p class="hint">Up to three slots.${g>=4?` A slot can hold up to ${SLOT_OPTS} abilities that are switched outside battle.`:' Shared slots start in Gen IV.'} New names are added to Abilities.</p></fieldset>`:'<p class="hint">Abilities arrive in Gen III.</p>'}
  ${g>=2?`<fieldset><legend>Breeding</legend><div class="fgrid">${input('egg1','Egg group 1',(d.eggGroups||[])[0],{list:'dl-eggs'})}${input('egg2','Egg group 2',(d.eggGroups||[])[1],{list:'dl-eggs'})}${input('cycles','Egg cycles',d.eggCycles,{type:'number',min:0})}${input('hatch','Hatches as',d.hatchesAs,{list:'dl-pokemon'})}${input('male','Percent male',d.genderM,{type:'number',min:0,max:100,ph:'Blank = genderless'})}</div><div id="hatchalts" style="display:flex;flex-direction:column;gap:8px;margin-top:12px"></div><p class="hint">Special hatches: an egg that only becomes a different Pokémon under a condition, like Munchlax when a parent Snorlax holds Full Incense.</p></fieldset><fieldset><legend>Form changes</legend><div id="forms" style="display:flex;flex-direction:column;gap:8px"></div><p class="hint">Each form it can change into, what triggers the change, and whether it lasts.</p></fieldset>`:'<p class="hint">Breeding arrives in Gen II.</p>'}`;
}
function drawSlots(){
  const box=$('slots');if(!box)return;const g=F.g;
  box.innerHTML=F.slots.map((o,i)=>`<div class="slotrow" style="margin-bottom:8px"><span style="font-size:13px;font-weight:600">${SLOT_NAMES[i]}</span><div class="slotopts">${o.map((a,j)=>`<input id="sl-${i}-${j}" list="dl-abilities" aria-label="${SLOT_NAMES[i]} option ${j+1}" value="${esc(a)}" data-slot="${i}" data-opt="${j}">`).join('')}</div><div class="btns">${g>=4&&o.length<SLOT_OPTS?`<button type="button" class="btn small" data-act="slot-alt" data-v="${i}">${o.length>1?'Add another':'Share slot'}</button>`:''}${o.length>1?`<button type="button" class="btn small" data-act="slot-unalt" data-v="${i}">Unshare</button>`:''}<button type="button" class="btn small" data-act="slot-del" data-v="${i}" aria-label="Remove ${SLOT_NAMES[i]}">Remove</button></div></div>`).join('')+(F.slots.length<3?`<button type="button" class="btn small" data-act="slot-add">Add ability slot</button>`:'');
}
/* Species names are stored as "Seed Pokémon"; the editor only asks for "Seed". */
const speciesBase=x=>String(x||'').replace(/s*Pok[eé]mons*$/i,'').trim();
const speciesFull=x=>{const b=speciesBase(x);return b?b+' Pokémon':''};
const FORM_KINDS=['Permanent','Reversible','Battle only'];
function drawForms(){
  const box=$('forms');if(!box)return;
  box.innerHTML=F.forms.map((x,i)=>`<div class="formrow">${input(`fm${i}-name`,'Form',x.name,{ph:'Sky Forme'})}${input(`fm${i}-trigger`,'Item or event that triggers it',x.trigger,{list:'dl-items',ph:'Gracidea'})}${select(`fm${i}-kind`,'Lasts',x.kind,FORM_KINDS,'Choose')}<button type="button" class="btn small" data-act="form-del" data-v="${i}" aria-label="Remove form ${i+1}">Remove</button></div>`).join('')+'<div><button type="button" class="btn small" data-act="form-add">Add form change</button></div>';
}
function readForms(){if(!$('forms'))return;F.forms=F.forms.map((_,i)=>({name:v(`fm${i}-name`),trigger:v(`fm${i}-trigger`),kind:v(`fm${i}-kind`)}))}
const formsHtml=(a,g)=>g<2?'<p class="muted" style="margin:0">Form changes arrive in Gen II.</p>':blank(a)?'<p class="muted" style="margin:0">No form changes.</p>':`<dl class="defs">${a.map(x=>`<div><dt>${hatchLink(x.name)}</dt><dd>${dash(x.trigger)}${x.kind?` <span class="muted">· ${esc(x.kind)}</span>`:''}</dd></div>`).join('')}</dl>`;
function drawEvoAlts(){
  const box=$('evoalts');if(!box)return;
  box.innerHTML=F.evoAlts.map((x,i)=>`<div class="msrow">${input(`ea${i}-from`,'Evolves from',x.from,{list:'dl-pokemon',ph:'Bagon'})}${input(`ea${i}-method`,'Method',x.method,{ph:'Jump from a cliff (chance equal to its level %)'})}<button type="button" class="btn small" data-act="evoalt-del" data-v="${i}" aria-label="Remove other source ${i+1}">Remove</button></div>`).join('')+'<div><button type="button" class="btn small" data-act="evoalt-add">Add another Pokémon it evolves from</button></div>';
}
function readEvoAlts(){if(!$('evoalts'))return;F.evoAlts=F.evoAlts.map((_,i)=>({from:v(`ea${i}-from`),method:v(`ea${i}-method`)}))}
function drawHatch(){
  const box=$('hatchalts');if(!box)return;
  box.innerHTML=F.hatch.map((x,i)=>`<div class="msrow hatchrow">${input(`ha${i}-as`,'Hatches as',x.as,{list:'dl-pokemon',ph:'Munchlax'})}${input(`ha${i}-chance`,'Chance %',x.chance,{type:'number',min:0,max:99.9,step:'any',ph:'Always'})}${input(`ha${i}-when`,'Only when',x.when,{ph:'A parent holds Full Incense'})}<button type="button" class="btn small" data-act="hatch-del" data-v="${i}" aria-label="Remove special hatch ${i+1}">Remove</button></div>`).join('')+'<p class="hint" style="margin:0">Leave Chance blank if it always happens when the condition is met. Chances must add up to less than 100%, since the rest hatch as normal.</p><div><button type="button" class="btn small" data-act="hatch-add">Add special hatch</button></div>';
}
function readHatch(){if(!$('hatchalts'))return;F.hatch=F.hatch.map((_,i)=>({as:v(`ha${i}-as`),chance:n(`ha${i}-chance`),when:v(`ha${i}-when`)}))}
const hatchLink=n=>{const k=n&&byName('pokemon',n);return k?`<a href="#p-${esc(k)}">${esc(pname(k))}</a>`:dash(n)};
const pct=x=>`${+(+x).toFixed(2)}%`;
const hatchRest=a=>{const t=(a||[]).reduce((s,x)=>s+(x.chance||0),0);return t>0?` <span class="muted">(${pct(100-t)})</span>`:''};
const hatchAltsHtml=a=>blank(a)?'':`<div style="margin-top:12px"><span class="muted" style="font-size:13px">Special hatches</span><ul style="margin:4px 0 0;padding-left:18px">${a.map(x=>`<li><b>${hatchLink(x.as)}</b>${x.chance!=null?` <span class="muted">(${pct(x.chance)} chance)</span>`:''}${x.when?` only when ${esc(x.when.charAt(0).toLowerCase()+x.when.slice(1))}`:''}</li>`).join('')}</ul></div>`;
function readSlots(){if(!$('slots'))return;F.slots=F.slots.map((o,i)=>o.map((_,j)=>$(`sl-${i}-${j}`)?.value??''))}
function openPokemon(id){
  const doc=id?S.pokemon[id]:null,d=id?eff(doc,UI.gen):{},g=id?UI.gen:UI.gen;
  F={col:'pokemon',id,g,evoAlts:(d.evoAlts||[]).map(x=>({from:label('pokemon',x.from),method:x.method||''})),forms:(d.forms||[]).map(x=>({...x})),hatch:(d.hatchAlts||[]).map(x=>({...x})),slots:(d.abilitySlots||[]).map(o=>o.map(a=>label('abilities',a)))};
  const ts=allTypes();
  modal(`${id?'Edit':'Add'} Pokémon`,`<div class="formbody">${genNote(doc,doc?.debut||1)}<div class="fgrid">${input('name','Name',id?pname(doc):'')}${input('discovery','Discovery name (optional)',d.discoveryName,{ph:'Great Tusk'})}${input('dex','Dex number',doc?.dex??nextDex(),{type:'number',min:1})}${genSelect('debut',doc?.debut??g,'Generation introduced')}</div><p class="hint" id="dex-share"${dexShare(doc?.dex??nextDex(),id)?'':' hidden'}>${esc(dexShare(doc?.dex??nextDex(),id))}</p>
  <div class="fgrid">${select('t1','Type 1',(d.types||[])[0],ts,'Choose')}${select('t2','Type 2',(d.types||[])[1],ts,'None')}${input('evofrom','Evolves from',d.evolvesFrom?label('pokemon',d.evolvesFrom):'',{list:'dl-pokemon'})}${input('evomethod','Evolution method',d.evoMethod,{ph:'Level 25'})}${input('evomethod2','Second evolution method',d.evoMethod2,{ph:'Blank if there is only one'})}${input('formof','Form of',doc?.formOf&&S.pokemon[doc.formOf]?pname(doc.formOf):'',{list:'dl-pokemon',ph:'Blank unless this is an alternate form'})}${input('variant','Regional variant',doc?.variant,{ph:'Hoennian'})}</div><p class="hint">For a regional variant, set Form of to the original Pokémon and give the variant's name, like Hoennian. A variant has its own evolution chain. Leave it blank for form changes like Darmanitan's Zen Mode.</p>
  <fieldset><legend>Also evolves from</legend><div id="evoalts" style="display:flex;flex-direction:column;gap:8px"></div><p class="hint">Another Pokémon that can evolve straight into this one, and how. Bagon can become Salamence by jumping from a cliff, skipping Shelgon.</p></fieldset>
  <fieldset><legend>Vitals</legend><div class="fgrid">${input('species','Species',speciesBase(d.species),{ph:'Seed'})}${input('height','Height (m)',d.height,{type:'number',min:0,step:'0.1',ph:'0.7'})}${input('weight','Weight (kg)',d.weight,{type:'number',min:0,step:'0.1',ph:'6.9'})}${input('growth','Growth rate',d.growthRate,{list:'dl-growth'})}</div><datalist id="dl-growth">${[...new Set([...GROWTH,...rows('pokemon').flatMap(p=>GENS.map(x=>p.gens?.[x]?.growthRate))].filter(Boolean))].map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist></fieldset>
  <div id="dyn" style="display:flex;flex-direction:column;gap:14px">${pokeDyn(g,d)}</div>
  <div class="fgrid">${input('art','PokéAPI sprite',doc?.art??'',{ph:'Blank uses the Dex number, or 422-east'})}<label class="ctl">Your own sprite (replaces PokéAPI art)<input id="f-sprite" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></label></div><p class="hint">Blank uses the Dex number, up to 493. Enter 0 for no PokéAPI art, or another number to borrow that Pokémon's sprites.</p></div>${foot(id,'del-record')}`,savePokemon);
  drawSlots();drawHatch();drawForms();drawEvoAlts();
}
async function savePokemon(){
  const {id}=F,name=v('name'),dex=n('dex'),debut=+v('debut'),g=id?UI.gen:debut;
  if(!name)return fail('Give it a name.');
  if(!dex)return fail('Give it a Dex number.');
  // Names only need to be unique within a generation, so a renamed Pokémon's old name can be reused later.
  const at=id?(+v('from')||g):debut,dup=Object.keys(S.pokemon).find(k=>k!==id&&(S.pokemon[k].debut||1)<=at&&pname(k,at).toLowerCase()===name.toLowerCase());
  if(dup)return fail(`${pname(dup,at)} already exists in Gen ${ROMAN[at]}.`);
  const art=v('art').trim().toLowerCase();if(art&&!/^\d+(-[a-z0-9-]+)?$/.test(art))return fail('PokéAPI sprite must be a number, or a number and form name like 422-east.');
  readSlots();
  const stats={};statsAt({},g).forEach(s=>{stats[s[0]]=n('st-'+s[0])});
  const patch={discoveryName:v('discovery'),types:[v('t1'),v('t2')].filter(Boolean),stats:Object.values(stats).every(x=>x==null)?null:stats,evoMethod:v('evomethod'),evoMethod2:v('evomethod2'),species:speciesFull(v('species')),height:n('height'),weight:n('weight'),growthRate:v('growth')};
  const abPatch={},brPatch={};
  if(g>=3){const out=[];for(const o of F.slots){const ids=[];for(const a of o)if(a.trim())ids.push(await ensure('abilities',a,Math.max(g,3)));if(ids.length)out.push(ids)}abPatch.abilitySlots=out}
  if(g>=2){brPatch.eggGroups=[v('egg1'),v('egg2')].filter(Boolean);brPatch.eggCycles=n('cycles');brPatch.hatchesAs=v('hatch');brPatch.genderM=n('male');readHatch();brPatch.hatchAlts=F.hatch.map(x=>{const o={as:x.as.trim()};if(x.chance!=null)o.chance=x.chance;o.when=x.when.trim();return o}).filter(x=>x.as);
    {const cs=brPatch.hatchAlts.map(x=>x.chance).filter(c=>c!=null);if(cs.some(c=>!(c>0&&c<100)))return fail('Each special hatch chance must be more than 0% and less than 100%.');const t=cs.reduce((a,b)=>a+b,0);if(t>=100)return fail(`Special hatch chances add up to ${pct(t)}. Keep the total under 100% so some eggs still hatch as normal.`)}readForms();brPatch.forms=F.forms.map(x=>({name:x.name.trim(),trigger:x.trigger.trim(),kind:x.kind})).filter(x=>x.name)}
  const f=$('f-sprite')?.files?.[0];
  if(f){try{patch.sprite=await uploadSprite(f)}catch(e){return fail('That image could not be saved. Use a PNG, JPG, GIF or WebP under 25 MB.')}}
  const key=id||newId('pokemon',name);
  const evo=v('evofrom'),same=evo.toLowerCase()===name.toLowerCase();
  if(evo&&!same&&!byName('pokemon',evo))patch.evolvesFrom=await ensure('pokemon',evo,g,{dex:Math.max(nextDex(),dex+1)});
  else patch.evolvesFrom=evo&&!same?byName('pokemon',evo):'';
  readEvoAlts();patch.evoAlts=[];
  for(const x of F.evoAlts){if(!x.from)continue;const k=byName('pokemon',x.from);
    if(!k)return fail(`${x.from} is not in your Dex. Add it before listing it under Also evolves from.`);
    if(k===id||x.from.toLowerCase()===name.toLowerCase())return fail('A Pokémon cannot evolve from itself.');
    if(k===patch.evolvesFrom)return fail(`${x.from} is already its main Evolves from. Use Second evolution method for another way to evolve from it.`);
    patch.evoAlts.push(x.method?{from:k,method:x.method}:{from:k})}
  const fo=v('formof'),foId=fo?byName('pokemon',fo):'';
  if(fo&&!foId)return fail(`${fo} is not in your Dex. Add the base Pokémon first.`);
  if(foId&&(foId===id||S.pokemon[foId].formOf))return fail('Choose the base Pokémon, not another form.');
  const variant=v('variant');if(variant&&!foId)return fail('A regional variant needs Form of set to the original Pokémon.');
  const doc=id?clone(S.pokemon[id]):{gens:{}};if(foId)doc.formOf=foId;else delete doc.formOf;if(variant)doc.variant=variant;else delete doc.variant;doc.dex=dex;doc.debut=debut;if(!art)delete doc.art;else doc.art=/^\d+$/.test(art)?+art:art;
  const from=id?(+v('from')||g):g,alt=(abPatch.abilitySlots||[]).some(o=>o.length>1);
  /* Saved from the debut generation, the name is the Pokémon's own name and later renames up to this generation are cleared.
     Saved from a later generation, it becomes a rename from that generation on (nothing is stored if it matches the name before). */
  if(!id||from<=debut){doc.name=name;patch.name=null}
  else{const prev=eff(doc,from-1).name;patch.name=name===pname(doc,from-1)?prev:name}
  applyFrom(doc,from,patch);
  if(g>=2)applyFrom(doc,Math.max(from,2),brPatch);
  if(g>=3)applyFrom(doc,Math.max(from,alt?4:3),abPatch);
  S.pokemon[key]=doc;
  const ok=await put('pokemon/'+key,doc);if(!ok)return;
  closeModal();
  if(!id){if(debut>UI.gen)UI.gen=debut;location.hash='p-'+key}
  render();toast('Saved');
}

/* Moveset editor */
function movesetCopyBar(pid,g){
  const games=gamesAt(g);
  return `<div class="toolbar">${games.length?`<label class="ctl" style="flex:1 1 200px">Check TMs and HMs against<select id="ms-game">${games.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>`:''}<button type="button" class="btn" data-act="ms-copyprev">Copy Gen ${ROMAN[g-1]} moveset</button></div>${games.length?'':`<p class="hint">No Gen ${ROMAN[g]} game has a TM list yet, so copied TMs and HMs can't be checked.</p>`}`;
}
function openMoveset(pid){
  const g=UI.gen;
  const src=movesetOf(pid,g).length||!isForm(pid)?pid:baseOf(pid);
  F={col:'moveset',pid,g,ms:movesetOf(src,g).map(x=>({m:label('moves',x.m),how:x.how}))};
  if(!F.ms.length)F.ms.push({m:'',how:''});
  modal(`${pname(pid,g)}: Gen ${ROMAN[g]} moveset`,`<div class="formbody"><p class="hint">Each move here is also listed on that move's page under "Pokémon that learn it" for Gen ${ROMAN[g]}. New move names are added to Moves.</p>${g>1?movesetCopyBar(pid,g):''}<p class="hint" id="ms-note" hidden></p><div id="ms" style="display:flex;flex-direction:column;gap:8px"></div></div>${foot(null)}`,saveMoveset);
  drawMoveset();
}
// Earlier stages in this generation, nearest first: Venusaur gives Ivysaur, then Bulbasaur.
function prevEvos(pid,g){
  const out=[],seen=new Set([pid]);let cur=pid;
  for(;;){const up=eff(S.pokemon[cur],g).evolvesFrom;if(!up||seen.has(up)||!S.pokemon[up]||(S.pokemon[up].debut||1)>g)break;seen.add(up);out.push(up);cur=up}
  return out;
}
function drawMoveset(){
  const imports=prevEvos(F.pid,F.g).map(e=>`<button type="button" class="btn small" data-act="ms-import" data-v="${esc(e)}">Import ${esc(pname(e,F.g))}'s moves</button>`).join('');
  $('ms').innerHTML=F.ms.map((x,i)=>`<div class="msrow">${input(`ms${i}-m`,'Move',x.m,{list:'dl-moves'})}${input(`ms${i}-how`,'How it learns it',x.how,{ph:'Level 12, TM30, Egg move'})}<button type="button" class="btn small" data-act="ms-del" data-v="${i}" aria-label="Remove move ${i+1}">Remove</button></div>`).join('')+`<div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" class="btn small" data-act="ms-add">Add move</button>${imports}</div>`;
}
// Adds an earlier stage's Gen moveset to the form. Rows that already match (same move and same "how") are skipped. Nothing is saved until you press Save.
function importMoveset(from){
  readMoveset();
  const key=x=>String(x.m).trim().toLowerCase()+'|'+String(x.how||'').trim().toLowerCase();
  const have=new Set(F.ms.filter(x=>x.m).map(key));
  const add=movesetOf(from,F.g).map(x=>({m:label('moves',x.m),how:x.how})).filter(x=>!have.has(key(x)));
  if(add.length)F.ms=F.ms.filter(x=>x.m||x.how).concat(add);
  drawMoveset();
  toast(add.length?`Added ${add.length} move${add.length===1?'':'s'} from ${pname(from,F.g)}. Review them, then Save.`:`${pname(from,F.g)} has no Gen ${ROMAN[F.g]} moves that aren't already here.`);
}
function readMoveset(){F.ms=F.ms.map((_,i)=>({m:v(`ms${i}-m`),how:v(`ms${i}-how`)}))}
async function saveMoveset(){
  readMoveset();
  const {pid,g}=F,list=F.ms.filter(x=>x.m);
  for(const x of list){const id=byName('moves',x.m);if(id&&(S.moves[id].debut||1)>g)return fail(`${S.moves[id].name} debuts in Gen ${ROMAN[S.moves[id].debut]}, so it can't be in a Gen ${ROMAN[g]} moveset.`)}
  const want={};
  for(const x of list){const id=await ensure('moves',x.m,g);(want[id]=want[id]||[]).push(x.how)}
  const touched=new Set([...Object.keys(want),...movesetOf(pid,g).map(x=>x.m)]);
  for(const mid of touched){
    const cur=eff(S.moves[mid],g).learners||[],mine=cur.filter(l=>l.p===pid).map(l=>l.how||'');
    if(eq(mine,want[mid]||[]))continue;
    const doc=clone(S.moves[mid]);
    applyGen(doc,g,{learners:cur.filter(l=>l.p!==pid).concat((want[mid]||[]).map(how=>({p:pid,how})))});
    S.moves[mid]=doc;
    if(!await put('moves/'+mid,doc))return;
  }
  closeModal();render();toast('Saved');
}

/* Trainer editors */
function openTrainer(id){
  const t=id?S.trainers[id]:{};F={col:'trainers',id};
  modal(`${id?'Edit':'Add'} trainer`,`<div class="formbody"><div class="fgrid">${input('name','Name',t.name)}${input('title','Title',t.title,{ph:'Cerulean City Gym Leader'})}</div>${area('blurb','Blurb',t.blurb)}${(()=>{const enc=t.encounters||[];return TIMELINES.filter(tl=>enc.some(e=>tlOf(e)===tl.id)).map(tl=>`<fieldset><legend>${esc(tl.name)} timeline story</legend><p class="hint">Optional. Each story shows under that generation's heading, and the ending shows after the last encounter in this timeline.</p>${erasIn(tl.id).filter(x=>enc.some(e=>eraOf(e)===x.id)).map(x=>area(`intro-${x.id}`,`Start of ${eraName(x.id)}`,t.stories?.[x.id])).join('')}${area(`ending-${tl.id}`,'Ending',endingOf(t,tl.id))}</fieldset>`).join('')||'<p class="hint">Once this trainer has encounters, you can add their story for each timeline here.</p>'})()}<label class="ctl">Your own picture (PNG, JPG, GIF or WebP)<input id="f-sprite" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></label></div>${foot(id,'del-record')}`,saveTrainer);
}
async function saveTrainer(){
  const {id}=F,name=v('name');if(!name)return fail('Give the trainer a name.');
  const doc=id?clone(S.trainers[id]):{encounters:[]};doc.name=name;doc.title=v('title');doc.blurb=v('blurb');
  // Only the stories shown in the form change. Empty ones are dropped.
  doc.stories=doc.stories||{};doc.endings=doc.endings||{};
  ERAS.forEach(x=>{if(!$('f-intro-'+x.id))return;const s=v('intro-'+x.id);if(s)doc.stories[x.id]=s;else delete doc.stories[x.id]});
  TIMELINES.forEach(x=>{if(!$('f-ending-'+x.id))return;const s=v('ending-'+x.id);if(s)doc.endings[x.id]=s;else delete doc.endings[x.id];if(x.id===TIMELINES[0].id)delete doc.epilogue});
  if(!Object.keys(doc.stories).length)delete doc.stories;
  if(!Object.keys(doc.endings).length)delete doc.endings;
  const f=$('f-sprite')?.files?.[0];
  if(f){try{doc.sprite=await uploadSprite(f)}catch(e){return fail('That image could not be saved. Use a PNG, JPG, GIF or WebP under 25 MB.')}}
  const key=id||newId('trainers',name);S.trainers[key]=doc;
  if(!await put('trainers/'+key,doc))return;
  closeModal();if(!id)location.hash='t-'+key;render();toast('Saved');
}
function abilityBlock(m,i,gen){
  const slots=dexSlots(m.p,gen),sp=S.pokemon[m.p];
  if(slots.length){
    const ab=chosenAbilities(m,gen),shared=slots.some(o=>o.length>1);
    return `<div class="fgrid" data-mode="dex">${slots.map((o,s)=>o.length===1
      ?`<div class="ctl"><span>${SLOT_NAMES[s]}</span><output class="abfixed">${esc(label('abilities',o[0]))}</output></div>`
      :`<label class="ctl">${SLOT_NAMES[s]}<select id="f-m${i}-ab${s}" data-slot="${s}"><option value="">Choose one</option>${o.map(a=>`<option value="${esc(a)}"${a===ab[s]?' selected':''}>${esc(label('abilities',a))}</option>`).join('')}</select></label>`).join('')}</div>
      <p class="hint">Filled in from ${esc(sp.name)}'s Gen ${ROMAN[gen]} abilities.${shared?' Some abilities share a slot, so choose the one this trainer’s Pokémon has.':''}</p>`;
  }
  const saved=savedAbilities(m);
  return `<div class="fgrid" data-mode="manual">${[0,1,2].map(s=>input(`m${i}-ab${s}`,SLOT_NAMES[s],label('abilities',saved[s]||''),{list:'dl-abilities'})).join('')}</div>
    <p class="hint">${sp?`${esc(sp.name)} has no Gen ${ROMAN[gen]} abilities in your Dex`:m.p?'This Pokémon is not in your Dex':'Choose a Pokémon to fill these in from your Dex'}. You can enter up to three by hand.</p>`;
}
function drawTeam(){
  const g=F.gen;
  $('team').innerHTML=F.team.map((m,i)=>`<fieldset><legend>Pokémon ${i+1}</legend><div class="fgrid">${input(`m${i}-p`,'Pokémon',label('pokemon',m.p),{list:'dl-pokemon'})}${input(`m${i}-level`,'Level',m.level,{type:'number',min:1})}${g>=2?input(`m${i}-item`,'Item',label('items',m.item),{list:'dl-items'}):''}${g>=3?input(`m${i}-nature`,'Nature',m.nature):''}</div>
  ${g>=3?`<fieldset><legend>Abilities</legend><div id="m${i}-ab">${abilityBlock(m,i,g)}</div></fieldset>`:''}
  <div class="fgrid">${[0,1,2,3].map(j=>input(`m${i}-mv${j}`,`Move ${j+1}`,label('moves',(m.moves||[])[j]),{list:'dl-moves'})).join('')}</div>
  ${g<=2?`<div class="fnarrow">${DV_KEYS.map(([k,l])=>input(`m${i}-dv-${k}`,`${l} DV`,m.dvs?.[k],{type:'number',min:0,max:DV_MAX})).join('')}</div><p class="hint">DVs go from 0 to ${DV_MAX}.</p>`
    :`<div class="fnarrow">${EV_KEYS.map(([k,l])=>input(`m${i}-ev-${k}`,`${l} EVs`,m.evs?.[k],{type:'number',min:0,max:EV_MAX})).join('')}</div><p class="hint" id="m${i}-evtotal">${evText(evSum(m.evs))}</p>
  <div class="fnarrow">${EV_KEYS.map(([k,l])=>input(`m${i}-iv-${k}`,`${l} IVs`,m.ivs?.[k],{type:'number',min:0,max:IV_MAX})).join('')}</div><p class="hint">IVs go from 0 to ${IV_MAX}.</p>`}
  ${input(`m${i}-notes`,'Notes',m.notes)}<div class="btns">${i?`<button type="button" class="btn small" data-act="mon-move" data-v="${i}" data-d="-1">Move up</button>`:''}${i<F.team.length-1?`<button type="button" class="btn small" data-act="mon-move" data-v="${i}" data-d="1">Move down</button>`:''}<button type="button" class="btn small danger" data-act="mon-del" data-v="${i}">Remove from team</button></div></fieldset>`).join('')+(F.team.length<6?`<button type="button" class="btn" data-act="mon-add">Add Pokémon to team</button>`:'');
}
// Reads only the fields on screen, so anything hidden in this generation is kept as it was.
function readTeam(){
  const has=k=>!!$('f-'+k);
  const nums=(i,kind,keys,keep)=>{const o={};keys.forEach(([k])=>{const x=n(`m${i}-${kind}-${k}`);if(x!=null&&keep(x))o[k]=x});return o};
  F.team=F.team.map((m,i)=>{
    if(!has(`m${i}-p`))return m;
    const o={...m,p:ref('pokemon',v(`m${i}-p`)),level:n(`m${i}-level`),moves:[0,1,2,3].map(j=>ref('moves',v(`m${i}-mv${j}`))),notes:v(`m${i}-notes`)};
    if(has(`m${i}-item`))o.item=ref('items',v(`m${i}-item`));
    if(has(`m${i}-nature`))o.nature=v(`m${i}-nature`);
    if(has(`m${i}-dv-atk`))o.dvs=nums(i,'dv',DV_KEYS,()=>true);
    if(has(`m${i}-ev-hp`))o.evs=nums(i,'ev',EV_KEYS,x=>x!==0);
    if(has(`m${i}-iv-hp`))o.ivs=nums(i,'iv',EV_KEYS,()=>true);
    const box=$(`m${i}-ab`)?.firstElementChild;
    if(box?.dataset.mode==='manual'){const a=[0,1,2].map(s=>ref('abilities',v(`m${i}-ab${s}`)));while(a.length&&!a[a.length-1])a.pop();o.abilities=a}
    else if(box?.dataset.mode==='dex'){const sels=box.querySelectorAll('select[data-slot]');if(sels.length){const a=savedAbilities(m).slice();sels.forEach(x=>{a[+x.dataset.slot]=x.value});for(let k=0;k<a.length;k++)a[k]=a[k]??'';o.abilities=a}}
    return o;
  });
  if(F.teams){const t=F.teams[F.cur];t.team=F.team;if($('f-when'))t.when=v('when')}
}
function checkTeam(team,gen){
  const whole=(x,lo,hi)=>Number.isInteger(x)&&x>=lo&&x<=hi;
  for(const m of team){
    const who=label('pokemon',m.p)||'A team member';
    if(gen<=2){for(const [k,l] of DV_KEYS){const x=m.dvs?.[k];if(x!=null&&!whole(x,0,DV_MAX))return `${who}: ${l} DV must be a whole number from 0 to ${DV_MAX}.`}continue}
    for(const [k,l] of EV_KEYS){const x=m.evs?.[k];if(x!=null&&!whole(x,0,EV_MAX))return `${who}: ${l} EVs must be a whole number from 0 to ${EV_MAX}.`}
    const t=evSum(m.evs);if(t>EV_TOTAL)return `${who} has ${t} EVs. The most a Pokémon can have is ${EV_TOTAL}.`;
    for(const [k,l] of EV_KEYS){const x=m.ivs?.[k];if(x!=null&&!whole(x,0,IV_MAX))return `${who}: ${l} IVs must be a whole number from 0 to ${IV_MAX}.`}
  }
  return '';
}
// The Generation list holds only the eras of the chosen timeline.
const eraOptions=(tl,era)=>erasIn(tl).map(x=>`<option value="${esc(x.id)}"${x.id===era?' selected':''}>${esc(eraName(x.id))}</option>`).join('');
// A new encounter starts in the timeline being viewed, at its era for the generation picked at the top, or its first era.
function openEncounter(tid,idx,from,tlView){
  const t=S.trainers[tid],e=idx!=null?t.encounters[idx]:(from||{});
  let era;
  if(e.gen!=null)era=eraOf(e);
  else{const tl=TIMELINES.some(x=>x.id===tlView)?tlView:tlOfEra(eraForGen(UI.gen)),inTl=erasIn(tl);era=(inTl.find(x=>x.gen===UI.gen)||inTl[0]||ERAS[0]).id}
  const tl=tlOfEra(era);
  F={col:'enc',tid,idx,gen:eraGet(era)?.gen??UI.gen,teams:clone(encTeams(e)),cur:0};F.team=F.teams[0].team;
  const conds=[...new Set((t.encounters||[]).flatMap(x=>encTeams(x).map(y=>y.when)).filter(Boolean))];
  modal(`${idx!=null?'Edit':'Add'} encounter`,`<div class="formbody"><div class="fgrid"><label class="ctl">Timeline<select id="f-timeline">${TIMELINES.map(x=>`<option value="${esc(x.id)}"${x.id===tl?' selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label class="ctl">Generation<select id="f-era">${eraOptions(tl,era)}</select></label>${input('label','Encounter',from?'':e.label,{ph:'Gym battle'})}${input('location','Battle location',from?'':e.location)}${input('game','Game',e.game)}</div>${area('story','Story leading into this encounter',from?'':e.story,'Optional. Shown on the trainer page just above this encounter.')}
  <datalist id="dl-when">${conds.map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist>
  <fieldset><legend>Teams</legend><p class="hint">Add another team when this trainer's team depends on something, like which starter the player chose. Each team can have its own picture of the trainer.</p><div id="teamtabs"></div><div id="teamhead"></div></fieldset>
  <div id="team" style="display:flex;flex-direction:column;gap:12px"></div></div>${foot(null)}`,saveEncounter);
  drawTeams();
}
const teamName=(x,i)=>x.when||`Team ${i+1}`;
// The tabs, condition and picture for the team being edited, then its Pokémon.
function drawTeams(){
  const x=F.teams[F.cur],t=S.trainers[F.tid],multi=F.teams.length>1;
  $('teamtabs').innerHTML=`<div class="btns" role="group" aria-label="Team to edit">${F.teams.map((y,i)=>`<button type="button" class="btn small" data-act="team-pick" data-v="${i}" aria-pressed="${i===F.cur}">${esc(teamName(y,i))}</button>`).join('')}<button type="button" class="btn small" data-act="team-add">Add another team</button></div>`;
  const pic=x.file?null:x.sprite;
  $('teamhead').innerHTML=`<div class="vteam">${pic?tile(t.name,null,['data/sprites/'+pic],72):x.file?tile(t.name,null,[URL.createObjectURL(x.file)],72):trainerTile(t,72)}<div class="vbody">
    ${input('when',multi?'Depends on':'Depends on (optional)',x.when,{list:'dl-when',ph:'Player chose Bulbasaur'})}
    <label class="ctl">Picture of the trainer for this team<input id="f-teampic" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></label>
    <p class="hint">${x.file?`New picture: ${esc(x.file.name)}. It saves with the encounter.`:x.sprite?'This team has its own picture.':'No picture yet, so it uses the trainer’s picture.'}</p>
    <div class="btns">${x.sprite||x.file?'<button type="button" class="btn small" data-act="team-pic-del">Remove picture</button>':''}${multi?'<button type="button" class="btn small danger" data-act="team-del">Remove this team</button>':''}</div></div></div>`;
  drawTeam();
}
async function saveEncounter(){
  readTeam();
  const {tid,idx}=F,era=eraGet(v('era'))?.id||eraForGen(F.gen),gen=eraGet(era).gen,multi=F.teams.length>1;
  const teams=[];
  for(const [i,x] of F.teams.entries()){
    const team=x.team.filter(m=>m.p);
    if(multi&&!x.when)return fail(`${teamName(x,i)} needs a "Depends on", like Player chose Bulbasaur.`);
    const bad=checkTeam(team,gen);if(bad)return fail(multi?`${teamName(x,i)}: ${bad}`:bad);
    // Dex abilities are saved per slot as well, so the record still reads correctly on its own.
    if(gen>=3)team.forEach(m=>{if(dexSlots(m.p,gen).length)m.abilities=chosenAbilities(m,gen)});
    teams.push({...x,team});
  }
  if(new Set(teams.map(x=>x.when)).size<teams.length)return fail('Two teams have the same "Depends on". Give each team a different one.');
  const up=new Map();
  for(const x of teams)if(x.file){try{if(!up.has(x.file))up.set(x.file,await uploadSprite(x.file));x.sprite=up.get(x.file)}catch(e){return fail('That picture could not be saved. Use a PNG, JPG, GIF or WebP under 25 MB.')}delete x.file}
  const doc=clone(S.trainers[tid]);doc.encounters=doc.encounters||[];
  const enc={era,gen,label:v('label'),location:v('location'),game:v('game'),story:v('story'),teams:teams.map(x=>{const o={};if(x.when)o.when=x.when;if(x.sprite)o.sprite=x.sprite;o.team=x.team;return o})};
  if(idx!=null)doc.encounters[idx]=enc;else doc.encounters.push(enc);
  S.trainers[tid]=doc;
  if(!await put('trainers/'+tid,doc))return;
  closeModal();render();toast('Saved');
}

function setGen(g){UI.gen=g;UI.page=0;try{localStorage.setItem('gen',g)}catch(e){}render()}
async function saveChart(c){S.chart=c;render();await put('config/typechart',c)}
function setCell(c,g,a,d,val){
  c.gens=c.gens||{};c.gens[g]=c.gens[g]||{};c.gens[g].cells=c.gens[g].cells||{};
  const k=a+'|'+d;
  if(val===cell(g-1,a,d,c))delete c.gens[g].cells[k];else c.gens[g].cells[k]=val;
}
function cycleCell(a,d){
  const order=[1,2,.5,0],g=UI.gen,c=clone(S.chart),k=a+'|'+d;
  const nx=order[(order.indexOf(cell(g,a,d,c))+1)%4],nextOld=g<4?cell(g+1,a,d,c):null;
  setCell(c,g,a,d,nx);
  if(g<4){
    if(UI.chartFuture)for(let i=g+1;i<=4;i++){if(c.gens?.[i]?.cells)delete c.gens[i].cells[k]}
    else setCell(c,g+1,a,d,nextOld);
  }
  saveChart(c);
}
function addType(){
  F={col:'type'};
  modal('Add type',`<div class="formbody"><div class="fgrid">${input('name','Name','')}${input('color','Color','#8A94A1',{type:'color'})}${genSelect('debut',UI.gen,'Generation introduced')}</div></div>${foot(null)}`,async()=>{
    const name=v('name');if(!name)return fail('Give the type a name.');
    if(/[|]/.test(name))return fail('Type names cannot include a vertical bar.');
    if(allTypes().some(t=>t.toLowerCase()===name.toLowerCase()))return fail(`${name} already exists.`);
    const c=clone(S.chart);c.types.push({name,color:v('color'),debut:+v('debut')});closeModal();await saveChart(c);toast('Saved');
  });
}

const ACT={
  theme:toggleTheme,
  gen:(d)=>setGen(+d.v),
  view:(d)=>{UI.view=d.v;render()},
  when:(d)=>{UI.when=d.v;render()},
  timeline:(d)=>{UI.timeline=d.v;UI.when='';render()},
  tgroup:(d)=>{UI.tgroup=d.v;try{localStorage.setItem('tgroup',d.v)}catch(e){}render()},
  page:(d)=>{UI.page+=+d.v;renderBody();const t=$('body');if(t&&t.getBoundingClientRect().top<0)t.scrollIntoView()},
  msort:(d)=>{if(UI.msort===d.v)UI.mdir=-UI.mdir;else{UI.msort=d.v;UI.mdir=['power','accuracy','pp'].includes(d.v)?-1:1}renderBody()},
  'stat-ab':(d)=>{UI.statAb=d.v||null;render()},
  'match-ab':(d)=>{UI.matchAb={...UI.matchAb,[d.k]:d.v};render()},
  sort:(d)=>{UI.page=0;if(UI.sort===d.v)UI.dir=-UI.dir;else{UI.sort=d.v;UI.dir=(d.v==='dex'||d.v==='name')?1:-1}renderBody()},
  sel:(d)=>{UI.sel=d.v;render()},
  combo:(d)=>{UI.combo=UI.combo===d.v?null:d.v;render()},
  'edit-chart':()=>{UI.editChart=!UI.editChart;render()},
  cell:(d)=>cycleCell(d.a,d.d),
  'add-type':addType,
  'del-type':(d)=>confirmBox(`Remove ${d.v}`,`Remove ${d.v} from the chart? Pokémon and moves that use it keep the name.`,'Remove',async()=>{const c=clone(S.chart);c.types=c.types.filter(t=>t.name!==d.v);await saveChart(c)}),
  close:closeModal,
  'new-pokemon':()=>openPokemon(null),'edit-pokemon':(d)=>openPokemon(d.id),
  'new-abilities':()=>openForm('abilities',null),'edit-abilities':(d)=>openForm('abilities',d.id),
  'new-items':()=>openForm('items',null),'edit-items':(d)=>openForm('items',d.id),
  'new-moves':()=>openForm('moves',null),'edit-moves':(d)=>openForm('moves',d.id),
  'new-effect':(d)=>openForm('effects',null,d.v),'edit-effects':(d)=>openForm('effects',d.id),
  'new-trainer':()=>openTrainer(null),'edit-trainer':(d)=>openTrainer(d.id),
  'new-enc':(d)=>openEncounter(d.id,null,null,d.v),
  'edit-enc':(d)=>openEncounter(d.id,+d.v),
  'copy-enc':(d)=>openEncounter(d.id,null,S.trainers[d.id].encounters[+d.v]),
  'del-enc':(d)=>confirmBox('Delete encounter','Delete this encounter and its teams?','Delete',async()=>{const doc=clone(S.trainers[d.id]);doc.encounters.splice(+d.v,1);S.trainers[d.id]=doc;await put('trainers/'+d.id,doc)}),
  'del-record':(d)=>{const col=F.col,name=S[col][d.id].name;confirmBox(`Delete ${name}`,`Delete ${name} from every generation?`,'Delete',async()=>{delete S[col][d.id];await remove(col+'/'+d.id);if(UI.arg===d.id)location.hash=({pokemon:'dex',moves:'moves',trainers:'trainers'})[col]||UI.route})},
  'form-add':()=>{readForms();F.forms.push({name:'',trigger:'',kind:''});drawForms();$(`f-fm${F.forms.length-1}-name`)?.focus()},
  'form-del':(d)=>{readForms();F.forms.splice(+d.v,1);drawForms()},
  'evoalt-add':()=>{readEvoAlts();F.evoAlts.push({from:'',method:''});drawEvoAlts();$(`f-ea${F.evoAlts.length-1}-from`)?.focus()},
  'evoalt-del':(d)=>{readEvoAlts();F.evoAlts.splice(+d.v,1);drawEvoAlts()},
  'hatch-add':()=>{readHatch();F.hatch.push({as:'',when:''});drawHatch();$(`f-ha${F.hatch.length-1}-as`)?.focus()},
  'hatch-del':(d)=>{readHatch();F.hatch.splice(+d.v,1);drawHatch()},
  'slot-add':()=>{readSlots();F.slots.push(['']);drawSlots()},
  'slot-del':(d)=>{readSlots();F.slots.splice(+d.v,1);drawSlots()},
  'slot-alt':(d)=>{readSlots();F.slots[+d.v].push('');drawSlots()},
  'slot-unalt':(d)=>{readSlots();F.slots[+d.v].length=1;drawSlots()},
  'mon-add':()=>{readTeam();F.team.push({p:''});drawTeam();const i=F.team.length-1;$(`f-m${i}-p`)?.focus()},
  'gs-open':(d)=>gsOpen(+d.v),
  jump:(d)=>$(d.v)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}),
  'mon-del':(d)=>{readTeam();F.team.splice(+d.v,1);drawTeam()},
  'mon-move':(d)=>{readTeam();const i=+d.v,j=i+ +d.d;[F.team[i],F.team[j]]=[F.team[j],F.team[i]];drawTeam();$('team').querySelector(`[data-act="mon-move"][data-v="${j}"]`)?.focus()},
  'enc-move':(d)=>moveEncounter(d.id,+d.v,+d.d),
  'team-pick':(d)=>{readTeam();F.cur=+d.v;F.team=F.teams[F.cur].team;drawTeams()},
  'team-add':()=>{readTeam();const x=F.teams[F.cur];F.teams.push({when:'',sprite:x.sprite,file:x.file,team:clone(x.team)});F.cur=F.teams.length-1;F.team=F.teams[F.cur].team;drawTeams();$('f-when')?.focus();toast('Started as a copy of the team you were editing.')},
  'team-del':()=>{readTeam();F.teams.splice(F.cur,1);F.cur=Math.max(0,F.cur-1);F.team=F.teams[F.cur].team;drawTeams()},
  'team-pic-del':()=>{readTeam();const x=F.teams[F.cur];x.sprite='';x.file=null;drawTeams()},
  'edit-moveset':(d)=>openMoveset(d.id),
  'ms-add':()=>{readMoveset();F.ms.push({m:'',how:''});drawMoveset();$(`f-ms${F.ms.length-1}-m`)?.focus()},
  'ms-del':(d)=>{readMoveset();F.ms.splice(+d.v,1);drawMoveset()},
  'ms-import':(d)=>importMoveset(d.v),
  'cmp-clear':()=>{location.hash='cmp'},
  'ms-copyprev':()=>copyPrevMoveset(),
  'dmg-swap':()=>{const D=dmgState();D.sides.reverse();D.sel.i=1-D.sel.i;render()},
  'dmg-tog':(d)=>{const [i,k]=d.v.split('|'),s=dmgState().sides[+i];s[k]=!s[k];render()},
  'dmg-weather':(d)=>{dmgState().weather=d.v;render()},
  'dmg-sel':(d)=>{const [i,j]=d.v.split('|');dmgState().sel={i:+i,j:+j};dmgFill()},
  'new-tms':()=>openTms(null),
  'edit-tms':(d)=>openTms(d.id),
  'tm-game':(d)=>{UI.tmGame=d.v;render()},
  'tm-add':(d)=>addTmRow(d.v),
  'tm-del':(d)=>{readTms();F.rows.splice(+d.v,1);drawTms()},
  'tm-copyfrom':()=>tmCopyFrom(),
  'del-tms':(d)=>{const name=S.tms[d.id].name;confirmBox(`Delete ${name}`,`Delete the ${name} TM list? Movesets aren't changed.`,'Delete',async()=>{if(await remove('tms/'+d.id))delete S.tms[d.id]})}
};
// A trainer card under a timeline or game opens the trainer page on that timeline.
document.addEventListener('click',e=>{const a=e.target.closest('a[data-tl]');if(a)UI.timeline=a.dataset.tl});
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const f=ACT[b.dataset.act];if(f){e.preventDefault();f(b.dataset)}});
document.addEventListener('input',e=>{
  const ev=F?.col==='enc'&&e.target.id.match(/^f-m(\d+)-ev-/);
  if(ev){const i=+ev[1],h=$(`m${i}-evtotal`);if(h)h.textContent=evText(EV_KEYS.reduce((a,[k])=>a+(n(`m${i}-ev-${k}`)||0),0));return}
  if(e.target.id==='f-when'&&F?.col==='enc'){const b=document.querySelector(`[data-act="team-pick"][data-v="${F.cur}"]`);if(b)b.textContent=e.target.value.trim()||`Team ${F.cur+1}`;return}
  if(e.target.id==='f-formof'&&F?.col==='pokemon'){const b=S.pokemon[byName('pokemon',e.target.value)];if(b?.dex!=null&&$('f-dex')){$('f-dex').value=b.dex;$('f-dex').dispatchEvent(new Event('input',{bubbles:true}))}return}
  if(e.target.id==='f-dex'&&F?.col==='pokemon'){const h=$('dex-share'),t=dexShare(n('dex'),F.id);if(h){h.textContent=t;h.hidden=!t}return}
  if(e.target.id?.startsWith('dc-')){dmgInput(e.target);return}
  const m=e.target.dataset.model;if(!m)return;UI.page=0;if(m==='perPage')try{localStorage.setItem('perPage',e.target.value)}catch(x){}UI[m]=e.target.type==='checkbox'?e.target.checked:e.target.value;renderBody()});
document.addEventListener('change',e=>{
  if(e.target.id==='f-debut'&&F?.col==='pokemon'&&!F.id){readSlots();readHatch();readForms();const g=+e.target.value;F.g=g;const keep={};
    statsAt({},g).forEach(s=>{const x=$('f-st-'+s[0]);if(x&&x.value!=='')keep[s[0]]=Number(x.value)});
    $('dyn').innerHTML=pokeDyn(g,{stats:keep});drawSlots();drawHatch();drawForms()}
  if(/^cmp-\d$/.test(e.target.id)){cmpPick();return}
  if(/^dc-\d-(p|load)$/.test(e.target.id)){dmgPick(e.target);return}
  // The era's generation decides which fields each team member has.
  if(F?.col==='enc'&&e.target.id==='f-era'){readTeam();F.gen=eraGet(e.target.value)?.gen??F.gen;drawTeam();return}
  // A new timeline swaps the Generation list, keeping the same generation when that timeline has it.
  if(F?.col==='enc'&&e.target.id==='f-timeline'){const inTl=erasIn(e.target.value),x=inTl.find(y=>y.gen===F.gen)||inTl[0];if(!x)return;$('f-era').innerHTML=eraOptions(e.target.value,x.id);if(x.gen!==F.gen){readTeam();F.gen=x.gen;drawTeam()}return}
  if(F?.col==='enc'&&e.target.id==='f-teampic'){readTeam();const f=e.target.files?.[0];if(f){F.teams[F.cur].file=f;drawTeams()}return}
  const mp=F?.col==='enc'&&e.target.id.match(/^f-m(\d+)-p$/);
  if(mp&&$(`m${mp[1]}-ab`)){readTeam();const i=+mp[1];$(`m${i}-ab`).innerHTML=abilityBlock(F.team[i],i,F.gen)}
});
document.addEventListener('error',e=>{const i=e.target;if(i.tagName!=='IMG')return;const a=(i.dataset.alt||'').split('|').filter(Boolean);if(a.length){i.dataset.alt=a.slice(1).join('|');i.src=a[0]}else i.remove()},true);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',renderChrome);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&$('modal-root').firstChild)closeModal();
  // Left and right arrow keys step through the Dex on a Pokémon page, unless you are typing or a dialog is open.
  if(UI.route==='p'&&(e.key==='ArrowLeft'||e.key==='ArrowRight')&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!$('modal-root').firstChild&&!e.target.closest('input,select,textarea')){const a=document.querySelector(`[data-nav="${e.key==='ArrowLeft'?'prev':'next'}"]`);if(a){e.preventDefault();location.hash=a.getAttribute('href').slice(1)}}
});
/* Search everything, from the bar at the top of every page. Press / or Ctrl+K to jump to it. */
const GS_KINDS=[['pokemon','Pokémon'],['types','Types'],['moves','Moves'],['abilities','Abilities'],['items','Items'],['effects','Effects'],['trainers','Trainers']];
const GS_PER_KIND=6;
let gsHits=[],gsActive=-1,gsPendingQ=null;
function gsFind(q){
  const t=q.trim().toLowerCase().replace(/^#/,'');if(!t)return[];
  const num=/^\d+$/.test(t)?Number(t):null,out=[];
  for(const [k] of GS_KINDS){
    const hits=[];
    const src=k==='types'?(S.chart?.types||[]).map(t=>({id:t.name,name:t.name,debut:t.debut||1})):rows(k);
    for(const x of src){
      const sc=nm=>{const at=nm.indexOf(t);return at===0?(nm===t?0:1):at>0?(nm[at-1]===' '||nm[at-1]==='-'?2:3):null};
      let score=sc((x.name||'').toLowerCase());
      if(k==='pokemon'&&score==null){const dn=discName(x);if(dn&&sc(dn.toLowerCase())!=null)score=sc(dn.toLowerCase())+0.5}
      if(k==='pokemon'&&num!=null&&x.dex===num)score=0;
      if(k==='trainers'&&score==null&&(x.title||'').toLowerCase().includes(t))score=4;
      if(score!=null)hits.push({k,x,score});
    }
    hits.sort((a,b)=>a.score-b.score||(k==='pokemon'?(a.x.dex||9999)-(b.x.dex||9999):0)||a.x.name.localeCompare(b.x.name));
    out.push(...hits.slice(0,GS_PER_KIND));
  }
  return out;
}
function gsRow(h,i){
  const {k,x}=h,g=Math.max(UI.gen,x.debut||1);
  let pic='',sub='';
  if(k==='pokemon'){const e=eff(x,g);pic=pokeTile(x,e,g,32);sub=`<span class="mono muted">No. ${pad(x.dex)}</span>${discName(x,g)?`<span class="muted">${esc(discName(x,g))}</span>`:''}${(e.types||[]).map(chipText).join('')}`}
  else if(k==='types'){pic=typeIcon(x.name);sub=`<span class="muted">Type · Gen ${ROMAN[x.debut]}</span>`}
  else if(k==='moves'){const e=effMove(x,g);if(e.type)pic=typeIcon(e.type);sub=`${e.type?chipText(e.type):''}${e.category?`<span class="muted">${esc(e.category)}</span>`:''}`}
  else if(k==='items'){pic=`<span class="gsicon">${itemIcon(x.id)}</span>`;sub=`<span class="muted">${esc(eff(x,g).category||'Item')}</span>`}
  else if(k==='trainers'){pic=trainerTile(x,32);sub=`<span class="muted">${esc(x.title||'Trainer')}</span>`}
  else if(k==='abilities')sub='<span class="muted">Ability</span>';
  else{const gr=eff(x,g).group;sub=`<span class="muted">${x.kind==='status'?'Status effect':'Battle effect'}${gr?' · '+esc(gr):''}</span>`}
  return `<a class="gsrow${pic?'':' nopic'}" id="gs-${i}" role="option" aria-selected="${i===gsActive}" href="#" data-act="gs-open" data-v="${i}">${pic}<span class="gsname">${esc(x.name)}</span><span class="gssub">${sub}</span></a>`;
}
function gsDraw(){
  const box=$('gres'),q=$('gq').value;
  if(!q.trim()){gsClose(false);return}
  let html='';
  if(!loaded)html='<p class="gsnone">Still loading your data.</p>';
  else if(!gsHits.length)html=`<p class="gsnone">Nothing matches "${esc(q.trim())}".</p>`;
  else for(const [k,l] of GS_KINDS){const part=gsHits.map((h,i)=>[h,i]).filter(([h])=>h.k===k);if(part.length)html+=`<div class="gsgroup" role="group" aria-label="${l}"><div class="gshead">${l}</div>${part.map(([h,i])=>gsRow(h,i)).join('')}</div>`}
  box.innerHTML=html;box.hidden=false;$('gq').setAttribute('aria-expanded','true');
  if(gsActive>=0){$('gq').setAttribute('aria-activedescendant','gs-'+gsActive);$('gs-'+gsActive)?.scrollIntoView({block:'nearest'})}else $('gq').removeAttribute('aria-activedescendant');
}
function gsClose(clear){$('gres').hidden=true;$('gq').setAttribute('aria-expanded','false');if(clear){$('gq').value='';gsHits=[];gsActive=-1}}
// Pokémon, moves, abilities and trainers have their own pages. Everything else opens its list, filtered to that name, in a generation where it exists.
function gsOpen(i){
  const h=gsHits[i];if(!h)return;
  const {k,x}=h;gsClose(true);$('gq').blur();
  if(k==='types'){if(UI.gen<x.debut){UI.gen=x.debut;try{localStorage.setItem('gen',x.debut)}catch(e){}}location.hash='ty-'+encodeURIComponent(x.id);return}
  if(k==='abilities'){const d=x.debut||3;if(UI.gen<d){UI.gen=d;try{localStorage.setItem('gen',d)}catch(e){}}if(location.hash==='#a-'+x.id)render();else location.hash='a-'+x.id;return}
  const page={pokemon:'p-',moves:'m-',trainers:'t-'}[k];
  if(page){location.hash=page+x.id;return}
  const r=k==='effects'?'mechanics':k;
  const debut=x.debut||(k==='abilities'?3:1);
  if(UI.gen<debut){UI.gen=debut;try{localStorage.setItem('gen',debut)}catch(e){}}
  if(UI.route===r){UI.q=x.name;UI.group='All';UI.cat='All';UI.page=0;render();window.scrollTo(0,0)}
  else{gsPendingQ=x.name;location.hash=r}
}
$('gq').addEventListener('input',()=>{gsHits=gsFind($('gq').value);gsActive=gsHits.length?0:-1;gsDraw()});
$('gq').addEventListener('focus',()=>{if($('gq').value.trim()){gsHits=gsFind($('gq').value);gsDraw()}});
$('gq').addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!gsHits.length)return;const d=e.key==='ArrowDown'?1:-1;gsActive=(gsActive+d+gsHits.length)%gsHits.length;gsDraw()}
  else if(e.key==='Enter'){e.preventDefault();gsOpen(gsActive<0?0:gsActive)}
  else if(e.key==='Escape'){e.stopPropagation();if($('gq').value)gsClose(true);else $('gq').blur()}
});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.gsearch'))gsClose(false)});
document.addEventListener('keydown',e=>{
  const typing=e.target.closest&&e.target.closest('input,select,textarea,[contenteditable]');
  if(((e.key==='/'&&!typing)||((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'))&&!$('modal-root').firstChild){e.preventDefault();$('gq').focus();$('gq').select()}
});
function route(){
  let h=location.hash.slice(1)||'dex';if(h==='effects'||h==='status')h='mechanics';
  const m=h.match(/^(ty|cmp|calc|[pmta])-(.+)$/),prev=UI.route;
  const prevArg=UI.arg;
  if(m){UI.route=m[1];try{UI.arg=m[1]==='ty'?decodeURIComponent(m[2]):m[2]}catch(e){UI.arg=m[2]}}else{UI.route=PAGES[h]&&!['p','m','a','t','ty'].includes(h)?h:'dex';UI.arg=null}
  if(prevArg!==UI.arg)UI.when='';
  if(!['dex','p'].includes(UI.route))UI.page=0;
  if(prev!==UI.route){UI.q='';UI.type='All';UI.cat='All';UI.group='All';UI.newOnly=false;UI.editChart=false;UI.when=''}
  if(gsPendingQ!=null){UI.q=gsPendingQ;gsPendingQ=null}
  window.scrollTo(0,0);render();
}
window.addEventListener('hashchange',route);

async function boot(){
  route();
  try{const r=await fetch('api/ping',{cache:'no-store'});canEdit=r.ok&&(await r.json()).ok===true}catch(e){canEdit=false}
  try{
    const get=async f=>{const r=await fetch(`data/${f}.json`,{cache:'no-store'});return r.ok?r.json():{}};
    const lists=await Promise.all(COLS.map(get));
    COLS.forEach((c,i)=>{S[c]=lists[i]});
    const cfg=await get('config');S.chart=cfg.typechart||null;
    if(Array.isArray(cfg.timelines)&&cfg.timelines.length)TIMELINES=cfg.timelines.filter(x=>x&&x.id);
    if(Array.isArray(cfg.eras)&&cfg.eras.length)ERAS=cfg.eras.filter(x=>x&&x.id&&GENS.includes(x.gen));
  }catch(e){failed=true}
  loaded=true;render();
}
boot();
