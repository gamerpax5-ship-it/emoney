from pathlib import Path

# Server defaults + persisted-config migration + profile currency validation.
p = Path('website/server.mjs')
s = p.read_text(encoding='utf-8')

old = """    currencies: [
      { code: 'INR', name: 'Indian Rupee', symbol: '₹', status: 'live', note: 'Bank transfer, IMPS, NEFT and RTGS purchase orders enabled.' },
      { code: 'USD', name: 'US Dollar', symbol: '$', status: 'coming-soon', note: 'Additional purchase rails will appear when activated.' },
      { code: 'EUR', name: 'Euro', symbol: '€', status: 'coming-soon', note: 'European payment options are planned for future rollout.' },
      { code: 'GBP', name: 'British Pound', symbol: '£', status: 'coming-soon', note: 'UK banking and pricing will appear when available.' },
      { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', status: 'coming-soon', note: 'Gulf payment rails are prepared for future rollout.' },
      { code: 'USDT', name: 'Tether USD', symbol: '₮', status: 'coming-soon', note: 'Crypto-side purchase and settlement options will appear when activated.' }
    ],"""
new = """    currencies: [
      { code: 'INR', name: 'Indian Rupee', symbol: '₹', status: 'live', note: 'Indian fiat rail is active.' },
      { code: 'USD', name: 'US Dollar', symbol: '$', status: 'live', note: 'US Dollar fiat rail is active.' },
      { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', status: 'coming-soon', note: 'Bangladesh fiat rail is prepared for rollout.' },
      { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', status: 'coming-soon', note: 'Pakistan fiat rail is prepared for rollout.' },
      { code: 'EUR', name: 'Euro', symbol: '€', status: 'coming-soon', note: 'Euro payment rail is prepared for rollout.' },
      { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', status: 'coming-soon', note: 'Chinese Yuan fiat rail is prepared for rollout.' },
      { code: 'GBP', name: 'British Pound', symbol: '£', status: 'coming-soon', note: 'UK fiat rail is prepared for rollout.' },
      { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', status: 'coming-soon', note: 'UAE fiat rail is prepared for rollout.' }
    ],"""
if old not in s:
    raise SystemExit('default currency list target missing')
s = s.replace(old, new, 1)

anchor = """let db = await loadDb();
const adminUsers = parseAdminUsers();
"""
replacement = """let db = await loadDb();

function ensureLoktronFiatCurrencies() {
  const current = Array.isArray(db.config?.currencies) ? db.config.currencies : [];
  const base = structuredClone(defaultData.config.currencies);
  const baseCodes = new Set(base.map(item => item.code));
  const extras = current
    .filter(item => {
      const code = String(item?.code || '').trim().toUpperCase();
      return code && code !== 'USDT' && !baseCodes.has(code);
    })
    .slice(0, Math.max(0, 12 - base.length));
  const next = [...base, ...extras];
  let changed = JSON.stringify(current) !== JSON.stringify(next);
  db.config.currencies = next;
  for (const user of db.users) {
    if (String(user.currency || '').toUpperCase() === 'USDT') {
      user.currency = 'INR';
      changed = true;
    }
  }
  return changed;
}

const adminUsers = parseAdminUsers();
"""
if anchor not in s:
    raise SystemExit('db boot anchor missing')
s = s.replace(anchor, replacement, 1)

old_profile = "user.currency = ['INR'].includes(currency) ? currency : 'INR';"
new_profile = "const liveFiatCodes = db.config.currencies.filter(item => item.status === 'live' && item.code !== 'USDT').map(item => item.code);\n    user.currency = liveFiatCodes.includes(currency) ? currency : 'INR';"
if old_profile not in s:
    raise SystemExit('profile currency validation target missing')
s = s.replace(old_profile, new_profile, 1)

old_admin = """      db.config.currencies = b.currencies.slice(0, 12).map(item => ({
        code: String(item.code || '').trim().toUpperCase().slice(0, 8),
        name: String(item.name || '').trim().slice(0, 40),
        symbol: String(item.symbol || '').trim().slice(0, 6),
        status: String(item.status || '').toLowerCase() === 'live' ? 'live' : 'coming-soon',
        note: String(item.note || '').trim().slice(0, 140)
      })).filter(item => item.code && item.name);
      if (!db.config.currencies.some(item => item.code === 'INR')) db.config.currencies.unshift(structuredClone(defaultData.config.currencies[0]));
"""
new_admin = """      db.config.currencies = b.currencies.slice(0, 12).map(item => ({
        code: String(item.code || '').trim().toUpperCase().slice(0, 8),
        name: String(item.name || '').trim().slice(0, 40),
        symbol: String(item.symbol || '').trim().slice(0, 6),
        status: String(item.status || '').toLowerCase() === 'live' ? 'live' : 'coming-soon',
        note: String(item.note || '').trim().slice(0, 140)
      })).filter(item => item.code && item.name && item.code !== 'USDT');
      for (const code of ['INR', 'USD']) {
        let row = db.config.currencies.find(item => item.code === code);
        if (!row) {
          row = structuredClone(defaultData.config.currencies.find(item => item.code === code));
          db.config.currencies.unshift(row);
        }
        row.status = 'live';
      }
"""
if old_admin not in s:
    raise SystemExit('admin currency sanitize target missing')
s = s.replace(old_admin, new_admin, 1)

