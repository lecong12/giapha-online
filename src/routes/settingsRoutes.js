// src/routes/settingsRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const { parse } = require('csv-parse/sync'); // Dùng sync để xử lý logic phức tạp dễ hơn

const Person = mongoose.model('Person');
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
            columns: header => header.trim().toLowerCase(), // Chuyển header về chữ thường để dễ map
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
            const fullName = r['họ và tên'] || r['full_name'] || r['fullname'];
            if (!fullName) continue;

            const deathDate = normalizeDate(r['ngày mất'] || r['death_date']);
            const isAlive = !deathDate;
            
            // Xác định loại thành viên sơ bộ
            const parentName = r['cha/mẹ'] || r['parent_name'] || r['parent'];
            const spouseName = r['vợ/chồng'] || r['spouse_name'] || r['spouse'];
            let memberType = 'blood';
            if (!parentName && spouseName) memberType = 'in_law';

            const memberData = {
                owner_id: ownerId,
                full_name: fullName,
                gender: r['giới tính'] || r['gender'] || 'Nam',
                birth_date: normalizeDate(r['ngày sinh'] || r['birth_date']) || null,
                death_date: deathDate || null,
                is_alive: isAlive,
                generation: parseInt(r['đời thứ'] || r['generation']) || 1,
                address: r['địa chỉ'] || r['address'] || null,
                job: r['nghề nghiệp'] || r['job'] || null,
                notes: r['ghi chú'] || r['notes'] || null,
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
            nameToIdMap.set(member.full_name.trim().toLowerCase(), member._id);
        });

        // 6. Update quan hệ
        let updatedRelations = 0;
        for (let i = 0; i < insertedMembers.length; i++) {
            const member = insertedMembers[i];
            const tempInfo = allNewMembersData[i];
            const updatePayload = {};

            if (tempInfo.temp_parent) {
                const parentId = nameToIdMap.get(tempInfo.temp_parent.trim().toLowerCase());
                if (parentId) updatePayload.parent_id = [parentId]; // LƯU MẢNG
            }

            if (tempInfo.temp_spouse) {
                const spouseId = nameToIdMap.get(tempInfo.temp_spouse.trim().toLowerCase());
                if (spouseId) updatePayload.spouse_id = [spouseId]; // LƯU MẢNG
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

module.exports = router;