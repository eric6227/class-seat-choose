/* ==================== XSS Protection ==================== */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

var _cspNonce = null;
function getCspNonce() {
    if (_cspNonce) return _cspNonce;
    var meta = document.querySelector('meta[name="csp-nonce"]');
    _cspNonce = meta ? meta.content : '';
    return _cspNonce;
}

function createStyleElement(cssText) {
    var style = document.createElement('style');
    var nonce = getCspNonce();
    if (nonce) style.setAttribute('nonce', nonce);
    style.textContent = cssText;
    return style;
}
function safeSetText(el, text) { if (el) el.textContent = text; }
function safeSetDisplay(id, value) {
    var el = document.getElementById(id);
    if (el) el.style.display = value;
}
function getPageName() {
    var html = document.documentElement;
    return html.getAttribute('data-page') || '';
}

function showLoading(msg) {
    var existing = document.getElementById('loadingOverlay');
    if (existing) return;
    var text = msg || '加载中...';
    var overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.innerHTML =
        '<div class="loading-panel">' +
        '<div class="loading-spinner">' +
        '<div class="loading-dot"></div><div class="loading-dot"></div>' +
        '<div class="loading-dot"></div><div class="loading-dot"></div>' +
        '<div class="loading-dot"></div><div class="loading-dot"></div>' +
        '<div class="loading-dot"></div><div class="loading-dot"></div>' +
        '</div>' +
        '<div class="loading-text">' + text + '</div>' +
        '</div>';
    document.body.appendChild(overlay);
}

function hideLoading() {
    var overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.remove();
}

/* ==================== Toast ==================== */
function showToast(msg, type) {
    type = type || '';
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2500);
}

/* ==================== State ==================== */
const State = {
    role: null,
    studentName: null,
    students: [],
    seats: [],
    currentIndex: 0,
    sortedStudents: [],
    globalShowNames: false,
    companionQuota: 0,
    genderDisplay: false,
    forbiddenRules: [],
    mirrorH: false,
    mirrorV: false,
    studentListCollapsed: false,
    completedCollapsed: false,
    studentWishes: [],
    allWishes: {},
    activeRound: null,
    roundCompleted: false,
    seatDisableMode: false,
    _originalDisabledSeats: null,

    saveSession() {
        API.setSession(this.role, this.studentName);
        var hash = '';
        if (this.role === 'teacher') hash = '#/teacher/';
        else if (this.role === 'student' && this.studentName) hash = '#/student/' + encodeURIComponent(this.studentName) + '/';
        if (hash && window.location.hash !== hash) history.replaceState(null, '', hash);
    },

    isSetup() {
        return this.students.length > 0;
    }
};

/* ==================== Password Modal ==================== */
function showPasswordModal(title, message, onSubmit) {
    removeExistingModals();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'passwordModal';
    overlay.innerHTML =
        '<div class="modal-box">' +
        '<h3>' + escapeHtml(title) + '</h3>' +
        '<p style="color:var(--text-secondary);margin-bottom:16px;font-size:0.9rem;">' + escapeHtml(message) + '</p>' +
        '<input type="password" id="modalPasswordInput" placeholder="请输入教师密码" autofocus>' +
        '<div class="modal-actions">' +
        '<button class="cancel" id="modalCancelBtn">取消</button>' +
        '<button class="confirm" id="modalConfirmBtn">确认</button>' +
        '</div>' +
        '<div id="modalError" class="error-msg"></div>' +
        '</div>';
    document.body.appendChild(overlay);

    var input = document.getElementById('modalPasswordInput');
    var confirmBtn = document.getElementById('modalConfirmBtn');
    var cancelBtn = document.getElementById('modalCancelBtn');
    var errorEl = document.getElementById('modalError');

    var doSubmit = async function () {
        var pwd = input.value;
        if (!pwd) {
            errorEl.textContent = '请输入密码';
            return;
        }
        showLoading();
        try {
            var resp = await API.auth.teacherLogin(pwd);
            var passwordForCallback = pwd;
            confirmBtn.disabled = true;
            pwd = null;
            input.value = '';
            hideLoading();
            removeExistingModals();
            onSubmit(resp.access_token, passwordForCallback);
        } catch (e) {
            hideLoading();
            errorEl.textContent = '密码错误';
        }
    };

    confirmBtn.onclick = doSubmit;
    input.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') doSubmit();
    });
    cancelBtn.onclick = function () { removeExistingModals(); };
    overlay.addEventListener('mousedown', function (e) {
        if (e.target === overlay) removeExistingModals();
    });
    setTimeout(function () { input.focus(); }, 100);
}

