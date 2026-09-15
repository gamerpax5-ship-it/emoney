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
  const baseOpenManage = typeof window.openManage === 'function' ? window.openManage.bind(window) : null;

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
    bankDraftDirty:false,
    railToggleBusy:false
  };

  const activeStatuses = new Set(['Awaiting Deposit','Detected','Confirming','USDT Confirmed','INR Processing','Late Review']);
  const bankDistributionStatuses = new Set(['USDT Confirmed','INR Processing']);

  function injectStyles() {
    ['digirupee-layout-v3-css','digirupee-layout-v4-css','digirupee-layout-v5-css','digirupee-layout-v6-css']
      .forEach(id => document.getElementById(id)?.remove());
    const style = document.createElement('style');
    style.id = 'digirupee-layout-v6-css';
    style.textContent = `
      html,body{height:100%;min-height:100%;overflow:hidden;background:#000!important}
      body.digi-layout-v6{margin:0!important;padding:0!important}
      body.digi-layout-v6.digi-legacy-insets .app{padding-top:24px!important;box-sizing:border-box!important}
      body.digi-layout-v6 .app{width:min(430px,100%)!important;height:100%!important;min-height:0!important;max-height:100%!important;grid-template-rows:auto minmax(0,1fr) var(--nav)!important;overflow:hidden!important;margin:0 auto!important}
      body.digi-layout-v6 .statusbar{display:none!important}
      body.digi-layout-v6 .header{grid-row:1!important;padding:12px 15px 9px!important;min-height:68px!important;box-sizing:border-box!important;background:#050607!important}
      body.digi-layout-v6 .header-copy{min-width:0}
      body.digi-layout-v6 .header-copy h1{font-size:25px!important;line-height:1.02!important}
      body.digi-layout-v6 .header-copy p{font-size:10.5px!important;line-height:1.3!important}
      body.digi-layout-v6 .page{grid-row:2!important;padding:0 15px 14px!important;min-height:0!important}
      body.digi-layout-v6 .app>.nav{grid-row:3!important;position:static!important;width:100%!important;height:var(--nav)!important;padding:5px 8px 6px!important;box-sizing:border-box!important}
      body.digi-layout-v6 .app>.nav .nav-icon{width:30px!important;height:30px!important}
      #sell>.digi-v6-original{display:none!important}
      #sell #digiTradeRoot{display:block!important;padding:0 0 10px!important}
      .digi-v6-intro{margin:0 0 9px;padding:0 1px}
      .digi-v6-intro b{display:block;color:#dec05d;font-size:9px;letter-spacing:.14em;text-transform:uppercase}
      .digi-v6-intro h2{margin:4px 0 3px;font-size:20px;line-height:1.15}
      .digi-v6-intro p{margin:0;color:#8d929b;font-size:9.5px;line-height:1.4}
      .digi-v6-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:9px}
      .digi-v6-stat{padding:8px 9px;border:1px solid #282d35;border-radius:10px;background:#0d0f12;min-width:0}
      .digi-v6-stat.primary{border-color:#5c4c22;background:#151208}
      .digi-v6-stat small{display:block;color:#818791;font-size:7.5px;white-space:nowrap}
      .digi-v6-stat b{display:block;margin-top:3px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .digi-v6-stat.primary b{color:#f0cf67}
      .digi-v6-stat em{display:block;margin-top:2px;color:#6f7580;font-size:6.8px;font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .digi-v6-section{margin-top:9px}
      .digi-v6-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
      .digi-v6-section-head b{font-size:11.5px}
      .digi-v6-section-head span{color:#7d838c;font-size:8px}
      .digi-v6-amount{display:grid;grid-template-columns:34px minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:9px 10px;border:1px solid #2a2f37;border-radius:12px;background:#0d0f12}
      .digi-v6-token{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#24aa83;color:#fff;font-size:19px;font-weight:900}
      .digi-v6-amount-copy{min-width:0}
      .digi-v6-amount-copy small{display:block;color:#858b94;font-size:7.5px;margin-bottom:2px}
      #amount.digi-v6-amount-input{width:100%!important;min-width:0!important;height:auto!important;border:0!important;background:transparent!important;color:#fff!important;padding:0!important;margin:0!important;font-size:24px!important;font-weight:850!important;line-height:1.1!important;outline:0!important;box-shadow:none!important}
      .digi-v6-usdt{color:#aaaeb6;font-size:9px;font-weight:800}
      .digi-v6-max{border:0;background:none;color:#e5c75f;font-size:9px;font-weight:850;padding:5px}
      .digi-v6-route{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid #292e36;border-radius:11px;background:#0d0f12}
      .digi-v6-route-copy{min-width:0}
      .digi-v6-route-copy b{display:block;font-size:10.5px}
      .digi-v6-route-copy small{display:block;margin-top:2px;color:#818791;font-size:7.8px;line-height:1.4}
      .digi-v6-route-actions{display:flex;align-items:center;gap:6px;flex:none}
      .digi-v6-manage{min-height:32px;border:1px solid #30353e;border-radius:9px;background:#12151a;color:#fff;padding:0 9px;font-size:8px;font-weight:750}
      .digi-v6-switch{display:inline-flex;align-items:center;gap:6px;min-height:32px;border:1px solid #285947;border-radius:999px;background:#123126;color:#77e2af;padding:0 9px;font-size:8px;font-weight:850}
      .digi-v6-switch.off{border-color:#5b343b;background:#2a181c;color:#f08f9d}
      .digi-v6-switch:disabled{opacity:.55}
      .digi-v6-switch-track{position:relative;width:22px;height:12px;border-radius:999px;background:#1d6b51}
      .digi-v6-switch.off .digi-v6-switch-track{background:#6a3941}
      .digi-v6-switch-track i{position:absolute;width:8px;height:8px;top:2px;left:12px;border-radius:50%;background:#fff;transition:left .16s}
      .digi-v6-switch.off .digi-v6-switch-track i{left:2px}
      .digi-v6-create{width:100%;min-height:42px;margin-top:8px;border:0;border-radius:11px;background:linear-gradient(90deg,#ffe681,#eeb62f);color:#201700;font-size:11px;font-weight:900;box-shadow:0 8px 24px #d2a8321f}
      .digi-v6-create:disabled{background:#1a1d22;color:#686e77;box-shadow:none}
      .digi-v6-action-note{display:block;margin-top:5px;text-align:center;color:#757b84;font-size:7.6px}
      .digi-v6-deposit{margin-top:10px}
      .digi-v6-deposit-card{padding:10px;border:1px solid #343941;border-radius:12px;background:#0d0f12}
      .digi-v6-deposit-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
      .digi-v6-deposit-head h3{margin:0;font-size:12px}
      .digi-v6-deposit-head p{margin:3px 0 0;color:#878d96;font-size:7.8px;line-height:1.35}
      .digi-v6-deposit-body{display:grid;grid-template-columns:86px minmax(0,1fr);gap:9px;align-items:center;margin-top:9px}
      .digi-v6-qr{width:86px;height:86px;padding:4px;border-radius:8px;background:#fff;box-sizing:border-box}
      .digi-v6-address{min-width:0}
      .digi-v6-address small{display:block;color:#7f858e;font-size:7.5px}
      .digi-v6-address code{display:block;margin-top:4px;color:#f1d36f;font-size:8.2px;line-height:1.35;word-break:break-all}
      .digi-v6-address-actions{display:flex;gap:6px;margin-top:7px}
      .digi-v6-address-actions button{min-height:29px;border:1px solid #30353e;border-radius:8px;background:#12151a;color:#fff;padding:0 8px;font-size:7.8px}
      .digi-v6-address-actions button:disabled{opacity:.45}
      .digi-v6-warning,.digi-v6-info{margin-top:7px;padding:7px 8px;border-radius:8px;font-size:7.8px;line-height:1.4}
      .digi-v6-warning{background:#2a171b;border:1px solid #5d3038;color:#f19aa7}
      .digi-v6-info{background:#151922;border:1px solid #2f3743;color:#aab3c0}
      .digi-v6-deposit-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:7px}
      .digi-v6-deposit-meta>div{padding:6px;border:1px solid #242932;border-radius:8px;background:#111419;min-width:0}
      .digi-v6-deposit-meta small{display:block;color:#7f858e;font-size:6.8px}
      .digi-v6-deposit-meta b{display:block;margin-top:2px;font-size:8.2px;overflow-wrap:anywhere}
      .digi-v6-bank-plan{margin-top:9px;padding-top:9px;border-top:1px solid #242932}
      .digi-v6-plan-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px}
      .digi-v6-plan-head b{font-size:10.5px}
      .digi-v6-plan-head span{color:#858b93;font-size:7.3px;text-align:right}
      .digi-v6-plan-list{display:flex;flex-direction:column;gap:5px}
      .digi-v6-plan-row{display:grid;grid-template-columns:minmax(0,1fr) 102px;gap:7px;align-items:center;padding:7px 8px;border:1px solid #282d35;border-radius:9px;background:#101318}
      .digi-v6-plan-copy{min-width:0}
      .digi-v6-plan-copy b{display:block;font-size:9px}
      .digi-v6-plan-copy small{display:block;margin-top:2px;color:#858b93;font-size:7px;line-height:1.35}
      .digi-v6-plan-input{display:flex;align-items:center;border:1px solid #353a43;border-radius:8px;background:#0b0d10;padding:0 6px}
      .digi-v6-plan-input span{color:#d8bc5e;font-size:8px}
      .digi-v6-plan-input input{width:100%;height:32px;border:0;background:transparent;color:#fff;text-align:right;outline:0;font-size:9px;min-width:0}
      .digi-v6-plan-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:6px}
      .digi-v6-plan-summary>div{padding:6px;border:1px solid #242932;border-radius:8px;background:#0b0d10;text-align:center}
      .digi-v6-plan-summary small{display:block;color:#7f858e;font-size:6.6px}
      .digi-v6-plan-summary b{display:block;margin-top:2px;font-size:8px}
      .digi-v6-plan-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px}
      .digi-v6-plan-footer small{color:#858b93;font-size:7.2px;line-height:1.35}
      .digi-v6-save{min-height:31px;border:1px solid #4d4220;border-radius:8px;background:#211c0e;color:#efd16c;padding:0 10px;font-size:8px;font-weight:800;flex:none}
      .digi-v6-save:disabled{opacity:.45}
      .digi-v6-trades{margin-top:11px;padding-top:9px;border-top:1px solid #1d2229}
      .digi-v6-trades-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
      .digi-v6-trades-head h2{margin:0;font-size:13px}
      .digi-v6-trades-head button{border:0;background:none;color:#e2c35e;font-size:8px;padding:3px}
      .digi-v6-trade-list{display:flex;flex-direction:column;gap:5px}
      .digi-v6-trade-row{width:100%;padding:8px!important;display:block;text-align:left;border:1px solid #282c34!important;border-radius:10px!important;background:#0d0f12!important;color:#fff}
      .digi-v6-trade-top,.digi-v6-trade-amounts{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .digi-v6-rail-pill{padding:3px 6px;border-radius:999px;background:#171b21;border:1px solid #30353e;color:#e7ca67;font-size:7.2px;font-weight:850}
      .digi-v6-trade-amounts{margin-top:5px}
      .digi-v6-trade-amounts b{font-size:10.5px}
      .digi-v6-trade-amounts strong{font-size:10px;color:#f0cc61}
      .digi-v6-trade-meta{display:block;margin-top:3px;color:#8c929b;font-size:7.5px;line-height:1.35;white-space:normal}
      .digi-v6-empty{padding:13px 9px;text-align:center;border:1px solid #252a31;border-radius:10px;background:#0b0d10;color:#858b93;font-size:8.5px;line-height:1.45}
      #orders.digi-history-mode>*:not(.digi-history-root){display:none!important}
      .digi-history-root{padding-bottom:8px}
      .digi-history-back{border:0;background:none;color:#e5c65f;font-size:10px;padding:4px 0 10px}
      .digi-history-filters{display:flex;gap:6px;overflow-x:auto;padding-bottom:9px}
      .digi-history-filters button{flex:none;min-height:31px;padding:0 9px;border:1px solid #292e36;border-radius:999px;background:#101318;color:#9ba0a8;font-size:8.5px}
      .digi-history-filters button.active{background:#2b2413;border-color:#6b5924;color:#f0ce65}
      #profile .digi-profile-history{margin:8px 0 16px}
      #manageOv .manage-method{overflow:hidden}
      #manageOv .manage-copy small,#manageOv .capacity-row{font-size:9px!important}
      #manageOv .digi-v6-manager-toggle{min-width:44px}
      @media(max-width:370px){
        .digi-v6-deposit-body{grid-template-columns:78px minmax(0,1fr)}
        .digi-v6-qr{width:78px;height:78px}
        .digi-v6-plan-row{grid-template-columns:1fr}
        .digi-v6-deposit-meta{grid-template-columns:1fr 1fr}
        .digi-v6-deposit-meta>div:last-child{grid-column:1/-1}
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
    const v = Number(method?.remainingDailyInr);
    return Number.isFinite(v) ? Math.max(0,v) : Math.max(0,Number(method?.dailyLimitInr || 0));
  }

  function matchingOrders(type) {
    return [...model.orders]
      .filter(order => String(order.payoutType || '').toUpperCase() === type)
      .sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  function railMetrics(type) {
    const orders = matchingOrders(type);
    let depositedUsdt = 0;
    let pendingInr = 0;
    let settledInr = 0;
    for (const order of orders) {
      depositedUsdt += Math.max(0, Number(order.receivedUsdt || 0));
      const paid = Math.max(0, Number(order.payout?.paidInrPaise || 0) / 100);
      settledInr += paid;
      const funded = ['USDT Confirmed','INR Processing'].includes(order.status)
        || (Number(order.receivedUsdt || 0) > 0 && !['Completed','Expired','Failed','Rejected'].includes(order.status));
      if (funded) pendingInr += Math.max(0, Number(order.inrAmount || 0) - paid);
    }
    return { depositedUsdt, pendingInr, settledInr };
  }

  function railCapacity(type) {
    return railMethods(type,true).reduce((sum,method) => sum + methodRemaining(method), 0);
  }

  function minUsdt(type) {
    const limits = model.rates?.limits || {};
    return Number(type === 'BANK' ? limits.bankMinUsdt : limits.upiMinUsdt) || 0;
  }

  function maxUsdt() {
    return Number(model.rates?.limits?.globalMaxUsdt || 0);
  }

  function channelEnabled(type) {
    const channels = model.rates?.channels || {};
    return channels[type.toLowerCase()] !== false;
  }

  function activeOrder(type) {
    return matchingOrders(type).find(order => activeStatuses.has(order.status)) || null;
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
    return `<button class="digi-v6-trade-row" type="button" data-order-id="${esc(order.id)}">
      <div class="digi-v6-trade-top"><span class="digi-v6-rail-pill">${rail}</span><span class="status-pill ${statusClass(order.status)}">${esc(order.status)}</span></div>
      <div class="digi-v6-trade-amounts"><b>${num(order.usdtAmount)} USDT</b><strong>${inr(order.inrAmount)}</strong></div>
      <span class="digi-v6-trade-meta">Rate ${inr(order.lockedRate)} · ${esc(destination(order))}</span>
      <span class="digi-v6-trade-meta">${esc(fmtDate(order.createdAt))}</span>
    </button>`;
  }

  function wireOrderRows(host) {
    host?.querySelectorAll('[data-order-id]').forEach(button => button.addEventListener('click', () => window.openOrder?.(button.dataset.orderId)));
  }

  function ensureTradeRoot() {
    const sell = $('sell');
    if (!sell) return null;
    let root = $('digiTradeRoot');
    if (root) return root;

    const originals = [...sell.children];
    root = document.createElement('div');
    root.id = 'digiTradeRoot';
    root.innerHTML = `
      <div class="digi-v6-intro"><b id="digiV6Kicker">TRADING</b><h2 id="digiV6Title">Sell USDT</h2><p id="digiV6IntroCopy"></p></div>
      <div class="digi-v6-stats" id="digiV6Stats"></div>
      <div class="digi-v6-section">
        <div class="digi-v6-section-head"><b>Amount</b><span>Live rate applied</span></div>
        <div class="digi-v6-amount">
          <div class="digi-v6-token">₮</div>
          <div class="digi-v6-amount-copy"><small>USDT to sell</small><div id="digiV6AmountSlot"></div></div>
          <span class="digi-v6-usdt">USDT</span>
          <button class="digi-v6-max" type="button" id="digiV6Max">Max</button>
        </div>
      </div>
      <div class="digi-v6-section">
        <div class="digi-v6-section-head"><b id="digiV6RailHeading">Payout route</b><span id="digiV6Capacity"></span></div>
        <div id="digiV6Rail"></div>
        <button class="digi-v6-create" type="button" id="digiV6Create">Create Deposit</button>
        <small class="digi-v6-action-note" id="digiV6ActionNote">TRON address and QR are assigned after deposit creation.</small>
      </div>
      <div class="digi-v6-deposit" id="digiV6Deposit"></div>
      <div class="digi-v6-trades">
        <div class="digi-v6-trades-head"><h2 id="digiV6TradesTitle">Recent Trades</h2><button type="button" id="digiV6History">History ›</button></div>
        <div class="digi-v6-trade-list" id="digiV6Trades"></div>
      </div>
    `;
    sell.prepend(root);
    originals.forEach(node => node.classList.add('digi-v6-original'));

    const amount = $('amount');
    if (amount) {
      amount.classList.add('digi-v6-amount-input');
      amount.setAttribute('inputmode','decimal');
      $('digiV6AmountSlot')?.appendChild(amount);
      if (!amount.dataset.digiV6Bound) {
        amount.dataset.digiV6Bound = '1';
        amount.addEventListener('input', () => {
          if (model.route === 'upi') renderTrade('UPI');
          if (model.route === 'bank') renderTrade('BANK');
        });
      }
    }

    $('digiV6Max')?.addEventListener('click', () => {
      const input = $('amount');
      const max = maxUsdt();
      if (input && max > 0) {
        input.value = String(max);
        input.dispatchEvent(new Event('input', { bubbles:true }));
      } else {
        window.setMax?.();
      }
    });
    $('digiV6History')?.addEventListener('click', () => routeGo('history'));
    $('digiV6Create')?.addEventListener('click', createDeposit);
    return root;
  }

  function renderStats(type) {
    const node = $('digiV6Stats');
    if (!node) return;
    const metrics = railMetrics(type);
    const rate = Number(model.rates?.rates?.[type.toLowerCase()] || 0);
    node.innerHTML = `
      <div class="digi-v6-stat primary"><small>${type} Balance</small><b>${inr(metrics.pendingInr)}</b><em>${inr(metrics.settledInr)} settled</em></div>
      <div class="digi-v6-stat"><small>Deposited</small><b>${num(metrics.depositedUsdt)} USDT</b><em>chain received</em></div>
      <div class="digi-v6-stat"><small>Min deposit</small><b>${num(minUsdt(type))} USDT</b><em>per trade</em></div>
      <div class="digi-v6-stat"><small>Rate</small><b>${rate ? inr(rate) : '—'}</b><em>live server rate</em></div>`;
    const amount = $('amount');
    if (amount) {
      amount.min = String(minUsdt(type) || 0);
      if (maxUsdt() > 0) amount.max = String(maxUsdt());
    }
  }

  async function apiPatchMethod(id, enabled) {
    const response = await fetch(`/api/digirupee/payout-methods/${encodeURIComponent(id)}/status`, {
      method:'PATCH',
      headers:{ 'Content-Type':'application/json' },
      credentials:'include',
      body:JSON.stringify({ enabled })
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
    return payload;
  }

  async function setUpiRailEnabled(enabled) {
    if (model.railToggleBusy) return;
    const methods = railMethods('UPI', false);
    if (!methods.length) return window.toastMsg?.('Add a UPI ID first', true);
    if (!channelEnabled('UPI')) return window.toastMsg?.('UPI trading is disabled by admin', true);
    model.railToggleBusy = true;
    renderRailControl('UPI');
    try {
      for (const method of methods) {
        if (!!method.enabled === enabled) continue;
        await apiPatchMethod(method.id, enabled);
        method.enabled = enabled;
      }
      window.toastMsg?.(enabled ? 'UPI routing turned on' : 'UPI routing turned off');
      renderTrade('UPI');
      window.dispatchEvent(new Event('focus'));
    } catch (error) {
      window.toastMsg?.(error.message || 'Could not update UPI routing', true);
      window.dispatchEvent(new Event('focus'));
    } finally {
      model.railToggleBusy = false;
      renderRailControl('UPI');
      renderCreateAction('UPI');
    }
  }

  function renderRailControl(type) {
    const node = $('digiV6Rail');
    if (!node) return;
    const all = railMethods(type,false);
    const enabled = all.filter(method => method.enabled);
    const capacity = enabled.reduce((sum,method) => sum + methodRemaining(method), 0);
    const adminOn = channelEnabled(type);
    const on = adminOn && enabled.length > 0;
    $('digiV6Capacity').textContent = `${inr(capacity)} available today`;

    if (type === 'UPI') {
      const detail = !adminOn
        ? 'UPI trading is disabled by admin.'
        : `${enabled.length} of ${all.length} UPI ID${all.length === 1 ? '' : 's'} enabled. Auto-routing uses only enabled IDs.`;
      node.innerHTML = `<div class="digi-v6-route">
        <div class="digi-v6-route-copy"><b>UPI Auto Route</b><small>${esc(detail)}</small></div>
        <div class="digi-v6-route-actions">
          <button class="digi-v6-switch ${on ? '' : 'off'}" type="button" id="digiV6UpiSwitch" role="switch" aria-checked="${on ? 'true' : 'false'}" ${model.railToggleBusy || !all.length || !adminOn ? 'disabled' : ''}>
            <span class="digi-v6-switch-track"><i></i></span>${model.railToggleBusy ? '...' : on ? 'ON' : 'OFF'}
          </button>
          <button class="digi-v6-manage" type="button" id="digiV6Manage">Manage</button>
        </div>
      </div>`;
      $('digiV6UpiSwitch')?.addEventListener('click', () => setUpiRailEnabled(!on));
    } else {
      const detail = !adminOn
        ? 'Bank trading is disabled by admin.'
        : `${enabled.length} active of ${all.length} bank account${all.length === 1 ? '' : 's'}.`;
      node.innerHTML = `<div class="digi-v6-route">
        <div class="digi-v6-route-copy"><b>Bank Accounts</b><small>${esc(detail)}</small></div>
        <div class="digi-v6-route-actions"><button class="digi-v6-manage" type="button" id="digiV6Manage">Manage</button></div>
      </div>`;
    }
    $('digiV6Manage')?.addEventListener('click', () => openRailManager(type));
  }

  function createButtonState(type) {
    const active = activeOrder(type);
    if (active) return { disabled:true, text:`${type} Deposit Active`, note:'Complete the active deposit before creating another one.' };
    if (!channelEnabled(type)) return { disabled:true, text:`${type} Unavailable`, note:`${type} trading is disabled by admin.` };
    const enabled = railMethods(type,true);
    if (!enabled.length) return { disabled:true, text:type === 'UPI' ? 'Turn UPI ON first' : 'Enable Bank Account first', note:`Manage your ${type === 'UPI' ? 'UPI IDs' : 'bank accounts'} to continue.` };
    const amount = Number($('amount')?.value || 0);
    const min = minUsdt(type);
    const max = maxUsdt();
    if (!amount) return { disabled:true, text:'Enter USDT Amount', note:`Minimum deposit is ${num(min)} USDT.` };
    if (amount < min) return { disabled:true, text:`Minimum ${num(min)} USDT`, note:`Enter at least ${num(min)} USDT.` };
    if (max > 0 && amount > max) return { disabled:true, text:`Maximum ${num(max)} USDT`, note:`Maximum deposit is ${num(max)} USDT.` };
    return { disabled:false, text:`Create ${type} Deposit`, note:'A TRON USDT address and QR will be assigned immediately if an address is available.' };
  }

  function renderCreateAction(type) {
    const button = $('digiV6Create');
    const note = $('digiV6ActionNote');
    if (!button) return;
    const state = createButtonState(type);
    button.disabled = state.disabled;
    button.textContent = state.text;
    if (note) note.textContent = state.note;
  }

  async function createDeposit() {
    const type = model.route === 'bank' ? 'BANK' : 'UPI';
    const state = createButtonState(type);
    if (state.disabled) return;
    const button = $('digiV6Create');
    if (button) { button.disabled = true; button.textContent = 'Creating Deposit...'; }
    try {
      await window.lockQuote?.();
    } finally {
      renderTrade(type);
    }
  }

  function paidByMethod(order) {
    const map = new Map();
    for (const ref of order?.payout?.references || []) {
      map.set(ref.payoutMethodId, (map.get(ref.payoutMethodId) || 0) + Number(ref.inrAmount || 0));
    }
    return map;
  }

  function syncBankDraft(order) {
    if (!order) {
      model.bankDraftOrderId = null;
      model.bankDraft = new Map();
      model.bankDraftDirty = false;
      return;
    }
    if (model.bankDraftOrderId !== order.id || !model.bankDraftDirty) {
      model.bankDraftOrderId = order.id;
      model.bankDraft = new Map((order.allocations || []).map(item => [item.payoutMethodId, Number(item.inrAmount || 0)]));
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
    if (!bankDistributionStatuses.has(order.status)) {
      const text = order.status === 'Late Review'
        ? 'INR distribution is paused while this trade is under review.'
        : 'INR distribution unlocks automatically after the USDT deposit is confirmed.';
      return `<div class="digi-v6-info">${esc(text)}</div>`;
    }

    const methods = railMethods('BANK', true);
    const state = bankDraftState(order);
    return `<div class="digi-v6-bank-plan">
      <div class="digi-v6-plan-head"><b>Distribute INR</b><span>Partial distribution is allowed.<br>Remaining INR can stay pending.</span></div>
      <div class="digi-v6-plan-list">${methods.length ? methods.map(method => {
        const paid = state.paid.get(method.id) || 0;
        const currentPlan = Number((order.allocations || []).find(item => item.payoutMethodId === method.id)?.inrAmount || 0);
        const max = Math.max(paid, methodRemaining(method) + currentPlan);
        const value = Number(model.bankDraft.get(method.id) || 0) || '';
        return `<label class="digi-v6-plan-row">
          <div class="digi-v6-plan-copy"><b>${esc(method.bankName || method.label || 'Bank')} ••••${esc(String(method.accountNumber || '').slice(-4))}</b><small>${paid ? `Paid ${inr(paid)} · ` : ''}Available ${inr(max)}</small></div>
          <div class="digi-v6-plan-input"><span>₹</span><input type="number" inputmode="decimal" min="${paid}" max="${max}" step="0.01" value="${value}" data-bank-plan="${esc(method.id)}" placeholder="0"></div>
        </label>`;
      }).join('') : '<div class="digi-v6-empty">No enabled bank account. Enable one in Manage.</div>'}</div>
      <div class="digi-v6-plan-summary">
        <div><small>Total</small><b>${inr(state.total)}</b></div>
        <div><small>Allocated</small><b>${inr(state.planned)}</b></div>
        <div><small>Pending</small><b>${inr(state.pending)}</b></div>
      </div>
      <div class="digi-v6-plan-footer">
        <small>${state.error ? esc(state.error) : 'Enter any amount per enabled bank. The combined total can never exceed the trade total.'}</small>
        <button class="digi-v6-save" type="button" id="digiV6SaveBankPlan" ${state.error || !methods.length ? 'disabled' : ''}>Save</button>
      </div>
    </div>`;
  }

  function wireBankPlan(order, host) {
    if (!order || order.payoutType !== 'BANK' || !bankDistributionStatuses.has(order.status) || !host) return;
    host.querySelectorAll('[data-bank-plan]').forEach(input => {
      input.addEventListener('input', () => {
        const id = input.dataset.bankPlan;
        const method = model.methods.find(item => item.id === id);
        const paid = paidByMethod(order).get(id) || 0;
        const currentPlan = Number((order.allocations || []).find(item => item.payoutMethodId === id)?.inrAmount || 0);
        const max = Math.max(paid, methodRemaining(method || {}) + currentPlan);
        let value = Math.max(0, Number(input.value || 0));
        if (value > 0) value = Math.max(paid, value);
        value = Math.min(value, max);
        const others = [...model.bankDraft.entries()]
          .filter(([key]) => key !== id)
          .reduce((sum,[,amount]) => sum + Number(amount || 0), 0);
        value = Math.min(value, Math.max(paid, Number(order.inrAmount || 0) - others));
        if (value > 0) model.bankDraft.set(id, Math.round(value * 100) / 100);
        else model.bankDraft.delete(id);
        model.bankDraftDirty = true;
        renderDeposit('BANK');
      });
    });
    $('digiV6SaveBankPlan')?.addEventListener('click', async () => {
      const state = bankDraftState(order);
      if (state.error) return window.toastMsg?.(state.error, true);
      const allocations = [...model.bankDraft.entries()]
        .filter(([,amount]) => Number(amount) > 0)
        .map(([payoutMethodId,inrAmount]) => ({ payoutMethodId, inrAmount:Number(inrAmount) }));
      const button = $('digiV6SaveBankPlan');
      if (button) { button.disabled = true; button.textContent = 'Saving...'; }
      try {
        const updated = await window.__digiSaveBankAllocations?.(order.id, allocations);
        if (!updated) throw new Error('Bank distribution service is unavailable');
        model.bankDraftDirty = false;
        model.bankDraftOrderId = updated.id;
        model.bankDraft = new Map((updated.allocations || []).map(item => [item.payoutMethodId, Number(item.inrAmount || 0)]));
        window.toastMsg?.('Bank distribution saved');
      } catch (error) {
        window.toastMsg?.(error.message || 'Could not save distribution', true);
      } finally {
        renderDeposit('BANK');
      }
    });
  }

  function renderDeposit(type) {
    const host = $('digiV6Deposit');
    if (!host) return;
    const order = activeOrder(type);
    if (!order) {
      host.innerHTML = '';
      if (type === 'BANK') syncBankDraft(null);
      return;
    }
    const address = String(order.depositAddress || '').trim();
    const remaining = Math.max(0, Number(order.quoteExpiresAt || 0) - Date.now());
    host.innerHTML = `<div class="digi-v6-deposit-card">
      <div class="digi-v6-deposit-head">
        <div><h3>${type} Deposit</h3><p>${esc(order.id)} · Send exactly ${num(order.usdtAmount)} USDT on TRC20</p></div>
        <span class="status-pill ${statusClass(order.status)}">${esc(order.status)}</span>
      </div>
      <div class="digi-v6-deposit-body">
        <canvas class="digi-v6-qr" id="digiV6Qr" width="176" height="176" aria-label="TRON deposit QR"></canvas>
        <div class="digi-v6-address">
          <small>Assigned TRON USDT address</small>
          <code>${address ? esc(address) : 'Waiting for an available TRON address'}</code>
          <div class="digi-v6-address-actions">
            <button id="digiV6Copy" type="button" ${address ? '' : 'disabled'}>Copy</button>
            <button id="digiV6Timeline" type="button">Timeline</button>
          </div>
        </div>
      </div>
      ${address ? '' : '<div class="digi-v6-warning">No free receiving address is assigned yet. The server will use the next enabled free TRON address. Addresses already reserved or in safety cooldown cannot be reused.</div>'}
      <div class="digi-v6-deposit-meta">
        <div><small>Expected</small><b>${num(order.usdtAmount)} USDT</b></div>
        <div><small>Received</small><b>${order.receivedUsdt == null ? '—' : `${num(order.receivedUsdt)} USDT`}</b></div>
        <div><small>${remaining && order.status === 'Awaiting Deposit' ? 'Deposit time' : 'Confirmations'}</small><b>${remaining && order.status === 'Awaiting Deposit' ? `${Math.ceil(remaining/60000)} min` : `${esc(order.confirmations)} / ${esc(order.requiredConfirmations)}`}</b></div>
      </div>
      ${type === 'BANK' ? renderBankPlan(order) : ''}
    </div>`;

    $('digiV6Copy')?.addEventListener('click', () => address && window.copyAddress?.(address));
    $('digiV6Timeline')?.addEventListener('click', () => window.openOrder?.(order.id));
    const canvas = $('digiV6Qr');
    if (canvas && address && window.digiQr?.render) {
      try { window.digiQr.render(canvas, address); } catch {}
    }
    if (type === 'BANK') wireBankPlan(order, host);
  }

  function renderTrades(type) {
    const host = $('digiV6Trades');
    if (!host) return;
    const rows = matchingOrders(type).slice(0,3);
    $('digiV6TradesTitle').textContent = type === 'UPI' ? 'Recent UPI Trades' : 'Recent Bank Trades';
    host.innerHTML = rows.length ? rows.map(tradeRow).join('') : `<div class="digi-v6-empty">No ${type} trades yet.</div>`;
    wireOrderRows(host);
  }

  function renderTrade(type) {
    const normalized = type === 'BANK' ? 'BANK' : 'UPI';
    ensureTradeRoot();
    if (!$('digiTradeRoot')) return;
    $('digiV6Kicker').textContent = normalized === 'UPI' ? 'UPI TRADING' : 'BANK TRADING';
    $('digiV6Title').textContent = normalized === 'UPI' ? 'Sell USDT via UPI' : 'Sell USDT via Bank';
    $('digiV6IntroCopy').textContent = normalized === 'UPI'
      ? 'Create a TRC20 deposit. INR is routed automatically to your enabled UPI IDs.'
      : 'Create a TRC20 deposit. After USDT confirmation, split INR across enabled banks and leave any remainder pending.';
    $('digiV6RailHeading').textContent = normalized === 'UPI' ? 'UPI routing' : 'Bank payout accounts';
    renderStats(normalized);
    renderRailControl(normalized);
    renderCreateAction(normalized);
    renderDeposit(normalized);
    renderTrades(normalized);
  }

  function openRailManager(type = null) {
    const normalized = ['UPI','BANK'].includes(String(type || '').toUpperCase()) ? String(type).toUpperCase() : '';
    baseOpenManage?.(normalized || null);
    const overlay = $('manageOv');
    if (overlay) overlay.dataset.filterType = normalized;
    renderManagerOverlay(normalized);
  }

  function renderManagerOverlay(type = null) {
    const overlay = $('manageOv');
    const node = $('manageList');
    if (!overlay || !node) return;
    const filter = ['UPI','BANK'].includes(String(type || overlay.dataset.filterType || '').toUpperCase())
      ? String(type || overlay.dataset.filterType).toUpperCase() : '';
    overlay.dataset.filterType = filter;
    const heading = overlay.querySelector('h3');
    if (heading) heading.textContent = filter === 'UPI' ? 'Manage UPI IDs' : filter === 'BANK' ? 'Manage Bank Accounts' : 'Manage Bank & UPI';

    const methods = filter ? railMethods(filter,false) : model.methods;
    node.innerHTML = methods.length ? methods.map(method => {
      const detail = method.type === 'UPI'
        ? method.upiId
        : `•••• ${String(method.accountNumber || '').slice(-4)} · ${method.ifsc || ''}`;
      return `<div class="manage-method">
        <div class="manage-top">
          <div class="manage-copy"><b>${esc(method.type === 'UPI' ? method.upiId || 'UPI ID' : method.bankName || method.label || 'Bank')}</b><small>${esc(detail)}</small></div>
          <button class="toggle digi-v6-manager-toggle ${method.enabled ? 'on' : ''}" type="button" data-manager-toggle="${esc(method.id)}" aria-label="${method.enabled ? 'Disable' : 'Enable'}"></button>
        </div>
        <div class="capacity-row"><span>${inr(method.minInr)}–${inr(method.maxInr)} per trade</span><b>${inr(method.remainingDailyInr ?? method.dailyLimitInr)} available today</b></div>
        <div class="manage-footer">
          <button class="ghost-btn" type="button" data-manager-limits="${esc(method.id)}">Edit limits</button>
          <button class="ghost-btn" type="button" data-manager-edit="${esc(method.id)}">Edit details</button>
          <button class="more-btn" type="button" data-manager-delete="${esc(method.id)}">Delete</button>
        </div>
      </div>`;
    }).join('') : `<div class="digi-empty">No ${filter === 'UPI' ? 'UPI IDs' : filter === 'BANK' ? 'bank accounts' : 'payout methods'} saved.</div>`;

    node.querySelectorAll('[data-manager-toggle]').forEach(button => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        await window.toggleMethod?.(button.dataset.managerToggle);
        renderManagerOverlay(filter);
      });
    });
    node.querySelectorAll('[data-manager-limits]').forEach(button => button.addEventListener('click', () => window.editLimits?.(button.dataset.managerLimits)));
    node.querySelectorAll('[data-manager-edit]').forEach(button => button.addEventListener('click', () => window.editMethod?.(button.dataset.managerEdit)));
    node.querySelectorAll('[data-manager-delete]').forEach(button => button.addEventListener('click', () => window.askDelete?.(button.dataset.managerDelete)));

    const addButton = [...overlay.querySelectorAll('button')].find(button => /^\s*\+?\s*add\b/i.test(button.textContent || ''));
    if (addButton && filter) {
      const cleanAdd = addButton.cloneNode(true);
      cleanAdd.removeAttribute('onclick');
      cleanAdd.textContent = filter === 'UPI' ? '+ Add UPI' : '+ Add Bank';
      addButton.replaceWith(cleanAdd);
      cleanAdd.addEventListener('click', () => {
        overlay.classList.remove('show');
        window.openAdd?.(filter);
      });
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
    root.innerHTML = `<button class="digi-history-back" id="digiHistoryBack" type="button">‹ Back to Profile</button>
      <div class="digi-history-filters">${filters.map(filter => `<button data-history-filter="${filter}" class="${model.historyFilter === filter ? 'active' : ''}" type="button">${filter === 'BANK' ? 'Bank' : filter}</button>`).join('')}</div>
      <div class="digi-v6-trade-list">${rows.length ? rows.map(tradeRow).join('') : '<div class="digi-v6-empty">No trades match this filter.</div>'}</div>`;
    $('digiHistoryBack')?.addEventListener('click', () => routeGo('profile'));
    root.querySelectorAll('[data-history-filter]').forEach(button => button.addEventListener('click', () => {
      model.historyFilter = button.dataset.historyFilter;
      renderHistory();
    }));
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
    if (model.route === 'upi') return renderTrade('UPI');
    if (model.route === 'bank') return renderTrade('BANK');
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
      ensureTradeRoot();
      setNavActive(page);
      setHeader(page === 'upi' ? 'UPI' : 'Bank', page === 'upi' ? 'UPI trading and deposit.' : 'Bank trading, deposit and INR distribution.');
      renderTrade(page === 'bank' ? 'BANK' : 'UPI');
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
    document.body.classList.remove('digi-layout-v3','digi-layout-v4','digi-layout-v5');
    document.body.classList.add('digi-layout-v6');
    const ua = String(navigator.userAgent || '');
    document.body.classList.toggle('digi-legacy-insets', /digiRupee\/(?!1\.0\.4(?:\s|$))/i.test(ua));
    configureNav();
    ensureTradeRoot();
    customizeHome();
    enhanceProfile();

    window.openManage = openRailManager;
    window.__digiAfterSellRender = syncRoute;

    window.addEventListener('digirupee:state', event => {
      currentData(event.detail || {});
      customizeHome();
      enhanceProfile();
      const overlay = $('manageOv');
      if (overlay?.classList.contains('show')) renderManagerOverlay(overlay.dataset.filterType || '');
      if (!model.bankDraftDirty) {
        const order = activeOrder('BANK');
        if (order) syncBankDraft(order);
      }
      syncRoute();
    });

    routeGo('home');
  }

  window.go = routeGo;
  window.__digiLayoutV6 = {
    go:routeGo,
    renderTrade,
    renderDeposit,
    renderHistory,
    openRailManager,
    railMetrics
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();