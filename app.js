// ══════════════════════════════════════════
// Firebase 数据同步
// ══════════════════════════════════════════
let db = null;          // Firebase Realtime Database 实例
let _syncLock = false;  // 防止本地写入触发重复渲染

function initFirebase() {
    try {
        const app = firebase.initializeApp(window.FIREBASE_CONFIG);
        db = firebase.database(app);
        console.log('[Firebase] 初始化成功');
    } catch (e) {
        // 已经初始化过（页面刷新等情况）
        db = firebase.database();
    }
}

// 写入数据库（防抖，300ms 内多次调用只执行最后一次）
const _dbWriteTimers = {};
function dbSet(path, value) {
    if (!db) return;
    clearTimeout(_dbWriteTimers[path]);
    _dbWriteTimers[path] = setTimeout(() => {
        _syncLock = true;
        db.ref(path).set(value === undefined ? null : value)
            .then(() => { setSyncStatus('saved'); })
            .catch(e => { console.error('[Firebase] 写入失败', e); setSyncStatus('error'); })
            .finally(() => { setTimeout(() => { _syncLock = false; }, 500); });
    }, 300);
}

// 设置顶部同步状态指示
function setSyncStatus(state) {
    const el = document.getElementById('sync-indicator');
    if (!el) return;
    if (state === 'saving') { el.textContent = '⏳ 同步中…'; el.className = 'text-xs text-slate-400'; }
    else if (state === 'saved')  { el.textContent = '✅ 已同步'; el.className = 'text-xs text-green-500'; setTimeout(() => { el.textContent = ''; }, 2000); }
    else if (state === 'error')  { el.textContent = '❌ 同步失败'; el.className = 'text-xs text-red-500'; }
}

// 登录成功后调用：加载数据 + 设置实时监听
function loadAllDataAndListen() {
    if (!db) return;
    setSyncStatus('saving');

    // 全局规则库
    db.ref('globalRulesDB').on('value', snap => {
        const val = snap.val();
        if (val && !_syncLock) {
            globalRulesDB = Array.isArray(val) ? val : Object.values(val);
            renderManageTable();
            updateDeprecatedBtnText();
        } else if (!val) {
            globalRulesDB = [];
            renderManageTable();
        }
    });

    // 医院列表
    db.ref('hospitals').on('value', snap => {
        const val = snap.val();
        if (val && !_syncLock) {
            hospitals = Array.isArray(val) ? val : Object.values(val);
            renderHospitalCards();
        }
    });

    // 医院定制覆写
    db.ref('allHospitalOverrides').on('value', snap => {
        const val = snap.val();
        if (!_syncLock) {
            allHospitalOverrides = val || { 'h_default': {} };
            if (currentHospitalId) renderOverrideTable();
        }
    });

    // 词根表
    db.ref('wordRootsDB').on('value', snap => {
        const val = snap.val();
        if (val && !_syncLock) {
            wordRootsDB = Array.isArray(val) ? val : Object.values(val);
            renderWordRootTable();
            updateWrDeprecatedBtnText();
            saveWordRootsToDB();
        } else if (!val) {
            wordRootsDB = [];
            renderWordRootTable();
        }
    });

    setSyncStatus('saved');
}

// 各数据集的保存快捷函数
function saveGlobalRulesToDB()   { setSyncStatus('saving'); dbSet('globalRulesDB', globalRulesDB); }
function saveHospitalsToDB()     { setSyncStatus('saving'); dbSet('hospitals', hospitals); }
function saveOverridesToDB()     { setSyncStatus('saving'); dbSet('allHospitalOverrides', allHospitalOverrides); }
function saveWordRootsToDB()     { setSyncStatus('saving'); dbSet('wordRootsDB', wordRootsDB); }

// ══════════════════════════════════════════
// 用户与登录
// ══════════════════════════════════════════
const USERS = [
    { username: 'admin', password: 'admin123', displayName: '系统管理员', avatarColor: '#2563eb' },
    { username: 'zhang', password: '123456',   displayName: '张主任',     avatarColor: '#16a34a' },
    { username: 'li',    password: '123456',   displayName: '李医生',     avatarColor: '#9333ea' },
];

let currentUser = null;

function doLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    if (!username || !password) { errEl.textContent = '请输入账号和密码'; return; }
    const user = USERS.find(u => u.username === username && u.password === password);
    if (!user) { errEl.textContent = '账号或密码错误，请重试'; return; }
    currentUser = user;
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    const nameEl = document.getElementById('header-user-name');
    const avatarEl = document.getElementById('header-user-avatar');
    nameEl.textContent = user.displayName;
    avatarEl.textContent = user.displayName[0];
    avatarEl.style.backgroundColor = user.avatarColor;
    renderManageTable();
    renderHospitalCards();
    renderDeptDropdown('');
    // Firebase：初始化并拉取云端数据
    initFirebase();
    loadAllDataAndListen();
}

function doLogout() {
    if (!confirm('确认退出登录？')) return;
    currentUser = null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-overlay').classList.remove('hidden');
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').textContent = '';
}

// ══════════════════════════════════════════
// 数据
// ══════════════════════════════════════════
const departmentsData = [
    { group: "常用科室", items: ["皮肤科", "肛门直肠科", "呼吸内科", "全科医学科"] }
];

let globalRulesDB = [];
let hospitals = [{ id: 'h_default', name: '华西体检中心' }];
let currentHospitalId = null;
let allHospitalOverrides = { 'h_default': {} };
let wordRootsDB = [];

// 视图开关
let showModifyInfo = false;
let showDeprecated = true;
let showOvDeprecated = true;
let showOvModifyInfo = false;
let showWrDeprecated = true;
let showWrModifyInfo = false;

function today() {
    return new Date().toISOString().slice(0, 10);
}

function getCurrentOverrides() {
    if (!currentHospitalId) return {};
    return allHospitalOverrides[currentHospitalId] || {};
}

