import express from 'express';
import mysql from 'mysql2';
import jwt from 'jsonwebtoken';
//import { encrypt } from './encryption.js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
app.use(express.json());

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

app.get("/", (req, res) => res.send("Express on Vercel"));

app.get('/api/combinedList', (req, res) => {
    const queryGroups = 'SELECT group_code FROM groups_TB';
    const queryTeachers = 'SELECT full_name FROM teachers_TB';

    pool.query(queryGroups, (err, groups) => {
        if (err) {
            console.error('Error executing groups query:', err);
            res.status(500).send('Error fetching groups data');
            return;
        }

        pool.query(queryTeachers, (err, teachers) => {
            if (err) {
                console.error('Error executing teachers query:', err);
                res.status(500).send('Error fetching teachers data');
                return;
            }

            const data = {
                groups: groups,
                teachers: teachers
            };

            res.json(data);
        });
    });
});

app.get('/api/getGroup', (req, res) => {
    const groupName = `"${req.query.groupName}"`;
    const semester = req.query.semester;
    const sql = `
    SELECT 
        s.week_number, 
        s.day_number, 
        s.pair_number, 
        c.subject_name,
        s.lesson_type, 
        s.visit_format, 
        a.building,
        a.audience_number,
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(t.full_name, t.post)
            )
            FROM teachers_TB t
            WHERE JSON_CONTAINS(s.teachers_list, CONCAT('"', t.full_name, '"'), '$')
        ) AS teachers_with_post
    FROM 
        schedule_TB s
    JOIN 
        curriculum_TB c ON s.subject_id = c.id
    LEFT JOIN
        audience_TB a ON s.audience = a.id  
    WHERE 
        JSON_CONTAINS(s.groups_list, ?, "$") 
        AND s.semester_number = ?;
  `;
    pool.query(sql, [groupName, semester], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching data');
            return;
        }

        res.json(result);
    });
});

app.get('/api/getTeacher', (req, res) => {
    const teacherName = `"${req.query.teacherName}"`;
    const semester = req.query.semester;
    const sql = `
    SELECT 
        s.week_number, 
        s.day_number, 
        s.pair_number, 
        c.subject_name,
        s.groups_list, 
        s.lesson_type, 
        s.visit_format, 
        a.building,
        a.audience_number
    FROM 
        schedule_TB s
    JOIN 
        curriculum_TB c ON s.subject_id = c.id
    LEFT JOIN
        audience_TB a ON s.audience = a.id  
    WHERE 
        JSON_CONTAINS(s.teachers_list, ?, "$") 
        AND s.semester_number = ?;
  `;
    pool.query(sql, [teacherName, semester], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching data');
            return;
        }

        res.json(result);
    });
});

const JWT_SECRET = 'your_secret_key_here'; // Замініть на ваш секретний ключ
const ENCRYPTION_KEY = '5f4dcc3b5aa765d61d8327deb882cf99'; // Замініть на ваш ключ шифрування

function aesEncrypt(data, key) {
    const iv = Buffer.alloc(16, 0); // Ініціалізаційний вектор (IV)
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
    let encrypted = cipher.update(data, 'utf8', 'binary');
    encrypted += cipher.final('binary');
    return Buffer.from(encrypted, 'binary');
}

app.post('/api/login', async (req, res) => {
    const { login, password } = req.body;

    const query = 'SELECT * FROM admin_list_TB WHERE login = ?';
    pool.query(query, [login], async (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching data');
            return;
        }

        if (results.length === 0) {
            res.status(401).send('Invalid credentials');
            return;
        }

        const user = results[0];
        try {
            const encryptedPassword = aesEncrypt(password, ENCRYPTION_KEY);

            // Перетворення бінарних даних в hex для порівняння
            const encryptedPasswordHex = encryptedPassword.toString('hex');
            const userPasswordHex = user.password.toString('hex');

            if (encryptedPasswordHex === userPasswordHex) {
                try {
                    console.log('Generating JWT token...');
                    const payload = { id: user.id, login: user.login };
                    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
                    console.log('Token generated:', token);

                    res.json({ token });
                } catch (jwtError) {
                    console.error('Error generating JWT token:', jwtError);
                    res.status(500).send(`Error generating JWT token ${jwtError}`);
                }
            } else {
                res.status(401).send(`Invalid credentials. Encrypted password: ${encryptedPasswordHex}, User password: ${userPasswordHex}`);
            }
        } catch (err) {
            console.error('Error during login:', err);
            res.status(500).send('Error during login');
        }
    });
});
export default app;