# DiscordCave

Bot Discord Valorant qui affiche **rank + RR**, **winrate %**, **HS %** et les **RR perdus aujourd'hui**, avec une commande simple pour lier son compte Valorant à son compte Discord.

## Commandes

| Commande | Description |
|---|---|
| `/link <riot_id> <tag>` | Lie un compte Valorant à ton Discord (jusqu'à **3 comptes**) |
| `/stats [membre] [compte]` | Affiche les stats (autocomplete sur `compte` si plusieurs liés) |
| `/accounts [membre]` | Liste les comptes liés |
| `/unlink [compte]` | Délie un compte (vide = tout délier si un seul lié) |
| `/leaderboard` | Force la mise à jour du classement du serveur |

L'embed `/stats` montre :
- Rank actuel + RR
- Peak rank et région
- Winrate % et HS % sur les 20 dernières parties compétitives
- RR gagnés / perdus / net du jour (UTC)

## Classement du serveur

Si `LEADERBOARD_CHANNEL_ID` est défini, le bot poste un embed de classement (trié par elo) dans ce salon et le réédite automatiquement toutes les `LEADERBOARD_UPDATE_MINUTES` minutes (défaut 15). Pas de spam : un seul message qui se met à jour.

## Installation

```bash
git clone https://github.com/mhayzz/discordcave.git
cd discordcave
npm install
cp .env.example .env
```

Remplis `.env` avec ton token Discord et le client ID de ton application ([Discord Developer Portal](https://discord.com/developers/applications)).

(Optionnel mais recommandé) Demande une clé API HenrikDev pour éviter le rate limit : https://docs.henrikdev.xyz/

## Déploiement des commandes slash

```bash
npm run deploy
```

- Si `GUILD_ID` est défini dans `.env`, les commandes sont déployées instantanément sur ce serveur (idéal en dev).
- Sinon elles sont déployées globalement (propagation jusqu'à 1h).

## Lancement du bot

```bash
npm start
```

## Intents Discord requis

Dans le Developer Portal, active au moins :
- `applications.commands` dans les scopes OAuth2
- Le scope `bot` avec la permission `Send Messages` + `Embed Links`

## Déploiement sur Railway

1. Push le repo sur GitHub (déjà fait).
2. Sur [railway.app](https://railway.app/) → **New Project** → **Deploy from GitHub repo** → sélectionne `DiscordCave`.
3. Onglet **Variables** du service, ajoute :
   - `DISCORD_TOKEN` — token du bot
   - `CLIENT_ID` — client ID de l'app Discord
   - `GUILD_ID` *(optionnel)* — pour déployer les commandes sur un seul serveur
   - `HENRIK_API_KEY` *(optionnel)* — clé API HenrikDev
   - `DEPLOY_COMMANDS_ON_START=true` — réenregistre automatiquement les slash commands à chaque démarrage (plus besoin de `npm run deploy` à la main)
   - `LEADERBOARD_CHANNEL_ID` *(optionnel)* — ID du salon où le classement s'affichera et s'auto-mettra à jour
   - `LEADERBOARD_UPDATE_MINUTES` *(défaut 15)* — fréquence de rafraîchissement
4. Onglet **Settings → Volumes** → **New Volume** monté sur `/data`. Railway expose `RAILWAY_VOLUME_MOUNT_PATH=/data` que le bot détecte pour stocker `users.json` de manière persistante (sinon les comptes liés sont perdus à chaque redeploy).
5. Railway détecte Node.js via `package.json`, build avec Nixpacks et lance `npm start`. `railway.json` fixe la politique de redémarrage.
6. Vérifie les **Logs** : tu dois voir `DiscordCave en ligne: <bot>#0000` puis `X commande(s) deployee(s)`.

## Source des données

Les stats proviennent de [HenrikDev API](https://docs.henrikdev.xyz/) (API non-officielle Valorant).
