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
| `/etc/systemd/system/nucflix-web.service` | Serveur local des pages (127.0.0.1:8080) |
| `/opt/nucflix/video.html` · `/opt/nucflix/drm.html` | Pages de test vidéo et DRM |
| `/etc/modules-load.d/uinput.conf` | Chargement du module au démarrage |

#### 6. Services

Les deux sont **démarrés manuellement** et **non activés au démarrage** (`disabled`) :
le comportement au boot reste volontairement inchangé tant que le point 2 des
« à faire » n'est pas traité.

```bash
sudo systemctl start ydotoold      # clavier virtuel
sudo systemctl start nucflix-kiosk # affichage
```

#### 7. Son (PipeWire)
```bash
sudo apt-get install pipewire pipewire-pulse wireplumber pipewire-audio pulseaudio-utils
sudo systemctl --global enable pipewire.socket pipewire-pulse.socket wireplumber.service
sudo loginctl enable-linger nucflix
sudo -u nucflix pactl set-card-profile alsa_card.pci-0000_00_0e.0 output:hdmi-stereo
```
Le profil par défaut était `output:analog-stereo` (prise casque). Basculé sur HDMI.
Profil stéréo retenu et non 5.1 : la TV ne déclare que deux haut-parleurs (`FL/FR`) ;
l'AC-3 5.1 qu'elle accepte ne concerne que les flux déjà compressés.
**Validé à l'oreille** par l'utilisateur.

#### 8. URL affichée rendue configurable
| Fichier | Rôle |
|---|---|
| `/etc/nucflix/url.conf` | `NUCFLIX_URL=...` — la page affichée |
| `/etc/systemd/system/nucflix-kiosk.service.d/url.conf` | `EnvironmentFile=-/etc/nucflix/url.conf` |

Changer la page affichée = éditer le fichier puis `systemctl restart nucflix-kiosk`.

---

### 🎬 Test de lecture vidéo

Source : Big Buck Bunny 1080p **VP9** (Wikimedia, 300 Mo) — même codec que YouTube.
Page de test : `/opt/nucflix/video.html` (statistiques via `getVideoPlaybackQuality()`).

| Mesure | Valeur |
|---|---|
| Résolution | 1920 × 1080 |
| Images décodées | 3180 |
| **Images perdues** | **0 — 0,0 %** |
| Fréquence soutenue | **60,0 i/s** |
| **Moteur vidéo GPU (VCS)** | **16 %** → décodage matériel confirmé |
| Moteur de rendu GPU (RCS) | ~35 % |
| Fréquence GPU | ~220 MHz sur ~700 max |
| GPU au repos (RC6) | 42 % du temps |
| Processeur | ~21 % des 4 cœurs |
| Consommation paquet | 5,1 W |
| Mémoire totale utilisée | 1,5 Go / 3,4 Go |

> **Conclusion :** pour Jellyfin et YouTube, la machine est largement surdimensionnée.
> Test volontairement exigeant (60 i/s, alors que les films sont en 24).

**Non testé :** lecture DRM (Netflix / Disney+ / Prime). Les flux Widevine contournent
fréquemment le décodage matériel sous Linux et retombent sur le processeur.
C'est la dernière inconnue du socle.

#### Obstacle rencontré
- `chrome://gpu` est **bloqué en mode kiosque** → Chrome retombe sur la page d'accueil.
  La vérification du décodage matériel passe donc par `intel_gpu_top` (colonne VCS).
- `youtube.com/tv` **redirige vers le site classique** : le navigateur s'annonce comme
  un PC. Un `--user-agent` de téléviseur sera nécessaire pour obtenir l'interface TV.
  Un bandeau de consentement cookies bloque par ailleurs toute navigation automatique.

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

### 🔐 Test de lecture DRM (Widevine)

Source : asset de démonstration public **Shaka « Angel One »** (DASH + Widevine),
serveur de licence `https://cwip-shaka-proxy.appspot.com/no_auth`.
Lecteur : Shaka Player 4.7.11. Page : `/opt/nucflix/drm.html`.
**Aucun compte Netflix n'a été utilisé.**

