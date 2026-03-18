function renderPagination(page,total){
  let el=document.getElementById('pagination-bar');
  if(!el){
    el=document.createElement('div');el.id='pagination-bar';
    el.style.cssText='display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border-top:1px solid var(--border);background:var(--bg2);flex-shrink:0';
    document.getElementById('view-leads').appendChild(el);
  }
  if(total<=1){el.style.display='none';return;}
  el.style.display='flex';
  const pages=[];
  if(total<=7){for(let i=1;i<=total;i++)pages.push(i);}
  else{
    pages.push(1);
    if(page>3)pages.push('...');
    for(let i=Math.max(2,page-1);i<=Math.min(total-1,page+1);i++)pages.push(i);
    if(page<total-2)pages.push('...');
    pages.push(total);
  }
  el.innerHTML=`
    <button onclick="goPage(${page-1})" ${page<=1?'disabled':''} style="background:none;border:1px solid var(--border);border-radius:6px;padding:5px 10px;color:var(--text2);cursor:pointer;font-size:12px;${page<=1?'opacity:.4':''}">→</button>
    ${pages.map(p=>p==='...'
      ?`<span style="color:var(--text3);padding:0 4px">...</span>`
      :`<button onclick="goPage(${p})" style="background:${p===page?'var(--accent)':'none'};color:${p===page?'var(--at)':'var(--text2)'};border:1px solid ${p===page?'var(--accent)':'var(--border)'};border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;font-weight:${p===page?'700':'400'}">${p}</button>`
    ).join('')}
    <button onclick="goPage(${page+1})" ${page>=total?'disabled':''} style="background:none;border:1px solid var(--border);border-radius:6px;padding:5px 10px;color:var(--text2);cursor:pointer;font-size:12px;${page>=total?'opacity:.4':''}">←</button>`;
}

function goPage(p){
  const total=Math.ceil(getFiltered().length/PAGE_SIZE)||1;
  currentPage=Math.max(1,Math.min(p,total));
  renderTable();
  document.querySelector('.main-area').scrollTop=0;
}

const HEB_MONTHS=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const STATUSES=['ליד חדש','ביקש פרטים נוספים בוואטסאפ','פולואפ','לא רלוונטי','נמכר'];

let state={leads:[],sortField:'date',sortDir:-1,editingId:null,nextId:1,budgets:{},colMap:null};
const PAGE_SIZE=50;
let currentPage=1;
let selectedMonth='all';

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  const saved=localStorage.getItem('chiquita_session');
  if(saved) loadCRM();
  else showLogin();
});

function showLogin(){
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('crm-screen').style.display='none';
}

function hideLo(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('crm-screen').style.display='flex';
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function doLogin(){
  const u=document.getElementById('login-username').value.trim();
  const p=document.getElementById('login-password').value;
  document.getElementById('login-error').style.display='none';
  const ok=USERS.some(x=>x.u.toLowerCase()===u.toLowerCase()&&String(x.p)===String(p));
  if(!ok){document.getElementById('login-error').style.display='block';return;}
  localStorage.setItem('chiquita_session','1');
  loadCRM();
}

function doLogout(){
  localStorage.removeItem('chiquita_session');
  showLogin();
  document.getElementById('login-password').value='';
}

function togglePassVis(){
  const inp=document.getElementById('login-password');
  const btn=document.getElementById('pass-eye');
  inp.type=inp.type==='password'?'text':'password';
  btn.textContent=inp.type==='password'?'👁':'🙈';
}

// ── LOAD CRM ──────────────────────────────────────────────────────────────
async function loadCRM(){
  hideLo();
  document.getElementById('s-client-name').textContent=CHIQUITA_CONFIG.name;
  setSyncStatus('טוען...','saving');
  try{
    await fetchFromSheet();
    const b=await fetchBudgets();state.budgets=b;
    buildMonthFilter();renderTable();renderSidebar();updateBudgetInput();
    setSyncStatus('נטען ✓','success');startAutoSync();
  }catch(e){setSyncStatus('שגיאה: '+e.message,'error');showToast('שגיאה: '+e.message,'error');}
}

// ── BUDGET ────────────────────────────────────────────────────────────────
async function fetchBudgets(){
  try{
    const res=await fetch(APPS_SCRIPT_URL+'?action=getBudgets&clientId=chiquita');
    const d=await res.json();return d.budgets||{};
  }catch{return{};}
}
async function saveBudget(month,budget){
  await fetch(APPS_SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'saveBudget',clientId:'chiquita',month,budget})});
}
function getBudgetKey(){return selectedMonth==='all'?'all':selectedMonth;}
function getCurrentBudget(){return parseFloat(state.budgets[getBudgetKey()])||0;}

