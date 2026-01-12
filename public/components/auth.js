// public/components/auth.js

// Log để kiểm tra xem file mới đã được tải chưa
console.log('🚀 Auth.js (ROBUST VERSION) loaded at:', new Date().toLocaleTimeString());

// --- CẤU HÌNH API URL TỰ ĐỘNG ---
let API_URL = '';

const hostname = window.location.hostname;
const protocol = window.location.protocol;
const port = window.location.port;

// Logic xác định URL backend:
// 1. Nếu là file:// -> Localhost 8060
// 2. Nếu là localhost/127.0.0.1 nhưng KHÁC port 8060 (ví dụ Live Server 5500) -> Localhost 8060
// 3. Tất cả trường hợp còn lại (Render, Custom Domain, Localhost:8060) -> Dùng đường dẫn tương đối (API_URL = '')

if (protocol === 'file:') {
    API_URL = 'http://localhost:8060';
    console.log('🔧 File Mode detected. API URL:', API_URL);
} else if (port && port !== '8060') {
    // Nếu đang chạy trên port khác (ví dụ 5500), giả định server chạy trên port 8060 cùng hostname
    API_URL = `${protocol}//${hostname}:8060`;
    console.log('🔧 Dev/LAN Mode detected. API URL:', API_URL);
} else {
    console.log('🌍 Production Mode. Using relative API paths.');
}

// --- HÀM KIỂM TRA KẾT NỐI SERVER ---
async function checkServerConnection() {
    try {
        const res = await fetch(API_URL + '/api/health', { method: 'GET' });
        if (res.ok) {
            console.log('✅ Kết nối Server thành công!');
            return true;
        }
    } catch (err) {
        console.error('❌ Lỗi kết nối Server:', err);
    }

    // Nếu lỗi, hiển thị thông báo đỏ trên cùng
    const warningDiv = document.createElement('div');
    warningDiv.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%;
        background: #ef4444; color: white; text-align: center;
        padding: 10px; z-index: 99999; font-weight: bold;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    warningDiv.innerHTML = `
        ⚠️ KHÔNG THỂ KẾT NỐI ĐẾN SERVER (${API_URL || 'localhost:8060'})<br>
        <span style="font-size: 12px; font-weight: normal;">
            1. Hãy chắc chắn bạn đã chạy lệnh <code>node server.js</code><br>
            2. Nếu dùng điện thoại, hãy dùng địa chỉ IP LAN (ví dụ: 192.168.1.x) thay vì localhost.
        </span>
    `;
    document.body.prepend(warningDiv);
    return false;
}

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
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            
            if (!username || !password) throw new Error('Vui lòng nhập đầy đủ Tên đăng nhập và Mật khẩu');
            
            // Thêm role: 'owner' để backend nhận diện
            payload = { username, password, role: 'owner' };
            endpoint = '/api/auth/login'; 
        } else {
            const viewerCode = document.getElementById('viewerCode').value;
            const password = document.getElementById('loginPassword').value;

            if (!viewerCode || !password) throw new Error('Vui lòng nhập Mã Viewer và Mật khẩu');
 
            // SỬA LỖI: Backend cần `viewer_code` (snake_case) thay vì `viewerCode`
            payload = { viewer_code: viewerCode, password, role: 'viewer' };
            // Dùng chung endpoint /login như trong authRoutes.js
            endpoint = '/api/auth/login'; 
        }

        const fullUrl = API_URL + endpoint;
        console.log(`📤 Sending login request to: ${fullUrl}`, payload);

        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            // Hiển thị lỗi chi tiết từ server nếu có
            throw new Error(data.message || `Lỗi server (${response.status})`);
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
        
        // Kiểm tra lỗi kết nối mạng (Fetch error)
        if (error.message === 'Failed to fetch' || error.message.includes('NetworkError')) {
            errorMsg.textContent = `❌ Không kết nối được Server tại ${API_URL || 'localhost:8060'}. Hãy kiểm tra Terminal xem server có đang chạy không?`;
        } else {
            errorMsg.textContent = error.message;
        }
        errorMsg.style.display = 'block';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function initializeAuthPage() {
    // Kiểm tra kết nối ngay khi vào trang
    checkServerConnection();

    // --- SỬA LỖI: Tự động gắn sự kiện cho nút Đăng nhập ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        // 1. Bắt sự kiện SUBMIT của form (Hỗ trợ phím Enter)
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault(); // Ngăn reload trang
            handleLogin();
        });

        const loginBtn = loginForm.querySelector('.btn-primary');
        if (loginBtn) {
            // Xóa nút cũ và thay bằng nút mới để loại bỏ các event cũ (nếu có)
            const newBtn = loginBtn.cloneNode(true);
            loginBtn.parentNode.replaceChild(newBtn, loginBtn);
            newBtn.addEventListener('click', (e) => {
                // Nếu nút không phải type="submit", cần gọi thủ công.
                if (newBtn.type !== 'submit') {
                    e.preventDefault();
                    handleLogin();
                }
            });
        }
    }

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
}

// Chạy hàm khởi tạo ngay lập tức
initializeAuthPage();