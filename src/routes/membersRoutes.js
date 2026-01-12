// src/routes/membersRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Person = mongoose.model('Person');

// Middleware giả lập (Bypass để deploy trước)
const checkAuth = (req, res, next) => next();

// ================== ROUTES ==================

// Lấy tất cả thành viên
router.get('/', checkAuth, async (req, res) => {
    try {
        const members = await Person.find().sort({ generation: 1 });
        // Frontend mong đợi { success: true, members: [] }
        res.json({ success: true, members });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Lấy chi tiết 1 thành viên
router.get('/:id', checkAuth, async (req, res) => {
    try {
        const member = await Person.findById(req.params.id);
        if (!member) return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên' });
        res.json({ success: true, member });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Tạo thành viên mới
router.post('/', checkAuth, async (req, res) => {
    try {
        const newMember = new Person(req.body);
        await newMember.save();
        res.json({ success: true, message: 'Thêm thành công', member: newMember });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Cập nhật thành viên (SỬA LỖI: Thêm route này để sửa ông Thủy Tổ)
router.put('/:id', checkAuth, async (req, res) => {
    try {
        const updatedMember = await Person.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedMember) return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên' });
        res.json({ success: true, message: 'Cập nhật thành công', member: updatedMember });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Xóa thành viên
router.delete('/:id', checkAuth, async (req, res) => {
    try {
        await Person.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Đã xóa thành viên' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Tìm kiếm nâng cao
router.post('/search', checkAuth, async (req, res) => {
    try {
        const { name, gender, generation, job, address, status } = req.body;
        let query = {};
        
        if (name) query.full_name = { $regex: name, $options: 'i' };
        if (gender && gender !== 'all') query.gender = gender === 'male' ? 'Nam' : 'Nữ';
        if (generation) query.generation = generation;
        if (job) query.job = { $regex: job, $options: 'i' };
        if (address) query.address = { $regex: address, $options: 'i' };
        
        if (status === 'living') query.is_alive = true;
        if (status === 'deceased') query.is_alive = false;

        const members = await Person.find(query);
        res.json({ success: true, count: members.length, members });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;