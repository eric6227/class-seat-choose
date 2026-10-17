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

function removeExistingModals() {
    var modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(function (m) { m.remove(); });
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

/* ==================== Login Actions ==================== */
async function teacherLogin(pwd) {
    try {
        var resp = await API.auth.teacherLogin(pwd);
        pwd = null;
        setTimeout(function () { document.getElementById('teacherPasswordInput').value = ''; }, 0);
        return resp;
    } catch (e) {
        throw e;
    }
}

async function studentLoginAction(name, pwd) {
    try {
        var resp = await API.auth.studentLogin(name, pwd);
        pwd = null;
        setTimeout(function () { document.getElementById('studentPasswordInput').value = ''; }, 0);
        return resp;
    } catch (e) {
        throw e;
    }
}

async function studentRegisterAction(name, pwd, confirmPwd) {
    try {
        var resp = await API.auth.studentRegister(name, pwd, confirmPwd);
        pwd = null;
        confirmPwd = null;
        return resp;
    } catch (e) {
        throw e;
    }
}

/* ==================== Render Classroom ==================== */
function renderClassroom() {
    var containerId = State.role === 'student' ? 'classroomViewStudent' : 'classroomView';
    var container = document.getElementById(containerId);
    if (!container) return;

    var seats = State.seats;
    var html = '';
    var studentGenderMap = {};
    if (State.genderDisplay) {
        State.students.forEach(function (s) {
            studentGenderMap[s.name] = s.gender;
        });
    }

    function getSeatClass(seat) {
        var cls = '';
        if (seat.type === 'platformLeft' || seat.type === 'platformRight') cls = 'side-seat';
        else cls = 'seat';
        var showOccupied = true;
        if (State.role === 'student' && !State.roundCompleted) {
            showOccupied = false;
        }
        if (seat.isOccupied && showOccupied) cls += ' occupied';
        if (seat.isDisabled && !State.seatDisableMode) cls += ' disabled';
        if (seat.isDisabled && State.seatDisableMode) cls += ' edit-disabled';
        if (!seat.isOccupied && !seat.isDisabled && !(State.role === 'student' && State.roundCompleted)) cls += ' available';
        if (State.genderDisplay && seat.isOccupied && showOccupied && seat.occupantName) {
            var gender = studentGenderMap[seat.occupantName];
            if (gender === 'm') cls += ' gender-m';
            if (gender === 'f') cls += ' gender-f';
        }
        if (State.role === 'student' && !State.roundCompleted && State.studentWishes) {
            var isWish = State.studentWishes.some(function (w) { return w.seat_id === seat.id; });
            if (isWish) cls += ' wish-highlight';
        }
        if (State.role === 'student' && State.roundCompleted && State.studentName && seat.occupantName === State.studentName) {
            cls += ' my-seat';
        }
        return cls;
    }

    function getSeatContent(seat) {
        if (seat.isOccupied) {
            if (State.role === 'student' && !State.roundCompleted) {
                return '';
            }
            var showNames = State.globalShowNames ||
                State.role === 'student' ||
                (State.role === 'teacher' && State.currentIndex < State.companionQuota);
            return showNames
                ? escapeHtml(seat.occupantName || '')
                : '👤';
        }
        if (seat.isDisabled) return '🚫';
        return '';
    }

    var platformLeft = seats.filter(function (s) { return s.type === 'platformLeft'; });
    var platformRight = seats.filter(function (s) { return s.type === 'platformRight'; });
    var groupSeats = seats.filter(function (s) { return s.type === 'group'; });

    var groups = {};
    groupSeats.forEach(function (s) {
        var g = s.groupIdx || 0;
        if (!groups[g]) groups[g] = [];
        groups[g].push(s);
    });

    html += '<div class="platform-area">';
    platformRight.forEach(function (s) {
        html += '<div class="' + getSeatClass(s) + '" data-seat-id="' + s.id + '">';
        html += '<span class="seat-label">' + escapeHtml(s.label) + '</span>';
        html += '<span class="seat-name">' + getSeatContent(s) + '</span>';
        html += '</div>';
    });
    html += '<span class="platform-badge">讲台</span>';
    platformLeft.forEach(function (s) {
        html += '<div class="' + getSeatClass(s) + '" data-seat-id="' + s.id + '">';
        html += '<span class="seat-label">' + escapeHtml(s.label) + '</span>';
        html += '<span class="seat-name">' + getSeatContent(s) + '</span>';
        html += '</div>';
    });
    html += '</div>';

    var groupKeys = Object.keys(groups).sort(function (a, b) { return parseInt(b) - parseInt(a); });
    html += '<div class="groups-grid">';
    groupKeys.forEach(function (gKey) {
        var gSeats = groups[gKey];
        var rows = {};
        gSeats.forEach(function (s) {
            var r = s.row || 1;
            if (!rows[r]) rows[r] = [];
            rows[r].push(s);
        });
        html += '<div class="group-card">';
        html += '<div class="group-name">第' + gKey + '大组</div>';
        html += '<div class="seats-list">';
        Object.keys(rows).sort(function (a, b) { return parseInt(a) - parseInt(b); }).forEach(function (rKey) {
            var rowSeats = rows[rKey].sort(function (a, b) { return (a.col || 0) - (b.col || 0); });
            html += '<div class="seat-row' + (State.hasPairs ? ' has-pairs' : '') + '">';
            for (var ci = 0; ci < rowSeats.length; ci++) {
                var s = rowSeats[ci];
                if (State.hasPairs && ci % 2 === 0 && ci > 0) {
                    html += '<div class="pair-gap"></div>';
                }
                html += '<div class="' + getSeatClass(s) + '" data-seat-id="' + s.id + '">';
                html += '<span class="seat-label">' + escapeHtml(s.label) + '</span>';
                html += '<span class="seat-name">' + getSeatContent(s) + '</span>';
                html += '</div>';
                if (State.hasPairs && ci % 2 === 1 && ci < rowSeats.length - 1) {
                    html += '<div class="pair-gap"></div>';
                }
            }
            html += '</div>';
        });
        html += '</div></div>';
    });
    html += '</div>';

    container.innerHTML = html;
    bindSeatEvents();

    if (State.role === 'teacher') {
        var normalActions = document.getElementById('ileActionsNormal');
        var editActions = document.getElementById('ileActionsEdit');
        if (normalActions && editActions) {
            if (State.seatDisableMode) {
                normalActions.classList.add('hidden');
                editActions.classList.remove('hidden');
            } else {
                normalActions.classList.remove('hidden');
                editActions.classList.add('hidden');
            }
        }
        var hint = document.getElementById('simpleHint');
        if (hint) {
            if (State.seatDisableMode) {
                hint.innerHTML = '<span class="icon">🖊️</span><span>编辑模式：点击座位切换可选性（灰色=禁用） | 点击下方按钮保存或取消</span>';
            } else {
                hint.innerHTML = '<span class="icon">💡</span><span>点击座位选座 | 显示同桌未开启 | 拖拽.csc123/.xlsx导入</span>';
            }
        }
    }
}

function bindSeatEvents() {
    var seatEls = document.querySelectorAll('.seat, .side-seat');
    seatEls.forEach(function (el) {
        el.onclick = function (e) {
            var seatId = parseInt(el.getAttribute('data-seat-id'));
            handleSeatClick(seatId, el);
        };
    });
}

/* ==================== Seat Click Handler ==================== */
async function handleSeatClick(seatId, el) {
    if (State.role === 'student') {
        handleStudentSeatClick(seatId);
        return;
    }
    if (State.role === 'teacher') {
        handleTeacherSeatClick(seatId, el);
        return;
    }
}

function handleStudentSeatClick(seatId) {
    if (State.roundCompleted) {
        showToast('当前轮次选座已完成，无法修改志愿', 'error');
        return;
    }
    var seat = State.seats.find(function (s) { return s.id === seatId; });
    if (!seat) return;
    if (seat.isDisabled) return;

    var existingIdx = State.studentWishes.findIndex(function (w) { return w.seat_id === seatId; });
    if (existingIdx >= 0) {
        State.studentWishes.splice(existingIdx, 1);
        for (var i = 0; i < State.studentWishes.length; i++) {
            State.studentWishes[i].priority = i + 1;
        }
    } else {
        if (State.studentWishes.length >= 10) {
            showToast('最多选择10个志愿', 'error');
            return;
        }
        State.studentWishes.push({ seat_id: seatId, priority: State.studentWishes.length + 1 });
    }
    renderClassroom();
    renderWishPanel();
    saveWishesToServer();
}

async function saveWishesToServer() {
    try {
        await API.wishes.save(State.studentWishes);
    } catch (e) {
        showToast('保存志愿失败: ' + e.message, 'error');
    }
}

var _assignLock = false;

function handleTeacherSeatClick(seatId, el) {
    if (_assignLock) return;

    if (State.seatDisableMode) {
        var seat = State.seats.find(function (s) { return s.id === seatId; });
        if (!seat) return;
        seat.isDisabled = !seat.isDisabled;
        renderClassroom();
        return;
    }

    if (!State.activeRound || State.activeRound.status !== 'active') {
        showToast('需开启一轮选座', 'error');
        return;
    }
    var seat = State.seats.find(function (s) { return s.id === seatId; });
    if (!seat) return;

    if (seat.isDisabled) {
        showToast('该座位已禁用', 'error');
        return;
    }
    if (seat.isOccupied) {
        showToast('该座位已被占用', 'error');
        return;
    }

    var currentStudent = State.sortedStudents[State.currentIndex];
    if (!currentStudent || currentStudent.assigned) {
        showToast('当前没有待分配的学生', 'error');
        return;
    }

    assignSeatOptimistic(seatId, currentStudent);
}

function assignSeatOptimistic(seatId, student, companionName) {
    var seat = State.seats.find(function (s) { return s.id === seatId; });
    if (!seat) return;

    _assignLock = true;

    seat.isOccupied = true;
    seat.occupantName = student.name;
    seat.occupantId = student.id;
    student.assigned = true;
    student.seatId = seat.id;

    var companionStudent = null;
    var adjacentSeat = null;
    if (companionName) {
        companionStudent = State.students.find(function (s) { return s.name === companionName && !s.assigned; });
        if (companionStudent) {
            adjacentSeat = findAdjacentSeatLocal(seat);
            if (adjacentSeat) {
                adjacentSeat.isOccupied = true;
                adjacentSeat.occupantName = companionName;
                adjacentSeat.occupantId = companionStudent.id;
                companionStudent.assigned = true;
                companionStudent.seatId = adjacentSeat.id;
            }
        }
    }

    while (State.currentIndex < State.sortedStudents.length && State.sortedStudents[State.currentIndex].assigned) {
        State.currentIndex++;
    }

    renderClassroom();
    renderStudentList();
    renderCompletedList();
    updateCurrentStudentDisplay();
    showLoading('保存中...');

    API.seats.assign(seatId, student.name, companionName || null).then(function () {
        hideLoading();
        _assignLock = false;
        showToast(student.name + ' 已分配座位', 'success');
        loadState().then(function () {
            updateCurrentStudentDisplay();
            loadAllWishes().then(function () {
                triggerAutoAssignAfterManual();
            });
        });
    }).catch(function (e) {
        hideLoading();
        _assignLock = false;
        seat.isOccupied = false;
        seat.occupantName = null;
        seat.occupantId = null;
        student.assigned = false;
        student.seatId = null;
        if (adjacentSeat && companionStudent) {
            adjacentSeat.isOccupied = false;
            adjacentSeat.occupantName = null;
            adjacentSeat.occupantId = null;
            companionStudent.assigned = false;
            companionStudent.seatId = null;
        }
        var idx = State.sortedStudents.indexOf(student);
        if (idx >= 0 && idx < State.currentIndex) {
            State.currentIndex = idx;
        }
        renderClassroom();
        renderStudentList();
        renderCompletedList();
        updateCurrentStudentDisplay();
        showToast('分配失败: ' + e.message, 'error');
    });
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

async function assignSeat(seatId, studentName) {
    try {
        var student = State.sortedStudents.find(function(s) { return s.name === studentName; });
        if (student) {
            assignSeatOptimistic(seatId, student, null);
        } else {
            await API.seats.assign(seatId, studentName, null);
            showToast(studentName + ' 已分配座位', 'success');
            await refreshState();
        }
    } catch (e) {
        showToast('分配失败: ' + e.message, 'error');
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

/* ==================== Render Student List ==================== */
function renderStudentList() {
    var panel = document.getElementById('studentListPanel');
    if (!panel) return;
    if (State.studentListCollapsed) {
        panel.innerHTML = '';
        return;
    }

    var html = '';
    State.sortedStudents.forEach(function (s, i) {
        var cls = 'student-item';
        if (i === State.currentIndex && !s.assigned) cls += ' current';
        if (s.assigned) cls += ' assigned';
        if (State.genderDisplay && s.gender) {
            cls += ' gender-' + s.gender + '-item';
        }
        html += '<div class="' + cls + '">';
        html += '<span class="student-rank">' + (i + 1) + '</span>';
        html += '<span class="student-name">' + escapeHtml(s.name) + '</span>';
        html += '<span class="student-score">' + s.totalScore + '分</span>';
        if (State.genderDisplay && s.gender) {
            html += '<span class="gender-tag">' + (s.gender === 'm' ? '♂' : '♀') + '</span>';
        }
        html += '</div>';
    });
    panel.innerHTML = html;
}

function renderCompletedList() {
    var panel = document.getElementById('completedListPreview');
    if (!panel) return;
    if (State.completedCollapsed) {
        panel.innerHTML = '';
        return;
    }

    var completed = State.students.filter(function (s) { return s.assigned; });
    var html = '';
    completed.forEach(function (s) {
        var seat = State.seats.find(function (seat) { return seat.id === s.seatId; });
        var genderTag = '';
        if (State.genderDisplay && s.gender) {
            genderTag = '<span class="gender-tag">' + (s.gender === 'm' ? '♂' : '♀') + '</span>';
        }
        html += '<div class="completed-item' + (State.genderDisplay && s.gender ? ' gender-' + s.gender + '-item' : '') + '">';
        html += '<span>' + escapeHtml(s.name) + '</span>';
        html += '<span style="color:var(--text-muted);font-size:0.7rem;"> → ' + (seat ? escapeHtml(seat.label) : '?') + '</span>';
        html += genderTag;
        html += '</div>';
    });
    if (completed.length === 0) {
        html = '<div style="text-align:center;color:var(--text-muted);padding:16px;font-size:0.8rem;">暂无</div>';
    }
    panel.innerHTML = html;
}

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

/* ==================== Render Wish Panel (with drag-to-reorder) ==================== */
var wishDragSrcIndex = -1;

function renderWishPanel() {
    var panel = document.getElementById('wishPanelCard');
    var list = document.getElementById('wishList');
    var hint = document.getElementById('wishHint');
    var count = document.getElementById('wishCount');

    if (State.role !== 'student') {
        if (panel) panel.style.display = 'none';
        return;
    }

    if (State.roundCompleted) {
        if (panel) {
            panel.style.display = 'block';
            if (list) list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">选座已完成，座位已固定</div>';
            if (hint) hint.style.display = 'none';
            if (count) count.textContent = '';
        }
        return;
    }

    if (panel) panel.style.display = 'block';

    safeSetText(count, (State.studentWishes.length || 0) + '/10');

    var html = '';
    State.studentWishes.forEach(function (w, i) {
        var seat = State.seats.find(function (s) { return s.id === w.seat_id; });
        var seatLabel = seat ? seat.label : '座位' + w.seat_id;
        html += '<div class="wish-item" draggable="true" data-index="' + i + '" data-seat-id="' + w.seat_id + '">';
        html += '<span class="wish-priority">志愿' + w.priority + '</span>';
        html += '<span class="wish-seat-label">' + seatLabel + '</span>';
        html += '<button class="wish-remove" data-seat-id="' + w.seat_id + '">✕</button>';
        html += '</div>';
    });

    if (html === '') {
        html = '<div class="wish-hint">点击空座位添加志愿 | 最多10个</div>';
    }

    if (list) list.innerHTML = html;
    if (hint) hint.style.display = State.studentWishes.length === 0 ? 'block' : 'none';

    if (list) {
        list.querySelectorAll('.wish-remove').forEach(function (btn) {
            btn.onclick = function (e) {
                e.stopPropagation();
                var seatId = parseInt(btn.getAttribute('data-seat-id'));
                State.studentWishes = State.studentWishes.filter(function (w) { return w.seat_id !== seatId; });
                for (var i = 0; i < State.studentWishes.length; i++) {
                    State.studentWishes[i].priority = i + 1;
                }
                renderClassroom();
                renderWishPanel();
                saveWishesToServer();
            };
        });

        list.querySelectorAll('.wish-item').forEach(function (item) {
            item.addEventListener('dragstart', function (e) {
                wishDragSrcIndex = parseInt(item.getAttribute('data-index'));
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', '');
            });
            item.addEventListener('dragend', function (e) {
                item.classList.remove('dragging');
                list.querySelectorAll('.wish-item').forEach(function (el) {
                    el.classList.remove('drag-over');
                });
            });
            item.addEventListener('dragover', function (e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });
            item.addEventListener('dragenter', function (e) {
                e.preventDefault();
                var idx = parseInt(item.getAttribute('data-index'));
                if (idx !== wishDragSrcIndex) {
                    item.classList.add('drag-over');
                }
            });
            item.addEventListener('dragleave', function (e) {
                item.classList.remove('drag-over');
            });
            item.addEventListener('drop', function (e) {
                e.preventDefault();
                item.classList.remove('drag-over');
                var targetIdx = parseInt(item.getAttribute('data-index'));
                if (wishDragSrcIndex < 0 || targetIdx < 0 || targetIdx === wishDragSrcIndex) return;
                var moved = State.studentWishes.splice(wishDragSrcIndex, 1)[0];
                State.studentWishes.splice(targetIdx, 0, moved);
                for (var i = 0; i < State.studentWishes.length; i++) {
                    State.studentWishes[i].priority = i + 1;
                }
                wishDragSrcIndex = -1;
                renderClassroom();
                renderWishPanel();
                saveWishesToServer();
            });
        });
    }
}

/* ==================== Auto Assign ==================== */
async function autoAssignByWish() {
    if (State.currentIndex >= State.sortedStudents.length) return false;
    var student = State.sortedStudents[State.currentIndex];
    if (!student || student.assigned) return false;

    var wishes = (State.allWishes[student.name] || []).sort(function (a, b) { return a.priority - b.priority; });
    for (var i = 0; i < wishes.length; i++) {
        var seat = State.seats.find(function (s) { return s.id === wishes[i].seat_id; });
        if (seat && !seat.isOccupied && !seat.isDisabled) {
            assignSeatOptimistic(seat.id, student, null);
            return true;
        }
    }
    return false;
}

async function autoAssignByWishAsync() {
    if (State.currentIndex >= State.sortedStudents.length) return false;
    var student = State.sortedStudents[State.currentIndex];
    if (!student || student.assigned) return false;

    var wishes = (State.allWishes[student.name] || []).sort(function (a, b) { return a.priority - b.priority; });
    for (var i = 0; i < wishes.length; i++) {
        var seat = State.seats.find(function (s) { return s.id === wishes[i].seat_id; });
        if (seat && !seat.isOccupied && !seat.isDisabled) {
            try {
                showLoading('自动分配 ' + student.name + ' ...');
                await API.seats.assign(seat.id, student.name, null);
                await refreshState();
                hideLoading();
                return true;
            } catch (e) {
                hideLoading();
                showToast('自动分配失败: ' + e.message, 'error');
                return false;
            }
        }
    }
    return false;
}

async function autoAssignLoop() {
    await loadState();
    await loadRoundInfo();
    await loadAllWishes();

    while (true) {
        if (State.currentIndex >= State.sortedStudents.length) {
            showToast('所有学生已完成选座', 'success');
            return true;
        }

        var currentStudent = State.sortedStudents[State.currentIndex];
        if (!currentStudent || currentStudent.assigned) {
            showToast('所有学生已完成选座', 'success');
            return true;
        }

        var autoAssigned = await autoAssignByWishAsync();
        if (!autoAssigned) {
            renderClassroom();
            renderStudentList();
            renderCompletedList();
            updateCurrentStudentDisplay();
            updateHintText();
            return false;
        }
    }
}

async function triggerAutoAssignAfterManual() {
    if (_assignLock) return;
    if (!State.activeRound || State.activeRound.status !== 'active') return;
    if (State.currentIndex >= State.sortedStudents.length) return;
    var nextStudent = State.sortedStudents[State.currentIndex];
    if (!nextStudent || nextStudent.assigned) return;

    _assignLock = true;
    try {
        await autoAssignLoop();
    } finally {
        _assignLock = false;
    }
}

/* ==================== Upload Modal ==================== */
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

var _ileReady = false;

function showInlineLayoutEditor() {
    var panel = document.getElementById('layoutEditorInline');
    if (!panel) return;
    panel.style.display = 'block';

    var groupsInput = document.getElementById('iGroups');
    var rowsInput = document.getElementById('iRows');
    var colsInput = document.getElementById('iCols');
    var pairsCheck = document.getElementById('iHasPairs');

    var groups = State.groupsCount || 4;
    var rows = State.rowsPerGroup || 7;
    var cols = State.colsPerGroup || 2;
    var hasPairs = State.hasPairs !== undefined ? State.hasPairs : true;

    groupsInput.value = groups;
    rowsInput.value = rows;
    colsInput.value = cols;
    pairsCheck.checked = hasPairs;

    function doUpdatePreview() {
        var g = parseInt(groupsInput.value) || 1;
        var r = parseInt(rowsInput.value) || 1;
        var c = parseInt(colsInput.value) || 2;
        var total = g * r * c + 2;
        document.getElementById('iPreviewTotal').textContent = total;
        document.getElementById('iPairsLabel').textContent = pairsCheck.checked ? '两列合并为同桌' : '所有列独立分开';

        var hint = document.getElementById('iPreviewHint');
        var studentCount = (State.students || []).length;
        var saveBtn = document.getElementById('iSaveBtn');
        if (studentCount > 0 && g * r * c < studentCount) {
            hint.textContent = '座位总数(' + (g * r * c) + ')少于已导入学生(' + studentCount + ')，无法保存';
            hint.style.color = 'var(--danger)';
            if (saveBtn) saveBtn.disabled = true;
        } else {
            hint.textContent = studentCount > 0 ? '座位总数满足当前' + studentCount + '名学生' : '';
            hint.style.color = 'var(--success)';
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    doUpdatePreview();

    if (!_ileReady) {
        _ileReady = true;

        var ids = ['iGroups', 'iRows', 'iCols'];
        ids.forEach(function (id) {
            var plus = document.getElementById(id + 'Plus');
            var minus = document.getElementById(id + 'Minus');
            var input = document.getElementById(id);
            if (plus) {
                plus.onclick = function () {
                    var max = parseInt(input.max) || 99;
                    var val = parseInt(input.value) || 1;
                    if (val < max) { input.value = val + 1; doUpdatePreview(); }
                };
            }
            if (minus) {
                minus.onclick = function () {
                    var min = parseInt(input.min) || 1;
                    var val = parseInt(input.value) || 1;
                    if (val > min) { input.value = val - 1; doUpdatePreview(); }
                };
            }
            if (input) {
                input.addEventListener('input', doUpdatePreview);
            }
        });

        pairsCheck.onchange = doUpdatePreview;

        var saveBtn = document.getElementById('iSaveBtn');
        if (saveBtn) {
            saveBtn.onclick = function () {
                var g = parseInt(groupsInput.value) || 4;
                var r = parseInt(rowsInput.value) || 7;
                var c = parseInt(colsInput.value) || 2;
                var hp = pairsCheck.checked;

                var doSave = async function () {
                    try {
                        saveBtn.disabled = true;
                        saveBtn.textContent = '保存中...';
                        await API.teacher.updateLayout({
                            groups_count: g,
                            rows_per_group: r,
                            cols_per_group: c,
                            has_pairs: hp
                        });
                        showToast('布局已更新，选座数据已重置', 'success');
                        await refreshState();
                        renderClassroom();
                    } catch (e) {
                        showToast(e.message, 'error');
                    } finally {
                        saveBtn.disabled = false;
                        saveBtn.textContent = '保存布局';
                    }
                };

                var hasAssigned = (State.students || []).some(function (s) { return s.assigned; });
                if (hasAssigned) {
                    showLayoutConfirmDialog(doSave);
                } else {
                    doSave();
                }
            };
        }

        var toggle = document.getElementById('ileToggle');
        if (toggle) {
            toggle.onclick = function () {
                toggle.classList.toggle('collapsed');
            };
        }

        var disableBtn = document.getElementById('iDisableBtn');
        if (disableBtn) {
            disableBtn.onclick = function () { enterSeatDisableMode(); };
        }

        var disableSaveBtn = document.getElementById('iDisableSaveBtn');
        if (disableSaveBtn) {
            disableSaveBtn.onclick = function () { saveSeatDisable(); };
        }

        var disableCancelBtn = document.getElementById('iDisableCancelBtn');
        if (disableCancelBtn) {
            disableCancelBtn.onclick = function () { cancelSeatDisable(); };
        }
    } else {
        doUpdatePreview();
    }
}

var wizardState = { step: 1 };

function showSetupWizard(pwd) {
    wizardState.step = pwd ? 2 : 1;
    if (pwd) wizardState.wizardPwd = pwd;
    document.getElementById('setupWizardOverlay').style.display = 'flex';
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('firstTimeSetup').style.display = 'none';
    renderWizardStep();
}

function renderWizardStep() {
    var content = document.getElementById('wizardStepContent');
    var prevBtn = document.getElementById('wizardPrevBtn');
    var nextBtn = document.getElementById('wizardNextBtn');
    var errorEl = document.getElementById('wizardError');
    errorEl.textContent = '';

    document.querySelectorAll('.wizard-step').forEach(function (el) {
        var step = parseInt(el.getAttribute('data-step'));
        el.classList.remove('active', 'done');
        if (step === wizardState.step) el.classList.add('active');
        else if (step < wizardState.step) el.classList.add('done');
    });

    if (wizardState.step === 1) {
        content.innerHTML = '<h4>设置教师密码</h4>' +
            '<p>请设置一个安全的教师密码，用于后续登录教师身份。</p>' +
            '<input type="text" id="wizardSetupToken" placeholder="初始化令牌（由管理员提供）" autocomplete="off">' +
            '<input type="password" id="wizardPwd" placeholder="教师密码（至少8位，包含字母和数字）" autocomplete="new-password">' +
            '<input type="password" id="wizardPwdConfirm" placeholder="确认教师密码" autocomplete="new-password">';
        prevBtn.style.display = 'none';
        nextBtn.textContent = '下一步 →';

        setTimeout(function () {
            document.getElementById('wizardPwd').addEventListener('keypress', function (e) {
                if (e.key === 'Enter') document.getElementById('wizardPwdConfirm').focus();
            });
            document.getElementById('wizardPwdConfirm').addEventListener('keypress', function (e) {
                if (e.key === 'Enter') wizardNext();
            });
        }, 100);
    } else if (wizardState.step === 2) {
        var g = State.groupsCount || 4;
        var r = State.rowsPerGroup || 7;
        var c = State.colsPerGroup || 2;
        var hp = State.hasPairs !== undefined ? State.hasPairs : true;
        var total = g * r * c + 2;
        content.innerHTML = '<h4>配置教室布局</h4>' +
            '<p>调整座位布局。' + (State.students.length > 0 ? '当前已有<strong>' + State.students.length + '</strong>名学生，座位总数须不少于学生人数。' : '尚未导入学生，座位数无限制。') + '</p>' +
            '<div class="layout-form">' +
            '<div class="form-row"><label>大组数</label><div class="stepper">' +
            '<button id="wGroupsMinus">-</button><input type="number" id="wGroups" value="' + g + '" min="1" max="10">' +
            '<button id="wGroupsPlus">+</button></div></div>' +

            '<div class="form-row"><label>每大组列数</label><div class="stepper">' +
            '<button id="wColsMinus">-</button><input type="number" id="wCols" value="' + c + '" min="1" max="4">' +
            '<button id="wColsPlus">+</button></div></div>' +
            
            '<div class="form-row"><label>总排数</label><div class="stepper">' +
            '<button id="wRowsMinus">-</button><input type="number" id="wRows" value="' + r + '" min="1" max="9">' +
            '<button id="wRowsPlus">+</button></div></div>' +

            '<div class="form-row"><label>同桌配对</label><label class="toggle-switch">' +
            '<input type="checkbox" id="wHasPairs"' + (hp ? ' checked' : '') + '><span class="toggle-slider"></span>' +
            '<span class="toggle-label" id="wPairsLabel">' + (hp ? '两列合并为同桌' : '所有列独立分开') + '</span></label></div>' +
            '<div class="layout-preview"><div class="preview-label">预览：<span id="wPreviewTotal">' + total + '</span> 个座位 (含2个讲台位)</div>' +
            '<div class="preview-hint" id="wPreviewHint"></div></div></div>';
        prevBtn.style.display = 'inline-block';
        nextBtn.textContent = '下一步 →';

        setTimeout(bindWizardLayoutEvents, 100);
    } else if (wizardState.step === 3) {
        content.innerHTML = '<h4>导入学生名单</h4>' +
            '<p>请上传包含学生数据的 Excel (.xlsx) 文件，或跳过此步骤稍后导入。</p>' +
            '<div class="wizard-import-area">' +
            '<button class="primary large" id="wizardImportBtn">选择 Excel 文件 (.xlsx)</button>' +
            '<p class="muted" id="wizardImportResult"></p>' +
            '</div>' +
            '<p class="muted" style="margin-top:12px;">支持的表头：姓名/名字、总分/成绩、排名/名次、学号/编号、性别/gender</p>';
        prevBtn.style.display = 'inline-block';
        nextBtn.textContent = '完成';

        document.getElementById('wizardImportBtn').onclick = function () {
            triggerWizardXlsxUpload();
        };
    }
}

function bindWizardLayoutEvents() {
    function wUpdatePreview() {
        var g = parseInt(document.getElementById('wGroups').value) || 1;
        var r = parseInt(document.getElementById('wRows').value) || 1;
        var c = parseInt(document.getElementById('wCols').value) || 2;
        var total = g * r * c + 2;
        document.getElementById('wPreviewTotal').textContent = total;
        document.getElementById('wPairsLabel').textContent = document.getElementById('wHasPairs').checked ? '两列合并为同桌' : '所有列独立分开';

        var hint = document.getElementById('wPreviewHint');
        var studentCount = State.students.length;
        if (studentCount > 0 && g * r * c < studentCount) {
            hint.textContent = '座位总数不足，无法继续';
            hint.style.color = 'var(--danger)';
        } else {
            hint.textContent = studentCount > 0 ? '满足当前' + studentCount + '名学生' : '';
            hint.style.color = 'var(--success)';
        }
    }

    ['wGroups', 'wRows', 'wCols'].forEach(function (id) {
        var plus = document.getElementById(id + 'Plus');
        var minus = document.getElementById(id + 'Minus');
        var input = document.getElementById(id);
        plus.onclick = function () { var m = parseInt(input.max)||99; var v = parseInt(input.value)||1; if(v<m){input.value=v+1;wUpdatePreview();} };
        minus.onclick = function () { var m = parseInt(input.min)||1; var v = parseInt(input.value)||1; if(v>m){input.value=v-1;wUpdatePreview();} };
        input.addEventListener('input', wUpdatePreview);
        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') wizardNext();
        });
    });
    document.getElementById('wHasPairs').onchange = wUpdatePreview;
    wUpdatePreview();
}

function triggerWizardXlsxUpload() {
    var input = document.getElementById('wizardXlsxInput');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'wizardXlsxInput';
        input.accept = '.xlsx';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', async function () {
            if (input.files && input.files[0]) {
                document.getElementById('wizardImportResult').textContent = '正在导入 ' + input.files[0].name + ' ...';
                try {
                    var result = await API.teacher.importXlsx(input.files[0]);
                    document.getElementById('wizardImportResult').textContent = '✅ ' + result.message;
                    document.getElementById('wizardImportResult').style.color = 'var(--success)';
                    await refreshState();
                } catch (e) {
                    document.getElementById('wizardImportResult').textContent = '❌ ' + e.message;
                    document.getElementById('wizardImportResult').style.color = 'var(--danger)';
                }
                input.value = '';
            }
        });
    }
    input.click();
}

async function wizardNext() {
    var errorEl = document.getElementById('wizardError');
    errorEl.textContent = '';

    if (wizardState.step === 1) {
        var pwd = document.getElementById('wizardPwd') ? document.getElementById('wizardPwd').value : '';
        var confirm = document.getElementById('wizardPwdConfirm') ? document.getElementById('wizardPwdConfirm').value : '';
        var setupToken = document.getElementById('wizardSetupToken') ? document.getElementById('wizardSetupToken').value : '';
        if (!pwd || pwd.length < 8) { errorEl.textContent = '密码至少8位'; return; }
        if (!/[a-zA-Z]/.test(pwd) || !/\d/.test(pwd)) { errorEl.textContent = '密码必须包含字母和数字'; return; }
        if (pwd !== confirm) { errorEl.textContent = '两次密码不一致'; return; }
        if (!setupToken) { errorEl.textContent = '请输入初始化令牌'; return; }
        try {
            await API.auth.setupTeacher(pwd, setupToken);
            wizardState.wizardPwd = pwd;
        } catch (e) {
            errorEl.textContent = e.message;
            return;
        }
        wizardState.step = 2;
        renderWizardStep();
        return;
    }

    if (wizardState.step === 2) {
        var pwd2 = wizardState.wizardPwd;
        var g = parseInt(document.getElementById('wGroups').value) || 4;
        var r = parseInt(document.getElementById('wRows').value) || 7;
        var c = parseInt(document.getElementById('wCols').value) || 2;
        var hp = document.getElementById('wHasPairs').checked;

        if (g < 1 || r < 1 || c < 2) { errorEl.textContent = '组数行数至少为1，列数至少为2'; return; }

        var studentCount = State.students.length;
        if (studentCount > 0 && g * r * c < studentCount) {
            errorEl.textContent = '座位总数不能少于已导入学生人数(' + studentCount + ')';
            return;
        }

        try {
            var loginResp = await API.auth.teacherLogin(pwd2);
            await API.teacher.updateLayout({ groups_count: g, rows_per_group: r, cols_per_group: c, has_pairs: hp });
        } catch (e) {
            errorEl.textContent = '布局保存失败: ' + e.message;
            return;
        }

        wizardState.step = 3;
        renderWizardStep();
        return;
    }

    if (wizardState.step === 3) {
        document.getElementById('setupWizardOverlay').style.display = 'none';
        var pwd = wizardState.wizardPwd || '';
        try {
            if (pwd) {
                var resp = await API.auth.teacherLogin(pwd);
                State.role = 'teacher';
                State.saveSession();
                enterTeacherMode();
            } else {
                document.getElementById('loginSection').style.display = 'block';
                showToast('配置完成！请使用教师密码登录', 'success');
            }
        } catch (e) {
            document.getElementById('loginSection').style.display = 'block';
            showToast('配置完成！请使用教师密码登录', 'success');
        }
        return;
    }
}

async function exportXlsx() {
    try {
        var resp = await API.download('/seats/export-xlsx');
        var blob = await resp.blob();
        var disposition = resp.headers.get('Content-Disposition') || '';
        var filename = '座位表.xlsx';
        var match = disposition.match(/filename\*?=(?:UTF-8'')?(.+)/);
        if (match) filename = decodeURIComponent(match[1]);

        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('座位表导出成功', 'success');
    } catch (e) {
        showToast('导出失败: ' + e.message, 'error');
    }
}

/* ==================== Round Management ==================== */

async function loadRoundInfo() {
    try {
        var res = await API.rounds.current();
        State.activeRound = res.round;
        State.roundCompleted = !(res.round && res.round.status === 'active');
    } catch (e) {
        State.activeRound = null;
        State.roundCompleted = true;
    }
}

function updateRoundUI() {
    var completeBtn = document.getElementById('completeBtn');
    var startBtn = document.getElementById('startRoundBtn');
    var nextBtn = document.getElementById('nextStudentBtn');
    var studentRoundInfo = document.getElementById('studentRoundInfo');
    var selectionMethodDisplay = document.getElementById('selectionMethodDisplay');

    if (State.activeRound && State.activeRound.status === 'active') {
        if (completeBtn) completeBtn.style.display = 'inline-block';
        if (startBtn) startBtn.style.display = 'none';
        if (nextBtn) nextBtn.disabled = false;
    } else if (State.activeRound && State.activeRound.status === 'completed') {
        if (completeBtn) completeBtn.style.display = 'none';
        if (startBtn) startBtn.style.display = 'inline-block';
        if (nextBtn) nextBtn.disabled = true;
    } else {
        if (completeBtn) completeBtn.style.display = 'none';
        if (startBtn) startBtn.style.display = 'inline-block';
        if (nextBtn) nextBtn.disabled = true;
    }

    if (studentRoundInfo && State.activeRound) {
        var r = State.activeRound;
        var parts = [];
        if (r.name) parts.push('<strong>' + r.name + '</strong>');
        parts.push('状态: ' + (r.status === 'active' ? '进行中' : '已完成'));
        if (r.noWishLockDate) parts.push('无志愿选座: ' + r.noWishLockDate);
        if (r.classChangeDate) parts.push('全班换座: ' + r.classChangeDate);
        studentRoundInfo.innerHTML = parts.join('<br>');
        studentRoundInfo.style.display = '';
    } else if (studentRoundInfo) {
        studentRoundInfo.innerHTML = '';
        studentRoundInfo.style.display = 'none';
    }

    if (selectionMethodDisplay) {
        var currentStudent = State.students.find(function(s) { return s.name === State.studentName; });
        if (currentStudent && currentStudent.selectionMethod && State.roundCompleted) {
            selectionMethodDisplay.textContent = '选座方式：' + currentStudent.selectionMethod;
            selectionMethodDisplay.style.display = '';
        } else {
            selectionMethodDisplay.style.display = 'none';
        }
    }
}

function showStartRoundModal() {
    showNewRoundView();
}

function showNewRoundView() {
    removeExistingModals();

    var g = State.groupsCount || 4;
    var r = State.rowsPerGroup || 7;
    var c = State.colsPerGroup || 2;
    var hp = State.hasPairs !== undefined ? State.hasPairs : true;
    var total = g * r * c + 2;

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay new-round-overlay';
    overlay.id = 'newRoundOverlay';
    overlay.innerHTML =
        '<div class="new-round-container">' +
        '<div class="new-round-header">' +
        '<h2>开始新一轮选座</h2>' +
        '<button class="new-round-close" id="newRoundCloseBtn">✕</button>' +
        '</div>' +
        '<div class="new-round-body">' +
        '<div class="new-round-left">' +
        '<h3>教室布局预览</h3>' +
        '<p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px;">点击座位可切换禁用/启用状态（灰色为禁用）</p>' +
        '<div class="new-round-classroom" id="newRoundClassroom"></div>' +
        '</div>' +
        '<div class="new-round-right">' +
        '<div class="new-round-section">' +
        '<h4>布局设置</h4>' +
        '<div class="layout-form">' +
        '<div class="form-row"><label>大组数</label><div class="stepper">' +
        '<button id="nrGroupsMinus">−</button><input type="number" id="nrGroups" value="' + g + '" min="1" max="10">' +
        '<button id="nrGroupsPlus">+</button></div></div>' +
        '<div class="form-row"><label>每大组列数</label><div class="stepper">' +
        '<button id="nrColsMinus">−</button><input type="number" id="nrCols" value="' + c + '" min="2" max="9">' +
        '<button id="nrColsPlus">+</button></div></div>' +
        '<div class="form-row"><label>总排数</label><div class="stepper">' +
        '<button id="nrRowsMinus">−</button><input type="number" id="nrRows" value="' + r + '" min="1" max="9">' +
        '<button id="nrRowsPlus">+</button></div></div>' +
        '<div class="form-row"><label>同桌配对</label><label class="toggle-switch">' +
        '<input type="checkbox" id="nrHasPairs"' + (hp ? ' checked' : '') + '><span class="toggle-slider"></span>' +
        '<span class="toggle-label" id="nrPairsLabel">' + (hp ? '两列合并为同桌' : '所有列独立分开') + '</span></label></div>' +
        '<div class="layout-preview"><div class="preview-label">预览：<span id="nrPreviewTotal">' + total + '</span> 个座位 (含2个讲台位)</div>' +
        '<div class="preview-hint" id="nrPreviewHint"></div></div>' +
        '</div></div>' +
        '<div class="new-round-section">' +
        '<h4>轮次设置</h4>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<label style="font-size:0.85rem;">轮次名称（可选）</label>' +
        '<input type="text" id="nrRoundName" placeholder="例如：第3轮选座" style="padding:8px;border:1px solid var(--border-light);border-radius:var(--radius-sm);">' +
        '<label style="font-size:0.85rem;">无志愿锁定选座日期（可选）</label>' +
        '<input type="text" id="nrNoWishLockDate" placeholder="例如：11月1日" style="padding:8px;border:1px solid var(--border-light);border-radius:var(--radius-sm);">' +
        '<label style="font-size:0.85rem;">全班换座位日期（可选）</label>' +
        '<input type="text" id="nrClassChangeDate" placeholder="例如：11月3日" style="padding:8px;border:1px solid var(--border-light);border-radius:var(--radius-sm);">' +
        '</div></div>' +
        '<div class="new-round-actions">' +
        '<button class="cancel" id="newRoundCancelBtn">取消</button>' +
        '<button class="confirm primary" id="newRoundStartBtn">开始新一轮</button>' +
        '</div></div></div></div>';

    var style = createStyleElement(
        '.new-round-overlay { z-index: 3000; }' +
        '.new-round-container { background: var(--bg-primary); width: 95vw; height: 92vh; border-radius: var(--radius-lg); display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--shadow-lg); }' +
        '.new-round-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: var(--bg-card); border-bottom: 1px solid var(--border-light); }' +
        '.new-round-header h2 { margin: 0; font-size: 1.2rem; }' +
        '.new-round-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary); padding: 4px 8px; border-radius: var(--radius-sm); }' +
        '.new-round-close:hover { background: var(--bg-secondary); }' +
        '.new-round-body { flex: 1; display: flex; overflow: hidden; }' +
        '.new-round-left { flex: 1; padding: 16px; overflow-y: auto; border-right: 1px solid var(--border-light); }' +
        '.new-round-right { width: 360px; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; background: var(--bg-card); }' +
        '.new-round-section { background: var(--bg-primary); border-radius: var(--radius); padding: 12px; }' +
        '.new-round-section h4 { margin: 0 0 8px 0; font-size: 0.9rem; }' +
        '.new-round-classroom { min-height: 300px; }' +
        '.new-round-actions { display: flex; gap: 8px; justify-content: flex-end; padding-top: 12px; }' +
        '.new-round-actions button { padding: 10px 24px; border-radius: var(--radius-sm); font-size: 0.9rem; cursor: pointer; border: none; font-family: inherit; }' +
        '.new-round-actions .cancel { background: var(--bg-secondary); color: var(--text-primary); }' +
        '.new-round-actions .confirm { background: var(--primary); color: white; }' +
        '.new-round-actions .confirm:hover { background: var(--primary-dark); }' +
        '.new-round-classroom .seat.disabled { background: #d9d9d9; cursor: pointer; pointer-events: auto !important; }' +
        '.new-round-classroom .side-seat.disabled { background: #d9d9d9; cursor: pointer; pointer-events: auto !important; }' 
    );
    overlay.appendChild(style);

    document.body.appendChild(overlay);

    var disabledSeats = new Set();
    State.seats.forEach(function (s) { if (s.isDisabled) disabledSeats.add(s.id); });
    var originalDisabledSeats = new Set(disabledSeats);

    var layoutParams = { groups: g, rows: r, cols: c, pairs: hp };
    var dirtyLayout = false;
    var origGroups = g, origRows = r, origCols = c, origPairs = hp;

    function renderPreviewClassroom() {
        var container = document.getElementById('newRoundClassroom');
        if (!container) return;

        var seats = buildPreviewSeats(layoutParams.groups, layoutParams.rows, layoutParams.cols);

        var rightDisabled = disabledSeats.has(2);
        var leftDisabled = disabledSeats.has(1);

        var html = '<div class="platform-area">';
        html += '<div class="side-seat' + (rightDisabled ? ' disabled' : '') + '" data-seat-id="2" style="cursor:pointer;">';
        html += '<span class="seat-label">讲台右</span>';
        html += '<span class="seat-name">' + (rightDisabled ? '🚫' : '') + '</span>';
        html += '</div>';
        html += '<span class="platform-badge">讲台</span>';
        html += '<div class="side-seat' + (leftDisabled ? ' disabled' : '') + '" data-seat-id="1" style="cursor:pointer;">';
        html += '<span class="seat-label">讲台左</span>';
        html += '<span class="seat-name">' + (leftDisabled ? '🚫' : '') + '</span>';
        html += '</div>';
        html += '</div>';

        var groups = {};
        seats.forEach(function (s) {
            if (!groups[s.groupIdx]) groups[s.groupIdx] = [];
            groups[s.groupIdx].push(s);
        });

        var groupKeys = Object.keys(groups).sort(function (a, b) { return parseInt(b) - parseInt(a); });
        html += '<div class="groups-grid">';
        groupKeys.forEach(function (gKey) {
            var gSeats = groups[gKey];
            var rows = {};
            gSeats.forEach(function (s) {
                if (!rows[s.row]) rows[s.row] = [];
                rows[s.row].push(s);
            });
            html += '<div class="group-card"><div class="group-name">第' + gKey + '大组</div><div class="seats-list">';
            Object.keys(rows).sort(function (a, b) { return parseInt(a) - parseInt(b); }).forEach(function (rKey) {
                var rowSeats = rows[rKey].sort(function (a, b) { return a.col - b.col; });
                html += '<div class="seat-row' + (layoutParams.pairs ? ' has-pairs' : '') + '">';
                for (var ci = 0; ci < rowSeats.length; ci++) {
                    var s = rowSeats[ci];
                    if (layoutParams.pairs && ci % 2 === 0 && ci > 0) {
                        html += '<div class="pair-gap"></div>';
                    }
                    var isD = disabledSeats.has(s.id);
                    html += '<div class="seat' + (isD ? ' disabled' : '') + '" data-seat-id="' + s.id + '" style="cursor:pointer;">';
                    html += '<span class="seat-label">' + escapeHtml(s.label) + '</span>';
                    html += '<span class="seat-name">' + (isD ? '🚫' : '') + '</span>';
                    html += '</div>';
                    if (layoutParams.pairs && ci % 2 === 1 && ci < rowSeats.length - 1) {
                        html += '<div class="pair-gap"></div>';
                    }
                }
                html += '</div>';
            });
            html += '</div></div>';
        });
        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.seat').forEach(function (el) {
            el.onclick = function () {
                var sid = parseInt(el.getAttribute('data-seat-id'));
                if (disabledSeats.has(sid)) {
                    disabledSeats.delete(sid);
                } else {
                    disabledSeats.add(sid);
                }
                renderPreviewClassroom();
            };
        });

        container.querySelectorAll('.side-seat').forEach(function (el) {
            el.onclick = function () {
                var sid = parseInt(el.getAttribute('data-seat-id'));
                if (disabledSeats.has(sid)) {
                    disabledSeats.delete(sid);
                } else {
                    disabledSeats.add(sid);
                }
                renderPreviewClassroom();
            };
        });
    }

    function buildPreviewSeats(groups, rows, cols) {
        var result = [];
        var id = 3;
        for (var gi = 0; gi < groups; gi++) {
            for (var ri = 0; ri < rows; ri++) {
                for (var ci = 0; ci < cols; ci++) {
                    result.push({
                        id: id,
                        label: '第' + (gi + 1) + '组第' + (ri + 1) + '排第' + (ci + 1) + '列',
                        groupIdx: gi + 1,
                        row: ri + 1,
                        col: ci + 1
                    });
                    id++;
                }
            }
        }
        return result;
    }

    function updateNRLayoutPreview() {
        var ng = parseInt(document.getElementById('nrGroups').value) || 1;
        var nr = parseInt(document.getElementById('nrRows').value) || 1;
        var nc = parseInt(document.getElementById('nrCols').value) || 2;
        var nhp = document.getElementById('nrHasPairs').checked;
        var ntotal = ng * nr * nc + 2;

        document.getElementById('nrPreviewTotal').textContent = ntotal;
        document.getElementById('nrPairsLabel').textContent = nhp ? '两列合并为同桌' : '所有列独立分开';

        var hint = document.getElementById('nrPreviewHint');
        var studentCount = (State.students || []).length;
        if (studentCount > 0 && ng * nr * nc < studentCount) {
            hint.textContent = '座位总数(' + (ng * nr * nc) + ')少于已导入学生(' + studentCount + ')，无法开始';
            hint.style.color = 'var(--danger)';
        } else {
            hint.textContent = studentCount > 0 ? '座位总数满足当前' + studentCount + '名学生' : '可自由设置';
            hint.style.color = 'var(--success)';
        }

        if (ng !== layoutParams.groups || nr !== layoutParams.rows || nc !== layoutParams.cols || nhp !== layoutParams.pairs) {
            dirtyLayout = true;
            layoutParams = { groups: ng, rows: nr, cols: nc, pairs: nhp };
            disabledSeats.clear();
            renderPreviewClassroom();
        }
    }

    function bindNRSteppers() {
        ['nrGroups', 'nrRows', 'nrCols'].forEach(function (baseId) {
            var plus = document.getElementById(baseId + 'Plus');
            var minus = document.getElementById(baseId + 'Minus');
            var input = document.getElementById(baseId);
            if (plus) {
                plus.onclick = function () {
                    var max = parseInt(input.max) || 99;
                    var val = parseInt(input.value) || 1;
                    if (val < max) { input.value = val + 1; updateNRLayoutPreview(); }
                };
            }
            if (minus) {
                minus.onclick = function () {
                    var min = parseInt(input.min) || 1;
                    var val = parseInt(input.value) || 1;
                    if (val > min) { input.value = val - 1; updateNRLayoutPreview(); }
                };
            }
            input.addEventListener('input', function () { updateNRLayoutPreview(); });
            input.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') document.getElementById('newRoundStartBtn').click();
            });
        });
        var pairsCheck = document.getElementById('nrHasPairs');
        if (pairsCheck) pairsCheck.onchange = function () { updateNRLayoutPreview(); };
    }

    function closeNewRoundView() {
        overlay.remove();
    }

    document.getElementById('newRoundCloseBtn').onclick = closeNewRoundView;
    document.getElementById('newRoundCancelBtn').onclick = closeNewRoundView;
    overlay.addEventListener('mousedown', function (e) {
        if (e.target === overlay) closeNewRoundView();
    });

    bindNRSteppers();
    renderPreviewClassroom();
    updateNRLayoutPreview();

    ['nrRoundName', 'nrNoWishLockDate', 'nrClassChangeDate'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') document.getElementById('newRoundStartBtn').click();
            });
        }
    });

    document.getElementById('newRoundStartBtn').onclick = async function () {
        var name = document.getElementById('nrRoundName').value.trim();
        var noWishLockDate = document.getElementById('nrNoWishLockDate').value.trim();
        var classChangeDate = document.getElementById('nrClassChangeDate').value.trim();

        var ng = parseInt(document.getElementById('nrGroups').value) || 4;
        var nr = parseInt(document.getElementById('nrRows').value) || 7;
        var nc = parseInt(document.getElementById('nrCols').value) || 2;
        var nhp = document.getElementById('nrHasPairs').checked;

        if (ng < 1 || nr < 1 || nc < 2) {
            showToast('组数行数至少为1，列数至少为2', 'error');
            return;
        }

        var studentCount = (State.students || []).length;
        if (studentCount > 0 && ng * nr * nc < studentCount) {
            showToast('座位总数不能少于已导入学生人数(' + studentCount + ')', 'error');
            return;
        }

        overlay.remove();

        try {
            showLoading('正在准备新一轮...');
            if (dirtyLayout || origGroups !== ng || origRows !== nr || origCols !== nc || origPairs !== nhp) {
                await API.teacher.updateLayout({
                    groups_count: ng,
                    rows_per_group: nr,
                    cols_per_group: nc,
                    has_pairs: nhp
                });
            }

            var result = await API.rounds.start({
                name: name || null,
                no_wish_lock_date: noWishLockDate || null,
                class_change_date: classChangeDate || null
            });

            var changedIds = [];
            disabledSeats.forEach(function (id) {
                if (!originalDisabledSeats.has(id)) changedIds.push(id);
            });
            originalDisabledSeats.forEach(function (id) {
                if (!disabledSeats.has(id)) changedIds.push(id);
            });
            for (var i = 0; i < changedIds.length; i++) {
                try {
                    await API.teacher.toggleSeatDisable(changedIds[i]);
                } catch (e) {
                    console.error('toggleSeatDisable failed for seat ' + changedIds[i], e);
                }
            }

            hideLoading();
            showToast(result.message, 'success');
            await refreshState();
        } catch (e) {
            hideLoading();
            showToast(e.message, 'error');
        }
    };
}

