// src/controller/viewerController.js
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = mongoose.model('User');
const { logActivity } = require('../utils/activityLogger'); // ← THÊM DÒNG NÀY

// Hàm hash password đơn giản (dùng SHA256)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Hàm tạo viewer_code ngẫu nhiên (10 ký tự)
function generateViewerCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/* ============================================================
   1. TẠO TÀI KHOẢN VIEWER MỚI (CÓ MẬT KHẨU)
============================================================ */
async function createViewer(req, res) {
  const ownerId = req.user.id;
  const { full_name, password } = req.body;

  // Validate
  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ success: false, message: 'Thiếu họ tên viewer' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' });
  }

  try {
    // Tạo viewer_code ngẫu nhiên
    let viewerCode = generateViewerCode();
    
    // Kiểm tra trùng lặp
    let existing = await User.findOne({ viewer_code: viewerCode });
    if (existing) {
      viewerCode = generateViewerCode() + Math.floor(Math.random() * 100);
    }

    // Hash password
    const passwordHash = hashPassword(password);
    
    const newViewer = await User.create({
      email: `viewer_${viewerCode}@system.local`, // Dummy email
      password: 'N/A',
      password_hash: passwordHash,
      viewer_code: viewerCode,
      full_name: full_name.trim(),
      role: 'viewer',
      owner_id: ownerId
    });

    // Log hoạt động
    await logActivity(null, {
      owner_id: ownerId,
      actor_id: ownerId,
      actor_role: 'owner',
      actor_name: 'Admin',
      action_type: 'create',
      entity_type: 'viewer',
      entity_name: full_name.trim(),
      description: `Đã tạo tài khoản viewer: ${full_name.trim()} (Mã: ${viewerCode})`
    });

    res.json({ success: true, message: 'Tạo viewer thành công', viewer: { ...newViewer.toObject(), password } });
  } catch (err) {
    console.error('Lỗi tạo viewer:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

/* ============================================================
   2. LẤY DANH SÁCH VIEWER CỦA ADMIN
============================================================ */
async function getViewers(req, res) {
  const ownerId = req.user.id;

  try {
    const viewers = await User.find({ owner_id: ownerId, role: 'viewer' })
      .sort({ created_at: -1 })
      .select('id full_name viewer_code created_at');

    const result = viewers.map(v => ({ id: v._id, ...v.toObject() }));
    res.json({ success: true, viewers: result });
  } catch (err) {
    console.error('Lỗi getViewers:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

/* ============================================================
   3. XÓA VIEWER
============================================================ */
async function deleteViewer(req, res) {
  const ownerId = req.user.id;
  const viewerId = req.params.id;

  try {
    const viewer = await User.findOne({ _id: viewerId, owner_id: ownerId, role: 'viewer' });
    if (!viewer) return res.status(404).json({ success: false, message: 'Không tìm thấy viewer' });

    const viewerName = viewer.full_name;
    await User.findByIdAndDelete(viewerId);

    await logActivity(null, {
      owner_id: ownerId,
      actor_id: ownerId,
      actor_role: 'owner',
      actor_name: 'Admin',
      action_type: 'delete',
      entity_type: 'viewer',
      entity_name: viewerName,
      description: `Đã xóa tài khoản viewer: ${viewerName}`
    });

    res.json({ success: true, message: 'Đã xóa viewer' });
  } catch (err) {
    console.error('Lỗi xóa viewer:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

/* ============================================================
   4. CẬP NHẬT THÔNG TIN VIEWER
============================================================ */
async function updateViewer(req, res) {
  const ownerId = req.user.id;
  const viewerId = req.params.id;
  const { full_name } = req.body;

  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ success: false, message: 'Thiếu họ tên' });
  }

  try {
    const viewer = await User.findOneAndUpdate(
      { _id: viewerId, owner_id: ownerId, role: 'viewer' },
      { full_name: full_name.trim() },
      { new: true }
    );

    if (!viewer) return res.status(404).json({ success: false, message: 'Không tìm thấy viewer' });
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('Lỗi update viewer:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

module.exports = {
  createViewer,
  getViewers,
  deleteViewer,
  updateViewer
};