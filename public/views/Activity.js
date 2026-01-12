const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
    owner_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    actor_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    actor_role: String,
    actor_name: String,
    action_type: String, // create, update, delete
    entity_type: String, // member, post, tree
    entity_name: String,
    description: String
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.models.Activity || mongoose.model('Activity', ActivitySchema);