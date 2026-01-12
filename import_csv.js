// Load biến môi trường để tránh lỗi kết nối DB
require('dotenv').config();

const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');

// --- CẤU HÌNH MONGODB ---
// Đảm bảo bạn đã có MONGO_URI trong file .env hoặc sửa trực tiếp tại đây
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/giapha';

// --- CẤU HÌNH CHỦ SỞ HỮU (QUAN TRỌNG) ---
// Bạn cần lấy ID của tài khoản Admin từ database (hoặc xem trên Dashboard phần Cài đặt -> Thông tin)
// và điền vào file .env: OWNER_ID=xxxxxxxxxxxxxxxx
const OWNER_ID = process.env.OWNER_ID;

if (!OWNER_ID) {
    console.error("❌ LỖI: Chưa cấu hình OWNER_ID!");
    console.error("👉 Vui lòng thêm dòng 'OWNER_ID=id_cua_ban' vào file .env trước khi chạy.");
    process.exit(1);
}

if (!mongoose.Types.ObjectId.isValid(OWNER_ID)) {
    console.error("❌ LỖI: OWNER_ID trong file .env không đúng định dạng ObjectId (24 ký tự)!");
    process.exit(1);
}

// --- ĐỊNH NGHĨA MODEL (Tạm thời định nghĩa tại đây để script chạy được ngay) ---
// Nếu dự án của bạn đã có folder models, hãy require từ đó: const Person = require('./models/Person');

const PersonSchema = new mongoose.Schema({
    owner_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    full_name: String,
    gender: String,
    birth_date: String,
    death_date: String,
    generation: Number,
    notes: String,
    phone: String,
    job: String,
    address: String,
    is_alive: { type: Boolean, default: true },
    member_type: { type: String, default: 'blood' }
}, { timestamps: true });
const Person = mongoose.models.Person || mongoose.model('Person', PersonSchema);

const RelationshipSchema = new mongoose.Schema({
    parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Person' },
    child_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Person' },
    relation_type: { type: String, default: 'blood' }
});
const Relationship = mongoose.models.Relationship || mongoose.model('Relationship', RelationshipSchema);

const MarriageSchema = new mongoose.Schema({
    husband_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Person' },
    wife_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Person' },
    marriage_date: String
});
const Marriage = mongoose.models.Marriage || mongoose.model('Marriage', MarriageSchema);
// ---------------------------------------------------------------------------

// Đổi tên file này nếu file CSV của bạn tên khác
const inputFile = 'data.csv'; 

