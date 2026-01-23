// public/components/dashboard.js

// --- CẤU HÌNH API URL TỰ ĐỘNG (Đồng bộ với auth.js) ---
let API_URL = '';
const hostname = window.location.hostname;
const protocol = window.location.protocol;
const port = window.location.port;

if (protocol === 'file:') {
    API_URL = 'http://localhost:8060';
    console.log('🔧 Dashboard: File Mode. API URL:', API_URL);
} else if (port && port !== '8060') {
    // Hỗ trợ cả Localhost và IP LAN (192.168.x.x)
    API_URL = `${protocol}//${hostname}:8060`;
    console.log('🔧 Dashboard: Dev/LAN Mode. API URL:', API_URL);
} else {
    console.log('🌍 Dashboard: Production Mode.');
}

// --- HÀM KIỂM TRA KẾT NỐI SERVER ---
async function checkServerConnection() {
    try {
        // Thử gọi API health check
        const res = await fetch(API_URL + '/api/health', { method: 'GET' });
        if (res.ok) return true;
    } catch (err) {
        console.error('❌ Dashboard mất kết nối:', err);
    }

    // Hiển thị cảnh báo nếu mất kết nối
    const warningId = 'connection-warning';
    if (!document.getElementById(warningId)) {
        const warningDiv = document.createElement('div');
        warningDiv.id = warningId;
        warningDiv.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #dc2626; color: white; padding: 12px 24px;
            border-radius: 50px; z-index: 99999; font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 10px;
        `;
        warningDiv.innerHTML = `<i class="fas fa-wifi"></i> Mất kết nối đến Server! Đang thử lại...`;
        document.body.appendChild(warningDiv);
    }
}

/* ==========================================================
0. KIỂM TRA TOKEN
========================================================== */
   
/* ============================================================
   CHECK AUTHENTICATION - Hỗ trợ cả Owner và Viewer
============================================================ */
function ensureAuth() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = "/login";
        return false;
    }

    // Validate token format
    try {
        const parts = token.split('_');
        if (parts.length < 3) {
            throw new Error('Invalid token format');
        }

        const prefix = parts[0]; // 'id' hoặc 'viewer'
        const userId = parts[1];

        // Chấp nhận cả 'id' và 'viewer'
        if (!['id', 'viewer'].includes(prefix)) {
            throw new Error('Invalid token prefix');
        }

        // ✅ Sửa lỗi: ID của MongoDB là chuỗi, không phải số (Number)
        if (!userId || userId.trim() === '') {
            throw new Error('Invalid user ID');
        }

        return true;
    } catch (err) {
        console.error('Token validation failed:', err);
        // Token không hợp lệ, xóa và redirect
        localStorage.removeItem('authToken');
        localStorage.removeItem('userName');
        localStorage.removeItem('userRole');
        window.location.href = "/login";
        return false;
    }
}
// Biến global để lưu danh sách members và trạng thái edit
let allMembers = [];
let editingMemberId = null;
let treeRenderer; // Biến quản lý cây gia phả
/* ==========================================================
   HELPER FUNCTIONS
========================================================== */

/**
 * Tính tuổi từ ngày sinh
 * @param {string} birthDate - Ngày sinh format YYYY-MM-DD
 * @returns {number} - Tuổi
 */
function calculateAge(birthDate) {
  if (!birthDate) return 0;
  
  const today = new Date();
  const birth = new Date(birthDate);
  
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  // Nếu chưa đến sinh nhật trong năm nay thì trừ 1 tuổi
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Rút gọn tên hiển thị cho cây gia phả (theo yêu cầu: 3-4 chữ giữ nguyên, dài hơn lấy 3 chữ cuối)
 */
function formatNameForTree(fullName) {
  if (!fullName) return '';
  const words = fullName.trim().split(/\s+/);
  if (words.length <= 4) return fullName;
  return words.slice(-3).join(' ');
}

/* ==========================================================
1. CHUYỂN TAB
========================================================== */

function handleTabSwitch(event) {
    const clickedButton = event.currentTarget;
    const targetSelector = clickedButton.dataset.target;
    if (!targetSelector) return;

    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => button.classList.remove('active'));
    tabContents.forEach(content => {
        content.style.display = 'none';
    });

    clickedButton.classList.add('active');

    const selectedContent = document.querySelector(targetSelector);
    if (selectedContent) {
        selectedContent.style.display = 'block';
    }

    // ✅ THÊM LOGIC NÀY
    if (targetSelector === '#tree') {
        if (!treeRenderer) {
            setTimeout(async () => {
                await initFamilyTree();
                showFullFamilyTree(); // Tự động hiện toàn bộ cây
            }, 100);
        } else {
            // Nếu đã init, hiển thị lại toàn bộ cây ngay lập tức
            setTimeout(() => {
                showFullFamilyTree();
                populatePersonDropdown(); // Cập nhật dropdown nếu có thành viên mới
            }, 100);
        }
    }
}

/* ==========================================================
2. HÀM GỌI API KÈM TOKEN
========================================================== */

function getAuthToken() {
  return localStorage.getItem('authToken') || '';
}

async function apiGet(url) {
  const token = getAuthToken();
  if (!token) {
    window.location.href = "/login";
    return { success: false, message: "Chưa đăng nhập" };
  }

  const res = await fetch(API_URL + url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  if (res.status === 401) {
    // Token sai/hết hạn -> xóa và quay lại login
    localStorage.removeItem('authToken');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    window.location.href = "/login";
    return { success: false, message: "Hết phiên đăng nhập" };
  }

  return res.json();
}

async function apiPost(url, body) {
    const token = getAuthToken();
    if (!token) return { success: false, message: "Chưa đăng nhập" };
    
    const res = await fetch(API_URL + url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiPut(url, body) {
    const token = getAuthToken();
    if (!token) return { success: false, message: "Chưa đăng nhập" };
    
    const res = await fetch(API_URL + url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiDelete(url) {
    const token = getAuthToken();
    if (!token) return { success: false, message: "Chưa đăng nhập" };
    
    const res = await fetch(API_URL + url, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (res.status === 204) return { success: true };
    return res.json();
}

/* ==========================================================
   3. CÁC CHỨC NĂNG SETTINGS (IMPORT/EXPORT)
========================================================== */

async function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!confirm(`Bạn muốn import file: ${file.name}?\n\nHành động này sẽ thay thế danh sách thành viên hiện tại.`)) return;

        // SỬA LỖI: Lấy token trước khi sử dụng
        const token = localStorage.getItem('authToken');
        if (!token) {
            alert("Vui lòng đăng nhập lại.");
            window.location.href = "/login";
            return;
        }

        const formData = new FormData();
        // QUAN TRỌNG: Append token TRƯỚC file để đảm bảo Multer đọc được field này trước khi xử lý file stream
        formData.append('token', token);
        formData.append('file', file);

        try {
            // Hiển thị loading
            // alert("⏳ Đang xử lý import, vui lòng đợi..."); // Có thể dùng custom notification thay vì alert chặn UI

            const response = await fetch(API_URL + '/api/settings/import-csv', {
                method: 'POST',
                headers: {
                    // QUAN TRỌNG: Không set Content-Type để browser tự set boundary cho FormData
                    'Authorization': `Bearer ${token}` 
                },
                body: formData
            });

            const result = await response.json();
            
            if (result.success) {
                alert(`✅ IMPORT THÀNH CÔNG!\n\n- Đã thêm: ${result.successCount} thành viên\n- ${result.message}`);
                // Reload lại trang hoặc danh sách thành viên
                window.location.reload();
            } else {
                alert('❌ Lỗi: ' + result.message);
            }
        } catch (err) {
            console.error(err);
            alert('❌ Lỗi kết nối server');
        }
    };
    
    input.click();
}

function downloadSampleCSV() {
    const csvContent = `full_name,gender,birth_date,death_date,generation,notes,phone,job,address,parent_name,spouse_name
Nguyễn Văn A,Nam,1950-01-01,,1,Thủy tổ,,,Hà Nội,,Trần Thị B
Trần Thị B,Nữ,1952-05-20,,1,Vợ thủy tổ,,,Hà Nội,,Nguyễn Văn A
Nguyễn Văn C,Nam,1980-10-10,,2,Con trưởng,,,Hà Nội,Nguyễn Văn A,`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "mau_import_giapha.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function backupData() {
    const token = localStorage.getItem('authToken');
    if (!token) return alert("Vui lòng đăng nhập lại");

    const btn = document.getElementById('btnBackup'); // Giả sử bạn có nút này
    if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';

    try {
        const response = await fetch(API_URL + '/api/settings/backup-json', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `giapha_backup_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            alert("✅ Đã tải bản sao lưu thành công! Hãy lưu file này cẩn thận.");
        } else {
            const err = await response.json();
            alert("❌ Lỗi backup: " + (err.message || response.statusText));
        }
    } catch (error) {
        console.error(error);
        alert("❌ Lỗi kết nối server");
    } finally {
        if(btn) btn.innerHTML = '<i class="fas fa-download"></i> Tải Backup (JSON)';
    }
}

