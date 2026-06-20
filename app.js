/**
 * Zebra Mimarlık — Şantiye & Bütçe Yönetim Sistemi v2.0
 * Professional Application Logic
 */

const App = (() => {
    'use strict';

    // ─── Data Model ───
    let data = {
        projects: [],      // { id, name }
        suppliers: [],     // { id, name }
        assignments: [],   // { id, projectId, supplierId, initialCost, isYevmiye, dailyWage }
        transactions: []   // { id, projectId, supplierId, type, amount, date, desc, days }
    };

    let currentHistoryContext = null;

    // ─── DOM Cache ───
    const els = {
        dashIncome: document.getElementById('dash-income'),
        dashPaid: document.getElementById('dash-paid'),
        dashKasa: document.getElementById('dash-kasa'),
        dashDebt: document.getElementById('dash-debt'),
        dashTodayTbody: document.getElementById('dash-today-tbody'),
        headerDate: document.getElementById('header-date'),
        projectsList: document.getElementById('projects-list'),
        suppliersList: document.getElementById('suppliers-list'),
        expensesList: document.getElementById('expenses-list'),

        qtProjectGroup: document.getElementById('qt-project-group'),
        qtSupplierGroup: document.getElementById('qt-supplier-group'),
        qtDaysGroup: document.getElementById('qt-days-group'),

        qtProject: document.getElementById('qt-project'),
        qtSupplier: document.getElementById('qt-supplier'),
        qtType: document.getElementById('qt-type'),
        qtAmount: document.getElementById('qt-amount'),
        qtDays: document.getElementById('qt-days'),
        qtDate: document.getElementById('qt-date'),
        qtDesc: document.getElementById('qt-desc'),
        qtTransId: document.getElementById('qt-trans-id'),
        qtSubmitBtn: document.getElementById('qt-submit-btn'),
        qtCancelBtn: document.getElementById('qt-cancel-btn'),

        assignProj: document.getElementById('assign-proj'),
        assignSup: document.getElementById('assign-sup'),
        assignIsYevmiye: document.getElementById('assign-is-yevmiye'),
        assignCostGroup: document.getElementById('assign-cost-group'),
        assignWageGroup: document.getElementById('assign-wage-group'),
        assignCost: document.getElementById('assign-cost'),
        assignWage: document.getElementById('assign-wage')
    };

    // ─── Toast Notifications ───
    const showToast = (message, type = 'info') => {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: 'check_circle',
            error: 'error',
            info: 'info',
            warning: 'warning'
        };

        toast.innerHTML = `<span class="material-icons-round" style="font-size:20px;">${icons[type] || 'info'}</span><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fadeOut');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    // ─── LocalStorage ───
    const loadData = () => {
        const saved = localStorage.getItem('zebraSantiyeData');
        if (saved) {
            try {
                data = JSON.parse(saved);
                // Ensure all arrays exist
                if (!data.projects) data.projects = [];
                if (!data.suppliers) data.suppliers = [];
                if (!data.assignments) data.assignments = [];
                if (!data.transactions) data.transactions = [];
            } catch (e) {
                data = { projects: [], suppliers: [], assignments: [], transactions: [] };
            }
        } else {
            data = { projects: [], suppliers: [], assignments: [], transactions: [] };
        }
        render();
    };

    const saveData = () => {
        localStorage.setItem('zebraSantiyeData', JSON.stringify(data));
        render();
    };

    const resetDataConfirm = () => {
        localStorage.removeItem('zebraSantiyeData');
        localStorage.removeItem('isGiderleriDataV2');
        localStorage.removeItem('isGiderleriData');
        data = { projects: [], suppliers: [], assignments: [], transactions: [] };
        saveData();
        closeModal('modal-reset-confirm');
        showToast('Tüm veriler silindi.', 'warning');
    };

    const exportData = () => {
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zebra-santiye-yedek-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Yedek dosyası indirildi.', 'success');
    };

    const importData = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (parsed.projects && parsed.suppliers && parsed.transactions) {
                    data = parsed;
                    if (!data.assignments) data.assignments = [];
                    saveData();
                    showToast('Veriler başarıyla yüklendi!', 'success');
                } else {
                    showToast('Geçersiz yedek dosyası.', 'error');
                }
            } catch (err) {
                showToast('Dosya okunamadı.', 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    // ─── Helpers ───
    const formatCurrency = (val) =>
        new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(val);

    const formatDate = (dateStr) =>
        new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const generateId = (arr) =>
        arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1;

    // ─── Computations ───
    const getProjectKasa = (projectId) => {
        const trans = data.transactions.filter(t => t.projectId === projectId);
        const assigns = data.assignments.filter(a => a.projectId === projectId);

        let income = 0, paid = 0, extraCost = 0;

        trans.forEach(t => {
            if (t.type === 'income') income += t.amount;
            if (t.type === 'payment') paid += t.amount;
            if (t.type === 'cost' || t.type === 'yevmiye') extraCost += t.amount;
        });

        let initialCostTotal = 0;
        assigns.forEach(a => initialCostTotal += (a.initialCost || 0));

        return {
            income,
            paid,
            kasa: income - paid,
            totalDebt: initialCostTotal + extraCost - paid
        };
    };

    const getSupplierProjectBalance = (projectId, supplierId) => {
        const assign = data.assignments.find(a => a.projectId === projectId && a.supplierId === supplierId);
        if (!assign) return null;

        const trans = data.transactions.filter(t => t.projectId === projectId && t.supplierId === supplierId);
        let extraCost = 0, paid = 0;

        trans.forEach(t => {
            if (t.type === 'cost' || t.type === 'yevmiye') extraCost += t.amount;
            if (t.type === 'payment') paid += t.amount;
        });

        const totalMaliyet = (assign.initialCost || 0) + extraCost;
        return { totalMaliyet, paid, balance: totalMaliyet - paid, initialCost: assign.initialCost || 0 };
    };

    const getGlobalSupplierBalance = (supplierId) => {
        const assigns = data.assignments.filter(a => a.supplierId === supplierId);
        let globalMaliyet = 0, globalPaid = 0, globalBalance = 0;

        assigns.forEach(a => {
            const st = getSupplierProjectBalance(a.projectId, supplierId);
            if (st) {
                globalMaliyet += st.totalMaliyet;
                globalPaid += st.paid;
                globalBalance += st.balance;
            }
        });

        return { globalMaliyet, globalPaid, globalBalance };
    };

    // ─── Render ───
    const render = () => {
        renderDashboard();
        renderProjects();
        renderSuppliers();
        renderExpenses();
        populateDropdowns();
    };

    const renderDashboard = () => {
        // Date header
        if (els.headerDate) {
            const now = new Date();
            els.headerDate.textContent = now.toLocaleDateString('tr-TR', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            });
        }

        let globalIncome = 0, globalPaid = 0, globalGeneralExpense = 0, globalDebt = 0;

        data.projects.forEach(p => {
            const pk = getProjectKasa(p.id);
            globalDebt += pk.totalDebt;
        });

        data.transactions.forEach(t => {
            if (t.type === 'income') globalIncome += t.amount;
            if (t.type === 'payment') globalPaid += t.amount;
            if (t.type === 'general_expense') globalGeneralExpense += t.amount;
        });

        els.dashIncome.textContent = formatCurrency(globalIncome);
        els.dashPaid.textContent = formatCurrency(globalPaid + globalGeneralExpense);
        els.dashKasa.textContent = formatCurrency(globalIncome - (globalPaid + globalGeneralExpense));
        if (els.dashDebt) els.dashDebt.textContent = formatCurrency(globalDebt);

        if (!els.qtDate.value) els.qtDate.value = new Date().toISOString().split('T')[0];
        renderRecentTransactions();
    };

    const renderRecentTransactions = () => {
        els.dashTodayTbody.innerHTML = '';

        const recentTrans = [...data.transactions].sort((a, b) => b.id - a.id).slice(0, 15);

        if (recentTrans.length === 0) {
            els.dashTodayTbody.innerHTML = `<tr><td colspan="5" class="empty-state">
                <span class="material-icons-round">inbox</span><p>Henüz işlem girilmedi.</p>
            </td></tr>`;
            return;
        }

        recentTrans.forEach(t => {
            const p = data.projects.find(x => x.id === t.projectId);
            const s = data.suppliers.find(x => x.id === t.supplierId);

            const isOut = t.type === 'payment' || t.type === 'general_expense';

            const typeMap = {
                payment: { text: 'Ödeme', badge: 'badge-payment' },
                cost: { text: 'Hakediş', badge: 'badge-cost' },
                income: { text: 'Tahsilat', badge: 'badge-income' },
                yevmiye: { text: 'Yevmiye', badge: 'badge-yevmiye' },
                general_expense: { text: 'Genel Gider', badge: 'badge-general' }
            };

            const typeInfo = typeMap[t.type] || { text: t.type, badge: 'badge-cost' };

            let projSupText = '-';
            if (p) projSupText = p.name;
            if (s) projSupText += ' / ' + s.name;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color:var(--text-muted); white-space:nowrap;">${formatDate(t.date)}</td>
                <td>${t.desc || '-'}</td>
                <td style="color:var(--text-muted); font-size:12px;">${projSupText}</td>
                <td><span class="type-badge ${typeInfo.badge}">${typeInfo.text}</span></td>
                <td class="${isOut ? 'val-positive' : 'val-negative'}">
                    ${isOut ? '−' : '+'}${formatCurrency(t.amount)}
                </td>
            `;
            els.dashTodayTbody.appendChild(tr);
        });
    };

    const renderProjects = () => {
        els.projectsList.innerHTML = '';
        if (data.projects.length === 0) {
            els.projectsList.innerHTML = `<div class="empty-state">
                <span class="material-icons-round">apartment</span>
                <p>Henüz proje eklenmedi.</p>
            </div>`;
            return;
        }

        data.projects.forEach(proj => {
            const kasa = getProjectKasa(proj.id);
            const projSups = data.assignments.filter(a => a.projectId === proj.id);

            const block = document.createElement('div');
            block.className = 'project-block';

            block.innerHTML = `
                <div class="project-header">
                    <div class="project-header-left">
                        <h3>${proj.name}</h3>
                        <button class="project-delete-btn" onclick="app.deleteProject(${proj.id})" title="Projeyi Sil">
                            <span class="material-icons-round" style="font-size:18px;">delete_outline</span>
                        </button>
                    </div>
                    <div class="project-stats">
                        <span class="stat-badge"><span style="color:var(--success);">Alınan:</span> <strong style="color:var(--success);">${formatCurrency(kasa.income)}</strong></span>
                        <span class="stat-badge"><span style="color:var(--danger);">Ödenen:</span> <strong style="color:var(--danger);">${formatCurrency(kasa.paid)}</strong></span>
                        <span class="stat-badge"><span>Kasa:</span> <strong style="color:${kasa.kasa >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(kasa.kasa)}</strong></span>
                        <span class="stat-badge" style="border-color:rgba(255,171,0,0.3);"><span style="color:var(--warning);">Borç:</span> <strong style="color:var(--warning);">${formatCurrency(kasa.totalDebt)}</strong></span>
                    </div>
                </div>
                <div class="suppliers-grid" id="proj-grid-${proj.id}"></div>
            `;
            els.projectsList.appendChild(block);

            const grid = document.getElementById(`proj-grid-${proj.id}`);
            if (projSups.length === 0) {
                grid.innerHTML = `<div class="empty-state" style="padding:24px;"><span class="material-icons-round" style="font-size:32px;">person_off</span><p>Tedarikçi atanmamış.</p></div>`;
            }

            projSups.forEach(assign => {
                const sup = data.suppliers.find(s => s.id === assign.supplierId);
                if (!sup) return;
                const st = getSupplierProjectBalance(proj.id, sup.id);
                if (!st) return;

                const sozlesmeMetni = assign.isYevmiye
                    ? `<span style="color:var(--primary); font-size:12px;">Yevmiye: ${formatCurrency(assign.dailyWage)}</span>`
                    : formatCurrency(st.initialCost);

                const card = document.createElement('div');
                card.className = 'supplier-card';
                card.onclick = () => openHistory(proj.id, sup.id);

                card.innerHTML = `
                    <div class="sup-header">
                        <h4>${sup.name}</h4>
                        <button class="sup-remove-btn" onclick="event.stopPropagation(); app.removeSupplierFromProject(${proj.id}, ${sup.id})" title="Projeden Çıkar">
                            <span class="material-icons-round" style="font-size:16px;">close</span>
                        </button>
                    </div>
                    <div class="sup-stats">
                        <div class="stat-row"><span>Sözleşme:</span><strong>${sozlesmeMetni}</strong></div>
                        <div class="stat-row"><span>Güncel Maliyet:</span><strong>${formatCurrency(st.totalMaliyet)}</strong></div>
                        <div class="stat-row"><span>Ödenen:</span><strong style="color:var(--success);">${formatCurrency(st.paid)}</strong></div>
                        <div class="stat-row balance-row"><span>Bakiye:</span><strong class="${st.balance > 0 ? 'danger' : 'success'}">${formatCurrency(st.balance)}</strong></div>
                    </div>
                `;
                grid.appendChild(card);
            });
        });
    };

    const renderSuppliers = () => {
        els.suppliersList.innerHTML = '';
        if (data.suppliers.length === 0) {
            els.suppliersList.innerHTML = `<div class="empty-state">
                <span class="material-icons-round">group_off</span>
                <p>Henüz tedarikçi eklenmedi.</p>
            </div>`;
            return;
        }

        data.suppliers.forEach(sup => {
            const st = getGlobalSupplierBalance(sup.id);
            const card = document.createElement('div');
            card.className = 'supplier-card glass-panel';
            card.onclick = () => openGlobalHistory(sup.id);

            card.innerHTML = `
                <div class="sup-header">
                    <h4>${sup.name}</h4>
                    <button class="sup-remove-btn" onclick="event.stopPropagation(); app.deleteGlobalSupplier(${sup.id})" title="Tedarikçiyi Sil">
                        <span class="material-icons-round" style="font-size:16px;">delete_outline</span>
                    </button>
                </div>
                <div class="sup-stats">
                    <div class="stat-row"><span>Toplam Maliyet:</span><strong>${formatCurrency(st.globalMaliyet)}</strong></div>
                    <div class="stat-row"><span>Toplam Ödenen:</span><strong style="color:var(--success);">${formatCurrency(st.globalPaid)}</strong></div>
                    <div class="stat-row balance-row"><span>Genel Bakiye:</span><strong class="${st.globalBalance > 0 ? 'danger' : 'success'}">${formatCurrency(st.globalBalance)}</strong></div>
                </div>
            `;
            els.suppliersList.appendChild(card);
        });
    };

    const renderExpenses = () => {
        els.expensesList.innerHTML = '';
        const exps = data.transactions
            .filter(t => t.type === 'general_expense')
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        if (exps.length === 0) {
            els.expensesList.innerHTML = `<div class="empty-state">
                <span class="material-icons-round">receipt_long</span>
                <p>Henüz genel gider eklenmemiş.</p>
            </div>`;
            return;
        }

        const groups = {};
        exps.forEach(t => {
            const date = new Date(t.date);
            const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
            const monthName = date.toLocaleString('tr-TR', { month: 'long', year: 'numeric' });
            if (!groups[key]) groups[key] = { label: monthName, total: 0, items: [] };
            groups[key].items.push(t);
            groups[key].total += t.amount;
        });

        Object.keys(groups).sort((a, b) => b.localeCompare(a)).forEach(key => {
            const g = groups[key];
            const block = document.createElement('div');
            block.className = 'expense-month-block';

            const itemsHtml = g.items.map(t => `
                <div class="expense-item">
                    <div class="exp-left">
                        <span style="color:var(--text-muted); font-size:12px;">${formatDate(t.date)}</span>
                        <span>${t.desc || 'Genel Gider'}</span>
                    </div>
                    <div class="exp-right">
                        <strong style="color:var(--danger);">${formatCurrency(t.amount)}</strong>
                        <button class="btn danger-btn sm-btn" onclick="app.deleteTransaction(${t.id})">Sil</button>
                    </div>
                </div>
            `).join('');

            block.innerHTML = `
                <div class="expense-month-header">
                    <span>${g.label}</span>
                    <strong>Toplam: ${formatCurrency(g.total)}</strong>
                </div>
                <div class="expense-items">${itemsHtml}</div>
            `;
            els.expensesList.appendChild(block);
        });
    };

    const populateDropdowns = () => {
        const fillSelect = (select, items, placeholder) => {
            const currentVal = select.value;
            select.innerHTML = items.length === 0 ? `<option value="">${placeholder}</option>` : '';
            items.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = item.name;
                select.appendChild(opt);
            });
            if (currentVal && items.find(i => i.id == currentVal)) select.value = currentVal;
        };

        fillSelect(els.qtProject, data.projects, 'Proje Yok');
        fillSelect(els.assignProj, data.projects, 'Proje Yok');
        fillSelect(els.assignSup, data.suppliers, 'Tedarikçi Yok');

        handleQtProjectChange();
    };

    // ─── UI Interactions ───
    const switchView = (viewId, e) => {
        if (e) e.preventDefault();
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));

        document.getElementById(`view-${viewId}`).classList.add('active');

        const navItem = document.querySelector(`.nav-links li[data-view="${viewId}"]`);
        if (navItem) navItem.classList.add('active');

        // Close mobile sidebar
        document.getElementById('sidebar').classList.remove('open');
    };

    const openModal = (id) => {
        document.getElementById(id).classList.add('active');
        const form = document.querySelector(`#${id} form`);
        if (form) form.reset();
        if (id === 'modal-assign-supplier') handleAssignTypeChange();
    };

    const closeModal = (id) => {
        document.getElementById(id).classList.remove('active');
        if (id === 'modal-history' && els.qtTransId.value === '') {
            currentHistoryContext = null;
        }
    };

    // ─── Quick Transaction ───
    const handleQtTypeChange = () => {
        const type = els.qtType.value;
        els.qtProjectGroup.style.display = 'block';
        els.qtSupplierGroup.style.display = 'block';
        els.qtDaysGroup.style.display = 'none';
        document.getElementById('qt-days-label').textContent = 'Kişi / Gün Sayısı';

        if (type === 'income') {
            els.qtSupplierGroup.style.display = 'none';
        } else if (type === 'general_expense') {
            els.qtProjectGroup.style.display = 'none';
            els.qtSupplierGroup.style.display = 'none';
        } else if (type === 'yevmiye') {
            els.qtDaysGroup.style.display = 'block';
        }

        handleQtSupplierChange();
    };

    const handleQtProjectChange = () => {
        const projId = parseInt(els.qtProject.value);
        els.qtSupplier.innerHTML = '';
        if (isNaN(projId)) return;

        const assigns = data.assignments.filter(a => a.projectId === projId);

        if (assigns.length === 0) {
            els.qtSupplier.innerHTML = '<option value="">Bu projede tedarikçi yok</option>';
        } else {
            assigns.forEach(a => {
                const sup = data.suppliers.find(s => s.id === a.supplierId);
                if (sup) {
                    const opt = document.createElement('option');
                    opt.value = sup.id;
                    opt.textContent = sup.name;
                    els.qtSupplier.appendChild(opt);
                }
            });
        }
        handleQtSupplierChange();
    };

    const handleQtSupplierChange = () => {
        const projId = parseInt(els.qtProject.value);
        const supId = parseInt(els.qtSupplier.value);
        let isYev = false;

        if (!isNaN(projId) && !isNaN(supId)) {
            const assign = data.assignments.find(a => a.projectId === projId && a.supplierId === supId);
            if (assign && assign.isYevmiye) isYev = true;
        }

        const type = els.qtType.value;
        if (type === 'payment') {
            if (isYev) {
                els.qtDaysGroup.style.display = 'block';
                document.getElementById('qt-days-label').textContent = 'Kaç Yevmiye Ödeniyor?';
                calculateYevmiye();
            } else {
                els.qtDaysGroup.style.display = 'none';
            }
        } else if (type === 'yevmiye') {
            document.getElementById('qt-days-label').textContent = 'Kişi / Gün Sayısı';
            calculateYevmiye();
        }
    };

    const calculateYevmiye = () => {
        const type = els.qtType.value;
        if (type !== 'yevmiye' && type !== 'payment') return;

        const projId = parseInt(els.qtProject.value);
        const supId = parseInt(els.qtSupplier.value);
        const days = parseFloat(els.qtDays.value) || 0;

        if (!isNaN(projId) && !isNaN(supId)) {
            const assign = data.assignments.find(a => a.projectId === projId && a.supplierId === supId);
            if (assign && assign.isYevmiye && days > 0) {
                els.qtAmount.value = assign.dailyWage * days;
            }
        }
    };

    const saveTransaction = (e) => {
        e.preventDefault();
        const type = els.qtType.value;
        let projectId = null, supplierId = null;

        if (type !== 'general_expense') {
            projectId = parseInt(els.qtProject.value);
            if (isNaN(projectId)) { showToast('Lütfen proje seçin.', 'warning'); return; }
        }

        if (type !== 'income' && type !== 'general_expense') {
            supplierId = parseInt(els.qtSupplier.value);
            if (isNaN(supplierId)) { showToast('Lütfen tedarikçi seçin.', 'warning'); return; }
        }

        const amount = parseFloat(els.qtAmount.value);
        if (!amount || amount <= 0) { showToast('Geçerli bir tutar girin.', 'warning'); return; }

        const isYevmiyeType = type === 'yevmiye' || (type === 'payment' && els.qtDaysGroup.style.display !== 'none');
        const days = isYevmiyeType ? parseFloat(els.qtDays.value) || null : null;
        const date = els.qtDate.value;

        const descMap = {
            income: 'Müşteri Tahsilatı',
            cost: 'Ek Maliyet / Hakediş',
            yevmiye: `Yevmiye Hakedişi${days ? ` (${days} Gün)` : ''}`,
            payment: days ? `Ödeme (${days} Yevmiye)` : 'Ödeme',
            general_expense: 'Ofis / Genel Gider'
        };

        const desc = els.qtDesc.value || descMap[type] || 'İşlem';
        const transId = els.qtTransId.value;

        if (transId) {
            const t = data.transactions.find(x => x.id == transId);
            if (t) {
                t.type = type; t.projectId = projectId; t.supplierId = supplierId;
                t.amount = amount; t.date = date; t.desc = desc; t.days = days;
            }
            cancelEdit();
            showToast('İşlem güncellendi.', 'success');
        } else {
            data.transactions.push({
                id: generateId(data.transactions),
                projectId, supplierId, type, amount, date, desc, days
            });

            els.qtAmount.value = '';
            els.qtDays.value = '';
            els.qtDesc.value = '';
            els.qtDate.value = new Date().toISOString().split('T')[0];
            showToast('İşlem kaydedildi.', 'success');
        }

        saveData();

        if (transId && currentHistoryContext) {
            if (currentHistoryContext.type === 'project') {
                switchView('projects');
                openHistory(currentHistoryContext.projectId, currentHistoryContext.supplierId);
            } else {
                switchView('suppliers');
                openGlobalHistory(currentHistoryContext.supplierId);
            }
        }
    };

    const editTransaction = (id) => {
        const t = data.transactions.find(x => x.id === id);
        if (!t) return;
        closeModal('modal-history');
        switchView('dashboard');

        els.qtTransId.value = t.id;
        els.qtType.value = t.type;
        handleQtTypeChange();

        if (t.projectId) els.qtProject.value = t.projectId;
        handleQtProjectChange();

        if (t.supplierId) els.qtSupplier.value = t.supplierId;

        if ((t.type === 'yevmiye' || t.type === 'payment') && t.days) {
            els.qtDays.value = t.days;
        }

        els.qtAmount.value = t.amount;
        els.qtDate.value = t.date;
        els.qtDesc.value = t.desc;

        els.qtSubmitBtn.innerHTML = '<span class="material-icons-round" style="font-size:18px;vertical-align:middle;margin-right:4px;">edit</span> Değişikliği Kaydet';
        els.qtCancelBtn.style.display = 'block';

        // Scroll to form
        document.querySelector('.quick-transaction').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const cancelEdit = () => {
        els.qtTransId.value = '';
        els.qtSubmitBtn.innerHTML = '<span class="material-icons-round" style="font-size:18px;vertical-align:middle;margin-right:4px;">save</span> İşlemi Kaydet';
        els.qtCancelBtn.style.display = 'none';
        document.getElementById('qt-form').reset();
        els.qtDate.value = new Date().toISOString().split('T')[0];
        handleQtTypeChange();

        if (currentHistoryContext) {
            if (currentHistoryContext.type === 'project') {
                switchView('projects');
                openHistory(currentHistoryContext.projectId, currentHistoryContext.supplierId);
            } else {
                switchView('suppliers');
                openGlobalHistory(currentHistoryContext.supplierId);
            }
        }
    };

    const deleteTransaction = (id) => {
        if (confirm('Bu işlemi silmek istediğinize emin misiniz?')) {
            data.transactions = data.transactions.filter(x => x.id !== id);
            saveData();
            showToast('İşlem silindi.', 'warning');

            if (document.getElementById('modal-history').classList.contains('active') && currentHistoryContext) {
                if (currentHistoryContext.type === 'project') {
                    openHistory(currentHistoryContext.projectId, currentHistoryContext.supplierId);
                } else {
                    openGlobalHistory(currentHistoryContext.supplierId);
                }
            }
        }
    };

    // ─── CRUD Actions ───
    const addProject = (e) => {
        e.preventDefault();
        const name = document.getElementById('new-proj-name').value.trim();
        if (!name) return;
        data.projects.push({ id: generateId(data.projects), name });
        saveData();
        closeModal('modal-new-project');
        showToast(`"${name}" projesi oluşturuldu.`, 'success');
    };

    const deleteProject = (projectId) => {
        const proj = data.projects.find(p => p.id === projectId);
        if (!proj) return;
        if (confirm(`"${proj.name}" projesini ve tüm ilişkili verileri silmek istediğinize emin misiniz?`)) {
            data.projects = data.projects.filter(p => p.id !== projectId);
            data.assignments = data.assignments.filter(a => a.projectId !== projectId);
            data.transactions = data.transactions.filter(t => t.projectId !== projectId);
            saveData();
            showToast(`"${proj.name}" projesi silindi.`, 'warning');
        }
    };

    const addGlobalSupplier = (e) => {
        e.preventDefault();
        const name = document.getElementById('new-sup-name').value.trim();
        if (!name) return;
        data.suppliers.push({ id: generateId(data.suppliers), name });
        saveData();
        closeModal('modal-new-supplier');
        showToast(`"${name}" tedarikçi olarak eklendi.`, 'success');
    };

    const deleteGlobalSupplier = (supplierId) => {
        const sup = data.suppliers.find(s => s.id === supplierId);
        if (!sup) return;
        if (confirm(`"${sup.name}" tedarikçisini ve tüm ilişkili verilerini silmek istediğinize emin misiniz?`)) {
            data.suppliers = data.suppliers.filter(s => s.id !== supplierId);
            data.assignments = data.assignments.filter(a => a.supplierId !== supplierId);
            data.transactions = data.transactions.filter(t => t.supplierId !== supplierId);
            saveData();
            showToast(`"${sup.name}" silindi.`, 'warning');
        }
    };

    const handleAssignTypeChange = () => {
        const isYev = els.assignIsYevmiye.checked;
        if (isYev) {
            els.assignCostGroup.style.display = 'none';
            els.assignWageGroup.style.display = 'block';
            els.assignCost.value = 0;
        } else {
            els.assignCostGroup.style.display = 'block';
            els.assignWageGroup.style.display = 'none';
            els.assignWage.value = 0;
        }
    };

    const assignSupplierToProject = (e) => {
        e.preventDefault();
        const projectId = parseInt(els.assignProj.value);
        const supplierId = parseInt(els.assignSup.value);
        const isYevmiye = els.assignIsYevmiye.checked;
        const initialCost = parseFloat(els.assignCost.value) || 0;
        const dailyWage = parseFloat(els.assignWage.value) || 0;

        if (isNaN(projectId) || isNaN(supplierId)) {
            showToast('Proje ve Tedarikçi seçmelisiniz.', 'warning');
            return;
        }

        const exists = data.assignments.find(a => a.projectId === projectId && a.supplierId === supplierId);
        if (exists) {
            showToast('Bu tedarikçi zaten bu projede ekli.', 'error');
            return;
        }

        data.assignments.push({
            id: generateId(data.assignments),
            projectId, supplierId, initialCost, isYevmiye, dailyWage
        });

        saveData();
        closeModal('modal-assign-supplier');
        showToast('Tedarikçi projeye atandı.', 'success');
    };

    const removeSupplierFromProject = (projectId, supplierId) => {
        if (confirm('Bu tedarikçiyi projeden çıkarmak istediğinize emin misiniz?\n\nDİKKAT: Bu tedarikçinin bu projedeki tüm işlem geçmişi de silinecektir!')) {
            data.assignments = data.assignments.filter(a => !(a.projectId === projectId && a.supplierId === supplierId));
            data.transactions = data.transactions.filter(t => !(t.projectId === projectId && t.supplierId === supplierId));
            saveData();
            showToast('Tedarikçi projeden çıkarıldı.', 'warning');
        }
    };

    // ─── History ───
    const openHistory = (projectId, supplierId) => {
        currentHistoryContext = { type: 'project', projectId, supplierId };
        const sup = data.suppliers.find(s => s.id === supplierId);
        const proj = data.projects.find(p => p.id === projectId);
        if (!sup || !proj) return;
        const trans = data.transactions
            .filter(t => t.projectId === projectId && t.supplierId === supplierId)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        document.getElementById('hist-title').textContent = `${proj.name} — ${sup.name}`;
        renderHistoryTable(trans);
        openModal('modal-history');
    };

    const openGlobalHistory = (supplierId) => {
        currentHistoryContext = { type: 'global', supplierId };
        const sup = data.suppliers.find(s => s.id === supplierId);
        if (!sup) return;
        const trans = data.transactions
            .filter(t => t.supplierId === supplierId)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        document.getElementById('hist-title').textContent = `${sup.name} — Tüm Projeler`;
        renderHistoryTable(trans);
        openModal('modal-history');
    };

    const renderHistoryTable = (transList) => {
        const tbody = document.getElementById('hist-tbody');
        tbody.innerHTML = '';

        if (transList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><span class="material-icons-round">search_off</span><p>İşlem bulunamadı.</p></td></tr>`;
            return;
        }

        transList.forEach(t => {
            const p = data.projects.find(x => x.id === t.projectId);
            const isPayment = t.type === 'payment';

            const typeMap = {
                payment: 'Ödeme',
                cost: 'Hakediş',
                income: 'Tahsilat',
                yevmiye: 'Yevmiye'
            };

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="white-space:nowrap;">${formatDate(t.date)}</td>
                <td>${t.desc || '-'}</td>
                <td style="color:var(--text-muted);">${p ? p.name : '-'}</td>
                <td>${typeMap[t.type] || t.type}</td>
                <td class="${isPayment ? 'val-negative' : 'val-positive'}">
                    ${isPayment ? '−' : '+'}${formatCurrency(t.amount)}
                </td>
                <td>
                    <div class="action-group">
                        <button class="btn warning-btn sm-btn" onclick="app.editTransaction(${t.id})">Düzenle</button>
                        <button class="btn danger-btn sm-btn" onclick="app.deleteTransaction(${t.id})">Sil</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    };

    // ─── Keyboard Shortcuts ───
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => {
                m.classList.remove('active');
            });
            document.getElementById('sidebar').classList.remove('open');
        }
    });

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });

    // ─── Initialize ───
    loadData();

    // ─── Public API ───
    return {
        switchView,
        openModal, closeModal,
        addProject, deleteProject,
        addGlobalSupplier, deleteGlobalSupplier,
        assignSupplierToProject, removeSupplierFromProject,
        handleAssignTypeChange,
        handleQtTypeChange, handleQtProjectChange, handleQtSupplierChange,
        calculateYevmiye, saveTransaction,
        editTransaction, cancelEdit, deleteTransaction,
        resetDataConfirm, exportData, importData
    };
})();

window.app = App;
