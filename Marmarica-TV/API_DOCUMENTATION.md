# Marmarica TV Admin API Documentation

This document outlines the API endpoints available for the admin panel. These endpoints require authentication.

## Base URL
```
http://your-server-domain/api
```

## Authentication
All admin endpoints (except /auth/login) require authentication via HTTP-only cookies containing a JWT token.

### Authentication Endpoints

#### Login
```http
POST /auth/login
```

**Request Body:**
```json
{
  "username": "admin",
  "password": "your-password"
}
```

**Response:**
- Sets HTTP-only cookie with JWT token
```json
{
  "message": "Login successful",
  "admin": {
    "id": 1,
    "username": "admin"
  }
}
```

#### Logout
```http
POST /auth/logout
```

**Response:**
- Clears authentication cookie
```json
{
  "message": "Logged out successfully"
}
```

#### Change Password
```http
POST /auth/change-password
```

**Request Body:**
```json
{
  "currentPassword": "current-password",
  "newPassword": "new-password"
}
```

**Response:**
```json
{
  "message": "Password changed successfully"
}
```

#### Check Auth Status
```http
GET /auth/check
```

**Response:**
```json
{
  "authenticated": true,
  "admin": {
    "id": 1,
    "username": "admin"
  }
}
```

### Devices Endpoints

#### List Devices
```http
GET /devices
```

**Query Parameters:**
- status (optional): Filter by status (active, expired, disabled)
- expiring (optional): Filter devices expiring within X days

**Response:**
```json
{
  "devices": [
    {
      "id": 1,
      "duid": "DEVICE_UNIQUE_ID",
      "owner_name": "John Doe",
      "allowed_types": "FTA,Local,Premium",
      "expiry_date": "2024-12-31",
      "status": "active",
      "created_at": "2023-12-31T12:00:00Z",
      "updated_at": "2023-12-31T12:00:00Z"
    }
  ]
}
```

#### Get Device
```http
GET /devices/:id
```

#### Create Device
```http
POST /devices
```

#### Update Device
```http
PUT /devices/:id
```

#### Delete Device
```http
DELETE /devices/:id
```

### Channels Endpoints

#### List Channels
```http
GET /channels
```

**Query Parameters:**
- type (optional): Filter by type (FTA, Local, Premium)
- category (optional): Filter by category
- has_news (optional): Filter channels with news

**Response:**
```json
{
  "channels": [
    {
      "id": 1,
      "name": "Channel Name",
      "url": "stream_url",
      "logo_url": "logo_url",
      "type": "FTA",
      "category": "News",
      "has_news": true,
      "display_order": 1,
      "created_at": "2023-12-31T12:00:00Z",
      "updated_at": "2023-12-31T12:00:00Z"
    }
  ]
}
```

#### Get Channel
```http
GET /channels/:id
```

#### Create Channel
```http
POST /channels
```

**Request Body:**
```json
{
  "name": "Channel Name",
  "url": "stream_url",
  "type": "FTA",
  "category": "News",
  "has_news": false
}
```

#### Update Channel
```http
PUT /channels/:id
```

#### Delete Channel
```http
DELETE /channels/:id
```

#### Upload Channel Logo
```http
POST /channels/:id/logo
```

**Request Body:**
- Content-Type: multipart/form-data
- Field: logo (file)

#### Reorder Channels
```http
POST /channels/reorder
```

**Request Body:**
```json
{
  "orderedIds": [1, 3, 2, 4]  // Array of channel IDs in desired order
}
```

**Response:**
```json
{
  "message": "Channel order updated successfully"
}
```

### News Endpoints

#### List News
```http
GET /news
```

**Query Parameters:**
- search (optional): Search news by title or content

#### Get News Item
```http
GET /news/:id
```

#### Create News
```http
POST /news
```

#### Update News
```http
PUT /news/:id
```

#### Delete News
```http
DELETE /news/:id
```

### Dashboard Endpoints

#### Get Dashboard Data
```http
GET /dashboard
```

**Response:**
```json
{
  "stats": {
    "total_devices": 100,
    "active_devices": 80,
    "expired_devices": 15,
    "disabled_devices": 5,
    "total_channels": 50,
    "total_news": 20
  },
  "recent_actions": [
    {
      "id": 1,
      "action_type": "device_created",
      "description": "New device registered",
      "created_at": "2023-12-31T12:00:00Z"
    }
  ]
}
```

#### Get Recent Actions
```http
GET /dashboard/actions
```

**Query Parameters:**
- limit (optional): Number of actions to return (default: 20)

#### Get Expiring Devices
```http
GET /dashboard/expiring-devices
```

**Query Parameters:**
- days (optional): Number of days to look ahead (default: 7)

#### Clear Action History
```http
DELETE /dashboard/actions
```

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Description of what went wrong"
}
```

### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "error": "Access denied"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

## Notes

1. All timestamps are in ISO 8601 format (UTC)
2. All admin endpoints require authentication via HTTP-only cookies
3. File uploads have a size limit of 5MB
4. Channel order is maintained server-side and reflected in list responses
5. Actions are logged automatically for auditing purposes
