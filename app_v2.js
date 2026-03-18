function isAdminSession(){return JSON.parse(localStorage.getItem('crm_session')||'{}').role==='admin';}
const HEB_MONTHS=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
let state={leads:[],spreadsheetId:'',sheetTab:'Main CRM',clientName:'',clientId:'',sortField:'date',sortDir:-1,editingId:null,nextId:1,avgMonths:5,colMap:null,budgets:{}};
let selectedMonth='all';

async function fetchClients(){
  const res=await fetch(APPS_SCRIPT_URL+'?action=getClients');
  const d=await res.json();
  if(d.status==='error') throw new Error(d.message);
  return d.clients||[];
}
async function pushSaveClient(client){
  await fetch(APPS_SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'saveClient',client})});
  await sleep(1200);
}
async function pushDeleteClient(clientId){
  await fetch(APPS_SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'deleteClient',clientId})});
  await sleep(1200);
}
async function fetchBudgets(clientId){
  try{
    const res=await fetch(APPS_SCRIPT_URL+'?action=getBudgets&clientId='+encodeURIComponent(clientId));
    const d=await res.json();
    return d.budgets||{};
  }catch{return{};}
}
async function saveBudget(clientId,month,budget){
  await fetch(APPS_SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'saveBudget',clientId,month,budget})});
}
function getBudgetKey(){return selectedMonth==='all'?'all':selectedMonth;}
function getCurrentBudget(){return parseFloat(state.budgets[getBudgetKey()])||0;}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

document.addEventListener('DOMContentLoaded',()=>{
  const saved=localStorage.getItem('crm_session');
  if(saved){
    const s=JSON.parse(saved);
    if(s.role==='admin') showAdminScreen();
    else if(s.role==='client') reloadClientSession(s);
  } else showLoginScreen();
});

async function reloadClientSession(s){
  try{const clients=await fetchClients();const c=clients.find(x=>x.id===s.clientId);if(c)loadClientCRM(c);else showLoginScreen();}
  catch{showLoginScreen();}
}
function showLoginScreen(){hideAll();document.getElementById('login-screen').classList.add('active');}
function hideAll(){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));}

async function doLogin(){
  const u=document.getElementById('login-username').value.trim();
  const p=document.getElementById('login-password').value;
  document.getElementById('login-error').style.display='none';
  const btn=document.querySelector('#login-screen .btn-primary');
  btn.innerHTML='<div class="spinner"></div>';btn.disabled=true;
  if(ADMIN_USERS.some(a=>a.u.toLowerCase()===u.toLowerCase()&&a.p===String(p))){
    localStorage.setItem('crm_session',JSON.stringify({role:'admin'}));
    btn.innerHTML='כניסה';btn.disabled=false;
    showAdminScreen();return;
  }
  try{
    const clients=await fetchClients();
    // *** FIX: compare as strings so numeric passwords work ***
    const c=clients.find(x=>x.username.toLowerCase()===u.toLowerCase()&&String(x.password)===String(p)&&x.active!==false);
    if(c){localStorage.setItem('crm_session',JSON.stringify({role:'client',clientId:c.id}));loadClientCRM(c);}
    else{document.getElementById('login-error').textContent='שם משתמש או סיסמא שגויים';document.getElementById('login-error').style.display='block';}
  }catch(e){document.getElementById('login-error').textContent='שגיאת חיבור: '+e.message;document.getElementById('login-error').style.display='block';}
  btn.innerHTML='כניסה';btn.disabled=false;
}

function doLogout(){
  localStorage.removeItem('crm_session');
  if(autoSyncInterval)clearInterval(autoSyncInterval);
  showLoginScreen();document.getElementById('login-password').value='';
}

