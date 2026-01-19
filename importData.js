const mongoose = require('mongoose');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
require('dotenv').config();

// Load Models
require('./User');
require('./Person');
const User = mongoose.model('User');
const Person = mongoose.model('Person');

const sheetDataUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRv6nPNO982vfr9JJmYHtwWh1XPY_3qDKhJjo1fEHy3jb9034Z_IZPqFveLZyqjODVm-OHN7aogE-MH/pub?gid=1705210560&single=true&output=csv";
const sheetDDataUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRv6nPNO982vfr9JJmYHtwWh1XPY_3qDKhJjo1fEHy3jb9034Z_IZPqFveLZyqjODVm-OHN7aogE-MH/pub?gid=1565376107&single=true&output=csv";

// ✅ FIX: Nới lỏng hàm clean, chỉ trim khoảng trắng, giữ lại dấu chấm/gạch ngang nếu có trong ID
const clean = (v) => (v !== undefined && v !== null && String(v).trim() !== '') ? String(v).trim() : null;

async function start() {
    try {
        console.log("🚀 Bước 1: Khởi động kết nối Database...");
        // ✅ FIX: Đồng bộ logic lấy URI giống server.js
        let MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/giapha';
        
        try {
            await mongoose.connect(MONGO_URI);
        } catch (err) {
            if (err.message.includes('auth') || err.message.includes('Authentication failed') || err.message.includes('bad auth')) {
                console.warn("⚠️ Kết nối Cloud thất bại (Sai mật khẩu). Đang chuyển sang Localhost...");
                MONGO_URI = 'mongodb://127.0.0.1:27017/giapha';
                await mongoose.connect(MONGO_URI);
            } else {
                throw err;
            }
        }
        
        const admin = await User.findOne({ username: 'admin' });
        if (!admin) {
            console.error("❌ LỖI: Không tìm thấy tài khoản 'admin'. Vui lòng chạy 'node server.js' trước để khởi tạo admin.");
            process.exit(1);
        }
        const ownerId = admin._id;

        console.log("📥 Bước 2: Tải dữ liệu từ Google Sheets...");
        const [resData, resDData] = await Promise.all([
            axios.get(sheetDataUrl),
            axios.get(sheetDDataUrl)
        ]);
        
        const config = { 
            columns: h => h.map(i => i.trim().toLowerCase()), 
            skip_empty_lines: true, 
            trim: true, 
            bom: true 
        };
        
        const records = parse(resData.data, config);
        const spouseRecords = parse(resDData.data, config);

        // 🔍 DEBUG: Tự động tìm tên cột chính xác (tránh lỗi do tên cột khác biệt)
        const findCol = (row, candidates) => candidates.find(c => row.hasOwnProperty(c));
        
        const fidCol = (records.length ? findCol(records[0], ['fid', 'father_id', 'father', 'ma_cha', 'parent_id', 'parent']) : null) || 'fid';
        const pidCol = (spouseRecords.length ? findCol(spouseRecords[0], ['pid', 'partner_id', 'link_id', 'ma_vo_chong', 'check_pid', 'partner']) : null) || 'pid';
        const moCol = (records.length ? findCol(records[0], ['mother_order', 'm_order', 'me_thu', 'mother_index', 'thu_tu_me']) : null) || 'mother_order';

        if (records.length > 0) {
            console.log("🔍 Headers Sheet Data:", Object.keys(records[0]));
            console.log(`👉 Cột dùng làm ID Cha: '${fidCol}'`);
            console.log(`👉 Cột dùng làm Thứ tự Mẹ: '${moCol}'`);
        }
        if (spouseRecords.length > 0) {
            console.log("🔍 Headers Sheet dData:", Object.keys(spouseRecords[0]));
            console.log(`👉 Cột dùng làm ID Liên kết Vợ/Chồng: '${pidCol}'`);
        }

        // 🔍 DEBUG: Kiểm tra dữ liệu cụ thể của ông Lê Công Nên
        const targetName = "Lê Công Nên";
        const debugPerson = records.find(r => r.full_name && r.full_name.includes(targetName));
        if (debugPerson) {
            console.log(`\n🔍 --- DEBUG CHI TIẾT: ${targetName} ---`);
            console.log("1. Dữ liệu gốc từ CSV:", JSON.stringify(debugPerson, null, 2));
            console.log("2. ID của ông này (đã clean):", clean(debugPerson.id));
            console.log(`3. ID Cha (Cột '${fidCol}') đã clean:`, clean(debugPerson[fidCol]));
            
            // Kiểm tra xem có ai nhận ông này làm chồng không (trong sheet dData)
            const myId = clean(debugPerson.id);
            const spouseRecord = spouseRecords.find(r => clean(r[pidCol]) === myId);
            if (spouseRecord) {
                console.log("4. ✅ Tìm thấy bản ghi Vợ trong dData:", spouseRecord.full_name);
                console.log("   - ID Vợ:", spouseRecord.id);
                console.log(`   - Cột '${pidCol}' trỏ tới:`, spouseRecord[pidCol]);
            } else {
                console.log("4. ❌ KHÔNG tìm thấy bản ghi Vợ nào trỏ tới ID:", myId);
                console.log(`   (Đang tìm trong cột '${pidCol}' của sheet dData)`);
            }
            console.log("---------------------------------------------\n");
        }

        console.log("🗑️ Bước 3: Đang dọn dẹp dữ liệu cũ...");
        await Person.deleteMany({ owner_id: ownerId });

        console.log(" Bước 4: Đang nạp dữ liệu ");
        
        const mapPerson = (r, type) => ({
            owner_id: ownerId,
            full_name: r.full_name.trim(),
            gender: type === 'blood' 
                ? ((r.gender || '').includes('Nữ') ? 'Nữ' : 'Nam')
                : ((r.gender || '').includes('Nam') ? 'Nam' : 'Nữ'),
            
            // Logic: Nếu nhập '0' thì false, còn lại (1 hoặc để trống) là true
            is_alive: r.is_alive !== '0', 
            
            birth_date: r.birth_date || "",
            death_date: r.death_date || "",
            photo: r.photo || "",
            address: r.address || "",
            phone: r.phone || "",
            branch: r.branch || "",
            generation: parseInt(r.generation) || 1,
            order: parseInt(r.order) || 0,
            notes: r.notes || "",
            member_type: type,
            temp_id: `${type}_${clean(r.id)}`,
            // ✅ LƯU DỮ LIỆU THÔ VÀO CỘT TRUNG GIAN ĐỂ XỬ LÝ SAU
            temp_parent_uid: type === 'blood' ? clean(r[fidCol]) : null,
            temp_spouse_uid: type === 'spouse' ? clean(r[pidCol]) : null,
            temp_mother_order: (type === 'blood' && r[moCol]) ? parseInt(r[moCol]) : null // ✅ Lưu thứ tự mẹ
        });

        const allPeopleToInsert = [
            ...records.filter(r => r.full_name).map(r => mapPerson(r, 'blood')),
            ...spouseRecords.filter(r => r.full_name).map(r => mapPerson(r, 'spouse'))
        ];

        await Person.insertMany(allPeopleToInsert);
        console.log(`✅ Đã nạp xong ${allPeopleToInsert.length} thành viên.`);

        console.log(" Bước 5: Đang thiết lập quan hệ dựa trên cột trung gian...");
        
        // ✅ Tải lại dữ liệu kèm các cột tạm để ánh xạ
        const allInDb = await Person.find({ owner_id: ownerId }).select('_id temp_id temp_parent_uid temp_spouse_uid temp_mother_order order');
        const idMap = new Map(allInDb.map(p => [p.temp_id, p._id]));
        const orderMap = new Map(allInDb.map(p => [p._id.toString(), p.order || 0])); // Map ID -> Order (để tra cứu vợ thứ mấy)

        const spouseMap = new Map(); // Map: personId -> Set<spouseId>
        const parentMap = new Map(); // Map: childId -> Set<parentId>

        // Helper: Tạo liên kết vợ chồng 2 chiều
        const addSpouseLink = (id1, id2) => {
            if (!spouseMap.has(id1)) spouseMap.set(id1, new Set());
            if (!spouseMap.has(id2)) spouseMap.set(id2, new Set());
            spouseMap.get(id1).add(id2);
            spouseMap.get(id2).add(id1);
        };

        // --- GIAI ĐOẠN 1: XỬ LÝ VỢ CHỒNG TRƯỚC (Dựa vào temp_spouse_uid) ---
        for (const p of allInDb) {
            // Nếu người này có khai báo ID vợ/chồng (thường là từ sheet dData)
            if (p.temp_spouse_uid) {
                // Tìm ID MongoDB của người vợ/chồng đó (giả sử họ nằm ở sheet blood)
                const partnerMongoId = idMap.get(`blood_${p.temp_spouse_uid}`);
                
                if (partnerMongoId) {
                    addSpouseLink(p._id, partnerMongoId);
                } else {
                    // Fallback: Thử tìm trong sheet spouse (ít gặp nhưng có thể xảy ra)
                    const partnerSpouseId = idMap.get(`spouse_${p.temp_spouse_uid}`);
                    if (partnerSpouseId) addSpouseLink(p._id, partnerSpouseId);
                }
            }
        }

        // --- GIAI ĐOẠN 2: XỬ LÝ CHA MẸ (Dựa vào temp_parent_uid) ---
        for (const p of allInDb) {
            if (p.temp_parent_uid) {
                // Tìm ID MongoDB của Cha
                const fatherMongoId = idMap.get(`blood_${p.temp_parent_uid}`);
                
                if (fatherMongoId) {
                    if (!parentMap.has(p._id)) parentMap.set(p._id, new Set());
                    
                    // 1. Thêm Cha
                    parentMap.get(p._id).add(fatherMongoId);

                    // 2. Tìm Mẹ dựa trên mother_order (nếu có)
                    if (p.temp_mother_order !== null && !isNaN(p.temp_mother_order)) {
                        const spouses = spouseMap.get(fatherMongoId);
                        if (spouses) {
                            for (const spouseId of spouses) {
                                const spouseOrder = orderMap.get(spouseId.toString());
                                if (spouseOrder === p.temp_mother_order) {
                                    parentMap.get(p._id).add(spouseId);
                                    break; // Đã tìm thấy mẹ đúng thứ tự
                                }
                            }
                        }
                    }
                }
            }
        }

        // --- GIAI ĐOẠN 3: CẬP NHẬT VÀO DB ---
        const bulkOps = [];
        const allIdsWithRelations = new Set([...parentMap.keys(), ...spouseMap.keys()]);

        for (const personId of allIdsWithRelations) {
            const updatePayload = {};
            
            const parentIds = parentMap.get(personId);
            if (parentIds && parentIds.size > 0) {
                updatePayload.parent_id = Array.from(parentIds);
            }

            const spouseIds = spouseMap.get(personId);
            if (spouseIds && spouseIds.size > 0) {
                updatePayload.spouse_id = Array.from(spouseIds);
            }

            if (Object.keys(updatePayload).length > 0) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: personId },
                        update: { $set: updatePayload }
                    }
                });
            }
        }

        if (bulkOps.length > 0) {
            console.log(`📦 Bước 6: Đang cập nhật quan hệ cho ${bulkOps.length} thành viên...`);
            await Person.bulkWrite(bulkOps);
        } else {
            console.log("📦 Bước 6: Không có quan hệ nào cần cập nhật.");
        }

        console.log("🧹 Bước 7: Làm sạch dữ liệu tạm...");
        await Person.updateMany({ owner_id: ownerId }, { $unset: { 
            temp_id: "", 
            temp_parent_uid: "", 
            temp_spouse_uid: "",
            temp_mother_order: ""
        }});

        console.log("\n🎉 QUÁ TRÌNH NẠP DỮ LIỆU HOÀN TẤT THÀNH CÔNG!");
        process.exit(0);

    } catch (err) {
        console.error("❌ Lỗi thực thi:", err);
        process.exit(1);
    }
}

start();