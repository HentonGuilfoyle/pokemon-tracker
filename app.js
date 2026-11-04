'use strict';
const GENS=[1,2,3,4],ROMAN={1:'I',2:'II',3:'III',4:'IV'},REGION={1:'Kanto',2:'Johto',3:'Hoenn',4:'Sinnoh'};
const COLS=['pokemon','abilities','items','moves','effects','trainers'];
const SLOT_NAMES=['Ability I','Ability II','Ability III'];
const STAT_MAX=255;
const NAV=[['dex','National Dex'],['types','Type Chart'],['abilities','Abilities'],['items','Items'],['moves','Moves'],['effects','Battle Effects'],['status','Status Effects'],['trainers','Trainers']];
const CAT={Physical:'var(--hot)',Special:'var(--cool)',Status:'var(--stat)'};
// Before Gen IV there is no per-move physical/special split: a damaging move's type decides it.
const SPLIT_FROM=4;
const PHYSICAL_TYPES=['Normal','Fighting','Flying','Poison','Ground','Rock','Bug','Ghost','Steel','Dragon'];
const SPECIAL_TYPES=['Fire','Water','Grass','Electric','Psychic','Ice','Dark'];
const typeCat=t=>PHYSICAL_TYPES.includes(t)?'Physical':SPECIAL_TYPES.includes(t)?'Special':'';
// A move's data as it applies in gen g, with the category worked out from the type before the split.
function effMove(m,g){const e=eff(m,g);if(g<SPLIT_FROM&&e.category&&e.category!=='Status')e.category=typeCat(e.type)||e.category;return e}
// Move targets. The double-battle ones only exist from Gen III.
const TARGETS={user:'The user',single:'One target',foes:'The opposing side',field:'The entire field'};
const DOUBLES_TARGETS=['foes','field'],CONTACT_FROM=3;
const targetsAt=g=>Object.keys(TARGETS).filter(k=>g>=3||!DOUBLES_TARGETS.includes(k));
const prioText=p=>p==null||p===''?'':p>0?'+'+p:String(p);
const contactText=c=>c===true?'Yes':c===false?'No':'';
const S={pokemon:{},abilities:{},items:{},moves:{},effects:{},trainers:{},chart:null};
const UI={gen:4,route:'dex',arg:null,q:'',type:'All',cat:'All',group:'All',view:'all',newOnly:false,sort:'dex',dir:1,msort:'name',mdir:1,sel:null,editChart:false,chartFuture:true,perPage:'all',page:0};
const PER_PAGE=[['25','25'],['50','50'],['100','100'],['all','Endless']];
let canEdit=false,loaded=false,failed=false,bodyFn=null,F=null,timer=0;
try{const g=+localStorage.getItem('gen');if(GENS.includes(g))UI.gen=g;const pp=localStorage.getItem('perPage');if(PER_PAGE.some(o=>o[0]===pp))UI.perPage=pp}catch(e){}

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o??null));
const eq=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const blank=v=>v===undefined||v===null||v===''||(Array.isArray(v)&&v.length===0);
const pad=n=>n==null?'':String(n).padStart(4,'0');
const dash=v=>blank(v)?'—':esc(v);
const rows=c=>Object.entries(S[c]).map(([id,d])=>({id,...d}));
const byName=(c,n)=>{const t=String(n||'').trim().toLowerCase();return Object.keys(S[c]).find(k=>(S[c][k].name||'').toLowerCase()===t)||null};
const label=(c,v)=>S[c][v]?.name??v??'';
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
function chip(t){const c=typeColor(t);return `<span class="chip" style="background:${c};color:${fgFor(c)}">${esc(t)}</span>`}
const chips=ts=>(ts||[]).length?`<span class="chips">${ts.map(chip).join('')}</span>`:'<span class="muted">No type set</span>';
const RAW='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/';
const artNo=p=>p.art!==undefined?(p.art||null):(p.dex&&p.dex<=493?p.dex:null);
function pokeArt(p,gen,e){
  if(e.sprite)return['data/sprites/'+e.sprite];
  const a=artNo(p);if(!a)return[];
  const g=Math.max(gen,a<=151?1:a<=251?2:a<=386?3:4);
  const file={1:`generation-i/red-blue/transparent/${a}.png`,2:`generation-ii/crystal/transparent/${a}.png`,3:`generation-iii/emerald/${a}.png`,4:`generation-iv/platinum/${a}.png`}[g];
  return[RAW+'pokemon/versions/'+file,RAW+`pokemon/${a}.png`];
}
function tile(name,type,srcs,size){
  const c=typeColor(type),has=srcs&&srcs.length;
  const s=`width:${size}px;height:${size}px;font-size:${Math.round(size*.55)}px;background:${has?'var(--well)':type?c:'var(--soft)'};color:${has||!type?'var(--ink)':fgFor(c)}`;
  return `<span class="tile" style="${s}" aria-hidden="true">${esc((name||'?')[0])}${has?`<img src="${esc(srcs[0])}" data-alt="${esc(srcs.slice(1).join('|'))}" alt="" loading="lazy">`:''}</span>`;
}
const pokeTile=(p,e,g,size)=>tile(p.name,(e.types||[])[0],pokeArt(p,g,e),size);
const trainerTile=(t,size)=>tile(t.name,null,t.sprite?['data/sprites/'+t.sprite]:[`https://play.pokemonshowdown.com/sprites/trainers/${slug(t.name)}.png`],size);
const itemIcon=(id)=>S.items[id]||id?`<img class="icon" src="${esc(RAW+'items/'+(S.items[id]?id:slug(id))+'.png')}" alt="" loading="lazy">`:'';
const pokeLink=(v)=>S.pokemon[v]?`<a href="#p-${esc(v)}">${esc(S.pokemon[v].name)}</a>`:esc(v||'');
const moveLink=(v)=>S.moves[v]?`<a href="#m-${esc(v)}">${esc(S.moves[v].name)}</a>`:esc(v||'');

/* Type chart */
const typesAt=g=>(S.chart?.types||[]).filter(t=>(t.debut||1)<=g).map(t=>t.name);
function cell(g,a,d,c=S.chart){const k=a+'|'+d;for(let i=g;i>=1;i--){const m=c?.gens?.[i]?.cells;if(m&&k in m)return m[k]}return 1}
const mult=m=>m===.5?'½':m===.25?'¼':String(m);

/* Stats */
function statsAt(e,g){const s=e.stats||{};return g===1
  ?[['hp','HP',s.hp],['atk','Attack',s.atk],['def','Defense',s.def],['spc','Special',s.spc??s.spa],['spe','Speed',s.spe]]
  :[['hp','HP',s.hp],['atk','Attack',s.atk],['def','Defense',s.def],['spa','Sp. Atk',s.spa??s.spc],['spd','Sp. Def',s.spd??s.spc],['spe','Speed',s.spe]]}
