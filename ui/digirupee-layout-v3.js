(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[ch]));
  const num = value => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 6 });
  const inr = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const fmtDate = value => value ? new Date(value).toLocaleString('en-IN', {
    day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'
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
    bankDraftOrderId:null,
    bankDraft:new Map(),
    bankDraftDirty:false
  };

  const activeStatuses = new Set(['Awaiting Deposit','Detected','Confirming','USDT Confirmed','INR Processing','Late Review']);

  function injectStyles() {
    document.getElementById('digirupee-layout-v4-css')?.remove();
    document.getElementById('digirupee-layout-v3-css')?.remove();
    if (document.getElementById('digirupee-layout-v5-css')) return;
    const style = document.createElement('style');
    style.id = 'digirupee-layout-v5-css';
    style.textContent = `
      html,body{height:100%;min-height:100%;overflow:hidden;background:#000!important}
      body.digi-layout-v5{margin:0!important;padding:0!important}
      body.digi-layout-v5.digi-legacy-insets .app{padding-top:24px!important;box-sizing:border-box!important}
      body.digi-layout-v5 .app{width:min(430px,100%)!important;height:100%!important;min-height:0!important;max-height:100%!important;grid-template-rows:auto minmax(0,1fr) var(--nav)!important;overflow:hidden!important;margin:0 auto!important}
      body.digi-layout-v5 .statusbar{display:none!important}
      body.digi-layout-v5 .header{grid-row:1!important;padding:12px 15px 9px!important;min-height:68px!important;box-sizing:border-box!important;background:#050607!important}
      body.digi-layout-v5 .header-copy{min-width:0}
      body.digi-layout-v5 .header-copy h1{font-size:25px!important;line-height:1.02!important}
      body.digi-layout-v5 .header-copy p{font-size:10.5px!important;line-height:1.3!important}
      body.digi-layout-v5 .page{grid-row:2!important;padding:0 15px 14px!important;min-height:0!important}
      body.digi-layout-v5 .app>.nav{grid-row:3!important;position:static!important;width:100%!important;height:var(--nav)!important;padding:5px 8px 6px!important;box-sizing:border-box!important}
      body.digi-layout-v5 .app>.nav .nav-icon{width:30px!important;height:30px!important}
      body.digi-layout-v5 #sell .compact-segment,
      body.digi-layout-v5 #sell .sell-availability,
      body.digi-layout-v5 #activeSell,
      body.digi-layout-v5 #liveQuote{display:none!important}
      body.digi-layout-v5 #sell .sell-intro{padding-top:0!important;margin-bottom:10px!important}
      body.digi-layout-v5 #sell .sell-intro p{margin-bottom:7px!important}
      .digi-rail-strip{display:grid;grid-template-columns:1.05fr .9fr .9fr;gap:6px;margin:0 0 9px}
      .digi-mini-stat{padding:8px 9px;border:1px solid #282d35;border-radius:11px;background:#0d0f12;min-width:0}
      .digi-mini-stat small{display:block;color:#858b93;font-size:7.7px;white-space:nowrap}
      .digi-mini-stat b{display:block;margin-top:3px;font-size:10.7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .digi-mini-stat.primary{border-color:#554821;background:#151208}.digi-mini-stat.primary b{color:#f2d168}
      .digi-route-compact{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 11px;border:1px solid #292e36;border-radius:12px;background:#0d0f12;margin-bottom:10px}
      .digi-route-copy{min-width:0}.digi-route-copy b{display:block;font-size:11px}.digi-route-copy small{display:block;margin-top:3px;color:#858b93;font-size:8.3px;line-height:1.35;white-space:normal}
      .digi-route-side{display:flex;align-items:center;gap:7px;flex:none}
      .digi-route-state{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border:1px solid #285947;border-radius:999px;background:#123126;color:#77e2af;font-size:8px;font-weight:850}
      .digi-route-state.off{border-color:#59313a;background:#28161b;color:#f08b9a}
      .digi-route-state i{width:6px;height:6px;border-radius:50%;background:currentColor}
      .digi-route-compact .ghost-btn{min-height:31px!important;padding:0 9px!important;font-size:8.5px!important}
      .digi-channel-active{margin-top:10px}
      .digi-deposit-card{padding:11px;border:1px solid #343941;border-radius:13px;background:#0d0f12}
      .digi-deposit-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
      .digi-deposit-head h3{margin:0;font-size:12.5px}.digi-deposit-head p{margin:3px 0 0;color:#8d939c;font-size:8.4px;line-height:1.35}
      .digi-deposit-body{display:grid;grid-template-columns:92px minmax(0,1fr);gap:10px;align-items:center;margin-top:10px}
      .digi-channel-qr{width:92px;height:92px;padding:4px;border-radius:9px;background:#fff;box-sizing:border-box}
      .digi-address-box{min-width:0}.digi-address-box small{display:block;color:#7f858e;font-size:8px}.digi-address-box code{display:block;margin-top:4px;color:#f1d36f;font-size:8.6px;line-height:1.35;word-break:break-all}
      .digi-address-actions{display:flex;gap:6px;margin-top:7px}.digi-address-actions button{min-height:30px!important;padding:0 8px!important;font-size:8px!important}
      .digi-deposit-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
      .digi-deposit-meta>div{padding:7px;border:1px solid #242932;border-radius:8px;background:#111419;min-width:0}
      .digi-deposit-meta small{display:block;color:#7f858e;font-size:7.3px}.digi-deposit-meta b{display:block;margin-top:2px;font-size:8.7px;overflow-wrap:anywhere}
      .digi-address-warning{margin-top:8px;padding:8px;border-radius:9px;background:#2a171b;border:1px solid #5d3038;color:#f19aa7;font-size:8.4px;line-height:1.4}
      .digi-bank-plan{margin-top:10px;padding-top:10px;border-top:1px solid #242932}
      .digi-plan-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.digi-plan-head b{font-size:10.5px}.digi-plan-head span{color:#8a9099;font-size:8px}
      .digi-plan-list{display:flex;flex-direction:column;gap:6px}
      .digi-plan-row{display:grid;grid-template-columns:minmax(0,1fr) 104px;gap:8px;align-items:center;padding:8px;border:1px solid #282d35;border-radius:9px;background:#101318}
      .digi-plan-copy{min-width:0}.digi-plan-copy b{display:block;font-size:9.5px}.digi-plan-copy small{display:block;margin-top:2px;color:#858b93;font-size:7.6px;line-height:1.35}
      .digi-plan-input{display:flex;align-items:center;border:1px solid #353a43;border-radius:8px;background:#0b0d10;padding:0 7px}.digi-plan-input span{color:#d8bc5e;font-size:9px}.digi-plan-input input{width:100%;height:34px;border:0;background:transparent;color:#fff;text-align:right;outline:0;font-size:9.5px;min-width:0}
      .digi-plan-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:7px}.digi-plan-summary>div{padding:7px;border:1px solid #242932;border-radius:8px;background:#0b0d10;text-align:center}.digi-plan-summary small{display:block;color:#7f858e;font-size:7px}.digi-plan-summary b{display:block;margin-top:2px;font-size:8.5px}
      .digi-plan-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:7px}.digi-plan-footer small{color:#858b93;font-size:7.8px;line-height:1.35}.digi-plan-footer button{min-height:32px!important;padding:0 10px!important;font-size:8.5px!important;flex:none}
      .digi-channel-trades{margin-top:13px;padding-top:11px;border-top:1px solid #1d2229}
      .digi-channel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.digi-channel-head h2{margin:0;font-size:14px}.digi-channel-head button{border:0;background:none;color:#e2c35e;font-size:8.5px;padding:3px}
      .digi-trade-list{display:flex;flex-direction:column;gap:6px}.digi-trade-row{width:100%;padding:9px!important;display:block;text-align:left;border:1px solid #282c34!important;border-radius:11px!important;background:#0d0f12!important;color:#fff}
      .digi-trade-top,.digi-trade-amounts{display:flex;align-items:center;justify-content:space-between;gap:8px}.digi-rail-pill{padding:3px 6px;border-radius:999px;background:#171b21;border:1px solid #30353e;color:#e7ca67;font-size:7.8px;font-weight:850}
      .digi-trade-amounts{margin-top:6px}.digi-trade-amounts b{font-size:11.5px}.digi-trade-amounts strong{font-size:10.5px;color:#f0cc61}.digi-trade-meta{display:block;margin-top:3px;color:#8c929b;font-size:8px;line-height:1.35;white-space:normal}
      .digi-empty-state{padding:16px 10px;text-align:center;border:1px solid #252a31;border-radius:11px;background:#0b0d10;color:#858b93;font-size:9px;line-height:1.45}
      #orders.digi-history-mode>*:not(.digi-history-root){display:none!important}.digi-history-root{padding-bottom:8px}.digi-history-back{border:0;background:none;color:#e5c65f;font-size:10px;padding:4px 0 10px}
      .digi-history-filters{display:flex;gap:6px;overflow-x:auto;padding-bottom:9px}.digi-history-filters button{flex:none;min-height:31px;padding:0 9px;border:1px solid #292e36;border-radius:999px;background:#101318;color:#9ba0a8;font-size:8.5px}.digi-history-filters button.active{background:#2b2413;border-color:#6b5924;color:#f0ce65}
      #profile .digi-profile-history{margin:8px 0 16px}
      @media(max-width:370px){.digi-rail-strip{grid-template-columns:1fr 1fr}.digi-mini-stat:last-child{grid-column:1/-1}.digi-deposit-body{grid-template-columns:82px minmax(0,1fr)}.digi-channel-qr{width:82px;height:82px}.digi-plan-row{grid-template-columns:1fr}.digi-deposit-meta{grid-template-columns:1fr 1fr}.digi-deposit-meta>div:last-child{grid-column:1/-1}}
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
    const labels = ['Home','UPI','Bank','Rewards','Profile'];
    buttons.forEach((button,index) => {
      button.dataset.page = routes[index];
      button.setAttribute('onclick', `go('${routes[index]}')`);
    });
    buttons[1].innerHTML = `<span class="nav-icon"><svg viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="10" fill="#138A67"/><text x="16" y="19" text-anchor="middle" fill="#fff" font-size="10" font-weight="900">UPI</text></svg></span><span>UPI</span>`;
    buttons[2].innerHTML = `<span class="nav-icon"><svg viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="10" fill="#2457D6"/><path d="M7 14h18M9 14v9m4-9v9m6-9v9m4-9v9M6 25h20M16 7l10 5H6z" fill="none" stroke="#fff" stroke-width="1.8"/></svg></span><span>Bank</span>`;
    buttons.forEach((button,index) => {
      const label = button.querySelector('[data-nav]') || button.lastElementChild;
      if (label && label !== button.querySelector('.nav-icon')) label.textContent = labels[index];
    });
  }

  function setNavActive(route) {
    document.querySelectorAll('.app>.nav button').forEach(button => button.classList.toggle('active', button.dataset.page === route));
  }

  function railMethods(type, enabledOnly = false) {
    return model.methods.filter(method => String(method.type).toUpperCase() === type && (!enabledOnly || method.enabled));
  }

  function methodRemaining(method) {
    const v = Number(method.remainingDailyInr);
    return Number.isFinite(v) ? Math.max(0,v) : Math.max(0,Number(method.dailyLimitInr || 0));
  }

  function matchingOrders(type) {
    return [...model.orders].filter(order => String(order.payoutType || '').toUpperCase() === type).sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  function railBalance(type) {
    return matchingOrders(type).reduce((sum, order) => {
      if (!['USDT Confirmed','INR Processing'].includes(order.status)) return sum;
      const paid = Number(order.payout?.paidInrPaise || 0) / 100;
      return sum + Math.max(0, Number(order.inrAmount || 0) - paid);
    }, 0);
  }

  function railCapacity(type) {
    return railMethods(type,true).reduce((sum,method) => sum + methodRemaining(method), 0);
  }

  function minUsdt(type) {
    const limits = model.rates?.limits || {};
    return Number(type === 'BANK' ? limits.bankMinUsdt : limits.upiMinUsdt) || 0;
  }

  function renderRailStrip(type) {
    const sell = $('sell');
    if (!sell) return;
    let strip = sell.querySelector('.digi-rail-strip');
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'digi-rail-strip';
      sell.insertBefore(strip, sell.firstChild);
    }
    const rate = Number(model.rates?.rates?.[type.toLowerCase()] || 0);
    strip.innerHTML = `
      <div class="digi-mini-stat primary"><small>${type} Balance</small><b>${inr(railBalance(type))}</b></div>
      <div class="digi-mini-stat"><small>Min deposit</small><b>${num(minUsdt(type))} USDT</b></div>
      <div class="digi-mini-stat"><small>Rate</small><b>${rate ? inr(rate) : '—'}</b></div>`;
    const amount = $('amount');
    if (amount) amount.min = String(minUsdt(type) || 0);
  }

  function renderRouteCard(type) {
    const node = $('sellMethods');
    if (!node) return;
    const methods = railMethods(type,true);
    const capacity = railCapacity(type);
    const on = methods.length > 0;
    const label = type === 'UPI' ? 'UPI Auto Route' : 'Bank Accounts';
    const detail = type === 'UPI'
      ? `${methods.length} enabled UPI ID${methods.length === 1 ? '' : 's'} · ${inr(capacity)} available today`
      : `${methods.length} enabled bank account${methods.length === 1 ? '' : 's'} · ${inr(capacity)} available today`;
    node.innerHTML = `<div class="digi-route-compact">
      <div class="digi-route-copy"><b>${label}</b><small>${detail}</small></div>
      <div class="digi-route-side"><span class="digi-route-state ${on ? '' : 'off'}"><i></i>${on ? 'ON' : 'OFF'}</span><button class="ghost-btn" type="button" id="digiManageRail">Manage</button></div>
    </div>`;
    $('digiManageRail')?.addEventListener('click', () => window.openManage?.(type));
    const button = $('lockBtn');
    const amount = Number($('amount')?.value || 0);
    if (button) button.disabled = !on || !amount || amount < minUsdt(type);
  }

  function destination(order) {
    const methods = Array.isArray(order?.payoutMethods) ? order.payoutMethods : [];
    if (String(order?.payoutType).toUpperCase() === 'UPI') return methods[0]?.upiId || 'Auto-routed UPI';
    const planned = order?.allocations || [];
    if (planned.length) {
      return planned.map(plan => {
        const method = methods.find(item => item.id === plan.payoutMethodId) || model.methods.find(item => item.id === plan.payoutMethodId);
        return method ? `${method.bankName || method.label || 'Bank'} ••••${String(method.accountNumber || '').slice(-4)}` : 'Bank';
      }).join(', ');
    }
    return 'Bank payout pending allocation';
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
      <span class="digi-trade-meta">${esc(fmtDate(order.createdAt))}</span>
    </button>`;
  }

  function wireOrderRows(host) {
    host?.querySelectorAll('[data-order-id]').forEach(button => button.addEventListener('click', () => window.openOrder?.(button.dataset.orderId)));
  }

  function activeOrder(type) {
    return matchingOrders(type).find(order => activeStatuses.has(order.status)) || null;
  }

  function paidByMethod(order) {
    const map = new Map();
    for (const ref of order?.payout?.references || []) {
      map.set(ref.payoutMethodId, (map.get(ref.payoutMethodId) || 0) + Number(ref.inrAmount || 0));
    }
    return map;
  }

  function syncBankDraft(order) {
    if (!order || model.bankDraftOrderId !== order.id || !model.bankDraftDirty) {
      model.bankDraftOrderId = order?.id || null;
      model.bankDraft = new Map((order?.allocations || []).map(item => [item.payoutMethodId, Number(item.inrAmount || 0)]));
      model.bankDraftDirty = false;
    }
  }

  function bankDraftState(order) {
    syncBankDraft(order);
    const total = Number(order?.inrAmount || 0);
    const paid = paidByMethod(order);
    let planned = 0;
    let error = '';
    for (const [methodId, amount] of model.bankDraft.entries()) {
      const method = model.methods.find(item => item.id === methodId && item.type === 'BANK');
      if (!method) { error = 'A selected bank account is no longer available'; continue; }
      const paidAmount = paid.get(methodId) || 0;
      const currentPlan = Number((order.allocations || []).find(item => item.payoutMethodId === methodId)?.inrAmount || 0);
      const max = methodRemaining(method) + currentPlan;
      if (amount < paidAmount) error = `Allocation cannot be below already paid ${inr(paidAmount)}`;
      if (amount > max) error = `${method.bankName || method.label || 'Bank'} exceeds today's available capacity`;
      planned += Number(amount || 0);
    }
    if (planned > total) error = 'Allocated INR cannot exceed the trade total';
    return { total, planned, pending:Math.max(0,total-planned), paid, error };
  }

  function renderBankPlan(order) {
    if (!order || order.payoutType !== 'BANK') return '';
    const methods = railMethods('BANK', true);
    const state = bankDraftState(order);
    return `<div class="digi-bank-plan">
      <div class="digi-plan-head"><b>Distribute INR</b><span>Any remaining amount can stay pending</span></div>
      <div class="digi-plan-list">${methods.length ? methods.map(method => {
        const paid = state.paid.get(method.id) || 0;
        const currentPlan = Number((order.allocations || []).find(item => item.payoutMethodId === method.id)?.inrAmount || 0);
        const max = Math.max(paid, methodRemaining(method) + currentPlan);
        const value = Number(model.bankDraft.get(method.id) || 0) || '';
        return `<label class="digi-plan-row"><div class="digi-plan-copy"><b>${esc(method.bankName || method.label || 'Bank')} ••••${esc(String(method.accountNumber || '').slice(-4))}</b><small>${paid ? `Paid ${inr(paid)} · ` : ''}Available ${inr(max)}</small></div><div class="digi-plan-input"><span>₹</span><input type="number" inputmode="decimal" min="${paid}" max="${max}" step="0.01" value="${value}" data-bank-plan="${esc(method.id)}" placeholder="0"></div></label>`;
      }).join('') : '<div class="digi-empty-state">No enabled bank account. Add or enable one in Profile.</div>'}</div>
      <div class="digi-plan-summary"><div><small>Total</small><b>${inr(state.total)}</b></div><div><small>Allocated</small><b>${inr(state.planned)}</b></div><div><small>Pending</small><b>${inr(state.pending)}</b></div></div>
      <div class="digi-plan-footer"><small>${state.error ? esc(state.error) : 'You can save a partial distribution now and allocate the remaining INR later.'}</small><button class="ghost-btn" type="button" id="digiSaveBankPlan" ${state.error || !methods.length ? 'disabled' : ''}>Save</button></div>
    </div>`;
  }

  function wireBankPlan(order, host) {
    if (!order || order.payoutType !== 'BANK' || !host) return;
    host.querySelectorAll('[data-bank-plan]').forEach(input => {
      input.addEventListener('input', () => {
        const id = input.dataset.bankPlan;
        const method = model.methods.find(item => item.id === id);
        const paid = paidByMethod(order).get(id) || 0;
        const currentPlan = Number((order.allocations || []).find(item => item.payoutMethodId === id)?.inrAmount || 0);
        const max = Math.max(paid, methodRemaining(method || {}) + currentPlan);
        let value = Math.max(paid, Number(input.value || 0));
        value = Math.min(value, max);
        const others = [...model.bankDraft.entries()].filter(([key]) => key !== id).reduce((sum,[,amount]) => sum + Number(amount || 0), 0);
        value = Math.min(value, Math.max(paid, Number(order.inrAmount || 0) - others));
        if (value > 0) model.bankDraft.set(id, Math.round(value * 100) / 100); else model.bankDraft.delete(id);
        model.bankDraftDirty = true;
        renderDeposit('BANK');
      });
    });
    $('digiSaveBankPlan')?.addEventListener('click', async () => {
      const state = bankDraftState(order);
      if (state.error) return window.toastMsg?.(state.error, true);
      const allocations = [...model.bankDraft.entries()].filter(([,amount]) => Number(amount) > 0).map(([payoutMethodId,inrAmount]) => ({ payoutMethodId, inrAmount:Number(inrAmount) }));
      try {
        const updated = await window.__digiSaveBankAllocations?.(order.id, allocations);
        if (updated) {
          model.bankDraftDirty = false;
          model.bankDraftOrderId = updated.id;
          model.bankDraft = new Map((updated.allocations || []).map(item => [item.payoutMethodId, Number(item.inrAmount || 0)]));
          window.toastMsg?.('Bank distribution saved');
        }
      } catch (error) {
        window.toastMsg?.(error.message || 'Could not save distribution', true);
      }
    });
  }

  function renderDeposit(type) {
    const host = document.querySelector('#sell .digi-channel-active');
    if (!host) return;
    const order = activeOrder(type);
    if (!order) { host.innerHTML = ''; return; }
    const address = String(order.depositAddress || '').trim();
    const remaining = Math.max(0, Number(order.quoteExpiresAt || 0) - Date.now());
    host.innerHTML = `<div class="digi-deposit-card">
      <div class="digi-deposit-head"><div><h3>${type} Deposit</h3><p>${esc(order.id)} · Send exactly ${num(order.usdtAmount)} USDT on TRC20</p></div><span class="status-pill ${statusClass(order.status)}">${esc(order.status)}</span></div>
      <div class="digi-deposit-body"><canvas class="digi-channel-qr" id="digiChannelQr" width="176" height="176"></canvas><div class="digi-address-box"><small>Assigned TRON USDT address</small><code>${address ? esc(address) : 'Waiting for an available TRON address'}</code><div class="digi-address-actions"><button class="ghost-btn" id="digiCopyDeposit" type="button" ${address ? '' : 'disabled'}>Copy</button><button class="ghost-btn" id="digiOpenDeposit" type="button">Timeline</button></div></div></div>
      ${address ? '' : '<div class="digi-address-warning">No free receiving address is assigned yet. The server will auto-assign any enabled free address. If another UPI/Bank deposit is already using your only address, add another receiving address or wait until it becomes reusable.</div>'}
      <div class="digi-deposit-meta"><div><small>Expected</small><b>${num(order.usdtAmount)} USDT</b></div><div><small>Confirmations</small><b>${esc(order.confirmations)} / ${esc(order.requiredConfirmations)}</b></div><div><small>${remaining && order.status === 'Awaiting Deposit' ? 'Deposit time' : 'Received'}</small><b>${remaining && order.status === 'Awaiting Deposit' ? `${Math.ceil(remaining/60000)} min` : order.receivedUsdt == null ? '—' : `${num(order.receivedUsdt)} USDT`}</b></div></div>
      ${type === 'BANK' ? renderBankPlan(order) : ''}
    </div>`;
    $('digiCopyDeposit')?.addEventListener('click', () => address && window.copyAddress?.(address));
    $('digiOpenDeposit')?.addEventListener('click', () => window.openOrder?.(order.id));
    const canvas = $('digiChannelQr');
    if (canvas && address && window.digiQr?.render) {
      try { window.digiQr.render(canvas, address); } catch {}
    }
    if (type === 'BANK') wireBankPlan(order, host);
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
      section.innerHTML = `<div class="digi-channel-head"><h2 id="digiChannelTradesTitle">Recent Trades</h2><button type="button" id="digiAllHistory">History ›</button></div><div class="digi-trade-list" id="digiChannelTradesList"></div>`;
      sell.appendChild(section);
      $('digiAllHistory')?.addEventListener('click', () => routeGo('history'));
    }
  }

  function renderChannelTrades(type) {
    const host = $('digiChannelTradesList');
    if (!host) return;
    const rows = matchingOrders(type).slice(0,3);
    $('digiChannelTradesTitle').textContent = type === 'UPI' ? 'Recent UPI Trades' : 'Recent Bank Trades';
    host.innerHTML = rows.length ? rows.map(tradeRow).join('') : `<div class="digi-empty-state">No ${type} trades yet.</div>`;
    wireOrderRows(host);
  }

  function customizeSell(type) {
    const normalized = type === 'BANK' ? 'BANK' : 'UPI';
    renderRailStrip(normalized);
    const intro = document.querySelector('#sell .sell-intro');
    if (intro) {
      const kicker = intro.querySelector('.utility-kicker');
      const title = intro.querySelector('h2');
      const copy = intro.querySelector('p');
      const ratePill = intro.querySelector('.rate-pill');
      if (kicker) kicker.textContent = normalized === 'UPI' ? 'UPI TRADING' : 'BANK TRADING';
      if (title) title.textContent = normalized === 'UPI' ? 'Sell USDT via UPI' : 'Sell USDT via Bank';
      if (copy) copy.textContent = normalized === 'UPI'
        ? 'Enter USDT and create a deposit. Your enabled UPI is selected automatically.'
        : 'Enter USDT and create a deposit first. You can distribute INR to banks after the deposit is created.';
      if (ratePill) ratePill.style.display = 'none';
    }
    if ($('methodTitle')) $('methodTitle').textContent = normalized === 'UPI' ? 'UPI routing' : 'Bank payout';
    renderRouteCard(normalized);
    renderDeposit(normalized);
    renderChannelTrades(normalized);
    const button = $('lockBtn');
    const active = activeOrder(normalized);
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
    const page = $('orders');
    if (!page) return;
    page.classList.add('digi-history-mode');
    let root = page.querySelector('.digi-history-root');
    if (!root) { root = document.createElement('div'); root.className = 'digi-history-root'; page.appendChild(root); }
    const rows = historyRows();
    const filters = ['All','UPI','BANK','Active','Completed'];
    root.innerHTML = `<button class="digi-history-back" id="digiHistoryBack" type="button">‹ Back to Profile</button><div class="digi-history-filters">${filters.map(filter => `<button data-history-filter="${filter}" class="${model.historyFilter === filter ? 'active' : ''}" type="button">${filter === 'BANK' ? 'Bank' : filter}</button>`).join('')}</div><div class="digi-trade-list">${rows.length ? rows.map(tradeRow).join('') : '<div class="digi-empty-state">No trades match this filter.</div>'}</div>`;
    $('digiHistoryBack')?.addEventListener('click', () => routeGo('profile'));
    root.querySelectorAll('[data-history-filter]').forEach(button => button.addEventListener('click', () => { model.historyFilter = button.dataset.historyFilter; renderHistory(); }));
    wireOrderRows(root);
  }

  function enhanceProfile() {
    const profile = $('profile');
    if (!profile) return;
    const headings = [...profile.querySelectorAll('.section h2')];
    const payout = headings.find(node => /payout methods|add bank account/i.test(node.textContent || ''));
    if (payout) payout.textContent = 'Add Bank Account & UPI';
    const account = headings.find(node => /account\s*&\s*security/i.test(node.textContent || ''));
    if (account && !$('digiProfileHistory')) {
      const card = document.createElement('div');
      card.id = 'digiProfileHistory';
      card.className = 'card menu digi-profile-history';
      card.innerHTML = `<div class="menu-row" id="digiOpenHistory"><div class="icon ib">⇄</div><div><b>Trade History</b><small>UPI & Bank trades</small></div><span class="menu-right">›</span></div>`;
      account.closest('.section')?.insertAdjacentElement('beforebegin', card);
      $('digiOpenHistory')?.addEventListener('click', () => routeGo('history'));
    }
    const name = model.profile?.fullName || model.user?.fullName || 'Account';
    if ($('profileNameHero')) $('profileNameHero').textContent = name;
    const avatar = profile.querySelector('.avatar-pro');
    if (avatar) avatar.textContent = initials(name);
    const badges = profile.querySelector('.profile-badges');
    if (badges) badges.innerHTML = '<span>Active account</span>';
  }

  function customizeHome() {
    const sections = [...document.querySelectorAll('#home .section')];
    const recent = sections.find(section => /recent orders|recent trades/i.test(section.textContent || ''));
    if (recent) {
      const h2 = recent.querySelector('h2');
      const button = recent.querySelector('button');
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
      setHeader(page === 'upi' ? 'UPI' : 'Bank', page === 'upi' ? 'UPI trading and deposit.' : 'Bank trading, deposit and flexible INR distribution.');
      customizeSell(page === 'bank' ? 'BANK' : 'UPI');
      if ($('sell')) $('sell').scrollTop = 0;
      return;
    }
    if (page === 'history') {
      baseGo('orders');
      setNavActive('profile');
      setHeader('Trade History','UPI and Bank trading activity.');
      renderHistory();
      if ($('orders')) $('orders').scrollTop = 0;
      return;
    }
    baseGo(page);
    setNavActive(page);
    if (page === 'home') setHeader('Home','Trade, earn rewards and track your account.');
    if (page === 'rewards') setHeader('Rewards','Spin, complete tasks & earn USDT.');
    if (page === 'profile') { setHeader('Profile','Account, bank/UPI and security.'); enhanceProfile(); }
  }

  function install() {
    injectStyles();
    if (typeof window.__digiStateSnapshot === 'function') currentData(window.__digiStateSnapshot());
    document.body.classList.remove('digi-layout-v3','digi-layout-v4');
    document.body.classList.add('digi-layout-v5');
    const ua = String(navigator.userAgent || '');
    document.body.classList.toggle('digi-legacy-insets', /digiRupee\/(?!1\.0\.4(?:\s|$))/i.test(ua));
    configureNav();
    ensureSellExtensions();
    customizeHome();
    enhanceProfile();
    window.__digiAfterSellRender = syncRoute;
    window.addEventListener('digirupee:state', event => {
      currentData(event.detail || {});
      customizeHome();
      enhanceProfile();
      if (!model.bankDraftDirty) {
        const order = activeOrder('BANK');
        if (order) syncBankDraft(order);
      }
      syncRoute();
    });
    $('amount')?.addEventListener('input', syncRoute);
    routeGo('home');
  }

  window.go = routeGo;
  window.__digiLayoutV5 = { go:routeGo, customizeSell, renderHistory, renderDeposit };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();