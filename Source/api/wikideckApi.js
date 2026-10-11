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


const STAFF_USERS_MAX_PAGES = 50;

const staff = {
	bugReports: (query) => get('/staff/bug-reports', query),
	reports: (query) => get('/staff/reports', query),
	users: (query) => get('/staff/users', query),
	audit: (query) => get('/staff/audit', query),

	async allUsers() {
		const users = [];
		for (let page = 1; page <= STAFF_USERS_MAX_PAGES; page++) {
			const result = await get('/staff/users', { page });
			users.push(...(result?.users ?? []));
			if (page >= (result?.totalPages ?? 1)) break;
		}
		return users;
	},

	async findByDiscordId(discordId) {
		for (let page = 1; page <= STAFF_USERS_MAX_PAGES; page++) {
			const result = await get('/staff/users', { page });
			const match = (result?.users ?? []).find((user) => user.discordId === discordId);
			if (match) return match;
			if (page >= (result?.totalPages ?? 1)) break;
		}
		return null;
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

module.exports = { WikideckApiError, get, post, put, patch, del, staff, players, market };
