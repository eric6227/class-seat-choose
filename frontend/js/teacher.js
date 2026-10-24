/* ==================== Teacher - Student List ==================== */
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

/* ==================== Teacher - Completed List ==================== */
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

/* ==================== Teacher - Seat Click ==================== */
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
            selectionMethodDisplay.classList.remove('hidden');
        } else {
            selectionMethodDisplay.classList.add('hidden');
        }
    }
}

/* ==================== Start Round Modal ==================== */
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

/* ==================== Seat Disable Mode ==================== */
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

/* ==================== Inline Layout Editor ==================== */
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

    function updateActionPanelVisibility() {
        var normalActions = document.getElementById('ileActionsNormal');
        var editActions = document.getElementById('ileActionsEdit');
        if (!normalActions || !editActions) return;
        if (State.seatDisableMode) {
            normalActions.style.display = 'none';
            normalActions.classList.add('hidden');
            editActions.style.display = 'flex';
            editActions.classList.remove('hidden');
        } else {
            normalActions.style.display = 'flex';
            normalActions.classList.remove('hidden');
            editActions.style.display = 'none';
            editActions.classList.add('hidden');
        }
    }

    doUpdatePreview();
    updateActionPanelVisibility();

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
                input.addEventListener('keypress', function (e) {
                    if (e.key === 'Enter') { var sb = document.getElementById('iSaveBtn'); if (sb && !sb.disabled) sb.click(); }
                });
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

/* ==================== Teacher - Modals ==================== */
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

function showRoundManageModal() {
    removeExistingModals();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
        '<div class="modal-box" style="max-width:500px;">' +
        '<h3>选座轮次管理</h3>' +
        '<p style="font-size:0.8rem;color:var(--text-secondary);margin:4px 0;">点击轮次可查看该轮选座结果</p>' +
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
                var statusIcon = r.status === 'active' ? '⏳ 进行中' : '✅ 已完成';
                html += '<div class="round-item" data-round-id="' + r.id + '" style="padding:10px;border-bottom:1px solid var(--border-light);cursor:pointer;border-radius:var(--radius-sm);transition:background 0.2s;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                    '<div style="flex:1;">' +
                    '<strong>' + escapeHtml(r.name) + '</strong> (第' + r.roundNumber + '轮) ' + statusIcon + '<br>' +
                    '<span style="font-size:0.8rem;color:var(--text-secondary);">' +
                    (r.noWishLockDate ? '无志愿选座: ' + escapeHtml(r.noWishLockDate) + ' | ' : '') +
                    (r.classChangeDate ? '换座: ' + escapeHtml(r.classChangeDate) : '') +
                    (r.completedAt ? ' | 完成: ' + new Date(r.completedAt).toLocaleString('zh-CN') : '') +
                    '</span>' +
                    '</div>' +
                    '<span style="font-size:0.8rem;color:var(--primary);margin-left:8px;">查看 →</span>' +
                    '</div>' +
                    '</div>';
            });
        }
        document.getElementById('roundListContainer').innerHTML = html;

        var style = document.createElement('style');
        style.textContent = '.round-item:hover { background: var(--bg-secondary); }';
        document.getElementById('roundListContainer').appendChild(style);

        document.querySelectorAll('.round-item').forEach(function (item) {
            item.onclick = function () {
                var roundId = parseInt(item.getAttribute('data-round-id'));
                var roundName = item.querySelector('strong').textContent;
                overlay.remove();
                showRoundResultModal(roundId, roundName);
            };
        });
    }).catch(function () {
        document.getElementById('roundListContainer').innerHTML = '<p style="text-align:center;color:var(--danger);">加载失败</p>';
    });
}

