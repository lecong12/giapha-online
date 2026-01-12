// src/utils/activityLogger.js
const mongoose = require('mongoose');

async function logActivity(db, params) {
  try {
    // db param được giữ lại để tương thích ngược nhưng không dùng
    const Activity = mongoose.model('Activity');
    
    await Activity.create({
      owner_id: params.owner_id,
      actor_id: params.actor_id,
      actor_role: params.actor_role,
      actor_name: params.actor_name,
      action_type: params.action_type,
      entity_type: params.entity_type,
      entity_name: params.entity_name,
      description: params.description
    });
    
    console.log(`📝 Logged: ${params.description}`);
  } catch (err) {
    console.error('❌ Lỗi ghi log:', err);
  }
}

module.exports = {
  logActivity
};