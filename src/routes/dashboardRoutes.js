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
        // Nếu ngày sinh nhật năm nay đã qua (nhỏ hơn hôm nay), tính cho năm sau
        if (next.getTime() < today.getTime()) next.setFullYear(currentYear + 1);
        
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
        if (next.getTime() < today.getTime()) next.setFullYear(currentYear + 1);
        
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

