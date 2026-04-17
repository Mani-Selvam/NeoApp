# Environment Setup Guide - Development vs Production

## Problem

The app is configured with a local development IP (192.168.1.34:5000) which fails when:

- Running on different device/network
- Building for production
- Deploying to app stores
- Network changes

---

## Solution: Multi-Environment Setup

### 1. Development Environment (.env)

**File:** `.env` (Local development machine only)

```env
# Development: Points to your local server
NODE_ENV=development
EXPO_PUBLIC_API_URL=http://192.168.1.34:5000/api

# Firebase (same for dev & prod)
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyBMhgWWgAS13eKrrgMUsSlzeCJnmAw_REo
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=login-form-39e3e.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=login-form-39e3e
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=login-form-39e3e.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=168810107337
EXPO_PUBLIC_FIREBASE_APP_ID=1:168810107337:android:1e2b51148e53f9ad9e9818

# Other dev settings
EXPOSE_TEST_OTP=true
DEBUG_LOGS=true
```

**Usage:**

```bash
# Run with development API
expo start

# Or with local server
npm run dev
```

---

### 2. Production Environment (eas.json)

**File:** `eas.json` (Configured per build profile)

```json
{
  "build": {
    "development": {
      "env": {
        "NODE_ENV": "development",
        "EXPO_PUBLIC_API_URL": "https://neomobile.neophrondev.in/api",
        ...
      }
    },
    "preview": {
      "env": {
        "NODE_ENV": "development",
        "EXPO_PUBLIC_API_URL": "https://neomobile.neophrondev.in/api",
        ...
      }
    },
    "production": {
      "env": {
        "NODE_ENV": "production",
        "EXPO_PUBLIC_API_URL": "https://neomobile.neophrondev.in/api",
        ...
      }
    }
  }
}
```

**Usage:**

```bash
# Build for development
eas build --platform android --profile development

# Build for preview/staging
eas build --platform android --profile preview

# Build for production
eas build --platform android --profile production
```

---

## 🔄 API URL Priority

The app checks in this order:

1. **EXPO_PUBLIC_API_URL** (from .env or eas.json) ← **START HERE**
2. Fallback to cloud: `https://neomobile.neophrondev.in/api`

### Current Setup

```
┌─────────────────────────────────────────┐
│ Development (Running on Device)         │
├─────────────────────────────────────────┤
│ EXPO_PUBLIC_API_URL from .env           │
│ → http://192.168.1.34:5000/api          │
│   ❌ Works ONLY on that network         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Production (App Store Build)            │
├─────────────────────────────────────────┤
│ EXPO_PUBLIC_API_URL from eas.json       │
│ → https://neomobile.neophrondev.in/api  │
│   ✅ Works everywhere                   │
└─────────────────────────────────────────┘
```

---

## 🐛 Fixing the Network Error

### Scenario 1: Local Development (Same Network)

**Goal:** Point to local server

**.env:**

```env
EXPO_PUBLIC_API_URL=http://192.168.1.34:5000/api
# OR use 'localhost' if on same machine:
# EXPO_PUBLIC_API_URL=http://localhost:5000/api
```

**Verify:**

```bash
# Check network IP
ipconfig getifaddr en0  # macOS
ipconfig               # Windows
ifconfig              # Linux

# Test connectivity
curl http://192.168.1.34:5000/api/health
```

### Scenario 2: Different Device on Network

**Goal:** Use your machine's IP

**.env on your dev machine:**

```env
# Get your machine IP first:
# macOS: ipconfig getifaddr en0
# Windows: ipconfig (IPv4 Address)
# Linux: ifconfig

EXPO_PUBLIC_API_URL=http://YOUR_MACHINE_IP:5000/api
```

**Example:**

```env
# If your machine IP is 192.168.1.207:
EXPO_PUBLIC_API_URL=http://192.168.1.207:5000/api
```

### Scenario 3: Production / Different Network

**Goal:** Use cloud server

**.env:**

```env
EXPO_PUBLIC_API_URL=https://neomobile.neophrondev.in/api
```

