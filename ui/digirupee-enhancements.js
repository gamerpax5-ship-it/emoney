(() => {
  'use strict';

  const PREFS_KEY = 'digirupee-ui-preferences';
  const REF_KEY = 'digirupee-pending-referral';
  const LANGUAGES = {
    en: 'English',
    zh: '中文',
    te: 'తెలుగు',
    or: 'ଓଡ଼ିଆ',
    ml: 'മലയാളം'
  };

  const TEXT = {
    zh: {
      Home: '首页', Sell: '出售', Orders: '订单', Rewards: '奖励', Profile: '个人资料',
      Language: '语言', Theme: '主题', Notifications: '通知', 'Refer & Earn': '推荐赚佣金',
      'Help & Support': '帮助与支持', Logout: '退出', 'SELL USDT,': '出售 USDT,', 'GET INR': '获得 INR'
    },
    te: {
      Home: 'హోమ్', Sell: 'అమ్మండి', Orders: 'ఆర్డర్లు', Rewards: 'రివార్డులు', Profile: 'ప్రొఫైల్',
      Language: 'భాష', Theme: 'థీమ్', Notifications: 'నోటిఫికేషన్లు', 'Refer & Earn': 'రిఫర్ చేసి సంపాదించండి',
      'Help & Support': 'సహాయం', Logout: 'లాగ్ అవుట్', 'SELL USDT,': 'USDT అమ్మండి,', 'GET INR': 'INR పొందండి'
    },
    or: {
      Home: 'ହୋମ', Sell: 'ବିକ୍ରି', Orders: 'ଅର୍ଡର', Rewards: 'ପୁରସ୍କାର', Profile: 'ପ୍ରୋଫାଇଲ',
      Language: 'ଭାଷା', Theme: 'ଥିମ୍', Notifications: 'ନୋଟିଫିକେସନ୍', 'Refer & Earn': 'ରେଫର୍ କରି ଆୟ କରନ୍ତୁ',
      'Help & Support': 'ସହାୟତା', Logout: 'ଲଗ୍ ଆଉଟ୍', 'SELL USDT,': 'USDT ବିକ୍ରି କରନ୍ତୁ,', 'GET INR': 'INR ପାଆନ୍ତୁ'
    },
    ml: {
      Home: 'ഹോം', Sell: 'വിൽക്കുക', Orders: 'ഓർഡറുകൾ', Rewards: 'റിവാർഡുകൾ', Profile: 'പ്രൊഫൈൽ',
      Language: 'ഭാഷ', Theme: 'തീം', Notifications: 'അറിയിപ്പുകൾ', 'Refer & Earn': 'റഫർ ചെയ്ത് സമ്പാദിക്കുക',
      'Help & Support': 'സഹായം', Logout: 'ലോഗ് ഔട്ട്', 'SELL USDT,': 'USDT വിൽക്കുക,', 'GET INR': 'INR നേടുക'
    }
  };

  const readPrefs = () => {
    try { return { language: 'en', theme: 'midnight', ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; }
    catch { return { language: 'en', theme: 'midnight' }; }
  };
  const savePrefs = prefs => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} };

  function ensureLightTheme() {
    if (document.getElementById('digi-light-theme')) return;
    const style = document.createElement('style');
    style.id = 'digi-light-theme';
    style.textContent = `
      body.digi-light,body.digi-light .app,body.digi-light .page,body.digi-light #rewards.reward-v4-ready{background:#f5f6f8!important;color:#15171a!important}
      body.digi-light .header,body.digi-light .nav,body.digi-light .card,body.digi-light .v61box,body.digi-light .v61stat,body.digi-light .v61trade,body.digi-light .profile-method-row,body.digi-light .reward-v4-zone-card,body.digi-light .reward-v4-task,body.digi-light .sheet{background:#fff!important;color:#15171a!important;border-color:#dde2e8!important}
      body.digi-light input,body.digi-light select,body.digi-light textarea{background:#fff!important;color:#15171a!important;border-color:#d8dde5!important}
      body.digi-light small,body.digi-light .desc,body.digi-light .muted{color:#606873!important}
      body.digi-light .menu-row,body.digi-light .history-row{color:#15171a!important}
    `;
    document.head.appendChild(style);
  }

  function applyTheme() {
    ensureLightTheme();
    const prefs = readPrefs();
    document.body.classList.toggle('digi-light', prefs.theme === 'light');
    const state = document.getElementById('themeState');
    const value = `${prefs.theme === 'light' ? 'Light' : prefs.theme === 'pure' ? 'Pure Black & Gold' : 'Midnight Red & Gold'} ›`;
    if (state && state.textContent !== value) state.textContent = value;
  }

  function applyTranslations() {
    const prefs = readPrefs();
    if (!LANGUAGES[prefs.language]) prefs.language = 'en';
    document.documentElement.lang = prefs.language;
    const table = TEXT[prefs.language] || {};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('script,style,input,textarea')) continue;
      if (node.__digiOriginalText === undefined) node.__digiOriginalText = node.nodeValue;
      const original = String(node.__digiOriginalText || '');
      const key = original.trim();
      if (!key) continue;
      const translated = prefs.language === 'en' ? original : (table[key] ? original.replace(key, table[key]) : node.nodeValue);
      if (node.nodeValue !== translated) node.nodeValue = translated;
    }
    const langState = document.getElementById('langState');
    const value = `${LANGUAGES[prefs.language]} ›`;
    if (langState && langState.textContent !== value) langState.textContent = value;
  }

  function installLanguageAndThemeMenus() {
    window.openLanguage = () => {
      const overlay = document.getElementById('languageOv');
      const sheet = overlay?.querySelector('.sheet');
      const prefs = readPrefs();
      if (sheet) {
        sheet.innerHTML = `<div class="handle"></div><h3>Language</h3><div class="menu-card">${Object.entries(LANGUAGES).map(([code,name]) => `<button class="menu-row" data-digi-lang="${code}"><div><b>${name}</b></div><strong>${prefs.language === code ? '✓' : '›'}</strong></button>`).join('')}</div>`;
        sheet.querySelectorAll('[data-digi-lang]').forEach(button => button.addEventListener('click', () => {
          const next = readPrefs(); next.language = button.dataset.digiLang; savePrefs(next); overlay.classList.remove('show'); applyTranslations();
        }));
      }
      overlay?.classList.add('show');
    };

    window.openTheme = () => {
      const overlay = document.getElementById('themeOv');
      const sheet = overlay?.querySelector('.sheet');
      const prefs = readPrefs();
      const themes = [['light','Light'],['midnight','Midnight'],['pure','Pure Black']];
      if (sheet) {
        sheet.innerHTML = `<div class="handle"></div><h3>Theme</h3><div class="menu-card">${themes.map(([code,name]) => `<button class="menu-row" data-digi-theme="${code}"><div><b>${name}</b></div><strong>${prefs.theme === code ? '✓' : '›'}</strong></button>`).join('')}</div>`;
        sheet.querySelectorAll('[data-digi-theme]').forEach(button => button.addEventListener('click', () => {
          const next = readPrefs(); next.theme = button.dataset.digiTheme; savePrefs(next); overlay.classList.remove('show'); applyTheme();
        }));
      }
      overlay?.classList.add('show');
    };
  }

  function captureReferral() {
    try {
      const ref = new URL(location.href).searchParams.get('ref');
      if (ref) localStorage.setItem(REF_KEY, ref.trim());
    } catch {}
  }

  function autofillReferral() {
    const input = document.getElementById('digiReferral');
    const ref = localStorage.getItem(REF_KEY) || '';
    if (input && ref) {
      if (input.value !== ref) input.value = ref;
      input.readOnly = true;
      const field = input.closest('.digi-auth-field');
      if (field) field.style.display = 'none';
    }
  }

  function makeReferralDownloadLink() {
    const refInput = document.getElementById('refLink');
    if (!refInput) return;
    const raw = String(refInput.value || '');
    let code = '';
    try { code = new URL(raw, location.origin).searchParams.get('ref') || ''; } catch {}
    if (!code && /^[A-Za-z0-9_-]{3,30}$/.test(raw)) code = raw;
    if (code) {
      const value = `https://digirupee.loktron.com/download/digirupee.apk?ref=${encodeURIComponent(code)}`;
      if (refInput.value !== value) refInput.value = value;
    }
  }

  const seenNotifications = new Set();
  function surfaceItems(items) {
    if (!window.DigiAndroid?.notify || !Array.isArray(items)) return;
    items.filter(item => !item.readAt && item.id && !seenNotifications.has(item.id)).slice(0,3).forEach(item => {
      seenNotifications.add(item.id);
      try { window.DigiAndroid.notify(String(item.title || 'digiRupee'), String(item.message || '')); } catch {}
    });
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const target = String(args[0]?.url || args[0] || '');
      if (target.includes('/api/digirupee/notifications?')) {
        response.clone().json().then(payload => surfaceItems(payload?.notifications || [])).catch(() => {});
      }
    } catch {}
    return response;
  };

  captureReferral();
  ensureLightTheme();
  installLanguageAndThemeMenus();

  let scheduled = false;
  const refreshUiEnhancements = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyTheme();
      applyTranslations();
      autofillReferral();
      makeReferralDownloadLink();
    });
  };

  const observer = new MutationObserver(refreshUiEnhancements);
  observer.observe(document.documentElement, { childList:true, subtree:true });

  window.addEventListener('DOMContentLoaded', () => {
    refreshUiEnhancements();
    try { window.DigiAndroid?.requestNotificationPermission?.(); } catch {}
  });
})();