let adminClients=[];
async function showAdminScreen(){
  hideAll();document.getElementById('admin-screen').classList.add('active');
  document.getElementById('client-list').innerHTML='<div style="color:var(--text3);padding:2rem;text-align:center">טוען לקוחות...</div>';
  try{
    adminClients=await fetchClients();
    renderAdminClients();
    document.getElementById('admin-stats').innerHTML='<span style="color:var(--text2);font-size:12px">'+adminClients.length+' לקוחות</span>';
  }catch(e){document.getElementById('client-list').innerHTML='<div style="color:var(--red);padding:2rem">שגיאה: '+e.message+'</div>';}
}
function renderAdminClients(){
  const el=document.getElementById('client-list');
  if(!adminClients.length){el.innerHTML='<div style="color:var(--text3);font-size:14px;padding:2rem;text-align:center">עדיין אין לקוחות — לחץ "הוסף לקוח" ↑</div>';return;}
  el.innerHTML=adminClients.map(c=>`
    <div class="client-row">
      <div class="client-row-info" onclick="adminOpenClient('${c.id}')">
        <div class="client-row-name">${esc(c.name)}</div>
        <div class="client-row-sub">@${esc(c.username)} · ${esc(c.sheetTab||'Main CRM')}</div>
      </div>
      <div class="client-row-actions">
        <button class="btn-row-admin" onclick="adminOpenClient('${c.id}')">פתח CRM</button>
        <button class="btn-row-admin" onclick="editClient('${c.id}')">ערוך</button>
        <button class="btn-row-admin danger" onclick="deleteClient('${c.id}')">מחק</button>
      </div>
    </div>`).join('');
}
function openAddClient(){
  document.getElementById('client-modal-title').textContent='הוסף לקוח';
  document.getElementById('cm-id').value='';
  ['cm-name','cm-username','cm-password','cm-sheet-url','cm-logo-url'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('cm-sheet-tab').value='Main CRM';
  document.getElementById('cm-avg-months').value='5';
  document.getElementById('client-modal').classList.add('open');
  setTimeout(()=>document.getElementById('cm-name').focus(),80);
}
function editClient(id){
  const c=adminClients.find(x=>x.id===id);if(!c)return;
  document.getElementById('client-modal-title').textContent='ערוך לקוח';
  document.getElementById('cm-id').value=c.id;
  document.getElementById('cm-name').value=c.name;
  document.getElementById('cm-username').value=c.username;
  document.getElementById('cm-password').value=String(c.password);
  document.getElementById('cm-sheet-url').value=c.sheetUrl||'';
  document.getElementById('cm-sheet-tab').value=c.sheetTab||'Main CRM';
  document.getElementById('cm-avg-months').value=c.avgMonths||5;
  document.getElementById('cm-logo-url').value=c.logoUrl||'';
  document.getElementById('client-modal').classList.add('open');
}
async function saveClient(){
  const id=document.getElementById('cm-id').value;
  const name=document.getElementById('cm-name').value.trim();
  const username=document.getElementById('cm-username').value.trim();
  const password=document.getElementById('cm-password').value.trim();
  const sheetUrl=document.getElementById('cm-sheet-url').value.trim();
  const sheetTab=document.getElementById('cm-sheet-tab').value.trim()||'Main CRM';
  const avgMonths=parseInt(document.getElementById('cm-avg-months').value)||5;
  if(!name||!username||!password||!sheetUrl){showAdminToast('כל השדות הם חובה','error');return;}
  const sheetId=extractSheetId(sheetUrl);
  if(!sheetId){showAdminToast('קישור גיליון לא תקין','error');return;}
  const btn=document.querySelector('#client-modal .btn-primary');btn.innerHTML='<div class="spinner"></div>';btn.disabled=true;
  const logoUrl=document.getElementById('cm-logo-url').value.trim();
  const client={id:id||Date.now().toString(),name,username,password,sheetUrl,sheetId,sheetTab,avgMonths,logoUrl,active:true};
  try{
    await pushSaveClient(client);
    document.getElementById('client-modal').classList.remove('open');
    showAdminToast(id?'לקוח עודכן ✓':'לקוח נוסף ✓','success');
    await showAdminScreen();
  }catch(e){showAdminToast('שגיאה: '+e.message,'error');}
  btn.innerHTML='שמור';btn.disabled=false;
}
async function deleteClient(id){
  const c=adminClients.find(x=>x.id===id);if(!c)return;
  if(!confirm('למחוק את הלקוח "'+c.name+'"?'))return;
  try{await pushDeleteClient(id);showAdminToast('לקוח נמחק','success');await showAdminScreen();}
  catch(e){showAdminToast('שגיאה','error');}
}
function adminOpenClient(id){
  const c=adminClients.find(x=>x.id===id);if(!c)return;
  document.getElementById('btn-back-admin').style.display='flex';loadClientCRM(c);
}
function goBackAdmin(){if(autoSyncInterval)clearInterval(autoSyncInterval);showAdminScreen();}
let adminToastTimer=null;
function showAdminToast(msg,type){
  const t=document.getElementById('admin-toast');t.textContent=msg;t.className='admin-toast show '+(type||'');
  if(adminToastTimer)clearTimeout(adminToastTimer);adminToastTimer=setTimeout(()=>t.classList.remove('show'),2500);
}

async function loadClientCRM(client){
  state.spreadsheetId=client.sheetId;state.sheetTab=client.sheetTab||'Main CRM';
  state.clientName=client.name;state.clientId=String(client.id);state.avgMonths=client.avgMonths||5;
  hideAll();document.getElementById('crm-screen').classList.add('active');
  document.getElementById('s-client-name').textContent=client.name;

  const isAdmin=JSON.parse(localStorage.getItem('crm_session')||'{}').role==='admin';
  document.getElementById('btn-back-admin').style.display=isAdmin?'flex':'none';
  setSyncStatus('טוען...','saving');
  try{
    await fetchFromSheet();
    const budgets=await fetchBudgets(String(client.id));
    state.budgets=budgets;
    buildMonthFilter();renderTable();renderSidebar();updateBudgetInput();
    setSyncStatus('נטען ✓','success');startAutoSync();
  }catch(e){setSyncStatus('שגיאה: '+e.message,'error');showToast('שגיאה: '+e.message,'error');}
}

function parseDate(raw){
  if(!raw) return '';
  const s=String(raw).trim();
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  // ISO timestamp e.g. 2026-03-17T22:00:00.000Z
  // Israel is UTC+2 (UTC+3 during DST March-October)
  if(s.includes('T')){
    const d=new Date(s);
    if(!isNaN(d)){
      // Use Israel locale to get correct local date
      const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jerusalem',day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
      // parts = "17/03/2026"
      return parts;
    }
  }
  // Plain date e.g. 2026-03-17
  const isoM=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(isoM) return `${isoM[3]}/${isoM[2]}/${isoM[1]}`;
  // Serial number (Google Sheets)
  const n=parseFloat(s);
  if(!isNaN(n)&&n>1000){
    const d=new Date((n-25569)*86400*1000+43200000);
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jerusalem',day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
    return parts;
  }
  return s;
}

function extractSheetId(url){const m=url.match(/\/d\/([a-zA-Z0-9-_]+)/);return m?m[1]:null;}

async function fetchFromSheet(){
  const url=APPS_SCRIPT_URL+'?action=read&sheetId='+encodeURIComponent(state.spreadsheetId)+'&tab='+encodeURIComponent(state.sheetTab);
  const res=await fetch(url);if(!res.ok)throw new Error('HTTP '+res.status);
  const data=await res.json();if(data.status==='error')throw new Error(data.message);
  const rows=data.values||[];if(rows.length<1){state.leads=[];return;}
  const headers=rows[0].map(h=>String(h||'').trim().toLowerCase());
  // Chiquita sheet: A=date, B=name, C=phone, D=status, E=location, F=notes, G=amount, H=howbought
  const col={date:0,name:1,phone:2,status:3,notes:5,income:6,campaign:4,ad:7,platform:-1};
  // Override with header detection
  headers.forEach((h,i)=>{
    if(h.includes('סכום')||h.includes('amount')) col.income=i;
    else if(h.includes('איך קנה')||h.includes('how')) col.ad=i;
    else if(h.includes('מתעניין')||h.includes('מיקום')) col.campaign=i;
    else if(h.includes('תיאור')) col.notes=i;
  });
  state.colMap=col;state.leads=[];state.nextId=1;
  for(let i=1;i<rows.length;i++){
    const r=rows[i];const name=String(r[col.name]||'').trim();if(!name)continue;
    state.leads.push({id:state.nextId++,rowIndex:i+1,
      date:parseDate(String(r[col.date]||'')),name,
      phone:String(r[col.phone]||''),status:String(r[col.status]||''),
      notes:String(r[col.notes]||''),
      income:col.income>=0?String(r[col.income]||''):'',
      campaign:col.campaign>=0?String(r[col.campaign]||''):'',
      ad:col.ad>=0?String(r[col.ad]||''):'',
      platform:String(col.platform>=0?(r[col.platform]||''):'').toLowerCase()});
  }
}

function leadToRow(l){
  const col=state.colMap;if(!col)return[l.date,l.name,l.phone,l.status,l.notes,l.income,l.campaign,l.ad,l.platform];
  const maxCol=Math.max(...Object.values(col).filter(v=>v>=0));
  const row=new Array(maxCol+1).fill('');
  row[col.date]=l.date;row[col.name]=l.name;row[col.phone]=l.phone;
  row[col.status]=l.status;row[col.notes]=l.notes;
  if(col.income>=0)row[col.income]=l.income;
  if(col.campaign>=0)row[col.campaign]=l.campaign;
  if(col.ad>=0)row[col.ad]=l.ad;
  if(col.platform>=0)row[col.platform]=l.platform;
  return row;
}
async function scriptPost(payload){
  await fetch(APPS_SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...payload,sheetId:state.spreadsheetId,sheetTab:state.sheetTab})});
  await sleep(1400);
}
async function appendToSheet(lead){await scriptPost({action:'append',row:leadToRow(lead)});}
async function updateRowInSheet(lead){if(!lead.rowIndex){await appendToSheet(lead);return;}await scriptPost({action:'update',rowIndex:lead.rowIndex,row:leadToRow(lead)});}
async function deleteRowInSheet(lead){if(!lead.rowIndex)return;await scriptPost({action:'clear',rowIndex:lead.rowIndex});}

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

