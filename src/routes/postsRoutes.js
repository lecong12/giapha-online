const express = require('express');
const router = express.Router();
const { getAllPosts, createPost, deletePost, getPostById, updatePost } = require('../controller/postsController');
const { checkAuth, checkOwnerOnly } = require('../middleware/auth');

router.get('/', checkAuth, getAllPosts);
router.post('/', checkAuth, checkOwnerOnly, createPost);
router.get('/:id', checkAuth, getPostById);
router.put('/:id', checkAuth, checkOwnerOnly, updatePost);
router.delete('/:id', checkAuth, checkOwnerOnly, deletePost);

module.exports = router;