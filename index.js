import express from 'express';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import crypto from 'crypto';
import cors from 'cors';
import compression from 'compression';


dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(compression());



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

app.get('/api/combinedList', async (req, res) => {
    try {
        const [groups] = await pool.query('SELECT group_code FROM groups_TB');
        const [teachers] = await pool.query('SELECT full_name FROM teachers_TB');

        res.json({ groups, teachers });
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error fetching data');
    }
});

app.get('/api/getGroup', async (req, res) => {
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
    try {
        const [result] = await pool.query(sql, [groupName, semester]);
        res.json(result);
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error fetching data');
    }
});

app.get('/api/getTeacher', async (req, res) => {
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
    try {
        const [result] = await pool.query(sql, [teacherName, semester]);
        res.json(result);
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error fetching data');
    }
});

const JWT_SECRET = process.env.SECRET;

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

app.post('/api/login', async (req, res) => {
    const { login, password } = req.body;

    try {
        const [results] = await pool.query('SELECT * FROM admin_list_TB WHERE login = ?', [login]);

        if (results.length === 0) {
            res.status(401).send('Невірні данні');
            return;
        }

        const user = results[0];
        const passwordHash = hashPassword(password);

        if (passwordHash === user.password_hash) {
            const payload = { id: user.id, login: user.login };
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
            res.json({ token });
        } else {
            res.status(401).send('Невірні данні');
        }
    } catch (err) {
        console.error('Помилка виконання запиту:', err);
        res.status(500).send('Помилка отримання даних');
    }
});

app.post('/api/getAdminName', async (req, res) => {
    const { login } = req.body;

    try {
        const [results] = await pool.query('SELECT login FROM admin_list_TB WHERE login = ?', [login]);

        if (results.length === 0) {
            res.status(404).send('Адміністратор не знайдений');
            return;
        }

        const adminName = results[0].login;
        res.json({ full_name: adminName });
    } catch (err) {
        console.error('Помилка виконання запиту:', err);
        res.status(500).send('Помилка отримання даних');
    }
});

app.get('/api/groups', async (req, res) => {
    try {
        const [results] = await pool.query('SELECT * FROM groups_TB');
        res.json(results);
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error fetching groups data');
    }
});

app.post('/api/groups', async (req, res) => {
    const { group_code, specialty_id, number_of_students } = req.body;

    try {
        await pool.query('INSERT INTO groups_TB (group_code, specialty_id, number_of_students) VALUES (?, ?, ?)', [group_code, specialty_id, number_of_students]);
        res.status(201).send('Group added successfully');
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error adding group');
    }
});

app.put('/api/groups/:groupCode', async (req, res) => {
    const { groupCode } = req.params;
    const { specialty_id, number_of_students } = req.body;

    try {
        await pool.query('UPDATE groups_TB SET specialty_id = ?, number_of_students = ? WHERE group_code = ?', [specialty_id, number_of_students, groupCode]);
        res.status(200).send('Group updated successfully');
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error updating group');
    }
});

app.delete('/api/groups/:groupCode', async (req, res) => {
    const { groupCode } = req.params;

    try {
        await pool.query('DELETE FROM groups_TB WHERE group_code = ?', [groupCode]);
        res.status(200).send('Group deleted successfully');
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error deleting group');
    }
});

app.get('/api/teachers', async (req, res) => {
    try {
        const [results] = await pool.query('SELECT * FROM teachers_TB');
        res.json(results);
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error fetching teachers data');
    }
});

app.post('/api/teachers', async (req, res) => {
    const { full_name, department, post } = req.body;

    try {
        await pool.query('INSERT INTO teachers_TB (full_name, department, post) VALUES (?, ?, ?)', [full_name, department, post]);
        res.status(201).send('Teacher added successfully');
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error adding teacher');
    }
});

app.put('/api/teachers/:teacherId', async (req, res) => {
    const { teacherId } = req.params;
    const { full_name, department, post } = req.body;

    try {
        await pool.query('UPDATE teachers_TB SET full_name = ?, department = ?, post = ? WHERE id = ?', [full_name, department, post, teacherId]);
        res.status(200).send('Teacher updated successfully');
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error updating teacher');
    }
});

app.delete('/api/teachers/:teacherId', async (req, res) => {
    const { teacherId } = req.params;

    try {
        await pool.query('DELETE FROM teachers_TB WHERE id = ?', [teacherId]);
        res.status(200).send('Teacher deleted successfully');
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error deleting teacher');
    }
});

app.get('/api/specialties', async (req, res) => {
    try {
        const [results] = await pool.query('SELECT * FROM specialty_TB');
        res.json(results);
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error fetching specialties data');
    }
});

app.get('/api/curriculums', async (req, res) => {
    try {
        const [results] = await pool.query('SELECT * FROM curriculum_TB');
        res.json(results);
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error fetching curriculums data');
    }
});

app.post('/api/curriculums', async (req, res) => {
    const { subject_name, related_teachers, related_groups, correspondence } = req.body;

    try {
        const [result] = await pool.query('INSERT INTO curriculum_TB (subject_name, correspondence) VALUES (?, ?)', [subject_name, correspondence]);
        const lastId = result.insertId;

        const teachersArray = related_teachers.map(teacher => `initTeacher(${lastId}, ${teacher.id}, ${teacher.planned_lectures}, ${teacher.planned_practicals}, ${teacher.planned_labs})`).join(', ');
        const groupsArray = related_groups.map(group => `initGroup(${lastId}, '${group.code}', ${group.planned_lectures}, ${group.planned_practicals}, ${group.planned_labs})`).join(', ');

        await pool.query(`UPDATE curriculum_TB SET related_teachers = JSON_ARRAY(${teachersArray}), related_groups = JSON_ARRAY(${groupsArray}) WHERE id = ?`, [lastId]);

        res.status(201).send('Curriculum added successfully');
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error adding curriculum');
    }
});

app.put('/api/curriculums/:curriculumId', async (req, res) => {
    const { curriculumId } = req.params;
    const { subject_name, related_teachers, related_groups, correspondence } = req.body;

    try {
        const teachersArray = related_teachers.map(teacher => `initTeacher(${curriculumId}, ${teacher.id}, ${teacher.planned_lectures}, ${teacher.planned_practicals}, ${teacher.planned_labs})`).join(', ');
        const groupsArray = related_groups.map(group => `initGroup(${curriculumId}, '${group.code}', ${group.planned_lectures}, ${group.planned_practicals}, ${group.planned_labs})`).join(', ');

        await pool.query(`UPDATE curriculum_TB SET subject_name = ?, related_teachers = JSON_ARRAY(${teachersArray}), related_groups = JSON_ARRAY(${groupsArray}), correspondence = ? WHERE id = ?`, [subject_name, correspondence, curriculumId]);

        res.status(200).send('Curriculum updated successfully');
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error updating curriculum');
    }
});

app.delete('/api/curriculums/:curriculumId', async (req, res) => {
    const { curriculumId } = req.params;

    try {
        await pool.query('DELETE FROM curriculum_TB WHERE id = ?', [curriculumId]);
        res.status(200).send('Curriculum deleted successfully');
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error deleting curriculum');
    }
});

export default app;