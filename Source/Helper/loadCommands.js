const fs = require('node:fs');
const path = require('node:path');

function getCommandFiles(dir) {
	let files = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files = files.concat(getCommandFiles(fullPath));
		} else if (entry.isFile() && entry.name.endsWith('.js')) {
			files.push(fullPath);
		}
	}
	return files;
}

module.exports = { getCommandFiles };
