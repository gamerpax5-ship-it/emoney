from pathlib import Path

# Auth UI: visual rebuild only. Existing auth/session API functions stay untouched.
p = Path('ui/digirupee-app.js')
s = p.read_text(encoding='utf-8')
start = s.index('  function digiUsdtLogo(size = 58) {')
end = s.index('  async function submitAuth(event) {', start)

block = r'''  function digiUsdtLogo(size = 68) {
    const safe = Math.max(36, Number(size) || 68);
    return `<svg class="digi-usdt-svg" width="${safe}" height="${safe}" viewBox="0 0 64 64" role="img" aria-label="USDT"><circle cx="32" cy="32" r="32" fill="#26A17B"/><rect x="17" y="15" width="30" height="6" rx="2.5" fill="#fff"/><rect x="29" y="19" width="6" height="27" rx="2" fill="#fff"/><ellipse cx="32" cy="29" rx="18" ry="6.6" fill="none" stroke="#fff" stroke-width="3.6"/></svg>`;
  }

  function injectAuth() {
    const style = document.createElement('style');
    style.textContent = `
      .digi-auth{position:fixed;inset:0;z-index:1000;overflow:auto;padding:max(26px,env(safe-area-inset-top)) 18px max(24px,env(safe-area-inset-bottom));background:radial-gradient(circle at 18% 8%,rgba(38,161,123,.18),transparent 25%),radial-gradient(circle at 92% 30%,rgba(244,200,78,.08),transparent 24%),linear-gradient(180deg,#06080a 0%,#090b0f 100%);color:#f7f8fa;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
      .digi-auth[hidden]{display:none}.digi-auth *{box-sizing:border-box}.digi-auth button,.digi-auth input{font:inherit}
      .digi-auth-shell{width:min(100%,410px);min-height:calc(100svh - 50px);margin:0 auto;display:flex;flex-direction:column;justify-content:center;position:relative}
      .digi-auth-shell:before{content:'';position:absolute;inset:13% -18px auto;height:185px;border-radius:42px;background:linear-gradient(135deg,rgba(38,161,123,.10),transparent 55%);filter:blur(2px);pointer-events:none}
      .digi-auth-brand{position:relative;z-index:2;display:flex;align-items:center;gap:13px;margin:0 0 18px;padding:0 5px}
      .digi-auth-logo{width:66px;height:66px;display:grid;place-items:center;border-radius:22px;background:linear-gradient(145deg,rgba(38,161,123,.16),rgba(255,255,255,.025));border:1px solid rgba(84,207,169,.24);box-shadow:0 14px 38px rgba(0,0,0,.28)}
      .digi-usdt-svg{display:block;filter:drop-shadow(0 8px 20px rgba(38,161,123,.25))}
      .digi-auth-brand h1{margin:0;color:#fff;font-size:27px;line-height:1.05;letter-spacing:-.035em}.digi-auth-brand i{display:block;width:38px;height:3px;margin-top:8px;border-radius:99px;background:linear-gradient(90deg,#26a17b,#f1c64b);font-style:normal}
      .digi-auth-card{position:relative;z-index:2;overflow:hidden;border:1px solid #2a3038;border-radius:24px;background:linear-gradient(180deg,rgba(19,23,29,.98),rgba(12,15,19,.99));box-shadow:0 30px 80px rgba(0,0,0,.48);padding:23px 21px 21px}
      .digi-auth-card:before{content:'';position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,#26a17b 0%,#7bd7bb 42%,#f2c64d 100%)}
      .digi-auth-head{margin:2px 0 20px}.digi-auth-head h2{margin:0;color:#fff;font-size:27px;line-height:1.08;letter-spacing:-.035em}
      .digi-auth-fields{display:grid;gap:15px}.digi-auth-register-fields{display:grid;gap:15px}.digi-auth-field{display:grid;gap:8px}.digi-auth-field label{color:#cbd1d8;font-size:12px;font-weight:850;letter-spacing:.045em}
      .digi-auth-input{display:flex;align-items:center;min-height:56px;border:1px solid #303640;border-radius:14px;background:#090c10;transition:border-color .18s ease,box-shadow .18s ease,background .18s ease}
      .digi-auth-input:focus-within{border-color:#3fa884;background:#0b0f13;box-shadow:0 0 0 4px rgba(38,161,123,.09)}
      .digi-auth-input input{width:100%;height:54px;border:0;outline:0;background:transparent;color:#fff;padding:0 15px;font-size:15.5px;line-height:1.2}.digi-auth-input input::placeholder{color:#727b87;opacity:1}.digi-auth-show{align-self:stretch;border:0;background:transparent;color:#c0c6ce;padding:0 15px;font-size:11.5px;font-weight:850}
      .digi-auth-error{margin:11px 2px 0;color:#ff929d;font-size:11.5px;line-height:1.45}.digi-auth-error:empty{display:none}
      .digi-auth-primary{width:100%;min-height:54px;margin-top:17px;border:0;border-radius:14px;background:linear-gradient(105deg,#f2c64d,#ffdc72);color:#211900;font-size:15px;font-weight:950;box-shadow:0 13px 30px rgba(184,135,23,.18)}.digi-auth-primary:active{transform:translateY(1px)}
      .digi-auth-switch{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:18px;color:#a4abb5;font-size:13px}.digi-auth-switch button{border:0;background:transparent;color:#f3cf63;padding:2px 0;font-size:13px;font-weight:900}
      .digi-auth-terms{margin:15px 5px 0;color:#9098a3;text-align:center;font-size:11px;line-height:1.5}.digi-auth-terms b{color:#c1c7cf}.digi-auth-back{display:block;width:100%;margin-top:14px;border:0;background:transparent;color:#f2cf62;font-size:12.5px;font-weight:900}
      .digi-auth-challenge p{margin:7px 0 18px;color:#a7aeb8;font-size:12.5px;line-height:1.5}
      .digi-security-extra{margin-top:12px;padding:11px;border:1px solid #292c34;border-radius:12px;background:#0c0e12}.digi-security-extra code{word-break:break-all;color:#f4d66e;font-size:11.5px}.digi-empty{padding:18px;text-align:center;color:#9ba2ad;font-size:12px}.digi-action-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.digi-action-row button{flex:1;min-width:120px}.digi-copy{word-break:break-all;color:#f4d66e;font-size:11.5px}
      @media(max-width:370px){.digi-auth{padding-left:14px;padding-right:14px}.digi-auth-shell{justify-content:flex-start;padding-top:24px}.digi-auth-brand{margin-bottom:15px}.digi-auth-logo{width:58px;height:58px;border-radius:19px}.digi-auth-logo .digi-usdt-svg{width:50px;height:50px}.digi-auth-brand h1{font-size:24px}.digi-auth-card{padding:20px 17px 18px}.digi-auth-head h2{font-size:24px}.digi-auth-input input{font-size:15px}.digi-auth-switch,.digi-auth-switch button{font-size:12.5px}}
    `;
    document.head.appendChild(style);
    const node = document.createElement('div');
    node.id = 'digiAuth';
    node.className = 'digi-auth';
    node.hidden = true;
    node.innerHTML = `<div class="digi-auth-shell"><div class="digi-auth-brand"><div class="digi-auth-logo">${digiUsdtLogo(56)}</div><div><h1>digiRupee</h1><i></i></div></div><section class="digi-auth-card"><div id="digiAuthBody"></div></section></div>`;
    document.body.appendChild(node);
  }

  function renderAuth(mode = 'login', error = '') {
    const body = $('digiAuthBody');
    if (!body) return;
    if (mode === 'challenge') {
      body.innerHTML = `<div class="digi-auth-challenge"><div class="digi-auth-head"><h2>Verify login</h2><p>Enter your authenticator or recovery code.</p></div><form id="digi2faForm"><div class="digi-auth-field"><label>VERIFICATION CODE</label><div class="digi-auth-input"><input id="digi2faCode" inputmode="text" autocomplete="one-time-code" placeholder="Enter code" required></div></div><div id="digiAuthError" class="digi-auth-error">${esc(error)}</div><button class="digi-auth-primary" type="submit">Verify</button></form></div>`;
      $('digi2faForm')?.addEventListener('submit', submitTwoFactorLogin);
      return;
    }
    const register = mode === 'register';
    body.innerHTML = `<div class="digi-auth-head"><h2>${register ? 'Create account' : 'Welcome back'}</h2></div><form id="digiAuthForm"><div class="digi-auth-fields">${register ? `<div id="digiRegisterFields" class="digi-auth-register-fields"><div class="digi-auth-field"><label>FULL NAME</label><div class="digi-auth-input"><input id="digiFullName" autocomplete="name" maxlength="80" placeholder="Your name" required></div></div><div class="digi-auth-field"><label>MOBILE</label><div class="digi-auth-input"><input id="digiMobile" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="Mobile number" required></div></div></div>` : '<div id="digiRegisterFields" hidden></div>'}<div class="digi-auth-field"><label>EMAIL ADDRESS</label><div class="digi-auth-input"><input id="digiEmail" type="email" autocomplete="email" placeholder="name@example.com" required></div></div><div class="digi-auth-field"><label>PASSWORD</label><div class="digi-auth-input"><input id="digiPassword" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="8" placeholder="Enter password" required><button class="digi-auth-show" id="digiPasswordToggle" type="button">SHOW</button></div></div>${register ? `<div class="digi-auth-field"><label>REFERRAL CODE <span style="color:#78818d;font-weight:650">OPTIONAL</span></label><div class="digi-auth-input"><input id="digiReferral" autocomplete="off" maxlength="30" placeholder="Referral code"></div></div>` : ''}</div><div id="digiAuthError" class="digi-auth-error">${esc(error)}</div><button class="digi-auth-primary" type="submit">${register ? 'Create account' : 'Sign in'}</button>${register ? '<p class="digi-auth-terms">By registering you agree to the <b>Terms</b> and <b>Privacy Policy</b>.</p><button class="digi-auth-back" type="button" data-auth-mode="login">Already have an account? Sign in</button>' : '<div class="digi-auth-switch"><span>New user?</span><button type="button" data-auth-mode="register">Register</button></div>'}</form>`;
    body.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => renderAuth(button.dataset.authMode)));
    $('digiPasswordToggle')?.addEventListener('click', () => {
      const input = $('digiPassword');
      if (!input) return;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      $('digiPasswordToggle').textContent = visible ? 'SHOW' : 'HIDE';
    });
    $('digiAuthForm')?.addEventListener('submit', submitAuth);
  }

'''
s = s[:start] + block + s[end:]
p.write_text(s, encoding='utf-8')

