const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const session = require('express-session');
const path = require('path');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'secret', // Change this to a more secure secret in production
    resave: false,
    saveUninitialized: true
}));

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'node_postgres',
    password: '523658', 
    port: 5432, 
    });

// Middleware to authenticate user's session
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        res.redirect('/register');
    }
};
function isAdmin(req, res, next) {
    if (req.session.role === 'admin') {
        return next();
    } else {
        res.status(403).send('Permission denied');
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Registration page
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Registration route
app.post('/register', async (req, res) => {
    // Handle user registration
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id',
            [username, email, hashedPassword]
        );
        req.session.userId = result.rows[0].id;
        res.redirect('/user-dashboard');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

// Login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login route
app.post('/login', async (req, res) => {
    // Handle user login
    try {
        const { email, password } = req.body;
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(400).send('Invalid credentials');
        }
        const validPassword = await bcrypt.compare(password, user.rows[0].password);
        if (!validPassword) {
            return res.status(400).send('Invalid credentials');
        }
        req.session.userId = user.rows[0].id;
        req.session.role = user.rows[0].role;
        if (req.session.role === 'admin') {
            res.redirect('/admin-dashboard')
        } else {
            res.redirect('/user-dashboard')
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

// Dashboard page
app.get('/admin-dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin_dashboard.html'));
});

app.get('/user-dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'user_dashboard.html'));
});

// User Profile page
app.get('/profile', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

// Admin Panel page
app.get('/admin', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Task Creation
app.post('/tasks', isAuthenticated, async (req, res) => {
    try {
        const { title, description, deadline } = req.body;
        const user_id = req.session.userId; // Extract user ID from session
        // Insert the task into the database
        await pool.query(
            'INSERT INTO tasks (title, description, deadline, user_id) VALUES ($1, $2, $3, $4)',
            [title, description, deadline, user_id]
        );
        // Fetch the updated task list
        const updatedTasks = await pool.query('SELECT * FROM tasks WHERE user_id = $1', [user_id]);
        if (req.session.role === 'admin') {
            res.redirect('/admin-dashboard')
        } else {
            res.redirect('/user-dashboard')
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

// Route to get tasks for admin dashboard
app.get('/admin-dashboard/tasks', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tasks');
        res.json(result.rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

// Route to delete task
app.delete('/admin-dashboard/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
        res.status(200).send('Task deleted successfully');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

app.get('/admin-dashboard/edit-task/:taskId', (req, res) => {
    // Construct the file path based on the task ID
    const filePath = path.join(__dirname, 'public', 'edit_task.html');
    // Send the HTML file as a response
    res.sendFile(filePath);
});


app.get('/profile', isAuthenticated, async (req, res) => {
    try {
        // Fetch user information from the database
        const userId = req.session.userId;
        const user = await pool.query('SELECT username, email FROM users WHERE id = $1', [userId]);
        if (user.rows.length === 0) {
            return res.status(404).send('User not found');
        }
        res.sendFile(path.join(__dirname, 'public', 'user_profile.html'));
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

// Route to update user profile
app.put('/profile', isAuthenticated, async (req, res) => {
    try {
        const { username, email } = req.body;
        const userId = req.session.userId;
        // Update user information in the database
        await pool.query('UPDATE users SET username = $1, email = $2 WHERE id = $3', [username, email, userId]);
        res.status(200).send('Profile updated successfully');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

// Get all Users
app.get('/admin/users', isAuthenticated, isAdmin, async (req, res) => {
    // Fetch all users
    try {
        const result = await pool.query('SELECT id, username, email, role FROM users');
        res.json(result.rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});


// Route to update user role (admin only)
app.put('/admin/users/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        // Update user role in the database
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
        res.status(200).send('User role updated successfully');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

// Route to delete user (admin only)
app.delete('/admin/users/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        // Delete user from the database
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.status(200).send('User deleted successfully');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});
// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        res.redirect('/login');
    });
});

app.listen(3000, () => {
    console.log(`Server is running on http://localhost:3000`);
});
