// --- BƯỚC 1: Chuẩn bị dữ liệu từ tệp mới ---
console.log("🔹 BƯỚC 1: Đang chuẩn bị dữ liệu...");
const idMap = new Map(); // Dùng để tra cứu nhanh: id gốc -> _id của MongoDB

for (const r of records) {
    const fullName = r['full_name'];
    if (!fullName) continue;

    const memberData = {
        owner_id: ownerId,
        full_name: fullName,
        gender: r['gender'] || 'male',
        birth_date: normalizeDate(r['birth_date']),
        death_date: normalizeDate(r['death_date']),
        is_alive: r['deceased'] !== 'true',
        generation: parseInt(r['generation']) || 1,
        branch: r['branch'] || null,        // Cột Phái
        address: r['adress'] || null,       // Lưu ý lỗi chính tả 'adress' trong file
        phone: r['phone'] || null,
        notes: r['notes'] || null,
        order: parseInt(r['order']) || 0,
        original_id: r['id']                // Giữ ID gốc để liên kết
    };
    allNewMembersData.push(memberData);
}

// --- BƯỚC 2: Lưu vào Database ---
const insertedMembers = await Person.insertMany(allNewMembersData);
insertedMembers.forEach(m => idMap.set(String(m.original_id), m._id));

// --- BƯỚC 3: Cập nhật quan hệ Cha/Mẹ qua FID/MID ---
console.log("🔹 BƯỚC 3: Đang liên kết FID và MID...");
for (const member of insertedMembers) {
    const originalData = records.find(r => String(r.id) === String(member.original_id));
    const update = {};

    if (originalData.fid && idMap.has(String(originalData.fid))) {
        update.parent_id = [idMap.get(String(originalData.fid))]; // Gán ID của cha
    }
    if (originalData.mid && idMap.has(String(originalData.mid))) {
        update.mother_id = idMap.get(String(originalData.mid));   // Gán ID của mẹ
    }

    if (Object.keys(update).length > 0) {
        await Person.findByIdAndUpdate(member._id, { $set: update });
    }
}
