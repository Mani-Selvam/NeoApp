# Python Web Scraper Setup Guide

The NeoApp now uses an advanced Python-based web scraper powered by BeautifulSoup4 for extracting comprehensive business data from websites.

## Prerequisites

**Python 3.8+** must be installed on your system. Check if you have Python:

```bash
python --version
# or
python3 --version
```

⚠️ **If you don't have Python**, download it from [python.org](https://www.python.org/downloads/)

## Installation Steps - cPanel Hosting ⭐ **START HERE FOR CPANEL**

### 1. Access Your cPanel SSH Terminal

**Option A: Using cPanel Terminal**

1. Log into cPanel
2. Go to **Terminal** (under Advanced section)
3. Open terminal directly in browser

**Option B: Using SSH Client**

1. Install PuTTY (Windows) or use Terminal (Mac/Linux)
2. Connect to: `your-domain.com` port `22`
3. Username: `cpanel_username`
4. Password: `cpanel_password`

### 2. Check Which Python Version is Available

```bash
# Check available Python versions in cPanel
python3 --version
# or
python --version

# If neither works, check what's available
ls /usr/bin/python*

# List all Python interpreters in cPanel
ea_install_profile list | grep python
```

### 3. Install Python via EasyApache (Recommended for cPanel)

🚀 **Most Reliable: Use cPanel's Built-in Python Support**

```bash
# SSH into your cPanel account, then:
uapi CPANEL apache_handler_module set_modules \
    ea-php81-php-cli ea-python311

# Or request your hosting provider to enable Python via:
# WHM > EasyApache 4 > Customize > PHP Extensions > Python Support
```

### 4. Install Python Manually (If EasyApache Unavailable)

```bash
# Add EPEL repository (extra packages)
sudo yum install epel-release -y

# Install Python 3.11 (or latest available)
sudo yum install python311 python311-pip -y

# Verify installation
python3.11 --version
pip3.11 --list
```

### 5. Create Python Virtual Environment (Best Practice)

```bash
# Navigate to your app directory
cd ~/NeoApp/server

# Note: cPanel usually has a 'public_html' directory for web content
# Your app might be in: ~/public_html/NeoApp or ~/NeoApp

# Create virtual environment
python3.11 -m venv venv

# Activate it
source venv/bin/activate

# Verify (you should see (venv) in terminal prompt)
which python
```

### 6. Install Dependencies in cPanel

```bash
# Make sure you're in the server directory with venv activated
cd ~/NeoApp/server
source venv/bin/activate

# Install requirements
pip install --upgrade pip
pip install -r requirements.txt

# Verify
pip list | grep -E "requests|beautifulsoup4"
```

### 7. Update Node.js Path to Use Virtual Environment Python

Edit `server/services/pythonScraperBridge.js` and ensure it uses the venv Python:

```javascript
const pythonExecutable =
    "/home/YOUR_CPANEL_USER/NeoApp/server/venv/bin/python3.11";
// Or keep the auto-detection which will find it
```

### 8. Set File Permissions for cPanel

```bash
# Go to your app directory
cd ~/NeoApp/server

# Make Python script executable
chmod +x services/pythonWebScraper.py

# Set proper permissions for the entire app
find . -type f -name "*.py" -exec chmod 755 {} \;

# Ensure app data directories are writable
chmod 755 uploads/
chmod 755 tmp/
```

### 9. Update Node.js Server Script (Optional but Recommended)

Add this to the top of `server/server.js` to use the virtual environment:

```javascript
// Activate virtual environment Python path for cPanel
process.env.PATH =
    "/home/YOUR_CPANEL_USERNAME/public_html/NeoApp/server/venv/bin:" +
    process.env.PATH;
```

Replace `YOUR_CPANEL_USERNAME` with your actual cPanel username.

### 10. cPanel-Specific Environment Variables

Create a `.env` file in your server directory:

```bash
cat > ~/NeoApp/server/.env << 'EOF'
# Python Configuration for cPanel
PYTHON_CMD=/home/YOUR_CPANEL_USERNAME/NeoApp/server/venv/bin/python3.11
NODE_ENV=production
PYTHON_PATH=/home/YOUR_CPANEL_USERNAME/NeoApp/server

# Your other environment variables
DATABASE_URL=your_db_url
JWT_SECRET=your_secret
EOF
```

Replace `YOUR_CPANEL_USERNAME` with your actual cPanel username.

### 11. Restart Node.js Server on cPanel

**Option A: Using cPanel Node.js Manager**

1. Log into cPanel
2. Go to **Node.js Manager** (under Software section)
3. Find your app
4. Click "Restart"

