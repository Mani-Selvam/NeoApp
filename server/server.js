const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const express = require("express");
const compression = require("compression");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/db");

// Init App
const app = express();
app.use(compression()); // Compress all responses
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust for security in production
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

app.use(
  cors({
    origin: [
      "http://127.0.0.1:5173",
      "http://localhost:8081",
      "http://127.0.0.1:8081",
      "http://192.168.1.207:5000",
      "exp://192.168.1.207:5000",
      "http://localhost:19006",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Sockets Connection
io.on("connection", (socket) => {
  console.log("Client connected to socket:", socket.id);
  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Increase JSON body size limit for base64 images
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/enquiries", require("./routes/enquiryRoutes"));
app.use("/api/followups", require("./routes/followupRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/leadsources", require("./routes/leadSourceRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/staff", require("./routes/staffRoutes"));
app.use("/api/calllogs", require("./routes/callLogRoutes"));
app.use("/api/whatsapp", require("./routes/whatsappRoutes"));
app.use("/api/messagetemplates", require("./routes/messageTemplateRoutes"));
app.use("/api/users", require("./routes/userRoutes"));

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

    // ⚡ Pre-warm MongoDB connection — first query on Atlas M0 is always slow
    // This "heats up" the connection so actual API requests are faster
    const mongoose = require("mongoose");
    const warmStart = Date.now();
    await mongoose.connection.db.admin().ping();
    console.log(`⚡ MongoDB warm-up ping: ${Date.now() - warmStart}ms`);
  } catch (e) {
    console.error("DB Connection failed:", e.message);
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server + Real-time engine started on port ${PORT}`);
  });
};

startServer();
