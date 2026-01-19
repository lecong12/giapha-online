const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');

// Hàm helper để lấy Model User an toàn
function getUserModel() {
    if (mongoose.models.User) {
        return mongoose.model('User');
    }
    try {
        // Thử load từ đường dẫn tương đối
        return require('../../User');
    } catch (e) {
        console.warn("⚠️ Load User model failed relative, trying absolute...");
        try {
            // Thử load từ đường dẫn tuyệt đối (gốc dự án)
            return require(path.join(process.cwd(), 'User.js'));
        } catch (e2) {
            console.error("❌ CRITICAL: Cannot load User model:", e2);
            throw new Error("User Model missing");
        }
    }
}

exports.login = async (req, res) => {
    console.log("👉 [LOGIN START]", req.body);
    
    try {
        // 0. Kiểm tra kết nối DB
        if (mongoose.connection.readyState !== 1) {
            console.error("❌ DB Connection State:", mongoose.connection.readyState);
            return res.status(500).json({ success: false, message: 'Lỗi kết nối Database. Vui lòng thử lại sau.' });
        }

        const User = getUserModel();
        if (!User) throw new Error("User Model is undefined");

        const { username, password, role, viewer_code } = req.body;

        // 1. Validate đầu vào
        if (!password) return res.status(400).json({ success: false, message: 'Thiếu mật khẩu' });

        let user;
        console.log(`🔍 Searching user... Role: ${role}, User: ${username || viewer_code}`);

        // 2. Tìm user tùy theo vai trò
        if (role === 'owner') {
            if (!username) return res.status(400).json({ success: false, message: 'Thiếu tên đăng nhập' });
            // Tìm theo username HOẶC email (để linh hoạt)
            user = await User.findOne({ 
                $or: [{ username: username }, { email: username }] 
            });
        } else {
            if (!viewer_code) return res.status(400).json({ success: false, message: 'Thiếu mã thành viên' });
            user = await User.findOne({ viewer_code });
        }

        if (!user) {
            console.log("❌ User not found in DB");
            return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại' });
        }

        console.log("👤 User found:", user.username || user.full_name);

        // Kiểm tra mật khẩu (Hash SHA256)
        // QUAN TRỌNG: Ép kiểu String(password) để tránh lỗi crash nếu password là số
        const hash = crypto.createHash('sha256').update(String(password)).digest('hex');
        
        // ✅ FIX MẠNH MẼ: Hỗ trợ 3 trường hợp:
        // 1. password_hash khớp (Chuẩn mới)
        // 2. password khớp hash (Chuẩn cũ)
        // 3. password khớp plain text (Trường hợp sửa tay trong DB)
        const isValid = (user.password_hash === hash) || (user.password === hash) || (user.password === password);
        
        if (!isValid) {
             console.log("❌ Password mismatch");
             return res.status(401).json({ success: false, message: 'Sai mật khẩu' });
        }

        // Tạo token: prefix_id_random
        const prefix = role === 'owner' ? 'id' : 'viewer';
        // Chuyển ObjectId sang string để đảm bảo an toàn
        const userIdStr = user._id.toString();
        const token = `${prefix}_${userIdStr}_${Date.now()}`;

        console.log("✅ Login success. Token generated.");
        
        return res.json({ 
            success: true, 
            token, 
            user: { 
                _id: userIdStr, // Trả về cả _id để frontend dùng
                id: userIdStr,
                full_name: user.full_name, 
                role: user.role 
            } 
        });
    } catch (err) {
        console.error("💥 LOGIN EXCEPTION:", err);
        return res.status(500).json({ success: false, message: "Server Error: " + err.message });
    }
};

exports.register = async (req, res) => {
    try {
        const { full_name, email, password } = req.body;
        
        if (!email || !password || !full_name) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin đăng ký' });
        }

        const User = getUserModel();

        // Kiểm tra user tồn tại (theo username hoặc email)
        const existingUser = await User.findOne({ 
            $or: [{ username: email }, { email: email }] 
        });
        
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email/Username đã tồn tại' });
        }

        const hash = crypto.createHash('sha256').update(String(password)).digest('hex');

        const newUser = await User.create({
            full_name,
            username: email, // ✅ QUAN TRỌNG: Lưu email vào username để đăng nhập được
            email,
            password: hash,
            password_hash: hash,
            role: 'owner'
        });
        
        // Tự gán owner_id cho chính mình
        newUser.owner_id = newUser._id;
        await newUser.save();

        const userIdStr = newUser._id.toString();
        res.json({ success: true, user: { full_name: newUser.full_name }, token: `id_${userIdStr}_${Date.now()}` });
    } catch (err) {
        console.error("❌ Register Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};