**Or skip .env and let it default to cloud API**

### Scenario 4: Docker / VPN Environment

**Goal:** Use Docker container or VPN IP

**.env:**

```env
# Docker container (from another service)
EXPO_PUBLIC_API_URL=http://backend:5000/api

# Or if accessing from outside Docker
EXPO_PUBLIC_API_URL=http://docker.local:5000/api

# Or with VPN
EXPO_PUBLIC_API_URL=http://vpn-server:5000/api
```

---

## 🖼️ Image Upload Issues

### Issue: Images Fail to Upload

**Root Cause:** API URL mismatch between client and server

**Fix:**

1. **Ensure Server is Running**

```bash
cd server
npm start
# Should see: "Server running on port 5000"
```

2. **Check API URL Matches**

```javascript
// In apiConfig.js - should match server
EXPO_PUBLIC_API_URL=http://192.168.1.34:5000/api
```

3. **Verify Image Upload Endpoint**

```javascript
// src/services/apiClient.js or similar
POST /api/enquiries (with image in FormData)
```

4. **Check Server Image Handler**

```javascript
// server/routes/enquiryRoutes.js
app.post("/enquiries", (req, res) => {
    // Should handle file uploads
    const file = req.file; // or req.files
    // Store in uploads/ folder
});
```

5. **Test Image Upload**

```bash
# Using curl
curl -X POST http://192.168.1.34:5000/api/enquiries \
  -F "file=@image.jpg" \
  -H "Authorization: Bearer TOKEN"
```

---

## ⚙️ Configuration Checklist

### For Local Development

- [ ] `.env` has correct local IP/localhost
- [ ] Server running on that IP/port
- [ ] Device on same network as server
- [ ] Firewall allows port 5000
- [ ] `ipconfig` / `ifconfig` matches `.env`

### For Building APK/AAB

- [ ] `eas.json` has production/preview profiles
- [ ] Each profile has correct `EXPO_PUBLIC_API_URL`
- [ ] Cloud API URL is HTTPS (not HTTP)
- [ ] Firebase credentials match production

### For Image Upload

- [ ] Server has `/uploads` folder with write permissions
- [ ] Image validation enabled (size, type, etc)
- [ ] FormData sent correctly from client
- [ ] API response includes image URL

---

## 🚀 Quick Fixes

### Option 1: Use Cloud API Everywhere

```env
# .env
EXPO_PUBLIC_API_URL=https://neomobile.neophrondev.in/api
```

✅ **Pros:** Works everywhere, no local setup  
❌ **Cons:** Can't develop offline, server changes affect all

### Option 2: Use Localhost + Port Forwarding

```bash
# On your machine
adb forward tcp:5000 tcp:5000

# In .env
EXPO_PUBLIC_API_URL=http://localhost:5000/api
```

✅ **Pros:** Easy to use  
❌ **Cons:** Only works with USB debugging

### Option 3: Use Local IP (Current)

```env
# Get your machine IP first
EXPO_PUBLIC_API_URL=http://192.168.1.207:5000/api
```

✅ **Pros:** Works over WiFi  
❌ **Cons:** Breaks when network changes

### Option 4: Use Environment-Specific URLs (Recommended)

```env
# .env (local dev)
EXPO_PUBLIC_API_URL=http://192.168.1.207:5000/api
NODE_ENV=development

# eas.json (production)
"production": {
  "env": {
    "EXPO_PUBLIC_API_URL": "https://neomobile.neophrondev.in/api",
    "NODE_ENV": "production"
  }
}
```

✅ **Pros:** Works everywhere  
✅ **Cons:** None

---

## 🔍 Debugging API Issues

### Check Current API URL

```javascript
// In console
console.log(process.env.EXPO_PUBLIC_API_URL);
```

### Check What Server Receives

```bash
# Run with verbose logging
NODE_ENV=development npm start

# Should show all requests:
# POST /api/enquiries
# GET /api/users/profile
# etc.
```

### Test API Directly

