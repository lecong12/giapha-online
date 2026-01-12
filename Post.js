const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    author_role: { type: String, enum: ['owner', 'viewer'], default: 'owner' },
    title: { type: String, required: true },
    content: { type: String, required: true },
    category: { type: String, enum: ['announcement', 'event', 'news'], default: 'announcement' },
    is_pinned: { type: Boolean, default: false },
    images: [{ type: String }], // URL ảnh
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        content: String,
        created_at: { type: Date, default: Date.now }
    }]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.models.Post || mongoose.model('Post', PostSchema);