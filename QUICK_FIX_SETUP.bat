@echo off
REM Quick Fix Script for Windows
REM Setup Development API URL

echo.
echo ================================
echo API URL Setup for Your Machine
echo ================================
echo.
echo Step 1: Get Your Machine IP
echo.
echo Run this command to find your IP:
echo.
echo.
ipconfig
echo.
echo.
echo Look for "IPv4 Address" (e.g., 192.168.1.207)
echo Under your active WiFi or Ethernet connection
echo.
echo ================================
echo Step 2: Update .env File
echo ================================
echo.
echo Open .env file and update:
echo.
echo BEFORE (doesn't work):
echo EXPO_PUBLIC_API_URL=http://192.168.1.34:5000/api
echo.
echo AFTER (your machine IP from step 1):
echo EXPO_PUBLIC_API_URL=http://YOUR_IP_FROM_STEP1:5000/api
echo.
echo Example if your IP is 192.168.1.207:
echo EXPO_PUBLIC_API_URL=http://192.168.1.207:5000/api
echo.
echo ================================
echo Step 3: Start the Server
echo ================================
echo.
echo Open Command Prompt and run:
echo.
echo cd server
echo npm start
echo.
echo You should see:
echo "Server running on port 5000"
echo.
echo ================================
echo Step 4: Start the App
echo ================================
echo.
echo Open another Command Prompt and run:
echo.
echo expo start
echo.
echo Then scan QR code on your device (SAME WIFI NETWORK)
echo.
echo ================================
echo Troubleshooting
echo ================================
echo.
echo Error: "Network Error: cannot reach server"
echo Solution: Check device is on same WiFi as machine
echo.
echo Error: Still can't connect?
echo Try: ping YOUR_IP_ADDRESS
echo.
echo For Production/Testing:
echo EXPO_PUBLIC_API_URL=https://neomobile.neophrondev.in/api
echo.
echo.
pause
