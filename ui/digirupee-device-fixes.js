(() => {
  'use strict';

  const REF_KEY = 'digirupee-pending-referral';
  const validReferral = value => /^DGR[A-F0-9]{10}$/.test(String(value || '').trim().toUpperCase());
  const normalizeReferral = value => String(value || '').trim().toUpperCase();

  function installDigiFont() {
    if (!document.getElementById('digirupee-inter-font')) {
      const preconnect = document.createElement('link');
      preconnect.id = 'digirupee-inter-font';
      preconnect.rel = 'preconnect';
      preconnect.href = 'https://fonts.googleapis.com';
      document.head.appendChild(preconnect);

      const font = document.createElement('link');
      font.rel = 'stylesheet';
      font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
      document.head.appendChild(font);
    }

    if (document.getElementById('digirupee-device-layout-fix')) return;
    const style = document.createElement('style');
    style.id = 'digirupee-device-layout-fix';
    style.textContent = `
      html{font-size:16px!important;-webkit-text-size-adjust:100%!important;text-size-adjust:100%!important}
      html,body,.app,button,input,select,textarea{font-family:"Inter","Roboto",Arial,sans-serif!important;font-synthesis:none!important}
      body{overflow-x:hidden!important;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
      .app,.page,.header,.nav,.card{box-sizing:border-box;max-width:100%}
      .page{width:100%;overflow-x:hidden!important}
      img,svg,canvas{max-width:100%}
      .digi-home-benefits{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important;width:100%!important;max-width:100%!important;overflow:hidden!important;align-items:stretch!important}
      .digi-home-benefit{min-width:0!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;padding-left:7px!important;padding-right:7px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;font-size:clamp(9.8px,2.85vw,12px)!important;line-height:1.15!important}
      .digi-home-benefit *{min-width:0!important;font-size:inherit!important;white-space:nowrap!important}
      .digi-home-heading{font-size:clamp(30px,8.1vw,39px)!important;line-height:.98!important;letter-spacing:-.035em!important;max-width:64%!important}
      .digi-rate-grid,.digi-portfolio-grid,.digi-quick-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;width:100%!important;max-width:100%!important}
      .digi-rate-grid>*,.digi-portfolio-grid>*,.digi-quick-grid>*{min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
      .digi-rate-grid b,.digi-rate-grid strong,.digi-portfolio-grid b,.digi-portfolio-grid strong,.digi-quick-grid b,.digi-quick-grid strong{min-width:0;overflow:hidden;text-overflow:ellipsis}
      .digi-referral-applied{display:block!important;margin-top:7px;color:#69d7a9!important;font-size:11px!important;font-weight:750!important;line-height:1.35!important}
      @media(max-width:380px){
        .digi-home-benefits{gap:4px!important}
        .digi-home-benefit{padding-left:5px!important;padding-right:5px!important;font-size:9.5px!important}
        .digi-home-heading{font-size:clamp(28px,8vw,35px)!important}
      }
    `;
    document.head.appendChild(style);
  }

  function textElement(root, exact) {
    if (!root) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (String(node.nodeValue || '').trim() === exact) return node.parentElement;
    }
    return null;
  }

  function compactContainer(element, root) {
    if (!element) return null;
    let node = element;
    for (let i = 0; i < 4 && node && node !== root; i++, node = node.parentElement) {
      const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
      if ((node.tagName === 'BUTTON' || node.tagName === 'DIV' || node.tagName === 'SPAN') && text.length <= 42) return node;
    }
    return element;
  }

  function commonAncestor(elements, root) {
    const clean = elements.filter(Boolean);
    if (clean.length < 2) return null;
    let node = clean[0].parentElement;
    while (node && node !== root?.parentElement) {
      if (clean.every(item => node.contains(item))) return node;
      node = node.parentElement;
    }
    return null;
  }

  function markGrid(root, labels, className) {
    const items = labels.map(label => compactContainer(textElement(root, label), root)).filter(Boolean);
    const parent = commonAncestor(items, root);
    if (!parent || parent === root) return;
    parent.classList.add(className);
    items.forEach(item => item.classList.add(`${className}-item`));
  }

  function normalizeHomeLayout() {
    const home = document.getElementById('home');
    if (!home) return;

    const benefitItems = ['Instant payout', 'Secure trading', 'VIP rewards']
      .map(label => compactContainer(textElement(home, label), home)).filter(Boolean);
    const benefitParent = commonAncestor(benefitItems, home);
    if (benefitParent && benefitParent !== home) {
      benefitParent.classList.add('digi-home-benefits');
      benefitItems.forEach(item => item.classList.add('digi-home-benefit'));
    }

    ['SELL USDT,', 'GET INR'].forEach(label => textElement(home, label)?.classList.add('digi-home-heading'));
    markGrid(home, ['UPI Rate', 'Bank Rate'], 'digi-rate-grid');
    markGrid(home, ['Lifetime Volume', 'INR Processing', 'INR Settled', 'Reward Wallet'], 'digi-portfolio-grid');
    markGrid(home, ['Add Method', 'Orders', 'Rewards'], 'digi-quick-grid');
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
      installDigiFont();
      normalizeHomeLayout();
      forceDirectReferralLink();
      ensureReferralRegister();
    });
  }

  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { childList:true, subtree:true });

  installDigiFont();
  refresh();
  window.addEventListener('DOMContentLoaded', async () => {
    installDigiFont();
    await claimDeferredReferral();
    refresh();
  });
})();