async function exportPDF() {
    // Gọi hàm export của FamilyTreeRenderer nếu đang ở tab cây
    if (treeRenderer) {
        treeRenderer.exportPDF();
    } else {
        alert("Vui lòng chuyển sang tab 'Cây Gia Phả' để xuất PDF.");
    }
}

async function deleteAllMembers() {
    if (!confirm("⚠️ CẢNH BÁO: Bạn có chắc chắn muốn XÓA TOÀN BỘ thành viên?\nHành động này không thể hoàn tác!")) return;
    
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
        const response = await fetch(API_URL + '/api/settings/delete-all-members', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        if (result.success) {
            alert("✅ " + result.message);
            window.location.reload();
        } else {
            alert("❌ " + result.message);
        }
    } catch (err) {
        alert("❌ Lỗi kết nối server");
    }
}

async function resetData() {
    if (!confirm("⚠️ CẢNH BÁO: Reset dữ liệu sẽ xóa hết và tạo lại dữ liệu mẫu.\nBạn có chắc chắn không?")) return;

    const token = localStorage.getItem('authToken');
    try {
        const response = await fetch(API_URL + '/api/settings/reset-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        if (result.success) {
            alert("✅ " + result.message);
            window.location.reload();
        } else {
            alert("❌ " + result.message);
        }
    } catch (err) {
        alert("❌ Lỗi kết nối server");
    }
}

