# 🔍 Audit matériel & système du NUC

> Audit réalisé le **2 octobre 2026** directement sur la machine cible.
> Hôte : `nucflixchill` · Ubuntu 26.04.1 LTS · kernel 7.0.0-38-generic

Ce document est l'état des lieux de référence du NUC qui fait tourner **Nucflix & Chill**.
Il sert de base aux décisions d'architecture et à l'automatisation du déploiement.

---

## 1. Fiche matériel

| Composant | Détail |
|---|---|
| **Modèle** | Intel NUC6CAYH (`J26843-410`) |
| **BIOS** | `AYAPLCEL.86A.0063.2019.0621.1450` — juin 2019 (dernière version publiée, gamme NUC6 arrêtée par Intel) |
| **CPU** | Intel Celeron J3455 — 4 cœurs / 4 threads, 800 MHz → 2,3 GHz (base 1,5 GHz) |
| **Jeux d'instructions** | `aes` ✅ · `sse4_2` ✅ · `vmx` (VT-x) ✅ · **`avx` ❌** |
| **RAM** | 3,35 Gio utilisables (4 Go physiques) + 3,7 Gio de swap (`/swap.img`) |
| **GPU** | Intel HD Graphics 500 (Apollo Lake GT1, `8086:5a85`) — driver `i915` chargé |
| **Accélération** | `/dev/dri/card1` + `/dev/dri/renderD128` présents |
| **Stockage** | Toshiba **MQ01ACF050 — 500 Go mécanique 7200 tr/min** (`ROTA=1`) |
| **Slot M.2** | **Libre** (2242 SATA) — seul `sda` est détecté |
| **Réseau filaire** | Realtek RTL8111/8168 Gigabit (`enp3s0`) — **câble débranché** (`NO-CARRIER`) |
| **Réseau sans fil** | Intel Dual Band Wireless-AC 3168 (1×1) — `192.168.1.21/24`, signal −50 dBm |
| **Bluetooth** | Intel AC 3168 (`8087:0aa7`) — présent, **service inactif** |
| **Gouverneur CPU** | `schedutil` via `intel_cpufreq` |
| **Températures au repos** | CPU 51 °C · carte Wi-Fi 57 °C · ACPI 49 °C — sain |

### Affichage détecté