const importData = async () => {
    const rows = [];
    
    // 1. Đọc file CSV
    console.log(`⏳ Đang đọc file '${inputFile}'...`);
    
    try {
        const stream = fs.createReadStream(inputFile).pipe(csv());
        
        for await (const row of stream) {
            // Chuẩn hóa tên cột (xóa khoảng trắng thừa nếu có)
            const cleanRow = {};
            Object.keys(row).forEach(key => {
                cleanRow[key.trim()] = row[key];
            });
            rows.push(cleanRow);
        }
    } catch (e) {
        console.error("❌ Lỗi đọc file:", e.message);
        console.log("👉 Hãy chắc chắn bạn đã chạy: npm install csv-parser");
        console.log("👉 Và file 'data.csv' nằm cùng thư mục với file này.");
        return;
    }

    console.log(`✅ Đã đọc ${rows.length} dòng. Bắt đầu import vào DB...`);

    // Kết nối MongoDB
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Đã kết nối MongoDB thành công.");
    } catch (err) {
        console.error("❌ Lỗi kết nối MongoDB:", err);
        return;
    }

    // Map để lưu Tên -> ID (Dùng để tra cứu ở bước 2)
    const nameToIdMap = {};
    // Map phụ dùng key chữ thường để tra cứu không phân biệt hoa thường
    const nameToIdMapLower = {};
    // Set để tránh trùng lặp quan hệ vợ chồng (A-B và B-A)
    const processedMarriages = new Set();

    // --- BƯỚC 1: INSERT NGƯỜI VÀO BẢNG PEOPLE ---
    console.log("🔹 BƯỚC 1: Đang tạo hồ sơ thành viên...");
    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
        // FIX: Luôn lưu tên Cha/Mẹ và Vợ/Chồng vào ghi chú để không bị mất thông tin nếu không link được ID
        let extraNotes = row.notes || '';
        if (row.parent_name) extraNotes += `\n[Cha/Mẹ: ${row.parent_name}]`;
        if (row.spouse_name) extraNotes += `\n[Vợ/Chồng: ${row.spouse_name}]`;
        // Xóa khoảng trắng thừa đầu cuối
        extraNotes = extraNotes.trim();

        try {
            const newPerson = await Person.create({
                owner_id: new mongoose.Types.ObjectId(OWNER_ID),
                full_name: row.full_name,
                gender: row.gender,
                birth_date: row.birth_date,
                death_date: row.death_date,
                generation: row.generation ? parseInt(row.generation) : null,
                notes: extraNotes,
                phone: row.phone,
                job: row.job,
                address: row.address,
                is_alive: true,
                member_type: 'blood'
            });

            // Lưu _id (ObjectId) vào Map
            nameToIdMap[row.full_name.trim()] = newPerson._id;
            nameToIdMapLower[row.full_name.trim().toLowerCase()] = newPerson._id;
            successCount++;
        } catch (err) {
            console.error(`❌ Lỗi dòng '${row.full_name}':`, err.message);
            errorCount++;
        }
    }

    console.log(`✅ Đã tạo ${Object.keys(nameToIdMap).length} thành viên trong bộ nhớ.`);

    // --- BƯỚC 2: TẠO QUAN HỆ (CHA CON / VỢ CHỒNG) ---
    console.log("🔹 BƯỚC 2: Đang liên kết quan hệ gia đình...");
    let relationCount = 0;

    for (const row of rows) {
        const myName = row.full_name.trim();
        const myId = nameToIdMap[myName];
        if (!myId) continue; // Nếu người này lỗi ở bước 1 thì bỏ qua

        // 2.1 Xử lý Cha/Mẹ (Parent)
        if (row.parent_name) {
            const pName = row.parent_name.trim();
            const parentId = nameToIdMap[pName] || nameToIdMapLower[pName.toLowerCase()];
            
            if (parentId) {
                try {
                    await Relationship.create({
                        parent_id: parentId,
                        child_id: myId,
                        relation_type: 'blood'
                    });
                    relationCount++;
                } catch (err) {
                    console.error(`❌ Lỗi tạo quan hệ cha-con cho ${myName}:`, err.message);
                }
            } else {
                console.warn(`⚠️ Không tìm thấy hồ sơ cha/mẹ: '${pName}' cho '${myName}'`);
            }
        }

        // 2.2 Xử lý Vợ/Chồng (Spouse)
        if (row.spouse_name) {
            const sName = row.spouse_name.trim();
            // Tìm ID bằng tên chính xác HOẶC tên chữ thường
            const spouseId = nameToIdMap[sName] || nameToIdMapLower[sName.toLowerCase()];
            
            if (spouseId) {
                // Xác định ai là chồng, ai là vợ dựa trên giới tính
                let husbandId = myId;
                let wifeId = spouseId;
                
                // Chuẩn hóa giới tính để so sánh chính xác hơn (chấp nhận 'nữ', 'nu', 'female')
                const gender = (row.gender || '').trim().toLowerCase();
                if (gender === 'nữ' || gender === 'nu' || gender === 'female') {
                    husbandId = spouseId;
                    wifeId = myId;
                }

                // Tạo key duy nhất cho cặp vợ chồng (VD: "10-15") để không insert 2 lần
                const pairKey = [husbandId, wifeId].sort().join('-');
                
                if (!processedMarriages.has(pairKey)) {
                    processedMarriages.add(pairKey);

                    try {
                        await Marriage.create({
                            husband_id: husbandId,
                            wife_id: wifeId,
                            marriage_date: ''
                        });
                        relationCount++;
                    } catch (err) {
                        console.error(`❌ Lỗi tạo quan hệ vợ chồng cho ${myName}:`, err.message);
                    }
                }
            } else {
                console.warn(`⚠️ Không tìm thấy hồ sơ vợ/chồng: '${sName}' cho '${myName}' (Đã lưu vào ghi chú)`);
            }
        }
    }

    console.log("------------------------------------------------");
    console.log(`🏁 Hoàn tất!`);
    console.log(`- Hồ sơ tạo mới: ${successCount}`);
    console.log(`- Quan hệ thiết lập: ${relationCount}`);
    console.log(`- Lỗi: ${errorCount}`);

    // Đóng kết nối
    await mongoose.connection.close();
};

importData();