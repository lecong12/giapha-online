const mongoose = require('mongoose');

const PersonSchema = new mongoose.Schema({
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    full_name: { type: String, required: true },
    gender: { 
        type: String, 
        // Bỏ enum hoặc thêm các biến thể để tránh lỗi nạp dữ liệu từ Excel
        default: 'Nam' 
    },
    birth_date: { type: String }, 
    death_date: { type: String },
    is_alive: { type: Boolean, default: true },
    generation: { type: Number, default: 1 },
    branch: { type: String }, 
    order: { type: Number }, 
    phone: { type: String },
    job: { type: String }, // ✅ Thêm trường nghề nghiệp
    address: { type: String },
    notes: { type: String },
    photo: { type: String }, // Đổi từ avatar thành photo cho khớp cột Excel
    
    // Quan hệ
    parent_id: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Person', default: [] }], 
    mother_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Person' }, 
    spouse_id: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Person', default: [] }],
    
    member_type: { 
        type: String, 
        enum: ['blood', 'spouse', 'in_law'], // Thống nhất các giá trị này
        default: 'blood' 
    },
    // Trường tạm để phục vụ logic nối dây (sẽ xóa sau khi import xong)
    temp_id: { type: String, select: false },
    temp_parent_uid: { type: String, select: false }, // Lưu ID cha thô từ CSV
    temp_spouse_uid: { type: String, select: false },  // Lưu ID vợ/chồng thô từ CSV
    temp_mother_order: { type: Number, select: false } // ✅ MỚI: Lưu thứ tự mẹ (để xác định con bà nào)
}, { timestamps: true, collection: 'members' }); // ✅ Ép tên bảng là 'members' thay vì mặc định 'people'

module.exports = mongoose.models.Person || mongoose.model('Person', PersonSchema);