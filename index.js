const express = require('express');
const mysql = require('mysql2');

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

pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
    connection.release();
});

app.get("/", (req, res) => res.send("Express on Vercel"));

app.get('/api/groupsList', (req, res) => {
    const sql = 'SELECT group_code FROM groups_TB';
    pool.query(sql, (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching data');
            return;
        }
        res.json(result);
    });
});

app.get('/api/teachersList', (req, res) => {
    const sql = 'SELECT full_name FROM teachers_TB';
    pool.query(sql, (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching data');
            return;
        }
        res.json(result);
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

app.listen(5000, () => console.log("Server ready on port 5000."));
module.exports = app;