// ══════════════════════════════════════════
// Toast
// ══════════════════════════════════════════
function showToast(title, message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
    const iconColor = type === 'success' ? 'text-green-500' : 'text-red-500';
    const iconSvg = type === 'success'
        ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
        : '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    toast.className = `toast-enter p-4 rounded-lg shadow-lg border ${bgColor} flex items-start gap-3 w-80 pointer-events-auto`;
    toast.innerHTML = `<div class="${iconColor} shrink-0 mt-0.5">${iconSvg}</div><div><h4 class="font-bold text-sm text-slate-800">${title}</h4><p class="text-xs text-slate-600 mt-0.5 whitespace-pre-line">${message}</p></div>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0'; toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'all 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ══════════════════════════════════════════
// Excel 工具
// ══════════════════════════════════════════
function getExcelValue(row, possibleKeys) {
    for (let actualKey in row) {
        const cleanKey = actualKey.replace(/\s+/g, '');
        if (possibleKeys.includes(cleanKey)) {
            return row[actualKey] !== undefined ? String(row[actualKey]).trim() : '';
        }
    }
    return '';
}

function exportExcel() {
    const exportData = globalRulesDB.sort((a,b) => b.severity - a.severity).map(r => ({
        '状态':     r.isDeprecated ? '已弃用' : '正常',
        '规则编号': r.rule_code,
        '适用人群': r.gender === '男女通用' ? '' : r.gender,
        '科室':     r.dept,
        '部位':     r.part,
        '严重程度': r.severity === 0 ? '' : r.severity,
        '标签':     r.label,
        '规则转写': r.expression,
        '主检建议': r.advice,
        '修改日期': r.updatedAt || '',
        '修改人':   r.updatedBy || '',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [{wch:8},{wch:15},{wch:10},{wch:15},{wch:15},{wch:10},{wch:20},{wch:40},{wch:60},{wch:12},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "全局规则库");
    XLSX.writeFile(wb, `标准库_${today()}.xlsx`);
    showToast("导出成功", "Excel 已下载，包含弃用状态与修改记录。");
}

function openExportOverrideModal() {
    if (!currentHospitalId) { showToast('请先选择医院', '', 'error'); return; }
    document.getElementById('exportOverrideModal').classList.remove('hidden');
}

function confirmExportOverride() {
    document.getElementById('exportOverrideModal').classList.add('hidden');
    const mode = document.querySelector('input[name="export-ov-mode"]:checked').value;
    exportOverrideExcel(mode === 'withGlobal');
}

function exportOverrideExcel(includeGlobal = true) {
    if (!currentHospitalId) { showToast('请先选择医院', '', 'error'); return; }
    const h = hospitals.find(x => x.id === currentHospitalId);
    const hospitalOverrides = getCurrentOverrides();
    const activeRules = globalRulesDB.filter(r => !r.isDeprecated);

    let exportData;
    let colWidths;

    if (includeGlobal) {
        // 包含全局对比：全局值 + 定制值并列
        exportData = activeRules.map(base => {
            const ov = hospitalOverrides[base.id] || {};
            const isOvDep = !!ov.isDeprecated;
            const hasOv = Object.keys(ov).filter(k => !['isDeprecated','updatedAt','updatedBy'].includes(k)).length > 0;
            return {
                '本院状态':     isOvDep ? '本院弃用' : hasOv ? '已定制' : '继承全局',
                '规则编号':     base.rule_code,
                '适用人群':     base.gender === '男女通用' ? '' : base.gender,
                '全局科室':     base.dept,            '定制科室':     ov.dept       !== undefined ? ov.dept       : '',
                '全局部位':     base.part,            '定制部位':     ov.part       !== undefined ? ov.part       : '',
                '全局严重程度': base.severity === 0 ? '' : base.severity,
                '定制严重程度': ov.severity   !== undefined ? ov.severity   : '',
                '全局标签':     base.label,           '定制标签':     ov.label      !== undefined ? ov.label      : '',
                '全局规则转写': base.expression,
                '定制规则转写': ov.expression !== undefined ? ov.expression : '',
                '全局主检建议': base.advice,
                '定制主检建议': ov.advice     !== undefined ? ov.advice     : '',
                '修改日期':     ov.updatedAt  || '',
                '修改人':       ov.updatedBy  || '',
            };
        });
        colWidths = [{wch:8},{wch:14},{wch:8},{wch:14},{wch:14},{wch:12},{wch:12},{wch:10},{wch:10},{wch:18},{wch:18},{wch:36},{wch:36},{wch:50},{wch:50},{wch:12},{wch:12}];
    } else {
        // 仅定制内容：显示最终生效值，不含全局原始列
        exportData = activeRules.map(base => {
            const ov = hospitalOverrides[base.id] || {};
            const isOvDep = !!ov.isDeprecated;
            const hasOv = Object.keys(ov).filter(k => !['isDeprecated','updatedAt','updatedBy'].includes(k)).length > 0;
            return {
                '本院状态':   isOvDep ? '本院弃用' : hasOv ? '已定制' : '继承全局',
                '规则编号':   base.rule_code,
                '适用人群':   base.gender === '男女通用' ? '' : base.gender,
                '科室':       ov.dept       !== undefined ? ov.dept       : base.dept,
                '部位':       ov.part       !== undefined ? ov.part       : base.part,
                '严重程度':   ov.severity   !== undefined ? ov.severity   : (base.severity === 0 ? '' : base.severity),
                '标签':       ov.label      !== undefined ? ov.label      : base.label,
                '规则转写':   ov.expression !== undefined ? ov.expression : base.expression,
                '主检建议':   ov.advice     !== undefined ? ov.advice     : base.advice,
                '修改日期':   ov.updatedAt  || '',
                '修改人':     ov.updatedBy  || '',
            };
        });
        colWidths = [{wch:8},{wch:14},{wch:8},{wch:14},{wch:14},{wch:10},{wch:20},{wch:36},{wch:50},{wch:12},{wch:12}];
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "医院定制库");
    XLSX.writeFile(wb, `${h.name}_定制库_${today()}.xlsx`);
    const modeLabel = includeGlobal ? '含全局对比' : '仅定制内容';
    showToast('导出成功', `${h.name} 定制表已下载（${modeLabel}）`);
}

function importExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
            let importedCount = 0, updatedCount = 0;
            json.forEach(row => {
                const ruleCode = getExcelValue(row, ['规则编号', '编号', 'rule_code']);
                if (!ruleCode) return;
                const newRule = {
                    id: 'm' + Date.now() + Math.floor(Math.random()*1000),
                    rule_code: ruleCode,
                    gender: getExcelValue(row, ['适用人群','人群','性别']) || '男女通用',
                    dept: getExcelValue(row, ['科室','所属科室']),
                    part: getExcelValue(row, ['部位','检查部位']),
                    severity: parseInt(getExcelValue(row, ['严重程度','严重度'])) || 0,
                    label: getExcelValue(row, ['标签','结论标签','结论词']),
                    expression: getExcelValue(row, ['规则转写','表达式','规则表达式']),
                    advice: getExcelValue(row, ['主检建议','建议','结论建议']),
                    isDeprecated: false,
                    updatedAt: today(),
                    updatedBy: currentUser ? `${currentUser.displayName}（导入）` : '导入',
                };
                const existingIdx = globalRulesDB.findIndex(r => r.rule_code === newRule.rule_code);
                if (existingIdx > -1) {
                    newRule.id = globalRulesDB[existingIdx].id;
                    newRule.isDeprecated = globalRulesDB[existingIdx].isDeprecated; // 保留弃用状态
                    globalRulesDB[existingIdx] = newRule;
                    updatedCount++;
                } else {
                    globalRulesDB.push(newRule);
                    importedCount++;
                }
            });
            showToast("导入成功", `新增：${importedCount} 条\n更新：${updatedCount} 条`);
            renderManageTable();
            updateDeprecatedBtnText();
            saveGlobalRulesToDB();
        } catch (error) {
            showToast("导入失败", "请检查 Excel 格式是否正确。", "error");
            console.error(error);
        }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

// ══════════════════════════════════════════
// 全局标准库 - 表格渲染
// ══════════════════════════════════════════
function renderManageTable() {
    let rules = [...globalRulesDB].sort((a,b) => b.severity - a.severity);
    if (!showDeprecated) rules = rules.filter(r => !r.isDeprecated);

    if (rules.length === 0) {
        const msg = globalRulesDB.length === 0
            ? '暂无数据，请点击右上角导入 Excel'
            : '所有弃用规则已隐藏，点击"显示已弃用"查看';
        document.getElementById('mergeTableBody').innerHTML =
            `<tr><td colspan="11" class="p-8 text-center text-slate-400">${msg}</td></tr>`;
        return;
    }

    document.getElementById('mergeTableBody').innerHTML = rules.map(r => {
        const dep = r.isDeprecated;
        const severityClass = dep ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-red-50 text-red-600 border-red-200';
        const labelClass    = dep ? 'bg-slate-50 text-slate-400 border-slate-200' : 'bg-yellow-50 text-slate-700 border-yellow-200 font-medium';
        const codeClass     = dep ? 'line-through text-slate-400' : 'text-slate-700 font-bold';
        return `
        <tr class="${dep ? 'deprecated-row' : 'hover:bg-blue-50/30 transition'}">
            <td class="p-3 font-mono text-xs ${codeClass}">
                ${r.rule_code}
                ${dep ? '<span class="deprecated-badge">已弃用</span>' : ''}
            </td>
            <td class="p-3 text-center">
                <span class="px-2 py-1 rounded text-xs shadow-sm ${dep ? 'bg-slate-100 text-slate-400 border border-slate-200' : r.gender==='男'?'gender-tag-male':r.gender==='女'?'gender-tag-female':'gender-tag-all'}">
                    ${r.gender}
                </span>
            </td>
            <td class="p-3 text-xs">${r.dept || '-'}</td>
            <td class="p-3 text-xs">${r.part || '-'}</td>
            <td class="p-3 text-center">
                <span class="px-2 py-0.5 rounded font-mono font-bold text-xs border ${severityClass}">${r.severity}</span>
            </td>
            <td class="p-3 text-xs max-w-[140px]">
                <span class="px-2 py-1 rounded border text-xs block break-words ${labelClass}">${r.label || '-'}</span>
            </td>
            <td class="p-3 max-w-[180px]">
                <code class="text-[11px] ${dep ? 'text-slate-400' : 'text-blue-700'} bg-slate-100 p-1.5 rounded block truncate" title="${r.expression || ''}">${r.expression || '-'}</code>
            </td>
            <td class="p-3 text-xs max-w-[220px] truncate ${dep ? 'text-slate-400' : 'text-slate-600'}" title="${r.advice || ''}">${r.advice || '-'}</td>
            <td class="p-3 text-xs text-center modify-col text-amber-700">${r.updatedAt || '-'}</td>
            <td class="p-3 text-xs text-center modify-col text-amber-700">${r.updatedBy || '-'}</td>
            <td class="p-3 text-center sticky right-0 ${dep ? 'bg-slate-50' : 'bg-white'} shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]">
                <div class="flex flex-col items-center gap-1">
                    ${!dep ? `<button onclick="openMergeModal('${r.id}')" class="text-blue-600 hover:text-blue-800 font-semibold text-xs">编辑</button>` : ''}
                    ${dep
                        ? `<button onclick="restoreRule('${r.id}')" class="text-green-600 hover:text-green-800 font-semibold text-xs">恢复启用</button>`
                        : `<button onclick="openDeprecateModal('${r.id}')" class="text-slate-400 hover:text-red-500 text-xs">弃用</button>`
                    }
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ══════════════════════════════════════════
// 弃用 / 恢复
// ══════════════════════════════════════════
let pendingDeprecateId = null;

function openDeprecateModal(id, mode = 'global') {
    const modal = document.getElementById('deprecateConfirmModal');
    modal.dataset.mode = mode;
    modal.dataset.targetId = id;
    if (mode === 'wr') {
        const r = wordRootsDB.find(x => x.id === id);
        document.getElementById('deprecate-rule-code').textContent = r ? r.fine : id;
    } else if (mode === 'ov') {
        pendingOvDeprecateId = id;
        const rule = globalRulesDB.find(r => r.id === id);
        document.getElementById('deprecate-rule-code').textContent = rule ? `${rule.rule_code}（本院弃用，不影响全局）` : id;
    } else {
        pendingDeprecateId = id;
        const rule = globalRulesDB.find(r => r.id === id);
        document.getElementById('deprecate-rule-code').textContent = rule ? rule.rule_code : id;
    }
    modal.classList.remove('hidden');
}
function closeDeprecateModal() {
    document.getElementById('deprecateConfirmModal').classList.add('hidden');
    pendingDeprecateId = null;
}
function confirmDeprecate() {
    const rule = globalRulesDB.find(r => r.id === pendingDeprecateId);
    if (!rule) return;
    rule.isDeprecated = true;
    rule.updatedAt = today();
    rule.updatedBy = currentUser ? currentUser.displayName : '-';
    closeDeprecateModal();
    renderManageTable();
    updateDeprecatedBtnText();
    showToast('已弃用', `规则 ${rule.rule_code} 已标记为弃用，导出时保留。`);
    saveGlobalRulesToDB();
}
function restoreRule(id) {
    const rule = globalRulesDB.find(r => r.id === id);
    if (!rule) return;
    rule.isDeprecated = false;
    rule.updatedAt = today();
    rule.updatedBy = currentUser ? currentUser.displayName : '-';
    renderManageTable();
    updateDeprecatedBtnText();
    showToast('已恢复', `规则 ${rule.rule_code} 已恢复启用。`);
    saveGlobalRulesToDB();
}

// ══════════════════════════════════════════
// 切换：显示修改记录 / 显示已弃用
// ══════════════════════════════════════════
function toggleModifyInfo() {
    showModifyInfo = !showModifyInfo;
    document.getElementById('manage-table-wrapper').classList.toggle('hide-modify-cols', !showModifyInfo);
    document.getElementById('btn-modify-info').textContent = showModifyInfo ? '🕐 隐藏修改记录' : '🕐 显示修改记录';
}
function toggleShowDeprecated() {
    showDeprecated = !showDeprecated;
    renderManageTable();
    updateDeprecatedBtnText();
}
function updateDeprecatedBtnText() {
    const count = globalRulesDB.filter(r => r.isDeprecated).length;
    document.getElementById('btn-show-deprecated').textContent = showDeprecated
        ? `👁 隐藏已弃用 (${count})`
        : `👁 显示已弃用 (${count})`;
}

// ══════════════════════════════════════════
// 医院定制库 - 多医院管理
// ══════════════════════════════════════════
function renderHospitalCards() {
    const grid = document.getElementById('hospital-cards');
    const empty = document.getElementById('hospital-empty');
    if (hospitals.length === 0) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    grid.innerHTML = hospitals.map(h => {
        const overrides = allHospitalOverrides[h.id] || {};
        const count = Object.keys(overrides).length;
        return `
        <div onclick="selectHospital('${h.id}')" class="cursor-pointer bg-white rounded-xl border-2 border-slate-200 hover:border-amber-400 p-5 transition hover:shadow-lg group">
            <div class="flex items-start justify-between mb-4">
                <div class="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-2xl group-hover:bg-amber-100 transition">🏥</div>
                <span class="text-xs px-2.5 py-1 rounded-full font-medium border ${count > 0 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-slate-400 bg-slate-50 border-slate-200'}">
                    ${count > 0 ? count + ' 条已定制' : '未定制'}
                </span>
            </div>
            <h3 class="font-bold text-slate-800 text-sm">${h.name}</h3>
            <p class="text-xs text-slate-400 mt-1">点击进入定制管理 →</p>
        </div>`;
    }).join('');
}

function selectHospital(id) {
    currentHospitalId = id;
    const h = hospitals.find(x => x.id === id);
    document.getElementById('ov-breadcrumb-hospital-name').textContent = h.name;
    document.getElementById('ov-table-breadcrumb-hospital').textContent = h.name;
    document.getElementById('ov-table-hospital-name').textContent = h.name;
    document.getElementById('ov-hospital-label').textContent = h.name;
    const count = Object.keys(allHospitalOverrides[id] || {}).length;
    document.getElementById('ov-continue-desc').textContent = count > 0 ? `已有 ${count} 条定制，点击继续编辑` : '暂无定制条目，请先选择数据来源';
    showOverridePage('source');
}
function goToHospitals() { currentHospitalId = null; renderHospitalCards(); showOverridePage('hospitals'); }
function goToSource() { showOverridePage('source'); }
function goToTable() { renderOverrideTable(); showOverridePage('table'); }
function showOverridePage(page) {
    ['hospitals','source','table'].forEach(p => document.getElementById(`ov-page-${p}`).classList.add('hidden'));
    document.getElementById(`ov-page-${page}`).classList.remove('hidden');
}

function openAddHospitalModal() {
    document.getElementById('new-hospital-name').value = '';
    document.getElementById('addHospitalModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('new-hospital-name').focus(), 100);
}
function closeAddHospitalModal() { document.getElementById('addHospitalModal').classList.add('hidden'); }
function saveNewHospital() {
    const name = document.getElementById('new-hospital-name').value.trim();
    if (!name) { showToast('请填写医院名称', '', 'error'); return; }
    const id = 'h_' + Date.now();
    hospitals.push({ id, name });
    allHospitalOverrides[id] = {};
    closeAddHospitalModal();
    renderHospitalCards();
    showToast('新增成功', `已成功新增医院：${name}`);
    saveHospitalsToDB();
    saveOverridesToDB();
}

function chooseImportExcel() { document.getElementById('hospital-excel-upload').click(); }
function importHospitalExcel(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
            let count = 0;
            if (!allHospitalOverrides[currentHospitalId]) allHospitalOverrides[currentHospitalId] = {};
            json.forEach(row => {
                const ruleCode = getExcelValue(row, ['规则编号','编号','rule_code']);
                if (!ruleCode) return;
                const base = globalRulesDB.find(r => r.rule_code === ruleCode);
                if (!base) return;
                const ov = {};
                const advice = getExcelValue(row, ['主检建议','建议','定制建议']);
                const severity = getExcelValue(row, ['严重程度','严重度','定制严重程度']);
                if (advice && advice !== base.advice) ov.advice = advice;
                if (severity && parseInt(severity) !== base.severity) ov.severity = parseInt(severity);
                if (Object.keys(ov).length > 0) { allHospitalOverrides[currentHospitalId][base.id] = ov; count++; }
            });
            showToast('导入成功', `已从 Excel 导入 ${count} 条定制项`);
            goToTable();
            saveOverridesToDB();
        } catch(err) { showToast('导入失败', '请检查文件格式', 'error'); }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}
function chooseReferenceGlobal() {
    const active = globalRulesDB.filter(r => !r.isDeprecated);
    if (active.length === 0) { showToast('全局库为空', '请先在全局标准库中导入有效数据', 'error'); return; }
    if (!confirm(`将把全局标准库的 ${active.length} 条有效数据复制为本院初始定制，确认继续？`)) return;
    const overrides = {};
    active.forEach(r => { if (r.advice) overrides[r.id] = { advice: r.advice, severity: r.severity }; });
    allHospitalOverrides[currentHospitalId] = overrides;
    showToast('引用成功', `已引用全局库 ${Object.keys(overrides).length} 条数据作为初始定制`);
    goToTable();
}

// ══════════════════════════════════════════
// Override 表格
// ══════════════════════════════════════════
function renderOverrideTable() {
    const hospitalOverrides = getCurrentOverrides();
    let activeRules = globalRulesDB.filter(r => !r.isDeprecated);
    if (!showOvDeprecated) {
        activeRules = activeRules.filter(r => {
            const ov = hospitalOverrides[r.id];
            return !(ov && ov.isDeprecated);
        });
    }
    if (activeRules.length === 0) {
        document.getElementById('overrideTableBody').innerHTML = `<tr><td colspan="11" class="p-8 text-center text-slate-400">暂无数据</td></tr>`;
        return;
    }

    // 辅助：渲染单个可覆写字段
    function ovCell(baseVal, ovVal, extraClass = '') {
        if (ovVal !== undefined && ovVal !== null && ovVal !== '') {
            return `<div class="text-[10px] text-amber-500 font-semibold mb-0.5">本院重写</div>
                    <div class="text-slate-800 font-medium ${extraClass}">${ovVal}</div>
                    <div class="text-[10px] text-slate-400 line-through mt-0.5">${baseVal || '-'}</div>`;
        }
        return `<div class="text-slate-600 ${extraClass}">${baseVal || '-'}</div>`;
    }

    document.getElementById('overrideTableBody').innerHTML = activeRules.map(base => {
        const override = hospitalOverrides[base.id] || {};
        const isOverridden = Object.keys(override).filter(k => !['isDeprecated','updatedAt','updatedBy','globalDirty'].includes(k)).length > 0;
        const isOvDep = !!override.isDeprecated;
        const isDirty = !!override.globalDirty && isOverridden;
        const rowClass = isOvDep
            ? 'deprecated-row'
            : isDirty ? 'is-overridden hover:bg-orange-50/50 border-l-4 border-l-orange-400'
            : isOverridden ? 'is-overridden hover:bg-amber-50/50' : 'hover:bg-slate-50';

        // 有效展示值（用于规则转写 title 属性）
        const effExpression = override.expression || base.expression || '';

        return `
        <tr class="${rowClass} transition">
            <td class="p-3 font-mono text-xs font-bold align-top ${isOvDep ? 'line-through' : 'text-slate-700'}">
                ${base.rule_code}
                ${isOvDep ? '<span class="deprecated-badge">本院弃用</span>' : ''}
                ${isDirty ? `<div class="mt-1"><span class="inline-flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-300 text-[10px] px-1.5 py-0.5 rounded font-semibold">⚠️ 全局已更新</span></div>` : ''}
            </td>
            <td class="p-3 text-center align-top">
                <span class="px-2 py-1 rounded text-xs shadow-sm ${isOvDep ? 'bg-slate-100 text-slate-400 border border-slate-200' : base.gender==='男'?'gender-tag-male':base.gender==='女'?'gender-tag-female':'gender-tag-all'}">${base.gender}</span>
            </td>
            <td class="p-3 text-xs align-top">${ovCell(base.dept, override.dept)}</td>
            <td class="p-3 text-xs align-top">${ovCell(base.part, override.part)}</td>
            <td class="p-3 text-center align-top">
                ${override.severity !== undefined
                    ? `<span class="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-mono font-bold text-xs">${override.severity}</span>
                       <div class="text-[10px] text-amber-500 mt-0.5 font-semibold">本院重写</div>
                       <div class="text-[10px] text-slate-400 line-through mt-0.5">${base.severity}</div>`
                    : `<span class="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded font-mono font-bold text-xs">${base.severity}</span>`
                }
            </td>
            <td class="p-3 align-top">
                ${override.label !== undefined
                    ? `<div class="text-[10px] text-amber-500 font-semibold mb-0.5">本院重写</div>
                       <span class="bg-amber-50 px-2 py-1 rounded border border-amber-200 text-slate-800 font-medium text-xs block break-words">${override.label}</span>
                       <span class="bg-slate-50 px-2 py-0.5 rounded border border-dashed border-slate-200 text-slate-400 text-[10px] block break-words line-through mt-1">${base.label || '-'}</span>`
                    : `<span class="bg-yellow-50 px-2 py-1 rounded border border-yellow-200 text-slate-700 font-medium text-xs block break-words">${base.label || '-'}</span>`
                }
            </td>
            <td class="p-3 align-top max-w-[200px]">
                ${override.expression !== undefined
                    ? `<div class="text-[10px] text-amber-500 font-semibold mb-0.5">本院重写</div>
                       <code class="text-[11px] text-amber-700 bg-amber-50 p-1.5 rounded block truncate border border-amber-100" title="${effExpression.replace(/"/g,'&quot;')}">${override.expression}</code>
                       <code class="text-[10px] text-slate-400 bg-slate-100 p-1 rounded block truncate line-through mt-1" title="${(base.expression||'').replace(/"/g,'&quot;')}">${base.expression || '-'}</code>`
                    : `<code class="text-[11px] text-blue-700 bg-slate-100 p-1.5 rounded block truncate" title="${(base.expression||'').replace(/"/g,'&quot;')}">${base.expression || '-'}</code>`
                }
            </td>
            <td class="p-3 text-xs align-top">
                ${isOverridden && override.advice !== undefined ? `
                    <div class="mb-1.5"><span class="tag-override">本院重写</span></div>
                    <div class="text-slate-800 bg-amber-50/60 p-2.5 rounded border border-amber-100 leading-relaxed whitespace-pre-wrap">${override.advice}</div>
                    <div class="mt-2 mb-1 text-[10px] text-slate-400 font-semibold">全局原文：</div>
                    <div class="text-slate-400 text-[10px] p-2 border border-dashed border-slate-200 rounded leading-relaxed whitespace-pre-wrap bg-white">${base.advice || '-'}</div>
                ` : `
                    <div class="text-slate-500 p-2 leading-relaxed whitespace-pre-wrap">${base.advice || '-'}</div>
                `}
            </td>
            <td class="p-3 text-xs text-center modify-col text-amber-700 align-top">${override.updatedAt || '-'}</td>
            <td class="p-3 text-xs text-center modify-col text-amber-700 align-top">${override.updatedBy || '-'}</td>
            <td class="p-3 text-center sticky right-0 align-top ${isOvDep ? 'bg-slate-50' : isOverridden ? 'bg-[#fffbeb]' : 'bg-white'}">
                <div class="flex flex-col items-center gap-1">
                    ${!isOvDep ? `<button onclick="openOverrideModal('${base.id}')" class="text-amber-600 font-bold hover:underline text-xs bg-amber-50 px-3 py-1 rounded border border-amber-200 whitespace-nowrap w-full">${isOverridden ? '修改定制' : '去定制'}</button>` : ''}
                    ${isOvDep
                        ? `<button onclick="restoreOvRule('${base.id}')" class="text-green-600 hover:text-green-800 font-semibold text-xs">恢复启用</button>`
                        : `<button onclick="openOvDeprecateModal('${base.id}')" class="text-slate-400 hover:text-red-500 text-xs">本院弃用</button>`
                    }
                    ${isOverridden && !isOvDep ? `<button onclick="resetOverride('${base.id}')" class="text-slate-400 hover:text-red-500 text-[10px] underline mt-0.5">清除定制</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

let currentOverrideId = null;
function openOverrideModal(id) {
    currentOverrideId = id;
    const base = globalRulesDB.find(x => x.id === id);
    const ov = getCurrentOverrides()[id] || {};
    // 头部信息
    document.getElementById('ov-code').innerText = base.rule_code;
    document.getElementById('ov-hospital-label').innerText = hospitals.find(h => h.id === currentHospitalId)?.name || '';
    // 全局参考值
    document.getElementById('ov-baseDept').innerText = base.dept || '-';
    document.getElementById('ov-basePart').innerText = base.part || '-';
    document.getElementById('ov-baseSeverity').innerText = base.severity;
    document.getElementById('ov-baseLabel').innerText = base.label || '-';
    document.getElementById('ov-baseExpression').innerText = base.expression || '-';
    document.getElementById('ov-standardText').innerText = base.advice || '无';
    // 定制输入框（有定制则填入，否则留空让用户看到继承提示）
    document.getElementById('ov-deptInput').value       = ov.dept       !== undefined ? ov.dept       : '';
    document.getElementById('ov-partInput').value       = ov.part       !== undefined ? ov.part       : '';
    document.getElementById('ov-severityInput').value   = ov.severity   !== undefined ? ov.severity   : '';
    document.getElementById('ov-labelInput').value      = ov.label      !== undefined ? ov.label      : '';
    document.getElementById('ov-expressionInput').value = ov.expression !== undefined ? ov.expression : '';
    document.getElementById('ov-overrideInput').value   = ov.advice     !== undefined ? ov.advice     : '';
    document.getElementById('overrideModal').classList.remove('hidden');
}
function closeOverrideModal() { document.getElementById('overrideModal').classList.add('hidden'); }

function saveOverride() {
    const base = globalRulesDB.find(x => x.id === currentOverrideId);
    const existing = getCurrentOverrides()[currentOverrideId] || {};
    const ov = {};

    const deptVal = document.getElementById('ov-deptInput').value.trim();
    if (deptVal !== '' && deptVal !== base.dept) ov.dept = deptVal;

    const partVal = document.getElementById('ov-partInput').value.trim();
    if (partVal !== '' && partVal !== base.part) ov.part = partVal;

    const severityVal = document.getElementById('ov-severityInput').value.trim();
    if (severityVal !== '' && parseInt(severityVal) !== base.severity) ov.severity = parseInt(severityVal);

    const labelVal = document.getElementById('ov-labelInput').value.trim();
    if (labelVal !== '' && labelVal !== base.label) ov.label = labelVal;

    const expressionVal = document.getElementById('ov-expressionInput').value.trim();
    if (expressionVal !== '' && expressionVal !== base.expression) ov.expression = expressionVal;

    const adviceVal = document.getElementById('ov-overrideInput').value.trim();
    if (adviceVal !== '' && adviceVal !== base.advice) ov.advice = adviceVal;

    // 规则转写词条来源校验
    const ovExprVal = document.getElementById('ov-expressionInput').value.trim();
    const ovExprErr = document.getElementById('ov-expr-error');
    if (ovExprVal && wordRootsDB.length > 0) {
        const termMatches = [...ovExprVal.matchAll(/【([^】]+)】/g)].map(m => m[1].trim());
        if (termMatches.length > 0) {
            const validTerms = getValidWrTerms();
            const invalid = termMatches.filter(t => !validTerms.has(t));
            if (invalid.length > 0) {
                ovExprErr.innerHTML = `⚠️ 以下词条不在词根表中：${invalid.map(t => `<b class="bg-red-100 text-red-700 px-1 rounded">${t}</b>`).join(' ')}`;
                return; // 阻止保存
            }
        }
    }
    if (ovExprErr) ovExprErr.innerHTML = '';

    if (!allHospitalOverrides[currentHospitalId]) allHospitalOverrides[currentHospitalId] = {};
    if (Object.keys(ov).length === 0) {
        // 没有任何差异：若之前有 isDeprecated 则保留，否则直接删除
        if (existing.isDeprecated) allHospitalOverrides[currentHospitalId][currentOverrideId] = { isDeprecated: true };
        else delete allHospitalOverrides[currentHospitalId][currentOverrideId];
    } else {
        if (existing.isDeprecated) ov.isDeprecated = true; // 保留弃用状态
        ov.globalDirty = false; // 医院已确认并保存，清除全局更新提醒
        ov.updatedAt = today();
        ov.updatedBy = currentUser ? currentUser.displayName : '-';
        allHospitalOverrides[currentHospitalId][currentOverrideId] = ov;
    }
    closeOverrideModal();
    renderOverrideTable();
    updateOvDeprecatedBtnText();
    saveOverridesToDB();
    showToast('定制成功', '已成功保存医院定制项。');
}
function resetOverride(id) {
    if (confirm('确定清除该条目所有定制内容（科室、建议等），恢复继承全局标准吗？')) {
        const ov = allHospitalOverrides[currentHospitalId];
        if (ov && ov[id]) {
            // 仅保留 isDeprecated（若有），其余清除
            const dep = ov[id].isDeprecated;
            if (dep) ov[id] = { isDeprecated: true };
            else delete ov[id];
        }
        renderOverrideTable();
        updateOvDeprecatedBtnText();
    }
}

// ── 本院弃用 ──
let pendingOvDeprecateId = null;
function openOvDeprecateModal(id) {
    pendingOvDeprecateId = id;
    const rule = globalRulesDB.find(r => r.id === id);
    document.getElementById('deprecate-rule-code').textContent = `${rule.rule_code}（本院弃用，不影响全局）`;
    document.getElementById('deprecateConfirmModal').classList.remove('hidden');
    // 重写确认按钮行为
    document.getElementById('deprecateConfirmModal').dataset.mode = 'ov';
}
function confirmDeprecateDispatch() {
    const mode = document.getElementById('deprecateConfirmModal').dataset.mode;
    if (mode === 'wr') confirmWrDeprecate();
    else if (mode === 'ov') confirmOvDeprecate();
    else confirmDeprecate();
}
function confirmOvDeprecate() {
    if (!allHospitalOverrides[currentHospitalId]) allHospitalOverrides[currentHospitalId] = {};
    const ov = allHospitalOverrides[currentHospitalId][pendingOvDeprecateId] || {};
    ov.isDeprecated = true;
    ov.updatedAt = today();
    ov.updatedBy = currentUser ? currentUser.displayName : '-';
    allHospitalOverrides[currentHospitalId][pendingOvDeprecateId] = ov;
    closeDeprecateModal();
    renderOverrideTable();
    updateOvDeprecatedBtnText();
    const rule = globalRulesDB.find(r => r.id === pendingOvDeprecateId);
    showToast('本院已弃用', `规则 ${rule.rule_code} 已在本院标记为弃用。`);
    pendingOvDeprecateId = null;
    saveOverridesToDB();
}
function restoreOvRule(id) {
    const ov = allHospitalOverrides[currentHospitalId];
    if (ov && ov[id]) {
        delete ov[id].isDeprecated;
        ov[id].updatedAt = today();
        ov[id].updatedBy = currentUser ? currentUser.displayName : '-';
        if (Object.keys(ov[id]).length <= 2 && !ov[id].dept && !ov[id].part && !ov[id].severity && !ov[id].label && !ov[id].expression && !ov[id].advice) {
            // 如果只剩 updatedAt/updatedBy，说明没有实质定制，删除整条
            delete ov[id];
        }
    }
    renderOverrideTable();
    updateOvDeprecatedBtnText();
    const rule = globalRulesDB.find(r => r.id === id);
    showToast('已恢复', `规则 ${rule.rule_code} 已在本院恢复启用。`);
}

// ── 切换函数 ──
function toggleOvShowDeprecated() {
    showOvDeprecated = !showOvDeprecated;
    renderOverrideTable();
    updateOvDeprecatedBtnText();
}
function toggleOvModifyInfo() {
    showOvModifyInfo = !showOvModifyInfo;
    document.getElementById('ov-table-wrapper').classList.toggle('hide-modify-cols', !showOvModifyInfo);
    document.getElementById('btn-ov-modify-info').textContent = showOvModifyInfo ? '🕐 隐藏修改记录' : '🕐 显示修改记录';
}
function updateOvDeprecatedBtnText() {
    const hospitalOverrides = getCurrentOverrides();
    const count = Object.values(hospitalOverrides).filter(v => v.isDeprecated).length;
    const btn = document.getElementById('btn-ov-show-deprecated');
    if (btn) btn.textContent = showOvDeprecated ? `👁 隐藏已弃用 (${count})` : `👁 显示已弃用 (${count})`;
}

// ══════════════════════════════════════════
// 批量AI修改
// ══════════════════════════════════════════
function openAiModal() {
    const hospitalOverrides = getCurrentOverrides();
    document.getElementById('ai-scope-count-all').textContent = globalRulesDB.filter(r => !r.isDeprecated).length;
    document.getElementById('ai-scope-count-overridden').textContent = Object.keys(hospitalOverrides).length;
    document.getElementById('ai-prompt-input').value = '';
    document.getElementById('ai-preview-area').classList.add('hidden');
    document.getElementById('aiModal').classList.remove('hidden');
}
function closeAiModal() { document.getElementById('aiModal').classList.add('hidden'); }

function applyAiTransform(text, prompt) {
    let result = text;
    const p = prompt.trim();

    // 替换：将 A 替换为 B（支持各种引号和空格）
    const replaceMatch = p.match(/将\s*["""「『]?(.+?)["""」』]?\s*替换[为成]\s*["""「『]?(.+?)["""」』]?\s*$/);
    if (replaceMatch) {
        result = result.split(replaceMatch[1].trim()).join(replaceMatch[2].trim());
        return result;
    }

    // 末尾追加 / 末尾添加
    if (p.includes('末尾追加') || p.includes('末尾添加') || p.includes('追加') || p.includes('末尾加上')) {
        const addMatch = p.match(/(?:末尾)?(?:追加|添加|加上)\s*["""「『]?(.+?)["""」』]?\s*$/);
        const toAdd = addMatch ? addMatch[1].trim() : '请及时就诊。';
        result = result.replace(/[。！？!?]*\s*$/, '') + '，' + toAdd;
        return result;
    }

    // 前缀添加
    if (p.includes('前缀') || p.includes('开头添加') || p.includes('开头加上')) {
        const preMatch = p.match(/(?:前缀|开头)(?:添加|加上|增加)?\s*["""「『]?(.+?)["""」』]?\s*$/);
        const toAdd = preMatch ? preMatch[1].trim() : '';
        if (toAdd) result = toAdd + result;
        return result;
    }

    // 删除 / 去除某词
    if (p.includes('删除') || p.includes('去除') || p.includes('移除')) {
        const delMatch = p.match(/(?:删除|去除|移除)\s*["""「『]?(.+?)["""」』]?\s*$/);
        if (delMatch) result = result.split(delMatch[1].trim()).join('');
        return result;
    }

    // 温和化 / 友好化 / 委婉化
    if (p.includes('温和') || p.includes('友好') || p.includes('委婉') || p.includes('柔和')) {
        result = result
            .replace(/立即/g, '尽快')
            .replace(/必须/g, '建议')
            .replace(/禁止/g, '尽量避免')
            .replace(/严禁/g, '尽量避免')
            .replace(/强制/g, '建议')
            .replace(/一定要/g, '建议')
            .replace(/不得/g, '尽量不要')
            .replace(/危险/g, '需注意');
        return result;
    }

    // 正式化
    if (p.includes('正式') || p.includes('专业')) {
        result = result
            .replace(/尽快/g, '立即')
            .replace(/建议你/g, '建议患者')
            .replace(/你/g, '患者')
            .replace(/我们/g, '医疗机构');
        return result;
    }

    // 未能识别指令，原文返回
    return result;
}
function previewAiModify() {
    const prompt = document.getElementById('ai-prompt-input').value.trim();
    if (!prompt) { showToast('请先输入提示词', '', 'error'); return; }
    const scope = document.querySelector('input[name="ai-scope"]:checked').value;
    const hospitalOverrides = getCurrentOverrides();
    const targets = scope === 'all' ? globalRulesDB.filter(r => !r.isDeprecated) : globalRulesDB.filter(r => hospitalOverrides[r.id]);
    if (targets.length === 0) { showToast('无可修改条目', '', 'error'); return; }
    const sample = targets[0];
    const currentAdv = (hospitalOverrides[sample.id] && hospitalOverrides[sample.id].advice) || sample.advice || '（无建议）';
    document.getElementById('ai-preview-content').innerHTML = `
        <div class="mb-2"><b>条目：</b>${sample.rule_code} — ${sample.label || ''}</div>
        <div class="mb-1 text-slate-500">修改前：</div>
        <div class="p-2 bg-white rounded border border-slate-200 text-slate-600 whitespace-pre-wrap mb-2">${currentAdv}</div>
        <div class="mb-1 text-purple-600">修改后（预览）：<span class="ml-2 text-[10px] bg-purple-100 text-purple-600 px-2 py-0.5 rounded">AI已处理</span></div>
        <div class="p-2 bg-white rounded border border-purple-200 text-slate-800 whitespace-pre-wrap">${applyAiTransform(currentAdv, prompt)}</div>
        <div class="mt-2 text-[10px] text-slate-400">共将修改 ${targets.length} 条数据</div>`;
    document.getElementById('ai-preview-area').classList.remove('hidden');
}
function executeAiModify() {
    const prompt = document.getElementById('ai-prompt-input').value.trim();
    if (!prompt) { showToast('请先输入提示词', '', 'error'); return; }
    const scope = document.querySelector('input[name="ai-scope"]:checked').value;
    const hospitalOverrides = getCurrentOverrides();
    const targets = scope === 'all' ? globalRulesDB.filter(r => !r.isDeprecated) : globalRulesDB.filter(r => hospitalOverrides[r.id]);
    if (targets.length === 0) { showToast('无可修改条目', '', 'error'); return; }
    if (!allHospitalOverrides[currentHospitalId]) allHospitalOverrides[currentHospitalId] = {};
    targets.forEach(base => {
        const cur = (hospitalOverrides[base.id] && hospitalOverrides[base.id].advice) || base.advice || '';
        if (!allHospitalOverrides[currentHospitalId][base.id]) allHospitalOverrides[currentHospitalId][base.id] = {};
        allHospitalOverrides[currentHospitalId][base.id].advice = applyAiTransform(cur, prompt);
    });
    closeAiModal(); renderOverrideTable();
    saveOverridesToDB();
    showToast('AI修改完成', `已对 ${targets.length} 条建议执行批量修改`);
}

// ══════════════════════════════════════════
// 沙盒推演
// ══════════════════════════════════════════
let sandboxGender = '男';
function setSandboxGender(g) {
    sandboxGender = g;
    document.getElementById('sb-btn-male').className   = g==='男' ? 'flex-1 py-1.5 text-sm rounded transition bg-white shadow-sm text-blue-600 font-bold border border-blue-200' : 'flex-1 py-1.5 text-sm rounded transition text-slate-500 hover:bg-slate-200';
    document.getElementById('sb-btn-female').className = g==='女' ? 'flex-1 py-1.5 text-sm rounded transition bg-white shadow-sm text-pink-600 font-bold border border-pink-200' : 'flex-1 py-1.5 text-sm rounded transition text-slate-500 hover:bg-slate-200';
}
function runSandboxEngine() {
    const patient = {
        gender: sandboxGender,
        terms: document.getElementById('sb-terms').value.split(',').map(t=>t.trim()).filter(Boolean),
        age: parseInt(document.getElementById('sb-age').value) || 0
    };
    const activeOverrides = currentHospitalId ? (allHospitalOverrides[currentHospitalId] || {}) : {};
    const runtimeRules = globalRulesDB.filter(r => !r.isDeprecated).map(base => {
        const ov = activeOverrides[base.id];
        return { ...base, advice: (ov && ov.advice) ? ov.advice : base.advice, severity: (ov && ov.severity !== undefined) ? ov.severity : base.severity, isOverridden: !!ov };
    });
    let matched = runtimeRules.filter(r => {
        if (!r.expression) return false;
        if (r.gender !== '男女通用' && r.gender !== patient.gender) return false;
        let parsed = r.expression
            .replace(/【(.*?)】/g, (m,t) => patient.terms.includes(t.trim()) ? "true" : "false")
            .replace(/《(.*?)》/g, (m,t) => patient.terms.includes(t.trim()) ? "true" : "false")
            .replace(/\{患者属性;\s*(.*?)\s*;\s*(.*?)\}/g, (m,attr,cond) => { try { return new Function(`return ${patient.age} ${cond}`)() ? "true" : "false"; } catch(e){ return "false"; } })
            .replace(/AND/g, '&&').replace(/OR/g, '||');
        try { return new Function(`return !!(${parsed})`)(); } catch(e) { return false; }
    });
    let finals = {};
    matched.forEach(r => { const k = `${r.dept}-${r.part}`; if (!finals[k] || r.severity > finals[k].severity) finals[k] = r; });
    const resultEl = document.getElementById('sb-final-advices');
    const results = Object.values(finals);
    if (results.length === 0) { resultEl.innerHTML = '<div class="text-center text-slate-400 mt-10">未触发任何规则</div>'; return; }
    resultEl.innerHTML = results.sort((a,b)=>b.severity-a.severity).map(r => `
        <div class="p-4 bg-slate-50 border border-slate-200 rounded-lg relative hover:shadow-md transition">
            <div class="absolute top-0 right-0 bg-red-50 text-red-600 border-b border-l border-red-100 px-2 py-1 rounded-bl-lg text-[10px] font-bold">严重度: ${r.severity}</div>
            <div class="flex items-center gap-2 mb-2">
                <span class="px-2 py-0.5 bg-yellow-100 text-yellow-800 border border-yellow-300 rounded text-xs font-bold">${r.label}</span>
                ${r.isOverridden ? '<span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">医院已定制</span>' : ''}
            </div>
            <div class="text-xs text-slate-500 mb-2">科室: ${r.dept} | 部位: ${r.part}</div>
            <div class="text-sm text-slate-800 leading-relaxed bg-white p-3 rounded border border-slate-100 shadow-sm whitespace-pre-wrap">${r.advice}</div>
        </div>`).join('');
}

// ══════════════════════════════════════════
// Tab 切换
// ══════════════════════════════════════════
function switchTab(id) {
    ['manage','override','wordroot','sandbox'].forEach(v => {
        document.getElementById(`view-${v}`).classList.add('hidden');
        document.getElementById(`tab-${v}`).className = 'px-6 py-3 tab-inactive focus:outline-none transition';
    });
    document.getElementById(`view-${id}`).classList.remove('hidden');
    document.getElementById(`tab-${id}`).className = 'px-6 py-3 tab-active focus:outline-none transition';
}

// ══════════════════════════════════════════
// 全局规则 编辑/保存
// ══════════════════════════════════════════
function openMergeModal(id = null) {
    document.getElementById('fm-id').value = id || '';
    document.getElementById('merge-modal-title').textContent = id ? '编辑规则' : '新增规则';
    document.getElementById('mergeModal').classList.remove('hidden');
    ['fm-code-error','fm-error'].forEach(e => document.getElementById(e).innerHTML = '');
    ['fm-code','fm-expression'].forEach(e => document.getElementById(e).classList.remove('error-ring'));
    const btn = document.getElementById('btn-save-merge');
    btn.disabled = false; btn.classList.remove('opacity-50','cursor-not-allowed');
    if (id) {
        const r = globalRulesDB.find(x => x.id === id);
        document.getElementById('fm-code').value = r.rule_code;
        document.getElementById('fm-gender').value = r.gender || '男女通用';
        document.getElementById('fm-dept').value = r.dept || '';
        document.getElementById('fm-part').value = r.part || '';
        document.getElementById('fm-severity').value = r.severity;
        document.getElementById('fm-label').value = r.label;
        document.getElementById('fm-expression').value = r.expression;
        document.getElementById('fm-advice').value = r.advice;
    } else {
        document.getElementById('fm-code').value = 'ZJHB' + Math.floor(Math.random()*10000);
        ['fm-gender'].forEach(() => document.getElementById('fm-gender').value = '男女通用');
        ['fm-dept','fm-part','fm-label','fm-expression','fm-advice'].forEach(f => document.getElementById(f).value = '');
        document.getElementById('fm-severity').value = '';
    }
}
function closeMergeModal() { document.getElementById('mergeModal').classList.add('hidden'); }

function checkFormValidity() {
    const currentId = document.getElementById('fm-id').value;
    const codeInput = document.getElementById('fm-code'); const codeVal = codeInput.value.trim();
    const codeErr = document.getElementById('fm-code-error'); let isCodeValid = true;
    if (!codeVal) { codeErr.innerHTML = '🚫 规则编号不能为空'; codeInput.classList.add('error-ring'); isCodeValid = false; }
    else if (globalRulesDB.some(r => r.rule_code === codeVal && r.id !== currentId)) { codeErr.innerHTML = '🚫 规则编号已存在'; codeInput.classList.add('error-ring'); isCodeValid = false; }
    else { codeErr.innerHTML = ''; codeInput.classList.remove('error-ring'); }

    const expInput = document.getElementById('fm-expression'); const expVal = expInput.value.trim();
    const expErr = document.getElementById('fm-error'); let isExpValid = true; let expErrors = [];
    if (expVal.length > 0) {
        if (/[，。；：！？（）｛｝""'']/.test(expVal)) expErrors.push('🚫 禁止使用中文标点符号(除书名号外)');
        if (/(?<!\s)(AND|OR)|(AND|OR)(?!\s)/.test(expVal)) expErrors.push('🚫 AND / OR 前后必须保留空格');
        if (/^\s*(AND|OR)\b|\b(AND|OR)\s*$/.test(expVal)) expErrors.push('🚫 表达式不能以 AND 或 OR 开头/结尾');
        if (/\b(AND|OR)\s+(AND|OR)\b/.test(expVal)) expErrors.push('🚫 不能出现连续逻辑词');
        let stack = [], pairs = { ')':'(', '}':'{', '】':'【', '》':'《' }, ok = true;
        for (let c of expVal) {
            if ('({【《'.includes(c)) stack.push(c);
            else if (')}】》'.includes(c)) { if (!stack.length || stack.pop() !== pairs[c]) { ok = false; break; } }
        }
        if (!ok || stack.length) expErrors.push('🚫 括号必须成对出现且嵌套正确');
    }
    if (expErrors.length) { expErr.innerHTML = expErrors.join('<br>'); expInput.classList.add('error-ring'); isExpValid = false; }
    else { expErr.innerHTML = ''; expInput.classList.remove('error-ring'); }

    // 词条来源校验（词根表已加载时强制）
    let isTermsValid = true;
    if (expVal.length > 0 && wordRootsDB.length > 0 && isExpValid) {
        const termMatches = [...expVal.matchAll(/【([^】]+)】/g)].map(m => m[1].trim());
        if (termMatches.length > 0) {
            const validTerms = getValidWrTerms();
            const invalid = termMatches.filter(t => !validTerms.has(t));
            if (invalid.length > 0) {
                expErr.innerHTML = `⚠️ 以下词条不在词根表中，请修正：${invalid.map(t => `<b class="bg-red-100 text-red-700 px-1 rounded">${t}</b>`).join(' ')}`;
                expInput.classList.add('error-ring');
                isTermsValid = false;
            }
        }
    }

    const btn = document.getElementById('btn-save-merge');
    if (isCodeValid && isExpValid && isTermsValid) { btn.disabled = false; btn.classList.remove('opacity-50','cursor-not-allowed'); }
    else { btn.disabled = true; btn.classList.add('opacity-50','cursor-not-allowed'); }
}

function saveMergeRule() {
    const id = document.getElementById('fm-id').value; const isNew = !id;
    const existingRule = id ? globalRulesDB.find(x => x.id === id) : null;
    const ruleData = {
        id: id || 'm' + Date.now(),
        rule_code: document.getElementById('fm-code').value.trim(),
        gender: document.getElementById('fm-gender').value,
        dept: document.getElementById('fm-dept').value,
        part: document.getElementById('fm-part').value,
        severity: parseInt(document.getElementById('fm-severity').value) || 0,
        label: document.getElementById('fm-label').value,
        expression: document.getElementById('fm-expression').value,
        advice: document.getElementById('fm-advice').value,
        isDeprecated: existingRule ? existingRule.isDeprecated : false,
        updatedAt: today(),
        updatedBy: currentUser ? currentUser.displayName : '-',
    };
    if (isNew) { globalRulesDB.push(ruleData); showToast("保存成功", `已新增规则 ${ruleData.rule_code}`); }
    else {
        const idx = globalRulesDB.findIndex(x => x.id === id);
        if (idx > -1) globalRulesDB[idx] = ruleData;
        // 对所有医院中有定制该规则的 override 打上 globalDirty 标记
        Object.values(allHospitalOverrides).forEach(hospitalOvs => {
            if (hospitalOvs[id] && Object.keys(hospitalOvs[id]).filter(k => !['isDeprecated','updatedAt','updatedBy','globalDirty'].includes(k)).length > 0) {
                hospitalOvs[id].globalDirty = true;
            }
        });
        showToast("更新成功", `已更新规则 ${ruleData.rule_code}`);
    }
    closeMergeModal(); renderManageTable(); updateDeprecatedBtnText();
    saveGlobalRulesToDB();
}

// ══════════════════════════════════════════
// 科室下拉
// ══════════════════════════════════════════
function renderDeptDropdown(filterText) {
    const container = document.getElementById('dept-dropdown');
    const s = filterText.trim().toLowerCase(); let html = '';
    departmentsData.forEach(group => {
        const matched = group.items.filter(i => i.toLowerCase().includes(s));
        if (matched.length) {
            html += `<div class="sticky top-0 bg-slate-100 text-[11px] font-bold text-slate-500 px-3 py-1.5 border-y border-slate-200">${group.group}</div>`;
            matched.forEach(item => { html += `<div onclick="selectDept('${item}')" class="px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 cursor-pointer">${item}</div>`; });
        }
    });
    // 词根表中有但预设列表没有的科室
    const existingDepts = new Set(departmentsData.flatMap(g => g.items));
    const wrDepts = getValidWrDepts().filter(d => !existingDepts.has(d) && d.toLowerCase().includes(s));
    if (wrDepts.length > 0) {
        html += `<div class="sticky top-0 bg-green-50 text-[11px] font-bold text-green-700 px-3 py-1.5 border-y border-green-200">🌿 来自词根表</div>`;
        wrDepts.forEach(d => { html += `<div onclick="selectDept('${d}')" class="px-4 py-2 text-sm text-slate-700 hover:bg-green-50 cursor-pointer">${d}</div>`; });
    }
    container.innerHTML = html || `<div class="p-3 text-xs text-slate-400">无匹配科室</div>`;
}
function showDeptDropdown() { document.getElementById('dept-dropdown').classList.remove('hidden'); renderDeptDropdown(document.getElementById('fm-dept').value); }
function filterDeptDropdown(val) { document.getElementById('dept-dropdown').classList.remove('hidden'); renderDeptDropdown(val); }
function selectDept(dept) { document.getElementById('fm-dept').value = dept; document.getElementById('dept-dropdown').classList.add('hidden'); renderPartDropdown('', dept); }
function closeDropdownIfClickedOutside(e) {
    const t = e.target;
    if (t !== document.getElementById('fm-dept'))  document.getElementById('dept-dropdown').classList.add('hidden');
    if (t !== document.getElementById('fm-part'))  document.getElementById('part-dropdown').classList.add('hidden');
    if (t !== document.getElementById('fm-expression')) document.getElementById('expr-dropdown').classList.add('hidden');
}

// ══════════════════════════════════════════
// 词根表 — 导入
// ══════════════════════════════════════════
function importWordRootExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
            let added = 0, updated = 0;
            json.forEach(row => {
                const fine = getExcelValue(row, ['词根细分', '细分', 'fine']);
                if (!fine) return;
                const entry = {
                    id: 'wr' + Date.now() + Math.floor(Math.random() * 10000),
                    category: getExcelValue(row, ['项目分类', '分类', 'category']) || '检查',
                    dept:     getExcelValue(row, ['分类第一级（科室）', '科室', 'dept']),
                    part:     getExcelValue(row, ['分类第二级（部位/检验组套）', '部位', '检验组套', 'part']),
                    belong:   getExcelValue(row, ['所属情况', 'belong']),
                    rough:    getExcelValue(row, ['词根粗分', '粗分', 'rough']),
                    fine:     fine,
                    ai_basis: getExcelValue(row, ['AI推理依据', '推理依据', 'ai_basis']),
                    isDeprecated: false,
                    updatedAt: today(),
                    updatedBy: currentUser ? `${currentUser.displayName}（导入）` : '导入',
                };
                const idx = wordRootsDB.findIndex(r => r.fine === fine && r.dept === entry.dept && r.part === entry.part);
                if (idx > -1) {
                    entry.id = wordRootsDB[idx].id;
                    entry.isDeprecated = wordRootsDB[idx].isDeprecated;
                    wordRootsDB[idx] = entry;
                    updated++;
                } else {
                    wordRootsDB.push(entry);
                    added++;
                }
            });
            showToast('导入成功', `新增：${added} 条\n更新：${updated} 条`);
            renderWordRootTable();
            updateWrDeprecatedBtnText();
            saveWordRootsToDB();
        } catch (err) {
            showToast('导入失败', '请检查 Excel 格式是否正确。', 'error');
            console.error(err);
        }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

// ══════════════════════════════════════════
// 词根表 — 导出
// ══════════════════════════════════════════
function exportWordRootExcel() {
    if (wordRootsDB.length === 0) { showToast('暂无数据', '请先导入或新增词根。', 'error'); return; }
    const rows = wordRootsDB.map(r => ({
        '项目分类':                      r.category || '',
        '分类第一级（科室）':              r.dept     || '',
        '分类第二级（部位/检验组套）':      r.part     || '',
        '所属情况':                       r.belong   || '',
        '词根粗分':                       r.rough    || '',
        '词根细分':                       r.fine     || '',
        'AI推理依据':                     r.ai_basis || '',
        '状态':                          r.isDeprecated ? '已弃用' : '启用',
        '修改日期':                       r.updatedAt || '',
        '修改人':                         r.updatedBy || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:10},{wch:16},{wch:20},{wch:30},{wch:20},{wch:24},{wch:60},{wch:8},{wch:12},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '词根表');
    XLSX.writeFile(wb, `词根表_${today()}.xlsx`);
    showToast('导出成功', `共导出 ${rows.length} 条词根。`);
}

// ══════════════════════════════════════════
// 词根表 — 渲染
// ══════════════════════════════════════════
function renderWordRootTable() {
    const q = (document.getElementById('wr-search')?.value || '').toLowerCase();
    let rows = [...wordRootsDB];
    if (!showWrDeprecated) rows = rows.filter(r => !r.isDeprecated);
    if (q) rows = rows.filter(r =>
        (r.fine    || '').toLowerCase().includes(q) ||
        (r.belong  || '').toLowerCase().includes(q) ||
        (r.dept    || '').toLowerCase().includes(q) ||
        (r.rough   || '').toLowerCase().includes(q) ||
        (r.part    || '').toLowerCase().includes(q) ||
        (r.ai_basis|| '').toLowerCase().includes(q)
    );

    const tbody = document.getElementById('wrTableBody');
    if (rows.length === 0) {
        const msg = wordRootsDB.length === 0
            ? '暂无数据，请点击右上角导入 Excel'
            : q ? '无匹配结果' : '所有弃用词根已隐藏，点击"显示已弃用"查看';
        tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400">${msg}</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(r => {
        const dep = r.isDeprecated;
        const rowClass = dep ? 'deprecated-row' : 'hover:bg-green-50/30 transition';
        const fineClass = dep ? 'line-through text-slate-400' : 'text-slate-800 font-medium';
        return `
        <tr class="${rowClass}">
            <td class="p-3 text-center">
                <span class="px-2 py-0.5 rounded text-xs border ${dep ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-green-50 text-green-700 border-green-200'}">${r.category || '-'}</span>
            </td>
            <td class="p-3 text-xs text-slate-600">${r.dept || '-'}</td>
            <td class="p-3 text-xs text-slate-600">${r.part || '-'}</td>
            <td class="p-3 text-xs text-slate-500">${r.belong || '-'}</td>
            <td class="p-3 text-xs text-slate-500 italic">${r.rough || ''}</td>
            <td class="p-3 text-xs ${fineClass}">
                ${r.fine || '-'}
                ${dep ? '<span class="deprecated-badge ml-1">已弃用</span>' : ''}
            </td>
            <td class="p-3 text-xs text-slate-500 max-w-[280px] truncate" title="${(r.ai_basis||'').replace(/"/g,'&quot;')}">${r.ai_basis || '-'}</td>
            <td class="p-3 text-center text-xs text-slate-400 modify-col">${r.updatedAt || '-'}</td>
            <td class="p-3 text-center text-xs text-slate-400 modify-col">${r.updatedBy || '-'}</td>
            <td class="p-3 text-center sticky right-0 bg-white shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]">
                <div class="flex gap-1 justify-center">
                    <button onclick="openWrModal('${r.id}')" class="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition">编辑</button>
                    <button onclick="openDeprecateModal('${r.id}','wr')" class="text-xs px-2 py-1 rounded ${dep ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'} transition">
                        ${dep ? '恢复' : '弃用'}
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ══════════════════════════════════════════
// 词根表 — 新增/编辑 Modal
// ══════════════════════════════════════════
function openWrModal(id = null) {
    document.getElementById('wr-fm-id').value = id || '';
    document.getElementById('wr-modal-title').textContent = id ? '编辑词根' : '新增词根';
    if (id) {
        const r = wordRootsDB.find(x => x.id === id);
        if (!r) return;
        document.getElementById('wr-fm-category').value = r.category || '检查';
        document.getElementById('wr-fm-dept').value     = r.dept     || '';
        document.getElementById('wr-fm-part').value     = r.part     || '';
        document.getElementById('wr-fm-belong').value   = r.belong   || '';
        document.getElementById('wr-fm-rough').value    = r.rough    || '';
        document.getElementById('wr-fm-fine').value     = r.fine     || '';
        document.getElementById('wr-fm-ai-basis').value = r.ai_basis || '';
    } else {
        ['wr-fm-dept','wr-fm-part','wr-fm-belong','wr-fm-rough','wr-fm-fine','wr-fm-ai-basis'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('wr-fm-category').value = '检查';
    }
    document.getElementById('wrModal').classList.remove('hidden');
}

function closeWrModal() {
    document.getElementById('wrModal').classList.add('hidden');
}

function saveWrEntry() {
    const fine = document.getElementById('wr-fm-fine').value.trim();
    if (!fine) { showToast('词根细分不能为空', '', 'error'); return; }
    const id = document.getElementById('wr-fm-id').value;
    const entry = {
        id: id || ('wr' + Date.now() + Math.floor(Math.random() * 10000)),
        category: document.getElementById('wr-fm-category').value,
        dept:     document.getElementById('wr-fm-dept').value.trim(),
        part:     document.getElementById('wr-fm-part').value.trim(),
        belong:   document.getElementById('wr-fm-belong').value.trim(),
        rough:    document.getElementById('wr-fm-rough').value.trim(),
        fine:     fine,
        ai_basis: document.getElementById('wr-fm-ai-basis').value.trim(),
        isDeprecated: false,
        updatedAt: today(),
        updatedBy: currentUser ? currentUser.displayName : '未知',
    };
    if (id) {
        const idx = wordRootsDB.findIndex(r => r.id === id);
        if (idx > -1) {
            entry.isDeprecated = wordRootsDB[idx].isDeprecated;
            wordRootsDB[idx] = entry;
        }
    } else {
        wordRootsDB.push(entry);
    }
    closeWrModal();
    renderWordRootTable();
    updateWrDeprecatedBtnText();
    saveWordRootsToDB();
    showToast(id ? '已更新' : '已新增', `词根"${fine}"保存成功`);
}

// ══════════════════════════════════════════
// 词根表 — 弃用/恢复（复用 deprecateConfirmModal）
// ══════════════════════════════════════════
function confirmWrDeprecate() {
    const modal = document.getElementById('deprecateConfirmModal');
    const id = modal.dataset.targetId;
    const r = wordRootsDB.find(x => x.id === id);
    if (!r) return;
    r.isDeprecated = !r.isDeprecated;
    r.updatedAt = today();
    r.updatedBy = currentUser ? currentUser.displayName : '未知';
    modal.classList.add('hidden');
    renderWordRootTable();
    updateWrDeprecatedBtnText();
    saveWordRootsToDB();
    showToast(r.isDeprecated ? '已弃用' : '已恢复', `词根"${r.fine}"状态已更新`);
}

// ══════════════════════════════════════════
// 词根表 — UI 切换
// ══════════════════════════════════════════
function toggleWrShowDeprecated() {
    showWrDeprecated = !showWrDeprecated;
    renderWordRootTable();
    updateWrDeprecatedBtnText();
}

function updateWrDeprecatedBtnText() {
    const count = wordRootsDB.filter(r => r.isDeprecated).length;
    const btn = document.getElementById('btn-wr-deprecated');
    btn.textContent = showWrDeprecated ? `👁 隐藏已弃用 (${count})` : `👁 显示已弃用 (${count})`;
}

function toggleWrModifyInfo() {
    showWrModifyInfo = !showWrModifyInfo;
    document.getElementById('wr-table-wrapper').classList.toggle('hide-modify-cols', !showWrModifyInfo);
    const btn = document.getElementById('btn-wr-modify-info');
    btn.textContent = showWrModifyInfo ? '🕐 隐藏修改记录' : '🕐 显示修改记录';
}

// ══════════════════════════════════════════
// 词根约束 — 辅助函数
// ══════════════════════════════════════════
function getValidWrTerms() {
    const s = new Set();
    wordRootsDB.filter(r => !r.isDeprecated).forEach(r => {
        if (r.fine  && r.fine.trim())  s.add(r.fine.trim());
        if (r.rough && r.rough.trim()) s.add(r.rough.trim());
        if (r.belong && r.belong.trim()) {
            // 所属情况可能是【A】【B】形式，提取每个
            const ms = r.belong.match(/【([^】]+)】/g);
            if (ms) ms.forEach(m => s.add(m.replace(/[【】]/g, '').trim()));
            else s.add(r.belong.trim());
        }
    });
    return s;
}

function getValidWrDepts() {
    return [...new Set(wordRootsDB.filter(r => !r.isDeprecated && r.dept).map(r => r.dept.trim()))].sort();
}

function getValidWrParts(deptFilter = '') {
    return [...new Set(
        wordRootsDB
            .filter(r => !r.isDeprecated && r.part && (!deptFilter || r.dept === deptFilter))
            .map(r => r.part.trim())
    )].sort();
}

// ══════════════════════════════════════════
// 规则转写 — 【】 词根自动完成
// ══════════════════════════════════════════
function handleExprInput(textareaId, dropdownId) {
    const textarea = document.getElementById(textareaId);
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown || !textarea) return;
    const val = textarea.value;
    const pos = textarea.selectionStart;
    const beforeCursor = val.slice(0, pos);
    const lastOpen  = beforeCursor.lastIndexOf('【');
    const lastClose = beforeCursor.lastIndexOf('】');
    if (lastOpen > lastClose) {
        const query = beforeCursor.slice(lastOpen + 1).toLowerCase();
        const allTerms = [...getValidWrTerms()];
        const filtered = query
            ? allTerms.filter(t => t.toLowerCase().includes(query)).slice(0, 30)
            : allTerms.slice(0, 30);
        if (filtered.length > 0) {
            const colorClass = dropdownId.startsWith('ov') ? 'hover:bg-amber-50' : 'hover:bg-blue-50';
            dropdown.innerHTML = filtered.map(t =>
                `<div onclick="insertWrTerm('${textareaId}','${dropdownId}','${t.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')"
                      class="px-3 py-2 text-sm text-slate-700 ${colorClass} cursor-pointer border-b border-slate-50 last:border-0">${t}</div>`
            ).join('');
            dropdown.classList.remove('hidden');
        } else {
            if (wordRootsDB.length === 0) {
                dropdown.innerHTML = `<div class="p-3 text-xs text-slate-400">词根表为空，请先在"词根表"标签页导入数据</div>`;
                dropdown.classList.remove('hidden');
            } else {
                dropdown.classList.add('hidden');
            }
        }
    } else {
        dropdown.classList.add('hidden');
    }
    // 实时校验 override 表达式
    if (dropdownId === 'ov-expr-dropdown') {
        validateExprWarning(textareaId, 'ov-expr-error');
    }
}