#### Obstacle résolu : le contexte sécurisé

Premier essai en `file://` → échec Shaka **6002**.
Cause : les EME (Encrypted Media Extensions) exigent un **contexte sécurisé** ;
`file://` n'en est pas un. Résolu en servant la page depuis `http://127.0.0.1:8080`.

> Nouveau service : `nucflix-web.service` — `python3 -m http.server 8080 --bind 127.0.0.1`.
> **Lié à la boucle locale uniquement** : vérifié injoignable depuis `192.168.1.21`.
> Conforme à la règle d'architecture « l'interface TV n'est visible que sur la TV ».

#### Résultats

| Mesure | Vidéo normale (VP9 1080p60) | Vidéo protégée (Widevine) |
|---|---|---|
| Déchiffrement | — | ✅ `com.widevine.alpha` |
| Résolution | 1920 × 1080 | 768 × 576 *(limite de l'asset)* |
| Images perdues | 0 / 3180 | 0 / 890 |
| **Moteur vidéo GPU (VCS)** | **16 %** | **0 %** |
| Décodeur effectif | **matériel** | **logiciel (CPU)** |
| Charge processeur | ~21 % | ~4,5 % |

#### Conclusions

1. **Netflix / Disney+ / Prime fonctionneront.** Widevine est opérationnel.
2. **Le DRM contourne le décodage matériel** — confirmé par `VCS = 0 %`.
   C'est le comportement de Widevine sous Linux, pas une erreur de configuration.
   C'est aussi la raison du plafond à 720p.
3. **Charge estimée à ~10 % de CPU en 720p** (extrapolation depuis 768×576,
   ~2× les pixels). **Non mesuré** : le test réel exige un compte, donc la télécommande.

> **Le point ouvert n°1 (« le décodage DRM tient-il sur un J3455 ? ») est levé.**
> Les trois usages visés sont validés : Jellyfin et YouTube en matériel avec une
> marge très large, services protégés en logiciel avec une marge confortable.

---

### 🔥 Pare-feu (ufw)

Inventaire des ports **avant** activation :

| Service | Port | Exposition constatée |
|---|---|---|
| `sshd` | 22 | `0.0.0.0` — ouvert au réseau *(voulu)* |
| `python3` (pages) | 8080 | `127.0.0.1` — local uniquement ✅ |
| **Chrome DevTools** | **9222** | `127.0.0.1` — local uniquement ✅ |
| `systemd-resolved` | 53 | `127.0.0.5x` — local ✅ |
| `chronyd` | 323 | `127.0.0.1` / `::1` — local ✅ |

> Le port **9222** est le futur plan de contrôle du navigateur. Exposé au réseau, il
> donnerait à n'importe qui sur le LAN le contrôle total de Chrome. Vérifié lié à la
> boucle locale — **à revérifier à chaque changement des drapeaux Chrome.**

Configuration appliquée, **dans cet ordre** (SSH autorisé avant activation) :

```bash
sudo apt-get install ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH - acces administrateur'
sudo ufw --force enable
```

Actif, et activé au démarrage. Vérifié après coup : SSH joignable, serveur local en 200,
les trois services toujours actifs.

**Conséquence :** le port de la future télécommande devra être autorisé explicitement.
Plus rien ne peut être exposé par accident.

### 💾 Espace disque — décision : ne rien faire

363 Go restent non alloués dans le groupe de volumes `ubuntu-vg` (défaut de l'installeur
Ubuntu Server : seuls 100 Go sur 463 ont été attribués au volume racine).

**Décision prise de ne pas y toucher.** La recommandation initiale de l'audit
(« l'espace qu'il faut à la médiathèque ») est **caduque** : Jellyfin tourne sur une
autre machine, le NUC ne stocke aucun média et dispose déjà de 85 Go libres.

Agrandir le volume racine retirerait de surcroît un garde-fou : un système dont la
racine se remplit tombe en panne. L'espace reste en réserve, mobilisable en deux
minutes le jour où un usage concret apparaît (cache local, téléchargements,
enregistrements si ajout d'un tuner). Dans ce cas, créer un **volume séparé** plutôt
qu'agrandir la racine.

---


---

### 🎨 Shell TV — première version

Code source : [`apps/tv-shell/`](../apps/tv-shell/), déployé dans `/opt/nucflix/shell/`
et servi par `nucflix-web.service` sur `http://127.0.0.1:8080/shell/`.

| Fichier | Rôle |
|---|---|
| `styles.css` | Jetons de couleur, échelle d'espacement, zone sûre overscan (4,5vh), unités en `vh` |
| `index.html` | Structure sémantique, barre d'état, aide de navigation |
| `app.js` | Catalogue, navigation spatiale, défilement des rangées, horloge |
| `config.json` | Adresse Jellyfin, réglable sans toucher au code |
| `diagnostic.html` | État de la machine |

**Partis pris d'interface** — une TV n'est pas un site web :

- Unités en `vh` partout : l'interface reste proportionnelle quelle que soit la résolution
- **Zone sûre de 4,5vh** : les téléviseurs rognent les bords de l'image
- Focus signalé par **quatre signaux cumulés** — agrandissement, bordure, fond, halo —
  pour rester lisible à trois mètres
- Accent coloré **réservé au focus** : rien d'autre dans l'interface ne l'utilise
- Aucun défilement vertical, aucun curseur
- Boutons natifs : accessibles au clavier et aux lecteurs d'écran sans effort
- **Monogrammes et non logos de marque** : reproduire les logos de Netflix ou Disney
  poserait un problème, un monogramme reste reconnaissable

**Deux défauts repérés sur la première capture, corrigés :**

1. La 6ᵉ tuile débordait de l'écran → la rangée **glisse horizontalement** pour garder la
   tuile sélectionnée visible, avec une réserve de fin de piste contre l'overscan.
2. Le symbole d'extinction s'affichait en carré vide (glyphe absent de la police) →
   les symboles système passent en **SVG dessiné**.

**Jellyfin branché.** Serveur `media-stack`, Jellyfin 12.1.0 sur
`http://192.168.1.150:8096`, latence 4,6 ms en Wi-Fi. Chaîne vérifiée de bout en bout :
accueil → tuile → ouverture sur le téléviseur, pilotée au clavier virtuel.

> Pour la connexion sans clavier : Jellyfin propose **« Connexion rapide »** — un code à
> six chiffres s'affiche sur la TV et se valide depuis un appareil déjà connecté.

**Limite connue :** aucun retour à l'accueil. Une fois une application ouverte, le code
du shell ne tourne plus. Le retour passera par le CDP, donc par le backend.

---

### 📦 Récapitulatif des services

| Service | Rôle | Au démarrage |
|---|---|---|
| `nucflix-kiosk` | `cage` + Chrome plein écran | ❌ `disabled` |
| `ydotoold` | Clavier virtuel | ❌ `disabled` |
| `nucflix-web` | Pages du shell sur `127.0.0.1:8080` | ❌ `disabled` |
| `ufw` | Pare-feu | ✅ `enabled` |

> ⚠️ **Au redémarrage, l'écran reste noir** tant que les trois premiers ne sont pas activés.

---

### ❌ Pas encore fait

La liste complète et priorisée est dans [**RESTE-A-FAIRE.md**](RESTE-A-FAIRE.md).

En résumé : le démarrage automatique et les correctifs de boot (un seul redémarrage
suffirait pour les valider), le backend et la télécommande, puis le durcissement SSH —
**délibérément reporté** tant que l'affichage n'est pas autonome au démarrage.

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
sudo systemctl stop nucflix-kiosk ydotoold nucflix-web
sudo rm /etc/systemd/system/nucflix-kiosk.service /etc/systemd/system/ydotoold.service \
       /etc/systemd/system/nucflix-web.service
sudo systemctl daemon-reload
sudo userdel -r nucflix
sudo rm -rf /opt/nucflix /usr/local/bin/nucflix-browser /etc/modules-load.d/uinput.conf
sudo timedatectl set-timezone Etc/UTC
```
Les paquets installés peuvent rester sans inconvénient.
