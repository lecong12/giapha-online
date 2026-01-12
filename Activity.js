const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actor_role: { type: String }, // 'owner' hoặc 'viewer'
    actor_name: { type: String },
    action_type: { type: String, required: true }, // create, update, delete
    entity_type: { type: String }, // Member, Post...
    entity_name: { type: String },
    description: { type: String },
    metadata: { type: Object }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.models.Activity || mongoose.model('Activity', ActivitySchema);