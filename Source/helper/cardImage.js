const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('node:fs');
const path = require('node:path');

// polices embarquées : les serveurs Linux n'ont souvent aucune police installée
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');
GlobalFonts.register(fs.readFileSync(path.join(FONTS_DIR, 'Outfit.ttf')), 'Outfit');
GlobalFonts.register(fs.readFileSync(path.join(FONTS_DIR, 'Newsreader.ttf')), 'Newsreader');

// dimensions de la charte graphique, rendues en x3
const SCALE = 3;
const MARGIN = 10;
const CARD = { width: 250, height: 370, radius: 24 };
const PADDING = 12;
const CONTENT_WIDTH = CARD.width - PADDING * 2;

const ZONES = {
	header: { y: 14, height: 20 },
	image: { x: PADDING, y: 42, width: CONTENT_WIDTH, height: 150, radius: 16 },
	extract: { x: 14, y: 204, width: 222, lineHeight: 16.9, bottom: 316, bottomWithoutFooter: 356 },
	footer: { ruleY: 326, textY: 345 },
};

const RARITIES = {
	COMMON: { label: 'C', background: ['#e9e9ee', '#c9cad3'], color: '#b9bac6', accent: '#555555', light: true, glow: false },
	UNCOMMON: { label: 'PC', background: ['#f2faf2', '#cfe8cf'], color: '#4caf50', accent: '#2e8b3a', light: true },
	RARE: { label: 'R', background: ['#eaf2ff', '#b6cdf5'], color: '#3b7be0', accent: '#2a63c4', light: true },
	SUPER_RARE: { label: 'SR', background: ['#2a1646', '#5a2a96'], color: '#a65cf0', accent: '#8b3fe0', sheen: ['#ffffff'] },
	ULTRA_RARE: { label: 'UR', background: ['#2b0a1c', '#7a1038'], color: '#ff4d7d', accent: '#e0215a', sheen: ['#ffc2d4'] },
	LEGENDARY: { label: 'L', background: ['#3a2a06', '#a77a12'], color: '#ffd35c', accent: '#d99a00', sheen: ['#ffe9a8'], borderWidth: 3, sparkles: true },
	MYTHIC: { label: 'M', background: ['#15122c', '#0a0917'], color: '#e9c46a', accent: '#e9c46a', sheen: ['#e9c46a', '#c084fc', '#ff8fb1'], contours: true },
};
const UNKNOWN_RARITY = { label: '?', background: ['#2b2b33', '#16161c'], color: '#8a8a99', accent: '#6b6b7a' };

const CREDIT_TEXT = 'Wikipédia · CC BY-SA';
const IMAGE_TIMEOUT_MS = 8000;

function rarityStyle(rarity) {
	return { borderWidth: 2, glow: true, light: false, ...(RARITIES[rarity] ?? UNKNOWN_RARITY) };
}

function mixColors(color, other, weight) {
	const channels = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
	const [a, b] = [channels(color), channels(other)];
	return `rgb(${a.map((value, index) => Math.round(value * weight + b[index] * (1 - weight))).join(', ')})`;
}

