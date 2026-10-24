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
        var hint = document.getElementById('simpleHint');
        if (hint) {
            if (State.seatDisableMode) {
                hint.innerHTML = '<span class="icon">🖊️</span><span>编辑模式：点击座位切换可选性（灰色=禁用） | 点击下方按钮保存或取消</span>';
            } else {
                hint.innerHTML = '<span class="icon"></span><span>点击座位选座</span>';
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

/* ==================== Seat Click Dispatcher ==================== */
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