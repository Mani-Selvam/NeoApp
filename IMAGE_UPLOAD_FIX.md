# Image Upload Troubleshooting Guide

## Problem

Images fail to upload in the enquiry/followup screens.

---

## Root Cause Analysis

### Most Common: API URL Mismatch

```
❌ Client: http://192.168.1.34:5000/api
✅ Server: http://192.168.1.207:5000

Result: Network error, image upload fails
```

### Second Most Common: Server Not Running

```
❌ Server stopped or crashed
✅ Server running on http://192.168.1.34:5000

Result: Connection refused
```

### Third: Firewall Blocking

```
❌ Port 5000 blocked by firewall
✅ Firewall allows port 5000

Result: Timeout or connection error
```

---

## Step-by-Step Fix

### Step 1: Get Your Machine IP

**Windows (Command Prompt):**

```bash
ipconfig
```

Look for: `IPv4 Address` under your active connection  
Example: `192.168.1.207`

**macOS (Terminal):**

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**Linux (Terminal):**

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

### Step 2: Update .env File

**File:** `.env` (at project root)

**Current (Wrong):**

```env
EXPO_PUBLIC_API_URL=http://192.168.1.34:5000/api
```

**Updated (Correct):**

```env
EXPO_PUBLIC_API_URL=http://192.168.1.207:5000/api
```

(Replace 192.168.1.207 with YOUR actual IP)

### Step 3: Verify Server Setup

**Check Server Code:**

```javascript
// server.js - should have these lines:

// ✅ JSON parser for forms
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// ✅ Multer for file uploads
const upload = multer({ dest: "uploads/" });

// ✅ Route for enquiry with image
router.post("/enquiries", upload.single("image"), async (req, res) => {
    const file = req.file;
    const formData = req.body;
    // Process image and save
});
```

**Create Uploads Folder:**

```bash
# At project root, create:
mkdir -p server/uploads
chmod 755 server/uploads
```

### Step 4: Start Server

```bash
cd server
npm install
npm start
```

**Expected Output:**

```
Server running on port 5000
Database connected
Ready to receive API requests
```

### Step 5: Verify API Health

**Test API Connection:**

**Windows (Command Prompt):**

```bash
curl http://192.168.1.207:5000/api/health
```

**macOS/Linux (Terminal):**

```bash
curl http://192.168.1.207:5000/api/health
```

**Expected Response:**

```json
{
    "status": "ok",
    "timestamp": "2024-04-17T..."
}
```

### Step 6: Start App

```bash
expo start

# Scan QR code with:
# - Android: Expo Go app
# - iOS: Built-in camera

# IMPORTANT: Device must be on SAME WiFi network
```

### Step 7: Test Image Upload

1. Open app on device
2. Navigate to "Enquiry" screen
3. Fill in form
4. Tap on image upload field
5. Select an image
6. Submit form

**If Successful:** Image uploads, form submitted ✅

**If Failed:** See troubleshooting section below

---

## Troubleshooting Common Errors

### Error 1: "Network Error: cannot reach server"

**Possible Causes:**

1. ❌ Server not running
2. ❌ Wrong IP in .env
3. ❌ Device on different WiFi
4. ❌ Firewall blocking port 5000

**Solutions:**

1. **Check Server is Running:**

```bash
cd server
npm start
# Should see: "Server running on port 5000"
```

2. **Verify .env IP:**

```bash
# Get your IP
ipconfig (Windows) or ifconfig (macOS)
# Update .env with correct IP
```

3. **Check Device WiFi:**

```bash
# Device must be on SAME network as machine running server
adb shell "getprop | grep wifi"
```

4. **Disable Firewall Temporarily:**

```
Windows: Settings > Firewall > Allow an app > Allow nodejs/node
macOS: System Preferences > Security & Privacy > Firewall Options
```

5. **Test Connection:**

```bash
# From device terminal (if available)
ping 192.168.1.207
curl http://192.168.1.207:5000/api/health
```

---

### Error 2: "Image upload failed" or "Failed to submit form"

**Possible Causes:**

1. ❌ Server not accepting multipart/form-data
2. ❌ Upload folder not writable
3. ❌ File size too large
4. ❌ Image format not supported

**Solutions:**

1. **Check Server Handles Uploads:**

```javascript
// server/routes/enquiryRoutes.js
const multer = require("multer");
const upload = multer({
    dest: "uploads/",
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
    fileFilter: (req, file, cb) => {
        // Only allow images
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only images allowed"));
        }
    },
});

router.post("/enquiries", upload.single("image"), async (req, res) => {
    try {
        const file = req.file;
        const formData = req.body;

        // Process and save
        const enquiry = await Enquiry.create({
            ...formData,
            imagePath: file ? file.path : null,
        });

        res.json({ success: true, data: enquiry });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
```

2. **Verify Upload Folder Exists:**

```bash
# Create if missing
mkdir -p server/uploads

# Check permissions
ls -la server/uploads  (macOS/Linux)
dir server\uploads    (Windows)
```

3. **Check File Size:**