/* ==========================================================
4. KHỞI TẠO SỰ KIỆN
========================================================== */
function handleLogout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('userName');
  localStorage.removeItem('userRole');

  window.location.href = '/login';
}

/* ==========================================================
   5. LOGIC HIỂN THỊ DỮ LIỆU (BỊ THIẾU)
========================================================== */

// --- DASHBOARD STATS ---
async function loadDashboardStats() {
    try {
        const data = await apiGet('/api/dashboard/stats');
        if (!data || !data.success) return;

        const stats = data.stats;
        
        // Update counters
        const setText = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        setText('totalMembers', stats.total);
        setText('maleCount', stats.males);
        setText('femaleCount', stats.females);
        setText('generationCount', stats.maxGeneration);

        if (stats.total > 0) {
            setText('malePercent', Math.round((stats.males / stats.total) * 100) + '%');
            setText('femalePercent', Math.round((stats.females / stats.total) * 100) + '%');
        }

        // Render lists
        renderUpcomingBirthdays(stats.upcomingBirthdays || []);
        renderUpcomingDeathAnniversaries(stats.upcomingDeathAnniversaries || []);
        renderRecentActivities(stats.activities || []);
        
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

function renderUpcomingBirthdays(list) {
    const container = document.getElementById('birthdayList');
    if (!container) return;
    container.innerHTML = list.length ? '' : '<div style="text-align:center; color:#999; padding:10px;">Không có sinh nhật sắp tới</div>';
    
    list.forEach(item => {
        const div = document.createElement('div');
        // Logic hiển thị ngày
        const daysText = item.daysLeft === 0 ? '<span style="color:#d97706; font-weight:bold;">Hôm nay!</span>' : `Còn ${item.daysLeft} ngày`;

        div.className = 'event-item'; // Assumes CSS exists
        div.style.cssText = 'display:flex; gap:10px; padding:8px; border-bottom:1px solid #eee; align-items:center;';
        div.innerHTML = `
            <div style="background:#dcfce7; color:#166534; padding:5px 10px; border-radius:8px; font-weight:bold;">
                ${new Date(item.birthday).getDate()}/${new Date(item.birthday).getMonth() + 1}
            </div>
            <div>
                <div style="font-weight:600;">${item.full_name}</div>
                <div style="font-size:12px; color:#666;">${daysText}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderUpcomingDeathAnniversaries(list) {
    const container = document.getElementById('deathAnniversaryList'); // Cần thêm ID này vào HTML dashboard.html nếu chưa có
    if (!container) return;
    container.innerHTML = list.length ? '' : '<div style="text-align:center; color:#999; padding:10px;">Không có ngày giỗ sắp tới</div>';
    
    list.forEach(item => {
        const div = document.createElement('div');
        const daysText = item.daysLeft === 0 ? '<span style="color:#d97706; font-weight:bold;">Hôm nay!</span>' : `Còn ${item.daysLeft} ngày`;

        div.style.cssText = 'display:flex; gap:10px; padding:8px; border-bottom:1px solid #eee; align-items:center;';
        div.innerHTML = `
            <div style="background:#fee2e2; color:#991b1b; padding:5px 10px; border-radius:8px; font-weight:bold;">
                ${new Date(item.death_date).getDate()}/${new Date(item.death_date).getMonth() + 1}
            </div>
            <div>
                <div style="font-weight:600;">${item.full_name}</div>
                <div style="font-size:12px; color:#666;">Mất ${item.yearCount} năm • ${daysText}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderRecentActivities(list) {
    const container = document.getElementById('activityList');
    if (!container) return;
    container.innerHTML = list.length ? '' : '<div style="text-align:center; color:#999; padding:10px;">Chưa có hoạt động nào</div>';
    
    list.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:10px; border-bottom:1px solid #eee; font-size:14px;';
        const time = new Date(item.created_at).toLocaleString('vi-VN');
        div.innerHTML = `
            <div><strong>${item.description}</strong></div>
            <div style="font-size:12px; color:#666; margin-top:4px;">${item.actor_name} • ${time}</div>
        `;
        container.appendChild(div);
    });
}

// --- MEMBERS LIST ---
async function loadMembers() {
    try {
        const data = await apiGet('/api/members');
        if (data && data.success) {
            allMembers = data.members;
            renderMembers(allMembers);
        } else {
            console.error('Failed to load members:', data);
            // Không alert để tránh spam, nhưng log đỏ trong console
        }
    } catch (err) {
        console.error('Error loading members:', err);
        // alert('Lỗi kết nối khi tải danh sách thành viên');
    }
}

function renderMembers(members) {
    const grid = document.getElementById('membersGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    if (!members.length) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#666;">Chưa có thành viên nào. Hãy thêm mới hoặc Import CSV.</div>';
        return;
    }

    members.forEach(m => {
        const card = document.createElement('div');
        card.className = 'member-card'; // Assumes CSS
        // Inline style fallback
        card.style.cssText = 'background:white; border-radius:12px; padding:15px; box-shadow:0 2px 5px rgba(0,0,0,0.1); display:flex; align-items:center; gap:15px; cursor:pointer; transition:transform 0.2s;';
        card.onmouseover = () => card.style.transform = 'translateY(-2px)';
        card.onmouseout = () => card.style.transform = 'translateY(0)';
        
        const avatar = m.avatar || (m.gender === 'Nữ' ? 'https://cdn-icons-png.flaticon.com/512/4128/4128349.png' : 'https://cdn-icons-png.flaticon.com/512/4128/4128176.png');
        
        card.innerHTML = `
            <img src="${avatar}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:2px solid #eee;">
            <div style="flex:1;">
                <h3 style="margin:0; font-size:16px; font-weight:600;">${m.full_name}</h3>
                <p style="margin:4px 0 0; font-size:13px; color:#666;">Đời thứ ${m.generation}</p>
                <p style="margin:2px 0 0; font-size:12px; color:#999;">${m.birth_date || '?'}</p>
                ${m.job ? `<p style="margin:2px 0 0; font-size:12px; color:#4b5563;">💼 ${m.job}</p>` : ''}
            </div>
        `;
        
        // Click để xem chi tiết (nếu có hàm viewMemberDetail)
        card.onclick = () => { if(typeof viewMemberDetail === 'function') viewMemberDetail(m.id); };

        // Thêm nút sửa/xóa nhanh nếu là owner
        if (localStorage.getItem('userRole') === 'owner') {
            const actions = document.createElement('div');
            actions.style.cssText = 'margin-left: auto; display: flex; gap: 5px;';
            actions.innerHTML = `
                <button class="btn-icon edit" title="Sửa" style="background:none; border:none; cursor:pointer; color:#f59e0b;">
                    <i class="fas fa-edit"></i>
                </button>
            `;
            actions.querySelector('.edit').onclick = (e) => {
                e.stopPropagation();
                openEditMemberModal(m.id);
            };
            card.appendChild(actions);
        }
        
        grid.appendChild(card);
    });
}

function setupSimpleSearch() {
    const input = document.getElementById('searchInput');
    if(!input) return;
    input.oninput = (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allMembers.filter(m => m.full_name.toLowerCase().includes(term));
        renderMembers(filtered);
    };
}

// --- POSTS ---
async function loadPosts() {
    try {
        const data = await apiGet('/api/posts');
        if(data && data.success) {
            renderPosts(data.posts);
        }
    } catch(err) { console.error(err); }
}

function renderPosts(posts) {
    const grid = document.getElementById('postsGrid');
    if(!grid) return;
    grid.innerHTML = '';
    
    if(!posts.length) {
        grid.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">Chưa có bài viết nào</div>';
        return;
    }

    posts.forEach(p => {
        const card = document.createElement('div');
        card.style.cssText = 'background:white; border-radius:12px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.1); margin-bottom:15px;';
        card.innerHTML = `
            <h3 style="margin:0 0 10px 0; font-size:18px;">${p.title}</h3>
            <div style="font-size:12px; color:#666; margin-bottom:10px;">
                ${p.author_name} • ${new Date(p.created_at).toLocaleDateString('vi-VN')}
            </div>
            <div style="line-height:1.5; color:#333;">${p.content}</div>
        `;
        grid.appendChild(card);
    });
}

// --- FAMILY TREE ---
async function initFamilyTree() {
    if (!window.FamilyTreeRenderer) return;
    if (!treeRenderer) {
        treeRenderer = new FamilyTreeRenderer('familyTreeSvg');
    }
}

async function showFullFamilyTree() {
    if (!treeRenderer) await initFamilyTree();
    if (treeRenderer) {
        await treeRenderer.renderFullTree();
    }
}

function populatePersonDropdown() {
    // Logic populate dropdown cho form thêm thành viên
    const parentSelect = document.getElementById('memberParent');
    const spouseSelect = document.getElementById('memberSpouse');
    if(!parentSelect || !spouseSelect) return;
    
    let html = '<option value="">-- Chọn --</option>';
    allMembers.forEach(m => {
        html += `<option value="${m.id}">${m.full_name} (Đời ${m.generation})</option>`;
    });
    
    parentSelect.innerHTML = html;
    spouseSelect.innerHTML = html;
}

// --- MODAL HANDLERS (Placeholder minimal versions) ---

// 1. Mở modal thêm mới
function openAddMemberModal() {
    editingMemberId = null; // Reset ID đang sửa
    const modal = document.getElementById('addMemberModal');
    const form = document.getElementById('memberForm');
    const title = document.getElementById('addModalTitle');
    
    if(modal) {
        if(form) form.reset();
        if(title) title.textContent = "Thêm Thành Viên Mới";
        modal.classList.add('active');
        populatePersonDropdown();
    }
}

// 2. Mở modal sửa
async function openEditMemberModal(id) {
    editingMemberId = id;
    const modal = document.getElementById('addMemberModal');
    const form = document.getElementById('memberForm');
    const title = document.getElementById('addModalTitle');

    if (!modal || !form) return;

    try {
        const data = await apiGet(`/api/members/${id}`);
        if (data && data.success) {
            const m = data.member;
            
            if(title) title.textContent = "Sửa Thông Tin Thành Viên";
            
            // Điền dữ liệu vào form
            document.getElementById('memberName').value = m.full_name;
            document.getElementById('memberGender').value = m.gender === 'Nam' ? 'male' : 'female';
            document.getElementById('memberBirth').value = m.birth_date || '';
            document.getElementById('memberDeath').value = m.death_date || '';
            document.getElementById('memberPhone').value = m.phone || '';
            document.getElementById('memberJob').value = m.job || '';
            document.getElementById('memberAddress').value = m.address || '';
            document.getElementById('memberGeneration').value = m.generation || 1;
            document.getElementById('memberNote').value = m.notes || '';
            
            populatePersonDropdown();
            if(m.parent_id) document.getElementById('memberParent').value = m.parent_id._id || m.parent_id;
            if(m.spouse_id) document.getElementById('memberSpouse').value = m.spouse_id._id || m.spouse_id;

            modal.classList.add('active');
        }
    } catch (err) {
        console.error(err);
        alert("Không thể tải thông tin thành viên");
    }
}
function closeAddMemberModal() {
    const modal = document.getElementById('addMemberModal');
    if(modal) modal.classList.remove('active');
}
function openCreatePostModal() {
    const modal = document.getElementById('postModal');
    if(modal) modal.classList.add('active');
}
function closePostModal() {
    const modal = document.getElementById('postModal');
    if(modal) modal.classList.remove('active');
}

// --- VIEW DETAIL & DELETE ---

async function viewMemberDetail(id) {
    const modal = document.getElementById('memberModal');
    const content = document.getElementById('memberDetailContent');
    if (!modal || !content) return;

    try {
        const data = await apiGet(`/api/members/${id}`);
        if (data && data.success) {
            const m = data.member;
            const avatar = m.avatar || (m.gender === 'Nữ' ? 'https://cdn-icons-png.flaticon.com/512/4128/4128349.png' : 'https://cdn-icons-png.flaticon.com/512/4128/4128176.png');
            
            content.innerHTML = `
                <div style="text-align:center; margin-bottom:20px;">
                    <img src="${avatar}" style="width:100px; height:100px; border-radius:50%; object-fit:cover; border:3px solid #fff; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
                    <h2 style="margin:10px 0 5px;">${m.full_name}</h2>
                    <span style="background:#eee; padding:4px 10px; border-radius:20px; font-size:12px;">Đời thứ ${m.generation}</span>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div><strong>Giới tính:</strong> ${m.gender}</div>
                    <div><strong>Ngày sinh:</strong> ${m.birth_date || '---'}</div>
                    <div><strong>Ngày mất:</strong> ${m.death_date || '---'}</div>
                    <div><strong>Điện thoại:</strong> ${m.phone || '---'}</div>
                    <div><strong>Nghề nghiệp:</strong> ${m.job || '---'}</div>
                    <div><strong>Địa chỉ:</strong> ${m.address || '---'}</div>
                    <div style="grid-column:1/-1;"><strong>Cha/Mẹ:</strong> ${m.parents && m.parents.length ? m.parents[0].full_name : '---'}</div>
                    <div style="grid-column:1/-1;"><strong>Vợ/Chồng:</strong> ${m.spouse ? m.spouse.full_name : '---'}</div>
                    <div style="grid-column:1/-1;"><strong>Ghi chú:</strong> ${m.notes || '---'}</div>
                </div>
                ${localStorage.getItem('userRole') === 'owner' ? `
                <div style="margin-top:20px; text-align:center; border-top:1px solid #eee; padding-top:15px;">
                    <button onclick="deleteMember('${m.id}')" style="background:#ef4444; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer;">
                        <i class="fas fa-trash"></i> Xóa thành viên này
                    </button>
                </div>` : ''}
            `;
            modal.classList.add('active');
        }
    } catch (err) {
        console.error(err);
    }
}

function closeMemberModal() {
    const modal = document.getElementById('memberModal');
    if (modal) modal.classList.remove('active');
}

async function deleteMember(id) {
    if (!confirm("Bạn có chắc chắn muốn xóa thành viên này? Hành động này không thể hoàn tác.")) return;
    
    try {
        const res = await apiDelete(`/api/members/${id}`);
        if (res.success) {
            alert("Đã xóa thành công");
            closeMemberModal();
            loadMembers();
        } else {
            alert("Lỗi: " + res.message);
        }
    } catch (err) {
        alert("Lỗi kết nối server");
    }
}

// --- FORM SUBMITS ---
async function submitMemberForm(e) {
    e.preventDefault();
    const form = document.getElementById('memberForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Fix checkboxes and numbers
    data.generation = parseInt(data.generation) || 1;
    data.gender = data.gender === 'male' ? 'Nam' : 'Nữ'; // Chuẩn hóa giới tính
    
    try {
        let result;
        if (editingMemberId) {
            // Cập nhật (PUT)
            result = await apiPut(`/api/members/${editingMemberId}`, data);
        } else {
            // Thêm mới (POST)
            result = await apiPost('/api/members', data);
        }

        if(result.success) {
            alert(editingMemberId ? 'Cập nhật thành công' : 'Thêm thành công');
            closeAddMemberModal();
            loadMembers();
            form.reset();
        } else {
            alert('Lỗi: ' + result.message);
        }
    } catch(err) { alert('Lỗi kết nối'); }
}

async function submitPostForm(e) {
    e.preventDefault();
    const title = document.getElementById('postTitle').value;
    const content = document.getElementById('postContent').value;
    
    try {
        const res = await fetch(API_URL + '/api/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ title, content })
        });
        const result = await res.json();
        if(result.success) {
            alert('Đăng bài thành công');
            closePostModal();
            loadPosts();
            document.getElementById('postForm').reset();
        } else {
            alert('Lỗi: ' + result.message);
        }
    } catch(err) { alert('Lỗi kết nối'); }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (!ensureAuth()) return;
    
    checkServerConnection();
    
    // Hiển thị thông tin user
    const userName = localStorage.getItem('userName');
    const userRole = localStorage.getItem('userRole');
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');
    if(nameEl) nameEl.textContent = userName || 'User';
    if(roleEl) roleEl.textContent = userRole === 'owner' ? 'Admin' : 'Viewer';

    // Gán sự kiện Tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', handleTabSwitch);
    });
    
    // Gán sự kiện Forms
    const memberForm = document.getElementById('memberForm');
    if(memberForm) memberForm.addEventListener('submit', submitMemberForm);
    
    const postForm = document.getElementById('postForm');
    if(postForm) postForm.addEventListener('submit', submitPostForm);
    
    // Gán sự kiện Logout
    const logoutBtn = document.getElementById('logoutBtn') || document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Load dữ liệu ban đầu
    loadDashboardStats();
    
    // Nếu đang ở tab members thì load luôn
    if(document.querySelector('.tab-btn[data-target="#members"]').classList.contains('active')) {
        loadMembers();
    }
});