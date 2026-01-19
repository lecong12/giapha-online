const mongoose = require('mongoose');
const Post = mongoose.model('Post');

exports.getAllPosts = async (req, res) => {
    try {
        // Lấy bài viết của owner này
        const ownerId = req.user.role === 'owner' ? req.user.id : (await mongoose.model('User').findById(req.user.id)).owner_id;
        const posts = await Post.find({ owner_id: ownerId }).sort({ created_at: -1 });
        res.json({ success: true, posts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getPostById = async (req, res) => {
    // Placeholder
    res.json({ success: false, message: "Not implemented" });
};

exports.createPost = async (req, res) => {
    try {
        const { title, content } = req.body;
        const newPost = await Post.create({
            owner_id: req.user.id,
            author_id: req.user.id,
            author_role: req.user.role,
            title,
            content
        });
        res.json({ success: true, post: newPost });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updatePost = async (req, res) => {
    // Placeholder
    res.json({ success: false, message: "Not implemented" });
};

exports.deletePost = async (req, res) => {
    try {
        const deleted = await Post.findOneAndDelete({ _id: req.params.id, owner_id: req.user.id });
        if(deleted) res.json({ success: true });
        else res.status(404).json({ success: false, message: "Post not found" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};