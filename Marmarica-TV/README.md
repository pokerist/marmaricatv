# AlKarma TV IPTV Admin Panel

Admin panel for managing IPTV devices, channels, and news for AlKarma TV.

## Authentication System

The admin panel now includes secure authentication to protect administrative routes while keeping client device APIs open.

### Features

- Secure admin login with session management
- Protected admin routes
- Open client device APIs
- Password hashing with bcrypt
- HTTP-only session cookies
- 12-hour session expiry
- No SSL requirement (HTTP only)

### Environment Variables

Add these to your `.env` file:

```env
# Server
SESSION_SECRET=your-secure-random-string
NODE_ENV=production
PORT=5000

# Frontend
REACT_APP_API_URL=http://155.138.231.215/api
```

### Deployment Steps

1. Install Dependencies:
   ```bash
   # Backend
   cd server
   npm install

   # Frontend
   cd client
   npm install
   ```

2. Create Initial Admin User:
   ```bash
   # Generate random password
   cd server
   node scripts/manage-admin.js create admin

   # Or set specific password
   node scripts/manage-admin.js set-password admin your-password
   ```
   The credentials will be saved in `server/admin-credentials.txt`

3. Update PM2 Configuration:
   ```javascript
   // ecosystem.config.js
   module.exports = {
     apps: [{
       name: 'marmarica-tv-server',
       script: 'server/index.js',
       env: {
         NODE_ENV: 'production',
         PORT: 5000,
         SESSION_SECRET: 'your-secure-random-string'
       }
     }]
   }
   ```

4. Build & Deploy:
   ```bash
   # Build frontend
   cd client
   npm run build

   # Start server with PM2
   pm2 start ecosystem.config.js
   ```

### Admin User Management

#### Create New Admin
```bash
cd server
node scripts/manage-admin.js create <username>
```
This generates a random password and saves it to `admin-credentials.txt`

#### Reset Password
```bash
# Generate new random password
node scripts/manage-admin.js create <username>

# Set specific password
node scripts/manage-admin.js set-password <username> <new-password>
```

#### Emergency Password Reset
If you need to reset a password directly in the database:

1. Generate a bcrypt hash:
   ```bash
   node -e "const bcrypt = require('bcrypt'); bcrypt.hash('new-password', 10, (err, hash) => console.log(hash));"
   ```

2. Update the database:
   ```sql
   UPDATE admins SET password = 'generated-hash' WHERE username = 'admin';
   ```

### Security Notes

- All admin routes require authentication
- Client device routes (/api/client/*) remain open
- Sessions expire after 12 hours
- Passwords are hashed with bcrypt
- No SSL/HTTPS configuration (as per requirements)

### Modified Files

Backend:
- server/package.json (added auth dependencies)
- server/index.js (added session handling)
- server/middleware/auth.js (new)
- server/controllers/auth.js (new)
- server/routes/auth.js (new)
- server/scripts/manage-admin.js (new)

Frontend:
- client/src/App.js (added auth routes)
- client/src/contexts/AuthContext.js (new)
- client/src/components/PrivateRoute.js (new)
- client/src/pages/auth/Login.js (new)
- client/src/services/api.js (updated for auth)
- client/src/components/layouts/MainLayout.js (added logout)
- client/src/index.css (added auth styles)
