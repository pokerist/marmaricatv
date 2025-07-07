/**
 * Authentication middleware for protecting admin routes
 */

const isAuthenticated = (req, res, next) => {
  // Check if user is authenticated via session
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  
  // Not authenticated
  res.status(401).json({ 
    error: 'Unauthorized',
    message: 'Authentication required'
  });
};

// Export middleware
module.exports = {
  isAuthenticated
};
