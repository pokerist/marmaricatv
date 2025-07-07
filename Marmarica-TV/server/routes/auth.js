const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { login, logout, getSession } = require('../controllers/auth');

// Login endpoint
router.post('/login', login);

// Logout endpoint (protected)
router.post('/logout', isAuthenticated, logout);

// Get current session info
router.get('/session', getSession);

module.exports = router;