function switchTab(tab,btn){
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));btn.classList.add('active');
  document.getElementById('view-leads').style.display=tab==='leads'?'flex':'none';
  document.getElementById('view-analytics').style.display=tab==='analytics'?'block':'none';
  document.getElementById('fin-section').style.display=(tab==='analytics'&&selectedMonth!=='all')?'block':'none';
  if(tab==='analytics'){renderFinance();renderAnalytics();}
}

function buildMonthFilter(){
  const months=new Set();
  state.leads.forEach(l=>{const p=(l.date||'').split('/');if(p.length===3)months.add(p[2]+'-'+p[1].padStart(2,'0'));});
  const sorted=[...months].sort().reverse();
  const sel=document.getElementById('month-filter');
  sel.innerHTML='<option value="all">כל הזמן</option>'+sorted.map(m=>{
    const[y,mo]=m.split('-');return `<option value="${m}">${HEB_MONTHS[parseInt(mo)-1]+' '+y}</option>`;
  }).join('');
  sel.value=selectedMonth;
}
function onMonthFilterChange(){
  selectedMonth=document.getElementById('month-filter').value;
  updateBudgetInput();renderTable();renderSidebar();
  // Show budget only for specific month, not "all"
  const finSection=document.getElementById('fin-section');
  const analyticsVisible=document.getElementById('view-analytics').style.display!=='none';
  if(finSection&&analyticsVisible) finSection.style.display=(selectedMonth!=='all')?'block':'none';
  if(analyticsVisible){renderFinance();renderAnalytics();}
}
function getFilteredByMonth(leads){
  if(selectedMonth==='all')return leads;
  const[y,mo]=selectedMonth.split('-');
  return leads.filter(l=>{const p=(l.date||'').split('/');return p.length===3&&p[2]===y&&p[1].padStart(2,'0')===mo;});
}

