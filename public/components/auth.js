// public/components/auth.js

// Địa chỉ Backend trên Render của bạn
const API_URL = 'https://giapha-holecong.onrender.com';

async function handleLogin() {
    const role = document.getElementById('loginRole').value;
    const btn = document.querySelector('#loginForm .btn-primary');
    const errorMsg = document.getElementById('loginError');
    
    // Reset lỗi cũ
    errorMsg.style.display = 'none';
    errorMsg.textContent = '';

    // Hiệu ứng loading
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    try {
        let payload = {};
        let endpoint = '';

        if (role === 'owner') {
            const email = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            
            if (!email || !password) throw new Error('Vui lòng nhập đầy đủ Email và Mật khẩu');
            
            // Thêm role: 'owner' để backend nhận diện
            payload = { email, password, role: 'owner' };
            endpoint = '/api/auth/login'; 
        } else {
            const viewerCode = document.getElementById('viewerCode').value;
            const password = document.getElementById('loginPassword').value;

            if (!viewerCode || !password) throw new Error('Vui lòng nhập Mã Viewer và Mật khẩu');

            // Backend cần role='viewer' để chuyển hướng sang hàm loginViewer
            payload = { viewerCode, password, role: 'viewer' };
            // Dùng chung endpoint /login như trong authRoutes.js
            endpoint = '/api/auth/login'; 
        }

        console.log('Đang gọi API:', API_URL + endpoint);

        const response = await fetch(API_URL + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Đăng nhập thất bại');
        }

        // Đăng nhập thành công -> Lưu token
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userRole', role);
        if (data.user) {
            localStorage.setItem('userName', data.user.full_name);
        }
        
        // Chuyển hướng vào trang Dashboard
        window.location.href = '/dashboard';

    } catch (error) {
        console.error('Lỗi đăng nhập:', error);
        errorMsg.textContent = error.message;
        errorMsg.style.display = 'block';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Xử lý sự kiện khi trang tải xong (Đăng ký & Chuyển tab)
document.addEventListener('DOMContentLoaded', () => {
    // 1. Xử lý chuyển đổi form Đăng nhập / Đăng ký
    const toggleBtn = document.getElementById('toggleBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const loginForm = document.getElementById('loginForm');
            const registerForm = document.getElementById('registerForm');
            const title = document.querySelector('.auth-title');
            const subtitle = document.querySelector('.auth-subtitle');
            const toggleText = document.getElementById('toggleText');
            
            if (loginForm.style.display !== 'none') {
                // Chuyển sang Đăng ký
                loginForm.style.display = 'none';
                registerForm.classList.remove('hidden');
                registerForm.style.display = 'block';
                title.textContent = 'Đăng Ký Admin';
                subtitle.textContent = 'Tạo tài khoản quản lý gia phả';
                toggleText.textContent = 'Đã có tài khoản?';
                toggleBtn.textContent = 'Đăng Nhập';
            } else {
                // Chuyển sang Đăng nhập
                loginForm.style.display = 'block';
                registerForm.style.display = 'none';
                title.textContent = 'Gia Phả Online';
                subtitle.textContent = 'Quản lý gia đình một cách hiện đại';
                toggleText.textContent = 'Chưa có tài khoản?';
                toggleBtn.textContent = 'Đăng Ký';
            }
        });
    }

    // 2. Xử lý submit form Đăng ký
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = registerForm.querySelector('button[type="submit"]');
            const errorMsg = document.getElementById('registerError');
            const successMsg = document.getElementById('registerSuccess');
            
            errorMsg.textContent = '';
            successMsg.style.display = 'none';
            
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
            btn.disabled = true;
            
            try {
                const full_name = document.getElementById('registerFullname').value;
                const email = document.getElementById('registerEmail').value;
                const password = document.getElementById('registerPassword').value;
                const confirm = document.getElementById('registerConfirmPassword').value;
                
                if (password !== confirm) throw new Error('Mật khẩu nhập lại không khớp');
                
                const response = await fetch(API_URL + '/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ full_name, email, password })
                });
                
                const data = await response.json();
                
                if (!data.success) throw new Error(data.message);
                
                successMsg.textContent = 'Đăng ký thành công! Đang đăng nhập...';
                successMsg.style.display = 'block';
                
                // Tự động đăng nhập sau khi đăng ký
                setTimeout(() => {
                    localStorage.setItem('authToken', data.token);
                    localStorage.setItem('userRole', 'owner');
                    localStorage.setItem('userName', data.user.full_name);
                    window.location.href = '/dashboard';
                }, 1500);
                
            } catch (err) {
                errorMsg.textContent = err.message;
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    }
});