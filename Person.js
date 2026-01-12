const mongoose = require('mongoose');

const PersonSchema = new mongoose.Schema({
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    full_name: { type: String, required: true },
    gender: { type: String, enum: ['Nam', 'Nữ', 'male', 'female'], default: 'Nam' },
    birth_date: { type: String }, // YYYY-MM-DD hoặc 'unknown'
    death_date: { type: String },
    is_alive: { type: Boolean, default: true },
    generation: { type: Number, default: 1 },
    order: { type: Number }, // Thứ tự con trong gia đình
    phone: { type: String },
    job: { type: String },
    address: { type: String },
    notes: { type: String },
    avatar: { type: String }, // URL ảnh
    parent_id: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Person', default: [] }], // Mảng chứa ID cha/mẹ
    spouse_id: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Person', default: [] }], // Mảng chứa ID vợ/chồng
    member_type: { type: String, enum: ['blood', 'in_law'], default: 'blood' }
}, { timestamps: true });

module.exports = mongoose.models.Person || mongoose.model('Person', PersonSchema);