function showRoundResultModal(roundId, roundName) {
    removeExistingModals();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay round-result-overlay';
    overlay.id = 'roundResultOverlay';
    overlay.innerHTML =
        '<div class="round-result-container">' +
        '<div class="new-round-header">' +
        '<h2>' + escapeHtml(roundName) + ' - 选座结果</h2>' +
        '<button class="new-round-close primary" id="roundResultCloseBtn">关闭</button>' +
        '</div>' +
        '<div class="new-round-body">' +
        '<div class="new-round-left">' +
        '<div id="roundResultClassroom" style="text-align:center;padding:20px;color:var(--text-secondary);">加载中...</div>' +
        '</div>' +
        '<div class="new-round-right">' +
        '<div class="new-round-section">' +
        '<h4>轮次信息</h4>' +
        '<div id="roundResultInfo" style="font-size:0.85rem;color:var(--text-secondary);">加载中...</div>' +
        '</div>' +
        '<div class="new-round-section">' +
        '<h4>已分配学生</h4>' +
        '<div id="roundResultStudentList" style="max-height:300px;overflow-y:auto;font-size:0.85rem;">加载中...</div>' +
        '</div>' +
        '</div></div></div>';

    var style = createStyleElement(
        '.round-result-overlay { z-index: 3000; }' +
        '.round-result-container { background: var(--bg-primary); width: 95vw; height: 92vh; border-radius: var(--radius-lg); display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--shadow-lg); }' +
        '.round-result-container .new-round-header { padding: 20px 32px; }' +
        '.round-result-container .new-round-left { padding: 24px; }' +
        '.round-result-container .new-round-right { padding: 24px; gap: 16px; }' +
        '.round-result-container .new-round-section { padding: 20px 16px; }' +
        '.round-result-classroom .seat.occupied { background: var(--primary); color: white; }' +
        '.round-result-classroom .side-seat.occupied { background: var(--primary); color: white; }' +
        '.round-result-classroom .seat.disabled { background: #d9d9d9; opacity: 0.6; }' +
        '.round-result-classroom .side-seat.disabled { background: #d9d9d9; opacity: 0.6; }' +
        '.round-result-student { padding: 8px 12px; border-bottom: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; }' +
        '.round-result-student:hover { background: var(--bg-secondary); }'
    );
    overlay.appendChild(style);

    document.body.appendChild(overlay);

    document.getElementById('roundResultCloseBtn').onclick = function () { overlay.remove(); };
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) overlay.remove(); });

    API.rounds.getResults(roundId).then(function (res) {
        var r = res.round;
        var seats = res.seats || [];
        var students = res.students || [];
        var groupsCount = res.groupsCount || 4;
        var rowsPerGroup = res.rowsPerGroup || 7;
        var colsPerGroup = res.colsPerGroup || 2;
        var hasPairs = res.hasPairs !== undefined ? res.hasPairs : true;

        var roundInfoHtml = '';
        roundInfoHtml += '<p><strong>状态:</strong> ' + (r.status === 'active' ? '进行中' : '已完成') + '</p>';
        roundInfoHtml += '<p><strong>轮次:</strong> 第' + r.roundNumber + '轮</p>';
        if (r.noWishLockDate) roundInfoHtml += '<p><strong>无志愿选座:</strong> ' + escapeHtml(r.noWishLockDate) + '</p>';
        if (r.classChangeDate) roundInfoHtml += '<p><strong>换座日期:</strong> ' + escapeHtml(r.classChangeDate) + '</p>';
        var assignedCount = students.filter(function (s) { return s.assigned; }).length;
        roundInfoHtml += '<p><strong>已分配:</strong> ' + assignedCount + ' / ' + students.length + ' 名学生</p>';
        document.getElementById('roundResultInfo').innerHTML = roundInfoHtml;

        var classroomHtml = renderRoundResultClassroom(seats, students, groupsCount, rowsPerGroup, colsPerGroup, hasPairs);
        document.getElementById('roundResultClassroom').innerHTML = classroomHtml;

        var assignedStudents = students.filter(function (s) { return s.assigned; });
        assignedStudents.sort(function (a, b) { return b.totalScore - a.totalScore; });
        var studentListHtml = '';
        if (assignedStudents.length === 0) {
            studentListHtml = '<p style="text-align:center;color:var(--text-secondary);padding:12px;">暂无已分配学生</p>';
        } else {
            assignedStudents.forEach(function (s) {
                var seat = seats.find(function (seat) { return seat.id === s.seatId; });
                var seatLabel = seat ? escapeHtml(seat.label) : '?';
                studentListHtml += '<div class="round-result-student">' +
                    '<span>' + escapeHtml(s.name) + '</span>' +
                    '<span style="color:var(--text-muted);">(' + s.totalScore + '分) → ' + seatLabel + '</span>' +
                    '</div>';
            });
        }
        document.getElementById('roundResultStudentList').innerHTML = studentListHtml;
    }).catch(function (e) {
        document.getElementById('roundResultClassroom').innerHTML =
            '<p style="text-align:center;color:var(--danger);padding:20px;">加载失败: ' + escapeHtml(e.message) + '</p>';
        document.getElementById('roundResultInfo').innerHTML = '<p style="color:var(--danger);">加载失败</p>';
        document.getElementById('roundResultStudentList').innerHTML = '<p style="color:var(--danger);">加载失败</p>';
    });
}