# Home / UPI / Bank / Profile readability floor.
p = Path('ui/digirupee-layout-v3.js')
s = p.read_text(encoding='utf-8')
marker = "      @media(max-width:370px){\n        .v61stats"
block = """      /* Readability V4: mobile-readable secondary text while preserving card hierarchy. */
      body.digi-layout-v61 .header-copy p{font-size:12.8px!important;line-height:1.42!important;color:#b9bec7!important}
      body.digi-layout-v61 #home small,body.digi-layout-v61 #profile small{font-size:11.7px!important;line-height:1.45!important;color:#b3b8c1!important}
      body.digi-layout-v61 #home .card p,body.digi-layout-v61 #home .empty p,body.digi-layout-v61 #profile .empty p{font-size:12px!important;line-height:1.5!important;color:#b0b6bf!important}
      body.digi-layout-v61 #home .order-copy small,body.digi-layout-v61 #home .order-money small{font-size:11.5px!important;line-height:1.42!important;color:#adb3bc!important}
      body.digi-layout-v61 #home .status-pill,body.digi-layout-v61 #home .badge{font-size:10.7px!important}
      body.digi-layout-v61 #home .desc,body.digi-layout-v61 #profile .desc,body.digi-layout-v61 #profile .muted{font-size:11.8px!important;line-height:1.48!important;color:#adb3bc!important}
      #v61root small{font-size:11.5px!important;line-height:1.45!important}
      .v61stat small,.v61muted{font-size:11.3px!important;color:#aeb4bd!important}.v61stat b{font-size:11.8px!important}
      .v61info small{font-size:11.3px!important}.v61info b{font-size:11.8px!important}
      .v61title small{font-size:11px!important}.v61title p{font-size:12.3px!important;line-height:1.5!important;color:#b1b7c0!important}
      .v61btn{font-size:11.2px!important}.v61pill{font-size:10.8px!important}
      .v61amount small{font-size:11.2px!important;color:#adb3bc!important}.v61help,.v61status{font-size:11.2px!important;line-height:1.45!important;color:#adb3bc!important}
      .v61addr code{font-size:10.8px!important;line-height:1.48!important}.v61warn{font-size:11.1px!important;line-height:1.5!important}
      .v61meta small,.v61sum small{font-size:10.8px!important}.v61meta b,.v61sum b{font-size:11.2px!important}
      .v61bank b{font-size:11.4px!important}.v61bank small{font-size:11.1px!important;line-height:1.45!important;color:#adb3bc!important}
      .v61trade small{font-size:11.2px!important;line-height:1.45!important;color:#adb3bc!important}.v61filters button{font-size:10.9px!important}
      .v61routecopy b{font-size:11.8px!important}.v61routecopy small{font-size:11.4px!important;line-height:1.46!important;color:#adb3bc!important}
      #profile .method-toolbar .manage-btn,#profile .method-toolbar button{font-size:11px!important}
      #profile .profile-method-copy b{font-size:12px!important}
      #profile .profile-method-copy small{font-size:11.5px!important;line-height:1.45!important;color:#b3b8c1!important}
      #profile .profile-method-copy span{font-size:11.2px!important;line-height:1.45!important;color:#9fa6b0!important}
"""
if marker not in s:
    raise SystemExit('layout marker missing')