function _refreshBodyScroll() {
    var hasModals = document.querySelectorAll('.modal-overlay').length > 0;
    document.body.style.overflow = hasModals ? 'hidden' : '';
}

var _modalObserver = new MutationObserver(function () {
    _refreshBodyScroll();
});
_modalObserver.observe(document.body, { childList: true });

function removeExistingModals() {
    var modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(function (m) { m.remove(); });
}

function showModalOverlay(overlay) {
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
}

function showLayoutConfirmDialog(onConfirm) {
    removeExistingModals();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'layoutConfirmModal';
    overlay.innerHTML =
        '<div class="dialog-box">' +
        '<h3 style="color:var(--danger);margin-bottom:8px;">修改教室布局</h3>' +
        '<p style="margin-bottom:12px;">修改布局后，<strong>所有学生的选座信息将被清空</strong>，选座进度将被重置。此操作不可恢复！</p>' +
        '<div class="upload-actions">' +
        '<button id="layoutCancelBtn">取消</button>' +
        '<button id="layoutConfirmBtn" disabled>确认修改 (3秒)</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    var confirmBtn = document.getElementById('layoutConfirmBtn');
    var countdown = 3;
    var timer = setInterval(function () {
        countdown--;
        if (countdown <= 0) {
            clearInterval(timer);
            confirmBtn.textContent = '确认修改';
            confirmBtn.disabled = false;
        } else {
            confirmBtn.textContent = '确认修改 (' + countdown + '秒)';
        }
    }, 1000);

    document.getElementById('layoutCancelBtn').onclick = function () { clearInterval(timer); overlay.remove(); };

    confirmBtn.onclick = function () {
        clearInterval(timer);
        overlay.remove();
        onConfirm();
    };
}

