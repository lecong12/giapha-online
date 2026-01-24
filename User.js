const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, sparse: true }, // Cho admin
    email: { type: String, unique: true, sparse: true },    // Cho owner đăng ký
    password: { type: String }, // Plain text (nếu cần) hoặc hash
    password_hash: { type: String }, // Hash bảo mật cao
    full_name: { type: String, required: true },
    role: { type: String, enum: ['owner', 'viewer'], default: 'viewer' },
    viewer_code: { type: String, unique: true, sparse: true }, // Mã đăng nhập cho viewer
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // Link tới chủ sở hữu
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);