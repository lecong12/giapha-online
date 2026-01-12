const mongoose = require('mongoose');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
require('dotenv').config();

// Lấy link từ .env
const mongoURI = process.env.MONGODB_URI;
const sheetUrl = "https://docs.google.com/spreadsheets/d/1Rdr-74iBo4gu_a6fNt5doWX36IuIisSKz5CNi20B9qk/export?format=csv";

// Model User để tìm Admin
const User = mongoose.model('User', new mongoose.Schema({ username: String }));

// Khung dữ liệu MongoDB
const Member = mongoose.model('Member', new mongoose.Schema({
    owner_id: mongoose.Schema.Types.ObjectId, // Thêm owner_id
    full_name: String,
    gender: String,
    birth_date: String,
    death_date: String,
    generation: Number,
    address: String,
    parent_name: String,
    spouse_name: String,
    parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', default: null },
    spouse_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }]
}));

async function start() {
    try {
        console.log("🚀 CHẾ ĐỘ: MONGODB ATLAS");
        console.log("⏳ Đang kết nối...");
        await mongoose.connect(mongoURI);
        console.log("✅ Kết nối MongoDB THÀNH CÔNG!");

        // Tìm user admin để gán quyền sở hữu dữ liệu
        const admin = await User.findOne();
        const ownerId = admin ? admin._id : new mongoose.Types.ObjectId(); // Fallback nếu chưa có user
        console.log(`👤 Dữ liệu sẽ được gán cho Owner ID: ${ownerId}`);

        const response = await axios.get(sheetUrl);
        const records = parse(response.data, { columns: true, skip_empty_lines: true, trim: true });
        console.log(`📊 Đã tải ${records.length} người từ Google Sheets.`);

        await Member.deleteMany({});
        console.log("🧹 Đã làm sạch Database.");

        const members = await Member.insertMany(records.map(r => ({
            owner_id: ownerId, // Gán owner_id
            full_name: r['Họ và Tên'] || r['full_name'],
            gender: r['Giới tính'] || r['gender'],
            generation: parseInt(r['Đời thứ']) || 0,
            parent_name: r['Cha/Mẹ'],
            spouse_name: r['Vợ/Chồng']
        })));

        console.log("🔗 Đang thiết lập quan hệ cha-con, vợ-chồng...");
        for (let m of members) {
            let up = {};
            if (m.parent_name) {
                const p = members.find(x => x.full_name === m.parent_name);
                if (p) up.parent_id = p._id;
            }
            if (m.spouse_name) {
                const s = members.find(x => x.full_name === m.spouse_name);
                if (s) up.$addToSet = { spouse_ids: s._id };
            }
            if (Object.keys(up).length > 0) await Member.findByIdAndUpdate(m._id, up);
        }

        console.log("🎉 TẤT CẢ ĐÃ XONG! 770 người đã lên Cloud.");
        process.exit(0);
    } catch (err) {
        console.error("❌ LỖI RỒI:", err.message);
        process.exit(1);
    }
}
start();