function insertWrTerm(textareaId, dropdownId, term) {
    const textarea = document.getElementById(textareaId);
    const val = textarea.value;
    const pos = textarea.selectionStart;
    const beforeCursor = val.slice(0, pos);
    const lastOpen = beforeCursor.lastIndexOf('【');
    const newVal = val.slice(0, lastOpen) + '【' + term + '】' + val.slice(pos);
    textarea.value = newVal;
    const newPos = lastOpen + term.length + 2;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();
    document.getElementById(dropdownId).classList.add('hidden');
    if (textareaId === 'fm-expression') checkFormValidity();
    if (dropdownId === 'ov-expr-dropdown') validateExprWarning(textareaId, 'ov-expr-error');
}

function validateExprWarning(textareaId, errorElId) {
    if (wordRootsDB.length === 0) return;
    const val = document.getElementById(textareaId).value;
    const matches = [...val.matchAll(/【([^】]+)】/g)].map(m => m[1].trim());
    const el = document.getElementById(errorElId);
    if (!el) return;
    if (matches.length === 0) { el.innerHTML = ''; return; }
    const validTerms = getValidWrTerms();
    const invalid = matches.filter(t => !validTerms.has(t));
    el.innerHTML = invalid.length > 0
        ? `⚠️ 以下词条不在词根表中：${invalid.map(t => `<b class="bg-red-100 text-red-700 px-1 rounded">${t}</b>`).join(' ')}`
        : '';
}

