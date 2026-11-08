# sd-phone — modifications maison

Base : **sd-phone v1.0.9** (<https://github.com/Samuels-Development/sd-phone>, GPL-3.0).
Importée en v1.0.3 (commit « Téléphone : import de sd-phone v1.0.3 et sd-phone-props
(vanilla) »), puis mise à jour en v1.0.4 le 2026-09-24, en v1.0.5 le 2026-09-25 et en
v1.0.6 le 2026-10-11, puis en v1.0.9 le 2026-10-31 (première mise à jour par fusion
git dans le fork).

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
| `server.cfg` (esxbase) | `set sd_phone_qbphonecompat false` | v1.0.9 : la couche qb-phone est inutile sous ESX ; active, elle crée `phone_invoices`, importe ces factures dans le Wallet et ouvre des net events hors de la garde du § 1 |
| `configs/payphone.lua` | `Debug = false` | logs de debug en production |

Les actions de patron et de multi-job de l'appli Services
(`services:hire`, `fire`, `switchJob`, `deposit`, `withdraw`…) sont en plus
**bloquées par la garde** (§ 1) : `bossGrade = 999` ne fait que les cacher.

## 3. Hébergement des médias : fournisseur « mainframe » (à la place de Fivemanage)

Photos, vidéos, notes vocales, pièces jointes audio, messagerie vocale et
enregistrements d'appels sont envoyés sur **notre VPS takehost02, `cdn-tk02.auralysrp.net`**
(vhost nginx WebDAV, espace `/phone/`) et non sur Fivemanage. Tous les envois de
sd-phone passent par `uploader.uploadMedia` : un seul aiguillage suffit.

| Fichier | Nature |
|---|---|
| `server/photos/uploader.lua` | **modifié** — 4 points marqués `PATCH MAISON` : `require` du fournisseur, `provider()` reconnaît `'mainframe'`, `configured()` et `uploadMedia()` aiguillent vers lui |
| `server/mainframe_media.lua` | **nouveau** — fournisseur côté Lua (même contrat que `server/photos/qbox.lua` : ticket, rappel unique, délai max 90 s) |
| `server/mainframe_upload.js` | **nouveau** — transfert en Node : décode le base64, déduit l'extension des **octets** (jamais du type annoncé), nomme `<img\|vid\|aud>/<32 hex>.<ext>` au hasard, `PUT` en Basic auth, borne 25 Mo |
| `fxmanifest.lua` | **modifié** — 1 ligne : `server/mainframe_upload.js` dans `server_scripts` |
| `configs/photos.lua` | `Provider = 'mainframe'` ; `cdn-tk02.auralysrp.net` dans `ImportAllowlist` ; `PlayerDailyMB` 2048 → 512 et `ServerDailyMB` 20480 → 4096 (disque du VPS : ~88 Go libres) |

Convars **serveur** (jamais `setr`), même contrat que `mainframe/shared/uploads.lua`,
dans `image-upload.private.cfg` (ignoré par git) :
`phone_image_upload_url`, `phone_image_public_url`, `phone_image_upload_user`,
`phone_image_upload_password`. Absentes : un avertissement au démarrage, et rien
ne s'enregistre (le message d'origine de sd-phone parle alors de « Fivemanage »,
ne pas s'y fier).

Côté VPS (mis en place le 2026-09-23, VM réinstallée et nom changé le 2026-11-06 ;
config nginx versionnée dans esxbase, `services/cdn-tk02/`) :

| | |
|---|---|
| Envoi | `PUT https://cdn-tk02.auralysrp.net/upload/phone/(img\|vid\|aud)/<32 hex>.<ext>`, compte dédié `phone` (`/etc/nginx/.htpasswd-phone-upload`), ≤ 25 Mo, anti-rafale 10 r/s (rafale 20) |
| Lecture | `GET https://cdn-tk02.auralysrp.net/phone/…`, publique, `immutable` 7 j, `noindex`, `Access-Control-Allow-Origin: *` (l'UI charge certaines images en `crossOrigin`), plages d'octets (206) pour la vidéo |
| Extensions | `jpg png gif webp webm mp4 m4a ogg mp3 wav` — tout autre nom : 403 |
| Stockage | `/var/www/phone-media/` — **données personnelles** (photos, voix) : toute purge porte sur ce répertoire seul |

Vérifié avec `server/mainframe_upload.js` exécuté tel quel sous Node : JPEG et
WebM acceptés (201) et relus à l'identique, HTML refusé avant envoi, mauvais mot
de passe → 401 ; puis par curl : sans auth 401, nom ou extension invalide 403,
compte `phone` sur l'espace MDT 401, DELETE 403, traversée encodée 400, listing
404. Revérifié par curl après la réinstallation (2026-11-06) : envoi WebM 201,
lecture partielle 206, compte `mdt` sur l'espace téléphone 401 ; un listing répond
désormais 403 et une traversée encodée 404 (normalisée hors des espaces).

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

## 8. Regarder le téléphone d'un autre joueur

**Besoin** : un joueur demande à voir l'écran du téléphone d'un joueur proche ; si
celui-ci accepte, il le voit en direct, sans pouvoir l'utiliser.

**Pourquoi pas une vidéo** : un écran NUI ne peut pas être capturé (seul le rendu
du jeu l'est, voir `mf_screenview/README.md`). Le NUI du propriétaire enregistre
donc son propre DOM avec **rrweb** (2.1.7, MIT) et le spectateur le rejoue.

**Fonctionnement** :

1. Demande : entrée ContextMenu « Regarder son téléphone » posée par
   `mainframe/modules/telephone` → `exports['sd-phone']:requestScreenView(id)`.
2. Accord : carte AirShare existante, kind `screen` (même portée `Share.Range`,
   même condition « téléphone sorti », même anti-spam).
3. Flux : le NUI du propriétaire envoie des lots JSON (`sd-phone:screenview:push`)
   → client Lua → event latent serveur → events latents vers **ses** spectateurs
   uniquement. Le serveur ne lit que la taille (plafond de débit et de lot).
4. Lecture : le spectateur rejoue dans l'iframe de rrweb, sandboxée
   (`allow-same-origin`, **sans scripts**), interactions coupées, recadrée sur
   `[data-phone-screen]` (position envoyée en event personnalisé `sv-rect`).
   Le spectateur n'a aucun chemin vers le téléphone : il ne peut qu'arrêter.
5. Fin : bouton « Arrêter » du bandeau propriétaire, Retour arrière du spectateur
   (`sdphone_screenview_stop`), téléphone rangé ou hors de portée (contrôle
   serveur chaque seconde), déconnexion.

| Fichier | Nature |
|---|---|
| `configs/screenview.lua` | **nouveau** — activation, spectateurs max, débit, taille de lot |
| `server/auralys_screenview.lua` | **nouveau** — sessions, handler AirShare `screen`, relais, fin de session |
| `client/auralys_screenview.lua` | **nouveau** — exports `canRequestScreenView` / `requestScreenView`, pont NUI, touche d'arrêt |
| `web/src/auralys/screenview/*` | **nouveau** — enregistreur rrweb (propriétaire), lecteur + bandeau (racine React séparée) |
| `server/share/core.lua` | **modifié** — 2 lignes `PATCH MAISON` : libellé du kind `screen`, `core.nameFor` exposé |
| `web/src/shared/AirShare.tsx` | **modifié** — texte de la carte pour le kind `screen` |
| `web/src/main.tsx` | **modifié** — import du point de montage, en fin de fichier |
| `fxmanifest.lua` | **modifié** — les deux scripts Lua ajoutés |
| `web/package.json`, `web/package-lock.json` | **modifié** — dépendance `rrweb` 2.1.7 |
| `locales/en.json`, `locales/fr.json` | **modifié** — clés `screenview.*` (en.json régénéré par `npm run i18n:gen`) |

Pièges :

- `pauseAnimation: false` est obligatoire sur le lecteur, sinon rrweb fige toutes
  les animations CSS à leur 1re image en direct.
- Le spectateur **re-date chaque event à son arrivée** et ignore l'horloge du
  propriétaire : le direct de rrweb planifie tout par rapport au premier état
  reçu, si bien que son temps de transfert devenait un retard permanent
  (≈ 5 s constatés en jeu).
- Budget en seau côté propriétaire (réserve de 4 s de `BytesPerSecond`) : une
  ouverture d'appli insère 50 à 200 Ko de DOM d'un coup ; avec une fenêtre fixe
  d'une seconde, ce lot était jeté puis remplacé par un état complet, ½ s plus tard.
- Events latents envoyés à `TransferBytesPerSecond` (2 Mo/s), distinct du débit
  moyen : un état complet doit passer d'un bloc.
- État complet toutes les 3 min (`checkoutEveryNms`) et lecteur recréé à chaque
  état complet : rrweb garde en mémoire tout ce qu'il a rejoué.
- `inlineStylesheet: false` fait charger les feuilles de style par URL chez le
  spectateur (même build).
- La console NUI du spectateur affiche « Blocked script execution in 'about:blank'
  because the document's frame is sandboxed » à la création du lecteur : FiveM
  tente d'injecter son script dans l'iframe, la sandbox le bloque. Normal et voulu,
  ne **jamais** ajouter `allow-scripts`.
- Côté propriétaire, la console peut afficher « [DOM] Password field is not
  contained in a form » : simple conseil de Chrome sur un champ mot de passe de
  l'interface amont, sans lien avec le partage et sans effet.

Mesuré dans un navigateur (sans réseau) : 70 à 160 ms entre l'action du
propriétaire et son affichage chez le spectateur, à quoi s'ajoute en jeu le
trajet propriétaire → serveur → spectateur.
Restent vides chez le spectateur : iframes d'autres ressources (applis
personnalisées comme Snapmatic), canvas (caméra, jeux en canvas). Testé dans un
navigateur (build démo, deux pages, flux relayé à la main). Première version
essayée en jeu (retard de ≈ 5 s, corrigé ci-dessous), correction validée en jeu
le 2026-11-01.

## 9. Téléphones uniques : les données suivent l'objet téléphone

**Besoin** : qui récupère le téléphone d'un autre joueur (vol, fouille, objet
trouvé) voit ses messages, appels, contacts, photos, applis installées.

**Réglage** (fonction native de sd-phone, `configs/uniqueandsim.lua`) :
`Enabled = true`, `DataOwner = 'device'`, `BuiltInNumbers = true`. Chaque objet
`phone_*` reçoit à sa première utilisation une identité (`device:<id>`) et son
propre numéro, écrits dans ses métadonnées ox_inventory ; toutes ses données sont
rangées sous cette identité. Pas d'objet SIM. Le code de verrouillage protège le
téléphone ; Face ID ne déverrouille que pour son premier propriétaire. Sauvegarde
cloud (par personnage, mot de passe) pour retrouver ses données sur un autre
téléphone.

Mise en service sur le serveur de **développement**, sans migration : les
données antérieures (rangées par personnage) restent en base mais ne sont plus
affichées, chaque téléphone repart vierge avec un nouveau numéro. Pour un
serveur avec des joueurs, il faudrait d'abord écrire dans chaque téléphone
porté le numéro actuel de son personnage (`simNumber`), que sd-phone sait
adopter.

| Fichier | Nature |
|---|---|
| `configs/uniqueandsim.lua` | **modifié** — les trois réglages ci-dessus |
| `server/auralys_identity.lua` | **nouveau** — exports `getPhoneIdentity(source)` et `getSourceByPhoneIdentity(identity)` pour les ressources externes |
| `fxmanifest.lua` | **modifié** — le script ci-dessus |

Hors de cette ressource, adaptés en même temps :

- `sd-snapmatic` : comptes rangés sous l'identité du téléphone actif (au lieu de
  l'identifiant ESX), joueur à notifier retrouvé par
  `getSourceByPhoneIdentity`, flammes versées à qui tient le téléphone.
- `mainframe/modules/character_wipe` : accepte le mode `device` (§ 7) et efface
  aussi les sauvegardes cloud du personnage.
- `mainframe` (numéro, factures, dispatch, prise de service) et `sd-tictactoe`
  n'ont rien à changer : ils passent par la session du joueur.

## 10. Galerie : coller une image du presse-papiers

**Besoin** : la fenêtre « Importer une photo » de la galerie n'acceptait qu'un
lien. On peut maintenant y faire **Ctrl+V** sur une image copiée (capture
d'écran, image copiée dans un navigateur…).

L'image collée est convertie en JPEG (côté le plus long ≤ 1920 px, qualité
réduite si besoin pour rester sous le plafond de 4 Mo) puis envoyée par le même
chemin qu'une photo de l'appareil (`sd-phone:camera:httpSlot`, repli
`sd-phone:camera:capture`) : aucun changement serveur, mêmes limites de débit.
Proposé seulement quand l'import est autorisé (`getCanImportPhotos`, comme le
lien). Un texte collé (lien) se comporte comme avant.

| Fichier | Nature |
|---|---|
| `web/src/apps/photos/pastedImage.ts` | **nouveau** — lecture du presse-papiers, conversion JPEG, envoi |
| `web/src/apps/photos/Photos.tsx` | **modifié** — écoute du collage pendant la fenêtre d'import, état « import en cours » / échec |
| `locales/en.json`, `locales/fr.json` | **modifié** — `photos.importMessagePaste`, `importPasting`, `importPasteUnreadable` (remplace `importMessage`) |

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
modification serait écrasée à la prochaine synchronisation. La clé
`.secret` (ignorée) n'est jamais committée, ni dans esxbase ni dans le fork public.