/* ==================== Pinyin Matching ==================== */
const pinyinFirstLetters = {
    '阿':'a','艾':'a','安':'a','奥':'a','巴':'b','白':'b','班':'b','包':'b','鲍':'b','贝':'b','毕':'b','边':'b','卞':'b',
    '蔡':'c','曹':'c','岑':'c','曾':'c','查':'c','柴':'c','常':'c','陈':'c','成':'c','程':'c','池':'c','迟':'c','仇':'c','楚':'c','褚':'c','崔':'c',
    '戴':'d','单':'d','党':'d','邓':'d','狄':'d','丁':'d','董':'d','杜':'d','段':'d','鄂':'e','恩':'e',
    '范':'f','方':'f','房':'f','费':'f','丰':'f','冯':'f','符':'f','福':'f','傅':'f',
    '甘':'g','高':'g','葛':'g','耿':'g','龚':'g','顾':'g','关':'g','官':'g','桂':'g','郭':'g',
    '海':'h','韩':'h','杭':'h','郝':'h','何':'h','和':'h','贺':'h','赫':'h','侯':'h','胡':'h','花':'h','华':'h','黄':'h','霍':'h',
    '姬':'j','吉':'j','季':'j','纪':'j','贾':'j','简':'j','江':'j','姜':'j','蒋':'j','焦':'j','金':'j','景':'j','居':'j',
    '卡':'k','柯':'k','孔':'k','寇':'k','匡':'k','来':'l','赖':'l','兰':'l','郎':'l','劳':'l','乐':'l','雷':'l','冷':'l','黎':'l','李':'l','厉':'l','利':'l','连':'l','廉':'l','梁':'l','廖':'l','林':'l','凌':'l','刘':'l','柳':'l','龙':'l','娄':'l','卢':'l','鲁':'l','陆':'l','路':'l','吕':'l','罗':'l','骆':'l',
    '马':'m','麦':'m','毛':'m','梅':'m','孟':'m','米':'m','苗':'m','闵':'m','莫':'m','牟':'m','穆':'m','那':'n','倪':'n','聂':'n','宁':'n','牛':'n',
    '欧':'o','欧阳':'o','潘':'p','庞':'p','裴':'p','彭':'p','皮':'p','平':'p','浦':'p',
    '戚':'q','齐':'q','祁':'q','钱':'q','乔':'q','秦':'q','邱':'q','裘':'q','曲':'q','权':'q','全':'q',
    '冉':'r','饶':'r','任':'r','荣':'r','阮':'r','撒':'s','萨':'s','桑':'s','沙':'s','山':'s','商':'s','尚':'s','邵':'s','申':'s','沈':'s','盛':'s','施':'s','石':'s','史':'s','舒':'s','司':'s','宋':'s','苏':'s','孙':'s','索':'s',
    '塔':'t','台':'t','太':'t','谈':'t','汤':'t','唐':'t','陶':'t','滕':'t','田':'t','童':'t',
    '万':'w','汪':'w','王':'w','韦':'w','卫':'w','魏':'w','温':'w','文':'w','翁':'w','沃':'w','乌':'w','邬':'w','吴':'w','伍':'w','武':'w',
    '西':'x','席':'x','夏':'x','项':'x','萧':'x','谢':'x','辛':'x','邢':'x','熊':'x','徐':'x','许':'x','宣':'x','薛':'x',
    '严':'y','颜':'y','阎':'y','晏':'y','阳':'y','杨':'y','姚':'y','叶':'y','伊':'y','易':'y','殷':'y','尹':'y','印':'y','应':'y','尤':'y','于':'y','余':'y','俞':'y','虞':'y','宇':'y','郁':'y','喻':'y','元':'y','袁':'y','岳':'y','云':'y',
    '宰':'z','臧':'z','曾':'z','翟':'z','詹':'z','张':'z','章':'z','赵':'z','甄':'z','郑':'z','钟':'z','仲':'z','周':'z','朱':'z','诸':'z','祝':'z','庄':'z','卓':'z','宗':'z','邹':'z','祖':'z'
};

function getPinyinFirstLetters(name) {
    var result = '';
    for (var i = 0; i < name.length; i++) {
        var char = name[i];
        result += pinyinFirstLetters[char] || char.toLowerCase();
    }
    return result;
}

function matchNames(query, names) {
    if (!query) return [];
    query = query.toLowerCase().trim();
    var results = [];
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var score = 0;
        var nameLower = name.toLowerCase();
        var pinyinFL = getPinyinFirstLetters(name);
        if (nameLower === query) score = 100;
        else if (nameLower.startsWith(query)) score = 80;
        else if (nameLower.includes(query)) score = 60;
        else if (pinyinFL.startsWith(query)) score = 70;
        else if (pinyinFL.includes(query)) score = 50;
        if (score > 0) results.push({ name: name, score: score });
    }
    results.sort(function (a, b) { return b.score - a.score; });
    return results;
}

/* ==================== Load State ==================== */
async function loadState() {
    try {
        var data = await API.seats.getState();
        State.students = data.students || [];
        State.seats = data.seats || [];
        State.currentIndex = data.currentIndex || 0;
        State.sortedStudents = data.students ? [...data.students].sort(function (a, b) { return b.totalScore - a.totalScore; }) : [];
        State.globalShowNames = data.globalShowNames || false;
        State.companionQuota = data.companionQuota || 0;
        State.genderDisplay = data.genderDisplay || false;
        State.forbiddenRules = data.forbiddenRules || [];
        State.mirrorH = data.mirrorH || false;
        State.mirrorV = data.mirrorV || false;
        State.studentListCollapsed = data.studentListCollapsed || false;
        State.completedCollapsed = data.completedCollapsed || false;
        State.groupsCount = data.groupsCount || 4;
        State.rowsPerGroup = data.rowsPerGroup || 7;
        State.colsPerGroup = data.colsPerGroup || 2;
        State.hasPairs = data.hasPairs !== undefined ? data.hasPairs : true;
        return true;
    } catch (e) {
        return false;
    }
}

