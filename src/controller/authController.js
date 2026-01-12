// src/controller/authController.js
const crypto = require('crypto');

function getDb(req) {
  return req.app.get('db');
}

// Hàm hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/* ============================================================
   1. ĐĂNG KÝ OWNER
============================================================ */
async function register(req, res) {
  const db = getDb(req);

  if (!db) {
    console.error("❌ Lỗi: Database chưa được khởi tạo (db is null)");
    return res.status(500).json({ success: false, message: 'Lỗi kết nối Database' });
  }

  // Thêm || {} để tránh crash nếu req.body bị undefined
  const { email, password, full_name } = req.body || {};

  console.log(`\n👉 Đang xử lý Đăng ký: Email="${email}", Name="${full_name}"`);

  // Validate
  if (!email || !password || !full_name) {
    console.log("❌ Thiếu thông tin bắt buộc");
    return res.status(400).json({ 
      success: false, 
      message: 'Thiếu thông tin bắt buộc' 
    });
  }

  if (password.length < 6) {
    console.log("❌ Mật khẩu quá ngắn");
    return res.status(400).json({ 
      success: false, 
      message: 'Mật khẩu phải có ít nhất 6 ký tự' 
    });
  }

  // Kiểm tra email đã tồn tại
  db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, existing) => {
    if (err) {
      console.error("❌ Lỗi kiểm tra email:", err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server khi kiểm tra email' });
    }

    if (existing) {
      console.log("❌ Email đã tồn tại");
      return res.status(400).json({ 
        success: false, 
        message: 'Email đã được sử dụng' 
      });
    }

    // Hash password
    const passwordHash = hashPassword(password);

    // Tạo viewer_code ngẫu nhiên cho owner
    const viewerCode = generateViewerCode();

    // Insert owner
    const sql = `
      INSERT INTO users (email, password, viewer_code, full_name, role, owner_id, password_hash)
      VALUES (?, ?, ?, ?, 'owner', NULL, ?)
    `;

    db.run(sql, [email, passwordHash, viewerCode, full_name, passwordHash], function(errInsert) {
      if (errInsert) {
        console.error('❌ Lỗi insert user:', errInsert.message);
        return res.status(500).json({ 
          success: false, 
          message: 'Lỗi đăng ký tài khoản' 
        });
      }

      const userId = this.lastID;
      console.log(`✅ Đăng ký thành công! User ID: ${userId}`);

      // Update owner_id = id (tự tham chiếu)
      db.run(`UPDATE users SET owner_id = ? WHERE id = ?`, [userId, userId], (errUpdate) => {
        if (errUpdate) console.error("⚠️ Lỗi update owner_id:", errUpdate.message);
      });

      // Tạo token
      const randomPart = crypto.randomBytes(8).toString('hex');
      const token = `id_${userId}_${randomPart}`;

      return res.json({
        success: true,
        message: 'Đăng ký thành công',
        token: token,
        user: {
          id: userId,
          email: email,
          full_name: full_name,
          role: 'owner',
          owner_id: userId
        }
      });
    });
  });
}

/* ============================================================
   2. ĐĂNG NHẬP OWNER
============================================================ */
async function loginOwner(req, res) {
  const db = getDb(req);
  const { email, password } = req.body || {};

  console.log(`\n👉 Đang thử đăng nhập Admin: Email="${email}"`);

  if (!email || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Vui lòng nhập đầy đủ thông tin' 
    });
  }

  // Tìm user
  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (err) {
      console.error("❌ Lỗi truy vấn DB:", err);
      return res.status(500).json({ success: false, message: 'Lỗi server khi truy vấn' });
    }

    if (!user) {
      console.log("❌ Lỗi: Không tìm thấy email này trong DB.");
      return res.status(401).json({ 
        success: false, 
        message: 'Email hoặc mật khẩu không đúng' 
      });
    }

    if (user.role !== 'owner') {
      console.log(`❌ Lỗi: User tìm thấy nhưng role là '${user.role}' (yêu cầu 'owner').`);
      return res.status(403).json({ 
        success: false, 
        message: 'Tài khoản này không có quyền Admin' 
      });
    }

    // Kiểm tra password
    const passwordHash = hashPassword(password);

    // Kiểm tra cả password cũ và password_hash mới
    const isMatch = (user.password === passwordHash || user.password_hash === passwordHash);

    if (!isMatch) {
      console.log("❌ Lỗi: Sai mật khẩu!");
      console.log("   - Hash nhập vào:", passwordHash);
      console.log("   - Hash trong DB:", user.password_hash || user.password);
      return res.status(401).json({ 
        success: false, 
        message: 'Email hoặc mật khẩu không đúng' 
      });
    }

    console.log("✅ Đăng nhập thành công!");

    // Tạo token
    const randomPart = crypto.randomBytes(8).toString('hex');
    const token = `id_${user.id}_${randomPart}`;

    return res.json({
      success: true,
      message: 'Đăng nhập thành công',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: 'owner',
        owner_id: user.owner_id
      }
    });
  });
}

/* ============================================================
   3. ĐĂNG NHẬP VIEWER
============================================================ */
async function loginViewer(req, res) {
  const db = getDb(req);
  const { viewerCode, password } = req.body;

  if (!viewerCode) {
    return res.status(400).json({ 
      success: false, 
      message: 'Vui lòng nhập mã viewer' 
    });
  }

  if (!password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Vui lòng nhập mật khẩu' 
    });
  }

  // Tìm viewer
  db.get(`SELECT * FROM users WHERE viewer_code = ? AND role = 'viewer'`, [viewerCode.toUpperCase()], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Mã viewer không hợp lệ' 
      });
    }

    // Kiểm tra password
    const passwordHash = hashPassword(password);

    if (user.password_hash !== passwordHash) {
      return res.status(401).json({ 
        success: false, 
        message: 'Mật khẩu không đúng' 
      });
    }

    // Tạo token
    const randomPart = crypto.randomBytes(8).toString('hex');
    const token = `viewer_${user.id}_${randomPart}`;

    return res.json({
      success: true,
      message: 'Đăng nhập viewer thành công',
      token: token,
      user: {
        id: user.id,
        full_name: user.full_name,
        role: 'viewer',
        owner_id: user.owner_id
      }
    });
  });
}

/* ============================================================
   4. HELPER: TẠO VIEWER CODE
============================================================ */
function generateViewerCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = {
  register,
  loginOwner,
  loginViewer
};