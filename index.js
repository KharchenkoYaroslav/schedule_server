import express from 'express';
import mysql from 'mysql2';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import crypto from 'crypto';
import cors from 'cors'; 

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors()); 

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

app.get('/api/groups', (req, res) => {
    const query = 'SELECT * FROM groups_TB';
    pool.query(query, (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching groups data');
            return;
        }
        res.json(results);
    });
});

app.post('/api/groups', (req, res) => {
    const { group_code, specialty_id, number_of_students } = req.body;
    const query = 'INSERT INTO groups_TB (group_code, specialty_id, number_of_students) VALUES (?, ?, ?)';
    pool.query(query, [group_code, specialty_id, number_of_students], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error adding group');
            return;
        }
        res.status(201).send('Group added successfully');
    });
});

app.put('/api/groups/:groupCode', (req, res) => {
    const { groupCode } = req.params;
    const { specialty_id, number_of_students } = req.body;
    const query = 'UPDATE groups_TB SET specialty_id = ?, number_of_students = ? WHERE group_code = ?';
    pool.query(query, [specialty_id, number_of_students, groupCode], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error updating group');
            return;
        }
        res.status(200).send('Group updated successfully');
    });
});

app.delete('/api/groups/:groupCode', (req, res) => {
    const { groupCode } = req.params;
    const query = 'DELETE FROM groups_TB WHERE group_code = ?';
    pool.query(query, [groupCode], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error deleting group');
            return;
        }
        res.status(200).send('Group deleted successfully');
    });
});

app.get('/api/teachers', (req, res) => {
    const query = 'SELECT * FROM teachers_TB';
    pool.query(query, (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching teachers data');
            return;
        }
        res.json(results);
    });
});

app.post('/api/teachers', (req, res) => {
    const { full_name, department, post } = req.body;
    const query = 'INSERT INTO teachers_TB (full_name, department, post) VALUES (?, ?, ?)';
    pool.query(query, [full_name, department, post], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error adding teacher');
            return;
        }
        res.status(201).send('Teacher added successfully');
    });
});

app.put('/api/teachers/:teacherId', (req, res) => {
    const { teacherId } = req.params;
    const { full_name, department, post } = req.body;
    const query = 'UPDATE teachers_TB SET full_name = ?, department = ?, post = ? WHERE id = ?';
    pool.query(query, [full_name, department, post, teacherId], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error updating teacher');
            return;
        }
        res.status(200).send('Teacher updated successfully');
    });
});

app.delete('/api/teachers/:teacherId', (req, res) => {
    const { teacherId } = req.params;
    const query = 'DELETE FROM teachers_TB WHERE id = ?';
    pool.query(query, [teacherId], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error deleting teacher');
            return;
        }
        res.status(200).send('Teacher deleted successfully');
    });
});

app.get('/api/specialties', (req, res) => {
    const query = 'SELECT * FROM specialty_TB';
    pool.query(query, (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching specialties data');
            return;
        }
        res.json(results);
    });
});

app.get('/api/curriculums', async (req, res) => {
    const query = 'SELECT * FROM curriculum_TB';
    pool.query(query, (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching specialties data');
            return;
        }
        res.json(results);
    });
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
        const [result] = await pool.query('DELETE FROM curriculum_TB WHERE id = ?', [curriculumId]);
        
        if (result.affectedRows === 0) {
            return res.status(404).send('Curriculum not found');
        }

        res.status(200).send('Curriculum deleted successfully');
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error deleting curriculum');
    }
});

export default app;