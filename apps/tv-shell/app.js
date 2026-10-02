/* ===================================================================
   Nucflix & Chill — logique du shell TV
   Trois responsabilites, volontairement separees :
     1. le catalogue d'applications
     2. la navigation spatiale au pave directionnel (+ defilement)
     3. la barre d'etat (heure, reseau)
   =================================================================== */

/* ---------- Symboles dessines ------------------------------------
   En SVG et non en caractere de police : aucune police manquante ne
   peut casser l'affichage, et le rendu reste net a toute taille. */

const T = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICONES = {
  signal:   `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h4l3-8 6 16 3-8h4" ${T}/></svg>`,
  lune:     `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="currentColor"/></svg>`,
  courant:  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9" ${T}/><path d="M6.3 6.3a8 8 0 1 0 11.4 0" ${T}/></svg>`,
};

/* ---------- 1. Catalogue ----------------------------------------- */

/* `config.json` permet de regler les adresses (Jellyfin notamment)
   sans toucher au code. Valeurs de repli si le fichier est absent. */
const DEFAUTS = { jellyfin: null };

function catalogue(cfg) {
  return [
    {
      titre: 'Applications',
      items: [
        { nom:'Jellyfin',    detail:'Ma médiathèque',   mono:'J', couleur:'#00a4dc',
          url: cfg.jellyfin, absent:'Adresse du serveur non configurée' },
        { nom:'YouTube',     detail:'1080p · matériel', mono:'Y', couleur:'#c4302b',
          url:'https://www.youtube.com' },
        { nom:'Twitch',      detail:'Direct',           mono:'T', couleur:'#8d4ee8',
          url:'https://www.twitch.tv' },
        { nom:'Netflix',     detail:'720p · protégé',   mono:'N', couleur:'#b9090b',
          url:'https://www.netflix.com' },
        { nom:'Disney+',     detail:'720p · protégé',   mono:'D', couleur:'#1f2a6d',
          url:'https://www.disneyplus.com' },
        { nom:'Prime Video', detail:'720p · protégé',   mono:'P', couleur:'#00598a',
          url:'https://www.primevideo.com' },
      ],
    },
    {
      titre: 'Système',
      items: [
        { nom:'Diagnostic', detail:'État de la machine', svg:'signal'  , couleur:'#3a4254',
          url:'diagnostic.html' },
        { nom:'Veille',     detail:'Éteindre l’écran',   svg:'lune',     couleur:'#3a4254',
          action:'veille' },
        { nom:'Éteindre',   detail:'Arrêter le NUC',     svg:'courant',  couleur:'#5a2b2b',
          action:'extinction' },
      ],
    },
  ];
}

/* ---------- 2. Rendu, navigation et defilement -------------------- */

const grille = [];           // grille[ligne][colonne] -> element bouton
const pistes = [];           // pistes[ligne] -> { piste, liste }
let ligne = 0, colonne = 0;

function rendre(rangees) {
  const hote = document.getElementById('rangees');
  hote.innerHTML = '';

  rangees.forEach((r, iL) => {
    const section = document.createElement('section');
    section.className = 'rangee';
    section.innerHTML = `<h2 id="r${iL}">${r.titre}</h2>`;

    const piste = document.createElement('div');
    piste.className = 'piste';
    const liste = document.createElement('ul');
    liste.className = 'tuiles';
    liste.setAttribute('aria-labelledby', `r${iL}`);

    grille[iL] = [];
    r.items.forEach((item, iC) => {
      const indisponible = !item.action && !item.url && Boolean(item.absent);
      const b = document.createElement('button');
      b.className = 'tuile';
      b.type = 'button';
      b.setAttribute('aria-disabled', String(indisponible));
      b.innerHTML =
        `<span class="marqueur" style="background:${item.couleur}" aria-hidden="true">${
           item.svg ? ICONES[item.svg] : item.mono}</span>
         <span class="nom">${item.nom}</span>
         <span class="detail">${indisponible ? item.absent : item.detail}</span>`;
      b.addEventListener('click', () => lancer(item, indisponible));

      const li = document.createElement('li');
      li.appendChild(b);
      liste.appendChild(li);
      grille[iL][iC] = b;
    });

    piste.appendChild(liste);
    section.appendChild(piste);
    hote.appendChild(section);
    pistes[iL] = { piste, liste };
  });

  placerFocus(0, 0);
}

/* Fait glisser la rangee pour que la tuile selectionnee reste visible,
   comme sur un televiseur du commerce. */
function faireGlisser(iL) {
  const { piste, liste } = pistes[iL];
  const pad = parseFloat(getComputedStyle(piste).paddingLeft) || 0;
  const visible = piste.clientWidth - pad * 2;
  const avance  = visible * 0.06;                 // on garde un peu d'air a gauche
  const max     = Math.max(0, liste.scrollWidth - visible);
  const decal   = Math.max(0, Math.min(grille[iL][colonne].offsetLeft - avance, max));
  liste.style.transform = `translateX(${-decal}px)`;
}

function placerFocus(l, c) {
  grille.flat().forEach(b => b.classList.remove('focus'));
  ligne   = Math.max(0, Math.min(l, grille.length - 1));
  colonne = Math.max(0, Math.min(c, grille[ligne].length - 1));

  const b = grille[ligne][colonne];
  b.classList.add('focus');
  b.focus({ preventScroll: true });
  faireGlisser(ligne);
}

function lancer(item, indisponible) {
  const voile = document.getElementById('voile');
  const texte = document.getElementById('voile-texte');
  const montrer = (msg, duree) => {
    texte.textContent = msg;
    voile.dataset.visible = 'oui';
    if (duree) setTimeout(() => (voile.dataset.visible = 'non'), duree);
  };

  if (indisponible)  return montrer(`${item.nom} — ${item.absent}`, 2200);
  /* Les actions systeme passeront par le backend (lot 3). */
  if (item.action)   return montrer(`« ${item.nom} » sera relié au backend (lot 3)`, 2200);

  montrer(`Ouverture de ${item.nom}…`);
  setTimeout(() => { window.location.href = item.url; }, 220);
}

document.addEventListener('keydown', e => {
  const touches = {
    ArrowUp:    () => placerFocus(ligne - 1, colonne),
    ArrowDown:  () => placerFocus(ligne + 1, colonne),
    ArrowLeft:  () => placerFocus(ligne, colonne - 1),
    ArrowRight: () => placerFocus(ligne, colonne + 1),
    Enter:      () => grille[ligne][colonne].click(),
  };
  if (touches[e.key]) { e.preventDefault(); touches[e.key](); }
});

addEventListener('resize', () => faireGlisser(ligne));

/* ---------- 3. Barre d'etat --------------------------------------- */

function majEtat() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  document.getElementById('heure').textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
  document.getElementById('date').textContent =
    d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });

  const r = document.getElementById('reseau');
  r.dataset.ok   = navigator.onLine ? 'oui' : 'non';
  r.textContent  = navigator.onLine ? 'Wi-Fi connecté' : 'Hors ligne';
}

/* ---------- Demarrage ---------------------------------------------- */

(async function demarrer() {
  let cfg = DEFAUTS;
  try {
    const r = await fetch('config.json', { cache: 'no-store' });
    if (r.ok) cfg = { ...DEFAUTS, ...(await r.json()) };
  } catch { /* fichier absent : on garde les valeurs de repli */ }

  rendre(catalogue(cfg));
  majEtat();
  setInterval(majEtat, 10000);
})();
