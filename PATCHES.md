# sd-phone — modifications maison

Base : **sd-phone v1.0.6** (<https://github.com/Samuels-Development/sd-phone>, GPL-3.0).
Importée en v1.0.3 (commit « Téléphone : import de sd-phone v1.0.3 et sd-phone-props
(vanilla) »), puis mise à jour en v1.0.4 le 2026-09-24, en v1.0.5 le 2026-09-25 et en
v1.0.6 le 2026-10-11.

**Depuis le 2026-10-31, la ressource vit dans un fork** :
<https://github.com/ThaJuju/sd-phone>, branche **`auralys`** (tag amont + nos commits).
Dans esxbase, `resources/[standalone]/sd-phone` est une **copie synchronisée** de cette
branche (format git subtree squash, pas un dépôt imbriqué). Les modifications se font dans le fork, puis sont ramenées dans
esxbase (voir « Procédure de mise à jour »). Ce fichier reste l'inventaire de nos écarts
avec l'amont : il sert à comprendre un conflit de fusion, plus à réappliquer à la main.

Principe : toucher le cœur le moins possible. Réglages = fichiers `configs/`,
logique maison = fichiers nouveaux, et de rares accroches marquées
`PATCH MAISON` dans le code d'origine (`server/main.lua`,
`server/photos/uploader.lua`, `server/radio/*.lua`, `server/sim/init.lua`,
`client/apps/radio.lua`, `bridge/client/voice.lua`, `fxmanifest.lua`).

Les liens avec `mainframe` (factures, dispatch, cabines…) ne sont PAS ici : ils
vivent dans `mainframe/modules/telephone/` et passent par les exports publics
de sd-phone.

## 1. Garde serveur des callbacks (sécurité)

