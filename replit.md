# NeoApp CRM - Replit Setup

## Project Overview
A full-stack CRM (Customer Relationship Management) system with:
- **Web Dashboard** (`web/`): React + Vite superadmin panel (port 5000)
- **Backend API** (`server/`): Node.js + Express REST API (port 3000)
- **Mobile App** (`src/`, `App.js`): React Native + Expo (not run on Replit)

## Architecture
- **Frontend**: React 19 + Vite, served at `/neoappwebdash/` base path
- **Backend**: Express 5, Socket.io for real-time, MongoDB (Mongoose)
- **Auth**: JWT tokens
- **Payments**: Razorpay
- **Notifications**: Firebase FCM (mobile), Expo Notifications (dev)
- **Communications**: Twilio (SMS), WhatsApp API, Nodemailer (Email)

## Workflows
- `Start application` — runs `cd web && npm run dev` on port 5000 (webview)
- `Backend API` — runs `npm run server` on port 3000 (console)

## Environment Variables
Set in Replit secrets/env:
- `API_PORT=3000` — backend port
- `NODE_ENV=development`
- `JWT_SECRET` — JWT signing secret
- `WHATSAPP_STORE_ENCRYPTION_KEY` — 32+ char encryption key
- `MONGODB_URI` — MongoDB Atlas connection string (required for DB features)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_NUMBER` — SMS
- `FIREBASE_*` vars — Firebase Admin SDK credentials

## Database
MongoDB via Mongoose. Set `MONGODB_URI` to a MongoDB Atlas URI or local MongoDB URL.
The server starts without DB but features requiring data will fail.

## Deployment
- Build: `cd web && npm install && npm run build`
- Run: `cd web && npm run preview -- --port 5000 --host 0.0.0.0 & node server/server.js`
- Target: autoscale

## Key Files
- `server/server.js` — Backend entry point
- `web/src/main.jsx` — Web dashboard entry point
- `web/vite.config.js` — Vite config (host: 0.0.0.0, allowedHosts: true)
- `server/config/db.js` — MongoDB connection
- `server/.env.example` — Required environment variables reference