**Option B: Manual Restart via SSH**

```bash
# Find and kill existing process
ps aux | grep node
kill -9 <process_id>

# Or use PM2 if installed
pm2 restart NeoApp

# Or restart forever
forever restart app.js
```

### 12. Test Python Setup on cPanel

```bash
# SSH into cPanel, then:
cd ~/NeoApp/server
source venv/bin/activate

# Test directly
python3.11 services/pythonWebScraper.py "https://github.com"

# Should output JSON with scraped data
```

### 13. Check cPanel Logs

```bash
# View Node.js error logs
tail -f ~/NeoApp/logs/error.log

# View access logs
tail -f ~/NeoApp/logs/access.log

# Check Python errors specifically
grep -i "python\|spawn" ~/NeoApp/logs/error.log
```

---

## Installation Steps - Original (Local/VPS)

### 1. Install Python Dependencies

Navigate to the server directory and install required packages:

```bash
cd server
pip install -r requirements.txt
```

**What gets installed:**

- `requests` - Makes HTTP requests to fetch websites
- `beautifulsoup4` - Parses HTML and extracts data

**For Python 3.9+**, you may need to use `pip3`:

```bash
pip3 install -r requirements.txt
```

### 2. Verify Installation

Test that Python is accessible from Node.js:

```bash
python --version
# Should output: Python 3.x.x
```

If you get "command not found", try `python3` instead.

## Data Extraction Capabilities

The Python scraper extracts:

| Data Type             | Description                                              | Source                          |
| --------------------- | -------------------------------------------------------- | ------------------------------- |
| **Company Name**      | Business name from title, h1, or schema                  | `<title>`, `<h1>`, JSON-LD      |
| **Email Addresses**   | All business emails found                                | Text content, mailto links      |
| **Phone Numbers**     | Contact numbers in various formats                       | Text content, tel links         |
| **Location**          | Address or location information                          | `<address>` tag, text patterns  |
| **Products/Services** | Business offerings                                       | Product sections, schema markup |
| **Social Media**      | Links to LinkedIn, Facebook, Twitter, Instagram, YouTube | Link analysis                   |
| **Contact Info**      | Dedicated contact page information                       | Contact sections                |
| **Website Metadata**  | Description, keywords, language, tech stack              | Meta tags, content analysis     |

## Testing the Integration

### Test from Frontend:

1. Open the app and navigate to the Enquiry screen
2. Tap the **Globe Icon** (Add from Website)
3. Enter a test URL: `https://github.com` or `https://amazon.com`
4. Tap "Scrape Website"
5. Review extracted data with suggestions panel

### Test from Server (Optional):

```bash
cd server
python services/pythonWebScraper.py "https://github.com"
```

Expected output:

```json
{
  "success": true,
  "companyName": "GitHub",
  "emails": ["contact@github.com"],
  "phones": [],
  "location": "United States",
  "productDetails": ["Version control", "Code hosting"],
  "socialMedia": {"twitter": "https://twitter.com/github"},
  "metadata": {"description": "GitHub is...", "tech_stack": ["React"]},
  "contactInfo": {...}
}
```

## Troubleshooting

### cPanel-Specific Issues

#### "spawn python ENOENT" on cPanel

**Solution:**

1. **Verify Python location on cPanel:**

    ```bash
    which python3.11
    # Should output: /opt/rh/rh-python311/root/usr/bin/python3.11

    # Or check all options:
    ls -la /usr/bin/python*
    ls -la /opt/rh/*/root/usr/bin/python*
    ```

2. **Update pythonScraperBridge.js with full path:**

    ```bash
    # Find the exact Python path
    which python3.11 > python_path.txt
    cat python_path.txt
    ```

3. **Edit pythonScraperBridge.js** (line ~74):

    ```javascript
    // For cPanel, use full path from which python3.11
    const pythonExecutable = "/opt/rh/rh-python311/root/usr/bin/python3.11";
    ```

4. **Restart Node.js in cPanel:**
    - Go to cPanel > Node.js Manager > Restart

#### "ModuleNotFoundError: No module named 'requests'"

**Solution in cPanel:**

```bash
# SSH into cPanel
cd ~/NeoApp/server

# Use the correct pip for your Python version
/opt/rh/rh-python311/root/usr/bin/pip3.11 install -r requirements.txt

# Or if using virtual environment:
source venv/bin/activate
pip install -r requirements.txt
```

#### Python works in SSH but fails in Node.js

**Solution:**