function updateBudgetInput(){
  const inp=document.getElementById('budget');if(!inp)return;
  inp.value=getCurrentBudget()||'';
  const key=getBudgetKey();
  let label='תקציב קמפיין (₪)';
  if(key!=='all'){const[y,mo]=key.split('-');label='תקציב '+HEB_MONTHS[parseInt(mo)-1]+' '+y+' (₪)';}
  const lel=document.querySelector('.fin-field label');
  if(lel)lel.textContent=label;
}
async function onBudgetChange(){
  const val=parseFloat(document.getElementById('budget').value)||0;
  const key=getBudgetKey();
  state.budgets[key]=val;
  renderFinance();renderAnalytics();
  try{await saveBudget(state.clientId,key,val);}catch{}
}

function renderSidebar(){
  const l=getFilteredByMonth(state.leads);
  const total=l.length,nw=l.filter(x=>x.status==='ליד חדש').length,
    ip=l.filter(x=>x.status==='פולואפ'||x.status==='ביקש פרטים נוספים בוואטסאפ').length,
    ir=l.filter(x=>x.status==='לא רלוונטי').length,reg=l.filter(x=>x.status==='נמכר').length;
  document.getElementById('s-stats').innerHTML=`
    <div class="s-stat"><span class="s-stat-label">סה"כ</span><span class="s-stat-val">${total}</span></div>
    <div class="s-stat"><span class="s-stat-label">ליד חדש</span><span class="s-stat-val blue">${nw}</span></div>
    <div class="s-stat"><span class="s-stat-label">בתהליך</span><span class="s-stat-val amber">${ip}</span></div>
    <div class="s-stat"><span class="s-stat-label">לא רלוונטי</span><span class="s-stat-val red">${ir}</span></div>
    <div class="s-stat"><span class="s-stat-label">נמכר</span><span class="s-stat-val green">${reg}</span></div>`;
}

