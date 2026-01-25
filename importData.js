const mongoose = require('mongoose');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
require('dotenv').config();

// Load Models
// ✅ FIX: Dùng file Model mới
require('./UserModel');
require('./PersonModel');

const User = mongoose.model('User');
const Person = mongoose.model('Person');

const sheetDataUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRv6nPNO982vfr9JJmYHtwWh1XPY_3qDKhJjo1fEHy3jb9034Z_IZPqFveLZyqjODVm-OHN7aogE-MH/pub?gid=1705210560&single=true&output=csv";
const sheetDDataUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRv6nPNO982vfr9JJmYHtwWh1XPY_3qDKhJjo1fEHy3jb9034Z_IZPqFveLZyqjODVm-OHN7aogE-MH/pub?gid=1565376107&single=true&output=csv";

// ✅ FIX: Hàm clean mạnh mẽ hơn, chuyển mọi thứ thành String chuẩn
const clean = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
};

// ✅ Hàm chuẩn hóa ngày tháng (DD/MM/YYYY -> YYYY-MM-DD)
const normalizeDate = (dateStr) => {
    if (!dateStr) return "";
    const s = String(dateStr).trim();
    // Regex bắt DD/MM/YYYY hoặc DD-MM-YYYY
    const dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dmy) {
        return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    return s; // Trả về nguyên gốc nếu không khớp (để user tự sửa sau)
};

async function start() {
    try {
        console.log("🚀 Bước 1: Khởi động kết nối Database...");
        // ✅ FIX: Đồng bộ logic lấy URI giống server.js
        let MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
        
        if (MONGO_URI) MONGO_URI = MONGO_URI.trim();
        if (MONGO_URI.startsWith('"') && MONGO_URI.endsWith('"')) MONGO_URI = MONGO_URI.slice(1, -1);
        if (MONGO_URI.startsWith("'") && MONGO_URI.endsWith("'")) MONGO_URI = MONGO_URI.slice(1, -1);

        try {
            await mongoose.connect(MONGO_URI, { dbName: 'GiaphaDB' }); // ✅ Dùng option dbName để an toàn với mọi loại URI
            console.log(`✅ Đã kết nối tới DB: ${MONGO_URI.replace(/:([^:@]+)@/, ':****@')}`);
        } catch (err) {
            // ✅ FIX DEPLOY: Không fallback về localhost trên môi trường production
            if ((process.env.NODE_ENV === 'production' || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT) || !err.message.toLowerCase().includes('auth')) {
                console.error("❌ Lỗi kết nối MongoDB khi import:", err.message);
                console.error("👉 Script sẽ dừng lại. Vui lòng kiểm tra biến môi trường MONGO_URI.");
                throw err; // Ném lỗi để dừng script
            } else {
                console.warn("⚠️ Kết nối Cloud thất bại (Sai mật khẩu). Đang chuyển sang Localhost...");
                MONGO_URI = 'mongodb://127.0.0.1:27017';
                await mongoose.connect(MONGO_URI, { dbName: 'GiaphaDB' });
            }
        }

        // ✅ DỌN DẸP: Xóa bảng cũ 'people' nếu tồn tại (vì đã đổi sang 'members')
        try {
            const collections = await mongoose.connection.db.listCollections({ name: 'people' }).toArray();
            if (collections.length > 0) {
                await mongoose.connection.db.dropCollection('people');
                console.log("🗑️ Đã xóa bảng cũ 'people' để chuyển sang dùng bảng 'members'.");
            }
        } catch (e) { /* Bỏ qua lỗi nếu bảng không tồn tại */ }
        
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
            console.log(`   - Sheet Data: ${records.length} dòng.`);
            console.log(`   👉 Cấu hình cột: Cha='${fidCol}' | Thứ tự Mẹ='${moCol}'`);
        }
        if (spouseRecords.length > 0) {
            console.log(`   - Sheet dData: ${spouseRecords.length} dòng.`);
            console.log(`   👉 Cấu hình cột: Liên kết Vợ/Chồng='${pidCol}'`);
        }

        console.log("🗑️ Bước 3: Đang dọn dẹp dữ liệu cũ...");
        await Person.deleteMany({ owner_id: ownerId });

        console.log("💾 Bước 4: Đang nạp dữ liệu vào Database...");
        
        const mapPerson = (r, type) => ({
            owner_id: ownerId,
            full_name: r.full_name.trim(),
            gender: type === 'blood' 
                ? ((r.gender || '').includes('Nữ') ? 'Nữ' : 'Nam')
                : ((r.gender || '').includes('Nam') ? 'Nam' : 'Nữ'),
            
            // Logic: Nếu nhập '0' thì false, còn lại (1 hoặc để trống) là true
            is_alive: r.is_alive !== '0', 
            
            birth_date: normalizeDate(r.birth_date),
            death_date: normalizeDate(r.death_date),
            photo: r.photo || "",
            address: r.address || "",
            phone: r.phone || "",
            job: r.job || r.occupation || r['nghề nghiệp'] || "",
            branch: r.branch || "",
            generation: parseInt(r.generation) || 1,
            order: parseInt(r.order) || 0,
            notes: r.notes || "",
            member_type: type,
            temp_id: `${type}_${clean(r.id)}`,
            // ✅ LƯU DỮ LIỆU THÔ VÀO CỘT TRUNG GIAN ĐỂ XỬ LÝ SAU
            temp_parent_uid: type === 'blood' ? clean(r[fidCol]) : null,
            temp_spouse_uid: (type === 'spouse' || type === 'in_law') ? clean(r[pidCol]) : null,
            temp_mother_order: (type === 'blood' && r[moCol]) ? parseInt(r[moCol]) : null // ✅ Lưu thứ tự mẹ
        });

        const allPeopleToInsert = [
            ...records.filter(r => r.full_name && clean(r[fidCol] || r.id)).map(r => mapPerson(r, 'blood')),
            ...spouseRecords.filter(r => r.full_name && clean(r[pidCol] || r.id)).map(r => mapPerson(r, 'in_law'))
        ];

        await Person.insertMany(allPeopleToInsert);
        console.log(`   ✅ Đã lưu ${allPeopleToInsert.length} hồ sơ thành viên.`);

        console.log("🔗 Bước 5: Đang thiết lập quan hệ (Vợ/Chồng, Cha/Con)...");
        
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
                    const partnerSpouseId = idMap.get(`in_law_${p.temp_spouse_uid}`);
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