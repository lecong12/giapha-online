// --- GLOBAL ERROR HANDLER (CHỐNG CRASH SERVER) - ĐƯA LÊN ĐẦU ---
// Phải đặt ở đây để bắt lỗi ngay cả khi require file thất bại
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION! Server vẫn chạy...', err);
});
process.on('unhandledRejection', (err) => {
    console.error('💥 UNHANDLED REJECTION! Server vẫn chạy...', err);
});

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
let MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/GiaphaDB';

if (MONGO_URI) MONGO_URI = MONGO_URI.trim(); // ✅ FIX: Xóa khoảng trắng thừa đầu/cuối
// ✅ FIX: Tự động xóa dấu ngoặc kép nếu lỡ copy nhầm vào biến môi trường (Lỗi rất phổ biến)
if (MONGO_URI.startsWith('"') && MONGO_URI.endsWith('"')) MONGO_URI = MONGO_URI.slice(1, -1);
if (MONGO_URI.startsWith("'") && MONGO_URI.endsWith("'")) MONGO_URI = MONGO_URI.slice(1, -1);

const MASKED_URI = MONGO_URI.replace(/:([^:@]+)@/, ':****@'); // URI đã che mật khẩu để log an toàn

// --- TRẠNG THÁI SERVER ---
let isDbConnected = false;
let dbConnectionError = null;

// --- DEBUG: KIỂM TRA FILE TRÊN SERVER ---
// Giúp phát hiện lỗi thiếu file hoặc sai tên file (chữ hoa/thường) trên Linux
try {
    console.log("📂 Danh sách file tại thư mục gốc:", fs.readdirSync(__dirname));
    if (fs.existsSync('./src/routes')) {
        console.log("📂 Danh sách file routes:", fs.readdirSync('./src/routes'));
    } else {
        console.warn("⚠️ Cảnh báo: Không tìm thấy thư mục './src/routes'. Các API có thể bị lỗi.");
    }
} catch (e) { console.error("Lỗi kiểm tra file:", e.message); }

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
// CẢNH BÁO: Các nền tảng hosting (Render, Heroku) thường có hệ thống file chỉ đọc (read-only) hoặc tạm thời (ephemeral).
// Việc tạo thư mục và lưu file trực tiếp trên server có thể không hoạt động hoặc file sẽ bị xóa sau mỗi lần deploy.
// Giải pháp tốt nhất là dùng dịch vụ lưu trữ cloud như Cloudinary, AWS S3...
// Đoạn code dưới đây được bọc trong try-catch để tránh crash server khi không có quyền ghi.
try {
    if (!fs.existsSync('uploads')) {
        fs.mkdirSync('uploads');
        console.log("✅ Đã tạo thư mục 'uploads'.");
    }
} catch (err) {
    console.warn("⚠️ Cảnh báo: Không thể tạo thư mục 'uploads'. Chức năng upload file có thể không hoạt động.", err.message);
}

const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// --- LOAD MODELS ---
// ✅ FIX: Dùng tên file mới (*Model.js) để tránh lỗi casing (User.js vs user.js) trên Linux
// Dùng hàm bọc an toàn để nếu thiếu file cũng không sập server
const requireModel = (path) => {
    try { require(path); console.log(`✅ Loaded: ${path}`); } 
    catch (e) { console.error(`❌ LỖI TẢI MODEL ${path}:`, e.message); }
};

requireModel('./UserModel');
requireModel('./PersonModel');
requireModel('./ActivityModel');
requireModel('./PostModel');

// Nếu Model Post chưa có (do thiếu file), tự khai báo schema rỗng để tránh crash
if (!mongoose.models.Post) {
    mongoose.model('Post', new mongoose.Schema({ title: String, content: String }, { timestamps: true }));
}

console.log("✅ Models loaded check complete.");

