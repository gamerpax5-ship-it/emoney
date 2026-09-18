(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  function injectProfileCss() {
    if ($('digirupee-profile-polish-css')) return;
    const style = document.createElement('style');
    style.id = 'digirupee-profile-polish-css';
    style.textContent = `
      /* Profile-only visual polish. No shared page selectors live in this block. */
      #profile.digi-profile-polished{padding-top:4px!important;padding-bottom:calc(22px + var(--digi-safe-bottom,0px))!important}
      #profile.digi-profile-polished .digi-profile-hero-card{position:relative;isolation:isolate;overflow:hidden;margin:0 0 12px!important;padding:16px!important;border:1px solid #4b4028!important;border-radius:20px!important;background:radial-gradient(circle at 88% 12%,rgba(242,204,91,.14),transparent 28%),radial-gradient(circle at 12% 100%,rgba(115,31,24,.20),transparent 38%),linear-gradient(145deg,#15120e 0%,#0d0f12 58%,#090a0c 100%)!important;box-shadow:0 16px 36px rgba(0,0,0,.20)!important}
      #profile.digi-profile-polished .digi-profile-hero-card:before{content:'';position:absolute;z-index:-1;inset:0 0 auto;height:2px;background:linear-gradient(90deg,transparent,#e4bd51 28%,#fff1a1 50%,#b37a25 72%,transparent);opacity:.8}
      #profile.digi-profile-polished #profileNameHero{font-size:20px!important;line-height:1.2!important;font-weight:900!important;letter-spacing:-.02em!important;color:#fff!important}
      #profile.digi-profile-polished #profileIdHero{margin-top:4px!important;color:#aeb4bd!important;font-size:11.5px!important;line-height:1.4!important;letter-spacing:.015em!important;overflow-wrap:anywhere}
      #profile.digi-profile-polished #profileReward{color:#f2cf63!important;font-weight:900!important}

      #profile.digi-profile-polished .section{margin:16px 2px 8px!important;min-height:28px!important;align-items:center!important}
      #profile.digi-profile-polished .section h2{margin:0!important;font-size:13px!important;line-height:1.3!important;letter-spacing:.01em!important;color:#d9dde3!important}
      #profile.digi-profile-polished .section h2:after{content:'';display:block;width:26px;height:2px;margin-top:5px;border-radius:99px;background:linear-gradient(90deg,#d8af43,transparent)}

      #profile.digi-profile-polished .digi-profile-menu-card{margin:0 0 11px!important;padding:5px!important;border:1px solid #272c33!important;border-radius:17px!important;background:linear-gradient(155deg,#101318,#0b0d10)!important;box-shadow:0 10px 26px rgba(0,0,0,.13)!important;overflow:hidden!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-row{display:grid!important;grid-template-columns:42px minmax(0,1fr) 20px!important;align-items:center!important;column-gap:11px!important;min-height:62px!important;margin:0!important;padding:9px 10px!important;border:0!important;border-radius:12px!important;background:transparent!important;box-sizing:border-box!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-row+.menu-row{border-top:1px solid #20252c!important;border-top-left-radius:0!important;border-top-right-radius:0!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-row:active{background:#14181d!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-row>div:not(.icon){min-width:0!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-row b{display:block!important;margin:0!important;color:#f2f3f5!important;font-size:13.5px!important;line-height:1.3!important;font-weight:800!important;letter-spacing:-.005em!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-row small{display:block!important;margin-top:3px!important;color:#969da7!important;font-size:11.3px!important;line-height:1.38!important;overflow-wrap:anywhere!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-right{justify-self:end!important;color:#747c87!important;font-size:20px!important;font-weight:500!important;line-height:1!important}

      #profile.digi-profile-polished .digi-profile-icon{width:40px!important;height:40px!important;display:grid!important;place-items:center!important;margin:0!important;border:1px solid #343941!important;border-radius:12px!important;background:#161a20!important;color:#d8b854!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)!important;font-size:0!important;line-height:0!important}
      #profile.digi-profile-polished .digi-profile-icon svg{width:20px!important;height:20px!important;display:block!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="history"]{color:#e2bd55!important;background:#211b0d!important;border-color:#514321!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="bank"]{color:#7fafff!important;background:#111a29!important;border-color:#273b59!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="language"]{color:#74d4b6!important;background:#0e201b!important;border-color:#24453b!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="theme"]{color:#e9c55c!important;background:#211b0e!important;border-color:#4c4023!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="notifications"]{color:#f0939e!important;background:#241317!important;border-color:#4e2830!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="referral"]{color:#b49cff!important;background:#19152a!important;border-color:#39305b!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="security"]{color:#78d8ac!important;background:#102019!important;border-color:#264839!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="support"]{color:#83c8ff!important;background:#111d27!important;border-color:#294358!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="logout"]{color:#ff8d98!important;background:#251316!important;border-color:#51252b!important}

      #profile.digi-profile-polished .method-toolbar{display:flex!important;gap:8px!important;align-items:center!important;flex-wrap:wrap!important}
      #profile.digi-profile-polished .method-toolbar .manage-btn,#profile.digi-profile-polished .method-toolbar button{min-height:34px!important;padding:0 11px!important;border:1px solid #3b3525!important;border-radius:10px!important;background:#17150f!important;color:#e9ca67!important;font-size:11.5px!important;font-weight:800!important;box-shadow:none!important}
      #profile.digi-profile-polished .profile-method-list{display:grid!important;gap:9px!important;margin:0 0 12px!important}
      #profile.digi-profile-polished .profile-method-row{position:relative!important;display:grid!important;grid-template-columns:minmax(0,1fr) 38px!important;gap:10px!important;align-items:center!important;min-height:64px!important;margin:0!important;padding:11px 12px!important;border:1px solid #282d34!important;border-radius:14px!important;background:linear-gradient(145deg,#101318,#0c0e11)!important;box-shadow:0 8px 20px rgba(0,0,0,.10)!important;overflow:hidden!important}
      #profile.digi-profile-polished .profile-method-row:before{content:'';position:absolute;left:0;top:11px;bottom:11px;width:2px;border-radius:99px;background:#42516a;opacity:.8}
      #profile.digi-profile-polished .profile-method-copy{min-width:0!important;padding-left:3px!important}
      #profile.digi-profile-polished .profile-method-copy b{display:block!important;color:#f0f2f5!important;font-size:12.8px!important;line-height:1.3!important;font-weight:850!important;overflow-wrap:anywhere!important}
      #profile.digi-profile-polished .profile-method-copy small{display:block!important;margin-top:3px!important;color:#a5acb6!important;font-size:11.2px!important;line-height:1.4!important;overflow-wrap:anywhere!important}
      #profile.digi-profile-polished .profile-method-copy span{display:block!important;margin-top:3px!important;color:#818995!important;font-size:10.7px!important;line-height:1.38!important;overflow-wrap:anywhere!important}
      #profile.digi-profile-polished .profile-method-row .toggle{justify-self:end!important;width:36px!important;height:22px!important;margin:0!important;border-color:#393f47!important;background:#1c2025!important}
      #profile.digi-profile-polished .profile-method-row .toggle:after{width:16px!important;height:16px!important;left:3px!important;top:3px!important;background:#89919c!important}
      #profile.digi-profile-polished .profile-method-row .toggle.on{background:#12392b!important;border-color:#285d48!important}
      #profile.digi-profile-polished .profile-method-row .toggle.on:after{left:17px!important;background:#85e1b8!important}

      #profile.digi-profile-polished .empty{margin:0 0 12px!important;padding:16px!important;border:1px dashed #30363e!important;border-radius:14px!important;background:#0d0f12!important;color:#9da4ae!important}

      body.digi-light #profile.digi-profile-polished .digi-profile-hero-card{background:linear-gradient(145deg,#fffdf7,#fff 58%,#fafbfc)!important;border-color:#eadcae!important;box-shadow:0 10px 26px rgba(20,26,36,.07)!important}
      body.digi-light #profile.digi-profile-polished #profileNameHero{color:#17191d!important}
      body.digi-light #profile.digi-profile-polished #profileIdHero{color:#68717d!important}
      body.digi-light #profile.digi-profile-polished .section h2{color:#303641!important}
      body.digi-light #profile.digi-profile-polished .digi-profile-menu-card,body.digi-light #profile.digi-profile-polished .profile-method-row{background:#fff!important;border-color:#e1e5ea!important;box-shadow:0 8px 22px rgba(20,26,36,.05)!important}
      body.digi-light #profile.digi-profile-polished .digi-profile-menu-card .menu-row+.menu-row{border-top-color:#edf0f3!important}
      body.digi-light #profile.digi-profile-polished .digi-profile-menu-card .menu-row b,body.digi-light #profile.digi-profile-polished .profile-method-copy b{color:#1b1e23!important}
      body.digi-light #profile.digi-profile-polished .digi-profile-menu-card .menu-row small,body.digi-light #profile.digi-profile-polished .profile-method-copy small{color:#66707c!important}
      body.digi-light #profile.digi-profile-polished .profile-method-copy span{color:#858e99!important}
      body.digi-light #profile.digi-profile-polished .digi-profile-icon{box-shadow:none!important}
      body.digi-light #profile.digi-profile-polished .empty{background:#fff!important;border-color:#d8dde3!important;color:#67717d!important}

      @media(max-width:370px){
        #profile.digi-profile-polished .digi-profile-menu-card .menu-row{grid-template-columns:38px minmax(0,1fr) 18px!important;column-gap:9px!important;padding:8px!important}
        #profile.digi-profile-polished .digi-profile-icon{width:36px!important;height:36px!important;border-radius:11px!important}
        #profile.digi-profile-polished .digi-profile-icon svg{width:18px!important;height:18px!important}
        #profile.digi-profile-polished .digi-profile-menu-card .menu-row b{font-size:13px!important}
      }
    `;
    document.head.appendChild(style);
  }

  const icons = {
    history:'<path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.7"/><path d="M4 4v4.7h4.7"/><path d="M12 7.5V12l3 1.8"/>',
    bank:'<path d="M3 10h18"/><path d="M5 10v8m4-8v8m6-8v8m4-8v8"/><path d="M3 19h18M12 3l9 5H3z"/>',
    language:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    theme:'<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6m11 11 1.6 1.6m0-15.2-1.6 1.6m-11 11-1.6 1.6"/>',
    notifications:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    referral:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6m-3-3h6"/>',
    security:'<path d="M12 22s8-3.8 8-10V5l-8-3-8 3v7c0 6.2 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    support:'<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><path d="M4 13a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v-6H4zm16 0h-2v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2z"/><path d="M18 19c0 2-2 3-5 3"/>',
    logout:'<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>'
  };

  function iconKind(text) {
    const value = String(text || '').toLowerCase();
    if (/trade history|history/.test(value)) return 'history';
    if (/bank|upi|payout method/.test(value)) return 'bank';
    if (/language/.test(value)) return 'language';
    if (/theme|appearance/.test(value)) return 'theme';
    if (/notification/.test(value)) return 'notifications';
    if (/refer|invite|earn/.test(value)) return 'referral';
    if (/security|device|login|2fa/.test(value)) return 'security';
    if (/support|help/.test(value)) return 'support';
    if (/logout|sign out/.test(value)) return 'logout';
    return 'security';
  }

  function svg(kind) {
    const body = icons[kind] || icons.security;
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  }

  let scheduled = false;
  function polishProfile() {
    const page = $('profile');
    if (!page) return;
    injectProfileCss();
    page.classList.add('digi-profile-polished');

    const name = $('profileNameHero');
    const hero = name?.closest('.card') || name?.parentElement?.closest('.card');
    hero?.classList.add('digi-profile-hero-card');

    page.querySelectorAll('.card.menu').forEach(card => card.classList.add('digi-profile-menu-card'));
    page.querySelectorAll('.menu-row').forEach(row => {
      const icon = row.querySelector('.icon');
      if (!icon) return;
      const kind = iconKind(row.textContent);
      icon.classList.add('digi-profile-icon');
      icon.dataset.profileIcon = kind;
      if (icon.dataset.profileSvg !== kind) {
        icon.innerHTML = svg(kind);
        icon.dataset.profileSvg = kind;
      }
    });
  }

  function schedulePolish() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      polishProfile();
    });
  }

  injectProfileCss();
  schedulePolish();
  document.addEventListener('DOMContentLoaded', schedulePolish);
  window.addEventListener('digirupee:state', schedulePolish);

  const startObserver = () => {
    const page = $('profile');
    if (!page || page.dataset.profilePolishObserver === '1') return;
    page.dataset.profilePolishObserver = '1';
    new MutationObserver(schedulePolish).observe(page, { childList:true, subtree:true });
  };
  document.addEventListener('DOMContentLoaded', () => { startObserver(); schedulePolish(); });
  requestAnimationFrame(() => { startObserver(); schedulePolish(); });
})();
