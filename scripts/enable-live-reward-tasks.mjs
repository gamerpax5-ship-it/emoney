import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtimePath = join(root, 'website/server-runtime.mjs');
const rewardsPath = join(root, 'website/digirupee-rewards.js');
let runtime = await readFile(runtimePath, 'utf8');

const taskVisible = "function taskVisibleToUser(task, timestamp = Date.now()) {\n  return !!task.enabled && (!task.endsAt || Number(task.endsAt) >= timestamp);\n}\n";
if (!runtime.includes('function ensureDigiManualCampaignTasks()')) {
  if (!runtime.includes(taskVisible)) throw new Error('task visibility hook not found');
  runtime = runtime.replace(taskVisible, taskVisible + `\nfunction ensureDigiManualCampaignTasks() {\n  let changed = false;\n  for (const campaign of db.digirupee.campaigns || []) {\n    if (String(campaign.type || '').toUpperCase() !== 'MANUAL_TASK') continue;\n    campaign.tasks = Array.isArray(campaign.tasks) ? campaign.tasks : [];\n    if (campaign.tasks.length) continue;\n    const now = Date.now();\n    campaign.tasks.push({ id: 'dta_' + randomUUID().replace(/-/g, '').slice(0, 12), campaignId: campaign.id, title: String(campaign.title || 'Reward task').slice(0, 120), description: String(campaign.description || '').slice(0, 500), rewardAmountMicros: Number(campaign.rewardAmountMicros || 0), enabled: campaign.enabled !== false, claimType: 'MANUAL', requirements: {}, startsAt: Number(campaign.startsAt || now), endsAt: campaign.endsAt || null, maxClaimsPerUser: 1 });\n    campaign.updatedAt = now;\n    changed = true;\n  }\n  return changed;\n}\n`);
}

const adminNeedle = "  if (req.method === 'GET' && path === '/admin/campaigns') {\n    const admin = adminAuth(req);\n    return send(res, 200, { admin: { email: admin.email, role: admin.role }, campaigns: db.digirupee.campaigns.map(adminDigiCampaign).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)) });\n  }";
if (!runtime.includes('admin-campaign-backfill')) {
  if (!runtime.includes(adminNeedle)) throw new Error('admin campaign hook not found');
  runtime = runtime.replace(adminNeedle, "  if (req.method === 'GET' && path === '/admin/campaigns') {\n    const admin = adminAuth(req);\n    if (ensureDigiManualCampaignTasks()) await persist(); // admin-campaign-backfill\n    return send(res, 200, { admin: { email: admin.email, role: admin.role }, campaigns: db.digirupee.campaigns.map(adminDigiCampaign).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)) });\n  }");
}

const userNeedle = "  if (req.method === 'GET' && path === '/campaigns') {\n    const { user } = digirupeeAuth(req);\n    return send(res, 200, { campaigns: db.digirupee.campaigns.filter(campaign => campaignVisibleToUser(campaign)).map(campaign => publicDigiCampaign(campaign, user.id)) });\n  }";
if (!runtime.includes('user-campaign-backfill')) {
  if (!runtime.includes(userNeedle)) throw new Error('user campaign hook not found');
  runtime = runtime.replace(userNeedle, "  if (req.method === 'GET' && path === '/campaigns') {\n    const { user } = digirupeeAuth(req);\n    if (ensureDigiManualCampaignTasks()) await persist(); // user-campaign-backfill\n    return send(res, 200, { campaigns: db.digirupee.campaigns.filter(campaign => campaignVisibleToUser(campaign)).map(campaign => publicDigiCampaign(campaign, user.id)) });\n  }");
}
await writeFile(runtimePath, runtime, 'utf8');

let rewards = await readFile(rewardsPath, 'utf8');
const actionNeedle = "      const claimed = !!task.claim;\n      const eligible = !upcoming && !!task.eligibility?.eligible && !claimed;\n      const text = claimed ? (task.claim.status || 'Claimed') : upcoming ? 'Upcoming' : eligible ? 'Claim Now' : 'In Progress';";
if (!rewards.includes("const manualTask = task.claimType === 'MANUAL';")) {
  if (!rewards.includes(actionNeedle)) throw new Error('task action hook not found');
  rewards = rewards.replace(actionNeedle, "      const claimed = !!task.claim;\n      const manualTask = task.claimType === 'MANUAL';\n      const eligible = !upcoming && !claimed && (manualTask || !!task.eligibility?.eligible);\n      const text = claimed ? (task.claim.status || 'Claimed') : upcoming ? 'Upcoming' : manualTask ? 'Submit Claim' : eligible ? 'Claim Now' : 'In Progress';");
  await writeFile(rewardsPath, rewards, 'utf8');
}

console.log('Enabled digiRupee live manual tasks and Task Center claims');