function enterSeatDisableMode() {
    if (!State.seats || State.seats.length === 0) {
        showToast('请先设置教室布局', 'error');
        return;
    }

    State._originalDisabledSeats = new Set();
    State.seats.forEach(function (s) {
        if (s.isDisabled) State._originalDisabledSeats.add(s.id);
    });

    State.seatDisableMode = true;
    renderClassroom();
    showToast('已进入座位可选性编辑模式', 'info');
}

function saveSeatDisable() {
    showLayoutConfirmDialog(async function () {
        showLoading('正在更新座位可选性...');
        try {
            await API.teacher.undoRound();

            var originalSet = State._originalDisabledSeats || new Set();
            var changedIds = [];
            State.seats.forEach(function (s) {
                var wasDisabled = originalSet.has(s.id);
                var isDisabled = s.isDisabled;
                if (wasDisabled !== isDisabled) changedIds.push(s.id);
            });

            for (var i = 0; i < changedIds.length; i++) {
                try {
                    await API.teacher.toggleSeatDisable(changedIds[i]);
                } catch (e) {
                    console.error('toggleSeatDisable failed for seat ' + changedIds[i], e);
                }
            }

            hideLoading();
            showToast('座位可选性已更新', 'success');
            State.seatDisableMode = false;
            State._originalDisabledSeats = null;
            await refreshState();
            renderClassroom();
        } catch (e) {
            hideLoading();
            showToast(e.message, 'error');
        }
    });
}

