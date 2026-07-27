(() => {
'use strict';

const DB_NAME='lexqcm_private_library_v1';
const STORE='pdfs';
let activeUrl=null;
let activeId=null;

const COURSES=[
  {
    id:'obligations-2026',
    title:'Protocoles — Droit des obligations 2026',
    provider:'Sauve ton CRFPA',
    pages:224,
    topic:'Contrats · preuve · responsabilité · quasi-contrats · régime général',
    color:'red',
    icon:'OB',
    note:'Méthodologie et protocoles de résolution en droit des obligations.'
  },
  {
    id:'responsabilites-2026',
    title:'Tableau récapitulatif — Responsabilités civiles',
    provider:'Sauve ton CRFPA',
    pages:1,
    topic:'Panorama des régimes de responsabilité',
    color:'orange',
    icon:'RC',
    note:'Fiche synthétique des fondements, conditions et exonérations.'
  },
  {
    id:'social-top14-2025',
    title:'Droit social — TOP 14 / Protocoles',
    provider:'Pré-Barreau',
    pages:41,
    topic:'Période d’essai · preuve · vie privée · inaptitude · syndicats…',
    color:'green',
    icon:'DS',
    note:'Support de révision ciblé sur les thèmes importants du droit social.'
  }
];

function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function formatSize(n){if(!Number.isFinite(n))return '—';if(n<1024*1024)return `${Math.max(1,Math.round(n/1024))} Ko`;return `${(n/1024/1024).toFixed(n>10*1024*1024?0:1)} Mo`}

function openDb(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})};
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error);
  });
}
async function getRecord(id){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);tx.oncomplete=()=>db.close()})}
async function getAll(){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);tx.oncomplete=()=>db.close()})}
async function putRecord(rec){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(rec);tx.oncomplete=()=>{db.close();res()};tx.onerror=()=>rej(tx.error)})}
async function delRecord(id){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>{db.close();res()};tx.onerror=()=>rej(tx.error)})}

function cleanupUrl(){if(activeUrl){URL.revokeObjectURL(activeUrl);activeUrl=null;activeId=null}}

function ensureUi(){
  const main=document.querySelector('.main');
  if(main&&!document.getElementById('reader')){
    const section=document.createElement('section');
    section.id='reader';section.className='view hidden';
    main.appendChild(section);
  }
  const nav=document.getElementById('nav');
  if(nav&&!nav.querySelector('[data-view="reader"]')){
    const btn=document.createElement('button');
    btn.type='button';btn.dataset.view='reader';
    btn.innerHTML='<span>08</span>Cours PDF';
    const quality=nav.querySelector('[data-view="quality"]');
    nav.insertBefore(btn,quality||null);
    const q=nav.querySelector('[data-view="quality"] span'); if(q)q.textContent='09';
    const s=nav.querySelector('[data-view="settings"] span'); if(s)s.textContent='10';
    btn.addEventListener('click',()=>window.Lex?.navigate?.('reader'));
  }
}

function hideAllViews(){document.querySelectorAll('.view').forEach(x=>x.classList.add('hidden'));document.getElementById('reader')?.classList.remove('hidden');document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view==='reader'));document.querySelector('.sidebar')?.classList.remove('open');document.getElementById('sidebarBackdrop')?.classList.remove('open');document.body.style.overflow='';window.scrollTo({top:0,behavior:'instant'})}

async function renderLibrary(){
  cleanupUrl();
  const el=document.getElementById('reader');if(!el)return;
  const records=await getAll().catch(()=>[]);
  const byId=new Map(records.map(r=>[r.id,r]));
  const courseCards=COURSES.map(c=>{
    const r=byId.get(c.id);
    return `<article class="reader-card ${c.color}">
      <div class="reader-card-top"><div class="reader-icon">${escapeHtml(c.icon)}</div>${r?'<span class="reader-local-badge">Disponible hors ligne</span>':'<span class="tag">À importer</span>'}</div>
      <h3>${escapeHtml(c.title)}</h3>
      <div class="reader-meta"><span class="tag brand">${escapeHtml(c.provider)}</span><span class="tag">${c.pages} page${c.pages>1?'s':''}</span></div>
      <p>${escapeHtml(c.note)}</p><p><b>${escapeHtml(c.topic)}</b></p>
      <div class="reader-status">${r?`<span>${escapeHtml(r.name)} · ${formatSize(r.size)}</span><button class="reader-delete" onclick="LexReader.remove('${c.id}')">Supprimer de cet appareil</button>`:'<span>Le PDF reste privé et n’est jamais envoyé sur GitHub.</span>'}</div>
      <div class="reader-actions">${r?`<button class="btn brand" onclick="LexReader.open('${c.id}')">Lire le cours</button><label class="btn ghost">Remplacer<input class="reader-hidden-input" type="file" accept="application/pdf,.pdf" onchange="LexReader.import(event,'${c.id}')"></label>`:`<label class="btn brand">Importer ce PDF<input class="reader-hidden-input" type="file" accept="application/pdf,.pdf" onchange="LexReader.import(event,'${c.id}')"></label>`}</div>
    </article>`
  }).join('');

  const extras=records.filter(r=>!COURSES.some(c=>c.id===r.id));
  const extraHtml=extras.length?`<div class="case-section-head"><div><h2>Mes autres PDF</h2><p>Documents ajoutés uniquement sur cet appareil.</p></div></div><div class="reader-grid">${extras.map(r=>`<article class="reader-card"><div class="reader-card-top"><div class="reader-icon">PDF</div><span class="reader-local-badge">Local</span></div><h3>${escapeHtml(r.name)}</h3><p>${formatSize(r.size)} · ajouté le ${new Date(r.addedAt).toLocaleDateString('fr-FR')}</p><div class="reader-status"><span>Document personnel</span><button class="reader-delete" onclick="LexReader.remove('${escapeHtml(r.id)}')">Supprimer</button></div><div class="reader-actions"><button class="btn brand" onclick="LexReader.open('${escapeHtml(r.id)}')">Lire</button></div></article>`).join('')}</div>`:'';

  el.innerHTML=`<div class="reader-shell"><div class="top"><div><h1>Cours & PDF</h1><p>Ta bibliothèque de cours privée, directement dans LexQCM. Une fois importés, les PDF restent sur cet appareil et peuvent être lus hors connexion.</p></div><span class="reader-local-badge">Stockage local</span></div>
    <div class="reader-privacy"><div>🔒</div><div><b>Bibliothèque privée</b>Ces documents ne sont pas publiés avec le site. LexQCM les conserve dans le stockage local de ton navigateur/PWA, ce qui évite de diffuser les supports protégés.</div></div>
    <div class="reader-grid">${courseCards}</div>
    <div class="reader-import-all"><h3>Ajouter un autre PDF</h3><p class="small">Tu peux aussi garder dans LexQCM n’importe quel autre support personnel.</p><label class="btn light">Choisir un PDF<input class="reader-hidden-input" type="file" accept="application/pdf,.pdf" onchange="LexReader.importExtra(event)"></label></div>${extraHtml}</div>`;
}

