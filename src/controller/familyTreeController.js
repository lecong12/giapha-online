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

    console.log(`🌳 [API Tree] Đang tải cây gia phả cho Owner ID: ${ownerId}`);

    // 1. Truy vấn dữ liệu (Dùng lean() để lấy JSON thô, tăng tốc độ)
    const rawMembers = await Person.find({ owner_id: ownerId }).sort({ generation: 1 }).lean();

    // Helper: Xử lý an toàn mảng ID
    const safeParseIds = (val) => {
        if (!val) return [];
        const arr = Array.isArray(val) ? val : [val];
        return arr.map(v => {
            if (!v) return null;
            if (typeof v === 'object' && v._id) return v._id.toString();
            return v.toString();
        }).filter(v => v && v !== '[object Object]');
    };

    // Helper: Chuẩn hóa ngày
    const normalizeDate = (dateStr) => {
        if (!dateStr || dateStr === 'unknown') return null;
        if (dateStr instanceof Date) return dateStr.toISOString().split('T')[0];
        const str = String(dateStr).trim();
        // ✅ FIX: Sửa lại regex và logic chuẩn hóa ngày tháng (hỗ trợ dd/mm/yyyy và dd-mm-yyyy)
        const dmy = str.match(/^(\d{1,2})\/-\/-$/);
        if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
        const parsed = new Date(str);
        return !isNaN(parsed.getTime()) ? parsed.toISOString().split('T')[0] : null;
    };

    // 2. Chuẩn hóa dữ liệu
    const members = rawMembers.map(m => {
        try {
            const id = m._id.toString();
            const parents = safeParseIds(m.parent_id);
            const spouses = safeParseIds(m.spouse_id);

            return {
                ...m,
                id: id,
                spouse_id: spouses.length > 0 ? spouses[0] : null,
                spouses: spouses,
                parent_id: parents.length > 0 ? parents[0] : null,
                parents: parents,
                full_name: m.full_name || 'Không tên',
                gender: m.gender || 'Unknown',
                is_female: ['nữ', 'female', 'nu'].includes((m.gender || '').toLowerCase()),
                generation: m.generation || 1,
                birth_date: normalizeDate(m.birth_date),
                death_date: normalizeDate(m.death_date)
            };
        } catch (err) {
            return null;
        }
    }).filter(p => p !== null);

    const memberIds = new Set(members.map(p => p.id));

    // 2. Tạo danh sách Relationships (Cha -> Con)
    const relationships = [];
    members.forEach(p => {
        if (p.parents && p.parents.length > 0) {
            // Duyệt qua tất cả phụ huynh (thường chỉ có Cha do logic import)
            p.parents.forEach(parentIdStr => {
                if (memberIds.has(parentIdStr)) {
                    relationships.push({
                        id: `rel_${parentIdStr}_${p.id}`,
                        parent_id: parentIdStr,
                        child_id: p.id
                    });
                }
            });
        }
    });

    // 3. Tạo danh sách Marriages (Vợ chồng)
    const marriages = [];
    const processedSpouses = new Set();

    members.forEach(p => {
        if (p.spouses && p.spouses.length > 0) {
            p.spouses.forEach(sId => {
                if (memberIds.has(sId)) {
                    const pId = p.id;
                    const key = [pId, sId].sort().join('_');
                    
                    if (!processedSpouses.has(key)) {
                        processedSpouses.add(key);
                        // Xác định chồng/vợ dựa trên giới tính (nếu có) hoặc mặc định
                        let husband_id = p.is_female ? sId : pId;
                        let wife_id = p.is_female ? pId : sId;
                        
                        marriages.push({ id: `mar_${key}`, husband_id, wife_id });
                    }
                }
            });
        }
    });

    return res.json({ success: true, data: { members, relationships, marriages } });

  } catch (err) {
    console.error("Lỗi lấy cây gia phả:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getFamilyTreeData
};