1. **Activate virtual environment in server startup:**

    Create wrapper script: `~/NeoApp/start-server.sh`

    ```bash
    #!/bin/bash
    cd ~/NeoApp/server
    source venv/bin/activate
    node server.js
    ```

    Make executable:

    ```bash
    chmod +x ~/NeoApp/start-server.sh
    ```

2. **Use this in cPanel Node.js Manager:**
    - Instead of `node server.js`
    - Use: `~/NeoApp/start-server.sh`

#### cPanel says "Port already in use"

```bash
# Kill existing Node.js process
ps aux | grep node
kill -9 <process_id>

# Or check which port your app is using
lsof -i :8081

# If port 8081 is used, change in your .env
# PORT=8082
```

#### Permission denied errors

```bash
# Fix file permissions in cPanel
cd ~/NeoApp/server

# Make Python script executable
chmod +x services/pythonWebScraper.py

# Make all Python files executable
find . -name "*.py" -exec chmod 755 {} \;

# Ensure dirs are writable by the Node.js user
chown -R nobody:nobody uploads/
chown -R nobody:nobody tmp/
chmod 755 uploads/
chmod 755 tmp/
```

#### cPanel Suspended Account

If your cPanel account gets "suspended" for high resource usage:

```bash
# Optimize scraper timeout in pythonScraperBridge.js
timeout: 15000,  // Reduce from 20000 to 15 seconds

# Limit max concurrent scrapes in your API
// Add rate limiting middleware
MAX_CONCURRENT_SCRAPES=3
```

---

### General Troubleshooting

### "Python command not found"

**Solution:** Add Python to your system PATH or use the full path:

```bash
# Windows
C:\Python311\python.exe server/services/pythonWebScraper.py "https://example.com"

# macOS/Linux
/usr/bin/python3 server/services/pythonWebScraper.py "https://example.com"
```

### "Module 'requests' not found"

**Solution:** Reinstall dependencies:

```bash
pip install --upgrade pip
pip install -r server/requirements.txt
```

### "Connection timeout"

- The website might be blocking automated requests
- Check internet connection
- Try a different website

### "No data extracted"

- Some websites have anti-scraping measures
- Try websites with structured HTML data
- Check browser console for specific error messages

## File Locations

- **Python Scraper:** `server/services/pythonWebScraper.py`
- **Node.js Bridge:** `server/services/pythonScraperBridge.js`
- **Backend Endpoint:** `server/routes/enquiryRoutes.js` (POST /scrape-website)
- **Frontend Modal:** `src/screens/EnquiryScreen.js`
- **Dependencies:** `server/requirements.txt`

## Performance Notes

- **Timeout:** 15-20 seconds per website (configurable)
- **Data Freshness:** Real-time extraction
- **Cache:** Results are NOT cached (fresh data on each request)
- **Limitations:** 10MB max response size (for very large websites)

## Security

- SSL/TLS verification enabled
- User-Agent spoofing with realistic browser header
- No sensitive data stored
- Auth required for all scraping requests (JWT token)

## Window Installation (if Python fails)

If Python command doesn't work on Windows:

1. **Reinstall Python with PATH option:**
    - Uninstall Python (Control Panel > Programs)
    - Download from python.org
    - ✅ Check "Add Python to PATH" during installation
    - Restart your terminal/VSCode

2. **Or manually add to PATH:**
    - Find your Python installation: `where python` in cmd
    - Add that directory to Windows environment variables

3. **Test:**
    ```cmd
    python --version
    ```

## Production Deployment Guide

### 🎯 QUICK START: cPanel Deployment (Most Users)

