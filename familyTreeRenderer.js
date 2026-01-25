// public/components/familyTreeRenderer.js
/**
 * ====================================================================
 * HỆ THỐNG VẼ CÂY GIA PHẢ - PHIÊN BẢN PHOTO CHART (IMPROVED LOGIC)
 * - Layout: Recursive Tree (Cây phân cấp tự động căn chỉnh)
 * - Connection: Fork Style (Đường vuông góc)
 * - Fix: Unrelated People được tách riêng thành Grid nằm dưới đáy.
 * - Zoom & Pan: Tích hợp bằng cuộn chuột và kéo thả.
 * - NEW: Lọc cây theo người được chọn (chỉ hiển thị người liên quan)
 * ====================================================================
 */

console.log('FamilyTreeRenderer (Improved Logic Version) loading...');
class FamilyTreeRenderer {
    constructor(svgElementId) {
        this.svg = document.getElementById(svgElementId);
        if (!this.svg) {
            console.error(`Không tìm thấy SVG element với id: ${svgElementId}`);
            return;
        }

        this.targetPersonId = null; // mặc định
        // Cấu hình Kích thước & Màu sắc
        this.config = {
            cardWidth: 160,
            cardHeight: 200,
            avatarSize: 80,
            
            gapX: 40,
            gapY: 100,
            spouseGap: 30, // ✅ Tăng khoảng cách để vẽ đường nối vợ chồng

            padding: 80,

            gridCols: 6,
            gridGapX: 20,
            gridGapY: 20,

            colors: {
                maleBorder: '#f97316',
                maleBg: '#fff7ed',
                femaleBorder: '#ec4899',
                femaleBg: '#fce7f3',
                
                // ✅ MÀU MỚI CHO DÂU / RỂ
                sonInLawBorder: '#3b82f6', // Xanh dương (Rể)
                sonInLawBg: '#eff6ff',
                daughterInLawBorder: '#a855f7', // Tím (Dâu)
                daughterInLawBg: '#faf5ff',

                // ✅ MÀU CHO CHƯA RÕ GIỚI TÍNH
                unknownBorder: '#9ca3af', // Xám
                unknownBg: '#f3f4f6',

                deadBg: '#1f2937',
                deadText: '#f3f4f6',
                line: '#f97316',
                textName: '#111827',
                textInfo: '#4b5563'
            }
        };

        this.scale = 1;

        // Dữ liệu GỐC (toàn bộ database)
        this.allMembers = [];
        this.allRelationships = [];
        this.allMarriages = [];
        
        // Dữ liệu ĐÃ LỌC (chỉ người liên quan)
        this.members = [];
        this.relationships = [];
        this.marriages = [];
        
        // Maps hỗ trợ truy xuất nhanh
        this.peopleMap = new Map();
        this.spouseMap = new Map();
        this.childrenMap = new Map();

        this.unrelatedPeople = [];
        this.nodesToRender = [];
        
        // ID người được chọn để hiển thị cây
        this.selectedPersonId = null;
        
        // View state cho zoom/pan
        this.view = {
            panning: false,
            pointX: 0,
            pointY: 0,
            startX: 0,
            startY: 0,
            originX: 0,
            originY: 0,
            startClientX: 0,
            startClientY: 0,
            moved: false,
            suppressClick: false,
            evCache: [], // Cache cho multi-touch events
            prevDiff: -1 // Khoảng cách giữa 2 ngón tay trước đó
        };
        
        this.isFullTreeMode = false; // Flag theo dõi chế độ hiển thị
        this.setupPanZoom();
    }
    setTargetPerson(id) {
    /**
     * Load dữ liệu từ API
     * @param {number|null} personId - ID người cần hiển thị cây (null = mặc định id=1)
     */
    async loadData(personId = null) {
        try {
            const token = localStorage.getItem('authToken');
            
            const response = await fetch('/api/family-tree', { // ✅ Cập nhật đúng endpoint
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.message);

            // Lưu dữ liệu GỐC
            this.allMembers = result.data.members || [];
            this.allRelationships = result.data.relationships || [];
            this.allMarriages = result.data.marriages || [];
            // Xác định người được chọn
            if (personId) {
                this.selectedPersonId = personId;
            } else if (!this.selectedPersonId && this.allMembers.length > 0) {
                this.selectedPersonId = this.allMembers[0].id;
            }
            this.targetPersonId = this.selectedPersonId;
            
            // Lọc dữ liệu theo người được chọn
            this.filterDataByPerson(this.selectedPersonId);
            
            return true;
        } catch (error) {
            this.showError('Lỗi tải dữ liệu: ' + error.message);
            return false;
        }
    }

    /**
     * Lọc dữ liệu để chỉ giữ lại những người liên quan đến personId
     * Bao gồm: Tổ tiên, con cháu, anh chị em, vợ/chồng
     */
   filterDataByPerson(personId) {
     const relatedIds = new Set();
    
    let selectedPerson = this.allMembers.find(p => p.id === personId);
    if (!selectedPerson) {
        console.warn(`Không tìm thấy người có id=${personId}, hiển thị toàn bộ dữ liệu`);
        this.members = this.allMembers;
        this.relationships = this.allRelationships;
        this.marriages = this.allMarriages;
        this.processData();
        return;
    }
    
    console.log(`🔍 Lọc cây cho: ${selectedPerson.full_name} (${selectedPerson.member_type || 'blood'})`);
    
    // ✅ KIỂM TRA: Người này là DÂU/RỄ không?
    const isInLaw = selectedPerson.member_type === 'in_law' || selectedPerson.member_type === 'spouse';
    
    if (isInLaw) {
        console.log('👰 Người này là dâu/rễ → Hiển thị cây theo vợ/chồng');
        
        const spouseId = this.allMarriages
            .filter(m => m.husband_id === personId || m.wife_id === personId)
            .map(m => m.husband_id === personId ? m.wife_id : m.husband_id)[0];
        
        if (spouseId) {
            const spouse = this.allMembers.find(p => p.id === spouseId);
            if (spouse && spouse.member_type === 'blood') {
                console.log(`✅ Chuyển sang hiển thị cây của vợ/chồng: ${spouse.full_name}`);
                
                // ✅ GÁN LẠI personId, selectedPerson VÀ selectedPersonId
                personId = spouseId;
                selectedPerson = spouse;
                this.selectedPersonId = spouseId; // ← THÊM DÒNG NÀY
                this.targetPersonId = spouseId; // ✅ FIX: Cập nhật targetPersonId khi chuyển sang vợ/chồng
                
                console.log(`📍 PersonId mới: ${personId}, Tên: ${selectedPerson.full_name}`);
            }
        }
    }

    // ✅ XỬ LÝ BÌNH THƯỜNG (personId đã được update nếu là dâu/rễ)
      console.log(`🎯 Bắt đầu lọc với personId = ${personId} (${selectedPerson.full_name})`);
    
    // 1. Thêm chính người được chọn (hoặc vợ/chồng nếu là dâu/rễ)
    relatedIds.add(personId);
    
    // 2. Tìm TỔ TIÊN (đi ngược lên trên)
    console.log('⬆️ Tìm tổ tiên...');
    this.findAncestors(personId, relatedIds);
    console.log(`  → Tìm thấy ${relatedIds.size} người sau khi tìm tổ tiên`);
    
    // 2.5. [MỚI] Tìm ANH CHỊ EM của TỔ TIÊN (Ông chú, Bà cô...)
    // Giúp cây hiển thị đầy đủ các nhánh ngang ở các đời trên
    const ancestorIds = Array.from(relatedIds);
    ancestorIds.forEach(ancId => {
        // Tìm cha mẹ của ancestor này
        const parents = this.allRelationships
            .filter(r => r.child_id === ancId)
            .map(r => r.parent_id);
        
        parents.forEach(pId => {
            // Tìm tất cả con của cha mẹ này (tức là anh chị em của ancId)
            const siblings = this.allRelationships
                .filter(r => r.parent_id === pId)
                .map(r => r.child_id);
            
            siblings.forEach(sibId => relatedIds.add(sibId));
        });
    });

    // 3. Tìm CON CHÁU (đi xuống dưới)
    console.log('⬇️ Tìm con cháu...');
    this.findDescendants(personId, relatedIds);
    console.log(`  → Tìm thấy ${relatedIds.size} người sau khi tìm con cháu`);
    
    // 4. Tìm ANH CHỊ EM (con chung của cùng cha mẹ)
    console.log('👫 Tìm anh chị em...');
    this.findSiblings(personId, relatedIds);
    console.log(`  → Tìm thấy ${relatedIds.size} người sau khi tìm anh chị em`);
    
    // 5. Tìm VỢ/CHỒNG của TẤT CẢ người liên quan
    console.log('💑 Tìm vợ/chồng...');
    this.findSpouses(relatedIds);
    console.log(`  → Tìm thấy ${relatedIds.size} người sau khi tìm vợ/chồng`);
    
    // 6. Lọc dữ liệu
    this.members = this.allMembers.filter(p => relatedIds.has(p.id));
    this.relationships = this.allRelationships.filter(r => 
        relatedIds.has(r.parent_id) && relatedIds.has(r.child_id)
    );
    this.marriages = this.allMarriages.filter(m =>
        (m.husband_id && relatedIds.has(m.husband_id)) ||
        (m.wife_id && relatedIds.has(m.wife_id))
    );
    
    console.log(`✅ Lọc xong: ${this.members.length}/${this.allMembers.length} người`);
    console.log(`   - Relationships: ${this.relationships.length}`);
    console.log(`   - Marriages: ${this.marriages.length}`);
    
    // Xử lý dữ liệu đã lọc
    this.processData();
}
    /**
     * Tìm tất cả TỔ TIÊN (cha mẹ, ông bà, cố, kỵ,...)
     */
    findAncestors(personId, relatedIds) {
        const parents = this.allRelationships
            .filter(r => r.child_id === personId)
            .map(r => r.parent_id); // Chỉ lấy Cha (vì importData chỉ lưu cha vào parent_id)
        
        parents.forEach(parentId => {
            if (!relatedIds.has(parentId)) {
                relatedIds.add(parentId);
                // Đệ quy tìm tổ tiên của cha mẹ
                this.findAncestors(parentId, relatedIds);
            }
        });
    }

    /**
     * Tìm tất cả CON CHÁU (con, cháu, chắt,...)
     */
    findDescendants(personId, relatedIds) {
        const children = this.allRelationships
            .filter(r => r.parent_id === personId)
            .map(r => r.child_id);
        
        children.forEach(childId => {
            if (!relatedIds.has(childId)) {
                relatedIds.add(childId);
                // Đệ quy tìm con cháu của con
                this.findDescendants(childId, relatedIds);
            }
        });
    }

    /**
     * Tìm ANH CHỊ EM (những người cùng cha hoặc cùng mẹ)
     */
    findSiblings(personId, relatedIds) {
        // Tìm cha mẹ của người này
        const parents = this.allRelationships
            .filter(r => r.child_id === personId)
            .map(r => r.parent_id);
        
        // Tìm tất cả con của các cha mẹ này (= anh chị em)
        parents.forEach(parentId => {
            const siblings = this.allRelationships
                .filter(r => r.parent_id === parentId)
                .map(r => r.child_id);
            
            siblings.forEach(siblingId => {
                if (!relatedIds.has(siblingId)) {
                    relatedIds.add(siblingId);
                    // Đệ quy tìm con cháu của anh chị em
                    this.findDescendants(siblingId, relatedIds);
                }
            });
        });
    }

    /**
     * Tìm VỢ/CHỒNG của tất cả người trong danh sách
     */
    findSpouses(relatedIds) {
        const spousesToAdd = new Set();
        
        this.allMarriages.forEach(m => {
            if (m.husband_id && relatedIds.has(m.husband_id) && m.wife_id) {
                spousesToAdd.add(m.wife_id);
            }
            if (m.wife_id && relatedIds.has(m.wife_id) && m.husband_id) {
                spousesToAdd.add(m.husband_id);
            }
        });
        
        spousesToAdd.forEach(id => relatedIds.add(id));
    }

 processData() {
    // ✅ KIỂM TRA: Nếu đang render full tree thì KHÔNG xử lý gì cả
    // Vì renderFullTree() đã tự xử lý rồi
    if (this.isRenderingFullTree) {
        console.log('⏭️ Skip processData - đang render full tree');
        return;
    }
    
    // Map ID -> Person (toàn bộ DB)
    this.peopleMap.clear();
    const fullPeopleMap = new Map();
    this.members.forEach(p => {
        fullPeopleMap.set(p.id, p);
    });
    const parentChild = new Map();
    const addPC = (u, v) => {
        if (!parentChild.has(u)) parentChild.set(u, new Set());
        if (!parentChild.has(v)) parentChild.set(v, new Set());
        parentChild.get(u).add(v);
        parentChild.get(v).add(u);
    };
    this.relationships.forEach(r => addPC(r.parent_id, r.child_id));

    // 1) BFS lấy tập bloodline từ targetPersonId
    let startId = this.targetPersonId;
    if (!fullPeopleMap.has(startId) && this.members.length) {
        startId = this.members[0].id;
    }
    const bloodlineIds = new Set();
    const q = [startId];
    while (q.length) {
        const cur = q.shift();
        if (bloodlineIds.has(cur)) continue;
        bloodlineIds.add(cur);
        const neighbors = parentChild.get(cur);
        if (neighbors) {
            neighbors.forEach(n => { if (!bloodlineIds.has(n)) q.push(n); });
        }
    }

    // 2) Thêm vợ/chồng của các thành viên trong bloodline (để hiển thị cạnh thẻ)
    // Nhưng KHÔNG mở rộng sang cha mẹ/anh chị em của vợ/chồng.
    const spouseMapFull = new Map();
    this.spouseMap.clear();
    this.marriages.forEach(m => {
        if (m.husband_id && m.wife_id) {
            spouseMapFull.set(m.husband_id, m.wife_id);
            spouseMapFull.set(m.wife_id, m.husband_id);
        }
    });

    const spouseIdsToInclude = new Set();
    bloodlineIds.forEach(id => {
        const sp = spouseMapFull.get(id);
        if (sp && fullPeopleMap.has(sp)) spouseIdsToInclude.add(sp);
    });

    // 3) Tập người cần hiển thị = bloodline ∪ spouses (đính kèm)
    const relatedIds = new Set(bloodlineIds);
    spouseIdsToInclude.forEach(id => relatedIds.add(id));

    // 4) Lọc danh sách người
    const filteredPeople = this.members.filter(p => relatedIds.has(p.id));

    // 5) Cập nhật maps hiển thị
    this.peopleMap.clear();
    filteredPeople.forEach(p => this.peopleMap.set(p.id, p));

    // Chỉ giữ marriage nơi một đầu là người trong bloodline (để có thẻ vợ/chồng dính kèm)
    this.spouseMap.clear();
    this.marriages.forEach(m => {
        const a = m.husband_id, b = m.wife_id;
        const oneSideInBloodline = bloodlineIds.has(a) || bloodlineIds.has(b);
        if (oneSideInBloodline && relatedIds.has(a) && relatedIds.has(b)) {
            this.spouseMap.set(a, b);
            this.spouseMap.set(b, a);
        }
    });

    // ChildrenMap: chỉ thêm quan hệ cha–con nếu ÍT NHẤT một bên thuộc bloodline,
    // để không kéo con riêng của spouse nếu không thuộc nhánh của người mục tiêu.
    this.childrenMap.clear();
    this.relationships.forEach(r => {
        const keep =
            bloodlineIds.has(r.parent_id) ||
            bloodlineIds.has(r.child_id);

        if (keep && relatedIds.has(r.parent_id) && relatedIds.has(r.child_id)) {
            if (!this.childrenMap.has(r.parent_id)) {
                this.childrenMap.set(r.parent_id, new Set());
            }
            this.childrenMap.get(r.parent_id).add(r.child_id);
        }
    });

    // 6) Không vẽ lưới người không liên quan
    this.unrelatedPeople = [];
}

    /**
     * ✅ Hàm mới: Highlight người dùng trong cây hiện tại (Full hoặc Partial)
     */
    highlightInCurrentTree(personId) {
        this.targetPersonId = personId;
        this.selectedPersonId = personId;
        
        if (this.isFullTreeMode) {
            // Nếu đang ở chế độ Full Tree, render lại full tree (để update highlight và zoom)
            this.renderFullTree();
        } else {
            // Nếu đang ở chế độ Partial, render cây của người đó
            this.render(personId);
        }
    }

async render(personId = null) {
    this.isFullTreeMode = false; // Đánh dấu đang ở chế độ Partial
    const loaded = await this.loadData(personId);
    if (!loaded && this.members.length === 0) {
        this.showEmptyState();
        return;
    }

    this.svg.innerHTML = '';
    this.nodesToRender = [];

    // --- XÁC ĐỊNH ROOT ---
    const currentTargetId = this.selectedPersonId || this.targetPersonId;
    
    // ✅ FIX: Tìm root TỪ this.members (đã lọc) thay vì peopleMap
    let rootPerson = this.members.find(p => p.id == currentTargetId);

    // ✅ Nếu không tìm thấy → lấy người đầu tiên
    if (!rootPerson && this.members.length > 0) {
        rootPerson = this.members[0];
    }
    if (rootPerson) {
        // ✅ Leo ngược lên tìm Thủy Tổ (trong dữ liệu đã lọc)
        let attempts = 0;
        const maxAttempts = 100;
        while (attempts < maxAttempts) {
            const parentRel = this.relationships.find(r => r.child_id === rootPerson.id);
            if (!parentRel) break; // Không còn cha/mẹ → đây là root
            // ✅ Tìm parent trong this.members (không dùng peopleMap)
            const parent = this.members.find(p => p.id === parentRel.parent_id);
            if (!parent) break; // Parent không có trong dữ liệu lọc → dừng
            rootPerson = parent;
            attempts++;
        }
        console.log(`🌳 Root của cây: ${rootPerson.full_name} (Đời thứ ${rootPerson.generation || '?'})`);
    }

    // Mảng roots bây giờ chỉ chứa duy nhất 1 người (hoặc 0 nếu lỗi)
    let roots = rootPerson ? [rootPerson] : [];

    // --- TÍNH TOÁN VỊ TRÍ ---
    let startX = this.config.padding;
    const startY = this.config.padding;

    const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    mainGroup.setAttribute('id', 'mainGroup');
    this.svg.appendChild(mainGroup);

    roots.forEach(rootPerson => {
        const treeNode = this.buildTreeNode(rootPerson);
        this.calculateTreeSize(treeNode);
        this.calculateTreePosition(treeNode, startX, startY);
        this.flattenTree(treeNode);
        startX += treeNode.totalWidth + this.config.gapX * 2;
    });

    // --- VẼ ---
    let maxX = 0;
    let maxY = 0;
    
    // ✅ [MỚI] Xác định đường dẫn huyết thống (Ancestry Path) để highlight
    const ancestorPath = new Set();
    let curr = this.targetPersonId;
    ancestorPath.add(curr);
    // Leo ngược lên từ target để lấy danh sách ID tổ tiên trực hệ
    let safety = 0;
    while(safety < 100) {
        const rel = this.relationships.find(r => r.child_id === curr);
        if (!rel) break;
        curr = rel.parent_id;
        ancestorPath.add(curr);
        safety++;
    }

    // Vẽ đường nối
    this.nodesToRender.forEach(node => {
        if (node.childrenNodes.length > 0) {
            this.drawForkConnection(mainGroup, node, ancestorPath);
        }
    });

    // Vẽ thẻ
    this.nodesToRender.forEach(node => {
        let leftPerson = node.person;
        let rightPerson = node.spouse;

        // ✅ Sắp xếp: Nam trái, Nữ phải
        if (rightPerson) {
            const gender = (leftPerson.gender || '').toLowerCase();
            if (gender === 'nữ' || gender === 'female' || gender === 'nu') {
                leftPerson = node.spouse;
                rightPerson = node.person;
            }
        }

        this.drawCard(mainGroup, leftPerson, node.x, node.y);
        
        if (rightPerson) {
            const spouseX = node.x + this.config.cardWidth + this.config.spouseGap;
            this.drawCard(mainGroup, rightPerson, spouseX, node.y);
            
            // ✅ Vẽ đường nối vợ chồng
            this.drawSpouseConnection(mainGroup, node.x, spouseX, node.y);
            
            maxX = Math.max(maxX, spouseX + this.config.cardWidth);
        } else {
            maxX = Math.max(maxX, node.x + this.config.cardWidth);
        }
        maxY = Math.max(maxY, node.y + this.config.cardHeight);
    });

    // Vẽ Grid Unrelated
    if (this.unrelatedPeople.length > 0) {
        const gridStartY = maxY + 150;
        this.drawUnrelatedGrid(mainGroup, gridStartY, Math.max(maxX, 800));
        
        const rows = Math.ceil(this.unrelatedPeople.length / this.config.gridCols);
        const gridHeight = rows * (this.config.cardHeight + this.config.gridGapY) + 100;
        maxY = gridStartY + gridHeight;
    }

    // Cập nhật ViewBox
    const finalW = Math.max(maxX + this.config.padding, 1000); 
    const finalH = Math.max(maxY + this.config.padding, 800);
    this.svg.setAttribute('viewBox', `0 0 ${finalW} ${finalH}`);
    this.applyTransform();
    
    // ✅ [MỚI] Tự động căn giữa vào người được chọn (với zoom 100%)
    this.centerOnTarget();
}

    // ✅ Hàm căn giữa vào người được chọn
    centerOnTarget() {
        // Sử dụng == để so sánh ID (tránh lỗi string vs number)
        // FIX: Tìm node chứa target (có thể là person chính hoặc spouse)
        const targetNode = this.nodesToRender.find(n => 
            (n.person && n.person.id == this.targetPersonId) || 
            (n.spouse && n.spouse.id == this.targetPersonId)
        );
        
        if (targetNode) {
            const svgWidth = this.svg.clientWidth || 800;
            const svgHeight = this.svg.clientHeight || 600;
            
            // ✅ FIX: Đặt mức zoom là 1.2 (120%) để nhìn rõ ngay lập tức
            this.scale = 1.2;
            
            // Tọa độ tâm của thẻ target
            let nodeCenterX = targetNode.x + this.config.cardWidth / 2;
            // Nếu target là spouse (người bên phải), cần cộng thêm offset
            if (targetNode.spouse && targetNode.spouse.id == this.targetPersonId) {
                const spouseX = targetNode.x + this.config.cardWidth + this.config.spouseGap;
                nodeCenterX = spouseX + this.config.cardWidth / 2;
            }
            const nodeCenterY = targetNode.y + this.config.cardHeight / 2;
            
            // Tính toán vị trí để đưa node vào giữa màn hình
            this.view.pointX = (svgWidth / 2) - (nodeCenterX * this.scale);
            this.view.pointY = (svgHeight / 2) - (nodeCenterY * this.scale);
            
            this.applyTransform();
        } else {
            // Fallback: Nếu không tìm thấy node (hiếm), căn giữa toàn bộ
            this.centerContent();
        }
    }

    // ✅ Hàm căn giữa và Zoom to Fit toàn bộ nội dung
    centerContent() {
        const mainGroup = this.svg.querySelector('#mainGroup');
        if (!mainGroup) return;

        // Lấy kích thước thật của nội dung
        const bbox = mainGroup.getBBox();
        if (bbox.width === 0 && bbox.height === 0) return; // Cho phép 1 chiều = 0 (vd cây 1 người)

        const svgWidth = this.svg.clientWidth || 800;
        const svgHeight = this.svg.clientHeight || 600;
        const padding = 40;

        // 1. Tính toán Scale để vừa khít màn hình (nếu cây to hơn màn hình)
        const scaleX = (svgWidth - padding * 2) / bbox.width;
        const scaleY = (svgHeight - padding * 2) / bbox.height;
        let newScale = Math.min(scaleX, scaleY);

        // ✅ FIX: Ưu tiên hiển thị rõ (Zoom to lên tí) thay vì fit toàn bộ
        // Nếu cây quá lớn, ta đặt scale mặc định là 0.85 để người dùng nhìn thấy chữ ngay
        this.scale = Math.min(Math.max(newScale, 0.85), 1.2);

        // 2. Tính toán vị trí để đưa tâm nội dung vào tâm màn hình
        const contentCenterX = bbox.x + bbox.width / 2;
        const contentCenterY = bbox.y + bbox.height / 2;

        this.view.pointX = (svgWidth / 2) - (contentCenterX * this.scale);
        this.view.pointY = (svgHeight / 2) - (contentCenterY * this.scale);

        this.applyTransform();
    }

    // --- CÁC HÀM LOGIC CÂY (GIỮ NGUYÊN) ---

    buildTreeNode(person) {
        const spouseId = this.spouseMap.get(person.id);
        const spouse = spouseId ? this.peopleMap.get(spouseId) : null;
        
        const kidsSet = new Set();
        if (this.childrenMap.has(person.id)) this.childrenMap.get(person.id).forEach(id => kidsSet.add(id));
        if (spouse && this.childrenMap.has(spouse.id)) this.childrenMap.get(spouse.id).forEach(id => kidsSet.add(id));
        
        const children = Array.from(kidsSet)
            .map(id => this.peopleMap.get(id))
            .filter(p => p)
            .sort((a, b) => {
                // ✅ Ưu tiên sắp xếp theo Order (Thứ tự)
                const orderA = (a.order !== undefined && a.order !== null) ? a.order : 9999;
                const orderB = (b.order !== undefined && b.order !== null) ? b.order : 9999;
                if (orderA !== orderB) return orderA - orderB;
                // Nếu không có order thì sắp xếp theo ngày sinh
                return (a.birth_date || '').localeCompare(b.birth_date || '');
            });
            
        return {
            person: person,
            spouse: spouse,
            childrenNodes: children.map(c => this.buildTreeNode(c)),
            width: 0,
            totalWidth: 0,
            x: 0, y: 0
        };
    }

    calculateTreeSize(node) {
        let nodeSelfWidth = this.config.cardWidth;
        if (node.spouse) {
            nodeSelfWidth = this.config.cardWidth * 2 + this.config.spouseGap;
        }
        node.selfWidth = nodeSelfWidth;

        let childrenTotalWidth = 0;
        if (node.childrenNodes.length > 0) {
            node.childrenNodes.forEach(child => {
                this.calculateTreeSize(child);
                childrenTotalWidth += child.totalWidth;
            });
            childrenTotalWidth += (node.childrenNodes.length - 1) * this.config.gapX;
        }

        node.totalWidth = Math.max(nodeSelfWidth, childrenTotalWidth);
    }

    calculateTreePosition(node, x, y) {
        node.y = y;
        let nodeActualX = x + (node.totalWidth - node.selfWidth) / 2;
        node.x = nodeActualX;

        if (node.childrenNodes.length > 0) {
            const nextY = y + this.config.cardHeight + this.config.gapY;
            let childCurrentX = x + (node.totalWidth - this.getChildrenWidth(node)) / 2;

            node.childrenNodes.forEach(child => {
                this.calculateTreePosition(child, childCurrentX, nextY);
                childCurrentX += child.totalWidth + this.config.gapX;
            });
        }
    }

    getChildrenWidth(node) {
        if (node.childrenNodes.length === 0) return 0;
        let w = 0;
        node.childrenNodes.forEach(c => w += c.totalWidth);
        w += (node.childrenNodes.length - 1) * this.config.gapX;
        return w;
    }

    flattenTree(node) {
        this.nodesToRender.push(node);
        node.childrenNodes.forEach(c => this.flattenTree(c));
    }

    // --- CÁC HÀM VẼ (GIỮ NGUYÊN) ---

    drawForkConnection(group, node, ancestorPath = new Set()) {
        const startY = node.y + this.config.cardHeight;
        let startX;

        if (node.spouse) {
            startX = node.x + node.selfWidth / 2;
        } else {
            startX = node.x + this.config.cardWidth / 2;
        }

        const midY = startY + this.config.gapY / 2;

        // Kiểm tra xem đường này có thuộc dòng máu trực hệ của target không
        // Node hiện tại phải nằm trong path (là tổ tiên)
        const isNodeInPath = ancestorPath.has(node.person.id);

        this.createLine(group, startX, startY, startX, midY, isNodeInPath);

        const firstChild = node.childrenNodes[0];
        const lastChild = node.childrenNodes[node.childrenNodes.length - 1];

        const getChildCenterX = (n) => {
             return n.spouse 
                ? n.x + n.selfWidth / 2 
                : n.x + this.config.cardWidth / 2;
        };

        const minChildX = getChildCenterX(firstChild);
        const maxChildX = getChildCenterX(lastChild);

        // Đường ngang không cần highlight đặc biệt, hoặc highlight nếu node cha là tổ tiên
        this.createLine(group, minChildX, midY, maxChildX, midY, false);

        node.childrenNodes.forEach(child => {
            const childX = getChildCenterX(child);
            
            // Highlight đường đi xuống con nếu con cũng nằm trong path (tức là con là cha/ông của target, hoặc chính là target)
            const isChildInPath = isNodeInPath && ancestorPath.has(child.person.id);
            
            this.createLine(group, childX, midY, childX, child.y, isChildInPath);
        });
    }

    createLine(group, x1, y1, x2, y2, isHighlight = false) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        
        // Màu cam đậm nếu là đường huyết thống, màu xanh nhạt nếu bình thường
        line.setAttribute('stroke', isHighlight ? '#f97316' : this.config.colors.line);
        line.setAttribute('stroke-width', isHighlight ? '4' : '2');
        if (isHighlight) line.setAttribute('stroke-linecap', 'round');
        
        group.appendChild(line);
    }

    // ✅ Hàm vẽ đường nối vợ chồng
    drawSpouseConnection(group, x1, x2, y) {
        const lineY = y + this.config.cardHeight / 2;
        const startX = x1 + this.config.cardWidth;
        const endX = x2;
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', startX);
        line.setAttribute('y1', lineY);
        line.setAttribute('x2', endX);
        line.setAttribute('y2', lineY);
        line.setAttribute('stroke', '#f472b6'); // Màu hồng nhạt cho hôn nhân
        line.setAttribute('stroke-width', '2');
        group.appendChild(line);

        // Thêm chấm tròn ở giữa
        const cx = (startX + endX) / 2;
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', lineY);
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', '#f472b6');
        group.appendChild(circle);
    }

    drawCard(group, person, x, y) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${x}, ${y})`);
        g.style.cursor = 'pointer';
        g.onclick = () => this.showPersonDetail(person);

        // ✅ Chuẩn hóa giới tính
        const genderLower = (person.gender || '').toLowerCase();
        const isMale = genderLower === 'nam' || genderLower === 'male' || genderLower === 'trai';
        const isFemale = genderLower === 'nữ' || genderLower === 'nu' || genderLower === 'female' || genderLower === 'gái';
        
        // ✅ Kiểm tra trạng thái
        const isDead = !person.is_alive || (person.death_date && person.death_date !== 'unknown');
        const isTarget = person.id === this.targetPersonId; // ✅ Kiểm tra nếu là người được chọn
        const isInLaw = person.member_type === 'in_law'; // ✅ Kiểm tra dâu/rể

        let bgColor, strokeColor, textColor;

        if (isDead) {
            bgColor = this.config.colors.deadBg;
            strokeColor = '#6b7280'; // Viền xám cho người đã mất
            textColor = this.config.colors.deadText;
        } else {
            textColor = this.config.colors.textName;
            if (isInLaw) {
                // 🎨 Màu cho Dâu / Rể
                bgColor = isMale ? this.config.colors.sonInLawBg : this.config.colors.daughterInLawBg;
                strokeColor = isMale ? this.config.colors.sonInLawBorder : this.config.colors.daughterInLawBorder;
            } else {
                // 🎨 Màu cho Huyết thống (Con ruột)
                if (isMale) {
                    bgColor = this.config.colors.maleBg;
                    strokeColor = this.config.colors.maleBorder;
                } else if (isFemale) {
                    bgColor = this.config.colors.femaleBg;
                    strokeColor = this.config.colors.femaleBorder;
                } else {
                    // Chưa rõ giới tính
                    bgColor = this.config.colors.unknownBg;
                    strokeColor = this.config.colors.unknownBorder;
                }
            }
        }

        // ✅ [MỚI] HIỆU ỨNG HALO (VÒNG SÁNG) - Vẽ trước để nằm dưới thẻ
        if (isTarget) {
            const halo = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const haloPadding = 8;
            halo.setAttribute('x', -haloPadding);
            halo.setAttribute('y', -haloPadding);
            halo.setAttribute('width', this.config.cardWidth + haloPadding * 2);
            halo.setAttribute('height', this.config.cardHeight + haloPadding * 2);
            halo.setAttribute('rx', '16');
            halo.setAttribute('fill', 'none');
            halo.setAttribute('stroke', '#ef4444'); // Màu đỏ đậm
            halo.setAttribute('stroke-width', '3');
            halo.setAttribute('stroke-dasharray', '8, 4'); // Nét đứt
            
            const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
            anim.setAttribute('attributeName', 'stroke-opacity');
            anim.setAttribute('values', '1;0.2;1'); // Nhấp nháy độ mờ
            anim.setAttribute('dur', '1.5s');
            anim.setAttribute('repeatCount', 'indefinite');
            halo.appendChild(anim);
            
            g.appendChild(halo);
        }

        // Background
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', this.config.cardWidth);
        rect.setAttribute('height', this.config.cardHeight);
        rect.setAttribute('rx', '12');
        rect.setAttribute('fill', bgColor);
        rect.setAttribute('stroke', isTarget ? '#f59e0b' : strokeColor); // Target ưu tiên màu cam đậm
        rect.setAttribute('stroke-width', isTarget ? '4' : '2'); // ✅ Viền dày hơn nếu là target
        
        // ✅ HIỆU ỨNG HIGHLIGHT (NHẤP NHÁY) CHO TARGET
        if (isTarget) {
            const animateColor = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
            animateColor.setAttribute('attributeName', 'stroke');
            animateColor.setAttribute('values', '#f59e0b;#ef4444;#f59e0b');
            animateColor.setAttribute('dur', '1.5s');
            animateColor.setAttribute('repeatCount', 'indefinite');
            rect.appendChild(animateColor);
        }
        
        g.appendChild(rect);
        // Avatar
        const clipId = `clip-${person.id}`;
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clipPath.setAttribute('id', clipId);
        
        // ✅ Avatar hình tròn
        const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        clipRect.setAttribute('cx', this.config.cardWidth / 2);
        clipRect.setAttribute('cy', 15 + this.config.avatarSize / 2);
        clipRect.setAttribute('r', this.config.avatarSize / 2);
        clipPath.appendChild(clipRect);
        defs.appendChild(clipPath);
        g.appendChild(defs);

        const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        img.setAttribute('x', (this.config.cardWidth - this.config.avatarSize) / 2);
        img.setAttribute('y', 15);
        img.setAttribute('width', this.config.avatarSize);
        img.setAttribute('height', this.config.avatarSize);
        img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        img.setAttribute('clip-path', `url(#${clipId})`);
        
        // ✅ Chọn Avatar mặc định theo giới tính
        let defaultAvatar = 'https://cdn-icons-png.flaticon.com/512/149/149071.png'; // Icon User chung (Xám)
        if (isMale) defaultAvatar = 'https://cdn-icons-png.flaticon.com/512/4128/4128176.png'; // Nam
        if (isFemale) defaultAvatar = 'https://cdn-icons-png.flaticon.com/512/4128/4128349.png'; // Nữ

        const avatarUrl = person.avatar_url || defaultAvatar;
        img.setAttribute('href', avatarUrl);
        g.appendChild(img);

        // ✅ Viền avatar hình tròn
        const imgBorder = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        imgBorder.setAttribute('cx', this.config.cardWidth / 2);
        imgBorder.setAttribute('cy', 15 + this.config.avatarSize / 2);
        imgBorder.setAttribute('r', this.config.avatarSize / 2);
        imgBorder.setAttribute('fill', 'none');
        imgBorder.setAttribute('stroke', isTarget ? '#f59e0b' : strokeColor);
        imgBorder.setAttribute('stroke-width', '1');
        g.appendChild(imgBorder);

        // Tên
        const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        nameText.setAttribute('x', this.config.cardWidth / 2);
        nameText.setAttribute('y', 120);
        nameText.setAttribute('text-anchor', 'middle');
        nameText.setAttribute('font-weight', 'bold');
        nameText.setAttribute('font-size', '14');
        nameText.setAttribute('fill', textColor);
        
        let nameDisplay = person.full_name || 'Không tên';
        
        // Logic rút gọn tên: Nếu > 4 từ thì chỉ lấy 3 từ cuối (theo yêu cầu)
        const words = nameDisplay.trim().split(/\s+/);
        if (words.length > 4) {
            nameDisplay = words.slice(-3).join(' ');
        }
        
        nameText.textContent = nameDisplay;
        g.appendChild(nameText);

        // Năm sinh
        const yearText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        yearText.setAttribute('x', this.config.cardWidth / 2);
        yearText.setAttribute('y', 140);
        yearText.setAttribute('text-anchor', 'middle');
        yearText.setAttribute('font-size', '12');
        yearText.setAttribute('fill', isDead ? '#9ca3af' : '#4b5563');
   let birthYear = '?';
if (person.birth_date && person.birth_date !== 'unknown') {
    birthYear = new Date(person.birth_date).getFullYear();
} else {
    birthYear = '?';
}
yearText.textContent = `s. ${birthYear}`;
        g.appendChild(yearText);

        // RIP hoặc Đời
        if (isDead) {
            const ripText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            ripText.setAttribute('x', this.config.cardWidth / 2);
            ripText.setAttribute('y', 170);
            ripText.setAttribute('text-anchor', 'middle');
            ripText.setAttribute('font-weight', 'bold');
            ripText.setAttribute('font-size', '16');
            ripText.setAttribute('fill', '#fbbf24');
            ripText.textContent = 'RIP';
            g.appendChild(ripText);
        } else {
             const genText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
             genText.setAttribute('x', this.config.cardWidth / 2);
             genText.setAttribute('y', 165);
             genText.setAttribute('text-anchor', 'middle');
             genText.setAttribute('font-size', '12');
             genText.setAttribute('fill', isTarget ? '#d97706' : strokeColor);
             genText.textContent = `Đời thứ ${person.generation || '?'}`;
             g.appendChild(genText);
        }

        // ✅ [MỚI] MŨI TÊN CHỈ VỊ TRÍ (INDICATOR) - Vẽ sau cùng để nằm trên
        if (isTarget) {
            const arrowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            // Đặt vị trí ở giữa phía trên thẻ
            arrowGroup.setAttribute('transform', `translate(${this.config.cardWidth / 2}, -30)`);
            
            const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            arrow.setAttribute('d', 'M0,0 L-10,-15 L10,-15 Z'); // Hình tam giác ngược
            arrow.setAttribute('fill', '#ef4444');
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', 0);
            text.setAttribute('y', -20);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', '#ef4444');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('font-size', '14');
            text.textContent = "TÌM THẤY";

            // Animation nảy lên xuống
            const bounce = document.createElementNS('http://www.w3.org/2000/svg', 'animateTransform');
            bounce.setAttribute('attributeName', 'transform');
            bounce.setAttribute('type', 'translate');
            bounce.setAttribute('values', `0,0; 0,10; 0,0`);
            bounce.setAttribute('dur', '1s');
            bounce.setAttribute('repeatCount', 'indefinite');
            
            arrowGroup.appendChild(arrow);
            arrowGroup.appendChild(text);
            arrowGroup.appendChild(bounce);
            
            g.appendChild(arrowGroup);
        }

        group.appendChild(g);
    }

