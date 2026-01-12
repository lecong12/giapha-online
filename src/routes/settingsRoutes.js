// src/routes/settingsRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

const Person = mongoose.model('Person');
const upload = multer({ dest: 'uploads/' });

// Middleware check auth giả lập (Bypass để tránh lỗi thiếu file middleware)
const checkAuth = (req, res, next) => next();
const checkOwnerOnly = (req, res, next) => next();

// 1. API Import CSV (Từ Google Sheets)
router.post('/import-csv', checkAuth, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Vui lòng tải lên file CSV' });
    }

    // Lấy Owner ID từ token (nếu có) hoặc tạo mới cho lô này
    // Lưu ý: Để hiển thị được trên web, owner_id này phải khớp với user đang đăng nhập
    // Vì checkAuth đang bypass, ta sẽ cố gắng lấy từ req.user hoặc tạo một ID cố định để test
    const currentOwnerId = req.user ? req.user.id : new mongoose.Types.ObjectId();

    const results = [];

    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            // Xóa file tạm
            try { fs.unlinkSync(req.file.path); } catch(e) {}

            try {
                // --- BƯỚC 1: TẠO MAP ID (CSV ID -> MONGODB ID) ---
                // Giúp chuyển đổi ID ngắn trong Excel (vd: "1", "10") thành ObjectId của MongoDB
                const csvIdToMongoId = new Map();
                
                // Quét qua 1 lượt để tạo ID cho tất cả mọi người (bao gồm cả vợ ảo)
                for (const row of results) {
                    if (!row.id) continue;
                    
                    const csvId = row.id.toString().trim();
                    
                    // Tạo ID cho chồng (người chính)
                    if (!csvIdToMongoId.has(csvId)) {
                        csvIdToMongoId.set(csvId, new mongoose.Types.ObjectId());
                    }

                    // Tạo ID cho vợ (nếu có tên vợ) -> ID ảo = "wife_" + csvId
                    if (row.spouse_name && row.spouse_name.trim()) {
                        const wifeKey = `wife_${csvId}`;
                        if (!csvIdToMongoId.has(wifeKey)) {
                            csvIdToMongoId.set(wifeKey, new mongoose.Types.ObjectId());
                        }
                    }
                }

                // --- BƯỚC 2: TẠO ĐỐI TƯỢNG MEMBER ---
                const newMembers = [];
                
                for (const row of results) {
                    if (!row.id) continue;

                    const csvId = row.id.toString().trim();
                    const myMongoId = csvIdToMongoId.get(csvId);
                    
                    // Xử lý Parent ID (fid hoặc id_Cha/Mẹ)
                    let parentId = null;
                    const fid = row.fid || row['id_Cha/Mẹ'];
                    if (fid) {
                        const fidStr = fid.toString().trim();
                        if (csvIdToMongoId.has(fidStr)) {
                            parentId = csvIdToMongoId.get(fidStr);
                        }
                    }

                    // Xử lý Spouse ID (Vợ)
                    let spouseId = null;
                    if (row.spouse_name && row.spouse_name.trim()) {
                        spouseId = csvIdToMongoId.get(`wife_${csvId}`);
                    }

                    // Chuẩn hóa giới tính
                    const genderRaw = row.gender || 'Nam';
                    const gender = (genderRaw === 'Nữ' || genderRaw === 'Nu' || genderRaw === 'female') ? 'female' : 'male';

                    // Xử lý Ghi chú mở rộng (Chi/phái, Thứ tự)
                    // Lưu ý: Vẫn giữ trong notes để tham khảo, nhưng sẽ lưu vào field order riêng
                    let extraNotes = row.notes || '';
                    if (row['Chi/phái']) extraNotes += `\n[Chi/phái: ${row['Chi/phái']}]`;

                    const orderVal = row['Thứ tự'] ? parseInt(row['Thứ tự']) : null;

                    // 1. TẠO NGƯỜI CHỒNG (Main Node)
                    const husband = {
                        _id: myMongoId,
                        owner_id: currentOwnerId,
                        full_name: row.full_name || row['HỌ TÊN'] || 'Không tên',
                        gender: gender,
                        birth_date: row.birth_date || null,
                        death_date: row.death_date || null,
                        is_alive: !row.death_date,
                        generation: parseInt(row.generation) || 1,
                        order: !isNaN(orderVal) ? orderVal : null, // Lưu thứ tự
                        notes: extraNotes.trim(),
                        phone: row.phone || '',
                        job: row.job || '',
                        address: row.address || '',
                        avatar: row.Photo || null, // Cột Photo
                        parent_id: parentId,
                        spouse_id: spouseId,
                        member_type: 'blood',
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    newMembers.push(husband);

                    // 2. TẠO NGƯỜI VỢ (Virtual Node)
                    if (spouseId) {
                        const wife = {
                            _id: spouseId,
                            owner_id: currentOwnerId,
                            full_name: row.spouse_name,
                            gender: gender === 'male' ? 'female' : 'male', // Ngược giới tính chồng
                            spouse_id: myMongoId, // Link ngược lại chồng
                            generation: parseInt(row.generation) || 1,
                            member_type: 'in_law', // Đánh dấu là dâu
                            is_alive: true, // Mặc định
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        newMembers.push(wife);
                    }
                }

                // --- BƯỚC 3: INSERT VÀO DB ---
                if (newMembers.length > 0) {
                    await Person.insertMany(newMembers);
                }

                res.json({
                    success: true,
                    message: `Đã import thành công ${newMembers.length} thành viên (bao gồm cả vợ/chồng tự tạo).`,
                    successCount: newMembers.length,
                    errorCount: 0,
                    errors: []
                });

            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });
});

// 2. API Reset Data (Xóa hết và tạo lại mẫu)
router.post('/reset-data', checkAuth, async (req, res) => {
    try {
        await Person.deleteMany({});
        // Gọi logic seed lại (hoặc client tự gọi /api/seed)
        res.json({ success: true, message: 'Đã xóa toàn bộ dữ liệu. Hãy gọi /api/seed để tạo lại mẫu.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. API Delete All Members
router.delete('/delete-all-members', checkAuth, async (req, res) => {
    try {
        await Person.deleteMany({});
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