(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[ch]));
  const num = value => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 6 });

  const model = { rewards:null, wheel:null, campaigns:[] };
  let spinning = false;
  let rotation = 0;
  let showAllTasks = false;

  async function api(path, options = {}) {
    const headers = {
      ...(options.body ? { 'Content-Type':'application/json' } : {}),
      ...(options.headers || {})
    };
    const response = await fetch(`/api/digirupee${path}`, { ...options, headers, credentials:'include' });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
    return payload || {};
  }

  function idempotencyKey() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('');
  }

  function toast(message, error = false) {
    if (typeof window.toastMsg === 'function') window.toastMsg(message, error);
  }

  function injectStyles() {
    document.getElementById('digi-rewards-v3-css')?.remove();
    if (document.getElementById('digi-rewards-v4-css')) return;
    const style = document.createElement('style');
    style.id = 'digi-rewards-v4-css';
    style.textContent = `
      #rewards.reward-v4-ready{padding:0 0 calc(18px + var(--digi-safe-bottom,0px))!important;background:#050607!important;box-sizing:border-box}
      #rewards.reward-v4-ready>*:not(.reward-v4-root){display:none!important}
      .reward-v4-root{display:flex;flex-direction:column;gap:8px;padding-top:2px;color:#f8f2e8}
      .reward-v4-hero{position:relative;overflow:hidden;min-height:195px;border:1px solid #7a3a20;border-radius:18px;padding:15px;background:
        radial-gradient(circle at 80% 28%,rgba(255,201,71,.28),transparent 18%),
        radial-gradient(circle at 78% 76%,rgba(235,73,52,.26),transparent 28%),
        linear-gradient(135deg,#4c0b0b 0%,#230809 56%,#0d0a0a 100%);
        box-shadow:inset 0 1px rgba(255,255,255,.04)}
      .reward-v4-hero:before,.reward-v4-hero:after{content:'₮';position:absolute;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle at 30% 25%,#fff0a0,#e3a323 68%,#724500);color:#7c4c00;font-weight:950;box-shadow:0 8px 18px #0005}
      .reward-v4-hero:before{width:58px;height:58px;right:24px;top:26px;font-size:26px;transform:rotate(12deg)}
      .reward-v4-hero:after{width:38px;height:38px;right:105px;bottom:27px;font-size:18px;transform:rotate(-15deg)}
      .reward-v4-copy{position:relative;z-index:2;max-width:62%}
      .reward-v4-kicker{display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border:1px solid #8f5a1d;border-radius:999px;background:#29120d;color:#f3c95a;font-size:8.5px;font-weight:900;letter-spacing:.06em}
      .reward-v4-copy h2{margin:10px 0 7px;font-size:29px;line-height:.98;letter-spacing:-1.1px;color:#fff4dc}
      .reward-v4-copy p{margin:0;color:#d8c4b4;font-size:10px;line-height:1.45}
      .reward-v4-explore{margin-top:14px;min-height:38px;border:0;border-radius:999px;padding:0 14px;background:linear-gradient(180deg,#ffe47b,#eeb338);color:#1e1404;font-size:9.5px;font-weight:900}
      .reward-v4-wallet{position:absolute;z-index:3;right:14px;bottom:15px;width:145px;padding:12px;border:1px solid #8f6a28;border-radius:15px;background:linear-gradient(145deg,#34231a,#171414);box-shadow:0 12px 25px #0006}
      .reward-v4-wallet small{display:block;color:#bfb2a5;font-size:8px}.reward-v4-wallet b{display:block;margin-top:5px;color:#ffd75d;font-size:18px}.reward-v4-wallet span{display:block;margin-top:4px;color:#888177;font-size:7.8px}
      .reward-v4-news{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;width:100%;min-height:40px;padding:0 11px;border:1px solid #4a2f30;border-radius:12px;background:#0e1013;text-align:left;box-sizing:border-box;overflow:hidden}
      .reward-v4-news strong{display:flex;align-items:center;gap:5px;min-width:0;font-size:8.5px;line-height:1.2;color:#f3c957;white-space:nowrap}.reward-v4-news strong i{width:5px;height:5px;flex:none;border-radius:50%;background:#e8514d;box-shadow:0 0 0 3px #e8514d22}.reward-v4-news span{min-width:0;font-size:8.8px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.reward-v4-news em{flex:none;padding-left:3px;font-size:7.8px;line-height:1.2;color:#858a92;font-style:normal;white-space:nowrap}
      .reward-v4-wheel-card{display:grid;grid-template-columns:205px minmax(0,1fr);gap:11px;align-items:center;min-width:0;padding:13px;border:1px solid #3f2f28;border-radius:16px;background:linear-gradient(145deg,#140f0d,#0b0d10);box-sizing:border-box}
      .reward-v4-wheel-wrap{position:relative;width:195px;height:195px;margin:auto}
      .reward-v4-pointer{position:absolute;z-index:8;left:50%;top:-3px;transform:translateX(-50%);width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-top:20px solid #ffd75d;filter:drop-shadow(0 2px 3px #000)}
      .reward-v4-wheel{position:absolute;inset:5px;border-radius:50%;border:7px solid #d9a72f;background:conic-gradient(#b31e2c 0 45deg,#f7dd89 45deg 90deg,#a91524 90deg 135deg,#efd17c 135deg 180deg,#b31e2c 180deg 225deg,#f7dd89 225deg 270deg,#a91524 270deg 315deg,#efd17c 315deg 360deg);box-shadow:0 0 0 4px #6f4514,0 0 22px #d19b2838;transition:transform 4.6s cubic-bezier(.12,.96,.16,1)}
      .reward-v4-wheel:after{content:'SPIN';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:62px;height:62px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,#fff2a6,#eeb332 65%,#8e570f);border:3px solid #7c4d12;color:#4a2d03;font-size:13px;font-weight:950;box-shadow:0 4px 12px #0007}
      .reward-v4-wheel-label{position:absolute;z-index:4;left:50%;top:50%;width:46px;margin-left:-23px;margin-top:-9px;text-align:center;font-size:9px;font-weight:950;color:#251100;transform-origin:23px 9px;pointer-events:none;text-shadow:0 1px #fff5}
      .reward-v4-wheel-copy h3{margin:0;font-size:20px}.reward-v4-wheel-copy p{margin:7px 0 0;color:#aaa39b;font-size:9.5px;line-height:1.45}
      .reward-v4-spin-status{margin-top:12px;padding:10px;border:1px solid #292d35;border-radius:12px;background:#111419}.reward-v4-spin-status b{display:block;font-size:11px}.reward-v4-spin-status small{display:block;margin-top:4px;color:#8d929a;font-size:8.5px;line-height:1.4}
      .reward-v4-spin{width:100%;min-height:40px;margin-top:9px;border:0;border-radius:999px;background:linear-gradient(180deg,#ffe47d,#eeb43d);color:#1b1305;font-size:10px;font-weight:950}.reward-v4-spin:disabled{background:#41391f;color:#a8996a}
      .reward-v4-zone{padding:2px 0}.reward-v4-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:3px 2px 7px}.reward-v4-section-head h3{margin:0;color:#f1cf67;font-size:14px;line-height:1.2}.reward-v4-section-head button{border:0;background:none;color:#92969d;font-size:8.5px;white-space:nowrap}
      .reward-v4-zone-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
      .reward-v4-zone-card{min-height:100px;padding:10px 7px;border:1px solid #302d2b;border-radius:12px;background:#0d0f12;text-align:center;color:#fff}
      .reward-v4-zone-icon{width:34px;height:34px;margin:0 auto 7px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(145deg,#39250d,#d29a24);font-size:17px}
      .reward-v4-zone-card b{display:block;font-size:8.7px}.reward-v4-zone-card small{display:block;margin-top:4px;color:#8e939b;font-size:7.5px;line-height:1.25}
      .reward-v4-tasks{padding-top:5px}.reward-v4-task-list{display:flex;flex-direction:column;gap:8px}
      .reward-v4-task{padding:12px;border:1px solid #292d35;border-radius:14px;background:#0d0f12}
      .reward-v4-task-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.reward-v4-task h4{margin:0;font-size:11px}.reward-v4-task p{margin:4px 0 0;color:#92979f;font-size:8.7px;line-height:1.4}
      .reward-v4-task-reward{color:#ffd75d;font-size:9px;font-weight:900;white-space:nowrap}.reward-v4-task-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px}
      .reward-v4-progress{height:5px;flex:1;border-radius:999px;background:#272a30;overflow:hidden}.reward-v4-progress i{display:block;height:100%;background:linear-gradient(90deg,#c68012,#ffd960)}
      .reward-v4-task button{min-width:88px;min-height:32px;border:1px solid #67531e;border-radius:9px;background:#19160d;color:#e7ca66;font-size:8.5px;font-weight:850}.reward-v4-task button:disabled{border-color:#30333a;background:#121418;color:#777c84}
      .reward-v4-empty{min-height:115px;display:grid;place-items:center;padding:18px;border:1px solid #292d35;border-radius:14px;background:#0d0f12;color:#92979f;text-align:center;font-size:9.5px;line-height:1.5}
      /* Readability pass: raise only tiny supporting text without changing card geometry. */
      .reward-v4-kicker{font-size:9.3px}
      .reward-v4-copy p{font-size:10.5px}.reward-v4-explore{font-size:10px}
      .reward-v4-wallet small{font-size:8.8px}.reward-v4-wallet span{font-size:8.6px}
      .reward-v4-news strong{font-size:9.2px}.reward-v4-news span{font-size:9.4px}.reward-v4-news em{font-size:8.6px}
      .reward-v4-wheel-label{font-size:9.2px}.reward-v4-wheel-copy p{font-size:10px}
      .reward-v4-spin-status small{font-size:9.1px}.reward-v4-section-head button{font-size:9.2px}
      .reward-v4-zone-card b{font-size:9.3px}.reward-v4-zone-card small{font-size:8.5px;line-height:1.3}
      .reward-v4-task p{font-size:9.4px}.reward-v4-task-reward{font-size:9.4px}.reward-v4-task button{font-size:9.2px}
      @media(max-width:370px){
        .reward-v4-copy{max-width:70%}.reward-v4-copy h2{font-size:25px}.reward-v4-wallet{width:128px;padding:10px}.reward-v4-wallet b{font-size:15px}
        .reward-v4-wheel-card{grid-template-columns:165px minmax(0,1fr);gap:8px;padding:11px}.reward-v4-wheel-wrap{width:158px;height:158px}
        .reward-v4-wheel-label{font-size:8.2px}.reward-v4-zone-grid{grid-template-columns:1fr 1fr}.reward-v4-zone-card{min-height:84px}
      }
    `;
    document.head.appendChild(style);
  }

  function currentCampaigns() {
    return Array.isArray(model.campaigns) ? model.campaigns : [];
  }

  function taskList() {
    return currentCampaigns().flatMap(campaign => (campaign.tasks || []).map(task => ({
      ...task,
      campaignTitle:campaign.title,
      campaignActive:campaign.active !== false && !campaign.upcoming
    }))).filter(task => task.enabled !== false);
  }

  function build() {
    const page = $('rewards'); if (!page) return;
    injectStyles();
    page.classList.add('reward-v4-ready');
    page.classList.remove('reward-v3-ready');
    page.querySelector('.reward-v4-root')?.remove();

    const root = document.createElement('div');
    root.className = 'reward-v4-root';
    root.innerHTML = `
      <section class="reward-v4-hero">
        <div class="reward-v4-copy"><span class="reward-v4-kicker">BONUS ZONE</span><h2>Play More.<br>Earn More.</h2><p>Daily rewards, referrals and campaign tasks—powered by your real account activity.</p><button class="reward-v4-explore" id="rewardV4Explore" type="button">Explore Rewards →</button></div>
        <button class="reward-v4-wallet" id="rewardV4Wallet" type="button"><small>My Rewards</small><b id="rewardV4Balance">0 USDT</b><span>View reward history ›</span></button>
      </section>
      <button class="reward-v4-news" id="rewardV4News" type="button"><strong><i aria-hidden="true"></i>LIVE BONUS NEWS</strong><span id="rewardV4NewsText">Loading campaigns…</span><em id="rewardV4NewsState">Waiting</em></button>
      <section class="reward-v4-wheel-card">
        <div class="reward-v4-wheel-wrap"><div class="reward-v4-pointer"></div><div class="reward-v4-wheel" id="rewardV4Wheel"></div></div>
        <div class="reward-v4-wheel-copy"><span class="reward-v4-kicker">DAILY SPIN</span><h3>Golden Daily Wheel</h3><p>One server-controlled spin per eligible day. The result is selected by the backend, then the wheel animates to that reward.</p><div class="reward-v4-spin-status"><b id="rewardV4SpinTitle">Loading…</b><small id="rewardV4SpinNote">Checking availability</small><button class="reward-v4-spin" id="rewardV4Spin" type="button">Spin Now</button></div></div>
      </section>
      <section class="reward-v4-zone"><div class="reward-v4-section-head"><h3>Reward Zone</h3><button id="rewardV4More" type="button">More Rewards ›</button></div><div class="reward-v4-zone-grid">
        <button class="reward-v4-zone-card" data-zone="newuser" type="button"><span class="reward-v4-zone-icon">🎁</span><b>New User Bonus</b><small>Get started & earn USDT</small></button>
        <button class="reward-v4-zone-card" data-zone="invite" type="button"><span class="reward-v4-zone-icon">👥</span><b>Invite & Earn</b><small>Share and earn together</small></button>
        <button class="reward-v4-zone-card" data-zone="tasks" type="button"><span class="reward-v4-zone-icon">✓</span><b>Complete Tasks</b><small>Campaign rewards</small></button>
        <button class="reward-v4-zone-card" data-zone="events" type="button"><span class="reward-v4-zone-icon">🏆</span><b>Special Events</b><small>Limited-time offers</small></button>
      </div></section>
      <section class="reward-v4-tasks" id="rewardV4Tasks"><div class="reward-v4-section-head"><h3>Task Center</h3><button id="rewardV4TaskToggle" type="button">View All ›</button></div><div class="reward-v4-task-list" id="rewardV4TaskList"></div></section>
    `;
    page.appendChild(root);

    $('rewardV4Wallet')?.addEventListener('click', () => window.openRewardHistory?.());
    $('rewardV4Explore')?.addEventListener('click', () => $('rewardV4Tasks')?.scrollIntoView({behavior:'smooth',block:'start'}));
    $('rewardV4More')?.addEventListener('click', () => window.openRewardHistory?.());
    $('rewardV4News')?.addEventListener('click', () => {
      const campaign = currentCampaigns()[0];
      toast(campaign?.title || 'No reward campaign is currently available');
    });
    root.querySelectorAll('[data-zone]').forEach(button => button.addEventListener('click', () => {
      const zone = button.dataset.zone;
      if (zone === 'invite') return window.openReferral?.();
      if (zone === 'tasks') return $('rewardV4Tasks')?.scrollIntoView({behavior:'smooth',block:'start'});
      return window.openEvent?.(zone === 'newuser' ? 'newuser' : 'special');
    }));
    $('rewardV4TaskToggle')?.addEventListener('click', () => { showAllTasks = !showAllTasks; renderTasks(); });
    $('rewardV4Spin')?.addEventListener('click', spin);
    renderAll();
  }

  function renderWheelSegments() {
    const wheel = $('rewardV4Wheel'); if (!wheel) return;
    wheel.querySelectorAll('.reward-v4-wheel-label').forEach(node => node.remove());
    const segments = model.wheel?.segments || [];
    const count = Math.max(8, segments.length || 8);
    for (let i = 0; i < 8; i++) {
      const segment = segments[i];
      const label = document.createElement('span');
      label.className = 'reward-v4-wheel-label';
      const angle = i * 45 + 22.5;
      label.style.transform = `rotate(${angle}deg) translateY(-68px) rotate(${-angle}deg)`;
      label.textContent = segment ? `${num(segment.rewardAmount)}₮` : '—';
      wheel.appendChild(label);
    }
  }

  function renderBalance() {
    if ($('rewardV4Balance')) $('rewardV4Balance').textContent = `${num(model.rewards?.balance || 0)} USDT`;
  }

  function renderNews() {
    const campaigns = currentCampaigns();
    const active = campaigns.find(campaign => campaign.active !== false && !campaign.upcoming) || campaigns[0];
    if ($('rewardV4NewsText')) $('rewardV4NewsText').textContent = active?.title || 'No active bonus campaign';
    if ($('rewardV4NewsState')) $('rewardV4NewsState').textContent = active ? (active.upcoming ? 'Upcoming' : 'Active') : 'Waiting';
  }

  function renderSpin() {
    const wheel = model.wheel;
    const button = $('rewardV4Spin');
    if (!button) return;
    const can = !!wheel?.enabled && !!wheel?.canSpin && !spinning;
    button.disabled = !can;
    button.textContent = spinning ? 'Spinning…' : can ? 'Spin Now →' : 'Used Today';
    if ($('rewardV4SpinTitle')) $('rewardV4SpinTitle').textContent = !wheel?.enabled ? 'Daily wheel disabled' : wheel.canSpin ? 'Ready to Spin' : wheel.previousResult ? `Today: ${num(wheel.previousResult.rewardAmount)} USDT` : 'Used Today';
    if ($('rewardV4SpinNote')) $('rewardV4SpinNote').textContent = wheel?.canSpin ? '1 spin available today' : wheel?.nextEligibleAt ? `Next ${new Date(wheel.nextEligibleAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}` : 'Come back later';
  }

  function renderTasks() {
    const host = $('rewardV4TaskList'); if (!host) return;
    const tasks = taskList();
    const visible = showAllTasks ? tasks : tasks.slice(0,3);
    const toggle = $('rewardV4TaskToggle');
    if (toggle) { toggle.disabled = tasks.length <= 3; toggle.textContent = showAllTasks ? 'Collapse ↑' : 'View All ›'; }
    if (!tasks.length) {
      host.innerHTML = '<div class="reward-v4-empty">No visible reward tasks right now.<br>Enabled current or upcoming admin tasks will appear here.</div>';
      return;
    }
    host.innerHTML = visible.map(task => {
      const progress = Number(task.eligibility?.progress || 0);
      const target = Number(task.eligibility?.target || 0);
      const percent = target > 0 ? Math.max(0,Math.min(100,progress/target*100)) : 0;
      const upcoming = !!task.upcoming || task.active === false || task.campaignActive === false;
      const claimed = !!task.claim;
      const eligible = !upcoming && !!task.eligibility?.eligible && !claimed;
      const text = claimed ? (task.claim.status || 'Claimed') : upcoming ? 'Upcoming' : eligible ? 'Claim Now' : 'In Progress';
      return `<article class="reward-v4-task"><div class="reward-v4-task-top"><div><h4>${esc(task.title || 'Reward task')}</h4><p>${esc(task.description || task.campaignTitle || '')}${upcoming && task.startsAt ? `<br>Starts ${esc(new Date(task.startsAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}))}` : ''}</p></div><span class="reward-v4-task-reward">${num(task.rewardAmount || 0)} USDT</span></div><div class="reward-v4-task-meta"><div class="reward-v4-progress"><i style="width:${percent}%"></i></div><button type="button" data-task="${esc(task.id)}" data-campaign="${esc(task.campaignId)}" ${eligible ? '' : 'disabled'}>${esc(text)}</button></div></article>`;
    }).join('');
    host.querySelectorAll('[data-task]:not(:disabled)').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        if (typeof window.claimTask !== 'function') throw new Error('Task claim is unavailable');
        await window.claimTask(button.dataset.task, button.dataset.campaign);
        await refresh();
      } catch (error) { toast(error.message || 'Could not claim task', true); }
    }));
  }

  function renderAll() {
    renderBalance(); renderNews(); renderWheelSegments(); renderSpin(); renderTasks();
  }

  async function refresh() {
    try {
      const [rewards,wheel,campaigns] = await Promise.all([api('/rewards'),api('/wheel'),api('/campaigns')]);
      model.rewards = rewards; model.wheel = wheel; model.campaigns = campaigns.campaigns || [];
      renderAll();
    } catch (error) {
      if (!/401|session/i.test(String(error.message))) toast(error.message, true);
    }
  }

  async function spin() {
    if (spinning || !model.wheel?.canSpin) return;
    spinning = true; renderSpin();
    try {
      const result = await api('/wheel/spin',{method:'POST',headers:{'Idempotency-Key':idempotencyKey()}});
      const segments = model.wheel?.segments || [];
      let index = segments.findIndex(segment => String(segment.id || '') === String(result.result?.segmentId || ''));
      if (index < 0) index = segments.findIndex(segment => Number(segment.rewardAmount) === Number(result.result?.rewardAmount));
      if (index < 0) index = 0;
      const wheel = $('rewardV4Wheel');
      const current = ((rotation % 360) + 360) % 360;
      const target = (360 - index * 45) % 360;
      rotation += 360 * 7 + ((target - current + 360) % 360);
      if (wheel) wheel.style.transform = `rotate(${rotation}deg)`;
      await new Promise(resolve => setTimeout(resolve,4700));
      toast(`You won ${num(result.result?.rewardAmount || 0)} USDT`);
      await refresh();
    } catch (error) {
      toast(error.message || 'Could not spin the wheel', true);
    } finally {
      spinning = false; renderSpin();
    }
  }

  function consumeState(detail) {
    if (!detail) return;
    if (detail.rewards) model.rewards = detail.rewards;
    if (detail.wheel) model.wheel = detail.wheel;
    if (Array.isArray(detail.campaigns)) model.campaigns = detail.campaigns;
    if ($('rewards')?.classList.contains('active')) {
      if (!$('rewards')?.querySelector('.reward-v4-root')) build(); else renderAll();
    }
  }

  function enter() {
    if (!$('rewards')?.querySelector('.reward-v4-root')) build();
    renderAll();
    refresh();
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
    if (!document.hidden && $('rewards')?.classList.contains('active')) refresh();
  });
})();
