// src/routes/settingsRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const { parse } = require('csv-parse/sync'); // Dùng sync để xử lý logic phức tạp dễ hơn

const Person = mongoose.model('Person');
const User = mongoose.model('User');
const Post = mongoose.model('Post');
const Activity = mongoose.model('Activity');
const upload = multer({ dest: 'uploads/' });

// Sử dụng middleware thật
const { checkAuth, checkOwnerOnly } = require('../middleware/auth');

// Hàm chuẩn hóa ngày tháng (Hỗ trợ DD/MM/YYYY -> YYYY-MM-DD)
function normalizeDate(dateStr) {
    if (!dateStr || dateStr === 'unknown') return null;
    const str = String(dateStr).trim();

    // Ưu tiên xử lý dạng DD/MM/YYYY hoặc DD-MM-YYYY
    const dmy = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dmy) {
        return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }

    // Thử parse các định dạng khác
    const parsed = new Date(str);
    // Nếu parse thành công, trả về định dạng YYYY-MM-DD
    return !isNaN(parsed.getTime()) ? parsed.toISOString().split('T')[0] : null;
}

// Hàm chuẩn hóa tên để so sánh (xóa khoảng trắng thừa, về chữ thường)
function normalizeName(name) {
    if (!name) return '';
    // "  Nguyễn   Văn A  " -> "nguyễn văn a"
    return String(name).trim().toLowerCase().replace(/\s+/g, ' '); 
}

// Hàm chuẩn hóa giới tính
function normalizeGender(g) {
    if (!g) return 'Nam';
    const lower = String(g).trim().toLowerCase();
    if (['nam', 'male', 'trai', 'm', 'man'].includes(lower)) return 'Nam';
    if (['nữ', 'nu', 'female', 'gái', 'f', 'woman'].includes(lower)) return 'Nữ';
    return 'Nam';
}

// 1. API Import CSV (Từ Google Sheets)
// SỬA LỖI: Đưa upload.single lên trước checkAuth để parse body (lấy token nếu có) trước khi kiểm tra quyền
router.post('/import-csv', 
    upload.single('file'), 
    // Middleware debug: Log dữ liệu nhận được sau khi qua Multer
    (req, res, next) => {
        // Log để kiểm tra xem token đã vào được body chưa
        console.log('📝 [Debug Import] File:', req.file ? 'OK' : 'Missing');
        console.log('📝 [Debug Import] Body Token:', req.body && req.body.token ? 'OK (Found)' : 'Missing');
        next();
    },
    checkAuth, 
    checkOwnerOnly, 
    async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Vui lòng tải lên file CSV' });
    }

    // Lấy Owner ID từ token (nếu có) hoặc tạo mới cho lô này
    // Lưu ý: Để hiển thị được trên web, owner_id này phải khớp với user đang đăng nhập
    // Vì checkAuth đang bypass, ta sẽ cố gắng lấy từ req.user hoặc tạo một ID cố định để test
    const ownerId = req.user.id; // Đã qua checkAuth nên chắc chắn có req.user

    try {
        // 1. Đọc file CSV
        const fileContent = fs.readFileSync(req.file.path);
        
        // Cấu hình parse thông minh hơn
        const records = parse(fileContent, { 
            columns: header => header.map(column => String(column || '').trim().toLowerCase()), // Chuyển từng cột về chữ thường
            skip_empty_lines: true, 
            trim: true,
            bom: true // QUAN TRỌNG: Xử lý ký tự BOM từ Excel
        });
        
        console.log(`📂 [Import CSV] Đang xử lý cho Owner ID: ${ownerId}`);
        console.log(`📄 [Import CSV] Đọc được ${records.length} dòng.`);

        // (File tạm sẽ được xóa ở finally)

        // 2. Xóa dữ liệu cũ của owner này (để tránh trùng lặp)
        await Person.deleteMany({ owner_id: ownerId });

        const nameToIdMap = new Map();
        const allNewMembersData = [];

        // 3. Chuẩn bị dữ liệu (Logic giống importData.js)
        for (const r of records) {
            // Map key chữ thường (do cấu hình columns bên trên)
            const fullName = r['full_name'] || r['fullname'] || r['name'] || r['họ và tên'];
            if (!fullName) continue;
            const deathDate = normalizeDate(r['death_date'] || r['dod'] || r['ngày mất']);

            
            // Xác định loại thành viên sơ bộ
            // Hỗ trợ nhiều tên cột tiếng Anh
            const parentName = r['parent_name'] || r['parent'] || r['father'] || r['mother'] || r['father_name'] || r['mother_name'] || r['cha/mẹ'];
            const spouseName = r['spouse_name'] || r['spouse'] || r['husband'] || r['wife'] || r['partner'] || r['vợ/chồng'];
            
            let memberType = 'blood';
            if (!parentName && spouseName) memberType = 'in_law';

            const memberData = {
                owner_id: ownerId,
                full_name: fullName,
                gender: normalizeGender(r['gender'] || r['sex'] || r['giới tính']),
                birth_date: normalizeDate(r['birth_date'] || r['dob'] || r['birthday'] || r['ngày sinh']) || null,
                death_date: deathDate || null,
                is_alive: !deathDate,
                generation: parseInt(r['generation'] || r['level'] || r['đời thứ']) || 1,
                order: parseInt(r['order'] || r['stt'] || r['thứ tự']) || null,
                address: r['address'] || r['location'] || r['địa chỉ'] || null,
                job: r['job'] || r['occupation'] || r['nghề nghiệp'] || null,
                notes: r['notes'] || r['description'] || r['ghi chú'] || null,
                member_type: memberType
            };
            
            allNewMembersData.push({
                data: memberData,
                temp_parent: parentName,
                temp_spouse: spouseName
            });
        }

        // 4. Insert vào DB
        const insertedMembers = await Person.insertMany(allNewMembersData.map(x => x.data));

        // 5. Tạo Map Tên -> ID
        insertedMembers.forEach(member => {
            // Dùng tên đã chuẩn hóa làm key để tìm kiếm chính xác hơn
            nameToIdMap.set(normalizeName(member.full_name), member._id);
        });

        // 6. Update quan hệ
        let updatedRelations = 0;

        // Hàm tìm ID từ chuỗi tên (hỗ trợ tách dấu phẩy)
        const findIds = (rawStr) => {
            if (!rawStr) return [];
            // Tách theo dấu phẩy hoặc chấm phẩy
            const names = rawStr.split(/[;,]/).map(s => normalizeName(s)).filter(s => s);
            const ids = [];
            names.forEach(name => {
                const id = nameToIdMap.get(name);
                if (id) ids.push(id);
            });
            return ids;
        };

        for (let i = 0; i < insertedMembers.length; i++) {
            const member = insertedMembers[i];
            const tempInfo = allNewMembersData[i];
            const updatePayload = {};

            if (tempInfo.temp_parent) {
                const parentIds = findIds(tempInfo.temp_parent);
                if (parentIds.length > 0) updatePayload.parent_id = parentIds;
            }

            if (tempInfo.temp_spouse) {
                const spouseIds = findIds(tempInfo.temp_spouse);
                if (spouseIds.length > 0) updatePayload.spouse_id = spouseIds;
            }

            if (Object.keys(updatePayload).length > 0) {
                await Person.findByIdAndUpdate(member._id, { $set: updatePayload });
                updatedRelations++;
            }
        }

        console.log(`🔗 [Import CSV] Đã cập nhật quan hệ cho ${updatedRelations} thành viên.`);
        res.json({
            success: true,
            message: `Đã import thành công ${insertedMembers.length} thành viên.`,
            successCount: insertedMembers.length,
            errorCount: 0,
            errors: []
        });

    } catch (error) {
        console.error("Import Error:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        // Luôn xóa file tạm dù thành công hay thất bại
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch(e) {}
        }
    }
});

