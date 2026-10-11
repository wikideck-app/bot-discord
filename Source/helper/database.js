const mysql = require('mysql2/promise');

const pool = mysql.createPool({
	host: process.env.DB_HOST || 'localhost',
	port: Number(process.env.DB_PORT) || 3306,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	waitForConnections: true,
	connectionLimit: 10,
	// les ID Discord sont trop grands pour un Number
	supportBigNumbers: true,
	bigNumberStrings: true,
});

const USER_ACCOUNT_COLUMNS = [
	{ name: 'wikideck_id', ddl: 'VARCHAR(36) NULL' },
	{ name: 'wikideck_username', ddl: 'VARCHAR(255) NULL' },
	{ name: 'avatar_url', ddl: 'VARCHAR(512) NULL' },
	{ name: 'wikibits', ddl: 'INT NULL' },
	{ name: 'cards', ddl: 'INT NULL' },
	{ name: 'trust', ddl: 'VARCHAR(32) NULL' },
	{ name: 'wikideck_created_at', ddl: 'DATETIME NULL' },
	{ name: 'updated_at', ddl: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
];

async function ensureUserAccountColumns() {
	const [existing] = await pool.query(
		'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
		['User'],
	);
	const existingNames = new Set(existing.map((row) => row.COLUMN_NAME));
	for (const column of USER_ACCOUNT_COLUMNS) {
		if (!existingNames.has(column.name)) {
			await pool.query(`ALTER TABLE \`User\` ADD COLUMN \`${column.name}\` ${column.ddl}`);
		}
	}
}

// Crée les tables si elles n'existent pas encore.
async function initDatabase() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS ticket (
			id INT AUTO_INCREMENT PRIMARY KEY,
			name VARCHAR(255),
			kind VARCHAR(50),
			user_id BIGINT NOT NULL,
			isClosed BOOLEAN NOT NULL DEFAULT FALSE,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS \`User\` (
			id INT AUTO_INCREMENT PRIMARY KEY,
			username VARCHAR(255) NOT NULL,
			locale CHAR(5) NOT NULL DEFAULT 'fr',
			user_id BIGINT NOT NULL,
			isBanned BOOLEAN NOT NULL DEFAULT FALSE,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`);
	await ensureUserAccountColumns();
	await pool.query(`
		CREATE TABLE IF NOT EXISTS staff_alert (
			kind VARCHAR(50) NOT NULL,
			external_id VARCHAR(255) NOT NULL,
			PRIMARY KEY (kind, external_id)
		);
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS market_alert (
			id INT AUTO_INCREMENT PRIMARY KEY,
			username VARCHAR(255) NOT NULL,
			cardId VARCHAR(255) NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS market_watch (
			user_id BIGINT NOT NULL,
			card_id VARCHAR(255) NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (user_id, card_id)
		);
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS market_notified (
			user_id BIGINT NOT NULL,
			auction_id VARCHAR(255) NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (user_id, auction_id)
		);
	`);
	await pool.query(`
		CREATE TABLE IF NOT EXISTS market_subscription (
			user_id BIGINT NOT NULL PRIMARY KEY,
			enabled BOOLEAN NOT NULL DEFAULT TRUE,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`);
}

module.exports = { pool, initDatabase };