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


let lastDatabaseUpdate = new Date();

app.get('/api/lastDatabaseUpdate', (req, res) => {
    const lastUpdate = lastDatabaseUpdate.toISOString().split('.')[0];
    res.json({ lastUpdate });
});

app.get('/api/combinedList', (req, res) => {
    const queryGroups = 'SELECT group_code FROM groups_TB';
    const queryTeachers = 'SELECT id, full_name FROM teachers_TB';

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
            JSON_OBJECT('id', t.id, 'name', t.full_name, 'post', t.post)
        )
        FROM teachers_TB t
        WHERE JSON_CONTAINS(
            s.teachers_list, 
            CONCAT('{"id":', t.id, '}'), 
            '$'
        )
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
    const teacherId = req.query.teacherId;
    const semester = req.query.semester;

    if (!teacherId || !semester) {
        console.error('Missing required parameters');
        res.status(400).send('Missing required parameters');
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
        a.audience_number,
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT('name', t.full_name, 'post', t.post)
            )
            FROM teachers_TB t
            WHERE JSON_CONTAINS(
                s.teachers_list, 
                CONCAT('{"id":"', t.id, '"}'), 
                '$'
            )
        ) AS teachers_with_post
    FROM 
        schedule_TB s
    JOIN 
        curriculum_TB c ON s.subject_id = c.id
    LEFT JOIN
        audience_TB a ON s.audience = a.id  
    WHERE 
        JSON_CONTAINS(s.teachers_list, JSON_OBJECT('id', ?), "$") 
        AND s.semester_number = ?;
    `;

    pool.query(sql, [Number(teacherId), semester], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error fetching data');
            return;
        }

        console.log('Query result:', result);
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
        lastDatabaseUpdate = new Date();
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
        lastDatabaseUpdate = new Date();
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
        lastDatabaseUpdate = new Date();
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
        lastDatabaseUpdate = new Date();
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
        lastDatabaseUpdate = new Date();
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
        lastDatabaseUpdate = new Date();
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

app.post('/api/curriculums', (req, res) => {
    const { subject_name, related_teachers, related_groups } = req.body;

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting connection:', err);
            res.status(500).send('Error adding curriculum');
            return;
        }

        connection.beginTransaction(err => {
            if (err) {
                console.error('Error starting transaction:', err);
                res.status(500).send('Error adding curriculum');
                return;
            }

            const query1 = 'INSERT INTO curriculum_TB (subject_name) VALUES (?)';
            connection.query(query1, [subject_name], (err, result) => {
                if (err) {
                    console.error('Error executing query:', err);
                    connection.rollback(() => {
                        res.status(500).send('Error adding curriculum');
                    });
                    return;
                }

                const lastId = result.insertId;

                const teachersArray = related_teachers.map(teacher => `initTeacher(${lastId}, ${teacher.id}, ${teacher.planned_lectures}, ${teacher.planned_practicals}, ${teacher.planned_labs})`).join(', ');
                const groupsArray = related_groups.map(group => `initGroup(${lastId}, '${group.code}', ${group.planned_lectures}, ${group.planned_practicals}, ${group.planned_labs})`).join(', ');

                const query2 = `UPDATE curriculum_TB SET related_teachers = JSON_ARRAY(${teachersArray}), related_groups = JSON_ARRAY(${groupsArray}) WHERE id = ?`;
                connection.query(query2, [lastId], (err, result) => {
                    if (err) {
                        console.error('Error executing query:', err);
                        connection.rollback(() => {
                            res.status(500).send('Error updating curriculum');
                        });
                        return;
                    }

                    connection.commit(err => {
                        if (err) {
                            console.error('Error committing transaction:', err);
                            connection.rollback(() => {
                                res.status(500).send('Error adding curriculum');
                            });
                            return;
                        }

                        lastDatabaseUpdate = new Date();
                        res.status(201).send('Curriculum added successfully');
                    });
                });
            });
        });
    });
});

app.put('/api/curriculums/:curriculumId', (req, res) => {
    const { curriculumId } = req.params;
    const { subject_name, related_teachers, related_groups } = req.body;

    const teachersArray = related_teachers.map(teacher => `initTeacher(${curriculumId}, ${teacher.id}, ${teacher.planned_lectures}, ${teacher.planned_practicals}, ${teacher.planned_labs})`).join(', ');
    const groupsArray = related_groups.map(group => `initGroup(${curriculumId}, '${group.code}', ${group.planned_lectures}, ${group.planned_practicals}, ${group.planned_labs})`).join(', ');


    const query = `UPDATE curriculum_TB SET subject_name = ?, related_teachers = JSON_ARRAY(${teachersArray}), related_groups = JSON_ARRAY(${groupsArray}) WHERE id = ?`;
    pool.query(query, [subject_name, curriculumId], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error updating teacher');
            return;
        }
        lastDatabaseUpdate = new Date();
        res.status(200).send('Teacher updated successfully');
    });
});

app.delete('/api/curriculums/:curriculumId', (req, res) => {
    const { curriculumId } = req.params;
    const query = 'DELETE FROM curriculum_TB WHERE id = ?';
    pool.query(query, [curriculumId], (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error deleting teacher');
            return;
        }
        lastDatabaseUpdate = new Date();
        res.status(200).send('Teacher deleted successfully');
    });
});

app.post('/api/updateSchedule', (req, res) => {
    const { isGroup, semester, source, destination } = req.body;

    if (!isGroup || !semester || !source || !destination) {
        res.status(400).send('Missing required parameters1');
        return;
    }

    const { sourceWeek, sourceDay, sourcePair } = source;
    const { destinationWeek, destinationDay, destinationPair } = destination;

    if (!sourceWeek || !sourceDay || !sourcePair || !destinationWeek || !destinationDay || !destinationPair) {
        res.status(400).send('Missing required parameters2');
        return;
    }

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting connection:', err);
            res.status(500).send('Error updating schedule');
            return;
        }

        connection.beginTransaction(err => {
            if (err) {
                console.error('Error starting transaction:', err);
                res.status(500).send('Error updating schedule');
                return;
            }

            const getSourceQuery = `
                SELECT * FROM schedule_TB
                WHERE week_number = ? AND day_number = ? AND pair_number = ? AND semester_number = ?
                ${isGroup ? 'AND JSON_CONTAINS(groups_list, ?, "$")' : 'AND JSON_CONTAINS(teachers_list, JSON_OBJECT("id", ?), "$")'}
            `;
            const getDestinationQuery = `
                SELECT * FROM schedule_TB
                WHERE week_number = ? AND day_number = ? AND pair_number = ? AND semester_number = ?
                ${isGroup ? 'AND JSON_CONTAINS(groups_list, ?, "$")' : 'AND JSON_CONTAINS(teachers_list, JSON_OBJECT("id", ?), "$")'}
            `;

            const sourceParams = isGroup ? [sourceWeek, sourceDay, sourcePair, semester, source.id] : [sourceWeek, sourceDay, sourcePair, semester, Number(source.id)];
            const destinationParams = isGroup ? [destinationWeek, destinationDay, destinationPair, semester, destination.name] : [destinationWeek, destinationDay, destinationPair, semester, Number(destination.name)];

            connection.query(getSourceQuery, sourceParams, (err, sourceResults) => {
                if (err) {
                    console.error('Error executing query:', err);
                    connection.rollback(() => {
                        res.status(500).send('Error updating schedule');
                    });
                    return;
                }

                connection.query(getDestinationQuery, destinationParams, (err, destinationResults) => {
                    if (err) {
                        console.error('Error executing query:', err);
                        connection.rollback(() => {
                            res.status(500).send('Error updating schedule');
                        });
                        return;
                    }

                    if (sourceResults.length === 0 || destinationResults.length === 0) {
                        connection.rollback(() => {
                            res.status(404).send('Source or destination not found');
                        });
                        return;
                    }

                    const deleteSourceQuery = `
                        DELETE FROM schedule_TB
                        WHERE week_number = ? AND day_number = ? AND pair_number = ? AND semester_number = ?
                        ${isGroup ? 'AND JSON_CONTAINS(groups_list, ?, "$")' : 'AND JSON_CONTAINS(teachers_list, JSON_OBJECT("id", ?), "$")'}
                    `;
                    const deleteDestinationQuery = `
                        DELETE FROM schedule_TB
                        WHERE week_number = ? AND day_number = ? AND pair_number = ? AND semester_number = ?
                        ${isGroup ? 'AND JSON_CONTAINS(groups_list, ?, "$")' : 'AND JSON_CONTAINS(teachers_list, JSON_OBJECT("id", ?), "$")'}
                    `;

                    connection.query(deleteSourceQuery, sourceParams, (err, result) => {
                        if (err) {
                            console.error('Error executing query:', err);
                            connection.rollback(() => {
                                res.status(500).send('Error updating schedule');
                            });
                            return;
                        }

                        connection.query(deleteDestinationQuery, destinationParams, (err, result) => {
                            if (err) {
                                console.error('Error executing query:', err);
                                connection.rollback(() => {
                                    res.status(500).send('Error updating schedule');
                                });
                                return;
                            }

                            const insertSourceQuery = `
                                INSERT INTO schedule_TB (teachers_list, groups_list, subject_id, semester_number, week_number, day_number, pair_number, visit_format, lesson_type, audience)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `;
                            const insertDestinationQuery = `
                                INSERT INTO schedule_TB (teachers_list, groups_list, subject_id, semester_number, week_number, day_number, pair_number, visit_format, lesson_type, audience)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `;

                            const insertPromises = [];

                            sourceResults.forEach(sourceData => {
                                const sourceInsertParams = [
                                    sourceData.teachers_list,
                                    sourceData.groups_list,
                                    sourceData.subject_id,
                                    semester,
                                    destinationWeek,
                                    destinationDay,
                                    destinationPair,
                                    sourceData.visit_format,
                                    sourceData.lesson_type,
                                    sourceData.audience
                                ];

                                insertPromises.push(new Promise((resolve, reject) => {
                                    connection.query(insertSourceQuery, sourceInsertParams, (err, result) => {
                                        if (err) {
                                            reject(err);
                                        } else {
                                            resolve(result);
                                        }
                                    });
                                }));
                            });

                            destinationResults.forEach(destinationData => {
                                const destinationInsertParams = [
                                    destinationData.teachers_list,
                                    destinationData.groups_list,
                                    destinationData.subject_id,
                                    semester,
                                    sourceWeek,
                                    sourceDay,
                                    sourcePair,
                                    destinationData.visit_format,
                                    destinationData.lesson_type,
                                    destinationData.audience
                                ];

                                insertPromises.push(new Promise((resolve, reject) => {
                                    connection.query(insertDestinationQuery, destinationInsertParams, (err, result) => {
                                        if (err) {
                                            reject(err);
                                        } else {
                                            resolve(result);
                                        }
                                    });
                                }));
                            });

                            Promise.all(insertPromises)
                                .then(() => {
                                    connection.commit(err => {
                                        if (err) {
                                            console.error('Error committing transaction:', err);
                                            connection.rollback(() => {
                                                res.status(500).send('Error updating schedule');
                                            });
                                            return;
                                        }

                                        lastDatabaseUpdate = new Date(); 
                                        res.status(200).send('Schedule updated successfully');
                                    });
                                })
                                .catch(err => {
                                    console.error('Error executing query:', err);
                                    connection.rollback(() => {
                                        res.status(500).send('Error updating schedule');
                                    });
                                });
                        });
                    });
                });
            });
        });
    });
});

export default app;