async function onBudgetChange(){
  const val=parseFloat(document.getElementById('budget').value)||0;
  const key=getBudgetKey();
  state.budgets[key]=val;
  renderFinance();renderAnalytics();
  try{await saveBudget(key,val);}catch{}
}

function updateBudgetInput(){
  const inp=document.getElementById('budget');if(!inp)return;
  inp.value=getCurrentBudget()||'';
  const key=getBudgetKey();
  let lbl='תקציב קמפיין (₪)';
  if(key!=='all'){const[y,mo]=key.split('-');lbl='תקציב '+HEB_MONTHS[parseInt(mo)-1]+' '+y+' (₪)';}
  const lel=document.getElementById('budget-label');if(lel)lel.textContent=lbl;
}

// ── DATE ──────────────────────────────────────────────────────────────────
function parseDate(raw){
  if(!raw)return'';
  const s=String(raw).trim();
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(s))return s;
  if(s.includes('T')){
    const d=new Date(s);
    if(!isNaN(d)){
      return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jerusalem',day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
    }
  }
  const isoM=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(isoM)return`${isoM[3]}/${isoM[2]}/${isoM[1]}`;
  const n=parseFloat(s);
  if(!isNaN(n)&&n>1000){
    const d=new Date((n-25569)*86400*1000+43200000);
    return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jerusalem',day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
  }
  return s;
}

// ── FETCH ─────────────────────────────────────────────────────────────────
async function fetchFromSheet(){
  const url=APPS_SCRIPT_URL+'?action=read&sheetId='+encodeURIComponent(CHIQUITA_CONFIG.sheetId)+'&tab='+encodeURIComponent(CHIQUITA_CONFIG.sheetTab);
  const res=await fetch(url);if(!res.ok)throw new Error('HTTP '+res.status);
  const data=await res.json();if(data.status==='error')throw new Error(data.message);
  const rows=data.values||[];if(rows.length<1){state.leads=[];return;}
  // Columns: A=date,B=name,C=phone,D=status,E=location,F=notes,G=amount,H=howbought
  const col={date:0,name:1,phone:2,status:3,campaign:4,notes:5,income:6,ad:7};
  state.colMap=col;state.leads=[];state.nextId=1;
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    const name=String(r[col.name]||'').trim();if(!name)continue;
    // Clean phone - remove p:+972 prefix
    let phone=String(r[col.phone]||'');
    if(phone.startsWith('p:+972'))phone='0'+phone.slice(6);
    else if(phone.startsWith('+972'))phone='0'+phone.slice(4);
    state.leads.push({
      id:state.nextId++,rowIndex:i+1,
      date:parseDate(String(r[col.date]||'')),
      name,phone,
      status:String(r[col.status]||''),
      notes:String(r[col.notes]||''),
      income:String(r[col.income]||''),
      campaign:String(r[col.campaign]||''),
      ad:String(r[col.ad]||''),
      platform:'manual'
    });
  }
}

// ── WRITE ─────────────────────────────────────────────────────────────────
function leadToRow(l){
  // A=date,B=name,C=phone,D=status,E=location,F=notes,G=amount,H=howbought
  return[l.date,l.name,l.phone,l.status,l.campaign,l.notes,l.income,l.ad];
}
async function scriptPost(payload){
  await fetch(APPS_SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...payload,sheetId:CHIQUITA_CONFIG.sheetId,sheetTab:CHIQUITA_CONFIG.sheetTab})});
  await sleep(1400);
}
async function appendToSheet(lead){await scriptPost({action:'append',row:leadToRow(lead)});}
async function updateRowInSheet(lead){if(!lead.rowIndex){await appendToSheet(lead);return;}await scriptPost({action:'update',rowIndex:lead.rowIndex,row:leadToRow(lead)});}
async function deleteRowInSheet(lead){if(!lead.rowIndex)return;await scriptPost({action:'clear',rowIndex:lead.rowIndex});}

