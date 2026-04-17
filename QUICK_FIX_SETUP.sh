#!/bin/bash
# Quick Fix: Development vs Production API URL Setup

# Get operating system
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    MACHINE_IP=$(ifconfig | grep "inet " | grep -v "127.0.0.1" | head -1 | awk '{print $2}')
    echo "🍎 macOS Detected"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    MACHINE_IP=$(ifconfig | grep "inet " | grep -v "127.0.0.1" | head -1 | awk '{print $2}')
    echo "🐧 Linux Detected"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Windows
    echo "🪟 Windows Detected"
    echo ""
    echo "Run this in Command Prompt or PowerShell:"
    echo "ipconfig"
    echo ""
    echo "Look for 'IPv4 Address' under your WiFi adapter (e.g., 192.168.x.x)"
    MACHINE_IP="YOUR_IP_FROM_IPCONFIG"
else
    echo "❓ Unknown OS: $OSTYPE"
    MACHINE_IP="YOUR_MACHINE_IP"
fi

echo ""
echo "================================"
echo "API URL Setup for Your Machine"
echo "================================"
echo ""

if [ "$MACHINE_IP" != "YOUR_IP_FROM_IPCONFIG" ] && [ "$MACHINE_IP" != "" ] && [ "$MACHINE_IP" != "YOUR_MACHINE_IP" ]; then
    echo "✅ Your Machine IP: $MACHINE_IP"
    echo ""
    echo "📝 Update .env file with:"
    echo ""
    echo "EXPO_PUBLIC_API_URL=http://$MACHINE_IP:5000/api"
    echo ""
else
    echo "Please get your IP address:"
    echo ""
    echo "macOS/Linux:"
    echo "  ifconfig | grep 'inet ' | grep -v 127.0.0.1"
    echo ""
    echo "Windows (Command Prompt):"
    echo "  ipconfig"
    echo ""
    echo "Look for IPv4 Address (e.g., 192.168.x.x or 10.x.x.x)"
fi

echo ""
echo "================================"
echo "Steps to Fix Network Error:"
echo "================================"
echo ""
echo "1️⃣  Get your machine IP:"
echo "   - macOS/Linux: ifconfig"
echo "   - Windows: ipconfig"
echo ""
echo "2️⃣  Update .env file:"
echo "   EXPO_PUBLIC_API_URL=http://YOUR_IP:5000/api"
echo ""
echo "3️⃣  Start the server:"
echo "   cd server"
echo "   npm start"
echo ""
echo "4️⃣  Start the app:"
echo "   expo start"
echo ""
echo "5️⃣  Scan QR code on device (same WiFi)"
echo ""
echo "❌ If still fails:"
echo "   - Check device is on same WiFi network"
echo "   - Check server is running (should see 'Server running on port 5000')"
echo "   - Check firewall allows port 5000"
echo "   - Try: ping YOUR_IP_ADDRESS"
echo ""
echo "✅ For production/testing:"
echo "   EXPO_PUBLIC_API_URL=https://neomobile.neophrondev.in/api"
echo ""
