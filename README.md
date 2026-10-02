# 🍿 Nucflix & Chill

Un OS Smart TV "Home-made" et Fullstack, conçu pour tourner sur un Intel NUC (J3455) sous Ubuntu Server.
Contrôle total, aucune restriction de l'écosystème, et pilotable depuis le canapé via smartphone.

## 🏗️ Architecture du Projet

Ce dépôt est un monorepo propulsé par **pnpm workspaces**. Il est divisé en trois applications principales :

- 📺 **`tv-frontend`** : L'interface affichée sur la TV (via HDMI). Développée en Next.js, elle tourne en plein écran dans un environnement Wayland Kiosk (`cage`). Optimisée pour la navigation spatiale (au clavier/télécommande).
- 📱 **`mobile-remote`** : La télécommande. Une PWA (Progressive Web App) en React accessible depuis le réseau local sur smartphone pour envoyer des commandes.
- ⚙️ **`system-backend`** : Le cerveau. Un serveur Node.js qui gère la communication en temps réel (Socket.io) entre la télécommande et la TV, et qui exécute les commandes système sur l'hôte Ubuntu (volume, réseau, extinction).

## 🚀 Stack Technique

- **OS Cible** : Ubuntu Server (Kiosk Mode Wayland)
- **Frontend** : Next.js, React, Tailwind CSS
- **Navigation TV** : Norigin Spatial Navigation
- **Temps Réel** : Socket.io
- **Scripts Système** : Bash & Child_process Node.js

## 📋 Documentation

- [**Audit matériel & système du NUC**](docs/AUDIT-NUC.md) — état des lieux de la machine cible (CPU, GPU, affichage, audio, réseau), contraintes techniques identifiées et correctifs prioritaires.

## 🛠️ Déploiement

*L'automatisation du NUC (scripts d'installation des dépendances système, de Docker, de Jellyfin et du service systemd) est gérée dans le dépôt d'infrastructure homelab séparé.*
