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


const staff = {
	bugReports: (query) => get('/staff/bug-reports', query),
	reports: (query) => get('/staff/reports', query),
	users: (query) => get('/staff/users', query),
	audit: (query) => get('/staff/audit', query),
};

module.exports = { WikideckApiError, get, post, put, patch, del, staff };
