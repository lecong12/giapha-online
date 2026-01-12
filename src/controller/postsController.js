// src/controller/postsController.js
const mongoose = require('mongoose');
const Post = mongoose.model('Post');
const User = mongoose.model('User');
// const { logActivity } = require('../utils/activityLogger'); // Tạm tắt nếu chưa có file này

/* ============================================================
   1. LẤY TẤT CẢ BÀI VIẾT
============================================================ */
async function getAllPosts(req, res) {
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    let ownerId = userId;

    if (userRole === 'viewer') {
      const viewer = await User.findById(userId);
      if (!viewer || !viewer.owner_id) {
        return res.status(403).json({ success: false, message: 'Không tìm thấy owner' });
      }
      ownerId = viewer.owner_id;
    }

    await fetchAllPosts(ownerId, res);
  } catch (err) {
    console.error('Lỗi getAllPosts:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

async function fetchAllPosts(ownerId, res) {
  // Lấy posts và populate tên tác giả
  const posts = await Post.find({ owner_id: ownerId })
    .sort({ is_pinned: -1, created_at: -1 })
    .lean();

  // Lấy thông tin author thủ công (vì author có thể là User hoặc Viewer)
  const authorIds = [...new Set(posts.map(p => p.author_id))];
  const authors = await User.find({ _id: { $in: authorIds } }, 'full_name').lean();
  const authorMap = {};
  authors.forEach(a => authorMap[a._id] = a.full_name);

  const result = posts.map(p => ({
    id: p._id, // Frontend dùng .id
    ...p,
    author_name: authorMap[p.author_id] || (p.author_role === 'owner' ? 'Admin' : 'Viewer')
  }));

  return res.json({ success: true, posts: result });
}

/* ============================================================
   2. LẤY CHI TIẾT 1 BÀI VIẾT
============================================================ */
async function getPostById(req, res) {
  const userId = req.user.id;
  const userRole = req.user.role;
  const postId = req.params.id;

  try {
    let ownerId = userId;
    if (userRole === 'viewer') {
      const viewer = await User.findById(userId);
      if (!viewer || !viewer.owner_id) return res.status(403).json({ success: false, message: 'Lỗi quyền' });
      ownerId = viewer.owner_id;
    }

    const post = await Post.findOne({ _id: postId, owner_id: ownerId }).lean();
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });

    const author = await User.findById(post.author_id, 'full_name').lean();
    
    const result = {
      id: post._id,
      ...post,
      author_name: author ? author.full_name : 'Unknown'
    };

    return res.json({ success: true, post: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

/* ============================================================
   3. TẠO BÀI VIẾT MỚI
============================================================ */
async function createPost(req, res) {
  const userId = req.user.id;
  const userRole = req.user.role;
  const { title, content, category, is_pinned } = req.body;

  if (!title || !content) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });

  try {
    let ownerId = userId;
    if (userRole === 'viewer') {
      const viewer = await User.findById(userId);
      if (!viewer || !viewer.owner_id) return res.status(403).json({ success: false, message: 'Lỗi quyền' });
      ownerId = viewer.owner_id;
    }

    const newPost = await Post.create({
      owner_id: ownerId,
      author_id: userId,
      author_role: userRole,
      title: title.trim(),
      content: content.trim(),
      category: category || 'announcement',
      is_pinned: !!is_pinned
    });

    res.json({ success: true, message: 'Tạo bài viết thành công', postId: newPost._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

/* ============================================================
   4. SỬA BÀI VIẾT
============================================================ */
async function updatePost(req, res) {
  const userId = req.user.id;
  const postId = req.params.id;
  const { title, content, category, is_pinned } = req.body;

  try {
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });

    // Chỉ tác giả mới được sửa
    if (post.author_id.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa bài này' });
    }

    post.title = title || post.title;
    post.content = content || post.content;
    post.category = category || post.category;
    post.is_pinned = is_pinned !== undefined ? is_pinned : post.is_pinned;
    
    await post.save();
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

/* ============================================================
   5. XÓA BÀI VIẾT
============================================================ */
async function deletePost(req, res) {
  const userId = req.user.id;
  const userRole = req.user.role;
  const postId = req.params.id;

  try {
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });

    // Owner được xóa tất cả, Viewer chỉ xóa của mình
    const isOwner = userRole === 'owner' && post.owner_id.toString() === userId;
    const isAuthor = post.author_id.toString() === userId;

    if (!isOwner && !isAuthor) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa bài này' });
    }

    await Post.findByIdAndDelete(postId);
    res.json({ success: true, message: 'Xóa thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}

module.exports = {
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost
};