// 2. API Reset Data (Xóa hết và tạo lại mẫu)
router.post('/reset-data', checkAuth, checkOwnerOnly, async (req, res) => {
    try {
        // Chỉ xóa dữ liệu của owner đang đăng nhập
        await Person.deleteMany({ owner_id: req.user.id });
        // Gọi logic seed lại (hoặc client tự gọi /api/seed)
        res.json({ success: true, message: 'Đã xóa toàn bộ dữ liệu. Hãy gọi /api/seed để tạo lại mẫu.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. API Delete All Members
router.delete('/delete-all-members', checkAuth, checkOwnerOnly, async (req, res) => {
    try {
        await Person.deleteMany({ owner_id: req.user.id });
        res.json({ success: true, message: 'Đã xóa sạch danh sách thành viên.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. API Export PDF (Placeholder)
router.get('/export-pdf', checkAuth, (req, res) => {
    res.status(501).json({ 
        success: false, 
        message: 'Tính năng xuất PDF Server-side chưa được hỗ trợ. Vui lòng dùng nút Tải xuống trên biểu đồ cây.' 
    });
});

// 5. API BACKUP DATA (JSON) - KHẨN CẤP
router.get('/backup-json', checkAuth, checkOwnerOnly, async (req, res) => {
    try {
        const ownerId = req.user.id;
        console.log(`📦 [Backup] Đang tạo bản sao lưu cho Owner: ${ownerId}`);

        // Lấy toàn bộ dữ liệu liên quan đến Owner này
        const [members, posts, activities, user] = await Promise.all([
            Person.find({ owner_id: ownerId }).lean(),
            Post.find({ owner_id: ownerId }).lean(),
            Activity.find({ owner_id: ownerId }).lean(),
            User.findById(ownerId).select('-password -password_hash').lean()
        ]);

        const backupData = {
            timestamp: new Date().toISOString(),
            version: '1.0',
            user_info: user,
            stats: {
                members_count: members.length,
                posts_count: posts.length
            },
            data: { members, posts, activities }
        };

        // Trả về file JSON để trình duyệt tải xuống
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=giapha_backup_${Date.now()}.json`);
        res.json(backupData);

    } catch (err) {
        console.error("Backup Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;