```bash
# Test health check
curl http://192.168.1.34:5000/api/health

# Test with authentication
curl -H "Authorization: Bearer TOKEN" \
  http://192.168.1.34:5000/api/enquiries

# Test file upload
curl -X POST http://192.168.1.34:5000/api/enquiries \
  -F "file=@image.jpg" \
  -H "Authorization: Bearer TOKEN"
```

### Check Network Connectivity

```bash
# From device
ping 192.168.1.34

# Check port
nc -zv 192.168.1.34 5000

# Check WiFi
adb shell netstat
```

---

## 📱 Common Error Messages & Fixes

### Error: "Cannot reach server (http://192.168.1.34:5000/api)"

**Causes:**

1. Server not running
2. Wrong IP address
3. Different network
4. Firewall blocking

**Fixes:**

```bash
# 1. Start server
cd server && npm start

# 2. Get correct IP
ifconfig | grep "inet " (macOS)
ipconfig                (Windows)

# 3. Update .env
EXPO_PUBLIC_API_URL=http://NEW_IP:5000/api

# 4. Check firewall
# Allow port 5000 in firewall settings

# 5. Verify connectivity
ping 192.168.1.34
```

### Error: "Image upload failed"

**Causes:**

1. Wrong API URL
2. Multipart/form-data not supported
3. File size too large
4. Server upload folder missing

**Fixes:**

```bash
# 1. Verify API URL
console.log(API_URL); // Should match server

# 2. Check server accepts files
# POST /api/enquiries should have middleware:
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

# 3. Check uploads folder
mkdir -p server/uploads
chmod 755 server/uploads

# 4. Test upload with curl
curl -X POST http://192.168.1.34:5000/api/enquiries \
  -F "file=@image.jpg" \
  -H "Authorization: Bearer TOKEN"
```

### Error: "HTTPS required in production"

**Cause:** Using HTTP in production build

**Fix:**

```json
// eas.json - production
{
    "env": {
        "EXPO_PUBLIC_API_URL": "https://neomobile.neophrondev.in/api"
    }
}
```

---

## 📋 Migration Path

### Step 1: Local Development (Now)

```env
EXPO_PUBLIC_API_URL=http://192.168.1.34:5000/api
NODE_ENV=development
```

→ Run on device on same network

### Step 2: Different Networks (Later)

```env
EXPO_PUBLIC_API_URL=http://192.168.1.207:5000/api
# Update whenever IP changes
```

### Step 3: Cloud API (Production)

```env
EXPO_PUBLIC_API_URL=https://neomobile.neophrondev.in/api
```

→ Works everywhere

### Step 4: Multi-Profile (Recommended)

- **Development** (.env): Local server
- **Preview** (eas.json): Cloud server for testing
- **Production** (eas.json): Cloud server for release

---

## ✅ Verification

### Test Development Setup

```bash
# 1. Start server
cd server
npm start

# 2. Get your machine IP
# macOS
ipconfig getifaddr en0
# Should output: 192.168.1.207 or similar

# 3. Update .env
EXPO_PUBLIC_API_URL=http://192.168.1.207:5000/api

# 4. Start app
expo start

# 5. Scan QR code on same WiFi network
# App should load without "Network Error"

# 6. Create enquiry with image
# Image should upload successfully
```

### Test Production Setup

```bash
# 1. Build preview
eas build --platform android --profile preview

# 2. Download and install APK

# 3. Open app
# Should use: https://neomobile.neophrondev.in/api

# 4. Create enquiry with image
# Should work without network errors
```

---

## 🎯 Summary

| Environment | Config                        | Status                   |
| ----------- | ----------------------------- | ------------------------ |
| Local Dev   | `.env` with local IP          | ✅ Works on same network |
| Preview     | `eas.json` preview profile    | ✅ Works for testing     |
| Production  | `eas.json` production profile | ✅ Works everywhere      |

**Next Steps:**

1. Get your machine IP: `ipconfig` (Windows) or `ifconfig` (macOS)
2. Update `.env` with correct IP
3. Start server: `cd server && npm start`
4. Start app: `expo start`
5. Test image upload

---

**The key is: API URL in .env must match where your server is running.** 🎯
