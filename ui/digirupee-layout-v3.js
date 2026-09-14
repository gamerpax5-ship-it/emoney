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
  const baseLockQuote = typeof window.lockQuote === 'function' ? window.lockQuote.bind(window) : null;

  const model = {
    user:null,
    profile:null,
    rates:null,
    methods:[],
    orders:[],
    route:'home',
    historyFilter:'All'
  };

  const activeStatuses = new Set(['Awaiting Deposit','Detected','Confirming','USDT Confirmed','INR Processing','Late Review']);

  function injectStyles() {
    if (document.getElementById('digirupee-layout-v3-css')) return;
    const style = document.createElement('style');
    style.id = 'digirupee-layout-v3-css';
    style.textContent = `
      html,body{height:100%;min-height:100%;overflow:hidden;background:#000!important}
      body.digi-layout-v3{margin:0!important;padding:0!important}
      body.digi-layout-v3.digi-legacy-insets .app{padding-top:24px!important;box-sizing:border-box!important}
      body.digi-layout-v3 .app{
        width:min(430px,100%)!important;
        height:100%!important;
        min-height:0!important;
        max-height:100%!important;
        grid-template-rows:auto minmax(0,1fr) var(--nav)!important;
        overflow:hidden!important;
        margin:0 auto!important;
      }
      body.digi-layout-v3 .statusbar{display:none!important}
      body.digi-layout-v3 .header{
        grid-row:1!important;
        padding:14px 15px 11px!important;
        min-height:74px!important;
        box-sizing:border-box!important;
        background:#050607!important;
      }
      body.digi-layout-v3 .header-copy{min-width:0;padding-top:1px}
      body.digi-layout-v3 .header-copy h1{font-size:26px!important;line-height:1.02!important}
      body.digi-layout-v3 .header-copy p{font-size:11px!important;line-height:1.35!important;white-space:normal!important}
      body.digi-layout-v3 .page{grid-row:2!important;padding:0 15px 18px!important;min-height:0!important}
      body.digi-layout-v3 .app>.nav{
        grid-row:3!important;
        position:static!important;
        left:auto!important;right:auto!important;bottom:auto!important;
        width:100%!important;
        height:var(--nav)!important;
        padding:6px 8px 7px!important;
        box-sizing:border-box!important;
      }
      body.digi-layout-v3 .app>.nav button{min-width:0!important}
      body.digi-layout-v3 .app>.nav .nav-icon{width:31px!important;height:31px!important}
      body.digi-layout-v3 .app>.nav .nav-icon svg{width:27px!important;height:27px!important}
      body.digi-layout-v3 .nav-upi svg,body.digi-layout-v3 .nav-bank svg{display:block}
      body.digi-layout-v3 #sell .compact-segment{display:none!important}
      body.digi-layout-v3 #sell .sell-intro{padding-top:1px!important}
      body.digi-layout-v3 #activeSell{display:none!important}
      body.digi-layout-v3 .digi-channel-active{margin-top:14px}
      body.digi-layout-v3 .digi-channel-active .digi-live-card,
      body.digi-layout-v3 .digi-channel-trades .digi-trade-row,
      body.digi-layout-v3 .digi-history-root .digi-trade-row{
        border:1px solid #282c34;
        background:#0d0f12;
        border-radius:13px;
        color:#fff;
      }
      .digi-live-card{padding:13px}
      .digi-live-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .digi-live-head h3{margin:0;font-size:13px}
      .digi-live-head p{margin:4px 0 0;color:#8f959e;font-size:9.5px;line-height:1.4}
      .digi-live-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px}
      .digi-live-grid>div{padding:9px;border-radius:10px;background:#111419;border:1px solid #242932;min-width:0}
      .digi-live-grid small{display:block;color:#7f858e;font-size:8.5px}
      .digi-live-grid b{display:block;margin-top:3px;font-size:10.5px;overflow-wrap:anywhere}
      .digi-address-box{margin-top:9px;padding:9px;border-radius:10px;background:#111419;border:1px solid #242932}
      .digi-address-box small{display:block;color:#7f858e;font-size:8.5px}
      .digi-address-box code{display:block;margin-top:4px;color:#f1d36f;font-size:9px;word-break:break-all;white-space:normal}
      .digi-channel-trades{margin-top:18px;padding-top:15px;border-top:1px solid #1d2229}
      .digi-channel-head,.digi-history-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:9px}
      .digi-channel-head h2,.digi-history-head h2{margin:0;font-size:16px}
      .digi-channel-head span,.digi-history-head p{margin:0;color:#7f858e;font-size:9.5px}
      .digi-trade-list{display:flex;flex-direction:column;gap:7px}
      .digi-trade-row{width:100%;padding:11px!important;display:block;text-align:left;border:0;color:inherit}
      .digi-trade-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .digi-rail-pill{display:inline-flex;align-items:center;min-height:21px;padding:3px 7px;border-radius:999px;background:#171b21;border:1px solid #30353e;color:#e7ca67;font-size:8.5px;font-weight:850}
      .digi-trade-amounts{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:8px}
      .digi-trade-amounts b{font-size:13px}.digi-trade-amounts strong{font-size:12px;color:#f0cc61}
      .digi-trade-meta{display:block;margin-top:4px;color:#8c929b;font-size:9px;line-height:1.45;white-space:normal;overflow-wrap:anywhere}
      .digi-empty-state{padding:22px 14px;text-align:center;border:1px solid #252a31;border-radius:13px;background:#0b0d10;color:#858b93;font-size:10px}
      #orders.digi-history-mode>*:not(.digi-history-root){display:none!important}
      .digi-history-root{padding-bottom:8px}
      .digi-history-back{border:0;background:none;color:#e5c65f;font-size:10px;padding:4px 0 10px}
      .digi-history-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0 12px}
      .digi-history-stat{padding:10px;border:1px solid #282c34;border-radius:12px;background:#0d0f12;text-align:center}
      .digi-history-stat small{display:block;color:#858b93;font-size:8px}.digi-history-stat b{display:block;margin-top:3px;font-size:11px}
      .digi-history-filters{display:flex;gap:6px;overflow-x:auto;padding-bottom:9px;scrollbar-width:none}
      .digi-history-filters::-webkit-scrollbar{display:none}
      .digi-history-filters button{flex:0 0 auto;min-height:32px;padding:0 10px;border:1px solid #292e36;border-radius:999px;background:#101318;color:#9ba0a8;font-size:9px}
      .digi-history-filters button.active{background:#2b2413;border-color:#6b5924;color:#f0ce65}
      #profile .digi-profile-history{margin:8px 0 16px}
      #profile .digi-profile-history .menu-row{cursor:pointer}
      #profile .profile-method-row{grid-template-columns:minmax(0,1fr) 46px!important;gap:10px!important;align-items:center!important}
      #profile .profile-method-copy{min-width:0!important}
      #profile .profile-method-copy b,#profile .profile-method-copy small,#profile .profile-method-copy span{white-space:normal!important;overflow-wrap:anywhere!important}
      #profile .profile-method-copy span{line-height:1.35!important}
      #profile .avatar-pro{font-size:15px!important;font-weight:900!important}
      #profile .profile-badges{display:flex!important;gap:6px!important;flex-wrap:wrap!important}
      #profile .profile-badges span{white-space:normal!important}
      @media(max-width:370px){
        body.digi-layout-v3 .header{padding-left:13px!important;padding-right:13px!important}
        body.digi-layout-v3 .page{padding-left:13px!important;padding-right:13px!important}
        .digi-live-grid{grid-template-columns:1fr}
        .digi-history-summary{grid-template-columns:1fr 1fr}
        .digi-history-summary .digi-history-stat:last-child{grid-column:1/-1}
      }
    `;
    document.head.appendChild(style);
  }

  function currentData(eventDetail = null) {
    if (!eventDetail) return;
    model.user = eventDetail.user || null;
    model.profile = eventDetail.profile || null;
    model.rates = eventDetail.rates || null;
    model.methods = Array.isArray(eventDetail.methods) ? eventDetail.methods : [];
    model.orders = Array.isArray(eventDetail.orders) ? eventDetail.orders : [];
  }

  function initials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'DR';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words.at(-1)?.[0] || ''}`.toUpperCase();
  }

  function setHeader(title, subtitle) {
    const titleNode = $('pageTitle');
    const subNode = $('pageSub');
    if (titleNode) titleNode.textContent = title;
    if (subNode) subNode.textContent = subtitle;
  }

  function setNavActive(route) {
    document.querySelectorAll('.app>.nav button').forEach(button => {
      button.classList.toggle('active', button.dataset.page === route);
    });
  }

  function configureNav() {
    const buttons = [...document.querySelectorAll('.app>.nav button')];
    if (buttons.length !== 5) throw new Error(`Expected 5 bottom navigation buttons, found ${buttons.length}`);

    buttons[0].dataset.page = 'home';
    buttons[0].setAttribute('onclick', "go('home')");

    buttons[1].dataset.page = 'upi';
    buttons[1].setAttribute('onclick', "go('upi')");
    buttons[1].innerHTML = `<span class="nav-icon nav-upi"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="10" fill="#138A67"/><text x="16" y="19" text-anchor="middle" fill="#fff" font-size="10" font-weight="900" font-family="Arial">UPI</text><path d="M22 7l4 4-4 4" fill="none" stroke="#FFD45A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>UPI</span>`;

    buttons[2].dataset.page = 'bank';
    buttons[2].setAttribute('onclick', "go('bank')");
    buttons[2].innerHTML = `<span class="nav-icon nav-bank"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="10" fill="#2457D6"/><path d="M7 14h18M9 14v9m4-9v9m6-9v9m4-9v9M6 25h20M16 7l10 5H6z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Bank</span>`;

    buttons[3].dataset.page = 'rewards';
    buttons[3].setAttribute('onclick', "go('rewards')");
    const rewardLabel = buttons[3].querySelector('[data-nav]');
    if (rewardLabel) rewardLabel.textContent = 'Rewards';

    buttons[4].dataset.page = 'profile';
    buttons[4].setAttribute('onclick', "go('profile')");
    const profileLabel = buttons[4].querySelector('[data-nav]');
    if (profileLabel) profileLabel.textContent = 'Profile';
  }

  function destination(order) {
    const methods = Array.isArray(order?.payoutMethods) ? order.payoutMethods : [];
    if (String(order?.payoutType).toUpperCase() === 'UPI') {
      const method = methods[0] || model.methods.find(item => item.id === order?.payoutMethodId);
      return method?.upiId || 'UPI payout';
    }
    if (methods.length) {
      return methods.map(method => `${method.bankName || 'Bank'} ${method.accountNumber || ''}`.trim()).join(', ');
    }
    const ids = (order?.allocations || []).map(item => item.payoutMethodId);
    const found = ids.map(id => model.methods.find(method => method.id === id)).filter(Boolean);
    return found.length
      ? found.map(method => `${method.bankName || method.label || 'Bank'} ••••${String(method.accountNumber || '').slice(-4)}`).join(', ')
      : 'Bank payout';
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
    host?.querySelectorAll('[data-order-id]').forEach(button => {
      button.addEventListener('click', () => window.openOrder?.(button.dataset.orderId));
    });
  }

  function matchingOrders(type) {
    const normalized = String(type).toUpperCase();
    return [...model.orders]
      .filter(order => String(order.payoutType || '').toUpperCase() === normalized)
      .sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  function channelActive(type) {
    return matchingOrders(type).find(order => activeStatuses.has(order.status)) || null;
  }

  function renderChannelActive(type) {
    const host = document.querySelector('#sell .digi-channel-active');
    if (!host) return;
    const order = channelActive(type);
    if (!order) {
      host.innerHTML = '';
      return;
    }
    const remaining = Math.max(0, Number(order.quoteExpiresAt || 0) - Date.now());
    host.innerHTML = `<div class="digi-live-card">
      <div class="digi-live-head"><div><h3>${order.status === 'Awaiting Deposit' ? 'Send USDT to assigned address' : `Trade ${esc(order.status)}`}</h3><p>${esc(order.id)} · ${num(order.usdtAmount)} USDT → ${inr(order.inrAmount)}</p></div><span class="status-pill ${statusClass(order.status)}">${esc(order.status)}</span></div>
      <div class="digi-live-grid"><div><small>Confirmations</small><b>${esc(order.confirmations)} / ${esc(order.requiredConfirmations)}</b></div><div><small>Received</small><b>${order.receivedUsdt === null || order.receivedUsdt === undefined ? '—' : `${num(order.receivedUsdt)} USDT`}</b></div></div>
      <div class="digi-address-box"><small>${order.status === 'Awaiting Deposit' && remaining ? `Quote expires in ${Math.ceil(remaining / 60000)} min · ` : ''}TRON deposit address</small><code>${esc(order.depositAddress || '—')}</code><div class="digi-action-row"><button class="ghost-btn" type="button" data-copy-address="${esc(order.depositAddress || '')}">Copy address</button><button class="ghost-btn" type="button" data-open-active="${esc(order.id)}">View timeline</button></div></div>
    </div>`;
    host.querySelector('[data-copy-address]')?.addEventListener('click', () => window.copyAddress?.(order.depositAddress || ''));
    host.querySelector('[data-open-active]')?.addEventListener('click', () => window.openOrder?.(order.id));
  }

  function renderChannelTrades(type) {
    const host = document.getElementById('digiChannelTradesList');
    const count = document.getElementById('digiChannelTradeCount');
    const total = document.getElementById('digiChannelSettled');
    if (!host) return;
    const rows = matchingOrders(type);
    const completed = rows.filter(order => order.status === 'Completed');
    if (count) count.textContent = `${rows.length} trade${rows.length === 1 ? '' : 's'}`;
    if (total) total.textContent = `${inr(completed.reduce((sum, order) => sum + Number(order.inrAmount || 0), 0))} settled`;
    host.innerHTML = rows.length ? rows.map(tradeRow).join('') : `<div class="digi-empty-state">No ${String(type).toUpperCase()} trades yet.<br>Your first completed or active trade will appear here.</div>`;
    wireOrderRows(host);
  }

  function ensureSellExtensions() {
    const sell = $('sell');
    if (!sell) return;
    if (!sell.querySelector('.digi-channel-active')) {
      const active = document.createElement('section');
      active.className = 'digi-channel-active';
      const quote = $('liveQuote');
      quote?.insertAdjacentElement('afterend', active);
    }
    if (!$('digiChannelTrades')) {
      const section = document.createElement('section');
      section.className = 'digi-channel-trades';
      section.id = 'digiChannelTrades';
      section.innerHTML = `<div class="digi-channel-head"><div><h2 id="digiChannelTradesTitle">UPI Trades</h2><span id="digiChannelTradeCount">0 trades</span></div><span id="digiChannelSettled">₹0 settled</span></div><div class="digi-trade-list" id="digiChannelTradesList"></div>`;
      sell.appendChild(section);
    }
  }

  function customizeSell(type) {
    const normalized = String(type).toUpperCase() === 'BANK' ? 'BANK' : 'UPI';
    const intro = document.querySelector('#sell .sell-intro');
    if (intro) {
      const kicker = intro.querySelector('.utility-kicker');
      const title = intro.querySelector('h2');
      const copy = intro.querySelector('p');
      const ratePill = intro.querySelector('.rate-pill');
      if (kicker) kicker.textContent = normalized === 'UPI' ? 'UPI TRADING' : 'BANK TRADING';
      if (title) title.textContent = normalized === 'UPI' ? 'Sell USDT via UPI' : 'Sell USDT via Bank Account';
      if (copy) copy.textContent = normalized === 'UPI' ? 'Receive INR directly to your enabled UPI ID.' : 'Receive INR to your enabled bank account with server-validated allocation.';
      const rate = model.rates?.rates?.[normalized.toLowerCase()];
      if (ratePill) ratePill.innerHTML = `<small>${normalized} rate</small><b>${rate !== undefined ? inr(rate) : '—'}</b><span>Live server rate</span>`;
    }
    const title = $('digiChannelTradesTitle');
    if (title) title.textContent = normalized === 'UPI' ? 'UPI Trades' : 'Bank Trades';
    renderChannelActive(normalized);
    renderChannelTrades(normalized);
  }

  function historyRows() {
    const filter = model.historyFilter;
    return [...model.orders].filter(order => {
      if (filter === 'UPI' || filter === 'BANK') return String(order.payoutType || '').toUpperCase() === filter;
      if (filter === 'Active') return activeStatuses.has(order.status);
      if (filter === 'Completed') return order.status === 'Completed';
      return true;
    }).sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  function renderHistory() {
    const page = $('orders');
    if (!page) return;
    page.classList.add('digi-history-mode');
    let root = page.querySelector('.digi-history-root');
    if (!root) {
      root = document.createElement('div');
      root.className = 'digi-history-root';
      page.appendChild(root);
    }
    const all = model.orders.length;
    const completed = model.orders.filter(order => order.status === 'Completed');
    const active = model.orders.filter(order => activeStatuses.has(order.status));
    const completedUsdt = completed.reduce((sum, order) => sum + Number(order.usdtAmount || 0), 0);
    const filters = ['All','UPI','BANK','Active','Completed'];
    const rows = historyRows();
    root.innerHTML = `<button class="digi-history-back" type="button" id="digiHistoryBack">‹ Back to Profile</button>
      <div class="digi-history-head"><div><h2>Trade History</h2><p>All UPI and Bank USDT → INR trades.</p></div></div>
      <div class="digi-history-summary"><div class="digi-history-stat"><small>Total trades</small><b>${all}</b></div><div class="digi-history-stat"><small>Active</small><b>${active.length}</b></div><div class="digi-history-stat"><small>Completed volume</small><b>${num(completedUsdt)} USDT</b></div></div>
      <div class="digi-history-filters">${filters.map(filter => `<button type="button" data-history-filter="${filter}" class="${model.historyFilter === filter ? 'active' : ''}">${filter === 'BANK' ? 'Bank' : filter}</button>`).join('')}</div>
      <div class="digi-trade-list" id="digiHistoryList">${rows.length ? rows.map(tradeRow).join('') : '<div class="digi-empty-state">No trades match this filter.</div>'}</div>`;
    root.querySelector('#digiHistoryBack')?.addEventListener('click', () => routeGo('profile'));
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
    const payoutHeading = headings.find(node => /payout methods/i.test(node.textContent || ''));
    if (payoutHeading) payoutHeading.textContent = 'Add Bank Account & UPI';

    const accountHeading = headings.find(node => /account\s*&\s*security/i.test(node.textContent || ''));
    if (accountHeading && !$('digiProfileHistory')) {
      const card = document.createElement('div');
      card.id = 'digiProfileHistory';
      card.className = 'card menu digi-profile-history';
      card.innerHTML = `<div class="menu-row" id="digiOpenHistory"><div class="icon ib"><svg class="ico" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/><path d="m16 16 4 2-4 2"/></svg></div><div><b>Trade History</b><small>UPI & Bank trades, USDT, INR and status</small></div><span class="menu-right">›</span></div>`;
      accountHeading.closest('.section')?.insertAdjacentElement('beforebegin', card);
      card.querySelector('#digiOpenHistory')?.addEventListener('click', () => routeGo('history'));
    }

    const name = model.profile?.fullName || model.user?.fullName || 'Account';
    const status = String(model.profile?.accountStatus || model.user?.accountStatus || 'active').toLowerCase();
    const nameNode = $('profileNameHero');
    if (nameNode) nameNode.textContent = name;
    const avatar = profile.querySelector('.avatar-pro');
    if (avatar) avatar.textContent = initials(name);
    const verified = profile.querySelector('.verified-dot');
    if (verified) verified.textContent = status === 'active' ? 'Active' : status.charAt(0).toUpperCase() + status.slice(1);
    const badges = profile.querySelector('.profile-badges');
    if (badges) {
      const joined = model.profile?.joinedAt || model.user?.joinedAt;
      badges.innerHTML = `<span>${status === 'active' ? 'Active account' : esc(status)}</span>${joined ? `<span>Member since ${esc(new Date(joined).toLocaleDateString('en-IN',{month:'short',year:'numeric'}))}</span>` : ''}`;
    }
  }

  function customizeHome() {
    const quick = [...document.querySelectorAll('#home .quick-grid .quick')];
    if (quick[0]) {
      quick[0].setAttribute('onclick', "go('upi')");
      const b = quick[0].querySelector('b'); const small = quick[0].querySelector('small');
      if (b) b.textContent = 'UPI Trade'; if (small) small.textContent = 'Sell USDT via UPI';
    }
    if (quick[2]) {
      quick[2].setAttribute('onclick', "go('bank')");
      const b = quick[2].querySelector('b'); const small = quick[2].querySelector('small');
      if (b) b.textContent = 'Bank Trade'; if (small) small.textContent = 'Sell USDT via Bank';
    }
    const sections = [...document.querySelectorAll('#home .section')];
    const recent = sections.find(section => /recent orders/i.test(section.textContent || ''));
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
      setHeader(page === 'upi' ? 'UPI' : 'Bank', page === 'upi' ? 'Sell USDT and receive INR to UPI.' : 'Sell USDT and receive INR to bank account.');
      customizeSell(page === 'bank' ? 'BANK' : 'UPI');
      if ($('sell')) $('sell').scrollTop = 0;
      return;
    }

    if (page === 'history') {
      baseGo('orders');
      setNavActive('profile');
      setHeader('Trade History', 'All UPI and Bank trading activity.');
      renderHistory();
      if ($('orders')) $('orders').scrollTop = 0;
      return;
    }

    baseGo(page);
    setNavActive(page);
    if (page === 'home') setHeader('Home', 'Trade, earn rewards and track your account.');
    if (page === 'rewards') setHeader('Rewards', 'Spin, complete tasks & earn USDT.');
    if (page === 'profile') {
      setHeader('Profile', 'Account, bank/UPI and security.');
      enhanceProfile();
    }
  }

  function install() {
    injectStyles();
    if (typeof window.__digiStateSnapshot === 'function') currentData(window.__digiStateSnapshot());
    document.body.classList.add('digi-layout-v3');
    const ua = String(navigator.userAgent || '');
    document.body.classList.toggle('digi-legacy-insets', /digiRupee\/(?!1\.0\.4(?:\s|$))/i.test(ua));
    configureNav();
    ensureSellExtensions();
    customizeHome();
    enhanceProfile();

    window.addEventListener('digirupee:state', event => {
      currentData(event.detail || {});
      customizeHome();
      enhanceProfile();
      syncRoute();
    });

    if (baseLockQuote) {
      window.lockQuote = async (...args) => {
        const result = await baseLockQuote(...args);
        setTimeout(syncRoute, 80);
        return result;
      };
    }

    routeGo('home');
    setInterval(() => {
      if (model.route === 'upi') renderChannelActive('UPI');
      if (model.route === 'bank') renderChannelActive('BANK');
    }, 1000);
  }

  window.go = routeGo;
  window.__digiLayoutV3 = { go:routeGo, renderHistory, customizeSell, enhanceProfile };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
