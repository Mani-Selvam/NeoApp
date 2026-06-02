# Neo App Documentation

Welcome to the comprehensive documentation for the **Neo App**, a powerful React Native Expo-based application designed for lead management, omnichannel communication, and performance tracking.

## Overview

Neo is built to be a central hub for sales and customer relationship management (CRM) tasks. It features a modern, highly animated UI with a data-rich dashboard, integrated messaging (WhatsApp, Email), team performance tracking, and subscription billing via Razorpay.

## Key Features & Modules

### 1. Dashboard (Home)
The heart of the Neo App is its visually stunning and data-packed Dashboard (`HomeScreen.js`). 
- **Data Visualization**: Features custom-built animated Bar Charts, Pipeline Bars, and Trading Stage (Line/Area) Charts.
- **Metrics Tiles**: Quick-glance metric tiles summarizing key performance indicators (KPIs) such as Total Leads, Conversions, and Active Tasks.
- **Interactive Elements**: Includes a "Pulse Dot" indicator for live status, and "Ring Meters" for conversion rates.
- **Quick Actions**: Immediate access to essential tasks right from the dashboard.

### 2. Lead & Enquiry Management
A complete suite for capturing and tracking potential clients.
- **Enquiries View (`EnquiryScreen.js`)**: A list/board view of all incoming and ongoing enquiries.
- **Add & Capture (`AddEnquiryScreen.js`, `PublicLeadFormScreen.js`)**: Interfaces for manual entry and public-facing forms to capture leads.
- **Sourcing (`LeadSourceScreen.js`)**: Track where leads are coming from to optimize marketing efforts.

### 3. Omnichannel Communication
Neo integrates various communication channels directly into the app workflow to ensure seamless interaction with leads.
- **WhatsApp Integration**: 
  - Send individual and bulk WhatsApp messages (`BulkWhatsAppScreen.js`).
  - Manage WhatsApp API settings (`WhatsAppSettingsScreen.js`).
  - Create and manage pre-approved WhatsApp templates (`WhatsAppTemplateScreen.js`).
- **Email Integration**: Built-in email client capabilities (`EmailScreen.js`) with configurable SMTP/IMAP settings (`EmailSettingsScreen.js`).
- **Chat & Calls**: In-app chat interface (`ChatScreen.js`) and unified communication logs (`CommunicationScreen.js`). 
- *Note: Call logging and auditing are supported (see `CALL_LOG_AUDIT_REPORT.md`).*

### 4. Follow-Ups & Task Management
Never miss an opportunity with the integrated scheduling system.
- **Follow-up Tracking (`FollowUpScreen.js`)**: Calendar and list-based views for upcoming calls, meetings, and tasks.
- **Reminders**: Utilizes local notifications to alert users of pending tasks.

### 5. Staff & Performance Tracking
Tools for team leaders and admins to monitor productivity.
- **Staff Management (`StaffScreen.js`)**: Manage user roles, access, and team assignments.
- **Target Setting (`TargetsScreen.js`)**: Assign monthly or quarterly goals to staff members.
- **Performance Reports (`StaffPerformanceReportScreen.js`)**: Detailed analytics on individual and team performance against targets.

### 6. Subscriptions & Billing
Built-in monetization and billing management.
- **Pricing Plans (`PricingScreen.js`)**: View available subscription tiers and features.
- **Checkout Flow (`CheckoutScreen.js`, `RazorpayCheckoutScreen.js`)**: Secure payment processing integrated with Razorpay.
- **Success & Receipts (`PaymentSuccessScreen.js`)**: Post-transaction confirmation and receipt generation.

### 7. Advanced UI & UX Components
The app utilizes advanced libraries to deliver a premium user experience:
- **Animations**: Heavy use of `moti`, `react-native-reanimated`, and Lottie (`@lottiefiles/dotlottie-react`) for fluid, 60fps micro-interactions.
- **Voice Assistant**: An experimental Voice Assistant Overlay (`VoiceAssistantOverlay.js`) for hands-free navigation and queries.
- **Custom Design System**: A robust internal design system with defined tokens for colors, typography, and spacing ensuring consistency across all screens.

## Technical Stack

- **Framework**: React Native (Expo SDK)
- **Navigation**: React Navigation (Stack, Bottom Tabs)
- **State/Caching**: Context API, AsyncStorage, custom cache services
- **Backend/API**: Integrates with a Node.js/Express backend (`server/server.js`)
- **Database**: MongoDB (via Mongoose)
- **Push Notifications**: Expo Notifications & Firebase Cloud Messaging
- **Charts**: Custom SVG-based charts (`react-native-svg`) and `react-native-chart-kit`

## Getting Started (Development)

1. **Install Dependencies**: `npm install`
2. **Environment**: Ensure `.env` is configured based on `env.example.ini`.
3. **Run App**: 
   - `npm start` (Starts Expo Metro Bundler)
   - `npm run android` / `npm run ios` for native builds.
4. **Run Server**: `npm run server:dev` to start the local Node.js backend.

## Design Philosophy

The Neo app prioritizes a "Rich Aesthetic". It moves away from generic layouts by utilizing curated color palettes, glassmorphism, dynamic gradients, and micro-animations to ensure the app feels responsive, alive, and premium.
