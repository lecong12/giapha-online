const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    full_name: String,
    role: { type: String, enum: ['owner', 'viewer'], default: 'owner' },
    // Các trường bổ sung cho logic viewer/owner
    viewer_code: String,
    owner_id: mongoose.Schema.Types.ObjectId,
    password_hash: String
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);