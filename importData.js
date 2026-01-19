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

const clean = (v) => v ? String(v).replace(/[^\w]/g, '').trim() : "";

async function start() {
    try {
        console.log("🚀 Bước 1: Khởi động kết nối Database...");
        await mongoose.connect(process.env.MONGODB_URI);
        
        const admin = await User.findOne({ username: 'admin' });
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

        console.log("🗑️ Bước 3: Đang dọn dẹp dữ liệu cũ...");
        await Person.deleteMany({ owner_id: ownerId });

        console.log("📝 Bước 4: Đang nạp dữ liệu (Quy ước is_live: 0-Mất, 1/Trống-Sống)...");
        
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
            temp_id: `${type}_${clean(r.id)}`
        });

        const allPeopleToInsert = [
            ...records.filter(r => r.full_name).map(r => mapPerson(r, 'blood')),
            ...spouseRecords.filter(r => r.full_name).map(r => mapPerson(r, 'spouse'))
        ];

        await Person.insertMany(allPeopleToInsert);
        console.log(`✅ Đã nạp xong ${allPeopleToInsert.length} thành viên.`);

        console.log("🔗 Bước 5: Đang tính toán quan hệ (1 Cha - Nhiều Vợ/Chồng)...");
        const allInDb = await Person.find({ owner_id: ownerId }, '_id temp_id');
        const idMap = new Map(allInDb.map(p => [p.temp_id, p._id]));
        const bulkOps = [];

        for (const r of records) {
            const myId = idMap.get(`blood_${clean(r.id)}`);
            if (!myId) continue;

            // PARENT_ID: Chỉ lấy 1 người (Cha từ cột fid)
            let parent_ids = [];
            if (clean(r.fid) && idMap.has(`blood_${clean(r.fid)}`)) {
                parent_ids.push(idMap.get(`blood_${clean(r.fid)}`));
            }

            // SPOUSE_ID: Lấy từ cột check_pid
            let spouse_ids = [];
            const cpid = clean(r.check_pid);
            if (cpid && idMap.has(`spouse_${cpid}`)) {
                spouse_ids.push(idMap.get(`spouse_${cpid}`));
            }

            bulkOps.push({
                updateOne: {
                    filter: { _id: myId },
                    update: { $set: { parent_id: parent_ids, spouse_id: spouse_ids } }
                }
            });
        }

        // Bước 6: Gom nhiều vợ/chồng dựa trên PID
        for (const r of spouseRecords) {
            const myId = idMap.get(`spouse_${clean(r.id)}`);
            const pid = clean(r.pid);
            if (myId && pid && idMap.has(`blood_${pid}`)) {
                const bloodId = idMap.get(`blood_${pid}`);
                
                // Vợ nhận chồng
                bulkOps.push({
                    updateOne: { filter: { _id: myId }, update: { $addToSet: { spouse_id: bloodId } } }
                });
                // Chồng nhận thêm vợ (Dùng $addToSet để gom nhiều người vào mảng)
                bulkOps.push({
                    updateOne: { filter: { _id: bloodId }, update: { $addToSet: { spouse_id: myId } } }
                });
            }
        }

        if (bulkOps.length > 0) {
            console.log(`📦 Bước 6: Đang thực thi bulkUpdate cho ${bulkOps.length} quan hệ...`);
            await Person.bulkWrite(bulkOps);
        }

        console.log("🧹 Bước 7: Làm sạch dữ liệu tạm...");
        await Person.updateMany({ owner_id: ownerId }, { $unset: { temp_id: "" } });

        console.log("\n🎉 QUÁ TRÌNH NẠP DỮ LIỆU HOÀN TẤT THÀNH CÔNG!");
        process.exit(0);

    } catch (err) {
        console.error("❌ Lỗi thực thi:", err);
        process.exit(1);
    }
}

start();