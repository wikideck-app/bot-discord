const DEFAULT_BASE_URL = 'https://api.wikideck.app/v1';
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RETRY_AFTER_S = 30;

class WikideckApiError extends Error {
	constructor(status, code, path) {
		super(`Wikideck API ${status} (${code}) sur ${path}`);
		this.name = 'WikideckApiError';
		this.status = status;
		this.code = code;
		this.path = path;
	}
}

function buildUrl(path, query) {
	const base = (process.env.API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
	const url = new URL(`${base}${path}`);
	for (const [key, value] of Object.entries(query ?? {})) {
		if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
	}
	return url;
}


async function readError(response) {
	const body = await response.json().catch(() => null);
	return body?.error ?? 'unknown';
}

async function request(method, path, { query, body } = {}, canRetry = true) {
	const apiKey = process.env.API_KEY;
	if (!apiKey) throw new Error('API_KEY n\'est pas défini dans le fichier .env.');

	const response = await fetch(buildUrl(path, query), {
		method,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			Accept: 'application/json',
			...(body !== undefined && { 'Content-Type': 'application/json' }),
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	// on réessaie une seule fois si l'attente est raisonnable
	if (response.status === 429 && canRetry) {
		const { retryAfter } = await response.json().catch(() => ({}));
		if (Number.isFinite(retryAfter) && retryAfter <= MAX_RETRY_AFTER_S) {
			await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
			return request(method, path, { query, body }, false);
		}
		throw new WikideckApiError(429, 'rate_limited', path);
	}

	if (!response.ok) throw new WikideckApiError(response.status, await readError(response), path);
	return response.status === 204 ? null : response.json();
}

const get = (path, query) => request('GET', path, { query });
const post = (path, body) => request('POST', path, { body });
const put = (path, body) => request('PUT', path, { body });
const patch = (path, body) => request('PATCH', path, { body });
const del = (path) => request('DELETE', path);


const MAX_CURSOR_PAGES = 50;

async function getAllPages(path, key, limit) {
	const items = [];
	let after;
	for (let page = 0; page < MAX_CURSOR_PAGES; page++) {
		const result = await get(path, { limit, after });
		items.push(...(result?.[key] ?? []));
		after = result?.next;
		if (!after) break;
	}
	return items;
}

const staff = {
	bugReports: (query) => get('/staff/bug-reports', query),
	reports: (query) => get('/staff/reports', query),
	users: (query) => get('/staff/users', query),
	audit: (query) => get('/staff/audit', query),

	allUsers: () => getAllPages('/staff/users/sync', 'users', 500),
	allWishlists: () => getAllPages('/staff/wishlists', 'wishlists', 200),

	async findByDiscordId(discordId) {
		const result = await get('/staff/users', { q: discordId });
		return (result?.users ?? []).find((user) => user.discordId === discordId) ?? null;
	},

	async wishlist(discordId) {
		const result = await get('/staff/wishlists', { discordId });
		return result?.wishlists?.[0]?.cards ?? [];
	},
};

const players = {
	profile: (id) => get(`/players/${id}/profile`),
};

const MARKET_MAX_PAGES = 10;

const market = {
	list: (query) => get('/market', query),
	get: (id) => get(`/market/${id}`),

	async listAll({ maxPages = MARKET_MAX_PAGES, ...query } = {}) {
		const auctions = [];
		for (let page = 1; page <= maxPages; page++) {
			const result = await get('/market', { ...query, page });
			auctions.push(...(result?.auctions ?? []));
			if (page >= (result?.totalPages ?? 1)) break;
		}
		return auctions;
	},

	async findByCardId(cardId) {
		const auctions = await market.listAll({ sort: 'new' });
		return auctions.filter((auction) => auction.card?.id === cardId && auction.status === 'ACTIVE');
	},
};

const ranking = {
	players: (board) => get('/ranking', { board }),
	guilds: () => get('/guild/ranking'),
};

module.exports = { WikideckApiError, get, post, put, patch, del, staff, players, market, ranking };
