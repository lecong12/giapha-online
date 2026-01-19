const express = require('express');
const router = express.Router();
const { getAllMembers, getMemberById, createMember, updateMember, deleteMember } = require('../controller/membersController');
const { checkAuth, checkOwnerOnly } = require('../middleware/auth');

router.get('/', checkAuth, getAllMembers);
router.get('/:id', checkAuth, getMemberById);
router.post('/', checkAuth, checkOwnerOnly, createMember);
router.put('/:id', checkAuth, checkOwnerOnly, updateMember);
router.delete('/:id', checkAuth, checkOwnerOnly, deleteMember);

// Route tìm kiếm (tạm thời dùng chung logic lấy tất cả để frontend lọc)
router.post('/search', checkAuth, getAllMembers);

module.exports = router;