const fr = require('../Lang/fr.json');
const en = require('../Lang/en.json');

const locales = { fr, en };
const DEFAULT_LOCALE = 'fr';

/**
 * Traduit une clé dans la langue demandée, avec remplacement de variables {nom}.
 * @param {string} key  text key
 * @param {string} [locale]  lang code
 * @param {Record<string, string>} [vars] var a injecter dans le texte
 * @returns {string} texte traduit ou la clé si on oublie
 */
function t(key, locale = DEFAULT_LOCALE, vars = {}) {
	const dict = locales[locale] ?? locales[DEFAULT_LOCALE];


	let text = dict[key] ?? locales[DEFAULT_LOCALE][key] ?? key;

	for (const [name, value] of Object.entries(vars)) {
		text = text.replaceAll(`{${name}}`, value);
	}

	return text;
}

module.exports = { t };