**Problème en vanilla** (relevé à l'audit du 2026-09-23) :

- le serveur ne vérifie presque jamais que le joueur porte un téléphone
  (`util.carriesPhone` n'est utilisé que par les appels et Find Friends) : un
  exécuteur Lua pouvait faire un virement, envoyer un SMS, etc. sans téléphone,
  menotté ou mort ;
- une appli désactivée dans `configs/apps.lua` ne fait que disparaître de
  l'écran d'accueil : ses callbacks serveur restent actifs.

**Correctif** :

| Fichier | Nature |
|---|---|
| `server/main.lua` | **modifié** — 4 lignes dans l'enveloppe de `lib.callback.register` (marquées `PATCH MAISON`) : appel de la garde avant le handler |
| `server/mainframe_gate.lua` | **nouveau** — la garde : refuse les callbacks bloqués, ceux d'une appli désactivée, et ceux qui exigent un téléphone quand le joueur n'en a pas |
| `configs/mainframe.lua` | **nouveau** — les règles (préfixes `RequirePhone`, `AppOf`, `Blocked`) |

Les lectures appelées à la connexion (`settings`, `badges`, `wifi`…), les cabines
(`payphone:*`) et `call:hangup` restent volontairement libres, tout comme
`carriesPhone` (v1.0.6) : l'appli s'en sert pour savoir si elle doit afficher une
bannière, il doit répondre « non » et pas être refusé.

Limite connue : seuls les **callbacks** (`lib.callback.register`) passent par la
garde. Les 67 `RegisterNetEvent` du serveur ne sont pas couverts ; ceux des
applis désactivées (`racing:*`, `mdt:*`) dépendent d'un état serveur (course,
terminal) qui ne peut pas exister quand l'appli est coupée.

## 2. Configuration

| Fichier | Changement | Pourquoi |
|---|---|---|
| `configs/config.lua` | `Locale = 'fr'` | serveur francophone |
| `configs/apps.lua` | `enabled = false` : `bank`, `garages`, `homes`, `ryde`, `casino`, `weazelnews`, `mdt`, `emsmdt`, `dojmdt`, `racing` (`stocks` l'était déjà) | doublons de modules `mainframe` (`banque`, `garage`, `immobilier`, `casino`, `weazelnews`, `mdt`) ou argent hors de notre contrôle (Ryde, Stocks, Racing) |
| `configs/apps.lua` | `services` : `base = true` | appli Services préinstallée sur tous les téléphones (et non désinstallable) : les employés y reçoivent les appels de leur société et son « En service » suit la prise de service F6 (§ 6) |
| `configs/services.lua` | `DefaultBossGrade` et tous les `bossGrade` = `999` | personne n'est patron côté téléphone : embauche, renvoi, coffre société passent par le menu patron RageUI (`mainframe/societe`) |
| `configs/services.lua` | `InvoicesEnabled = false` | factures = `mainframe/factures` |
| `configs/services.lua` | libellés FR des sociétés (`LSPD`, `EMS`, `Mécanicien`) | affichage |
| `configs/banking.lua` | `PersonalInvoices.Enabled = false` | factures = `mainframe/factures` |
| `configs/voice.lua` | `RecordNearbyVoices = false` | RGPD : en vanilla, une vidéo ou un live enregistre le micro des joueurs alentour sans leur accord, et l'audio transite par Cloudflare |
| `configs/payphone.lua` | `Debug = false` | logs de debug en production |

Les actions de patron et de multi-job de l'appli Services
(`services:hire`, `fire`, `switchJob`, `deposit`, `withdraw`…) sont en plus
**bloquées par la garde** (§ 1) : `bossGrade = 999` ne fait que les cacher.

## 3. Hébergement des médias : fournisseur « mainframe » (à la place de Fivemanage)

Photos, vidéos, notes vocales, pièces jointes audio, messagerie vocale et
enregistrements d'appels sont envoyés sur **notre VPS `takehost02.jujuland.net`**
(vhost nginx WebDAV, espace `/phone/`) et non sur Fivemanage. Tous les envois de
sd-phone passent par `uploader.uploadMedia` : un seul aiguillage suffit.

| Fichier | Nature |
|---|---|
| `server/photos/uploader.lua` | **modifié** — 4 points marqués `PATCH MAISON` : `require` du fournisseur, `provider()` reconnaît `'mainframe'`, `configured()` et `uploadMedia()` aiguillent vers lui |
| `server/mainframe_media.lua` | **nouveau** — fournisseur côté Lua (même contrat que `server/photos/qbox.lua` : ticket, rappel unique, délai max 90 s) |
| `server/mainframe_upload.js` | **nouveau** — transfert en Node : décode le base64, déduit l'extension des **octets** (jamais du type annoncé), nomme `<img\|vid\|aud>/<32 hex>.<ext>` au hasard, `PUT` en Basic auth, borne 25 Mo |
| `fxmanifest.lua` | **modifié** — 1 ligne : `server/mainframe_upload.js` dans `server_scripts` |
| `configs/photos.lua` | `Provider = 'mainframe'` ; `takehost02.jujuland.net` dans `ImportAllowlist` ; `PlayerDailyMB` 2048 → 512 et `ServerDailyMB` 20480 → 4096 (disque du VPS : ~88 Go libres) |

Convars **serveur** (jamais `setr`), même contrat que `mainframe/shared/uploads.lua`,
dans `image-upload.private.cfg` (ignoré par git) :
`phone_image_upload_url`, `phone_image_public_url`, `phone_image_upload_user`,
`phone_image_upload_password`. Absentes : un avertissement au démarrage, et rien
ne s'enregistre (le message d'origine de sd-phone parle alors de « Fivemanage »,
ne pas s'y fier).

Côté VPS (mis en place et vérifié le 2026-09-23) :

| | |
|---|---|
| Envoi | `PUT https://takehost02.jujuland.net/upload/phone/(img\|vid\|aud)/<32 hex>.<ext>`, compte dédié `phone` (`/etc/nginx/.htpasswd-phone-upload`), ≤ 25 Mo, anti-rafale `phone_upload` (10 r/s) |
| Lecture | `GET https://takehost02.jujuland.net/phone/…`, publique, `immutable` 7 j, `noindex`, `Access-Control-Allow-Origin: *` (l'UI charge certaines images en `crossOrigin`), plages d'octets (206) pour la vidéo |
| Extensions | `jpg png gif webp webm mp4 m4a ogg mp3 wav` — tout autre nom : 403 |
| Stockage | `/var/www/phone-media/` — **données personnelles** (photos, voix) : toute purge porte sur ce répertoire seul |
| Sauvegarde du vhost avant modification | `/etc/nginx/sites-available/takehost02.jujuland.net.bak-20260923-213920` |

Vérifié avec `server/mainframe_upload.js` exécuté tel quel sous Node : JPEG et
WebM acceptés (201) et relus à l'identique, HTML refusé avant envoi, mauvais mot
de passe → 401 ; puis par curl : sans auth 401, nom ou extension invalide 403,
compte `phone` sur l'espace MDT 401, DELETE 403, traversée encodée 400, listing
404.

Limite : supprimer une photo dans le téléphone ne supprime que la ligne en base,
pas le fichier (comportement d'origine, identique avec Fivemanage).
L'envoi direct client → Fivemanage (`presign.lua`) reste inopérant : il est
désactivé (`AllowDirectUpload = false`) et ne vise que Fivemanage.

## 4. Bandes radio réservées pilotées par mainframe

**Problème** : l'appli Radio et le talkie de `mainframe` (module `radio`)
pilotent le **même** canal pma-voice, et doivent donc convertir la fréquence
exactement de la même façon. Avec deux listes de bandes (ici
`configs/radio.lua → RestrictedRanges`, là-bas le Config Panel), un sheriff
autorisé au panel se ferait refuser la bande police par le téléphone.

**Correctif** :

| Fichier | Nature |
|---|---|
| `server/radio/actions.lua` | **modifié** — 7 lignes en tête de `actions.canTune` (marquées `PATCH MAISON`) : si `mainframe` tourne, le verdict vient de `exports.mainframe:RadioCanTune(src, freq)` |
| `client/apps/radio.lua` | **modifié** — `freqToChannel` renvoie la fréquence arrondie au dixième (`round(f × 10) / 10`) au lieu de `f × 10` : pma-voice affiche « 132.9 Mhz » et non « 1329 Mhz » |
| `bridge/client/voice.lua` | **modifié** — `setRadioChannel` arrondit au dixième au lieu de `math.floor` (qui aurait coupé la décimale) |
| `server/radio/init.lua` | **modifié** — la présence appelle `canTune(src, channel)` sans `/ 10` |

⚠ Le canal est une clé de table (pma-voice) : ces trois points doivent produire
exactement le même nombre que `mainframe/modules/radio/shared.lua` (dixièmes
entiers ÷ 10). Ne pas en réappliquer un seul.

`RestrictedRanges` n'est plus qu'un **repli** sans mainframe : ne pas s'y fier
pour régler les bandes (`/adminpanel > RP > Radio`). La vraie barrière reste
côté mainframe (`addChannelCheck` de pma-voice) : ce patch ne fait qu'aligner
l'affichage de l'appli sur elle.

## 5. Fichiers ajoutés sans rapport avec le code

- `PATCHES.md` : ce fichier.
- `web/build/` : NUI compilée, **versionnée sur la branche `auralys`** (l'amont l'ignore
  et ne la fournit que dans le zip de release). Le reste du dépôt amont (`web/src`,
  `docs/`, `.github/`, `sql/`) est présent mais inerte pour FiveM.

## 6. Prise de service mainframe → interrupteur « En service » de l'appli Services

**Problème** : sur ESX, sd-phone n'a aucun état de service à lire (`job.getDuty`
renvoie nil) ; son interrupteur n'est qu'une préférence en base
(`phone_service_prefs.duty`, « en service » par défaut). Prendre son service au
menu F6 ne le bougeait pas : il fallait aller le cocher à la main.

**Correctif** :

| Fichier | Nature |
|---|---|
| `server/mainframe_duty.lua` | **nouveau** — export `setServiceDuty(source, on)` : écrit la préférence du job courant, pousse `dutyChanged` + `jobsChanged` (l'appli compilée n'écoute que le second pour se rafraîchir) et rafraîchit le roster des patrons. Ne déclenche pas `sd-phone:services:dutyChanged` (pas de boucle) |
| `server/main.lua` | **modifié** — 1 ligne marquée `PATCH MAISON` après `require 'server.services.init'` |

Appelé par `mainframe/modules/telephone` à chaque prise/fin de service, changement
de job, connexion et `restart mainframe`, uniquement pour les jobs dont mainframe
gère le service. Sens unique : l'interrupteur du téléphone reste libre
(`services:setDuty` n'est pas bloqué) et ne coupe que la réception des appels.

## 7. Mode de données exposé au wipe de personnage

**Problème** : `mainframe/modules/character_wipe` archive puis efface les données
téléphone d'un personnage. Ses listes de tables ne valent que pour le mode
« stock » (données liées au personnage). En mode SIM/device, les données suivent
un item : le wipe raterait des données ou en casserait d'autres.

**Correctif** :

| Fichier | Nature |
|---|---|
| `server/sim/init.lua` | **modifié** — export `GetCharacterWipeMode` ajouté en tête, **avant** le `return` qui sort du fichier quand les SIM sont désactivées : renvoie `'stock'`, ou `config.Sim.DataOwner` si les SIM sont actives |

`character_wipe` refuse tout wipe si sd-phone tourne sans cet export ou dans un
autre mode que `stock` (voir son README). Si ce patch n'est pas reporté, plus
aucun wipe de personnage ne passe.

## Hors de cette ressource

- **Items** : `phone_black` … `phone_yellow` déclarés dans
  `ox_inventory/data/items.lua` (icônes copiées dans `ox_inventory/web/images/`).
  L'ancien item `phone` d'ox_inventory (câblé npwd) n'est pas reconnu par sd-phone.
- **Secrets** : ne jamais remplir `configs/server/apikeys.lua` (fichier suivi
  par git). Passer par les convars dans un `*.private.cfg` (ignoré par git) :
  `phone_image_*` (§ 3, déjà en place), `sd_cf_turn_token_id`,
  `sd_cf_turn_api_token`. Plus besoin de clé Fivemanage.
- **Clé de chiffrement** : sans convar `sd_phone_secret`, sd-phone génère au
  premier démarrage un fichier `.secret` à la racine de la ressource (ignoré par
  git). Il chiffre des données en base : le perdre les rend illisibles.
  Recommandé : le fixer par convar `sd_phone_secret` dans un `*.private.cfg`
  sauvegardé.

## Comportements amont à connaître

- **Cache de nom et d'identité (v1.0.4)** : sd-phone garde l'identifiant et le
  nom « Prénom Nom » d'un joueur 5 min. Le cache est vidé à chaque
  `esx:playerLoaded` / `esx:playerLogout` / déconnexion, donc le changement de
  personnage reste exact. En revanche, un renommage à chaud par le menu staff
  (`staff_menu:sv:setName`, module `permissions`) n'apparaît dans le téléphone
  qu'après une reconnexion ou au bout de 5 min.
- **Types de médias en liste blanche (v1.0.5)** : `server/media/sniff.lua` refuse
  désormais un data URL dont le type MIME n'est pas dans sa liste fixe
  (jpeg/png/gif/webp, webm/mp4/quicktime/ogg/matroska, webm/ogg/mp4/m4a/mpeg/aac/wav/flac).
  Ce contrôle s'exécute dans `uploader.uploadMedia` **avant** l'aiguillage vers
  notre fournisseur `mainframe` (§ 3) : il le protège aussi. Un appel externe à
  `exports['sd-phone']:uploadMedia` avec un type exotique est refusé.
- **Live Photogram / Clout (v1.0.5)** : nouvelles commandes caméra en direct ;
  le live reste désactivé tant que `Live.Enabled` n'est pas passé à `true` dans
  `configs/photogram.lua` et `configs/vibez.lua` (non activé ici).
- **Batterie figée (v1.0.6)** : `BatteryDrain = false` par défaut dans
  `configs/statusbar.lua` : l'icône reste à `BatteryStart`. De toute façon purement
  visuelle (0 % ne coupe rien).
- **Pas de bannière sans téléphone (v1.0.6)** : un joueur sans item téléphone ne
  reçoit plus de bannières de notification (sauf alertes d'urgence) ; les messages
  restent délivrés. Concerne aussi les notifications que `mainframe/modules/telephone`
  pousse par les exports de sd-phone.
- **Rappels des exports honorés (v1.0.6)** : une fonction passée par une autre
  ressource (`addCustomApp` → `onOpen`/`onUse`/`onClose`/`onDelete`,
  `uploadMedia`, `registerBluetoothDevice`, `showLockscreenWidget`) était jetée
  jusqu'ici. Elle est maintenant appelée : le `onDelete` de `sd-tictactoe`
  (quitter la partie à la désinstallation) fonctionne enfin.
- **Wipe intégré élargi (v1.0.6)** : `/wipemyphone` et le wipe complet du panel
  admin sd-phone effacent plus de tables (Clout, ID, signatures, Bluetooth,
  Wi-Fi…). Sans lien avec `character_wipe`, qui garde ses propres listes.
- **State bags dédupliqués (v1.0.4)** : `phoneOpen`, `softOpen`,
  `phoneDisabled`, `batteryLevel`… ne sont réécrits que si la valeur change,
  d'après ce que sd-phone a lui-même publié. Ne jamais écrire ces clés depuis
  une autre ressource : sd-phone ne verrait pas le changement et pourrait
  sauter sa propre écriture suivante.

## Procédure de mise à jour

Clone de travail du fork : `/mnt/DISK/sd-phone` (remotes `origin` = fork,
`upstream` = Samuels-Development ; identité ThaJuju). À recréer au besoin :

```bash
git clone https://github.com/ThaJuju/sd-phone.git /mnt/DISK/sd-phone
cd /mnt/DISK/sd-phone && git remote add upstream https://github.com/Samuels-Development/sd-phone.git
git checkout auralys
```

**Modification maison** : commit sur `auralys` dans le clone, `git push`, puis le
rapatriement ci-dessous. Si la NUI change (`web/src`), reconstruire et committer
`web/build` dans le même commit : `cd web && npm ci && npm run build`.

**Nouvelle version amont** (ex. v1.0.9) :

1. `git fetch upstream --tags && git checkout auralys && git merge v1.0.9`
   — résoudre les conflits à l'aide des sections ci-dessus. `web/build` est toujours
   en conflit : le régénérer (`cd web && npm ci && npm run build`) puis `git add web/build`.
2. Comparer le nouveau `configs/` amont à nos réglages (§ 2 et 3) et vérifier que les
   préfixes de `configs/mainframe.lua` correspondent toujours aux callbacks
   (`grep -rhoE "lib.callback.register\('sd-phone:server:[a-zA-Z:]+" server`).
3. Mettre à jour la ligne « Base » en tête de ce fichier, committer, `git push`.
4. Optionnel : `git push origin upstream/main:main` garde la branche `main` du fork
   alignée sur l'amont.

**Rapatriement dans esxbase** (depuis `/mnt/DISK/esxbase`) :

```bash
scripts/sd-phone-sync.sh
```

Il récupère `auralys` et remplace le dossier par son contenu dans un seul commit
(squash, sans l'historique amont). Ne pas utiliser `git subtree pull` : avec git 2.34,
les crochets de `[standalone]` cassent sa recherche du dernier import.

Ne jamais modifier directement `resources/[standalone]/sd-phone` dans esxbase : la
modification serait écrasée ou en conflit au prochain `subtree pull`. La clé
`.secret` (ignorée) n'est jamais committée, ni dans esxbase ni dans le fork public.
