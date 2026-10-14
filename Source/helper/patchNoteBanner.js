const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('node:path');
require('./fonts.js');
const { t } = require('./i18n.js');

const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'image', 'logo.webp');
const LOGO_SIZE = 64;
const WIDTH = 1200;
const HEIGHT = 400;
const MARGIN = 72;
const BACKGROUND = '#0e1015';
const ACCENTS = { site: '#e9b442', discord: '#5865f2' };

function withAlpha(color, alpha) {
	const [r, g, b] = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function setFont(ctx, size, weight) {
	ctx.font = `${size}px "Outfit"`;
	ctx.fontVariationSettings = `"wght" ${weight}`;
}

function wrapTitle(ctx, title, maxWidth, maxLines) {
	const lines = [];
	let line = '';
	for (const word of title.split(/\s+/).filter(Boolean)) {
		const candidate = line ? `${line} ${word}` : word;
		if (line && ctx.measureText(candidate).width > maxWidth) {
			lines.push(line);
			line = word;
		} else {
			line = candidate;
		}
	}
	if (line) lines.push(line);
	if (lines.length <= maxLines) return lines;

	const kept = lines.slice(0, maxLines);
	let last = kept[maxLines - 1];
	while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
	kept[maxLines - 1] = `${last.trimEnd()}…`;
	return kept;
}

const measureContext = createCanvas(1, 1).getContext('2d');
const TITLE_SIZES = [{ size: 68, maxLines: 2 }, { size: 58, maxLines: 3 }, { size: 50, maxLines: 3 }];

function layoutTitle(title, maxWidth) {
	for (const { size, maxLines } of TITLE_SIZES) {
		setFont(measureContext, size, 800);
		const lines = wrapTitle(measureContext, title, maxWidth, Infinity);
		if (lines.length <= maxLines) return { size, lines };
	}
	const { size, maxLines } = TITLE_SIZES.at(-1);
	setFont(measureContext, size, 800);
	return { size, lines: wrapTitle(measureContext, title, maxWidth, maxLines) };
}

function drawDecor(ctx, accent) {
	const glow = ctx.createRadialGradient(1010, 70, 0, 1010, 70, 520);
	glow.addColorStop(0, withAlpha(accent, 0.3));
	glow.addColorStop(1, withAlpha(accent, 0));
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	ctx.strokeStyle = withAlpha(accent, 0.35);
	ctx.lineWidth = 2;
	for (let ring = 0; ring < 9; ring++) {
		ctx.beginPath();
		ctx.ellipse(1000, 340, 40 + ring * 44, 26 + ring * 28, -0.35, 0, Math.PI * 2);
		ctx.stroke();
	}
}

function formatVersion(version) {
	const trimmed = String(version ?? '').trim();
	return /^\d/.test(trimmed) ? `v${trimmed}` : trimmed;
}

function drawHeading(ctx, accent, target, title, maxWidth) {
	const label = t('patchnote.banner.label', undefined, { target: t(`patchnote.target.${target}`).toUpperCase() });
	const { size, lines } = layoutTitle(title, maxWidth);
	const lineHeight = Math.round(size * 1.15);
	const top = (HEIGHT - (44 + lines.length * lineHeight)) / 2;

	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	setFont(ctx, 26, 800);
	ctx.fillStyle = accent;
	ctx.fillText(label, MARGIN, top);

	setFont(ctx, size, 800);
	ctx.fillStyle = '#ffffff';
	lines.forEach((line, index) => ctx.fillText(line, MARGIN, top + 44 + index * lineHeight));
}

function drawVersion(ctx, accent, version) {
	let size = 128;
	setFont(ctx, size, 800);
	while (ctx.measureText(version).width > 320 && size > 56) setFont(ctx, --size, 800);
	const top = (HEIGHT - (36 + size)) / 2;

	ctx.textAlign = 'right';
	ctx.textBaseline = 'top';
	ctx.fillStyle = accent;
	ctx.fillText(version, WIDTH - MARGIN, top + 36);

	setFont(ctx, 24, 800);
	ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
	ctx.fillText(t('patchnote.banner.version'), WIDTH - MARGIN, top);
}

async function generatePatchNoteBanner({ target, title, version }) {
	const accent = ACCENTS[target] ?? ACCENTS.site;
	const displayedVersion = formatVersion(version);
	const canvas = createCanvas(WIDTH, HEIGHT);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = BACKGROUND;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);
	drawDecor(ctx, accent);

	drawHeading(ctx, accent, target, title, displayedVersion ? 640 : 900);
	if (displayedVersion) drawVersion(ctx, accent, displayedVersion);

	await drawBrand(ctx);
	return canvas.encode('png');
}

let logo;
async function drawBrand(ctx) {
	logo ??= loadImage(LOGO_PATH);
	const centerY = HEIGHT - 40 - LOGO_SIZE / 2;

	setFont(ctx, 30, 800);
	ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
	ctx.textAlign = 'right';
	ctx.textBaseline = 'middle';
	ctx.fillText('Wikideck', WIDTH - 56, centerY);

	const logoX = WIDTH - 56 - ctx.measureText('Wikideck').width - 12 - LOGO_SIZE;
	ctx.drawImage(await logo, logoX, centerY - LOGO_SIZE / 2, LOGO_SIZE, LOGO_SIZE);
}

module.exports = { generatePatchNoteBanner, formatVersion, layoutTitle };