// ══════════════════════════════════════════
// 部位 — 下拉（全局规则 modal）
// ══════════════════════════════════════════
function showPartDropdown() {
    const dept = document.getElementById('fm-dept').value.trim();
    renderPartDropdown(document.getElementById('fm-part').value, dept);
    document.getElementById('part-dropdown').classList.remove('hidden');
}
function filterPartDropdown(val) {
    const dept = document.getElementById('fm-dept').value.trim();
    renderPartDropdown(val, dept);
    document.getElementById('part-dropdown').classList.remove('hidden');
}
function renderPartDropdown(filterText, deptFilter = '') {
    const container = document.getElementById('part-dropdown');
    if (!container) return;
    const s = filterText.trim().toLowerCase();
    const parts = getValidWrParts(deptFilter).filter(p => !s || p.toLowerCase().includes(s));
    container.innerHTML = parts.length
        ? parts.map(p => `<div onclick="selectPart('${p.replace(/'/g,"\\'")}','fm-part','part-dropdown')"
              class="px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 cursor-pointer">${p}</div>`).join('')
        : `<div class="p-3 text-xs text-slate-400">${wordRootsDB.length === 0 ? '词根表为空' : '无匹配部位'}</div>`;
}
function selectPart(part, inputId, dropdownId) {
    document.getElementById(inputId).value = part;
    document.getElementById(dropdownId).classList.add('hidden');
}

