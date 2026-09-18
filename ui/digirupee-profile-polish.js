(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  function injectProfileCss() {
    if ($('digirupee-profile-polish-css')) return;
    const style = document.createElement('style');
    style.id = 'digirupee-profile-polish-css';
    style.textContent = `
      /* Strictly Profile page + the two preference sheets opened from Profile. */
      #profile.digi-profile-polished{padding-top:4px!important;padding-bottom:calc(22px + var(--digi-safe-bottom,0px))!important}
      #profile.digi-profile-polished .digi-profile-hero-card{position:relative;isolation:isolate;overflow:hidden;margin:0 0 12px!important;padding:16px!important;border:1px solid #4b4028!important;border-radius:20px!important;background:radial-gradient(circle at 88% 12%,rgba(242,204,91,.14),transparent 28%),radial-gradient(circle at 12% 100%,rgba(115,31,24,.20),transparent 38%),linear-gradient(145deg,#15120e 0%,#0d0f12 58%,#090a0c 100%)!important;box-shadow:0 16px 36px rgba(0,0,0,.20)!important}
      #profile.digi-profile-polished .digi-profile-hero-card:before{content:'';position:absolute;z-index:-1;inset:0 0 auto;height:2px;background:linear-gradient(90deg,transparent,#e4bd51 28%,#fff1a1 50%,#b37a25 72%,transparent);opacity:.8}
      #profile.digi-profile-polished #profileNameHero{font-size:20px!important;line-height:1.2!important;font-weight:900!important;letter-spacing:-.02em!important;color:#fff!important}
      #profile.digi-profile-polished #profileIdHero{margin-top:4px!important;color:#aeb4bd!important;font-size:11.5px!important;line-height:1.4!important;letter-spacing:.015em!important;overflow-wrap:anywhere}
      #profile.digi-profile-polished #profileReward{color:#f2cf63!important;font-weight:900!important}

      #profile.digi-profile-polished .section{margin:18px 2px 9px!important;min-height:28px!important;align-items:center!important}
      #profile.digi-profile-polished .section h2{margin:0!important;font-size:15px!important;line-height:1.3!important;letter-spacing:.005em!important;color:#e3e6eb!important}
      #profile.digi-profile-polished .section h2:after{content:'';display:block;width:28px;height:2px;margin-top:6px;border-radius:99px;background:linear-gradient(90deg,#d8af43,transparent)}

      #profile.digi-profile-polished .digi-profile-menu-card{margin:0 0 12px!important;padding:5px!important;border:1px solid #272c33!important;border-radius:17px!important;background:linear-gradient(155deg,#101318,#0b0d10)!important;box-shadow:0 10px 26px rgba(0,0,0,.13)!important;overflow:hidden!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-row{display:grid!important;grid-template-columns:42px minmax(0,1fr) max-content!important;align-items:center!important;column-gap:11px!important;min-height:62px!important;margin:0!important;padding:9px 10px!important;border:0!important;border-radius:12px!important;background:transparent!important;box-sizing:border-box!important;color:#fff!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-row+.menu-row{border-top:1px solid #20252c!important;border-top-left-radius:0!important;border-top-right-radius:0!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-row:active{background:#14181d!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-row>div:not(.icon){min-width:0!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-row b{display:block!important;margin:0!important;color:#f2f3f5!important;font-size:13.5px!important;line-height:1.3!important;font-weight:800!important;letter-spacing:-.005em!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-row small{display:block!important;margin-top:3px!important;color:#969da7!important;font-size:11.3px!important;line-height:1.38!important;overflow-wrap:anywhere!important}
      #profile.digi-profile-polished .digi-profile-menu-card .menu-right{justify-self:end!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:7px!important;min-width:16px!important;max-width:116px!important;color:#747c87!important;font-size:18px!important;font-weight:500!important;line-height:1.1!important;text-align:right!important;white-space:nowrap!important}
      #profile.digi-profile-polished #twoFAState,
      #profile.digi-profile-polished #notifState,
      #profile.digi-profile-polished #langState,
      #profile.digi-profile-polished #themeState{display:inline-block!important;max-width:92px!important;color:#aeb4bd!important;font-size:11.5px!important;line-height:1.2!important;font-weight:750!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;vertical-align:middle!important}

      #profile.digi-profile-polished .digi-profile-icon{width:40px!important;height:40px!important;display:grid!important;place-items:center!important;margin:0!important;border:1px solid #343941!important;border-radius:12px!important;background:#161a20!important;color:#d8b854!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)!important;font-size:0!important;line-height:0!important}
      #profile.digi-profile-polished .digi-profile-icon svg{width:20px!important;height:20px!important;display:block!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important;opacity:1!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="history"]{color:#e2bd55!important;background:#211b0d!important;border-color:#514321!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="bank"]{color:#7fafff!important;background:#111a29!important;border-color:#273b59!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="language"]{color:#74d4b6!important;background:#0e201b!important;border-color:#24453b!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="theme"]{color:#e9c55c!important;background:#211b0e!important;border-color:#4c4023!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="notifications"],
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="alerts"]{color:#f0939e!important;background:#241317!important;border-color:#4e2830!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="referral"]{color:#b49cff!important;background:#19152a!important;border-color:#39305b!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="twofactor"]{color:#7ee1b5!important;background:#10221a!important;border-color:#28513e!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="login"]{color:#80b6ff!important;background:#111b2b!important;border-color:#294363!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="security"]{color:#78d8ac!important;background:#102019!important;border-color:#264839!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="support"]{color:#83c8ff!important;background:#111d27!important;border-color:#294358!important}
      #profile.digi-profile-polished .digi-profile-icon[data-profile-icon="logout"]{color:#ff8d98!important;background:#251316!important;border-color:#51252b!important}

      #profile.digi-profile-polished .method-toolbar{display:flex!important;gap:8px!important;align-items:center!important;flex-wrap:wrap!important}
      #profile.digi-profile-polished .method-toolbar .manage-btn,#profile.digi-profile-polished .method-toolbar button{min-height:38px!important;padding:0 13px!important;border:1px solid #3b3525!important;border-radius:11px!important;background:#17150f!important;color:#e9ca67!important;font-size:12px!important;font-weight:800!important;box-shadow:none!important}
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
      #profile.digi-profile-polished .empty{margin:0 0 12px!important;padding:18px!important;border:1px dashed #30363e!important;border-radius:14px!important;background:#0d0f12!important;color:#9da4ae!important}

      /* Theme / Language sheets: reset Android WebView native button rendering. */
      #themeOv .sheet,#languageOv .sheet{box-sizing:border-box!important;width:100%!important;height:auto!important;min-height:0!important;max-height:80vh!important;overflow-y:auto!important;padding:12px 20px calc(24px + env(safe-area-inset-bottom,0px))!important;background:#0b0d11!important;color:#f4f5f7!important;border:1px solid #30343b!important;border-bottom:0!important;border-radius:26px 26px 0 0!important;box-shadow:0 -18px 55px rgba(0,0,0,.42)!important}
      #themeOv .sheet .handle,#languageOv .sheet .handle{width:62px!important;height:5px!important;margin:8px auto 18px!important;border-radius:99px!important;background:#555b65!important;opacity:.8!important}
      #themeOv .sheet h3,#languageOv .sheet h3{margin:0 0 14px!important;color:#f5f6f8!important;font-size:20px!important;line-height:1.25!important;font-weight:900!important;letter-spacing:-.02em!important}
      #themeOv .sheet .menu-card,#languageOv .sheet .menu-card{display:block!important;width:100%!important;margin:0!important;padding:0!important;overflow:hidden!important;border:1px solid #292e35!important;border-radius:16px!important;background:#111419!important;box-sizing:border-box!important}
      #themeOv .sheet button.menu-row,#languageOv .sheet button.menu-row{-webkit-appearance:none!important;appearance:none!important;display:flex!important;width:100%!important;min-height:58px!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;margin:0!important;padding:0 16px!important;border:0!important;border-bottom:1px solid #252a31!important;border-radius:0!important;background:#111419!important;color:#f2f3f5!important;box-shadow:none!important;text-align:left!important;font:inherit!important;outline:none!important}
      #themeOv .sheet button.menu-row:last-child,#languageOv .sheet button.menu-row:last-child{border-bottom:0!important}
      #themeOv .sheet button.menu-row:active,#languageOv .sheet button.menu-row:active{background:#181c22!important}
      #themeOv .sheet button.menu-row>div,#languageOv .sheet button.menu-row>div{min-width:0!important;flex:1 1 auto!important}
      #themeOv .sheet button.menu-row b,#languageOv .sheet button.menu-row b{display:block!important;margin:0!important;color:#f2f3f5!important;font-size:15px!important;line-height:1.25!important;font-weight:800!important;white-space:normal!important;overflow-wrap:anywhere!important}
      #themeOv .sheet button.menu-row strong,#languageOv .sheet button.menu-row strong{flex:0 0 28px!important;width:28px!important;height:28px!important;display:grid!important;place-items:center!important;margin:0!important;border-radius:9px!important;color:#d8b34f!important;background:#1c1a12!important;font-size:17px!important;line-height:1!important;font-weight:900!important}
      #themeOv .sheet button.menu-row.digi-choice-selected,#languageOv .sheet button.menu-row.digi-choice-selected{background:linear-gradient(90deg,rgba(216,179,79,.10),#111419 45%)!important}
      #themeOv .sheet button.menu-row.digi-choice-selected b,#languageOv .sheet button.menu-row.digi-choice-selected b{color:#ffe38b!important}

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
      body.digi-light #profile.digi-profile-polished #twoFAState,body.digi-light #profile.digi-profile-polished #notifState,body.digi-light #profile.digi-profile-polished #langState,body.digi-light #profile.digi-profile-polished #themeState{color:#606a76!important}
      body.digi-light #themeOv .sheet,body.digi-light #languageOv .sheet{background:#f7f8fa!important;color:#16191e!important;border-color:#d8dde4!important}
      body.digi-light #themeOv .sheet h3,body.digi-light #languageOv .sheet h3{color:#181b20!important}
      body.digi-light #themeOv .sheet .menu-card,body.digi-light #languageOv .sheet .menu-card{background:#fff!important;border-color:#dde2e8!important}
      body.digi-light #themeOv .sheet button.menu-row,body.digi-light #languageOv .sheet button.menu-row{background:#fff!important;color:#171a1f!important;border-bottom-color:#e7ebef!important}
      body.digi-light #themeOv .sheet button.menu-row b,body.digi-light #languageOv .sheet button.menu-row b{color:#171a1f!important}
      body.digi-light #themeOv .sheet button.menu-row strong,body.digi-light #languageOv .sheet button.menu-row strong{background:#fff8df!important;color:#9a7212!important}

      @media(max-width:370px){
        #profile.digi-profile-polished .digi-profile-menu-card .menu-row{grid-template-columns:38px minmax(0,1fr) max-content!important;column-gap:9px!important;padding:8px!important}
        #profile.digi-profile-polished .digi-profile-icon{width:36px!important;height:36px!important;border-radius:11px!important}
        #profile.digi-profile-polished .digi-profile-icon svg{width:18px!important;height:18px!important}
        #profile.digi-profile-polished .digi-profile-menu-card .menu-row b{font-size:13px!important}
        #profile.digi-profile-polished #twoFAState,#profile.digi-profile-polished #notifState,#profile.digi-profile-polished #langState,#profile.digi-profile-polished #themeState{max-width:78px!important;font-size:11px!important}
        #themeOv .sheet,#languageOv .sheet{padding-left:16px!important;padding-right:16px!important}
      }
    `;
    document.head.appendChild(style);
  }

  const icons = {
    history:'<path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.7"/><path d="M4 4v4.7h4.7"/><path d="M12 7.5V12l3 1.8"/>',
    bank:'<path d="M3 10h18"/><path d="M5 10v8m4-8v8m6-8v8m4-8v8"/><path d="M3 19h18M12 3l9 5H3z"/>',
    language:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    theme:'<path d="M12 3a9 9 0 1 0 9 9c0-.7-.08-1.38-.23-2.03A7 7 0 0 1 12 3z"/>',
    notifications:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    alerts:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/><path d="M12 5v4"/>',
    referral:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6m-3-3h6"/>',
    twofactor:'<path d="M12 22s8-3.8 8-10V5l-8-3-8 3v7c0 6.2 8 10 8 10z"/><path d="M9.5 11.5 11 13l3.5-3.5"/>',
    login:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="12" cy="10" r="2.2"/>',
    security:'<path d="M12 22s8-3.8 8-10V5l-8-3-8 3v7c0 6.2 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    support:'<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><path d="M4 13a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v-6H4zm16 0h-2v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2z"/><path d="M18 19c0 2-2 3-5 3"/>',
    logout:'<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>'
  };

  function iconKind(text) {
    const value = String(text || '').toLowerCase();
    if (/trade history|history/.test(value)) return 'history';
    if (/bank|upi|payout method/.test(value)) return 'bank';
    if (/two-factor|2fa|authentication/.test(value)) return 'twofactor';
    if (/transaction alerts|alerts/.test(value)) return 'alerts';
    if (/login|sessions|devices/.test(value)) return 'login';
    if (/language/.test(value)) return 'language';
    if (/theme|appearance/.test(value)) return 'theme';
    if (/notification/.test(value)) return 'notifications';
    if (/refer|invite|earn/.test(value)) return 'referral';
    if (/support|help/.test(value)) return 'support';
    if (/logout|sign out/.test(value)) return 'logout';
    if (/security/.test(value)) return 'security';
    return 'security';
  }

  function svg(kind) {
    const body = icons[kind] || icons.security;
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  }

  function ensureProfileIcon(row) {
    let icon = row.querySelector('.icon');
    if (!icon) {
      icon = document.createElement('div');
      icon.className = 'icon';
      row.prepend(icon);
    }
    const kind = iconKind(row.textContent);
    icon.classList.add('digi-profile-icon');
    icon.dataset.profileIcon = kind;
    if (icon.dataset.profileSvg !== kind) {
      icon.innerHTML = svg(kind);
      icon.dataset.profileSvg = kind;
    }
  }

  function polishChoiceSheets() {
    document.querySelectorAll('#themeOv [data-digi-theme],#languageOv [data-digi-lang]').forEach(button => {
      const selected = button.querySelector('strong')?.textContent?.trim() === '✓';
      button.classList.toggle('digi-choice-selected', selected);
    });
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
    page.querySelectorAll('.menu-row').forEach(ensureProfileIcon);
    ['twoFAState','notifState','langState','themeState'].forEach(id => $(id)?.classList.add('digi-profile-state'));
    polishChoiceSheets();
  }

  function schedulePolish() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      polishProfile();
      polishChoiceSheets();
    });
  }

  function observe(root, key) {
    if (!root || root.dataset[key] === '1') return;
    root.dataset[key] = '1';
    new MutationObserver(schedulePolish).observe(root, { childList:true, subtree:true });
  }

  function startObservers() {
    observe($('profile'), 'profilePolishObserver');
    observe($('themeOv'), 'profileChoiceObserver');
    observe($('languageOv'), 'profileChoiceObserver');
  }

  injectProfileCss();
  schedulePolish();
  document.addEventListener('DOMContentLoaded', () => { startObservers(); schedulePolish(); });
  window.addEventListener('digirupee:state', schedulePolish);
  requestAnimationFrame(() => { startObservers(); schedulePolish(); });
})();