const total=(e,g)=>{const v=statsAt(e,g).map(x=>x[2]);return v.some(x=>x==null)?null:v.reduce((a,b)=>a+b,0)};
const slotText=(sl)=>(sl||[]).map(o=>o.map(a=>label('abilities',a)).join(' / '));

/* Change notes for a Pokémon, worked out by comparing two generations */
function pokeChanges(p,g){
  if(g===(p.debut||1))return[`${p.name} debuts in Gen ${ROMAN[g]}.`];
  const a=eff(p,g-1),b=eff(p,g),out=[];
  if(!blank(a.types)&&!eq(a.types,b.types))out.push(`Type: ${(a.types||[]).join('/')||'none'} to ${(b.types||[]).join('/')||'none'}.`);
  if(g===2&&a.stats?.spc!=null&&b.stats?.spa!=null&&!eq(a.stats,b.stats))out.push(`Special splits into Sp. Atk ${b.stats.spa} and Sp. Def ${b.stats.spd}.`);
  else{const x=statsAt(a,g),y=statsAt(b,g);x.forEach((s,i)=>{if(s[2]!==y[i][2]&&s[2]!=null)out.push(`${s[1]}: ${s[2]??'none'} to ${y[i][2]??'none'}.`)})}
  const sa=slotText(a.abilitySlots),sb=slotText(b.abilitySlots);
  for(let i=0;i<3;i++)if(sa[i]!==sb[i])out.push(sa[i]?`${SLOT_NAMES[i]}: ${sa[i]} to ${sb[i]||'none'}.`:`${SLOT_NAMES[i]}: adds ${sb[i]}.`);
  if((a.evolvesFrom||a.evoMethod)&&(a.evolvesFrom!==b.evolvesFrom||a.evoMethod!==b.evoMethod))out.push('Evolution changed.');
  if((!blank(a.eggGroups)||a.eggCycles!=null||a.genderM!=null||a.hatchesAs)&&(!eq(a.eggGroups,b.eggGroups)||a.genderM!==b.genderM||a.eggCycles!==b.eggCycles||a.hatchesAs!==b.hatchesAs))out.push('Breeding changed.');
  if(hasVitals(a)&&(a.species!==b.species||a.height!==b.height||a.weight!==b.weight||a.growthRate!==b.growthRate))out.push('Vitals changed.');
  if(a.sprite&&a.sprite!==b.sprite)out.push('New sprite.');
  return out.length?out:['No changes from the previous generation.'];
}
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
  const cur=({p:'dex',m:'moves',t:'trainers'})[UI.route]||UI.route;
  $('nav').innerHTML=NAV.map(([k,l])=>`<a href="#${k}"${k===cur?' aria-current="page"':''}>${l}</a>`).join('');
  const allGens=cur==='trainers';
  $('genpick').innerHTML=allGens?'<span>All generations</span>':'<span>Generation</span>'+GENS.map(g=>`<button type="button" class="genbtn" data-act="gen" data-v="${g}" aria-pressed="${g===UI.gen}" aria-label="Generation ${ROMAN[g]}, ${REGION[g]}">${ROMAN[g]}</button>`).join('');
}
function render(){
  fillLists();renderChrome();bodyFn=null;
  const fn=PAGES[UI.route]||PAGES.dex;
  $('app').innerHTML=(failed?'<p class="error">The data files could not be read. Run the tracker with start.bat, not by opening index.html directly.</p>':'')+fn();
  if(bodyFn)renderBody();
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
  return GENS.filter(g=>g<=UI.gen).map(g=>{const r=list.filter(x=>(x.debut||1)===g);return r.length?`<h2 class="genhead">Gen ${ROMAN[g]} <span>${REGION[g]}</span></h2>${table(r)}`:''}).join('');
}
const matchQ=(x)=>!UI.q.trim()||(x.name||'').toLowerCase().includes(UI.q.trim().toLowerCase());
const editCell=(act,id)=>canEdit?`<td class="mid"><button type="button" class="btn small" data-act="${act}" data-id="${esc(id)}" aria-label="Edit">Edit</button></td>`:'';
const editHead=()=>canEdit?'<th><span class="muted" style="color:inherit">Edit</span></th>':'';
const changedTag=(d)=>changed(d,UI.gen)?` <span class="pill">Changed in Gen ${ROMAN[UI.gen]}</span>`:'';

const PAGES={
  dex(){
    bodyFn=dexBody;
    return titleBar('National Dex',`Every Pokémon available in Gen ${ROMAN[UI.gen]} (${REGION[UI.gen]}), shown with Gen ${ROMAN[UI.gen]} data.`,addBtn('Add Pokémon','new-pokemon'))+
    `<div class="toolbar">${search('Search')}${typeSelect()}${UI.gen>1?`<label class="check"><input id="newOnly" type="checkbox" data-model="newOnly"${UI.newOnly?' checked':''}>New in Gen ${ROMAN[UI.gen]} only</label>`:''}<label class="ctl push" style="flex:0 1 150px">Pokémon per page<select id="perPage" data-model="perPage">${PER_PAGE.map(([k,l])=>`<option value="${k}"${UI.perPage===k?' selected':''}>${l}</option>`).join('')}</select></label></div><div id="body"></div>`;
  },
  types(){
    return titleBar('Type Chart',`Gen ${ROMAN[UI.gen]} matchups. Rows attack and columns defend.`,canEdit?`<div class="btns">${UI.editChart?'<button type="button" class="btn" data-act="add-type">Add type</button>':''}<button type="button" class="btn${UI.editChart?' primary':''}" data-act="edit-chart" aria-pressed="${UI.editChart}">${UI.editChart?'Done editing':'Edit chart'}</button></div>`:'')+chartPage();
  },
  abilities(){bodyFn=abilityBody;return titleBar('Abilities','',addBtn('Add ability','new-abilities'))+`<div class="toolbar">${search('Search')}${viewToggle('All abilities')}</div><div id="body" style="display:flex;flex-direction:column;gap:18px"></div>`},
  items(){bodyFn=itemBody;const cats=[...new Set(rows('items').map(i=>eff(i,UI.gen).category).filter(Boolean))].sort();
    return titleBar('Items','',addBtn('Add item','new-items'))+`<div class="toolbar">${search('Search')}<label class="ctl" style="flex:0 1 200px">Category<select id="cat" data-model="cat"><option value="All">All categories</option>${cats.map(c=>`<option${UI.cat===c?' selected':''}>${esc(c)}</option>`).join('')}</select></label>${viewToggle('All items')}</div><div id="body" style="display:flex;flex-direction:column;gap:18px"></div>`},
  moves(){bodyFn=moveBody;return titleBar('Moves','',addBtn('Add move','new-moves'))+`<div class="toolbar">${search('Search')}${typeSelect()}<label class="ctl" style="flex:0 1 170px">Category<select id="cat" data-model="cat"><option value="All">All categories</option>${Object.keys(CAT).map(c=>`<option${UI.cat===c?' selected':''}>${c}</option>`).join('')}</select></label>${viewToggle('All moves')}</div><div id="body" style="display:flex;flex-direction:column;gap:18px"></div>`},
  effects(){return effectPage('battle','Battle Effects','Weather, terrain and other conditions on the field.','Add battle effect')},
  status(){return effectPage('status','Status Effects','Conditions that stay on a Pokémon.','Add status effect')},
  trainers(){return trainerList()},
  p(){return pokemonPage(UI.arg)},
  m(){return movePage(UI.arg)},
  t(){return trainerPage(UI.arg)}
};

