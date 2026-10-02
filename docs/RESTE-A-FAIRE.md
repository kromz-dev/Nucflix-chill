# ✅ Reste à faire

> Liste des tâches, par ordre de priorité réelle.
> Mise à jour : 2 octobre 2026.
> L'historique de ce qui est **déjà fait** est dans [JOURNAL-SOCLE.md](JOURNAL-SOCLE.md).

---

## 🔴 Priorité 1 — Ce qui bloque l'usage quotidien

### 1.1 Revenir à l'accueil depuis une application

**C'est le manque le plus visible.** Une fois Jellyfin ou Netflix ouvert, il est
impossible de revenir au shell : le code du shell ne tourne plus dans la page.

Le retour doit venir de l'extérieur du navigateur, via le **Chrome DevTools
Protocol** déjà exposé sur `127.0.0.1:9222`. C'est le rôle du backend.

### 1.2 Le backend (`apps/system-backend`)

Le « cerveau » du projet. Quatre responsabilités :

| Fonction | Détail |
|---|---|
| Retour à l'accueil | Pilote Chrome via le CDP (port 9222) |
| Réception des commandes | Transport temps réel depuis le téléphone |
| Injection de touches | **Écrire directement dans `/run/ydotool/socket`** |
| Actions système | Volume, veille, extinction — liste blanche stricte |

> ⚠️ **Mesuré :** invoquer le binaire `ydotool` coûte **65 ms par touche**, dominés par
> le lancement du processus. Le backend doit parler au socket directement (~1 ms),
> sans quoi le maintien d'une direction donnera une sensation de lourdeur.

Prérequis : installer Node LTS et pnpm (absents de la machine).

### 1.3 La télécommande (`apps/mobile-remote`)

PWA servie sur le réseau local. Pavé directionnel, OK, Retour, lecture/pause, volume.

**Doit inclure un appairage par code** (un code s'affiche sur la TV, on le saisit sur
le téléphone) : sans cela, tout appareil du Wi-Fi peut éteindre le téléviseur.
Son port devra être **explicitement ouvert dans le pare-feu**.

### 1.4 Démarrage automatique

Les trois services tournent mais sont `disabled` : **au redémarrage, l'écran reste noir.**

```bash
sudo systemctl enable nucflix-kiosk ydotoold nucflix-web
```

À faire en même temps que les correctifs ci-dessous, pour ne redémarrer qu'une fois.

### 1.5 Correctifs de démarrage *(nécessitent un redémarrage)*

| Correctif | Gain |
|---|---|
| Limiter `systemd-networkd-wait-online` à `wlp2s0` | **−2 min** au démarrage |
| Désactiver `fwupd-refresh.timer` | −16 s |
| Retirer `crashkernel` de la ligne de commande noyau | **+320 Mo de RAM** |
| Installer `zram` | ~1 Go utile, sans jamais toucher le disque mécanique |
| `quiet loglevel=3 vt.global_cursor_default=0 splash` + thème Plymouth | Plus de texte technique sur la TV |

**Boot attendu : 2 min 17 s → ~15 s.**

---

## 🟠 Priorité 2 — Intégration des applications

### 2.1 YouTube — forcer le codec

Le GPU **ne décode pas l'AV1**, que YouTube sert par défaut. Sans intervention, le
repli logiciel saccadera. Il faut forcer VP9 ou H.264 (extension type `h264ify`, ou
drapeau Chrome).

### 2.2 YouTube — obtenir l'interface TV

`youtube.com/tv` **redirige vers le site classique** : le navigateur s'annonce comme un
PC. Un `--user-agent` de téléviseur est nécessaire. À arbitrer : ce drapeau est global
à Chrome, donc il affecterait aussi les autres sites.

### 2.3 Bandeaux de consentement

Un bandeau cookies bloque la navigation automatique sur les sites Google. À traiter
une fois pour toutes (profil Chrome persistant, déjà en place dans
`/var/lib/nucflix/chrome`).

### 2.4 Jellyfin — connexion

Utiliser **« Connexion rapide »** : un code à six chiffres s'affiche sur la TV et se
valide depuis un appareil déjà connecté. Aucun mot de passe à saisir sur le téléviseur.

### 2.5 Netflix / Disney+ / Prime — connexion

Nécessite la télécommande (saisie de texte depuis le téléphone). **Test de performance
réel à refaire à cette occasion** : l'estimation de ~10 % de CPU en 720p est une
extrapolation, pas une mesure.

---

## 🟡 Priorité 3 — Finitions du shell

- Rangée « Reprendre la lecture »
- Écran de veille après inactivité
- Page de réglages dans l'interface (adresse Jellyfin, ordre des tuiles)
- Brancher les trois tuiles « Système » sur le backend — elles n'exécutent rien
- Récupérer le vrai état du Wi-Fi (actuellement `navigator.onLine`, qui ne dit pas tout)

---

## 🔒 Priorité 4 — Sécurité, avant de considérer le projet fini

### 4.1 Retirer l'autorisation administrateur permanente

```bash
sudo rm /etc/sudoers.d/nucflix
```

Accordée pour la durée des travaux. **Ne pas oublier.**

### 4.2 Durcir l'accès SSH

Clés uniquement, mot de passe désactivé. **Volontairement reporté** tant que
l'affichage n'est pas autonome au démarrage : une erreur ici, sans console de secours
sur la TV, rendrait la machine inaccessible.

### 4.3 Revérifier le port 9222

Le pilotage de Chrome doit rester lié à `127.0.0.1`. **À revérifier à chaque
modification des drapeaux Chrome** : exposé au réseau, il donnerait à quiconque sur le
Wi-Fi le contrôle total du navigateur.

---

## 🔵 Priorité 5 — Matériel, optionnel

| Sujet | Intérêt | Coût |
|---|---|---|
| **SSD M.2 2242** dans le slot libre | Le disque mécanique est le dernier vrai goulot. Démarrage et lancement d'applications nettement plus rapides. | ~25-30 € |
| Adaptateur **USB-CEC** | Permettrait d'allumer/éteindre la TV depuis le NUC. Le port HDMI passe par un pont LSPCON, le bus CEC n'est pas exposé. | ~40 € |
| **Bluetooth** | Matériel présent, service inactif. Utile pour une télécommande physique ou un clavier de secours. | 0 € |
| **Câble Ethernet** | Supprimerait la principale source de latence et de saccades. | ~5 € |
| Boîtier certifié (Fire TV, Apple TV) | Seule façon d'avoir Netflix en 1080p. Le shell resterait l'accueil principal. | ~40 € |

---

## 📌 Décisions prises, pour mémoire

| Sujet | Décision |
|---|---|
| **Plasma Bigscreen** | **Écarté.** Non packagé pour Ubuntu 26.04, +500 à 800 Mo de RAM, et il ne lit pas les services DRM — il lancerait un navigateur, soit Plasma + Chrome au lieu de Chrome seul. |
| **Kodi** | Écarté. Packagé et mature, mais gère très mal Netflix et Disney+. |
| **Infrastructure as Code (Ansible)** | Écarté à la demande de l'utilisateur. Compensé par le [journal](JOURNAL-SOCLE.md) qui consigne chaque modification. |
| **Docker** | Écarté. Aucun service n'a besoin d'être conteneurisé ; coûterait RAM et temps de démarrage. |
| **363 Go de disque non alloués** | Laissés en réserve. Le NUC ne stocke aucun média. Le jour venu : créer un volume séparé, ne pas étendre la racine. |
| **Qualité DRM** | 720p accepté sur Netflix, Disney+ et Prime. Limite structurelle de Widevine sous Linux, pas du matériel. |
