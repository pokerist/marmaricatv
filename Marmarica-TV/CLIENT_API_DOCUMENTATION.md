# Marmarica TV Client API Documentation

This document outlines the public API endpoints available for TV devices to interact with the Marmarica TV IPTV system.

## Base URL
```
http://your-server-domain/api/client
```

## Authentication
Client APIs are public and do not require authentication. However, device validation is performed using the Device Unique ID (DUID) and activation status.

## Endpoints

### Check Device Registration
Validates a device's registration status and returns appropriate content based on the device's status.

```http
POST /check-device
```

**Request Body:**
```json
{
  "duid": "DEVICE_UNIQUE_ID"
}
```

**Response:**
- Device Active:
  ```json
  {
    "status": "active",
    "device": {
      "id": 1,
      "duid": "DEVICE_UNIQUE_ID",
      "owner_name": "John Doe",
      "allowed_types": "FTA,Local,Premium",
      "expiry_date": "2024-12-31",
      "status": "active"
    },
    "channels": [
      {
        "id": 1,
        "name": "Channel Name",
        "url": "stream_url",
        "logo_url": "logo_url",
        "type": "FTA",
        "category": "News",
        "has_news": true
      }
    ],
    "news": [
      {
        "id": 1,
        "title": "News Title",
        "body": "News Content",
        "created_at": "2023-12-31T12:00:00Z"
      }
    ]
  }
  ```

- Device Expired:
  ```json
  {
    "status": "expired",
    "message": "Device subscription has expired",
    "device": {
      // Device info
    },
    "channels": [
      // Only FTA and Local channels
    ],
    "news": [
      // News items
    ]
  }
  ```

- Device Disabled:
  ```json
  {
    "status": "disabled",
    "message": "Device is disabled",
    "device": {
      // Device info
    }
  }
  ```

- Device Not Found:
  ```json
  {
    "error": "Device not found"
  }
  ```

### Register New Device
Registers a new device in the system.

```http
POST /register-device
```

**Request Body:**
```json
{
  "device_name": "Device Owner Name"
}
```

**Response:**
```json
{
  "message": "Device registered successfully",
  "device": {
    "id": 1,
    "duid": "GENERATED_DUID",
    "activation_code": "1234",
    "owner_name": "Device Owner Name",
    "allowed_types": "FTA,Local",
    "expiry_date": null,
    "status": "disabled",
    "created_at": "2023-12-31T12:00:00Z"
  }
}
```

### Activate Device
Activates a device using its activation code.

```http
POST /activate-device
```

**Request Body:**
```json
{
  "duid": "DEVICE_UNIQUE_ID",
  "activation_code": "1234"
}
```

**Response:**
- Success:
  ```json
  {
    "message": "Device activated successfully",
    "device": {
      "id": 1,
      "duid": "DEVICE_UNIQUE_ID",
      "owner_name": "Device Owner Name",
      "allowed_types": "FTA,Local",
      "expiry_date": "2024-12-31",
      "status": "active"
    }
  }
  ```

- Invalid Code:
  ```json
  {
    "error": "Invalid activation code"
  }
  ```

### Get Channels
Retrieves the list of channels available to the device based on its status and permissions.

```http
GET /channels?duid=DEVICE_UNIQUE_ID
```

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
      "display_order": 1
    }
  ]
}
```

### Get News
Retrieves the latest news items.

```http
GET /news?duid=DEVICE_UNIQUE_ID
```

**Response:**
```json
{
  "news": [
    {
      "id": 1,
      "title": "News Title",
      "body": "News Content",
      "created_at": "2023-12-31T12:00:00Z"
    }
  ]
}
```

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Description of what went wrong"
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

## Rate Limiting

- Maximum of 100 requests per minute per IP address
- Maximum of 1000 requests per hour per device (DUID)

## Notes

1. All timestamps are in ISO 8601 format (UTC)
2. Channel order is maintained server-side and reflected in the response order
3. News items are returned in reverse chronological order (newest first)
4. FTA and Local channels are always accessible, even to expired devices
5. Premium channels require an active subscription
