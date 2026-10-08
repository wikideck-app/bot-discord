const mysql = require('mysql2/promise');

const pool = mysql.createPool({
	host: process.env.DB_HOST || 'localhost',
	port: Number(process.env.DB_PORT) || 3306,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	waitForConnections: true,
	connectionLimit: 10,
});

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
	await pool.query(`
		CREATE TABLE IF NOT EXISTS staff_alert (
			kind VARCHAR(50) NOT NULL,
			external_id VARCHAR(255) NOT NULL,
			PRIMARY KEY (kind, external_id)
		);
	`);
}

module.exports = { pool, initDatabase };