function cancelSeatDisable() {
    if (State._originalDisabledSeats) {
        State.seats.forEach(function (s) {
            s.isDisabled = State._originalDisabledSeats.has(s.id);
        });
    }
    State.seatDisableMode = false;
    State._originalDisabledSeats = null;
    renderClassroom();
    showToast('已取消编辑', 'info');
}

function showRoundManageModal() {
    removeExistingModals();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
        '<div class="modal-box" style="max-width:500px;">' +
        '<h3>选座轮次管理</h3>' +
        '<div id="roundListContainer" style="max-height:300px;overflow-y:auto;margin:12px 0;">加载中...</div>' +
        '<div class="modal-actions"><button class="cancel" id="roundManageCloseBtn">关闭</button></div>' +
        '</div>';
    document.body.appendChild(overlay);

    document.getElementById('roundManageCloseBtn').onclick = function () { overlay.remove(); };
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) overlay.remove(); });

    API.rounds.list().then(function (res) {
        var rounds = res.rounds || [];
        var html = '';
        if (rounds.length === 0) {
            html = '<p style="text-align:center;color:var(--text-secondary);padding:20px;">暂无轮次记录</p>';
        } else {
            rounds.forEach(function (r) {
                var statusIcon = r.status === 'active' ? '进行中' : '已完成';
                html += '<div style="padding:10px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">' +
                    '<div>' +
                    '<strong>' + r.name + '</strong> (第' + r.roundNumber + '轮) ' + statusIcon + '<br>' +
                    '<span style="font-size:0.8rem;color:var(--text-secondary);">' +
                    (r.noWishLockDate ? '无志愿选座: ' + r.noWishLockDate + ' | ' : '') +
                    (r.classChangeDate ? '换座: ' + r.classChangeDate : '') +
                    '</span>' +
                    '</div>' +
                    '</div>';
            });
        }
        document.getElementById('roundListContainer').innerHTML = html;
    }).catch(function () {
        document.getElementById('roundListContainer').innerHTML = '<p style="text-align:center;color:var(--danger);">加载失败</p>';
    });
}