function renderFinance(){
  const l=getFilteredByMonth(state.leads);
  const budget=getCurrentBudget();const avgM=state.avgMonths||1;
  const total=l.length,reg=l.filter(x=>x.status==='נרשם').length;
  const costPerLead=total>0&&budget>0?Math.round(budget/total):0;
  const totalInc=l.filter(x=>x.income&&x.status==='נרשם').reduce((s,x)=>s+(parseFloat(x.income)||0),0);
  const avgMonthlyInc=reg>0?Math.round(totalInc/reg):0;
  const ltv=Math.round(avgMonthlyInc*avgM);
  const totalRev=reg*ltv;
  const roas=budget>0?Math.round((totalRev/budget)*100)+'%':'—';
  const el=document.getElementById('fin-results');if(!el)return;
  el.innerHTML=`
    <div class="fin-row"><span class="fin-label">עלות לליד</span><span class="fin-val">₪${costPerLead.toLocaleString()}</span></div>
    <div class="fin-row"><span class="fin-label">ממוצע הכנסה</span><span class="fin-val">₪${avgMonthlyInc.toLocaleString()}</span></div>
    <div class="fin-row"><span class="fin-label">ערך לקוח</span><span class="fin-val">₪${ltv.toLocaleString()}</span></div>
    <div class="fin-row"><span class="fin-label">סה"כ הכנסות</span><span class="fin-val">₪${totalRev.toLocaleString()}</span></div>
    <div class="fin-row"><span class="fin-label">החזר על השקעה</span><span class="fin-val">${roas}</span></div>`;
}

function renderAnalytics(){
  const l=getFilteredByMonth(state.leads);
  const budget=getCurrentBudget();const avgM=state.avgMonths||1;
  const total=l.length,reg=l.filter(x=>x.status==='נרשם').length;
  const conv=total>0?Math.round((reg/total)*100):0;
  const totalInc=l.filter(x=>x.income&&x.status==='נרשם').reduce((s,x)=>s+(parseFloat(x.income)||0),0);
  const avgInc=reg>0?Math.round(totalInc/reg):0;const ltv=Math.round(avgInc*avgM);
  const roas=budget>0?Math.round((reg*ltv/budget)*100)+'%':'—';
  const costPerLead=total>0&&budget>0?Math.round(budget/total):0;
  document.getElementById('kpi-row').innerHTML=`
    ${kpiCard('סה"כ לידים',total,'','var(--blue)')}
    ${kpiCard('נמכרו',reg,reg+' מתוך '+total,'var(--green)')}
    ${kpiCard('המרה',conv+'%','','var(--accent)')}
    ${kpiCard('עלות לליד',costPerLead>0?'₪'+costPerLead:'—','','var(--amber)')}
    ${kpiCard('ערך לקוח',ltv>0?'₪'+ltv.toLocaleString():'—','ממוצע x'+avgM+' חודשים','var(--green)')}
    ${kpiCard('החזר על השקעה',roas,'','var(--accent)')}`;
  const statuses=[{s:'ליד חדש',c:'#60a5fa'},{s:'ביקש פרטים נוספים בוואטסאפ',c:'#4ade80'},{s:'פולואפ',c:'#fbbf24'},{s:'לא רלוונטי',c:'#f87171'},{s:'נמכר',c:'#d4ff5c'}];
  document.getElementById('status-bars').innerHTML=statuses.map(({s,c})=>{
    const cnt=l.filter(x=>x.status===s).length;const pct=total>0?Math.round(cnt/total*100):0;
    const label=s==='ביקש פרטים נוספים בוואטסאפ'?'ביקש פרטים בווצאפ':s.length>20?s.slice(0,20)+'...':s;
    return `<div class="bar-row"><div class="bar-label-row"><span style="color:var(--text2)">${label}</span><span style="color:${c};font-weight:600">${cnt} (${pct}%)</span></div><div class="bar-track"><div class="bar-fill" style="background:${c};width:${pct}%"></div></div></div>`;
  }).join('');
  const adMap={};l.forEach(x=>{if(x.ad)adMap[x.ad]=(adMap[x.ad]||0)+1;});
  const ads=Object.entries(adMap).sort((a,b)=>b[1]-a[1]).slice(0,8);const maxAd=ads[0]?ads[0][1]:1;
  document.getElementById('ad-bars').innerHTML=ads.length?ads.map(([ad,cnt])=>`<div class="bar-row"><div class="bar-label-row"><span style="color:var(--text2)">${ad}</span><span style="color:var(--amber);font-weight:600">${cnt}</span></div><div class="bar-track"><div class="bar-fill" style="background:var(--amber);width:${Math.round(cnt/maxAd*100)}%"></div></div></div>`).join(''):'<div style="color:var(--text3);font-size:12px">אין נתוני מודעות</div>';
}
function kpiCard(label,val,sub,color){return `<div class="kpi-card"><div class="kpi-label">${label}</div><div class="kpi-val" style="color:${color}">${val}</div>${sub?`<div class="kpi-sub">${sub}</div>`:''}</div>`;}

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
function badgeClass(s){if(s==='ליד חדש')return 'badge-new';if(s==='ביקש פרטים נוספים בוואטסאפ')return 'badge-details';if(s==='פולואפ')return 'badge-followup';if(s==='לא רלוונטי')return 'badge-irrelevant';if(s==='נמכר')return 'badge-registered';return 'badge-new';}
function badgeLabel(s){if(s==='ביקש פרטים נוספים בוואטסאפ')return 'ביקש פרטים בווצאפ';if(s==='מעוניין להתקשר בעוד 24 שעות')return 'התקשר עוד 24ש';if(s==='מעוניין להתקשר בעוד 48 שעות')return 'התקשר עוד 48ש';return s;}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function platformLabel(p){if(!p)return '—';const lp=String(p).toLowerCase();if(lp==='fb'||lp.includes('face'))return 'Facebook';if(lp==='ig'||lp.includes('insta'))return 'Instagram';if(lp==='manual')return 'Manual';return p;}
function platformDot(p){const lp=String(p||'').toLowerCase();if(lp==='fb'||lp.includes('face'))return 'dot-fb';if(lp==='ig'||lp.includes('insta'))return 'dot-ig';if(lp==='manual')return 'dot-manual';return '';}

