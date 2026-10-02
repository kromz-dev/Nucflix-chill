# Backend Nucflix & télécommande — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un service Node qui pilote le téléviseur depuis un téléphone — retour à l'accueil, navigation au pavé directionnel, volume, veille, extinction — et la PWA qui lui parle.

**Architecture:** Un seul processus Node exposant **deux serveurs HTTP distincts** : `127.0.0.1:8080` sert le shell TV (jamais joignable depuis le réseau) et `0.0.0.0:3000` sert la télécommande (joignable, protégée par appairage). Les commandes du téléphone deviennent de vrais événements clavier écrits dans le socket de `ydotoold`, et le retour à l'accueil passe par le Chrome DevTools Protocol. Ce service **remplace** `nucflix-web.service`.

**Tech Stack:** Node.js 22 (dépôts Ubuntu), `ws` comme unique dépendance, `node:test` pour les tests. Tout le reste vient de la bibliothèque standard (`net`, `http`, `fs`, `crypto`, `child_process`).

**Spec:** [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md) — en particulier §2 (injection clavier), §4 (plan de contrôle CDP) et §5 (sécurité). Reste à faire : [`docs/RESTE-A-FAIRE.md`](../../RESTE-A-FAIRE.md) §1.

---

## Global Constraints

- **Langue du code** : commentaires et messages en français, sans accents dans les identifiants.
- **Dépendances** : `ws` uniquement. Toute autre dépendance doit être justifiée — la machine a 3,4 Gio de RAM et un disque mécanique.
- **Utilisateur d'exécution** : `nucflix` (uid 999), groupes `video,render,input,audio`. Jamais root.
- **Aucune commande shell interpolée depuis le réseau.** `execFile` avec arguments séparés, et une liste blanche fermée d'actions. C'est une exigence, pas une préférence.
- **Le serveur TV n'écoute QUE sur `127.0.0.1`.** Vérifié par test.
- **Socket du clavier virtuel** : `/run/ydotool/socket`, accessible via le groupe `input`.
- **Port du CDP** : `127.0.0.1:9222`. Ne jamais l'exposer.
- **Chemins de déploiement** : code dans `/opt/nucflix/backend`, données dans `/var/lib/nucflix`.
- **Mesure à respecter** : invoquer le binaire `ydotool` coûte 65 ms par touche. L'écriture directe dans le socket doit rester sous 5 ms.

### Fait établi : le protocole du socket ydotoold

Déterminé par `strace` sur cette machine, non documenté ailleurs. **À ne pas redécouvrir.**

Le socket est un `AF_UNIX` **SOCK_STREAM**. Le client y écrit des `struct input_event` de **24 octets**, en little-endian :

| Offset | Taille | Champ | Valeur |
|---|---|---|---|
| 0 | 16 | `timeval` | zéros (le démon horodate) |
| 16 | 2 | `type` | `1` = EV_KEY, `0` = EV_SYN |
| 18 | 2 | `code` | code de touche Linux |
| 20 | 4 | `value` | `1` = enfoncée, `0` = relâchée |

Un appui complet = **4 écritures** : `(1,code,1)`, `(0,0,0)`, `(1,code,0)`, `(0,0,0)`.

Trame vérifiée pour la flèche bas (code 108), enfoncement :
`0000000000000000 0000000000000000 0100 6c00 01000000`

Codes de touches nécessaires : `UP=103`, `DOWN=108`, `LEFT=105`, `RIGHT=106`, `OK=28` (ENTER), `BACK=14` (BACKSPACE), `PLAY=164`, `ESC=1`.

---

## Review Focus

Cinq situations que la spec implique sans les décrire, classées par probabilité de gêner l'utilisateur. Chacune a son test rattaché à la tâche qui possède le code.

