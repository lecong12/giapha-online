// src/routes/membersRoutes.js
const express = require('express');
const router = express.Router();
const membersController = require('../controller/membersController');
const { checkAuth } = require('../middleware/auth');

router.get('/', checkAuth, membersController.getAllMembers);
router.get('/:id', checkAuth, membersController.getMemberById);
router.post('/', checkAuth, membersController.createMember);
router.put('/:id', checkAuth, membersController.updateMember);
router.delete('/:id', checkAuth, membersController.deleteMember);
router.post('/search', checkAuth, membersController.searchMembers);

module.exports = router;