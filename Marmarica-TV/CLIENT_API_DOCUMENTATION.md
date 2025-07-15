# AlKarma TV IPTV - Client API Documentation

This document provides detailed documentation for the Client API endpoints in the AlKarma TV IPTV system. These APIs are specifically designed for client applications (IPTV boxes, mobile apps, etc.) to interact with the system.

## Table of Contents
- [Base URL](#base-url)
- [Authentication](#authentication)
- [Client API Endpoints](#client-api-endpoints)
  - [Check Device Status](#check-device-status)
  - [Register New Device](#register-new-device)
  - [Activate Device](#activate-device)
- [Error Handling](#error-handling)
- [Integration Examples](#integration-examples)

## Base URL

All API endpoints are relative to the base URL:

```
http://your-server-address:5000/api/client
```

In development environments, this will typically be:

```
http://155.138.231.215:5000/api/client
```

## Authentication

The client APIs do not require authentication tokens. Instead, they use device identifiers (DUID) and activation codes for verification.

## Client API Endpoints

### Check Device Status

Checks if a device is registered and returns the appropriate content based on the device's status.

- **URL**: `/check-device`
- **Method**: `POST`
- **Content-Type**: `application/json`
- **Request Body**:
  - `duid` (required): Device Unique Identifier

#### Example Request:
```json
POST /api/client/check-device
Content-Type: application/json

{
  "duid": "195C5756E85D88A"
}
```

#### Example Responses:

##### 1. Active Device:
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "active",
  "message": "Device active",
  "data": {
    "device": {
      "duid": "195C5756E85D88A",
      "owner_name": "Updated Test User",
      "status": "active",
      "expiry_date": "2026-03-24",
      "allowed_types": "FTA,Local"
    },
    "news": [
      {
        "id": 2,
        "title": "API Test News",
        "body": "This news was created via API testing",
        "created_at": "2025-03-24T00:02:56.608Z",
        "updated_at": "2025-03-24T00:02:56.608Z"
      },
      {
        "id": 1,
        "title": "test",
        "body": "بسم الله الرحمن الرحيم وبه نستعين",
        "created_at": "2025-03-23T20:41:28.775Z",
        "updated_at": "2025-03-23T20:41:28.775Z"
      }
    ],
    "channels": [
      {
        "id": 4,
        "name": "Channel Name 1",
        "url": "rtsp://example.com/stream1",
        "logo_url": "/uploads/channel-1742770423059-779571465.jpeg",
        "type": "Local",
        "category": "Movies",
        "has_news": 1,
        "created_at": "2025-03-23T22:53:43.040Z",
        "updated_at": "2025-03-23T22:53:43.063Z"
      },
      {
        "id": 2,
        "name": "Channel Name 2",
        "url": "rtsp://example.com/stream2",
        "logo_url": "/uploads/channel-1742761614998-390365615.png",
        "type": "FTA",
        "category": "General",
        "has_news": 0,
        "created_at": "2025-03-23T20:26:54.975Z",
        "updated_at": "2025-03-23T20:26:55.000Z"
      },
      // Additional channels...
    ]
  }
}
```

##### 2. Expired Device:
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "expired",
  "message": "Your subscription has ended. You can only view Free-To-Air and Local channels now.",
  "data": {
    "device": {
      "duid": "195C4AD6A2F5F96",
      "owner_name": "Example User",
      "status": "expired",
      "expiry_date": "2024-03-23"
    },
    "news": [
      // All news items...
    ],
    "channels": [
      // Only FTA and Local channels (BeIN channels are excluded)...
    ]
  }
}
```

##### 3. Disabled Device:
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "disabled",
  "message": "Your device has been disabled by the administrator. Please contact support for more information.",
  "data": {
    "device": {
      "duid": "195C4B197334637",
      "owner_name": "Example User",
      "status": "disabled"
    }
  }
}
```

##### 4. Device Not Found:
```json
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "Device not registered",
  "message": "Device not registered. Please register your device first."
}
```

##### 5. Error Response:
```json
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Device ID (DUID) is required"
}
```

### Register New Device

Registers a new device in the system using the provided DUID (Device Unique Identifier) and returns an activation code.

- **URL**: `/register-device`
- **Method**: `POST`
- **Content-Type**: `application/json`
- **Request Body**:
  - `duid` (required): Device Unique Identifier to register

#### Example Request:
```json
POST /api/client/register-device
Content-Type: application/json

{
  "duid": "195C68F32A17B98"
}
```

#### Example Response:
```json
HTTP/1.1 201 Created
Content-Type: application/json

{
  "message": "Device successfully created",
  "data": {
    "duid": "195C68F32A17B98",
    "activation_code": "5634",
    "owner_name": "",
    "status": "disabled",
    "expiry_date": "2026-03-24"
  }
}
```

#### Error Response:
```json
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Device ID (DUID) is required for registration"
}
```

### Activate Device

Activates a device using its DUID and activation code. This changes the device status from "disabled" to "active".

- **URL**: `/activate-device`
- **Method**: `POST`
- **Content-Type**: `application/json`
- **Request Body**:
  - `duid` (required): Device Unique Identifier
  - `activation_code` (required): 4-digit activation code provided during registration

#### Example Request:
```json
POST /api/client/activate-device
Content-Type: application/json

{
  "duid": "195C68F32A17B98",
  "activation_code": "5634"
}
```

#### Example Response (Success):
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "Device activated successfully",
  "data": {
    "duid": "195C68F32A17B98",
    "owner_name": "Living Room TV",
    "status": "active",
    "expiry_date": "2026-03-24",
    "allowed_types": "FTA,Local"
  }
}
```

#### Error Responses:

##### 1. Invalid Activation Code:
```json
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Invalid activation code"
}
```

##### 2. Device Already Activated:
```json
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Device is already activated",
  "device": {
    "duid": "195C68F32A17B98",
    "owner_name": "Living Room TV", 
    "status": "active",
    "expiry_date": "2026-03-24"
  }
}
```

##### 3. Device Not Found:
```json
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "Device not found"
}
```

##### 4. Missing Parameters:
```json
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Both device ID (DUID) and activation code are required"
}
```

## Error Handling

The API uses standard HTTP status codes to indicate the success or failure of requests:

- `200 OK`: The request was successful
- `201 Created`: A new resource was successfully created
- `400 Bad Request`: The request was malformed or missing required parameters
- `404 Not Found`: The requested resource (device) could not be found
- `500 Internal Server Error`: An unexpected error occurred on the server

All error responses include a JSON object with an `error` field containing a description of the error.

## Integration Examples

### Integration Flow

A typical client integration flow would be:

1. **First Time Setup**:
   - Call `/register-device` to get a DUID and activation code
   - Display the DUID and activation code to the user
   - Call `/activate-device` with the DUID and activation code

2. **Normal Operation**:
   - Store the DUID securely on the client device
   - Call `/check-device` on startup to retrieve channels and news
   - Display appropriate content based on the device status

### Android Integration Example

```java
// Example using OkHttp and Gson
OkHttpClient client = new OkHttpClient();
Gson gson = new Gson();

// Check device status
void checkDeviceStatus(String duid) {
    MediaType JSON = MediaType.parse("application/json; charset=utf-8");
    JSONObject jsonObject = new JSONObject();
    jsonObject.put("duid", duid);
    
    RequestBody body = RequestBody.create(jsonObject.toString(), JSON);
    Request request = new Request.Builder()
        .url("http://your-server-address:5000/api/client/check-device")
        .post(body)
        .build();
        
    client.newCall(request).enqueue(new Callback() {
        @Override
        public void onFailure(Call call, IOException e) {
            // Handle connection error
        }
        
        @Override
        public void onResponse(Call call, Response response) {
            if (response.isSuccessful()) {
                String responseBody = response.body().string();
                DeviceResponse deviceResponse = gson.fromJson(responseBody, DeviceResponse.class);
                
                // Handle different statuses
                switch (deviceResponse.status) {
                    case "active":
                        // Show all channels
                        break;
                    case "expired":
                        // Show notification + FTA/Local channels only
                        break;
                    case "disabled":
                        // Show error message
                        break;
                }
            } else {
                // Handle error
            }
        }
    });
}
```

### iOS Integration Example

```swift
// Example using URLSession and Codable
func checkDeviceStatus(duid: String) {
    guard let url = URL(string: "http://your-server-address:5000/api/client/check-device") else { return }
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.addValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let body: [String: Any] = ["duid": duid]
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    
    URLSession.shared.dataTask(with: request) { data, response, error in
        guard let data = data, error == nil else {
            // Handle connection error
            return
        }
        
        do {
            let decoder = JSONDecoder()
            let deviceResponse = try decoder.decode(DeviceResponse.self, from: data)
            
            // Handle different statuses
            switch deviceResponse.status {
            case "active":
                // Show all channels
                break
            case "expired":
                // Show notification + FTA/Local channels only
                break
            case "disabled":
                // Show error message
                break
            default:
                break
            }
        } catch {
            // Handle parsing error
        }
    }.resume()
}
```

---

This documentation covers all available client API endpoints in the AlKarma TV IPTV system. For any issues or questions, please contact the system administrator.
