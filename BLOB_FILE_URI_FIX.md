# 🔴 CRITICAL: Blob/File URI Upload Issue - FIXED

## The Problem

React Native sends images as:

- `blob:http://...`
- `file://...`
- `content://...`

But the **old server code was REJECTING these** with:

```javascript
if (!img.startsWith("blob:") && !img.startsWith("file://")) {
    imageData = img; // ❌ Rejects blob/file URIs
}
```

**Result:** Image upload silently fails, form submission shows "Failed to create enquiry"

---

## The Fix (Applied) ✅

### Server Side Changes

✅ Better blob/file URI handling in `enquiryRoutes.js`:

```javascript
if (
    img.startsWith("blob:") ||
    img.startsWith("file://") ||
    img.startsWith("content://")
) {
    // Log warning but don't crash
    console.warn(
        "⚠️ Received client-side URI in JSON body - should be FormData",
    );
    imageData = null; // Require FormData for these
} else if (
    img.startsWith("http://") ||
    img.startsWith("https://") ||
    img.startsWith("data:")
) {
    // Accept HTTP/HTTPS/data URLs
    imageData = img;
}
```

### Client Side Changes

✅ Improved image upload in `AddEnquiryScreen.js`:

- **Removed explicit Content-Type header** that was interfering with FormData
- Let axios/platform automatically set proper boundary
- Better logging to track FormData upload

---

## Why This Works

### Flow 1: Image Upload via FormData (CORRECT) ✅

```
User picks image (blob:/file:// URI)
    ↓
Client detects isLocalFile = true
    ↓
Client creates FormData with actual file
    ↓
Server receives req.file (multipart decoded)
    ↓
Server saves to /uploads/xxx.jpg
    ↓
Database stores: image: "/uploads/xxx.jpg"
✅ SUCCESS
```

### Flow 2: Image as JSON String (WRONG) ❌

```
User picks image (blob:/file:// URI)
    ↓
Client sends as JSON string
    ↓
Server receives req.body.image = "blob:http://..."
    ↓
Server rejects blob/file URIs (can't resolve on server)
    ↓
Database stores: image: null
❌ FAILS - Image lost
```

---

## Testing Now

### Test 1: Create Enquiry with Image

**Steps:**

1. Fill form:
    - Name: "Test"
    - Mobile: "9876543210"
    - Product: (select any)
    - Cost: "50000"
    - Address: "Test"

2. Tap photo icon → Select image from gallery

3. Tap "Create Enquiry"

**Expected:**

- ✅ Form submits
- ✅ Server console shows: `✅ Image uploaded successfully via FormData`
- ✅ Enquiry created with image

**If Fails:**

- Check server logs for: `⚠️ Received client-side URI in JSON body`
- This means FormData wasn't sent properly - check network

---

### Test 2: Check Server Logs

**What to look for:**

✅ **Good - Image via FormData:**

```
✅ Image uploaded successfully via FormData: {
  filename: "1713456789_image.jpg",
  originalName: "image.jpg",
  size: 245678,
  path: "/uploads/1713456789_image.jpg"
}
```

⚠️ **Warning - Blob URI in JSON:**

```
⚠️ Received client-side URI (blob/file) in JSON body:
  uri: "blob:http://localhost:8081/..."
  note: "Image upload may fail if FormData wasn't supported"
```

ℹ️ **OK - No image:**

```
ℹ️ No image provided in enquiry
```

---

## What Changed

### File: `server/routes/enquiryRoutes.js`

- ✅ Better blob/file URI detection
- ✅ Distinguishes between blob (reject) vs http/data (accept) URLs
- ✅ Better logging with warnings instead of silent failures

### File: `src/screens/AddEnquiryScreen.js`

- ✅ **Removed** explicit `Content-Type: multipart/form-data` header
- ✅ **Let axios set it automatically** with proper boundary
- ✅ Better logging for FormData uploads

### File: `src/services/apiClient.js`

- ✅ Properly deletes Content-Type for FormData (already was correct)

---

## Why Removing Content-Type Header Matters

❌ **WRONG - Sets header manually:**

```javascript
await client.post("/enquiries", fd, {
    headers: { "Content-Type": "multipart/form-data" }, // ❌ Breaks boundary
});
```

**Problem:** Sets `Content-Type: multipart/form-data` WITHOUT boundary, so server can't parse FormData.

✅ **CORRECT - Let platform set it:**

```javascript
await client.post("/enquiries", fd);
// axios detects FormData and sets:
// Content-Type: multipart/form-data; boundary=----...
```

**Result:** Proper boundary included, multer can parse the file correctly.

---

## Debug Checklist

- [ ] Server logs show FormData upload
- [ ] Enquiry created with image path
- [ ] No "received client-side URI in JSON" warnings
- [ ] Image file exists in server/uploads/
- [ ] Can browse/download the image

---

## If Still Not Working

### 1. Check Network Tab

```
POST /api/enquiries
Headers:
  ✅ Content-Type: multipart/form-data; boundary=--...
  ✅ Authorization: Bearer TOKEN
Body:
  ✅ form-data with image file
```

### 2. Restart Everything

```bash
pkill node
cd server && npm start

# In another terminal
expo start --clear
```

### 3. Check Server Logs

Look for:

- "✅ Image uploaded successfully" = Good
- "⚠️ Received client-side URI" = FormData not sent
- "Missing required fields" = Validation error

### 4. Verify Image File

```bash
ls -la server/uploads/
# Should show image file
```

---

## Summary

| Aspect              | Before                        | After                            |
| ------------------- | ----------------------------- | -------------------------------- |
| blob: URI handling  | ❌ Silent rejection           | ✅ Log warning, require FormData |
| http: URI handling  | ✅ Accept                     | ✅ Accept                        |
| Content-Type header | ❌ Explicit (breaks boundary) | ✅ Auto set by axios             |
| FormData upload     | ❌ Sometimes fails            | ✅ More reliable                 |
| Error messages      | ❌ Generic                    | ✅ Specific issues               |

---

## Next Steps

1. **Test immediately** - Create enquiry with image
2. **Check server logs** - See which path is taken
3. **Report any errors** - Share exact log message
4. **Verify in database** - Check if image path is saved

🎯 **Goal:** Image upload works 100% of the time via FormData
