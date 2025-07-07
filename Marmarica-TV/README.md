# Marmarica TV IPTV Admin Panel

A full-stack IPTV admin panel for managing devices, channels, and news for Marmarica TV. This application allows administrators to manage devices, their permissions, channels, and news content, with appropriate APIs for client devices.

## Tech Stack

### Frontend
- **React.js** - Frontend library for building user interfaces
- **React Router** - For client-side routing
- **React Bootstrap** - UI component library
- **Formik & Yup** - Form handling and validation
- **Axios** - HTTP client for API requests
- **React Icons** - Icon library
- **React-Toastify** - For displaying notification messages
- **React Beautiful DnD** - For drag-and-drop channel reordering

### Backend
- **Node.js** - JavaScript runtime
- **Express** - Web framework for Node.js
- **SQLite3** - Lightweight, serverless database
- **Multer** - For handling file uploads (channel logos)
- **CORS** - For cross-origin resource sharing
- **bcrypt** - For password hashing
- **jsonwebtoken** - For JWT-based authentication
- **cookie-parser** - For handling HTTP cookies

## Features

- **Authentication System** - Secure admin login with JWT-based session management
- **Dashboard** - Overview of system stats, expiring devices, and recent actions
- **Devices Management** - CRUD operations for devices, activation codes, and permissions
- **Channels Management** - CRUD operations for channels with logo uploads and drag-and-drop reordering
- **News Management** - CRUD operations for news articles
- **Client APIs** - APIs for device registration, activation, and content delivery

## Project Structure

```
Marmarica-TV/
├── client/                  # Frontend React application
│   ├── public/              # Static files
│   └── src/                 # React source code
│       ├── components/      # Reusable components
│       │   ├── auth/        # Authentication components
│       │   └── layouts/     # Layout components
│       ├── pages/           # Page components
│       │   ├── auth/        # Authentication pages
│       │   ├── channels/    # Channel management pages
│       │   ├── devices/     # Device management pages
│       │   └── news/        # News management pages
│       ├── services/        # API services
│       └── utils/           # Utility functions
├── server/                  # Backend Node.js application
│   ├── controllers/         # API controllers
│   ├── models/              # Database models
│   ├── routes/             # API routes
│   │   ├── middleware/     # Auth middleware
│   │   └── auth.js        # Auth routes
│   ├── scripts/           # Admin setup scripts
│   ├── uploads/           # Folder for channel logos
│   ├── database.sqlite    # SQLite database file
│   └── index.js           # Server entry point
└── README.md              # Project documentation
```

## Authentication System

### Initial Setup

1. **Create Initial Admin Account**
   ```bash
   cd server
   node scripts/setup-admin.js
   ```
   This script will:
   - Prompt for admin username and password
   - Create the admin account with securely hashed password
   - Save credentials backup to admin-credentials.txt

2. **Reset Admin Password**
   If you need to reset the admin password:
   ```bash
   cd server
   node scripts/setup-admin.js
   ```
   Choose 'yes' when prompted about existing admin account.

### Security Features

- Password hashing using bcrypt
- JWT-based authentication with HTTP-only cookies
- Session expiry after 12 hours (configurable)
- Protected admin routes
- Public APIs remain accessible for TV devices

## Channel Management

### Channel Ordering

Channels can now be manually reordered using drag-and-drop in the admin panel. The order is preserved and used when returning channels to TV devices.

To reorder channels:
1. Go to the Channels page in the admin panel
2. Use the drag handle (⋮) to drag channels to their desired position
3. Changes are automatically saved to the server

The channel order is maintained separately from other attributes like name or type, allowing for custom organization regardless of other properties.

[Previous installation and deployment instructions remain the same...]

## API Documentation

### Authentication APIs

#### Admin Login
- **URL**: `/api/auth/login`
- **Method**: `POST`
- **Body**: 
  ```json
  {
    "username": "admin",
    "password": "your-password"
  }
  ```
- **Response**: Sets HTTP-only cookie with JWT token

#### Admin Logout
- **URL**: `/api/auth/logout`
- **Method**: `POST`
- **Response**: Clears authentication cookie

#### Change Password
- **URL**: `/api/auth/change-password`
- **Method**: `POST`
- **Body**: 
  ```json
  {
    "currentPassword": "current-password",
    "newPassword": "new-password"
  }
  ```
- **Response**: Success message or error

### Channel Ordering API

#### Update Channel Order
- **URL**: `/api/channels/reorder`
- **Method**: `POST`
- **Body**: 
  ```json
  {
    "orderedIds": [1, 3, 2, 4]  // Array of channel IDs in desired order
  }
  ```
- **Response**: Success message or error

[Previous API documentation remains the same...]

## License

This project is proprietary and confidential. Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

## Support

For support and inquiries, please contact the project maintainer.