function renderRoundResultClassroom(seats, students, groupsCount, rowsPerGroup, colsPerGroup, hasPairs) {
    var occupiedMap = {};
    seats.forEach(function (s) {
        if (s.isOccupied && s.occupantName) {
            occupiedMap[s.id] = s.occupantName;
        }
    });

    var rightDisabled = seats.find(function (s) { return s.id === 2; });
    var leftDisabled = seats.find(function (s) { return s.id === 1; });
    var rightOcc = occupiedMap[2];
    var leftOcc = occupiedMap[1];

    var html = '<div class="round-result-classroom">';
    html += '<div class="platform-area">';
    html += '<div class="side-seat' + (rightOcc ? ' occupied' : '') + (rightDisabled && rightDisabled.isDisabled ? ' disabled' : '') + '">';
    html += '<span class="seat-label">讲台右</span>';
    html += '<span class="seat-name">' + (rightOcc ? escapeHtml(rightOcc) : (rightDisabled && rightDisabled.isDisabled ? '🚫' : '')) + '</span>';
    html += '</div>';
    html += '<span class="platform-badge">讲台</span>';
    html += '<div class="side-seat' + (leftOcc ? ' occupied' : '') + (leftDisabled && leftDisabled.isDisabled ? ' disabled' : '') + '">';
    html += '<span class="seat-label">讲台左</span>';
    html += '<span class="seat-name">' + (leftOcc ? escapeHtml(leftOcc) : (leftDisabled && leftDisabled.isDisabled ? '🚫' : '')) + '</span>';
    html += '</div>';
    html += '</div>';

    var groupSeats = seats.filter(function (s) { return s.type !== 'platform' && s.groupIdx; });
    var groups = {};
    groupSeats.forEach(function (s) {
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
            html += '<div class="seat-row' + (hasPairs ? ' has-pairs' : '') + '">';
            for (var ci = 0; ci < rowSeats.length; ci++) {
                var s = rowSeats[ci];
                if (hasPairs && ci % 2 === 0 && ci > 0) {
                    html += '<div class="pair-gap"></div>';
                }
                var isOcc = occupiedMap[s.id];
                var isDis = s.isDisabled;
                html += '<div class="seat' + (isOcc ? ' occupied' : '') + (isDis ? ' disabled' : '') + '">';
                html += '<span class="seat-label">' + escapeHtml(s.label) + '</span>';
                html += '<span class="seat-name">' + (isOcc ? escapeHtml(isOcc) : (isDis ? '🚫' : '')) + '</span>';
                html += '</div>';
                if (hasPairs && ci % 2 === 1 && ci < rowSeats.length - 1) {
                    html += '<div class="pair-gap"></div>';
                }
            }
            html += '</div>';
        });
        html += '</div></div>';
    });
    html += '</div>';
    html += '</div>';

    return html;
}

/* ==================== Export Functions ==================== */
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

/* ==================== Teacher Mode Entry ==================== */
function enterTeacherMode() {
    API._tokenExpiredHandled = false;
    State.role = 'teacher';
    State.studentName = null;
    State.saveSession();
    document.body.classList.remove('student-mode');
    safeSetDisplay('passwordOverlay', 'none');
    safeSetDisplay('teacherView', 'block');
    safeSetDisplay('studentView', 'none');
    safeSetDisplay('studentManageView', 'none');

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