    drawUnrelatedGrid(parent, startY, currentMaxX) {
        const total = this.unrelatedPeople.length;
        if (total === 0) return;

        let cols = Math.ceil(Math.sqrt(total * 3));
        if (cols < 6) cols = 6;

        // Tiêu đề
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        title.setAttribute('x', this.config.padding);
        title.setAttribute('y', startY - 40);
        title.setAttribute('font-size', '20');
        title.setAttribute('font-weight', 'bold');
        title.setAttribute('fill', '#dc2626');
        title.textContent = `⚠ CHƯA XÁC ĐỊNH QUAN HỆ (${total})`;
        parent.appendChild(title);

        const gridWidth = cols * (this.config.cardWidth + this.config.gridGapX);
        const lineWidth = Math.max(currentMaxX, gridWidth + this.config.padding);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', this.config.padding);
        line.setAttribute('y1', startY - 20);
        line.setAttribute('x2', lineWidth);
        line.setAttribute('y2', startY - 20);
        line.setAttribute('stroke', '#9ca3af');
        line.setAttribute('stroke-dasharray', '8,8');
        line.setAttribute('stroke-width', '2');
        parent.appendChild(line);

        const startX = this.config.padding;

        this.unrelatedPeople.forEach((p, i) => {
            const c = i % cols;
            const r = Math.floor(i / cols);
            
            const x = startX + c * (this.config.cardWidth + this.config.gridGapX);
            const y = startY + r * (this.config.cardHeight + this.config.gridGapY);
            
            this.drawCard(parent, p, x, y);
        });
    }