1. **`ydotoold` est arrêté ou redémarre** — le backend ne doit pas mourir, et doit se reconnecter à la frappe suivante. *(Tâche 2)*
2. **Chrome redémarre** — l'identifiant de cible CDP change. Le retour à l'accueil doit re-résoudre la cible à chaque appel, jamais la mettre en cache. *(Tâche 3)*
3. **Le téléphone se met en veille puis revient** — la reconnexion doit réussir avec le jeton existant, sans redemander d'appairage. *(Tâche 5)*
4. **Une commande inconnue ou malformée arrive du réseau** — rejetée, journalisée, jamais transmise à un shell ni au clavier. *(Tâches 4 et 7)*
5. **Deux téléphones appairés sont connectés** — les deux fonctionnent, et révoquer l'un n'affecte pas l'autre. *(Tâche 5)*

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `apps/system-backend/src/clavier.js` | Écrit dans le socket `ydotoold`. Table des codes de touches. |
| `apps/system-backend/src/navigateur.js` | Client CDP : résout la cible, navigue. |
| `apps/system-backend/src/systeme.js` | Liste blanche d'actions système (volume, veille, extinction). |
| `apps/system-backend/src/appairage.js` | Codes à 6 chiffres, jetons, persistance. |
| `apps/system-backend/src/protocole.js` | Vocabulaire des messages, validation. |
| `apps/system-backend/src/serveur-tv.js` | `127.0.0.1:8080` — shell statique + WebSocket TV. |
| `apps/system-backend/src/serveur-telecommande.js` | `0.0.0.0:3000` — PWA statique + WebSocket authentifié. |
| `apps/system-backend/src/index.js` | Câblage, arrêt propre. |
| `apps/mobile-remote/` | La PWA : `index.html`, `styles.css`, `app.js`, `manifest.json`. |
| `infra/nucflix-backend.service` | Unité systemd durcie. |
| `infra/sudoers-nucflix` | Règle `sudoers` nominative pour l'extinction. |

---

## Task 1 : Socle du projet et service de santé

**Files:**
- Create: `apps/system-backend/package.json`, `src/index.js`, `test/sante.test.js`

**Interfaces:**
- Produces: `demarrer({portTv, portTelecommande}) -> Promise<{fermer()}>`

- [ ] **Step 1: Installer Node** — `sudo apt-get install -y nodejs npm`, puis `npm i ws` dans `apps/system-backend`. Vérifier `node -v` ≥ 22.
- [ ] **Step 2: Écrire le test qui échoue** — `test/sante.test.js` : `GET http://127.0.0.1:8080/health` renvoie `200` et le corps `{"ok":true}`.
- [ ] **Step 3: Lancer le test, vérifier l'échec** — `node --test test/` → ÉCHEC (module introuvable).
- [ ] **Step 4: Implémenter `demarrer()` dans `src/index.js`** — deux `http.Server`, celui du port TV lié à `127.0.0.1` explicitement.
- [ ] **Step 5: Test vert** — `node --test test/`.
- [ ] **Step 6: Test de la contrainte de liaison** — vérifier que `GET http://192.168.1.21:8080/health` échoue (connexion refusée) alors que `127.0.0.1` répond.
- [ ] **Step 7: Commit** — `feat(backend): socle et point de santé`

## Task 2 : Clavier virtuel

**Files:** Create `src/clavier.js`, `test/clavier.test.js`

**Interfaces:**
- Produces: `creerClavier(cheminSocket) -> { envoyer(nomTouche): Promise<void>, fermer() }`
- `TOUCHES: Record<string, number>` — voir la table des codes ci-dessus.

- [ ] **Step 1: Test qui échoue** — faire écouter un faux socket Unix dans le test ; `envoyer('DOWN')` doit y produire **exactement 96 octets** (4 × 24), et les octets 16-23 du premier bloc doivent valoir `0100 6c00 01000000`.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter `creerClavier`** — `net.connect`, `Buffer.alloc(24)` par événement, `writeUInt16LE`/`writeInt32LE` aux offsets du tableau. Reconnexion paresseuse : si le socket est fermé, reconnecter au prochain `envoyer`.
- [ ] **Step 4: Test vert.**
- [ ] **Step 5: Test du point 1 de Review Focus** — fermer le faux socket, appeler `envoyer` : ne doit pas lever, et doit réussir après réouverture.
- [ ] **Step 6: Test d'entrée invalide** — `envoyer('INCONNUE')` rejette sans rien écrire.
- [ ] **Step 7: Mesure** — script manuel : 50 appuis, afficher la durée moyenne. Objectif < 5 ms.
- [ ] **Step 8: Commit** — `feat(backend): clavier virtuel via socket ydotoold`