async function loadStudentWishes() {
    if (State.role !== 'student' || !State.studentName) return;
    try {
        var data = await API.wishes.getMine(State.studentName);
        State.studentWishes = data.wishes || [];
    } catch (e) {
        State.studentWishes = [];
    }
}

async function loadAllWishes() {
    if (State.role !== 'teacher') return;
    try {
        var data = await API.wishes.getAll();
        State.allWishes = {};
        (data.wishes || []).forEach(function (w) {
            if (!State.allWishes[w.studentName]) State.allWishes[w.studentName] = [];
            State.allWishes[w.studentName].push(w);
        });
    } catch (e) {
        State.allWishes = {};
    }
}

async function refreshState() {
    await loadState();
    await loadRoundInfo();
    renderClassroom();
    renderStudentList();
    renderCompletedList();
    updateCurrentStudentDisplay();
    updateRoundUI();
}

/* ==================== Update Display ==================== */
function updateCurrentStudentDisplay() {
    var suffix = State.role === 'student' ? 'Student' : '';
    var nameEl = document.getElementById('currentNameDisplay' + suffix);
    var badgeEl = document.getElementById('currentRankBadgeText' + suffix);
    var badge = document.getElementById('currentRankBadge' + suffix);

    if (State.role === 'student' && State.studentName) {
        var self = State.students.find(function (s) { return s.name === State.studentName; });
        var rank = self ? (State.sortedStudents.indexOf(self) + 1) : '?';
        safeSetText(nameEl, State.studentName);
        if (State.roundCompleted && self && self.seatId) {
            var seat = State.seats.find(function (s) { return s.id === self.seatId; });
            safeSetText(badgeEl, seat ? ('座位: ' + seat.label) : '已分配');
            if (badge) badge.className = 'rank-badge';
        } else if (self && self.totalScore !== undefined) {
            safeSetText(badgeEl, '第 ' + rank + ' 名 · ' + self.totalScore + '分');
            if (badge) badge.className = 'rank-badge';
        } else {
            safeSetText(badgeEl, '等待开始');
            if (badge) badge.className = 'rank-badge';
        }
        return;
    }

    var currentStudent = State.sortedStudents[State.currentIndex];
    if (currentStudent && !currentStudent.assigned) {
        safeSetText(nameEl, currentStudent.name);
        safeSetText(badgeEl, '第 ' + (State.currentIndex + 1) + ' 名 · ' + currentStudent.totalScore + '分');
        if (badge && State.currentIndex < State.companionQuota) {
            badge.className = 'rank-badge vip';
        } else if (badge) {
            badge.className = 'rank-badge';
        }
    } else {
        safeSetText(nameEl, '——');
        safeSetText(badgeEl, '全部完成');
    }
}

function updateHintText() {
    var hintId = State.role === 'student' ? 'simpleHintStudent' : 'simpleHint';
    var hintEl = document.getElementById(hintId);
    if (!hintEl) return;
    if (State.role === 'student' && State.roundCompleted) {
        hintEl.innerHTML = '<span class="icon"></span><span>本轮选座已完成，下方显示所有同学的座位分布，<strong style="color:var(--success);">绿色高亮</strong>为你的座位</span>';
    } else if (State.role === 'student') {
        hintEl.innerHTML = '<span class="icon"></span><span>点击空座位添加志愿，志愿会自动保存 | 最多10个</span>';
    } else {
        var text = State.companionQuota > 0 ? '前' + State.companionQuota + '名可看到已选座位同学名字' : '显示同桌未开启';
        hintEl.innerHTML = '<span class="icon"></span><span>点击座位选座</span>';
    }
}

