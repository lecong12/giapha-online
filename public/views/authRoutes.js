const express = require('express');
const router = express.Router();
const authController = require('../controller/authController');

router.post('/register', authController.register);
router.post('/login', authController.loginOwner);
router.post('/viewer-login', authController.loginViewer);

module.exports = router;