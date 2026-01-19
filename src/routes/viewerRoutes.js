const express = require('express');
const router = express.Router();
const { createViewer, getViewers, updateViewer, deleteViewer } = require('../controller/viewerController');
const { checkAuth, checkOwnerOnly } = require('../middleware/auth');

router.get('/', checkAuth, checkOwnerOnly, getViewers);
router.post('/', checkAuth, checkOwnerOnly, createViewer);
router.put('/:id', checkAuth, checkOwnerOnly, updateViewer);
router.delete('/:id', checkAuth, checkOwnerOnly, deleteViewer);

module.exports = router;