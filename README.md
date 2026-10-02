# 🍿 Nucflix & Chill

**Un OS Smart TV auto-hébergé, tournant sur un Intel NUC branché en HDMI sur le téléviseur, et piloté depuis le canapé par une télécommande web.**

Pas un clone de Netflix avec son propre catalogue : un véritable **shell de Smart TV** — l'équivalent libre de webOS (LG), Tizen (Samsung) ou Google TV. Un écran d'accueil plein écran, une navigation au pavé directionnel, et des applications qu'on lance depuis des rangées de tuiles.

Contrôle total, aucune restriction d'écosystème, aucun téléviseur qui décide à ta place.

---

## 🎯 Le principe

```
┌─────────────────────────────┐          ┌──────────────────────────┐
│   NUC (Ubuntu Server)       │          │   Smartphone             │
│                             │          │                          │
│   Compositeur Wayland       │          │   Télécommande (PWA)     │
│    └─ Navigateur kiosque    │          │    ▲ ▼ ◀ ▶  OK  ⏯  🔊   │
│        ├─ Shell Nucflix     │          │                          │
│        ├─ Jellyfin          │          └───────────┬──────────────┘
│        ├─ YouTube TV        │                      │ Wi-Fi local
│        └─ Netflix / Prime…  │                      │ (Socket.io)
│                             │          ┌───────────▼──────────────┐
│   Backend système (Node)    │◀─────────│   Réseau local uniquement│
│    └─ injection clavier     │          └──────────────────────────┘
│       au niveau noyau       │
└──────────┬──────────────────┘
           │ HDMI
     ┌─────▼─────┐
     │ Téléviseur│  1080p
     └───────────┘
```

Le point clé de la conception : la télécommande **n'envoie pas des commandes à une page web**, elle fait injecter de vrais événements clavier au niveau du noyau. Conséquence directe — elle pilote indifféremment le shell maison, Jellyfin, YouTube ou Netflix, sans qu'aucune de ces applications ait à être consciente de son existence.

---

## 📺 Les applications

| Application | Intégration | Qualité | Décodage |
|---|---|---|---|
| **Jellyfin** | Serveur personnel sur le réseau local — intégration libre | **1080p** | Matériel (VAAPI) |
| **YouTube** | Interface TV native (`youtube.com/tv`), conçue pour télécommande | **1080p** | Matériel — codec à forcer en VP9/H.264 |
| **Twitch** | Web, plein écran | **1080p** | Matériel |
| **Netflix / Disney+ / Prime Video** | Lancés en fenêtre séparée (ces sites refusent l'intégration) | 720p — voir ci-dessous | Logiciel |

---

## ⚠️ Contraintes assumées

Trois limites sont **structurelles** et non négociables. Elles sont documentées ici pour éviter de perdre du temps à chercher des réglages qui n'existent pas.

**Netflix, Disney+ et Prime Video plafonnent à 720p.** Ces services utilisent le DRM Widevine, dont seul le niveau logiciel **L3** est disponible sur Linux. Les niveaux débloquant la 1080p exigent un environnement certifié (Edge sur Windows, Safari sur macOS, ou un boîtier dédié). À noter : Netflix limite d'ailleurs Chrome et Firefox à 720p **sur tous les systèmes d'exploitation**, Windows compris — ce n'est donc pas une limite du NUC. Toutes les autres sources sont en 1080p natif.

**Pas de décodage AV1.** Le GPU Apollo Lake est antérieur à l'AV1. YouTube le sert pourtant par défaut, et un repli en décodage logiciel saccaderait sur un Celeron J3455. Il faut forcer VP9 ou H.264 côté navigateur.

**Pas de HDMI-CEC.** Le port HDMI du NUC6CAYH passe par un pont LSPCON et le bus CEC n'est pas exposé par le noyau (aucun `/dev/cec*`). Le NUC ne peut donc ni allumer ni éteindre le téléviseur. Un adaptateur USB-CEC serait nécessaire pour cette fonction.

Le détail matériel complet est dans l'[**audit du NUC**](docs/AUDIT-NUC.md).

---

## 🏗️ Architecture

Dépôt en **monorepo pnpm**, découpé en trois applications et une couche système :

| Paquet | Rôle |
|---|---|
| `apps/tv-shell` | L'interface affichée sur le téléviseur. Lanceur, rangées de tuiles, navigation spatiale, barre d'état. |
| `apps/mobile-remote` | La télécommande. PWA accessible depuis le réseau local sur smartphone. |
| `apps/system-backend` | Le cerveau. Transport temps réel entre la télécommande et la TV, injection d'événements clavier, commandes système (volume, veille, extinction), cycle de vie des applications. |
| `packages/*` | Code partagé : protocole de commandes, types, catalogue d'applications. |

Les décisions d'architecture, le découpage en sous-projets et les points encore ouverts sont détaillés dans [**docs/ARCHITECTURE.md**](docs/ARCHITECTURE.md).

---

## 🚀 Stack technique

| Couche | Choix |
|---|---|
| **Système** | Ubuntu Server 26.04 LTS, sans environnement de bureau |
| **Affichage** | Compositeur Wayland en kiosque (`cage`) |
| **Navigateur** | Google Chrome — requis pour Widevine, absent de Chromium |
| **Décodage** | VAAPI sur Intel HD Graphics 500 |
| **Entrées** | Injection d'événements via `uinput` (périphérique clavier virtuel) |
| **Shell TV** | React, Tailwind CSS, Norigin Spatial Navigation |
| **Télécommande** | PWA React |
| **Temps réel** | Socket.io |
| **Supervision** | Services `systemd` |

---

## 🗺️ Feuille de route

Le projet est découpé en quatre sous-projets séquentiels. Chacun possède sa propre spécification, son plan d'implémentation et son cycle de développement.

| # | Sous-projet | Objet | État |
|---|---|---|---|
| **1** | **Socle système** | Transformer Ubuntu Server en appliance TV : correctifs de l'audit, kiosque Wayland, autologin, VAAPI, audio HDMI, injection clavier, réseau, pare-feu, services systemd | 🟡 En conception |
| **2** | **Shell TV** | Le lanceur et son design : tuiles, navigation spatiale, focus, zone sûre overscan, typographie 10-foot | ⚪ À faire |
| **3** | **Télécommande** | PWA, protocole temps réel, pavé directionnel, contrôles de lecture | ⚪ À faire |
| **4** | **Intégration des apps** | Jellyfin, YouTube TV, Twitch, lancement et retour des applications DRM | ⚪ À faire |

**Critère de succès du sous-projet 1** — le seul qui compte pour l'instant :
> J'allume le NUC. Quinze secondes plus tard, une page web s'affiche sur le téléviseur. Une touche envoyée depuis le réseau la fait réagir.

---

## 📋 Documentation

| Document | Contenu |
|---|---|
| [**Audit matériel & système du NUC**](docs/AUDIT-NUC.md) | État des lieux de la machine cible : matériel, affichage, audio, réseau, problèmes bloquants et correctifs |
| [**Architecture**](docs/ARCHITECTURE.md) | Décisions de conception, découpage en sous-projets, points ouverts |

---

## 🛠️ Déploiement

Le provisionnement du NUC (dépendances système, kiosque, services systemd) relève du sous-projet 1 et sera scripté et versionné.

Jellyfin tourne sur une **machine séparée** du réseau local : le NUC est un pur client d'affichage, et dispose donc de la totalité de ses ressources pour le shell et la lecture.

---

## 📄 État du projet

🚧 **En conception.** Aucune application n'est encore implémentée. Le travail en cours porte sur la spécification du socle système.