function dexBody(){
  if(!loaded)return loading();
  const g=UI.gen;
  let list=rows('pokemon').filter(p=>(p.debut||1)<=g).filter(matchQ);
  if(UI.newOnly&&g>1)list=list.filter(p=>(p.debut||1)===g);
  if(UI.type!=='All')list=list.filter(p=>(eff(p,g).types||[]).includes(UI.type));
  if(!rows('pokemon').length)return emptyMsg('Your Dex is empty. Add your first Pokémon, new or existing, and fill in its typing, stats, abilities, evolution and breeding.','new-pokemon','Add Pokémon');
  if(!list.length)return emptyMsg('No Pokémon match these filters.');
  const keys=statsAt({},g).map(s=>s[0]);
  const val=(p)=>{const e=eff(p,g);if(UI.sort==='dex')return p.dex??1e9;if(UI.sort==='name')return p.name||'';if(UI.sort==='bst')return total(e,g)??-1;return (statsAt(e,g).find(s=>s[0]===UI.sort)||[])[2]??-1};
  list.sort((a,b)=>{const x=val(a),y=val(b);return (typeof x==='string'?x.localeCompare(y):x-y)*UI.dir||(a.dex??0)-(b.dex??0)});
  const size=UI.perPage==='all'?list.length:+UI.perPage,pages=Math.max(1,Math.ceil(list.length/size)),count=list.length;
  UI.page=Math.min(Math.max(UI.page,0),pages-1);
  const start=UI.page*size;list=list.slice(start,start+size);
  const pager=(where)=>pages<2?'':`<nav class="pager" aria-label="Dex pages, ${where}"><button type="button" class="btn small" data-act="page" data-v="-1"${UI.page===0?' disabled':''} aria-label="Previous page">← Previous</button><span class="muted">Page ${UI.page+1} of ${pages} · ${start+1}–${start+list.length} of ${count}</span><button type="button" class="btn small" data-act="page" data-v="1"${UI.page===pages-1?' disabled':''} aria-label="Next page">Next →</button></nav>`;
  const arrow=k=>UI.sort===k?(UI.dir>0?' ↑':' ↓'):'';
  const short={hp:'HP',atk:'Atk',def:'Def',spa:'SpA',spd:'SpD',spc:'Spc',spe:'Spe'};
  const th=(k,l)=>`<th class="num"><button type="button" data-act="sort" data-v="${k}">${l}${arrow(k)}</button></th>`;
  return `${pager('top')}<div class="box" id="dextable"><table style="min-width:980px"><thead><tr><th><button type="button" data-act="sort" data-v="dex">No.${arrow('dex')}</button></th><th aria-label="Sprite"></th><th><button type="button" data-act="sort" data-v="name">Name${arrow('name')}</button></th><th>Type</th><th>Abilities</th>${keys.map(k=>th(k,short[k])).join('')}${th('bst','Total')}</tr></thead><tbody>${list.map(p=>{const e=eff(p,g),st=statsAt(e,g);
    return `<tr><td class="mono mid muted">${pad(p.dex)}</td><td class="mid">${pokeTile(p,e,g,40)}</td><td class="mid name"><a href="#p-${esc(p.id)}">${esc(p.name)}</a>${changedTag(p)}</td><td class="mid">${chips(e.types)}</td><td class="mid">${g<3?'<span class="muted">—</span>':(slotText(e.abilitySlots).map(esc).join('<br>')||'<span class="muted">Not set</span>')}</td>${st.map(s=>`<td class="num mono mid">${dash(s[2])}</td>`).join('')}<td class="num mono mid name">${dash(total(e,g))}</td></tr>`}).join('')}</tbody></table></div>${pages<2?`<p class="hint">${count} shown</p>`:pager('bottom')}`;
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
    return `<tr><td class="name">${esc(a.name)}${changedTag(a)}</td><td class="flavor">${dash(e.flavor)}</td><td>${dash(e.effect)}</td><td>${u.map(p=>pokeLink(p.id)).join(', ')||'<span class="muted">None yet</span>'}</td><td class="mono">${ROMAN[a.debut||3]}</td>${editCell('edit-abilities',a.id)}</tr>`}).join('')}</tbody></table></div>`;
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
function effectPage(kind,title,sub,add){
  bodyFn=()=>effectBody(kind);
  const groups=[...new Set(rows('effects').filter(e=>e.kind===kind).map(e=>eff(e,UI.gen).group).filter(Boolean))].sort();
  return titleBar(title,sub,addBtn(add,'new-effect',`data-v="${kind}"`))+`<div class="toolbar">${search('Search')}<label class="ctl" style="flex:0 1 200px">Group<select id="grp" data-model="group"><option value="All">All groups</option>${groups.map(c=>`<option${UI.group===c?' selected':''}>${esc(c)}</option>`).join('')}</select></label>${viewToggle('All effects')}</div><div id="body" style="display:flex;flex-direction:column;gap:18px"></div>`;
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
    ${UI.editChart?`<button type="button" class="btn small danger" data-act="del-type" data-v="${esc(sel)}">Remove ${esc(sel)}</button>`:''}</section>
    <section class="card"><h2 style="font-size:22px">Changed in Gen ${ROMAN[g]}</h2>${notes.length?`<ul style="margin:0;padding-left:18px">${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:`<p class="muted" style="margin:0">${g===1?'This is the starting chart.':'Same as the previous generation.'}</p>`}</section></div></div>`;
}

function notThere(name,debut,back){return `<div class="empty"><p>${esc(name)} debuts in Gen ${ROMAN[debut]}, so it has no Gen ${ROMAN[UI.gen]} data.</p><div class="btns"><button type="button" class="btn primary" data-act="gen" data-v="${debut}">Go to Gen ${ROMAN[debut]}</button><a class="btn" href="${back}">Back</a></div></div>`}

// The Pokémon before and after this one in Dex number order, counting only those in the generation being viewed.
function dexNeighbours(id,g){
  const list=rows('pokemon').filter(p=>(p.debut||1)<=g).sort((a,b)=>(a.dex??1e9)-(b.dex??1e9));
  const i=list.findIndex(p=>p.id===id);
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
  const p={id,...raw},g=UI.gen;
  if((p.debut||1)>g)return notThere(p.name,p.debut,'#dex');
  const e=eff(p,g),st=statsAt(e,g),ts=typesAt(g),slots=e.abilitySlots||[];
  const mults={};
  if((e.types||[]).length)ts.forEach(a=>{mults[a]=e.types.reduce((m,d)=>m*(ts.includes(d)?cell(g,a,d):1),1)});
  const defs=[[4,'×4','Weak','var(--hot)','var(--on-data)'],[2,'×2','Weak','var(--hot)','var(--on-data)'],[.5,'×½','Resists','var(--cool)','var(--on-data)'],[.25,'×¼','Resists','var(--cooler)','var(--on-data)'],[0,'×0','Immune','var(--zero)','var(--on-zero)']];
  const match=defs.map(d=>{const t=ts.filter(a=>mults[a]===d[0]);return t.length?`<div class="match"><span class="mlabel" style="background:${d[3]};color:${d[4]}"><b>${d[1]}</b>${d[2]}</span><span class="chips">${t.map(chip).join('')}</span></div>`:''}).join('');
  const immune=[...new Set(slots.flat())].map(a=>({a,t:eff(S.abilities[a],g).immuneTo})).filter(x=>x.t).map(x=>`<p class="hint">With ${esc(label('abilities',x.a))}: immune to ${esc(x.t)}.</p>`).join('');
  const evo=family(p,g);
  const evoHtml=evo.length>1?`<div class="evo">${evo.map((lv,i)=>`${i?`<svg aria-hidden="true" width="34" height="14" viewBox="0 0 34 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 7h30M25 1l6 6-6 6"/></svg>`:''}<div class="stage">${lv.map(c=>{const m=S.pokemon[c],x=eff(m,g);return `<a class="evotile" href="#p-${esc(c)}"${c===id?' aria-current="true"':''}>${pokeTile(m,x,g,36)}<span>${esc(m.name)}${i&&x.evoMethod?`<small>${esc(x.evoMethod)}</small>`:''}</span></a>`}).join('')}</div>`).join('')}</div>`:'<p class="muted" style="margin:0">Does not evolve.</p>';
  const t=total(e,g);
  const breeding=g<2?'<p class="muted" style="margin:0">Breeding arrives in Gen II.</p>':(blank(e.eggGroups)&&e.eggCycles==null&&e.genderM===undefined&&!e.hatchesAs)?'<p class="muted" style="margin:0">Not set.</p>':`<dl class="defs"><div><dt>Egg groups</dt><dd>${dash((e.eggGroups||[]).join(', '))}</dd></div><div><dt>Egg cycles</dt><dd>${dash(e.eggCycles)}</dd></div><div><dt>Hatches as</dt><dd>${dash(e.hatchesAs)}</dd></div></dl><div style="margin-top:12px"><span class="muted" style="font-size:13px">Gender ratio</span>${e.genderM===null||e.genderM===undefined?'<div style="font-weight:600">Genderless</div>':genderBar(e.genderM)}</div>`;
  const hasAlt=slots.some(o=>o.length>1);
  const [prevP,nextP]=dexNeighbours(id,g);
  const step=(q,dir)=>q?`<a class="btn small" href="#p-${esc(q.id)}" data-nav="${dir}" aria-label="${dir==='prev'?'Previous':'Next'} Pokémon: ${esc(q.name)}"><span>${dir==='prev'?`← <span class="mono">${pad(q.dex)}</span> ${esc(q.name)}`:`${esc(q.name)} <span class="mono">${pad(q.dex)}</span> →`}</span></a>`:`<span class="btn small" aria-disabled="true">${dir==='prev'?'← First in Dex':'Last in Dex →'}</span>`;
  return `<div class="pnav"><a href="#dex" style="display:flex;align-items:center;min-height:44px;font-weight:600">Back to National Dex</a><nav class="btns" aria-label="Previous and next Pokémon">${step(prevP,'prev')}${step(nextP,'next')}</nav></div>
  <section class="hero">${pokeTile(p,e,g,132)}<div class="grow"><span class="mono">No. ${pad(p.dex)} · Debuted in Gen ${ROMAN[p.debut||1]} (${REGION[p.debut||1]})</span><h1>${esc(p.name)}</h1>${(e.types||[]).length?chips(e.types):'<span>No type set</span>'}</div>${canEdit?`<button type="button" class="btn" data-act="edit-pokemon" data-id="${esc(id)}">Edit Gen ${ROMAN[g]} data</button>`:''}</section>
  <section class="note" aria-label="Changes"><strong>Gen ${ROMAN[g]}:</strong>${pokeChanges(p,g).map(c=>`<span>${esc(c)}</span>`).join('')}</section>
  <div class="cols"><div class="col">
    <section class="card"><div style="display:flex;justify-content:space-between;gap:12px"><h2>Base stats</h2><span class="mono" style="font-weight:600">${t==null?'':'Total '+t}</span></div>${st.map(s=>`<div class="stat"><span>${s[1]}</span><span class="mono" style="text-align:right">${dash(s[2])}</span><span class="bar" aria-hidden="true"><i style="width:${Math.min((s[2]||0)/STAT_MAX*100,100).toFixed(1)}%"></i></span></div>`).join('')}</section>
    <section class="card"><h2>Vitals</h2>${hasVitals(e)?`<dl class="defs"><div><dt>Species</dt><dd>${dash(e.species)}</dd></div><div><dt>Height</dt><dd>${dash(heightText(e.height))}</dd></div><div><dt>Weight</dt><dd>${dash(weightText(e.weight))}</dd></div><div><dt>Growth rate</dt><dd>${dash(e.growthRate)}</dd></div></dl>`:'<p class="muted" style="margin:0">Not set.</p>'}</section>
    <section class="card"><h2>Evolution chain</h2>${evoHtml}</section>
  </div><div class="col">
    <section class="card"><h2>Abilities</h2>${g<3?'<p class="muted" style="margin:0">Abilities arrive in Gen III.</p>':slots.length?slots.map((o,i)=>`<div class="slot"><span class="muted">${SLOT_NAMES[i]}</span><span style="font-weight:600">${o.map(a=>`<a href="#abilities">${esc(label('abilities',a))}</a>`).join(' / ')}</span></div>`).join('')+(hasAlt?'<p class="hint" style="margin-top:8px">Abilities sharing a slot are switched outside battle.</p>':''):'<p class="muted" style="margin:0">Not set.</p>'}</section>
    <section class="card"><h2>Weaknesses and resistances</h2>${(e.types||[]).length?(match||'<p class="muted" style="margin:0">Neutral against every type.</p>'):'<p class="muted" style="margin:0">Set a type to see matchups.</p>'}${immune}</section>
    <section class="card"><h2>Breeding</h2>${breeding}</section>
  </div></div>
  ${movesetCard(id,g)}`;
}

function movesetCard(id,g){
  const set=movesetOf(id,g),btn=canEdit?`<button type="button" class="btn small" data-act="edit-moveset" data-id="${esc(id)}">Edit Gen ${ROMAN[g]} moveset</button>`:'';
  const row=x=>{const e=effMove(S.moves[x.m],g);return `<tr><td class="name mid"><a href="#m-${esc(x.m)}">${esc(label('moves',x.m))}</a></td><td class="mid">${e.type?chip(e.type):'—'}</td><td class="mid">${e.category?`<span class="cat" style="background:${CAT[e.category]||'var(--soft)'}">${esc(e.category)}</span>`:'—'}</td><td class="num mono mid">${dash(e.power)}</td><td class="num mono mid">${dash(e.accuracy)}</td><td class="num mono mid">${dash(e.pp)}</td><td class="mid">${dash(x.how)}</td></tr>`};
  return `<section class="card"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px 12px;margin-bottom:10px"><h2 style="margin:0">Moveset</h2>${btn}</div>${set.length?`<div class="box" style="border:0"><table style="min-width:640px"><thead><tr><th>Move</th><th>Type</th><th>Category</th><th class="num">Power</th><th class="num">Acc.</th><th class="num">PP</th><th>How it learns it</th></tr></thead><tbody>${set.map(row).join('')}</tbody></table></div>`:'<p class="muted" style="margin:0">No moves added yet.</p>'}</section>`;
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
  const list=rows('trainers').sort((a,b)=>a.name.localeCompare(b.name));
  return titleBar('Trainers','Prominent trainers and how their teams change across every encounter.',addBtn('Add trainer','new-trainer'))+
  (!loaded?loading():!list.length?emptyMsg('No trainers yet. Add your first one, then give them a blurb and an encounter with their team.','new-trainer','Add trainer'):
  `<div class="tcards">${list.map(t=>{const enc=t.encounters||[],gs=[...new Set(enc.map(e=>e.gen))].sort();return `<a class="tcard" href="#t-${esc(t.id)}">${trainerTile(t,64)}<div style="min-width:0"><div class="name" style="font-size:18px">${esc(t.name)}</div>${t.title?`<div class="muted">${esc(t.title)}</div>`:''}<div class="chips" style="margin-top:6px">${gs.map(g=>`<span class="pill">Gen ${ROMAN[g]}</span>`).join('')||'<span class="muted" style="font-size:13px">No encounters yet</span>'}</div></div></a>`}).join('')}</div>`);
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
  const line=(o,keys,keep)=>keys.filter(([k])=>keep(o?.[k])).map(([k])=>`${esc(o[k])} ${short[k]}`).join(' / ');
  const set=x=>x!=null&&x!=='';
  const dvs=gen<=2?line(m.dvs,DV_KEYS,set):'',evs=gen>=3?line(m.evs,EV_KEYS,x=>!!x):'',ivs=gen>=3?line(m.ivs,EV_KEYS,set):'';
  const slots=dexSlots(m.p,gen);
  const abil=gen>=3?chosenAbilities(m,gen).map((a,i)=>{const txt=a?label('abilities',a):slots[i]?slots[i].map(x=>label('abilities',x)).join(' / ')+' (not chosen)':'';return txt?`<dt>${SLOT_NAMES[i]}</dt><dd>${esc(txt)}</dd>`:''}).join(''):'';
  const moves=(m.moves||[]).filter(Boolean);
  return `<div class="mon"><div class="monhead">${sp?pokeTile(sp,e,gen,44):tile(name,null,null,44)}<div><div class="name">${pokeLink(m.p)||esc(name)}${m.level?` <span class="muted mono">Lv. ${esc(m.level)}</span>`:''}${isNew?' <span class="pill new">New</span>':''}</div>${(e.types||[]).length?chips(e.types):''}</div></div>
  <dl class="monmeta">${abil}${gen>=2&&m.item?`<dt>Item</dt><dd><span class="withicon">${itemIcon(m.item)}${esc(label('items',m.item))}</span></dd>`:''}${gen>=3&&m.nature?`<dt>Nature</dt><dd>${esc(m.nature)}</dd>`:''}${dvs?`<dt>DVs</dt><dd class="mono" style="font-size:13px">${dvs}</dd>`:''}${evs?`<dt>EVs</dt><dd class="mono" style="font-size:13px">${evs}</dd>`:''}${ivs?`<dt>IVs</dt><dd class="mono" style="font-size:13px">${ivs}</dd>`:''}</dl>
  ${moves.length?`<ul class="moves">${moves.map(x=>`<li>${moveLink(x)}</li>`).join('')}</ul>`:''}${m.notes?`<p class="hint">${esc(m.notes)}</p>`:''}</div>`;
}
function trainerPage(id){
  const raw=S.trainers[id];
  if(!raw)return loaded?emptyMsg('This trainer is not in your list.'):loading();
  const t={id,...raw},enc=(t.encounters||[]).map((e,i)=>({...e,i})).sort((a,b)=>a.gen-b.gen||a.i-b.i);
  const gs=[...new Set(enc.map(e=>e.gen))];
  const sections=gs.map(g=>`<h2 class="genhead">Gen ${ROMAN[g]} <span>${REGION[g]}</span></h2>${enc.filter(e=>e.gen===g).map(e=>{const pos=enc.indexOf(e),prev=pos?enc[pos-1]:null,prevSet=new Set((prev?.team||[]).map(m=>m.p));
    return `${e.story?`<div class="story"><p class="blurb">${esc(e.story)}</p></div>`:''}<article class="enc"><div class="enchead"><div><h3>${esc(e.label||'Battle')}</h3><p class="muted" style="margin:0">${[e.location,e.game].filter(Boolean).map(esc).join(' · ')||'Location not set'}</p></div>${canEdit?`<div class="btns"><button type="button" class="btn small" data-act="edit-enc" data-id="${esc(id)}" data-v="${e.i}">Edit</button><button type="button" class="btn small" data-act="copy-enc" data-id="${esc(id)}" data-v="${e.i}">Copy team to new encounter</button><button type="button" class="btn small danger" data-act="del-enc" data-id="${esc(id)}" data-v="${e.i}">Delete</button></div>`:''}</div>
    ${(e.team||[]).length?`<div class="teams">${e.team.map(m=>monCard(m,g,prev&&!prevSet.has(m.p))).join('')}</div>`:'<p class="muted" style="margin:0">No team added yet.</p>'}</article>`}).join('')}`).join('');
  return `<a href="#trainers" style="align-self:flex-start;display:flex;align-items:center;min-height:44px;font-weight:600">Back to Trainers</a>
  <section class="hero">${trainerTile(t,132)}<div class="grow">${t.title?`<span class="mono">${esc(t.title)}</span>`:''}<h1>${esc(t.name)}</h1></div>${canEdit?`<button type="button" class="btn" data-act="edit-trainer" data-id="${esc(id)}">Edit trainer</button>`:''}</section>
  ${t.blurb?`<section class="card"><p class="blurb">${esc(t.blurb)}</p></section>`:''}
  <div class="title"><h2 style="margin:0;font-family:var(--display);font-size:32px;text-transform:uppercase">Teams by generation</h2>${addBtn('Add encounter','new-enc',`data-id="${esc(id)}"`)}</div>
  ${sections||'<div class="empty"><p>No encounters yet. Add one with its generation, battle location and team.</p></div>'}
  ${t.epilogue?`<div class="story"><p class="blurb">${esc(t.epilogue)}</p></div>`:''}`;
}

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
const genSelect=(k,val,lab)=>`<label class="ctl">${esc(lab)}<select id="f-${k}" >${GENS.map(g=>`<option value="${g}"${g===val?' selected':''}>Gen ${ROMAN[g]} (${REGION[g]})</option>`).join('')}</select></label>`;
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
  abilities:{title:'ability',debut:3,fields:(d)=>area('flavor','Flavor text',d.flavor)+area('effect','Actual effect',d.effect)+select('immuneTo','Grants immunity to',d.immuneTo,allTypes(),'None'),read:()=>({flavor:v('flavor'),effect:v('effect'),immuneTo:v('immuneTo')})},
  items:{title:'item',debut:1,fields:(d)=>input('category','Category',d.category,{list:'dl-itemcats',ph:'Hold items'})+area('flavor','Flavor text',d.flavor)+area('effect','Actual effect',d.effect),read:()=>({category:v('category'),flavor:v('flavor'),effect:v('effect')})},
  moves:{title:'move',debut:1,del:'del-moves',fields:(d)=>`<div class="fgrid">${select('type','Type',d.type,allTypes(),'Choose')}${UI.gen<SPLIT_FROM?select('category','Category',d.category&&d.category!=='Status'?'Damaging':d.category,['Damaging','Status'],'Choose'):select('category','Category',d.category,Object.keys(CAT),'Choose')}${input('power','Power',d.power,{type:'number',min:0})}${input('accuracy','Accuracy',d.accuracy,{type:'number',min:0})}${input('pp','PP',d.pp,{type:'number',min:0})}</div>${UI.gen<SPLIT_FROM?`<p class="hint">Before Gen ${ROMAN[SPLIT_FROM]}, a damaging move is physical or special by its type: ${PHYSICAL_TYPES.join(', ')} are physical; ${SPECIAL_TYPES.join(', ')} are special.</p>`:''}<div class="fgrid"><label class="ctl">Target<select id="f-target"><option value="">Choose</option>${targetsAt(UI.gen).map(k=>`<option value="${k}"${d.target===k?' selected':''}>${TARGETS[k]}</option>`).join('')}</select></label>${input('priority','Priority',d.priority,{type:'number',ph:'0'})}${UI.gen>=CONTACT_FROM?`<label class="ctl">Makes contact<select id="f-contact"><option value="">Not set</option><option value="yes"${d.contact===true?' selected':''}>Yes</option><option value="no"${d.contact===false?' selected':''}>No</option></select></label>`:''}</div><p class="hint">${UI.gen<3?'The opposing side and the entire field are double-battle targets, so they start in Gen III. Contact also starts in Gen III.':'Priority is a whole number. Higher goes first, and blank counts as 0.'}</p>`+area('effect','Effect',d.effect)+area('flavor','Flavor text',d.flavor)+area('learners','Pokémon that learn it',(d.learners||[]).map(l=>label('pokemon',l.p)+(l.how?': '+l.how:'')).join('\n'),'One per line, like\nGengar: Level 33\nHaunter: TM30'),
    from3:['contact'],
    check:(p,from)=>p.category==='Damaging'?`Before Gen ${ROMAN[SPLIT_FROM]}, a damaging move is physical or special by its type. Choose a type first.`:DOUBLES_TARGETS.includes(p.target)&&from<3?`${TARGETS[p.target]} is a double-battle target, which starts in Gen III. Save starting from Gen III, or choose another target.`:p.priority!=null&&!Number.isInteger(p.priority)?'Priority must be a whole number, like 1, 0 or -3.':'',
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
  ${g>=3?`<fieldset><legend>Abilities</legend><div id="slots"></div><p class="hint">Up to three slots.${g>=4?' A slot can hold a second ability that is switched outside battle.':' Shared slots start in Gen IV.'} New names are added to Abilities.</p></fieldset>`:'<p class="hint">Abilities arrive in Gen III.</p>'}
  ${g>=2?`<fieldset><legend>Breeding</legend><div class="fgrid">${input('egg1','Egg group 1',(d.eggGroups||[])[0],{list:'dl-eggs'})}${input('egg2','Egg group 2',(d.eggGroups||[])[1],{list:'dl-eggs'})}${input('cycles','Egg cycles',d.eggCycles,{type:'number',min:0})}${input('hatch','Hatches as',d.hatchesAs,{list:'dl-pokemon'})}${input('male','Percent male',d.genderM,{type:'number',min:0,max:100,ph:'Blank = genderless'})}</div></fieldset>`:'<p class="hint">Breeding arrives in Gen II.</p>'}`;
}
function drawSlots(){
  const box=$('slots');if(!box)return;const g=F.g;
  box.innerHTML=F.slots.map((o,i)=>`<div class="slotrow" style="margin-bottom:8px"><span style="font-size:13px;font-weight:600">${SLOT_NAMES[i]}</span><div class="slotopts">${o.map((a,j)=>`<input id="sl-${i}-${j}" list="dl-abilities" aria-label="${SLOT_NAMES[i]} option ${j+1}" value="${esc(a)}" data-slot="${i}" data-opt="${j}">`).join('')}</div><div class="btns">${g>=4&&o.length<2?`<button type="button" class="btn small" data-act="slot-alt" data-v="${i}">Share slot</button>`:''}${o.length>1?`<button type="button" class="btn small" data-act="slot-unalt" data-v="${i}">Unshare</button>`:''}<button type="button" class="btn small" data-act="slot-del" data-v="${i}" aria-label="Remove ${SLOT_NAMES[i]}">Remove</button></div></div>`).join('')+(F.slots.length<3?`<button type="button" class="btn small" data-act="slot-add">Add ability slot</button>`:'');
}
function readSlots(){if(!$('slots'))return;F.slots=F.slots.map((o,i)=>o.map((_,j)=>$(`sl-${i}-${j}`)?.value??''))}
function openPokemon(id){
  const doc=id?S.pokemon[id]:null,d=id?eff(doc,UI.gen):{},g=id?UI.gen:UI.gen;
  F={col:'pokemon',id,g,slots:(d.abilitySlots||[]).map(o=>o.map(a=>label('abilities',a)))};
  const ts=allTypes();
  modal(`${id?'Edit':'Add'} Pokémon`,`<div class="formbody">${genNote(doc,doc?.debut||1)}<div class="fgrid">${input('name','Name',doc?.name)}${input('dex','Dex number',doc?.dex??nextDex(),{type:'number',min:1})}${genSelect('debut',doc?.debut??g,'Generation introduced')}</div><p class="hint" id="dex-share"${dexShare(doc?.dex??nextDex(),id)?'':' hidden'}>${esc(dexShare(doc?.dex??nextDex(),id))}</p>
  <div class="fgrid">${select('t1','Type 1',(d.types||[])[0],ts,'Choose')}${select('t2','Type 2',(d.types||[])[1],ts,'None')}${input('evofrom','Evolves from',d.evolvesFrom?label('pokemon',d.evolvesFrom):'',{list:'dl-pokemon'})}${input('evomethod','Evolution method',d.evoMethod,{ph:'Level 25'})}</div>
  <fieldset><legend>Vitals</legend><div class="fgrid">${input('species','Species',d.species,{ph:'Seed Pokémon'})}${input('height','Height (m)',d.height,{type:'number',min:0,step:'0.1',ph:'0.7'})}${input('weight','Weight (kg)',d.weight,{type:'number',min:0,step:'0.1',ph:'6.9'})}${input('growth','Growth rate',d.growthRate,{list:'dl-growth'})}</div><datalist id="dl-growth">${[...new Set([...GROWTH,...rows('pokemon').flatMap(p=>GENS.map(x=>p.gens?.[x]?.growthRate))].filter(Boolean))].map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist></fieldset>
  <div id="dyn" style="display:flex;flex-direction:column;gap:14px">${pokeDyn(g,d)}</div>
  <div class="fgrid">${input('art','PokéAPI sprite number',doc?.art??'',{type:'number',min:0,max:493,ph:'Blank uses the Dex number'})}<label class="ctl">Your own sprite (replaces PokéAPI art)<input id="f-sprite" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></label></div><p class="hint">Blank uses the Dex number, up to 493. Enter 0 for no PokéAPI art, or another number to borrow that Pokémon's sprites.</p></div>${foot(id,'del-record')}`,savePokemon);
  drawSlots();
}
async function savePokemon(){
  const {id}=F,name=v('name'),dex=n('dex'),debut=+v('debut'),g=id?UI.gen:debut;
  if(!name)return fail('Give it a name.');
  if(!dex)return fail('Give it a Dex number.');
  const dup=byName('pokemon',name);if(dup&&dup!==id)return fail(`${name} already exists.`);
  readSlots();
  const stats={};statsAt({},g).forEach(s=>{stats[s[0]]=n('st-'+s[0])});
  const patch={types:[v('t1'),v('t2')].filter(Boolean),stats:Object.values(stats).every(x=>x==null)?null:stats,evoMethod:v('evomethod'),species:v('species'),height:n('height'),weight:n('weight'),growthRate:v('growth')};
  const abPatch={},brPatch={};
  if(g>=3){const out=[];for(const o of F.slots){const ids=[];for(const a of o)if(a.trim())ids.push(await ensure('abilities',a,Math.max(g,3)));if(ids.length)out.push(ids)}abPatch.abilitySlots=out}
  if(g>=2){brPatch.eggGroups=[v('egg1'),v('egg2')].filter(Boolean);brPatch.eggCycles=n('cycles');brPatch.hatchesAs=v('hatch');brPatch.genderM=n('male')}
  const f=$('f-sprite')?.files?.[0];
  if(f){try{patch.sprite=await uploadSprite(f)}catch(e){return fail('That image could not be saved. Use a PNG, JPG, GIF or WebP under 25 MB.')}}
  const key=id||newId('pokemon',name);
  const evo=v('evofrom'),same=evo.toLowerCase()===name.toLowerCase();
  if(evo&&!same&&!byName('pokemon',evo))patch.evolvesFrom=await ensure('pokemon',evo,g,{dex:Math.max(nextDex(),dex+1)});
  else patch.evolvesFrom=evo&&!same?byName('pokemon',evo):'';
  const doc=id?clone(S.pokemon[id]):{gens:{}};doc.name=name;doc.dex=dex;doc.debut=debut;{const a=n('art');if(a===null)delete doc.art;else doc.art=a}
  const from=id?(+v('from')||g):g,alt=(abPatch.abilitySlots||[]).some(o=>o.length>1);
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
function openMoveset(pid){
  const g=UI.gen;
  F={col:'moveset',pid,g,ms:movesetOf(pid,g).map(x=>({m:label('moves',x.m),how:x.how}))};
  if(!F.ms.length)F.ms.push({m:'',how:''});
  modal(`${S.pokemon[pid].name}: Gen ${ROMAN[g]} moveset`,`<div class="formbody"><p class="hint">Each move here is also listed on that move's page under "Pokémon that learn it" for Gen ${ROMAN[g]}. New move names are added to Moves.</p><div id="ms" style="display:flex;flex-direction:column;gap:8px"></div></div>${foot(null)}`,saveMoveset);
  drawMoveset();
}
function drawMoveset(){
  $('ms').innerHTML=F.ms.map((x,i)=>`<div class="msrow">${input(`ms${i}-m`,'Move',x.m,{list:'dl-moves'})}${input(`ms${i}-how`,'How it learns it',x.how,{ph:'Level 12, TM30, Egg move'})}<button type="button" class="btn small" data-act="ms-del" data-v="${i}" aria-label="Remove move ${i+1}">Remove</button></div>`).join('')+'<div><button type="button" class="btn small" data-act="ms-add">Add move</button></div>';
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
  modal(`${id?'Edit':'Add'} trainer`,`<div class="formbody"><div class="fgrid">${input('name','Name',t.name)}${input('title','Title',t.title,{ph:'Cerulean City Gym Leader'})}</div>${area('blurb','Blurb',t.blurb)}${area('epilogue','Story after the last encounter',t.epilogue,'Optional. Shown at the end of the trainer page.')}<label class="ctl">Your own picture (PNG, JPG, GIF or WebP)<input id="f-sprite" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></label></div>${foot(id,'del-record')}`,saveTrainer);
}
async function saveTrainer(){
  const {id}=F,name=v('name');if(!name)return fail('Give the trainer a name.');
  const doc=id?clone(S.trainers[id]):{encounters:[]};doc.name=name;doc.title=v('title');doc.blurb=v('blurb');doc.epilogue=v('epilogue');
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
      <p class="hint">Filled in from ${esc(sp.name)}'s Gen ${ROMAN[gen]} abilities.${shared?' Two abilities share a slot, so choose the one this trainer’s Pokémon has.':''}</p>`;
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
  ${input(`m${i}-notes`,'Notes',m.notes)}<div><button type="button" class="btn small danger" data-act="mon-del" data-v="${i}">Remove from team</button></div></fieldset>`).join('')+(F.team.length<6?`<button type="button" class="btn" data-act="mon-add">Add Pokémon to team</button>`:'');
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
function openEncounter(tid,idx,from){
  const t=S.trainers[tid],e=idx!=null?t.encounters[idx]:(from||{});
  F={col:'enc',tid,idx,gen:e.gen??UI.gen,team:clone(e.team)||[]};
  modal(`${idx!=null?'Edit':'Add'} encounter`,`<div class="formbody"><div class="fgrid">${genSelect('gen',F.gen,'Generation')}${input('label','Encounter',from?'':e.label,{ph:'Gym battle'})}${input('location','Battle location',from?'':e.location)}${input('game','Game',e.game)}</div>${area('story','Story leading into this encounter',from?'':e.story,'Optional. Shown on the trainer page just above this encounter.')}<div id="team" style="display:flex;flex-direction:column;gap:12px"></div></div>${foot(null)}`,saveEncounter);
  drawTeam();
}
async function saveEncounter(){
  readTeam();
  const {tid,idx}=F,gen=+v('gen'),team=F.team.filter(m=>m.p);
  const bad=checkTeam(team,gen);if(bad)return fail(bad);
  // Dex abilities are saved per slot as well, so the record still reads correctly on its own.
  if(gen>=3)team.forEach(m=>{if(dexSlots(m.p,gen).length)m.abilities=chosenAbilities(m,gen)});
  const doc=clone(S.trainers[tid]);doc.encounters=doc.encounters||[];
  const enc={gen,label:v('label'),location:v('location'),game:v('game'),story:v('story'),team};
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
  page:(d)=>{UI.page+=+d.v;renderBody();const t=$('body');if(t&&t.getBoundingClientRect().top<0)t.scrollIntoView()},
  msort:(d)=>{if(UI.msort===d.v)UI.mdir=-UI.mdir;else{UI.msort=d.v;UI.mdir=['power','accuracy','pp'].includes(d.v)?-1:1}renderBody()},
  sort:(d)=>{UI.page=0;if(UI.sort===d.v)UI.dir=-UI.dir;else{UI.sort=d.v;UI.dir=(d.v==='dex'||d.v==='name')?1:-1}renderBody()},
  sel:(d)=>{UI.sel=d.v;render()},
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
  'new-enc':(d)=>openEncounter(d.id,null),
  'edit-enc':(d)=>openEncounter(d.id,+d.v),
  'copy-enc':(d)=>openEncounter(d.id,null,S.trainers[d.id].encounters[+d.v]),
  'del-enc':(d)=>confirmBox('Delete encounter','Delete this encounter and its team?','Delete',async()=>{const doc=clone(S.trainers[d.id]);doc.encounters.splice(+d.v,1);S.trainers[d.id]=doc;await put('trainers/'+d.id,doc)}),
  'del-record':(d)=>{const col=F.col,name=S[col][d.id].name;confirmBox(`Delete ${name}`,`Delete ${name} from every generation?`,'Delete',async()=>{delete S[col][d.id];await remove(col+'/'+d.id);if(UI.arg===d.id)location.hash=({pokemon:'dex',moves:'moves',trainers:'trainers'})[col]||UI.route})},
  'slot-add':()=>{readSlots();F.slots.push(['']);drawSlots()},
  'slot-del':(d)=>{readSlots();F.slots.splice(+d.v,1);drawSlots()},
  'slot-alt':(d)=>{readSlots();F.slots[+d.v].push('');drawSlots()},
  'slot-unalt':(d)=>{readSlots();F.slots[+d.v].length=1;drawSlots()},
  'mon-add':()=>{readTeam();F.team.push({p:''});drawTeam();const i=F.team.length-1;$(`f-m${i}-p`)?.focus()},
  'mon-del':(d)=>{readTeam();F.team.splice(+d.v,1);drawTeam()},
  'edit-moveset':(d)=>openMoveset(d.id),
  'ms-add':()=>{readMoveset();F.ms.push({m:'',how:''});drawMoveset();$(`f-ms${F.ms.length-1}-m`)?.focus()},
  'ms-del':(d)=>{readMoveset();F.ms.splice(+d.v,1);drawMoveset()}
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const f=ACT[b.dataset.act];if(f){e.preventDefault();f(b.dataset)}});
document.addEventListener('input',e=>{
  const ev=F?.col==='enc'&&e.target.id.match(/^f-m(\d+)-ev-/);
  if(ev){const i=+ev[1],h=$(`m${i}-evtotal`);if(h)h.textContent=evText(EV_KEYS.reduce((a,[k])=>a+(n(`m${i}-ev-${k}`)||0),0));return}
  if(e.target.id==='f-dex'&&F?.col==='pokemon'){const h=$('dex-share'),t=dexShare(n('dex'),F.id);if(h){h.textContent=t;h.hidden=!t}return}
  const m=e.target.dataset.model;if(!m)return;UI.page=0;if(m==='perPage')try{localStorage.setItem('perPage',e.target.value)}catch(x){}UI[m]=e.target.type==='checkbox'?e.target.checked:e.target.value;renderBody()});
document.addEventListener('change',e=>{
  if(e.target.id==='f-debut'&&F?.col==='pokemon'&&!F.id){readSlots();const g=+e.target.value;F.g=g;const keep={};
    statsAt({},g).forEach(s=>{const x=$('f-st-'+s[0]);if(x&&x.value!=='')keep[s[0]]=Number(x.value)});
    $('dyn').innerHTML=pokeDyn(g,{stats:keep});drawSlots()}
  if(F?.col==='enc'&&e.target.id==='f-gen'){readTeam();F.gen=+e.target.value;drawTeam();return}
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
function route(){
  const h=location.hash.slice(1)||'dex',m=h.match(/^([pmt])-(.+)$/),prev=UI.route;
  if(m){UI.route=m[1];UI.arg=m[2]}else{UI.route=PAGES[h]&&!['p','m','t'].includes(h)?h:'dex';UI.arg=null}
  if(!['dex','p'].includes(UI.route))UI.page=0;
  if(prev!==UI.route){UI.q='';UI.type='All';UI.cat='All';UI.group='All';UI.newOnly=false;UI.editChart=false}
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
    S.chart=(await get('config')).typechart||null;
  }catch(e){failed=true}
  loaded=true;render();
}
boot();
