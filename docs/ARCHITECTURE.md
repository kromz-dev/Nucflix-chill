# 🏗️ Architecture

> **Document vivant.** Il consigne ce qui est arrêté, ce qui est encore ouvert, et pourquoi.
> Dernière mise à jour : 2 octobre 2026.

---

## 1. Ce qu'on construit — et ce qu'on ne construit pas

**Nucflix & Chill est un shell de Smart TV.** Un écran d'accueil plein écran, une navigation au pavé directionnel, et des applications lancées depuis des rangées de tuiles. L'équivalent fonctionnel de webOS, Tizen ou Google TV, sur du matériel qu'on maîtrise.

**Ce n'est pas un serveur de médias.** Jellyfin tient déjà ce rôle, sur une machine séparée du réseau local. Le NUC ne stocke rien, n'indexe rien, ne transcode rien : il affiche et il lit.

Cette distinction est structurante. Elle libère la totalité des ressources du NUC pour l'interface et la lecture, et elle évite de réinventer un catalogue, un scraping de métadonnées et une gestion de bibliothèque qui existent déjà et fonctionnent.

### Conséquence sur le budget de ressources

| Ressource | Disponible | Consommateurs |
|---|---|---|
| RAM | 3,35 Gio (+ 320 Mo récupérables, voir audit) | Navigateur (~800 Mo – 1,5 Gio), backend Node, compositeur |
| CPU | 4 cœurs Celeron @1,5–2,3 GHz, **sans AVX** | Décodage logiciel DRM, rendu de l'interface |
| GPU | Intel HD 500, VAAPI | Décodage matériel H.264 / HEVC 8 bits, composition |

C'est serré. Chaque processus ajouté doit être justifié. **Ni Docker, ni base de données, ni serveur de rendu côté serveur** ne sont prévus sur le NUC.

---

## 2. Le problème central de conception

Une Smart TV doit répondre à une télécommande **quelle que soit l'application affichée**. C'est trivial pour le shell maison : du JavaScript écoute des événements. Ça devient impossible dès que Netflix est à l'écran — aucun code du projet ne tourne dans cette page, et il n'existe aucun moyen pour une page web d'envoyer des touches à une autre.

### La solution retenue : injection au niveau noyau

Le backend crée un **périphérique clavier virtuel** via `uinput`. Quand la télécommande envoie « bas », le backend écrit un événement `KEY_DOWN` dans ce périphérique. Le noyau le distribue au compositeur, qui le remet à la fenêtre ayant le focus — exactement comme un clavier physique.

```
Téléphone  ──Socket.io──▶  Backend  ──/dev/uinput──▶  Noyau  ──▶  Compositeur  ──▶  App au focus
```

Ce choix a trois propriétés qui le rendent, à notre avis, difficilement remplaçable :

**Universalité.** Netflix, YouTube, Jellyfin et le shell reçoivent les touches de la même manière. Aucune intégration par application n'est nécessaire.

**Indépendance.** Aucune application n'a besoin de connaître l'existence de la télécommande. Rien ne casse quand Netflix refond son interface.

**Simplicité du protocole.** La télécommande n'émet qu'un vocabulaire de touches (`UP`, `DOWN`, `LEFT`, `RIGHT`, `OK`, `BACK`, `PLAY_PAUSE`…), pas des commandes métier. Le protocole reste minuscule et stable.

**Contrepartie assumée :** le backend détient un pouvoir d'injection clavier sur la machine entière. C'est une capacité sensible, qui impose les garde-fous décrits en §5.

---

## 3. Découpage en sous-projets

Le projet est trop vaste pour une spécification unique. Il est découpé en quatre sous-projets **séquentiels**, chacun avec sa spec, son plan et son cycle d'implémentation.

L'ordre n'est pas arbitraire : le sous-projet 1 est le seul qui soit purement système, et il rend les trois autres développables et testables.

### 1 — Socle système 🟡 *en conception*

Transformer une installation Ubuntu Server nue en appliance TV.

Périmètre : correctifs de l'audit (LVM, temps de démarrage, `crashkernel`, fuseau horaire), compositeur Wayland en kiosque, autologin sur `tty1`, pilotes VAAPI et Mesa, pile audio HDMI, périphérique d'injection `uinput`, configuration réseau et mDNS, pare-feu, chaîne d'outils Node, supervision `systemd`.

> **Critère de succès** — j'allume le NUC. Quinze secondes plus tard, une page web s'affiche sur le téléviseur. Une touche envoyée depuis le réseau la fait réagir.

Ce critère est volontairement minimal : il valide la chaîne complète *démarrage → affichage → entrée* sans qu'une seule ligne d'interface n'ait été écrite.

### 2 — Shell TV ⚪

Le lanceur et son design. Rangées de tuiles, navigation spatiale, états de focus, barre d'état, zone sûre overscan, typographie lisible à trois mètres.

C'est ici que vit l'exigence « vraie Smart TV » : elle est un objectif de premier rang, pas une finition.

### 3 — Télécommande ⚪

