# 📓 Journal du socle système

> Registre de **toutes** les modifications apportées au NUC, dans l'ordre.
> Tenu à jour au fur et à mesure, pour pouvoir refaire — ou défaire — chaque étape.
> Machine : `nucflixchill` · Ubuntu 26.04.1

---

## Session du 2 octobre 2026

### ✅ Fait

#### 1. Fuseau horaire
```bash
sudo timedatectl set-timezone Europe/Paris
```
Était sur `Etc/UTC`, soit 2 h de décalage sur tous les journaux.

#### 2. Paquets installés
```bash
sudo apt-get install cage vainfo intel-media-va-driver-non-free i965-va-driver \
                     mesa-utils alsa-utils curl grim ydotool fonts-noto-color-emoji
```
Puis Google Chrome via le `.deb` officiel (`google-chrome-stable`, version 154.0.8037.97).

**Chrome et non Chromium** : seul Chrome embarque le module Widevine
(`/opt/google/chrome/WidevineCdm/.../libwidevinecdm.so`) nécessaire à Netflix.

**Aucune mise à jour générale n'a été lancée** (`apt upgrade` volontairement évité) :
le noyau n'a pas été touché, donc aucun redémarrage n'est requis.

#### 3. Compte de service
```bash
sudo useradd --system --create-home --home-dir /var/lib/nucflix --shell /bin/bash \
             --groups video,render,input,audio nucflix
sudo passwd -l nucflix
```
`uid=999`, mot de passe verrouillé — aucune connexion possible avec ce compte.
Les quatre groupes donnent accès à l'écran, au GPU, aux périphériques d'entrée et au son.

#### 4. Module noyau `uinput`
```bash
sudo modprobe uinput
echo uinput | sudo tee /etc/modules-load.d/uinput.conf
```
Permet la création du clavier virtuel. `/dev/uinput` est en `root:input 0660`,
et `nucflix` appartient au groupe `input` — aucune règle `udev` supplémentaire nécessaire.

#### 5. Fichiers créés

| Chemin | Rôle |
|---|---|
| `/opt/nucflix/test.html` | Page de test (pavé directionnel + dernière touche reçue) |
| `/usr/local/bin/nucflix-browser` | Lanceur Chrome avec tous ses drapeaux |
| `/etc/systemd/system/nucflix-kiosk.service` | Service d'affichage (cage + Chrome) |
| `/etc/systemd/system/ydotoold.service` | Service du clavier virtuel |
| `/etc/modules-load.d/uinput.conf` | Chargement du module au démarrage |

#### 6. Services

Les deux sont **démarrés manuellement** et **non activés au démarrage** (`disabled`) :
le comportement au boot reste volontairement inchangé tant que le point 2 des
« à faire » n'est pas traité.

```bash
sudo systemctl start ydotoold      # clavier virtuel
sudo systemctl start nucflix-kiosk # affichage
```

---

### 📊 Mesures relevées

| Mesure | Valeur | Commentaire |
|---|---|---|
| Décodage matériel | H.264, HEVC Main, **HEVC Main10 (10 bits)**, VP9, VP8, MPEG2, VC1 | Meilleur qu'estimé : HEVC 10 bits et VP9 confirmés |
| AV1 | ❌ absent | Conforme aux prévisions — à contourner côté YouTube |
| Résolution obtenue | 1920 × 1080 natif | Plafond de la TV |
| RAM du kiosque (page statique) | **1,4 Go** sur 3,4 Go | 2 Go restants ; marge à surveiller avec Netflix |
| RAM de `ydotoold` | 336 Ko | négligeable |
| Latence d'une touche | **65 ms** | Dominée par le lancement du binaire `ydotool` |

> **Conséquence pour le backend :** il devra écrire directement dans le socket
> `/run/ydotool/socket` plutôt que d'invoquer le binaire à chaque appui. Gain attendu :
> 65 ms → ~1 ms. Indispensable pour un défilement fluide en maintien de touche.

---

### ❌ Pas encore fait

1. Son (PipeWire) — la TV accepte AC-3 5.1 et E-AC-3 7.1
2. **Activation au démarrage** des deux services
3. Pare-feu (`ufw`) — aucun n'est installé
4. Agrandissement du volume logique : **~364 Go** non alloués
5. Correctifs de démarrage : `networkd-wait-online`, `fwupd-refresh`, `crashkernel`, `zram`, écran de démarrage
   → tous nécessitent un redémarrage pour être validés
6. Durcissement SSH — **délibérément reporté** tant que l'affichage n'est pas autonome au boot

---

### ⚠️ À retirer en fin de chantier

Une autorisation administrateur permanente a été accordée pour la durée des travaux :

```bash
# Contenu : devkram ALL=(ALL) NOPASSWD:ALL
sudo rm /etc/sudoers.d/nucflix
```

**Ne pas oublier.**

---

### 🔄 Comment tout défaire

```bash
sudo systemctl stop nucflix-kiosk ydotoold
sudo rm /etc/systemd/system/nucflix-kiosk.service /etc/systemd/system/ydotoold.service
sudo systemctl daemon-reload
sudo userdel -r nucflix
sudo rm -rf /opt/nucflix /usr/local/bin/nucflix-browser /etc/modules-load.d/uinput.conf
sudo timedatectl set-timezone Etc/UTC
```
Les paquets installés peuvent rester sans inconvénient.
