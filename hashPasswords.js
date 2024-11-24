require('dotenv').config(); // Завантажте змінні середовища з файлу .env
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function hashPasswords() {
    const query = 'SELECT id, password FROM admin_list_TB';
    pool.query(query, async (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            return;
        }

        for (const user of results) {
            const hashedPassword = await bcrypt.hash(user.password, 10);
            const updateQuery = 'UPDATE admin_list_TB SET password = ? WHERE id = ?';
            pool.query(updateQuery, [hashedPassword, user.id], (err) => {
                if (err) {
                    console.error('Error updating password:', err);
                } else {
                    console.log(`Password for user ${user.id} hashed and updated`);
                }
            });
        }
    });
}

hashPasswords();