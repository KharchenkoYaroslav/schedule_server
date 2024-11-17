const express = require('express');
const mysql = require('mysql2');
const crypto = require('crypto');

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

let etags = {};

app.get("/", (req, res) => res.send("Express on Vercel"));

app.get('/api/combinedList', (req, res) => {
    const key = 'combinedList';

    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    if (etags[key] && etags[key].lastUpdate > oneDayAgo) {
        const etag = etags[key].etag;

        if (req.headers['if-none-match'] === etag) {
            res.status(304).end();
            return;
        }
    }

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

            const etag = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
            etags[key] = { etag, lastUpdate: new Date() };

            res.set('ETag', etag);
            res.json(data);
        });
    });
});

app.get('/api/getGroup', (req, res) => {
    const groupName = `"${req.query.groupName}"`;
    const semester = req.query.semester;
    const key = `getGroup:${groupName}:${semester}`;

    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    if (etags[key] && etags[key].lastUpdate > oneDayAgo) {
        const etag = etags[key].etag;

        if (req.headers['if-none-match'] === etag) {
            res.status(304).end();
            return;
        }
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
    pool.query(sql, [groupName, semester], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching data');
            return;
        }

        const etag = crypto.createHash('md5').update(JSON.stringify(result)).digest('hex');
        etags[key] = { etag, lastUpdate: new Date() };

        res.set('ETag', etag);
        res.json(result);
    });
});

app.get('/api/getTeacher', (req, res) => {
    const teacherName = `"${req.query.teacherName}"`;
    const semester = req.query.semester;
    const key = `getTeacher:${teacherName}:${semester}`;

    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    if (etags[key] && etags[key].lastUpdate > oneDayAgo) {
        const etag = etags[key].etag;

        if (req.headers['if-none-match'] === etag) {
            res.status(304).end();
            return;
        }
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
    pool.query(sql, [teacherName, semester], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching data');
            return;
        }

        const etag = crypto.createHash('md5').update(JSON.stringify(result)).digest('hex');
        etags[key] = { etag, lastUpdate: new Date() };

        res.set('ETag', etag);
        res.json(result);
    });
});

module.exports = app;