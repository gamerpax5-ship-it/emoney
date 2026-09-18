(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[ch]));
  const num = value => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 6 });
  let program = null;
  let loading = false;

  async function api(path) {
    const response = await fetch(`/api/digirupee${path}`, { credentials:'include' });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
    return payload || {};
  }

  function injectStyle() {
    if ($('digi-permanent-rewards-css')) return;
    const style = document.createElement('style');
    style.id = 'digi-permanent-rewards-css';
    style.textContent = `
      /* Rewards-page-only visual cleanup. */
      #rewards .reward-v4-root{display:grid!important;gap:14px!important;padding:2px 0 22px!important}
      #rewards .reward-v4-root>*{margin-top:0!important;margin-bottom:0!important;min-width:0}
      #rewards .reward-v4-news{margin:0!important;border-radius:14px!important;overflow:hidden}
      #rewards #tasks{display:grid!important;gap:12px!important;margin:0!important}
      #rewards #tasks>.card,#rewards .task-card{margin:0!important;border-radius:15px!important;padding:14px!important;border:1px solid #292e36!important;background:linear-gradient(145deg,#111419,#0b0d10)!important;box-shadow:0 9px 26px rgba(0,0,0,.16)}
      #rewards .task-top{gap:12px!important;align-items:flex-start!important}
      #rewards .task-top>div:first-child{min-width:0;flex:1}
      #rewards .task-top h4{margin:0 0 5px!important;font-size:14px!important;line-height:1.3!important}
      #rewards .task-top p{margin:0!important;font-size:12px!important;line-height:1.5!important;color:#aeb4bd!important}
      #rewards .campaign{margin-top:7px!important;font-size:10.5px!important;color:#858c96!important;line-height:1.4!important}
      #rewards .task-reward{flex:none!important;padding:7px 9px!important;border:1px solid #5d5125!important;border-radius:10px!important;background:#1a160a!important;color:#f5d466!important;font-size:11px!important;font-weight:900!important;white-space:nowrap!important}
      #rewards .task-foot{margin-top:12px!important;padding-top:11px!important;border-top:1px solid #242932!important;gap:10px!important}
      #rewards .task-progress{font-size:11px!important;color:#aeb4bd!important}
      #rewards .claim-btn{min-height:38px!important;padding:0 13px!important;border-radius:10px!important;font-size:11px!important;font-weight:850!important}
      #rewards .claim-btn.ready{box-shadow:0 8px 20px rgba(208,165,51,.18)!important}
      #rewards #taskFilters{display:flex!important;gap:8px!important;margin:0 0 2px!important;padding-bottom:2px!important;overflow-x:auto!important;scrollbar-width:none}
      #rewards #taskFilters::-webkit-scrollbar{display:none}
      #rewards #taskFilters button{flex:none!important;min-height:34px!important;padding:0 12px!important;border-radius:999px!important}
      #rewards .card{margin-top:0!important;margin-bottom:0!important}
      #rewards button{touch-action:manipulation}
      #rewards img:not([src]),#rewards img[src=""]{display:none!important}

      .digi-permanent-rewards{padding:15px;border:1px solid #393028;border-radius:17px;background:linear-gradient(145deg,#15110d,#0c0e11);color:#f7f1e7;box-shadow:0 12px 30px rgba(0,0,0,.18)}
      .digi-permanent-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      .digi-permanent-head h3{margin:0;font-size:16px;color:#f4d06a;letter-spacing:-.015em}
      .digi-permanent-head p{margin:5px 0 0;color:#aaa39a;font-size:11.5px;line-height:1.5}
      .digi-permanent-volume{flex:none;padding:9px 10px;border:1px solid #4c422b;border-radius:11px;background:#1a1710;text-align:right}
      .digi-permanent-volume small{display:block;color:#948b7e;font-size:9.5px}.digi-permanent-volume b{display:block;margin-top:3px;color:#ffe079;font-size:13px}
      .digi-joining-bonus{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:11px;padding:12px;border:1px solid #3b3523;border-radius:13px;background:#17150f;margin:0 0 11px}
      .digi-reward-icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(145deg,#f5d96f,#b9801d);color:#2d2000;font-size:18px;font-weight:1000;box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 8px 18px rgba(177,125,27,.18)}
      .digi-joining-copy{min-width:0}.digi-joining-bonus b{display:block;font-size:13px}.digi-joining-bonus small{display:block;margin-top:3px;color:#9e978c;font-size:10.5px;line-height:1.45}.digi-joining-bonus strong{color:#ffdc69;font-size:13px;white-space:nowrap}
      .digi-tier-list{display:grid;gap:10px}.digi-tier{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px;border:1px solid #2d3036;border-radius:13px;background:#0d0f12;box-shadow:0 7px 18px rgba(0,0,0,.10)}
      .digi-tier.earned{border-color:#315c49;background:#0e1814}.digi-tier.locked{opacity:.9}.digi-tier b{display:block;font-size:12.5px;line-height:1.35}.digi-tier small{display:block;margin-top:4px;color:#979da6;font-size:10.5px;line-height:1.45}.digi-tier strong{color:#f4cf67;font-size:12px;white-space:nowrap}.digi-tier.earned strong{color:#71dfa9}
      .digi-tier-progress{height:5px;margin-top:8px;border-radius:99px;background:#25282d;overflow:hidden}.digi-tier-progress i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#c78a20,#f5d867)}
      #rewards .digi-permanent-head{display:block}
      #rewards .digi-permanent-stats{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin:12px 0}
      #rewards .digi-permanent-stats .digi-permanent-volume{display:flex;flex-direction:column;justify-content:center;min-width:0;padding:12px;text-align:left;border-radius:12px}
      #rewards .digi-permanent-stats .digi-permanent-volume small{font-size:10.5px;line-height:1.4}
      #rewards .digi-permanent-stats .digi-permanent-volume b{font-size:16px;margin-top:5px;overflow-wrap:anywhere}
      #rewards .digi-permanent-stats:has(> :only-child){grid-template-columns:1fr}
      #rewards .digi-permanent-rewards+#tasks,#rewards .digi-permanent-rewards+*{margin-top:0!important}
      body.digi-light .digi-permanent-rewards{background:#fff!important;color:#15171a!important;border-color:#dde2e8!important;box-shadow:0 10px 25px rgba(18,27,38,.06)!important}
      body.digi-light .digi-permanent-volume,body.digi-light .digi-joining-bonus,body.digi-light .digi-tier{background:#f8f9fb!important;border-color:#e0e4ea!important}
      body.digi-light .digi-permanent-head p,body.digi-light .digi-joining-bonus small,body.digi-light .digi-tier small{color:#626b76!important}
      @media(max-width:360px){
        .digi-joining-bonus{grid-template-columns:34px minmax(0,1fr)}
        .digi-joining-bonus strong{grid-column:2;justify-self:start;margin-top:-3px}
        .digi-reward-icon{width:34px;height:34px;border-radius:10px}
        .digi-tier{grid-template-columns:1fr}.digi-tier strong{justify-self:start}
      }
    `;
    document.head.appendChild(style);
  }

  function polishRewardPage() {
    const rewards = $('rewards');
    if (!rewards) return;
    rewards.querySelectorAll('img').forEach(image => {
      if (image.dataset.digiRewardGuard === '1') return;
      image.dataset.digiRewardGuard = '1';
      image.addEventListener('error', () => { image.style.display = 'none'; }, { once:true });
    });
    rewards.querySelectorAll('.card').forEach(card => card.style.removeProperty('margin-bottom'));
  }

  function ensurePanel() {
    const rewards = $('rewards');
    if (!rewards) return null;
    const root = rewards.querySelector('.reward-v4-root');
    if (!root) return null;
    let panel = $('digiPermanentRewards');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'digiPermanentRewards';
    panel.className = 'digi-permanent-rewards';
    const news = root.querySelector('.reward-v4-news');
    if (news?.nextSibling) root.insertBefore(panel, news.nextSibling);
    else if (news) root.appendChild(panel);
    else root.prepend(panel);
    return panel;
  }

  function renderPanel(panel, markup) {
    const wallet = $('rewardV4Wallet');
    panel.innerHTML = markup;
    if (!wallet) { polishRewardPage(); return; }
    let stats = panel.querySelector('.digi-permanent-stats');
    if (!stats) {
      stats = document.createElement('div');
      stats.className = 'digi-permanent-stats';
      panel.appendChild(stats);
    }
    stats.prepend(wallet);
    polishRewardPage();
  }

  function render() {
    injectStyle();
    const panel = ensurePanel();
    if (!panel) { polishRewardPage(); return; }
    if (!program) {
      renderPanel(panel, '<div class="digi-permanent-head"><div><h3>Permanent Rewards</h3><p>Loading your bonus progress…</p></div></div>');
      return;
    }
    if (program.enabled === false) {
      renderPanel(panel, '<div class="digi-permanent-head"><div><h3>Permanent Rewards</h3><p>This reward program is currently paused.</p></div></div>');
      return;
    }
    const best = Number(program.bestCompletedDepositUsdt || 0);
    const joining = program.joiningBonus || {};
    const tiers = Array.isArray(program.tiers) ? program.tiers : [];
    renderPanel(panel, `
      <div class="digi-permanent-head"><div><h3>Permanent Rewards</h3><p>Complete eligible USDT deposits and unlock one-time bonuses.</p></div></div>
      <div class="digi-permanent-stats"><div class="digi-permanent-volume"><small>Best completed deposit</small><b>${num(best)} USDT</b></div></div>
      <div class="digi-joining-bonus"><span class="digi-reward-icon" aria-hidden="true">★</span><div class="digi-joining-copy"><b>Joining Reward</b><small>${joining.credited ? 'Welcome bonus credited to your rewards.' : 'Available automatically for newly registered users.'}</small></div><strong>${num(joining.amountUsdt || 0)} USDT${joining.credited ? ' ✓' : ''}</strong></div>
      <div class="digi-tier-list">${tiers.map(tier => {
        const threshold = Number(tier.thresholdUsdt || 0);
        const reward = Number(tier.rewardUsdt || 0);
        const progress = threshold > 0 ? Math.max(0, Math.min(100, best / threshold * 100)) : 0;
        const status = tier.earned ? 'Earned' : tier.skipped ? 'Passed' : best >= threshold ? 'Eligible' : `${num(Math.max(0, threshold - best))} USDT to go`;
        return `<div class="digi-tier ${tier.earned ? 'earned' : 'locked'}"><div><b>Complete ${num(threshold)} USDT deposit</b><small>${esc(status)}</small><div class="digi-tier-progress"><i style="width:${tier.earned || tier.skipped ? 100 : progress}%"></i></div></div><strong>${tier.earned ? '✓ ' : '+'}${num(reward)} USDT</strong></div>`;
      }).join('')}</div>`);
  }

  async function refreshProgram() {
    if (loading) return;
    loading = true;
    try {
      const result = await api('/rewards/permanent');
      program = result.program || null;
      render();
    } catch (error) {
      if (!/401|login|session/i.test(String(error.message || ''))) console.warn('Permanent rewards unavailable:', error.message);
    } finally {
      loading = false;
    }
  }

  function handleBack() {
    const overlays = Array.from(document.querySelectorAll('.overlay.show')).filter(node => {
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    const overlay = overlays.at(-1);
    if (overlay) {
      overlay.classList.remove('show');
      return true;
    }

    const auth = $('digiAuth');
    if (auth && !auth.hidden) {
      const registerFields = $('digiRegisterFields');
      if (registerFields && !registerFields.hidden) {
        const login = auth.querySelector('[data-auth-mode="login"]');
        if (login) { login.click(); return true; }
      }
      return false;
    }

    const active = document.querySelector('.page.active');
    if (active && active.id && active.id !== 'home' && typeof window.go === 'function') {
      window.go('home');
      return true;
    }
    return false;
  }
  window.__digiHandleBack = handleBack;

  window.addEventListener('digirupee:rewards-built', () => { render(); polishRewardPage(); });

  const previousGo = window.go;
  if (typeof previousGo === 'function') {
    window.go = function(page) {
      previousGo(page);
      if (page === 'rewards') setTimeout(() => { render(); refreshProgram(); polishRewardPage(); }, 0);
    };
  }

  window.addEventListener('digirupee:state', () => {
    if ($('rewards')?.classList.contains('active')) setTimeout(() => { render(); refreshProgram(); polishRewardPage(); }, 0);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && $('rewards')?.classList.contains('active')) refreshProgram();
  });
  document.addEventListener('DOMContentLoaded', () => {
    injectStyle();
    polishRewardPage();
    if ($('rewards')?.classList.contains('active')) { render(); refreshProgram(); }
  });
})();