// ── AUTO SYNC ──────────────────────────────────────────────────────────────
let autoSyncInterval=null;
function startAutoSync(){
  if(autoSyncInterval)clearInterval(autoSyncInterval);
  autoSyncInterval=setInterval(async()=>{
    const ie=document.getElementById('inline-edit-modal');
    const mo=document.getElementById('modal-overlay');
    if(!ie.classList.contains('open')&&!mo.classList.contains('open')){
      try{await fetchFromSheet();buildMonthFilter();renderTable();renderSidebar();setSyncStatus('עודכן '+new Date().toLocaleTimeString('he-IL'),'success');}catch{}
    }
  },120000);
}
function setSyncStatus(msg,type){const el=document.getElementById('sync-status');if(el){el.textContent=msg;el.className='sync-status '+(type||'');}}

// ── TABS ───────────────────────────────────────────────────────────────────
function switchTab(tab,btn){
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));btn.classList.add('active');
  document.getElementById('view-leads').style.display=tab==='leads'?'flex':'none';
  document.getElementById('view-analytics').style.display=tab==='analytics'?'block':'none';
  document.getElementById('fin-section').style.display=(tab==='analytics'&&selectedMonth!=='all')?'block':'none';
  if(tab==='analytics'){renderFinance();renderAnalytics();}
}

// ── MONTH FILTER ───────────────────────────────────────────────────────────
function buildMonthFilter(){
  const months=new Set();
  state.leads.forEach(l=>{const p=(l.date||'').split('/');if(p.length===3)months.add(p[2]+'-'+p[1].padStart(2,'0'));});
  const sorted=[...months].sort().reverse();
  const sel=document.getElementById('month-filter');
  sel.innerHTML='<option value="all">כל הזמן</option>'+sorted.map(m=>{
    const[y,mo]=m.split('-');return`<option value="${m}">${HEB_MONTHS[parseInt(mo)-1]+' '+y}</option>`;
  }).join('');
  sel.value=selectedMonth;
}
function onMonthFilterChange(){currentPage=1;
  selectedMonth=document.getElementById('month-filter').value;
  updateBudgetInput();renderTable();renderSidebar();
  const analyticsOn=document.getElementById('view-analytics').style.display!=='none';
  const finSection=document.getElementById('fin-section');
  if(finSection&&analyticsOn)finSection.style.display=selectedMonth!=='all'?'block':'none';
  if(analyticsOn){renderFinance();renderAnalytics();}
}
function getFilteredByMonth(leads){
  if(selectedMonth==='all')return leads;
  const[y,mo]=selectedMonth.split('-');
  return leads.filter(l=>{const p=(l.date||'').split('/');return p.length===3&&p[2]===y&&p[1].padStart(2,'0')===mo;});
}

// ── SIDEBAR ────────────────────────────────────────────────────────────────
function renderSidebar(){
  const l=getFilteredByMonth(state.leads);
  const total=l.length,
    nw=l.filter(x=>x.status==='ליד חדש').length,
    ip=l.filter(x=>x.status==='פולואפ'||x.status==='ביקש פרטים נוספים בוואטסאפ').length,
    ir=l.filter(x=>x.status==='לא רלוונטי').length,
    reg=l.filter(x=>x.status==='נמכר').length;
  document.getElementById('s-stats').innerHTML=`
    <div class="s-stat"><span class="s-stat-label">סה"כ</span><span class="s-stat-val">${total}</span></div>
    <div class="s-stat"><span class="s-stat-label">ליד חדש</span><span class="s-stat-val blue">${nw}</span></div>
    <div class="s-stat"><span class="s-stat-label">בתהליך</span><span class="s-stat-val amber">${ip}</span></div>
    <div class="s-stat"><span class="s-stat-label">לא רלוונטי</span><span class="s-stat-val red">${ir}</span></div>
    <div class="s-stat"><span class="s-stat-label">נמכר</span><span class="s-stat-val green">${reg}</span></div>`;
}

