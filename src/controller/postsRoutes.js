const express = require('express');
const router = express.Router();
const postsController = require('../controller/postsController');

// Middleware xác thực (Tự định nghĩa để đảm bảo hoạt động nếu thiếu file gốc)
const checkAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ success: false, message: 'Chưa đăng nhập (No Token)' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
    }

    try {
        // Format token: prefix_id (vd: id_123 hoặc viewer_456)
        const parts = token.split('_');
        if (parts.length < 2) throw new Error('Invalid token format');

        const prefix = parts[0];
        const id = parts[1]; // Giữ nguyên string cho MongoDB ObjectId

        req.user = {
            id: id,
            role: prefix === 'id' ? 'owner' : 'viewer'
        };
        next();
    } catch (err) {
        console.error('Auth Error:', err.message);
        return res.status(401).json({ success: false, message: 'Lỗi xác thực người dùng' });
    }
};

// --- ĐỊNH NGHĨA ROUTES ---

// Lấy danh sách bài viết
router.get('/', checkAuth, postsController.getAllPosts);

// Lấy chi tiết bài viết
router.get('/:id', checkAuth, postsController.getPostById);

// Tạo bài viết mới
router.post('/', checkAuth, postsController.createPost);

// Sửa bài viết
router.put('/:id', checkAuth, postsController.updatePost);

// Xóa bài viết
router.delete('/:id', checkAuth, postsController.deletePost);

module.exports = router;