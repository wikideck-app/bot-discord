const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('node:fs');
const path = require('node:path');


const TEMPLATE_PATH = path.join(__dirname, '..', 'assets', 'card-template.png');
const DEFAULT_SIZE = { width: 680, height: 960 };

const ZONES = {
	// pastille de rareté
	badge: { x: 58, y: 66, width: 64, height: 36, font: 'bold 22px sans-serif', textColor: '#ffffff' },
	// titre de la carte, la taille diminue automatiquement s'il est trop long
	title: { x: 138, y: 84, maxWidth: 484, fontSize: 34, minFontSize: 20, fontFamily: 'sans-serif', color: '#ffffff' },
	// illustration, recadrée pour remplir la zone
	image: { x: 58, y: 130, width: 564, height: 340, radius: 22 },
	// mention de source en bas à droite de l'illustration (obligation légale)
	credit: { text: 'Wikipédia · CC BY-SA', font: '16px sans-serif', margin: 8 },
	// si le texte est trop long il est tronqué
	description: { x: 64, y: 515, width: 552, height: 335, font: '26px serif', lineHeight: 38, color: '#f3dde6' },
};

// Couleur de la pastille par rareté
const RARITY_COLORS = {
	COMMON: '#8a94a6',
	UNCOMMON: '#3fb97f',
	RARE: '#3b82f6',
	EPIC: '#a855f7',
	LEGENDARY: '#f59e0b',
	ULTRA_RARE: '#ff3d7f',
};
const DEFAULT_COLOR = '#ff3d7f';
const IMAGE_TIMEOUT_MS = 8000;

function rarityLabel(rarity) {
	return String(rarity ?? '?')
		.split('_')
		.map((word) => word[0])
		.join('')
		.toUpperCase();
}

function wrapText(ctx, text, maxWidth) {
	const lines = [];
	let line = '';
	for (const word of text.split(/\s+/).filter(Boolean)) {
		const test = line ? `${line} ${word}` : word;
		if (line && ctx.measureText(test).width > maxWidth) {
			lines.push(line);
			line = word;
		} else {
			line = test;
		}
	}
	if (line) lines.push(line);
	return lines;
}

// Wikimedia refuse les requêtes sans user agent on re télécharge l'image depuis le bot
async function fetchCardImage(url) {
	if (!url) return null;
	try {
		const response = await fetch(url, {
			headers: { 'User-Agent': 'WikiDeckBot/1.0 (https://wikideck.app)' },
			signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
		});
		if (!response.ok) return null;
		return await loadImage(Buffer.from(await response.arrayBuffer()));
	} catch {
		return null;
	}
}

function drawCover(ctx, image, zone) {
	const scale = Math.max(zone.width / image.width, zone.height / image.height);
	const width = image.width * scale;
	const height = image.height * scale;
	ctx.drawImage(image, zone.x + (zone.width - width) / 2, zone.y + (zone.height - height) / 2, width, height);
}

/**
 * Template par défaut.
 * Sert à (re)générer l'image du template ; pour changer le design.
 */
function renderDefaultTemplate() {
	const { width, height } = DEFAULT_SIZE;
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');
	const frame = { x: 30, y: 30, width: width - 60, height: height - 60, radius: 38 };

	ctx.fillStyle = '#0b0c14';
	ctx.fillRect(0, 0, width, height);

	const gradient = ctx.createLinearGradient(0, frame.y, 0, frame.y + frame.height);
	gradient.addColorStop(0, '#5c1233');
	gradient.addColorStop(1, '#3a0b22');
	ctx.save();
	ctx.shadowColor = DEFAULT_COLOR;
	ctx.shadowBlur = 40;
	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius);
	ctx.fill();
	ctx.restore();

	ctx.lineWidth = 3;
	ctx.strokeStyle = DEFAULT_COLOR;
	ctx.beginPath();
	ctx.roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius);
	ctx.stroke();

	ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(frame.x + 28, frame.y + frame.height - 30);
	ctx.lineTo(frame.x + frame.width - 28, frame.y + frame.height - 30);
	ctx.stroke();

	return canvas.encode('png');
}

async function generateCardImage(card) {
	const template = await loadImage(fs.existsSync(TEMPLATE_PATH) ? TEMPLATE_PATH : await renderDefaultTemplate());
	const canvas = createCanvas(template.width, template.height);
	const ctx = canvas.getContext('2d');
	ctx.drawImage(template, 0, 0);

	const { badge, title: titleZone, image: imageZone, credit, description } = ZONES;
	ctx.textBaseline = 'middle';

	// Badge de rareté
	ctx.fillStyle = RARITY_COLORS[card.rarity] ?? DEFAULT_COLOR;
	ctx.beginPath();
	ctx.roundRect(badge.x, badge.y, badge.width, badge.height, badge.height / 2);
	ctx.fill();
	ctx.fillStyle = badge.textColor;
	ctx.font = badge.font;
	ctx.textAlign = 'center';
	ctx.fillText(rarityLabel(card.rarity), badge.x + badge.width / 2, badge.y + badge.height / 2 + 1);

	// Titre
	let title = String(card.title ?? '');
	let size = titleZone.fontSize;
	ctx.font = `bold ${size}px ${titleZone.fontFamily}`;
	while (ctx.measureText(title).width > titleZone.maxWidth && size > titleZone.minFontSize) {
		size -= 1;
		ctx.font = `bold ${size}px ${titleZone.fontFamily}`;
	}
	while (ctx.measureText(title).width > titleZone.maxWidth && title.length > 1) {
		title = `${title.slice(0, -2)}…`;
	}
	ctx.fillStyle = titleZone.color;
	ctx.textAlign = 'left';
	ctx.fillText(title, titleZone.x, titleZone.y + 1);

	// Illustration
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(imageZone.x, imageZone.y, imageZone.width, imageZone.height, imageZone.radius);
	ctx.clip();
	const image = await fetchCardImage(card.imageUrl);
	if (image) {
		drawCover(ctx, image, imageZone);
	} else {
		ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
		ctx.fillRect(imageZone.x, imageZone.y, imageZone.width, imageZone.height);
	}
	ctx.restore();

	if (credit && card.source === 'WIKIPEDIA') {
		ctx.font = credit.font;
		const creditWidth = ctx.measureText(credit.text).width + 20;
		const creditX = imageZone.x + imageZone.width - creditWidth - credit.margin;
		const creditY = imageZone.y + imageZone.height - 26 - credit.margin;
		ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
		ctx.beginPath();
		ctx.roundRect(creditX, creditY, creditWidth, 26, 8);
		ctx.fill();
		ctx.fillStyle = '#ffffff';
		ctx.textAlign = 'center';
		ctx.fillText(credit.text, creditX + creditWidth / 2, creditY + 14);
	}

	// Description
	ctx.font = description.font;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	const lines = wrapText(ctx, String(card.extract ?? card.description ?? ''), description.width);
	const maxLines = Math.floor(description.height / description.lineHeight);
	const truncated = lines.length > maxLines;
	ctx.fillStyle = description.color;
	lines.slice(0, maxLines).forEach((line, index, visible) => {
		const fromEnd = visible.length - 1 - index;
		ctx.globalAlpha = truncated && fromEnd < 2 ? (fromEnd === 0 ? 0.3 : 0.6) : 1;
		ctx.fillText(line, description.x, description.y + index * description.lineHeight);
	});
	ctx.globalAlpha = 1;

	return canvas.encode('png');
}

module.exports = { generateCardImage, renderDefaultTemplate };
