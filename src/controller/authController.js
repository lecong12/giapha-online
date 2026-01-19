const mongoose = require('mongoose');
const User = mongoose.model('User');
const crypto = require('crypto');

exports.login = async (req, res) => {
    try {
        const { username, password, role, viewer_code } = req.body;
        
        let user;
        if (role === 'owner') {
            user = await User.findOne({ username });
        } else {
            user = await User.findOne({ viewer_code });
        }

        if (!user) return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại' });

        // Kiểm tra mật khẩu (Hash SHA256)
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        
        // Hỗ trợ cả password cũ (nếu có) và password_hash mới
        const isValid = (user.password_hash === hash) || (user.password === hash);
        
        if (!isValid) {
             return res.status(401).json({ success: false, message: 'Sai mật khẩu' });
        }

        // Tạo token: prefix_id_random
        const prefix = role === 'owner' ? 'id' : 'viewer';
        const token = `${prefix}_${user._id}_${Date.now()}`;

        res.json({ 
            success: true, 
            token, 
            user: { full_name: user.full_name, role: user.role } 
        });
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.register = async (req, res) => {
    try {
        const { full_name, email, password } = req.body;
        const hash = crypto.createHash('sha256').update(password).digest('hex');

        const newUser = await User.create({
            full_name,
            email,
            password: hash,
            password_hash: hash,
            role: 'owner'
        });
        
        // Tự gán owner_id cho chính mình
        newUser.owner_id = newUser._id;
        await newUser.save();

        res.json({ success: true, user: { full_name: newUser.full_name }, token: `id_${newUser._id}_${Date.now()}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};