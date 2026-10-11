const path = require('node:path');
const { GlobalFonts } = require('@napi-rs/canvas');

const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');

// Les familles génériques ('sans-serif', 'serif') ne résolvent vers aucune police sur un serveur
// Linux sans fontconfig : le texte se dessinait alors silencieusement (aucune erreur, juste rien
// à l'écran). On embarque donc nos propres polices (licence OFL) et on les enregistre explicitement
// auprès de Skia, pour que le rendu soit identique quel que soit l'environnement d'exécution.
const SANS_FONT = 'WikiDeck Sans';
const SERIF_FONT = 'WikiDeck Serif';

GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Roboto.ttf'), SANS_FONT);
GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'PTSerif-Regular.ttf'), SERIF_FONT);

module.exports = { SANS_FONT, SERIF_FONT };
