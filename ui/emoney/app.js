
(() => {
'use strict';
const ART = Object.freeze(window.__EMONEY_ART);
let localLanguage='en';
try {localLanguage=localStorage.getItem('emoney-nav-language')==='hi'?'hi':'en';}catch{};
let themeMode='system';
try {themeMode=['light','dark','system'].includes(localStorage.getItem('emoney-theme'))?localStorage.getItem('emoney-theme'):'system';}catch{};

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const money = v => `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
const num = v => Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:6});
const dt = v => v ? new Date(v).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
const activeStatuses = ['Awaiting Deposit','Detected','Confirming','USDT Confirmed','INR Processing','Late Review'];
const bankDistributionStatuses = new Set(['Detected','Confirming','USDT Confirmed','INR Processing','Late Review']);
const icon = name => ico(name);
const state = {mode:'live',authMode:'login',challengeId:null,user:null,profile:null,rates:null,methods:[],orders:[],rewards:{balance:0,lifetimeEarned:0,ledger:[]},campaigns:[],wheel:null,referrals:null,tickets:[],notifications:[],unreadCount:0,twoFactor:null,sessions:[],page:'overview',_wheelAngle:0,_wheelResult:null,sellType:'UPI',selectedMethodId:null,quote:null,orderFilter:'All',refresh:null};

function toast(message,error=false){const t=$('#toast');t.textContent=message;t.className='toast show'+(error?' error':'');clearTimeout(t._t);t._t=setTimeout(()=>t.className='toast',2600)}
function applyTheme(){const dark=themeMode==='dark'||(themeMode==='system'&&window.matchMedia?.('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=dark?'#0d1a15':'#fcfbf7'}
applyTheme();
try{window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(themeMode==='system')applyTheme()});}catch{}
async function api(path, options = {}) {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid API path.');
  if (!/^https?:$/.test(location.protocol)) throw new Error('Open eMoney through the configured app server. Offline sign-in is not available.');
  const epoch = refreshVersion;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const headers = { ...(options.body ? {'Content-Type': 'application/json'} : {}), ...(options.headers || {}) };
  const { allow401, ...requestOptions } = options;
  try {
    const response = await fetch('/api/digirupee' + path, { ...requestOptions, headers, credentials: 'include', cache: 'no-store', signal: controller.signal });
    let payload;
    try { payload = await response.json(); }
    catch { throw Object.assign(new Error('The server returned an unreadable response. Please retry.'), {status: response.status}); }
    if (epoch !== refreshVersion) throw Object.assign(new Error('Account session changed.'), {stale: true});
    if (response.status === 401 && !allow401) {
      showAuth('Your session expired. Please sign in again.');
      throw Object.assign(new Error('Please sign in again.'), {status: 401});
    }
    if (!response.ok) throw Object.assign(new Error(payload?.error || `Request failed (${response.status}).`), {status: response.status});
    return payload || {};
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out. Please check your connection and retry.');
    if (error instanceof TypeError) throw new Error('Cannot reach the server. Please check your internet connection.');
    throw error;
  } finally { clearTimeout(timeout); }
}

function showAuth(message = '') {
  refreshVersion++;
  clearInterval(state.refresh);
  closeModal();
  // Do not leave another user's rewards, referrals, bank data or security secrets in the DOM.
  Object.assign(state, {user:null,profile:null,methods:[],orders:[],rates:null,rewards:{balance:0,lifetimeEarned:0,ledger:[]},campaigns:[],wheel:null,permanent:null,referrals:null,tickets:[],notifications:[],unreadCount:0,twoFactor:null,sessions:[],quote:null,challengeId:null,page:'overview',_amount:'',_pendingOrder:null,_orderKey:null,_spinKey:null,_creating:false,_spinning:false,_claiming:false,_activeOrderId:null,_orderSearch:'',_wheelAngle:0,_wheelResult:null,orderFilter:'All'});
  document.body.classList.remove('reward-mode');
  for (const node of $$('.page')) node.replaceChildren();
  $('#topAvatar').replaceChildren(); $('#notifDot').classList.add('hidden');
  $('#mobileNav').replaceChildren(); $('#modePill').textContent='';
  $('#appView').classList.add('hidden'); $('#authView').classList.remove('hidden');
  $('#authForm').classList.remove('hidden'); $('#twoFactorForm').classList.add('hidden');
  $('#password').value=''; $('#password').type='password'; $('#twoFactorCode').value='';
  $('#twoFactorMessage').textContent=''; $('#alternateAuth').hidden=false; $('#newAccountLabel').hidden=false;
  switchAuth('login'); $('#authMessage').textContent=message; window.scrollTo(0,0);
}
function enterApp() {
  $('#authView').classList.add('hidden'); $('#appView').classList.remove('hidden');
  renderAll(); go(state.page); clearInterval(state.refresh);
  state.refresh=setInterval(() => {if (state.user&&!document.hidden) refreshAll(true);}, 15000);
}
async function authenticate(result) {
  if (!result?.user) throw new Error('Sign-in did not return an account. Please retry.');
  refreshVersion++;
  state.user=result.user; state.profile=result.profile||null; state.page='overview';
  $('#password').value=''; $('#twoFactorCode').value=''; state.challengeId=null;
  $('#alternateAuth').hidden=false; $('#newAccountLabel').hidden=false;
  try { sessionStorage.removeItem('emoney-pending-referral'); } catch {}
  enterApp();
  if(state.profile?.notificationPreference!==false)window.DigiAndroid?.requestNotificationPermission?.();
  await refreshAll(false);
}
async function refreshAll(silent = false) {
  if (refreshBusy || !state.user) return;
  refreshBusy=true;
  const epoch=refreshVersion;
  const paths=['/me','/rates','/payout-methods','/orders','/rewards','/campaigns','/wheel','/referrals','/support','/notifications?limit=100','/notifications/unread-count','/security/2fa/status','/rewards/permanent'];
  try {
    const results=await Promise.allSettled(paths.map(path=>api(path)));
    if(epoch!==refreshVersion || !state.user)return;
    if(results[0].status==='fulfilled') {state.user=results[0].value.user;state.profile=results[0].value.profile;}
    const assign=(index,fn)=>{if(results[index].status==='fulfilled')fn(results[index].value);};
    assign(1,r=>state.rates=r); assign(2,r=>state.methods=r.payoutMethods||[]);
    assign(3,r=>state.orders=r.orders||[]); assign(4,r=>state.rewards=r);
    assign(5,r=>state.campaigns=r.campaigns||[]); assign(6,r=>state.wheel=r);
    assign(7,r=>state.referrals=r); assign(8,r=>state.tickets=r.tickets||[]);
    assign(9,r=>state.notifications=r.notifications||[]);
    assign(10,r=>state.unreadCount=Number(r.count??r.unreadCount??0));
    assign(11,r=>state.twoFactor=r); assign(12,r=>state.permanent=r.program||null);
    state.lastUpdated=Date.now(); surfaceNativeNotifications();
    $('#notifDot').classList.toggle('hidden',!state.unreadCount);
    if(!document.activeElement?.matches('input,textarea,select')&&!$('#modalBackdrop').classList.contains('show')) renderAll();
    const failure=results.slice(0,12).find(r=>r.status==='rejected');
    if(failure&&!silent&&!failure.reason?.stale)toast('Some account information could not refresh. Please retry.',true);
  } finally {refreshBusy=false;}
}

function renderPage(page){if(page==='overview')renderOverview();if(page==='sell')renderSell();if(page==='orders')renderOrders();if(page==='rewards')renderRewards();if(page==='profile')renderProfile()}
function completed(){return state.orders.filter(o=>o.status==='Completed')}function active(){return state.orders.filter(o=>activeStatuses.includes(o.status))}function statStatus(s){return s==='Completed'?'done':['Expired','Failed','Rejected'].includes(s)?'bad':s==='Late Review'?'warn':'active'}
function orderRow(o){return `<button class="list-item" data-order="${esc(o.id)}"><b>${num(o.usdtAmount)} USDT · ${money(o.inrAmount)}</b><small>${esc(o.id)} · ${dt(o.createdAt)}</small>${pillStatus(o.status)}</button>`}
function bindOrders(){$$('[data-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.order))}

function mobileOrderRow(o){return `<button class="mobile-order" data-order="${esc(o.id)}"><span class="rate-icon ${o.payoutType==='BANK'?'bank':''}">${ico(o.payoutType==='BANK'?'bank':'upi')}</span><span class="mobile-order-copy"><b>${o.payoutType==='BANK'?'Bank transfer':'UPI transfer'}</b><small>${num(o.usdtAmount)} USDT · ${shortDate(o.createdAt)}</small></span><span class="mobile-order-money"><b>${money(o.inrAmount)}</b>${pillStatus(o.status)}</span></button>`}

function eligibleMethods(){return state.methods.filter(m=>m.type===state.sellType&&m.enabled)}

function timeLeft(ms){const t=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`}
function renderQr(o){const holder=$('#activeQr');if(!holder||!o.depositAddress||false)return;try{const c=document.createElement('canvas');c.dataset.size='180';c.setAttribute('aria-label','Assigned TRON deposit address QR code');window.eMoneyQr.render(c,o.depositAddress);holder.replaceChildren(c)}catch{holder.innerHTML=`${ico('qr')}<span>Use the address shown beside this code.</span>`}}
async function createSellOrder() {
  if(state._creating)return;
  state._creating=true; const epoch=refreshVersion;
  const button=$('#createSell'); if(button){button.disabled=true;button.textContent='Preparing your order…';}
  for(const node of $$('#page-sell [data-type],#sellAmount,#maxBtn,#page-sell [data-amount]'))node.disabled=true;
  try {
    if(!state._pendingOrder) {
      const amount=Number(state._amount||0),enabled=eligibleMethods();
      const minimum=Number(state.rates?.limits?.[state.sellType==='UPI'?'upiMinUsdt':'bankMinUsdt']||0);
      if(!Number.isFinite(amount)||amount<=0)throw new Error('Enter a valid USDT amount.');
      if(minimum>0&&amount<minimum)throw new Error(`Minimum deposit ${num(minimum)} USDT required.`);
      if(!enabled.length)throw new Error('Add and enable a receiving method first.');
      if(state.rates?.channels?.[state.sellType.toLowerCase()]===false)throw new Error('This transfer option is currently unavailable.');
      const result=await api('/quotes',{method:'POST',body:JSON.stringify({payoutType:state.sellType,usdtAmount:amount,payoutMethodIds:enabled.map(m=>m.id)})});
      if(!result.quote?.quoteId)throw new Error('The server did not return a valid quote.');
      state.quote=result.quote;
      state._pendingOrder={quoteId:result.quote.quoteId,amount,payoutType:state.sellType,key:[...crypto.getRandomValues(new Uint8Array(18))].map(b=>b.toString(16).padStart(2,'0')).join('')};
    }
    // Keep the same key after a network timeout: never duplicate a possibly-created order.
    const pending=state._pendingOrder;
    const result=await api('/orders',{method:'POST',headers:{'Idempotency-Key':pending.key},body:JSON.stringify({quoteId:pending.quoteId})});
    if(!result.order?.id)throw new Error('The order response was incomplete. Retry to recover the same request.');
    if(epoch!==refreshVersion)return;
    state.orders=[result.order,...state.orders.filter(o=>o.id!==result.order.id)];
    state._activeOrderId=result.order.id;state._amount='';state.quote=null;state._pendingOrder=null;
    renderAll();go('sell');toast('Order created. Use the exact amount and assigned TRON address.');
    setTimeout(()=>$('#activeDeposit')?.scrollIntoView({behavior:'smooth',block:'start'}),60);
  } catch(error) {
    if(epoch!==refreshVersion)return;
    if(error.status>=400&&error.status<500&&error.status!==408&&error.status!==429)state._pendingOrder=null;
    const message=error.message+(state._pendingOrder?' Retry will recover this same order request.':'');
    if($('#sellError'))$('#sellError').textContent=message;toast(message,true);
  } finally {
    if(epoch===refreshVersion){state._creating=false;for(const node of $$('#page-sell [data-type],#sellAmount,#maxBtn,#page-sell [data-amount]'))node.disabled=!!state._pendingOrder;const b=$('#createSell');if(b){const minimum=Number(state.rates?.limits?.[state.sellType==='UPI'?'upiMinUsdt':'bankMinUsdt']||0);b.disabled=!!state._pendingOrder||Number(state._amount||0)<minimum||!eligibleMethods().length;b.innerHTML=(state._pendingOrder?'Retry order request':'Create Sell Order')+' '+uiIcon('arrow');}}
  }
}

function openOrder(id){
 const o=state.orders.find(x=>x.id===id);if(!o)return;const refs=o.payout?.references||o.payout?.allocations||[];
 modal('Transaction details',esc(o.id),`<div class="detail-head"><div class="detail-total">${money(o.inrAmount)}<small>${num(o.usdtAmount)} USDT · ${esc(o.payoutType)} transfer</small></div>${pillStatus(o.status)}</div><div class="detail-grid"><div class="list-item"><span>Confirmations</span><b>${Number(o.confirmations||0)} / ${Number(o.requiredConfirmations||19)}</b></div><div class="list-item"><span>USDT received</span><b>${o.receivedUsdt==null?'Awaiting deposit':num(o.receivedUsdt)}</b></div></div><div class="list"><div class="list-item"><b>${('Assigned TRON address')}</b><small>${esc(o.depositAddress||'Not assigned')}</small></div><div class="list-item"><b>Transaction hash</b><small>${esc(o.txId||'Not detected yet')}</small></div></div>${o.review?`<div class="notice" style="margin-top:12px">${esc(o.review.reason||'This order needs manual review.')}</div>`:''}<div class="section-head" style="margin-top:23px"><h3>Order timeline</h3></div><div class="timeline">${(o.timeline||[]).map(t=>`<div class="tl"><span class="tl-dot">✓</span><div><b>${esc(t.status)}</b><small>${dt(t.at)}</small></div></div>`).join('')||empty('No events yet.')}</div>${refs.length?`<div class="section-head" style="margin-top:25px"><h3>Transfer references</h3></div><div class="list">${refs.map(r=>`<div class="list-item"><b>${esc(r.mode)} · ${esc(r.reference)}</b><small>${money(r.inrAmount??Number(r.inrPaise||0)/100)}</small></div>`).join('')}</div>`:''}${o.payoutType==='BANK'&&o.flexibleBankAllocation&&bankDistributionStatuses.has(o.status)?`<button class="btn btn-secondary full" id="bankDistribution" style="margin-top:20px">Manage bank distribution</button>`:''}${(!['Completed','Failed','Rejected'].includes(o.status))?`<button class="btn btn-ghost full" id="checkTx" style="margin-top:12px">Check a transaction hash</button>`:''}${activeStatuses.includes(o.status)?`<button class="btn btn-secondary full" id="viewDeposit" style="margin-top:12px">Open deposit</button>`:''}`);
 if($('#bankDistribution'))$('#bankDistribution').onclick=()=>bankAllocationForm(o);if($('#checkTx'))$('#checkTx').onclick=()=>checkTransactionForm(o);if($('#viewDeposit'))$('#viewDeposit').onclick=()=>{state._activeOrderId=o.id;state.sellType=o.payoutType;closeModal();go('sell');$('#activeDeposit')?.scrollIntoView({behavior:'smooth',block:'start'})};
}

async function claimTask(taskId,campaignId) {
  const campaign=state.campaigns.find(c=>c.id===campaignId);
  const task=campaign?.tasks?.find(t=>t.id===taskId);
  if(!task||task.claim||!canClaimTask(task))return;
  if(state._claiming)return;state._claiming=true;
  try{await api(`/campaigns/${encodeURIComponent(campaignId)}/claim`,{method:'POST',body:JSON.stringify({taskId})});await refreshAll(true);toast('Task claim submitted.');}
  catch(error){toast(error.message,true);}finally{state._claiming=false;}
}
async function spinWheel() {
  if(!state.wheel?.canSpin||state._spinning)return;
  state._spinning=true;state._wheelResult=null;const epoch=refreshVersion;
  renderRewards();
  try {
    if(!state._spinKey)state._spinKey=[...crypto.getRandomValues(new Uint8Array(18))].map(b=>b.toString(16).padStart(2,'0')).join('');
    const response=await api('/wheel/spin',{method:'POST',headers:{'Idempotency-Key':state._spinKey}});
    const result=response.result||{};
    const segments=(state.wheel?.segments||[]).filter(segment=>segment&&segment.id);
    const winnerIndex=segments.findIndex(segment=>String(segment.id)===String(result.segmentId));
    if(winnerIndex<0)throw new Error('The server returned an unknown wheel result. Please retry.');
    const wheel=$('#spinWheel');
    const segmentAngle=360/segments.length;
    const winnerCenter=-90+(winnerIndex+.5)*segmentAngle;
    const currentAngle=Number(state._wheelAngle||0);
    const correction=(((-90-winnerCenter-currentAngle)%360)+360)%360;
    const finalAngle=currentAngle+5*360+correction;
    const reduced=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration=reduced?180:4200;
    if(wheel){
      wheel.classList.remove('is-pending');wheel.style.animation='none';wheel.style.transition=`transform ${duration}ms cubic-bezier(.12,.72,.18,1)`;
      requestAnimationFrame(()=>{wheel.style.transform=`rotate(${finalAngle}deg)`});
    }
    state._wheelAngle=finalAngle;
    await new Promise(resolve=>setTimeout(resolve,duration+40));
    if(epoch!==refreshVersion||!state.user)return;
    state._spinKey=null;state._wheelResult=result;state._spinning=false;
    await refreshAll(true);renderRewards();
  } catch(error){
    if(epoch===refreshVersion){if(error.status>=400&&error.status<500&&error.status!==429)state._spinKey=null;state._spinning=false;renderRewards();toast(error.message,true);}
  }
}


function bindActions(){
 // Actions use the single delegated listener below; no duplicate handlers.
 $$('[data-copy]').forEach(b=>b.onclick=()=>copyText(b.dataset.copy));$$('[data-open-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.openOrder));
}

function modal(title,sub,body){
 modalVersion++;
 if(!$('#modalBackdrop').classList.contains('show'))lastFocus=document.activeElement;
 $('#modal').innerHTML=`<div class="modal-head"><div><h3 id="modalTitle">${title}</h3><p>${sub||''}</p></div><button class="close" data-close aria-label="Back">${ico('back')}</button></div>${body}`;$('#modalBackdrop').classList.add('show');document.body.style.overflow='hidden';$$('[data-close]').forEach(b=>b.onclick=closeModal);$('#modal').scrollTop=0;setTimeout(()=>$('#modal').focus({preventScroll:true}),10);
}
function closeModal() {
  modalVersion++;
  const open=$('#modalBackdrop').classList.contains('show');
  $('#modalBackdrop').classList.remove('show'); $('#modal').replaceChildren();
  document.body.style.overflow='';
  if(open&&lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
}
$('#modalBackdrop').addEventListener('click',e=>{if(e.target===$('#modalBackdrop'))closeModal()});
async function copyText(value) {
  if(!value)return;
  try {
    if(window.DigiAndroid?.copyText){window.DigiAndroid.copyText(String(value));toast('Copied to clipboard');return;}
    if(!navigator.clipboard)throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(String(value));toast('Copied to clipboard');
  } catch {modal('Copy this value','Select and copy the text below.',`<textarea class="control" readonly id="copyValue">${esc(value)}</textarea>`);setTimeout(()=>{$('#copyValue')?.focus();$('#copyValue')?.select();},30);}
}
function openPayoutMethods(){
 modal('Your receiving accounts','Choose where your INR transfers can arrive.',`<div class="row"><button class="btn btn-primary" id="addUpi">${ico('plus')}Add UPI</button><button class="btn btn-ghost" id="addBank">${ico('plus')}Add Bank Account</button></div><div style="margin-top:20px">${state.methods.map(m=>`<div class="payment-entry"><span class="rate-icon ${m.type==='BANK'?'bank':''}">${ico(m.type==='BANK'?'bank':'upi')}</span><div class="payment-entry-content"><b>${esc(m.type==='UPI'?m.upiId:(m.bankName||m.label))}</b><small>${esc(m.holderName)}${m.type==='BANK'?' · ••'+esc(String(m.accountNumber||'').slice(-4))+' · '+esc(m.ifsc):''}</small><small>${money(m.minInr)}–${money(m.maxInr)} / trade<br>${money(m.remainingDailyInr??m.dailyLimitInr)} available today</small><div class="list-actions"><button class="btn btn-ghost" data-edit-method="${esc(m.id)}">Edit details</button><button class="btn btn-danger" data-delete-method="${esc(m.id)}">Delete</button></div></div><button class="toggle ${m.enabled?'on':''}" data-toggle-method="${esc(m.id)}" role="switch" aria-checked="${!!m.enabled}" aria-label="${m.enabled?'Disable':'Enable'} receiving method"></button></div>`).join('')||empty('Add your first UPI ID or bank account.')}</div>`);
 $('#addUpi').onclick=()=>openMethodForm('UPI');$('#addBank').onclick=()=>openMethodForm('BANK');$$('[data-toggle-method]').forEach(b=>b.onclick=()=>toggleMethod(b.dataset.toggleMethod));$$('[data-delete-method]').forEach(b=>b.onclick=()=>confirmDeleteMethod(b.dataset.deleteMethod));$$('[data-edit-method]').forEach(b=>b.onclick=()=>{const m=state.methods.find(x=>x.id===b.dataset.editMethod);openMethodForm(m.type,m)});
}
function openMethodForm(type,method=null){
 const bank=type==='BANK';state._editMethodId=method?.id||null;
 modal(`${method?'Edit':'Add'} ${bank?'bank account':'UPI ID'}`,('Your details are validated by your existing backend.'),`<form id="methodForm"><div class="field"><label for="mHolder">Account holder name</label><input id="mHolder" class="control" maxlength="80" value="${esc(method?.holderName||'')}" required></div><div class="field"><label for="mMobile">Mobile number</label><input id="mMobile" class="control" inputmode="tel" value="${esc(method?.mobile||'')}" maxlength="16" required></div>${bank?`<div class="field"><label for="mBank">Bank name</label><input id="mBank" class="control" value="${esc(method?.bankName||'')}" required></div><div class="field"><label for="mAccount">Account number ${method?'(leave blank to keep unchanged)':''}</label><input id="mAccount" class="control" inputmode="numeric" pattern="[0-9]{6,24}" ${method?'':'required'}></div><div class="field"><label for="mAccountConfirm">Confirm account number</label><input id="mAccountConfirm" class="control" inputmode="numeric" ${method?'':'required'}></div><div class="field"><label for="mIfsc">IFSC code</label><input id="mIfsc" class="control" value="${esc(method?.ifsc||'')}" maxlength="11" pattern="[A-Za-z]{4}0[A-Za-z0-9]{6}" required></div>`:`<div class="field"><label for="mUpi">UPI ID</label><input id="mUpi" class="control" placeholder="name@bank" value="${esc(method?.upiId||'')}" pattern="[^\\s@]+@[^\\s@]+" required></div>`}<div class="row"><div class="field"><label for="mMin">Minimum per trade (INR)</label><input id="mMin" class="control" type="number" min="1" step="0.01" value="${Number(method?.minInr||1000)}" required></div><div class="field"><label for="mMax">Maximum per trade (INR)</label><input id="mMax" class="control" type="number" min="1" step="0.01" value="${Number(method?.maxInr||500000)}" required></div></div><div class="field"><label for="mDaily">Daily limit (INR)</label><input id="mDaily" class="control" type="number" min="1" step="0.01" value="${Number(method?.dailyLimitInr||2000000)}" required></div><div class="auth-message" id="methodError" role="alert"></div><div class="row"><button class="btn btn-ghost" id="cancelMethod" type="button">Cancel</button><button class="btn btn-primary" type="submit">Save method</button></div></form>`);$('#methodForm').onsubmit=e=>saveMethod(e,type);$('#cancelMethod').onclick=openPayoutMethods;
}
async function saveMethod(e,type){
 e.preventDefault();const b=e.submitter;b.disabled=true;
 try{const id=state._editMethodId;const old=state.methods.find(m=>m.id===id);const body={type,label:old?.label||(type==='BANK'?`Bank ••${$('#mAccount').value.slice(-4)}`:'UPI'),holderName:$('#mHolder').value.trim(),mobile:$('#mMobile').value.trim(),minInr:Number($('#mMin').value),maxInr:Number($('#mMax').value),dailyLimitInr:Number($('#mDaily').value)};
 if(!body.holderName)throw new Error('Enter the account holder name.');if(!/^\+?[0-9\s-]{8,16}$/.test(body.mobile))throw new Error('Enter a valid mobile number.');if(body.maxInr<body.minInr)throw new Error('Maximum must be at least the minimum.');if(body.dailyLimitInr<body.maxInr)throw new Error('Daily limit must be at least the per-trade maximum.');
 if(type==='BANK'){if($('#mAccount').value!==$('#mAccountConfirm').value)throw new Error('Account numbers do not match.');Object.assign(body,{bankName:$('#mBank').value.trim(),ifsc:$('#mIfsc').value.trim().toUpperCase()});if($('#mAccount').value.trim())body.accountNumber=$('#mAccount').value.trim()}else body.upiId=$('#mUpi').value.trim();
 await api(id?`/payout-methods/${encodeURIComponent(id)}`:'/payout-methods',{method:id?'PATCH':'POST',body:JSON.stringify(body)});
 closeModal();await refreshAll(true);renderAll();openPayoutMethods();toast('Receiving account saved.');
 }catch(error){$('#methodError').textContent=error.message}finally{b.disabled=false}
}
async function toggleMethod(id){try{const m=state.methods.find(x=>x.id===id);await api(`/payout-methods/${encodeURIComponent(id)}/status`,{method:'PATCH',body:JSON.stringify({enabled:!m.enabled})});await refreshAll(true);openPayoutMethods();toast('Receiving account updated')}catch(e){toast(e.message,true)}}
async function deleteMethod(id){try{await api(`/payout-methods/${encodeURIComponent(id)}`,{method:'DELETE'});await refreshAll(true);openPayoutMethods();toast('Receiving account deleted')}catch(e){toast(e.message,true)}}
function openProfileEdit(){modal('Edit profile','Update your eMoney display name and mobile number.',`<form id="profileForm"><div class="field"><label>FULL NAME</label><input id="pName" class="control" value="${esc(state.profile?.fullName||'')}" required></div><div class="field"><label>MOBILE</label><input id="pMobile" class="control" value="${esc(state.profile?.mobile||'')}" required></div><button class="btn btn-primary full">Save profile</button></form>`);$('#profileForm').onsubmit=saveProfile}
async function saveProfile(e){e.preventDefault();try{const body={fullName:$('#pName').value.trim(),mobile:$('#pMobile').value.trim()};{const r=await api('/profile',{method:'PATCH',body:JSON.stringify(body)});state.profile=r.profile}closeModal();renderAll();toast('Profile updated')}catch(e2){toast(e2.message,true)}}
function openSecurity(){const enabled=!!state.twoFactor?.enabled;modal('Two-factor authentication','Authenticator app and recovery code protection.',enabled?`<div class="notice">2FA is enabled. ${esc(state.twoFactor?.backupCodesRemaining??0)} recovery codes remaining.</div><button id="disable2fa" class="btn btn-danger full" style="margin-top:12px">Disable 2FA</button>`:`<div class="notice">Protect sign-in with a time-based authenticator code.</div><button id="setup2fa" class="btn btn-primary full" style="margin-top:12px">Set up 2FA</button>`);if(enabled)$('#disable2fa').onclick=disable2faForm;else $('#setup2fa').onclick=setup2fa}
async function setup2fa(){
 try{;
 const r=await api('/security/2fa/setup',{method:'POST'});modal('Set up your authenticator','Scan the code or enter the secret in your authenticator app.',`<div class="qr" id="authQr" style="margin:0 auto 20px;width:170px;height:170px"></div><div class="notice info"><span class="small">Manual setup key</span><br><code>${esc(r.secret)}</code></div><div class="field" style="margin-top:18px"><label for="enableCode">Authenticator verification code</label><input id="enableCode" class="control" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div><div class="auth-message" id="securityError"></div><button id="enable2fa" class="btn btn-primary full">Verify & enable</button>`);try{const canvas=document.createElement('canvas');canvas.dataset.size=240;eMoneyQr.render(canvas,r.otpauthUri);$('#authQr').replaceChildren(canvas)}catch{$('#authQr').textContent='Use the manual key below.'}$('#enable2fa').onclick=enable2fa;
 }catch(e){toast(e.message,true)}
}
async function enable2fa(){
 try{const code=$('#enableCode').value.trim();if(!code)throw new Error('Enter a verification code.');;
 const r=await api('/security/2fa/enable',{method:'POST',body:JSON.stringify({code})});modal('Save your recovery codes','Store these safely. They are shown only once.',`<div class="notice info"><code>${(r.recoveryCodes||[]).map(esc).join('<br>')}</code></div><button class="btn btn-primary full" style="margin-top:18px" data-close>I saved my recovery codes</button>`);await refreshAll(true);
 }catch(e){if($('#securityError'))$('#securityError').textContent=e.message;else toast(e.message,true)}
}
function disable2faForm(){modal('Disable 2FA','Confirm with your password and authenticator/recovery code.',`<div class="field"><label>CURRENT PASSWORD</label><input id="dPass" type="password" class="control"></div><div class="field"><label>CODE</label><input id="dCode" class="control"></div><button id="dConfirm" class="btn btn-danger full">Disable 2FA</button>`);$('#dConfirm').onclick=disable2fa}
async function disable2fa(){
 try{if(!$('#dPass').value||!$('#dCode').value.trim())throw new Error('Enter your password and verification code.');await api('/security/2fa/disable',{method:'POST',body:JSON.stringify({currentPassword:$('#dPass').value,code:$('#dCode').value.trim()})});closeModal();await refreshAll(true);renderAll();toast('2FA disabled.')}catch(e){toast(e.message,true)}
}
async function openSessions(){const request=++modalVersion;try{const r=await api('/security/sessions');if(request!==modalVersion)return;state.sessions=r.sessions||[];modal('Login & devices','Review active sessions and change your password.',`<div class="list">${state.sessions.map(s=>`<div class="list-item"><b>${esc(s.device)} ${s.current?'· Current':''}</b><small>Created ${dt(s.createdAt)} · Last seen ${dt(s.lastSeenAt)}</small>${s.current?'':`<div class="list-actions"><button class="btn btn-danger btn-sm" data-revoke="${esc(s.id)}">Revoke</button></div>`}</div>`).join('')||'<div class="notice">No active sessions.</div>'}</div><button id="revokeOthers" class="btn btn-ghost full" style="margin-top:12px">Revoke other sessions</button><div class="section-head" style="margin-top:20px"><h3>Change password</h3></div><div class="field"><label>CURRENT PASSWORD</label><input id="curPass" class="control" type="password"></div><div class="field"><label>NEW PASSWORD</label><input id="newPass" class="control" type="password"></div><button id="changePass" class="btn btn-secondary full">Change password</button>`);$$('[data-revoke]').forEach(b=>b.onclick=()=>revokeSession(b.dataset.revoke));$('#revokeOthers').onclick=revokeOtherSessions;$('#changePass').onclick=changePassword}catch(e){toast(e.message,true)}}
async function revokeSession(id){try{await api(`/security/sessions/${encodeURIComponent(id)}`,{method:'DELETE'});toast('Session revoked.');openSessions()}catch(e){toast(e.message,true)}}
async function revokeOtherSessions(){try{await api('/security/sessions/revoke-others',{method:'POST'});toast('Other sessions revoked.');openSessions()}catch(e){toast(e.message,true)}}
async function changePassword(){try{const currentPassword=$('#curPass').value,newPassword=$('#newPass').value;if(!currentPassword)throw new Error('Enter your current password.');if(newPassword.length<8)throw new Error('Your new password must have at least 8 characters.');if(currentPassword===newPassword)throw new Error('Choose a different new password.');await api('/security/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});toast(('Password changed.'));openSessions()}catch(e){toast(e.message,true)}}
async function openSupport(){const request=++modalVersion;try{const r=await api('/support');if(request!==modalVersion)return;state.tickets=r.tickets||[];modal('Help & support','Create a ticket and follow replies from the support team.',`<button id="newTicket" class="btn btn-primary full">Create support ticket</button><div class="list" style="margin-top:12px">${state.tickets.map(t=>`<button class="list-item" style="text-align:left" data-ticket="${esc(t.id)}"><b>${esc(t.subject)}</b><small>${esc(t.category)} · ${esc(t.status)} · ${dt(t.updatedAt)}</small></button>`).join('')||'<div class="notice">No support tickets.</div>'}</div>`);$('#newTicket').onclick=newTicketForm;$$('[data-ticket]').forEach(b=>b.onclick=()=>openTicket(b.dataset.ticket))}catch(e){toast(e.message,true)}}
function newTicketForm(){modal('New support ticket','Send a message to the support team.',`<form id="ticketForm"><div class="field"><label>CATEGORY</label><select id="tCat" class="control"><option>ORDER</option><option>DEPOSIT</option><option value="PAYOUT">Bank or UPI transfer</option><option>ACCOUNT</option><option>OTHER</option></select></div><div class="field"><label>SUBJECT</label><input id="tSub" class="control" required></div><div class="field"><label>ORDER ID · OPTIONAL</label><input id="tOrder" class="control"></div><div class="field"><label>MESSAGE</label><textarea id="tMsg" class="control" required></textarea></div><button class="btn btn-primary full">Submit ticket</button></form>`);$('#ticketForm').onsubmit=createTicket}
async function createTicket(e){e.preventDefault();try{const body={category:$('#tCat').value,subject:$('#tSub').value.trim(),orderId:$('#tOrder').value.trim()||undefined,message:$('#tMsg').value.trim()};await api('/support',{method:'POST',body:JSON.stringify(body)});toast('Support ticket created');openSupport()}catch(e2){toast(e2.message,true)}}
async function openTicket(id){try{let t;t=(await api(`/support/${encodeURIComponent(id)}`)).ticket;if(!t)return;modal(esc(t.subject),`${esc(t.category)} · ${esc(t.status)}`,`<div class="list">${(t.messages||[]).map(m=>`<div class="list-item"><b>${m.senderType==='admin'?'Support team':'You'}</b><small>${dt(m.createdAt)}</small><div style="margin-top:8px;font-size:12px;line-height:1.55">${esc(m.text)}</div></div>`).join('')}</div>${t.status==='Closed'?'<div class="notice" style="margin-top:12px">This ticket is closed.</div>':`<div class="field" style="margin-top:12px"><label>REPLY</label><textarea id="ticketReply" class="control"></textarea></div><div class="row"><button id="replyTicket" class="btn btn-primary">Reply</button><button id="closeTicket" class="btn btn-danger">Close ticket</button></div>`}`);if(t.status!=='Closed'){ $('#replyTicket').onclick=()=>replyTicket(id);$('#closeTicket').onclick=()=>closeTicket(id)}}catch(e){toast(e.message,true)}}
async function replyTicket(id){try{const msg=$('#ticketReply').value.trim();if(!msg)throw new Error('Write a message before sending.');await api(`/support/${encodeURIComponent(id)}/messages`,{method:'POST',body:JSON.stringify({message:msg})});toast('Reply sent.');openTicket(id)}catch(e){toast(e.message,true)}}
async function closeTicket(id){try{await api(`/support/${encodeURIComponent(id)}/close`,{method:'POST'});toast('Ticket closed.');openSupport()}catch(e){toast(e.message,true)}}
async function openNotifications(){const request=++modalVersion;try{const r=await api('/notifications?limit=100');if(request!==modalVersion)return;state.notifications=r.notifications||[];modal('Notifications','Trade, transfer, reward and account updates.',`<button id="readAll" class="btn btn-ghost full">Mark all as read</button><div class="list" style="margin-top:12px">${state.notifications.map(n=>`<button class="list-item" style="text-align:left" data-notif="${esc(n.id)}"><b>${esc(n.title)} ${n.readAt?'':'•'}</b><small>${esc(n.message)}<br>${dt(n.createdAt)}</small></button>`).join('')||'<div class="notice">No notifications.</div>'}</div>`);$('#readAll').onclick=readAllNotifications;$$('[data-notif]').forEach(b=>b.onclick=()=>markNotification(b.dataset.notif))}catch(e){toast(e.message,true)}}
async function markNotification(id){try{{await api(`/notifications/${encodeURIComponent(id)}/read`,{method:'PATCH'});const n=state.notifications.find(x=>x.id===id);if(n)n.readAt=Date.now();state.unreadCount=state.notifications.filter(x=>!x.readAt).length}$('#notifDot').classList.toggle('hidden',!state.unreadCount);openNotifications()}catch(e){toast(e.message,true)}}
async function readAllNotifications(){try{{await api('/notifications/read-all',{method:'POST'});state.unreadCount=0}$('#notifDot').classList.add('hidden');openNotifications();toast('All notifications marked as read.')}catch(e){toast(e.message,true)}}
async function toggleNotifications(){try{const enabled=state.profile?.notificationPreference!==false;if(!enabled)window.DigiAndroid?.requestNotificationPermission?.();{const r=await api('/profile',{method:'PATCH',body:JSON.stringify({notificationPreference:!enabled})});state.profile=r.profile}renderAll();toast(enabled?'Optional alerts muted':'Optional alerts enabled')}catch(e){toast(e.message,true)}}
async function logout() {
  try{await api('/auth/logout',{method:'POST',allow401:true});}
  catch(error){toast('Could not confirm server logout. Please check your connection.',true);return;}
  showAuth('');document.title='eMoney';
}
const glyphs={
  overview:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/>',
  sell:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
  orders:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 11h6m-6 5h6"/>',
  rewards:'<path d="M4 10h16v11H4zM3 6h18v4H3zM12 6v15"/><path d="M12 6C4 6 5 0 8 2c2 1 4 4 4 4Zm0 0c8 0 7-6 4-4-2 1-4 4-4 4Z"/>',
  profile:'<circle cx="12" cy="8" r="3.5"/><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2"/>',
  arrow:'<path d="M4 12h15m-5-5 5 5-5 5"/>',
  bank:'<path d="m3 8 9-5 9 5v2H3zM5 11v7m5-7v7m4-7v7m5-7v7M3 21h18M3 18h18"/>',
  wallet:'<path d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v13a2 2 0 0 0 2 2h15V7"/><path d="M20 11h-5v5h5M16 13.5h1"/>',
  upi:'<path d="m8 3 9 9-9 9V3Zm8 0 5 9-5 9M3 8v8"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9ZM10 21h4"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  help:'<path d="M4 14v-2a8 8 0 0 1 16 0v2M20 17v1a3 3 0 0 1-3 3h-4"/><rect x="2" y="11" width="4" height="7" rx="2"/><rect x="18" y="11" width="4" height="7" rx="2"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  check:'<path d="m6 12 4 4 8-9"/><circle cx="12" cy="12" r="9.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M7 14h3m4 0h3m-10 3h3"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  quote:'<path d="M4 6h16v14H4zM7 3v6m10-6v6M8 13h8m-8 4h5"/>',
  logout:'<path d="M9 3H5v18h4m5-14 5 5-5 5m-5-5h10"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  device:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4m-3 14h2"/>',
  qr:'<path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6v-6ZM12 3v3m0 6h9M3 12h6m3 3v6"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.4 7a8 8 0 0 1 14 3M4.6 14a8 8 0 0 0 14 3"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>'
};
function ico(name){if(name==='back')return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m6-6-6 6 6 6"/></svg>'; return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name]||glyphs.overview}</svg>`}
function initials(name){return String(name||'Your account').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function shortDate(t){return new Date(t).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}
function pageHeader(title,sub,action=''){return `<div class="greeting"><div><h2>${title}</h2><p>${sub}</p></div>${action}</div>`}
function datePill(){return `<span class="date-filter">${ico('calendar')}${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span>`}
function pillStatus(s){return `<span class="status ${statStatus(s)}">${esc(s)}</span>`}
function empty(msg){return `<div class="empty-state">${ico('orders')}${esc(msg)}</div>`}
function bindJumps(){$$('[data-jump]').forEach(b=>b.onclick=()=>{go(b.dataset.jump);window.scrollTo(0,0)})}
function balanceAmount(value){const parts=Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).split('.');return `₹${parts[0]}<small>.${parts[1]}</small>`}

const authConnection='live';
let lastFocus=null,refreshBusy=false,refreshVersion=0,modalVersion=0;

// Authentication is performed only by the server.

function bankAllocationForm(o){
 if(!bankDistributionStatuses.has(o?.status)){toast('Bank distribution is available after the deposit is detected.',true);return;}
 const banks=state.methods.filter(m=>m.type==='BANK'&&m.enabled);const toPaise=value=>Math.round(Number(value||0)*100);const expectedPaise=toPaise(o.inrAmount);const expected=expectedPaise/100;
 modal('Bank distribution','Only saved bank accounts can receive this order.',`<div class="notice">Expected INR: <b>${money(expected)}</b></div><div class="bank-distribution-summary"><span>Distributed <b id="distributedInr">${money(0)} / ${money(expected)}</b></span><span>Remaining <b id="remainingInr">${money(expected)}</b></span></div><form id="allocationForm"><div class="list">${banks.map(m=>`<label class="list-item allocation-row"><span><b>${esc(m.bankName||m.label)}</b><small>${esc(m.holderName)} - account ending ${esc(String(m.accountNumber||'').slice(-4))}</small></span><input class="control allocation-input" data-alloc="${esc(m.id)}" inputmode="decimal" type="number" min="0" max="${expected}" step="0.01" placeholder="0" value="${Number((o.allocations||[]).find(a=>a.payoutMethodId===m.id)?.inrAmount||0)}"></label>`).join('')||empty('Add and enable a bank account first.')}</div><div id="allocationError" class="auth-message" role="alert"></div><button class="btn btn-primary full" id="saveAllocation" type="submit" ${banks.length?'':'disabled'}>Save distribution</button></form>`);
 const inputs=$$('.allocation-input'),save=$('#saveAllocation'),error=$('#allocationError');
 const update=()=>{const distributedPaise=inputs.reduce((sum,input)=>sum+Math.max(0,toPaise(input.value)),0),remainingPaise=Math.max(0,expectedPaise-distributedPaise);$('#distributedInr').textContent=`${money(distributedPaise/100)} / ${money(expectedPaise/100)}`;$('#remainingInr').textContent=money(remainingPaise/100);const valid=distributedPaise===expectedPaise;if(error)error.textContent=distributedPaise>expectedPaise?'Distribution cannot exceed the expected INR amount.':distributedPaise<expectedPaise?'Assign the full expected INR before saving.':'';if(save)save.disabled=!valid;return valid};
 inputs.forEach(input=>input.oninput=update);update();
 $('#allocationForm').onsubmit=async e=>{e.preventDefault();if(!update())return;const allocations=inputs.filter(input=>toPaise(input.value)>0).map(input=>({payoutMethodId:input.dataset.alloc,inrAmount:toPaise(input.value)/100}));try{const result=await api(`/orders/${encodeURIComponent(o.id)}/bank-allocations`,{method:'PATCH',body:JSON.stringify({allocations})});state.orders=state.orders.map(item=>item.id===o.id?(result.order||item):item);closeModal();openOrder(o.id);toast('Bank distribution saved.')}catch(err){if(error)error.textContent=err.message;}};
}

function checkTransactionForm(o){modal('Check your deposit','Enter the TRON transaction hash from your sending wallet.',`<form id="txForm"><div class="field"><label for="txId">Transaction hash</label><input id="txId" class="control" pattern="[a-fA-F0-9]{64}" maxlength="64" required placeholder="64-character transaction hash"></div><div class="auth-message" id="txError"></div><button class="btn btn-primary full">Check transaction</button></form>`);$('#txForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const r=await api(`/orders/${encodeURIComponent(o.id)}/tx`,{method:'POST',body:JSON.stringify({txId:$('#txId').value.trim()})});if(r.order)state.orders=state.orders.map(x=>x.id===o.id?r.order:x);openOrder(o.id);toast(r.matched?'Deposit matched':'No matching deposit yet. Check again later.')}catch(err){if($('#txError'))$('#txError').textContent=err.message}finally{b.disabled=false}}}

function rewardRows(limit=Infinity){const entries=state.rewards?.ledger||state.rewards?.recent||[];return entries.slice(0,limit).map(x=>`<div class="history-row"><div><b>${esc(x.description||x.sourceType||'Reward')}</b><small>${dt(x.createdAt)}</small></div><strong>${x.direction==='debit'?'−':'+'}${num(x.amount)} USDT</strong></div>`).join('')||empty('Your reward activity will appear here.')}
function openRewardHistory(){modal('Your reward ledger','Every credit and debit, in one place.',rewardRows())}
function openReferrals(){const ref=state.referrals||{};modal('Referral activity','Keep track of your invites.',`<div class="ref-code"><span>${esc(ref.referralCode||'Not assigned')}</span><button class="btn-text" data-copy="${esc(ref.webUrl||ref.referralCode||'')}">${ico('copy')}Copy link</button></div><div class="list" style="margin-top:18px">${(ref.referrals||[]).map(x=>`<div class="list-item"><b>${esc(x.referred?.name||x.referred?.id||'Referred account')}</b><small>${esc(x.status)} · ${dt(x.createdAt)} · ${num(x.inviterReward||0)} USDT earned</small></div>`).join('')||empty('No referral activity to display.')}</div>`);bindActions()}


function openSearch(){
 modal('Find your way.','Search pages, order IDs, statuses or receiving accounts.',`<label class="order-search">${ico('search')}<input id="globalSearch" style="width:100%" placeholder="Try bank or an order ID" aria-label="Search pages and transactions"></label><div id="searchResults" class="search-results"></div>`);
 const update=()=>{const q=$('#globalSearch').value.trim().toLowerCase();const pages=[['Overview','overview'],['Sell USDT','sell'],['Transactions','orders'],['Rewards','rewards'],['My account','profile']];let items=pages.filter(x=>!q||x[0].toLowerCase().includes(q)).map(([label,page])=>({label,sub:'Page',fn:()=>{closeModal();go(page);window.scrollTo(0,0)}}));if(!q||'payout methods bank upi'.includes(q))items.push({label:'Receiving accounts',sub:'Manage',fn:openPayoutMethods});if(!q||'support help'.includes(q))items.push({label:'Help & support',sub:'Get help',fn:openSupport});if(q)items=items.concat(state.orders.filter(o=>[o.id,o.status,o.payoutType].join(' ').toLowerCase().includes(q)).slice(0,8).map(o=>({label:o.id,sub:o.status,fn:()=>openOrder(o.id)})));$('#searchResults').innerHTML=items.map((x,i)=>`<button data-search-result="${i}">${ico('search')}${esc(x.label)}<small>${esc(x.sub)}</small>${ico('chevron')}</button>`).join('')||empty('No results. Try a different search.');$$('[data-search-result]').forEach(b=>b.onclick=items[Number(b.dataset.searchResult)].fn)};$('#globalSearch').oninput=update;update();setTimeout(()=>$('#globalSearch')?.focus(),30);
}
function exportOrders(){
 const rows=[['Order ID','Created','Status','Channel','USDT amount','INR amount'],...state.orders.map(o=>[o.id,new Date(o.createdAt).toISOString(),o.status,o.payoutType,o.usdtAmount,o.inrAmount])];const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';const content=rows.map(row=>row.map(cell).join(',')).join('\r\n');if(window.DigiAndroid?.shareText){window.DigiAndroid.shareText(content);toast('Choose where to share your transaction export.');return}const url=URL.createObjectURL(new Blob(['\ufeff'+content],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='emoney-'+((''))+'transactions.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Transaction export prepared.');
}
function confirmLogout(){modal('Sign out of eMoney?','You can sign back in whenever you need.',`<div class="modal-actions"><button class="btn btn-ghost" data-close>Stay here</button><button class="btn btn-primary" id="confirmSignout">Sign out</button></div>`);$('#confirmSignout').onclick=logout}

function confirmDeleteMethod(id){const m=state.methods.find(x=>x.id===id);if(!m)return;modal('Delete this receiving account?',esc(m.type==='UPI'?m.upiId:(m.bankName||m.label)),`<div class="notice">This removes the saved destination. Your backend may block deletion when the method is in use by an active order.</div><div class="modal-actions"><button class="btn btn-ghost" id="cancelDelete">Keep method</button><button class="btn btn-danger" id="doDelete">Delete method</button></div>`);$('#cancelDelete').onclick=openPayoutMethods;$('#doDelete').onclick=()=>deleteMethod(id)}

// Presentation layer. The existing API adapter and transaction/authentication actions are retained.
function art(name,cls='',alt=''){return `<img src="${ART[name]}" class="${cls}" alt="${alt}" draggable="false">`}
function tokenIcon(){return art('usdt','usdt-icon','USDT')}
function uiIcon(name){const paths={
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/>',
 send:'<path d="m3 10 18-7-7 18-3-8-8-3Z"/><path d="m11 13 10-10"/>',
 user:'<circle cx="12" cy="7.5" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3H4Z"/>',
 orders:'<path d="M5 3h10l4 4v14H5V3Z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>',
 gift:'<path d="M4 10h16v11H4zM3 6h18v4H3zM12 6v15"/><path d="M12 6C5 7 5-1 9 2l3 4ZM12 6c7 1 7-7 3-4l-3 4Z"/>',
 shield:'<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
 bell:'<path d="M6 9a6 6 0 0 1 12 0c0 6 3 7 3 8H3c0-1 3-2 3-8ZM10 21h4"/>',
 bank:'<path d="m2 8 10-6 10 6H2ZM4 21h16M6 10v8m6-8v8m6-8v8M3 19h18"/>',
 check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M5 7h14M5 17h14M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z"/>',
 crown:'<path d="M4 19 2 7l6 4 4-8 4 8 6-4-2 12H4Z"/>',
 bars:'<path d="M5 14v5M12 9v10M19 4v15" stroke-width="5"/>',
 wallet:'<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 6V4l14-2v4m4 6h-7v5h7M17 14h.01"/>',
 help:'<path d="M4 15v-3a8 8 0 0 1 16 0v3M3 11h4v8H3zM17 11h4v8h-4zM19 19c0 2-3 3-7 3"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
 desktop:'<rect x="2" y="3" width="16" height="13" rx="1"/><path d="M7 16v4M3 20h11"/><rect x="16" y="10" width="6" height="11" rx="1"/>',
 group:'<circle cx="9" cy="7" r="3"/><path d="M2 20v-3a7 7 0 0 1 14 0v3H2M17 4a3 3 0 0 1 0 6m2 3a6 6 0 0 1 3 6v1h-4"/>',
 filter:'<path d="M3 3h18l-7 8v9l-4-2v-7L3 3Z"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 share:'<circle cx="18" cy="4" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="20" r="3"/><path d="m9 10 6-4m-6 8 6 4"/>',
 logout:'<path d="M9 3H3v18h6m4-16 7 7-7 7m-7-7h14"/>'
};return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.check}</svg>`}
function liveSpark(){return `<svg class="rates-graph" viewBox="0 0 190 56" fill="none" aria-hidden="true"><defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#31a982" stop-opacity=".25"/><stop offset="1" stop-color="#31a982" stop-opacity="0"/></linearGradient></defs><path d="M1 51C12 31 24 44 35 32S49 44 65 35 74 11 88 21 105 38 119 31 131 30 140 18 155-4 162 12 175 11 189 1V56H1Z" fill="url(#fade)"/><path d="M1 51C12 31 24 44 35 32S49 44 65 35 74 11 88 21 105 38 119 31 131 30 140 18 155-4 162 12 175 11 189 1" stroke="#1c9c74" stroke-width="1.8"/></svg>`}
function screenHeading(title,sub,cls=''){return `<div class="page-heading ${cls}"><h1>${title}</h1><p>${sub}</p></div>`}
function renderNav(){
 const navs=[['overview','Home','home'],['sell','Sell','send'],['orders','Orders','orders'],['rewards','Rewards','gift'],['profile','Profile','user']];
 $('#mobileNav').innerHTML=navs.map(([id,label,i])=>`<button data-page="${id}" class="${state.page===id?'active':''}" ${state.page===id?'aria-current="page"':''}><span class="nav-icon">${uiIcon(i)}</span><span class="nav-label">${label}</span></button>`).join('');
 $$('[data-page]').forEach(b=>b.onclick=()=>{go(b.dataset.page);window.scrollTo({top:0,behavior:'instant'})});applyNavLanguage();
}
function go(page){
 if(!['overview','sell','orders','rewards','profile'].includes(page))return;
 state.page=page;document.body.classList.toggle('reward-mode',page==='rewards');
 $$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));renderNav();
 const map={overview:'Home',sell:'Sell USDT',orders:'Orders',rewards:'Rewards',profile:'My Profile'};
 $('#topTitle').textContent=map[page];document.title=`${map[page]} · eMoney`;renderPage(page);bindActions();
}
function renderAll(){
 $('#topAvatar').innerHTML=uiIcon('user');$('#modePill').textContent=('Connected');
 $('#notifDot').classList.toggle('hidden',!state.unreadCount);
 renderNav();for(const page of ['overview','sell','orders','rewards','profile']){if(page===state.page&&document.activeElement?.matches(`#page-${page} input,#page-${page} textarea,#page-${page} select`))continue;renderPage(page)}bindActions();
}
function switchAuth(mode){
 state.authMode=mode;const reg=mode==='register';document.body.classList.toggle('register-mode',reg);
 $('#loginTab').classList.toggle('active',!reg);$('#registerTab').classList.toggle('active',reg);$('#loginTab').setAttribute('aria-selected',String(!reg));$('#registerTab').setAttribute('aria-selected',String(reg));
 $('#registerFields').classList.toggle('hidden',!reg);$('#refField').classList.toggle('hidden',!reg);$('#fullName').required=reg;$('#mobile').required=reg;$('#password').autocomplete=reg?'new-password':'current-password';
 $('#authTitle').textContent=reg?'Create Account':'Welcome Back';$('#authSub').textContent=reg?'A brighter way to manage your money.':'Sign in to your eMoney account';
 $('#authSubmit').innerHTML=(reg?'Create Account':'Sign In')+uiIcon('arrow');$('#authMessage').textContent='';
 $('#newAccountLabel').textContent=reg?'Already have an account?':'New to eMoney?';$('#alternateAuth').textContent=reg?'Sign In':'Create Account';
}
function quickOrderRow(o){const done=o.status==='Completed';return `<button class="quick-order" data-order="${esc(o.id)}">${tokenIcon()}<span><b>${num(o.usdtAmount)} USDT</b><small>${money(o.inrAmount)}</small></span><span><span class="order-mini-status ${done?'':'waiting'}">${uiIcon(done?'check':'clock')}${done?'Completed':esc(o.status==='INR Processing'?'Processing':o.status)}</span><small>${dt(o.createdAt)}</small></span>${uiIcon('chevron')}</button>`}
function renderOverview(){
 const c=completed(),payout=c.reduce((s,o)=>s+Number(o.payout?.paidInrPaise!=null?o.payout.paidInrPaise/100:o.inrAmount||0),0),volume=c.reduce((s,o)=>s+Number(o.usdtAmount||0),0),name=(state.profile?.fullName||'there').split(' ')[0];
 $('#page-overview').innerHTML=`<div class="page-heading home-heading"><div class="hello">Good to see you,</div><h1>${esc(name)}<span class="wave" aria-hidden="true">👋</span></h1><p>Smarter Digital Money. Brighter Possibilities.</p></div>
 <div class="money-summary dark-card"><div class="money-left"><div class="eyebrow">Total INR Received <button id="hideAmounts" aria-label="${state._hideBalance?'Show':'Hide'} amounts">${ico('eye')}</button></div><div class="large-currency">${state._hideBalance?'₹••,•••':money(payout)}</div><div class="volume-pill"><span class="mini-token">₮</span>${state._hideBalance?'••••':num(volume)} USDT <span style="color:#c8dacd"> · completed</span></div></div><button class="money-right" data-jump="rewards">${uiIcon('bars')}<span>Total Rewards</span><strong>${num(state.rewards?.balance)} <small>USDT</small></strong><em>Keep going! ${uiIcon('chevron')}</em></button></div>
 <div class="card rates-card"><div class="rates-head"><strong>Live USDT Rates</strong><button class="rates-refresh" data-action="rates">Refresh ${ico('refresh')}</button></div><div class="rate-grid"><div class="rate-card"><span class="rate-card-icon">${uiIcon('send')}</span><div><b>UPI</b><strong>${money(state.rates?.rates?.upi)}</strong><small>Minimum ${num(state.rates?.limits?.upiMinUsdt)} USDT</small></div></div><div class="rate-card"><span class="rate-card-icon bank">${uiIcon('bank')}</span><div><b>Bank</b><strong>${money(state.rates?.rates?.bank)}</strong><small>Minimum ${num(state.rates?.limits?.bankMinUsdt)} USDT</small></div></div></div></div>${rewardTickerMarkup()}${nextBonusMarkup()}
 <button class="main-sell dark-card" data-jump="sell"><span class="plane">${uiIcon('send')}</span><span><b>Sell USDT</b><small>Receive INR in your UPI or bank account</small></span>${uiIcon('chevron')}</button>
 ${accountSnapshotMarkup()}
 <div class="card recent-card"><div class="section-head"><h3>Recent Orders</h3><button class="btn-text" data-jump="orders">View All ${uiIcon('chevron')}</button></div><div class="order-list">${state.orders.slice(0,3).map(quickOrderRow).join('')||empty('Your orders will appear here.')}</div></div>
 <button class="refer-teaser" data-jump="rewards">${art('giftSmall','','Gift box')}<span><b>Refer & Earn Together</b><small>Invite your friends. Track your referral rewards.</small></span>${uiIcon('chevron')}</button>`;
 $('#hideAmounts').onclick=()=>{state._hideBalance=!state._hideBalance;renderOverview()};bindJumps();bindOrders();bindActions();
}

function renderSell(){
 const orderLocked=!!state._pendingOrder||state._creating;
 const methods=eligibleMethods(),type=state.sellType,min=Number(state.rates?.limits?.[type==='UPI'?'upiMinUsdt':'bankMinUsdt']||0),rate=Number(state.rates?.rates?.[type.toLowerCase()]||0),amount=Number(state._amount||0),total=Math.round(amount*rate*100)/100;
 const o=state.orders.find(x=>x.id===state._activeOrderId&&x.payoutType===type)||state.orders.find(x=>x.payoutType===type&&activeStatuses.includes(x.status))||null,choices=[min,min*2,min*5,min*10].filter((n,i,a)=>n>0&&n<=Number(state.rates?.limits?.globalMaxUsdt||0)&&a.indexOf(n)===i);
 const method=methods[0],methodName=type==='UPI'?(methods.length===1?method?.upiId:methods.length+' enabled UPI IDs'):(methods.length===1?method?.bankName:methods.length+' enabled banks');
 $('#page-sell').innerHTML=`${screenHeading('Sell USDT','Convert your USDT to INR. Clear. Simple. Secure.','sell-heading')}
 <div class="payout-tabs" role="tablist"><button data-type="UPI" ${orderLocked?'disabled':''} role="tab" aria-selected="${type==='UPI'}" class="${type==='UPI'?'active':''}">${uiIcon('send')}<span><b>UPI</b><small>Receive INR in your UPI</small></span></button><button data-type="BANK" ${orderLocked?'disabled':''} role="tab" aria-selected="${type==='BANK'}" class="${type==='BANK'?'active':''}">${uiIcon('bank')}<span><b>Bank Transfer</b><small>Direct to your bank account</small></span></button></div>
 <div class="sell-rate-strip"><div class="sell-rate-card"><span>${type==='UPI'?'UPI':'Bank'} rate</span><strong>${money(rate)} <small>/ USDT</small></strong></div><div class="sell-minimum"><span>Minimum deposit</span><strong>${num(min)} USDT</strong><small>Maximum ${num(state.rates?.limits?.globalMaxUsdt)} USDT</small></div></div> <div class="card amount-panel"><div class="amount-inner"><label class="amount-label" for="sellAmount">You Sell</label><div class="amount-entry"><input id="sellAmount" ${orderLocked?'disabled':''} inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(state._amount||'')}" aria-label="USDT amount"><span class="token-select">${tokenIcon()}USDT ${uiIcon('chevron')}</span></div></div><div class="amount-chips">${choices.map(n=>`<button data-amount="${n}" ${orderLocked?'disabled':''} class="${amount===n?'active':''}">${num(n)}</button>`).join('')}<button id="maxBtn" ${orderLocked?'disabled':''}>MAX</button></div><div class="amount-limits"><span>Min ${num(min)} USDT</span><span>Max ${num(state.rates?.limits?.globalMaxUsdt)} USDT</span></div></div>
 <div class="card conversion"><p>You Get (Estimate)</p><strong id="sumInr">${money(total)}</strong><small>1 USDT = ${money(rate)}</small><span class="rate-state"><i class="inline-dot"></i>${('Current rate')}</span>${('')}</div>
 <button class="card destination" data-action="payouts"><span class="destination-symbol">${type==='UPI'?'<svg viewBox="0 0 32 36" fill="none" aria-hidden="true"><path fill="#15925a" d="m17 2 12 18L9 34Z"/><path fill="#ef8d19" d="m8 3 12 18L0 34Z"/></svg>':uiIcon('bank')}</span><span class="destination-copy"><b>Receiving account (${type})</b><strong>${esc(methodName||`Add ${type==='UPI'?'UPI':'Bank Account'}`)}</strong><small>${esc(method?.holderName||`Add a ${type==='UPI'?'UPI ID':'bank account'} to continue`)}</small></span><span class="destination-action">Manage ${uiIcon('chevron')}</span></button>
 <div class="quote-note">${uiIcon('clock')}<span>${state.quote?`Quote valid for <b data-expires="${Number(state.quote.expiresAt)}">${timeLeft(state.quote.expiresAt-Date.now())}</b>`:`Quote locks on order creation · <b>${Number(state.rates?.quoteValiditySeconds||600)/60} min</b>`}</span></div>
 <div class="card trade-summary"><h3>${uiIcon('orders')}Order Summary</h3><div class="summary-grid"><div class="summary-rows"><div class="summary-row"><span>You Sell</span><b id="sumUsdt">${num(amount)} USDT</b></div><div class="summary-row"><span>Exchange Rate</span><b>${money(rate)}</b></div><div class="summary-row total"><span>You Get (INR)</span><b id="summaryInr">${money(total)}</b></div><div class="summary-row"><span>Receiving method</span><b>${type==='UPI'?'UPI · Auto-route':'Bank · Allocation'}</b></div></div><div class="summary-trust">${uiIcon('shield')}<span>${uiIcon('check')}Server-locked quote</span><span>${uiIcon('check')}TRON verification</span><span>${uiIcon('check')}Transfer tracking</span></div></div></div>
 <div id="sellError" role="alert" class="auth-message"></div><button id="createSell" class="btn btn-primary full sell-submit" ${state._creating?'disabled':''}>${uiIcon('send')}${state._pendingOrder?'Retry Order Request':'Create Sell Order'} ${uiIcon('arrow')}</button>
 ${o?renderActiveOrder(o):`<div class="card deposit-box"><div class="section-head"><h3>${uiIcon('shield')} Your deposit, verified.</h3></div><div class="deposit-info">Create an order to receive your assigned TRON address. Send only the exact USDT amount on TRC20.</div><div class="deposit-steps"><span><b>1</b> Send USDT</span><span><b>2</b> Confirmations</span><span><b>3</b> INR transfer</span></div></div>`}`;
 $$('[data-type]').forEach(b=>b.onclick=()=>{state.sellType=b.dataset.type;state.quote=null;state._orderKey=null;renderSell()});
 const updateSellValidation=()=>{const v=Number(state._amount||0),valid=Number.isFinite(v)&&v>=min;const message=v>0&&!valid?`Minimum deposit ${num(min)} USDT required.`:'';if($('#sellValidation'))$('#sellValidation').textContent=message;const submit=$('#createSell');if(submit&&!state._pendingOrder)submit.disabled=!valid||!methods.length;return valid};
 $('#sellAmount').oninput=e=>{state._amount=e.target.value;state.quote=null;state._orderKey=null;const v=Number(state._amount||0),inr=money(Math.round(v*rate*100)/100);$('#sumInr').textContent=inr;$('#summaryInr').textContent=inr;$('#sumUsdt').textContent=num(v)+' USDT';$$('[data-amount]').forEach(b=>b.classList.toggle('active',Number(b.dataset.amount)===v));updateSellValidation()};
 $$('[data-amount]').forEach(b=>b.onclick=()=>{state._amount=b.dataset.amount;state.quote=null;state._orderKey=null;renderSell()});$('#maxBtn').onclick=()=>{state._amount=String(state.rates?.limits?.globalMaxUsdt||'');state.quote=null;state._orderKey=null;renderSell()};
 $('#createSell').onclick=createSellOrder;bindActions();updateSellValidation();if(o)renderQr(o);
}
function renderActiveOrder(o){
 const isDemo=false,remaining=Math.max(0,Number(o.quoteExpiresAt||0)-Date.now());
 return `<div class="card deposit-box" id="activeDeposit"><div class="section-head"><h3>Active Order</h3>${pillStatus(o.status)}</div><div class="deposit-info">${esc(o.id)} · ${num(o.usdtAmount)} USDT ${o.status==='Awaiting Deposit'?`· <b data-expires="${Number(o.quoteExpiresAt)}">${timeLeft(remaining)}</b>`:''}</div><div class="deposit-overview"><div class="deposit-qr" id="activeQr">${ico('qr')}<small>${('TRON')}</small></div><div class="deposit-info">${('Deposit Address (USDT TRC20)')}<strong class="deposit-address">${esc((o.depositAddress||'Not assigned'))}</strong><button class="deposit-copy" data-open-order="${esc(o.id)}">${ico('orders')}View timeline & details</button>${(`<button class="deposit-copy" style="margin-top:7px" data-copy="${esc(o.depositAddress||'')}">${ico('copy')}Copy deposit address</button>`)}</div></div><div class="deposit-steps"><span><b>${Number(o.confirmations||0)} / ${Number(o.requiredConfirmations||19)}</b> confirmations</span><span>Received <b>${o.receivedUsdt==null?'—':num(o.receivedUsdt)}</b> USDT</span></div>${('')}</div>`;
}
function orderTile(o){return `<button class="card order-tile" data-order="${esc(o.id)}">${tokenIcon()}<span><b>#${esc(o.id)}</b><span class="order-meta">${dt(o.createdAt)}<br>${uiIcon(o.payoutType==='BANK'?'bank':'send')}${o.payoutType==='BANK'?'Bank Transfer':'UPI'} · ${o.payoutType==='BANK'?'Bank':'Auto-route'}</span></span><span class="order-total">${pillStatus(o.status)}<strong>${num(o.usdtAmount)} USDT</strong><small>${money(o.inrAmount)}</small></span>${uiIcon('chevron')}</button>`}
function renderOrders(){
 const q=String(state._orderSearch||'').toLowerCase(),c=completed(),a=active(),filtered=state.orders.filter(o=>(state.orderFilter==='All'||state.orderFilter==='Active'&&activeStatuses.includes(o.status)||o.status===state.orderFilter)&&(!q||[o.id,o.status,o.payoutType,o.usdtAmount,o.inrAmount].join(' ').toLowerCase().includes(q)));
 const counts={All:state.orders.length,Active:a.length,Completed:c.length,'INR Processing':state.orders.filter(o=>o.status==='INR Processing').length};
 $('#page-orders').innerHTML=`${screenHeading('Orders','Track your transactions with ease.')}<div class="dark-card orders-summary"><div class="order-stat"><span class="stat-round">${uiIcon('check')}</span><div><span>Completed Orders</span><strong>${c.length}</strong><b>${money(c.reduce((s,o)=>s+Number(o.inrAmount||0),0))}</b></div></div><div class="order-stat"><span class="stat-round">${uiIcon('clock')}</span><div><span>Active Orders</span><strong>${a.length}</strong><b>${money(a.reduce((s,o)=>s+Number(o.inrAmount||0),0))}</b></div></div></div>
 <div class="search-row"><label class="order-search">${ico('search')}<input id="orderSearch" placeholder="Search by order ID, amount or channel…" aria-label="Search orders" value="${esc(state._orderSearch||'')}"></label><button class="filter-trigger" id="moreFilters" aria-label="More filters">${uiIcon('filter')}</button></div>
 <div class="filters">${Object.keys(counts).map(f=>`<button data-filter="${f}" class="filter ${state.orderFilter===f?'active':''}">${f==='INR Processing'?'Processing':f} (${counts[f]})</button>`).join('')}</div><div>${filtered.map(orderTile).join('')||empty('No matching orders.')}</div><p class="mobile-footnote">${('Statuses and amounts are provided by your backend')} · <button class="btn-text" data-action="export">Export</button></p>`;
 $$('[data-filter]').forEach(b=>b.onclick=()=>{state.orderFilter=b.dataset.filter;renderOrders()});$('#orderSearch').oninput=e=>{const pos=e.target.selectionStart;state._orderSearch=e.target.value;renderOrders();$('#orderSearch').focus();$('#orderSearch').setSelectionRange(pos,pos)};
 $('#moreFilters').onclick=()=>{modal('Filter orders','Choose the order state you want to see.',`<div class="list">${['All','Active','Awaiting Deposit','Detected','Confirming','USDT Confirmed','INR Processing','Late Review','Completed','Expired','Rejected','Failed'].map(s=>`<button class="list-item" data-extra-filter="${s}"><b>${s}</b></button>`).join('')}</div>`);$$('[data-extra-filter]').forEach(b=>b.onclick=()=>{state.orderFilter=b.dataset.extraFilter;closeModal();renderOrders()})};bindOrders();bindActions();
}
function visibleRewardTasks(){
 const now=Date.now();
 return state.campaigns.flatMap(c=>{
  const campaignLive=c.enabled!==false&&c.active!==false&&(!c.startsAt||Number(c.startsAt)<=now)&&(!c.endsAt||Number(c.endsAt)>=now);
  if(!campaignLive)return [];
  return (Array.isArray(c.tasks)?c.tasks:[]).filter(t=>t.enabled!==false&&t.active!==false&&(!t.startsAt||Number(t.startsAt)<=now)&&(!t.endsAt||Number(t.endsAt)>=now)).map(t=>({...t,campaignTitle:c.title||'Reward campaign',campaignId:t.campaignId||c.id}));
 });
}
function permanentRewardCards(){
 const p=state.permanent;if(!p||p.enabled===false)return [];
 const cards=[],joining=p.joiningBonus||{},joiningAmount=Number(joining.amountUsdt||0);
 if(joiningAmount>0)cards.push({kind:'joining',title:'Welcome Bonus',amountUsdt:joiningAmount,credited:!!joining.credited});
 for(const tier of Array.isArray(p.tiers)?p.tiers:[]){
  const threshold=Number(tier.thresholdUsdt||0),reward=Number(tier.rewardUsdt||0);
  if(threshold>0&&reward>0)cards.push({kind:'tier',thresholdUsdt:threshold,rewardUsdt:reward,earned:!!tier.earned,skipped:!!tier.skipped});
 }
 return cards;
}
function rewardNewsItems(){
 const items=[],cards=permanentRewardCards();
 for(const card of cards){
  if(card.kind==='joining')items.push(`Welcome Bonus: ${num(card.amountUsdt)} USDT${card.credited?' - Credited':''}`);
  else items.push(`Complete ${num(card.thresholdUsdt)} USDT - Earn ${num(card.rewardUsdt)} USDT`);
 }
 for(const task of visibleRewardTasks())items.push(`${num(task.rewardAmount)} USDT bonus - ${task.title||'Eligible reward'}`);
 return items;
}
function nextPermanentReward(){
 const p=state.permanent;if(!p||p.enabled===false)return null;
 const best=Number(p.bestCompletedDepositUsdt||0);
 return permanentRewardCards().filter(card=>card.kind==='tier'&&!card.earned&&!card.skipped&&card.thresholdUsdt>best).sort((a,b)=>a.thresholdUsdt-b.thresholdUsdt)[0]||null;
}
function rewardTickerMarkup(){
 const items=rewardNewsItems();if(!items.length)return '';
 const message=items.join('   |   ');
 return `<div class="reward-ticker" aria-label="Live rewards"><span class="ticker-label">Rewards</span><div class="ticker-viewport"><div class="ticker-track"><span>${esc(message)}</span><span aria-hidden="true">${esc(message)}</span></div></div></div>`;
}
function permanentRewardsMarkup(){
 const cards=permanentRewardCards();if(!cards.length)return '';
 const best=Number(state.permanent?.bestCompletedDepositUsdt||0);
 return `<section class="permanent-rewards-section"><div class="section-head campaign-title"><h3>Rewards for You</h3><button class="btn-text" data-action="permanent">View progress ${uiIcon('chevron')}</button></div><div class="permanent-reward-grid">${cards.map(card=>card.kind==='joining'?`<article class="permanent-reward-card joining"><span class="campaign-kicker">Welcome Bonus</span><strong>${num(card.amountUsdt)} USDT</strong><span class="reward-status">${card.credited?'Credited':'Available'}</span><small>${card.credited?'Added to your reward balance.':'Available in your reward program.'}</small></article>`:`<article class="permanent-reward-card"><span class="campaign-kicker">Deposit Milestone</span><strong>Earn ${num(card.rewardUsdt)} USDT</strong><b>Complete ${num(card.thresholdUsdt)} USDT</b><span class="reward-status">${card.earned?'Earned':card.skipped?'Passed':`${num(best)} / ${num(card.thresholdUsdt)} USDT`}</span><small>${card.earned?'Reward completed.':card.skipped?'This milestone was passed.':`Deposit ${num(Math.max(0,card.thresholdUsdt-best))} USDT more.`}</small></article>`).join('')}</div></section>`;
}
function nextBonusMarkup(){
 const next=nextPermanentReward();if(!state.permanent||state.permanent.enabled===false)return '';
 if(!next)return `<div class="card next-bonus-card complete"><div><span class="eyebrow">Next Bonus</span><strong>All bonuses completed</strong></div><span class="reward-status">Well done</span></div>`;
 const best=Number(state.permanent.bestCompletedDepositUsdt||0);
 return `<div class="card next-bonus-card"><div><span class="eyebrow">Next Bonus</span><strong>Complete ${num(next.thresholdUsdt)} USDT</strong><small>Earn ${num(next.rewardUsdt)} USDT</small></div><div class="next-bonus-progress"><b>${num(best)} / ${num(next.thresholdUsdt)} USDT</b><span><i style="width:${Math.min(100,best/next.thresholdUsdt*100)}%"></i></span></div></div>`;
}
function accountSnapshotMarkup(){
 const activeOrders=active().length,banks=state.methods.filter(method=>String(method.type).toUpperCase()==='BANK').length,upis=state.methods.filter(method=>String(method.type).toUpperCase()==='UPI').length;
 return `<div class="card account-snapshot"><span class="eyebrow">Account Snapshot</span><div class="snapshot-grid"><div><strong>${activeOrders}</strong><small>Active Orders</small></div><div><strong>${banks}</strong><small>Bank Accounts</small></div><div><strong>${upis}</strong><small>UPI IDs</small></div></div></div>`;
}
function wheelSectorPath(index,count,radius=164){
 const angle=360/count,start=(-90+index*angle)*Math.PI/180,end=(-90+(index+1)*angle)*Math.PI/180;
 const x1=180+radius*Math.cos(start),y1=180+radius*Math.sin(start),x2=180+radius*Math.cos(end),y2=180+radius*Math.sin(end);
 return `M 180 180 L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${angle>180?1:0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}
function wheelMarkup(){
 const segments=(state.wheel?.segments||[]).filter(segment=>segment&&segment.id);
 if(!segments.length)return `<section class="card wheel-card"><div class="section-head"><h3>Daily Spin</h3></div><div class="notice">The daily wheel is not available right now.</div></section>`;
 const angle=360/segments.length,fontSize=Math.max(9,Math.min(14,112/segments.length)),winner=state._wheelResult?.segmentId;
 const sectors=segments.map((segment,index)=>{const center=(-90+(index+.5)*angle)*Math.PI/180,x=180+104*Math.cos(center),y=180+104*Math.sin(center);return `<path d="${wheelSectorPath(index,segments.length)}" class="wheel-sector ${index%2?'alt':''} ${winner&&String(winner)===String(segment.id)?'winner':''}"/><text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="wheel-label" style="font-size:${fontSize}px">${esc(segment.label||`${num(segment.rewardAmount)} USDT`)}</text>`}).join('');
 const result=state._wheelResult,previous=!result?state.wheel?.previousResult:null,canSpin=!!state.wheel?.canSpin&&!state._spinning;
 const status=state._spinning?'Spinning':state.wheel?.canSpin?'One spin per day':state.wheel?.nextEligibleAt?'Next spin available tomorrow':'Used Today';
 return `<section class="card wheel-card"><div class="section-head"><div><span class="eyebrow">Daily Bonus</span><h3>Spin & Win</h3></div><span class="wheel-status">${status}</span></div><div class="wheel-stage"><span class="wheel-pointer" aria-hidden="true"></span><div id="spinWheel" class="wheel-disc ${state._spinning?'is-pending':''}" style="transform:rotate(${Number(state._wheelAngle||0)}deg)"><svg viewBox="0 0 360 360" role="img" aria-label="Daily reward wheel">${sectors}<circle cx="180" cy="180" r="42" class="wheel-hub"/><text x="180" y="176" class="wheel-brand">eMoney</text><text x="180" y="194" class="wheel-brand-sub">REWARDS</text></svg></div><button id="spinBtn" class="wheel-spin-button" ${canSpin?'':'disabled'}>${state._spinning?'Spinning':state.wheel?.canSpin?'Spin':'Used'}</button></div>${result?`<div class="wheel-result"><strong>Congratulations!</strong><span>You won ${num(result.rewardAmount)} USDT</span><small>${esc(result.label||'Daily reward')}</small></div>`:previous?`<div class="wheel-previous"><b>Today's reward</b><span>${num(previous.rewardAmount)} USDT</span></div>`:''}</section>`;
}

function renderRewards(){
 const ref=state.referrals||{},tasks=visibleRewardTasks(),permanent=permanentRewardCards();
 $('#page-rewards').innerHTML=`<div class="reward-intro">${art('rewardsHero','','eMoney Rewards. Make Life Better. Stylish adult brand ambassador holding a gift.')}<button class="art-hotspot art-bell" data-action="notifications" aria-label="Notifications"></button><button class="art-hotspot art-profile" data-action="account" aria-label="Your profile"></button><button class="art-hotspot art-brand" data-jump="overview" aria-label="eMoney home"></button></div>
 <div class="dark-card rewards-balance"><button class="reward-cash-link" data-action="reward-history"><span class="balance-title">${uiIcon('gift')}Your Rewards Balance</span><div class="reward-num">${num(state.rewards?.balance)} <small>USDT</small></div><div class="reward-caption">Keep earning. More rewards await!</div></button><div class="reward-art">${art('rewardGift','','Green gift and gold coins')}</div></div>
 <div class="card referral-summary"><span class="referral-bubble">${uiIcon('group')}</span><div><h3>Referral Earnings</h3><strong>${num(ref.rewardEarned)} <small>USDT</small></strong><p>${Number(ref.qualifiedCount||0)} qualified - ${Number(ref.invitedCount||0)} invited</p></div><button class="btn btn-secondary btn-sm" data-action="referrals">View Details</button>${art('referralArt','','More friends, bigger rewards')}</div>
 ${permanentRewardsMarkup()}
 ${tasks.length?`<div class="section-head campaign-title"><h3>Live reward campaigns</h3><button class="btn-text" data-action="campaigns">View All ${uiIcon('chevron')}</button></div><div class="campaign-grid live-campaign-grid">${tasks.map(t=>{const claim=t.claim,eligible=canClaimTask(t);return `<article class="promo-card ${eligible?'green':''}"><div class="campaign-kicker">${esc(t.campaignTitle||'Campaign')}</div><h4>${esc(t.title||'Reward task')}</h4><strong>${num(t.rewardAmount)} USDT</strong><small>${esc(t.description||'Complete the eligible task to earn this reward.')}</small><span class="reward-status">${claim?esc(claim.status==='credited'?'Claimed':claim.status):eligible?'Ready to claim':'In progress'}</span><button class="btn btn-secondary btn-sm" data-claim="${esc(t.id)}" data-campaign="${esc(t.campaignId)}" ${eligible?'':'disabled'}>${claim?esc(claim.status==='credited'?'Claimed':claim.status):eligible?(String(t.claimType).toUpperCase()==='MANUAL'?'Submit Claim':'Claim Reward'):'In Progress'}</button></article>`;}).join('')}</div>`:''}
 ${!permanent.length&&!tasks.length?empty('No rewards are available right now.'):''}
 ${wheelMarkup()}
 <div class="card invite-code-card"><span class="invite-icon">${ico('spark')}</span><div><h4>Your Referral Code</h4><div class="ref-code-line"><b>${esc(ref.referralCode||'Not assigned')}</b><button data-copy="${esc(ref.webUrl||ref.referralCode||'')}" aria-label="Copy referral link">${ico('copy')}</button></div></div><button class="btn btn-secondary" data-action="share-referral">${uiIcon('share')}Share Now</button></div>
 <div class="rewards-more"><button class="btn-text" data-action="reward-history">Reward History</button><button class="btn-text" data-action="about">About rewards</button></div>`;
 $('#spinBtn')?.addEventListener('click',spinWheel);$$('[data-claim]').forEach(b=>b.onclick=async()=>{b.disabled=true;await claimTask(b.dataset.claim,b.dataset.campaign);renderRewards()});bindJumps();bindActions();
}

function settingRow(icon,title,sub,action,value=''){return `<button class="setting-row" data-action="${action}"><span class="setting-icon">${uiIcon(icon)}</span><span class="setting-copy"><b>${title}</b><small>${sub}</small></span>${value?`<span class="value">${value}</span>`:''}${uiIcon('chevron')}</button>`}
function renderProfile(){
 const p=state.profile||{},member=state.user?.createdAt||p.createdAt;
 $('#page-profile').innerHTML=`${screenHeading('My Profile','Manage your account, security and preferences.')}
 <div class="dark-card profile-hero">${art('profileAvatar','profile-portrait','Profile avatar')}<div class="profile-identity"><h2>${esc(p.fullName||'Your account')}</h2><p>User ID: ${esc(p.userId||state.user?.id||'—')}</p><button data-action="edit-profile">${uiIcon('user')}Edit Profile</button></div><div class="profile-member">${uiIcon('crown')}<span>${member?'Member Since':'Welcome to'}</span><strong>${member?new Date(member).toLocaleDateString('en-IN',{month:'short',year:'numeric'}):'eMoney'}</strong><small>Building a<br>brighter tomorrow</small></div></div>
 <div class="card settings-group"><h3>Bank & UPI</h3>${settingRow('wallet','Add Bank Account / UPI','Manage your bank accounts and UPI IDs','payouts')}</div>
 <div class="card settings-group"><h3>Security</h3>${settingRow('shield','Security & 2FA',state.twoFactor?.enabled?'2FA enabled · manage account protection':'Keep your account safe and secure','security')}${settingRow('desktop','Login Sessions','View and manage your active sessions','sessions')}</div>
 <div class="card settings-group"><h3>Preferences</h3>${settingRow('bell','Notifications','Manage alerts and updates','notification-settings')}${settingRow('globe','Language','Choose your preferred language','language',localLanguage==='hi'?'हिन्दी':'English')}${settingRow('spark','Theme','Choose Light, Dark or System appearance','theme',themeMode[0].toUpperCase()+themeMode.slice(1))}</div>
 <div class="card settings-group"><h3>Support</h3>${settingRow('help','Help & Support','Get help and follow your support tickets','support')}</div>
 <button class="setting-row logout-row" data-action="logout"><span class="setting-icon">${uiIcon('logout')}</span><span class="setting-copy"><b>Logout</b><small>Sign out from your account</small></span>${uiIcon('chevron')}</button>
 <p class="mobile-footnote">eMoney · More Value. A Brighter You. <button class="btn-text" data-action="about">About</button></p>`;bindActions();
}
function showCampaigns() {
  const tasks=visibleRewardTasks();
  modal('Reward Campaigns','Your server determines eligibility, review and credit.',`<button class="btn btn-secondary full" id="permanentRewards">Permanent Rewards · View progress ${uiIcon('chevron')}</button><div class="reward-tasks" style="margin-top:16px">${tasks.map(t=>`<article class="task-detail"><div class="campaign-kicker">${esc(t.campaignTitle)}</div><h4>${esc(t.title)}</h4><p>${esc(t.description||'')}</p><div class="task-reward">${num(t.rewardAmount)} USDT</div><div class="progress"><span style="width:${Math.min(100,Number(t.eligibility?.progress||0)/Math.max(1,Number(t.eligibility?.target||1))*100)}%"></span></div><div class="task-foot"><span>${num(t.eligibility?.progress||0)} / ${num(t.eligibility?.target||0)}</span><button class="btn btn-primary btn-sm" data-claim="${esc(t.id)}" data-campaign="${esc(t.campaignId)}" ${canClaimTask(t)?'':'disabled'}>${t.claim?esc(t.claim.status==='credited'?'Claimed':t.claim.status):canClaimTask(t)?String(t.claimType).toUpperCase()==='MANUAL'?'Submit Claim':'Claim Reward':'In Progress'}</button></div></article>`).join('')||empty('No campaigns are available right now.')}</div>`);
  $('#permanentRewards').onclick=openPermanentRewards;
  $$('[data-claim]').forEach(b=>b.onclick=async()=>{b.disabled=true;await claimTask(b.dataset.claim,b.dataset.campaign);if($('#modalBackdrop').classList.contains('show'))showCampaigns();});
}
function notificationSettings(){modal('Notifications','Choose how you receive optional account updates.',`<div class="list"><button class="list-item" id="togglePreference"><b>${state.profile?.notificationPreference===false?'Turn on':'Turn off'} optional alerts</b><small>Current preference: ${state.profile?.notificationPreference===false?'Muted':'Enabled'}</small></button><button class="list-item" id="viewInbox"><b>Notification inbox</b><small>View order, transfer and reward updates.</small></button></div>`);$('#togglePreference').onclick=async()=>{await toggleNotifications();notificationSettings()};$('#viewInbox').onclick=openNotifications}
function themeSettings(){modal('Theme','Choose how eMoney should appear on this device.',`<div class="list theme-choice"><button class="list-item" data-theme-choice="light"><b>Light ${themeMode==='light'?'(selected)':''}</b><small>Warm cream and emerald surfaces.</small></button><button class="list-item" data-theme-choice="dark"><b>Dark ${themeMode==='dark'?'(selected)':''}</b><small>Low-light forest surfaces.</small></button><button class="list-item" data-theme-choice="system"><b>System ${themeMode==='system'?'(selected)':''}</b><small>Follow your device appearance.</small></button></div>`);$$('[data-theme-choice]').forEach(b=>b.onclick=()=>{themeMode=b.dataset.themeChoice;try{localStorage.setItem('emoney-theme',themeMode)}catch{};applyTheme();closeModal();renderAll();toast('Theme updated.')})}
function languageSettings(){modal('Language','Select the navigation language for this app.',`<div class="list"><button class="list-item" id="langEn"><b>English ${localLanguage==='en'?'✓':''}</b></button><button class="list-item" id="langHi"><b>हिन्दी ${localLanguage==='hi'?'✓':''}</b><small>Navigation labels only; account and server messages remain in English.</small></button></div>`);$('#langEn').onclick=()=>setLocalLanguage('en');$('#langHi').onclick=()=>setLocalLanguage('hi')}
function setLocalLanguage(lang) {
  localLanguage=lang==='hi'?'hi':'en';
  try{localStorage.setItem('emoney-nav-language',localLanguage);}catch{}
  closeModal();renderProfile();renderNav();applyNavLanguage();toast(localLanguage==='hi'?'नेविगेशन भाषा बदल दी गई।':'Navigation language updated.');
}
function applyNavLanguage(){if(localLanguage!=='hi')return;const words={overview:'होम',sell:'बेचें',orders:'ऑर्डर',rewards:'रिवार्ड',profile:'प्रोफाइल'};$$('#mobileNav button').forEach(b=>{b.querySelector('.nav-label').textContent=words[b.dataset.page]})}
async function shareReferral() {
  const r=state.referrals||{};
  if(!r.referralCode){toast('Your referral code is not available yet.',true);return;}
  const text=`Join me on eMoney. Referral code: ${r.referralCode}\n${r.webUrl||r.downloadUrl||''}`;
  if(window.DigiAndroid?.shareText){window.DigiAndroid.shareText(text);return;}
  if(navigator.share){try{await navigator.share({title:'eMoney',text});return;}catch(error){if(error.name==='AbortError')return;}}
  await copyText(text);
}
function authHelp() {
  modal('Welcome to eMoney','Sell USDT and track your INR transfers.',`<div class="list"><div class="list-item"><b>Sign in with your existing account</b><small>Use the email and password registered with this service. Enable optional authenticator-based 2FA from Profile.</small></div><div class="list-item"><b>New here?</b><small>Create an account, add your UPI ID or bank account, and request a server quote.</small></div><div class="notice">Only use USDT on the TRON (TRC20) network and the deposit address assigned to your specific order.</div><button class="btn btn-primary" data-close>Back to Sign In</button></div>`);
}
function forgotPassword() {
  modal('Account recovery','Contact your existing account-support channel.',`<div class="notice">This service does not currently expose a self-service password-reset API. No reset email or SMS has been sent. Contact your service administrator to recover access.</div><div class="list" style="margin-top:14px"><div class="list-item"><b>Already signed in on another device?</b><small>Use Profile → Login Sessions → Change password if you know your current password.</small></div><button class="btn btn-primary" data-close>Back to Sign In</button></div>`);
}
function rateDetails() {
  modal('USDT rates','Current account rates from the server.',`<div class="list"><div class="list-item"><b>UPI · ${state.rates?money(state.rates.rates.upi):'—'} / USDT</b><small>Minimum ${num(state.rates?.limits?.upiMinUsdt)} USDT</small></div><div class="list-item"><b>Bank · ${state.rates?money(state.rates.rates.bank):'—'} / USDT</b><small>Minimum ${num(state.rates?.limits?.bankMinUsdt)} USDT</small></div><div class="notice info">The final rate and amount come from your server quote. Transfers are subject to deposit verification and processing.</div></div>`);
}
function showAbout() {
  modal('eMoney','Mobile application · version 1.1.3',`<div class="list"><div class="list-item"><b>Your account, in one place</b><small>Sell USDT, manage receiving accounts, follow orders and access eligible rewards.</small></div><div class="list-item"><b>Deposits and transfers</b><small>TRON verification, rates, quotes, order transitions and transfer decisions are handled by the existing server.</small></div><div class="notice">Never share your password, authenticator code, recovery codes or wallet private keys with another person.</div></div>`);
}
function handleAction(a){const actions={'payouts':openPayoutMethods,'edit-profile':openProfileEdit,'security':openSecurity,'sessions':openSessions,'support':openSupport,'notifications':openNotifications,'toggle-notifications':toggleNotifications,'logout':confirmLogout,'account':()=>{closeModal();go('profile');window.scrollTo(0,0)},'search':openSearch,'about':showAbout,'export':exportOrders,'reward-history':openRewardHistory,'referrals':openReferrals,'campaigns':showCampaigns,'permanent':openPermanentRewards,'share-referral':shareReferral,'notification-settings':notificationSettings,'language':languageSettings,'theme':themeSettings,'auth-help':authHelp,'forgot':forgotPassword,'rates':rateDetails};actions[a]?.()}

$('#loginTab').onclick=()=>switchAuth('login');$('#registerTab').onclick=()=>switchAuth('register');
$('#passwordToggle').onclick=()=>{const p=$('#password'),visible=p.type==='password';p.type=visible?'text':'password';$('#passwordToggle').setAttribute('aria-label',visible?'Hide password':'Show password')};
$('#backLogin').onclick=()=>{$('#alternateAuth').hidden=false;$('#newAccountLabel').hidden=false;state.challengeId=null;$('#twoFactorForm').classList.add('hidden');$('#authForm').classList.remove('hidden');$('#authTabs').classList.remove('hidden');switchAuth('login')};
$('#authForm').onsubmit=async e=>{
 e.preventDefault();$('#authMessage').textContent='';const btn=e.submitter;btn.disabled=true;
 try{const email=$('#email').value.trim().toLowerCase(),password=$('#password').value;
 if(state.authMode==='register'){
  {await api('/auth/register',{method:'POST',allow401:true,body:JSON.stringify({fullName:$('#fullName').value.trim(),mobile:$('#mobile').value.trim(),email,password,referralCode:$('#referral').value.trim()})});toast('Account created. Sign in to continue.')}
  switchAuth('login');$('#email').value=email;$('#password').value='';return;
 }
 let result;result=await api('/auth/login',{method:'POST',allow401:true,body:JSON.stringify({email,password})});
 if(result.twoFactorRequired){state.challengeId=result.challengeId;state.challengeExpiresAt=Date.now()+Number(result.expiresIn||300)*1000;$('#password').value='';$('#alternateAuth').hidden=true;$('#newAccountLabel').hidden=true;$('#authForm').classList.add('hidden');$('#authTabs').classList.add('hidden');$('#twoFactorForm').classList.remove('hidden');$('#authTitle').textContent='One more step.';$('#authSub').textContent=('Enter your authenticator or recovery code.');return}
 state.page='overview';await authenticate(result);
 }catch(err){$('#authMessage').textContent=err.message}finally{btn.disabled=false}
};
$('#twoFactorForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;$('#twoFactorMessage').textContent='';try{if(Date.now()>state.challengeExpiresAt)throw new Error('Verification expired. Return to Sign In.');let r;r=await api('/auth/2fa',{method:'POST',allow401:true,body:JSON.stringify({challengeId:state.challengeId,code:$('#twoFactorCode').value.trim()})});state.page='overview';await authenticate(r)}catch(err){$('#twoFactorMessage').textContent=err.message}finally{b.disabled=false}};

document.addEventListener('click',e=>{const a=e.target.closest('[data-action]');if(a&&!a.disabled){e.preventDefault();handleAction(a.dataset.action)}});
document.addEventListener('keydown',e=>{
 const modalOpen=$('#modalBackdrop').classList.contains('show');
 if(e.key==='Escape'&&modalOpen)closeModal();
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&state.user){e.preventDefault();openSearch()}
 if(e.key==='Tab'&&modalOpen){const els=[...$('#modal').querySelectorAll('button:not(:disabled),input:not(:disabled),textarea,select,a[href],[tabindex="0"]')].filter(x=>x.getClientRects().length);if(!els.length)return;const first=els[0],last=els.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===$('#modal'))){e.preventDefault();last.focus()}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===$('#modal'))){e.preventDefault();first.focus()}}
});
setInterval(()=>{$$('[data-expires]').forEach(node=>{node.textContent=timeLeft(Math.max(0,Number(node.dataset.expires)-Date.now()))})},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&true&&state.user)refreshAll(true)});



window.__emoneyBack=()=>{if($('#modalBackdrop').classList.contains('show')){closeModal();return true}if(!state.user&&!$('#twoFactorForm').classList.contains('hidden')){$('#backLogin').click();return true}if(!state.user&&state.authMode==='register'){switchAuth('login');return true}if(state.user&&state.page!=='overview'){go('overview');window.scrollTo(0,0);return true}return false};
if(window.DigiAndroid || /digiRupee\//i.test(navigator.userAgent))document.documentElement.classList.add('native-shell');
if(window.visualViewport){const onViewport=()=>document.body.classList.toggle('keyboard-open',innerHeight-window.visualViewport.height>140);visualViewport.addEventListener('resize',onViewport)}

$('#alternateAuth').onclick=()=>{switchAuth(state.authMode==='register'?'login':'register');$('#authForm').classList.remove('hidden');$('#twoFactorForm').classList.add('hidden')};
$('#brandHome').onclick=()=>{go('overview');window.scrollTo(0,0)};
try{const saved=localStorage.getItem('emoney-visual-remember-email');if(saved)$('#email').value=saved}catch{}
$('#authForm').addEventListener('submit',()=>{try{if($('#rememberEmail').checked)localStorage.setItem('emoney-visual-remember-email',$('#email').value.trim());else localStorage.removeItem('emoney-visual-remember-email')}catch{}});
state._amount='';
switchAuth('login');bindActions();



function canClaimTask(task) {
  return task.enabled!==false&&!task.claim&&(!task.startsAt||Number(task.startsAt)<=Date.now())&&(!task.endsAt||Number(task.endsAt)>=Date.now())&&(String(task.claimType).toUpperCase()==='MANUAL'||!!task.eligibility?.eligible);
}

async function openPermanentRewards() {
  const request=++modalVersion;
  try {
    const result=await api('/rewards/permanent'); if(request!==modalVersion)return;
    const p=result.program||{};state.permanent=p;
    const best=Number(p.bestCompletedDepositUsdt||0),joining=p.joiningBonus||{};
    modal('Permanent Rewards','Automatic joining and qualifying-deposit bonuses.',p.enabled===false?'<div class="notice">This program is currently paused.</div>':`<div class="list"><div class="list-item"><b>Best completed deposit</b><small>${num(best)} USDT</small></div><div class="list-item"><b>Joining reward · ${num(joining.amountUsdt)} USDT</b><small>${joining.credited?'Credited to your reward balance.':'Issued automatically when eligible.'}</small></div>${(p.tiers||[]).map(t=>`<div class="list-item"><b>Complete ${num(t.thresholdUsdt)} USDT · ${num(t.rewardUsdt)} USDT bonus</b><small>${t.earned?'Earned':t.skipped?'Passed':`${num(Math.max(0,Number(t.thresholdUsdt)-best))} USDT to go`}</small></div>`).join('')}</div>`);
  } catch(error){if(request===modalVersion)toast(error.message,true);}
}

const nativeSeen = new Map();
function surfaceNativeNotifications() {
  if(!window.DigiAndroid?.notify||!state.user||state.profile?.notificationPreference===false)return;
  const key='emoney-native-seen:'+state.user.id;
  let seen=nativeSeen.get(key);
  if(!seen){try{seen=new Set(JSON.parse(localStorage.getItem(key)||'[]'));}catch{seen=new Set();}nativeSeen.set(key,seen);}
  for(const item of state.notifications.filter(n=>!n.readAt&&n.id&&!seen.has(n.id)).slice(0,3)) {
    seen.add(item.id);
    try {localStorage.setItem(key,JSON.stringify([...seen].slice(-300)));}catch{}
    try {window.DigiAndroid.notify(String(item.title||'eMoney').replace(/digiRupee/g,'eMoney'),String(item.message||''));}catch{}
  }
}

function captureReferral() {
  const normalize=value=>{const code=String(value||'').trim().toUpperCase();return /^DGR[A-F0-9]{10}$/.test(code)?code:'';};
  let code=normalize(new URLSearchParams(location.search).get('ref'));
  try{code=code||normalize(window.DigiAndroid?.consumeReferralMarker?.());}catch{}
  try{code=code||normalize(sessionStorage.getItem('emoney-pending-referral'));if(code)sessionStorage.setItem('emoney-pending-referral',code);}catch{}
  if(code){$('#referral').value=code;$('#referral').readOnly=true;switchAuth('register');}
}

async function boot() {
  const button=$('#authSubmit');button.disabled=true;
  $('#authMessage').textContent='Checking your account session…';
  try {
    const result=await api('/me',{allow401:true});
    if(result.user)await authenticate(result);
    else{showAuth('');captureReferral();}
  } catch(error) {
    if(error.status===401){showAuth('');captureReferral();}
    else{showAuth(error.message);captureReferral();}
  } finally{button.disabled=false;}
}
window.__digiHandleBack = window.__emoneyBack;
void boot();
})();
