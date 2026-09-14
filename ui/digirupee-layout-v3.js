(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[ch]));
  const num = value => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 6 });
  const inr = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const fmtDate = value => value ? new Date(value).toLocaleString('en-IN', {
    day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit'
  }) : '—';

  const baseGo = typeof window.go === 'function' ? window.go.bind(window) : null;
  const baseSetType = typeof window.setType === 'function' ? window.setType.bind(window) : null;

  const model = {
    user:null,
    profile:null,
    rates:null,
    methods:[],
    orders:[],
    route:'home',
    historyFilter:'All',
    bankAllocations:new Map(),
    lastBankTargetPaise:0
  };

  const activeStatuses = new Set(['Awaiting Deposit','Detected','Confirming','USDT Confirmed','INR Processing','Late Review']);

  function injectStyles() {
    if (document.getElementById('digirupee-layout-v4-css')) return;
    document.getElementById('digirupee-layout-v3-css')?.remove();
    const style = document.createElement('style');
    style.id = 'digirupee-layout-v4-css';
    style.textContent = `
      html,body{height:100%;min-height:100%;overflow:hidden;background:#000!important}
      body.digi-layout-v4{margin:0!important;padding:0!important}
      body.digi-layout-v4.digi-legacy-insets .app{padding-top:24px!important;box-sizing:border-box!important}
      body.digi-layout-v4 .app{width:min(430px,100%)!important;height:100%!important;min-height:0!important;max-height:100%!important;grid-template-rows:auto minmax(0,1fr) var(--nav)!important;overflow:hidden!important;margin:0 auto!important}
      body.digi-layout-v4 .statusbar{display:none!important}
      body.digi-layout-v4 .header{grid-row:1!important;padding:14px 15px 11px!important;min-height:74px!important;box-sizing:border-box!important;background:#050607!important}
      body.digi-layout-v4 .header-copy{min-width:0;padding-top:1px}
      body.digi-layout-v4 .header-copy h1{font-size:26px!important;line-height:1.02!important}
      body.digi-layout-v4 .header-copy p{font-size:11px!important;line-height:1.35!important;white-space:normal!important}
      body.digi-layout-v4 .page{grid-row:2!important;padding:0 15px 18px!important;min-height:0!important}
      body.digi-layout-v4 .app>.nav{grid-row:3!important;position:static!important;width:100%!important;height:var(--nav)!important;padding:6px 8px 7px!important;box-sizing:border-box!important}
      body.digi-layout-v4 .app>.nav button{min-width:0!important}
      body.digi-layout-v4 .app>.nav .nav-icon{width:31px!important;height:31px!important}
      body.digi-layout-v4 .app>.nav .nav-icon svg{width:27px!important;height:27px!important}
      body.digi-layout-v4 #sell .compact-segment,
      body.digi-layout-v4 #sell .sell-availability,
      body.digi-layout-v4 #activeSell{display:none!important}
      body.digi-layout-v4 #sell .sell-intro{padding-top:1px!important}
      .digi-rail-summary{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:7px;margin:0 0 12px}
      .digi-rail-card{padding:11px;border:1px solid #282d35;border-radius:13px;background:#0d0f12;min-width:0}
      .digi-rail-card.primary{background:linear-gradient(145deg,#17140b,#0d0f12);border-color:#4b4122}
      .digi-rail-card small{display:block;color:#878d96;font-size:8px}
      .digi-rail-card b{display:block;margin-top:4px;font-size:12px;color:#f5f1e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .digi-rail-card.primary b{color:#f2cf63;font-size:13px}
      .digi-route-methods{border:1px solid #282d35;border-radius:14px;background:#0d0f12;padding:12px}
      .digi-route-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .digi-route-head b{font-size:12px}.digi-route-head small{display:block;margin-top:3px;color:#878d96;font-size:8.7px;line-height:1.35}
      .digi-auto-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid #285947;background:#123126;color:#75e0ad;border-radius:999px;padding:6px 9px;font-size:8.5px;font-weight:850;white-space:nowrap}
      .digi-auto-pill i{width:7px;height:7px;border-radius:50%;background:#3ed491;box-shadow:0 0 0 3px #3ed49122}
      .digi-auto-pill.off{border-color:#56313a;background:#28161b;color:#ef8d9d}.digi-auto-pill.off i{background:#e85c70}
      .digi-route-actions{display:flex;gap:7px;margin-top:10px}.digi-route-actions button{flex:1;min-height:36px}
      .digi-bank-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}
      .digi-bank-allocation{display:grid;grid-template-columns:minmax(0,1fr) 118px;gap:10px;align-items:center;padding:10px;border:1px solid #292e36;border-radius:11px;background:#101318}
      .digi-bank-copy{min-width:0}.digi-bank-copy b{display:block;font-size:10.7px}.digi-bank-copy small{display:block;margin-top:3px;color:#858b93;font-size:8.5px;line-height:1.35;white-space:normal}
      .digi-bank-input{display:flex;align-items:center;border:1px solid #343a43;border-radius:9px;background:#0b0d10;padding:0 8px}
      .digi-bank-input span{font-size:10px;color:#d6bc5c}.digi-bank-input input{width:100%;min-width:0;height:38px;border:0;background:transparent;color:#fff;text-align:right;outline:none;font-size:11px}
      .digi-allocation-summary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px}
      .digi-allocation-summary>div{padding:8px;border:1px solid #262b32;border-radius:9px;background:#0b0d10;text-align:center}
      .digi-allocation-summary small{display:block;color:#7f858e;font-size:7.8px}.digi-allocation-summary b{display:block;margin-top:3px;font-size:9.5px}
      .digi-allocation-warning{margin-top:8px;color:#e9bd55;font-size:8.5px;line-height:1.4}.digi-allocation-warning.error{color:#ef7786}
      .digi-channel-active{margin-top:14px}
      .digi-live-card{padding:13px;border:1px solid #343941;border-radius:14px;background:#0d0f12}
      .digi-live-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .digi-live-head h3{margin:0;font-size:13px}.digi-live-head p{margin:4px 0 0;color:#8f959e;font-size:9px;line-height:1.4}
      .digi-deposit-grid{display:grid;grid-template-columns:104px minmax(0,1fr);gap:12px;align-items:center;margin-top:12px}
      .digi-channel-qr{width:104px;height:104px;border-radius:10px;background:#fff;padding:5px;box-sizing:border-box}
      .digi-address-box{min-width:0}.digi-address-box small{display:block;color:#7f858e;font-size:8.5px}.digi-address-box code{display:block;margin-top:5px;color:#f1d36f;font-size:9px;word-break:break-all;line-height:1.4}
      .digi-live-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}.digi-live-grid>div{padding:8px;border-radius:9px;background:#111419;border:1px solid #242932;min-width:0}
      .digi-live-grid small{display:block;color:#7f858e;font-size:7.8px}.digi-live-grid b{display:block;margin-top:3px;font-size:9px;overflow-wrap:anywhere}
      .digi-channel-trades{margin-top:18px;padding-top:15px;border-top:1px solid #1d2229}
      .digi-channel-head,.digi-history-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:9px}
      .digi-channel-head h2,.digi-history-head h2{margin:0;font-size:16px}.digi-channel-head span,.digi-history-head p{margin:0;color:#7f858e;font-size:9.5px}
      .digi-trade-list{display:flex;flex-direction:column;gap:7px}.digi-trade-row{width:100%;padding:11px!important;display:block;text-align:left;border:1px solid #282c34!important;border-radius:13px!important;background:#0d0f12!important;color:#fff}
      .digi-trade-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.digi-rail-pill{display:inline-flex;align-items:center;min-height:21px;padding:3px 7px;border-radius:999px;background:#171b21;border:1px solid #30353e;color:#e7ca67;font-size:8.5px;font-weight:850}
      .digi-trade-amounts{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:8px}.digi-trade-amounts b{font-size:13px}.digi-trade-amounts strong{font-size:12px;color:#f0cc61}
      .digi-trade-meta{display:block;margin-top:4px;color:#8c929b;font-size:9px;line-height:1.45;white-space:normal;overflow-wrap:anywhere}
      .digi-empty-state{padding:22px 14px;text-align:center;border:1px solid #252a31;border-radius:13px;background:#0b0d10;color:#858b93;font-size:10px;line-height:1.5}
      #orders.digi-history-mode>*:not(.digi-history-root){display:none!important}.digi-history-root{padding-bottom:8px}.digi-history-back{border:0;background:none;color:#e5c65f;font-size:10px;padding:4px 0 10px}
      .digi-history-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0 12px}.digi-history-stat{padding:10px;border:1px solid #282c34;border-radius:12px;background:#0d0f12;text-align:center}.digi-history-stat small{display:block;color:#858b93;font-size:8px}.digi-history-stat b{display:block;margin-top:3px;font-size:11px}
      .digi-history-filters{display:flex;gap:6px;overflow-x:auto;padding-bottom:9px;scrollbar-width:none}.digi-history-filters button{flex:0 0 auto;min-height:32px;padding:0 10px;border:1px solid #292e36;border-radius:999px;background:#101318;color:#9ba0a8;font-size:9px}.digi-history-filters button.active{background:#2b2413;border-color:#6b5924;color:#f0ce65}
      #profile .digi-profile-history{margin:8px 0 16px}#profile .digi-profile-history .menu-row{cursor:pointer}
      #profile .profile-method-row{grid-template-columns:minmax(0,1fr) 46px!important;gap:10px!important;align-items:center!important}
      #profile .profile-method-copy{min-width:0!important}#profile .profile-method-copy b,#profile .profile-method-copy small,#profile .profile-method-copy span{white-space:normal!important;overflow-wrap:anywhere!important}
      @media(max-width:370px){
        body.digi-layout-v4 .header{padding-left:13px!important;padding-right:13px!important}
        body.digi-layout-v4 .page{padding-left:13px!important;padding-right:13px!important}
        .digi-rail-summary{grid-template-columns:1fr 1fr}.digi-rail-card.primary{grid-column:1/-1}
        .digi-bank-allocation{grid-template-columns:1fr}.digi-deposit-grid{grid-template-columns:88px minmax(0,1fr)}.digi-channel-qr{width:88px;height:88px}
        .digi-live-grid{grid-template-columns:1fr 1fr}.digi-live-grid>div:last-child{grid-column:1/-1}
      }
    `;
    document.head.appendChild(style);
  }

  function currentData(detail) {
    if (!detail) return;
    model.user = detail.user || null;
    model.profile = detail.profile || null;
    model.rates = detail.rates || null;
    model.methods = Array.isArray(detail.methods) ? detail.methods : [];
    model.orders = Array.isArray(detail.orders) ? detail.orders : [];
  }

  function initials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'DR';
    return (words.length === 1 ? words[0].slice(0,2) : `${words[0][0] || ''}${words.at(-1)?.[0] || ''}`).toUpperCase();
  }

  function setHeader(title, subtitle) {
    if ($('pageTitle')) $('pageTitle').textContent = title;
    if ($('pageSub')) $('pageSub').textContent = subtitle;
  }

  function configureNav() {
    const buttons = [...document.querySelectorAll('.app>.nav button')];
    if (buttons.length !== 5) throw new Error(`Expected 5 bottom navigation buttons, found ${buttons.length}`);
    const routes = ['home','upi','bank','rewards','profile'];
    buttons.forEach((button,index) => {
      button.dataset.page = routes[index];
      button.setAttribute('onclick', `go('${routes[index]}')`);
    });
    buttons[1].innerHTML = `<span class="nav-icon"><svg viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="10" fill="#138A67"/><text x="16" y="19" text-anchor="middle" fill="#fff" font-size="10" font-weight="900">UPI</text></svg></span><span>UPI</span>`;
    buttons[2].innerHTML = `<span class="nav-icon"><svg viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="10" fill="#2457D6"/><path d="M7 14h18M9 14v9m4-9v9m6-9v9m4-9v9M6 25h20M16 7l10 5H6z" fill="none" stroke="#fff" stroke-width="1.8"/></svg></span><span>Bank</span>`;
    const labels = ['Home','UPI','Bank','Rewards','Profile'];
    buttons.forEach((button,index) => {
      const last = button.querySelector('[data-nav]') || button.lastElementChild;
      if (last && last !== button.querySelector('.nav-icon')) last.textContent = labels[index];
    });
  }

  function setNavActive(route) {
    document.querySelectorAll('.app>.nav button').forEach(button => button.classList.toggle('active', button.dataset.page === route));
  }

  function methodRemaining(method) {
    const value = Number(method.remainingDailyInr);
    if (Number.isFinite(value)) return Math.max(0, value);
    return Math.max(0, Number(method.dailyLimitInr || 0));
  }

  function railMethods(type, enabledOnly = false) {
    return model.methods.filter(method => String(method.type).toUpperCase() === type && (!enabledOnly || method.enabled));
  }

  function matchingOrders(type) {
    return [...model.orders].filter(order => String(order.payoutType || '').toUpperCase() === type).sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  function railMetrics(type) {
    const methods = railMethods(type, true);
    const orders = matchingOrders(type);
    const active = orders.filter(order => activeStatuses.has(order.status));
    const completed = orders.filter(order => order.status === 'Completed');
    return {
      capacity: methods.reduce((sum, method) => sum + methodRemaining(method), 0),
      activeInr: active.reduce((sum, order) => sum + Number(order.inrAmount || 0), 0),
      activeUsdt: active.reduce((sum, order) => sum + Number(order.usdtAmount || 0), 0),
      settled: completed.reduce((sum, order) => sum + Number(order.inrAmount || 0), 0),
      enabledMethods: methods.length
    };
  }

  function expectedInrPaise(type) {
    const usdt = Number($('amount')?.value || 0);
    const rate = Number(model.rates?.rates?.[String(type).toLowerCase()] || 0);
    if (!Number.isFinite(usdt) || usdt <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
    const usdtMicros = Math.round(usdt * 1_000_000);
    const ratePaise = Math.round(rate * 100);
    return Math.round(usdtMicros * ratePaise / 1_000_000);
  }

  function renderRailSummary(type) {
    const sell = $('sell');
    if (!sell) return;
    let summary = sell.querySelector('.digi-rail-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'digi-rail-summary';
      sell.insertBefore(summary, sell.firstChild);
    }
    const m = railMetrics(type);
    summary.innerHTML = `
      <div class="digi-rail-card primary"><small>${type} Balance</small><b>${inr(m.capacity)}</b><small>available payout capacity today</small></div>
      <div class="digi-rail-card"><small>Active</small><b>${num(m.activeUsdt)} USDT</b><small>${inr(m.activeInr)}</small></div>
      <div class="digi-rail-card"><small>Settled</small><b>${inr(m.settled)}</b><small>${m.enabledMethods} enabled ${type === 'UPI' ? 'UPI IDs' : 'banks'}</small></div>`;
  }

  function clearBankAllocationsIfNeeded(target) {
    if (target === model.lastBankTargetPaise) return;
    model.lastBankTargetPaise = target;
    const total = [...model.bankAllocations.values()].reduce((sum, value) => sum + Number(value || 0), 0);
    if (total > target || target === 0) model.bankAllocations.clear();
  }

  function bankAllocationState() {
    const target = expectedInrPaise('BANK');
    clearBankAllocationsIfNeeded(target);
    const methods = railMethods('BANK', true);
    const allocations = [];
    let total = 0;
    let error = '';
    for (const method of methods) {
      const rupees = Number(model.bankAllocations.get(method.id) || 0);
      if (!rupees) continue;
      const paise = Math.round(rupees * 100);
      const min = Math.round(Number(method.minInr || 0) * 100);
      const max = Math.round(Math.min(Number(method.maxInr || 0), methodRemaining(method)) * 100);
      if (paise < min) error = `${method.bankName || method.label || 'Bank'} minimum is ${inr(method.minInr)}`;
      if (paise > max) error = `${method.bankName || method.label || 'Bank'} allocation exceeds available limit`;
      total += paise;
      allocations.push({ payoutMethodId:method.id, inrAmount:paise / 100 });
    }
    if (total > target) error = 'Bank allocation cannot exceed the order INR total';
    return { target, total, remaining:Math.max(0,target-total), allocations, error, valid:target > 0 && total === target && !error };
  }

  function renderUpiRouting() {
    const node = $('sellMethods');
    if (!node) return;
    const methods = railMethods('UPI', true);
    const target = expectedInrPaise('UPI') / 100;
    const eligible = methods.filter(method => target > 0 && target >= Number(method.minInr || 0) && target <= Number(method.maxInr || 0) && target <= methodRemaining(method));
    const on = methods.length > 0;
    node.innerHTML = `<div class="digi-route-methods">
      <div class="digi-route-head"><div><b>UPI Auto Route</b><small>${methods.length} enabled UPI ID${methods.length === 1 ? '' : 's'}. The server chooses one enabled UPI with enough capacity automatically.</small></div><span class="digi-auto-pill ${on ? '' : 'off'}"><i></i>${on ? 'ON' : 'OFF'}</span></div>
      <div class="digi-allocation-summary"><div><small>Enabled</small><b>${methods.length}</b></div><div><small>Order INR</small><b>${target > 0 ? inr(target) : '—'}</b></div><div><small>Can receive</small><b>${target > 0 ? eligible.length : methods.length}</b></div></div>
      <div class="digi-route-actions"><button class="ghost-btn" type="button" id="digiManageUpi">Manage UPI IDs</button></div>
      ${on ? '' : '<div class="digi-allocation-warning error">Enable at least one UPI ID in Profile before creating a UPI trade.</div>'}
      ${target > 0 && on && !eligible.length ? '<div class="digi-allocation-warning error">No enabled UPI currently has enough per-trade/daily capacity for this amount.</div>' : ''}
    </div>`;
    $('digiManageUpi')?.addEventListener('click', () => window.openManage?.());
    const button = $('lockBtn');
    if (button) button.disabled = !on || target <= 0 || eligible.length === 0;
  }

  function renderBankAllocations() {
    const node = $('sellMethods');
    if (!node) return;
    const methods = railMethods('BANK', true);
    const state = bankAllocationState();
    node.innerHTML = `<div class="digi-route-methods">
      <div class="digi-route-head"><div><b>Bank Allocation</b><small>Enter how much INR should go to each enabled bank. Total cannot exceed the order amount and must equal it before creating the deposit.</small></div><span class="digi-auto-pill ${methods.length ? '' : 'off'}"><i></i>${methods.length ? `${methods.length} BANKS` : 'OFF'}</span></div>
      <div class="digi-bank-list">${methods.length ? methods.map(method => {
        const max = Math.max(0, Math.min(Number(method.maxInr || 0), methodRemaining(method)));
        const value = Number(model.bankAllocations.get(method.id) || 0) || '';
        return `<label class="digi-bank-allocation"><div class="digi-bank-copy"><b>${esc(method.bankName || method.label || 'Bank account')} ••••${esc(String(method.accountNumber || '').slice(-4))}</b><small>${esc(method.ifsc || '')} · Min ${inr(method.minInr)} · Max available ${inr(max)}</small></div><div class="digi-bank-input"><span>₹</span><input inputmode="decimal" type="number" min="0" max="${max}" step="0.01" value="${value}" data-bank-amount="${esc(method.id)}" placeholder="0"></div></label>`;
      }).join('') : '<div class="digi-empty-state">No enabled bank account. Add or enable one in Profile.</div>'}</div>
      <div class="digi-allocation-summary"><div><small>Order total</small><b>${state.target ? inr(state.target/100) : '—'}</b></div><div><small>Allocated</small><b>${inr(state.total/100)}</b></div><div><small>Remaining</small><b>${inr(state.remaining/100)}</b></div></div>
      <div class="digi-route-actions"><button class="ghost-btn" type="button" id="digiManageBanks">Manage Bank Accounts</button></div>
      <div class="digi-allocation-warning ${state.error ? 'error' : ''}">${state.error ? esc(state.error) : state.target ? (state.valid ? 'Allocation complete. You can create the Bank deposit now.' : 'Allocate the full order INR amount across your enabled banks.') : 'Enter USDT amount first, then allocate the INR payout.'}</div>
    </div>`;
    node.querySelectorAll('[data-bank-amount]').forEach(input => {
      input.addEventListener('input', () => {
        const id = input.dataset.bankAmount;
        const method = methods.find(item => item.id === id);
        const max = Math.max(0, Math.min(Number(method?.maxInr || 0), methodRemaining(method || {})));
        let value = Math.max(0, Number(input.value || 0));
        if (value > max) value = max;
        const current = bankAllocationState();
        const otherPaise = current.total - Math.round(Number(model.bankAllocations.get(id) || 0) * 100);
        const targetRemaining = Math.max(0, current.target - otherPaise) / 100;
        if (value > targetRemaining) value = targetRemaining;
        if (value) model.bankAllocations.set(id, Math.round(value * 100) / 100); else model.bankAllocations.delete(id);
        renderBankAllocations();
      });
    });
    $('digiManageBanks')?.addEventListener('click', () => window.openManage?.());
    const button = $('lockBtn');
    if (button) button.disabled = !state.valid;
  }

  function destination(order) {
    const methods = Array.isArray(order?.payoutMethods) ? order.payoutMethods : [];
    if (String(order?.payoutType).toUpperCase() === 'UPI') return methods[0]?.upiId || 'Auto-routed UPI';
    if (methods.length) return methods.map(method => `${method.bankName || method.label || 'Bank'} ${method.accountNumber || ''}`.trim()).join(', ');
    return 'Bank payout';
  }

  function statusClass(status) {
    if (status === 'Completed') return 's-completed';
    if (['Expired','Failed','Rejected'].includes(status)) return 's-expired';
    if (status === 'Late Review') return 's-review';
    return 's-active';
  }

  function tradeRow(order) {
    const rail = String(order.payoutType || '').toUpperCase() === 'BANK' ? 'BANK' : 'UPI';
    return `<button class="digi-trade-row" type="button" data-order-id="${esc(order.id)}">
      <div class="digi-trade-top"><span class="digi-rail-pill">${rail}</span><span class="status-pill ${statusClass(order.status)}">${esc(order.status)}</span></div>
      <div class="digi-trade-amounts"><b>${num(order.usdtAmount)} USDT</b><strong>${inr(order.inrAmount)}</strong></div>
      <span class="digi-trade-meta">Rate ${inr(order.lockedRate)} · ${esc(destination(order))}</span>
      <span class="digi-trade-meta">${esc(fmtDate(order.createdAt))} · ${esc(order.id)}</span>
    </button>`;
  }

  function wireOrderRows(host) {
    host?.querySelectorAll('[data-order-id]').forEach(button => button.addEventListener('click', () => window.openOrder?.(button.dataset.orderId)));
  }

  function channelActive(type) {
    return matchingOrders(type).find(order => activeStatuses.has(order.status)) || null;
  }

  function renderChannelActive(type) {
    const host = document.querySelector('#sell .digi-channel-active');
    if (!host) return;
    const order = channelActive(type);
    if (!order) { host.innerHTML = ''; return; }
    const remaining = Math.max(0, Number(order.quoteExpiresAt || 0) - Date.now());
    host.innerHTML = `<div class="digi-live-card">
      <div class="digi-live-head"><div><h3>${type} Deposit</h3><p>${esc(order.id)} · Send exactly ${num(order.usdtAmount)} USDT on TRC20</p></div><span class="status-pill ${statusClass(order.status)}">${esc(order.status)}</span></div>
      <div class="digi-deposit-grid"><canvas class="digi-channel-qr" id="digiChannelQr" width="176" height="176" aria-label="TRON deposit QR"></canvas><div class="digi-address-box"><small>Assigned TRON USDT address</small><code>${esc(order.depositAddress || 'Address not assigned')}</code><div class="digi-route-actions"><button class="ghost-btn" id="digiCopyDeposit" type="button">Copy address</button><button class="ghost-btn" id="digiOpenDeposit" type="button">Timeline</button></div></div></div>
      <div class="digi-live-grid"><div><small>Expected</small><b>${num(order.usdtAmount)} USDT</b></div><div><small>Confirmations</small><b>${esc(order.confirmations)} / ${esc(order.requiredConfirmations)}</b></div><div><small>${remaining && order.status === 'Awaiting Deposit' ? 'Quote time' : 'Received'}</small><b>${remaining && order.status === 'Awaiting Deposit' ? `${Math.ceil(remaining/60000)} min` : order.receivedUsdt == null ? '—' : `${num(order.receivedUsdt)} USDT`}</b></div></div>
    </div>`;
    $('digiCopyDeposit')?.addEventListener('click', () => window.copyAddress?.(order.depositAddress || ''));
    $('digiOpenDeposit')?.addEventListener('click', () => window.openOrder?.(order.id));
    const canvas = $('digiChannelQr');
    if (canvas && order.depositAddress && window.digiQr?.render) {
      try { window.digiQr.render(canvas, order.depositAddress); } catch {}
    }
  }

  function ensureSellExtensions() {
    const sell = $('sell');
    if (!sell) return;
    if (!sell.querySelector('.digi-channel-active')) {
      const active = document.createElement('section');
      active.className = 'digi-channel-active';
      $('liveQuote')?.insertAdjacentElement('afterend', active);
    }
    if (!$('digiChannelTrades')) {
      const section = document.createElement('section');
      section.className = 'digi-channel-trades';
      section.id = 'digiChannelTrades';
      section.innerHTML = `<div class="digi-channel-head"><div><h2 id="digiChannelTradesTitle">Trades</h2><span id="digiChannelTradeCount">0 trades</span></div><span id="digiChannelSettled">₹0 settled</span></div><div class="digi-trade-list" id="digiChannelTradesList"></div>`;
      sell.appendChild(section);
    }
  }

  function renderChannelTrades(type) {
    const host = $('digiChannelTradesList');
    if (!host) return;
    const rows = matchingOrders(type);
    const completed = rows.filter(order => order.status === 'Completed');
    $('digiChannelTradesTitle').textContent = type === 'UPI' ? 'UPI Trades' : 'Bank Trades';
    $('digiChannelTradeCount').textContent = `${rows.length} trade${rows.length === 1 ? '' : 's'}`;
    $('digiChannelSettled').textContent = `${inr(completed.reduce((sum,order) => sum + Number(order.inrAmount || 0),0))} settled`;
    host.innerHTML = rows.length ? rows.map(tradeRow).join('') : `<div class="digi-empty-state">No ${type} trades yet.<br>Your ${type} deposit and trade history will appear here.</div>`;
    wireOrderRows(host);
  }

  function customizeSell(type) {
    const normalized = type === 'BANK' ? 'BANK' : 'UPI';
    renderRailSummary(normalized);
    const intro = document.querySelector('#sell .sell-intro');
    if (intro) {
      const kicker = intro.querySelector('.utility-kicker');
      const title = intro.querySelector('h2');
      const copy = intro.querySelector('p');
      const ratePill = intro.querySelector('.rate-pill');
      if (kicker) kicker.textContent = normalized === 'UPI' ? 'UPI TRADING' : 'BANK TRADING';
      if (title) title.textContent = normalized === 'UPI' ? 'Sell USDT via UPI' : 'Sell USDT via Bank';
      if (copy) copy.textContent = normalized === 'UPI' ? 'Your enabled UPI IDs are auto-routed by capacity.' : 'You decide exactly how the INR payout is split across enabled banks.';
      const rate = model.rates?.rates?.[normalized.toLowerCase()];
      if (ratePill) ratePill.innerHTML = `<small>${normalized} rate</small><b>${rate != null ? inr(rate) : '—'}</b><span>Live server rate</span>`;
    }
    if ($('methodTitle')) $('methodTitle').textContent = normalized === 'UPI' ? 'UPI Auto Route' : 'Bank Allocation';
    if (normalized === 'UPI') renderUpiRouting(); else renderBankAllocations();
    renderChannelActive(normalized);
    renderChannelTrades(normalized);
    const button = $('lockBtn');
    const active = channelActive(normalized);
    if (button) {
      button.textContent = active ? `${normalized} Deposit Active` : (normalized === 'UPI' ? 'Create UPI Deposit' : 'Create Bank Deposit');
      if (active) button.disabled = true;
    }
  }

  function historyRows() {
    return [...model.orders].filter(order => {
      if (model.historyFilter === 'UPI' || model.historyFilter === 'BANK') return String(order.payoutType || '').toUpperCase() === model.historyFilter;
      if (model.historyFilter === 'Active') return activeStatuses.has(order.status);
      if (model.historyFilter === 'Completed') return order.status === 'Completed';
      return true;
    }).sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  function renderHistory() {
    const page = $('orders'); if (!page) return;
    page.classList.add('digi-history-mode');
    let root = page.querySelector('.digi-history-root');
    if (!root) { root = document.createElement('div'); root.className = 'digi-history-root'; page.appendChild(root); }
    const rows = historyRows();
    const filters = ['All','UPI','BANK','Active','Completed'];
    root.innerHTML = `<button class="digi-history-back" id="digiHistoryBack" type="button">‹ Back to Profile</button><div class="digi-history-head"><div><h2>Trade History</h2><p>All UPI and Bank USDT → INR trades.</p></div></div><div class="digi-history-filters">${filters.map(filter => `<button data-history-filter="${filter}" class="${model.historyFilter === filter ? 'active' : ''}" type="button">${filter === 'BANK' ? 'Bank' : filter}</button>`).join('')}</div><div class="digi-trade-list">${rows.length ? rows.map(tradeRow).join('') : '<div class="digi-empty-state">No trades match this filter.</div>'}</div>`;
    $('digiHistoryBack')?.addEventListener('click', () => routeGo('profile'));
    root.querySelectorAll('[data-history-filter]').forEach(button => button.addEventListener('click', () => { model.historyFilter = button.dataset.historyFilter; renderHistory(); }));
    wireOrderRows(root);
  }

  function enhanceProfile() {
    const profile = $('profile'); if (!profile) return;
    const headings = [...profile.querySelectorAll('.section h2')];
    const payout = headings.find(node => /payout methods|add bank account/i.test(node.textContent || ''));
    if (payout) payout.textContent = 'Add Bank Account & UPI';
    const account = headings.find(node => /account\s*&\s*security/i.test(node.textContent || ''));
    if (account && !$('digiProfileHistory')) {
      const card = document.createElement('div');
      card.id = 'digiProfileHistory';
      card.className = 'card menu digi-profile-history';
      card.innerHTML = `<div class="menu-row" id="digiOpenHistory"><div class="icon ib">⇄</div><div><b>Trade History</b><small>UPI & Bank trades, USDT, INR and status</small></div><span class="menu-right">›</span></div>`;
      account.closest('.section')?.insertAdjacentElement('beforebegin', card);
      $('digiOpenHistory')?.addEventListener('click', () => routeGo('history'));
    }
    const name = model.profile?.fullName || model.user?.fullName || 'Account';
    if ($('profileNameHero')) $('profileNameHero').textContent = name;
    const avatar = profile.querySelector('.avatar-pro'); if (avatar) avatar.textContent = initials(name);
    const badges = profile.querySelector('.profile-badges');
    if (badges) badges.innerHTML = '<span>Active account</span>';
  }

  function customizeHome() {
    const sections = [...document.querySelectorAll('#home .section')];
    const recent = sections.find(section => /recent orders|recent trades/i.test(section.textContent || ''));
    if (recent) {
      const h2 = recent.querySelector('h2'); const button = recent.querySelector('button');
      if (h2) h2.textContent = 'Recent Trades';
      if (button) { button.textContent = 'History ›'; button.setAttribute('onclick', "go('history')"); }
    }
  }

  function syncRoute() {
    if (model.route === 'upi') return customizeSell('UPI');
    if (model.route === 'bank') return customizeSell('BANK');
    if (model.route === 'history') return renderHistory();
    if (model.route === 'profile') return enhanceProfile();
  }

  function routeGo(requested) {
    if (!baseGo) return;
    let page = requested;
    if (page === 'sell') page = 'upi';
    if (page === 'orders') page = 'history';
    model.route = page;
    if (page === 'upi' || page === 'bank') {
      baseGo('sell');
      baseSetType?.(page === 'bank' ? 'BANK' : 'UPI');
      ensureSellExtensions();
      setNavActive(page);
      setHeader(page === 'upi' ? 'UPI' : 'Bank', page === 'upi' ? 'Auto-routed UPI payout and separate USDT deposit.' : 'Manual bank split and separate USDT deposit.');
      customizeSell(page === 'bank' ? 'BANK' : 'UPI');
      if ($('sell')) $('sell').scrollTop = 0;
      return;
    }
    if (page === 'history') {
      baseGo('orders'); setNavActive('profile'); setHeader('Trade History','All UPI and Bank trading activity.'); renderHistory(); if ($('orders')) $('orders').scrollTop = 0; return;
    }
    baseGo(page); setNavActive(page);
    if (page === 'home') setHeader('Home','Trade, earn rewards and track your account.');
    if (page === 'rewards') setHeader('Rewards','Spin, complete tasks & earn USDT.');
    if (page === 'profile') { setHeader('Profile','Account, bank/UPI and security.'); enhanceProfile(); }
  }

  function install() {
    injectStyles();
    if (typeof window.__digiStateSnapshot === 'function') currentData(window.__digiStateSnapshot());
    document.body.classList.remove('digi-layout-v3');
    document.body.classList.add('digi-layout-v4');
    const ua = String(navigator.userAgent || '');
    document.body.classList.toggle('digi-legacy-insets', /digiRupee\/(?!1\.0\.4(?:\s|$))/i.test(ua));
    configureNav();
    ensureSellExtensions();
    customizeHome();
    enhanceProfile();
    window.__digiGetBankAllocations = () => bankAllocationState().valid ? bankAllocationState().allocations : [];
    window.__digiAfterSellRender = () => syncRoute();
    window.addEventListener('digirupee:state', event => {
      currentData(event.detail || {});
      customizeHome();
      enhanceProfile();
      syncRoute();
    });
    $('amount')?.addEventListener('input', () => {
      if (model.route === 'bank') customizeSell('BANK');
      if (model.route === 'upi') customizeSell('UPI');
    });
    routeGo('home');
    setInterval(() => {
      if (model.route === 'upi') renderChannelActive('UPI');
      if (model.route === 'bank') renderChannelActive('BANK');
    }, 1000);
  }

  window.go = routeGo;
  window.__digiLayoutV4 = { go:routeGo, renderHistory, customizeSell, enhanceProfile, bankAllocationState };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