```javascript
// Make sure limit is high enough (15MB recommended)
const upload = multer({
    dest: "uploads/",
    limits: {
        fileSize: 15 * 1024 * 1024, // 15MB
    },
});

// In app body parser config
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
```

4. **Test File Upload with curl:**

```bash
# Create a test image first
# Or use any image file you have

curl -X POST http://192.168.1.207:5000/api/enquiries \
  -F "name=Test User" \
  -F "mobile=9876543210" \
  -F "image=@/path/to/image.jpg" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Error 3: "ERR_CANCELED" or "Request was cancelled"

**Cause:** Request was interrupted

**Solutions:**

1. **Check Network Stability:**

```bash
# From device
ping -c 10 192.168.1.207
# Look for packet loss (should be 0%)
```

2. **Increase Timeout:**

```javascript
// src/services/apiClient.js
const client = axios.create({
    timeout: 30000, // 30 seconds instead of default
    // ... other config
});
```

3. **Retry Failed Requests:**

```javascript
// Wrap upload in retry logic
const uploadWithRetry = async (file, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await uploadImage(file);
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            // Wait before retrying
            await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
    }
};
```

---

### Error 4: Image Uploaded But Not Showing

**Cause:** Image path not correct

**Solutions:**

1. **Check Image Path in Response:**

```javascript
// Server should return full URL
res.json({
    success: true,
    data: {
        id: enquiry._id,
        imagePath: `/uploads/${file.filename}`, // Should be accessible
        imageUrl: `http://192.168.1.207:5000/uploads/${file.filename}`,
    },
});
```

2. **Serve Uploads Folder:**

```javascript
// server.js - Add static file serving
app.use("/uploads", express.static("server/uploads"));
```

3. **Test Image Access:**

```bash
# After upload, verify you can access:
curl http://192.168.1.207:5000/uploads/filename.jpg
```

---

## Complete Working Example

### Client (React Native)

```javascript
import * as ImagePicker from "expo-image-picker";
import getApiClient from "./apiClient";

export const uploadEnquiry = async (enquiryData, imageFile) => {
    try {
        const client = await getApiClient();
        const formData = new FormData();

        // Add form fields
        Object.keys(enquiryData).forEach((key) => {
            formData.append(key, enquiryData[key]);
        });

        // Add image file
        if (imageFile) {
            formData.append("image", {
                uri: imageFile.uri,
                name: imageFile.fileName || `photo_${Date.now()}.jpg`,
                type: "image/jpeg",
            });
        }

        // Send request
        const response = await client.post("/enquiries", formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });

        return response.data;
    } catch (error) {
        console.error("Upload error:", error.message);
        throw error;
    }
};

// Usage in screen
const handleUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
    });

    if (!result.cancelled) {
        try {
            await uploadEnquiry(formData, result.assets[0]);
            Alert.alert("Success", "Enquiry submitted with image");
        } catch (error) {
            Alert.alert("Error", error.message);
        }
    }
};
```

### Server (Express)

```javascript
const express = require("express");
const multer = require("multer");
const path = require("path");

const app = express();

// Middleware
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "uploads"));
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only images allowed"));
        }
    },
});

// Route
app.post("/api/enquiries", upload.single("image"), async (req, res) => {
    try {
        const { name, mobile, email, description } = req.body;
        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

        // Validate
        if (!name || !mobile) {
            return res.status(400).json({
                success: false,
                message: "Name and mobile required",
            });
        }

        // Save to database
        const enquiry = await Enquiry.create({
            name,
            mobile,
            email,
            description,
            imagePath,
        });

        res.json({
            success: true,
            data: enquiry,
            imageUrl: imagePath
                ? `http://${req.get("host")}${imagePath}`
                : null,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});
```

---

## Quick Verification Checklist

- [ ] Machine IP in .env is correct (get from `ipconfig`)
- [ ] Server running: `npm start` in server/ folder
- [ ] Uploads folder exists: `server/uploads/`
- [ ] Device on same WiFi as machine
- [ ] Test API: `curl http://IP:5000/api/health`
- [ ] App shows no "Network Error"
- [ ] Image upload works in enquiry form
- [ ] Image appears in database/server

---

## Still Not Working?

1. **Check server logs:**

```bash
cd server
npm start
# Look for error messages
```

2. **Check app logs:**

```bash
expo start
# Check for network/upload errors
```

3. **Test endpoint directly:**

```bash
curl -X POST http://192.168.1.207:5000/api/enquiries \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","mobile":"123456"}'
```

4. **Check if API URL is consistent:**

```javascript
// In app
console.log("API URL:", process.env.EXPO_PUBLIC_API_URL);

// In server .env
console.log("Server running on: http://192.168.1.207:5000");
```

5. **Reset everything:**

```bash
# Stop server (Ctrl+C)
# Stop app (Ctrl+C)
# Kill any node processes: pkill node (macOS/Linux)
# Restart server: npm start
# Restart app: expo start
```

---

**The key: Make sure .env has the CORRECT IP address of the machine running the server!**