/* ==================== Help Modal ==================== */
function showHelpModal() {
    removeExistingModals();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
        '<div class="modal-box" style="max-width:600px;">' +
        '<h3>使用帮助</h3>' +
        '<div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.8;max-height:400px;overflow-y:auto;">' +
        '<p><b>教师模式：</b></p>' +
        '<p>• 点击「下一名」按排名依次叫号</p>' +
        '<p>• 点击空座位为学生选座</p>' +
        '<p>• 可拖拽已占座位交换位置</p>' +
        '<p>• 「撤销」可回退上一步操作</p>' +
        '<p>• 「显示姓名」切换座位姓名显示</p>' +
        '<br><p><b>学生模式：</b></p>' +
        '<p>• 点击空座位添加志愿（最多10个）</p>' +
        '<p>• 再次点击已选座位可取消</p>' +
        '<p>• 可邀请同桌（前N名才有权限）</p>' +
        '<br><p><b>学生管理：</b></p>' +
        '<p>• 查看/重置学生密码</p>' +
        '</div>' +
        '<div class="modal-actions"><button class="confirm" id="helpCloseBtn">知道了</button></div>' +
        '</div>';
    document.body.appendChild(overlay);
    document.getElementById('helpCloseBtn').onclick = function () { overlay.remove(); };
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) overlay.remove(); });
}

