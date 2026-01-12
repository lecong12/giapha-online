const mongoose = require('mongoose');
const User = mongoose.model('User');
const crypto = require('crypto');

exports.login = async (req, res) => {
    try {
        console.log('📥 Login Request:', req.body); 

        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ success: false, message: 'Không nhận được dữ liệu đăng nhập' });
        }

        const { username, email, password, viewer_code } = req.body;

        // 1. Đăng nhập Viewer (dùng mã code)
        if (viewer_code && viewer_code.trim() !== '') {
            const viewer = await User.findOne({ viewer_code });
            if (!viewer) return res.status(401).json({ success: false, message: 'Mã viewer không đúng' });
            
            // Nếu viewer có password (tùy chọn)
            if (viewer.password_hash) {
                 const hash = crypto.createHash('sha256').update(password).digest('hex');
                 if (viewer.password_hash !== hash) {
                     return res.status(401).json({ success: false, message: 'Sai mật khẩu viewer' });
                 }
            } else if (viewer.password && viewer.password !== 'N/A' && viewer.password !== password) {
                 return res.status(401).json({ success: false, message: 'Sai mật khẩu viewer' });
            }

            return res.json({
                success: true,
                token: `viewer_${viewer._id}_${Date.now()}`,
                role: 'viewer',
                // Trả về object user để frontend đồng bộ
                user: {
                    _id: viewer._id,
                    full_name: viewer.full_name,
                    role: 'viewer'
                }
            });
        }

        // 2. Đăng nhập Admin/Owner
        // Hỗ trợ đăng nhập bằng username HOẶC email
        const loginKey = username || email;
        if (!loginKey) {
             return res.status(400).json({ success: false, message: 'Vui lòng nhập tên đăng nhập hoặc email' });
        }

        const user = await User.findOne({ 
            $or: [{ username: loginKey }, { email: loginKey }] 
        });

        if (!user) {
            console.log(`❌ Đăng nhập thất bại: Không tìm thấy user '${loginKey}'`);
            return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại' });
        }

        // Kiểm tra password
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        // Hỗ trợ cả hash (mới) và plain text (cũ/viewer)
        const isValid = (user.password_hash === hash) || (user.password === password);

        if (!isValid) {
            console.log(`❌ Đăng nhập thất bại: Sai mật khẩu cho user '${user.username}'`);
            return res.status(401).json({ success: false, message: 'Sai mật khẩu' });
        }

        return res.json({
            success: true,
            token: `id_${user._id}_${Date.now()}`,
            role: user.role || 'owner',
            // SỬA LỖI: Trả về object user để frontend lưu vào localStorage
            user: {
                _id: user._id,
                full_name: user.full_name,
                role: user.role || 'owner',
                viewer_code: user.viewer_code
            }
        });

    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
    }
};

exports.register = async (req, res) => {
    try {
        const { full_name, email, password } = req.body;
        
        if (!email || !password || !full_name) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin' });
        }

        // Kiểm tra email hoặc username đã tồn tại chưa
        // Username mặc định là email
        const existingUser = await User.findOne({ 
            $or: [{ email: email }, { username: email }] 
        });
        
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email này đã được sử dụng' });
        }

        const hash = crypto.createHash('sha256').update(password).digest('hex');
        
        // SỬA LỖI: Tự động sinh viewer_code cho tài khoản mới
        const viewerCode = 'VIEW' + Math.floor(100000 + Math.random() * 900000);
        
        const newUser = await User.create({
            full_name,
            email,
            username: email, // Dùng email làm username mặc định
            password: hash, // Lưu hash vào trường password để tương thích logic cũ nếu cần
            password_hash: hash,
            role: 'owner',
            viewer_code: viewerCode // Lưu mã viewer
        });
        
        // Tự gán owner_id là chính mình
        newUser.owner_id = newUser._id;
        await newUser.save();

        // Trả về token để tự động đăng nhập
        const token = `id_${newUser._id}_${Date.now()}`;
        return res.json({ success: true, message: 'Đăng ký thành công', token, user: newUser });

    } catch (err) {
        console.error('Register Error:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi đăng ký: ' + err.message });
    }
};