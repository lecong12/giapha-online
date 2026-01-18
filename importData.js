const mongoose = require('mongoose');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
require('dotenv').config();

// --- 1. KẾT NỐI VÀ LOAD MODELS ---
require('./User');
require('./Person');
const User = mongoose.model('User');
const Person = mongoose.model('Person');

const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/giapha';
const sheetUrl = "LINK_GOOGLE_SHEET_CỦA_BẠN"; // Thay link của bạn vào đây

async function start() {
    try {
        await mongoose.connect(mongoURI);
        console.log("✅ Kết nối MongoDB thành công!");

        // Tìm admin để gán quyền sở hữu
        let admin = await User.findOne({ username: 'admin' });
        const ownerId = admin._id;

        // Tải dữ liệu
        const response = await axios.get(sheetUrl);
        const records = parse(response.data, { columns: true, skip_empty_lines: true, trim: true });

        // Làm sạch dữ liệu cũ
        await Person.deleteMany({ owner_id: ownerId });

        const idMap = new Map(); // Sổ tay ghi nhớ: ID file -> _id Database
        const allMembersData = [];

        // --- 2. BƯỚC 1: CHUẨN BỊ DỮ LIỆU ---
        records.forEach(r => {
            if (!r.full_name) return;

            allMembersData.push({
                owner_id: ownerId,
                full_name: r.full_name,
                gender: r.gender || 'male',
                generation: parseInt(r.generation) || 1,
                branch: r.branch || null,       // Cột Phái
                address: r.adress || null,      // Theo đúng lỗi chính tả trong file của bạn
                notes: r.notes || null,
                original_id: String(r.id)       // Lưu lại ID gốc để tí nữa nối cha con
            });
        });

        // Lưu vào Database
        const inserted = await Person.insertMany(allMembersData);
        
        // Ghi lại vào sổ tay: ID trong file tương ứng với ID nào trong DB
        inserted.forEach(m => idMap.set(m.original_id, m._id));

        // --- 3. BƯỚC 2: LIÊN KẾT CHA (FID) ---
        console.log("⏳ Đang kết nối quan hệ huyết thống...");
        for (const m of inserted) {
            // Tìm lại dòng dữ liệu gốc trong file CSV
            const csvRow = records.find(r => String(r.id) === m.original_id);
            
            if (csvRow && csvRow.fid && idMap.has(String(csvRow.fid))) {
                const fatherId = idMap.get(String(csvRow.fid));
                
                // Cập nhật ID của cha vào Database
                await Person.findByIdAndUpdate(m._id, { 
                    $set: { parent_id: [fatherId] } // Giả định trường lưu cha là parent_id (mảng)
                });
            }
        }

        console.log("🎉 Hoàn tất import chính xác theo ID!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Lỗi:", err.message);
        process.exit(1);
    }
}

start();
