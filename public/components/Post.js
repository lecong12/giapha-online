const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    owner_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    author_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    author_role: { type: String, required: true }, // 'owner' or 'viewer'
    title: { type: String, required: true },
    content: { type: String, required: true },
    category: { type: String, default: 'announcement' }, // announcement, event, news
    is_pinned: { type: Boolean, default: false },
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

module.exports = mongoose.models.Post || mongoose.model('Post', PostSchema);