| | |
|---|---|
| **Sortie active** | `card1-DP-1` (le port HDMI physique passe par un pont LSPCON, d'où le `DP` côté noyau) |
| **Sortie libre** | `card1-DP-2` — déconnectée |
| **Écran** | `Cultraview TV` — EDID 1.3, fabricant `MTK` (MediaTek) |
| **Résolution max** | **1920 × 1080** (plafond matériel de la TV) |
| **Dalle** | 115 cm × 65 cm (~52 ") |

### Audio détecté

ELD valide sur `DP-1` (`/proc/asound/card0/eld#2.0`) — l'audio HDMI/DP fonctionne au niveau noyau :

| Format | Canaux | Détail |
|---|---|---|
| LPCM | 2 | 32 → 192 kHz, 16/20/24 bits |
| AC-3 (Dolby Digital) | 5.1 | jusqu'à 640 kbps |
| E-AC-3 (Dolby Digital Plus) | 7.1 | 44,1 / 48 kHz |

Haut-parleurs déclarés : `FL/FR`. **Le passthrough Dolby est disponible.**

---

## 2. 🔴 Problèmes bloquants

### 2.1 Le disque est un HDD mécanique — goulot d'étranglement principal

Un OS Smart TV sur plateau tournant signifie un démarrage lent, un navigateur kiosque qui met plusieurs secondes à afficher quelque chose, et des saccades à chaque accès disque.

**Le slot M.2 2242 est libre.** Un SSD M.2 SATA (~25-30 €) peut héberger le système **sans retirer le HDD**, qui devient le stockage média. C'est l'amélioration qui change le plus l'expérience, loin devant toute optimisation logicielle.

### 2.2 ~364 Go de disque non alloués

```
sda3                      463,8G  LVM2_member
└─ubuntu--vg-ubuntu--lv   100G    ext4   /
```

Défaut classique de l'installeur Ubuntu Server : le volume logique ne fait que 100 Go sur les 463,8 Go du groupe. C'est exactement l'espace nécessaire à la médiathèque.

Récupérable à chaud, sans perte de données :

```bash
sudo lvextend -l +100%FREE /dev/ubuntu-vg/ubuntu-lv
sudo resize2fs /dev/ubuntu-vg/ubuntu-lv
```

### 2.3 Le boot prend 2 min 17 — c'est un bug, pas de la lenteur

```
Startup finished in 1.270s (kernel) + 5.150s (initrd) + 2min 10.802s (userspace) = 2min 17.223s

2min 101ms  systemd-networkd-wait-online.service   ← FAILED
   15.723s  fwupd-refresh.service
```

`networkd-wait-online` attend que **toutes** les interfaces soient actives, dont `enp3s0` qui n'a pas de câble. Il tourne 2 minutes, échoue, et bloque `graphical.target` derrière lui. C'est la **seule unité en échec** de la machine.

Correctif — limiter l'attente au Wi-Fi et désactiver le rafraîchissement firmware :

```bash
sudo mkdir -p /etc/systemd/system/systemd-networkd-wait-online.service.d
sudo tee /etc/systemd/system/systemd-networkd-wait-online.service.d/override.conf <<'EOF'
[Service]
ExecStart=
ExecStart=/usr/lib/systemd/systemd-networkd-wait-online --interface=wlp2s0 --timeout=10
EOF
sudo systemctl disable --now fwupd-refresh.timer
sudo systemctl daemon-reload
```

**Gain attendu : ~15 s de boot au lieu de 2 min 17.**

### 2.4 320 Mo de RAM réservés inutilement

`/proc/cmdline` contient `crashkernel=2G-4G:320M` : le noyau réserve 320 Mo pour un dump de crash qui ne sera jamais exploité. Sur 3,35 Gio, c'est **~10 % de la RAM** récupérable — non négligeable quand le navigateur kiosque et Node se partagent la machine.

### 2.5 L'affichage ne peut pas démarrer en l'état

`graphical.target` est bien la cible par défaut, mais tout l'étage userspace est absent :

| Besoin | État |
|---|---|
| Compositeur (`cage` / `sway` / `weston`) | ❌ absent |
| Navigateur (`chromium` / `firefox`) | ❌ absent |
| Autologin sur `tty1` | ❌ non configuré |
| Mesa | ❌ absent |
| Pilote VAAPI (`intel-media-va-driver`, `i965-va-driver`) | ❌ absent |
| `vainfo` | ❌ absent |
| Stack audio userspace (PipeWire / ALSA-utils) | ❌ absent |
| `node` / `pnpm` / `npm` | ❌ absent |
| `docker` | ❌ absent |

Le noyau voit l'écran et l'audio correctement. C'est uniquement l'espace utilisateur qui est vide.

---

## 3. 🟡 Contraintes à intégrer dans l'architecture

### Pas de CEC — le NUC ne pourra pas allumer/éteindre la TV

Le module `cec` est chargé, mais **aucun `/dev/cec*` n'existe**. Le port HDMI passe par un pont LSPCON (le noyau le voit comme `DP-1`) et le bus CEC n'est pas remonté.

→ Si piloter la TV fait partie du projet : adaptateur **USB-CEC (Pulse-Eight)** obligatoire, ou renoncer à cette fonction.

### La TV est 1080p — bonne nouvelle pour le budget GPU

Plafond `1920x1080`, donc **aucun budget 4K à financer**. Le HD500 décode H.264 et HEVC 8 bits en matériel sans difficulté à cette résolution (à confirmer avec `vainfo` après installation des pilotes).

⚠️ **Pas de décodage AV1** sur cette génération de GPU. YouTube et plusieurs services servent de l'AV1 par défaut, qui basculerait en décodage logiciel et saccaderait sur un J3455. **Il faudra forcer VP9 ou H.264 côté client.**

### Le DRM des plateformes limitera les services commerciaux

Sur Chromium Linux, Widevine reste en **L3** : Netflix et Disney+ plafonneront à 720p quand ils fonctionneront. À cadrer dès maintenant si « Smart TV » sous-entend ces services. Une médiathèque locale (Jellyfin) n'est pas concernée.

### `sudo` exige un mot de passe

`devkram` appartient bien au groupe `sudo` (`uid=1000 … 27(sudo)`), mais **sans `NOPASSWD`**.

→ Le `system-backend` ne pourra exécuter **aucune** commande système (volume, extinction, réseau) en l'état. Il faudra une règle `sudoers` **nominative, limitée aux seules commandes nécessaires**. C'est le point sensible en sécurité du projet : voir §4.

### mDNS désactivé, pas d'Avahi

```
Protocols: -LLMNR -mDNS -DNSOverTLS
avahi-daemon: inactive / absent
```

La télécommande devrait viser `192.168.1.21` en dur, et casserait au prochain bail DHCP.

→ Activer mDNS (pour un `nucflixchill.local`) ou réserver l'IP sur la box.

### Points mineurs

- **Fuseau horaire sur `Etc/UTC`** au lieu de `Europe/Paris` → logs et EPG décalés de 2 h. (`sudo timedatectl set-timezone Europe/Paris`)
- **Bluetooth inactif** — matériel présent, utile pour une télécommande ou un clavier sans fil.
- **Aucun pare-feu** (`ufw` absent) → les ports 3000/4000 seront ouverts à tout le LAN dès le lancement des serveurs.
- **Locale** déjà en `fr_FR.UTF-8` ✅

---

## 4. 🔒 Posture sécurité actuelle

| Point | État |
|---|---|
| Ports à l'écoute | **SSH (22) uniquement**, + DNS stub local (`127.0.0.53/54`) et chrony en loopback |
| SSH | actif |
| Pare-feu | ❌ absent |
| Mises à jour automatiques | ✅ activées (`unattended-upgrades`) |
| Paquets en attente | **0** — système à jour |
| Sources APT | officielles Ubuntu uniquement |
| Snaps | `core24`, `snapd`, `hwctl` — rien de superflu |

La surface d'attaque est actuellement **propre**. Les deux risques à venir sont introduits par le projet lui-même :

1. **`system-backend` exécute des commandes système** → allowlist stricte d'actions, `execFile` (jamais de chaîne shell interpolée depuis le réseau), service systemd en utilisateur non-root, `sudoers` nominatif.
2. **La PWA télécommande est exposée au LAN** → sans authentification, n'importe quel appareil du réseau éteint la TV. Un token partagé est le minimum.

---

## 5. ✅ Ce qui est déjà bon

- GPU reconnu, `i915` chargé, `/dev/dri` accessible → VAAPI exploitable après installation des pilotes
- Audio DP fonctionnel au niveau noyau, avec passthrough Dolby Digital / DD+
- Système entièrement à jour, mises à jour automatiques activées
- Températures saines au repos
- GRUB déjà en `GRUB_TIMEOUT=0` + `TIMEOUT_STYLE=hidden` — bon réflexe pour un appareil
- Swap en place (3,7 Gio), utile vu les 3,35 Gio de RAM
- Locale française déjà configurée
- Surface réseau minimale

**Les fondations sont saines. C'est tout l'étage userspace qui reste à construire.**

---

## 6. 🎯 Ordre d'attaque recommandé

### Étape 1 — Correctifs gratuits et immédiats

| Action | Gain |
|---|---|
| `lvextend` + `resize2fs` | **+364 Go** de stockage |
| Override `networkd-wait-online` + désactiver `fwupd-refresh` | boot **2 min 17 → ~15 s** |
| Désactiver `kdump` / `crashkernel` | **+320 Mo** de RAM |
| `timedatectl set-timezone Europe/Paris` | horodatage correct |

### Étape 2 — Socle système

Stack kiosque (`cage` + Chromium), pilotes VAAPI + Mesa, stack audio, autologin `tty1`, toolchain Node LTS + pnpm, `ufw`, mDNS.

### Étape 3 — Matériel

**SSD M.2 2242** (~25-30 €) dans le slot libre : l'investissement qui vaut plus que toutes les optimisations logicielles de ce projet réunies.

### Étape 4 — Développement

Amorcer `apps/system-backend` (Socket.io + une action `volume`) avec une page de test minimale, pour valider la boucle *téléphone → backend → hôte* avant d'investir dans l'UI TV.

---

## Annexe — Commandes de reproduction

```bash
hostnamectl                               # modèle, BIOS, OS
lscpu                                     # CPU et jeux d'instructions
free -h && swapon --show                  # mémoire
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,ROTA,MODEL
cat /sys/class/drm/card1-DP-1/modes       # résolutions de la TV
cat /proc/asound/card0/eld#2.0            # capacités audio de la TV
ls /dev/cec*                              # présence du bus CEC
systemd-analyze && systemd-analyze blame  # temps de boot
systemctl --failed                        # unités en échec
cat /proc/cmdline                          # paramètres noyau
ss -tulnp                                  # ports à l'écoute
```
