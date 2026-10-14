const { createCanvas } = require('@napi-rs/canvas');
require('./fonts.js');
const { t } = require('./i18n.js');

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

async function generatePatchNoteBanner({ target, title, version }) {
	const accent = ACCENTS[target] ?? ACCENTS.site;
	const canvas = createCanvas(WIDTH, HEIGHT);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = BACKGROUND;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);
	drawDecor(ctx, accent);

	ctx.textBaseline = 'alphabetic';
	setFont(ctx, 26, 800);
	ctx.fillStyle = accent;
	ctx.fillText(t('patchnote.banner.label', undefined, { target: t(`patchnote.target.${target}`).toUpperCase() }), MARGIN, 104);

	setFont(ctx, 68, 800);
	ctx.fillStyle = '#ffffff';
	const lines = wrapTitle(ctx, title, 780, 2);
	lines.forEach((line, index) => ctx.fillText(line, MARGIN, 190 + index * 78));

	if (version) {
		setFont(ctx, 26, 700);
		const pillWidth = ctx.measureText(version).width + 40;
		const pillY = 190 + lines.length * 78 - 30;
		ctx.beginPath();
		ctx.roundRect(MARGIN, pillY, pillWidth, 46, 23);
		ctx.fillStyle = withAlpha(accent, 0.14);
		ctx.fill();
		ctx.strokeStyle = accent;
		ctx.lineWidth = 2.5;
		ctx.stroke();
		ctx.fillStyle = accent;
		ctx.textBaseline = 'middle';
		ctx.fillText(version, MARGIN + 20, pillY + 24);
		ctx.textBaseline = 'alphabetic';
	}

	setFont(ctx, 30, 800);
	ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
	ctx.textAlign = 'right';
	ctx.fillText('Wikideck', WIDTH - 56, HEIGHT - 44);

	return canvas.encode('png');
}

module.exports = { generatePatchNoteBanner };