/* ==================== Function Menu ==================== */
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

function showFunctionMenuModal() {
    removeExistingModals();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
        '<div class="modal-box" style="max-width:500px;">' +
        '<h3>更多功能</h3>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">' +
        '<button class="menu-fn-btn" data-fn="exportXlsx">导出座位表 (.xlsx)</button>' +
        '<button class="menu-fn-btn" data-fn="exportAll">导出全部数据 (.csc123)</button>' +
        '<button class="menu-fn-btn" data-fn="importAll">导入全部数据 (.csc123)</button>' +
        '<button class="menu-fn-btn" data-fn="importXlsx">导入Excel名单 (.xlsx)</button>' +
        '<button class="menu-fn-btn" data-fn="rounds">选座轮次管理</button>' +
        '<button class="menu-fn-btn" data-fn="reset" style="color:var(--danger);">重置所有选座</button>' +
        
        '<button class="menu-fn-btn" data-fn="resetAll" style="color:var(--danger);">重置全部数据</button>' +
        '</div>' +
        '<div class="modal-actions"><button class="cancel" id="menuCloseBtn">关闭</button></div>' +
        '</div>';

    var style = createStyleElement('.menu-fn-btn { padding: 10px 16px; background: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-sm); cursor: pointer; font-size: 0.85rem; text-align: left; font-family: inherit; } .menu-fn-btn:hover { background: var(--primary); color: white; border-color: var(--primary); }');
    overlay.appendChild(style);

    document.body.appendChild(overlay);
    document.getElementById('menuCloseBtn').onclick = function () { overlay.remove(); };

    overlay.querySelectorAll('.menu-fn-btn').forEach(function (btn) {
        btn.onclick = async function () {
            var fn = btn.getAttribute('data-fn');
            overlay.remove();
            switch (fn) {
                case 'exportXlsx':
                    ensureAuth('确认导出', '请输入教师密码确认导出座位表', false, function () { exportXlsx(); });
                    break;
                case 'importAll':
                    ensureAuth('确认导入', '请输入教师密码确认导入操作', false, function () {
                        showFileUploadModal('importAll', '拖入 .csc123 文件', function (file) { importEncryptedFile(file); });
                    });
                    break;
                case 'exportAll':
                    ensureAuth('导出全部数据', '请输入教师密码确认', false, function () { exportAllData(); });
                    break;
                case 'rounds':
                    showRoundManageModal();
                    break;
                case 'reset':
                    ensureAuth('重置所有选座', '此操作不可恢复！请输入教师密码确认', true, async function (password) {
                        await API.seats.reset(password);
                        showToast('已重置');
                        await refreshState();
                    });
                    break;
                case 'importXlsx':
                    ensureAuth('确认导入', '请输入教师密码确认导入操作', false, function () {
                        triggerXlsxUpload();
                    });
                    break;
                case 'resetAll':
                    ensureAuth('重置全部数据', '此操作将清空所有学生、座位、志愿、操作记录！请输入教师密码确认', true, async function (password) {
                        try {
                            await API.teacher.resetData(password);
                            showToast('已重置全部数据');
                            await refreshState();
                        } catch (e) {
                            showToast(e.message, 'error');
                        }
                    });
                    break;
            }
        };
    });
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) overlay.remove(); });
}

