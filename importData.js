const mongoose = require('mongoose');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
require('dotenv').config();
const crypto = require('crypto'); // Thêm thư viện crypto để hash password

// --- LOAD MODELS ---
require('./User');
require('./Person');

const User = mongoose.model('User');
const Person = mongoose.model('Person');

const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/giapha';
const sheetUrl = "https://docs.google.com/spreadsheets/d/1Rdr-74iBo4gu_a6fNt5doWX36IuIisSKz5CNi20B9qk/export?format=csv";

// Hàm chuẩn hóa ngày tháng (Thêm mới)
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

async function start() {
    try {
        if (!mongoURI) {
            throw new Error("Thiếu biến môi trường MONGODB_URI");
        }
        
        await mongoose.connect(mongoURI);
        console.log("✅ Kết nối MongoDB THÀNH CÔNG!");

        // --- TÌM HOẶC TẠO USER ADMIN (QUAN TRỌNG) ---
        // Logic này đảm bảo dữ liệu luôn được gán cho đúng tài khoản 'admin'
        let admin = await User.findOne({ username: 'admin' });
        if (!admin) {
            console.log("👤 Không tìm thấy user 'admin'. Đang tạo mới...");
            const hash = crypto.createHash('sha256').update('123').digest('hex');
            
            admin = new User({
                username: 'admin',
                password_hash: hash,
                full_name: 'Quản trị viên',
                role: 'owner',
            });
            // Gán owner_id là chính nó
            admin.owner_id = admin._id;
            await admin.save();
            console.log("✅ Đã tạo user 'admin' với mật khẩu '123'.");
        } else {
            console.log("👤 Đã tìm thấy user 'admin'.");
        }
        const ownerId = admin._id;
        console.log(`🔑 Dữ liệu sẽ được gán cho Owner ID: ${ownerId} (${admin.full_name})`);

        console.log("⏳ Đang tải dữ liệu từ Google Sheets...");
        const response = await axios.get(sheetUrl);
    const records = parse(response.data, { columns: true, skip_empty_lines: true, trim: true });
        console.log(`📊 Đã tải ${records.length} dòng từ Google Sheets.`);

        // Xóa dữ liệu cũ của owner này
        await Person.deleteMany({ owner_id: ownerId });
        console.log(`🧹 Đã làm sạch dữ liệu cũ của Owner ID: ${ownerId}`);

        const nameToIdMap = new Map();
        const allNewMembersData = [];

        // --- BƯỚC 1: Chuẩn bị dữ liệu ---
        console.log("🔹 BƯỚC 1: Đang chuẩn bị dữ liệu thành viên...");
        for (const r of records) {
            const fullName = r['Họ và Tên'] || r['full_name'];
            if (!fullName) continue;

            const deathDate = normalizeDate(r['Ngày mất'] || r['death_date']);
            const isAlive = !deathDate; // Nếu không có ngày mất thì coi như còn sống

            const memberData = {
                owner_id: ownerId,
                full_name: fullName,
                gender: r['Giới tính'] || r['gender'] || 'Nam',
                birth_date: normalizeDate(r['Ngày sinh'] || r['birth_date']),
                death_date: deathDate || null,
                is_alive: isAlive,
                generation: parseInt(r['Đời thứ'] || r['generation']) || 1,
                address: r['Địa chỉ'] || r['address'] || null,
                job: r['Nghề nghiệp'] || r['job'] || null,
                notes: r['Ghi chú'] || r['notes'] || null,
            };
            
            allNewMembersData.push({
                data: memberData,
                temp_parent: r['Cha/Mẹ'] || r['parent_name'],
                temp_spouse: r['Vợ/Chồng'] || r['spouse_name']
            });
        }

        // --- BƯỚC 2: Insert ---
        console.log(`🔹 BƯỚC 2: Đang import ${allNewMembersData.length} thành viên vào database...`);
        const insertedMembers = await Person.insertMany(allNewMembersData.map(x => x.data));
        console.log(`✅ Đã import thành công ${insertedMembers.length} thành viên.`);

        // Tạo map Tên -> ID
        insertedMembers.forEach(member => {
            nameToIdMap.set(member.full_name.trim().toLowerCase(), member._id);
        });

        // --- BƯỚC 3: Update quan hệ ---
        console.log("🔹 BƯỚC 3: Đang liên kết quan hệ gia đình...");
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

        console.log(`✅ Đã cập nhật quan hệ cho ${updatedRelations} thành viên.`);
        console.log("🎉 HOÀN TẤT!");
        process.exit(0);
    } catch (err) {
        console.error("❌ LỖI RỒI:", err.message);
        process.exit(1);
    }
}

start();