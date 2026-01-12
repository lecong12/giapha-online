// src/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Lấy Model đã định nghĩa ở server.js
const Person = mongoose.model('Person');
const User = mongoose.model('User');
const Activity = mongoose.model('Activity');

// Sử dụng middleware thật
const { checkAuth } = require('../middleware/auth');

// Route thống kê
router.get('/stats', checkAuth, async (req, res) => {
    try {
        let ownerId;
        if (req.user.role === 'viewer') {
            const viewer = await User.findById(req.user.id);
            if (!viewer || !viewer.owner_id) return res.status(403).json({ success: false, message: "Viewer không hợp lệ hoặc không có owner." });
            ownerId = viewer.owner_id;
        } else {
            ownerId = req.user.id;
        }

        console.log(`📊 [API Stats] Đang lấy thống kê cho Owner ID: ${ownerId}`);
        
        // 1. Counts
        const totalMembers = await Person.countDocuments({ owner_id: ownerId });
        const males = await Person.countDocuments({ owner_id: ownerId, gender: { $in: ['male', 'Nam'] } });
        const females = await Person.countDocuments({ owner_id: ownerId, gender: { $in: ['female', 'Nữ'] } });
        
        // 2. Generations
        const generations = await Person.aggregate([
            { $match: { owner_id: new mongoose.Types.ObjectId(ownerId) } },
            { $group: { _id: "$generation", count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        
        const maxGeneration = generations.length > 0 ? Math.max(...generations.map(g => g._id || 0)) : 0;

        // 3. Upcoming Birthdays
        const aliveMembers = await Person.find({ 
            owner_id: ownerId, 
            is_alive: true, 
            birth_date: { $ne: null } 
        }).select('full_name birth_date');

        const upcomingBirthdays = calcUpcomingBirthdays(aliveMembers, 45);

        // 4. Upcoming Death Anniversaries
        const deadMembers = await Person.find({ 
            owner_id: ownerId, 
            is_alive: false, 
            death_date: { $ne: null } 
        }).select('full_name death_date');

        const upcomingDeathAnniversaries = calcUpcomingDeathAnniversaries(deadMembers, 45);

        // 5. Activities
        const activities = await Activity.find({ owner_id: ownerId })
            .sort({ created_at: -1 })
            .limit(10);

        res.json({ 
            success: true, 
            stats: {
                total: totalMembers,
                males,
                females,
                totalUsers: 0,
                maxGeneration,
                generations: generations.map(g => ({ generation: g._id, count: g.count })),
                upcomingBirthdays,
                upcomingDeathAnniversaries,
                activities
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Helper functions
function calcUpcomingBirthdays(members, daysAhead) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const currentYear = today.getFullYear();

    return members.map(m => {
        // FIX: Chuẩn hóa ngày trước khi tính toán (xử lý trường hợp DD/MM/YYYY)
        const normalized = normalizeDate(m.birth_date);
        if (!normalized) return null;
        
        const birth = new Date(normalized);
        if (isNaN(birth.getTime())) return null;

        let next = new Date(currentYear, birth.getMonth(), birth.getDate());
        if (next < today) next.setFullYear(currentYear + 1);
        
        const diffDays = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
        
        if (diffDays <= daysAhead) {
            return {
                id: m._id,
                full_name: m.full_name,
                birthday: m.birth_date,
                daysLeft: diffDays,
                nextBirthday: next.toISOString().split('T')[0]
            };
        }
        return null;
    }).filter(Boolean).sort((a, b) => a.daysLeft - b.daysLeft);
}

function calcUpcomingDeathAnniversaries(members, daysAhead) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const currentYear = today.getFullYear();

    return members.map(m => {
        // FIX: Chuẩn hóa ngày trước khi tính toán
        const normalized = normalizeDate(m.death_date);
        if (!normalized) return null;

        const death = new Date(normalized);
        if (isNaN(death.getTime())) return null;

        let next = new Date(currentYear, death.getMonth(), death.getDate());
        if (next < today) next.setFullYear(currentYear + 1);
        
        const diffDays = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
        const yearCount = currentYear - death.getFullYear();

        if (diffDays <= daysAhead) {
            return {
                id: m._id,
                full_name: m.full_name,
                death_date: m.death_date,
                daysLeft: diffDays,
                nextAnniversary: next.toISOString().split('T')[0],
                yearCount: yearCount
            };
        }
        return null;
    }).filter(Boolean).sort((a, b) => a.daysLeft - b.daysLeft);
}

// Hàm chuẩn hóa ngày tháng để xử lý các định dạng không đồng nhất từ DB
function normalizeDate(dateStr) {
    if (!dateStr || dateStr === 'unknown') return null;

    // Nếu là đối tượng Date, chuyển sang YYYY-MM-DD
    if (dateStr instanceof Date) {
        return dateStr.toISOString().split('T')[0];
    }
    
    const str = String(dateStr).trim();

    // Ưu tiên xử lý dạng DD/MM/YYYY hoặc DD-MM-YYYY
    const dmy = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dmy) {
        return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }

    // Thử parse các định dạng khác (bao gồm YYYY-MM-DD)
    const parsed = new Date(str);
    // Nếu parse thành công, trả về định dạng YYYY-MM-DD
    return !isNaN(parsed.getTime()) ? parsed.toISOString().split('T')[0] : null;
}

// Route lấy cây gia phả
router.get('/family-tree', checkAuth, async (req, res) => {
    try {
        let ownerId;
        if (req.user.role === 'viewer') {
            const viewer = await User.findById(req.user.id);
            if (!viewer || !viewer.owner_id) return res.status(403).json({ success: false, message: "Viewer không hợp lệ hoặc không có owner." });
            ownerId = viewer.owner_id;
        } else {
            ownerId = req.user.id;
        }

        console.log(`🌳 [API Tree] Đang tải cây gia phả cho Owner ID: ${ownerId}`);

        // 1. Truy vấn dữ liệu (Dùng lean() để lấy JSON thô, tăng tốc độ)
        const rawMembers = await Person.find({ owner_id: ownerId }).sort({ generation: 1 }).lean();
        
        console.log(`✅ [API Tree] Tìm thấy ${rawMembers.length} thành viên.`);
        
        // Helper: Xử lý an toàn mảng ID (tránh null/undefined/object rác)
        const safeParseIds = (val) => {
            if (!val) return [];
            const arr = Array.isArray(val) ? val : [val];
            return arr.map(v => {
                if (!v) return null;
                // Nếu là Object (do populate nhầm), lấy _id
                if (typeof v === 'object' && v._id) return v._id.toString();
                // Nếu là ObjectId hoặc String
                return v.toString();
            }).filter(v => v && v !== '[object Object]');
        };

        // 2. Chuẩn hóa dữ liệu
        const people = rawMembers.map(m => {
            try {
                const id = m._id.toString();
                const parents = safeParseIds(m.parent_id);
                const spouses = safeParseIds(m.spouse_id);

                return {
                    ...m,
                    id: id, 
                    spouse_id: spouses.length > 0 ? spouses[0] : null, // Giữ tương thích ngược
                    spouses: spouses, // Mảng đầy đủ
                    parent_id: parents.length > 0 ? parents[0] : null, // Giữ tương thích ngược
                    parents: parents, // Mảng đầy đủ
                    full_name: m.full_name || 'Không tên',
                    gender: m.gender || 'Unknown',
                    is_female: ['nữ', 'female', 'nu'].includes((m.gender || '').toLowerCase()),
                    generation: m.generation || 1,
                    // Chuẩn hóa định dạng ngày tháng trước khi gửi về client
                    birth_date: normalizeDate(m.birth_date),
                    death_date: normalizeDate(m.death_date)
                };
            } catch (err) {
                console.error(`❌ Lỗi xử lý thành viên ${m._id}:`, err.message);
                return null;
            }
        }).filter(p => p !== null); // Loại bỏ các bản ghi lỗi

        // Tạo Set ID để kiểm tra tham chiếu (tránh lỗi nếu ID cha/vợ/chồng không tồn tại)
        const peopleIds = new Set(people.map(p => p.id));

        // 2. Tạo danh sách Relationships (Cha -> Con)
        const relationships = [];
        people.forEach(p => {
            // Duyệt qua mảng parents thay vì chỉ parent_id
            if (p.parents && p.parents.length > 0) {
                p.parents.forEach(parentIdStr => {
                    if (peopleIds.has(parentIdStr)) {
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

        people.forEach(p => {
            // Duyệt qua mảng spouses thay vì chỉ spouse_id
            if (p.spouses && p.spouses.length > 0) {
                p.spouses.forEach(sId => {
                    if (peopleIds.has(sId)) {
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
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;