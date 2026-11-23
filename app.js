'use strict';
const DB_NAME='meu-financeiro-cloud-'+(window.Cloud?.user?.id||'local'), STORE='entries', GOALS='goals';
let goals=[], editingGoalId=null, depositGoalId=null;let db, entries=[],page='dashboard',editingEntryId=null, editingMonth=null, simulationGoalId=null, planGoalId=null, invoiceCard='';let analysisFilter={category:'',tag:'',status:'all',view:'category'};
const $=s=>document.querySelector(s), money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const monthOf=date=>date.slice(0,7), monthShift=(month,delta)=>{const [y,m]=month.split('-').map(Number),d=new Date(y,m-1+delta,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}, monthLabel=m=>new Date(Number(m.slice(0,4)),Number(m.slice(5))-1,1).toLocaleDateString('pt-BR',{month:'short',year:'numeric'}), fullDate=d=>{const [y,m,day]=d.split('-');return `${day}/${m}/${y}`};
function addMonths(date,offset){const [y,m,day]=date.split('-').map(Number),first=new Date(y,m-1+offset,1),last=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();return `${first.getFullYear()}-${String(first.getMonth()+1).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,2);req.onupgradeneeded=e=>{if(e.oldVersion<1){const s=req.result.createObjectStore(STORE,{keyPath:'id'});s.createIndex('date','date')}req.result.createObjectStore(GOALS,{keyPath:'id'})};req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result)};req.onblocked=()=>notify("Feche as outras abas do Meu Financeiro para concluir a atualização.");req.onerror=()=>reject(req.error)})}
function transaction(mode,callback,store=STORE){return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);callback(tx.objectStore(Array.isArray(store)?store[0]:store),tx);tx.oncomplete=()=>{if(mode==='readwrite'&&window.Cloud?.enabled){window.Cloud.sync(db).then(resolve).catch(err=>{notify('Alteração local salva, mas falhou a sincronização: '+err.message);reject(err)})}else resolve()};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
function readStore(store){
 return new Promise((resolve,reject)=>{
  const request=db.transaction(store).objectStore(store).getAll();
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}
async function reload(){
 [entries,goals]=await Promise.all([readStore(STORE),readStore(GOALS)]);
 render();
}
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const selectedMonth=()=>$('#month').value||today().slice(0,7);
function installmentOccurrence(entry,month){
 const index=monthIndex(month)-monthIndex(monthOf(entry.date));
 const count=entry.parts||1;
 if(index<0||index>=count)return null;
 const cents=Math.round(entry.amount*100),base=Math.floor(cents/count),remainder=cents%count;
 return {id:`${entry.id}:${index}`,entryId:entry.id,description:entry.description,type:entry.type,
  category:entry.category,tag:entry.tag||'',card:entry.card||'',date:addMonths(entry.date,index),
  amount:(base+(index<remainder?1:0))/100,number:index+1,total:count,paid:!!entry.paid?.[index]};
}
function recurringOccurrence(entry,month){
 if(month<monthOf(entry.date)||(entry.until&&month>=entry.until))return null;
 const item=recurringValues(entry,month);
 const [year,number]=month.split('-').map(Number);
 const day=Math.min(Number(item.date.slice(-2)),daysInMonth(year,number));
 return {...item,id:`${entry.id}:${month}`,entryId:entry.id,date:`${month}-${String(day).padStart(2,'0')}`,
  total:1,recurring:true,tag:item.tag||'',card:item.card||'',paid:!!entry.paid[month]};
}
function recurringValues(entry,month,includeSingle=true){
 const changes=entry.changes??{};
 const revision=Object.keys(changes).filter(key=>key<=month&&changes[key].future).sort().at(-1);
 return (includeSingle?changes[month]?.single:null)??changes[revision]?.future??entry;
}
function daysInMonth(year,month){return new Date(Date.UTC(2000+(year%400),month,0)).getUTCDate()}
function inMonth(month){
 return entries.map(entry=>entry.recurring?recurringOccurrence(entry,month):installmentOccurrence(entry,month))
  .filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
}
function totals(month){
 const rows=inMonth(month),expenses=rows.filter(item=>item.type==='expense');
 const income=sumCents(rows.filter(item=>item.type==='income')),expense=sumCents(expenses);
 return {income:income/100,expense:expense/100,balance:(income-expense)/100,
  paid:sumCents(expenses.filter(item=>item.paid))/100};
}
function notify(message){$('#notice').textContent=message;setTimeout(()=>{if($('#notice').textContent===message)$('#notice').textContent=''},5000)}
function card(label,value,sub,cls=''){return `<div class="card"><div class="label">${label}</div><div class="metric ${cls}">${value}</div><div class="sub">${sub}</div></div>`}
function barChart(months,selector){const vals=months.map(m=>totals(m).expense),max=Math.max(1,...vals);$(selector).innerHTML=`<div class="chart">${months.map((m,i)=>`<div class="chartCol" title="${esc(monthLabel(m))}: ${money(vals[i])}"><div class="chartAmount">${money(vals[i])}</div><div class="chartBar" style="height:${Math.max(2,vals[i]/max*140)}px"></div><div class="chartLabel">${esc(monthLabel(m))}</div></div>`).join('')}</div>`}
function renderDashboard(){const m=selectedMonth(),t=totals(m),ratio=t.income?100*t.expense/t.income:0,rows=inMonth(m).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);$('#dashboard').innerHTML=`<div class="cards">${card('Receitas previstas',money(t.income),'Entradas do mês','positive')}${card('Despesas previstas',money(t.expense),'Inclui parcelas a vencer','negative')}${card('Saldo projetado',money(t.balance),'Receitas menos despesas',t.balance>=0?'positive':'negative')}${card('Renda comprometida',t.income?ratio.toFixed(1).replace('.',',')+'%':'—',t.income?'Despesas / receitas':'Cadastre uma receita')}</div>${renderMonthlyPlan(m)}<div class="grid2"><div class="panel"><h3>Comprometimento da renda</h3><div class="row"><span class="muted">${money(t.expense)} em despesas</span><strong>${money(Math.max(0,t.balance))} restante</strong></div><div class="bar"><span style="width:${Math.min(100,ratio)}%"></span></div><div class="legend">${ratio>100?'<span class="negative">Atenção: despesas maiores que as receitas.</span>':'<span>Projeção baseada nos lançamentos cadastrados.</span>'}</div></div><div class="panel"><h3>Resumo de pagamentos</h3><p>Despesas pagas: <strong>${money(t.paid)}</strong></p><p>Despesas pendentes: <strong>${money(t.expense-t.paid)}</strong></p><p class="foot">Marcar uma despesa como paga não altera o valor previsto do mês.</p></div></div><div class="grid2"><div class="panel"><h3>Despesas — próximos 6 meses</h3><div id="dashChart"></div></div><div class="panel"><h3>Últimos lançamentos do mês</h3>${table(rows,false)}</div></div>`;barChart(Array.from({length:6},(_,i)=>monthShift(m,i)),'#dashChart')}
function table(rows,actions=true){if(!rows.length)return '<div class="empty">Nenhum lançamento encontrado.</div>';return `<div class="tableWrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tag</th><th>Parcela</th><th>Valor</th><th>Status</th>${actions?'<th>Ações</th>':''}</tr></thead><tbody>${rows.map(o=>`<tr><td>${fullDate(o.date)}</td><td>${esc(o.description)}</td><td>${esc(o.category)}</td><td>${o.tag?`<span class="tagPill">${esc(o.tag)}</span>`:"—"}</td><td>${o.recurring?'Mensal':o.total>1?o.number+'/'+o.total:'—'}</td><td class="${o.type==='income'?'positive':'negative'}">${o.type==='income'?'+':'−'} ${money(o.amount)}</td><td><span class="pill ${o.paid?'paid':'pending'}">${o.paid?'Pago/recebido':'Pendente'}</span></td>${actions?`<td><button class="smallBtn" data-toggle="${esc(o.id)}">${o.paid?'Desfazer':'Confirmar'}</button> <button class="smallBtn" data-edit="${esc(o.entryId)}" data-entry-month="${monthOf(o.date)}">Editar</button> <button class="smallBtn danger" data-delete="${esc(o.entryId)}" data-entry-month="${monthOf(o.date)}">Excluir</button></td>`:''}</tr>`).join('')}</tbody></table></div>`}
function renderEntries(){
  const m=selectedMonth();
  const tags=[...new Set(inMonth(m).map(e=>e.tag||'').filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const filter=window.activeTagFilter||'';
  const rows=inMonth(m).filter(o=>!filter||o.tag===filter);
  // Somente as ocorrências do mês selecionado: parcelas futuras não entram no total atual.
  // Receitas e despesas são somadas separadamente para evitar totais enganosos.
  const expenses=rows.filter(o=>o.type==='expense').reduce((sum,o)=>sum+Math.round(o.amount*100),0)/100;
  const incomes=rows.filter(o=>o.type==='income').reduce((sum,o)=>sum+Math.round(o.amount*100),0)/100;
  const summary=filter
    ? `<div class="tagSummary" aria-live="polite"><span class="muted">Total da tag <strong>${esc(filter)}</strong> neste mês</span><strong class="negative">Despesas: ${money(expenses)}</strong>${incomes>0?`<strong class="positive">Receitas: ${money(incomes)}</strong>`:''}</div>`
    : '';
  $('#lancamentos').innerHTML=`<div class="panel"><div class="row"><h3>Receitas e despesas — ${esc(monthLabel(m))}</h3><div class="row"><label class="muted" for="tagFilter">Filtrar tag</label><select id="tagFilter"><option value="">Todas as tags</option>${tags.map(t=>`<option value="${esc(t)}" ${t===filter?'selected':''}>${esc(t)}</option>`).join('')}</select><span class="muted">${rows.length} ocorrências</span></div></div>${summary}${table(rows)}</div><p class="foot">O total da tag considera apenas os lançamentos e parcelas do mês selecionado, independentemente de estarem pagos. Ao excluir uma compra parcelada, todas as parcelas da compra serão excluídas. A confirmação de pagamento afeta somente a parcela selecionada.</p>`;
}
function renderInstallments(){const m=selectedMonth(),list=inMonth(m).filter(o=>o.total>1&&o.type==='expense');$('#parcelas').innerHTML=`<div class="panel"><h3>Parcelas de ${esc(monthLabel(m))}</h3>${table(list)}</div>`}
function renderForecast(){
 const months=Array.from({length:12},(_,i)=>monthShift(selectedMonth(),i));
 let cumulative=0;
 const rows=months.map(month=>{
  const t=totals(month),plan=goalCashFlow(month);
  const balance=Math.round(t.balance*100)-plan.committed;
  cumulative+=balance;
  return `<tr><td>${esc(monthLabel(month))}</td><td>${money(t.income)}</td><td>${money(t.expense)}</td><td>${money(plan.committed/100)}</td>
   <td class="${balance<0?'negative':'positive'}">${money(balance/100)}${balance<0?' · Déficit':''}</td>
   <td class="${cumulative<0?'negative':'positive'}">${money(cumulative/100)}</td></tr>`;
 }).join('');
 $('#projecoes').innerHTML=`<div class="panel"><h3>Projeção dos próximos 12 meses</h3>
 <p class="foot">O saldo considera os aportes realizados e o restante dos planejados. O acumulado começa em zero.</p>
 <div class="tableWrap"><table><thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Aportes</th><th>Saldo após aportes</th><th>Acumulado</th></tr></thead><tbody>${rows}</tbody></table></div></div>
 <div class="panel"><h3>Despesas projetadas</h3><div id="forecastChart"></div></div>`;
 barChart(months,'#forecastChart');
}
function renderAnalysis(){
 const m=selectedMonth(),monthRows=inMonth(m).filter(x=>x.type==='expense');
 const cats=[...new Set(monthRows.map(x=>x.category))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const tags=[...new Set(monthRows.map(x=>x.tag||'Sem tag'))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 if(analysisFilter.category&&!cats.includes(analysisFilter.category))analysisFilter.category='';
 if(analysisFilter.tag&&!tags.includes(analysisFilter.tag))analysisFilter.tag='';
 const rows=monthRows.filter(x=>(!analysisFilter.category||x.category===analysisFilter.category)&&(!analysisFilter.tag||(x.tag||'Sem tag')===analysisFilter.tag)&&(analysisFilter.status==='all'||(analysisFilter.status==='paid'?x.paid:!x.paid)));
 const sum=a=>Math.round(a.reduce((t,x)=>t+Math.round(x.amount*100),0))/100;
 const total=sum(rows),paid=sum(rows.filter(x=>x.paid)),pending=sum(rows.filter(x=>!x.paid));
 const group=field=>Object.entries(rows.reduce((o,r)=>{const key=field==='tag'?(r.tag||'Sem tag'):r.category;o[key]=(o[key]||0)+r.amount;return o},{})).sort((a,b)=>b[1]-a[1]);
 const grouped=group(analysisFilter.view),byCat=group('category');
 const pct=n=>total?(100*n/total).toFixed(1).replace('.',',')+'%':'0%';
 const option=(v,label,active)=>`<option value="${esc(v)}" ${v===active?'selected':''}>${esc(label)}</option>`;
 const groupBars=grouped.length?`<div class="categories">${grouped.map(([name,v])=>`<div><div class="row"><span>${esc(name)}</span><strong>${money(v)} · ${pct(v)}</strong></div><div class="catTrack"><div class="catFill" style="width:${Math.min(100,100*v/total)}%"></div></div></div>`).join('')}</div>`:'<div class="empty">Nenhuma despesa corresponde aos filtros.</div>';
 const trendMonths=Array.from({length:6},(_,i)=>monthShift(m,i-5));
 const trend=trendMonths.map(mon=>({month:mon,value:sum(inMonth(mon).filter(x=>x.type==='expense'&&(!analysisFilter.category||x.category===analysisFilter.category)&&(!analysisFilter.tag||(x.tag||'Sem tag')===analysisFilter.tag)&&(analysisFilter.status==='all'||(analysisFilter.status==='paid'?x.paid:!x.paid))))}));
 const max=Math.max(1,...trend.map(x=>x.value));
 $('#analises').innerHTML=`<div class="panel analysisControls"><div class="analysisHead"><div><h3>Dashboard de análises</h3><p class="foot">Filtre os gastos por categoria, tag e pagamento. Os indicadores usam o mês selecionado; a evolução mostra seis meses.</p></div><button id="analysisReset" type="button">Limpar filtros</button></div><div class="analysisFilters"><label>Categoria<select id="analysisCategory">${option('','Todas as categorias',analysisFilter.category)}${cats.map(x=>option(x,x,analysisFilter.category)).join('')}</select></label><label>Tag<select id="analysisTag">${option('','Todas as tags',analysisFilter.tag)}${tags.map(x=>option(x,x,analysisFilter.tag)).join('')}</select></label><label>Status<select id="analysisStatus">${option('all','Todos',analysisFilter.status)}${option('paid','Pagos',analysisFilter.status)}${option('pending','Pendentes',analysisFilter.status)}</select></label><label>Agrupar por<select id="analysisView">${option('category','Categoria',analysisFilter.view)}${option('tag','Tag',analysisFilter.view)}</select></label></div></div>
 <div class="cards">${card('Despesas filtradas',money(total),`${rows.length} ocorrências no mês`)}${card('Pagas',money(paid),'Despesas confirmadas','positive')}${card('Pendentes',money(pending),'Ainda não confirmadas','negative')}${card('Maior categoria',byCat.length?esc(byCat[0][0]):'—',byCat.length?money(byCat[0][1]):'Sem despesas')}</div>
 <div class="grid2"><div class="panel"><h3>Distribuição por ${analysisFilter.view==='tag'?'tag':'categoria'}</h3>${groupBars}</div><div class="panel"><h3>Pagamentos do mês</h3><div class="row"><span class="muted">Pagos</span><strong>${money(paid)}</strong></div><div class="bar"><span style="width:${total?100*paid/total:0}%"></span></div><div class="row"><span class="muted">Pendentes</span><strong>${money(pending)}</strong></div><p class="foot">O total considera cada parcela somente no mês da sua ocorrência.</p></div></div>
 <div class="panel"><div class="row trendHead"><h3>Evolução de despesas — últimos seis meses</h3><div class="monthNav"><button type="button" data-month-step="-1" aria-label="Mês anterior na análise">‹</button><button type="button" data-month-step="1" aria-label="Próximo mês na análise">›</button></div></div><div class="trendChart">${trend.map(x=>`<button type="button" class="trendCol ${x.month===m?'selected':''}" data-analysis-month="${esc(x.month)}" title="${esc(monthLabel(x.month))}: ${money(x.value)}"><span class="trendAmount">${money(x.value)}</span><span class="trendBar" style="height:${Math.max(4,Math.round(x.value/max*155))}px"></span><span class="trendLabel">${esc(monthLabel(x.month))}</span></button>`).join('')}</div><p class="foot">Clique em um mês para selecioná-lo em todo o aplicativo.</p></div>
 <div class="panel"><div class="row"><h3>Detalhamento dos lançamentos filtrados</h3><span class="muted">${rows.length} ocorrências</span></div>${table(rows.sort((a,b)=>b.date.localeCompare(a.date)),false)}</div>`;
}
function renderConfig(){$('#config').innerHTML=`<div class="panel"><h3>Backup dos dados</h3><p class="muted">Os dados são sincronizados com sua conta Supabase após cada alteração. Exporte backups JSON regularmente para maior segurança.</p><div class="settingsGrid"><button id="exportBtn">⬇ Exportar backup JSON</button><button id="importBtn">⬆ Restaurar backup</button><button id="mergeBtn">＋ Adicionar lançamentos de JSON (sem apagar)</button></div></div><div class="panel"><h3>Limpar dados</h3><p class="foot">Esta ação remove permanentemente todos os lançamentos armazenados neste navegador. Faça um backup antes.</p><button class="danger" id="clearBtn">Excluir todos os lançamentos</button></div><div class="panel"><h3>Sobre os cálculos</h3><p class="foot">Cada compra parcelada é distribuída em meses consecutivos a partir da primeira data informada. Diferenças de centavos são distribuídas nas primeiras parcelas. O status de pagamento é individual por parcela. Os lançamentos recorrentes usam o valor mensal informado e se repetem até serem encerrados.</p></div>`}
function render(){renderDashboard();renderEntries();renderInstallments();renderForecast();renderAnalysis();renderGoals();renderInvoices();renderConfig()}
function setPage(next){page=next;document.querySelectorAll('.page').forEach(e=>e.classList.toggle('hidden',e.id!==next));document.querySelectorAll('.nav').forEach(e=>e.classList.toggle('active',e.dataset.page===next));$('#pageTitle').textContent=({dashboard:'Dashboard',lancamentos:'Lançamentos',parcelas:'Parcelas',projecoes:'Projeções',analises:'Análises',objetivos:'Poupança e objetivos',faturas:'Faturas',config:'Configurações'})[next]}
const categories={expense:['Compras','Alimentação','Moradia','Transporte','Saúde','Educação','Lazer','Contas fixas','Dívidas','Outros'],income:['Salário','Renda extra','13º salário','Reembolso','Outros']};
function updateForm(preferredCategory){
 const f=$('#entryForm'), type=f.elements.type.value, select=f.elements.category;
 const current=typeof preferredCategory==='string'?preferredCategory:select.value;
 const options=[...categories[type]];
 if(current&&!options.includes(current)&&typeof preferredCategory==='string')options.push(current);
 select.innerHTML=options.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
 if(options.includes(current))select.value=current;
 const payment=f.elements.payment;
 payment.querySelector('[value="installment"]').disabled=type==='income';
 if(type==='income'&&payment.value==='installment')payment.value='single';
 $('#partsWrap').classList.toggle('hidden',payment.value!=='installment');
 $('#cardWrap').classList.toggle('hidden',type==='income');
 preview();
}

function openNewEntry(){
 editingEntryId=null;
 editingMonth=null;
 const f=$('#entryForm');
 f.reset();
 f.elements.payment.disabled=false;
 f.elements.date.value=selectedMonth()===monthOf(today())?today():selectedMonth()+'-01';
 $('#entryError').textContent='';
 $('#recurringScopeWrap').classList.add('hidden');
 $('#entryDialogTitle').textContent='Novo lançamento';
 $('#saveEntryBtn').textContent='Salvar lançamento';
 updateForm();
 $('#entryDialog').showModal();
}

function openEditEntry(id,month){
 const entry=entries.find(item=>item.id===id);
 const item=entry?.recurring?recurringOccurrence(entry,month):entry;
 if(!item){notify('Lançamento não encontrado.');return}
 editingEntryId=id;
 editingMonth=entry.recurring?month:null;
 const f=$('#entryForm');
 f.reset();
 for(const field of ['type','description','amount','date','tag','card'])f.elements[field].value=item[field]??'';
 f.elements.payment.value=entry.recurring?'recurring':entry.parts>1?'installment':'single';
 f.elements.payment.disabled=!!entry.recurring;
 f.elements.parts.value=entry.parts>1?entry.parts:6;
 $('#recurringScopeWrap').classList.toggle('hidden',!entry.recurring);
 $('#entryError').textContent='';
 updateForm(item.category);
 $('#entryDialogTitle').textContent='Editar lançamento';
 $('#saveEntryBtn').textContent='Salvar alterações';
 $('#entryDialog').showModal();
}

function preview(){
 const f=$('#entryForm'),n=Number(f.elements.parts.value)||2,amount=Number(f.elements.amount.value)||0;
 $('#installmentPreview').textContent=f.elements.payment.value==='installment'?`${n} parcelas de aproximadamente ${money(amount/n)}.`:
  f.elements.payment.value==='recurring'?`${money(amount)} por mês. Informe a data da primeira ocorrência.`:'';
}

async function saveEntry(event){
 event.preventDefault();
 const f=event.target, fields=f.elements, submit=$('#saveEntryBtn');
 const recurring=fields.payment.value==='recurring',parts=fields.payment.value==='installment'?Number(fields.parts.value):1;
 const amount=Math.round(Number(fields.amount.value)*100)/100, date=fields.date.value;
 const data={description:fields.description.value.trim(),type:fields.type.value,category:fields.category.value,
  tag:fields.tag.value.trim(),card:fields.type.value==='expense'?fields.card.value.trim():'',amount,date};
 if(!data.description||!Number.isFinite(amount)||amount<=0||!isGoalDate(date)||!Number.isInteger(parts)||parts<1||parts>120){
  $('#entryError').textContent='Confira os dados do lançamento.';
  return;
 }
 const id=editingEntryId, month=editingMonth, scope=fields.recurringScope.value;
 if(month&&monthOf(date)!==month){
  $('#entryError').textContent='Escolha um dia dentro do mês desta ocorrência.';
  return;
 }
 const previous=entries.find(item=>item.id===id);
 if(previous&&!previous.recurring&&parts!==previous.parts&&!confirm('Alterar as parcelas modifica o cronograma. Continuar?'))return;
 submit.disabled=true;
 try{
  if(id)await changeStoredEntry(id,current=>{
   if(current.recurring){
    const changes={...current.changes};
    if(scope==='future'){
     for(const key of Object.keys(changes).filter(key=>key>=month))delete changes[key];
     const currentDate=recurringOccurrence(current,month)?.date;
     const regularDate=recurringValues(current,month,false).date;
     const futureDate=data.date===currentDate?regularDate:data.date;
     changes[month]={future:{...data,date:futureDate}};
    }else changes[month]={...changes[month],single:data};
    return {...current,changes};
   }
   const paid=Object.fromEntries(Object.entries(current.paid).filter(([key])=>Number(key)<parts)
    .map(([key,value])=>[recurring?monthOf(date):key,value]));
   return {...data,id,parts,paid,recurring};
  });else await transaction('readwrite',store=>store.add({...data,id:uid(),parts,paid:{},recurring}));
  $('#entryDialog').close();
  if(!id)$('#month').value=monthOf(date);
  await reload();
  setPage('lancamentos');
  notify('Lançamento salvo.');
 }catch(err){$('#entryError').textContent=err.message}
 finally{submit.disabled=false}
}

function changeStoredEntry(id,transform){return updateStoredRecord(STORE,id,transform)}

async function togglePaid(id){
 const split=id.lastIndexOf(':'), entryId=id.slice(0,split), index=id.slice(split+1);
 await changeStoredEntry(entryId,entry=>({...entry,paid:{...entry.paid,[index]:!entry.paid[index]}}));
 await reload();
}

async function removeEntry(id,month){
 const entry=entries.find(item=>item.id===id);
 if(!entry)return;
 if(entry.recurring){
  if(confirm(`Excluir “${entry.description}” deste mês em diante? As ocorrências anteriores serão mantidas.`)){
   await changeStoredEntry(id,current=>({...current,until:month}));
  }else return;
 }else{
  if(!confirm(`Excluir “${entry.description}” e todas as suas parcelas?`))return;
  await transaction('readwrite',store=>store.delete(id));
 }
 await reload();
 notify('Lançamento excluído.');
}
function exportBackup(){const payload={app:'Meu Financeiro',version:1,exportedAt:new Date().toISOString(),entries,goals},blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`meu-financeiro-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function validateImport(data){if(data?.app!=='Meu Financeiro'||data.version!==1||!Array.isArray(data.entries)||data.entries.length>100000)throw Error('Arquivo de backup inválido.');const ids=new Set();for(const e of data.entries){if(typeof e.id!=='string'||!e.id||ids.has(e.id)||typeof e.description!=='string'||!e.description||e.description.length>120||!['expense','income'].includes(e.type)||typeof e.category!=='string'||e.category.length>100||(e.tag!==undefined&&(typeof e.tag!=='string'||e.tag.length>60))||!Number.isFinite(e.amount)||e.amount<=0||!Number.isInteger(e.parts)||e.parts<1||e.parts>120||typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(new Date(e.date+'T12:00:00').getTime())||!e.paid||typeof e.paid!=='object'||Array.isArray(e.paid))throw Error('Backup contém lançamentos inválidos.');validateEntryExtensions(e);ids.add(e.id)}return data.entries}
async function importBackup(file){
 try{
  const data=JSON.parse(await file.text()),items=validateImport(data);
  const importedGoals=data.goals===undefined?null:validateGoals(data.goals);
  const scope=importedGoals===null?'lançamentos':'lançamentos e objetivos';
  if(!confirm(`Substituir os ${scope} atuais pelos dados do backup?`))return;
  await transaction('readwrite',(entryStore,tx)=>{
   entryStore.clear();
   items.forEach(item=>entryStore.put(item));
   if(importedGoals!==null){
    const goalStore=tx.objectStore(GOALS);
    goalStore.clear();
    importedGoals.forEach(goal=>goalStore.put(goal));
   }
  },importedGoals===null?STORE:[STORE,GOALS]);
  await reload();
  notify('Backup importado com sucesso.');
 }catch(err){notify('Não foi possível importar: '+err.message)}
}
async function mergeInvoice(file){try{const data=JSON.parse(await file.text()),items=validateImport(data);const known=new Set(entries.map(e=>e.id));const newItems=items.filter(e=>!known.has(e.id));const skipped=items.length-newItems.length;if(!newItems.length){notify('Nenhum lançamento novo: os IDs já existem.');return}if(!confirm(`Adicionar ${newItems.length} lançamentos ao banco atual, sem apagar os existentes? ${skipped} IDs repetidos serão ignorados. ATENÇÃO: confira se estas compras já foram cadastradas manualmente, pois valores semelhantes podem ser duplicados.`))return;await transaction('readwrite',s=>newItems.forEach(x=>s.add(x)));await reload();$('#month').value='2026-11';setPage('lancamentos');notify(`${newItems.length} lançamentos adicionados. Confira duplicidades e datas.`)}catch(err){notify('Erro ao adicionar lançamentos: '+err.message)}}
async function init(){try{db=await openDB();$('#month').value=today().slice(0,7);$('#entryForm').elements.date.value=today();$('#month').addEventListener('change',render);document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));$('#addBtn').addEventListener('click',openNewEntry);$('#closeDialog').onclick=$('#cancelDialog').onclick=()=>$('#entryDialog').close();$('#entryType').addEventListener('change',()=>updateForm());$('#payment').addEventListener('change',()=>updateForm($('#entryCategory').value));$('#entryForm').addEventListener('input',preview);$('#entryForm').addEventListener('submit',saveEntry);document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.monthStep){
 const fromAnalysis=!!b.closest('.trendHead');
 $('#month').value=monthShift(selectedMonth(),Number(b.dataset.monthStep));
 render();
 if(fromAnalysis)$('.trendHead [data-month-step="'+b.dataset.monthStep+'"]').focus();
}if(b.id==='addGoal')openGoal();if(b.dataset.simulateGoal)openSimulation(b.dataset.simulateGoal);if(b.dataset.planGoal)openPlan(b.dataset.planGoal);if(b.dataset.depositGoal)openDeposit(b.dataset.depositGoal);if(b.dataset.editGoal)openGoal(b.dataset.editGoal);if(b.dataset.deleteGoal)await deleteGoal(b.dataset.deleteGoal);if(b.dataset.edit)openEditEntry(b.dataset.edit,b.dataset.entryMonth);if(b.dataset.toggle)await togglePaid(b.dataset.toggle);if(b.dataset.delete)await removeEntry(b.dataset.delete,b.dataset.entryMonth);if(b.id==='analysisReset'){analysisFilter={category:'',tag:'',status:'all',view:'category'};renderAnalysis()}if(b.dataset.analysisMonth){$('#month').value=b.dataset.analysisMonth;render()}if(b.id==='exportBtn')exportBackup();if(b.id==='importBtn')$('#importFile').click();if(b.id==='mergeBtn')$('#mergeFile').click();if(b.id==='clearBtn'&&confirm('Tem certeza que deseja excluir TODOS os lançamentos? Esta ação não pode ser desfeita.')){await transaction('readwrite',s=>s.clear());await reload();notify('Todos os lançamentos foram excluídos.')}});document.addEventListener('change',e=>{if(e.target.id==='invoiceCard'){invoiceCard=e.target.value;renderInvoices()}if(e.target.id==='tagFilter'){window.activeTagFilter=e.target.value;renderEntries()}const fields={analysisCategory:'category',analysisTag:'tag',analysisStatus:'status',analysisView:'view'};if(fields[e.target.id]){analysisFilter[fields[e.target.id]]=e.target.value;renderAnalysis()}});$('#importFile').addEventListener('change',async e=>{if(e.target.files[0])await importBackup(e.target.files[0]);e.target.value=''});$('#mergeFile').addEventListener('change',async e=>{if(e.target.files[0])await mergeInvoice(e.target.files[0]);e.target.value=''});initPlanningForms();$('#goalForm').addEventListener('submit',saveGoal);$('#depositForm').addEventListener('submit',saveDeposit);$('#cancelDeposit').onclick=()=>$('#depositDialog').close();$('#cancelGoal').onclick=()=>$('#goalDialog').close();updateForm();await reload();setPage('dashboard')}catch(err){$('#notice').textContent='Não foi possível abrir o banco IndexedDB neste navegador. Tente outro navegador ou execute em um servidor local. Detalhe: '+err.message;console.error(err)}}
const MAX_GOAL_CENTS=99999999999;

function isGoalDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value&&value.slice(0,4)!=='0000';
}

function savedForGoal(goal){
 return (goal.deposits??[]).reduce((total,deposit)=>total+deposit.amount,goal.saved);
}

function validateGoals(items){
 if(!Array.isArray(items))throw Error('Lista de objetivos inválida.');
 const ids=new Set();
 for(const goal of items){
  if(!goal||typeof goal.id!=='string'||!goal.id||ids.has(goal.id)||
   typeof goal.name!=='string'||!goal.name.trim()||goal.name.length>100||
   !Number.isSafeInteger(goal.target)||goal.target<1||
   !Number.isSafeInteger(goal.saved)||goal.saved<0||
   Math.max(goal.target,goal.saved)>MAX_GOAL_CENTS||
   (goal.deadline!==undefined&&!isGoalDate(goal.deadline))||
   (goal.installments!==undefined&&(!Number.isInteger(goal.installments)||goal.installments<1||goal.installments>600))){
   throw Error('Confira o nome e os valores do objetivo.');
  }
  const deposits=goal.deposits??[];
  if(!Array.isArray(deposits)||deposits.some(deposit=>!deposit||
   !Number.isSafeInteger(deposit.amount)||deposit.amount<1||deposit.amount>MAX_GOAL_CENTS||
   !isGoalDate(deposit.date)||typeof deposit.description!=='string'||deposit.description.length>100)||
   savedForGoal(goal)>MAX_GOAL_CENTS){
   throw Error('Confira os aportes e o total guardado.');
  }
  if(goal.plans!==undefined&&(!isRecord(goal.plans)||Object.entries(goal.plans)
   .some(([month,amount])=>!isGoalDate(month+'-01')||!Number.isSafeInteger(amount)||amount<1||amount>MAX_GOAL_CENTS))){
   throw Error('Há um aporte planejado inválido.');
  }
  ids.add(goal.id);
 }
 return items;
}

function renderGoals(){
 const cards=goals.map(goal=>{
  const saved=savedForGoal(goal);
  const remaining=Math.max(0,goal.target-saved);
  const percent=Math.min(100,100*saved/goal.target);
  const deposits=[...(goal.deposits??[])].reverse().sort((a,b)=>b.date.localeCompare(a.date));
  return `<article class="card goalCard">
   <h3>${esc(goal.name)}</h3>
   <dl class="goalAmounts">
    <div><dt>Meta</dt><dd>${money(goal.target/100)}</dd></div>
    <div><dt>Guardado</dt><dd class="positive">${money(saved/100)}</dd></div>
    <div><dt>Falta guardar</dt><dd>${money(remaining/100)}</dd></div>
    ${goal.deadline?`<div><dt>Data limite</dt><dd>${fullDate(goal.deadline)}${remaining&&goal.deadline<today()?' <span class="warning">(vencida)</span>':''}</dd></div>`:''}
    ${goal.installments&&remaining?`<div><dt>Valor sugerido</dt><dd>${goal.installments} × ${money(Math.ceil(remaining/goal.installments)/100)}</dd></div>`:''}
   </dl>
   <p class="foot">${remaining===0?'Meta atingida':percent.toLocaleString('pt-BR',{maximumFractionDigits:1})+'% da meta'}</p>
   <progress aria-label="Progresso de ${esc(goal.name)}" max="${goal.target}" value="${Math.min(goal.target,saved)}"></progress>
   ${deposits.length?`<details class="goalHistory"><summary>Histórico de aportes (${deposits.length})</summary>
    <ul>${deposits.map(deposit=>`<li><span>${fullDate(deposit.date)}${deposit.description?` · ${esc(deposit.description)}`:''}</span><strong>${money(deposit.amount/100)}</strong></li>`).join('')}</ul>
   </details>`:''}
   ${goal.plans?.[selectedMonth()]?`<p class="foot">Planejado em ${esc(monthLabel(selectedMonth()))} · ${money(goal.plans[selectedMonth()]/100)}</p>`:''}
   <div class="actions">
    <button type="button" class="smallBtn" data-simulate-goal="${esc(goal.id)}">Simular</button>
    <button type="button" class="smallBtn" data-plan-goal="${esc(goal.id)}">Planejar aporte</button>
    <button type="button" class="smallBtn primary" data-deposit-goal="${esc(goal.id)}">+ Novo aporte</button>
    <button type="button" class="smallBtn" data-edit-goal="${esc(goal.id)}">Editar</button>
    <button type="button" class="smallBtn danger" data-delete-goal="${esc(goal.id)}">Excluir</button>
   </div>
  </article>`;
 }).join('');
 $('#objetivos').innerHTML=`<div class="panel">
  <div class="row"><h3>Meus objetivos</h3><button type="button" id="addGoal" class="primary">+ Novo objetivo</button></div>
  <p class="foot">Planeje aportes para o orçamento e registre os valores efetivamente guardados para atualizar o progresso da meta.</p>
  ${cards?`<div class="goalGrid">${cards}</div>`:'<div class="empty">Nenhum objetivo cadastrado.</div>'}
 </div>`;
}

function openGoal(id){
 const goal=goals.find(item=>item.id===id);
 const form=$('#goalForm');
 editingGoalId=goal?.id??null;
 form.reset();
 $('#goalError').textContent='';
 $('#goalTitle').textContent=goal?'Editar objetivo':'Novo objetivo';
 if(goal){
  form.elements.name.value=goal.name;
  form.elements.target.value=(goal.target/100).toFixed(2);
  form.elements.saved.value=(goal.saved/100).toFixed(2);
  form.elements.deadline.value=goal.deadline??'';
  form.elements.installments.value=goal.installments??'';
 }
 $('#goalDialog').showModal();
}

async function saveGoal(event){
 event.preventDefault();
 const form=event.target;
 const submit=form.querySelector('[type="submit"]');
 const goal={
  id:editingGoalId??uid(),
  name:form.elements.name.value.trim(),
  target:Math.round(Number(form.elements.target.value)*100),
  saved:Math.round(Number(form.elements.saved.value)*100),
  deadline:form.elements.deadline.value||undefined,
  installments:form.elements.installments.valueAsNumber||undefined
 };
 submit.disabled=true;
 try{
  validateGoals([goal]);
  if(editingGoalId)await updateGoal(editingGoalId,current=>({...current,...goal}));
  else await transaction('readwrite',store=>store.add(goal),GOALS);
  $('#goalDialog').close();
  await reload();
  notify('Objetivo salvo.');
 }catch(err){$('#goalError').textContent=err.message}
 finally{submit.disabled=false}
}

async function deleteGoal(id){
 const goal=goals.find(item=>item.id===id);
 if(!goal||!confirm(`Excluir “${goal.name}” e remover seus aportes do histórico e do planejamento mensal?`))return;
 try{
  await transaction('readwrite',store=>store.delete(id),GOALS);
  await reload();
  notify('Objetivo excluído.');
 }catch(err){notify('Não foi possível excluir o objetivo: '+err.message)}
}

function openDeposit(id){
 const goal=goals.find(item=>item.id===id);
 if(!goal)return;
 depositGoalId=id;
 const form=$('#depositForm');
 form.reset();
 form.elements.date.value=today();
 form.elements.date.max=today();
 $('#depositError').textContent='';
 $('#depositTitle').textContent='Novo aporte · '+goal.name;
 $('#depositDialog').showModal();
}

async function saveDeposit(event){
 event.preventDefault();
 const form=event.target;
 const submit=form.querySelector('[type="submit"]');
 const deposit={
  amount:Math.round(form.elements.amount.valueAsNumber*100),
  date:form.elements.date.value,
  description:form.elements.description.value.trim()
 };
 submit.disabled=true;
 try{
  if(deposit.date>today())throw Error('Informe a data de um aporte já realizado.');
  await updateGoal(depositGoalId,goal=>({...goal,deposits:[...(goal.deposits??[]),deposit]}));
  $('#depositDialog').close();
  await reload();
  notify('Aporte registrado.');
 }catch(err){$('#depositError').textContent=err.message}
 finally{submit.disabled=false}
}

function updateGoal(id,change){
 return updateStoredRecord(GOALS,id,current=>validateGoals([change(current)])[0]);
}

async function updateStoredRecord(storeName,id,change){
 let failure;
 try{
  await transaction('readwrite',(store,tx)=>{
   const request=store.get(id);
   request.onsuccess=()=>{
    try{
     if(!request.result)throw Error('Registro não encontrado.');
     store.put(change(request.result));
    }catch(err){
     failure=err;
     tx.abort();
    }
   };
  },storeName);
 }catch(err){throw failure??err}
}


function isRecord(value){
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}

function validateEntryExtensions(entry){
 const validCard=item=>item.card===undefined||(typeof item.card==='string'&&item.card.length<=60);
 const validMonth=month=>isGoalDate(month+'-01');
 const validRevision=item=>isRecord(item)&&isGoalDate(item.date)&&Number.isFinite(item.amount)&&item.amount>0&&
  typeof item.description==='string'&&item.description.trim()&&item.description.length<=120&&
  ['income','expense'].includes(item.type)&&typeof item.category==='string'&&item.category.length<=100&&
  typeof item.tag==='string'&&item.tag.length<=60&&validCard(item);
 if(!validCard(entry)||(entry.recurring!==undefined&&typeof entry.recurring!=='boolean')||
  (entry.recurring&&(entry.parts!==1||!isGoalDate(entry.date)||
   (entry.until!==undefined&&!validMonth(entry.until))||
   (entry.changes!==undefined&&(!isRecord(entry.changes)||Object.entries(entry.changes).some(([month,change])=>
    !validMonth(month)||!isRecord(change)||(!change.single&&!change.future)||
    (change.single!==undefined&&!validRevision(change.single))||
    (change.future!==undefined&&!validRevision(change.future)))))))){
  throw Error('Backup contém cartão ou recorrência inválida.');
 }
}

function sumCents(rows){
 return rows.reduce((total,item)=>total+Math.round(item.amount*100),0);
}

function goalCashFlow(month){
 return goals.reduce((total,goal)=>{
  const planned=goal.plans?.[month]??0;
  const actual=(goal.deposits??[]).filter(item=>monthOf(item.date)===month)
   .reduce((amount,item)=>amount+item.amount,0);
  total.planned+=planned;
  total.actual+=actual;
  total.committed+=Math.max(planned,actual);
  return total;
 },{planned:0,actual:0,committed:0});
}

function renderMonthlyPlan(month){
 const rows=inMonth(month), cash=goalCashFlow(month);
 const income=rows.filter(item=>item.type==='income');
 const expense=rows.filter(item=>item.type==='expense');
 const projected=sumCents(income)-sumCents(expense)-cash.committed;
 const actual=sumCents(income.filter(item=>item.paid))-sumCents(expense.filter(item=>item.paid))-cash.actual;
 const lines=[
  ['Receitas',sumCents(income),sumCents(income.filter(item=>item.paid))],
  ['Despesas',sumCents(expense),sumCents(expense.filter(item=>item.paid))],
  ['Aportes',cash.committed,cash.actual],
  ['Saldo após aportes',projected,actual]
 ];
 return `<div class="panel"><div class="row"><h3>Planejamento mensal</h3><button type="button" data-go-to-goals>Gerenciar aportes</button></div>
 <p class="planningBalance ${projected<0?'negative':'positive'}">${projected<0?'Déficit projetado':'Sobra após contas e aportes'} · ${money(Math.abs(projected)/100)}</p>
 <div class="tableWrap"><table><thead><tr><th>Movimento</th><th>Previsto</th><th>Realizado</th></tr></thead><tbody>
 ${lines.map(([label,expected,confirmed])=>`<tr><th scope="row">${label}</th><td>${money(expected/100)}</td><td>${money(confirmed/100)}</td></tr>`).join('')}
 </tbody></table></div>
 <p class="foot">O realizado usa os lançamentos confirmados e os aportes registrados. O previsto inclui os aportes realizados e ${money((cash.committed-cash.actual)/100)} ainda a aportar.</p></div>`;
}

function cardOf(item){
 if(item.type!=='expense')return '';
 return item.card||(/^cart[aã]o de cr[eé]dito$/i.test(item.tag.trim())?'Cartão de crédito (sem identificação)':'');
}

function renderInvoices(){
 const month=selectedMonth();
 const months=Array.from({length:12},(_,index)=>monthShift(month,index));
 const byMonth=months.map(key=>inMonth(key).filter(cardOf));
 const cards=[...new Set(byMonth.flatMap(rows=>rows.map(cardOf)))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 if(!cards.includes(invoiceCard))invoiceCard='';
 const filtered=byMonth.map(rows=>rows.filter(item=>!invoiceCard||cardOf(item)===invoiceCard));
 const next=filtered.findIndex(rows=>rows.some(item=>!item.paid));
 const due=next<0?null:months[next];
 const rows=filtered[0];
 const group=invoiceCard?[invoiceCard]:cards.filter(name=>rows.some(item=>cardOf(item)===name));
 const projections=filtered.map((items,index)=>{
  const pending=items.filter(item=>!item.paid);
  const installments=items.filter(item=>item.total>1);
  return `<tr><td>${esc(monthLabel(months[index]))}</td><td>${money(sumCents(items)/100)}</td>
   <td>${money(sumCents(pending)/100)}</td><td>${money(sumCents(installments)/100)}</td></tr>`;
 }).join('');
 $('#faturas').innerHTML=`<div class="panel"><div class="row"><h3>Faturas por vencimento</h3><label>Cartão
 <select id="invoiceCard"><option value="">Todos os cartões</option>${cards.map(name=>`<option value="${esc(name)}" ${invoiceCard===name?'selected':''}>${esc(name)}</option>`).join('')}</select></label></div>
 <p class="foot">Preencha o campo Cartão nos lançamentos e informe a data de vencimento da fatura. Lançamentos com a tag Cartão de crédito e sem nome aparecem como cartão sem identificação.</p>
 <div class="grid2">
 ${card('Faturas do mês selecionado',money(sumCents(rows)/100),esc(monthLabel(month)))}
 ${card('Próxima fatura pendente',due?money(sumCents(filtered[next].filter(item=>!item.paid))/100):'—',due?`${esc(monthLabel(due))} · total de ${money(sumCents(filtered[next])/100)}`:'Nenhum saldo pendente nos 12 meses exibidos')}
 </div></div>
 <div class="panel"><h3>Compromissos por mês</h3><div class="tableWrap"><table><thead><tr><th>Vencimento</th><th>Total</th><th>Pendente</th><th>Em parcelas</th></tr></thead><tbody>${projections}</tbody></table></div></div>
 <div class="panel"><h3>Compras do mês selecionado</h3>${rows.length?group.map(name=>`<h4>${esc(name)}</h4>${table(rows.filter(item=>cardOf(item)===name))}`).join(''):'<div class="empty">Nenhuma compra de cartão neste mês.</div>'}</div>`;
}

function monthIndex(month){
 const [year,number]=month.split('-').map(Number);
 return year*12+number-1;
}

function goalSimulation(remaining,start,deadline,monthly,extra){
 const needed=Math.max(0,remaining-extra);
 if(!needed)return {months:1,monthly:0,month:start};
 if(deadline){
  const months=monthIndex(monthOf(deadline))-monthIndex(start)+1;
  if(months<1)return null;
  return {months,monthly:Math.ceil(needed/months),month:monthOf(deadline)};
 }
 if(!monthly)return null;
 const months=Math.ceil(needed/monthly);
 if(monthIndex(start)+months-1>monthIndex('9999-12'))return null;
 return {months,monthly,month:monthShift(start,months-1)};
}

function openSimulation(id){
 const goal=goals.find(item=>item.id===id);
 if(!goal)return;
 simulationGoalId=id;
 const form=$('#simulationForm');
 form.reset();
 form.elements.deadline.value=goal.deadline??'';
 $('#simulationTitle').textContent='Simular · '+goal.name;
 $('#simulationMonth').textContent='Primeiro aporte em '+monthLabel(simulationStart())+'. O aporte extra, se informado, entra nesse mês.';
 renderSimulation();
 $('#simulationDialog').showModal();
}

function simulationStart(){return [selectedMonth(),monthOf(today())].sort().at(-1)}

function renderSimulation(){
 const form=$('#simulationForm'), fields=form.elements;
 const goal=goals.find(item=>item.id===simulationGoalId);
 const byDate=fields.mode.value==='deadline';
 $('#simulationDeadline').classList.toggle('hidden',!byDate);
 $('#simulationBudget').classList.toggle('hidden',byDate);
 if(!goal)return;
 const start=simulationStart(), remaining=Math.max(0,goal.target-savedForGoal(goal));
 const extra=Math.round((fields.extra.valueAsNumber||0)*100);
 const deadline=byDate?fields.deadline.value:'';
 const monthly=byDate?0:Math.round((fields.budget.valueAsNumber||0)*100);
 const output=$('#simulationResult');
 if(!remaining){output.textContent='Meta atingida.';return}
 if(!fields.extra.validity.valid||(!byDate&&!fields.budget.validity.valid)){
  output.textContent='Confira os valores informados.';
  return;
 }
 if(deadline&&(!isGoalDate(deadline)||deadline<today()||monthOf(deadline)<start)){
  output.textContent='Escolha uma data a partir do primeiro mês de aporte.';
  return;
 }
 const result=goalSimulation(remaining,start,deadline,monthly,extra);
 if(!result){
  output.textContent=byDate?'Informe a data limite.':'Informe um aporte mensal que permita estimar o prazo.';
  return;
 }
 output.textContent=result.monthly
  ? `${money(result.monthly/100)} por mês · ${result.months} ${result.months===1?'mês':'meses'} · conclusão estimada em ${monthLabel(result.month)}.`
  : `O aporte extra cobre o saldo restante em ${monthLabel(result.month)}.`;
}

function openPlan(id){
 const goal=goals.find(item=>item.id===id);
 if(!goal)return;
 planGoalId=id;
 const form=$('#planForm');
 form.reset();
 form.elements.month.value=selectedMonth();
 $('#planTitle').textContent='Planejar aporte · '+goal.name;
 $('#planError').textContent='';
 fillPlannedAmount();
 $('#planDialog').showModal();
}

function fillPlannedAmount(){
 const form=$('#planForm'), goal=goals.find(item=>item.id===planGoalId);
 const planned=goal?.plans?.[form.elements.month.value];
 form.elements.amount.value=planned===undefined?'':(planned/100).toFixed(2);
}

async function savePlan(event){
 event.preventDefault();
 const form=event.target, month=form.elements.month.value;
 const amount=Math.round(form.elements.amount.valueAsNumber*100);
 const button=form.querySelector('[type="submit"]');
 button.disabled=true;
 try{
  if(!isGoalDate(month+'-01')||!Number.isSafeInteger(amount)||amount<0||amount>MAX_GOAL_CENTS)throw Error('Confira o mês e o valor planejado.');
  await updateGoal(planGoalId,goal=>{
   const plans={...goal.plans};
   if(amount===0)delete plans[month];
   else plans[month]=amount;
   return {...goal,plans};
  });
  $('#planDialog').close();
  await reload();
  notify('Planejamento atualizado.');
 }catch(err){$('#planError').textContent=err.message}
 finally{button.disabled=false}
}

function initPlanningForms(){
 $('#closeSimulation').onclick=()=>$('#simulationDialog').close();
 $('#simulationForm').addEventListener('input',renderSimulation);
 $('#simulationForm').addEventListener('submit',event=>event.preventDefault());
 $('#closePlan').onclick=()=>$('#planDialog').close();
 $('#planForm').elements.month.addEventListener('change',fillPlannedAmount);
 $('#planForm').addEventListener('submit',savePlan);
 $('#dashboard').addEventListener('click',event=>{
  if(event.target.closest('[data-go-to-goals]'))setPage('objetivos');
 });
}

window.startFinanceiro=init;
