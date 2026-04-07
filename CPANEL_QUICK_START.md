# 🎯 cPanel Quick Start Guide - Python Scraper Setup

**For cPanel users only** | ⏱️ Takes ~10 minutes

---

## Table of Contents

1. [Access cPanel](#access-cpanel)
2. [Quick Setup (5 steps)](#quick-setup)
3. [Troubleshooting](#troubleshooting)
4. [Commands Reference](#commands-reference)

---

## Access cPanel

### Option 1: Browser Terminal (Easiest)

1. Go to `cpanel.your-domain.com` → Login
2. Click **Terminal** (Advanced section)
3. Type commands directly in browser

### Option 2: SSH Client (Recommended)

**Windows:**

- Download PuTTY
- Host: `your-domain.com` | Port: `22`
- Username: `cpanel_username` | Password: `cpanel_password`

**Mac/Linux:**

```bash
ssh cpanel_username@your-domain.com
# Enter password when prompted
```

---

## Quick Setup

### Step 1: Navigate to Your App

```bash
cd ~/NeoApp/server
# or wherever your app is located
# Common locations: ~/public_html/NeoApp or ~/NeoApp
```

### Step 2: Create Python Virtual Environment

```bash
# Check Python version first
python3.11 --version  # Should show 3.11.x

# Create virtual environment
python3.11 -m venv venv

# Activate it
source venv/bin/activate
# ✓ You should see (venv) in your terminal prompt
```

### Step 3: Install Dependencies

```bash
# Make sure (venv) is shown in prompt
pip install --upgrade pip
pip install -r requirements.txt

# Verify (should list requests and beautifulsoup4)
pip list | grep -E "requests|beautifulsoup4"
```

### Step 4: Set Permissions

```bash
# Make Python script executable
chmod +x services/pythonWebScraper.py

# Make directories writable
chmod 755 uploads/ tmp/

# (Optional) Make all Python files executable
find . -name "*.py" -exec chmod 755 {} \;
```

### Step 5: Restart Node.js in cPanel

1. Go to cPanel → **Node.js Manager** (Software section)
2. Find your NeoApp application
3. Click **Restart** button
4. Wait 30 seconds

---

## ✅ Verify It Works

```bash
# SSH back in if you logged out
ssh cpanel_username@your-domain.com

# Activate venv
cd ~/NeoApp/server
source venv/bin/activate

# Test the scraper
python3.11 services/pythonWebScraper.py "https://github.com"

# Should output JSON data (takes 5-10 seconds)
# {
#   "success": true,
#   "companyName": "GitHub",
#   ...
# }
```

---

## Troubleshooting

### "Python command not found"

```bash
# Find where Python is installed
which python3.11
# Output: /opt/rh/rh-python311/root/usr/bin/python3.11

# Use that path directly
/opt/rh/rh-python311/root/usr/bin/python3.11 -m venv venv
```

### "ModuleNotFoundError: No module named 'requests'"

```bash
# Activate virtual environment first!
source venv/bin/activate

# Then install
pip install -r requirements.txt
```

### "Permission denied"

```bash
chmod +x services/pythonWebScraper.py
chmod 755 uploads/ tmp/
```

### "Port already in use"

```bash
# Find and kill Node.js
ps aux | grep node
kill -9 <process_id>

# Or use cPanel Node.js Manager to restart
```

### "Node.js still shows old error"

1. Go to cPanel → Node.js Manager
2. Click **Stop**
3. Click **Start**
4. Wait 30 seconds
5. Test again

---

## Commands Reference

| Task                       | Command                                                         |
| -------------------------- | --------------------------------------------------------------- |
| Check Python version       | `python3.11 --version`                                          |
| Create virtual environment | `python3.11 -m venv venv`                                       |
| Activate venv              | `source venv/bin/activate`                                      |
| Deactivate venv            | `deactivate`                                                    |
| Install packages           | `pip install -r requirements.txt`                               |
| List installed packages    | `pip list`                                                      |
| Test scraper               | `python3.11 services/pythonWebScraper.py "https://example.com"` |
| Kill Node process          | `ps aux \| grep node` then `kill -9 <id>`                       |
| Check full Python path     | `which python3.11`                                              |
| Make file executable       | `chmod +x filename`                                             |
| View error logs            | `tail -f ~/NeoApp/logs/error.log`                               |
| SSH into cPanel            | `ssh username@your-domain.com`                                  |

---

## Virtual Environment Basics

```bash
# Activate: (adds Python to PATH automatically)
source venv/bin/activate

# Deactivate: (removes venv Python from PATH)
deactivate

# Check if activated: Look for (venv) in prompt
# (venv) user@server:~/NeoApp/server$
```

**Why virtual environment?**

- Keeps your app dependencies isolated
- Prevents conflicts with other apps
- cPanel can manage multiple apps safely

---

## When to Contact Hosting Support

Tell them you need:

- ✅ Python 3.8 or higher (prefer 3.11+)
- ✅ Python in system PATH
- ✅ pip command working
- ✅ Node.js v14+ with npm

**Example message:**

> "I need Python 3.11, pip, and Node.js 18 LTS enabled. Can you enable these in the cPanel account and ensure Python/pip are in the system PATH?"

---

## More Help

- **Full guide:** See `PYTHON_SCRAPER_SETUP.md` → "Installation Steps - cPanel Hosting"
- **Production issues:** See `PYTHON_SCRAPER_SETUP.md` → "Production Deployment Guide"
- **General troubleshooting:** See `PYTHON_SCRAPER_SETUP.md` → "Troubleshooting"
