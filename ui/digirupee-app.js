(() => {
  'use strict';

  const state = {
    user: null,
    profile: null,
    rates: null,
    methods: [],
    orders: [],
    rewards: { balance: '0', lifetimeEarned: '0', recent: [], ledger: [] },
    campaigns: [],
    wheel: null,
    referrals: null,
    tickets: [],
    notifications: [],
    unreadCount: 0,
    sessions: [],
    activeOrderId: null,
    type: 'UPI',
    selectedMethodId: null,
    orderFilter: 'All',
    taskFilter: 'All',
    refreshTimer: null,
    refreshBusy: false,
    authRedirecting: false,
    quote: null,
    quoteRequest: 0,
    wheelRotation: 0
  };

  const prefsKey = 'digirupee-ui-preferences';
  const prefs = (() => {
    try { return { language: 'en', theme: 'midnight', ...JSON.parse(localStorage.getItem(prefsKey) || '{}') }; }
    catch { return { language: 'en', theme: 'midnight' }; }
  })();
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[ch]));
  const num = value => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 6 });
  const inr = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const date = value => value ? new Date(value).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
  const api = async (path, options = {}) => {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    const response = await fetch(`/api/digirupee${path}`, { ...options, headers, credentials: 'include' });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (response.status === 401 && !options.allow401) { await sessionExpired(); }
    if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
    return payload || {};
  };

  function toastMsg(message, error = false) {
    const node = $('toastBox');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('error', !!error);
    node.classList.add('show');
    clearTimeout(node._timer);
    node._timer = setTimeout(() => node.classList.remove('show'), 2600);
  }

  function savePrefs() { try { localStorage.setItem(prefsKey, JSON.stringify(prefs)); } catch {} }
  function show(node) { node?.classList.add('show'); }
  function hide(node) { node?.classList.remove('show'); }
  function setText(id, value) { const node = $(id); if (node) node.textContent = value; }
  function closeAllOverlays() { document.querySelectorAll('.overlay.show').forEach(node => node.classList.remove('show')); }
  function bg(event, id) { if (event.target.id === id) hide($(id)); }
  function finalOrder(order) { return ['Completed', 'Expired', 'Failed', 'Rejected'].includes(order?.status); }
  function activeOrder() { return state.orders.find(order => order.id === state.activeOrderId && !finalOrder(order)) || state.orders.find(order => ['Awaiting Deposit','Detected','Confirming','USDT Confirmed','INR Processing','Late Review'].includes(order.status)); }
  function activeStatuses() { return ['Awaiting Deposit','Detected','Confirming','USDT Confirmed','INR Processing','Late Review']; }

  function injectAuth() {
    const style = document.createElement('style');
    style.textContent = `
      .digi-auth{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:18px;background:#07070a;color:#fff;font-family:inherit}
      .digi-auth[hidden]{display:none}.digi-auth-card{width:min(100%,390px);padding:22px;border:1px solid #292b33;border-radius:22px;background:#111216;box-shadow:0 24px 80px #0008}
      .digi-auth-brand{display:flex;align-items:center;gap:10px;margin-bottom:18px}.digi-auth-brand-mark{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:#d7192d;color:#ffd85a;font-size:20px;font-weight:900}.digi-auth h2{margin:0;font-size:22px}.digi-auth p{color:#a9adb8;font-size:12px;line-height:1.5}.digi-auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:16px 0}.digi-auth-tabs button{min-height:40px;border:1px solid #30323a;border-radius:10px;background:#15171c;color:#bbb}.digi-auth-tabs button.active{background:#e2b533;color:#211800;border-color:#e2b533;font-weight:800}.digi-auth label{display:block;margin:11px 0 5px;color:#bfc1ca;font-size:11px}.digi-auth input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #343741;border-radius:10px;background:#0c0e12;color:#fff;outline:0}.digi-auth input:focus{border-color:#d7b545}.digi-auth button.primary{width:100%;margin-top:15px;min-height:44px;border:0;border-radius:11px;background:linear-gradient(90deg,#ffe57b,#f4b522);color:#1b1300;font-weight:900}.digi-auth .hint{font-size:11px;color:#8f939d}.digi-auth .error{min-height:18px;color:#ff7784;font-size:11px;margin-top:8px}.digi-auth .link{border:0;background:transparent;color:#e8c85b;font-size:11px}
      .digi-security-extra{margin-top:12px;padding:11px;border:1px solid #292c34;border-radius:12px;background:#0c0e12}.digi-security-extra code{word-break:break-all;color:#f4d66e;font-size:10px}
      .digi-empty{padding:18px;text-align:center;color:#8d919b;font-size:11px}.digi-action-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.digi-action-row button{flex:1;min-width:120px}.digi-copy{word-break:break-all;color:#f4d66e;font-size:11px}
    `;
    document.head.appendChild(style);
    const node = document.createElement('div');
    node.id = 'digiAuth';
    node.className = 'digi-auth';
    node.innerHTML = `<div class="digi-auth-card"><div class="digi-auth-brand"><div class="digi-auth-brand-mark">₮</div><div><h2>digiRupee</h2><p style="margin:3px 0 0">Secure USDT to INR settlement</p></div></div><div id="digiAuthBody"></div></div>`;
    document.body.appendChild(node);
  }

  function renderAuth(mode = 'login', error = '') {
    const body = $('digiAuthBody');
    if (!body) return;
    body.innerHTML = `<div class="digi-auth-tabs"><button class="${mode === 'login' ? 'active' : ''}" data-auth-mode="login">Sign in</button><button class="${mode === 'register' ? 'active' : ''}" data-auth-mode="register">Create account</button></div>${mode === 'challenge' ? `<h3>Two-factor verification</h3><p>Enter the code from your authenticator app or use one recovery code.</p><form id="digi2faForm"><label>Verification code</label><input id="digi2faCode" inputmode="text" autocomplete="one-time-code" required><div id="digiAuthError" class="error">${esc(error)}</div><button class="primary" type="submit">Verify and continue</button></form>` : `<form id="digiAuthForm"><div id="digiRegisterFields" ${mode === 'register' ? '' : 'hidden'}><label>Full name</label><input id="digiFullName" autocomplete="name" maxlength="80" ${mode === 'register' ? 'required' : ''}><label>Mobile number</label><input id="digiMobile" inputmode="tel" autocomplete="tel" maxlength="16" ${mode === 'register' ? 'required' : ''}><label>Referral code <span class="hint">optional</span></label><input id="digiReferral" autocomplete="off" maxlength="30"></div><label>Email</label><input id="digiEmail" type="email" autocomplete="email" required><label>Password</label><input id="digiPassword" type="password" autocomplete="current-password" minlength="8" required><div id="digiAuthError" class="error">${esc(error)}</div><button class="primary" type="submit">${mode === 'register' ? 'Create account' : 'Sign in'}</button></form>`}`;
    body.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => renderAuth(button.dataset.authMode)));
    $('digiAuthForm')?.addEventListener('submit', submitAuth);
    $('digi2faForm')?.addEventListener('submit', submitTwoFactorLogin);
  }

  async function submitAuth(event) {
    event.preventDefault();
    const register = !!$('digiRegisterFields') && !$('digiRegisterFields').hidden;
    const button = event.submitter; if (button) button.disabled = true;
    try {
      const email = $('digiEmail').value.trim().toLowerCase();
      const password = $('digiPassword').value;
      if (register) {
        await api('/auth/register', { method:'POST', body: JSON.stringify({ fullName:$('digiFullName').value.trim(), mobile:$('digiMobile').value.trim(), email, password, referralCode:$('digiReferral').value.trim() }) });
        renderAuth('login');
        $('digiEmail').value = email;
        toastMsg('Account created. Sign in to continue.');
        return;
      }
      const result = await api('/auth/login', { method:'POST', body: JSON.stringify({ email, password }) });
      if (result.twoFactorRequired) { renderAuth('challenge'); state.challengeId = result.challengeId; state.challengeExpiresAt = Date.now() + Number(result.expiresIn || 300) * 1000; return; }
      await authenticated(result);
    } catch (error) { const node = $('digiAuthError'); if (node) node.textContent = error.message; }
    finally { if (button) button.disabled = false; }
  }

  async function submitTwoFactorLogin(event) {
    event.preventDefault();
    const button = event.submitter; if (button) button.disabled = true;
    try {
      const result = await api('/auth/2fa', { method:'POST', body: JSON.stringify({ challengeId:state.challengeId, code:$('digi2faCode').value.trim() }) });
      await authenticated(result);
    } catch (error) { const node = $('digiAuthError'); if (node) node.textContent = error.message; }
    finally { if (button) button.disabled = false; }
  }

  async function authenticated(result) {
    state.user = result.user || null;
    state.profile = result.profile || null;
    $('digiAuth').hidden = true;
    const app = document.querySelector('.app'); if (app) app.style.display = '';
    await refreshAll();
  }

  async function sessionExpired() {
    if (state.authRedirecting) return;
    state.authRedirecting = true;
    stopRefresh();
    state.user = state.profile = null;
    state.orders = []; state.methods = []; state.notifications = []; state.tickets = [];
    clearPrivateUI();
    const app = document.querySelector('.app'); if (app) app.style.display = 'none';
    const auth = $('digiAuth'); if (auth) { auth.hidden = false; renderAuth('login', 'Your session expired. Please sign in again.'); }
    state.authRedirecting = false;
  }

  function clearPrivateUI() {
    ['profileNameHero','profileIdHero','profileReward','homeRewards','mLife','mProcessing','mSettled','mTrades','mActive','pTrades','pSuccess','pVolume','rewardBal','homeUpi','homeBank','sellUpi','sellBank','chartUpi','chartBank','refInvited','refSuccessful','refEarn','twoFAState','notifState'].forEach(id => setText(id, '—'));
    ['homeOrders','ordersList','profileMethods','sellMethods','availabilityList','tasks','manageList','notifList','refHistory','activeSell'].forEach(id => { if ($(id)) $(id).innerHTML = ''; });
  }

  async function refreshAll() {
    if (state.refreshBusy || document.hidden || !state.user) return;
    state.refreshBusy = true;
    try {
      const result = await Promise.all([
        api('/me'), api('/rates'), api('/payout-methods'), api('/orders'), api('/rewards'), api('/campaigns'), api('/wheel'), api('/referrals'), api('/support'), api('/notifications?limit=100'), api('/notifications/unread-count'), api('/security/2fa/status')
      ]);
      state.user = result[0].user; state.profile = result[0].profile; state.rates = result[1]; state.methods = result[2].payoutMethods || []; state.orders = result[3].orders || []; state.rewards = result[4]; state.campaigns = result[5].campaigns || []; state.wheel = result[6]; state.referrals = result[7]; state.tickets = result[8].tickets || []; state.notifications = result[9].notifications || []; state.unreadCount = Number(result[10].count || result[10].unreadCount || 0); state.twoFactor = result[11];
      state.activeOrderId = activeOrder()?.id || null;
      renderAll();
      scheduleRefresh();
    } catch (error) { if (!/session expired/i.test(error.message)) toastMsg(error.message, true); }
    finally { state.refreshBusy = false; }
  }

  function scheduleRefresh() { clearTimeout(state.refreshTimer); if (state.user && !document.hidden) state.refreshTimer = setTimeout(refreshAll, 12000); }
  function stopRefresh() { clearTimeout(state.refreshTimer); state.refreshTimer = null; }
  function renderAll() { applyPreferences(); renderStats(); renderHome(); renderSell(); renderOrders(); renderMethods(); renderTasks(); renderWheel(); renderNotifications(); renderReferral(); renderSecurityState(); renderActiveOrder(); }

  function applyPreferences() {
    document.body.classList.toggle('pure', prefs.theme === 'pure');
    setText('themeState', `${prefs.theme === 'pure' ? 'Pure Black & Gold' : 'Midnight Red & Gold'} ›`);
    setText('langState', prefs.language === 'hi' ? 'हिन्दी ›' : 'English ›');
    if (state.profile) {
      setText('profileNameHero', `${state.profile.fullName || 'Account'} ✓`); setText('profileIdHero', state.profile.userId || '—');
      setText('notifState', state.profile.notificationPreference === false ? 'Muted ›' : 'Enabled ›');
    }
    const hero = document.querySelector('[data-i18n="heroTitle"]'); if (hero) hero.innerHTML = prefs.language === 'hi' ? 'USDT बेचें,<br>INR पाएं' : 'SELL USDT,<br>GET INR';
  }

  function renderStats() {
    const completed = state.orders.filter(order => order.status === 'Completed');
    const active = state.orders.filter(order => activeStatuses().includes(order.status));
    const usdt = completed.reduce((sum, order) => sum + Number(order.usdtAmount || 0), 0);
    const settled = completed.reduce((sum, order) => sum + Number(order.payout?.paidInrPaise ? order.payout.paidInrPaise / 100 : order.inrAmount || 0), 0);
    const processing = active.reduce((sum, order) => sum + Number(order.inrAmount || 0), 0);
    setText('mLife', `${num(usdt)} USDT`); setText('mTrades', `${completed.length} completed trades`); setText('mProcessing', inr(processing)); setText('mActive', `${active.length} active orders`); setText('mSettled', inr(settled));
    setText('homeRewards', `${num(state.rewards.balance)} USDT`); setText('rewardBal', `${num(state.rewards.balance)} USDT`); setText('profileReward', `${num(state.rewards.balance)} USDT`);
    setText('pTrades', completed.length); setText('pVolume', `${num(usdt)} USDT`); setText('pSuccess', state.orders.length ? `${((completed.length / state.orders.length) * 100).toFixed(1)}%` : '0%');
    setText('homeUpi', state.rates ? inr(state.rates.rates.upi) : '—'); setText('homeBank', state.rates ? inr(state.rates.rates.bank) : '—'); setText('sellUpi', state.rates ? inr(state.rates.rates.upi) : '—'); setText('sellBank', state.rates ? inr(state.rates.rates.bank) : '—'); setText('chartUpi', state.rates ? inr(state.rates.rates.upi) : '—'); setText('chartBank', state.rates ? inr(state.rates.rates.bank) : '—');
  }

  function renderHome() { const node = $('homeOrders'); if (!node) return; const rows = state.orders.slice(0, 3); node.innerHTML = rows.length ? rows.map(orderRow).join('') : `<div class="card empty"><b>No orders yet</b><p>Your real sell orders will appear here.</p></div>`; }
  function orderRow(order) { return `<button class="order-row-pro" onclick="openOrder('${esc(order.id)}')"><div class="order-leading"><span class="badge">${esc(order.payoutType)}</span></div><div class="order-copy"><div><b>${num(order.usdtAmount)} USDT</b><span class="status-pill ${statusClass(order.status)}">${esc(order.status)}</span></div><small>${esc(order.id)} · ${esc(date(order.createdAt))}</small></div><div class="order-money"><b>${inr(order.inrAmount)}</b><small>${esc(order.payoutType)}</small></div></button>`; }
  function statusClass(status) { return status === 'Completed' ? 's-completed' : ['Expired','Failed','Rejected'].includes(status) ? 's-expired' : status === 'Late Review' ? 's-review' : 's-active'; }

  function setType(type) { state.type = String(type).toUpperCase() === 'BANK' ? 'BANK' : 'UPI'; state.selectedMethodId = null; state.quote = null; renderSell(); syncQuoteControls(); }
  function renderSell() {
    const rates = state.rates?.rates || {}; const limits = state.rates?.limits || {};
    $('upiTab')?.classList.toggle('active', state.type === 'UPI'); $('bankTab')?.classList.toggle('active', state.type === 'BANK');
    setText('methodTitle', state.type === 'UPI' ? 'Choose UPI ID' : 'Bank payout allocation'); setText('availabilityTitle', state.type === 'UPI' ? 'UPI availability' : 'Bank availability');
    const amount = $('amount'); if (amount && !amount.value) amount.value = '';
    const eligible = state.methods.filter(method => method.type === state.type && method.enabled);
    if (!state.selectedMethodId || !eligible.some(method => method.id === state.selectedMethodId)) state.selectedMethodId = eligible[0]?.id || null;
    const node = $('sellMethods'); if (!node) return;
    if (!eligible.length) node.innerHTML = `<div class="empty compact-empty"><b>No active ${state.type === 'UPI' ? 'UPI ID' : 'bank account'}</b><p>Add or enable a payout method below.</p></div>`;
    else if (state.type === 'UPI') node.innerHTML = `<div class="method-list">${eligible.map(method => `<button class="method-row ${method.id === state.selectedMethodId ? 'selected' : ''}" onclick="selectMethod('${esc(method.id)}')"><div class="method-row-icon"><span class="badge">UPI</span></div><div class="method-row-copy"><b>${esc(method.upiId)}</b><small>${esc(method.holderName)} · ${esc(method.mobile)}</small><span>${inr(method.minInr)}–${inr(method.maxInr)} per trade</span></div><div class="method-select">${method.id === state.selectedMethodId ? '✓' : '○'}</div></button>`).join('')}</div>`;
    else node.innerHTML = `<div class="method-list">${eligible.map(method => `<label class="method-row ${state.selectedMethodId === method.id ? 'selected' : ''}"><input type="checkbox" ${state.selectedMethodId === method.id ? 'checked' : ''} onchange="toggleBankAllocation('${esc(method.id)}',this.checked)"><div class="method-row-copy"><b>${esc(method.label || 'Bank account')}</b><small>${esc(method.bankName || '')} · •••• ${esc(String(method.accountNumber || '').slice(-4))} · ${esc(method.ifsc || '')}</small><span>${inr(method.minInr)}–${inr(method.maxInr)} per trade</span></div></label>`).join('')}</div><div class="helper" style="margin-top:7px">The server calculates and validates the exact split when you request a quote.</div>`;
    setText('rlabel', `Rate (${state.type})`); setText('qrate', rates[state.type.toLowerCase()] ? inr(rates[state.type.toLowerCase()]) : '—'); setText('quoteState', state.quote ? `Valid until ${date(state.quote.expiresAt)}` : 'Not locked yet'); setText('qsell', $('amount')?.value ? `${num($('amount').value)} USDT` : '—'); setText('qrecv', 'Request a server quote'); setText('qmethod', state.type === 'UPI' ? (state.methods.find(method => method.id === state.selectedMethodId)?.upiId || 'Select UPI') : 'Server allocation');
    renderAvailability();
  }
  function quote() { renderSell(); }
  function selectMethod(id) { state.selectedMethodId = id; state.quote = null; renderSell(); syncQuoteControls(); }
  function toggleBankAllocation(id, checked) { if (checked) state.selectedMethodId = id; else if (state.selectedMethodId === id) state.selectedMethodId = state.methods.find(method => method.type === 'BANK' && method.enabled && method.id !== id)?.id || null; state.quote = null; renderSell(); syncQuoteControls(); }
  function renderAvailability() { const node = $('availabilityList'); if (!node) return; const rows = state.methods.filter(method => method.type === state.type); node.innerHTML = rows.length ? rows.map(method => `<div class="availability-row"><div class="availability-copy"><b>${esc(method.label || method.upiId || 'Payout method')}</b><small>${esc(method.type === 'UPI' ? method.upiId : `•••• ${String(method.accountNumber || '').slice(-4)} · ${method.ifsc || ''}`)}</small><span>${method.enabled ? 'Enabled' : 'Disabled'} · ${inr(method.dailyLimitInr)} daily limit</span></div><button class="toggle ${method.enabled ? 'on' : ''}" onclick="toggleMethod('${esc(method.id)}')" aria-label="${method.enabled ? 'Disable' : 'Enable'}"> </button></div>`).join('') : '<div class="empty compact-empty">No payout methods saved.</div>'; }

  async function lockQuote() {
    const button = $('lockBtn'); if (button) button.disabled = true;
    try {
      const usdtAmount = Number($('amount')?.value || 0); if (!usdtAmount || !state.selectedMethodId) throw new Error('Enter an amount and select a payout method');
      const candidateIds = state.type === 'BANK' ? state.methods.filter(method => method.type === 'BANK' && method.enabled).map(method => method.id) : [state.selectedMethodId];
      const result = await api('/quotes', { method:'POST', body: JSON.stringify({ payoutType:state.type, usdtAmount, payoutMethodIds:candidateIds }) });
      state.quote = result.quote;
      const order = await api('/orders', { method:'POST', headers:{ 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({ quoteId:state.quote.quoteId, allocations:state.quote.allocations }) });
      state.orders = [order.order, ...state.orders.filter(item => item.id !== order.order.id)]; state.activeOrderId = order.order.id; state.quote = null; renderAll(); toastMsg('Order created. Send USDT to the assigned address.'); setTimeout(() => $('activeSell')?.scrollIntoView({ behavior:'smooth', block:'start' }), 80);
    } catch (error) { toastMsg(error.message, true); }
    finally { if (button) button.disabled = false; }
  }
  async function requestQuoteServer() { const usdtAmount = Number($('amount')?.value || 0); if (!usdtAmount || !state.selectedMethodId) throw new Error('Enter an amount and select a payout method'); const candidateIds = state.type === 'BANK' ? state.methods.filter(method => method.type === 'BANK' && method.enabled).map(method => method.id) : [state.selectedMethodId]; const result = await api('/quotes', { method:'POST', body:JSON.stringify({ payoutType:state.type, usdtAmount, payoutMethodIds:candidateIds }) }); state.quote = result.quote; renderSell(); syncQuoteControls(); toastMsg('Quote locked. Review it and create the sell order.'); }
  async function createOrderFromQuote() { const result = await api('/orders', { method:'POST', headers:{ 'Idempotency-Key': idempotencyKey() }, body:JSON.stringify({ quoteId:state.quote.quoteId, allocations:state.quote.allocations }) }); state.orders = [result.order, ...state.orders.filter(item => item.id !== result.order.id)]; state.activeOrderId = result.order.id; state.quote = null; renderAll(); toastMsg('Order created. Send USDT to the assigned address.'); setTimeout(() => $('activeSell')?.scrollIntoView({ behavior:'smooth', block:'start' }), 80); }
  async function lockQuoteProduction() { const button = $('lockBtn'); if (button) button.disabled = true; try { if (!state.quote || Number(state.quote.expiresAt) <= Date.now()) await requestQuoteServer(); else await createOrderFromQuote(); } catch (error) { toastMsg(error.message, true); } finally { if (button) button.disabled = false; } }
  function syncQuoteControls() { const quote = state.quote && Number(state.quote.expiresAt) > Date.now() ? state.quote : null; if (quote) { setText('qrecv', inr(quote.inrAmount)); setText('qmethod', state.type === 'UPI' ? (state.methods.find(method => method.id === state.selectedMethodId)?.upiId || 'Selected UPI') : `${(quote.allocations || []).length} bank allocation(s)`); } const button = $('lockBtn'); if (button) button.textContent = quote ? 'Create sell order' : 'Lock quote & continue'; }
  function idempotencyKey() { const bytes = new Uint8Array(18); crypto.getRandomValues(bytes); return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); }
  function setMax() { const rate = Number(state.rates?.rates?.[state.type.toLowerCase()] || 0); if (!rate) return; const max = Number(state.rates?.limits?.globalMaxUsdt || 0); if ($('amount')) $('amount').value = max; quote(); }

  function renderActiveOrder() { const node = $('activeSell'); const order = activeOrder(); if (!node) return; if (!order) { node.innerHTML = ''; return; } const remaining = Math.max(0, Number(order.quoteExpiresAt) - Date.now()); const refs = order.payout?.references || []; node.innerHTML = `<section class="card active-order"><div class="active-head"><div><h3>${order.status === 'Awaiting Deposit' ? 'Send USDT to assigned address' : `Order ${esc(order.status)}`}</h3><p>${esc(order.id)} · ${num(order.usdtAmount)} USDT · ${inr(order.inrAmount)}</p></div>${order.status === 'Awaiting Deposit' ? `<div class="timer-box">${remaining ? timeLeft(remaining) : 'Expired'}</div>` : `<span class="status-pill ${statusClass(order.status)}">${esc(order.status)}</span>`}</div><div class="deposit-grid"><div class="qr-img digi-qr-placeholder" aria-label="Deposit address QR">QR</div><div><small>Assigned TRON address</small><div class="digi-copy">${esc(order.depositAddress)}</div><button class="ghost-btn" style="margin-top:8px" onclick="copyAddress('${esc(order.depositAddress)}')">Copy address</button><p class="helper">Expected ${num(order.usdtAmount)} USDT · ${esc(order.status)}</p></div></div><div class="active-summary"><span>Confirmations <b>${esc(order.confirmations)} / ${esc(order.requiredConfirmations)}</b></span><span>Received <b>${order.receivedUsdt === null ? '—' : `${num(order.receivedUsdt)} USDT`}</b></span><span>TXID <b class="digi-copy">${esc(order.txId || 'Not detected')}</b></span></div>${order.review ? `<div class="notice warn">${esc(order.review.reason || 'Manual review required')}</div>` : ''}${refs.length ? `<div class="notice">Payout references: ${refs.map(ref => esc(ref.reference || '')).join(', ')}</div>` : ''}<button class="ghost-btn full" style="margin-top:9px" onclick="openOrder('${esc(order.id)}')">View status timeline</button></section>`; if (!finalOrder(order)) scheduleOrderRefresh(); }
  function scheduleOrderRefresh() { scheduleRefresh(); }
  function timeLeft(ms) { const total = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
  function copyAddress(value) { navigator.clipboard?.writeText(value).then(() => toastMsg('Address copied')).catch(() => toastMsg('Copy was not available', true)); }

  function renderOrders() { const node = $('ordersList'); if (!node) return; const rows = state.orders.filter(order => state.orderFilter === 'All' || state.orderFilter === 'Active' ? (state.orderFilter === 'Active' ? activeStatuses().includes(order.status) : true) : order.status === state.orderFilter); $('ordersCount').textContent = `${rows.length} orders`; $('ordersVolume').textContent = `${inr(rows.filter(order => order.status === 'Completed').reduce((sum, order) => sum + Number(order.inrAmount || 0), 0))} settled`; $('osActive').textContent = state.orders.filter(order => activeStatuses().includes(order.status)).length; $('osCompleted').textContent = state.orders.filter(order => order.status === 'Completed').length; node.innerHTML = rows.length ? rows.map(orderRow).join('') : `<div class="card empty"><b>No matching orders</b><p>Your server-backed order history will appear here.</p></div>`; }
  function setOrderFilter(value, element) { state.orderFilter = value; $('orderFilters')?.querySelectorAll('button').forEach(button => button.classList.toggle('active', button === element)); renderOrders(); }
  function openOrder(id) { const order = state.orders.find(item => item.id === id); if (!order) return; const timeline = (order.timeline || []).map(item => `<div class="tl done"><div class="tl-mark">✓</div><div><b>${esc(item.status)}</b><small>${esc(date(item.at))}</small></div></div>`).join(''); const refs = order.payout?.references || []; $('orderDetail').innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px"><div><h3>${esc(order.id)}</h3><p class="desc">${esc(order.payoutType)} · ${num(order.usdtAmount)} USDT · ${inr(order.inrAmount)}</p></div><span class="status-pill ${statusClass(order.status)}">${esc(order.status)}</span></div><div class="detail-list"><div><dt>Deposit address</dt><dd class="digi-copy">${esc(order.depositAddress)}</dd></div><div><dt>TXID</dt><dd class="digi-copy">${esc(order.txId || 'Not detected')}</dd></div><div><dt>Confirmations</dt><dd>${esc(order.confirmations)} / ${esc(order.requiredConfirmations)}</dd></div><div><dt>Received</dt><dd>${order.receivedUsdt === null ? '—' : `${num(order.receivedUsdt)} USDT`}</dd></div><div><dt>Payout</dt><dd>${esc(order.payout?.status || 'Pending')}</dd></div></div><div class="subsection"><h3>Timeline</h3><div class="timeline">${timeline || '<span class="muted">No events yet</span>'}</div></div>${refs.length ? `<div class="notice">${refs.map(ref => `${esc(ref.mode || '')}: ${esc(ref.reference || '')} · ${inr(ref.inrAmount)}`).join('<br>')}</div>` : ''}`; show($('orderOv')); }

  function renderMethods() { const node = $('profileMethods'); if (!node) return; const rows = state.methods.slice(0, 3); node.innerHTML = rows.length ? rows.map(method => `<div class="profile-method-row"><div class="profile-method-copy"><b>${esc(method.type === 'UPI' ? 'UPI ID' : method.label || 'Bank account')}</b><small>${esc(method.type === 'UPI' ? method.upiId : `•••• ${String(method.accountNumber || '').slice(-4)} · ${method.ifsc || ''}`)} · ${esc(method.holderName)}</small><span>${inr(method.minInr)}–${inr(method.maxInr)} per trade · ${method.enabled ? 'Enabled' : 'Disabled'}</span></div><button class="toggle ${method.enabled ? 'on' : ''}" onclick="toggleMethod('${esc(method.id)}')"> </button></div>`).join('') : '<div class="empty compact-empty"><b>No payout methods</b><p>Add a UPI ID or bank account.</p></div>'; }
  function openManage() { renderManage(); show($('manageOv')); }
  function renderManage() { const node = $('manageList'); if (!node) return; node.innerHTML = state.methods.length ? state.methods.map(method => `<div class="manage-method"><div class="manage-top"><div class="manage-copy"><b>${esc(method.label || method.upiId || 'Payout method')}</b><small>${esc(method.type === 'UPI' ? method.upiId : `•••• ${String(method.accountNumber || '').slice(-4)} · ${method.ifsc || ''}`)}</small></div><button class="toggle ${method.enabled ? 'on' : ''}" onclick="toggleMethod('${esc(method.id)}')"> </button></div><div class="capacity-row"><span>${inr(method.minInr)}–${inr(method.maxInr)} per trade</span><b>${inr(method.dailyLimitInr)} daily</b></div><div class="manage-footer"><button class="ghost-btn" onclick="editLimits('${esc(method.id)}')">Edit limits</button><button class="ghost-btn" onclick="editMethod('${esc(method.id)}')">Edit details</button><button class="more-btn" onclick="askDelete('${esc(method.id)}')">Delete</button></div></div>`).join('') : '<div class="digi-empty">No payout methods saved.</div>'; }
  function openAdd(type, method = null) { const isBank = String(type).toUpperCase() === 'BANK'; $('addOv').dataset.editId = method?.id || ''; $('addUpiTab')?.classList.toggle('active', !isBank); $('addBankTab')?.classList.toggle('active', isBank); $('upiFields').style.display = isBank ? 'none' : ''; $('bankFields').style.display = isBank ? '' : 'none'; if (!$('bankInstitution')) $('bankFields').insertAdjacentHTML('afterbegin', '<label class="label">Bank name</label><input id="bankInstitution" class="input" placeholder="Bank name">'); setAddType(isBank ? 'bank' : 'upi'); if (method) { $('upiId').value = method.upiId || ''; $('upiName').value = method.holderName || ''; $('upiMobile').value = method.mobile || ''; $('bankInstitution').value = method.bankName || ''; $('bankAcc').value = ''; $('bankAcc2').value = ''; $('bankIfsc').value = method.ifsc || ''; $('bankName').value = method.holderName || ''; $('bankMobile').value = method.mobile || ''; $('addMin').value = method.minInr || ''; $('addMax').value = method.maxInr || ''; $('addDaily').value = method.dailyLimitInr || ''; } else { document.querySelectorAll('#addOv input').forEach(input => { if (input.type !== 'hidden') input.value = ''; }); } show($('addOv')); }
  function setAddType(type) { const isBank = String(type).toLowerCase() === 'bank'; $('addUpiTab')?.classList.toggle('active', !isBank); $('addBankTab')?.classList.toggle('active', isBank); $('upiFields').style.display = isBank ? 'none' : ''; $('bankFields').style.display = isBank ? '' : 'none'; }
  async function saveMethod() { const editId = $('addOv').dataset.editId; const isBank = $('bankFields').style.display !== 'none'; const body = { type:isBank ? 'BANK' : 'UPI', label:isBank ? `Bank ••${$('bankAcc').value.slice(-4)}` : 'UPI', minInr:Number($('addMin').value), maxInr:Number($('addMax').value), dailyLimitInr:Number($('addDaily').value) }; if (isBank) Object.assign(body, { bankName:$('bankInstitution').value.trim(), accountNumber:$('bankAcc').value.trim(), ifsc:$('bankIfsc').value.trim(), holderName:$('bankName').value.trim(), mobile:$('bankMobile').value.trim() }); else Object.assign(body, { upiId:$('upiId').value.trim(), holderName:$('upiName').value.trim(), mobile:$('upiMobile').value.trim() }); try { await api(editId ? `/payout-methods/${encodeURIComponent(editId)}` : '/payout-methods', { method:editId ? 'PATCH' : 'POST', body:JSON.stringify(body) }); hide($('addOv')); await refreshAll(); toastMsg(editId ? 'Payout method updated' : 'Payout method saved'); } catch (error) { toastMsg(error.message, true); } }
  async function toggleMethod(id) { const method = state.methods.find(item => item.id === id); if (!method) return; try { await api(`/payout-methods/${encodeURIComponent(id)}/status`, { method:'PATCH', body:JSON.stringify({ enabled:!method.enabled }) }); await refreshAll(); toastMsg(method.enabled ? 'Payout method disabled' : 'Payout method enabled'); } catch (error) { toastMsg(error.message, true); } }
  function editLimits(id) { const method = state.methods.find(item => item.id === id); if (!method) return; $('editId').value = id; $('editMin').value = method.minInr; $('editMax').value = method.maxInr; $('editDaily').value = method.dailyLimitInr; show($('limitOv')); }
  async function saveLimits() { const id = $('editId').value; try { await api(`/payout-methods/${encodeURIComponent(id)}`, { method:'PATCH', body:JSON.stringify({ minInr:Number($('editMin').value), maxInr:Number($('editMax').value), dailyLimitInr:Number($('editDaily').value) }) }); hide($('limitOv')); await refreshAll(); toastMsg('Limits updated'); } catch (error) { toastMsg(error.message, true); } }
  function editMethod(id) { const method = state.methods.find(item => item.id === id); if (method) { hide($('manageOv')); openAdd(method.type, method); } }
  function askDelete(id) { const method = state.methods.find(item => item.id === id); if (!method) return; $('deleteId').value = id; $('deleteMsg').textContent = `Delete ${method.label || method.upiId || 'this payout method'}?`; show($('deleteOv')); }
  async function confirmDelete() { try { await api(`/payout-methods/${encodeURIComponent($('deleteId').value)}`, { method:'DELETE' }); hide($('deleteOv')); await refreshAll(); toastMsg('Payout method deleted'); } catch (error) { toastMsg(error.message, true); } }

  function renderWheel() { const wheel = state.wheel; if (!wheel) return; const labels = document.querySelectorAll('.seg-label'); (wheel.segments || []).forEach((segment, index) => { if (labels[index]) labels[index].textContent = segment.rewardAmount; }); const can = wheel.canSpin; const button = $('spinBtn'); if (button) { button.disabled = !can; button.textContent = can ? 'Spin Now' : 'Used Today'; } setText('spinNote', can ? 'Available now · result is selected by the server' : wheel.previousResult ? `Today reward: ${wheel.previousResult.rewardAmount} USDT` : `Next available ${date(wheel.nextEligibleAt)}`); }
  async function spin() { const button = $('spinBtn'); if (button) button.disabled = true; try { const result = await api('/wheel/spin', { method:'POST', headers:{ 'Idempotency-Key':idempotencyKey() } }); const segmentIndex = Array.from(document.querySelectorAll('.seg-label')).findIndex(label => label.textContent === String(result.result.label)); const index = segmentIndex >= 0 ? segmentIndex : 0; state.wheelRotation += 360 * 6 + ((360 - index * 45) % 360); $('wheel').style.transform = `rotate(${state.wheelRotation}deg)`; setTimeout(async () => { setText('winAmount', `${result.result.rewardAmount} USDT`); show($('winOv')); await refreshAll(); }, 4500); } catch (error) { toastMsg(error.message, true); renderWheel(); } }
  function openRewardHistory() { $('rewardHistory').innerHTML = (state.rewards.ledger || state.rewards.recent || []).length ? (state.rewards.ledger || state.rewards.recent).map(item => `<div class="history-row"><div><b>${esc(item.description || item.sourceType)}</b><small>${esc(date(item.createdAt))}</small></div><strong>${item.direction === 'debit' ? '-' : '+'}${num(item.amount)} USDT</strong></div>`).join('') : '<div class="empty"><b>No rewards yet</b></div>'; show($('rewardHistoryOv')); }
  function renderTasks() { const node = $('tasks'); if (!node) return; const tasks = state.campaigns.flatMap(campaign => (campaign.tasks || []).map(task => ({ ...task, campaignTitle:campaign.title }))).filter(task => task.enabled && (!state.taskFilter || state.taskFilter === 'All' || String(task.claimType).toLowerCase() === state.taskFilter.toLowerCase())); node.innerHTML = tasks.length ? tasks.map(task => `<div class="card task-card"><div class="task-top"><div><h4>${esc(task.title)}</h4><p>${esc(task.description)}</p><div class="campaign">${esc(task.campaignTitle)} · ${esc(date(task.endsAt))}</div></div><div class="task-reward">${esc(task.claim?.status === 'credited' ? 'Claimed' : `${task.rewardAmount} USDT`)}</div></div><div class="task-foot"><span class="task-progress">${esc(task.eligibility?.progress ?? 0)} / ${esc(task.eligibility?.target ?? '—')}</span><button class="claim-btn ${task.eligibility?.eligible && !task.claim ? 'ready' : ''}" ${task.eligibility?.eligible && !task.claim ? '' : 'disabled'} onclick="claimTask('${esc(task.id)}','${esc(task.campaignId)}')">${task.claim ? esc(task.claim.status) : task.eligibility?.eligible ? 'Claim Now' : 'In Progress'}</button></div></div>`).join('') : '<div class="card empty"><b>No active campaigns</b><p>New server-managed campaigns will appear here.</p></div>'; }
  function filterTasks(filter, element) { state.taskFilter = filter; $('taskFilters')?.querySelectorAll('button').forEach(button => button.classList.toggle('active', button === element)); renderTasks(); }
  async function claimTask(taskId, campaignId) { try { await api(`/campaigns/${encodeURIComponent(campaignId)}/claim`, { method:'POST', body:JSON.stringify({ taskId }) }); await refreshAll(); toastMsg('Task claim submitted'); } catch (error) { toastMsg(error.message, true); } }
  function scrollTasks() { $('taskAnchor')?.scrollIntoView({ behavior:'smooth' }); }
  function openEvent(type) { go('rewards'); toastMsg(type === 'newuser' ? 'Your active campaign is shown below.' : 'Active campaigns are managed by the server.'); }

  function renderReferral() { const data = state.referrals; if (!data) return; setText('refInvited', data.invitedCount ?? 0); setText('refSuccessful', data.qualifiedCount ?? 0); setText('refEarn', `${num(data.rewardEarned)} USDT`); if ($('refLink')) $('refLink').value = data.webUrl || data.referralCode || ''; $('refHistory').innerHTML = (data.referrals || []).length ? data.referrals.map(item => `<div class="history-row"><div><b>${esc(item.referred?.name || item.referred?.id || 'Referred user')}</b><small>${esc(date(item.createdAt))} · ${esc(item.status)}</small></div><strong>+${num(item.inviterReward)} USDT</strong></div>`).join('') : '<div class="empty"><b>No referrals yet</b></div>'; }
  function openReferral() { renderReferral(); show($('referralOv')); }
  function copyReferral() { const value = $('refLink')?.value || ''; navigator.clipboard?.writeText(value).then(() => toastMsg('Referral information copied')).catch(() => toastMsg('Copy was not available', true)); }

  async function openNotifications() { try { const result = await api('/notifications?limit=100'); state.notifications = result.notifications || []; $('notifList').innerHTML = state.notifications.length ? state.notifications.map(item => `<button class="history-row" style="width:100%;text-align:left;border:0;background:none;color:inherit" onclick="markNotification('${esc(item.id)}')"><div><b>${esc(item.title)}</b><small>${esc(item.message)}<br>${esc(date(item.createdAt))}</small></div><strong>${item.readAt ? '' : '•'}</strong></button>`).join('') : '<div class="empty"><b>No notifications</b></div>'; show($('notifOv')); } catch (error) { toastMsg(error.message, true); } }
  async function markNotification(id) { try { await api(`/notifications/${encodeURIComponent(id)}/read`, { method:'PATCH' }); const item = state.notifications.find(notification => notification.id === id); if (item && !item.readAt) state.unreadCount = Math.max(0, state.unreadCount - 1); state.notifications = state.notifications.map(item => item.id === id ? { ...item, readAt:Date.now() } : item); renderNotifications(); } catch (error) { toastMsg(error.message, true); } }
  async function readAllNotifications() { try { await api('/notifications/read-all', { method:'POST' }); state.notifications.forEach(item => { item.readAt = item.readAt || Date.now(); }); state.unreadCount = 0; renderNotifications(); toastMsg('Notifications marked as read'); } catch (error) { toastMsg(error.message, true); } }
  function renderNotifications() { const unread = Number.isFinite(state.unreadCount) ? state.unreadCount : state.notifications.filter(item => !item.readAt).length; if ($('notifDot')) $('notifDot').style.display = unread ? 'block' : 'none'; }
  function toggleNotifications() { const enabled = state.profile?.notificationPreference !== false; api('/profile', { method:'PATCH', body:JSON.stringify({ notificationPreference:!enabled }) }).then(result => { state.profile=result.profile; renderAll(); toastMsg(enabled ? 'Optional alerts muted' : 'Optional alerts enabled'); }).catch(error => toastMsg(error.message, true)); }

  async function openSupport() { try { const result = await api('/support'); state.tickets = result.tickets || []; renderSupportOverlay(); show($('supportOv')); } catch (error) { toastMsg(error.message, true); } }
  function renderSupportOverlay() { const node = $('supportOv')?.querySelector('.sheet'); if (!node) return; node.innerHTML = `<div class="handle"></div><h3>Help & Support</h3><p class="desc">Create a ticket and follow replies from the support team.</p><div class="digi-action-row"><button class="gold-btn" onclick="newSupportTicket()">New ticket</button></div><div id="digiTickets" class="sheet-list">${state.tickets.length ? state.tickets.map(ticket => `<button class="card menu-row" style="width:100%;text-align:left;color:inherit" onclick="openTicket('${esc(ticket.id)}')"><div><b>${esc(ticket.subject)}</b><small>${esc(ticket.category)} · ${esc(ticket.status)} · ${esc(date(ticket.updatedAt))}</small></div><span>›</span></button>`).join('') : '<div class="empty"><b>No support tickets</b></div>'}</div>`; }
  function newSupportTicket() { const node = $('supportOv').querySelector('.sheet'); node.innerHTML = `<div class="handle"></div><h3>New support ticket</h3><label class="label">Category</label><select id="digiTicketCategory" class="input"><option>ORDER</option><option>DEPOSIT</option><option>PAYOUT</option><option>ACCOUNT</option><option>OTHER</option></select><label class="label">Subject</label><input id="digiTicketSubject" class="input" maxlength="120"><label class="label">Order ID <span class="hint">optional</span></label><input id="digiTicketOrder" class="input" maxlength="50"><label class="label">Message</label><textarea id="digiTicketMessage" class="input" maxlength="4000" style="min-height:110px"></textarea><div class="digi-action-row"><button class="ghost-btn" onclick="openSupport()">Cancel</button><button class="gold-btn" onclick="createSupportTicket()">Submit ticket</button></div>`; }
  async function createSupportTicket() { try { await api('/support', { method:'POST', body:JSON.stringify({ category:$('digiTicketCategory').value, subject:$('digiTicketSubject').value.trim(), orderId:$('digiTicketOrder').value.trim() || undefined, message:$('digiTicketMessage').value.trim() }) }); await openSupport(); toastMsg('Support ticket created'); } catch (error) { toastMsg(error.message, true); } }
  async function openTicket(id) { try { const result = await api(`/support/${encodeURIComponent(id)}`); const ticket=result.ticket; $('supportOv').querySelector('.sheet').innerHTML = `<div class="handle"></div><h3>${esc(ticket.subject)}</h3><p class="desc">${esc(ticket.category)} · ${esc(ticket.status)}${ticket.orderId ? ` · ${esc(ticket.orderId)}` : ''}</p><div class="sheet-list">${(ticket.messages || []).map(item => `<div class="card" style="padding:11px"><b>${item.senderType === 'admin' ? 'Support team' : 'You'}</b><small>${esc(date(item.createdAt))}</small><p style="white-space:pre-wrap">${esc(item.text)}</p></div>`).join('')}</div>${ticket.status === 'Closed' ? '<div class="notice">This ticket is closed.</div>' : `<textarea id="digiTicketReply" class="input" maxlength="4000" placeholder="Reply to support"></textarea><div class="digi-action-row"><button class="ghost-btn" onclick="openSupport()">Back</button><button class="gold-btn" onclick="replyTicket('${esc(ticket.id)}')">Reply</button><button class="danger-btn" onclick="closeTicket('${esc(ticket.id)}')">Close</button></div>`}`; show($('supportOv')); } catch (error) { toastMsg(error.message, true); } }
  async function replyTicket(id) { try { await api(`/support/${encodeURIComponent(id)}/messages`, { method:'POST', body:JSON.stringify({ message:$('digiTicketReply').value.trim() }) }); await openTicket(id); toastMsg('Reply sent'); } catch (error) { toastMsg(error.message, true); } }
  async function closeTicket(id) { try { await api(`/support/${encodeURIComponent(id)}/close`, { method:'POST' }); await openSupport(); toastMsg('Ticket closed'); } catch (error) { toastMsg(error.message, true); } }

  function renderSecurityState() { const enabled = !!state.twoFactor?.enabled; setText('twoFAState', `${enabled ? 'Enabled' : 'Not Enabled'} ›`); const toggle = $('twoFAToggle'); if (toggle) toggle.classList.toggle('on', enabled); }
  async function openSecurity() { try { const result = await api('/security/2fa/status'); state.twoFactor=result; const node=$('securityOv').querySelector('.sheet'); node.innerHTML = `<div class="handle"></div><h3>Two-Factor Authentication</h3><p class="desc">Use an authenticator app to protect your account.</p>${result.enabled ? `<div class="card" style="padding:12px"><b>2FA is enabled</b><small style="display:block;margin-top:5px">${esc(result.backupCodesRemaining)} recovery codes remaining.</small></div><button class="danger-btn full" style="margin-top:10px" onclick="disable2FAForm()">Disable 2FA</button>` : `<button class="gold-btn full" onclick="setup2FA()">Set up 2FA</button>`}`; show($('securityOv')); } catch (error) { toastMsg(error.message, true); } }
  async function setup2FA() { try { const result=await api('/security/2fa/setup',{method:'POST'}); const node=$('securityOv').querySelector('.sheet'); node.innerHTML=`<div class="handle"></div><h3>Set up 2FA</h3><p class="desc">Add this secret to an authenticator app, then verify the generated code.</p><div class="digi-security-extra"><small>Manual secret</small><br><code>${esc(result.secret)}</code><br><small style="display:block;margin-top:8px">Authenticator URI</small><code>${esc(result.otpauthUri)}</code></div><label class="label">Verification code</label><input id="digi2faEnableCode" class="input" inputmode="numeric" maxlength="6"><button class="gold-btn full" style="margin-top:10px" onclick="enable2FA()">Verify and enable</button>`; } catch(error) { toastMsg(error.message,true); } }
  async function enable2FA() { try { const result=await api('/security/2fa/enable',{method:'POST',body:JSON.stringify({code:$('digi2faEnableCode').value.trim()})}); const node=$('securityOv').querySelector('.sheet'); node.innerHTML=`<div class="handle"></div><h3>Save recovery codes</h3><p class="desc">These codes are shown once. Store them securely before closing.</p><div class="digi-security-extra"><code>${result.recoveryCodes.map(esc).join('<br>')}</code></div><button class="gold-btn full" style="margin-top:10px" onclick="openSecurity()">I saved my codes</button>`; await refreshAll(); } catch(error) { toastMsg(error.message,true); } }
  function disable2FAForm() { const node=$('securityOv').querySelector('.sheet'); node.innerHTML='<div class="handle"></div><h3>Disable 2FA</h3><label class="label">Current password</label><input id="digiDisablePassword" class="input" type="password"><label class="label">TOTP or recovery code</label><input id="digiDisableCode" class="input"><button class="danger-btn full" style="margin-top:10px" onclick="disable2FA()">Disable 2FA</button>'; }
  async function disable2FA() { try { await api('/security/2fa/disable',{method:'POST',body:JSON.stringify({currentPassword:$('digiDisablePassword').value,code:$('digiDisableCode').value.trim()})}); hide($('securityOv')); await refreshAll(); toastMsg('2FA disabled'); } catch(error) { toastMsg(error.message,true); } }
  async function openSessions() { try { const result=await api('/security/sessions'); state.sessions=result.sessions||[]; const node=$('sessionsOv').querySelector('.sheet'); node.innerHTML=`<div class="handle"></div><h3>Login & Devices</h3><p class="desc">Review and revoke active sessions.</p><div class="sheet-list">${state.sessions.length ? state.sessions.map(session=>`<div class="card" style="padding:11px"><b>${esc(session.device)} ${session.current ? '· Current session' : ''}</b><small style="display:block">Created ${esc(date(session.createdAt))} · Last seen ${esc(date(session.lastSeenAt))}</small>${session.current ? '' : `<button class="danger-btn" style="min-height:36px;margin-top:8px" onclick="revokeSession('${esc(session.id)}')">Revoke</button>`}</div>`).join('') : '<div class="empty">No active sessions</div>'}</div><button class="ghost-btn full" style="margin-top:10px" onclick="revokeOtherSessions()">Revoke other sessions</button>`; show($('sessionsOv')); } catch(error) { toastMsg(error.message,true); } }
  async function revokeSession(id) { try { await api(`/security/sessions/${encodeURIComponent(id)}`,{method:'DELETE'}); await openSessions(); toastMsg('Session revoked'); } catch(error) { toastMsg(error.message,true); } }
  async function revokeOtherSessions() { try { await api('/security/sessions/revoke-others',{method:'POST'}); await openSessions(); toastMsg('Other sessions revoked'); } catch(error) { toastMsg(error.message,true); } }
  async function changePassword() { try { await api('/security/change-password',{method:'POST',body:JSON.stringify({currentPassword:$('digiCurrentPassword').value,newPassword:$('digiNewPassword').value})}); await openSessions(); toastMsg('Password changed'); } catch(error) { toastMsg(error.message,true); } }
  async function openSessionsWithPassword() { await openSessions(); const sheet = $('sessionsOv')?.querySelector('.sheet'); if (!sheet || $('digiPasswordChange')) return; sheet.insertAdjacentHTML('beforeend', '<div id="digiPasswordChange" class="subsection" style="margin-top:18px"><h3>Change password</h3><label class="label">Current password</label><input id="digiCurrentPassword" class="input" type="password" autocomplete="current-password"><label class="label">New password</label><input id="digiNewPassword" class="input" type="password" autocomplete="new-password"><button class="gold-btn full" style="margin-top:10px" onclick="changePassword()">Change password</button></div>'); }
  async function setup2FAWithQr() { await setup2FA(); const sheet = $('securityOv')?.querySelector('.sheet'); const codes = sheet?.querySelectorAll('.digi-security-extra code'); const uri = codes?.[codes.length - 1]?.textContent; if (uri && window.digiQr && !sheet.querySelector('.digi-2fa-qr')) { const canvas = document.createElement('canvas'); canvas.className = 'digi-2fa-qr'; canvas.dataset.size = '190'; canvas.setAttribute('aria-label', 'Authenticator setup QR'); sheet.querySelector('.digi-security-extra').before(canvas); window.digiQr.render(canvas, uri); } }
  function openProfileEdit() { $('editName').value=state.profile?.fullName||''; $('editMobile').value=state.profile?.mobile||''; $('eProfile').textContent=''; show($('profileEditOv')); }
  async function saveProfile() { try { const result=await api('/profile',{method:'PATCH',body:JSON.stringify({fullName:$('editName').value.trim(),mobile:$('editMobile').value.trim()})}); state.profile=result.profile; hide($('profileEditOv')); renderAll(); toastMsg('Profile updated'); } catch(error) { $('eProfile').textContent=error.message; } }
  function copyUserId() { copyAddress(state.profile?.userId || ''); }
  function openLanguage() { show($('languageOv')); }
  function setLanguage(language) { prefs.language=language; savePrefs(); hide($('languageOv')); renderAll(); }
  function openTheme() { show($('themeOv')); }
  function setTheme(theme) { prefs.theme=theme; savePrefs(); hide($('themeOv')); renderAll(); }
  function openChart() { show($('chartOv')); }
  function openPortfolio() { const completed=state.orders.filter(order=>order.status==='Completed'); $('portfolioDetail').innerHTML=`<div class="card menu-row"><div><b>Completed volume</b><small>${num(completed.reduce((sum,order)=>sum+Number(order.usdtAmount||0),0))} USDT</small></div></div><div class="card menu-row"><div><b>Settled INR</b><small>${inr(completed.reduce((sum,order)=>sum+Number(order.inrAmount||0),0))}</small></div></div>`; show($('portfolioOv')); }
  function logout() { api('/auth/logout',{method:'POST',allow401:true}).catch(()=>{}).finally(()=>sessionExpired()); }
  function go(page) { document.querySelectorAll('.page').forEach(node=>node.classList.toggle('active',node.id===page)); document.querySelectorAll('.nav button').forEach(node=>node.classList.toggle('active',node.dataset.page===page)); const titles={home:['Home','Trade, earn rewards and track your account.'],sell:['Sell','Sell USDT and receive INR.'],orders:['Orders','Track every trade and settlement.'],rewards:['Rewards','Server-managed rewards and campaigns.'],profile:['Profile','Account, payout methods and security.']}; setText('pageTitle',titles[page]?.[0]||'digiRupee'); setText('pageSub',titles[page]?.[1]||''); if(page==='orders')renderOrders(); if(page==='rewards'){renderTasks();renderWheel();} if(page==='profile')renderMethods(); }
  function renderActiveQr() { const holder = document.querySelector('.digi-qr-placeholder'); const order = activeOrder(); if (!holder || !order?.depositAddress || !window.digiQr) return; const canvas = document.createElement('canvas'); canvas.className = 'digi-qr'; canvas.dataset.size = '176'; canvas.setAttribute('aria-label', 'Deposit address QR'); holder.replaceWith(canvas); try { window.digiQr.render(canvas, order.depositAddress); } catch (error) { canvas.replaceWith(holder); } }
  function tick() { setText('clock',new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false})); if(activeOrder()?.status==='Awaiting Deposit') renderActiveOrder(); renderActiveQr(); syncQuoteControls(); }

  Object.assign(window, { bg, go, setType, quote, lockQuote:lockQuoteProduction, setMax, selectMethod, toggleBankAllocation, copyAddress, openOrder, setOrderFilter, openAdd, setAddType, saveMethod, toggleMethod, editLimits, saveLimits, editMethod, askDelete, confirmDelete, openManage, spin, openRewardHistory, filterTasks, claimTask, scrollTasks, openEvent, openReferral, copyReferral, openNotifications, markNotification, readAllNotifications, toggleNotifications, openSupport, newSupportTicket, createSupportTicket, openTicket, replyTicket, closeTicket, openSecurity, setup2FA:setup2FAWithQr, enable2FA, disable2FAForm, disable2FA, openSessions:openSessionsWithPassword, revokeSession, revokeOtherSessions, changePassword, openProfileEdit, saveProfile, copyUserId, openLanguage, setLanguage, openTheme, setTheme, openChart, openPortfolio, logout, toastMsg });

  document.addEventListener('visibilitychange', () => document.hidden ? stopRefresh() : refreshAll());
  window.addEventListener('focus', () => refreshAll());
  document.addEventListener('DOMContentLoaded', async () => {
    injectAuth();
    const app = document.querySelector('.app'); if (app) app.style.display = 'none';
    renderAuth('login');
    setInterval(tick, 1000); tick();
    try { const result = await api('/me', { allow401:true }); await authenticated(result); }
    catch (error) { if (!String(error.message).includes('401')) renderAuth('login'); }
  });
})();