// ══════════════════════════════════════════
// 科室/部位 — 下拉（Override modal）
// ══════════════════════════════════════════
function showOvDeptDropdown() { renderOvDeptDropdown(document.getElementById('ov-deptInput').value); document.getElementById('ov-dept-dropdown').classList.remove('hidden'); }
function filterOvDeptDropdown(val) { renderOvDeptDropdown(val); document.getElementById('ov-dept-dropdown').classList.remove('hidden'); }
function renderOvDeptDropdown(filterText) {
    const container = document.getElementById('ov-dept-dropdown');
    const s = filterText.trim().toLowerCase();
    const depts = [...new Set([
        ...departmentsData.flatMap(g => g.items),
        ...getValidWrDepts()
    ])].filter(d => !s || d.toLowerCase().includes(s)).sort();
    container.innerHTML = depts.length
        ? depts.map(d => `<div onclick="selectOvDept('${d.replace(/'/g,"\\'")}'); "
              class="px-4 py-2 text-sm text-slate-700 hover:bg-amber-50 cursor-pointer">${d}</div>`).join('')
        : `<div class="p-3 text-xs text-slate-400">无匹配科室</div>`;
}
function selectOvDept(dept) {
    document.getElementById('ov-deptInput').value = dept;
    document.getElementById('ov-dept-dropdown').classList.add('hidden');
    renderOvPartDropdown('', dept);
    document.getElementById('ov-partInput').value = '';
}

function showOvPartDropdown() { renderOvPartDropdown(document.getElementById('ov-partInput').value, document.getElementById('ov-deptInput').value.trim()); document.getElementById('ov-part-dropdown').classList.remove('hidden'); }
function filterOvPartDropdown(val) { renderOvPartDropdown(val, document.getElementById('ov-deptInput').value.trim()); document.getElementById('ov-part-dropdown').classList.remove('hidden'); }
function renderOvPartDropdown(filterText, deptFilter = '') {
    const container = document.getElementById('ov-part-dropdown');
    const s = filterText.trim().toLowerCase();
    const parts = getValidWrParts(deptFilter).filter(p => !s || p.toLowerCase().includes(s));
    container.innerHTML = parts.length
        ? parts.map(p => `<div onclick="selectPart('${p.replace(/'/g,"\\'")}','ov-partInput','ov-part-dropdown')"
              class="px-4 py-2 text-sm text-slate-700 hover:bg-amber-50 cursor-pointer">${p}</div>`).join('')
        : `<div class="p-3 text-xs text-slate-400">${wordRootsDB.length === 0 ? '词根表为空' : '无匹配部位'}</div>`;
}
