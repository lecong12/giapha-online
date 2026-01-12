require('dotenv').config(); // Load biến môi trường
const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const mongoose = require("mongoose"); // Chuyển sang Mongoose

const app = express();
// KHAI BÁO PORT DUY NHẤT Ở ĐÂY
const PORT = process.env.PORT || 8060;
// Hỗ trợ cả MONGO_URI và MONGODB_URI (đề phòng đặt tên khác)
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/giapha';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// --- LOAD MODELS ---
require('./User');
require('./Person');

// --- ROUTES ---
app.use("/api/auth", require("./src/routes/authRoutes"));
app.use("/api/members", require("./src/routes/membersRoutes"));
app.use("/api/dashboard", require("./src/routes/dashboardRoutes"));
app.use("/api/posts", require("./src/routes/postsRoutes"));
app.use("/api/viewers", require("./src/routes/viewerRoutes"));
app.use("/api/activities", require("./src/routes/activityRoutes"));
app.use("/api/settings", require("./src/routes/settingsRoutes"));

// --- API TẠO DỮ LIỆU MẪU (SEED DATA) ---
app.get('/api/seed', async (req, res) => {
    try {
        const User = mongoose.model('User');
        const Person = mongoose.model('Person');

        // 1. Tạo tài khoản Admin (nếu chưa có)
        let admin = await User.findOne({ username: 'admin' });
        if (!admin) {
            // Password hash cho '123' (SHA256)
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update('123').digest('hex');
            
            admin = await User.create({
                username: 'admin',
                password: hash, // Lưu hash thay vì plain text
                password_hash: hash,
                full_name: 'Admin',
                role: 'owner',
                viewer_code: 'ADMIN12345'
            });
            // Tự update owner_id
            admin.owner_id = admin._id;
            await admin.save();
        }

        // 2. Tạo dữ liệu mẫu nếu chưa có
        const memberCount = await Person.countDocuments({ owner_id: admin._id });
        if (memberCount === 0) {
            await Person.create({
                owner_id: admin._id,
                full_name: 'Thủy Tổ Dòng Họ (Mẫu)',
                gender: 'male',
                generation: 1,
                is_alive: false,
                notes: 'Dữ liệu mẫu khởi tạo tự động'
            });
            return res.json({ message: "✅ Đã tạo dữ liệu thành công! Tài khoản: admin / Mật khẩu: 123" });
        }
        res.json({ message: "⚠️ Dữ liệu đã có sẵn, không cần tạo lại." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// HTML ROUTES
app.get("/", (req, res) => {
    // Tự động tìm file index.html hoặc login.html (ưu tiên thư mục gốc public)
    // ĐỔI THỨ TỰ: Ưu tiên tìm trong views/ trước để đảm bảo chạy file mới nhất bạn đang sửa
    const possibleFiles = ["views/index.html", "index.html", "views/login.html", "login.html"];
    for (const file of possibleFiles) {
        const fullPath = path.join(PUBLIC_DIR, file);
        if (fs.existsSync(fullPath)) return res.sendFile(fullPath);
    }
    res.status(404).send("<h1>Lỗi: Không tìm thấy file giao diện (index.html)</h1><p>Hãy kiểm tra lại thư mục public.</p>");
});
app.get('/dashboard', (req, res) => res.sendFile(path.join(PUBLIC_DIR, "views", "dashboard.html")));
app.get('/login', (req, res) => res.redirect('/')); // Chuyển hướng về trang chủ để đăng nhập
app.get('/register', (req, res) => res.sendFile(path.join(PUBLIC_DIR, "views", "register.html")));

// KẾT NỐI MONGODB VÀ START SERVER
// 1. Start Server NGAY LẬP TỨC để Render nhận diện Port (Tránh lỗi Exited Early)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
    console.log(`👉 Truy cập Dashboard: http://localhost:${PORT}/dashboard`);
});

// 2. Kết nối MongoDB (Chạy song song)
console.log("⏳ Đang kết nối MongoDB...");

// Log kiểm tra xem đang dùng link nào (Che mật khẩu để an toàn)
console.log(`👉 Connection String: ${MONGO_URI.replace(/:([^:@]+)@/, ':****@')}`);

// --- KIỂM TRA LỖI CẤU HÌNH PHỔ BIẾN ---
if (MONGO_URI.startsWith('postgresql://') || MONGO_URI.startsWith('postgres://')) {
    console.error("❌ LỖI CẤU HÌNH NGHIÊM TRỌNG: Bạn đang dùng chuỗi kết nối PostgreSQL cho MongoDB!");
    console.error("👉 Code hiện tại đã chuyển sang MongoDB. Chuỗi kết nối phải bắt đầu bằng 'mongodb+srv://'.");
    console.error("👉 Vui lòng vào MongoDB Atlas lấy lại chuỗi kết nối đúng.");
}

if (!process.env.MONGO_URI && !process.env.MONGODB_URI) {
    if (process.env.DATABASE_URL) {
        console.warn("⚠️ PHÁT HIỆN DATABASE_URL (PostgreSQL) nhưng thiếu MONGO_URI.");
        console.warn("👉 Có vẻ bạn đã tạo database PostgreSQL trên Render nhưng code lại đang chạy MongoDB.");
    }
    console.warn("⚠️ CẢNH BÁO: Không tìm thấy biến môi trường MONGO_URI. Server đang thử kết nối localhost (sẽ thất bại nếu chạy trên Render).");
}

// Lắng nghe sự kiện kết nối để debug dễ hơn
mongoose.connection.on('connected', () => {
    console.log('✅ Mongoose đã kết nối thành công!');
});
mongoose.connection.on('error', (err) => {
    console.error('❌ Mongoose lỗi kết nối chi tiết:', err);
});
mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ Mongoose đã ngắt kết nối.');
});

mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000, // Báo lỗi sau 5s nếu không thấy DB (thay vì treo)
})
    .then(() => {
        console.log("✅ Đã kết nối MongoDB.");
    })
    .catch(err => {
        console.error("❌ Lỗi kết nối MongoDB:", err);
        console.error("👉 Gợi ý: Kiểm tra lại biến môi trường MONGO_URI trên Render hoặc IP Whitelist trên Atlas.");
    });
