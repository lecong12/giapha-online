// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Lấy Model User đã được định nghĩa bên server.js
const User = mongoose.model('User');

/* ============================================================
   ROUTES
============================================================ */

// POST /api/auth/register - Đăng ký owner
router.post('/register', async (req, res) => {
    try {
        const { username, password, full_name } = req.body;
        
        // Kiểm tra user tồn tại
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Tài khoản đã tồn tại' });
        }

        // Tạo user mới (Mặc định là owner)
        const newUser = new User({ username, password, full_name, role: 'owner' });
        await newUser.save();

        res.json({ message: 'Đăng ký thành công', user: newUser });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/login - Đăng nhập (owner hoặc viewer)
router.post('/login', async (req, res) => {
    try {
        let { username, password } = req.body;
        console.log(`👉 Login request: ${username}`); // Log kiểm tra

        // Kiểm tra trạng thái kết nối DB (1 = Connected)
        if (mongoose.connection.readyState !== 1) {
            // Kiểm tra xem có biến môi trường không để báo lỗi chính xác
            const hasEnv = process.env.MONGO_URI || process.env.MONGODB_URI;
            const configStatus = hasEnv ? "Đã nhập MONGO_URI (Atlas)" : "Đang dùng Localhost (Sai nếu chạy trên Render)";
            
            console.error(`❌ Lỗi: Database chưa kết nối! (Trạng thái: ${mongoose.connection.readyState})`);
            return res.status(503).json({ error: `Lỗi kết nối DB (State: ${mongoose.connection.readyState}). Cấu hình: ${configStatus}. Gợi ý: Kiểm tra IP Whitelist trên Atlas.` });
        }

        // Kiểm tra xem DB có user nào chưa
        const count = await User.countDocuments();
        if (count === 0) {
            console.log("⚠️ Database trống!");
            return res.status(400).json({ error: 'Chưa có dữ liệu! Hãy truy cập /api/seed để tạo Admin.' });
        }

        // Xử lý input: cắt khoảng trắng
        username = username ? username.trim() : '';
        
        // Tìm user (Không phân biệt hoa thường với username)
        const user = await User.findOne({ 
            username: { $regex: new RegExp(`^${username}$`, 'i') },
            password: password 
        });
        
        if (!user) {
            console.log("❌ Sai tài khoản hoặc mật khẩu");
            return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
        }
        console.log("✅ Đăng nhập thành công:", user.username);
        res.json({ message: 'Đăng nhập thành công', user });
    } catch (err) {
        console.error("❌ Lỗi server:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;