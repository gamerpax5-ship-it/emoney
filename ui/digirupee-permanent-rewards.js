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
      .digi-permanent-rewards{padding:14px;border:1px solid #393028;border-radius:16px;background:linear-gradient(145deg,#15100d,#0c0e11);color:#f7f1e7}
      .digi-permanent-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:11px}
      .digi-permanent-head h3{margin:0;font-size:16px;color:#f4d06a}.digi-permanent-head p{margin:4px 0 0;color:#a9a19a;font-size:11.5px;line-height:1.45}
      .digi-permanent-volume{flex:none;padding:7px 9px;border:1px solid #4c422b;border-radius:10px;background:#1a1710;text-align:right}.digi-permanent-volume small{display:block;color:#948b7e;font-size:9.5px}.digi-permanent-volume b{display:block;margin-top:2px;color:#ffe079;font-size:12px}
      .digi-joining-bonus{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px;border:1px solid #3b3523;border-radius:12px;background:#17150f;margin-bottom:10px}.digi-joining-bonus b{display:block;font-size:13px}.digi-joining-bonus small{display:block;margin-top:3px;color:#9e978c;font-size:10.5px}.digi-joining-bonus strong{color:#ffdc69;font-size:14px;white-space:nowrap}
      .digi-tier-list{display:grid;gap:8px}.digi-tier{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:11px;border:1px solid #2d3036;border-radius:12px;background:#0d0f12}.digi-tier.earned{border-color:#315c49;background:#0e1814}.digi-tier.locked{opacity:.82}.digi-tier b{display:block;font-size:12.5px}.digi-tier small{display:block;margin-top:3px;color:#979da6;font-size:10.5px;line-height:1.4}.digi-tier strong{color:#f4cf67;font-size:13px;white-space:nowrap}.digi-tier.earned strong{color:#71dfa9}
      .digi-tier-progress{height:4px;margin-top:7px;border-radius:99px;background:#25282d;overflow:hidden}.digi-tier-progress i{display:block;height:100%;background:linear-gradient(90deg,#c78a20,#f5d867)}
      body.digi-light .digi-permanent-rewards{background:#fff!important;color:#15171a!important;border-color:#dde2e8!important}body.digi-light .digi-permanent-volume,body.digi-light .digi-joining-bonus,body.digi-light .digi-tier{background:#f8f9fb!important;border-color:#e0e4ea!important}body.digi-light .digi-permanent-head p,body.digi-light .digi-joining-bonus small,body.digi-light .digi-tier small{color:#626b76!important}
    `;
    document.head.appendChild(style);
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

  function render() {
    injectStyle();
    const panel = ensurePanel();
    if (!panel) return;
    if (!program) {
      panel.innerHTML = '<div class="digi-permanent-head"><div><h3>Permanent Rewards</h3><p>Loading your bonus progress…</p></div></div>';
      return;
    }
    if (program.enabled === false) {
      panel.innerHTML = '<div class="digi-permanent-head"><div><h3>Permanent Rewards</h3><p>This reward program is currently paused.</p></div></div>';
      return;
    }
    const best = Number(program.bestCompletedDepositUsdt || 0);
    const joining = program.joiningBonus || {};
    const tiers = Array.isArray(program.tiers) ? program.tiers : [];
    panel.innerHTML = `
      <div class="digi-permanent-head"><div><h3>Permanent Rewards</h3><p>Complete eligible USDT deposits and unlock one-time bonuses.</p></div><div class="digi-permanent-volume"><small>Best completed deposit</small><b>${num(best)} USDT</b></div></div>
      <div class="digi-joining-bonus"><div><b>🎁 Joining Reward</b><small>${joining.credited ? 'Welcome bonus credited to your rewards.' : 'Available automatically for newly registered users.'}</small></div><strong>${num(joining.amountUsdt || 0)} USDT${joining.credited ? ' ✓' : ''}</strong></div>
      <div class="digi-tier-list">${tiers.map(tier => {
        const threshold = Number(tier.thresholdUsdt || 0);
        const reward = Number(tier.rewardUsdt || 0);
        const progress = threshold > 0 ? Math.max(0, Math.min(100, best / threshold * 100)) : 0;
        const status = tier.earned ? 'Earned' : tier.skipped ? 'Passed' : best >= threshold ? 'Eligible' : `${num(Math.max(0, threshold - best))} USDT to go`;
        return `<div class="digi-tier ${tier.earned ? 'earned' : 'locked'}"><div><b>Complete ${num(threshold)} USDT deposit</b><small>${esc(status)}</small><div class="digi-tier-progress"><i style="width:${tier.earned || tier.skipped ? 100 : progress}%"></i></div></div><strong>${tier.earned ? '✓ ' : '+'}${num(reward)} USDT</strong></div>`;
      }).join('')}</div>`;
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

  const previousGo = window.go;
  if (typeof previousGo === 'function') {
    window.go = function(page) {
      previousGo(page);
      if (page === 'rewards') setTimeout(() => { render(); refreshProgram(); }, 0);
    };
  }

  window.addEventListener('digirupee:state', () => {
    if ($('rewards')?.classList.contains('active')) setTimeout(() => { render(); refreshProgram(); }, 0);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && $('rewards')?.classList.contains('active')) refreshProgram();
  });
  document.addEventListener('DOMContentLoaded', () => {
    injectStyle();
    if ($('rewards')?.classList.contains('active')) { render(); refreshProgram(); }
  });
})();