function findAdjacentSeatLocal(seat) {
    if (seat.type !== 'group' || seat.row == null || seat.col == null || seat.groupIdx == null) return null;
    var candidates = State.seats.filter(function (s) {
        return s.type === 'group'
            && s.groupIdx === seat.groupIdx
            && s.row === seat.row
            && (s.col === seat.col - 1 || s.col === seat.col + 1)
            && !s.isOccupied
            && !s.isDisabled;
    });
    return candidates[0] || null;
}

function ensureAuth(title, message, isHighRisk, action) {
    if (isHighRisk) {
        showPasswordModal(title, message, function (token, password) {
            action(password);
        });
        return;
    }
    if (State.role === 'teacher') {
        action();
        return;
    }
    showPasswordModal(title, message, function () { action(); });
}

/* ==================== Export/Import Helpers ==================== */
var pendingDropFile = null;

function showFileUploadModal(kind, formats, onConfirm) {
    removeExistingModals();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'uploadModal';
    overlay.innerHTML =
        '<div class="dialog-box">' +
        '<div class="upload-header"><h3>上传文件</h3><button class="close-btn" id="uploadCloseBtn">&times;</button></div>' +
        '<div class="upload-dropzone" id="uploadDropzone">' +
        '<div class="upload-icon">📁</div>' +
        '<div class="upload-text">拖放或点击上传</div>' +
        '<input type="file" id="uploadFileInput" style="display:none;">' +
        '</div>' +
        '<div class="upload-formats" style="margin-top:8px;font-size:0.8rem;color:var(--text-muted);text-align:center;">' + escapeHtml(formats) + '</div>' +
        '<div class="upload-actions">' +
        '<button id="uploadCancelBtn">取消</button>' +
        '<button id="uploadConfirmBtn" disabled>确认导入</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    var fileInput = document.getElementById('uploadFileInput');
    var dropzone = document.getElementById('uploadDropzone');
    var confirmBtn = document.getElementById('uploadConfirmBtn');
    var selectedFile = pendingDropFile;

    if (selectedFile) {
        confirmBtn.disabled = false;
        pendingDropFile = null;
    }

    document.getElementById('uploadCloseBtn').onclick = function () { overlay.remove(); };
    document.getElementById('uploadCancelBtn').onclick = function () { overlay.remove(); };

    dropzone.onclick = function () { fileInput.click(); };
    dropzone.ondragover = function (e) { e.preventDefault(); dropzone.style.borderColor = 'var(--primary)'; };
    dropzone.ondragleave = function () { dropzone.style.borderColor = ''; };
    dropzone.ondrop = function (e) {
        e.preventDefault();
        dropzone.style.borderColor = '';
        var files = e.dataTransfer.files;
        if (files.length > 0) {
            selectedFile = files[0];
            confirmBtn.disabled = false;
        }
    };
    fileInput.onchange = function () {
        if (fileInput.files.length > 0) {
            selectedFile = fileInput.files[0];
            confirmBtn.disabled = false;
        }
    };

    confirmBtn.onclick = function () {
        if (selectedFile) {
            overlay.remove();
            onConfirm(selectedFile);
        }
    };

    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) overlay.remove(); });
}

async function importEncryptedFile(file) {
    try {
        if (!file.name.toLowerCase().endsWith('.csc123')) {
            showToast('仅支持 .csc123 文件', 'error');
            return;
        }
        var result = await API.seats.importData(file);
        if (result.needsPassword) {
            showPasswordPromptForImport(file, result.message);
            return;
        }
        showToast('导入成功', 'success');
        await refreshState();
    } catch (e) {
        showToast('导入失败: ' + e.message, 'error');
    }
}

