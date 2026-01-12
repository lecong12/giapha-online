const mongoose = require('mongoose');

const PersonSchema = new mongoose.Schema({
    owner_id: { type: mongoose.Schema.Types.ObjectId, required: false },
    full_name: String,
    gender: String,
    birth_date: String,
    death_date: String,
    generation: Number,
    order: Number, // Thứ tự trong gia đình (1, 2, 3...)
    notes: String,
    phone: String,
    job: String,
    address: String,
    avatar: String, // Tương ứng với cột Photo
    is_alive: { type: Boolean, default: true },
    member_type: { type: String, default: 'blood' },
    parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Person' },
    spouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Person' },
    spouse_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Person' }]
}, { timestamps: true, collection: 'members' });

module.exports = mongoose.models.Person || mongoose.model('Person', PersonSchema);