// ✅ KIỂM TRA AN TOÀN: Đảm bảo Model User đã được đăng ký thành công
if (!mongoose.models.User) {
    console.error("❌ LỖI NGHIÊM TRỌNG: Model 'User' chưa được tải! Kiểm tra lại file UserModel.js.");
    // Không exit để server vẫn chạy và hiện lỗi ra web (nhờ đoạn code xử lý lỗi DB bên dưới)
    dbConnectionError = "Model 'User' failed to load. Please check UserModel.js content.";
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
app.use("/api/family-tree", safeRoute("./src/routes/familyTreeRoutes")); // ✅ Route mới cho cây gia phả

// --- ROUTE DEBUG (QUAN TRỌNG ĐỂ KIỂM TRA DEPLOY) ---
// Truy cập /debug để xem server có những file gì
app.get('/debug', (req, res) => {
    const listFiles = (dir, fileList = []) => {
        try {
            fs.readdirSync(dir).forEach(file => {
                const filePath = path.join(dir, file);
                if (fs.statSync(filePath).isDirectory()) {
                    if (file !== 'node_modules' && file !== '.git') listFiles(filePath, fileList);
                } else {
                    fileList.push(filePath.replace(__dirname, ''));
                }
            });
        } catch (e) { fileList.push(`Error reading ${dir}: ${e.message}`); }
        return fileList;
    };
    
    res.json({
        message: "🔍 Danh sách file trên Server",
        files: listFiles(__dirname),
        env: {
            PORT: process.env.PORT,
            MONGO_URI_CONFIGURED: !!process.env.MONGO_URI,
            NODE_ENV: process.env.NODE_ENV
        }
    });
});

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
    // ✅ FIX: Nếu DB lỗi, hiển thị thông báo ngay trên web thay vì crash server
    // SỬA LOGIC: Chỉ cần có lỗi là hiện, không quan tâm isDbConnected (vì có thể kết nối được nhưng Model lỗi)
    if (dbConnectionError) {
        const isProd = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT;
        // ⚠️ QUAN TRỌNG: Trả về status 200 thay vì 500.
        // Nếu trả về 500, Railway sẽ tưởng App bị hỏng và tự động Restart -> Gây lỗi 502 Bad Gateway.
        return res.status(200).send(`
            <html>
                <body style="font-family: sans-serif; padding: 40px; text-align: center; background: #fef2f2;">
                    <h1 style="color: #dc2626;">⚠️ Lỗi Kết Nối Database</h1>
                    <p style="font-size: 18px;">Server Railway đã chạy nhưng không nối được MongoDB.</p>
                    <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #fca5a5; display: inline-block; text-align: left;">
                        <strong>Chi tiết lỗi:</strong>
                        <pre style="color: #b91c1c; white-space: pre-wrap;">${dbConnectionError}</pre>
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 10px 0;">
                        <strong>URI đang dùng:</strong> <code style="background: #eee; padding: 4px;">${MASKED_URI}</code><br>
                        <small style="color: #666;">(Mật khẩu đã được che)</small>
                    </div>
                    <p style="margin-top: 20px;">
                        👉 <strong>Kiểm tra:</strong><br>
                        1. Mật khẩu trong MONGO_URI có đúng không?<br>
                        2. Đã thêm IP <code>0.0.0.0/0</code> trong MongoDB Atlas Network Access chưa?<br>
                        3. Môi trường hiện tại: <strong>${isProd ? 'Production (Railway)' : 'Localhost'}</strong>
                        <br><br>👉 <a href="/debug">Bấm vào đây để xem file trên Server (Debug)</a>
                    </p>
                </body>
            </html>
        `);
    }

    // Tự động tìm file index.html hoặc login.html (ưu tiên thư mục gốc public)
    // ĐỔI THỨ TỰ: Ưu tiên tìm trong views/ trước để đảm bảo chạy file mới nhất bạn đang sửa
    const possibleFiles = ["views/index.html", "index.html", "views/login.html", "login.html"];
    for (const file of possibleFiles) {
        const fullPath = path.join(PUBLIC_DIR, file);
        if (fs.existsSync(fullPath)) return res.sendFile(fullPath);
    }
    
    // Nếu không tìm thấy file giao diện, hiển thị hướng dẫn thay vì lỗi 404 trắng
    res.status(404).send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>⚠️ Server Đã Chạy Nhưng Thiếu Giao Diện</h1>
            <p>Không tìm thấy file <code>index.html</code> hoặc <code>login.html</code> trong thư mục <code>public</code>.</p>
            <p>Có thể bạn chưa upload thư mục <strong>public</strong> hoặc đặt sai tên.</p>
            <hr>
            <a href="/debug" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Kiểm tra danh sách file</a>
        </div>
    `);
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
console.log(`👉 Connection String: ${MASKED_URI}`);

// --- HÀM KẾT NỐI DB CÓ RETRY ---
const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 30000, // ✅ Tăng lên 30s để tránh lỗi timeout khi mạng chậm
            dbName: 'GiaphaDB' // ✅ FIX: Luôn kết nối vào đúng DB chứa dữ liệu
        });
        console.log("✅ Đã kết nối MongoDB thành công.");
        isDbConnected = true; // Đánh dấu kết nối thành công
        initAdmin(); // Khởi tạo admin sau khi kết nối
    } catch (err) {
        console.error("❌ Lỗi kết nối MongoDB:", err.message);
        dbConnectionError = err.message; // Lưu lỗi để hiển thị lên web
        
        // ✅ FIX: KHÔNG CRASH SERVER NỮA
        // Để server vẫn chạy và hiển thị lỗi trên trình duyệt cho bạn dễ sửa
        console.error("⚠️ Server sẽ vẫn chạy ở chế độ 'Báo Lỗi' để bạn kiểm tra.");

        // ✅ FIX QUAN TRỌNG: Kiểm tra môi trường Production
        // Nếu đang trên Railway/Render, TUYỆT ĐỐI KHÔNG fallback về localhost (vì localhost không có DB)
        const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_GIT_COMMIT_SHA;

        // Nếu đang ở môi trường dev, thử fallback về localhost
        if (!isProduction && MONGO_URI.includes('@')) { // Heuristic: Nếu có @, tức là đang dùng link cloud
            console.warn("\n⚠️ CẢNH BÁO: Đăng nhập Database thất bại (Sai mật khẩu/User).");
            console.warn("👉 Hệ thống sẽ chuyển sang Database nội bộ (Localhost) để bạn có thể tiếp tục làm việc.");
            MONGO_URI = 'mongodb://127.0.0.1:27017/GiaphaDB';
            return connectDB(); // Thử lại ngay lập tức với Localhost
        }

        if (err.message.includes('bad auth') || err.message.includes('Authentication failed')) {
             console.error("\n💡 GỢI Ý: Mật khẩu có chứa ký tự đặc biệt (@, :, /) không?");
             console.error("👉 Hãy mã hóa mật khẩu (URL Encode). Ví dụ: 'M@tKhau' -> 'M%40tKhau'");
        }

        console.log("⏳ Thử kết nối lại sau 5 giây...");
        setTimeout(connectDB, 5000); // Ở môi trường dev, tiếp tục thử lại
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
