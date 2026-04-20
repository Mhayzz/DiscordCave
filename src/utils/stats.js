function startOfTodayUtc() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function rrLostToday(mmrHistory) {
  if (!Array.isArray(mmrHistory)) return { lost: 0, gained: 0, net: 0, games: 0 };
  const start = startOfTodayUtc();
  let lost = 0;
  let gained = 0;
  let games = 0;
  for (const entry of mmrHistory) {
    const ts = (entry.date_raw ? entry.date_raw * 1000 : null)
      || (entry.date ? new Date(entry.date).getTime() : null);
    if (!ts || ts < start) continue;
    const change = typeof entry.mmr_change_to_last_game === 'number'
      ? entry.mmr_change_to_last_game
      : (typeof entry.last_mmr_change === 'number' ? entry.last_mmr_change : 0);
    if (change < 0) lost += Math.abs(change);
    else gained += change;
    games += 1;
  }
  return { lost, gained, net: gained - lost, games };
}

function extractPlayers(match) {
  if (Array.isArray(match?.players)) return match.players;
  if (Array.isArray(match?.players?.all_players)) return match.players.all_players;
  return [];
}

function didTeamWin(match, teamId) {
  if (!teamId) return false;
  const key = String(teamId).toLowerCase();
  if (Array.isArray(match?.teams)) {
    const team = match.teams.find((t) => String(t.team_id || t.team || '').toLowerCase() === key);
    return team?.won === true;
  }
  if (match?.teams && typeof match.teams === 'object') {
    return match.teams[key]?.has_won === true || match.teams[key]?.won === true;
  }
  return false;
}

function winrateAndHs(matches, puuid) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return { winrate: 0, hs: 0, wins: 0, losses: 0, games: 0 };
  }
  let wins = 0;
  let losses = 0;
  let headshots = 0;
  let bodyshots = 0;
  let legshots = 0;
  let games = 0;

  for (const match of matches) {
    const players = extractPlayers(match);
    const me = players.find((p) => p.puuid === puuid);
    if (!me) continue;
    games += 1;

    const myTeam = me.team_id || me.team;
    if (didTeamWin(match, myTeam)) wins += 1;
    else losses += 1;

    const s = me.stats || {};
    headshots += s.headshots || 0;
    bodyshots += s.bodyshots || 0;
    legshots += s.legshots || 0;
  }

  const totalShots = headshots + bodyshots + legshots;
  const hs = totalShots > 0 ? (headshots / totalShots) * 100 : 0;
  const winrate = games > 0 ? (wins / games) * 100 : 0;

  return { winrate, hs, wins, losses, games };
}

module.exports = { rrLostToday, winrateAndHs };
