require('dotenv').config(); // Load biến môi trường
const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const mongoose = require("mongoose"); // Chuyển sang Mongoose
const os = require('os'); // Thêm thư viện lấy IP

const app = express();
// KHAI BÁO PORT DUY NHẤT Ở ĐÂY
const PORT = process.env.PORT || 8060;
// Hỗ trợ cả MONGO_URI và MONGODB_URI (đề phòng đặt tên khác)
let MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/giapha';

// CẤU HÌNH CORS MỞ RỘNG (FIX LỖI KẾT NỐI)
app.use(cors({
    origin: '*', // Cho phép tất cả nguồn (Live Server, file://...)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'] // Cho phép rõ ràng header Authorization
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- LOG REQUEST (Để debug lỗi kết nối) ---
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.url}`);
    next();
});

// --- ĐẢM BẢO THƯ MỤC UPLOADS TỒN TẠI ---
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// --- LOAD MODELS ---
try {
    require('./User');
    require('./Person');
    require('./Post');
    require('./Activity');
    console.log("✅ Models loaded successfully");
} catch (err) {
    console.error("❌ Lỗi tải Models:", err.message);
    // Không crash app, chỉ báo lỗi
}

// --- ROUTES ---
// Hàm helper để load route an toàn (không crash nếu thiếu file)
const safeRoute = (pathStr) => {
    try {
        return require(pathStr);
    } catch (e) {
        console.warn(`⚠️ Cảnh báo: Không tìm thấy route '${pathStr}' hoặc file bị lỗi. API này sẽ tạm thời không hoạt động.\n   👉 Lỗi chi tiết: ${e.message}`);
        return (req, res) => res.status(501).json({ error: "Route not implemented or file missing", path: pathStr });
    }
};

app.use("/api/auth", safeRoute("./src/routes/authRoutes"));
app.use("/api/members", safeRoute("./src/routes/membersRoutes"));
app.use("/api/dashboard", safeRoute("./src/routes/dashboardRoutes"));
app.use("/api/posts", safeRoute("./src/routes/postsRoutes"));
app.use("/api/viewers", safeRoute("./src/routes/viewerRoutes"));
app.use("/api/activities", safeRoute("./src/routes/activityRoutes"));
app.use("/api/settings", safeRoute("./src/routes/settingsRoutes"));

// --- API HEALTH CHECK (Để Frontend kiểm tra kết nối) ---
app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'Server is running' }));

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
try {
    const server = app.listen(PORT, '0.0.0.0', () => {
        // Lấy địa chỉ IP LAN để tiện truy cập từ điện thoại
        let lanIp = 'localhost';
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    lanIp = iface.address;
                    break;
                }
            }
        }

        console.log(`\n==================================================`);
        console.log(`🚀 SERVER ĐANG CHẠY (PORT ${PORT})`);
        console.log(`👉 Local:   http://localhost:${PORT}`);
        console.log(`👉 LAN/Wifi: http://${lanIp}:${PORT} (Dùng cái này cho điện thoại)`);
        console.log(`==================================================\n`);
    });
    
    // Tăng timeout cho server để tránh lỗi 502 Bad Gateway trên Render khi xử lý nặng
    server.keepAliveTimeout = 120 * 1000;
    server.headersTimeout = 120 * 1000;

} catch (err) {
    console.error("❌ KHÔNG THỂ KHỞI ĐỘNG SERVER:", err.message);
}

// 2. Kết nối MongoDB (Chạy song song)
console.log("⏳ Đang kết nối MongoDB...");

// Log kiểm tra xem đang dùng link nào (Che mật khẩu để an toàn)
console.log(`👉 Connection String: ${MONGO_URI.replace(/:([^:@]+)@/, ':****@')}`);

// --- HÀM KẾT NỐI DB CÓ RETRY ---
const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log("✅ Đã kết nối MongoDB thành công.");
        initAdmin(); // Khởi tạo admin sau khi kết nối
    } catch (err) {
        console.error("❌ Lỗi kết nối MongoDB:", err.message);

        // ✅ FIX: Tự động chuyển về Localhost nếu sai mật khẩu hoặc lỗi Auth
        if (err.message.includes('auth') || err.message.includes('Authentication failed') || err.message.includes('bad auth')) {
            console.warn("\n⚠️ CẢNH BÁO: Đăng nhập Database thất bại (Sai mật khẩu/User).");
            console.warn("👉 Hệ thống sẽ chuyển sang Database nội bộ (Localhost) để bạn có thể tiếp tục làm việc.");
            MONGO_URI = 'mongodb://127.0.0.1:27017/giapha';
            return connectDB(); // Thử lại ngay lập tức với Localhost
        }

        console.log("⏳ Đang thử lại sau 5 giây...");
        setTimeout(connectDB, 5000);
    }
};

const initAdmin = async () => {
    try {
        try {
            const User = mongoose.model('User');
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update('123').digest('hex');
            
            // Tìm hoặc tạo mới admin (upsert)
            const admin = await User.findOneAndUpdate(
                { username: 'admin' },
                { 
                    password: hash, 
                    password_hash: hash, 
                    full_name: 'Quản trị viên', 
                    role: 'owner',
                    viewer_code: 'ADMIN12345' // Đảm bảo Admin luôn có mã viewer
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            
            // Đảm bảo owner_id chính xác
            if (!admin.owner_id || admin.owner_id.toString() !== admin._id.toString()) {
                admin.owner_id = admin._id;
                await admin.save();
            }

            // KIỂM TRA DỮ LIỆU TRỐNG ĐỂ CẢNH BÁO
            const Person = mongoose.model('Person');
            const count = await Person.countDocuments({ owner_id: admin._id });
            
            console.log("\n🔑 ========================================================");
            console.log("👤 TÀI KHOẢN ADMIN (Đã được khôi phục nếu bị xóa):");
            console.log("👉 User: admin  |  Pass: 123");
            if (count === 0) {
                console.log("⚠️ CẢNH BÁO: Database đang TRỐNG!");
                console.log("👉 Hãy chạy lệnh: node importData.js (trên máy tính)");
                console.log("👉 Hoặc vào Web -> Cài đặt -> Import CSV");
            } else {
                console.log(`✅ Đang có ${count} thành viên trong hệ thống.`);
            }
            console.log("========================================================\n");
        } catch (e) {
            console.error("⚠️ Lỗi khởi tạo Admin:", e.message);
        }
    } catch (err) {
        console.error("❌ Init Admin Error:", err);
    }
};

connectDB();

// --- GLOBAL ERROR HANDLER (CHỐNG CRASH SERVER) ---
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION! Server vẫn chạy...', err);
});
process.on('unhandledRejection', (err) => {
    console.error('💥 UNHANDLED REJECTION! Server vẫn chạy...', err);
});