function showPasswordPromptForImport(file, msg) {
    removeExistingModals();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
        '<div class="dialog-box" style="max-width:400px;">' +
        '<h3>文件已加密</h3>' +
        '<p style="font-size:0.85rem;color:var(--text-secondary);">' + (msg || '此文件设置了密码保护，请输入密码') + '</p>' +
        '<input type="password" id="importPwdInput" class="form-input" placeholder="请输入导出时设置的密码" autocomplete="off" style="margin:12px 0;width:100%;box-sizing:border-box;">' +
        '<div class="modal-actions">' +
        '<button class="cancel" id="importPwdCancelBtn">取消</button>' +
        '<button class="confirm" id="importPwdConfirmBtn">确认导入</button>' +
        '</div>' +
        '</div>';

    var style = createStyleElement('.form-input { padding: 8px 12px; border: 1px solid var(--border-light); border-radius: var(--radius-sm); font-size: 0.85rem; font-family: inherit; background: var(--bg-primary); color: var(--text-primary); } .form-input:focus { outline: none; border-color: var(--primary); }');
    overlay.appendChild(style);

    document.body.appendChild(overlay);

    var confirmBtn = document.getElementById('importPwdConfirmBtn');
    var cancelBtn = document.getElementById('importPwdCancelBtn');
    var input = document.getElementById('importPwdInput');

    cancelBtn.onclick = function () { overlay.remove(); };
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) overlay.remove(); });

    async function doImport() {
        var pwd = input.value.trim();
        if (!pwd) {
            showToast('请输入密码', 'error');
            return;
        }
        overlay.remove();
        showLoading('导入中...');
        try {
            await API.seats.importData(file, pwd);
            showToast('导入成功', 'success');
            await refreshState();
        } catch (e) {
            showToast('导入失败: ' + e.message, 'error');
        } finally {
            hideLoading();
        }
    }

    confirmBtn.onclick = doImport;
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doImport();
    });
    setTimeout(function () { input.focus(); }, 100);
}

function triggerXlsxUpload() {
    var input = document.getElementById('xlsxFileInput');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'xlsxFileInput';
        input.accept = '.xlsx';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', function () {
            if (input.files && input.files[0]) {
                importXlsxFile(input.files[0]);
                input.value = '';
            }
        });
    }
    input.click();
}

async function importXlsxFile(file) {
    showToast('正在解析 ' + file.name + ' ...', '');
    try {
        var result = await API.teacher.importXlsx(file);
        showToast(result.message, 'success');
        await refreshState();
    } catch (e) {
        showToast('导入失败: ' + e.message, 'error');
    }
}

/* ==================== Logout ==================== */
function showSessionExpiredModal() {
    removeExistingModals();
    State.role = null;
    State.studentName = null;
    document.body.classList.remove('student-mode');
    API._tokenExpiredHandled = false;

    if (getPageName() === 'login') {
        safeSetDisplay('teacherView', 'none');
        safeSetDisplay('studentView', 'none');
        safeSetDisplay('studentManageView', 'none');
        safeSetDisplay('passwordOverlay', 'flex');
        var loginSection = document.getElementById('loginSection');
        if (loginSection) loginSection.classList.remove('hidden');
        var firstTimeSetup = document.getElementById('firstTimeSetup');
        if (firstTimeSetup) firstTimeSetup.classList.add('hidden');
        history.replaceState(null, '', window.location.pathname);
        resetStudentLogin();
    } else {
        window.location.href = 'login.html';
        return;
    }

    showToast('Token 已过期', 'error');
}

async function logout() {
    API._tokenExpiredHandled = true;
    try {
        await API.auth.logout();
    } catch (e) {
        // 忽略登出请求错误，继续本地清理
    }
    API.clearSession();
    State.role = null;
    State.studentName = null;
    State.studentWishes = [];
    document.body.classList.remove('student-mode');

    if (getPageName() === 'login') {
        safeSetDisplay('teacherView', 'none');
        safeSetDisplay('studentView', 'none');
        safeSetDisplay('studentManageView', 'none');
        safeSetDisplay('passwordOverlay', 'flex');
        var loginSection = document.getElementById('loginSection');
        if (loginSection) loginSection.classList.remove('hidden');
        var firstTimeSetup = document.getElementById('firstTimeSetup');
        if (firstTimeSetup) firstTimeSetup.classList.add('hidden');
        history.replaceState(null, '', window.location.pathname);
        resetStudentLogin();
    } else {
        window.location.href = 'login.html';
        return;
    }
}