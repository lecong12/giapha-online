// src/controller/familyTreeController.js
const mongoose = require('mongoose');
const Person = mongoose.model('Person');
const User = mongoose.model('User');

/**
 * API lấy dữ liệu cây gia phả
 * Hỗ trợ cả owner và viewer
 */
async function getFamilyTreeData(req, res) {
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

    // Lấy toàn bộ thành viên
    const rawMembers = await Person.find({ owner_id: ownerId }).sort({ generation: 1 }).lean();

    // 1. Chuẩn hóa danh sách People (Map _id -> id)
    const people = rawMembers.map(m => {
        const genderNormalized = (m.gender || 'Unknown').toLowerCase();
        const isFemale = ['nữ', 'female', 'nu'].includes(genderNormalized);
        
        return {
            ...m,
            id: m._id.toString(), // Chuyển ObjectId sang string
            spouse_id: m.spouse_id ? m.spouse_id.toString() : null,
            spouses: m.spouse_id ? [m.spouse_id.toString()] : [],
            full_name: m.full_name || 'Không tên',
            gender: m.gender || 'Unknown',
            is_female: isFemale,
            generation: m.generation || 1
        };
    });

    const peopleIds = new Set(people.map(p => p.id));

    // 2. Tạo danh sách Relationships (Cha -> Con)
    const relationships = [];
    people.forEach(p => {
        if (p.parent_id) {
            const parentIdStr = p.parent_id.toString();
            if (peopleIds.has(parentIdStr)) {
                relationships.push({
                    id: `rel_${parentIdStr}_${p.id}`,
                    parent_id: parentIdStr,
                    child_id: p.id
                });
            }
        }
    });

    // 3. Tạo danh sách Marriages (Vợ chồng)
    const marriages = [];
    const processedSpouses = new Set();

    people.forEach(p => {
        if (p.spouse_id && peopleIds.has(p.spouse_id)) {
            const sId = p.spouse_id;
            const pId = p.id;
            const key = [pId, sId].sort().join('_');
            
            if (!processedSpouses.has(key)) {
                processedSpouses.add(key);
                let husband_id = p.is_female ? sId : pId;
                let wife_id = p.is_female ? pId : sId;
                
                marriages.push({ id: `mar_${key}`, husband_id, wife_id });
            }
        }
    });

    return res.json({ success: true, data: { people, relationships, marriages } });

  } catch (err) {
    console.error("Lỗi lấy cây gia phả:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getFamilyTreeData
};