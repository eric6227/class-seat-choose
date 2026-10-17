const API = {
    baseUrl: '/api',
    _sessionRole: null,
    _sessionStudentName: null,
    _tokenExpiredHandled: false,

    setSession(role, studentName) {
        this._sessionRole = role;
        this._sessionStudentName = studentName || null;
    },

    clearSession() {
        this._sessionRole = null;
        this._sessionStudentName = null;
    },

    getSession() {
        if (this._sessionRole) {
            return { role: this._sessionRole, studentName: this._sessionStudentName };
        }
        return null;
    },

    async restoreSession() {
        try {
            this._suppressTokenExpiredModal = true;
            var me = await this.auth.me();
            this.setSession(me.role, me.student_name || null);
            return { role: me.role, studentName: me.student_name || null };
        } catch (e) {
            return null;
        } finally {
            this._suppressTokenExpiredModal = false;
        }
    },

    _handleTokenExpired() {
        if (this._tokenExpiredHandled) return;
        if (this._suppressTokenExpiredModal) return;
        this._tokenExpiredHandled = true;
        this.clearSession();
        if (typeof showSessionExpiredModal === 'function') {
            showSessionExpiredModal();
        } else {
            alert('登录已过期，请重新登录');
            window.location.reload();
        }
    },

    _getCsrfToken() {
        var match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
        return match ? match[1] : '';
    },

    headers() {
        var h = { 'Content-Type': 'application/json' };
        var csrf = this._getCsrfToken();
        if (csrf) {
            h['X-CSRF-Token'] = csrf;
        }
        return h;
    },

    async request(method, path, body) {
        const opts = { method, headers: this.headers(), credentials: 'include' };
        if (body !== undefined) {
            opts.body = JSON.stringify(body);
        }
        const resp = await fetch(this.baseUrl + path, opts);
        let data;
        try {
            data = await resp.json();
        } catch (e) {
            throw new Error('服务器响应异常 (' + resp.status + ')');
        }
        if (!resp.ok) {
            if (resp.status === 401) {
                this._handleTokenExpired();
            }
            var raw = data.detail || data.message;
            var msg;
            if (typeof raw === 'string') {
                msg = raw;
            } else if (Array.isArray(raw)) {
                msg = raw.map(function (e) { return e.msg || JSON.stringify(e); }).join('; ');
            } else if (raw && typeof raw === 'object') {
                msg = JSON.stringify(raw);
            } else {
                msg = '请求失败 (' + resp.status + ')';
            }
            const err = new Error(msg);
            err.status = resp.status;
            throw err;
        }
        return data;
    },

    get(path) { return this.request('GET', path); },
    post(path, body) { return this.request('POST', path, body); },
    put(path, body) { return this.request('PUT', path, body); },
    delete(path) { return this.request('DELETE', path); },

    async upload(path, formData) {
        const h = {};
        const csrf = this._getCsrfToken();
        if (csrf) {
            h['X-CSRF-Token'] = csrf;
        }
        const opts = { method: 'POST', body: formData, credentials: 'include', headers: h };
        const resp = await fetch(this.baseUrl + path, opts);
        let data;
        try {
            data = await resp.json();
        } catch (e) {
            throw new Error('服务器响应异常 (' + resp.status + ')');
        }
        if (!resp.ok) {
            if (resp.status === 401) {
                this._handleTokenExpired();
            }
            var raw = data.detail || data.message;
            var msg;
            if (typeof raw === 'string') {
                msg = raw;
            } else if (Array.isArray(raw)) {
                msg = raw.map(function (e) { return e.msg || JSON.stringify(e); }).join('; ');
            } else if (raw && typeof raw === 'object') {
                msg = JSON.stringify(raw);
            } else {
                msg = '请求失败 (' + resp.status + ')';
            }
            const err = new Error(msg);
            err.status = resp.status;
            throw err;
        }
        return data;
    },

    auth: {
        checkSetup() { return API.get('/auth/check-setup'); },
        setupTeacher(password, setupToken) { return API.post('/auth/setup', { password, setup_token: setupToken }); },
        teacherLogin(password) { return API.post('/auth/teacher/login', { password }); },
        studentLogin(name, password) { return API.post('/auth/student/login', { name, password }); },
        studentRegister(name, password, confirmPassword) {
            return API.post('/auth/student/register', { name, password, confirm_password: confirmPassword });
        },
        checkStudent(name) { return API.get('/auth/check-student/' + encodeURIComponent(name)); },
        me() { return API.get('/auth/me'); },
        logout() { return API.post('/auth/logout'); },
    },

    async download(path) {
        var opts = { credentials: 'include' };
        var resp = await fetch(this.baseUrl + path, opts);
        if (!resp.ok) {
            var msg;
            try {
                var data = await resp.json();
                var raw = data.detail || data.message;
                if (typeof raw === 'string') msg = raw;
                else if (Array.isArray(raw)) msg = raw.map(function(e) { return e.msg || JSON.stringify(e); }).join('; ');
                else msg = '下载失败 (' + resp.status + ')';
            } catch (e) {
                msg = '下载失败 (' + resp.status + ')';
            }
            throw new Error(msg);
        }
        return resp;
    },

    seats: {
        getState() { return API.get('/seats/state'); },
        assign(seatId, studentName, companionName) {
            return API.post('/seats/assign', { seat_id: seatId, student_name: studentName, companion_name: companionName });
        },
        swap(srcSeatId, dstSeatId) {
            return API.post('/seats/swap', { src_seat_id: srcSeatId, dst_seat_id: dstSeatId });
        },
        clear(seatId) { return API.post('/seats/clear', { seat_id: seatId }); },
        next() { return API.post('/seats/next'); },
        undo() { return API.post('/seats/undo'); },
        reset(password) { return API.post('/seats/reset', { teacher_password: password }); },
        updateState(data) { return API.put('/seats/state', data); },
        exportData(password) {
            return API.post('/seats/export', { password: password || null });
        },
        exportXlsx() { return API.get('/seats/export-xlsx'); },
        importData(file, password) {
            var formData = new FormData();
            formData.append('file', file);
            if (password) formData.append('password', password);
            return API.upload('/seats/import', formData);
        },
    },

    students: {
        list() { return API.get('/seats/students'); },
        names() { return API.get('/seats/students/names'); },
    },

    wishes: {
        getAll() { return API.get('/seats/wishes'); },
        getMine(studentName) { return API.get('/seats/wishes/' + encodeURIComponent(studentName)); },
        save(wishes) { return API.post('/seats/wishes/save', { wishes }); },
    },

    teacher: {
        getStudents() { return API.get('/seats/students/status'); },
        resetPassword(studentName) {
            return API.post('/seats/students/reset-password', { student_name: studentName });
        },
        seedDemo() { return API.post('/seats/seed-demo'); },
        importXlsx(file) {
            const formData = new FormData();
            formData.append('file', file);
            return API.upload('/seats/import-xlsx', formData);
        },
        resetData(password) { return API.post('/seats/reset-data', { teacher_password: password }); },
        getLayout() { return API.get('/seats/layout'); },
        updateLayout(data) { return API.post('/seats/layout', data); },
        toggleSeatDisable(seatId) { return API.post('/seats/seats/' + seatId + '/toggle-disable'); },
        undoRound() { return API.post('/seats/undo-round'); },
        autoLockWishes(quota) { return API.post('/seats/auto-lock-wishes', { quota }); },
        clearSeats(password) { return API.post('/seats/clear-seats', { teacher_password: password }); },
    },

    rounds: {
        list() { return API.get('/seats/rounds'); },
        current() { return API.get('/seats/rounds/current'); },
        start(data) { return API.post('/seats/rounds/start', data || {}); },
        complete(roundId) { return API.post('/seats/rounds/' + roundId + '/complete'); },
        update(roundId, data) { return API.put('/seats/rounds/' + roundId, data); },
        getResults(roundId) { return API.get('/seats/rounds/' + roundId + '/results'); },
    },
};