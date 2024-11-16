const express = require('express');
const mysql = require('mysql');

const app = express();
app.use(express.json());

const allowCors = fn => async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')
    // another common pattern
    // res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    )
    if (req.method === 'OPTIONS') {
      res.status(200).end()
      return
    }
    return await fn(req, res)
  }
  
  const handler = (req, res) => {
    const d = new Date()
    res.end(d.toString())
  }
  
  module.exports = allowCors(handler)


const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

app.get("/", (req, res) => res.send("Express on Vercel"));

app.get('/api/groupsList', (req, res) => {
    const sql = 'SELECT group_code FROM groups_TB';
    db.query(sql, (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching data');
            return;
        }
        res.setHeader('Access-Control-Allow-Origin', 'https://schedule-eosin-two.vercel.app'); // Додайте ваш домен
        res.json(result);
    });
});

app.get('/api/teachersList', (req, res) => {
    const sql = 'SELECT full_name FROM teachers_TB';
    db.query(sql, (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching data');
            return;
        }
        res.setHeader('Access-Control-Allow-Origin', 'https://schedule-eosin-two.vercel.app'); // Додайте ваш домен
        res.json(result);
    });
});

app.get('/api/getGroup', (req, res) => {
    const groupName = req.query.groupName;
    const semester = req.query.semester;

    if (!groupName || !semester) {
        console.error('Missing required parameters: groupName or semester');
        res.status(400).send('Missing required parameters: groupName or semester');
        return;
    }

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
    db.query(sql, [groupName, semester], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching data');
            return;
        }
        res.setHeader('Access-Control-Allow-Origin', 'https://schedule-eosin-two.vercel.app'); // Додайте ваш домен
        res.json(result);
    });
});

app.get('/api/getTeacher', (req, res) => {
    const teacherName = req.query.teacherName;
    const semester = req.query.semester;

    if (!teacherName || !semester) {
        console.error('Missing required parameters: teacherName or semester');
        res.status(400).send('Missing required parameters: teacherName or semester');
        return;
    }

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
    db.query(sql, [teacherName, semester], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching data');
            return;
        }
        res.setHeader('Access-Control-Allow-Origin', 'https://schedule-eosin-two.vercel.app'); // Додайте ваш домен
        res.json(result);
    });
});

app.listen(3000, () => console.log("Server ready on port 3000."));
module.exports = app;