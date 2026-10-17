/* ==================== Student - Seat Click ==================== */
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

var wishDragSrcIndex = -1;

/* ==================== Render Wish Panel ==================== */
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

/* ==================== Student Management Panel ==================== */
async function showStudentManagementPanel() {
    State.saveSession();

    if (getPageName() === 'teacher') {
        window.location.href = 'student-manage.html';
        return;
    }

    safeSetDisplay('passwordOverlay', 'none');
    safeSetDisplay('teacherView', 'none');
    safeSetDisplay('studentView', 'none');
    safeSetDisplay('studentManageView', 'block');

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
        if (getPageName() === 'student-manage') {
            window.location.href = 'teacher.html';
            return;
        }
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
            showModalOverlay(overlay);

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

/* ==================== Enter Student Mode ==================== */
function enterStudentModeDirect(name) {
    API._tokenExpiredHandled = false;
    State.role = 'student';
    State.studentName = name;
    State.saveSession();
    document.body.classList.add('student-mode');

    document.getElementById('studentInfoName').textContent = name;
    safeSetDisplay('passwordOverlay', 'none');
    safeSetDisplay('teacherView', 'none');
    safeSetDisplay('studentView', 'block');
    safeSetDisplay('studentManageView', 'none');

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

function bindStudentEvents() {
    document.getElementById('studentLogoutBtn2').onclick = function () {
        logout();
    };
}