# DiscordCave

Bot Discord Valorant qui affiche **rank + RR**, **winrate %**, **HS %** et les **RR perdus aujourd'hui**, avec une commande simple pour lier son compte Valorant à son compte Discord.

## Commandes

| Commande | Description |
|---|---|
| `/link <riot_id> <tag>` | Lie ton compte Valorant à ton Discord (ex: `/link Toxo 6969`) |
| `/stats [membre]` | Affiche tes stats (ou celles d'un autre membre du serveur) |
| `/unlink` | Délie ton compte Valorant |

L'embed `/stats` montre :
- Rank actuel + RR
- Peak rank et région
- Winrate % et HS % sur les 20 dernières parties compétitives
- RR gagnés / perdus / net du jour (UTC)

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

## Source des données

Les stats proviennent de [HenrikDev API](https://docs.henrikdev.xyz/) (API non-officielle Valorant).
