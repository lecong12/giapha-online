const Auth = require("../components/auth");

/* ============================================================
   REGISTER OWNER
============================================================ */
exports.register = async (req, res) => {
    try {
        const db = req.app.get("db");
        const { full_name, email, password, confirm } = req.body;

        if (!full_name || !email || !password) {
            return res.json({ success: false, message: "Thiếu thông tin!" });
        }
        const result = await Auth.register(db, { full_name, email, password, confirm });

        return res.json(result);

    } catch (err) {
        return res.json({
            success: false,
            message: err.message || "Lỗi server."
        });
    }
};



/* ============================================================
   LOGIN CHUNG (owner hoặc viewer)
============================================================ */
exports.login = async (req, res) => {
    try {
        const db = req.app.get("db");
        const { role } = req.body;

        if (!role) {
            return res.json({ success: false, message: "Thiếu role đăng nhập." });
        }

        // ---------------------------
        // ĐĂNG NHẬP OWNER (EMAIL + PASSWORD)
        // ---------------------------
        if (role === "owner") {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.json({ success: false, message: "Thiếu email hoặc mật khẩu!" });
            }

            const result = await Auth.loginOwner(db, email, password);
            return res.json(result);
        }

        // ---------------------------
        // ĐĂNG NHẬP VIEWER (viewer_code)
        // ---------------------------
        if (role === "viewer") {
            const { viewer_code } = req.body;

            if (!viewer_code) {
                return res.json({ success: false, message: "Thiếu viewer_code!" });
            }

            const result = await Auth.loginViewer(db, viewer_code);
            return res.json(result);
        }

        // Role không hợp lệ
        return res.json({ success: false, message: "Role không hợp lệ." });

    } catch (err) {
        return res.json({
            success: false,
            message: err.message || "Lỗi server."
        });
    }
};
