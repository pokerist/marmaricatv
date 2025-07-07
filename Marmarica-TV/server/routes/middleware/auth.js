const jwt = require('jsonwebtoken');

// Get JWT secret from environment variable with a fallback
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '12h';

// Middleware to authenticate admin requests
const authenticateAdmin = (req, res, next) => {
  try {
    // Get token from cookie
    const token = req.cookies.adminToken;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Add admin data to request
    req.admin = {
      id: decoded.id,
      username: decoded.username
    };

    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Create JWT token
const createToken = (admin) => {
  return jwt.sign(
    { 
      id: admin.id, 
      username: admin.username 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
};

module.exports = {
  authenticateAdmin,
  createToken,
  JWT_SECRET,
  JWT_EXPIRY
};
