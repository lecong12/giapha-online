const mongoose = require('mongoose');
const Activity = mongoose.model('Activity');

exports.getActivityLogs = async (req, res) => {
    try {
        const logs = await Activity.find({ owner_id: req.user.id }).sort({ created_at: -1 }).limit(50);
        res.json({ success: true, logs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.deleteLog = async (req, res) => {
    try {
        await Activity.findOneAndDelete({ _id: req.params.id, owner_id: req.user.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.clearAllLogs = async (req, res) => {
    try {
        await Activity.deleteMany({ owner_id: req.user.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};