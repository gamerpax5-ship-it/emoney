import { readFile, writeFile } from 'node:fs/promises';

const path = 'ui/digirupee-rewards.js';
let source = await readFile(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
  '#rewards.reward-v4-ready{padding:0 0 calc(18px + var(--digi-safe-bottom,0px))!important;background:#050607!important;box-sizing:border-box}',
  '#rewards.reward-v4-ready{padding:0 0 calc(94px + var(--digi-safe-bottom,0px))!important;background:#050607!important;box-sizing:border-box}',
  'bottom navigation clearance'
);

replaceOnce(
`      .reward-v4-hero:before,.reward-v4-hero:after{content:'₮';position:absolute;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle at 30% 25%,#fff0a0,#e3a323 68%,#724500);color:#7c4c00;font-weight:950;box-shadow:0 8px 18px #0005}
      .reward-v4-hero:before{width:58px;height:58px;right:24px;top:26px;font-size:26px;transform:rotate(12deg)}
      .reward-v4-hero:after{width:38px;height:38px;right:105px;bottom:27px;font-size:18px;transform:rotate(-15deg)}
      .reward-v4-mascot{position:absolute;z-index:1;top:0;right:0;width:57%;height:84%;overflow:hidden;pointer-events:none;opacity:.96;mask-image:linear-gradient(90deg,transparent 0,#000 28%,#000 100%);-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 28%,#000 100%)}
      .reward-v4-mascot img{position:absolute;top:-54px;right:-1px;width:176%;max-width:none;height:auto;filter:saturate(1.05) contrast(1.02)}
`,
`      .reward-v4-hero:before{content:'';position:absolute;z-index:2;right:0;bottom:0;width:61%;height:35%;background:linear-gradient(180deg,transparent 0,rgba(34,10,10,.82) 56%,#180909 100%);pointer-events:none}
      .reward-v4-hero:after{content:'';position:absolute;z-index:2;right:0;top:0;width:12%;height:100%;background:linear-gradient(90deg,transparent,rgba(23,8,9,.84));pointer-events:none}
      .reward-v4-mascot{position:absolute;z-index:1;top:0;right:0;width:57%;height:86%;overflow:hidden;pointer-events:none;opacity:.96;mask-image:linear-gradient(90deg,transparent 0,#000 22%,#000 100%);-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 22%,#000 100%)}
      .reward-v4-mascot img{position:absolute;top:-54px;right:-38%;width:176%;max-width:none;height:auto;filter:saturate(1.04) contrast(1.02)}
`,
  'mascot crop and masks'
);

replaceOnce('.reward-v4-coin{position:absolute;z-index:2;', '.reward-v4-coin{position:absolute;z-index:4;', 'coin stacking');
replaceOnce('.reward-v4-copy{position:relative;z-index:3;max-width:62%}', '.reward-v4-copy{position:relative;z-index:4;max-width:62%}', 'copy stacking');
replaceOnce('.reward-v4-wallet{position:absolute;z-index:3;', '.reward-v4-wallet{position:absolute;z-index:4;', 'wallet stacking');
replaceOnce(
  '.reward-v4-news span{min-width:0;font-size:8.8px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.reward-v4-news span{min-width:0;color:#e7e3dc;font-size:8.8px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  'news text color'
);

replaceOnce(
  '<div class="reward-v4-wheel-copy"><span class="reward-v4-kicker">DAILY SPIN</span><h3>Golden Daily Wheel</h3><p>One server-controlled spin per eligible day. The result is selected by the backend, then the wheel animates to that reward.</p>',
  '<div class="reward-v4-wheel-copy"><span class="reward-v4-kicker">DAILY SPIN</span><h3>Golden Daily Wheel</h3><p>One eligible spin per day. Your reward is selected securely by the server.</p>',
  'wheel description'
);
replaceOnce('<button id="rewardV4More" type="button">More Rewards ›</button>', '<button id="rewardV4More" type="button">Reward History ›</button>', 'history label');

replaceOnce(
`    const segments = model.wheel?.segments || [];
    const count = Math.max(8, segments.length || 8);
    for (let i = 0; i < 8; i++) {
      const segment = segments[i];
      const label = document.createElement('span');
      label.className = 'reward-v4-wheel-label';
      const angle = i * 45 + 22.5;
      label.style.transform = \`rotate(\${angle}deg) translateY(-68px) rotate(\${-angle}deg)\`;
      label.textContent = segment ? \`\${num(segment.rewardAmount)}₮\` : '—';
      wheel.appendChild(label);
    }
`,
`    const segments = model.wheel?.segments || [];
    if (!segments.length) return;
    for (let i = 0; i < Math.min(8, segments.length); i++) {
      const segment = segments[i];
      const label = document.createElement('span');
      label.className = 'reward-v4-wheel-label';
      const angle = i * 45 + 22.5;
      label.style.transform = \`rotate(\${angle}deg) translateY(-68px) rotate(\${-angle}deg)\`;
      label.textContent = \`\${num(segment.rewardAmount)}₮\`;
      wheel.appendChild(label);
    }
`,
  'wheel placeholder labels'
);

replaceOnce(
`    button.textContent = spinning ? 'Spinning…' : can ? 'Spin Now →' : 'Used Today';
    if ($('rewardV4SpinTitle')) $('rewardV4SpinTitle').textContent = !wheel?.enabled ? 'Daily wheel disabled' : wheel.canSpin ? 'Ready to Spin' : wheel.previousResult ? \`Today: \${num(wheel.previousResult.rewardAmount)} USDT\` : 'Used Today';
    if ($('rewardV4SpinNote')) $('rewardV4SpinNote').textContent = wheel?.canSpin ? '1 spin available today' : wheel?.nextEligibleAt ? \`Next \${new Date(wheel.nextEligibleAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}\` : 'Come back later';
`,
`    button.textContent = spinning ? 'Spinning…' : can ? 'Spin Now →' : !wheel?.enabled ? 'Unavailable' : 'Used Today';
    if ($('rewardV4SpinTitle')) $('rewardV4SpinTitle').textContent = !wheel?.enabled ? 'Daily wheel unavailable' : wheel.canSpin ? 'Ready to Spin' : wheel.previousResult ? \`Today: \${num(wheel.previousResult.rewardAmount)} USDT\` : 'Used Today';
    if ($('rewardV4SpinNote')) $('rewardV4SpinNote').textContent = !wheel?.enabled ? 'This reward is not active right now.' : wheel?.canSpin ? '1 spin available today' : wheel?.nextEligibleAt ? \`Next \${new Date(wheel.nextEligibleAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}\` : 'Come back later';
`,
  'disabled wheel state'
);

await writeFile(path, source, 'utf8');
console.log('Rewards visual patch applied');
