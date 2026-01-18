// src/middleware/auth.js
const fs = require('fs');

/* ============================================================
   MIDDLEWARE KIỂM TRA AUTHENTICATION
   - Cho phép cả Owner và Viewer đăng nhập
   - Parse token và lưu thông tin user vào req.user
============================================================ */
function checkAuth(req, res, next) {
  let token = null;

  // 1. Ưu tiên lấy từ Header (Bearer Token)
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const parts = authHeader.split(' ');
    // Chấp nhận cả 'Bearer' và 'bearer'
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }

  // 2. Fallback: Lấy từ Query Param (URL?token=...)
  if (!token && req.query && req.query.token) token = req.query.token;

  // 3. Fallback: Lấy từ Body (Form Data - yêu cầu body parser/multer chạy trước)
  if (!token && req.body && req.body.token) token = req.body.token;

  if (!token) {
    console.warn('⚠️ [Auth Fail] Không tìm thấy token.');
    console.warn('   - Header:', authHeader);
    console.warn('   - Query:', req.query);
    console.warn('   - Body:', req.body); // Kiểm tra xem body có dữ liệu không
    
    // CLEANUP: Xóa file nếu upload thành công nhưng auth thất bại
    if (req.file && req.file.path) {
        try { fs.unlinkSync(req.file.path); } catch(e) {}
    }
    return res.status(401).json({ success: false, message: 'Thiếu hoặc sai header Authorization' });
  }

  try {
    const tokenParts = token.split('_');
    if (tokenParts.length < 3) {
      throw new Error('Token format invalid');
    }

    const prefix = tokenParts[0]; // 'id' (owner) hoặc 'viewer'
    const userIdPart = tokenParts[1];
    const randomPart = tokenParts.slice(2).join('_');

    // Validate prefix
    if (!['id', 'viewer'].includes(prefix)) {
      throw new Error('Token prefix invalid');
    }

    // Validate user ID (should be a non-empty string for MongoDB ObjectId)
    if (!userIdPart || userIdPart.trim() === '') {
      throw new Error('User id invalid');
    }

    // Validate random part
    if (!randomPart || randomPart.trim() === '') {
      throw new Error('Random part invalid');
    }

    // Lưu thông tin user vào request
    req.user = {
      id: userIdPart, // ✅ Sử dụng ID dạng chuỗi
      role: prefix === 'viewer' ? 'viewer' : 'owner'
    };

    next();
  } catch (err) {
    // CLEANUP: Xóa file nếu token lỗi
    if (req.file && req.file.path) {
        try { fs.unlinkSync(req.file.path); } catch(e) {}
    }
    return res.status(401).json({ 
      success: false, 
      message: 'Token không hợp lệ: ' + err.message 
    });
  }
}

/* ============================================================
   MIDDLEWARE CHỈ CHO PHÉP OWNER
   - Kiểm tra user phải là owner
   - Chặn viewer thực hiện các thao tác ghi (create/update/delete)
============================================================ */
function checkOwnerOnly(req, res, next) {
  // req.user phải đã được set bởi checkAuth
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Chưa xác thực' 
    });
  }

  if (req.user.role !== 'owner') {
    return res.status(403).json({ 
      success: false, 
      message: '⛔ Bạn không có quyền thực hiện thao tác này. Chỉ Admin mới được phép.' 
    });
  }

  next();
}

module.exports = {
  checkAuth,
  checkOwnerOnly
};