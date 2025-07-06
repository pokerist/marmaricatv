# AlKarma TV IPTV Admin Panel - API Documentation

This document provides comprehensive documentation for all API endpoints available in the AlKarma TV IPTV Admin Panel system. You can use this guide to test and interact with the API using Postman or any other API testing tool.

## Table of Contents
- [Base URL](#base-url)
- [Postman Setup](#postman-setup)
- [Device Management](#device-management)
- [Channel Management](#channel-management)
- [News Management](#news-management)
- [Dashboard](#dashboard)
- [Client APIs](#client-apis)
- [Health Check](#health-check)

## Base URL

All API endpoints are relative to the base URL:

```
http://localhost:5000/api
```

For production environments, replace with your server's domain.

## Postman Setup

1. **Create a new Postman Collection** named "AlKarma TV API"
2. **Set up Environment Variables**:
   - Create a new environment named "AlKarma TV Development"
   - Add the following variables:
     - `base_url`: `http://localhost:5000/api`

3. **Import this documentation** or create requests as described below

## Device Management

### Get All Devices

Retrieve a list of all devices with optional filtering.

- **URL**: `{{base_url}}/devices`
- **Method**: `GET`
- **Query Parameters**:
  - `status` (optional): Filter by device status (`active`, `disabled`, `expired`)
  - `expiring` (optional): Show only devices about to expire (`true`)

**Example Request:**
```
GET {{base_url}}/devices?status=active
```

**Example Response:**
```json
{
  "data": [
    {
      "id": 1,
      "duid": "186F678C039",
      "activation_code": "5432",
      "owner_name": "John Doe",
      "allowed_types": "FTA,Local,BeIN",
      "expiry_date": "2025-12-31",
      "status": "active",
      "created_at": "2025-03-23T19:43:12.000Z",
      "updated_at": "2025-03-23T19:43:12.000Z"
    },
    {
      "id": 2,
      "duid": "186F679A123",
      "activation_code": "9876",
      "owner_name": "Jane Smith",
      "allowed_types": "FTA,Local",
      "expiry_date": "2025-10-15",
      "status": "active",
      "created_at": "2025-03-23T19:44:30.000Z",
      "updated_at": "2025-03-23T19:44:30.000Z"
    }
  ]
}
```

### Get Device by ID

Retrieve details for a specific device by its ID.

- **URL**: `{{base_url}}/devices/:id`
- **Method**: `GET`
- **URL Parameters**:
  - `id`: Device ID

**Example Request:**
```
GET {{base_url}}/devices/1
```

**Example Response:**
```json
{
  "data": {
    "id": 1,
    "duid": "186F678C039",
    "activation_code": "5432",
    "owner_name": "John Doe",
    "allowed_types": "FTA,Local,BeIN",
    "expiry_date": "2025-12-31",
    "status": "active",
    "created_at": "2025-03-23T19:43:12.000Z",
    "updated_at": "2025-03-23T19:43:12.000Z"
  }
}
```

### Create Device

Create a new device in the system.

- **URL**: `{{base_url}}/devices`
- **Method**: `POST`
- **Headers**:
  - `Content-Type`: `application/json`
- **Body**:
  - `owner_name` (required): Name of the device owner
  - `allowed_types` (optional): Comma-separated list of allowed channel types (`FTA,Local,BeIN`)

**Example Request:**
```json
POST {{base_url}}/devices
Content-Type: application/json

{
  "owner_name": "Ahmed Hassan",
  "allowed_types": "FTA,Local"
}
```

**Example Response:**
```json
{
  "message": "Device created successfully",
  "data": {
    "id": 3,
    "duid": "186F681E7B2",
    "activation_code": "4321",
    "owner_name": "Ahmed Hassan",
    "allowed_types": "FTA,Local",
    "expiry_date": "2026-03-23",
    "status": "disabled",
    "created_at": "2025-03-23T20:15:30.000Z",
    "updated_at": "2025-03-23T20:15:30.000Z"
  }
}
```

### Update Device

Update an existing device's information.

- **URL**: `{{base_url}}/devices/:id`
- **Method**: `PUT`
- **URL Parameters**:
  - `id`: Device ID
- **Headers**:
  - `Content-Type`: `application/json`
- **Body**:
  - `owner_name` (optional): Name of the device owner
  - `allowed_types` (optional): Comma-separated list of allowed channel types
  - `expiry_date` (optional): Device expiry date (YYYY-MM-DD)
  - `status` (optional): Device status (`active`, `disabled`, `expired`)

**Example Request:**
```json
PUT {{base_url}}/devices/3
Content-Type: application/json

{
  "owner_name": "Ahmed Hassan Updated",
  "status": "active",
  "allowed_types": "FTA,Local,BeIN"
}
```

**Example Response:**
```json
{
  "message": "Device updated successfully",
  "data": {
    "id": 3,
    "duid": "186F681E7B2",
    "activation_code": "4321",
    "owner_name": "Ahmed Hassan Updated",
    "allowed_types": "FTA,Local,BeIN",
    "expiry_date": "2026-03-23",
    "status": "active",
    "created_at": "2025-03-23T20:15:30.000Z",
    "updated_at": "2025-03-23T20:16:45.000Z"
  }
}
```

### Delete Device

Delete a device from the system.

- **URL**: `{{base_url}}/devices/:id`
- **Method**: `DELETE`
- **URL Parameters**:
  - `id`: Device ID

**Example Request:**
```
DELETE {{base_url}}/devices/3
```

**Example Response:**
```json
{
  "message": "Device deleted successfully",
  "id": "3"
}
```

## Channel Management

### Get All Channels

Retrieve a list of all channels with optional filtering.

- **URL**: `{{base_url}}/channels`
- **Method**: `GET`
- **Query Parameters**:
  - `type` (optional): Filter by channel type (`FTA`, `Local`, `BeIN`)
  - `category` (optional): Filter by channel category
  - `has_news` (optional): Filter channels that have news (`true` or `false`)

**Example Request:**
```
GET {{base_url}}/channels?type=FTA
```

**Example Response:**
```json
{
  "data": [
    {
      "id": 1,
      "name": "AlKarma News",
      "url": "rtsp://example.com/alkarma-news",
      "logo_url": "/uploads/channel-1742761564297-156308667.png",
      "type": "FTA",
      "category": "News",
      "has_news": 1,
      "created_at": "2025-03-23T19:50:20.000Z",
      "updated_at": "2025-03-23T19:50:20.000Z"
    },
    {
      "id": 2,
      "name": "AlKarma Sports",
      "url": "rtsp://example.com/alkarma-sports",
      "logo_url": "/uploads/channel-1742761614998-390365615.png",
      "type": "FTA",
      "category": "Sports",
      "has_news": 0,
      "created_at": "2025-03-23T19:51:10.000Z",
      "updated_at": "2025-03-23T19:51:10.000Z"
    }
  ]
}
```

### Get Channel by ID

Retrieve details for a specific channel by its ID.

- **URL**: `{{base_url}}/channels/:id`
- **Method**: `GET`
- **URL Parameters**:
  - `id`: Channel ID

**Example Request:**
```
GET {{base_url}}/channels/1
```

**Example Response:**
```json
{
  "data": {
    "id": 1,
    "name": "AlKarma News",
    "url": "rtsp://example.com/alkarma-news",
    "logo_url": "/uploads/channel-1742761564297-156308667.png",
    "type": "FTA",
    "category": "News",
    "has_news": 1,
    "created_at": "2025-03-23T19:50:20.000Z",
    "updated_at": "2025-03-23T19:50:20.000Z"
  }
}
```

### Create Channel

Create a new channel in the system.

- **URL**: `{{base_url}}/channels`
- **Method**: `POST`
- **Headers**:
  - `Content-Type`: `application/json`
- **Body**:
  - `name` (required): Channel name
  - `url` (required): Channel streaming URL
  - `type` (required): Channel type (`FTA`, `Local`, `BeIN`)
  - `category` (required): Channel category
  - `has_news` (optional): Whether the channel has news (`true` or `false`)

**Example Request:**
```json
POST {{base_url}}/channels
Content-Type: application/json

{
  "name": "AlKarma Movies",
  "url": "rtsp://example.com/alkarma-movies",
  "type": "Local",
  "category": "Movies",
  "has_news": false
}
```

**Example Response:**
```json
{
  "message": "Channel created successfully",
  "data": {
    "id": 3,
    "name": "AlKarma Movies",
    "url": "rtsp://example.com/alkarma-movies",
    "logo_url": null,
    "type": "Local",
    "category": "Movies",
    "has_news": 0,
    "created_at": "2025-03-23T20:18:30.000Z",
    "updated_at": "2025-03-23T20:18:30.000Z"
  }
}
```

### Upload Channel Logo

Upload a logo image for a specific channel.

- **URL**: `{{base_url}}/channels/:id/logo`
- **Method**: `POST`
- **URL Parameters**:
  - `id`: Channel ID
- **Headers**:
  - `Content-Type`: `multipart/form-data`
- **Body**:
  - `logo` (required): Image file (JPG, PNG, etc.) - max 5MB

**Postman Example Setup:**
1. Use `POST` method with URL: `{{base_url}}/channels/3/logo`
2. Go to the "Body" tab
3. Select "form-data"
4. Add a key named "logo" and set its type to "File"
5. Select your image file

**Example Response:**
```json
{
  "message": "Channel logo uploaded successfully",
  "logo_url": "/uploads/channel-1742770423059-779571465.jpeg"
}
```

### Update Channel

Update an existing channel's information.

- **URL**: `{{base_url}}/channels/:id`
- **Method**: `PUT`
- **URL Parameters**:
  - `id`: Channel ID
- **Headers**:
  - `Content-Type`: `application/json`
- **Body**:
  - `name` (optional): Channel name
  - `url` (optional): Channel streaming URL
  - `type` (optional): Channel type
  - `category` (optional): Channel category
  - `has_news` (optional): Whether the channel has news

**Example Request:**
```json
PUT {{base_url}}/channels/3
Content-Type: application/json

{
  "name": "AlKarma Movies Premium",
  "has_news": true
}
```

**Example Response:**
```json
{
  "message": "Channel updated successfully",
  "data": {
    "id": 3,
    "name": "AlKarma Movies Premium",
    "url": "rtsp://example.com/alkarma-movies",
    "logo_url": "/uploads/channel-1742770423059-779571465.jpeg",
    "type": "Local",
    "category": "Movies",
    "has_news": 1,
    "created_at": "2025-03-23T20:18:30.000Z",
    "updated_at": "2025-03-23T20:20:15.000Z"
  }
}
```

### Delete Channel

Delete a channel from the system.

- **URL**: `{{base_url}}/channels/:id`
- **Method**: `DELETE`
- **URL Parameters**:
  - `id`: Channel ID

**Example Request:**
```
DELETE {{base_url}}/channels/3
```

**Example Response:**
```json
{
  "message": "Channel deleted successfully",
  "id": "3"
}
```

## News Management

### Get All News

Retrieve a list of all news items with optional search.

- **URL**: `{{base_url}}/news`
- **Method**: `GET`
- **Query Parameters**:
  - `search` (optional): Search term to filter news by title or body

**Example Request:**
```
GET {{base_url}}/news?search=important
```

**Example Response:**
```json
{
  "data": [
    {
      "id": 1,
      "title": "Important System Update",
      "body": "We are pleased to announce important new features in our latest update.",
      "created_at": "2025-03-23T19:55:20.000Z",
      "updated_at": "2025-03-23T19:55:20.000Z"
    }
  ]
}
```

### Get News by ID

Retrieve details for a specific news item by its ID.

- **URL**: `{{base_url}}/news/:id`
- **Method**: `GET`
- **URL Parameters**:
  - `id`: News ID

**Example Request:**
```
GET {{base_url}}/news/1
```

**Example Response:**
```json
{
  "data": {
    "id": 1,
    "title": "Important System Update",
    "body": "We are pleased to announce important new features in our latest update.",
    "created_at": "2025-03-23T19:55:20.000Z",
    "updated_at": "2025-03-23T19:55:20.000Z"
  }
}
```

### Create News

Create a new news item in the system.

- **URL**: `{{base_url}}/news`
- **Method**: `POST`
- **Headers**:
  - `Content-Type`: `application/json`
- **Body**:
  - `title` (required): News title
  - `body` (required): News content

**Example Request:**
```json
POST {{base_url}}/news
Content-Type: application/json

{
  "title": "New Channels Added",
  "body": "We have added 10 new channels to our lineup. Check them out now!"
}
```

**Example Response:**
```json
{
  "message": "News item created successfully",
  "data": {
    "id": 2,
    "title": "New Channels Added",
    "body": "We have added 10 new channels to our lineup. Check them out now!",
    "created_at": "2025-03-23T20:22:30.000Z",
    "updated_at": "2025-03-23T20:22:30.000Z"
  }
}
```

### Update News

Update an existing news item.

- **URL**: `{{base_url}}/news/:id`
- **Method**: `PUT`
- **URL Parameters**:
  - `id`: News ID
- **Headers**:
  - `Content-Type`: `application/json`
- **Body**:
  - `title` (optional): News title
  - `body` (optional): News content

**Example Request:**
```json
PUT {{base_url}}/news/2
Content-Type: application/json

{
  "title": "New Channels Added - Update",
  "body": "We have added 15 new channels to our lineup. Check them out now!"
}
```

**Example Response:**
```json
{
  "message": "News item updated successfully",
  "data": {
    "id": 2,
    "title": "New Channels Added - Update",
    "body": "We have added 15 new channels to our lineup. Check them out now!",
    "created_at": "2025-03-23T20:22:30.000Z",
    "updated_at": "2025-03-23T20:23:45.000Z"
  }
}
```

### Delete News

Delete a news item from the system.

- **URL**: `{{base_url}}/news/:id`
- **Method**: `DELETE`
- **URL Parameters**:
  - `id`: News ID

**Example Request:**
```
DELETE {{base_url}}/news/2
```

**Example Response:**
```json
{
  "message": "News item deleted successfully",
  "id": "2"
}
```

## Dashboard

### Get Dashboard Data

Retrieve all dashboard summary data.

- **URL**: `{{base_url}}/dashboard`
- **Method**: `GET`

**Example Request:**
```
GET {{base_url}}/dashboard
```

**Example Response:**
```json
{
  "data": {
    "deviceCount": 5,
    "devicesByStatus": {
      "active": 3,
      "disabled": 1,
      "expired": 1
    },
    "channelCount": 8,
    "channelsByType": {
      "FTA": 4,
      "Local": 3,
      "BeIN": 1
    },
    "newsCount": 3,
    "expiringDevices": [
      {
        "id": 4,
        "duid": "186F683A12C",
        "activation_code": "7890",
        "owner_name": "Mohamed Ahmed",
        "allowed_types": "FTA,Local",
        "expiry_date": "2025-03-28",
        "status": "active",
        "created_at": "2025-03-23T19:45:30.000Z",
        "updated_at": "2025-03-23T19:45:30.000Z"
      }
    ],
    "recentActions": [
      {
        "id": 15,
        "action_type": "channel_updated",
        "description": "Channel updated: AlKarma News",
        "created_at": "2025-03-23T20:25:15.000Z"
      },
      {
        "id": 14,
        "action_type": "device_status_changed",
        "description": "Device 186F678C039 status changed from disabled to active",
        "created_at": "2025-03-23T20:24:10.000Z"
      }
      // Additional actions...
    ]
  }
}
```

### Get Recent Actions

Retrieve recent system activities.

- **URL**: `{{base_url}}/dashboard/actions`
- **Method**: `GET`
- **Query Parameters**:
  - `limit` (optional): Number of actions to return (default: 20)

**Example Request:**
```
GET {{base_url}}/dashboard/actions?limit=5
```

**Example Response:**
```json
{
  "data": [
    {
      "id": 15,
      "action_type": "channel_updated",
      "description": "Channel updated: AlKarma News",
      "created_at": "2025-03-23T20:25:15.000Z"
    },
    {
      "id": 14,
      "action_type": "device_status_changed",
      "description": "Device 186F678C039 status changed from disabled to active",
      "created_at": "2025-03-23T20:24:10.000Z"
    },
    {
      "id": 13,
      "action_type": "news_added",
      "description": "New news item added: New Channels Added",
      "created_at": "2025-03-23T20:22:30.000Z"
    },
    {
      "id": 12,
      "action_type": "channel_logo_updated",
      "description": "Logo updated for channel: AlKarma Movies",
      "created_at": "2025-03-23T20:19:45.000Z"
    },
    {
      "id": 11,
      "action_type": "channel_added",
      "description": "New channel added: AlKarma Movies (Local)",
      "created_at": "2025-03-23T20:18:30.000Z"
    }
  ]
}
```

### Get Expiring Devices

Retrieve devices that are about to expire within a specified period.

- **URL**: `{{base_url}}/dashboard/expiring-devices`
- **Method**: `GET`
- **Query Parameters**:
  - `days` (optional): Number of days to look ahead (default: 7)

**Example Request:**
```
GET {{base_url}}/dashboard/expiring-devices?days=10
```

**Example Response:**
```json
{
  "data": [
    {
      "id": 4,
      "duid": "186F683A12C",
      "activation_code": "7890",
      "owner_name": "Mohamed Ahmed",
      "allowed_types": "FTA,Local",
      "expiry_date": "2025-03-28",
      "status": "active",
      "created_at": "2025-03-23T19:45:30.000Z",
      "updated_at": "2025-03-23T19:45:30.000Z"
    },
    {
      "id": 5,
      "duid": "186F684B23D",
      "activation_code": "6543",
      "owner_name": "Sara Kamel",
      "allowed_types": "FTA,Local,BeIN",
      "expiry_date": "2025-04-01",
      "status": "active",
      "created_at": "2025-03-23T19:46:15.000Z",
      "updated_at": "2025-03-23T19:46:15.000Z"
    }
  ]
}
```

### Clear Action History

Delete all action history records.

- **URL**: `{{base_url}}/dashboard/actions`
- **Method**: `DELETE`

**Example Request:**
```
DELETE {{base_url}}/dashboard/actions
```

**Example Response:**
```json
{
  "message": "Action history cleared successfully",
  "rowsAffected": 15
}
```

## Client APIs

### Check Device Status

Check if a device is registered and return appropriate content.

- **URL**: `{{base_url}}/client/device/:duid`
- **Method**: `GET`
- **URL Parameters**:
  - `duid`: Device DUID

**Example Request:**
```
GET {{base_url}}/client/device/186F678C039
```

**Example Response (Active Device):**
```json
{
  "status": "active",
  "device": {
    "id": 1,
    "duid": "186F678C039",
    "owner_name": "John Doe",
    "allowed_types": "FTA,Local,BeIN",
    "expiry_date": "2025-12-31",
    "status": "active"
  },
  "channels": [
    {
      "id": 1,
      "name": "AlKarma News",
      "url": "rtsp://example.com/alkarma-news",
      "logo_url": "/uploads/channel-1742761564297-156308667.png",
      "type": "FTA",
      "category": "News"
    },
    // Additional channels...
  ],
  "news": [
    {
      "id": 1,
      "title": "Important System Update",
      "body": "We are pleased to announce important new features in our latest update.",
      "created_at": "2025-03-23T19:55:20.000Z"
    }
    // Additional news...
  ]
}
```

**Example Response (Expired Device):**
```json
{
  "status": "expired",
  "message": "Your subscription has expired. Only FTA and Local channels are available.",
  "device": {
    "id": 6,
    "duid": "186F685C34E",
    "owner_name": "Khaled Omar",
    "allowed_types": "FTA,Local,BeIN",
    "expiry_date": "2025-03-15",
    "status": "expired"
  },
  "channels": [
    // Only FTA and Local channels...
  ],
  "news": [
    // All news items...
  ]
}
```

**Example Response (Disabled Device):**
```json
{
  "status": "disabled",
  "message": "This device is currently disabled. Please contact administrator for assistance.",
  "device": {
    "id": 7,
    "duid": "186F686D45F",
    "owner_name": "Laila Samy",
    "allowed_types": "FTA,Local",
    "expiry_date": "2025-09-10",
    "status": "disabled"
  }
}
```

### Register New Device

Register a new device in the system.

- **URL**: `{{base_url}}/client/register`
- **Method**: `POST`
- **Headers**:
  - `Content-Type`: `application/json`
- **Body**:
  - `owner_name` (required): Name of the device owner
  - `allowed_types` (optional): Comma-separated list of allowed channel types (default: `FTA,Local`)

**Example Request:**
```json
POST {{base_url}}/client/register
Content-Type: application/json

{
  "owner_name": "Ramy Walid",
  "allowed_types": "FTA,Local"
}
```

**Example Response:**
```json
{
  "message": "Device successfully registered",
  "device": {
    "id": 8,
    "duid": "186F687E56G",
    "activation_code": "1234",
    "owner_name": "Ramy Walid",
    "allowed_types": "FTA,Local",
    "expiry_date": "2026-03-23",
    "status": "disabled"
  }
}
```

### Activate Device

Activate a device with its DUID and activation code.

- **URL**: `{{base_url}}/client/activate`
- **Method**: `POST`
- **Headers**:
  - `Content-Type`: `application/json`
- **Body**:
  - `duid` (required): Device DUID
  - `activation_code` (required): Device activation code

**Example Request:**
```json
POST {{base_url}}/client/activate
Content-Type: application/json

{
  "duid": "186F687E56G",
  "activation_code": "1234"
}
```

**Example Response (Success):**
```json
{
  "message": "Device activated successfully",
  "device": {
    "id": 8,
    "duid": "186F687E56G",
    "owner_name": "Ramy Walid",
    "allowed_types": "FTA,Local",
    "expiry_date": "2026-03-23",
    "status": "active"
  }
}
```

**Example Response (Error):**
```json
{
  "error": "Invalid activation code"
}
```

## Health Check

### Server Health Check

Check if the server is running.

- **URL**: `{{base_url}}/health`
- **Method**: `GET`

**Example Request:**
```
GET {{base_url}}/health
```

**Example Response:**
```json
{
  "status": "OK",
  "message": "Server is running"
}
```

## Common HTTP Status Codes

- `200 OK`: Request successful
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid input data
- `404 Not Found`: Resource not found
- `408 Request Timeout`: Request took too long to process
- `500 Internal Server Error`: Server-side error

## Postman Collection Structure

For an organized testing experience, structure your Postman collection as follows:

```
AlKarma TV API
├── Health Check
│   └── Server Health Check
├── Device Management
│   ├── Get All Devices
│   ├── Get Device by ID
│   ├── Create Device
│   ├── Update Device
│   └── Delete Device
├── Channel Management
│   ├── Get All Channels
│   ├── Get Channel by ID
│   ├── Create Channel
│   ├── Upload Channel Logo
│   ├── Update Channel
│   └── Delete Channel
├── News Management
│   ├── Get All News
│   ├── Get News by ID
│   ├── Create News
│   ├── Update News
│   └── Delete News
├── Dashboard
│   ├── Get Dashboard Data
│   ├── Get Recent Actions
│   ├── Get Expiring Devices
│   └── Clear Action History
└── Client APIs
    ├── Check Device Status
    ├── Register New Device
    └── Activate Device
```

---

This documentation covers all available API endpoints in the AlKarma TV IPTV Admin Panel system. For any issues or further assistance, please contact the system administrator.
