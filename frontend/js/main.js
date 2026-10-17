/* ==================== Init ==================== */
async function initApp() {
    var pageName = getPageName();

    if (pageName === 'login') {
        initLoginPage();
    } else if (pageName === 'teacher') {
        initTeacherPage();
    } else if (pageName === 'student') {
        initStudentPage();
    } else if (pageName === 'student-manage') {
        initStudentManagePage();
    } else {
        initSpaMode();
    }

    window.addEventListener('hashchange', function () {
        location.reload();
    });
}

function initLoginPage() {
    var session = API.getSession();
    if (session && session.role === 'teacher') {
        window.location.href = 'teacher.html';
        return;
    }
    if (session && session.role === 'student') {
        window.location.href = 'student.html';
        return;
    }

    API.restoreSession().then(function(session) {
        if (session && session.role === 'teacher') {
            window.location.href = 'teacher.html';
            return;
        }
        if (session && session.role === 'student') {
            window.location.href = 'student.html';
            return;
        }
        showLoginNormally();
    }).catch(function() {
        showLoginNormally();
    });

    function showLoginNormally() {
        tryCheckSetup();
        bindLoginEventsForSplit();
    }
}

function initTeacherPage() {
    API.restoreSession().then(function(session) {
        if (session && session.role === 'teacher') {
            enterTeacherMode();
        } else {
            window.location.href = 'login.html';
        }
    }).catch(function() {
        window.location.href = 'login.html';
    });
}

function initStudentPage() {
    API.restoreSession().then(function(session) {
        if (session && session.role === 'student') {
            enterStudentModeDirect(session.studentName || '');
        } else {
            window.location.href = 'login.html';
        }
    }).catch(function() {
        window.location.href = 'login.html';
    });
}

function initStudentManagePage() {
    API.restoreSession().then(function(session) {
        if (session && session.role === 'teacher') {
            showStudentManagementPanel();
        } else {
            window.location.href = 'login.html';
        }
    }).catch(function() {
        window.location.href = 'login.html';
    });
}

function initSpaMode() {
    API.restoreSession().then(function(session) {
        if (session && session.role === 'teacher') {
            enterTeacherMode();
        } else if (session && session.role === 'student') {
            enterStudentModeDirect(session.studentName || '');
        } else {
            showSpaLogin();
        }
    }).catch(function() {
        showSpaLogin();
    });

    function showSpaLogin() {
        tryCheckSetup();
        bindLoginEventsForSplit();
    }
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

function bindLoginEventsForSplit() {
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
        if (!pwd || pwd.length < 10) {
            errorEl.textContent = '密码至少10位，且需包含大小写字母和数字';
            return;
        }
        if (!/[a-z]/.test(pwd) || !/[A-Z]/.test(pwd) || !/\d/.test(pwd)) {
            errorEl.textContent = '密码必须包含大小写字母和数字';
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
            if (getPageName() === 'login') {
                window.location.href = 'teacher.html';
            } else {
                enterTeacherMode();
            }
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
            if (getPageName() === 'login') {
                window.location.href = 'student.html';
            } else {
                enterStudentModeDirect(resp.username || displayNameEl.textContent);
            }
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
        if (pwd.length < 10) { showError('密码长度至少10位，且需包含大小写字母和数字'); return; }
        if (!/[a-z]/.test(pwd) || !/[A-Z]/.test(pwd) || !/\d/.test(pwd)) { showError('密码必须包含大小写字母和数字'); return; }
        showLoading('注册中...');
        try {
            var resp = await studentRegisterAction(name, pwd, confirmPwd);
            pwd = null;
            confirmPwd = null;
            document.getElementById('newPasswordInput').value = '';
            document.getElementById('confirmPasswordInput').value = '';
            hideLoading();
            if (getPageName() === 'login') {
                window.location.href = 'student.html';
            } else {
                enterStudentModeDirect(resp.username || displayNameEl.textContent);
            }
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

    var studentLogoutBtn = document.getElementById('studentLogoutBtn2');
    if (studentLogoutBtn) studentLogoutBtn.onclick = function () { logout(); };

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

document.addEventListener('DOMContentLoaded', function () {
    initApp();
});