## Task 3 : Pilotage du navigateur

**Files:** Create `src/navigateur.js`, `test/navigateur.test.js`

**Interfaces:**
- Produces: `creerNavigateur(urlCdp) -> { allerA(url): Promise<void>, retourAccueil(): Promise<void> }`

- [ ] **Step 1: Test qui échoue** — faux serveur HTTP+WS simulant `/json/list` puis acceptant `Page.navigate`. `retourAccueil()` doit envoyer `Page.navigate` avec l'URL du shell.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter** — `fetch(urlCdp + '/json/list')`, retenir la cible `type === 'page'`, se connecter à son `webSocketDebuggerUrl` avec le `WebSocket` natif de Node 22, envoyer `{id, method:'Page.navigate', params:{url}}`.
- [ ] **Step 4: Test vert.**
- [ ] **Step 5: Test du point 2 de Review Focus** — changer l'identifiant de cible du faux serveur entre deux appels ; les deux doivent réussir. **La cible ne doit jamais être mise en cache.**
- [ ] **Step 6: Commit** — `feat(backend): pilotage du navigateur via CDP`

## Task 4 : Actions système

**Files:** Create `src/systeme.js`, `test/systeme.test.js`

**Interfaces:**
- Consumes: `creerNavigateur` (tâche 3)
- Produces: `creerSysteme({executer, navigateur}) -> { actions: string[], executerAction(nom): Promise<void> }`
  (`executer` est injecté pour les tests ; par défaut `execFile` promisifié.)

Actions et commandes exactes :

| Action | Commande |
|---|---|
| `volume_plus` / `volume_moins` | `wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+` / `5%-` |
| `muet` | `wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle` |
| `veille` | *pas de commande* — coupe le son puis `navigateur.allerA('http://127.0.0.1:8080/shell/veille.html')` |
| `extinction` | `sudo /usr/bin/systemctl poweroff` |

> `wpctl` exige `XDG_RUNTIME_DIR=/run/user/999` dans l'environnement.
> **Limite connue :** `cage` n'implémente pas la gestion d'alimentation des sorties ; une vraie mise en veille de l'écran est impossible. La veille affiche une page noire et coupe le son. À documenter dans le README.

- [ ] **Step 1: Test qui échoue** — `executerAction('volume_plus')` appelle `executer` avec `['wpctl', ['set-volume','@DEFAULT_AUDIO_SINK@','5%+']]`, **jamais une chaîne unique**.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter** — table figée nom → `[binaire, [args]]`. Aucune construction dynamique.
- [ ] **Step 4: Test vert.**
- [ ] **Step 5: Test du point 4 de Review Focus** — `executerAction('rm -rf /')`, `executerAction('volume_plus; reboot')` et `executerAction(undefined)` rejettent toutes sans appeler `executer`.
- [ ] **Step 6: Créer la page de veille** — `apps/tv-shell/veille.html` : fond noir pur `#000`, aucun contenu, aucun script hormis un écouteur de touche qui ramène à `index.html`. C'est le plus proche d'une mise en veille que `cage` permette.
- [ ] **Step 7: Commit** — `feat(backend): actions systeme sur liste blanche`

## Task 5 : Appairage et jetons

**Files:** Create `src/appairage.js`, `test/appairage.test.js`

**Interfaces:**
- Produces: `creerAppairage(cheminFichier) -> { demanderCode(): string, verifier(code): string|null, jetonValide(jeton): boolean, revoquer(jeton): void, appareils(): object[] }`

Règles : code à **6 chiffres**, valable **120 s**, un seul actif à la fois. Jeton = 32 octets aléatoires en hexadécimal (`crypto.randomBytes`). Persistance JSON dans `/var/lib/nucflix/appareils.json`, mode `0600`.

