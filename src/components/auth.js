// src/components/auth.js
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

/* Kết nối database */
const db = new sqlite3.Database(
    path.join(__dirname, "../../database/giapha.db"),
    sqlite3.OPEN_READWRITE,
    (err) => {
        if (err) console.error("DB Error:", err);
        else console.log("Auth Service connected");
    }
);

/* Generate viewer_code (10 ký tự) */
function generateViewerCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";
    for (let i = 0; i < 10; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/* ============================================================
   REGISTER OWNER → sinh viewer_code
============================================================ */
function register(db, { full_name, email, password, confirm }) {
    return new Promise((resolve) => {

        if (!email || !password || !full_name) {
            return resolve({ success: false, message: "Thiếu thông tin!" });
        }

        if (password !== confirm) {
            return resolve({ success: false, message: "Mật khẩu không trùng khớp!" });
        }

        const viewerCode = generateViewerCode();

        const insertUser = `
            INSERT INTO users (email, password, viewer_code, full_name, role)
            VALUES (?, ?, ?, ?, 'owner')
        `;

        db.run(insertUser, [email, password, viewerCode, full_name], function (err) {
            if (err) {
                return resolve({
                    success: false,
                    message: "Email đã tồn tại."
                });
            }

            const ownerId = this.lastID;

            // tạo person đầu tiên cho gia phả
            db.run(
                `INSERT INTO people (owner_id, full_name) VALUES (?, ?)`,
                [ownerId, full_name]
            );

            resolve({
                success: true,
                message: "Đăng ký thành công!",
                viewer_code: viewerCode
            });
        });
    });
}

/* ============================================================
   LOGIN OWNER (email + password)
============================================================ */
function loginOwner(db, email, password) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
            if (err || !user) {
                return resolve({ success: false, message: "Email không tồn tại!" });
            }

            if (user.password !== password) {
                return resolve({ success: false, message: "Sai mật khẩu!" });
            }

            resolve({
                success: true,
                message: "Đăng nhập thành công!",
                user: {
                    id: user.id,
                    email: user.email,
                    full_name: user.full_name,
                    viewer_code: user.viewer_code,
                    role: "owner"
                }
            });
        });
    });
}

/* ============================================================
   LOGIN VIEWER (bằng viewer_code)
============================================================ */
function loginViewer(db, viewerCode) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM users WHERE viewer_code = ?`, [viewerCode], (err, user) => {
            if (err || !user) {
                return resolve({ success: false, message: "Code không hợp lệ!" });
            }

            resolve({
                success: true,
                message: "Truy cập Viewer thành công!",
                owner_id: user.id,
                mode: "viewer"
            });
        });
    });
}

module.exports = {
    register,
    loginOwner,
    loginViewer
};
