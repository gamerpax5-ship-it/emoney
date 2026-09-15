(() => {
  'use strict';

  const REF_KEY = 'digirupee-pending-referral';
  const validReferral = value => /^DGR[A-F0-9]{10}$/.test(String(value || '').trim().toUpperCase());
  const normalizeReferral = value => String(value || '').trim().toUpperCase();

  function installResponsiveLayout() {
    if (document.getElementById('digirupee-device-layout-fix')) return;
    const style = document.createElement('style');
    style.id = 'digirupee-device-layout-fix';
    style.textContent = `
      /* Preserve the original digiRupee typography. Only correct geometry/overflow. */
      body{overflow-x:hidden!important}
      .app,.page,.header,.nav,.card{box-sizing:border-box;max-width:100%}
      .page{width:100%;overflow-x:hidden!important}
      img,svg,canvas{max-width:100%}

      /* Rewards page had overridden the app's normal 16px page gutters. */
      #rewards.reward-v4-ready{
        padding:0 16px calc(28px + var(--digi-safe-bottom,0px))!important;
        box-sizing:border-box!important;
      }
      #rewards .reward-v4-root{
        width:100%!important;
        max-width:100%!important;
        gap:12px!important;
        box-sizing:border-box!important;
      }

      /* The old mascot asset contains baked-in text/cards. Hide that dirty layer and
         keep the live hero copy/cards as the only UI content. */
      #rewards .reward-v4-mascot{display:none!important}
      #rewards .reward-v4-hero{
        min-height:214px!important;
        width:100%!important;
        max-width:100%!important;
        box-sizing:border-box!important;
        overflow:hidden!important;
        background:
          radial-gradient(circle at 83% 22%,rgba(255,205,76,.22),transparent 20%),
          radial-gradient(circle at 80% 78%,rgba(204,46,34,.25),transparent 30%),
          linear-gradient(135deg,#4b0b0b 0%,#260809 55%,#0c0909 100%)!important;
      }
      #rewards .reward-v4-copy{max-width:60%!important}
      #rewards .reward-v4-wallet{
        right:14px!important;
        bottom:14px!important;
        width:140px!important;
        max-width:38%!important;
        box-sizing:border-box!important;
      }
      #rewards .reward-v4-news,
      #rewards .reward-v4-wheel-card,
      #rewards .reward-v4-task,
      #rewards .reward-v4-zone-card{
        max-width:100%!important;
        box-sizing:border-box!important;
      }

      /* Referral attribution UI only; no font-size overrides. */
      .digi-referral-applied{
        display:block!important;
        margin-top:7px;
        color:#69d7a9!important;
        font-weight:750!important;
      }

      @media(max-width:380px){
        #rewards.reward-v4-ready{padding-left:14px!important;padding-right:14px!important}
        #rewards .reward-v4-hero{min-height:222px!important}
        #rewards .reward-v4-copy{max-width:62%!important}
        #rewards .reward-v4-wallet{width:132px!important;max-width:40%!important;right:10px!important;bottom:10px!important}
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

  function pendingReferral() {
    try {
      const value = normalizeReferral(localStorage.getItem(REF_KEY));
      return validReferral(value) ? value : '';
    } catch { return ''; }
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
    if (!input) {
      const register = auth.querySelector('[data-auth-mode="register"]');
      register?.click();
      input = document.getElementById('digiReferral');
    }
    if (!input) return;

    input.value = referral;
    input.readOnly = true;
    input.setAttribute('aria-readonly', 'true');
    const field = input.closest('.digi-auth-field');
    if (field) {
      field.style.display = '';
      const label = field.querySelector('label');
      if (label) label.innerHTML = 'REFERRAL APPLIED <span style="color:#69d7a9;font-weight:800">AUTO</span>';
      let note = field.querySelector('.digi-referral-applied');
      if (!note) {
        note = document.createElement('small');
        note.className = 'digi-referral-applied';
        field.appendChild(note);
      }
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
      if (response.ok && method === 'POST' && target.includes('/api/digirupee/auth/register')) {
        localStorage.removeItem(REF_KEY);
      }
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
    });
  }

  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { childList:true, subtree:true });

  installResponsiveLayout();
  removeOldHomeOverrides();
  refresh();
  window.addEventListener('DOMContentLoaded', async () => {
    installResponsiveLayout();
    removeOldHomeOverrides();
    await claimDeferredReferral();
    refresh();
  });
})();
