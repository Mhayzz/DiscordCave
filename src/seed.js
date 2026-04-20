const { getAccount } = require('./utils/henrik');
const { addAccount, getAccounts } = require('./utils/db');

const SEED_DATA = [
  { discordId: '1134186223737512036', accounts: ['Neyxaa#009'] },
  { discordId: '329032729104482305', accounts: ['Killu#667', 'Casty Trousty#777'] },
  { discordId: '364143176430125066', accounts: ['Zivago95#EUW', 'zivago953#EUW'] },
  { discordId: '339447335790706690', accounts: ['Macaa#3474'] },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runSeed() {
  if (process.env.SKIP_SEED === 'true') {
    console.log('[seed] SKIP_SEED=true, import ignoré');
    return;
  }

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of SEED_DATA) {
    const existing = getAccounts(entry.discordId);
    const existingIds = new Set(existing.map((a) => `${a.name}#${a.tag}`.toLowerCase()));

    for (const riotId of entry.accounts) {
      if (existingIds.has(riotId.toLowerCase())) {
        skipped += 1;
        continue;
      }

      const idx = riotId.lastIndexOf('#');
      if (idx < 0) {
        console.warn(`[seed] format invalide: ${riotId}`);
        failed += 1;
        continue;
      }
      const name = riotId.slice(0, idx).trim();
      const tag = riotId.slice(idx + 1).trim();

      try {
        const account = await getAccount(name, tag);
        if (!account) {
          console.warn(`[seed] ${riotId} introuvable`);
          failed += 1;
          continue;
        }
        const result = addAccount(entry.discordId, {
          name: account.name,
          tag: account.tag,
          region: account.region,
          puuid: account.puuid,
        });
        if (result.ok) {
          imported += 1;
          console.log(`[seed] ajouté ${account.name}#${account.tag} → ${entry.discordId}`);
        } else {
          skipped += 1;
        }
      } catch (err) {
        console.warn(`[seed] ${riotId}: ${err.message}`);
        failed += 1;
      }

      await sleep(500);
    }
  }

  console.log(`[seed] terminé: ${imported} importé(s), ${skipped} existant(s), ${failed} échec(s)`);
}

module.exports = { runSeed };