    // --- TIỆN ÍCH ---

    showPersonDetail(person) {
        const modal = document.createElement('div');
        modal.style.cssText = `position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; font-family: sans-serif;`;
        
        const content = document.createElement('div');
        content.style.cssText = `background: white; padding: 25px; border-radius: 12px; max-width: 500px; width: 90%; position: relative; box-shadow: 0 10px 25px rgba(0,0,0,0.5);`;
        
        // ✅ Avatar popup
        const genderLower = (person.gender || '').toLowerCase();
        let defaultAvatar = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        if (['nam', 'male', 'trai'].includes(genderLower)) defaultAvatar = 'https://cdn-icons-png.flaticon.com/512/4128/4128176.png';
        if (['nữ', 'nu', 'female', 'gái'].includes(genderLower)) defaultAvatar = 'https://cdn-icons-png.flaticon.com/512/4128/4128349.png';

        const avatarUrl = person.avatar_url || defaultAvatar;
        
        content.innerHTML = `
            <div style="display: flex; gap: 20px; align-items: start; margin-bottom: 20px;">
                <img src="${avatarUrl}" style="width: 80px; height: 80px; border-radius: 8px; object-fit: cover; background: #eee;">
                <div>
                    <h2 style="margin: 0 0 5px 0; color: #111827;">${person.full_name || 'Không tên'}</h2>
                    <span style="background: ${person.is_alive ? '#dcfce7' : '#374151'}; color: ${person.is_alive ? '#166534' : '#fff'}; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold;">
                        ${person.is_alive ? 'Còn sống' : 'Đã mất'}
                    </span>
                    <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Đời thứ: ${person.generation || '?'}</p>
                </div>
            </div>
            <div style="background: #f9fafb; padding: 15px; border-radius: 8px; font-size: 14px; line-height: 1.6; color: #374151;">
                <p><strong>Ngày sinh:</strong> ${person.birth_date || 'Chưa rõ'}</p>
                ${person.death_date ? `<p><strong>Ngày mất:</strong> ${person.death_date}</p>` : ''}
                <p><strong>Nghề nghiệp:</strong> ${person.job || '---'}</p>
                <p><strong>Ghi chú:</strong> ${person.notes || person.biography || '---'}</p>
            </div>
            <button id="closeBtn" style="margin-top: 15px; width: 100%; padding: 10px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Đóng</button>
            <button id="showTreeBtn" style="margin-top: 10px; width: 100%; padding: 10px; background: #16a34a; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Xem cây gia phả của ${person.full_name}</button>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        document.getElementById('closeBtn').onclick = () => document.body.removeChild(modal);
        document.getElementById('showTreeBtn').onclick = () => {
            document.body.removeChild(modal);
            this.render(person.id); // Hiển thị lại cây với người này làm trung tâm
        };
        modal.onclick = (e) => { if(e.target === modal) document.body.removeChild(modal); };
    }

    getSVGPoint(clientX, clientY) {
        const ctm = this.svg.getScreenCTM();
        if (!ctm) return { x: clientX, y: clientY };

        const pt = this.svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const sp = pt.matrixTransform(ctm.inverse());
        return { x: sp.x, y: sp.y };
    }

    // --- PAN & ZOOM (GIỮ NGUYÊN) ---
    setupPanZoom() {
        this.svg.style.touchAction = 'none';
        this.svg.style.cursor = 'grab';
        this.view.evCache = [];

        this.svg.addEventListener('click', (e) => {
            if (!this.view.suppressClick) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            this.view.suppressClick = false;
        }, true);

        this.svg.addEventListener('wheel', (event) => {
            event.preventDefault();

            const mouse = this.getSVGPoint(event.clientX, event.clientY);
            const oldScale = this.scale;

            const zoomIntensity = 0.01;
            const factor = Math.exp(-event.deltaY * zoomIntensity);

            let newScale = oldScale * factor;
            // ✅ Tăng giới hạn zoom: Min 0.05 (nhìn xa), Max 200 (soi chi tiết)
            newScale = Math.max(0.05, Math.min(200, newScale));

            if (Math.abs(newScale - oldScale) < 1e-6) return;

            const wx = (mouse.x - this.view.pointX) / oldScale;
            const wy = (mouse.y - this.view.pointY) / oldScale;

            this.scale = newScale;
            this.view.pointX = mouse.x - wx * newScale;
            this.view.pointY = mouse.y - wy * newScale;

            this.applyTransform();
        }, { passive: false });

        const DRAG_THRESHOLD_PX = 3;

        this.svg.addEventListener('pointerdown', (event) => {
            // Thêm event vào cache để xử lý multi-touch
            this.view.evCache.push(event);
            
            if (event.pointerType === 'mouse' && event.button !== 0) return; 

            this.view.panning = true;
            this.view.moved = false;
            this.view.suppressClick = false;

            this.view.startClientX = event.clientX;
            this.view.startClientY = event.clientY;

            const p = this.getSVGPoint(event.clientX, event.clientY);
            this.view.startX = p.x;
            this.view.startY = p.y;

            this.view.originX = this.view.pointX;
            this.view.originY = this.view.pointY;

            this.svg.style.cursor = 'grabbing';

            if (event.target && event.target.setPointerCapture) {
                event.target.setPointerCapture(event.pointerId);
            }
        });

        this.svg.addEventListener('pointermove', (event) => {
            // Cập nhật event trong cache
            const index = this.view.evCache.findIndex(e => e.pointerId === event.pointerId);
            if (index > -1) this.view.evCache[index] = event;

            // --- XỬ LÝ PINCH ZOOM (2 NGÓN TAY) ---
            if (this.view.evCache.length === 2) {
                const curDiff = Math.hypot(
                    this.view.evCache[0].clientX - this.view.evCache[1].clientX,
                    this.view.evCache[0].clientY - this.view.evCache[1].clientY
                );

                if (this.view.prevDiff > 0) {
                    // Tính tâm của 2 ngón tay để zoom vào đó
                    const centerClientX = (this.view.evCache[0].clientX + this.view.evCache[1].clientX) / 2;
                    const centerClientY = (this.view.evCache[0].clientY + this.view.evCache[1].clientY) / 2;
                    
                    const mouse = this.getSVGPoint(centerClientX, centerClientY);
                    const oldScale = this.scale;
                    
                    // Tính tỷ lệ thay đổi khoảng cách
                    const zoomFactor = curDiff / this.view.prevDiff;
                    let newScale = oldScale * zoomFactor;
                    // ✅ Tăng giới hạn zoom cho cảm ứng (Pinch)
                    newScale = Math.max(0.05, Math.min(200, newScale));

                    const wx = (mouse.x - this.view.pointX) / oldScale;
                    const wy = (mouse.y - this.view.pointY) / oldScale;

                    this.scale = newScale;
                    this.view.pointX = mouse.x - wx * newScale;
                    this.view.pointY = mouse.y - wy * newScale;

                    this.applyTransform();
                }
                
                // Lưu khoảng cách hiện tại cho lần sau
                this.view.prevDiff = curDiff;
                return; // Đã xử lý zoom, bỏ qua pan
            }

            // --- XỬ LÝ PAN (KÉO THẢ 1 NGÓN) ---
            if (!this.view.panning) return;

            const p = this.getSVGPoint(event.clientX, event.clientY);
            const dx = p.x - this.view.startX;
            const dy = p.y - this.view.startY;

            this.view.pointX = this.view.originX + dx;
            this.view.pointY = this.view.originY + dy;

            if (!this.view.moved) {
                const ddx = event.clientX - this.view.startClientX;
                const ddy = event.clientY - this.view.startClientY;
                if (Math.hypot(ddx, ddy) > DRAG_THRESHOLD_PX) this.view.moved = true;
            }

            this.applyTransform();
        });

        const endPan = (event) => {
            // Xóa event khỏi cache
            const index = this.view.evCache.findIndex(e => e.pointerId === event.pointerId);
            if (index > -1) this.view.evCache.splice(index, 1);
            
            // Reset diff nếu số ngón tay < 2
            if (this.view.evCache.length < 2) {
                this.view.prevDiff = -1;
            }

            if (!this.view.panning) return;
            this.view.panning = false;

            this.view.suppressClick = this.view.moved;

            this.svg.style.cursor = 'grab';

            if (event.target && event.target.releasePointerCapture) {
                try { event.target.releasePointerCapture(event.pointerId); } catch (_) {}
            }
        };

        this.svg.addEventListener('pointerup', endPan);
        this.svg.addEventListener('pointercancel', endPan);
    }

    applyTransform() {
        const g = this.svg.querySelector('#mainGroup');
        if (g) {
            g.setAttribute('transform', `translate(${this.view.pointX}, ${this.view.pointY}) scale(${this.scale})`);
        }
    }

    resetZoom() {
        this.scale = 1;
        this.view.pointX = 0;
        this.view.pointY = 0;
        this.applyTransform();
    }

    showEmptyState() {
        this.svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="#9ca3af" font-size="20">Chưa có dữ liệu gia phả</text>`;
    }
    
