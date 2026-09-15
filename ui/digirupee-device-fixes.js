(() => {
  'use strict';

  const REF_KEY = 'digirupee-pending-referral';
  const validReferral = value => /^DGR[A-F0-9]{10}$/.test(String(value || '').trim().toUpperCase());
  const normalizeReferral = value => String(value || '').trim().toUpperCase();
  let latestState = null;
  let permanentProgram = null;
  let permanentFetchedAt = 0;
  let permanentLoading = false;

  function installResponsiveLayout() {
    if (document.getElementById('digirupee-device-layout-fix')) return;
    const style = document.createElement('style');
    style.id = 'digirupee-device-layout-fix';
    style.textContent = `
      /* Preserve the approved app UI and typography. */
      body{overflow-x:hidden!important}
      .app,.page,.header,.nav,.card{box-sizing:border-box;max-width:100%}
      .page{width:100%;overflow-x:hidden!important}
      img,svg,canvas{max-width:100%}

      #rewards.reward-v4-ready{
        padding:0 16px calc(28px + var(--digi-safe-bottom,0px))!important;
        box-sizing:border-box!important;
      }
      #rewards .reward-v4-root{width:100%!important;max-width:100%!important;gap:12px!important;box-sizing:border-box!important}
      #rewards .reward-v4-hero{
        min-height:214px!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;overflow:hidden!important;
        background:radial-gradient(circle at 83% 22%,rgba(255,205,76,.22),transparent 20%),radial-gradient(circle at 80% 78%,rgba(204,46,34,.25),transparent 30%),linear-gradient(135deg,#4b0b0b 0%,#260809 55%,#0c0909 100%)!important;
      }

      /* Bring the approved girl artwork back, but crop to the portrait area so the
         old text/cards baked into the source artwork do not become live UI again. */
      #rewards .reward-v4-mascot{
        display:block!important;position:absolute!important;z-index:1!important;top:0!important;right:-1%!important;
        width:43%!important;height:100%!important;overflow:hidden!important;opacity:.98!important;pointer-events:none!important;
        -webkit-mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.20) 12%,#000 38%,#000 100%)!important;
        mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.20) 12%,#000 38%,#000 100%)!important;
      }
      #rewards .reward-v4-mascot img{
        position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;
        object-fit:cover!important;object-position:100% 20%!important;filter:saturate(1.04) contrast(1.03)!important;
      }
      #rewards .reward-v4-hero:before{height:42%!important;background:linear-gradient(180deg,transparent 0,rgba(34,10,10,.90) 58%,#180909 100%)!important}
      #rewards .reward-v4-copy{max-width:60%!important}
      #rewards .reward-v4-wallet{right:14px!important;bottom:14px!important;width:140px!important;max-width:38%!important;box-sizing:border-box!important}
      #rewards .reward-v4-news,#rewards .reward-v4-wheel-card,#rewards .reward-v4-task,#rewards .reward-v4-zone-card{max-width:100%!important;box-sizing:border-box!important}

      /* Home reward ticker: intentionally isolated so the existing Home UI is untouched. */
      .digi-home-reward-news{display:flex;align-items:center;gap:9px;width:100%;min-height:35px;margin:9px 0 2px;padding:0 10px;border:1px solid #3b3220;border-radius:11px;background:#0d0f12;box-sizing:border-box;overflow:hidden}
      .digi-home-reward-news-label{display:flex;align-items:center;gap:5px;flex:none;color:#f0ca59;font-size:9px;font-weight:900;letter-spacing:.035em;white-space:nowrap}
      .digi-home-reward-news-label i{width:6px;height:6px;border-radius:50%;background:#ef5454;box-shadow:0 0 0 3px #ef545422}
      .digi-home-reward-news-window{min-width:0;flex:1;overflow:hidden;white-space:nowrap}
      .digi-home-reward-news-track{display:flex;width:max-content;will-change:transform;animation:digiRewardNewsMove 24s linear infinite}
      .digi-home-reward-news-track span{display:block;padding-right:48px;color:#d8d8da;font-size:10px;white-space:nowrap}
      @keyframes digiRewardNewsMove{from{transform:translateX(0)}to{transform:translateX(-50%)}}
      body.digi-light .digi-home-reward-news{background:#fff!important;border-color:#e1d6b7!important}.digi-light .digi-home-reward-news-track span{color:#3d4147!important}

      .digi-referral-applied{display:block!important;margin-top:7px;color:#69d7a9!important;font-weight:750!important}

      @media(max-width:380px){
        #rewards.reward-v4-ready{padding-left:14px!important;padding-right:14px!important}
        #rewards .reward-v4-hero{min-height:222px!important}
        #rewards .reward-v4-copy{max-width:62%!important}
        #rewards .reward-v4-mascot{width:45%!important}
        #rewards .reward-v4-wallet{width:132px!important;max-width:40%!important;right:10px!important;bottom:10px!important}
        .digi-home-reward-news{padding-left:8px;padding-right:8px;gap:7px}.digi-home-reward-news-label{font-size:8.5px}
      }
    `;
    document.head.appendChild(style);
  }

  function removeOldHomeOverrides() {
    document.querySelectorAll('.digi-home-benefits').forEach(node => node.classList.remove('digi-home-benefits'));
    document.querySelectorAll('.digi-home-benefit').forEach(node => node.classList.remove('digi-home-benefit'));
    document.querySelectorAll('.digi-rate-grid').forEach(node => node.classList.remove('digi-rate-grid'));
    document.querySelectorAll('.digi-rate-grid-item').forEach(node => node.classList.remove('digi-rate-grid-item'));
    document.querySelectorAll('.digi-portfolio-grid').forEach(node => node.classList.remove('digi-portfolio-grid'));
    document.querySelectorAll('.digi-portfolio-grid-item').forEach(node => node.classList.remove('digi-portfolio-grid-item'));
    document.querySelectorAll('.digi-quick-grid').forEach(node => node.classList.remove('digi-quick-grid'));
    document.querySelectorAll('.digi-quick-grid-item').forEach(node => node.classList.remove('digi-quick-grid-item'));
  }

  function rewardNewsMessages() {
    const messages = [];
    const now = Date.now();
    for (const campaign of Array.isArray(latestState?.campaigns) ? latestState.campaigns : []) {
      if (campaign.enabled === false || campaign.upcoming || (campaign.endsAt && Number(campaign.endsAt) < now)) continue;
      const tasks = (campaign.tasks || []).filter(task => task.enabled !== false && !task.upcoming && (!task.endsAt || Number(task.endsAt) >= now));
      if (tasks.length) {
        tasks.forEach(task => messages.push(`🎁 ${task.title || campaign.title || 'Reward task'} · Earn ${Number(task.rewardAmount || 0).toLocaleString('en-IN',{maximumFractionDigits:6})} USDT`));
      } else if (campaign.title) {
        messages.push(`🎁 ${campaign.title}${campaign.rewardAmount ? ` · Reward ${Number(campaign.rewardAmount).toLocaleString('en-IN',{maximumFractionDigits:6})} USDT` : ''}`);
      }
    }
    if (permanentProgram?.enabled !== false) {
      const joining = Number(permanentProgram?.joiningBonus?.amountUsdt || 0);
      if (joining > 0) messages.push(`🎉 New user joining reward: ${joining.toLocaleString('en-IN',{maximumFractionDigits:6})} USDT`);
      for (const tier of Array.isArray(permanentProgram?.tiers) ? permanentProgram.tiers : []) {
        const threshold = Number(tier.thresholdUsdt || 0), reward = Number(tier.rewardUsdt || 0);
        if (threshold > 0 && reward > 0) messages.push(`⭐ Complete ${threshold.toLocaleString('en-IN')} USDT deposit · Get ${reward.toLocaleString('en-IN',{maximumFractionDigits:6})} USDT reward`);
      }
    }
    return [...new Set(messages)].slice(0,10);
  }

  function homeHeroAnchor(home) {
    const title = home?.querySelector('[data-i18n="heroTitle"]');
    if (!title) return null;
    const explicit = title.closest('.hero,.hero-card,.home-hero,[class*="hero"]');
    if (explicit && home.contains(explicit)) return explicit;
    let node = title;
    while (node?.parentElement && node.parentElement !== home) node = node.parentElement;
    return node && node.parentElement === home ? node : null;
  }

  function renderHomeRewardNews() {
    const home = document.getElementById('home');
    if (!home) return;
    const messages = rewardNewsMessages();
    let bar = document.getElementById('digiHomeRewardNews');
    if (!messages.length) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'digiHomeRewardNews';
      bar.className = 'digi-home-reward-news';
      bar.setAttribute('aria-label','Reward news');
      bar.innerHTML = '<div class="digi-home-reward-news-label"><i></i>REWARD NEWS</div><div class="digi-home-reward-news-window"><div class="digi-home-reward-news-track"><span></span><span></span></div></div>';
      const hero = homeHeroAnchor(home);
      if (hero?.parentElement) hero.insertAdjacentElement('afterend', bar); else home.prepend(bar);
    }
    const line = messages.join('   •   ');
    bar.querySelectorAll('.digi-home-reward-news-track span').forEach(node => { if (node.textContent !== line) node.textContent = line; });
  }

  async function refreshPermanentNews() {
    if (permanentLoading || Date.now() - permanentFetchedAt < 60_000) return;
    permanentLoading = true;
    try {
      const response = await fetch('/api/digirupee/rewards/permanent', { credentials:'include', cache:'no-store' });
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        permanentProgram = payload?.program || null;
        permanentFetchedAt = Date.now();
        renderHomeRewardNews();
      }
    } catch {} finally { permanentLoading = false; }
  }

  function pendingReferral() {
    try { const value = normalizeReferral(localStorage.getItem(REF_KEY)); return validReferral(value) ? value : ''; }
    catch { return ''; }
  }

  function saveReferral(value) {
    const referral = normalizeReferral(value);
    if (!validReferral(referral)) return false;
    try { localStorage.setItem(REF_KEY, referral); } catch {}
    return true;
  }

  async function claimDeferredReferral() {
    if (pendingReferral()) return pendingReferral();
    try {
      const response = await fetch('/api/digirupee/referral-install/claim', { credentials:'include', cache:'no-store' });
      if (!response.ok) return '';
      const payload = await response.json().catch(() => ({}));
      if (saveReferral(payload?.referralCode)) return normalizeReferral(payload.referralCode);
    } catch {}
    return '';
  }

  function ensureReferralRegister() {
    const referral = pendingReferral();
    if (!referral) return;
    const auth = document.getElementById('digiAuth');
    if (!auth || auth.hidden) return;
    let input = document.getElementById('digiReferral');
    if (!input) { auth.querySelector('[data-auth-mode="register"]')?.click(); input = document.getElementById('digiReferral'); }
    if (!input) return;
    input.value = referral; input.readOnly = true; input.setAttribute('aria-readonly','true');
    const field = input.closest('.digi-auth-field');
    if (field) {
      field.style.display = '';
      const label = field.querySelector('label');
      if (label) label.innerHTML = 'REFERRAL APPLIED <span style="color:#69d7a9;font-weight:800">AUTO</span>';
      let note = field.querySelector('.digi-referral-applied');
      if (!note) { note = document.createElement('small'); note.className = 'digi-referral-applied'; field.appendChild(note); }
      note.textContent = `Invited with ${referral}. This code will be attached automatically.`;
    }
  }

  function forceDirectReferralLink() {
    const input = document.getElementById('refLink');
    if (!input) return;
    const raw = String(input.value || '');
    let referral = '';
    try { referral = normalizeReferral(new URL(raw, location.origin).searchParams.get('ref')); } catch {}
    if (!referral && validReferral(raw)) referral = normalizeReferral(raw);
    if (!validReferral(referral)) return;
    const direct = `https://digirupee.loktron.com/download/digirupee.apk?ref=${encodeURIComponent(referral)}`;
    if (input.value !== direct) input.value = direct;
  }

  const previousFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await previousFetch(...args);
    try {
      const target = String(args[0]?.url || args[0] || '');
      const method = String(args[1]?.method || 'GET').toUpperCase();
      if (response.ok && method === 'POST' && target.includes('/api/digirupee/auth/register')) localStorage.removeItem(REF_KEY);
    } catch {}
    return response;
  };

  let scheduled = false;
  function refresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      installResponsiveLayout();
      removeOldHomeOverrides();
      forceDirectReferralLink();
      ensureReferralRegister();
      renderHomeRewardNews();
    });
  }

  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  window.addEventListener('digirupee:state', event => {
    latestState = event.detail || latestState;
    renderHomeRewardNews();
    refreshPermanentNews();
  });

  installResponsiveLayout();
  removeOldHomeOverrides();
  refresh();
  window.addEventListener('DOMContentLoaded', async () => {
    installResponsiveLayout(); removeOldHomeOverrides();
    await claimDeferredReferral();
    if (typeof window.__digiStateSnapshot === 'function') latestState = window.__digiStateSnapshot();
    refresh(); refreshPermanentNews();
  });
})();