- [ ] **Step 1: Test qui échoue** — `demanderCode()` renvoie 6 chiffres ; `verifier(ceCode)` renvoie un jeton ; `jetonValide(jeton)` est vrai.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Test vert.**
- [ ] **Step 5: Tests de robustesse** — mauvais code rejeté ; code expiré après 120 s rejeté (horloge injectée) ; code non réutilisable.
- [ ] **Step 6: Test du point 3 de Review Focus** — un jeton reste valide après rechargement depuis le fichier (simule la reconnexion du téléphone après veille).
- [ ] **Step 7: Test du point 5 de Review Focus** — deux jetons coexistent ; `revoquer` l'un laisse l'autre valide.
- [ ] **Step 8: Commit** — `feat(backend): appairage par code et jetons`

## Task 6 : Protocole et serveur TV

**Files:** Create `src/protocole.js`, `src/serveur-tv.js`, `test/protocole.test.js`, `test/serveur-tv.test.js`
**Modify:** `apps/tv-shell/app.js` (afficher le code d'appairage)

**Interfaces:**
- Produces: `valider(messageBrut) -> {type, ...}|null`
- Produces: `creerServeurTv({racineShell, port}) -> { diffuserTv(message), fermer() }`
  (le nom `diffuserTv` est celui que la tâche 7 consomme — ne pas le raccourcir)

Vocabulaire téléphone → backend : `{t:'auth',jeton}`, `{t:'pair',code}`, `{t:'key',k}`, `{t:'sys',a}`, `{t:'home'}`.
Backend → téléphone : `{t:'ok'}`, `{t:'appairage_requis'}`, `{t:'erreur',m}`.
Backend → TV : `{t:'code',code}`, `{t:'code_efface'}`.

- [ ] **Step 1: Test qui échoue** — `valider('{"t":"key","k":"UP"}')` renvoie l'objet ; `valider('pas du json')`, `valider('{"t":"inconnu"}')` et un message de plus de 1 Ko renvoient `null`.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter `valider`** — analyse JSON en `try`, type dans une liste fermée, taille plafonnée.
- [ ] **Step 4: Test vert.**
- [ ] **Step 5: Test du serveur TV** — sert `index.html` depuis la racine du shell, et `diffuserTv({t:'code',code:'123456'})` parvient à un client WebSocket connecté.
- [ ] **Step 6: Implémenter `serveur-tv.js`** — fichiers statiques + WebSocket, **lié à `127.0.0.1` uniquement**.
- [ ] **Step 7: Modifier le shell** — `apps/tv-shell/app.js` se connecte à `ws://127.0.0.1:8080/tv` et affiche un panneau plein écran avec le code à 6 chiffres à la réception de `{t:'code'}`. Réutiliser le voile existant.
- [ ] **Step 8: Tests verts.**
- [ ] **Step 9: Commit** — `feat(backend): protocole et serveur TV`

## Task 7 : Serveur télécommande

**Files:** Create `src/serveur-telecommande.js`, `test/serveur-telecommande.test.js`

**Interfaces:**
- Consumes: `valider`, `creerAppairage`, `creerClavier`, `creerSysteme`, `creerNavigateur`, `diffuserTv` (tâche 6)
- Produces: `creerServeurTelecommande({racinePwa, port, appairage, clavier, systeme, navigateur, diffuserTv}) -> { fermer() }`

- [ ] **Step 1: Test qui échoue** — un client WebSocket **sans jeton** reçoit `{t:'appairage_requis'}`, et un `{t:'key'}` envoyé avant authentification **n'atteint pas le clavier** (espion).
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter** — à la connexion : si `auth` avec jeton valide → authentifié ; sinon `demanderCode()`, `diffuserTv({t:'code',code})` et attente d'un `pair`. Une fois authentifié : `key` → clavier, `sys` → système, `home` → navigateur.
- [ ] **Step 4: Test vert.**
- [ ] **Step 5: Test du parcours d'appairage complet** — connexion, réception du code côté TV, envoi du `pair`, puis une touche atteint le clavier.
- [ ] **Step 6: Test du point 4 de Review Focus** — `{t:'sys',a:'rm -rf /'}` d'un client **authentifié** est rejeté sans appel système.
- [ ] **Step 7: Commit** — `feat(backend): serveur telecommande authentifie`

## Task 8 : La PWA télécommande

**Files:** Create `apps/mobile-remote/{index.html,styles.css,app.js,manifest.json}`

Contraintes d'interface — c'est un objet qu'on utilise **dans le noir, sans regarder** :
- Cibles tactiles **d'au moins 64 px**, pavé directionnel occupant la majorité de l'écran
- **Retour haptique** (`navigator.vibrate(10)`) à chaque appui
- Thème sombre, aucun défilement, `user-select: none`, `touch-action: manipulation`
- Répétition au maintien : premier envoi immédiat, puis toutes les **120 ms après 400 ms**
- Jeton en `localStorage`, reconnexion automatique avec repli exponentiel
- Écran de saisie du code d'appairage, clavier numérique (`inputmode="numeric"`)
- Indicateur de connexion visible en permanence

- [ ] **Step 1: Écrire la PWA.**
- [ ] **Step 2: Vérifier à 390×844 px** (format téléphone) — aucun défilement, toutes les cibles ≥ 64 px.
- [ ] **Step 3: Test manuel** — depuis un téléphone sur `http://nucflixchill.local:3000`, appairer puis déplacer le focus sur la TV.
- [ ] **Step 4: Commit** — `feat(remote): PWA telecommande avec appairage`

## Task 9 : Déploiement

**Files:** Create `infra/nucflix-backend.service`, `infra/sudoers-nucflix`
**Modify:** `/etc/systemd/system/nucflix-kiosk.service` (dépendance), supprimer `nucflix-web.service`

- [ ] **Step 1: Écrire l'unité systemd** — `User=nucflix`, `Group=input`, `Environment=XDG_RUNTIME_DIR=/run/user/999`, `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`, `ReadWritePaths=/var/lib/nucflix`, `OOMScoreAdjust=-500`, `Restart=always`.
- [ ] **Step 2: Écrire la règle sudoers** — `nucflix ALL=(root) NOPASSWD: /usr/bin/systemctl poweroff` **et rien d'autre**. Installer en `0440`, valider avec `visudo -c`.
- [ ] **Step 3: Déployer** — code dans `/opt/nucflix/backend`, arrêter et supprimer `nucflix-web.service`.
- [ ] **Step 3b: Corriger l'unité du kiosque** — l'unité déployée aujourd'hui est incomplète (vérifié sur la machine). Y ajouter :
  - `Wants=nucflix-backend.service ydotoold.service` et `After=` les mêmes — sans quoi Chrome peut démarrer avant que les pages soient servies
  - `ExecStartPre=/bin/sh -c 'until curl -sf http://127.0.0.1:8080/health; do sleep 0.2; done'` et `TimeoutStartSec=45` — attendre que le backend serve réellement, **port 8080 et non 3000**
  - remplacer `Restart=no` (valeur de mise au point) par `Restart=always` et `RestartSec=2`
- [ ] **Step 4: Ouvrir le pare-feu** — `sudo ufw allow 3000/tcp comment 'telecommande Nucflix'`.
- [ ] **Step 5: Vérifier l'exposition** — `8080` injoignable depuis `192.168.1.21`, `3000` joignable, `9222` **toujours** sur `127.0.0.1`.
- [ ] **Step 6: Activer au démarrage** — `sudo systemctl enable nucflix-backend`.
- [ ] **Step 7: Mettre à jour la documentation** — `docs/JOURNAL-SOCLE.md` (modifications machine), `docs/RESTE-A-FAIRE.md` (cocher §1.1 à 1.3), `README.md` (état).
- [ ] **Step 8: Commit** — `feat(infra): deploiement du backend`

---

## Définition de terminé

1. Depuis le téléphone, sur `http://nucflixchill.local:3000` : appairage par code, puis déplacement du focus sur la TV.
2. Depuis Jellyfin ou YouTube, le bouton **Accueil** ramène au shell.
3. Le volume monte et descend ; l'extinction fonctionne.
4. `8080` reste injoignable depuis le réseau ; `3000` exige un jeton ; `9222` reste local.
5. Latence d'une touche **< 5 ms**, mesurée.
6. Tous les tests passent : `node --test apps/system-backend/test/`.
