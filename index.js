import express from 'express';
import mysql from 'mysql2';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import crypto from 'crypto';
import cors from 'cors'; // Імпортуємо пакет cors

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors()); // Додаємо middleware для CORS

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

const JWT_SECRET = process.env.SECRET; 

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

app.post('/api/login', async (req, res) => {
    const { login, password } = req.body;

    const query = 'SELECT * FROM admin_list_TB WHERE login = ?';
    pool.query(query, [login], async (err, results) => {
        if (err) {
            console.error('Помилка виконання запиту:', err);
            res.status(500).send('Помилка отримання даних');
            return;
        }

        if (results.length === 0) {
            res.status(401).send('Невірні данні');
            return;
        }

        const user = results[0];
        const passwordHash = hashPassword(password);

        if (passwordHash === user.password_hash) {
            try {
                console.log('Генерація JWT токена...');
                const payload = { id: user.id, login: user.login };
                const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
                console.log('Токен згенеровано:', token);

                res.json({ token });
            } catch (jwtError) {
                console.error('Помилка генерації JWT токена:', jwtError);
                res.status(500).send(`Помилка генерації JWT токена ${jwtError}`);
            }
        } else {
            res.status(401).send('Невірні данні');
        }
    });
});

app.post('/api/getAdminName', async (req, res) => {
    const { login } = req.body;

    const query = 'SELECT login FROM admin_list_TB WHERE login = ?';
    pool.query(query, [login], (err, results) => {
        if (err) {
            console.error('Помилка виконання запиту:', err);
            res.status(500).send('Помилка отримання даних');
            return;
        }

        if (results.length === 0) {
            console.error('Адміністратор не знайдений:', login);
            res.status(404).send('Адміністратор не знайдений');
            return;
        }

        const adminName = results[0].login;
        res.json({ full_name: adminName });
    });
});

export default app;