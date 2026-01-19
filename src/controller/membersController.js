const mongoose = require('mongoose');
const Person = mongoose.model('Person');

// Lấy danh sách thành viên
exports.getAllMembers = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const members = await Person.find({ owner_id: ownerId })
            .sort({ generation: 1, birth_date: 1 });
        
        // Format dữ liệu cho frontend
        const formatted = members.map(m => ({
            id: m._id,
            _id: m._id, // ✅ Thêm trường này để tương thích với frontend cũ
            full_name: m.full_name,
            gender: m.gender,
            birth_date: m.birth_date,
            death_date: m.death_date,
            generation: m.generation,
            avatar: m.avatar,
            // Frontend mong đợi ID đơn lẻ cho dropdown, nhưng DB lưu mảng
            parent_id: m.parent_id && m.parent_id.length ? m.parent_id[0] : null,
            spouse_id: m.spouse_id && m.spouse_id.length ? m.spouse_id[0] : null,
            // Gửi thêm mảng đầy đủ nếu cần
            parents: m.parent_id,
            spouse: m.spouse_id
        }));

        res.json({ success: true, members: formatted });
    } catch (err) {
        console.error("Get Members Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Lấy chi tiết 1 thành viên
exports.getMemberById = async (req, res) => {
    try {
        const member = await Person.findOne({ _id: req.params.id, owner_id: req.user.id })
            .populate('parent_id', 'full_name')
            .populate('spouse_id', 'full_name');
            
        if (!member) return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên' });

        const data = {
            ...member.toObject(),
            id: member._id,
            parents: member.parent_id, // Đã populate tên
            spouse: member.spouse_id && member.spouse_id.length ? member.spouse_id[0] : null
        };

        res.json({ success: true, member: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Tạo thành viên mới
exports.createMember = async (req, res) => {
    try {
        const data = req.body;
        data.owner_id = req.user.id;
        
        // Xử lý parent_id và spouse_id từ form (đơn lẻ) thành mảng
        if (data.parent_id) data.parent_id = [data.parent_id];
        if (data.spouse_id) data.spouse_id = [data.spouse_id];

        const newMember = await Person.create(data);
        res.json({ success: true, member: newMember });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Cập nhật thành viên
exports.updateMember = async (req, res) => {
    try {
        const data = req.body;
        
        // Xử lý parent_id và spouse_id
        if (data.parent_id) data.parent_id = [data.parent_id];
        if (data.spouse_id) data.spouse_id = [data.spouse_id];

        const updated = await Person.findOneAndUpdate(
            { _id: req.params.id, owner_id: req.user.id },
            data,
            { new: true }
        );
        
        if (!updated) return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên' });
        res.json({ success: true, member: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Xóa thành viên
exports.deleteMember = async (req, res) => {
    try {
        const deleted = await Person.findOneAndDelete({ _id: req.params.id, owner_id: req.user.id });
        if (!deleted) return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên' });
        res.json({ success: true, message: 'Đã xóa thành công' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};