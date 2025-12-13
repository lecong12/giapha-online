// src/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const Auth = require("../controller/authController");

// Đăng ký owner
router.post("/register", Auth.register);

// Đăng nhập owner/viewer
router.post("/login", Auth.login);

module.exports = router;
