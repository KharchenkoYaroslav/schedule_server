const express = require('express');
const mysql = require('mysql2/promise');

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

app.get('/api/groupsList', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT group_code FROM groups_TB');
        res.json(rows);
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error fetching data');
    }
});

app.get('/api/teachersList', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT full_name FROM teachers_TB');
        res.json(rows);
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
                JSON_OBJECT('full_name', t.full_name, 'post', t.post)
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
        const [rows] = await pool.query(sql, [groupName, semester]);
        res.json(rows);
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
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT('group_code', g.group_code)
            )
            FROM groups_TB g
            WHERE JSON_CONTAINS(s.groups_list, CONCAT('"', g.group_code, '"'), '$')
        ) AS groups_list, 
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
        const [rows] = await pool.query(sql, [teacherName, semester]);
        res.json(rows);
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error fetching data');
    }
});

module.exports = app;