// public/components/auth.js

/* ============================================
    1. HIỆN / ẨN MẬT KHẨU
============================================ */
window.togglePassword = function (id) {
    const input = document.getElementById(id);
    const button = event.currentTarget;
    const icon = button.querySelector("i");

    if (!input) return;

    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace("fa-eye", "fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.replace("fa-eye-slash", "fa-eye");
    }
};


/* ============================================
    2. CHUYỂN ĐỔI FORM LOGIN / REGISTER 
============================================ */
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const toggleBtn = document.getElementById("toggleBtn");
const toggleText = document.getElementById("toggleText");

toggleBtn.addEventListener("click", () => {
    const isLoginVisible = !loginForm.classList.contains("hidden");

    if (isLoginVisible) {
        // → Chuyển sang Đăng ký
        loginForm.classList.add("hidden");
        registerForm.classList.remove("hidden");
        toggleText.textContent = "Đã có tài khoản?";
        toggleBtn.textContent = "Đăng Nhập";
    } else {
        // → Chuyển sang Đăng nhập
        registerForm.classList.add("hidden");
        loginForm.classList.remove("hidden");
        toggleText.textContent = "Chưa có tài khoản?";
        toggleBtn.textContent = "Đăng Ký";
    }
});


/* ============================================
    3. UI LOGIN THEO ROLE (owner / viewer)
============================================ */
const roleSelect = document.getElementById("loginRole");
const viewercodeInput = document.getElementById("viewercode");
const loginEmailInput = document.getElementById("loginUsername");
const loginPasswordInput = document.getElementById("loginPassword");

function updateLoginUI() {
    const role = roleSelect.value;

    if (role === "owner") {
        // Hiện email + password, ẩn viewer_code
        viewercodeInput.parentElement.style.display = "none";
        loginEmailInput.parentElement.style.display = "block";
        loginPasswordInput.parentElement.style.display = "block";

        // required đúng cho owner
        loginEmailInput.required = true;
        loginPasswordInput.required = true;
        viewercodeInput.required = false;

    } else {
        // Hiện viewer_code, ẩn email + password
        viewercodeInput.parentElement.style.display = "block";
        loginEmailInput.parentElement.style.display = "none";
        loginPasswordInput.parentElement.style.display = "none";

        // required đúng cho viewer
        viewercodeInput.required = true;
        loginEmailInput.required = false;
        loginPasswordInput.required = false;
    }
}

// chạy khi load
updateLoginUI();
// chạy khi đổi
roleSelect.addEventListener("change", updateLoginUI);


/* ============================================
    4. REGISTER OWNER
============================================ */
document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const full_name = document.getElementById("registerFullname").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value.trim();
    const confirm = document.getElementById("registerConfirmPassword").value.trim();

    const errBox = document.getElementById("registerError");
    const successBox = document.getElementById("registerSuccess");

    errBox.textContent = "";
    successBox.style.display = "none";

    try {
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full_name, email, password, confirm })
        });
        console.log("Fetch completed", res);
        const data = await res.json();
        console.log("Response data", data);
        if (!data.success) {
            errBox.textContent = data.message;
            return;
        }
        console.log("Registration successful");
        successBox.style.display = "block";
        successBox.textContent = `Đăng ký thành công! Viewer Code: ${data.viewer_code}`;

    } catch (e) {
        errBox.textContent = "Không thể kết nối server.";
    }
});


/* ============================================
    5. LOGIN OWNER / VIEWER
============================================ */
document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const role = roleSelect.value;
    const errBox = document.getElementById("loginError");
    errBox.textContent = "";

    let payload = {};

    if (role === "owner") {
        payload = {
            role: "owner",
            email: loginEmailInput.value.trim(),
            password: loginPasswordInput.value.trim()
        };
    } else {
        payload = {
            role: "viewer",
            viewer_code: viewercodeInput.value.trim()
        };
    }

    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!data.success) {
            errBox.textContent = data.message;
            return;
        }

        // → chuyển tới dashboard
        window.location.href = "/dashboard";

    } catch (e) {
        errBox.textContent = "Không thể kết nối server.";
    }
});
