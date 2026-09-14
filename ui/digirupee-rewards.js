(() => {
  'use strict';

  const assets = window.__DIGIRUPEE_REWARD_ASSETS || {};
  if (!assets.content || !assets.nav || !assets.wheel) return;

  const SOURCE_W = 941;
  const SOURCE_H = 1510;
  const FULL_H = 1672;
  const CROP_TOP = 42;
  const FRAME_END = 1235;
  const FRAME_H = FRAME_END - CROP_TOP;
  const NAV_SOURCE_H = 162;
  const model = { rewards: null, wheel: null, campaigns: [] };

  let spinning = false;
  let rotation = 0;
  let refreshTimer = null;
  let showAllTasks = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[ch]));
  const num = value => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 6 });
  const frameY = sourceY => `${(((Number(sourceY) - CROP_TOP) / FRAME_H) * 100).toFixed(4)}%`;
  const frameH = pixels => `${((Number(pixels) / FRAME_H) * 100).toFixed(4)}%`;

  async function api(path, options = {}) {
    const headers = {
      ...(options.body ? { 'Content-Type':'application/json' } : {}),
      ...(options.headers || {})
    };
    const response = await fetch(`/api/digirupee${path}`, {
      ...options,
      headers,
      credentials:'include'
    });
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
    let node = document.getElementById('rewardV26Toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'rewardV26Toast';
      node.className = 'reward-v26-toast';
      document.querySelector('.app')?.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(node._timer);
    node._timer = setTimeout(() => node.classList.remove('show'), 1900);
  }

  function injectStyles() {
    if (document.getElementById('digi-approved-reward-v26-css')) return;

    const cropShift = ((CROP_TOP / FRAME_H) * 100).toFixed(4);
    const rotorSourceTop = SOURCE_H * 0.4105956;
    const style = document.createElement('style');
    style.id = 'digi-approved-reward-v26-css';
    style.textContent = `
      body.reward-v22-mode{
        overflow:hidden!important;
        background:#000!important;
        padding:0!important;
      }
      body.reward-v22-mode .app{
        width:min(430px,100vw)!important;
        max-width:430px!important;
        height:100dvh!important;
        min-height:0!important;
        margin:0 auto!important;
        position:relative!important;
        display:block!important;
        overflow:hidden!important;
        background:#000!important;
        border:0!important;
        border-radius:0!important;
      }
      body.reward-v22-mode .statusbar,
      body.reward-v22-mode .header,
      body.reward-v22-mode .app>.nav{
        display:none!important;
      }
      body.reward-v22-mode #rewards{
        display:block!important;
        position:absolute!important;
        inset:0!important;
        width:100%!important;
        height:100%!important;
        max-height:100%!important;
        margin:0!important;
        padding:0 0 min(17.22vw,74px)!important;
        box-sizing:border-box!important;
        overflow-y:auto!important;
        overflow-x:hidden!important;
        -webkit-overflow-scrolling:touch!important;
        overscroll-behavior-y:contain!important;
        touch-action:pan-y!important;
        scrollbar-width:none!important;
        background:#000!important;
        animation:none!important;
      }
      body.reward-v22-mode #rewards::-webkit-scrollbar{display:none!important}
      body.reward-v22-mode #rewards>*:not(.reward-v24-root){display:none!important}

      body.reward-v22-mode .reward-v24-root{
        position:relative!important;
        display:flex!important;
        flex-direction:column!important;
        width:100%!important;
        min-height:calc(100dvh - min(17.22vw,74px))!important;
        height:auto!important;
        margin:0!important;
        padding:24px 0 0!important;
        box-sizing:border-box!important;
        overflow:visible!important;
        background:#000!important;
        color:#f7f3ec!important;
        line-height:1.35!important;
        touch-action:pan-y!important;
      }
      .reward-v24-visual{
        position:relative!important;
        flex:0 0 auto!important;
        width:100%!important;
        aspect-ratio:${SOURCE_W}/${FRAME_H}!important;
        height:auto!important;
        overflow:hidden!important;
        line-height:0!important;
        touch-action:pan-y!important;
        user-select:none!important;
        -webkit-user-select:none!important;
        background:#000!important;
      }
      .reward-v24-art{
        position:absolute!important;
        z-index:1!important;
        left:0!important;
        top:-${cropShift}%!important;
        display:block!important;
        width:100%!important;
        height:auto!important;
        max-width:none!important;
        pointer-events:none!important;
        user-select:none!important;
        -webkit-user-drag:none!important;
      }
      .reward-v24-rotor{
        position:absolute!important;
        z-index:8!important;
        left:17.0032%!important;
        top:${frameY(rotorSourceTop)}!important;
        width:30.2869%!important;
        height:auto!important;
        opacity:0!important;
        pointer-events:none!important;
        transform-origin:50% 50%!important;
        backface-visibility:hidden!important;
        will-change:transform!important;
      }
      .reward-v24-rotor.spinning{opacity:1!important}

      .digi-reward-live{
        position:absolute;
        z-index:28;
        box-sizing:border-box;
        color:#fff;
        font-family:Inter,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;
        line-height:1.18;
      }

      .digi-reward-wallet{
        left:70.7%;
        top:${frameY(354)};
        width:18.0%;
        height:${frameH(101)};
        padding:7px 6px 5px;
        display:flex;
        flex-direction:column;
        justify-content:center;
        overflow:hidden;
        pointer-events:none;
        background:linear-gradient(90deg,rgba(52,32,18,.99),rgba(38,24,16,.99));
      }
      .digi-reward-wallet small{display:block;color:#c8c3bc;font-size:8.5px;white-space:nowrap}
      .digi-reward-wallet b{display:block;margin-top:4px;color:#ffd75d;font-size:14px;white-space:nowrap}
      .digi-reward-wallet span{display:block;margin-top:4px;color:#b1aaa2;font-size:7.5px;white-space:nowrap}

      .digi-reward-news{
        left:34.1%;
        top:${frameY(500)};
        width:57.8%;
        height:${frameH(44)};
        padding:0 8px 0 10px;
        display:flex;
        align-items:center;
        gap:8px;
        overflow:hidden;
        pointer-events:none;
        background:linear-gradient(90deg,rgba(20,17,18,.99),rgba(17,18,21,.99));
      }
      .digi-reward-news span{
        min-width:0;
        flex:1;
        color:#f0eeea;
        font-size:8.8px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .digi-reward-news em{
        color:#9f9a94;
        font-size:7.7px;
        font-style:normal;
        white-space:nowrap;
      }

      .digi-reward-spin-status{
        left:64.8%;
        top:${frameY(785)};
        width:24.8%;
        height:${frameH(63)};
        padding:3px 2px 2px;
        display:flex;
        flex-direction:column;
        justify-content:center;
        pointer-events:none;
        overflow:hidden;
        background:linear-gradient(90deg,rgba(19,20,23,.99),rgba(16,17,20,.99));
      }
      .digi-reward-spin-status b{display:block;color:#fff;font-size:11px;white-space:nowrap}
      .digi-reward-spin-status small{display:block;margin-top:5px;color:#c5c1ba;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .digi-reward-spin-button{
        left:57.6%;
        top:${frameY(855)};
        width:32.0%;
        height:${frameH(55)};
        padding:0;
        pointer-events:auto;
      }
      .digi-reward-spin-button button{
        width:100%;
        height:100%;
        min-height:0;
        margin:0;
        border:0;
        border-radius:999px;
        background:linear-gradient(180deg,#ffdf68,#e9ad31);
        color:#161006;
        font-size:11px;
        font-weight:900;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.55);
      }
      .digi-reward-spin-button button:disabled{
        background:linear-gradient(180deg,#8f7936,#79662d);
        color:#17140c;
        opacity:.96;
      }

      .reward-v26-task-section{
        flex:1 0 190px;
        min-height:190px;
        padding:11px 22px 18px;
        display:flex;
        flex-direction:column;
        box-sizing:border-box;
        background:#000;
      }
      .reward-v26-task-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin:0 2px 9px;
      }
      .reward-v26-task-head h3{
        margin:0;
        color:#f1c84e;
        font-size:15px;
        line-height:1.2;
        letter-spacing:-.2px;
      }
      .reward-v26-task-head button{
        border:0;
        background:none;
        color:#aaa6a0;
        font-size:9px;
        padding:6px 0;
      }
      .reward-v26-task-list{
        flex:1;
        display:flex;
        flex-direction:column;
        gap:8px;
        min-height:0;
      }
      .reward-v26-task-card{
        flex:1 1 auto;
        min-height:112px;
        display:grid;
        grid-template-columns:44px minmax(0,1fr) auto;
        grid-template-rows:auto auto;
        gap:8px 10px;
        align-items:center;
        padding:13px 14px;
        border:1px solid #292c32;
        border-radius:17px;
        background:linear-gradient(145deg,#121418,#0a0b0d);
        box-sizing:border-box;
      }
      .reward-v26-task-icon{
        grid-row:1/3;
        width:44px;
        height:44px;
        border-radius:12px;
        display:grid;
        place-items:center;
        background:#171a1f;
        border:1px solid #333740;
        color:#f0ca56;
        font-size:19px;
        font-weight:900;
      }
      .reward-v26-task-copy{min-width:0}
      .reward-v26-task-copy b{display:block;color:#fff;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .reward-v26-task-copy small{display:block;margin-top:4px;color:#a8a39c;font-size:8.5px;line-height:1.35}
      .reward-v26-task-reward{align-self:start;color:#ffd75d;font-size:9px;font-weight:900;white-space:nowrap}
      .reward-v26-progress{
        grid-column:2/4;
        height:6px;
        border-radius:999px;
        background:#272a30;
        overflow:hidden;
      }
      .reward-v26-progress i{
        display:block;
        height:100%;
        border-radius:inherit;
        background:linear-gradient(90deg,#bd7b08,#ffd85b);
      }
      .reward-v26-task-action{
        grid-column:2/4;
        min-height:34px;
        border:1px solid #66521b;
        border-radius:10px;
        background:#19160d;
        color:#e9ca62;
        font-size:9px;
        font-weight:850;
      }
      .reward-v26-task-action:disabled{
        border-color:#30333a;
        background:#121418;
        color:#7f8389;
      }
      .reward-v26-empty{
        flex:1;
        min-height:125px;
        display:grid;
        place-items:center;
        padding:20px;
        border:1px solid #292c32;
        border-radius:17px;
        background:linear-gradient(145deg,#101216,#090a0c);
        color:#aaa6a0;
        text-align:center;
        font-size:10px;
        box-sizing:border-box;
      }

      .reward-v24-nav{
        position:absolute!important;
        z-index:70!important;
        left:0!important;
        right:0!important;
        bottom:0!important;
        width:100%!important;
        height:auto!important;
        overflow:hidden!important;
        background:#050506!important;
        box-shadow:0 -10px 28px rgba(0,0,0,.28)!important;
        touch-action:manipulation!important;
      }
      .reward-v24-nav img{
        display:block!important;
        width:100%!important;
        height:auto!important;
        pointer-events:none!important;
        user-select:none!important;
      }
      .reward-v26-toast{
        position:absolute;
        z-index:140;
        left:50%;
        bottom:calc(min(17.22vw,74px) + 14px);
        transform:translateX(-50%) translateY(8px);
        max-width:82%;
        padding:10px 14px;
        border-radius:999px;
        background:rgba(15,16,19,.97);
        border:1px solid rgba(255,215,93,.28);
        color:#ffe17a;
        font:800 11px/1.25 Inter,system-ui,sans-serif;
        text-align:center;
        box-shadow:0 12px 28px rgba(0,0,0,.38);
        opacity:0;
        pointer-events:none;
        transition:.18s ease;
      }
      .reward-v26-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}

      @media(max-width:370px){
        body.reward-v22-mode .reward-v24-root{padding-top:22px!important}
        .reward-v26-task-section{padding-left:16px;padding-right:16px}
        .digi-reward-wallet b{font-size:12px}
        .digi-reward-wallet small{font-size:7.5px}
        .digi-reward-wallet span{font-size:6.8px}
        .digi-reward-news span{font-size:8px}
        .digi-reward-news em{font-size:7px}
        .digi-reward-spin-status b{font-size:10px}
        .digi-reward-spin-status small{font-size:7px}
      }
      @media(min-width:431px){
        body.reward-v22-mode{
          display:flex!important;
          align-items:center!important;
          justify-content:center!important;
          min-height:100vh!important;
        }
        body.reward-v22-mode .app{
          height:min(900px,100dvh)!important;
          border-radius:24px!important;
          border:1px solid #25262a!important;
          box-shadow:0 20px 70px rgba(0,0,0,.62)!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function activeTasks() {
    return (model.campaigns || [])
      .flatMap(campaign => (campaign.tasks || []).map(task => ({
        ...task,
        campaignId: campaign.id,
        campaignTitle: campaign.title
      })))
      .filter(task => task.enabled !== false);
  }

  function buildDynamicLayers(visual) {
    const wallet = document.createElement('div');
    wallet.id = 'digiRewardWallet';
    wallet.className = 'digi-reward-live digi-reward-wallet';
    visual.appendChild(wallet);

    const news = document.createElement('div');
    news.id = 'digiRewardNews';
    news.className = 'digi-reward-live digi-reward-news';
    visual.appendChild(news);

    const spinStatus = document.createElement('div');
    spinStatus.id = 'digiRewardSpinStatus';
    spinStatus.className = 'digi-reward-live digi-reward-spin-status';
    visual.appendChild(spinStatus);

    const spinButton = document.createElement('div');
    spinButton.id = 'digiRewardSpinButton';
    spinButton.className = 'digi-reward-live digi-reward-spin-button';
    visual.appendChild(spinButton);
  }

  function originalYPercent(framePercent) {
    const sourceY = CROP_TOP + (Number(framePercent) / 100) * FRAME_H;
    return (sourceY / FULL_H) * 100;
  }

  function hitAction(nx, ny) {
    const sourceYPercent = originalYPercent(ny);
    const rects = [
      ['notify',84.5,3.6,10,5],
      ['explore',7,24,26,4.2],
      ['wallet',64.3,21.2,28.3,7.4],
      ['news',4.2,29.5,91.5,3.2],
      ['spin',58.2,50,32.4,5.4],
      ['more',77.8,58,16,3],
      ['new',5,61.3,18.7,12.7],
      ['invite',25.8,61.3,18.7,12.7],
      ['tasks',46.8,61.3,18.7,12.7],
      ['events',68.1,61.3,18.7,12.7]
    ];
    for (const rect of rects) {
      if (
        nx >= rect[1] &&
        nx <= rect[1] + rect[3] &&
        sourceYPercent >= rect[2] &&
        sourceYPercent <= rect[2] + rect[4]
      ) return rect[0];
    }
    return '';
  }

  function act(action) {
    if (action === 'notify') return window.openNotifications?.();
    if (action === 'explore' || action === 'wallet' || action === 'more') return window.openRewardHistory?.();
    if (action === 'news') {
      const campaign = (model.campaigns || []).find(item => item.active !== false);
      return toast(campaign?.title || 'No active bonus campaign');
    }
    if (action === 'spin') return spinApproved();
    if (action === 'new') return window.openEvent?.('newuser');
    if (action === 'invite') return window.openReferral?.();
    if (action === 'tasks') return scrollToTasks();
    if (action === 'events') return window.openEvent?.('special');
  }

  function build() {
    const page = document.getElementById('rewards');
    if (!page) return;

    injectStyles();
    document.querySelector('.reward-v24-nav')?.remove();
    page.querySelectorAll('.reward-v22-shell,.reward-v22-bottom,.reward-v24-root').forEach(node => node.remove());

    const root = document.createElement('div');
    root.className = 'reward-v24-root';

    const visual = document.createElement('div');
    visual.className = 'reward-v24-visual';

    const art = document.createElement('img');
    art.className = 'reward-v24-art';
    art.src = assets.content;
    art.alt = 'digiRupee Rewards';
    visual.appendChild(art);

    const rotor = document.createElement('img');
    rotor.className = 'reward-v24-rotor';
    rotor.id = 'rewardV24Rotor';
    rotor.src = assets.wheel;
    rotor.alt = '';
    visual.appendChild(rotor);

    buildDynamicLayers(visual);

    let startX = 0;
    let startY = 0;
    let moved = false;
    visual.addEventListener('pointerdown', event => {
      startX = event.clientX;
      startY = event.clientY;
      moved = false;
    }, { passive:true });
    visual.addEventListener('pointermove', event => {
      if (Math.abs(event.clientX - startX) > 8 || Math.abs(event.clientY - startY) > 8) moved = true;
    }, { passive:true });
    visual.addEventListener('click', event => {
      if (moved || event.target.closest('.digi-reward-spin-button')) return;
      const box = visual.getBoundingClientRect();
      const nx = (event.clientX - box.left) / box.width * 100;
      const ny = (event.clientY - box.top) / box.height * 100;
      const action = hitAction(nx, ny);
      if (action) act(action);
    });

    root.appendChild(visual);

    const taskSection = document.createElement('section');
    taskSection.className = 'reward-v26-task-section';
    taskSection.id = 'rewardV26TaskSection';
    taskSection.innerHTML = '<div class="reward-v26-task-head"><h3>Task Center</h3><button type="button" id="rewardV26TaskToggle">View All ›</button></div><div class="reward-v26-task-list" id="rewardV26TaskList"></div>';
    root.appendChild(taskSection);

    page.appendChild(root);

    const nav = document.createElement('div');
    nav.className = 'reward-v24-nav';
    nav.id = 'rewardV24Nav';
    const navImage = document.createElement('img');
    navImage.src = assets.nav;
    navImage.alt = 'digiRupee navigation';
    nav.appendChild(navImage);
    nav.addEventListener('click', event => {
      const box = nav.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width * 100;
      if (x < 20) return window.go?.('home');
      if (x < 40) return window.go?.('sell');
      if (x < 60) return window.go?.('orders');
      if (x < 80) return;
      return window.go?.('profile');
    });
    document.querySelector('.app')?.appendChild(nav);

    document.getElementById('rewardV26TaskToggle')?.addEventListener('click', event => {
      event.stopPropagation();
      const tasks = activeTasks();
      if (tasks.length <= 1) return scrollToTasks();
      showAllTasks = !showAllTasks;
      renderTaskSection();
      requestAnimationFrame(scrollToTasks);
    });

    page.scrollTop = 0;
    renderDynamic();
  }

  function renderDynamic() {
    const wallet = document.getElementById('digiRewardWallet');
    if (wallet) {
      wallet.innerHTML = `<small>My Rewards</small><b>${num(model.rewards?.balance || 0)} USDT</b><span>Server-managed</span>`;
    }

    const campaign = (model.campaigns || []).find(item => item.active !== false);
    const news = document.getElementById('digiRewardNews');
    if (news) {
      news.innerHTML = `<span>${esc(campaign ? campaign.title : 'No active bonus campaign')}</span><em>${campaign ? 'Admin campaign' : 'Waiting'}</em>`;
    }

    const wheel = model.wheel;
    const spinStatus = document.getElementById('digiRewardSpinStatus');
    const spinButton = document.getElementById('digiRewardSpinButton');
    if (spinStatus) {
      const canSpin = !!wheel?.canSpin;
      const previous = wheel?.previousResult?.rewardAmount;
      const detail = canSpin
        ? '1 spin available today'
        : wheel?.nextEligibleAt
          ? `Next: ${new Date(wheel.nextEligibleAt).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}`
          : 'Come back tomorrow';
      spinStatus.innerHTML = `<b>${canSpin ? 'Ready to Spin' : previous ? `Today: ${num(previous)} USDT` : 'Used Today'}</b><small>${esc(detail)}</small>`;
    }
    if (spinButton) {
      const canSpin = !!wheel?.canSpin;
      spinButton.innerHTML = `<button id="rewardApprovedSpin" ${canSpin && !spinning ? '' : 'disabled'}>${spinning ? 'Spinning…' : canSpin ? 'Spin Now →' : 'Used Today'}</button>`;
      document.getElementById('rewardApprovedSpin')?.addEventListener('click', event => {
        event.stopPropagation();
        spinApproved();
      });
    }

    renderTaskSection();
  }

  function taskCard(task) {
    const progress = Number(task.eligibility?.progress || 0);
    const target = Math.max(1, Number(task.eligibility?.target || 1));
    const percent = Math.max(0, Math.min(100, progress / target * 100));
    const eligible = !!task.eligibility?.eligible && !task.claim;
    const claimed = !!task.claim;
    const actionText = claimed
      ? esc(task.claim.status || 'Claimed')
      : eligible
        ? 'Claim Now'
        : 'In Progress';
    const icon = String(task.claimType || '').toLowerCase().includes('ref') ? 'R' : '✓';

    return `<article class="reward-v26-task-card">
      <div class="reward-v26-task-icon">${icon}</div>
      <div class="reward-v26-task-copy">
        <b>${esc(task.title || 'Reward task')}</b>
        <small>${esc(task.description || task.campaignTitle || 'Complete this task to earn rewards.')}</small>
      </div>
      <div class="reward-v26-task-reward">${num(task.rewardAmount || 0)} USDT</div>
      <div class="reward-v26-progress"><i style="width:${percent}%"></i></div>
      <button class="reward-v26-task-action" data-task-id="${esc(task.id)}" data-campaign-id="${esc(task.campaignId)}" ${eligible ? '' : 'disabled'}>${actionText}</button>
    </article>`;
  }

  function renderTaskSection() {
    const list = document.getElementById('rewardV26TaskList');
    const toggle = document.getElementById('rewardV26TaskToggle');
    if (!list) return;

    const tasks = activeTasks();
    if (toggle) {
      toggle.textContent = tasks.length > 1 ? (showAllTasks ? 'Collapse ↑' : 'View All ›') : 'View All ›';
      toggle.disabled = tasks.length === 0;
    }

    if (!tasks.length) {
      list.innerHTML = '<div class="reward-v26-empty">No active reward tasks right now.<br>New admin campaigns will appear here.</div>';
      return;
    }

    const visible = showAllTasks ? tasks : [tasks.find(task => !task.claim) || tasks[0]];
    list.innerHTML = visible.map(taskCard).join('');
    list.querySelectorAll('.reward-v26-task-action:not(:disabled)').forEach(button => {
      button.addEventListener('click', async event => {
        event.stopPropagation();
        button.disabled = true;
        try {
          if (typeof window.claimTask !== 'function') throw new Error('Task claim is unavailable');
          await window.claimTask(button.dataset.taskId, button.dataset.campaignId);
          setTimeout(refreshState, 700);
        } catch (error) {
          toast(error.message || 'Could not claim task');
          setTimeout(refreshState, 500);
        }
      });
    });
  }

  async function refreshState() {
    try {
      const [rewards, wheel, campaigns] = await Promise.all([
        api('/rewards'),
        api('/wheel'),
        api('/campaigns')
      ]);
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
    const section = document.getElementById('rewardV26TaskSection');
    if (!page || !section) return;
    page.scrollTo({
      top: Math.max(0, section.offsetTop - 8),
      behavior:'smooth'
    });
  }

  async function spinApproved() {
    if (spinning) return;
    if (!model.wheel?.canSpin) return toast('Today’s spin is already used');

    spinning = true;
    renderDynamic();

    try {
      const result = await api('/wheel/spin', {
        method:'POST',
        headers:{ 'Idempotency-Key':idempotencyKey() }
      });

      const segments = model.wheel?.segments || [];
      let index = segments.findIndex(segment =>
        String(segment.label ?? '') === String(result.result?.label ?? '')
      );
      if (index < 0) {
        index = segments.findIndex(segment =>
          Number(segment.rewardAmount) === Number(result.result?.rewardAmount)
        );
      }
      if (index < 0) index = 0;

      const rotor = document.getElementById('rewardV24Rotor');
      if (!rotor) throw new Error('Reward wheel is unavailable');

      const current = ((rotation % 360) + 360) % 360;
      const target = ((360 - index * (360 / Math.max(1, segments.length || 8))) % 360 + 360) % 360;
      const delta = (target - current + 360) % 360;
      rotation += 360 * 7 + delta;

      rotor.style.transition = 'none';
      rotor.style.transform = `rotate(${current}deg)`;
      rotor.classList.add('spinning');

      requestAnimationFrame(() => requestAnimationFrame(() => {
        rotor.style.transition = 'transform 4.6s cubic-bezier(.12,.96,.16,1)';
        rotor.style.transform = `rotate(${rotation}deg)`;
      }));

      await new Promise(resolve => setTimeout(resolve, 4700));
      rotor.classList.remove('spinning');
      rotor.style.transition = 'none';
      rotor.style.transform = 'rotate(0deg)';

      toast(`You won ${num(result.result?.rewardAmount || 0)} USDT`);
      await refreshState();
    } catch (error) {
      toast(error.message);
    } finally {
      spinning = false;
      renderDynamic();
    }
  }

  function enter() {
    document.body.classList.add('reward-v22-mode');
    build();
    refreshState();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (!document.hidden && document.body.classList.contains('reward-v22-mode')) refreshState();
    }, 12000);
  }

  function leave() {
    document.body.classList.remove('reward-v22-mode');
    document.querySelector('.reward-v24-nav')?.remove();
    clearInterval(refreshTimer);
    refreshTimer = null;
    showAllTasks = false;
  }

  const previousGo = window.go;
  if (typeof previousGo === 'function') {
    window.go = function(page) {
      previousGo(page);
      if (page === 'rewards') requestAnimationFrame(enter);
      else leave();
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && document.body.classList.contains('reward-v22-mode')) {
      if (!document.querySelector('.reward-v24-root')) build();
      refreshState();
    }
  });

  window.addEventListener('resize', () => {
    if (document.body.classList.contains('reward-v22-mode') && !document.querySelector('.reward-v24-root')) build();
  }, { passive:true });

  if (document.getElementById('rewards')?.classList.contains('active')) {
    requestAnimationFrame(enter);
  }

  window.__rewardV26 = { build, refreshState, scrollToTasks, spin:spinApproved };
})();