function withAlpha(color, alpha) {
	const [r, g, b] = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function setFont(ctx, family, size, weight) {
	ctx.font = `${size}px "${family}"`;
	ctx.fontVariationSettings = `"wght" ${weight}`;
}

function fitText(ctx, text, maxWidth) {
	if (ctx.measureText(text).width <= maxWidth) return text;
	let fitted = text;
	while (fitted.length > 1 && ctx.measureText(`${fitted}…`).width > maxWidth) fitted = fitted.slice(0, -1);
	return `${fitted.trimEnd()}…`;
}

function wrapText(ctx, text, maxWidth) {
	const lines = [];
	let line = '';
	for (const word of text.split(/\s+/).filter(Boolean)) {
		const candidate = line ? `${line} ${word}` : word;
		if (line && ctx.measureText(candidate).width > maxWidth) {
			lines.push(line);
			line = word;
		} else {
			line = candidate;
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

function cardPath(ctx) {
	ctx.beginPath();
	ctx.roundRect(0, 0, CARD.width, CARD.height, CARD.radius);
}

function drawBody(ctx, rarity) {
	const gradient = ctx.createLinearGradient(0, 0, 0, CARD.height);
	gradient.addColorStop(0, rarity.background[0]);
	gradient.addColorStop(1, rarity.background[1]);

	ctx.save();
	ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
	ctx.shadowBlur = 30 * SCALE;
	ctx.shadowOffsetY = 10 * SCALE;
	ctx.fillStyle = gradient;
	cardPath(ctx);
	ctx.fill();
	ctx.restore();

	if (rarity.glow) {
		ctx.save();
		ctx.shadowColor = withAlpha(rarity.color, 0.6);
		ctx.shadowBlur = 18 * SCALE;
		ctx.fillStyle = gradient;
		cardPath(ctx);
		ctx.fill();
		ctx.restore();
	}
}

function drawSheen(ctx, colors) {
	ctx.save();
	cardPath(ctx);
	ctx.clip();
	colors.forEach((color, index) => {
		const center = 0.48 + index * 0.1;
		const band = ctx.createLinearGradient(0, 0, CARD.width, CARD.height);
		band.addColorStop(center - 0.07, withAlpha(color, 0));
		band.addColorStop(center, withAlpha(color, 0.2));
		band.addColorStop(center + 0.07, withAlpha(color, 0));
		ctx.fillStyle = band;
		ctx.fillRect(0, 0, CARD.width, CARD.height);
	});
	ctx.restore();
}

function drawContours(ctx, color) {
	ctx.save();
	cardPath(ctx);
	ctx.clip();
	ctx.strokeStyle = withAlpha(color, 0.35);
	ctx.lineWidth = 0.7;
	for (let ring = 0; ring < 8; ring++) {
		ctx.beginPath();
		ctx.ellipse(200, 318, 12 + ring * 14, 8 + ring * 9, -0.35, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.restore();
}

function drawSparkle(ctx, x, y, size) {
	ctx.save();
	ctx.shadowColor = 'rgba(255, 236, 170, 0.9)';
	ctx.shadowBlur = 6 * SCALE;
	ctx.fillStyle = '#fff6d6';
	ctx.beginPath();
	ctx.moveTo(x, y - size);
	ctx.quadraticCurveTo(x, y, x + size, y);
	ctx.quadraticCurveTo(x, y, x, y + size);
	ctx.quadraticCurveTo(x, y, x - size, y);
	ctx.quadraticCurveTo(x, y, x, y - size);
	ctx.fill();
	ctx.restore();
}

function drawBorder(ctx, rarity) {
	const inset = rarity.borderWidth / 2;
	ctx.strokeStyle = rarity.color;
	ctx.lineWidth = rarity.borderWidth;
	ctx.beginPath();
	ctx.roundRect(inset, inset, CARD.width - inset * 2, CARD.height - inset * 2, CARD.radius - inset);
	ctx.stroke();
}

function drawHeader(ctx, rarity, title) {
	const { y, height } = ZONES.header;
	const centerY = y + height / 2;

	setFont(ctx, 'Outfit', 11, 800);
	const badgeWidth = Math.max(height, ctx.measureText(rarity.label).width + 14);
	ctx.beginPath();
	ctx.roundRect(PADDING, y, badgeWidth, height, height / 2);
	const mythic = rarity.label === 'M';
	ctx.fillStyle = mythic ? rarity.background[0] : rarity.accent;
	ctx.fill();
	if (mythic) {
		ctx.strokeStyle = rarity.color;
		ctx.lineWidth = 1.5;
		ctx.stroke();
	}
	ctx.fillStyle = mythic ? rarity.color : '#ffffff';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(rarity.label, PADDING + badgeWidth / 2, centerY + 0.5);

	const titleX = PADDING + badgeWidth + 7;
	const maxWidth = CARD.width - PADDING - titleX;
	let size = 15;
	setFont(ctx, 'Outfit', size, 700);
	while (ctx.measureText(title).width > maxWidth && size > 12) setFont(ctx, 'Outfit', --size, 700);
	ctx.fillStyle = rarity.light ? '#1d1d29' : '#ffffff';
	ctx.textAlign = 'left';
	ctx.fillText(fitText(ctx, title, maxWidth), titleX, centerY + 0.5);
}

function drawCover(ctx, image, zone) {
	const scale = Math.max(zone.width / image.width, zone.height / image.height);
	const width = image.width * scale;
	const height = image.height * scale;
	// les portraits sont recadrés vers le haut pour garder le visage
	const top = height > zone.height ? zone.y - (height - zone.height) * 0.2 : zone.y + (zone.height - height) / 2;
	ctx.drawImage(image, zone.x + (zone.width - width) / 2, top, width, height);
}

async function drawIllustration(ctx, card) {
	const zone = ZONES.image;
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(zone.x, zone.y, zone.width, zone.height, zone.radius);
	ctx.clip();
	const image = await fetchCardImage(card.imageUrl);
	if (image) {
		drawCover(ctx, image, zone);
	} else {
		const placeholder = ctx.createLinearGradient(zone.x, zone.y, zone.x + zone.width, zone.y + zone.height);
		placeholder.addColorStop(0, '#a9bcd6');
		placeholder.addColorStop(1, '#5f7394');
		ctx.fillStyle = placeholder;
		ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
	}
	ctx.restore();

	ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.roundRect(zone.x + 0.5, zone.y + 0.5, zone.width - 1, zone.height - 1, zone.radius - 0.5);
	ctx.stroke();

	if (card.source === 'WIKIPEDIA') {
		ctx.save();
		setFont(ctx, 'Outfit', 8, 600);
		ctx.fillStyle = 'rgba(196, 196, 196, 0.75)';
		ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
		ctx.shadowBlur = 2 * SCALE;
		ctx.textAlign = 'right';
		ctx.textBaseline = 'alphabetic';
		ctx.fillText(CREDIT_TEXT, zone.x + zone.width - 7, zone.y + zone.height - 6);
		ctx.restore();
	}
}

function drawExtract(ctx, rarity, text, bottom) {
	const { x, y, width, lineHeight } = ZONES.extract;
	setFont(ctx, 'Newsreader', 12.5, 400);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	ctx.fillStyle = rarity.light ? '#3d3d4d' : 'rgba(255, 255, 255, 0.82)';

	const lines = wrapText(ctx, text, width);
	const maxLines = Math.floor((bottom - y) / lineHeight);
	const truncated = lines.length > maxLines;
	lines.slice(0, maxLines).forEach((line, index, visible) => {
		const fromEnd = visible.length - 1 - index;
		ctx.globalAlpha = truncated && fromEnd < 2 ? (fromEnd === 0 ? 0.3 : 0.65) : 1;
		ctx.fillText(line, x, y + index * lineHeight);
	});
	ctx.globalAlpha = 1;
}

function drawFooter(ctx, rarity, label) {
	const { ruleY, textY } = ZONES.footer;
	ctx.strokeStyle = rarity.light ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.16)';
	ctx.lineWidth = 0.75;
	ctx.beginPath();
	ctx.moveTo(14, ruleY);
	ctx.lineTo(CARD.width - 14, ruleY);
	ctx.stroke();

	setFont(ctx, 'Outfit', 11, 700);
	ctx.fillStyle = rarity.light ? rarity.accent : mixColors(rarity.accent, '#ffffff', 0.5);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(fitText(ctx, label, CARD.width - 28), CARD.width / 2, textY);
}

async function generateCardImage(card) {
	const canvas = createCanvas((CARD.width + MARGIN * 2) * SCALE, (CARD.height + MARGIN * 2) * SCALE);
	const ctx = canvas.getContext('2d');
	ctx.scale(SCALE, SCALE);
	ctx.translate(MARGIN, MARGIN);

	const rarity = rarityStyle(card.rarity);
	const animeName = card.source === 'ANILIST' ? card.description : null;

	drawBody(ctx, rarity);
	if (rarity.sheen) drawSheen(ctx, rarity.sheen);
	if (rarity.contours) drawContours(ctx, rarity.color);
	drawBorder(ctx, rarity);
	drawHeader(ctx, rarity, String(card.title ?? ''));
	await drawIllustration(ctx, card);
	drawExtract(ctx, rarity, String(card.extract ?? ''), animeName ? ZONES.extract.bottom : ZONES.extract.bottomWithoutFooter);
	if (animeName) drawFooter(ctx, rarity, animeName);
	if (rarity.sparkles) {
		drawSparkle(ctx, 236, 200, 5);
		drawSparkle(ctx, 16, 318, 4);
	}

	return canvas.encode('png');
}

module.exports = { generateCardImage, rarityStyle };