function renderTable(){
  const rows=getFiltered();
  const tbody=document.getElementById('table-body');const empty=document.getElementById('empty-state');const cards=document.getElementById('cards-body');
  document.getElementById('row-count').textContent=rows.length+' מתוך '+getFilteredByMonth(state.leads).length+' לידים';
  if(!rows.length){if(tbody)tbody.innerHTML='';if(empty)empty.style.display='flex';if(cards)cards.innerHTML='<div style="padding:3rem;text-align:center;color:var(--text3)">לא נמצאו לידים</div>';return;}
  if(empty)empty.style.display='none';
  const isAdmin=isAdminSession();
  if(tbody)tbody.innerHTML=rows.map(l=>{
    const isReg=l.status==='נמכר';
    const rowStyle=isReg?'background:rgba(74,222,128,0.08);border-right:3px solid rgba(74,222,128,0.5);':'border-right:3px solid transparent;';
    return `<tr onclick="openInlineEdit(${l.id})" style="cursor:pointer;${rowStyle}">
    <td class="date-cell">${l.date||'—'}</td>
    <td class="name-cell">${esc(l.name)}</td>
    <td class="phone-cell">${l.phone}</td>
    <td><span class="badge ${badgeClass(l.status)}">${esc(badgeLabel(l.status))}</span></td>
    <td><div class="tooltip-cell"><span class="cell-truncate">${esc(l.notes)||'—'}</span>${l.notes?`<div class="tooltip-box">${esc(l.notes)}</div>`:''}</div></td>
    <td class="income-cell">${isReg&&l.income?'₪'+esc(l.income):isReg?'—':''}</td>
    <td><div class="platform-cell"><div class="platform-dot ${platformDot(l.platform)}"></div><span>${platformLabel(l.platform)}</span></div></td>
    <td><div class="tooltip-cell"><span class="cell-truncate">${esc(l.campaign)||'—'}</span>${l.campaign?`<div class="tooltip-box">${esc(l.campaign)}</div>`:''}</div></td>
    <td><div class="tooltip-cell"><span class="cell-truncate">${esc(l.ad)||'—'}</span>${l.ad?`<div class="tooltip-box">${esc(l.ad)}</div>`:''}</div></td>
    <td class="action-cell">
      <button class="btn-call" onclick="event.stopPropagation();callLead('${l.phone}')" title="התקשר">📞</button>
      <button class="btn-wa" onclick="event.stopPropagation();waLead('${l.phone}')" title="ווצאפ">💬</button>
      ${isAdmin?`<button class="btn-delete-row" onclick="event.stopPropagation();confirmDelete(${l.id})" title="מחק">✕</button>`:''}
    </td>
  </tr>`;}).join('');
  if(cards)cards.innerHTML=rows.map(l=>{
    const isReg=l.status==='נמכר';
    return `<div class="lead-card${isReg?' lead-card-reg':''}" onclick="openInlineEdit(${l.id})">
    <div class="lead-card-top"><div class="lead-card-name">${esc(l.name)}</div><div class="lead-card-date">${l.date||'—'}</div></div>
    <div class="lead-card-phone">${l.phone}</div>
    <div class="lead-card-row"><span class="badge ${badgeClass(l.status)}">${esc(badgeLabel(l.status))}</span>${isReg&&l.income?'<span style="color:var(--green);font-size:12px;font-family:monospace">₪'+esc(l.income)+'</span>':''}</div>
    ${l.notes?'<div style="font-size:12px;color:var(--text2);margin-top:6px">'+esc(l.notes)+'</div>':''}
    <div style="display:flex;gap:6px;margin-top:10px">
      <button class="lead-card-edit" style="flex:2" onclick="event.stopPropagation();openInlineEdit(${l.id})">ערוך ←</button>
      <button class="btn-call-card" onclick="event.stopPropagation();callLead('${l.phone}')" title="התקשר">📞</button>
      <button class="btn-wa-card" onclick="event.stopPropagation();waLead('${l.phone}')" title="ווצאפ">💬</button>
    </div>
  </div>`;}).join('');
}
function sortBy(f){if(state.sortField===f)state.sortDir*=-1;else{state.sortField=f;state.sortDir=1;}renderTable();}

