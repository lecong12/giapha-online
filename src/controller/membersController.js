const mongoose = require('mongoose');
const Person = mongoose.model('Person');
const User = mongoose.model('User'); // ✅ Import User để xử lý Viewer

// ✅ Helper: Làm sạch mảng ID (loại bỏ null, undefined, chuỗi rỗng, ID sai định dạng)
const cleanIds = (val) => {
    if (!val) return [];
    const arr = Array.isArray(val) ? val : [val];
    return arr.filter(id => id && mongoose.Types.ObjectId.isValid(id));
};

// Lấy danh sách thành viên
exports.getAllMembers = async (req, res) => {
    try {
        // ✅ Kiểm tra Auth để tránh crash
        if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });

        let ownerId = req.user.id;

        // ✅ Xử lý trường hợp là Viewer (Lấy dữ liệu của Owner)
        if (req.user.role === 'viewer') {
            const viewer = await User.findById(req.user.id);
            if (!viewer || !viewer.owner_id) {
                return res.status(403).json({ success: false, message: 'Không tìm thấy dữ liệu gia phả' });
            }
            ownerId = viewer.owner_id;
        }

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
            is_alive: m.is_alive, // ✅ Thêm trạng thái sống/mất
            generation: m.generation,
            avatar: m.photo || m.avatar, // ✅ Map 'photo' từ DB sang 'avatar' cho Frontend
            photo: m.photo,
            job: m.job,       // ✅ Thêm nghề nghiệp
            phone: m.phone,   // ✅ Thêm điện thoại
            address: m.address,
            notes: m.notes,
            member_type: m.member_type,
            // ✅ FIX: Lấy phần tử đầu tiên của mảng để hiển thị trên bảng/dropdown
            parent_id: (Array.isArray(m.parent_id) && m.parent_id.length > 0) ? m.parent_id[0] : null,
            spouse_id: (Array.isArray(m.spouse_id) && m.spouse_id.length > 0) ? m.spouse_id[0] : null,
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
        let ownerId = req.user.id;
        // ✅ Xử lý Viewer khi xem chi tiết
        if (req.user.role === 'viewer') {
            const viewer = await User.findById(req.user.id);
            if (viewer) ownerId = viewer.owner_id;
        }

        const member = await Person.findOne({ _id: req.params.id, owner_id: ownerId })
            .populate('parent_id', 'full_name')
            .populate('spouse_id', 'full_name');
            
        if (!member) return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên' });

        const data = {
            ...member.toObject(),
            id: member._id,
            parents: member.parent_id, // Đã populate tên
            spouse: member.spouse_id && member.spouse_id.length ? member.spouse_id[0] : null,
            avatar: member.photo || member.avatar // ✅ Map photo
        };

        res.json({ success: true, member: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Tạo thành viên mới
exports.createMember = async (req, res) => {
    try {
        // ✅ Chỉ Owner mới được tạo
        if (req.user.role !== 'owner') return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });

        const data = req.body;
        data.owner_id = req.user.id;
        
        // ✅ FIX: Làm sạch ID để tránh lỗi CastError (khi gửi chuỗi rỗng "")
        data.parent_id = cleanIds(data.parent_id);
        data.spouse_id = cleanIds(data.spouse_id);

        // Map avatar -> photo (nếu frontend gửi nhầm tên)
        if (data.avatar && !data.photo) data.photo = data.avatar;

        const newMember = await Person.create(data);
        res.json({ success: true, member: newMember });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Cập nhật thành viên
exports.updateMember = async (req, res) => {
    try {
        // ✅ Chỉ Owner mới được sửa
        if (req.user.role !== 'owner') return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });

        const data = req.body;
        
        // Xử lý parent_id và spouse_id
        // ✅ FIX: Làm sạch ID
        if (data.parent_id !== undefined) data.parent_id = cleanIds(data.parent_id);
        if (data.spouse_id !== undefined) data.spouse_id = cleanIds(data.spouse_id);

        if (data.avatar && !data.photo) data.photo = data.avatar;

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
        // ✅ Chỉ Owner mới được xóa
        if (req.user.role !== 'owner') return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });

        const deleted = await Person.findOneAndDelete({ _id: req.params.id, owner_id: req.user.id });
        if (!deleted) return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên' });
        res.json({ success: true, message: 'Đã xóa thành công' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};