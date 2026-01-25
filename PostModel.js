const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    author_name: { type: String },
    title: { type: String, required: true },
    content: { type: String, required: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.models.Post || mongoose.model('Post', PostSchema);