// server.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");

const authRoutes = require("./src/routes/authRoutes");
const dashboardRoutes = require("./src/routes/dashboardRoutes");

const app = express();
const PORT = 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public folder
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "views", "root.html"));
});
app.get("/login", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "views", "index.html"));
});
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'views', 'dashboard.html'));
});

// SQLite
const DB_PATH = path.join(__dirname, "database", "giapha.db");

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error("❌ Không thể kết nối SQLite:", err.message);
    } else {
        console.log("✅ Kết nối SQLite thành công:", DB_PATH);
    }
});

app.set("db", db);

// API
app.use("/api/auth", authRoutes);

// Server start
app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại: http://localhost:${PORT}`);
});