old_boot = """const digiBootStateChanged = [
  ensureDigiReferralCodes(),
  ensureDigiWheelDefaults(),
  ensureDigiAddressAssignments(),
  ensureDigiSecurityFields(),
  ensureDigiSessionFields()
].some(Boolean);
if (digiBootStateChanged) await persist();
"""
new_boot = """const loktronBootStateChanged = ensureLoktronFiatCurrencies();
const digiBootStateChanged = [
  ensureDigiReferralCodes(),
  ensureDigiWheelDefaults(),
  ensureDigiAddressAssignments(),
  ensureDigiSecurityFields(),
  ensureDigiSessionFields()
].some(Boolean);
if (loktronBootStateChanged || digiBootStateChanged) await persist();
"""
if old_boot not in s:
    raise SystemExit('boot migration target missing')
s = s.replace(old_boot, new_boot, 1)
p.write_text(s, encoding='utf-8')

# Landing static fallback: fiat only, INR + USD live.
p = Path('website/src/part-007.html')
s = p.read_text(encoding='utf-8')
s = s.replace('<div class="stat"><b>INR</b><small>Live purchase currency</small></div>', '<div class="stat"><b>INR · USD</b><small>Live fiat rails</small></div>', 1)
s = s.replace('INR is live today, while USD, EUR and GBP appear in the interface as planned currency rails.', 'INR and USD are live. BDT, PKR, EUR, CNY, GBP and AED are prepared as additional fiat rails.', 1)
s = s.replace('<div class="section-head"><div class="kicker">CURRENCY EXPANSION</div><h2>INR live today. More fiat rails prepared for rollout.</h2></div>', '<div class="section-head"><div class="kicker">FIAT CURRENCIES</div><h2>INR and USD live. More fiat rails prepared for rollout.</h2></div>', 1)
old_grid = """<div class="currency-grid" id="currencyGrid">
<div class="currency"><div class="currency-top"><div class="currency-icon">₹</div><span class="statuspill live">LIVE</span></div><h3>INR — Indian Rupee</h3><p>Bank transfer, IMPS, NEFT and RTGS purchase orders enabled.</p></div>
<div class="currency"><div class="currency-top"><div class="currency-icon">$</div><span class="statuspill soon">COMING SOON</span></div><h3>USD — US Dollar</h3><p>Additional purchase rails will appear when activated.</p></div>
<div class="currency"><div class="currency-top"><div class="currency-icon">€</div><span class="statuspill soon">COMING SOON</span></div><h3>EUR — Euro</h3><p>European payment options are planned for future rollout.</p></div>
<div class="currency"><div class="currency-top"><div class="currency-icon">£</div><span class="statuspill soon">COMING SOON</span></div><h3>GBP — British Pound</h3><p>UK banking and pricing will appear when available.</p></div>
</div>"""
new_grid = """<div class="currency-grid" id="currencyGrid">
<div class="currency"><div class="currency-top"><div class="currency-icon">₹</div><span class="statuspill live">LIVE</span></div><h3>INR — Indian Rupee</h3><p>Indian fiat rail is active.</p></div>
<div class="currency"><div class="currency-top"><div class="currency-icon">$</div><span class="statuspill live">LIVE</span></div><h3>USD — US Dollar</h3><p>US Dollar fiat rail is active.</p></div>
<div class="currency"><div class="currency-top"><div class="currency-icon">৳</div><span class="statuspill soon">COMING SOON</span></div><h3>BDT — Bangladeshi Taka</h3><p>Bangladesh fiat rail is prepared for rollout.</p></div>
<div class="currency"><div class="currency-top"><div class="currency-icon">₨</div><span class="statuspill soon">COMING SOON</span></div><h3>PKR — Pakistani Rupee</h3><p>Pakistan fiat rail is prepared for rollout.</p></div>
<div class="currency"><div class="currency-top"><div class="currency-icon">€</div><span class="statuspill soon">COMING SOON</span></div><h3>EUR — Euro</h3><p>Euro payment rail is prepared for rollout.</p></div>
<div class="currency"><div class="currency-top"><div class="currency-icon">¥</div><span class="statuspill soon">COMING SOON</span></div><h3>CNY — Chinese Yuan</h3><p>Chinese Yuan fiat rail is prepared for rollout.</p></div>
<div class="currency"><div class="currency-top"><div class="currency-icon">£</div><span class="statuspill soon">COMING SOON</span></div><h3>GBP — British Pound</h3><p>UK fiat rail is prepared for rollout.</p></div>
<div class="currency"><div class="currency-top"><div class="currency-icon">د.إ</div><span class="statuspill soon">COMING SOON</span></div><h3>AED — UAE Dirham</h3><p>UAE fiat rail is prepared for rollout.</p></div>
</div>"""
if old_grid not in s:
    raise SystemExit('static currency grid target missing')
s = s.replace(old_grid, new_grid, 1)
p.write_text(s, encoding='utf-8')

# Dynamic notice grammar for multiple live fiat currencies.
p = Path('website/src/part-010.html')
s = p.read_text(encoding='utf-8')
old_notice = "if ($('currencyNotice')) $('currencyNotice').textContent = `${live} is currently live. ${soon} are marked Coming Soon.`;"
new_notice = "if ($('currencyNotice')) $('currencyNotice').textContent = `Live fiat: ${live}. Coming soon: ${soon}.`;"
if old_notice not in s:
    raise SystemExit('currency notice target missing')
s = s.replace(old_notice, new_notice, 1)
p.write_text(s, encoding='utf-8')