function showCompanionModal() {
    removeExistingModals();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
        '<div class="modal-box">' +
        '<h3>显示同桌</h3>' +
        '<p style="color:var(--text-secondary);margin-bottom:12px;font-size:0.85rem;">前N名选座时可看到已选座位同学的名字（0表示关闭）</p>' +
        '<input type="number" id="quotaInput" value="' + State.companionQuota + '" min="0" max="' + State.students.length + '">' +
        '<div class="modal-actions">' +
        '<button class="cancel" id="quotaCancelBtn">取消</button>' +
        '<button class="confirm" id="quotaConfirmBtn">确认</button>' +
        '</div></div>';
    document.body.appendChild(overlay);

    document.getElementById('quotaCancelBtn').onclick = function () { overlay.remove(); };
    document.getElementById('quotaConfirmBtn').onclick = async function () {
        var val = parseInt(document.getElementById('quotaInput').value) || 0;
        State.companionQuota = Math.max(0, val);
        await API.seats.updateState({ companion_quota: State.companionQuota });
        overlay.remove();
        updateHintText();
        renderClassroom();
    };
    document.getElementById('quotaInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') document.getElementById('quotaConfirmBtn').click();
    });
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) overlay.remove(); });
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
        hintEl.innerHTML = '<span class="icon"></span><span>点击座位选座 | ' + text + ' | 拖拽.csc123/.xlsx导入</span>';
    }
}

async function exportAllData() {
    ensureAuth('导出全部数据', '请输入教师密码确认导出全部数据', false, function () {
        showExportPasswordDialog();
    });
}

function showExportPasswordDialog() {
    removeExistingModals();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
        '<div class="dialog-box" style="max-width:400px;">' +
        '<h3>导出全部数据</h3>' +
        '<p style="font-size:0.85rem;color:var(--text-secondary);">可为此备份文件设置密码保护。留空则不加密。</p>' +
        '<div style="margin:12px 0;">' +
        '<label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px;">密码（可选）</label>' +
        '<input type="password" id="exportPwdInput" class="form-input" placeholder="留空则不加密" autocomplete="off" style="width:100%;box-sizing:border-box;">' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
        '<label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px;">确认密码</label>' +
        '<input type="password" id="exportPwdConfirm" class="form-input" placeholder="再次输入密码" autocomplete="off" style="width:100%;box-sizing:border-box;">' +
        '</div>' +
        '<div class="modal-actions">' +
        '<button class="cancel" id="exportPwdCancelBtn">取消</button>' +
        '<button class="confirm" id="exportPwdConfirmBtn">导出</button>' +
        '</div>' +
        '</div>';

    var style = createStyleElement('.form-input { padding: 8px 12px; border: 1px solid var(--border-light); border-radius: var(--radius-sm); font-size: 0.85rem; font-family: inherit; background: var(--bg-primary); color: var(--text-primary); } .form-input:focus { outline: none; border-color: var(--primary); }');
    overlay.appendChild(style);

    document.body.appendChild(overlay);

    var cancelBtn = document.getElementById('exportPwdCancelBtn');
    var confirmBtn = document.getElementById('exportPwdConfirmBtn');
    var pwdInput = document.getElementById('exportPwdInput');
    var pwdConfirm = document.getElementById('exportPwdConfirm');

    cancelBtn.onclick = function () { overlay.remove(); };
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) overlay.remove(); });

    function doExport() {
        var pwd = pwdInput.value;
        var pwd2 = pwdConfirm.value;
        if (pwd !== pwd2) {
            showToast('两次密码不一致', 'error');
            return;
        }
        overlay.remove();
        showLoading('导出中...');
        doExportAllData(pwd || null);
    }

    confirmBtn.onclick = doExport;
    pwdInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') pwdConfirm.focus();
    });
    pwdConfirm.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doExport();
    });
    setTimeout(function () { pwdInput.focus(); }, 100);
}