const STATUSES=['ליד חדש','ביקש פרטים נוספים בוואטסאפ','פולואפ','לא רלוונטי','נמכר'];
function openInlineEdit(id){
  const l=state.leads.find(x=>x.id===id);if(!l)return;
  state.editingId=id;
  document.getElementById('ie-name-val').textContent=l.name;
  document.getElementById('ie-phone').value=l.phone;
  document.getElementById('ie-name').value=l.name;
  document.getElementById('ie-notes').value=l.notes;
  document.getElementById('ie-income').value=l.income;
  document.getElementById('ie-date').textContent=l.date||'—';
  document.getElementById('ie-platform').textContent=platformLabel(l.platform);
  document.getElementById('ie-campaign').textContent=l.campaign||'—';
  document.getElementById('ie-ad').textContent=l.ad||'—';
  document.getElementById('ie-status-pills').innerHTML=STATUSES.map(s=>
    `<button class="pill ${l.status===s?'active':''}" data-val="${s}" onclick="iePickStatus(this)">${s}</button>`).join('');
  const incomeGroup=document.getElementById('ie-income-group');
  if(incomeGroup) incomeGroup.style.display=l.status==='נרשם'?'block':'none';
  document.getElementById('inline-edit-modal').classList.add('open');
}
function iePickStatus(btn){
  document.querySelectorAll('#ie-status-pills .pill').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  // Show income field only when נרשם
  const incomeGroup=document.getElementById('ie-income-group');
  if(incomeGroup) incomeGroup.style.display=btn.dataset.val==='נרשם'?'block':'none';
}
function ieGetStatus(){const a=document.querySelector('#ie-status-pills .pill.active');return a?a.dataset.val:'ליד חדש';}
function closeInlineEdit(){document.getElementById('inline-edit-modal').classList.remove('open');}
async function saveInlineEdit(){
  const l=state.leads.find(x=>x.id===state.editingId);if(!l)return;
  const status=ieGetStatus();
  const income=document.getElementById('ie-income').value.trim();
  // Validate: income required when נרשם
  if(status==='נמכר'&&!income){
    document.getElementById('ie-income').style.borderColor='var(--red)';
    document.getElementById('ie-income').placeholder='חובה להכניס הכנסה חודשית!';
    showToast('אנא הכנס הכנסה חודשית','error');
    return;
  }
  document.getElementById('ie-income').style.borderColor='';
  const updated={...l,
    name:document.getElementById('ie-name').value.trim()||l.name,
    phone:document.getElementById('ie-phone').value.trim()||l.phone,
    status,notes:document.getElementById('ie-notes').value.trim(),income
  };
  state.leads=state.leads.map(x=>x.id===state.editingId?updated:x);
  closeInlineEdit();renderTable();renderSidebar();
  showToast('שומר...','');setSyncStatus('שומר...','saving');
  updateRowInSheet(updated).then(()=>{
    showToast('ליד עודכן ✓','success');setSyncStatus('עודכן ✓','success');
  }).catch(()=>{
    showToast('שגיאה בשמירה','error');setSyncStatus('שמירה נכשלה','error');
    state.leads=state.leads.map(x=>x.id===state.editingId?l:x);
    renderTable();renderSidebar();
  });
}

