(() => {
  'use strict';

  const assets = window.__DIGIRUPEE_REWARD_ASSETS || {};
  if (!assets.content || !assets.wheel) return;

  const SOURCE_W = 941;
  const SOURCE_H = 1510;
  const CROP_TOP = 145;
  const FRAME_END = 1235;
  const FRAME_H = FRAME_END - CROP_TOP;
  const model = { rewards:null, wheel:null, campaigns:[] };

  let spinning = false;
  let rotation = 0;
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
  }

  function injectStyles() {
    if (document.getElementById('digi-rewards-v3-css')) return;
    const cropShift = ((CROP_TOP / FRAME_H) * 100).toFixed(4);
    const style = document.createElement('style');
    style.id = 'digi-rewards-v3-css';
    style.textContent = `
      #rewards.reward-v3-ready{padding-bottom:18px!important;background:#050607!important}
      #rewards.reward-v3-ready>*:not(.reward-v3-root){display:none!important}
      .reward-v3-root{
        width:calc(100% + 30px);
        margin:0 -15px;
        background:#050607;
        color:#f7f3ec;
      }
      .reward-v3-visual{
        position:relative;
        width:calc(100% + 12px);
        margin-left:-6px;
        aspect-ratio:${SOURCE_W}/${FRAME_H};
        overflow:hidden;
        line-height:0;
        background:#000;
        user-select:none;
        -webkit-user-select:none;
        touch-action:pan-y;
      }
      .reward-v3-art{
        position:absolute;
        z-index:1;
        left:0;
        top:-${cropShift}%;
        width:100%;
        height:auto;
        max-width:none;
        pointer-events:none;
        -webkit-user-drag:none;
      }
      .reward-v3-rotor{
        position:absolute;
        z-index:8;
        left:17.0%;
        top:${frameY(620)};
        width:30.3%;
        height:auto;
        opacity:0;
        pointer-events:none;
        transform-origin:50% 50%;
        backface-visibility:hidden;
        will-change:transform;
      }
      .reward-v3-rotor.spinning{opacity:1}
      .reward-v3-live{
        position:absolute;
        z-index:24;
        box-sizing:border-box;
        font-family:Inter,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;
        line-height:1.25;
      }
      .reward-v3-wallet{
        left:64.4%;
        top:${frameY(343)};
        width:29.1%;
        height:${frameH(120)};
        padding:10px 12px;
        display:flex;
        flex-direction:column;
        justify-content:center;
        border:1px solid rgba(241,195,78,.58);
        border-radius:18px;
        background:linear-gradient(135deg,rgba(67,39,19,.995),rgba(33,22,17,.995));
        box-shadow:0 9px 24px rgba(0,0,0,.28),inset 0 1px rgba(255,255,255,.05);
        color:#fff;
        cursor:pointer;
      }
      .reward-v3-wallet small{color:#d2cbc0;font-size:9px;white-space:nowrap}
      .reward-v3-wallet b{margin-top:4px;color:#ffd65b;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .reward-v3-wallet span{margin-top:5px;color:#9f9990;font-size:8px;white-space:nowrap}
      .reward-v3-news{
        left:33.0%;
        top:${frameY(497)};
        width:60.5%;
        height:${frameH(57)};
        padding:0 10px;
        display:flex;
        align-items:center;
        gap:9px;
        background:linear-gradient(90deg,rgba(20,21,24,.998),rgba(16,17,20,.998));
        color:#fff;
        cursor:pointer;
      }
      .reward-v3-news span{min-width:0;flex:1;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#f0eeea}
      .reward-v3-news em{font-size:8px;font-style:normal;color:#96928d;white-space:nowrap}
      .reward-v3-spin-card{
        left:55.5%;
        top:${frameY(772)};
        width:36.3%;
        height:${frameH(160)};
        padding:12px 12px 10px;
        display:flex;
        flex-direction:column;
        justify-content:center;
        border:1px solid #36393e;
        border-radius:18px;
        background:linear-gradient(145deg,rgba(19,21,24,.998),rgba(12,13,15,.998));
        color:#fff;
        box-shadow:0 8px 22px rgba(0,0,0,.25);
      }
      .reward-v3-spin-copy b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .reward-v3-spin-copy small{display:block;margin-top:4px;color:#b7b2aa;font-size:8px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .reward-v3-spin-card button{
        width:100%;
        min-height:38px;
        margin-top:10px;
        border:0;
        border-radius:999px;
        background:linear-gradient(180deg,#ffe071,#e7ab2d);
        color:#161006;
        font-size:10px;
        font-weight:900;
        box-shadow:inset 0 1px rgba(255,255,255,.55);
      }
      .reward-v3-spin-card button:disabled{background:linear-gradient(180deg,#8f7936,#79662d);opacity:.96;color:#15130c}
      .reward-v3-task-section{
        padding:15px 20px 18px;
        background:#050607;
      }
      .reward-v3-task-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .reward-v3-task-head h3{margin:0;color:#f1ca58;font-size:16px;letter-spacing:-.2px}
      .reward-v3-task-head button{border:0;background:none;color:#9da1a8;font-size:9.5px;padding:5px 0}
      .reward-v3-task-list{display:flex;flex-direction:column;gap:8px}
      .reward-v3-task-card{
        display:grid;
        grid-template-columns:42px minmax(0,1fr) auto;
        gap:8px 10px;
        align-items:center;
        padding:12px;
        border:1px solid #292d35;
        border-radius:14px;
        background:#0d0f12;
      }
      .reward-v3-task-icon{
        grid-row:1/4;
        width:42px;height:42px;border-radius:11px;
        display:grid;place-items:center;
        background:#171a1f;border:1px solid #333740;color:#efc95f;font-size:18px;font-weight:900;
      }
      .reward-v3-task-copy{min-width:0}
      .reward-v3-task-copy b{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .reward-v3-task-copy small{display:block;margin-top:3px;color:#989da5;font-size:8.7px;line-height:1.35}
      .reward-v3-task-reward{align-self:start;color:#ffd75d;font-size:9px;font-weight:900;white-space:nowrap}
      .reward-v3-progress{grid-column:2/4;height:5px;border-radius:999px;background:#272a30;overflow:hidden}
      .reward-v3-progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#bd7b08,#ffd85b)}
      .reward-v3-task-action{grid-column:2/4;min-height:34px;border:1px solid #66521b;border-radius:10px;background:#19160d;color:#e9ca62;font-size:9px;font-weight:850}
      .reward-v3-task-action:disabled{border-color:#30333a;background:#121418;color:#7f8389}
      .reward-v3-empty{
        min-height:126px;
        display:grid;
        place-items:center;
        padding:20px;
        border:1px solid #292d35;
        border-radius:14px;
        background:#0d0f12;
        color:#969ba3;
        text-align:center;
        font-size:10px;
        line-height:1.5;
      }
      @media(max-width:370px){
        .reward-v3-root{width:calc(100% + 26px);margin-left:-13px;margin-right:-13px}
        .reward-v3-task-section{padding-left:16px;padding-right:16px}
        .reward-v3-wallet{padding:8px 9px}.reward-v3-wallet b{font-size:13px}.reward-v3-wallet small{font-size:8px}.reward-v3-wallet span{font-size:7px}
        .reward-v3-news span{font-size:8px}.reward-v3-news em{font-size:7px}
        .reward-v3-spin-copy b{font-size:10px}.reward-v3-spin-copy small{font-size:7px}.reward-v3-spin-card button{min-height:34px;font-size:9px;margin-top:7px}
      }
    `;
    document.head.appendChild(style);
  }

  function activeTasks() {
    return (model.campaigns || [])
      .flatMap(campaign => (campaign.tasks || []).map(task => ({
        ...task,
        campaignId:campaign.id,
        campaignTitle:campaign.title
      })))
      .filter(task => task.enabled !== false);
  }

  function buildDynamicLayers(visual) {
    const wallet = document.createElement('div');
    wallet.id = 'rewardV3Wallet';
    wallet.className = 'reward-v3-live reward-v3-wallet';
    wallet.addEventListener('click', () => window.openRewardHistory?.());
    visual.appendChild(wallet);

    const news = document.createElement('div');
    news.id = 'rewardV3News';
    news.className = 'reward-v3-live reward-v3-news';
    news.addEventListener('click', () => {
      const campaign = model.campaigns?.[0];
      toast(campaign?.title || 'No active bonus campaign');
    });
    visual.appendChild(news);

    const spin = document.createElement('div');
    spin.id = 'rewardV3SpinCard';
    spin.className = 'reward-v3-live reward-v3-spin-card';
    visual.appendChild(spin);
  }

  function sourceYFromFramePercent(framePercent) {
    return CROP_TOP + (Number(framePercent) / 100) * FRAME_H;
  }

  function hitAction(nx, ny) {
    const sy = sourceYFromFramePercent(ny);
    const rects = [
      ['explore',9,407,25,48],
      ['more',77,970,17,40],
      ['new',7,1010,20.5,216],
      ['invite',29,1010,20.5,216],
      ['tasks',51,1010,20.5,216],
      ['events',73,1010,20.5,216]
    ];
    for (const [action,x,y,w,h] of rects) {
      if (nx >= x && nx <= x + w && sy >= y && sy <= y + h) return action;
    }
    return '';
  }

  function act(action) {
    if (action === 'explore' || action === 'more') return window.openRewardHistory?.();
    if (action === 'new') return window.openEvent?.('newuser');
    if (action === 'invite') return window.openReferral?.();
    if (action === 'tasks') return scrollToTasks();
    if (action === 'events') return window.openEvent?.('special');
  }

  function build() {
    const page = document.getElementById('rewards');
    if (!page) return;
    injectStyles();
    page.classList.add('reward-v3-ready');
    page.querySelector('.reward-v3-root')?.remove();

    const root = document.createElement('div');
    root.className = 'reward-v3-root';

    const visual = document.createElement('div');
    visual.className = 'reward-v3-visual';

    const art = document.createElement('img');
    art.className = 'reward-v3-art';
    art.src = assets.content;
    art.alt = 'digiRupee Rewards';
    visual.appendChild(art);

    const rotor = document.createElement('img');
    rotor.className = 'reward-v3-rotor';
    rotor.id = 'rewardV3Rotor';
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
      if (moved || event.target.closest('.reward-v3-live')) return;
      const box = visual.getBoundingClientRect();
      const nx = (event.clientX - box.left) / box.width * 100;
      const ny = (event.clientY - box.top) / box.height * 100;
      const action = hitAction(nx, ny);
      if (action) act(action);
    });

    root.appendChild(visual);

    const tasks = document.createElement('section');
    tasks.className = 'reward-v3-task-section';
    tasks.id = 'rewardV3TaskSection';
    tasks.innerHTML = `<div class="reward-v3-task-head"><h3>Task Center</h3><button type="button" id="rewardV3TaskToggle">View All ›</button></div><div class="reward-v3-task-list" id="rewardV3TaskList"></div>`;
    root.appendChild(tasks);
    page.appendChild(root);

    document.getElementById('rewardV3TaskToggle')?.addEventListener('click', () => {
      const list = activeTasks();
      if (list.length <= 1) return scrollToTasks();
      showAllTasks = !showAllTasks;
      renderTaskSection();
      requestAnimationFrame(scrollToTasks);
    });

    renderDynamic();
  }

  function renderDynamic() {
    const wallet = document.getElementById('rewardV3Wallet');
    if (wallet) wallet.innerHTML = `<small>My Rewards</small><b>${num(model.rewards?.balance || 0)} USDT</b><span>Available reward balance ›</span>`;

    const campaign = model.campaigns?.[0];
    const news = document.getElementById('rewardV3News');
    if (news) news.innerHTML = `<span>${esc(campaign?.title || 'No active bonus campaign')}</span><em>${campaign ? 'Active' : 'Waiting'}</em>`;

    const wheel = model.wheel;
    const spinCard = document.getElementById('rewardV3SpinCard');
    if (spinCard) {
      const canSpin = !!wheel?.canSpin;
      const previous = wheel?.previousResult?.rewardAmount;
      const detail = canSpin
        ? '1 spin available today'
        : wheel?.nextEligibleAt
          ? `Next ${new Date(wheel.nextEligibleAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}`
          : 'Come back tomorrow';
      spinCard.innerHTML = `<div class="reward-v3-spin-copy"><b>${canSpin ? 'Ready to Spin' : previous ? `Today: ${num(previous)} USDT` : 'Used Today'}</b><small>${esc(detail)}</small></div><button type="button" id="rewardV3SpinButton" ${canSpin && !spinning ? '' : 'disabled'}>${spinning ? 'Spinning…' : canSpin ? 'Spin Now →' : 'Used Today'}</button>`;
      document.getElementById('rewardV3SpinButton')?.addEventListener('click', spinApproved);
    }

    renderTaskSection();
  }

  function taskCard(task) {
    const rawProgress = Number(task.eligibility?.progress || 0);
    const rawTarget = Number(task.eligibility?.target || 1);
    const progress = Number.isFinite(rawProgress) ? rawProgress : 0;
    const target = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : 1;
    const percent = Math.max(0, Math.min(100, progress / target * 100));
    const eligible = !!task.eligibility?.eligible && !task.claim;
    const claimed = !!task.claim;
    const actionText = claimed ? esc(task.claim.status || 'Claimed') : eligible ? 'Claim Now' : 'In Progress';
    return `<article class="reward-v3-task-card">
      <div class="reward-v3-task-icon">✓</div>
      <div class="reward-v3-task-copy"><b>${esc(task.title || 'Reward task')}</b><small>${esc(task.description || task.campaignTitle || 'Complete this task to earn rewards.')}</small></div>
      <div class="reward-v3-task-reward">${num(task.rewardAmount || 0)} USDT</div>
      <div class="reward-v3-progress"><i style="width:${percent}%"></i></div>
      <button class="reward-v3-task-action" type="button" data-task-id="${esc(task.id)}" data-campaign-id="${esc(task.campaignId)}" ${eligible ? '' : 'disabled'}>${actionText}</button>
    </article>`;
  }

  function renderTaskSection() {
    const list = document.getElementById('rewardV3TaskList');
    const toggle = document.getElementById('rewardV3TaskToggle');
    if (!list) return;
    const tasks = activeTasks();
    if (toggle) {
      toggle.textContent = tasks.length > 1 ? (showAllTasks ? 'Collapse ↑' : 'View All ›') : 'View All ›';
      toggle.disabled = tasks.length === 0;
    }
    if (!tasks.length) {
      list.innerHTML = '<div class="reward-v3-empty">No active reward tasks right now.<br>New admin campaigns will appear here.</div>';
      return;
    }
    const visible = showAllTasks ? tasks : [tasks.find(task => !task.claim) || tasks[0]];
    list.innerHTML = visible.map(taskCard).join('');
    list.querySelectorAll('.reward-v3-task-action:not(:disabled)').forEach(button => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          if (typeof window.claimTask !== 'function') throw new Error('Task claim is unavailable');
          await window.claimTask(button.dataset.taskId, button.dataset.campaignId);
        } catch (error) {
          toast(error.message || 'Could not claim task');
        }
      });
    });
  }

  function scrollToTasks() {
    document.getElementById('rewardV3TaskSection')?.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  async function refreshRewardState() {
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
      let index = segments.findIndex(segment => String(segment.id || '') === String(result.result?.segmentId || ''));
      if (index < 0) index = segments.findIndex(segment => String(segment.label || '') === String(result.result?.label || ''));
      if (index < 0) index = segments.findIndex(segment => Number(segment.rewardAmount) === Number(result.result?.rewardAmount));
      if (index < 0) index = 0;

      const rotor = document.getElementById('rewardV3Rotor');
      if (!rotor) throw new Error('Reward wheel is unavailable');
      const slice = 360 / Math.max(1, segments.length || 8);
      const current = ((rotation % 360) + 360) % 360;
      const target = ((360 - index * slice) % 360 + 360) % 360;
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
      await refreshRewardState();
    } catch (error) {
      toast(error.message || 'Could not spin the wheel');
    } finally {
      spinning = false;
      renderDynamic();
    }
  }

  function consumeState(detail) {
    if (!detail) return;
    if (detail.rewards) model.rewards = detail.rewards;
    if (detail.wheel) model.wheel = detail.wheel;
    if (Array.isArray(detail.campaigns)) model.campaigns = detail.campaigns;
    if (document.getElementById('rewards')?.classList.contains('active')) {
      if (!document.querySelector('.reward-v3-root')) build();
      else renderDynamic();
    }
  }

  function enter() {
    build();
    if (!model.rewards || !model.wheel) refreshRewardState();
  }

  const previousGo = window.go;
  if (typeof previousGo === 'function') {
    window.go = function(page) {
      previousGo(page);
      if (page === 'rewards') requestAnimationFrame(enter);
    };
  }

  if (typeof window.__digiStateSnapshot === 'function') consumeState(window.__digiStateSnapshot());
  window.addEventListener('digirupee:state', event => consumeState(event.detail || {}));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && document.getElementById('rewards')?.classList.contains('active')) {
      if (!document.querySelector('.reward-v3-root')) build();
      renderDynamic();
    }
  });

  if (document.getElementById('rewards')?.classList.contains('active')) requestAnimationFrame(enter);
  window.__rewardV3 = { build, refresh:refreshRewardState, spin:spinApproved, scrollToTasks };
})();
