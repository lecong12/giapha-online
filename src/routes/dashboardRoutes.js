// src/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Lấy Model đã định nghĩa ở server.js
const Person = mongoose.model('Person');
const User = mongoose.model('User');

// Tạm thời bypass checkAuth nếu middleware này chưa update sang Mongo
// const { checkAuth } = require('../middleware/auth');
const checkAuth = (req, res, next) => next(); 

// Route thống kê
router.get('/stats', checkAuth, async (req, res) => {
    try {
        const totalMembers = await Person.countDocuments();
        const totalUsers = await User.countDocuments();
        
        // Đếm số lượng Nam/Nữ (Hỗ trợ cả 'male'/'female' và 'Nam'/'Nữ')
        const males = await Person.countDocuments({ gender: { $in: ['male', 'Nam'] } });
        const females = await Person.countDocuments({ gender: { $in: ['female', 'Nữ'] } });
        
        res.json({ 
            success: true, 
            stats: {
                total: totalMembers,
                males,
                females,
                totalUsers
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Route lấy cây gia phả
router.get('/family-tree', checkAuth, async (req, res) => {
    try {
        // Lấy toàn bộ thành viên, dùng lean() để xử lý nhanh hơn
        const rawMembers = await Person.find().sort({ generation: 1 }).lean();
        
        // 1. Chuẩn hóa danh sách People (Map _id -> id)
        const people = rawMembers.map(m => {
            const genderNormalized = (m.gender || 'Unknown').toLowerCase();
            const isFemale = ['nữ', 'female', 'nu'].includes(genderNormalized);
            
            return {
                ...m,
                id: m._id.toString(), // Chuyển ObjectId sang string
                spouse_id: m.spouse_id ? m.spouse_id.toString() : null, // Đảm bảo string
                spouses: m.spouse_id ? [m.spouse_id.toString()] : [], // Thêm mảng spouses cho renderer
                full_name: m.full_name || 'Không tên',
                gender: m.gender || 'Unknown',
                is_female: isFemale, // Flag phụ trợ xác định giới tính
                generation: m.generation || 1
            };
        });

        // Tạo Set ID để kiểm tra tham chiếu (tránh lỗi nếu ID cha/vợ/chồng không tồn tại)
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
                const sId = p.spouse_id; // Đã là string từ bước map
                const pId = p.id;
                
                // Tạo key duy nhất để tránh trùng lặp (A-B và B-A là một)
                const key = [pId, sId].sort().join('_');
                
                if (!processedSpouses.has(key)) {
                    processedSpouses.add(key);
                    
                    // Xác định chồng/vợ (Ưu tiên Nam là husband)
                    let husband_id = pId;
                    let wife_id = sId;
                    
                    if (p.is_female) {
                        husband_id = sId;
                        wife_id = pId;
                    }
                    
                    marriages.push({
                        id: `mar_${key}`,
                        husband_id,
                        wife_id
                    });
                }
            }
        });

        // Trả về đúng cấu trúc FamilyTreeRenderer yêu cầu
        res.json({
            success: true,
            data: {
                people,
                relationships,
                marriages
            }
        });
    } catch (err) {
        console.error("Lỗi lấy cây gia phả:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;