    showError(msg) {
        this.svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="#ef4444" font-size="20">Error: ${msg}</text>`;
    }

async imageToDataURL(url) {
    // Hỗ trợ cả đường dẫn tương đối
    const absoluteUrl = url.startsWith('http') ? url : new URL(url, window.location.origin).href;
    const resp = await fetch(absoluteUrl, { mode: 'cors', credentials: 'omit' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
/**
 * Render toàn bộ cây gia phả (tất cả thủy tổ + con cháu)
 */
/**
 * Render toàn bộ cây gia phả (tất cả thủy tổ + con cháu)
 */
async renderFullTree() {
    console.log('🌳 Bắt đầu render toàn bộ cây...');
    // ✅ SET FLAG để processData() không chạy
    this.isRenderingFullTree = true;
    this.isFullTreeMode = true; // Đánh dấu đang ở chế độ Full Tree
    try {
        if (!this.allMembers || this.allMembers.length === 0) { // ✅ Đã sửa
            const loaded = await this.loadData(null);
            if (!loaded) {
                throw new Error('Không thể tải dữ liệu');
            }
        }

        // ✅ BƯỚC 1: Tìm TẤT CẢ thủy tổ (generation = 1)
        const founders = this.allMembers.filter(p => p.generation === 1);

        if (founders.length === 0) {
            throw new Error('⚠️ Không tìm thấy thuỷ tổ nào (generation = 1)');
        }

// ✅ THÊM DÒNG NÀY - QUAN TRỌNG NHẤT
        this.members = this.allMembers;
        this.relationships = this.allRelationships;
        this.marriages = this.allMarriages;
        
        // ✅ THÊM DÒNG NÀY - Rebuild maps từ dữ liệu đầy đủ
        this.peopleMap.clear();
        this.members.forEach(p => this.peopleMap.set(p.id, p));
        this.spouseMap.clear();
        this.marriages.forEach(m => {
            if (m.husband_id && m.wife_id) {
                this.spouseMap.set(m.husband_id, m.wife_id);
                this.spouseMap.set(m.wife_id, m.husband_id);
            }
        });
        this.relationships.forEach(r => {
            if (!this.childrenMap.has(r.parent_id)) {
                this.childrenMap.set(r.parent_id, new Set());
            }
            this.childrenMap.get(r.parent_id).add(r.child_id);
        });
        // ✅ BƯỚC 2: NHÓM THỦY TỔ
        const founderGroups = this.groupFoundersByMarriage(founders);
        console.log(`📊 Sau khi gộp: ${founderGroups.length} nhóm thủy tổ`);

        // ✅ BƯỚC 3: Tạo cây từ TỪNG NHÓM
        const allTrees = [];
        founderGroups.forEach(group => {
            let rootPerson = group[0];
            if (group.length === 2) {
                rootPerson = group.find(p => p.gender === 'Nam') || group[0];
            }
            
            const tree = this.buildTreeNode(rootPerson);
            allTrees.push(tree);
        });

        // ✅ BƯỚC 4: Vẽ TẤT CẢ cây
        this.renderMultipleTrees(allTrees);
        console.log('✅ Hoàn thành render toàn bộ cây');

    } catch (error) {
        console.error('❌ Lỗi renderFullTree:', error);
        throw error;
    } finally {
        // ✅ LUÔN LUÔN Reset flag để không chặn các thao tác sau
        this.isRenderingFullTree = false;
    }
}
/**
 * Nhóm các thủy tổ là vợ chồng vào cùng 1 nhóm
 * @param {Array} founders - Danh sách thủy tổ (generation = 1)
 * @returns {Array<Array>} - Mảng các nhóm [[person1], [person2, person3], ...]
 */
groupFoundersByMarriage(founders) {
    const grouped = [];
    const processed = new Set();
    
    // Tạo map vợ/chồng từ allMarriages
    const spouseMap = new Map();
    this.allMarriages.forEach(m => {
        if (m.husband_id && m.wife_id) {
            spouseMap.set(m.husband_id, m.wife_id);
            spouseMap.set(m.wife_id, m.husband_id);
        }
    });
    
    founders.forEach(founder => {
        if (processed.has(founder.id)) return;
        
        const spouseId = spouseMap.get(founder.id);
        
        // Kiểm tra spouse có phải thủy tổ không
        const spouse = spouseId ? founders.find(f => f.id === spouseId) : null;
        
        if (spouse && !processed.has(spouse.id)) {
            // Có vợ/chồng cùng là thủy tổ → Nhóm lại
            grouped.push([founder, spouse]);
            processed.add(founder.id);
            processed.add(spouse.id);
            
            console.log(`👫 Gộp thủy tổ vợ chồng: ${founder.full_name} & ${spouse.full_name}`);
        } else {
            // Độc thân hoặc spouse không phải thủy tổ
            grouped.push([founder]);
            processed.add(founder.id);
            
            console.log(`👤 Thủy tổ độc lập: ${founder.full_name}`);
        }
    });
    
    return grouped;
}
/**
 * Vẽ nhiều cây gia phả (từ nhiều thủy tổ)
 */
/**
 * Vẽ nhiều cây gia phả (từ nhiều thủy tổ)
 * Layout: Xếp NGANG (từ trái sang phải)
 */
renderMultipleTrees(trees) {
    console.log('🎨 Bắt đầu vẽ', trees.length, 'cây...');
    
    // Clear SVG
    this.svg.innerHTML = '';
    this.nodesToRender = []; // ✅ Reset danh sách node để dùng cho centerOnTarget
    
    // Tạo main group
    const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    mainGroup.setAttribute('id', 'mainGroup');
    this.svg.appendChild(mainGroup);
    
    const margin = { top: 80, right: 80, bottom: 80, left: 80 };
    const treeSpacing = 400; // Khoảng cách giữa các cây
    
    let currentX = margin.left;
    let maxY = 0;
    
    trees.forEach((treeNode, index) => {
        console.log(`📍 Vẽ cây ${index + 1}/${trees.length}`);
        
        // 1. Tính toán kích thước & vị trí cho cây này
        this.calculateTreeSize(treeNode);
        this.calculateTreePosition(treeNode, currentX, margin.top);
        
        // 2. Flatten tree để lấy danh sách nodes
        const nodesInTree = [];
        this.flattenTreeToArray(treeNode, nodesInTree);
        this.nodesToRender.push(...nodesInTree); // ✅ Thêm vào danh sách tổng
        
        // 3. Vẽ đường nối
        nodesInTree.forEach(node => {
            if (node.childrenNodes.length > 0) {
                this.drawForkConnection(mainGroup, node);
            }
        });
        
        // 4. Vẽ thẻ
        nodesInTree.forEach(node => {
            let leftPerson = node.person;
            let rightPerson = node.spouse;

            // ✅ Sắp xếp: Nam trái, Nữ phải
            if (rightPerson) {
                const gender = (leftPerson.gender || '').toLowerCase();
                if (gender === 'nữ' || gender === 'female' || gender === 'nu') {
                    leftPerson = node.spouse;
                    rightPerson = node.person;
                }
            }

            this.drawCard(mainGroup, leftPerson, node.x, node.y);
            
            if (rightPerson) {
                const spouseX = node.x + this.config.cardWidth + this.config.spouseGap;
                this.drawCard(mainGroup, rightPerson, spouseX, node.y);
                
                // ✅ Vẽ đường nối vợ chồng cho chế độ xem toàn bộ
                this.drawSpouseConnection(mainGroup, node.x, spouseX, node.y);
            }
        });
        
        // 5. Cập nhật vị trí cho cây tiếp theo
        currentX += treeNode.totalWidth + treeSpacing;
        
        // 6. Tính maxY
        nodesInTree.forEach(node => {
            maxY = Math.max(maxY, node.y + this.config.cardHeight);
        });
    });
    
    // Cập nhật ViewBox
    const totalWidth = currentX + margin.right;
    const totalHeight = maxY + margin.bottom;
    
    this.svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    this.svg.setAttribute('width', totalWidth);
    this.svg.setAttribute('height', totalHeight);
    
    console.log(`✅ Hoàn thành vẽ ${trees.length} cây - Kích thước: ${totalWidth}x${totalHeight}`);
    
    // ✅ Căn giữa: Nếu có target (đang tìm kiếm) thì zoom vào target, ngược lại zoom toàn bộ
    const hasTarget = this.targetPersonId && this.nodesToRender.some(n => 
        (n.person && n.person.id == this.targetPersonId) || 
        (n.spouse && n.spouse.id == this.targetPersonId)
    );
    
    if (hasTarget) {
        console.log('🎯 Zoom vào target:', this.targetPersonId);
        this.centerOnTarget();
    } else {
        this.centerContent();
    }
}

/**
 * Helper: Flatten tree thành mảng nodes
 */
flattenTreeToArray(node, result) {
    result.push(node);
    node.childrenNodes.forEach(child => this.flattenTreeToArray(child, result));
}
async exportPDF() {
    this.showNotification('📄 Đang xử lý hình ảnh và tạo PDF...');

    try {
        const svg = this.svg;
        const mainGroup = svg.querySelector('#mainGroup');
        if (!mainGroup) throw new Error("Không tìm thấy dữ liệu cây");

        // 1. Clone node để xử lý mà không ảnh hưởng UI chính
        const clonedGroup = mainGroup.cloneNode(true);
        
        // 2. Xử lý hình ảnh: Chuyển href sang Base64 để hiển thị trong PDF
        const images = clonedGroup.querySelectorAll('image');
        const urlMap = new Map();
        
        // Gom tất cả URL cần tải
        images.forEach(img => {
            const href = img.getAttribute('href');
            if (href) urlMap.set(href, null);
        });

        // Tải song song
        const promises = [];
        for (const url of urlMap.keys()) {
            promises.push(
                this.imageToDataURL(url)
                    .then(base64 => urlMap.set(url, base64))
                    .catch(err => {
                        console.warn(`Không thể tải ảnh ${url}:`, err);
                        // Nếu lỗi thì giữ nguyên hoặc dùng ảnh mặc định
                    })
            );
        }
        await Promise.all(promises);

        // Thay thế href trong clone
        images.forEach(img => {
            const href = img.getAttribute('href');
            const base64 = urlMap.get(href);
            if (base64) {
                img.setAttribute('href', base64);
            } else {
                // Nếu không tải được ảnh, xóa href để tránh lỗi
                img.setAttribute('href', '');
            }
        });

        // 3. Lấy kích thước sơ đồ
        const vbAttr = svg.getAttribute('viewBox');
        let w = 1200, h = 800;
        if (vbAttr) {
            const parts = vbAttr.split(' ').map(Number);
            w = parts[2] || 1200;
            h = parts[3] || 800;
        }

        // 4. Serialize SVG
        const serializer = new XMLSerializer();
        let content = serializer.serializeToString(clonedGroup);
        
        // Bọc vào một thẻ SVG hoàn chỉnh
        const cleanSvgStr = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
                <rect width="100%" height="100%" fill="white"/>
                ${content}
            </svg>
        `.trim();

        // 5. Chuyển đổi sang Base64
        const base64Svg = window.btoa(unescape(encodeURIComponent(cleanSvgStr)));
        const dataUrl = 'data:image/svg+xml;base64,' + base64Svg;

        // 6. Vẽ lên Canvas
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        const imgEl = new Image();
        await new Promise((resolve, reject) => {
            imgEl.onload = resolve;
            imgEl.onerror = () => reject(new Error("Lỗi render sơ đồ"));
            imgEl.src = dataUrl;
        });

        ctx.drawImage(imgEl, 0, 0);

        // 7. Xuất PDF bằng jsPDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: w > h ? 'l' : 'p',
            unit: 'px',
            format: [w, h]
        });

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 0, 0, w, h);
        pdf.save(`gia-pha-${Date.now()}.pdf`);

        this.showNotification('✅ Xuất PDF thành công!');
    } catch (error) {
        console.error('Lỗi xuất PDF:', error);
        this.showNotification('❌ Lỗi: ' + error.message, true);
    }
}

    showNotification(message, isError = false) {
        let box = document.getElementById('treeNotify');

        if (!box) {
            box = document.createElement('div');
            box.id = 'treeNotify';
            box.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: ${isError ? '#dc2626' : '#111827'};
                color: white;
                padding: 10px 16px;
                border-radius: 8px;
                font-size: 14px;
                z-index: 9999;
                box-shadow: 0 8px 20px rgba(0,0,0,0.3);
            `;
            document.body.appendChild(box);
        }

        box.textContent = message;
        box.style.display = 'block';

        clearTimeout(box._timer);
        box._timer = setTimeout(() => {
            box.style.display = 'none';
        }, 3000);
    }
}

window.FamilyTreeRenderer = FamilyTreeRenderer;