async function doExportAllData(password) {
    try {
        var data = await API.seats.exportData(password || undefined);
        var binary = atob(data.data);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        var blob = new Blob([bytes], { type: 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = data.filename || 'seat_all.csc123';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('导出成功', 'success');
    } catch (e) {
        showToast('导出失败: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

/* ==================== Student Management Panel ==================== */
async function showStudentManagementPanel() {
    State.saveSession();
    document.getElementById('passwordOverlay').style.display = 'none';
    document.getElementById('teacherView').style.display = 'none';
    document.getElementById('studentView').style.display = 'none';
    document.getElementById('studentManageView').style.display = 'block';

    try {
        var data = await API.teacher.getStudents();
        document.getElementById('studentManageTotalStudents').textContent = data.totalStudents;
        document.getElementById('studentManageHasPassword').textContent = data.hasPassword;
        document.getElementById('studentManageNoPassword').textContent = data.noPassword;

        var tbody = document.getElementById('studentManageTableBody');
        var html = '';
        data.students.forEach(function (s) {
            html += '<tr>';
            html += '<td>' + escapeHtml(s.name) + '</td>';
            html += '<td>' + (s.hasPassword ? '已设置' : '未设置') + '</td>';
            html += '<td>' + s.wishCount + '</td>';
            html += '<td>';
            if (s.hasPassword) {
                html += '<button class="reset-pwd-btn" data-name="' + escapeHtml(s.name) + '">重置密码</button>';
            }
            html += '</td>';
            html += '</tr>';
        });
        tbody.innerHTML = html;

        bindStudentManageTableEvents();
    } catch (e) {
        showToast('加载失败: ' + e.message, 'error');
    }

    document.getElementById('studentManageBackBtn').onclick = function () {
        State.saveSession();
        enterTeacherMode();
    };
}

function bindStudentManageTableEvents() {
    document.querySelectorAll('.reset-pwd-btn').forEach(function (btn) {
        btn.onclick = function () {
            var name = btn.getAttribute('data-name');
            removeExistingModals();
            var overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML =
                '<div class="dialog-box" style="max-width:380px;">' +
                '<h3>清除学生密码</h3>' +
                '<p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:16px;">确定要清除 <strong>' + escapeHtml(name) + '</strong> 的密码吗？清除后该学生下次登录时需要重新设置密码。</p>' +
                '<div class="modal-actions">' +
                '<button class="cancel" id="resetPwdCancelBtn">取消</button>' +
                '<button class="confirm danger" id="resetPwdConfirmBtn">确认清除</button>' +
                '</div>' +
                '</div>';
            document.body.appendChild(overlay);

            var confirmBtn = document.getElementById('resetPwdConfirmBtn');
            var cancelBtn = document.getElementById('resetPwdCancelBtn');

            cancelBtn.onclick = function () { overlay.remove(); };
            overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) overlay.remove(); });

            confirmBtn.onclick = async function () {
                overlay.remove();
                try {
                    await API.teacher.resetPassword(name);
                    showToast('密码已清除', 'success');
                    await showStudentManagementPanel();
                } catch (e) {
                    showToast(e.message, 'error');
                }
            };
        };
    });
}

/* ==================== Enter Modes ==================== */
function enterTeacherMode() {
    API._tokenExpiredHandled = false;
    State.role = 'teacher';
    State.studentName = null;
    State.saveSession();
    document.body.classList.remove('student-mode');
    document.getElementById('passwordOverlay').style.display = 'none';
    document.getElementById('teacherView').style.display = 'block';
    document.getElementById('studentView').style.display = 'none';
    document.getElementById('studentManageView').style.display = 'none';

    bindTeacherEvents();
    document.getElementById('teacherLogoutBtn').onclick = function () { logout(); };

    loadState().then(async function () {
        await loadRoundInfo();
        loadAllWishes();
        renderClassroom();
        renderStudentList();
        renderCompletedList();
        updateCurrentStudentDisplay();
        updateHintText();
        updateRoundUI();
        showInlineLayoutEditor();
        initDragDrop();
    }).catch(function () {
        showToast('加载状态失败', 'error');
    });
}

function enterStudentModeDirect(name) {
    API._tokenExpiredHandled = false;
    State.role = 'student';
    State.studentName = name;
    State.saveSession();
    document.body.classList.add('student-mode');

    document.getElementById('studentInfoName').textContent = name;
    document.getElementById('passwordOverlay').style.display = 'none';
    document.getElementById('teacherView').style.display = 'none';
    document.getElementById('studentView').style.display = 'block';
    document.getElementById('studentManageView').style.display = 'none';

    bindStudentEvents();

    loadState().then(async function () {
        await loadRoundInfo();
        updateRoundUI();
        updateHintText();
        loadStudentWishes().then(function () {
            renderClassroom();
            renderWishPanel();
            updateCurrentStudentDisplay();
        });
    }).catch(function () {
        showToast('加载状态失败', 'error');
    });
}

function bindTeacherEvents() {
    document.getElementById('completeBtn').onclick = async function () {
        if (!State.activeRound || State.activeRound.status !== 'active') {
            showToast('没有进行中的选座轮次', 'error');
            return;
        }
        ensureAuth('完成选座', '确认完成当前轮次选座？完成后选座信息将固定，学生可查看结果。请输入教师密码确认', true, async function () {
            try {
                showLoading('正在保存备份...');
                var result = await API.rounds.complete(State.activeRound.id);
                hideLoading();
                showToast(result.message, 'success');
                await loadRoundInfo();
                updateRoundUI();
            } catch (e) {
                hideLoading();
                showToast(e.message, 'error');
            }
        });
    };

    document.getElementById('startRoundBtn').onclick = function () {
        showStartRoundModal();
    };

    document.getElementById('helpBtn').onclick = function () {
        showHelpModal();
    };

    document.getElementById('nextStudentBtn').onclick = async function () {
        if (_assignLock) return;
        if (!State.activeRound || State.activeRound.status !== 'active') {
            showToast('需开启一轮选座', 'error');
            return;
        }

        _assignLock = true;
        try {
            await autoAssignLoop();
        } finally {
            _assignLock = false;
        }
    };

    var nextBtn2 = document.getElementById('nextStudentBtn2');
    if (nextBtn2) nextBtn2.onclick = document.getElementById('nextStudentBtn').onclick;

    document.getElementById('undoRoundBtn').onclick = async function () {
        try {
            showLoading('正在撤销...');
            await API.seats.undo();
            await refreshState();
            showToast('已撤销', 'success');
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            hideLoading();
        }
    };

    document.getElementById('toggleNamesBtn').onclick = function () {
        State.globalShowNames = !State.globalShowNames;
        API.seats.updateState({ global_show_names: State.globalShowNames });
        renderClassroom();
    };

    document.getElementById('toggleGenderBtn').onclick = function () {
        State.genderDisplay = !State.genderDisplay;
        API.seats.updateState({ gender_display: State.genderDisplay });
        renderClassroom();
        renderStudentList();
        renderCompletedList();
    };

    document.getElementById('companionBtn').onclick = function () {
        showCompanionModal();
    };

    document.getElementById('studentManageBtn').onclick = function () {
        showStudentManagementPanel();
    };

    document.getElementById('viewWishesBtn').onclick = function () {
        showTeacherWishView();
    };

    document.getElementById('lockWishesBtn').onclick = function () {
        showAutoLockModal();
    };

    document.getElementById('moreFunctionsBtn').onclick = function () {
        showFunctionMenuModal();
    };

    document.getElementById('toggleStudentListBtn').onclick = function () {
        State.studentListCollapsed = !State.studentListCollapsed;
        renderStudentList();
    };

    document.getElementById('toggleCompletedBtn').onclick = function () {
        State.completedCollapsed = !State.completedCollapsed;
        renderCompletedList();
    };

    initDragDrop();
}

function bindStudentEvents() {
    document.getElementById('studentLogoutBtn2').onclick = function () {
        logout();
    };
}

/* ==================== Teacher Wish Viewer ==================== */
function showTeacherWishView() {
    removeExistingModals();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'teacherWishModal';

    var wishes = State.allWishes;
    var studentNames = State.sortedStudents.map(function (s) { return s.name; });

    var html = '<div class="modal-content wish-viewer">';
    html += '<div class="modal-header"><h3>学生志愿一览</h3><button class="modal-close" id="closeWishViewer">✕</button></div>';
    html += '<div class="modal-body wish-viewer-body">';
    html += '<div style="margin-bottom:12px;font-size:0.8rem;color:var(--text-muted);">';
    html += '学生总数: ' + studentNames.length + ' | 已提交志愿: ' + Object.keys(wishes).length;
    html += '</div>';
    html += '<div style="max-height:60vh;overflow-y:auto;">';

    studentNames.forEach(function (name) {
        var ws = (wishes[name] || []).sort(function (a, b) { return a.priority - b.priority; });
        var student = State.students.find(function (s) { return s.name === name; });
        var idx = State.sortedStudents.indexOf(student);
        html += '<div style="padding:10px;margin:4px 0;background:var(--bg-secondary);border-radius:var(--radius-sm);border-left:3px solid var(--primary);">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<span style="font-weight:600;">' + escapeHtml(name) + '</span>';
        html += '<span style="font-size:0.75rem;color:var(--text-muted);">' + (student ? (student.totalScore || '?') + '分 · 第' + (idx + 1) + '名' : '') + '</span>';
        html += '</div>';
        if (ws.length === 0) {
            html += '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">未提交志愿</div>';
        } else {
            html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">';
            ws.forEach(function (w) {
                var seat = State.seats.find(function (s) { return s.id === w.seat_id; });
                var seatLabel = seat ? seat.label : '座位' + w.seat_id;
                html += '<span style="font-size:0.7rem;padding:2px 8px;background:var(--primary);color:white;border-radius:var(--radius-full);">#' + w.priority + ' ' + escapeHtml(seatLabel) + '</span>';
            });
            html += '</div>';
        }
        html += '</div>';
    });
    html += '</div></div></div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    document.getElementById('closeWishViewer').onclick = function () { overlay.remove(); };
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) overlay.remove(); });
}

/* ==================== Auto Lock Wishes ==================== */
function showAutoLockModal() {
    removeExistingModals();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
        '<div class="modal-box">' +
        '<h3>锁定志愿</h3>' +
        '<p style="color:var(--text-secondary);margin-bottom:12px;font-size:0.85rem;">前N名学生将按排名自动锁定第一志愿<br>志愿冲突时排名靠前者优先；排名相同则随机</p>' +
        '<div style="margin-bottom:12px;">' +
        '<label style="display:block;margin-bottom:6px;font-weight:600;">锁定人数</label>' +
        '<input type="number" id="autoLockQuota" value="5" min="1" max="' + State.students.length + '" style="width:100%;padding:10px;border:2px solid var(--border-light);border-radius:var(--radius);font-family:inherit;">' +
        '</div>' +
        '<div class="modal-actions">' +
        '<button class="cancel" id="lockCancelBtn">取消</button>' +
        '<button class="confirm" id="lockConfirmBtn">锁定志愿</button>' +
        '</div>' +
        '<div id="lockResult" style="margin-top:12px;font-size:0.85rem;"></div>' +
        '</div>';
    document.body.appendChild(overlay);

    document.getElementById('lockCancelBtn').onclick = function () { overlay.remove(); };
    document.getElementById('lockConfirmBtn').onclick = async function () {
        var quota = parseInt(document.getElementById('autoLockQuota').value) || 0;
        if (quota <= 0) { showToast('请输入有效人数', 'error'); return; }
        var btn = document.getElementById('lockConfirmBtn');
        btn.disabled = true;
        btn.textContent = '锁定中...';
        try {
            var result = await API.teacher.autoLockWishes(quota);
            var resultEl = document.getElementById('lockResult');
            var html = '<div style="color:var(--success);font-weight:600;">✅ ' + result.locked.length + ' 名学生已锁定座位</div>';
            if (result.skipped.length > 0) {
                html += '<div style="color:var(--warning);margin-top:4px;">' + result.skipped.length + ' 名志愿全部冲突: ' + result.skipped.join(', ') + '</div>';
            }
            resultEl.innerHTML = html;
            showToast(result.message, 'success');
            await refreshState();
            await loadAllWishes();
            setTimeout(function () { overlay.remove(); }, 2000);
        } catch (e) {
            showToast(e.message, 'error');
            btn.disabled = false;
            btn.textContent = '锁定志愿';
        }
    };
    document.getElementById('autoLockQuota').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') document.getElementById('lockConfirmBtn').click();
    });
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) overlay.remove(); });
}

/* ==================== Drag & Drop ==================== */
function initDragDrop() {
    var seatEls = document.querySelectorAll('.seat.occupied, .side-seat.occupied');
    seatEls.forEach(function (el) {
        el.setAttribute('draggable', 'true');
        el.ondragstart = function (e) {
            var seatId = parseInt(el.getAttribute('data-seat-id'));
            e.dataTransfer.setData('text/plain', seatId.toString());
            el.style.opacity = '0.5';
        };
        el.ondragend = function () {
            el.style.opacity = '1';
            document.querySelectorAll('.seat.drag-over, .side-seat.drag-over').forEach(function (s) {
                s.classList.remove('drag-over');
            });
        };
    });

    var allSeats = document.querySelectorAll('.seat:not(.occupied), .side-seat:not(.occupied), .seat.occupied, .side-seat.occupied, .seat.disabled, .side-seat.disabled');
    allSeats.forEach(function (el) {
        el.ondragover = function (e) {
            e.preventDefault();
            el.classList.add('drag-over');
        };
        el.ondragleave = function () {
            el.classList.remove('drag-over');
        };
        el.ondrop = async function (e) {
            e.preventDefault();
            el.classList.remove('drag-over');
            if (_assignLock) return;
            var srcSeatId = parseInt(e.dataTransfer.getData('text/plain'));
            var dstSeatId = parseInt(el.getAttribute('data-seat-id'));
            if (srcSeatId === dstSeatId) return;
            _assignLock = true;
            showLoading('交换中...');
            try {
                await API.seats.swap(srcSeatId, dstSeatId);
                await refreshState();
                renderClassroom();
                renderStudentList();
                renderCompletedList();
            } catch (err) {
                showToast('拖拽失败: ' + err.message, 'error');
            } finally {
                hideLoading();
                _assignLock = false;
            }
        };
    });
}

/* ==================== Logout ==================== */
function showSessionExpiredModal() {
    removeExistingModals();
    State.role = null;
    State.studentName = null;
    document.getElementById('teacherView').style.display = 'none';
    document.getElementById('studentView').style.display = 'none';
    document.getElementById('studentManageView').style.display = 'none';
    document.body.classList.remove('student-mode');

    document.getElementById('passwordOverlay').style.display = 'flex';
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('firstTimeSetup').classList.add('hidden');
    history.replaceState(null, '', window.location.pathname);
    resetStudentLogin();
    API._tokenExpiredHandled = false;

    showToast('Token 已过期', 'error');
}

function logout() {
    API._tokenExpiredHandled = true;
    API.auth.logout().catch(function(){});
    API.clearSession();
    State.role = null;
    State.studentName = null;
    State.studentWishes = [];
    document.getElementById('teacherView').style.display = 'none';
    document.getElementById('studentView').style.display = 'none';
    document.getElementById('studentManageView').style.display = 'none';
    document.getElementById('passwordOverlay').style.display = 'flex';
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('firstTimeSetup').classList.add('hidden');
    document.body.classList.remove('student-mode');
    history.replaceState(null, '', window.location.pathname);
    resetStudentLogin();
}

