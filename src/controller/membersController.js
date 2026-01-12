// src/controller/membersController.js
const mongoose = require('mongoose');
const Person = mongoose.model('Person');
const User = mongoose.model('User');
const { logActivity } = require('../utils/activityLogger');

/* ============================================================
   1. LẤY TẤT CẢ THÀNH VIÊN
============================================================ */
async function getAllMembers(req, res) {
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

    const members = await Person.find({ owner_id: ownerId })
      .sort({ generation: 1, full_name: 1 })
      .populate('spouse_id', 'full_name') // Populate để lấy tên vợ/chồng
      .lean();

    // Map _id to id và xử lý spouse
    const result = members.map(m => ({
      id: m._id,
      ...m,
      spouse: m.spouse_id ? { id: m.spouse_id._id, full_name: m.spouse_id.full_name } : null
    }));

    return res.json({ success: true, members: result });
  } catch (err) {
    console.error('Lỗi getAllMembers:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

/* ============================================================
   2. LẤY CHI TIẾT 1 THÀNH VIÊN
============================================================ */
async function getMemberById(req, res) {
  const userId = req.user.id;
  const userRole = req.user.role;
  const memberId = req.params.id;

  try {
    let ownerId = userId;
    if (userRole === 'viewer') {
      const viewer = await User.findById(userId);
      if (!viewer || !viewer.owner_id) return res.status(403).json({ success: false, message: 'Lỗi quyền' });
      ownerId = viewer.owner_id;
    }

    const member = await Person.findOne({ _id: memberId, owner_id: ownerId })
      .populate('parent_id', 'full_name')
      .populate('spouse_id', 'full_name')
      .lean();

    if (!member) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên' });
    }

    // Format lại dữ liệu cho frontend
    const result = {
      id: member._id,
      ...member,
      parents: member.parent_id ? [member.parent_id] : [], // Frontend mong đợi mảng parents
      spouse: member.spouse_id ? { id: member.spouse_id._id, full_name: member.spouse_id.full_name } : null
    };

    return res.json({ success: true, member: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

/* ============================================================
   3. THÊM THÀNH VIÊN MỚI
============================================================ */
async function createMember(req, res) {
  const ownerId = req.user.id;
  const userId = req.user.id;
  const userRole = req.user.role;

  const {
    full_name, gender, birth_date, death_date,
    avatar, biography, generation, notes,
    phone, job, address, parent_id, spouse_id,
    member_type
  } = req.body;

  if (!full_name) return res.status(400).json({ success: false, message: 'Thiếu họ tên' });

  try {
    // Xử lý dữ liệu
    const cleanBirth = (birth_date === 'unknown' || !birth_date) ? null : birth_date;
    const cleanDeath = (death_date === 'unknown' || !death_date) ? null : death_date;
    const is_alive = req.body.is_alive !== undefined ? req.body.is_alive : (cleanDeath ? 0 : 1);

    // Logic tính thế hệ (nếu chưa có)
    let finalGen = parseInt(generation) || 1;
    
    if (parent_id) {
      const parent = await Person.findById(parent_id);
      if (parent) finalGen = parent.generation + 1;
    } else if (spouse_id) {
      const spouse = await Person.findById(spouse_id);
      if (spouse) finalGen = spouse.generation;
    }

    // Tạo member mới
    const newMember = await Person.create({
      owner_id: ownerId,
      full_name,
      gender: gender || 'Nam',
      birth_date: cleanBirth,
      death_date: cleanDeath,
      is_alive: is_alive,
      avatar, biography, notes, phone, job, address,
      generation: finalGen,
      parent_id: parent_id || null,
      spouse_id: spouse_id || null,
      member_type: member_type || 'blood'
    });

    // Cập nhật quan hệ vợ chồng (2 chiều)
    if (spouse_id) {
      await Person.findByIdAndUpdate(spouse_id, { spouse_id: newMember._id });
    }

    // Log hoạt động
    const user = await User.findById(userId);
    const actorName = user ? user.full_name : 'Admin';
    
    await logActivity(null, {
      owner_id: ownerId,
      actor_id: userId,
      actor_role: userRole,
      actor_name: actorName,
      action_type: 'create',
      entity_type: 'member',
      entity_name: full_name,
      description: `Đã thêm thành viên: ${full_name} (Đời ${finalGen})`
    });

    return res.json({ success: true, message: 'Tạo thành công', memberId: newMember._id });
  } catch (err) {
    console.error('Lỗi createMember:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

/* ============================================================
   4. SỬA THÀNH VIÊN
============================================================ */
async function updateMember(req, res) {
  const ownerId = req.user.id;
  const userId = req.user.id;
  const memberId = req.params.id;
  const { full_name, gender, birth_date, death_date, is_alive, avatar, biography, notes, phone, job, address } = req.body;

  try {
    const member = await Person.findOne({ _id: memberId, owner_id: ownerId });
    if (!member) return res.status(404).json({ success: false, message: 'Không tìm thấy' });

    // Update fields
    member.full_name = full_name || member.full_name;
    member.gender = gender || member.gender;
    member.birth_date = (birth_date === 'unknown' || !birth_date) ? null : birth_date;
    member.death_date = (death_date === 'unknown' || !death_date) ? null : death_date;
    member.is_alive = is_alive !== undefined ? is_alive : member.is_alive;
    member.avatar = avatar || member.avatar;
    member.biography = biography || member.biography;
    member.notes = notes || member.notes;
    member.phone = phone || member.phone;
    member.job = job || member.job;
    member.address = address || member.address;

    await member.save();

    // Log
    const user = await User.findById(userId);
    await logActivity(null, {
      owner_id: ownerId,
      actor_id: userId,
      actor_role: req.user.role,
      actor_name: user ? user.full_name : 'Admin',
      action_type: 'update',
      entity_type: 'member',
      entity_name: full_name,
      description: `Đã cập nhật: ${full_name}`
    });

    return res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

/* ============================================================
   5. XÓA THÀNH VIÊN
============================================================ */
async function deleteMember(req, res) {
  const ownerId = req.user.id;
  const userId = req.user.id;
  const memberId = req.params.id;

  try {
    const member = await Person.findOne({ _id: memberId, owner_id: ownerId });
    if (!member) return res.status(404).json({ success: false, message: 'Không tìm thấy' });

    const memberName = member.full_name;

    // Xóa quan hệ: Set parent_id của con cái về null
    await Person.updateMany({ parent_id: memberId }, { parent_id: null });
    
    // Xóa quan hệ: Set spouse_id của vợ/chồng về null
    await Person.updateMany({ spouse_id: memberId }, { spouse_id: null });

    // Xóa người
    await Person.findByIdAndDelete(memberId);

    // Log
    const user = await User.findById(userId);
    await logActivity(null, {
      owner_id: ownerId,
      actor_id: userId,
      actor_role: req.user.role,
      actor_name: user ? user.full_name : 'Admin',
      action_type: 'delete',
      entity_type: 'member',
      entity_name: memberName,
      description: `Đã xóa thành viên: ${memberName}`
    });

    return res.json({ success: true, message: 'Xóa thành công' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

/* ============================================================
   6. TÌM KIẾM
============================================================ */
async function searchMembers(req, res) {
  const userId = req.user.id;
  const { name, generation, gender, status, job, address } = req.body;

  try {
    const query = { owner_id: userId };
    if (name) query.full_name = { $regex: name, $options: 'i' };
    if (generation) query.generation = generation;
    if (gender && gender !== 'all') query.gender = gender === 'male' ? 'Nam' : 'Nữ';
    if (status) query.is_alive = status === 'living';
    if (job) query.job = { $regex: job, $options: 'i' };
    if (address) query.address = { $regex: address, $options: 'i' };

    const members = await Person.find(query).lean();
    const result = members.map(m => ({ id: m._id, ...m }));

    return res.json({ success: true, members: result, count: result.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi tìm kiếm' });
  }
}

module.exports = {
  getAllMembers,
  getMemberById,
  createMember,
  updateMember,
  deleteMember,
  searchMembers
};