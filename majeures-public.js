(() => {
'use strict';

const GUIDES = [
  {
    id:'maj-obligations',
    title:'Majeures types - Droit des obligations',
    subtitle:'18 constructions modulaires',
    pages:20,
    icon:'OB',
    color:'red',
    url:'./public-majeures/Majeures_types_Droit_des_obligations_LexQCM.pdf',
    description:'Pourparlers, formation et validité du contrat, inexécution, preuve, responsabilités civiles et régime général des obligations.'
  },
  {
    id:'maj-social',
    title:'Majeures types - Droit social',
    subtitle:'17 constructions modulaires',
    pages:19,
    icon:'DS',
    color:'green',
    url:'./public-majeures/Majeures_types_Droit_social_LexQCM.pdf',
    description:'Contrat de travail, période d’essai, temps de travail, harcèlement, licenciement, inaptitude, AT/MP et relations collectives.'
  },
  {
    id:'maj-procedure',
    title:'Majeures types - Procédure civile',
    subtitle:'18 constructions modulaires',
    pages:20,
    icon:'PC',
    color:'',
    url:'./public-majeures/Majeures_types_Procedure_civile_LexQCM.pdf',
    description:'Action, compétence, nullités, assignation, contradiction, mise en état, preuve, appel et modes amiables.'
  }
];

let activeGuide = null;

function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

function ensureUi(){
  const main=document.querySelector('.main');
  if(main&&!document.getElementById('majeuresPublic')){
    const section=document.createElement('section');
    section.id='majeuresPublic';section.className='view hidden';
    main.appendChild(section);
  }

  const nav=document.getElementById('nav');
  if(nav&&!nav.querySelector('[data-view="majeures-public"]')){
    const btn=document.createElement('button');
    btn.type='button';btn.dataset.view='majeures-public';
    btn.innerHTML='<span>09</span>Majeures types';
    const quality=nav.querySelector('[data-view="quality"]');
    nav.insertBefore(btn,quality||null);
    const q=nav.querySelector('[data-view="quality"] span'); if(q)q.textContent='10';
    const s=nav.querySelector('[data-view="settings"] span'); if(s)s.textContent='11';
    btn.addEventListener('click',()=>window.Lex?.navigate?.('majeures-public'));
  }
}

function showView(){
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  document.getElementById('majeuresPublic')?.classList.remove('hidden');
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view==='majeures-public'));
  document.querySelector('.sidebar')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
  document.body.style.overflow='';
  window.scrollTo({top:0,behavior:'instant'});
}

function card(g){
  return `<article class="reader-card ${g.color}">
    <div class="reader-card-top"><div class="reader-icon">${esc(g.icon)}</div><span class="tag good">Public LexQCM</span></div>
    <h3>${esc(g.title)}</h3>
    <div class="reader-meta"><span class="tag brand">${esc(g.subtitle)}</span><span class="tag">${g.pages} pages</span></div>
    <p>${esc(g.description)}</p>
    <div class="reader-status"><span>Accessible à tous les utilisateurs du site</span><span class="reader-local-badge">PDF intégré</span></div>
    <div class="reader-actions"><button class="btn brand" onclick="LexMajeures.open('${g.id}')">Lire</button><a class="btn ghost" href="${g.url}" download>Télécharger</a></div>
  </article>`;
}

function renderLibrary(){
  activeGuide=null;
  const el=document.getElementById('majeuresPublic'); if(!el)return;
  el.innerHTML=`<div class="reader-shell">
    <div class="top"><div><h1>Majeures types</h1><p>Des constructions de majeure prêtes à adapter au cas pratique, rédigées pour LexQCM à partir des fascicules 2025.</p></div><span class="tag good">Bibliothèque publique</span></div>
    <div class="alert info"><b>Comment les utiliser :</b> ne récite jamais toute la fiche. Sélectionne uniquement les règles utiles au problème posé, puis développe ta mineure à partir des faits du sujet.</div>
    <div class="reader-grid">${GUIDES.map(card).join('')}</div>
    <div class="reader-import-all"><h3>Une base commune pour tous</h3><p class="small">Contrairement aux PDF privés que chacun importe dans « Cours PDF », ces trois fascicules appartiennent directement à LexQCM et sont accessibles à tous les utilisateurs.</p></div>
  </div>`;
  showView();
}

function openGuide(id,page=1){
  const g=GUIDES.find(x=>x.id===id); if(!g)return;
  activeGuide=g;
  const p=Math.max(1,Math.min(g.pages,Number(page)||1));
  const el=document.getElementById('majeuresPublic');
  el.innerHTML=`<div class="reader-shell reader-viewer">
    <div class="reader-toolbar">
      <button class="btn ghost" onclick="LexMajeures.library()">← Majeures types</button>
      <div class="reader-toolbar-title"><b>${esc(g.title)}</b><span>${esc(g.subtitle)} · ${g.pages} pages · public LexQCM</span></div>
      <div class="reader-pagebox"><label for="majPage" class="small">Page</label><input id="majPage" inputmode="numeric" type="number" min="1" max="${g.pages}" value="${p}"><button class="btn light" onclick="LexMajeures.goPage()">Aller</button></div>
      <a class="btn ghost" href="${g.url}" download>Télécharger</a>
      <button class="btn brand" onclick="LexMajeures.fullscreen()">Plein écran</button>
    </div>
    <div class="pdf-frame-wrap"><iframe id="majFrame" class="pdf-frame" title="${esc(g.title)}" src="${g.url}#page=${p}&view=FitH"></iframe></div>
    <div class="reader-note">Ces fascicules sont intégrés au site : aucun import personnel n’est nécessaire.</div>
  </div>`;
  showView();
}

function goPage(){
  if(!activeGuide)return;
  const input=document.getElementById('majPage');
  const p=Math.max(1,Math.min(activeGuide.pages,Number(input?.value)||1));
  if(input)input.value=p;
  const frame=document.getElementById('majFrame');
  if(frame)frame.src=`${activeGuide.url}#page=${p}&view=FitH`;
}
function fullscreen(){if(activeGuide)window.open(`${activeGuide.url}#page=${document.getElementById('majPage')?.value||1}`,'_blank','noopener')}

function hookNavigation(){
  if(!window.Lex||window.Lex.__majeuresHooked)return;
  const original=window.Lex.navigate;
  window.Lex.navigate=function(view){
    if(view==='majeures-public')return renderLibrary();
    activeGuide=null;
    return original(view);
  };
  window.Lex.__majeuresHooked=true;
}

window.LexMajeures={library:renderLibrary,open:openGuide,goPage,fullscreen};
function init(){ensureUi();hookNavigation()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,20));else setTimeout(init,20);
})();