/* ==================== Student Login Reset ==================== */
function resetStudentLogin() {
    document.getElementById('studentStep1').classList.remove('hidden');
    document.getElementById('studentStep2a').classList.add('hidden');
    document.getElementById('studentStep2b').classList.add('hidden');
    document.getElementById('studentNameInput').value = '';
    document.getElementById('studentPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';
    hideNameSuggestions();
    clearError();
}

/* ==================== Role Tabs ==================== */
function switchRoleTab(role) {
    document.querySelectorAll('.role-tab').forEach(function (t) { t.classList.remove('active'); });
    document.getElementById(role + 'Tab').classList.add('active');
    document.querySelectorAll('.login-panel').forEach(function (p) { p.classList.remove('active'); });
    document.getElementById(role + 'Login').classList.add('active');
    clearError();
}

/* ==================== Error Display ==================== */
function showError(msg) {
    var errEl = document.getElementById('pwdError');
    if (errEl) errEl.textContent = '⚠️ ' + msg;
}

function clearError() {
    var el = document.getElementById('pwdError');
    if (el && el.textContent) el.textContent = '';
}

/* ==================== Name Suggestions ==================== */
function populateStudentNameInput() {
}

function renderNameSuggestions(matches, query) {
    var el = document.getElementById('nameSuggestions');
    if (!el) return;
    if (matches.length === 0) {
        el.innerHTML = '<div class="name-suggestion-item no-match">无匹配结果</div>';
        el.style.display = 'block';
        return;
    }
    var html = '';
    matches.forEach(function (m) {
        html += '<div class="name-suggestion-item" data-name="' + escapeHtml(m.name) + '">' + escapeHtml(m.name) + '</div>';
    });
    el.innerHTML = html;
    el.style.display = 'block';
}

function hideNameSuggestions() {
    var el = document.getElementById('nameSuggestions');
    if (el) el.style.display = 'none';
}

/* ==================== Init ==================== */
async function initApp() {
    var session = await API.restoreSession();
    if (session && session.role) {
        if (session.role === 'teacher') enterTeacherMode();
        else if (session.role === 'student') enterStudentModeDirect(session.studentName || '');
    } else {
        showLoginNormally();
    }
    window.addEventListener('hashchange', function () {
        location.reload();
    });

    function showLoginNormally() {
        tryCheckSetup();
        bindLoginEvents();
    }

    function tryCheckSetup(retries) {
        retries = retries || 0;
        API.auth.checkSetup().then(function (data) {
            var loginSection = document.getElementById('loginSection');
            var firstTimeSetup = document.getElementById('firstTimeSetup');

            if (data.is_setup) {
                loginSection.classList.remove('hidden');
                firstTimeSetup.classList.add('hidden');
            } else {
                loginSection.classList.add('hidden');
                firstTimeSetup.classList.remove('hidden');
            }
        }).catch(function (e) {
            if (retries < 5) {
                setTimeout(function () { tryCheckSetup(retries + 1); }, 1000 * (retries + 1));
            } else {
                document.getElementById('loginSection').classList.add('hidden');
                document.getElementById('firstTimeSetup').classList.remove('hidden');
            }
        });
    }

    function bindLoginEvents() {
    document.getElementById('teacherTab').onclick = function () { switchRoleTab('teacher'); };
    document.getElementById('studentTab').onclick = function () {
        switchRoleTab('student');
        populateStudentNameInput();
    };

    document.getElementById('setupTeacherPwdBtn').onclick = async function () {
        var pwd = document.getElementById('setupTeacherPwd').value;
        var confirm = document.getElementById('setupTeacherPwdConfirm').value;
        var setupToken = document.getElementById('setupToken').value;
        var errorEl = document.getElementById('setupError');

        if (!setupToken) {
            errorEl.textContent = '请输入初始化令牌';
            return;
        }
        if (!pwd || pwd.length < 8) {
            errorEl.textContent = '密码至少8位，且需包含字母和数字';
            return;
        }
        if (!/[a-zA-Z]/.test(pwd) || !/\d/.test(pwd)) {
            errorEl.textContent = '密码必须包含字母和数字';
            return;
        }
        if (pwd !== confirm) {
            errorEl.textContent = '两次密码不一致';
            return;
        }
        showLoading('初始化中...');
        try {
            await API.auth.setupTeacher(pwd, setupToken);
            document.getElementById('setupTeacherPwd').value = '';
            document.getElementById('setupTeacherPwdConfirm').value = '';
            document.getElementById('setupToken').value = '';
            errorEl.textContent = '';
            hideLoading();
            showSetupWizard(pwd);
        } catch (e) {
            hideLoading();
            errorEl.textContent = e.message;
        }
    };

    document.getElementById('setupTeacherPwd').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') document.getElementById('setupTeacherPwdConfirm').focus();
    });
    document.getElementById('setupTeacherPwdConfirm').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') document.getElementById('setupTeacherPwdBtn').click();
    });

    document.getElementById('wizardNextBtn').onclick = function () { wizardNext(); };
    document.getElementById('wizardPrevBtn').onclick = function () {
        if (wizardState.step > 1) { wizardState.step--; renderWizardStep(); }
    };

    document.getElementById('teacherUnlockBtn').onclick = async function () {
        clearError();
        var pwd = document.getElementById('teacherPasswordInput').value;
        showLoading();
        try {
            var resp = await teacherLogin(pwd);
            pwd = null;
            document.getElementById('teacherPasswordInput').value = '';
            hideLoading();
            enterTeacherMode();
        } catch (e) {
            hideLoading();
            showError('密码错误');
        }
    };

    document.getElementById('teacherPasswordInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') document.getElementById('teacherUnlockBtn').click();
    });

    document.getElementById('studentNameNextBtn').onclick = function () {
        clearError();
        var name = document.getElementById('studentNameInput').value.trim();
        if (!name) { showError('请输入用户名（姓名全拼）'); return; }

        var pinyinInput = name;

        document.getElementById('studentStep1').classList.add('hidden');
        API.auth.checkStudent(name).then(function (data) {
            var displayName = data.name || name;
            document.getElementById('returningStudentName').textContent = displayName;
            document.getElementById('returningStudentName').setAttribute('data-pinyin', pinyinInput);
            document.getElementById('newStudentName').textContent = displayName;
            document.getElementById('newStudentName').setAttribute('data-pinyin', pinyinInput);
            document.getElementById('studentStep2a').classList.remove('hidden');
            setTimeout(function () {
                var el = document.getElementById('studentPasswordInput');
                if (el) el.focus();
            }, 100);
        }).catch(function () {
            showError('查询失败，请重试');
            document.getElementById('studentStep1').classList.remove('hidden');
        });
    };

    document.getElementById('studentNameInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') document.getElementById('studentNameNextBtn').click();
    });

    document.getElementById('studentLoginBtn').onclick = async function () {
        clearError();
        var displayNameEl = document.getElementById('returningStudentName');
        var name = displayNameEl.getAttribute('data-pinyin') || displayNameEl.textContent;
        var pwd = document.getElementById('studentPasswordInput').value;
        if (!pwd) { showError('请输入密码'); return; }
        showLoading();
        try {
            var resp = await studentLoginAction(name, pwd);
            pwd = null;
            document.getElementById('studentPasswordInput').value = '';
            hideLoading();
            enterStudentModeDirect(resp.username || displayNameEl.textContent);
        } catch (e) {
            hideLoading();
            showError(e.message || '用户名或密码错误');
        }
    };

    document.getElementById('studentPasswordInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') document.getElementById('studentLoginBtn').click();
    });

    document.getElementById('studentRegisterBtn').onclick = async function () {
        clearError();
        var displayNameEl = document.getElementById('newStudentName');
        var name = displayNameEl.getAttribute('data-pinyin') || displayNameEl.textContent;
        var pwd = document.getElementById('newPasswordInput').value;
        var confirmPwd = document.getElementById('confirmPasswordInput').value;
        if (!pwd || !confirmPwd) { showError('请填写密码和确认密码'); return; }
        if (pwd !== confirmPwd) { showError('两次输入的密码不一致'); return; }
        if (pwd.length < 8) { showError('密码长度至少8位，且需包含字母和数字'); return; }
        if (!/[a-zA-Z]/.test(pwd) || !/\d/.test(pwd)) { showError('密码必须包含字母和数字'); return; }
        showLoading('注册中...');
        try {
            var resp = await studentRegisterAction(name, pwd, confirmPwd);
            pwd = null;
            confirmPwd = null;
            document.getElementById('newPasswordInput').value = '';
            document.getElementById('confirmPasswordInput').value = '';
            hideLoading();
            enterStudentModeDirect(resp.username || displayNameEl.textContent);
        } catch (e) {
            hideLoading();
            showError(e.message || '注册失败');
        }
    };

    document.getElementById('confirmPasswordInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') document.getElementById('studentRegisterBtn').click();
    });

    document.getElementById('newPasswordInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') document.getElementById('confirmPasswordInput').focus();
    });

    document.getElementById('backToStep1a').onclick = resetStudentLogin;
    document.getElementById('backToStep1b').onclick = resetStudentLogin;

    document.getElementById('switchToRegister').onclick = function () {
        clearError();
        document.getElementById('studentStep2a').classList.add('hidden');
        document.getElementById('studentStep2b').classList.remove('hidden');
        setTimeout(function () {
            var el = document.getElementById('newPasswordInput');
            if (el) el.focus();
        }, 100);
    };

    document.getElementById('switchToLogin').onclick = function () {
        clearError();
        document.getElementById('studentStep2b').classList.add('hidden');
        document.getElementById('studentStep2a').classList.remove('hidden');
        setTimeout(function () {
            var el = document.getElementById('studentPasswordInput');
            if (el) el.focus();
        }, 100);
    };

    document.getElementById('studentLogoutBtn2').onclick = function () { logout(); };

    var dropZone = document.getElementById('dropZone');
    if (dropZone) {
        var fileDragCounter = 0;
        dropZone.addEventListener('dragenter', function (e) {
            if (State.role !== 'teacher') return;
            var types = e.dataTransfer.types;
            if (!types || !types.length) return;
            var hasFiles = false;
            for (var i = 0; i < types.length; i++) {
                if (types[i] === 'Files') { hasFiles = true; break; }
            }
            if (!hasFiles) return;
            e.preventDefault();
            fileDragCounter++;
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', function (e) {
            e.preventDefault();
            fileDragCounter--;
            if (fileDragCounter <= 0) {
                dropZone.classList.remove('drag-over');
                fileDragCounter = 0;
            }
        });
        dropZone.addEventListener('drop', async function (e) {
            e.preventDefault();
            fileDragCounter = 0;
            dropZone.classList.remove('drag-over');
            var file = e.dataTransfer.files[0];
            if (!file) return;
            var name = file.name.toLowerCase();
            if (name.endsWith('.csc123')) {
                ensureAuth('确认导入', '请输入教师密码确认导入操作', false, function () {
                    importEncryptedFile(file);
                });
            } else if (name.endsWith('.xlsx')) {
                ensureAuth('确认导入', '请输入教师密码确认导入操作', false, function () {
                    importXlsxFile(file);
                });
            } else {
                showToast('请拖入 .csc123 或 .xlsx 文件', 'error');
            }
        });
    }
    }

}

document.addEventListener('DOMContentLoaded', function () {
    initApp();
});