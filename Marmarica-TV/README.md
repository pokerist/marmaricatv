# Marmarica TV IPTV Admin Panel

A full-stack IPTV admin panel for managing devices, channels, and news for Marmarica TV. This application allows administrators to manage devices, their permissions, channels, and news content, with appropriate APIs for client devices.

## Features

- **Authentication System** - Secure admin login with JWT-based session management
- **Dashboard** - Overview of system stats, expiring devices, and recent actions
- **Devices Management** - CRUD operations for devices, activation codes, and permissions
- **Channels Management** - CRUD operations for channels with logo uploads and drag-and-drop reordering
- **News Management** - CRUD operations for news articles
- **Client APIs** - APIs for device registration, activation, and content delivery

## Tech Stack

### Frontend
- React.js with React Router
- React Bootstrap for UI components
- Formik & Yup for form handling
- React Beautiful DnD for channel reordering
- Axios for API requests

### Backend
- Node.js with Express
- SQLite3 database
- JWT authentication
- File upload handling with Multer

## Quick Start

1. **Clone Repository**
   ```bash
   git clone https://github.com/pokerist/marmaricatv.git
   cd marmaricatv
   ```

2. **Install Dependencies**

   Server:
   ```bash
   cd server
   npm install
   ```

   Client:
   ```bash
   cd ../client
   npm install
   ```

3. **Environment Setup**

   Server (.env):
   ```
   NODE_ENV=development
   PORT=5000
   UPLOAD_DIR=uploads
   CLIENT_URL=http://localhost:3000
   JWT_SECRET=your-dev-secret
   JWT_EXPIRY=12h
   ```

   Client (.env):
   ```
   REACT_APP_API_URL=http://localhost:5000/api
   REACT_APP_UPLOADS_URL=http://localhost:5000/uploads
   ```

4. **Initialize Database**
   ```bash
   cd ../server
   node scripts/setup-admin.js
   node scripts/update-channels-order.js
   ```

5. **Start Development Servers**

   Server:
   ```bash
   cd server
   npm run dev
   ```

   Client:
   ```bash
   cd client
   npm start
   ```

## Production Deployment

For production deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

## API Documentation

- [Admin API Documentation](API_DOCUMENTATION.md)
- [Client API Documentation](CLIENT_API_DOCUMENTATION.md)

## Project Structure

```
marmaricatv/
├── client/                  # Frontend React application
│   ├── public/             # Static files
│   └── src/                # React source code
│       ├── components/     # Reusable components
│       ├── pages/         # Page components
│       ├── services/      # API services
│       └── utils/         # Utility functions
├── server/                 # Backend Node.js application
│   ├── controllers/       # API controllers
│   ├── models/           # Database models
│   ├── routes/          # API routes
│   ├── scripts/        # Setup scripts
│   ├── uploads/       # Channel logos
│   └── index.js      # Server entry point
└── README.md
```

## Development

1. **Database Updates**
   - Channel ordering: `node server/scripts/update-channels-order.js`
   - Reset admin: `node server/scripts/setup-admin.js`

2. **Environment Configuration**
   - Development: Use .env files in server and client directories
   - Production: Use .env.production in server directory

3. **API Testing**
   - Admin APIs require authentication
   - Client APIs are public but require valid device ID

## Maintenance

1. **Backups**
   - Database and uploads are backed up daily
   - Backups are stored in /var/backups/marmarica-tv
   - 30-day retention policy

2. **Monitoring**
   - Use PM2 for process management
   - Check logs in ~/.pm2/logs/
   - Monitor server resources

## Support

For support and inquiries, please contact the project maintainer.

## License

This project is proprietary and confidential. Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.