function openModal(){
  state.editingId=null;
  document.getElementById('modal-title').textContent='הוסף ליד חדש';
  document.getElementById('f-date').value=new Date().toISOString().slice(0,10);
  ['f-name','f-phone','f-notes','f-income','f-campaign','f-ad'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-platform').value='manual';setStatusPill('ליד חדש');
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
  const name=document.getElementById('f-name').value.trim();const phone=document.getElementById('f-phone').value.trim();
  if(!name){showToast('שם הוא שדה חובה','error');return;}if(!phone){showToast('טלפון הוא שדה חובה','error');return;}
  const lead={date,name,phone,status:getSelectedStatus(),notes:document.getElementById('f-notes').value.trim(),income:document.getElementById('f-income').value.trim(),campaign:document.getElementById('f-campaign').value.trim(),ad:document.getElementById('f-ad').value.trim(),platform:document.getElementById('f-platform').value};
  const saveBtn=document.querySelector('#modal-overlay .btn-primary');saveBtn.innerHTML='<div class="spinner"></div>';saveBtn.disabled=true;
  setSyncStatus('שומר...','saving');
  try{
    await appendToSheet(lead);await fetchFromSheet();buildMonthFilter();
    closeModal();renderTable();renderSidebar();
    showToast('ליד נוסף ✓','success');setSyncStatus('עודכן ✓','success');
  }catch(e){showToast('שגיאה: '+e.message,'error');setSyncStatus('שמירה נכשלה','error');}
  finally{saveBtn.innerHTML='<span id="save-btn-text">שמור לגיליון</span>';saveBtn.disabled=false;}
}
function confirmDelete(id){
  // Only show confirm for admin — clients see nothing
  const session=JSON.parse(localStorage.getItem('crm_session')||'{}');
  if(session.role!=='admin'){showToast('אין הרשאה למחיקה','error');return;}
  const lead=state.leads.find(x=>x.id===id);if(!lead)return;
  if(!confirm(`⚠️ מחיקה סופית\n\nהאם למחוק את "${lead.name}"?\nפעולה זו אינה ניתנת לביטול.`))return;
  deleteLead(id);
}
async function deleteLead(id){
  const lead=state.leads.find(x=>x.id===id);if(!lead)return;
  if(!confirm(`למחוק את "${lead.name}"?`))return;
  setSyncStatus('מוחק...','saving');
  try{await deleteRowInSheet(lead);state.leads=state.leads.filter(x=>x.id!==id);renderTable();renderSidebar();showToast('נמחק ✓','success');setSyncStatus('עודכן ✓','success');}
  catch(e){showToast('מחיקה נכשלה','error');}
}
let toastTimer=null;
function showToast(msg,type){const t=document.getElementById('toast');t.textContent=msg;t.className='toast show '+(type||'');if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2800);}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeModal();closeInlineEdit();document.getElementById('client-modal')?.classList.remove('open');}
  if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){
    if(document.getElementById('inline-edit-modal').classList.contains('open'))saveInlineEdit();
    else if(document.getElementById('modal-overlay').classList.contains('open'))saveLead();
  }
});

function callLead(phone){
  const clean=phone.replace(/[^0-9+]/g,'');
  window.location.href='tel:'+clean;
}
function waLead(phone){
  let clean=phone.replace(/[^0-9]/g,'');
  if(clean.startsWith('0')) clean='972'+clean.slice(1);
  window.open('https://wa.me/'+clean,'_blank');
}

function togglePassVis(){
  const inp=document.getElementById('login-password');
  const btn=document.getElementById('pass-eye');
  if(inp.type==='password'){inp.type='text';btn.textContent='🙈';}
  else{inp.type='password';btn.textContent='👁';}
}