// ── FINANCE ────────────────────────────────────────────────────────────────
function renderFinance(){
  const l=getFilteredByMonth(state.leads);
  const budget=getCurrentBudget();
  const total=l.length,reg=l.filter(x=>x.status==='נמכר').length;
  const costPerLead=total>0&&budget>0?Math.round(budget/total):0;
  const totalRev=l.filter(x=>x.income&&x.status==='נמכר').reduce((s,x)=>s+(parseFloat(x.income)||0),0);
  const avgDeal=reg>0?Math.round(totalRev/reg):0;
  const roas=budget>0?Math.round((totalRev/budget)*100)+'%':'—';
  const el=document.getElementById('fin-results');if(!el)return;
  el.innerHTML=`
    <div class="fin-row"><span class="fin-label">עלות לליד</span><span class="fin-val">₪${costPerLead.toLocaleString()}</span></div>
    <div class="fin-row"><span class="fin-label">ממוצע עסקה</span><span class="fin-val">₪${avgDeal.toLocaleString()}</span></div>
    <div class="fin-row"><span class="fin-label">סה"כ הכנסות</span><span class="fin-val">₪${totalRev.toLocaleString()}</span></div>
    <div class="fin-row"><span class="fin-label">החזר על השקעה</span><span class="fin-val">${roas}</span></div>`;
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────
function renderAnalytics(){
  const l=getFilteredByMonth(state.leads);
  const budget=getCurrentBudget();
  const total=l.length,reg=l.filter(x=>x.status==='נמכר').length;
  const conv=total>0?Math.round((reg/total)*100):0;
  const totalInc=l.filter(x=>x.income&&x.status==='נמכר').reduce((s,x)=>s+(parseFloat(x.income)||0),0);
  const avgInc=reg>0?Math.round(totalInc/reg):0;
  const costPerLead=total>0&&budget>0?Math.round(budget/total):0;
  document.getElementById('kpi-row').innerHTML=`
    ${kpiCard('סה"כ לידים',total,'','var(--blue)')}
    ${kpiCard('נמכרו',reg,reg+' מתוך '+total,'var(--green)')}
    ${kpiCard('המרה',conv+'%','','var(--accent)')}
    ${kpiCard('עלות לליד',costPerLead>0?'₪'+costPerLead:'—','','var(--amber)')}
    ${kpiCard('ממוצע עסקה',avgInc>0?'₪'+avgInc.toLocaleString():'—','','var(--green)')}`;
  const statuses=[{s:'ליד חדש',c:'#60a5fa'},{s:'ביקש פרטים נוספים בוואטסאפ',c:'#4ade80'},{s:'פולואפ',c:'#fbbf24'},{s:'לא רלוונטי',c:'#f87171'},{s:'נמכר',c:'#d4ff5c'}];
  document.getElementById('status-bars').innerHTML=statuses.map(({s,c})=>{
    const cnt=l.filter(x=>x.status===s).length;const pct=total>0?Math.round(cnt/total*100):0;
    const label=s==='ביקש פרטים נוספים בוואטסאפ'?'ביקש פרטים בווצאפ':s;
    return`<div class="bar-row"><div class="bar-label-row"><span style="color:var(--text2)">${label}</span><span style="color:${c};font-weight:600">${cnt} (${pct}%)</span></div><div class="bar-track"><div class="bar-fill" style="background:${c};width:${pct}%"></div></div></div>`;
  }).join('');
  const adMap={};l.filter(x=>x.status==='נמכר').forEach(x=>{if(x.ad)adMap[x.ad]=(adMap[x.ad]||0)+1;});
  const ads=Object.entries(adMap).sort((a,b)=>b[1]-a[1]).slice(0,8);const maxAd=ads[0]?ads[0][1]:1;
  document.getElementById('ad-bars').innerHTML=ads.length?ads.map(([ad,cnt])=>`<div class="bar-row"><div class="bar-label-row"><span style="color:var(--text2)">${ad}</span><span style="color:var(--amber);font-weight:600">${cnt}</span></div><div class="bar-track"><div class="bar-fill" style="background:var(--amber);width:${Math.round(cnt/maxAd*100)}%"></div></div></div>`).join(''):'<div style="color:var(--text3);font-size:12px">אין נתונים עדיין</div>';
}
function kpiCard(label,val,sub,color){return`<div class="kpi-card"><div class="kpi-label">${label}</div><div class="kpi-val" style="color:${color}">${val}</div>${sub?`<div class="kpi-sub">${sub}</div>`:''}</div>`;}

// ── TABLE ──────────────────────────────────────────────────────────────────
function getFiltered(){
  const q=(document.getElementById('search')?.value||'').toLowerCase();
  const st=document.getElementById('filter-status')?.value||'';
  return getFilteredByMonth(state.leads).filter(l=>{
    if(q&&!l.name.toLowerCase().includes(q)&&!l.phone.includes(q))return false;
    if(st&&l.status!==st)return false;return true;
  }).sort((a,b)=>{
    let av=a[state.sortField]||'',bv=b[state.sortField]||'';
    if(state.sortField==='date'){
      const toYMD=s=>{const p=s.split('/');return p.length===3?p[2]+p[1]+p[0]:s;};
      av=toYMD(av);bv=toYMD(bv);
    }
    return av>bv?state.sortDir:av<bv?-state.sortDir:0;
  });
}

function badgeClass(s){
  if(s==='ליד חדש')return'badge-new';
  if(s==='ביקש פרטים נוספים בוואטסאפ')return'badge-details';
  if(s==='פולואפ')return'badge-followup';
  if(s==='לא רלוונטי')return'badge-irrelevant';
  if(s==='נמכר')return'badge-registered';
  return'badge-new';
}
function badgeLabel(s){
  if(s==='ביקש פרטים נוספים בוואטסאפ')return'ביקש פרטים בווצאפ';
  return s;
}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function renderTable(){
  const allRows=getFiltered();
  // Reset to page 1 when filter changes
  const totalPages=Math.ceil(allRows.length/PAGE_SIZE)||1;
  if(currentPage>totalPages)currentPage=1;
  const start=(currentPage-1)*PAGE_SIZE;
  const rows=allRows.slice(start,start+PAGE_SIZE);
  const tbody=document.getElementById('table-body');
  const empty=document.getElementById('empty-state');
  const cards=document.getElementById('cards-body');
  // Row count shows filtered total
  const filtered=allRows.length;
  const total=getFilteredByMonth(state.leads).length;
  document.getElementById('row-count').textContent=`${filtered} לידים${totalPages>1?' · עמוד '+currentPage+' מתוך '+totalPages:''}`;
  if(!allRows.length){if(tbody)tbody.innerHTML='';if(empty)empty.style.display='flex';if(cards)cards.innerHTML='<div style="padding:3rem;text-align:center;color:var(--text3)">לא נמצאו לידים</div>';renderPagination(0,0);return;}
  if(empty)empty.style.display='none';
  renderPagination(currentPage,totalPages);
  if(tbody)tbody.innerHTML=rows.map(l=>{
    const isSold=l.status==='נמכר';
    const rowStyle=isSold?'background:rgba(74,222,128,0.06);border-right:3px solid rgba(74,222,128,0.5);':'border-right:3px solid transparent;';
    return`<tr onclick="openInlineEdit(${l.id})" style="cursor:pointer;${rowStyle}">
    <td class="date-cell">${l.date||'—'}</td>
    <td class="name-cell">${esc(l.name)}</td>
    <td class="phone-cell">${l.phone}</td>
    <td><span class="badge ${badgeClass(l.status)}">${esc(badgeLabel(l.status))}</span></td>
    <td><div class="tooltip-cell"><span class="cell-truncate">${esc(l.notes)||'—'}</span>${l.notes?`<div class="tooltip-box">${esc(l.notes)}</div>`:''}</div></td>
    <td class="income-cell">${isSold&&l.income?'₪'+esc(l.income):''}</td>
    <td><div class="tooltip-cell"><span class="cell-truncate">${esc(l.campaign)||'—'}</span>${l.campaign?`<div class="tooltip-box">${esc(l.campaign)}</div>`:''}</div></td>
    <td><div class="tooltip-cell"><span class="cell-truncate">${esc(l.ad)||'—'}</span>${l.ad?`<div class="tooltip-box">${esc(l.ad)}</div>`:''}</div></td>
    <td class="action-cell">
      <button class="btn-call" onclick="event.stopPropagation();callLead('${l.phone}')" title="התקשר">📞</button>
      <button class="btn-wa" onclick="event.stopPropagation();waLead('${l.phone}')" title="ווצאפ">💬</button>
    </td>
  </tr>`;}).join('');
  if(cards)cards.innerHTML=rows.map(l=>{
    const isSold=l.status==='נמכר';
    return`<div class="lead-card${isSold?' lead-card-reg':''}" onclick="openInlineEdit(${l.id})">
    <div class="lead-card-top"><div class="lead-card-name">${esc(l.name)}</div><div class="lead-card-date">${l.date||'—'}</div></div>
    <div class="lead-card-phone">${l.phone}</div>
    <div class="lead-card-row"><span class="badge ${badgeClass(l.status)}">${esc(badgeLabel(l.status))}</span>${isSold&&l.income?'<span style="color:var(--green);font-size:12px;font-family:monospace">₪'+esc(l.income)+'</span>':''}</div>
    ${l.notes?'<div style="font-size:12px;color:var(--text2);margin-top:6px">'+esc(l.notes)+'</div>':''}
    <div style="display:flex;gap:6px;margin-top:10px">
      <button class="lead-card-edit" style="flex:2" onclick="event.stopPropagation();openInlineEdit(${l.id})">ערוך ←</button>
      <button class="btn-call-card" onclick="event.stopPropagation();callLead('${l.phone}')">📞</button>
      <button class="btn-wa-card" onclick="event.stopPropagation();waLead('${l.phone}')">💬</button>
    </div>
  </div>`;}).join('');
}
function sortBy(f){if(state.sortField===f)state.sortDir*=-1;else{state.sortField=f;state.sortDir=1;}renderTable();}

// ── CALL / WHATSAPP ────────────────────────────────────────────────────────
function callLead(phone){window.location.href='tel:'+phone.replace(/[^0-9+]/g,'');}
function waLead(phone){
  let clean=phone.replace(/[^0-9]/g,'');
  if(clean.startsWith('0'))clean='972'+clean.slice(1);
  window.open('https://wa.me/'+clean,'_blank');
}

// ── INLINE EDIT ────────────────────────────────────────────────────────────
function openInlineEdit(id){
  const l=state.leads.find(x=>x.id===id);if(!l)return;
  state.editingId=id;
  document.getElementById('ie-name-val').textContent=l.name;
  document.getElementById('ie-phone').value=l.phone;
  document.getElementById('ie-name').value=l.name;
  document.getElementById('ie-notes').value=l.notes;
  document.getElementById('ie-income').value=l.income;
  const ieAd=document.getElementById('ie-ad');if(ieAd)ieAd.value=l.ad||'';
  document.getElementById('ie-date').textContent=l.date||'—';
  document.getElementById('ie-campaign').textContent=l.campaign||'—';
  document.getElementById('ie-status-pills').innerHTML=STATUSES.map(s=>
    `<button class="pill ${l.status===s?'active':''}" data-val="${s}" onclick="iePickStatus(this)">${s==='ביקש פרטים נוספים בוואטסאפ'?'ביקש פרטים בווצאפ':s}</button>`).join('');
  const ig=document.getElementById('ie-income-group');
  if(ig)ig.style.display=l.status==='נמכר'?'block':'none';
  document.getElementById('inline-edit-modal').classList.add('open');
}
function iePickStatus(btn){
  document.querySelectorAll('#ie-status-pills .pill').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  const ig=document.getElementById('ie-income-group');
  if(ig)ig.style.display=btn.dataset.val==='נמכר'?'block':'none';
}
function ieGetStatus(){const a=document.querySelector('#ie-status-pills .pill.active');return a?a.dataset.val:'ליד חדש';}
function closeInlineEdit(){document.getElementById('inline-edit-modal').classList.remove('open');}

async function saveInlineEdit(){
  const l=state.leads.find(x=>x.id===state.editingId);if(!l)return;
  const status=ieGetStatus();
  const income=document.getElementById('ie-income').value.trim();
  if(status==='נמכר'&&!income){
    document.getElementById('ie-income').style.borderColor='var(--red)';
    showToast('אנא הכנס סכום העסקה','error');return;
  }
  document.getElementById('ie-income').style.borderColor='';
  const updated={...l,
    name:document.getElementById('ie-name').value.trim()||l.name,
    phone:document.getElementById('ie-phone').value.trim()||l.phone,
    status,notes:document.getElementById('ie-notes').value.trim(),
    income,ad:document.getElementById('ie-ad').value.trim()
  };
  state.leads=state.leads.map(x=>x.id===state.editingId?updated:x);
  closeInlineEdit();renderTable();renderSidebar();
  showToast('שומר...','');setSyncStatus('שומר...','saving');
  updateRowInSheet(updated).then(()=>{
    showToast('עודכן ✓','success');setSyncStatus('עודכן ✓','success');
  }).catch(()=>{
    showToast('שגיאה בשמירה','error');
    state.leads=state.leads.map(x=>x.id===state.editingId?l:x);
    renderTable();renderSidebar();
  });
}

// ── ADD LEAD MODAL ─────────────────────────────────────────────────────────
function openModal(){
  document.getElementById('f-date').value=new Date().toISOString().slice(0,10);
  ['f-name','f-phone','f-notes','f-income','f-campaign','f-ad'].forEach(id=>document.getElementById(id).value='');
  setStatusPill('ליד חדש');
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('f-name').focus(),100);
}
function closeModal(){document.getElementById('modal-overlay').classList.remove('open');}
function handleOverlayClick(e){if(e.target===document.getElementById('modal-overlay'))closeModal();}
function selectStatus(btn){document.querySelectorAll('#modal-overlay .pill').forEach(p=>p.classList.remove('active'));btn.classList.add('active');}
function setStatusPill(val){document.querySelectorAll('#modal-overlay .pill').forEach(p=>p.classList.toggle('active',p.dataset.val===val));}
function getSelectedStatus(){const a=document.querySelector('#modal-overlay .pill.active');return a?a.dataset.val:'ליד חדש';}

