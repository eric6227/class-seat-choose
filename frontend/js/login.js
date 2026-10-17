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

/* ==================== Setup Wizard ==================== */
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
                if (getPageName() === 'login') {
                    window.location.href = 'teacher.html';
                } else {
                    enterTeacherMode();
                }
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