PWA sur smartphone, transport temps réel, pavé directionnel, contrôles de lecture, volume, veille.

### 4 — Intégration des applications ⚪

Jellyfin, YouTube TV, Twitch, et le lancement puis le retour des applications DRM.

---

## 4. Modèle d'exécution des applications — ⚠️ non tranché

Les applications DRM refusent l'intégration en `iframe` : elles doivent s'afficher comme pages de premier niveau. Le shell doit donc pouvoir céder l'écran à une application, puis le reprendre. Plusieurs modèles sont envisageables, avec des profils de consommation mémoire et de complexité très différents.

Les pistes identifiées — **aucune n'est retenue à ce stade** :

- **Une seule instance de navigateur, plusieurs onglets**, le backend basculant la cible active via le protocole DevTools. Économe en mémoire, bascule quasi instantanée.
- **Plusieurs fenêtres de navigateur**, le compositeur gérant la mise au premier plan. Plus simple à raisonner, plus coûteux en RAM.
- **Une seule page, navigation par URL**, le shell cédant la place par un changement d'adresse. Le plus simple, mais perd l'état des applications.

Points à instruire pour chaque piste : empreinte mémoire réelle, latence de bascule, conservation de l'état de lecture, et **par quel mécanisme l'utilisateur revient au shell** (la touche `BACK` de Netflix ne nous appartient pas).

Cette décision sera arbitrée lors de la conception du sous-projet 1, mesures en main plutôt que sur intuition.

---

## 5. Sécurité

Le NUC est aujourd'hui une machine propre : seul SSH écoute, le système est à jour, aucun pare-feu n'est encore nécessaire. **Les deux risques du projet sont introduits par le projet lui-même.**

### Le backend détient des capacités privilégiées

Injection clavier, volume, extinction, veille. Trois garde-fous sont posés comme non négociables dès la conception :

**Liste blanche d'actions.** Le backend n'expose qu'un ensemble fini d'opérations nommées. Jamais de chaîne de commande interpolée depuis le réseau — `execFile` avec des arguments séparés, jamais de shell.

**Moindre privilège.** Le service tourne en utilisateur non-root. L'accès à `uinput` passe par une règle `udev` sur un groupe dédié, pas par `sudo`. Les rares commandes réellement privilégiées font l'objet d'une règle `sudoers` nominative, limitée à ces commandes précises.

**Durcissement systemd.** `NoNewPrivileges`, `ProtectSystem`, `PrivateTmp`, et un `DeviceAllow` restreint au strict nécessaire.

### La télécommande est exposée au réseau local

Sans authentification, n'importe quel appareil du Wi-Fi éteint le téléviseur ou prend le contrôle de la navigation. Un secret partagé entre la télécommande et le backend est le minimum exigé, et le service doit n'écouter que sur l'interface locale.

### La page TV ne doit être servie qu'à l'écran

Objectif explicite du projet : l'interface TV s'affiche sur le téléviseur, pas dans le navigateur de n'importe qui. Le shell sera donc servi sur l'interface de bouclage uniquement, la télécommande étant la seule surface réellement exposée au réseau local.

---

## 6. Principes de conception

**YAGNI, strictement.** Les ressources de la machine et le temps disponible sont tous deux limités. Toute fonctionnalité qui ne sert pas le critère de succès du sous-projet en cours est repoussée.

**Unités isolées, à frontières explicites.** Chaque paquet doit avoir une raison d'être énonçable en une phrase, une interface claire, et être testable seul. Si un fichier grossit, c'est le signe qu'il fait trop de choses.

**Mesurer avant d'optimiser — et avant de concevoir.** Sur ce matériel, l'intuition sur les performances est peu fiable. Les décisions coûteuses à défaire (modèle d'exécution, faisabilité du décodage DRM) seront précédées d'une mesure.

**Le socle avant l'interface.** Une belle interface sur un système qui démarre en deux minutes et ne répond pas à la télécommande ne vaut rien.

---

## 7. Points ouverts

Ces questions restent à trancher. Elles sont listées ici pour qu'aucune ne soit perdue en route.

| # | Question | Impact |
|---|---|---|
| 1 | Le décodage DRM 720p en logiciel tient-il sur un J3455 ? | **Bloquant.** Conditionne la présence même des applications DRM. À mesurer en premier. |
| 2 | Quel modèle d'exécution des applications retenir ? (§4) | Fort — empreinte mémoire et complexité du backend |
| 3 | Par quel geste revient-on au shell depuis une application tierce ? | Fort — ergonomie de la télécommande |
| 4 | Un boîtier certifié dédié à la 1080p DRM doit-il être intégré au design ? | Moyen — ajouterait une tuile de bascule d'entrée HDMI |
| 5 | Faut-il gérer le Bluetooth (télécommande ou clavier physique de secours) ? | Faible — matériel présent, service inactif |
| 6 | Un adaptateur USB-CEC pour piloter l'alimentation du téléviseur ? | Faible — achat matériel, fonction de confort |
