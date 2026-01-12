// src/controller/activityController.js
const mongoose = require('mongoose');
const Activity = mongoose.model('Activity');
const User = mongoose.model('User');

/* ============================================================
   1. LẤY DANH SÁCH ACTIVITY LOGS
============================================================ */
async function getActivityLogs(req, res) {
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    let ownerId = userId;
    if (userRole === 'viewer') {
      const viewer = await User.findById(userId);
      if (!viewer || !viewer.owner_id) {
        return res.status(403).json({ success: false, message: 'Không tìm thấy owner' });
      }
      ownerId = viewer.owner_id;
    }

    const logs = await Activity.find({ owner_id: ownerId })
      .sort({ created_at: -1 })
      .limit(50);

    // Map _id to id for frontend
    const result = logs.map(log => ({
      id: log._id,
      ...log.toObject()
    }));

    return res.json({ success: true, logs: result });
  } catch (err) {
    console.error('Lỗi getActivityLogs:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

/* ============================================================
   2. XÓA 1 LOG (CHỈ OWNER)
============================================================ */
async function deleteLog(req, res) {
  const userId = req.user.id;
  const userRole = req.user.role;
  const logId = req.params.id;

  if (userRole !== 'owner') {
    return res.status(403).json({ success: false, message: 'Không có quyền' });
  }

  try {
    await Activity.findOneAndDelete({ _id: logId, owner_id: userId });
    return res.json({ success: true, message: 'Đã xóa lịch sử' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi xóa log' });
  }
}

/* ============================================================
   3. XÓA TẤT CẢ LOGS (CHỈ OWNER)
============================================================ */
async function clearAllLogs(req, res) {
  const userId = req.user.id;
  const userRole = req.user.role;

  if (userRole !== 'owner') {
    return res.status(403).json({ success: false, message: 'Không có quyền' });
  }

  try {
    await Activity.deleteMany({ owner_id: userId });
    return res.json({ success: true, message: 'Đã xóa toàn bộ lịch sử' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi xóa logs' });
  }
}

module.exports = {
  getActivityLogs,
  deleteLog,
  clearAllLogs
};