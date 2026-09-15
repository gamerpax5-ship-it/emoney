import { readFile, writeFile } from 'node:fs/promises';

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(oldText, newText);
}

const adminPath = 'website/digirupee-admin.html';
let admin = await readFile(adminPath, 'utf8');
const oldAdmin = `function defaultWheelSegments() { return Array.from({ length:8 }, (_,index) => ({ id:\`sector_\${index+1}\`, label:\`Prize \${index+1}\`, rewardAmount:'0', probabilityWeight:1, enabled:true })); }
      function normalizedWheelSegments(config) { const source = Array.isArray(config?.segments) && config.segments.length === 8 ? config.segments : defaultWheelSegments(); return source.map((item,index) => ({ id:String(item.id || \`sector_\${index+1}\`), label:String(item.label || \`Prize \${index+1}\`), rewardAmount:String(item.rewardAmount ?? formatRewardMicros(item.rewardAmountMicros)), probabilityWeight:Number.isFinite(Number(item.probabilityWeight)) ? Number(item.probabilityWeight) : 1, enabled:item.enabled !== false })); }`;
const newAdmin = `function defaultWheelSegments() { const rewards=[1,3,5,6,8,10,12,15]; const weights=[20,18,16,14,12,10,6,4]; return rewards.map((reward,index) => ({ id:\`sector_\${index+1}\`, label:\`\${reward} USDT\`, rewardAmount:String(reward), probabilityWeight:weights[index], enabled:true })); }
      function normalizedWheelSegments(config) { const current = Array.isArray(config?.segments) ? config.segments : []; const legacyPlaceholder = current.length === 8 && current.every((item,index) => String(item.id || '') === \`sector_\${index+1}\` && Number(item.rewardAmount ?? formatRewardMicros(item.rewardAmountMicros)) === 0 && Number(item.probabilityWeight) === 1); const source = current.length === 8 && !legacyPlaceholder ? current : defaultWheelSegments(); return source.map((item,index) => ({ id:String(item.id || \`sector_\${index+1}\`), label:String(item.label || \`\${item.rewardAmount ?? formatRewardMicros(item.rewardAmountMicros)} USDT\`), rewardAmount:String(item.rewardAmount ?? formatRewardMicros(item.rewardAmountMicros)), probabilityWeight:Number.isFinite(Number(item.probabilityWeight)) ? Number(item.probabilityWeight) : defaultWheelSegments()[index].probabilityWeight, enabled:item.enabled !== false })); }`;
admin = replaceOnce(admin, oldAdmin, newAdmin, 'admin defaults');
admin = replaceOnce(admin, 'Higher weight means that sector is selected more often.', 'Higher weight means that sector is selected more often. Current defaults make 1–10 USDT land about 90% of spins, while 12 and 15 USDT stay rarer.', 'admin help');
await writeFile(adminPath, admin, 'utf8');

const serverPath = 'website/server.mjs';
let server = await readFile(serverPath, 'utf8');
const marker = 'function ensureDigiReferralCodes() {';
const helper = `const defaultDigiWheelRewards = [1, 3, 5, 6, 8, 10, 12, 15];
const defaultDigiWheelWeights = [20, 18, 16, 14, 12, 10, 6, 4];
function defaultDigiWheelSegments() {
  return defaultDigiWheelRewards.map((reward, index) => ({
    id: \`sector_\${index + 1}\`,
    label: \`\${reward} USDT\`,
    rewardAmountMicros: reward * 1_000_000,
    probabilityWeight: defaultDigiWheelWeights[index],
    enabled: true
  }));
}

function ensureDigiWheelDefaults() {
  const config = db.digirupee?.wheelConfig;
  if (!config) return false;
  const segments = Array.isArray(config.segments) ? config.segments : [];
  const legacyPlaceholder = segments.length === 8 && segments.every((segment, index) =>
    String(segment.id || '') === \`sector_\${index + 1}\` &&
    Number(segment.rewardAmountMicros || 0) === 0 &&
    Number(segment.probabilityWeight || 0) === 1
  );
  if (segments.length && !legacyPlaceholder) return false;
  config.segments = defaultDigiWheelSegments();
  config.updatedAt = Date.now();
  return true;
}

`;
server = replaceOnce(server, marker, helper + marker, 'server wheel migration');
server = replaceOnce(server, '  ensureDigiReferralCodes(),\n  ensureDigiAddressAssignments(),', '  ensureDigiReferralCodes(),\n  ensureDigiWheelDefaults(),\n  ensureDigiAddressAssignments(),', 'boot migration list');
await writeFile(serverPath, server, 'utf8');
console.log('Wheel defaults patch applied');