s = s.replace(marker, block + marker, 1)
p.write_text(s, encoding='utf-8')

# Rewards readability.
p = Path('ui/digirupee-rewards.js')
s = p.read_text(encoding='utf-8')
marker = "      @media(max-width:370px){\n        .reward-v4-copy"
block = """      /* Readability V4: readable secondary Rewards copy. */
      .reward-v4-kicker{font-size:10.8px!important}.reward-v4-copy p{font-size:12px!important;line-height:1.5!important}.reward-v4-explore{font-size:11.3px!important}
      .reward-v4-wallet small{font-size:10.7px!important}.reward-v4-wallet span{font-size:10.4px!important;line-height:1.4!important}
      .reward-v4-news strong{font-size:10.8px!important}.reward-v4-news span{font-size:10.9px!important}.reward-v4-news em{font-size:10px!important}
      .reward-v4-wheel-label{font-size:10.2px!important}.reward-v4-wheel-copy p{font-size:11.6px!important;line-height:1.5!important;color:#b8b2aa!important}
      .reward-v4-spin-status small{font-size:10.8px!important}.reward-v4-section-head button{font-size:10.8px!important}
      .reward-v4-zone-card b{font-size:11.1px!important}.reward-v4-zone-card small{font-size:10.3px!important;line-height:1.4!important;color:#aab0b8!important}
      .reward-v4-task p{font-size:11.2px!important;line-height:1.48!important;color:#adb3bc!important}.reward-v4-task-reward{font-size:10.9px!important}.reward-v4-task button{font-size:10.8px!important}
      .reward-v4-empty{font-size:11.2px!important}
"""
if marker not in s:
    raise SystemExit('rewards marker missing')
s = s.replace(marker, block + marker, 1)
p.write_text(s, encoding='utf-8')

# Force fresh hosted assets in existing WebViews.
p = Path('scripts/prepare-assets.mjs')
s = p.read_text(encoding='utf-8')
if 'v=20260915b' not in s:
    raise SystemExit('expected cache version missing')
s = s.replace('v=20260915b', 'v=20260915c')
p.write_text(s, encoding='utf-8')
