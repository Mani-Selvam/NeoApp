# Image Upload Issue - Complete Fix Guide

## Problems Found & Fixed ✅

### 1. **Missing "Cost" Validation on Client Side** ⚠️

**Issue:** Server requires `cost` field, but client form didn't validate it.

- User fills form WITHOUT cost value
- Submits with image
- Server rejects: "Missing required fields"
- Error shows: "Failed to create enquiry"

**Fixed:** ✅ Added cost validation to match server requirement

### 2. **FormData Multipart Handling** ⚠️

**Issue:** When sending FormData with axios, headers might not be set correctly

- Client sends FormData but axios might interfere with Content-Type boundary
- Server multer doesn't receive file properly
- Image upload silently fails

**Fixed:** ✅ Improved FormData handling and proper header configuration

### 3. **Error Messages Not Specific Enough** ⚠️

**Issue:** Generic "Missing required fields" doesn't tell user what's missing

**Fixed:** ✅ Improved error messages to show exactly which fields are missing

---

## What to Test Now

### Test 1: Create Enquiry WITH Cost & Image

**Steps:**

1. Open AddEnquiryScreen
2. Fill ALL fields:
    - Name: "Test User"
    - Mobile: "9876543210"
    - Product: (Select one)
    - **Cost/Lead Value: "50000"** ← THIS IS NOW REQUIRED
    - Address: "Somewhere"
3. Tap image icon and add a photo
4. Tap "Create Enquiry"

**Expected Result:**
✅ Success! Enquiry created with image  
Error Message: None

**If Still Fails:**

- Check server console for exact error
- Server will now show: "Missing required fields: cost (Lead Value)" or similar
- Look for "Image uploaded successfully" log message

---

### Test 2: Create Enquiry WITHOUT Cost

**Steps:**

1. Fill form WITHOUT cost value
2. Add image
3. Try to submit

**Expected Result:**
❌ Should show error in red under "Cost" field:
"Cost is required"

**Why?** Cost is now required because:

- Database schema requires it: `cost: { type: Number, required: true }`
- Server validates it
- Client now validates before submitting

---

### Test 3: Check Server Logs

**What to look for in server console:**

✅ **Success Case:**

```
✅ Image uploaded successfully: {
  filename: "1234567890_image.jpg",
  originalName: "image.jpg",
  size: 245678,
  path: "/uploads/1234567890_image.jpg"
}
```

❌ **Failure Case:**

```
⚠️ Rejected invalid image URI: blob:...
⚠️ Image field is empty or invalid type
ℹ️ No image provided in enquiry
```

**Or validation error:**

```
{
  "message": "Missing required fields: cost (Lead Value)"
}
```

---

## How to Verify Fixes

### On Client Side (AddEnquiryScreen)

1. **Cost Validation Added:**
    - Try to submit without cost
    - Should show red error: "Cost is required"

2. **Better FormData Handling:**
    - App console shows: "📤 FormData Request"
    - Check that URL and method are correct

### On Server Side (enquiryRoutes.js)

1. **Detailed Error Messages:**
    - Instead of "Missing required fields"
    - Now shows: "Missing required fields: name, cost (Lead Value)"

2. **Image Upload Logging:**
    - When image uploads: "✅ Image uploaded successfully"
    - When it fails: "⚠️ Rejected invalid image URI"
    - When no image: "ℹ️ No image provided in enquiry"

---

## Common Issues & Solutions

### Issue 1: "Missing required fields: cost (Lead Value)"

**Solution:** Add a cost value to the form before submitting.

```
Bad:  Form { name: "John", mobile: "9876543210", product: "Product A", cost: "" }
Good: Form { name: "John", mobile: "9876543210", product: "Product A", cost: "50000" }
```

The app now shows error immediately:

```
❌ Cost is required  (red text below cost field)
```

---

### Issue 2: "Failed to create enquiry" (after adding all fields)

**Check Server Logs:**

**A) FormData not being sent correctly:**

- Look for: "Image uploaded successfully" ✅ or "No image provided" ℹ️
- If you see "No image provided" but you selected one, then FormData issue
- Check that image field is being appended correctly

**B) API Connection Issue:**

- Check .env file has correct IP/URL
- Make sure server is running: `npm start` in server folder
- Test: `curl http://localhost:5000/api/health`

**C) Authentication Issue:**

- Check if token is valid
- Try logging out and back in
- Check network request headers for Authorization

---

## Changes Made

### 1. **AddEnquiryScreen.js**

```javascript
// Added cost validation
if (!form.cost || Number(form.cost) <= 0) e.cost = "Cost is required";

// Improved FormData logging
console.log("🔍 Uploading enquiry with FormData", { imageValue, isLocalFile });

// Explicit Content-Type header
await client.post("/enquiries", fd, {
    headers: { "Content-Type": "multipart/form-data" },
});
```

