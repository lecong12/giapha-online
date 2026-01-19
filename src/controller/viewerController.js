exports.createViewer = async (req, res) => {
    res.status(501).json({ success: false, message: "Tính năng Viewer chưa được cài đặt" });
};

exports.getViewers = async (req, res) => {
    res.json({ success: true, viewers: [] });
};

exports.updateViewer = async (req, res) => {
    res.status(501).json({ success: false, message: "Not implemented" });
};

exports.deleteViewer = async (req, res) => {
    res.status(501).json({ success: false, message: "Not implemented" });
};