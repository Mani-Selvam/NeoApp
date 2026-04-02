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

## Installation Steps

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
