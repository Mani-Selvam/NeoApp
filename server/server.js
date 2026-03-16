const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const express = require("express");
const compression = require("compression");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const { verifyToken } = require("./middleware/auth");
const { requireActivePlan, requireFeature } = require("./middleware/planGuard");

const defaultCorsOrigins = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://192.168.1.207:5000",
    "http://192.168.1.34:8081",
    "http://192.168.1.33:8081",
    "http://192.168.63.77:8081",
    "exp://192.168.1.16:5000",
    "exp://192.168.1.34:8081",
    "exp://192.168.1.33:8081",
    "exp://192.168.63.77:8081",
    "http://localhost:19006",
    "https://neophrondev.in",
    "https://www.neophrondev.in",
    "https://neoapp.neophrondev.in",
];

const configuredCorsOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedCorsOrigins = [
    ...new Set([...defaultCorsOrigins, ...configuredCorsOrigins]),
];

const corsOriginHandler = (origin, callback) => {
    if (!origin || allowedCorsOrigins.includes(origin)) {
        return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
};

// Init App
const app = express();
if (String(process.env.TRUST_PROXY || "").toLowerCase() === "true") {
    app.set("trust proxy", true);
}
app.use(compression()); // Compress all responses
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: corsOriginHandler,
        methods: ["GET", "POST"],
        credentials: true,
    },
});

app.set("io", io);

app.use(
    cors({
        origin: corsOriginHandler,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
    }),
);

// Sockets Connection
io.on("connection", (socket) => {
    const rawUserId = socket.handshake?.query?.userId;
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

    if (userId) {
        const room = `user:${userId}`;
        socket.join(room);
        console.log(`Client connected: ${socket.id} joined ${room}`);
    } else {
        console.log("Client connected to socket without userId:", socket.id);
    }

    socket.on("join_user_room", (nextUserId) => {
        if (!nextUserId) return;
        const room = `user:${nextUserId}`;
        socket.join(room);
        console.log(`Socket ${socket.id} joined room ${room}`);
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });
});

// Increase JSON body size limit for base64 images
// Razorpay webhooks require raw body for signature verification.
app.use(
    "/api/users/billing/razorpay/webhook",
    express.raw({ type: "application/json" }),
);
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

const withPlan = (featureName, bypassPrefixes = []) => {
    const bypass = Array.isArray(bypassPrefixes) ? bypassPrefixes : [];
    const feature = String(featureName || "").trim();

    return (req, res, next) => {
        const p = String(req.path || "");
        if (bypass.some((prefix) => p === prefix || p.startsWith(prefix))) {
            return next();
        }

        return verifyToken(req, res, () =>
            requireActivePlan(req, res, () =>
                requireFeature(feature)(req, res, next),
            ),
        );
    };
};

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/support", require("./routes/supportRoutes"));
app.use(
    "/api/enquiries",
    withPlan("Lead Capture"),
    require("./routes/enquiryRoutes"),
);
app.use(
    "/api/followups",
    withPlan("Follow-ups"),
    require("./routes/followupRoutes"),
);
app.use(
    "/api/dashboard",
    withPlan("Basic CRM"),
    require("./routes/dashboardRoutes"),
);
app.use("/api/reports", withPlan("Reports"), require("./routes/reportRoutes"));
app.use(
    "/api/leadsources",
    withPlan("Basic CRM"),
    require("./routes/leadSourceRoutes"),
);
app.use(
    "/api/products",
    withPlan("Basic CRM"),
    require("./routes/productRoutes"),
);
app.use(
    "/api/targets",
    withPlan("Basic CRM"),
    require("./routes/targetRoutes"),
);
app.use("/api/sms", require("./routes/smsQueueRoutes"));
app.use("/api/staff", withPlan("Basic CRM"), require("./routes/staffRoutes"));
app.use(
    "/api/calllogs",
    withPlan("Call Logs", ["/debug", "/webhook"]),
    require("./routes/callLogRoutes"),
);
app.use(
    "/api/whatsapp",
    withPlan("WhatsApp Integration", ["/webhook"]),
    require("./routes/whatsappRoutes"),
);
app.use(
    "/api/messagetemplates",
    withPlan("WhatsApp Integration"),
    require("./routes/messageTemplateRoutes"),
);
app.use(
    "/api/email",
    withPlan("Basic CRM", ["/track"]),
    require("./routes/emailRoutes"),
);
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/company", require("./routes/companyRoutes"));
app.use("/api/superadmin", require("./routes/superadmin.routes"));

// Basic Route
app.get("/", (req, res) => {
    // Explicitly set Content-Type to 'text/html' without charset
    // to keep health-check responders that compare exact headers happy.
    res.setHeader("Content-Type", "text/html");
    res.send("CRM API with Socket.io is running...");
});

const startServer = async () => {
    const PORT = process.env.API_PORT || 5000;
    try {
        await connectDB();

        // âš¡ Pre-warm MongoDB connection â€” first query on Atlas M0 is always slow
        // This "heats up" the connection so actual API requests are faster
        const mongoose = require("mongoose");
        const warmStart = Date.now();
        await mongoose.connection.db.admin().ping();
        console.log(`âš¡ MongoDB warm-up ping: ${Date.now() - warmStart}ms`);
    } catch (e) {
        console.error("DB Connection failed:", e.message);
    }

    server.listen(PORT, "0.0.0.0", () => {
        console.log(`ðŸš€ Server + Real-time engine started on port ${PORT}`);
    });
};

startServer();
