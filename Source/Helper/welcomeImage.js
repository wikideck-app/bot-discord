const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('node:path');

const BANNER_PATH = path.join(__dirname, '..', 'Assets', 'welcome-banner.png');
const BANNER_WIDTH = 1500;
const BANNER_HEIGHT = 500;

// Coordonnées mesurées directement sur Source/Assets/welcome-banner.png
const AVATAR = { x: 249.6, y: 249.4, radius: 129 };
const PSEUDO_PILL = { x: 700, y: 120, width: 226, height: 42, radius: 21, fill: '#2d3c75' };

/**
 * Dessine un rectangle aux coins arrondis (pas supporté nativement par le contexte 2D).
 */
function roundRect(ctx, x, y, width, height, radius) {
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.lineTo(x + width - radius, y);
	ctx.arcTo(x + width, y, x + width, y + radius, radius);
	ctx.lineTo(x + width, y + height - radius);
	ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
	ctx.lineTo(x + radius, y + height);
	ctx.arcTo(x, y + height, x, y + height - radius, radius);
	ctx.lineTo(x, y + radius);
	ctx.arcTo(x, y, x + radius, y, radius);
	ctx.closePath();
}

/**
 * Réduit la taille de police jusqu'à ce que le texte tienne dans la largeur disponible.
 */
function fitText(ctx, text, maxWidth, initialSize) {
	let size = initialSize;
	ctx.font = `bold ${size}px sans-serif`;
	while (ctx.measureText(text).width > maxWidth && size > 12) {
		size -= 1;
		ctx.font = `bold ${size}px sans-serif`;
	}
	return size;
}

/**
 * Génère l'image de bienvenue personnalisée (avatar + pseudo insérés dans le template)
 * pour un GuildMember donné. Retourne un Buffer PNG prêt à être envoyé en pièce jointe Discord.
 */
async function generateWelcomeImage(member) {
	const canvas = createCanvas(BANNER_WIDTH, BANNER_HEIGHT);
	const ctx = canvas.getContext('2d');

	const background = await loadImage(BANNER_PATH);
	ctx.drawImage(background, 0, 0, BANNER_WIDTH, BANNER_HEIGHT);

	// Avatar du membre, découpé en cercle, à l'intérieur de l'anneau doré du template
	const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
	const avatar = await loadImage(avatarUrl);
	ctx.save();
	ctx.beginPath();
	ctx.arc(AVATAR.x, AVATAR.y, AVATAR.radius, 0, Math.PI * 2);
	ctx.closePath();
	ctx.clip();
	ctx.drawImage(avatar, AVATAR.x - AVATAR.radius, AVATAR.y - AVATAR.radius, AVATAR.radius * 2, AVATAR.radius * 2);
	ctx.restore();

	// Pseudo du membre, redessiné par-dessus le badge "@pseudo" du template

	const padding = 20;
	const maxTextWidth = PSEUDO_PILL.width - padding;
	let pseudo = `${member.displayName}`;
	const fontSize = fitText(ctx, pseudo, maxTextWidth, 26);
	ctx.font = `bold ${fontSize}px sans-serif`;
	// Si le pseudo est trop long même avec la plus petite police, on le tronque
	while (ctx.measureText(pseudo).width > maxTextWidth && pseudo.length > 1) {
		pseudo = `${pseudo.slice(0, -2)}…`;
	}
	ctx.fillStyle = '#ffffff';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(pseudo, PSEUDO_PILL.x + PSEUDO_PILL.width / 2, PSEUDO_PILL.y + PSEUDO_PILL.height / 2 + 1);

	return canvas.encode('png');
}

module.exports = { generateWelcomeImage };