async function saveLead(){
  const raw=document.getElementById('f-date').value;const dp=raw?raw.split('-'):[];
  const date=dp.length===3?`${dp[2]}/${dp[1]}/${dp[0]}`:raw;
  const name=document.getElementById('f-name').value.trim();
  const phone=document.getElementById('f-phone').value.trim();
  if(!name){showToast('שם הוא שדה חובה','error');return;}
  if(!phone){showToast('טלפון הוא שדה חובה','error');return;}
  const status=getSelectedStatus();
  const income=document.getElementById('f-income').value.trim();
  if(status==='נמכר'&&!income){showToast('אנא הכנס סכום העסקה','error');return;}
  const lead={date,name,phone,status,notes:document.getElementById('f-notes').value.trim(),
    income,campaign:document.getElementById('f-campaign').value.trim(),
    ad:document.getElementById('f-ad').value.trim(),platform:'manual'};
  const saveBtn=document.querySelector('#modal-overlay .btn-primary');
  saveBtn.innerHTML='<div class="spinner"></div>';saveBtn.disabled=true;
  setSyncStatus('שומר...','saving');
  try{
    await appendToSheet(lead);await fetchFromSheet();buildMonthFilter();
    closeModal();renderTable();renderSidebar();
    showToast('ליד נוסף ✓','success');setSyncStatus('עודכן ✓','success');
  }catch(e){showToast('שגיאה: '+e.message,'error');}
  finally{saveBtn.innerHTML='<span>שמור לגיליון</span>';saveBtn.disabled=false;}
}

async function deleteLead(id){
  const lead=state.leads.find(x=>x.id===id);if(!lead)return;
  if(!confirm(`למחוק את "${lead.name}"?`))return;
  try{await deleteRowInSheet(lead);state.leads=state.leads.filter(x=>x.id!==id);renderTable();renderSidebar();showToast('נמחק ✓','success');}
  catch(e){showToast('מחיקה נכשלה','error');}
}

let toastTimer=null;
function showToast(msg,type){const t=document.getElementById('toast');t.textContent=msg;t.className='toast show '+(type||'');if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2800);}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeModal();closeInlineEdit();}
  if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){
    if(document.getElementById('inline-edit-modal').classList.contains('open'))saveInlineEdit();
    else if(document.getElementById('modal-overlay').classList.contains('open'))saveLead();
  }
});