### 2. **enquiryRoutes.js (Server)**

```javascript
// Better validation messages
const missingFields = [];
if (!cost == null || cost === "") missingFields.push("cost (Lead Value)");

// Better image upload logging
if (req.file) {
    console.log("✅ Image uploaded successfully:", {
        filename: req.file.filename,
        size: req.file.size,
    });
}
```

### 3. **apiClient.js**

```javascript
// Improved FormData handling
if (config.data instanceof FormData) {
    delete config.headers["Content-Type"]; // Let axios set it
    console.log("📤 FormData Request:", { url, method });
}
```

---

## Step-by-Step Debugging

### Step 1: Check if Cost is the Issue

**In AddEnquiryScreen, try:**

1. Add cost value: "50000"
2. Add product
3. Add image
4. Submit

✅ If works → Cost was the issue  
❌ If fails → Continue to step 2

### Step 2: Check Server Logs

**Start server with:**

```bash
cd server
npm start
```

**Then submit form and look for:**

✅ Good:

```
✅ Image uploaded successfully
Enquiry created: enqNo=ENQ001
```

❌ Bad:

```
⚠️ Image field is empty or invalid type
Error: Missing required fields: cost (Lead Value)
```

### Step 3: Check Network in DevTools

**On web/expo debug:**

1. Open network tab
2. Submit form with image
3. Look for POST to `/api/enquiries`
4. Check:
    - Headers: `Content-Type: multipart/form-data`
    - Body: FormData with name, mobile, product, cost, image
    - Response: Success or error message

### Step 4: Check API Connectivity

**Test API directly:**

```bash
# Health check
curl http://localhost:5000/api/health

# If fails, try production
curl https://neomobile.neophrondev.in/api/health
```

---

## If Still Not Working

### 1. Restart Everything

```bash
# Kill node processes
pkill node

# Clear app cache (Expo)
expo start --clear

# Restart server
cd server && npm start
```

### 2. Check .env Configuration

```
# In .env at project root
EXPO_PUBLIC_API_URL=http://192.168.1.34:5000/api
# or for cloud
EXPO_PUBLIC_API_URL=https://neomobile.neophrondev.in/api
```

### 3. Verify Server Upload Folder

```bash
# Create uploads folder if missing
mkdir -p server/uploads
chmod 755 server/uploads

# Verify it exists
ls -la server/uploads
```

### 4. Check Multer Configuration

**In enquiryRoutes.js, multer should have:**

```javascript
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only images allowed"));
        }
    },
});
```

---

## Expected Flow Now

```
User fills form:
├─ Name: "John" ✓
├─ Mobile: "9876543210" ✓
├─ Product: "ProductA" ✓
├─ Cost: "50000" ✓ (NOW VALIDATED)
└─ Image: (picked) ✓

User submits:
├─ Client validates ALL fields (including cost)
├─ Client sends FormData with:
│  ├─ name, mobile, product, cost as text
│  └─ image as file (with proper boundary)
├─ Server receives multipart request
├─ Multer extracts file → req.file
├─ Server saves to /uploads/filename.jpg
├─ Server creates database record with image path
└─ Success! ✓

If cost missing:
├─ Form shows red error: "Cost is required"
└─ Prevent submit ✓
```

---

## What Each Log Message Means

| Log                              | Meaning                 | Action                               |
| -------------------------------- | ----------------------- | ------------------------------------ |
| `📤 FormData Request`            | FormData being sent     | Normal, good                         |
| `✅ Image uploaded successfully` | File saved on server    | Normal, good                         |
| `⚠️ Image field is empty`        | No image in request     | User didn't select image             |
| `⚠️ Rejected invalid image URI`  | Image format wrong      | Client is sending blob:// or file:// |
| `ℹ️ No image provided`           | Image optional, skipped | Normal, image is optional            |
| `Missing required fields`        | Validation failed       | Check which fields                   |

---

## Next Steps

1. **Save the files** (changes already applied)
2. **Restart app** and server
3. **Test with cost value**
4. **Check server logs** when submitting
5. **Report any errors** you see in the logs

---

## Testing Checklist

- [ ] Cost field shows validation error if empty
- [ ] Can submit with all fields + image
- [ ] Server logs show "Image uploaded successfully"
- [ ] Enquiry appears in database with image path
- [ ] Image is accessible at the saved path
- [ ] Error messages are clear and specific

---

**If you encounter any new errors, share:**

1. The error message shown to user
2. Server console logs
3. Network request/response (from DevTools)
4. Which field values were provided
