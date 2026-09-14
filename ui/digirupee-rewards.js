(() => {
  'use strict';

  const assets = window.__DIGIRUPEE_REWARD_ASSETS || {};
  if (!assets.content || !assets.nav || !assets.wheel) return;

  const FULL_H = 1672;
  const CUT = 1510;
  const YS = FULL_H / CUT;
  const model = { rewards: null, wheel: null, campaigns: [] };
  let spinning = false;
  let rotation = 0;
  let refreshTimer = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[ch]));
  const num = value => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 6 });
  const pctY = value => `${(Number(value) * YS).toFixed(4)}%`;

  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type':'application/json' } : {}), ...(options.headers || {}) };
    const response = await fetch(`/api/digirupee${path}`, { ...options, headers, credentials:'include' });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
    return payload || {};
  }

  function idempotencyKey() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function toast(message) {
    if (typeof window.toastMsg === 'function') return window.toastMsg(message);
    let node = document.getElementById('rewardV24Toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'rewardV24Toast';
      node.className = 'reward-v24-toast';
      document.querySelector('.app')?.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(node._timer);
    node._timer = setTimeout(() => node.classList.remove('show'), 1900);
  }

  function injectProductionStyles() {
    if (document.getElementById('digi-approved-reward-css')) return;
    const style = document.createElement('style');
    style.id = 'digi-approved-reward-css';
    style.textContent = `
      .digi-reward-live{position:absolute;z-index:28;box-sizing:border-box;line-height:1.2;color:#fff;font-family:Inter,system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
      .digi-reward-wallet{left:64.3%;top:${pctY(21.2)};width:28.3%;height:${pctY(7.4)};padding:12px 14px;border:1px solid rgba(247,194,73,.42);border-radius:18px;background:linear-gradient(145deg,rgba(64,35,14,.98),rgba(24,18,15,.99));box-shadow:0 10px 26px rgba(0,0,0,.34)}
      .digi-reward-wallet small{display:block;color:#c8c3bc;font-size:9px}.digi-reward-wallet b{display:block;margin-top:5px;color:#ffd75d;font-size:18px;white-space:nowrap}.digi-reward-wallet span{display:block;margin-top:4px;color:#a9a39c;font-size:8px}
      .digi-reward-news{left:4.2%;top:${pctY(29.5)};width:91.5%;min-height:${pctY(3.2)};padding:8px 13px;border:1px solid rgba(209,44,46,.5);border-radius:15px;background:linear-gradient(90deg,rgba(63,9,11,.99),rgba(16,17,20,.99));display:flex;align-items:center;gap:10px;overflow:hidden}
      .digi-reward-news strong{color:#ffd75d;font-size:9px;white-space:nowrap}.digi-reward-news i{width:1px;height:20px;background:#56422c;flex:0 0 auto}.digi-reward-news span{min-width:0;color:#eee;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.digi-reward-news em{margin-left:auto;color:#9d9892;font-size:8px;font-style:normal;white-space:nowrap}
      .digi-reward-spin{left:57.8%;top:${pctY(46.1)};width:34.8%;min-height:${pctY(10.6)};padding:12px;border:1px solid #30333a;border-radius:18px;background:linear-gradient(155deg,rgba(24,25,29,.995),rgba(10,11,13,.995));box-shadow:0 10px 28px rgba(0,0,0,.38)}
      .digi-reward-spin small{display:block;color:#a8a39c;font-size:8.5px}.digi-reward-spin b{display:block;margin-top:4px;color:#fff;font-size:12px}.digi-reward-spin button{width:100%;min-height:38px;margin-top:10px;border:0;border-radius:999px;background:linear-gradient(90deg,#ffe57b,#eeb337);color:#1c1406;font-size:11px;font-weight:900}.digi-reward-spin button:disabled{background:#887333;color:#1d180b;opacity:.76}
      .digi-reward-taskbox{left:3.8%;right:3.8%;top:${pctY(74.2)};bottom:1.2%;padding:12px 13px;border:1px solid #292c32;border-radius:18px;background:linear-gradient(180deg,rgba(8,9,11,.995),rgba(4,5,6,.995));overflow:hidden}
      .digi-reward-taskhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.digi-reward-taskhead b{color:#efc34e;font-size:13px}.digi-reward-taskhead button{border:0;background:none;color:#a8a39c;font-size:9px}
      .digi-reward-taskrow{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px;border:1px solid #292c32;border-radius:14px;background:#101216}
      .digi-reward-taskicon{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:#17191e;color:#e9c858;font-size:18px}.digi-reward-taskcopy b{display:block;color:#f3f1ed;font-size:10.5px}.digi-reward-taskcopy small{display:block;color:#969ba3;font-size:8px;line-height:1.35;margin-top:3px}.digi-reward-taskreward{color:#ffd75d;font-size:9px;font-weight:900;white-space:nowrap}.digi-reward-taskaction{grid-column:2/4;min-height:32px;border:1px solid #5c4b1b;border-radius:10px;background:#19160d;color:#e7c95e;font-size:9px;font-weight:800}.digi-reward-taskaction:disabled{color:#7f8389;border-color:#30333a;background:#121418}
      .reward-v24-more .digi-server-task{cursor:default}
      @media(max-width:370px){.digi-reward-wallet{padding:9px 10px}.digi-reward-wallet b{font-size:15px}.digi-reward-spin{padding:9px}.digi-reward-spin button{min-height:34px}.digi-reward-taskbox{padding:9px}.digi-reward-taskrow{grid-template-columns:36px minmax(0,1fr) auto;padding:8px;gap:8px}.digi-reward-taskicon{width:36px;height:36px}}
    `;
    document.head.appendChild(style);
  }

  function activeTasks() {
    return (model.campaigns || []).flatMap(campaign => (campaign.tasks || []).map(task => ({ ...task, campaignId: campaign.id, campaignTitle: campaign.title }))).filter(task => task.enabled !== false);
  }

  function buildDynamicLayers(visual) {
    const wallet = document.createElement('div'); wallet.id = 'digiRewardWallet'; wallet.className = 'digi-reward-live digi-reward-wallet'; visual.appendChild(wallet);
    const news = document.createElement('div'); news.id = 'digiRewardNews'; news.className = 'digi-reward-live digi-reward-news'; visual.appendChild(news);
    const spin = document.createElement('div'); spin.id = 'digiRewardSpin'; spin.className = 'digi-reward-live digi-reward-spin'; visual.appendChild(spin);
    const tasks = document.createElement('div'); tasks.id = 'digiRewardTaskBox'; tasks.className = 'digi-reward-live digi-reward-taskbox'; visual.appendChild(tasks);
  }

  function hitAction(nx, ny) {
    const rects = [
      ['notify',84.5,3.6,10,5], ['explore',7,24,26,4.2], ['wallet',64.3,21.2,28.3,7.4], ['news',4.2,29.5,91.5,3.2],
      ['spin',58.2,50,32.4,5.4], ['more',77.8,58,16,3], ['new',5,61.3,18.7,12.7], ['invite',25.8,61.3,18.7,12.7],
      ['tasks',46.8,61.3,18.7,12.7], ['events',68.1,61.3,18.7,12.7], ['view',79.1,74,14,3], ['check',73.7,78,18,4]
    ];
    for (const rect of rects) {
      const y = rect[2] * YS, h = rect[4] * YS;
      if (nx >= rect[1] && nx <= rect[1] + rect[3] && ny >= y && ny <= y + h) return rect[0];
    }
    return '';
  }

  function act(action) {
    if (action === 'notify') return window.openNotifications?.();
    if (action === 'explore' || action === 'wallet' || action === 'more') return window.openRewardHistory?.();
    if (action === 'news') return toast((model.campaigns || []).find(c => c.active !== false)?.title || 'No active bonus campaign');
    if (action === 'spin') return spinApproved();
    if (action === 'new') return window.openEvent?.('newuser');
    if (action === 'invite') return window.openReferral?.();
    if (action === 'tasks' || action === 'view' || action === 'check') return scrollToTasks();
    if (action === 'events') return window.openEvent?.('special');
  }

  function build() {
    const page = document.getElementById('rewards');
    if (!page) return;
    injectProductionStyles();
    document.querySelector('.reward-v24-nav')?.remove();
    page.querySelectorAll('.reward-v22-shell,.reward-v22-bottom,.reward-v24-root').forEach(node => node.remove());

    const root = document.createElement('div'); root.className = 'reward-v24-root';
    const visual = document.createElement('div'); visual.className = 'reward-v24-visual';
    const art = document.createElement('img'); art.className = 'reward-v24-art'; art.src = assets.content; art.alt = 'digiRupee Rewards'; visual.appendChild(art);
    const rotor = document.createElement('img'); rotor.className = 'reward-v24-rotor'; rotor.id = 'rewardV24Rotor'; rotor.src = assets.wheel; rotor.alt = ''; visual.appendChild(rotor);
    buildDynamicLayers(visual);

    let startX = 0, startY = 0, moved = false;
    visual.addEventListener('pointerdown', event => { startX = event.clientX; startY = event.clientY; moved = false; }, { passive:true });
    visual.addEventListener('pointermove', event => { if (Math.abs(event.clientX - startX) > 8 || Math.abs(event.clientY - startY) > 8) moved = true; }, { passive:true });
    visual.addEventListener('click', event => {
      if (moved || event.target.closest('.digi-reward-live')) return;
      const box = visual.getBoundingClientRect();
      const nx = (event.clientX - box.left) / box.width * 100;
      const ny = (event.clientY - box.top) / box.height * 100;
      const action = hitAction(nx, ny); if (action) act(action);
    });

    root.appendChild(visual);
    const more = document.createElement('section'); more.className = 'reward-v24-more'; more.id = 'rewardV24More'; root.appendChild(more);
    page.appendChild(root);

    const nav = document.createElement('div'); nav.className = 'reward-v24-nav'; nav.id = 'rewardV24Nav';
    const navImage = document.createElement('img'); navImage.src = assets.nav; navImage.alt = 'digiRupee navigation'; nav.appendChild(navImage);
    nav.addEventListener('click', event => { const box = nav.getBoundingClientRect(); const x = (event.clientX - box.left) / box.width * 100; if (x < 20) return window.go?.('home'); if (x < 40) return window.go?.('sell'); if (x < 60) return window.go?.('orders'); if (x < 80) return; return window.go?.('profile'); });
    document.querySelector('.app')?.appendChild(nav);
    page.scrollTop = 0;
    renderDynamic();
  }

  function renderDynamic() {
    const wallet = document.getElementById('digiRewardWallet');
    if (wallet) wallet.innerHTML = `<small>My Rewards</small><b>${num(model.rewards?.balance || 0)} USDT</b><span>Server-managed balance</span>`;

    const campaign = (model.campaigns || []).find(item => item.active !== false);
    const news = document.getElementById('digiRewardNews');
    if (news) news.innerHTML = `<strong>🔊 LIVE BONUS NEWS</strong><i></i><span>${esc(campaign ? campaign.title : 'No active bonus campaign')}</span><em>${campaign ? 'Admin campaign' : 'Waiting'}</em>`;

    const wheel = model.wheel;
    const spin = document.getElementById('digiRewardSpin');
    if (spin) {
      const canSpin = !!wheel?.canSpin;
      const previous = wheel?.previousResult?.rewardAmount;
      spin.innerHTML = `<small>DAILY SPIN</small><b>${canSpin ? 'Ready to Spin' : previous ? `Today: ${num(previous)} USDT` : 'Used Today'}</b><small>${canSpin ? '1 spin available today' : wheel?.nextEligibleAt ? `Next: ${new Date(wheel.nextEligibleAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}` : 'Come back tomorrow'}</small><button id="rewardApprovedSpin" ${canSpin && !spinning ? '' : 'disabled'}>${spinning ? 'Spinning…' : canSpin ? 'Spin Now →' : 'Used Today'}</button>`;
      document.getElementById('rewardApprovedSpin')?.addEventListener('click', event => { event.stopPropagation(); spinApproved(); });
    }

    const tasks = activeTasks();
    const first = tasks.find(task => !task.claim) || tasks[0];
    const box = document.getElementById('digiRewardTaskBox');
    if (box) {
      if (!first) box.innerHTML = `<div class="digi-reward-taskhead"><b>Task Center</b><button type="button" id="digiTaskMore">View All ›</button></div><div class="reward-v24-empty">No active reward tasks right now.</div>`;
      else {
        const eligible = !!first.eligibility?.eligible && !first.claim;
        box.innerHTML = `<div class="digi-reward-taskhead"><b>Task Center</b><button type="button" id="digiTaskMore">View All ›</button></div><div class="digi-reward-taskrow"><div class="digi-reward-taskicon">✓</div><div class="digi-reward-taskcopy"><b>${esc(first.title || 'Reward task')}</b><small>${esc(first.description || first.campaignTitle || 'Complete the task to earn rewards.')}</small></div><div class="digi-reward-taskreward">${num(first.rewardAmount || 0)} USDT</div><button class="digi-reward-taskaction" id="digiTaskAction" ${eligible ? '' : 'disabled'}>${first.claim ? esc(first.claim.status || 'Claimed') : eligible ? 'Claim Now' : 'In Progress'}</button></div>`;
        if (eligible) document.getElementById('digiTaskAction')?.addEventListener('click', event => { event.stopPropagation(); window.claimTask?.(first.id, first.campaignId); setTimeout(refreshState, 900); });
      }
      document.getElementById('digiTaskMore')?.addEventListener('click', event => { event.stopPropagation(); scrollToTasks(); });
    }

    const more = document.getElementById('rewardV24More');
    if (more) {
      const rows = tasks.slice(1);
      more.innerHTML = `<div class="reward-v24-more-head"><h3>More Tasks</h3><span>Server-managed campaigns</span></div>${rows.length ? rows.map(task => { const progress = Number(task.eligibility?.progress || 0), target = Math.max(1, Number(task.eligibility?.target || 1)), percent = Math.max(0, Math.min(100, progress / target * 100)); return `<article class="reward-v24-task digi-server-task"><div class="reward-v24-task-icon">${String(task.claimType || '').toLowerCase().includes('ref') ? 'R' : '₮'}</div><div><h4>${esc(task.title || 'Reward task')}</h4><p>${esc(task.description || task.campaignTitle || '')}</p><div class="reward-v24-progress"><i style="width:${percent}%"></i></div></div><div class="reward-v24-reward">${num(task.rewardAmount || 0)} USDT</div></article>`; }).join('') : '<div class="reward-v24-empty">No additional tasks right now. New admin campaigns will appear here.</div>'}`;
    }
  }

  async function refreshState() {
    try {
      const [rewards, wheel, campaigns] = await Promise.all([api('/rewards'), api('/wheel'), api('/campaigns')]);
      model.rewards = rewards;
      model.wheel = wheel;
      model.campaigns = campaigns.campaigns || [];
      renderDynamic();
    } catch (error) {
      if (!/401|session/i.test(String(error.message))) toast(error.message);
    }
  }

  function scrollToTasks() {
    const page = document.getElementById('rewards');
    const more = document.getElementById('rewardV24More');
    if (page && more) page.scrollTo({ top:Math.max(0, more.offsetTop - 8), behavior:'smooth' });
  }

  async function spinApproved() {
    if (spinning) return;
    if (!model.wheel?.canSpin) return toast('Today’s spin is already used');
    spinning = true; renderDynamic();
    try {
      const result = await api('/wheel/spin', { method:'POST', headers:{ 'Idempotency-Key':idempotencyKey() } });
      const segments = model.wheel?.segments || [];
      let index = segments.findIndex(segment => String(segment.label ?? '') === String(result.result?.label ?? ''));
      if (index < 0) index = segments.findIndex(segment => Number(segment.rewardAmount) === Number(result.result?.rewardAmount));
      if (index < 0) index = 0;
      const rotor = document.getElementById('rewardV24Rotor');
      if (!rotor) throw new Error('Reward wheel is unavailable');
      const current = ((rotation % 360) + 360) % 360;
      const target = ((360 - index * (360 / Math.max(1, segments.length || 8))) % 360 + 360) % 360;
      const delta = (target - current + 360) % 360;
      rotation += 360 * 7 + delta;
      rotor.style.transition = 'none'; rotor.style.transform = `rotate(${current}deg)`; rotor.classList.add('spinning');
      requestAnimationFrame(() => requestAnimationFrame(() => { rotor.style.transition = 'transform 4.6s cubic-bezier(.12,.96,.16,1)'; rotor.style.transform = `rotate(${rotation}deg)`; }));
      await new Promise(resolve => setTimeout(resolve, 4700));
      rotor.classList.remove('spinning'); rotor.style.transition = 'none'; rotor.style.transform = 'rotate(0deg)';
      toast(`You won ${num(result.result?.rewardAmount || 0)} USDT`);
      await refreshState();
    } catch (error) {
      toast(error.message);
    } finally {
      spinning = false; renderDynamic();
    }
  }

  function enter() {
    document.body.classList.add('reward-v22-mode');
    build();
    refreshState();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => { if (!document.hidden && document.body.classList.contains('reward-v22-mode')) refreshState(); }, 12000);
  }

  function leave() {
    document.body.classList.remove('reward-v22-mode');
    document.querySelector('.reward-v24-nav')?.remove();
    clearInterval(refreshTimer); refreshTimer = null;
  }

  const previousGo = window.go;
  if (typeof previousGo === 'function') {
    window.go = function(page) {
      previousGo(page);
      if (page === 'rewards') requestAnimationFrame(enter); else leave();
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && document.body.classList.contains('reward-v22-mode')) { if (!document.querySelector('.reward-v24-root')) build(); refreshState(); }
  });
  window.addEventListener('resize', () => { if (document.body.classList.contains('reward-v22-mode') && !document.querySelector('.reward-v24-root')) build(); }, { passive:true });
})();