async function importPdf(ev,id){
  const file=ev.target.files?.[0];ev.target.value='';if(!file)return;
  if(file.type && file.type!=='application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))return alert('Choisis un fichier PDF.');
  try{
    if(navigator.storage?.persist) await navigator.storage.persist().catch(()=>false);
    await putRecord({id,name:file.name,size:file.size,type:'application/pdf',lastModified:file.lastModified,addedAt:new Date().toISOString(),lastPage:1,blob:file});
    await renderLibrary();
  }catch(e){console.error(e);alert('Impossible d’enregistrer ce PDF sur cet appareil. Vérifie l’espace de stockage disponible.');}
}
async function importExtra(ev){
  const file=ev.target.files?.[0];ev.target.value='';if(!file)return;
  const id=`extra-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  return importPdf({target:{files:[file],value:''}},id);
}

async function openPdf(id,page){
  const r=await getRecord(id);if(!r)return alert('Ce PDF n’est pas encore enregistré sur cet appareil.');
  cleanupUrl();activeId=id;activeUrl=URL.createObjectURL(r.blob);
  const c=COURSES.find(x=>x.id===id);
  const title=c?.title||r.name;
  const p=Math.max(1,Number(page||r.lastPage||1));
  const el=document.getElementById('reader');
  el.innerHTML=`<div class="reader-shell reader-viewer"><div class="reader-toolbar"><button class="btn ghost" onclick="LexReader.library()">← Bibliothèque</button><div class="reader-toolbar-title"><b>${escapeHtml(title)}</b><span>${escapeHtml(r.name)} · ${formatSize(r.size)} · privé sur cet appareil</span></div><div class="reader-pagebox"><label for="pdfPage" class="small">Page</label><input id="pdfPage" inputmode="numeric" type="number" min="1" value="${p}"><button class="btn light" onclick="LexReader.goPage()">Aller</button></div><button class="btn brand" onclick="LexReader.fullscreen()">Plein écran</button></div><div class="pdf-frame-wrap"><iframe id="pdfFrame" class="pdf-frame" title="${escapeHtml(title)}" src="${activeUrl}#page=${p}&view=FitH"><div class="reader-fallback">Le lecteur PDF intégré n’est pas disponible sur ce navigateur.</div></iframe></div><div class="reader-note">Sur certains téléphones, le bouton « Plein écran » offre un meilleur confort de lecture que l’aperçu intégré.</div></div>`;
  hideAllViews();
}
async function goPage(){if(!activeId)return;const n=Math.max(1,Number(document.getElementById('pdfPage')?.value||1));const r=await getRecord(activeId);if(r){r.lastPage=n;await putRecord(r)}const frame=document.getElementById('pdfFrame');if(frame&&activeUrl)frame.src=`${activeUrl}#page=${n}&view=FitH`}
function fullscreen(){if(!activeUrl)return;window.open(activeUrl,'_blank','noopener')}
async function removePdf(id){if(!confirm('Supprimer ce PDF de cet appareil ? Le fichier original ne sera pas supprimé.'))return;cleanupUrl();await delRecord(id);await renderLibrary()}

function openReaderView(){ensureUi();hideAllViews();renderLibrary()}

function hookNavigation(){
  if(!window.Lex||window.Lex.__readerHooked)return;
  const original=window.Lex.navigate;
  window.Lex.navigate=function(view){if(view==='reader')return openReaderView();cleanupUrl();return original(view)};
  window.Lex.__readerHooked=true;
}

window.LexReader={library:()=>{hideAllViews();renderLibrary()},open:openPdf,goPage,fullscreen,remove:removePdf,import:importPdf,importExtra};

function init(){ensureUi();hookNavigation();document.querySelectorAll('#nav button:not([data-view="reader"])').forEach(b=>b.addEventListener('click',cleanupUrl))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));else setTimeout(init,0);
})();
