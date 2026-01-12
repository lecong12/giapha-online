// src/controller/dashboardController.js
const mongoose = require('mongoose');
const Person = mongoose.model('Person');
const User = mongoose.model('User');
const Activity = mongoose.model('Activity');

async function getDashboardStats(req, res) {
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

    // 1. Counts
    const total = await Person.countDocuments({ owner_id: ownerId });
    const males = await Person.countDocuments({ owner_id: ownerId, gender: { $in: ['male', 'Nam'] } });
    const females = await Person.countDocuments({ owner_id: ownerId, gender: { $in: ['female', 'Nữ'] } });

    // 2. Generations
    const genStats = await Person.aggregate([
        { $match: { owner_id: new mongoose.Types.ObjectId(ownerId) } },
        { $group: { _id: "$generation", count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);
    
    const maxGeneration = genStats.length > 0 ? Math.max(...genStats.map(g => g._id || 0)) : 0;
    const generations = genStats.map(g => ({ generation: g._id, count: g.count }));

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

    return res.json({
      success: true,
      stats: {
        total,
        males,
        females,
        maxGeneration,
        generations,
        upcomingBirthdays,
        upcomingDeathAnniversaries,
        activities
      }
    });

  } catch (err) {
    console.error('Lỗi getDashboardStats:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

// Tính sinh nhật sắp tới
function calcUpcomingBirthdays(rows, daysAhead) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return rows
    .map(r => {
      if (!r.birth_date) return null;

      const birth = new Date(r.birth_date);
      if (isNaN(birth.getTime())) return null;

      let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());

      if (next < today) {
        next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
      }

      const diffMs = next - today;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      return {
        id: r._id,
        full_name: r.full_name,
        birthday: r.birth_date,
        daysLeft: diffDays,
        nextBirthday: formatDateLocal(next)
      };
    })
    .filter(x => x && x.daysLeft >= 0 && x.daysLeft <= daysAhead)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// Tính ngày giỗ sắp tới
function calcUpcomingDeathAnniversaries(rows, daysAhead) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return rows
    .map(r => {
      if (!r.death_date) return null;

      const death = new Date(r.death_date);
      if (isNaN(death.getTime())) return null;

      let next = new Date(today.getFullYear(), death.getMonth(), death.getDate());

      if (next < today) {
        next = new Date(today.getFullYear() + 1, death.getMonth(), death.getDate());
      }

      const diffMs = next - today;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const yearsPassed = today.getFullYear() - death.getFullYear();

      return {
        id: r._id,
        full_name: r.full_name,
        death_date: r.death_date,
        daysLeft: diffDays,
        nextAnniversary: formatDateLocal(next),
        yearCount: yearsPassed
      };
    })
    .filter(x => x && x.daysLeft >= 0 && x.daysLeft <= daysAhead)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// Helper format date
function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = {
  getDashboardStats
};