**👉 Use the cPanel installation guide above instead** → [Installation Steps - cPanel Hosting](#installation-steps---cpanel-hosting-)

**tl;dr for cPanel users:**

```bash
# 1. SSH into cPanel
ssh your_username@your_domain.com

# 2. Create Python venv
cd ~/NeoApp/server
python3.11 -m venv venv
source venv/bin/activate

# 3. Install packages
pip install -r requirements.txt

# 4. Restart Node.js from cPanel > Node.js Manager
```

---

### ⚠️ Problem: "Failed to spawn python process: spawn python ENOENT"

This error occurs in production because Python is not in the system PATH. Here's the complete fix:

### Step 1: Ensure Python is Installed

**cPanel (Shared/Managed Hosting):**

```bash
# SSH into cPanel
ssh your_username@your_domain.com

# Check available Python versions
python3.11 --version
# or check installed versions
ls /opt/rh/*/root/usr/bin/python*
```

If not available, contact your hosting provider to enable Python via cPanel's EasyApache or MultiPHP.

**Linux/Ubuntu (VPS/Dedicated):**

```bash
sudo apt-get update
sudo apt-get install python3 python3-pip
python3 --version  # Verify (should be 3.8+)
```

**macOS:**

```bash
# Using Homebrew
brew install python@3.11
brew link python@3.11
python3 --version
```

**Windows Server:**

- Download Python from [python.org](https://www.python.org/downloads/)
- During installation, ✅ **MUST check** "Add Python to PATH"
- Restart the server after installation

### Step 2: Verify Python is in PATH

Run these commands on your production server:

```bash
# Should work on all platforms
which python3  # Unix/Linux/macOS
where python   # Windows

# Output should show the full path, e.g.:
# /usr/bin/python3  or  C:\Python311\python.exe
```

### Step 3: Install Dependencies on Production

```bash
cd server
pip3 install -r requirements.txt
# or
pip install -r requirements.txt
```

Verify installation:

```bash
python3 -c "import requests, bs4; print('✓ All dependencies OK')"
```

### Step 4: Environment Variables (Optional but Recommended)

Add to your `.env` file on production:

```
PYTHON_CMD=python3
NODE_ENV=production
```

### Step 5: Test Before Deployment

```bash
# Test the scraper works
node -e "const {scrapePythonService} = require('./services/pythonScraperBridge'); scrapePythonService('https://github.com').then(r => console.log('✓ Success')).catch(e => console.error('✗ Error:', e.message))"
```

### Step 6: Set Permissions (Linux/Unix Only)

```bash
chmod +x server/services/pythonWebScraper.py
chmod +x node_modules/.bin/*
```

### Step 7: Docker Deployment (Recommended for Production)

If using Docker, add to your Dockerfile:

```dockerfile
# Install Python 3.11
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY server/requirements.txt .
RUN pip3 install -r requirements.txt

# Copy app files
COPY . .

# Verify Python is accessible
RUN python3 --version && python3 -c "import requests, bs4"

# Start app
CMD ["node", "server/server.js"]
```

### Step 8: Troubleshooting

If still getting errors, check:

1. **Check if Python is really in PATH:**

    ```bash
    echo $PATH  # Unix/Linux/macOS
    echo %PATH%  # Windows
    ```

2. **Check Node.js can find Python:**

    ```bash
    node -e "const {execSync} = require('child_process'); console.log(execSync('which python3 || where python').toString())"
    ```

3. **View application logs:**

    ```bash
    # Your logs should show which Python version is being used
    tail -n 50 /var/log/neoapp.log
    ```

4. **Force Python path in Node.js (Last Resort):**

    Update [pythonScraperBridge.js](pythonScraperBridge.js#L74) temporary PATH:

    ```javascript
    const options = {
        timeout: 20000,
        maxBuffer: 1024 * 1024 * 10,
        shell: true,
        env: {
            ...process.env,
            PATH: `/usr/bin:${process.env.PATH}`, // Unix
            // or for Windows:
            // PATH: `C:\\Python311;${process.env.PATH}`
        },
    };
    ```

### Common Issues & Solutions

| Error                       | Cause                      | Solution                                               |
| --------------------------- | -------------------------- | ------------------------------------------------------ |
| `spawn python ENOENT`       | Python not in PATH         | Install Python with PATH option or use `python3`       |
| `Module requests not found` | Dependencies not installed | Run `pip3 install -r requirements.txt`                 |
| `Permission denied`         | Script not executable      | Run `chmod +x server/services/pythonWebScraper.py`     |
| `Timeout exceeded`          | Slow server/network        | Website may be blocked; test with `https://github.com` |

### Health Check Endpoint

Add this to your monitoring to verify Python scraper is working:

```bash
curl -X POST http://your-server/api/scrape-website \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com"}'

# Should return scraped data within 20 seconds
```

### Next Steps

After setup:

1. ✅ Restart both frontend (Expo) and backend (Node.js server)
2. ✅ Test with a few websites URL to verify extraction
3. ✅ Check backend logs for extraction details
4. ✅ For production, consider adding caching if needed

## Next Steps

After setup:

1. ✅ Restart both frontend (Expo) and backend (Node.js server)
2. ✅ Test with a few websites URL to verify extraction
3. ✅ Check backend logs for extraction details
4. ✅ For production, consider adding caching if needed

## Support

If the scraper doesn't work:

1. Check backend logs: `console.log` in terminal
2. Verify Python installation: `python --version`
3. Verify dependencies: `pip list | grep -E "requests|beautifulsoup4"`
4. Test Python directly: `python server/services/pythonWebScraper.py "https://example.com"`

---

**Ready to extract rich business data from websites! 🌐**
