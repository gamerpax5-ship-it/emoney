(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[ch]));
  const N = value => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 6 });
  const R = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const F = value => value ? new Date(value).toLocaleString('en-IN', {
    day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'
  }) : '—';

  const BASE_GO = typeof window.go === 'function' ? window.go.bind(window) : null;
  const BASE_SET_TYPE = typeof window.setType === 'function' ? window.setType.bind(window) : null;

  const MODEL = {
    route: 'home',
    rates: null,
    methods: [],
    orders: [],
    amount: { UPI:'', BANK:'' },
    busy: false,
    toggling: false,
    drafts: new Map(),
    historyFilter: 'All',
    pendingRefresh: false
  };

  const ACTIVE = new Set(['Awaiting Deposit','Detected','Confirming','USDT Confirmed','INR Processing','Late Review']);

  function injectCss() {
    ['digirupee-layout-v3-css','digirupee-layout-v4-css','digirupee-layout-v5-css','digirupee-layout-v6-css','digirupee-layout-v61-css']
      .forEach(id => $(id)?.remove());

    const style = document.createElement('style');
    style.id = 'digirupee-layout-v61-css';
    style.textContent = `
      body.digi-layout-v61 #sell>*:not(#v61root){display:none!important}
      body.digi-layout-v61 .statusbar{display:none!important}
      body.digi-layout-v61 .app{width:min(430px,100%)!important;height:100%!important;grid-template-rows:auto minmax(0,1fr) var(--nav)!important;overflow:hidden!important;margin:auto!important}
      body.digi-layout-v61.digi-legacy-insets .app{padding-top:24px!important;box-sizing:border-box!important}
      body.digi-layout-v61 .header{grid-row:1!important;padding:12px 16px 8px!important;min-height:64px!important}
      body.digi-layout-v61 .page{grid-row:2!important;padding:0 16px 14px!important;overflow-y:auto!important;min-height:0!important}
      body.digi-layout-v61 .app>.nav{grid-row:3!important;position:static!important;height:var(--nav)!important}
      .v61stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:8px}
      .v61stat,.v61box{border:1px solid #292e36;border-radius:12px;background:#0d0f12;padding:10px}
      .v61stat small,.v61muted{color:#858a93;font-size:8px}
      .v61stat b{display:block;margin-top:4px;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .v61stat:first-child{border-color:#594b23;background:#171308}
      .v61stat:first-child b{color:#f1cf63}
      .v61info{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:9px}
      .v61info div{display:flex;justify-content:space-between;padding:8px 10px;border:1px solid #242932;border-radius:10px}
      .v61title{margin:8px 0}
      .v61title small{color:#d1ae48;font-size:8px;font-weight:900}
      .v61title h2{margin:5px 0 3px;font-size:20px}
      .v61title p{margin:0;color:#9398a1;font-size:9px}
      .v61row,.v61top,.v61amtrow{display:flex;justify-content:space-between;align-items:center;gap:8px}
      .v61actions{display:flex;gap:6px;align-items:center}
      .v61btn{min-height:31px;border:1px solid #343942;border-radius:9px;background:#111419;color:#fff;padding:0 9px;font-size:8.5px}
      .v61switch{position:relative;width:44px;height:25px;border:1px solid #373c44;border-radius:99px;background:#1b1d21}
      .v61switch:after{content:'';position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#aaa}
      .v61switch.on{background:#0e5a3d}
      .v61switch.on:after{left:22px;background:#dcffed}
      .v61pill{padding:5px 7px;border-radius:99px;background:#123126;color:#7be0af;font-size:8px}
      .v61pill.off{background:#28161b;color:#f08b9a}
      .v61amount{display:grid;grid-template-columns:40px 1fr auto;gap:10px;align-items:center;margin-top:8px;padding:10px;border:1px solid #2c3139;border-radius:12px}
      .v61coin{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#26a17b;color:#fff;font-size:18px;font-weight:900}
      .v61amount input{width:100%;border:0;background:transparent;color:#fff;font-size:25px;font-weight:850;outline:0}
      .v61amount small{display:block;color:#858a93;font-size:8px}
      .v61max{border:0;background:none;color:#e8c85f;font-weight:900}
      .v61quote{display:flex;justify-content:space-between;margin-top:8px;padding:8px 10px;border-radius:10px;background:#111419}
      .v61quote b{color:#f3d26b;font-size:10px}
      .v61create{width:100%;min-height:43px;margin-top:9px;border:0;border-radius:11px;background:linear-gradient(90deg,#ffe478,#efb927);color:#1b1300;font-size:11px;font-weight:950}
      .v61create:disabled{opacity:.4}
      .v61help{margin-top:7px;color:#858a93;font-size:7.8px}
      .v61status{padding:4px 7px;border-radius:99px;background:#20242b;font-size:7.8px}
      .v61good{background:#123126;color:#7be0af}
      .v61bad{background:#331920;color:#f08b9a}
      .v61dep{display:grid;grid-template-columns:90px 1fr;gap:10px;align-items:center;margin-top:10px}
      .v61qr{width:90px;height:90px;padding:4px;border-radius:9px;background:#fff}
      .v61addr code{display:block;color:#f0cf63;font-size:8.3px;word-break:break-all}
      .v61warn{margin-top:8px;padding:8px;border:1px solid #5c3038;border-radius:9px;background:#2a171b;color:#f19aa7;font-size:8px;line-height:1.4}
      .v61meta,.v61sum{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
      .v61meta div,.v61sum div{padding:7px;border:1px solid #242932;border-radius:8px}
      .v61meta b,.v61sum b{display:block;font-size:8.4px}
      .v61plan{margin-top:10px;padding-top:10px;border-top:1px solid #242932}
      .v61bank{display:grid;grid-template-columns:1fr 105px;gap:8px;align-items:center;padding:8px;border:1px solid #282d35;border-radius:9px;margin:6px 0}
      .v61bank b{font-size:9px}
      .v61bank small{display:block;color:#858a93;font-size:7.3px}
      .v61bank input{width:100%;height:32px;border:1px solid #353a43;border-radius:8px;background:transparent;color:#fff;text-align:right;padding:0 7px;box-sizing:border-box;outline:none}
      .v61section{display:flex;justify-content:space-between;align-items:center;margin:12px 0 7px}
      .v61trade{width:100%;border:1px solid #282c34;border-radius:11px;background:#0d0f12;color:#fff;padding:9px;text-align:left;margin-bottom:6px}
      .v61trade b{font-size:11px}
      .v61trade strong{font-size:10px;color:#f0cc61}
      .v61trade small{display:block;color:#8c929b;font-size:7.8px;margin-top:3px}
      #orders.v61history>*:not(#v61history){display:none!important}
      .v61filters{display:flex;gap:6px;overflow:auto;margin-bottom:8px}
      .v61filters button{min-height:30px;border:1px solid #292e36;border-radius:99px;background:#101318;color:#999;font-size:8px}
      .v61filters .active{color:#f0ce65;border-color:#6b5924}
      @media(max-width:370px){
        .v61stats{grid-template-columns:1fr 1fr}
        .v61stats .v61stat:last-child{grid-column:1/-1}
        .v61dep,.v61bank{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function loadState(snapshot) {
    MODEL.rates = snapshot?.rates || null;
    MODEL.methods = Array.isArray(snapshot?.methods) ? snapshot.methods : [];
    MODEL.orders = Array.isArray(snapshot?.orders) ? snapshot.orders : [];
  }

  function methods(type, enabledOnly = false) {
    return MODEL.methods.filter(item =>
      String(item.type).toUpperCase() === type && (!enabledOnly || item.enabled)
    );
  }

  function orders(type) {
    return MODEL.orders
      .filter(item => String(item.payoutType || '').toUpperCase() === type)
      .sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  function activeOrder(type) {
    return orders(type).find(item => ACTIVE.has(item.status)) || null;
  }

  function capacity(method) {
    const remaining = Number(method?.remainingDailyInr);
    if (Number.isFinite(remaining)) return Math.max(0, remaining);
    return Math.max(0, Number(method?.dailyLimitInr || 0));
  }

  function minDeposit(type) {
    const limits = MODEL.rates?.limits || {};
    return Number(type === 'BANK' ? limits.bankMinUsdt : limits.upiMinUsdt) || 0;
  }

  function rate(type) {
    return Number(MODEL.rates?.rates?.[type.toLowerCase()] || 0);
  }

  function paidInr(order) {
    return Number(order?.payout?.paidInrPaise || 0) / 100;
  }

  function metrics(type) {
    const rows = orders(type);
    return {
      deposited: rows.reduce((sum, order) => sum + Math.max(0, Number(order.receivedUsdt || 0)), 0),
      pending: rows.reduce((sum, order) =>
        ['USDT Confirmed','INR Processing','Late Review'].includes(order.status)
          ? sum + Math.max(0, Number(order.inrAmount || 0) - paidInr(order))
          : sum, 0),
      settled: rows.reduce((sum, order) => sum + paidInr(order), 0)
    };
  }

  function statusClass(status) {
    if (['Completed','USDT Confirmed','INR Processing'].includes(status)) return 'v61good';
    if (['Expired','Failed','Rejected'].includes(status)) return 'v61bad';
    return '';
  }

  function tradeRow(order) {
    return `<button class="v61trade" data-order="${E(order.id)}">
      <div class="v61top"><span>${E(order.payoutType)}</span><span class="v61status ${statusClass(order.status)}">${E(order.status)}</span></div>
      <div class="v61amtrow"><b>${N(order.usdtAmount)} USDT</b><strong>${R(order.inrAmount)}</strong></div>
      <small>Rate ${R(order.lockedRate)} · ${F(order.createdAt)}</small>
    </button>`;
  }

  function bankDraft(order) {
    if (!MODEL.drafts.has(order.id)) {
      MODEL.drafts.set(order.id, new Map((order.allocations || []).map(item => [
        item.payoutMethodId, Number(item.inrAmount || 0)
      ])));
    }
    return MODEL.drafts.get(order.id);
  }

  function paidByBank(order) {
    const map = new Map();
    for (const ref of order?.payout?.references || []) {
      map.set(ref.payoutMethodId, (map.get(ref.payoutMethodId) || 0) + Number(ref.inrAmount || 0));
    }
    return map;
  }

  function bankPlanState(order) {
    const draft = bankDraft(order);
    const total = Number(order.inrAmount || 0);
    const allocated = [...draft.values()].reduce((sum, value) => sum + Number(value || 0), 0);
    return { total, allocated, pending: Math.max(0, total - allocated), invalid: allocated > total };
  }

  function bankPlan(order) {
    if (!order?.flexibleBankAllocation) return '';
    const list = methods('BANK', true);
    const draft = bankDraft(order);
    const paidMap = paidByBank(order);
    const rows = list.map(method => {
      const paid = paidMap.get(method.id) || 0;
      const value = Number(draft.get(method.id) || 0);
      const current = Number((order.allocations || []).find(item => item.payoutMethodId === method.id)?.inrAmount || 0);
      const max = Math.max(paid, capacity(method) + current);
      return `<label class="v61bank">
        <div>
          <b>${E(method.bankName || method.label || 'Bank')} ••••${E(String(method.accountNumber || '').slice(-4))}</b>
          <small>${paid ? `Paid ${R(paid)} · ` : ''}Available ${R(max)}</small>
        </div>
        <input data-bank="${E(method.id)}" type="number" inputmode="decimal" min="${paid}" max="${max}" step="0.01" value="${value || ''}" placeholder="0">
      </label>`;
    }).join('');

    const state = bankPlanState(order);
    return `<div class="v61plan">
      <div class="v61row"><b>Distribute INR</b><small class="v61muted">Remaining can stay pending</small></div>
      ${rows || '<div class="v61muted">No enabled bank account.</div>'}
      <div class="v61sum">
        <div><small>Total</small><b>${R(state.total)}</b></div>
        <div><small>Allocated</small><b id="v61Allocated">${R(state.allocated)}</b></div>
        <div><small>Pending</small><b id="v61Pending">${R(state.pending)}</b></div>
      </div>
      <div class="v61row" style="margin-top:7px">
        <small class="v61muted" id="v61PlanHelp">${state.invalid ? 'Allocated INR cannot exceed the trade total.' : 'Save any partial distribution.'}</small>
        <button class="v61btn" id="v61SavePlan" ${state.invalid || !list.length ? 'disabled' : ''}>Save</button>
      </div>
    </div>`;
  }

  function depositCard(type, order) {
    if (!order) return '';
    const address = String(order.depositAddress || '').trim();
    const left = Math.max(0, Number(order.quoteExpiresAt || 0) - Date.now());
    const bankPlanHtml = type === 'BANK' ? bankPlan(order) : '';

    return `<div class="v61box">
      <div class="v61top">
        <div><b>${type} Deposit</b><small class="v61muted">${E(order.id)} · ${N(order.usdtAmount)} USDT</small></div>
        <span class="v61status ${statusClass(order.status)}">${E(order.status)}</span>
      </div>
      <div class="v61dep">
        <canvas id="v61qr" class="v61qr" width="176" height="176"></canvas>
        <div class="v61addr">
          <small class="v61muted">TRON USDT address</small>
          <code>${address ? E(address) : 'Waiting for a free receiving address'}</code>
          <div class="v61actions" style="margin-top:7px">
            <button class="v61btn" id="v61Copy" ${address ? '' : 'disabled'}>Copy</button>
            <button class="v61btn" id="v61Timeline">Timeline</button>
          </div>
        </div>
      </div>
      ${address ? '' : `<div class="v61warn">
        No free enabled TRON address is available right now. An address already used by an expired/final order stays in a safety cooldown to prevent late deposits from being credited to the wrong order. Use a different free enabled address, or wait until the existing address becomes reusable.
      </div>`}
      <div class="v61meta">
        <div><small>Expected</small><b>${N(order.usdtAmount)} USDT</b></div>
        <div><small>Received</small><b>${order.receivedUsdt == null ? '—' : `${N(order.receivedUsdt)} USDT`}</b></div>
        <div><small>${order.status === 'Awaiting Deposit' ? 'Time' : 'Confirmations'}</small><b>${order.status === 'Awaiting Deposit' ? `${Math.ceil(left / 60000)} min` : `${order.confirmations || 0}/${order.requiredConfirmations || 0}`}</b></div>
      </div>
      ${bankPlanHtml}
    </div>`;
  }

  function routingCard(type) {
    const all = methods(type);
    const enabled = all.filter(item => item.enabled);
    const isOn = enabled.length > 0;
    const totalCapacity = enabled.reduce((sum, item) => sum + capacity(item), 0);

    return `<div class="v61box">
      <div class="v61row">
        <div>
          <b>${type === 'UPI' ? 'UPI payout' : 'Bank payout'}</b>
          <small class="v61muted">${enabled.length} enabled · ${R(totalCapacity)} capacity today</small>
        </div>
        <div class="v61actions">
          ${type === 'UPI'
            ? `<button id="v61UpiSwitch" class="v61switch ${isOn ? 'on' : ''}" aria-label="${isOn ? 'Disable UPI' : 'Enable UPI'}" ${MODEL.toggling ? 'disabled' : ''}></button>`
            : `<span class="v61pill ${isOn ? '' : 'off'}">${isOn ? 'ON' : 'OFF'}</span>`}
          <button id="v61Manage" class="v61btn">Manage</button>
          <button id="v61Add" class="v61btn">+ Add</button>
        </div>
      </div>
    </div>`;
  }

  function amountUiState(type) {
    const value = Math.max(0, Number(MODEL.amount[type] || 0));
    const minimum = minDeposit(type);
    const active = activeOrder(type);
    const enabledCount = methods(type, true).length;
    const canCreate = !MODEL.busy && !active && enabledCount > 0 && minimum > 0 && value >= minimum;
    return { value, minimum, active, enabledCount, canCreate };
  }

  function amountHelp(type, state) {
    if (state.active) return 'Finish the current deposit first.';
    if (!state.enabledCount) return `Enable or add a ${type === 'UPI' ? 'UPI ID' : 'bank account'} first.`;
    if (state.value < state.minimum) return `Enter at least ${N(state.minimum)} USDT.`;
    return 'TRON address and QR will appear after creation.';
  }

  function updateAmountUi(type) {
    const state = amountUiState(type);
    const estimate = $('v61Estimate');
    if (estimate) estimate.textContent = state.value ? R(state.value * rate(type)) : '—';

    const button = $('v61Create');
    if (button) {
      button.disabled = !state.canCreate;
      button.textContent = MODEL.busy
        ? 'Creating…'
        : state.active
          ? `${type} Deposit Active`
          : `Create ${type} Deposit`;
    }

    const help = $('v61Help');
    if (help) help.textContent = amountHelp(type, state);
  }

  function syncHiddenAmount(type) {
    BASE_SET_TYPE?.(type);
    const hidden = $('amount');
    if (hidden) hidden.value = MODEL.amount[type] || '';
  }

  function render(type) {
    const page = $('sell');
    if (!page) return;

    let root = $('v61root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'v61root';
      page.prepend(root);
    }

    const stats = metrics(type);
    const state = amountUiState(type);
    const recent = orders(type).slice(0, 3);

    root.innerHTML = `
      <div class="v61stats">
        <div class="v61stat"><small>Deposited</small><b>${N(stats.deposited)} USDT</b></div>
        <div class="v61stat"><small>Pending INR</small><b>${R(stats.pending)}</b></div>
        <div class="v61stat"><small>Settled INR</small><b>${R(stats.settled)}</b></div>
      </div>
      <div class="v61info">
        <div><small>Min deposit</small><b>${N(state.minimum)} USDT</b></div>
        <div><small>Live rate</small><b>${rate(type) ? R(rate(type)) : '—'}</b></div>
      </div>
      <div class="v61title">
        <small>${type} TRADING</small>
        <h2>Sell USDT via ${type === 'UPI' ? 'UPI' : 'Bank'}</h2>
        <p>${type === 'UPI'
          ? 'Any enabled UPI ID can receive the INR payout.'
          : 'Create a deposit, then split INR across enabled banks.'}</p>
      </div>
      <div class="v61box">
        <div class="v61row"><b>Amount</b><small class="v61muted">Live rate applied</small></div>
        <div class="v61amount">
          <div class="v61coin">₮</div>
          <div>
            <small>USDT to sell</small>
            <input id="v61Amount" type="number" inputmode="decimal" min="${state.minimum}" step="0.000001" value="${E(MODEL.amount[type])}" placeholder="${state.minimum}">
            <small>Minimum ${N(state.minimum)} USDT</small>
          </div>
          <button id="v61Max" class="v61max">Max</button>
        </div>
        <div class="v61quote"><small class="v61muted">Estimated INR</small><b id="v61Estimate">${state.value ? R(state.value * rate(type)) : '—'}</b></div>
        <button id="v61Create" class="v61create" ${state.canCreate ? '' : 'disabled'}>${MODEL.busy ? 'Creating…' : state.active ? `${type} Deposit Active` : `Create ${type} Deposit`}</button>
        <div id="v61Help" class="v61help">${E(amountHelp(type, state))}</div>
      </div>
      ${routingCard(type)}
      ${depositCard(type, state.active)}
      <div class="v61section"><h3>Recent ${type === 'UPI' ? 'UPI' : 'Bank'} Trades</h3><button id="v61History" class="v61btn">History</button></div>
      ${recent.length ? recent.map(tradeRow).join('') : '<div class="v61muted">No trades yet.</div>'}
    `;

    wirePage(type, state.active);
  }

  function wirePage(type, active) {
    const input = $('v61Amount');
    input?.addEventListener('input', event => {
      MODEL.amount[type] = event.target.value;
      // Critical: do not rebuild #v61root here. Replacing the focused input
      // makes Android WebView close its keyboard after every character.
      const hidden = $('amount');
      if (hidden) hidden.value = MODEL.amount[type] || '';
      updateAmountUi(type);
    });

    input?.addEventListener('blur', () => {
      if (MODEL.pendingRefresh) {
        MODEL.pendingRefresh = false;
        setTimeout(() => {
          if (MODEL.route === type.toLowerCase()) render(type);
        }, 0);
      }
    });

    $('v61Max')?.addEventListener('click', () => {
      const maximum = Number(MODEL.rates?.limits?.globalMaxUsdt || minDeposit(type));
      MODEL.amount[type] = String(maximum);
      if (input) input.value = MODEL.amount[type];
      const hidden = $('amount');
      if (hidden) hidden.value = MODEL.amount[type];
      updateAmountUi(type);
      input?.focus();
    });

    $('v61Create')?.addEventListener('click', () => createDeposit(type));
    $('v61Manage')?.addEventListener('click', () => manage(type));
    $('v61Add')?.addEventListener('click', () => window.openAdd?.(type));
    $('v61UpiSwitch')?.addEventListener('click', toggleUpi);
    $('v61History')?.addEventListener('click', () => go('history'));
    $('v61Copy')?.addEventListener('click', () => active?.depositAddress && window.copyAddress?.(active.depositAddress));
    $('v61Timeline')?.addEventListener('click', () => active && window.openOrder?.(active.id));

    document.querySelectorAll('#v61root [data-order]').forEach(button => {
      button.addEventListener('click', () => window.openOrder?.(button.dataset.order));
    });

    wireBankInputs(active);

    const qr = $('v61qr');
    if (qr && active?.depositAddress && window.digiQr?.render) {
      try { window.digiQr.render(qr, active.depositAddress); } catch {}
    }
  }

  async function createDeposit(type) {
    if (MODEL.busy) return;
    const state = amountUiState(type);
    if (!state.canCreate) {
      updateAmountUi(type);
      return;
    }

    MODEL.busy = true;
    updateAmountUi(type);

    try {
      syncHiddenAmount(type);
      await window.lockQuote?.();
    } finally {
      MODEL.busy = false;
      setTimeout(() => {
        if (MODEL.route === type.toLowerCase()) render(type);
      }, 100);
    }
  }

  async function toggleUpi() {
    if (MODEL.toggling) return;
    const all = methods('UPI');

    if (!all.length) {
      window.openAdd?.('UPI');
      return;
    }

    const turnOn = !all.some(item => item.enabled);
    const targets = all.filter(item => turnOn ? !item.enabled : item.enabled);
    MODEL.toggling = true;
    render('UPI');

    try {
      for (const item of targets) await window.toggleMethod?.(item.id);
    } finally {
      MODEL.toggling = false;
      setTimeout(() => MODEL.route === 'upi' && render('UPI'), 100);
    }
  }

  function updateBankPlanUi(order) {
    const state = bankPlanState(order);
    if ($('v61Allocated')) $('v61Allocated').textContent = R(state.allocated);
    if ($('v61Pending')) $('v61Pending').textContent = R(state.pending);

    const save = $('v61SavePlan');
    if (save) save.disabled = state.invalid || !methods('BANK', true).length;

    const help = $('v61PlanHelp');
    if (help) help.textContent = state.invalid
      ? 'Allocated INR cannot exceed the trade total.'
      : 'Save any partial distribution.';
  }

  function wireBankInputs(order) {
    if (!order || order.payoutType !== 'BANK' || !order.flexibleBankAllocation) return;

    const draft = bankDraft(order);
    const paidMap = paidByBank(order);

    document.querySelectorAll('#v61root [data-bank]').forEach(input => {
      input.addEventListener('input', () => {
        const id = input.dataset.bank;
        const method = methods('BANK', true).find(item => item.id === id);
        if (!method) return;

        const paid = paidMap.get(id) || 0;
        const current = Number((order.allocations || []).find(item => item.payoutMethodId === id)?.inrAmount || 0);
        const maxForMethod = Math.max(paid, capacity(method) + current);
        const other = [...draft.entries()]
          .filter(([key]) => key !== id)
          .reduce((sum, [,value]) => sum + Number(value || 0), 0);

        let value = Number(input.value || 0);
        if (!Number.isFinite(value)) value = 0;
        value = Math.max(paid, Math.min(maxForMethod, value));
        value = Math.min(value, Math.max(paid, Number(order.inrAmount || 0) - other));
        value = Math.round(value * 100) / 100;

        if (value > 0) draft.set(id, value);
        else draft.delete(id);

        // Do not render('BANK') here: keeping the same input node preserves
        // focus and the Android keyboard while the user types allocations.
        if (input.value !== '' && Number(input.value) !== value) input.value = String(value);
        updateBankPlanUi(order);
      });

      input.addEventListener('blur', () => {
        if (MODEL.pendingRefresh) {
          MODEL.pendingRefresh = false;
          setTimeout(() => MODEL.route === 'bank' && render('BANK'), 0);
        }
      });
    });

    $('v61SavePlan')?.addEventListener('click', async () => {
      const state = bankPlanState(order);
      if (state.invalid) return window.toastMsg?.('Allocated INR cannot exceed the trade total', true);

      const allocations = [...draft.entries()]
        .filter(([,value]) => Number(value) > 0)
        .map(([payoutMethodId, inrAmount]) => ({ payoutMethodId, inrAmount:Number(inrAmount) }));

      try {
        await window.__digiSaveBankAllocations?.(order.id, allocations);
        window.toastMsg?.('Bank distribution saved');
      } catch (error) {
        window.toastMsg?.(error.message || 'Could not save distribution', true);
      }
    });
  }

  function cleanText(value) {
    return String(value || '')
      .replaceAll('â€¢','•')
      .replaceAll('Â·','·')
      .replaceAll('â€“','–')
      .replaceAll('â‚¹','₹');
  }

  function sanitizeManage() {
    const root = $('manageOv');
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const clean = cleanText(node.nodeValue);
      if (clean !== node.nodeValue) node.nodeValue = clean;
    }
  }

  function manage(type) {
    window.openManage?.(type);
    setTimeout(sanitizeManage, 0);
  }

  function profile() {
    const page = $('profile');
    if (!page) return;

    [...page.querySelectorAll('.section h2')].forEach(heading => {
      if (/payout methods|add bank account/i.test(heading.textContent || '')) {
        heading.textContent = 'Add Bank Account & UPI';
      }
    });

    if (!$('v61HistoryEntry')) {
      const card = document.createElement('div');
      card.id = 'v61HistoryEntry';
      card.className = 'card menu';
      card.innerHTML = `<div class="menu-row" id="v61HistoryOpen">
        <div class="icon ib">⇄</div>
        <div><b>Trade History</b><small>UPI & Bank deposits, payouts and status</small></div>
        <span class="menu-right">›</span>
      </div>`;
      page.querySelector('.section')?.insertAdjacentElement('beforebegin', card);
      $('v61HistoryOpen')?.addEventListener('click', () => go('history'));
    }
  }

  function history() {
    const page = $('orders');
    if (!page) return;
    page.classList.add('v61history');

    let root = $('v61history');
    if (!root) {
      root = document.createElement('div');
      root.id = 'v61history';
      page.appendChild(root);
    }

    const filters = ['All','UPI','BANK','Active','Completed'];
    const rows = MODEL.orders
      .filter(order => {
        if (MODEL.historyFilter === 'UPI' || MODEL.historyFilter === 'BANK') {
          return String(order.payoutType).toUpperCase() === MODEL.historyFilter;
        }
        if (MODEL.historyFilter === 'Active') return ACTIVE.has(order.status);
        if (MODEL.historyFilter === 'Completed') return order.status === 'Completed';
        return true;
      })
      .sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    root.innerHTML = `
      <button id="v61Back" class="v61btn">‹ Profile</button>
      <div class="v61filters">
        ${filters.map(filter => `<button data-filter="${filter}" class="${MODEL.historyFilter === filter ? 'active' : ''}">${filter === 'BANK' ? 'Bank' : filter}</button>`).join('')}
      </div>
      ${rows.map(tradeRow).join('') || '<div class="v61muted">No matching trades.</div>'}
    `;

    $('v61Back')?.addEventListener('click', () => go('profile'));
    root.querySelectorAll('[data-filter]').forEach(button => {
      button.addEventListener('click', () => {
        MODEL.historyFilter = button.dataset.filter;
        history();
      });
    });
    root.querySelectorAll('[data-order]').forEach(button => {
      button.addEventListener('click', () => window.openOrder?.(button.dataset.order));
    });
  }

  function setHeader(title, subtitle) {
    if ($('pageTitle')) $('pageTitle').textContent = title;
    if ($('pageSub')) $('pageSub').textContent = subtitle;
  }

  function configureNav() {
    const buttons = [...document.querySelectorAll('.app>.nav button')];
    if (buttons.length !== 5) return;

    const routes = ['home','upi','bank','rewards','profile'];
    const labels = ['Home','UPI','Bank','Rewards','Profile'];

    buttons.forEach((button,index) => {
      button.dataset.page = routes[index];
      button.setAttribute('onclick', `go('${routes[index]}')`);
      if (button.lastElementChild) button.lastElementChild.textContent = labels[index];
    });

    buttons[1].innerHTML = `<span class="nav-icon"><svg viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="10" fill="#138A67"/><text x="16" y="19" text-anchor="middle" fill="#fff" font-size="10" font-weight="900">UPI</text></svg></span><span>UPI</span>`;
    buttons[2].innerHTML = `<span class="nav-icon"><svg viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="10" fill="#2457D6"/><path d="M7 14h18M9 14v9m4-9v9m6-9v9m4-9v9M6 25h20M16 7l10 5H6z" fill="none" stroke="#fff" stroke-width="1.8"/></svg></span><span>Bank</span>`;
  }

  function setNavActive(route) {
    document.querySelectorAll('.app>.nav button')
      .forEach(button => button.classList.toggle('active', button.dataset.page === route));
  }

  function go(route) {
    const page = route === 'sell' ? 'upi' : route === 'orders' ? 'history' : route;
    MODEL.route = page;

    if (page === 'upi' || page === 'bank') {
      const type = page === 'bank' ? 'BANK' : 'UPI';
      BASE_GO?.('sell');
      BASE_SET_TYPE?.(type);
      const hidden = $('amount');
      if (hidden) hidden.value = MODEL.amount[type] || '';
      setNavActive(page);
      setHeader(page === 'upi' ? 'UPI' : 'Bank',
        page === 'upi' ? 'UPI trading and deposit.' : 'Bank trading, deposit and INR distribution.');
      render(type);
      return;
    }

    if (page === 'history') {
      BASE_GO?.('orders');
      setNavActive('profile');
      setHeader('Trade History', 'All UPI and Bank trading activity.');
      history();
      return;
    }

    BASE_GO?.(page);
    setNavActive(page);
    if (page === 'home') setHeader('Home', 'Trade, earn rewards and track your account.');
    if (page === 'rewards') setHeader('Rewards', 'Spin, complete tasks & earn USDT.');
    if (page === 'profile') {
      setHeader('Profile', 'Account, bank/UPI and security.');
      profile();
    }
  }

  function editorFocused() {
    const active = document.activeElement;
    return !!active && active.matches('#v61root input');
  }

  function refreshCurrentRoute() {
    if (MODEL.route === 'upi') render('UPI');
    else if (MODEL.route === 'bank') render('BANK');
    else if (MODEL.route === 'history') history();
  }

  function install() {
    injectCss();
    document.body.classList.remove('digi-layout-v3','digi-layout-v4','digi-layout-v5','digi-layout-v6');
    document.body.classList.add('digi-layout-v61');

    // digiRupee 1.0.4 and earlier can render edge-to-edge on devices where
    // the native WebView does not reliably consume the status-bar inset.
    // Keep the old installed APK usable by applying a hosted-UI fallback.
    const legacyApk = /digiRupee\/1\.0\.[0-4]\b/i.test(navigator.userAgent || '');
    document.body.classList.toggle('digi-legacy-insets', legacyApk);

    if (typeof window.__digiStateSnapshot === 'function') {
      loadState(window.__digiStateSnapshot());
    }

    configureNav();
    profile();

    window.addEventListener('digirupee:state', event => {
      loadState(event.detail || {});
      profile();

      // Background refresh must not replace a focused input in Android WebView.
      if (editorFocused()) {
        MODEL.pendingRefresh = true;
        return;
      }
      refreshCurrentRoute();
    });

    const manageOverlay = $('manageOv');
    if (manageOverlay) {
      new MutationObserver(sanitizeManage).observe(manageOverlay, {
        subtree:true, childList:true, characterData:true
      });
    }

    window.__digiAfterSellRender = () => {
      if (editorFocused()) return;
      if (MODEL.route === 'upi') updateAmountUi('UPI');
      if (MODEL.route === 'bank') updateAmountUi('BANK');
    };

    go('home');
  }

  window.go = go;
  window.__digiLayoutV61 = { go, render, history, updateAmountUi };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once:true });
  } else {
    install();
  }
})();
