const STORAGE_KEY = 'asset-tracker-data';
const DEFAULT_CATEGORIES = ['现金存款', '基金', '股票', '房产', '保险', '加密货币', '其他'];
const CATEGORY_COLORS = ['#0a84ff','#30d158','#ff9f0a','#ff453a','#bf5af2','#64d2ff','#ff375f','#32d74b'];

class AssetTracker {
    constructor() {
        this.data = this.loadData();
        this.charts = {};
        this._initialized = false;
        this.init();
    }

    init() {
        if (!this._initialized) {
            this.createToastContainer();
            this.bindNavigation();
            this.bindSheetGesture();
            this.preventDoubleTapZoom();
            this.restoreHideAmounts();
            this._initialized = true;
        }
        this.renderDashboard();
        this.renderAccounts();
        this.renderSnapshotForm();
        this.renderHistory();
        this.renderSettings();
        this.setSnapshotDate();
    }

    // ==================== Toast ====================
    createToastContainer() {
        if (!document.querySelector('.toast-container')) {
            const el = document.createElement('div');
            el.className = 'toast-container';
            document.body.appendChild(el);
        }
    }

    toast(msg, type = 'info') {
        const c = document.querySelector('.toast-container');
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        c.appendChild(el);
        setTimeout(() => el.remove(), 2600);
    }

    // ==================== Action Sheet ====================
    showActionSheet(title, actions) {
        return new Promise(resolve => {
            const overlay = document.getElementById('action-sheet-overlay');
            const sheet = document.getElementById('action-sheet');
            let html = '<div class="action-sheet-group">';
            if (title) html += `<div class="action-sheet-title">${title}</div>`;
            actions.forEach((a, i) => {
                html += `<button class="action-sheet-btn ${a.destructive ? 'destructive' : ''}" data-idx="${i}">${a.label}</button>`;
            });
            html += '</div>';
            html += '<button class="action-sheet-cancel" data-idx="-1">取消</button>';
            sheet.innerHTML = html;

            const cleanup = () => {
                overlay.classList.remove('active');
                sheet.querySelectorAll('button').forEach(b => b.removeEventListener('click', handler));
                overlay.removeEventListener('click', bgHandler);
            };
            const handler = (e) => {
                const idx = parseInt(e.target.dataset.idx);
                cleanup();
                if (idx >= 0 && actions[idx].action) actions[idx].action();
                resolve(idx);
            };
            const bgHandler = (e) => {
                if (e.target === overlay) { cleanup(); resolve(-1); }
            };

            sheet.querySelectorAll('button').forEach(b => b.addEventListener('click', handler));
            overlay.addEventListener('click', bgHandler);
            overlay.classList.add('active');
        });
    }

    // ==================== Sheet (Bottom Modal) ====================
    openSheet(title, bodyHTML) {
        const sheet = document.getElementById('sheet');
        document.getElementById('sheet-title').textContent = title;
        document.getElementById('sheet-body').innerHTML = bodyHTML;
        sheet.style.transform = '';
        document.getElementById('sheet-overlay').classList.add('active');
    }

    closeSheet() {
        document.getElementById('sheet-overlay').classList.remove('active');
    }

    bindSheetGesture() {
        const overlay = document.getElementById('sheet-overlay');
        const sheet = document.getElementById('sheet');
        let startY = 0, currentY = 0, dragging = false;

        sheet.addEventListener('touchstart', (e) => {
            if (sheet.scrollTop > 0) return;
            startY = e.touches[0].clientY;
            dragging = true;
            sheet.style.transition = 'none';
        }, { passive: true });

        sheet.addEventListener('touchmove', (e) => {
            if (!dragging) return;
            currentY = e.touches[0].clientY - startY;
            if (currentY > 0) {
                sheet.style.transform = `translateY(${currentY}px)`;
            }
        }, { passive: true });

        sheet.addEventListener('touchend', () => {
            if (!dragging) return;
            dragging = false;
            sheet.style.transition = '';
            if (currentY > 100) {
                this.closeSheet();
            } else {
                sheet.style.transform = '';
            }
            currentY = 0;
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeSheet();
        });
    }

    // ==================== Swipe to delete (互斥) ====================
    bindSwipeDelete(container, onDelete) {
        let currentOpen = null;

        const closeAll = () => {
            if (currentOpen) {
                currentOpen.style.transition = '';
                currentOpen.style.transform = '';
                currentOpen = null;
            }
        };

        // 清理上一次绑定的全局监听
        if (container._swipeAbort) container._swipeAbort.abort();
        const controller = new AbortController();
        container._swipeAbort = controller;

        container.querySelectorAll('.swipe-row').forEach(row => {
            const content = row.querySelector('.swipe-row-content');
            const bg = row.querySelector('.swipe-delete-bg');
            let startX = 0, startY = 0, deltaX = 0, swiping = false, isHorizontal = null;

            content.addEventListener('touchstart', (e) => {
                if (currentOpen && currentOpen !== content) closeAll();
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                deltaX = 0;
                swiping = true;
                isHorizontal = null;
                content.style.transition = 'none';
            }, { passive: true });

            content.addEventListener('touchmove', (e) => {
                if (!swiping) return;
                const dx = e.touches[0].clientX - startX;
                const dy = e.touches[0].clientY - startY;
                if (isHorizontal === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                    isHorizontal = Math.abs(dx) > Math.abs(dy);
                }
                if (isHorizontal && dx < 0) {
                    deltaX = dx;
                    content.style.transform = `translateX(${Math.max(dx, -80)}px)`;
                }
            }, { passive: true });

            content.addEventListener('touchend', () => {
                swiping = false;
                content.style.transition = '';
                if (isHorizontal && deltaX < -50) {
                    content.style.transform = 'translateX(-80px)';
                    currentOpen = content;
                    if (bg) {
                        bg.onclick = () => {
                            content.style.transform = 'translateX(-100%)';
                            currentOpen = null;
                            setTimeout(() => onDelete(row.dataset.id), 300);
                        };
                    }
                } else {
                    content.style.transform = '';
                    if (currentOpen === content) currentOpen = null;
                }
                deltaX = 0;
                isHorizontal = null;
            });

            content.addEventListener('click', () => {
                if (currentOpen === content) closeAll();
            });
        });

        // 全局点击收起（受 AbortController 管理）
        document.addEventListener('touchstart', (e) => {
            if (currentOpen && !currentOpen.closest('.swipe-row').contains(e.target)) {
                closeAll();
            }
        }, { passive: true, signal: controller.signal });
    }

    preventDoubleTapZoom() {
        let lastTap = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTap < 300 && !e.target.closest('input,select,textarea')) e.preventDefault();
            lastTap = now;
        }, { passive: false });
    }

    // ==================== Data ====================
    loadData() {
        try {
            const s = localStorage.getItem(STORAGE_KEY);
            if (s) return JSON.parse(s);
        } catch (e) { }
        return { categories: [...DEFAULT_CATEGORIES], accounts: [], snapshots: [] };
    }

    saveData() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            this.toast('保存失败', 'error');
        }
    }

    // ==================== Navigation ====================
    bindNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                item.classList.add('active');
                document.getElementById(`page-${page}`).classList.add('active');
                document.querySelector('.main-content').scrollTop = 0;
                if (page === 'dashboard') this.renderDashboard();
                if (page === 'history') this.renderHistory();
                if (page === 'snapshot') this.renderSnapshotForm();
                if (page === 'profile') { this.renderAccounts(); this.renderSettings(); }
            });
        });
    }

    // ==================== Dashboard ====================
    renderDashboard() {
        const snapshots = [...this.data.snapshots].sort((a, b) => a.date.localeCompare(b.date));
        const latest = snapshots[snapshots.length - 1];
        const total = latest ? this.getSnapshotTotal(latest) : 0;

        this.animateNumber('total-assets', total);
        document.getElementById('last-update').textContent = latest ? `更新于 ${latest.date}` : '';

        // 本月变化：对比 30 天前最近的快照
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyStr = thirtyDaysAgo.toISOString().split('T')[0];
        const monthAgoSnap = [...snapshots].reverse().find(s => s.date <= thirtyStr);

        if (latest && monthAgoSnap && monthAgoSnap !== latest) {
            const pt = this.getSnapshotTotal(monthAgoSnap);
            const change = total - pt;
            const pct = pt > 0 ? (change / pt * 100).toFixed(2) : 0;
            this.animateNumber('month-change', change);
            const el = document.getElementById('month-change-pct');
            el.textContent = `${change >= 0 ? '+' : ''}${pct}%`;
            el.className = `card-change ${change >= 0 ? 'positive' : 'negative'}`;
        } else if (latest && snapshots.length >= 2) {
            // 回退：对比上一次快照
            const prev = snapshots[snapshots.length - 2];
            const pt = this.getSnapshotTotal(prev);
            const change = total - pt;
            const pct = pt > 0 ? (change / pt * 100).toFixed(2) : 0;
            this.animateNumber('month-change', change);
            const el = document.getElementById('month-change-pct');
            el.textContent = `${change >= 0 ? '+' : ''}${pct}%`;
            el.className = `card-change ${change >= 0 ? 'positive' : 'negative'}`;
        } else {
            document.getElementById('month-change').textContent = '¥0';
            document.getElementById('month-change-pct').textContent = '';
        }

        // 年度收益：对比今年 1 月 1 日之后的第一笔快照
        const yearStart = new Date().getFullYear() + '-01-01';
        const yearFirstSnap = snapshots.find(s => s.date >= yearStart);
        if (latest && yearFirstSnap && yearFirstSnap !== latest) {
            const yStart = this.getSnapshotTotal(yearFirstSnap);
            const yChange = total - yStart;
            const yPct = yStart > 0 ? (yChange / yStart * 100).toFixed(2) : 0;
            this.animateNumber('year-change', yChange);
            const yEl = document.getElementById('year-change-pct');
            yEl.textContent = `${yChange >= 0 ? '+' : ''}${yPct}%`;
            yEl.className = `card-change ${yChange >= 0 ? 'positive' : 'negative'}`;
        } else {
            document.getElementById('year-change').textContent = '¥0';
            document.getElementById('year-change-pct').textContent = '';
        }

        // 趋势摘要
        const summaryEl = document.getElementById('trend-summary');
        if (snapshots.length >= 3) {
            const recent3 = snapshots.slice(-3).map(s => this.getSnapshotTotal(s));
            const allUp = recent3[2] > recent3[1] && recent3[1] > recent3[0];
            const allDown = recent3[2] < recent3[1] && recent3[1] < recent3[0];
            if (allUp) summaryEl.textContent = '📈 连续增长中';
            else if (allDown) summaryEl.textContent = '📉 连续下降';
            else summaryEl.textContent = '📊 波动中，整体' + (recent3[2] >= recent3[0] ? '上升' : '下降');
            summaryEl.style.color = allDown ? 'var(--red)' : allUp ? 'var(--green)' : 'var(--text-secondary)';
        } else if (snapshots.length >= 1) {
            summaryEl.textContent = '记录更多快照后显示趋势';
            summaryEl.style.color = 'var(--text-muted)';
        } else {
            summaryEl.textContent = '暂无数据';
            summaryEl.style.color = 'var(--text-muted)';
        }

        this.renderTrendChart(snapshots);
        if (latest) {
            this.renderAllocationChart(latest);
            this.renderCategoryList(latest);
        } else {
            document.getElementById('category-list').innerHTML =
                '<div class="empty-state"><div class="empty-state-text">在「我的」添加账户<br>在「记录」保存第一笔快照</div></div>';
        }
    }

    animateNumber(id, target) {
        const el = document.getElementById(id);
        if (!el) return;
        // 从当前显示值开始动画
        const currentText = el.textContent.replace(/[¥,万]/g, '');
        let from = parseFloat(currentText) || 0;
        if (el.textContent.includes('万')) from *= 10000;
        const duration = 400;
        const start = performance.now();
        const step = (now) => {
            const t = Math.min((now - start) / duration, 1);
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            el.textContent = this.formatMoney(from + (target - from) * ease);
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    getSnapshotTotal(s) {
        return Object.values(s.assets).reduce((sum, v) => sum + (v || 0), 0);
    }

    renderTrendChart(snapshots) {
        const ctx = document.getElementById('chart-trend');
        // 脏检查
        const hash = snapshots.map(s => s.date + ':' + this.getSnapshotTotal(s)).join('|');
        if (this._trendHash === hash && this.charts.trend) return;
        this._trendHash = hash;
        if (this.charts.trend) this.charts.trend.destroy();
        if (!snapshots.length) {
            this.charts.trend = new Chart(ctx, {
                type: 'line',
                data: { labels: [''], datasets: [{ data: [0], borderColor: '#0a84ff' }] },
                options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
            });
            return;
        }
        this.charts.trend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: snapshots.map(s => s.date),
                datasets: [{
                    label: '总资产', data: snapshots.map(s => this.getSnapshotTotal(s)),
                    borderColor: '#0a84ff', backgroundColor: 'rgba(10,132,255,0.1)',
                    fill: true, tension: 0.4,
                    pointRadius: snapshots.length > 15 ? 1 : 3, pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => '¥' + i.raw.toLocaleString() } } },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#636366', maxTicksLimit: 6 } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#636366', callback: v => '¥' + (v / 10000).toFixed(0) + '万' } }
                }
            }
        });
    }

    renderAllocationChart(snapshot) {
        const ctx = document.getElementById('chart-allocation');
        if (this.charts.allocation) this.charts.allocation.destroy();
        const ct = {};
        this.data.accounts.forEach(a => {
            const v = snapshot.assets[a.id] || 0;
            if (v > 0) ct[a.category] = (ct[a.category] || 0) + v;
        });
        const labels = Object.keys(ct), data = Object.values(ct);
        if (!labels.length) return;
        this.charts.allocation = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]), borderWidth: 0, hoverOffset: 6 }] },
            options: {
                responsive: true, cutout: '68%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#8e8e93', padding: 10, font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: (i) => {
                                const t = i.dataset.data.reduce((a, b) => a + b, 0);
                                return `${i.label}: ¥${i.raw.toLocaleString()} (${((i.raw / t) * 100).toFixed(1)}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    renderCategoryList(snapshot) {
        const c = document.getElementById('category-list');
        const ct = {};
        this.data.accounts.forEach(a => { ct[a.category] = (ct[a.category] || 0) + (snapshot.assets[a.id] || 0); });
        const total = Object.values(ct).reduce((a, b) => a + b, 0);
        const sorted = Object.entries(ct).sort((a, b) => b[1] - a[1]);
        if (!sorted.length) { c.innerHTML = '<div class="empty-state"><div class="empty-state-text">暂无数据</div></div>'; return; }
        c.innerHTML = sorted.map(([n, v], i) => {
            const pct = total > 0 ? ((v / total) * 100).toFixed(1) : 0;
            return `<div class="category-item">
                <div class="category-item-left">
                    <div class="category-dot" style="background:${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"></div>
                    <span class="category-name">${n}</span>
                </div>
                <div>
                    <span class="category-value">${this.formatMoney(v)}</span>
                    <span class="category-pct">${pct}%</span>
                </div>
            </div>`;
        }).join('');
    }

    // ==================== Accounts ====================
    renderAccounts() {
        const list = document.getElementById('accounts-list');
        const snap = this.getLatestSnapshot();
        if (!this.data.accounts.length) {
            list.innerHTML = `<div class="ios-group" style="cursor:pointer" onclick="app.showAddAccount()">
                <div class="empty-state"><div class="empty-state-icon" style="font-size:36px">+</div>
                <div class="empty-state-text">点击添加你的第一个资产账户<br><span style="font-size:13px;color:var(--text-muted)">如：招商银行、余额宝、基金账户等</span></div></div></div>`;
            return;
        }
        const grouped = {};
        this.data.accounts.forEach(a => { if (!grouped[a.category]) grouped[a.category] = []; grouped[a.category].push(a); });

        let rows = '';
        Object.entries(grouped).forEach(([cat, accs]) => {
            rows += `<div class="account-section-header">${cat}</div>`;
            rows += accs.map(a => {
                const bal = snap ? (snap.assets[a.id] || 0) : 0;
                return `<div class="swipe-row" data-id="${a.id}">
                    <div class="swipe-delete-bg">删除</div>
                    <div class="swipe-row-content" onclick="app.showEditAccount('${a.id}')">
                        <div class="account-row-left"><div class="account-row-name">${a.name}</div></div>
                        <span class="account-row-balance">${this.formatMoney(bal)}</span>
                        <svg class="account-row-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.5"><polyline points="9,6 15,12 9,18"/></svg>
                    </div>
                </div>`;
            }).join('');
        });

        list.innerHTML = `<div class="ios-group">${rows}</div>`;

        this.bindSwipeDelete(list, (id) => this.deleteAccount(id));
    }

    showAddAccount(editId = null) {
        const a = editId ? this.data.accounts.find(x => x.id === editId) : null;
        const title = a ? '编辑账户' : '添加账户';
        const opts = this.data.categories.map(c =>
            `<option value="${c}" ${a && a.category === c ? 'selected' : ''}>${c}</option>`
        ).join('');
        this.openSheet(title, `
            <div class="form-group"><label>账户名称</label>
                <input type="text" id="input-account-name" placeholder="如：招商银行储蓄卡" value="${a ? a.name : ''}" autocomplete="off"></div>
            <div class="form-group"><label>资产类别</label>
                <select id="input-account-category">${opts}</select></div>
            <button class="btn-primary" onclick="app.saveAccount('${editId || ''}')">${title}</button>
        `);
        setTimeout(() => document.getElementById('input-account-name')?.focus(), 300);
    }

    showEditAccount(id) { this.showAddAccount(id); }

    saveAccount(editId) {
        const name = document.getElementById('input-account-name').value.trim();
        const cat = document.getElementById('input-account-category').value;
        if (!name) { this.toast('请输入账户名称', 'error'); return; }
        if (editId) {
            const a = this.data.accounts.find(x => x.id === editId);
            a.name = name; a.category = cat;
            this.toast('已更新', 'success');
        } else {
            this.data.accounts.push({ id: 'acc_' + Date.now(), name, category: cat });
            this.toast('添加成功', 'success');
        }
        this.saveData(); this.renderAccounts(); this.closeSheet();
    }

    deleteAccount(id) {
        this.showActionSheet('此操作不可恢复', [
            {
                label: '删除账户', destructive: true, action: () => {
                    this.data.accounts = this.data.accounts.filter(a => a.id !== id);
                    this.saveData(); this.renderAccounts(); this.toast('已删除');
                }
            }
        ]);
    }

    // ==================== Snapshot ====================
    setSnapshotDate() {
        document.getElementById('snapshot-date').value = new Date().toISOString().split('T')[0];
    }

    renderSnapshotForm() {
        const c = document.getElementById('snapshot-accounts');
        const snap = this.getLatestSnapshot();
        const grouped = {};
        this.data.accounts.forEach(a => { if (!grouped[a.category]) grouped[a.category] = []; grouped[a.category].push(a); });

        if (!Object.keys(grouped).length) {
            c.innerHTML = `<div class="empty-state">
                <div class="empty-state-icon" style="font-size:48px">📊</div>
                <div class="empty-state-text">还没有账户<br>在「我的」中添加账户后即可记录</div>
            </div>`;
            return;
        }

        let html = Object.entries(grouped).map(([cat, accs]) => `
            <div class="ios-group">
                <div class="ios-group-header">${cat}</div>
                ${accs.map(a => {
                    const pv = snap ? (snap.assets[a.id] || 0) : 0;
                    return `<div class="snapshot-input-row">
                        <span class="snapshot-input-name">${a.name}</span>
                        <input class="snapshot-input-field" type="number" inputmode="decimal"
                            data-account-id="${a.id}" data-category="${cat}"
                            placeholder="金额" value="${pv || ''}"
                            oninput="app.updateSnapshotTotals()">
                        <span class="snapshot-prev">${pv ? '上次 ' + this.formatMoneyShort(pv) : ''}</span>
                    </div>`;
                }).join('')}
                <div class="snapshot-subtotal"><span>小计</span><strong data-subtotal="${cat}">¥0</strong></div>
            </div>
        `).join('');

        html += '<div class="snapshot-total-bar"><span class="label">总计</span><span class="value" id="snapshot-grand-total">¥0</span></div>';
        c.innerHTML = html;
        this.updateSnapshotTotals();
    }

    updateSnapshotTotals() {
        const inputs = document.querySelectorAll('.snapshot-input-field');
        const sub = {};
        let gt = 0;
        inputs.forEach(i => {
            const v = parseFloat(i.value) || 0;
            sub[i.dataset.category] = (sub[i.dataset.category] || 0) + v;
            gt += v;
        });
        Object.entries(sub).forEach(([c, s]) => {
            const el = document.querySelector(`[data-subtotal="${c}"]`);
            if (el) el.textContent = this.formatMoney(s);
        });
        const te = document.getElementById('snapshot-grand-total');
        if (te) te.textContent = this.formatMoney(gt);
    }

    saveSnapshot() {
        const date = document.getElementById('snapshot-date').value;
        if (!date) { this.toast('请选择日期', 'error'); return; }
        const assets = {};
        let has = false;
        document.querySelectorAll('.snapshot-input-field').forEach(i => {
            const v = parseFloat(i.value) || 0;
            assets[i.dataset.accountId] = v;
            if (v > 0) has = true;
        });
        if (!has) { this.toast('请至少填写一个金额', 'error'); return; }

        const idx = this.data.snapshots.findIndex(s => s.date === date);
        if (idx >= 0) {
            this.showActionSheet(`${date} 的快照已存在`, [{
                label: '覆盖', destructive: true, action: () => {
                    this.data.snapshots[idx].assets = assets;
                    this.data.snapshots.sort((a, b) => a.date.localeCompare(b.date));
                    this.saveData();
                    this.toast('已保存', 'success');
                    this.renderSnapshotForm();
                    this.renderDashboard();
                    this.renderHistory();
                }
            }]);
        } else {
            this.data.snapshots.push({ date, assets });
            this.data.snapshots.sort((a, b) => a.date.localeCompare(b.date));
            this.saveData();
            this.toast('快照已保存', 'success');
            this.renderSnapshotForm();
            this.renderDashboard();
            this.renderHistory();
        }
    }

    // ==================== History ====================
    renderHistory() {
        this.updateHistoryChart();
        this.renderPeriodStats();
        this.renderCategoryRank();
        this.renderHistoryList();
    }

    updateHistoryChart() {
        const range = parseInt(document.getElementById('history-range').value);
        let snaps = [...this.data.snapshots].sort((a, b) => a.date.localeCompare(b.date));
        if (range > 0) {
            const co = new Date();
            co.setMonth(co.getMonth() - range);
            snaps = snaps.filter(s => s.date >= co.toISOString().split('T')[0]);
        }
        const ctx = document.getElementById('chart-history');
        if (this.charts.history) this.charts.history.destroy();
        if (!snaps.length) {
            this.charts.history = new Chart(ctx, {
                type: 'line',
                data: { labels: [''], datasets: [{ data: [0], borderColor: '#0a84ff' }] },
                options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
            });
            return;
        }
        const ds = [{
            label: '总资产', data: snaps.map(s => this.getSnapshotTotal(s)),
            borderColor: '#0a84ff', backgroundColor: 'rgba(10,132,255,0.08)',
            fill: true, tension: 0.4, borderWidth: 2,
            pointRadius: snaps.length > 15 ? 0 : 2
        }];
        const cd = {};
        snaps.forEach(s => {
            this.data.accounts.forEach(a => {
                if (!cd[a.category]) cd[a.category] = {};
                if (!cd[a.category][s.date]) cd[a.category][s.date] = 0;
                cd[a.category][s.date] += (s.assets[a.id] || 0);
            });
        });
        Object.entries(cd).forEach(([cat, dm], i) => {
            const d = snaps.map(s => dm[s.date] || 0);
            if (d.some(v => v > 0)) {
                ds.push({
                    label: cat, data: d,
                    borderColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                    tension: 0.4, borderWidth: 1.5, pointRadius: 0, borderDash: [4, 4]
                });
            }
        });
        this.charts.history = new Chart(ctx, {
            type: 'line',
            data: { labels: snaps.map(s => s.date), datasets: ds },
            options: {
                responsive: true, interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#8e8e93', font: { size: 11 } } },
                    tooltip: { callbacks: { label: i => `${i.dataset.label}: ¥${i.raw.toLocaleString()}` } }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#636366', maxTicksLimit: 6 } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#636366', callback: v => '¥' + (v / 10000).toFixed(0) + '万' } }
                }
            }
        });
    }

    renderPeriodStats() {
        const el = document.getElementById('period-stats');
        const range = parseInt(document.getElementById('history-range').value);
        let snaps = [...this.data.snapshots].sort((a, b) => a.date.localeCompare(b.date));
        if (range > 0) {
            const co = new Date(); co.setMonth(co.getMonth() - range);
            snaps = snaps.filter(s => s.date >= co.toISOString().split('T')[0]);
        }
        if (snaps.length < 2) { el.innerHTML = ''; return; }

        const first = this.getSnapshotTotal(snaps[0]);
        const last = this.getSnapshotTotal(snaps[snaps.length - 1]);
        const change = last - first;
        const pct = first > 0 ? (change / first * 100).toFixed(1) : 0;
        const max = Math.max(...snaps.map(s => this.getSnapshotTotal(s)));

        el.innerHTML = `
            <div class="stat-item"><span>期间变化</span><span class="stat-value ${change >= 0 ? 'positive' : 'negative'}">${change >= 0 ? '+' : ''}${this.formatMoney(change)} (${change >= 0 ? '+' : ''}${pct}%)</span></div>
            <div class="stat-item"><span>最高</span><span class="stat-value">${this.formatMoney(max)}</span></div>
        `;
    }

    renderCategoryRank() {
        const el = document.getElementById('category-rank');
        const range = parseInt(document.getElementById('history-range').value);
        let snaps = [...this.data.snapshots].sort((a, b) => a.date.localeCompare(b.date));
        if (range > 0) {
            const co = new Date(); co.setMonth(co.getMonth() - range);
            snaps = snaps.filter(s => s.date >= co.toISOString().split('T')[0]);
        }
        if (snaps.length < 2) { el.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:14px">数据不足</div>'; return; }

        const firstSnap = snaps[0], lastSnap = snaps[snaps.length - 1];
        const catChanges = {};
        this.data.accounts.forEach(a => {
            const startVal = firstSnap.assets[a.id] || 0;
            const endVal = lastSnap.assets[a.id] || 0;
            catChanges[a.category] = (catChanges[a.category] || 0) + (endVal - startVal);
        });

        const sorted = Object.entries(catChanges).sort((a, b) => b[1] - a[1]);
        el.innerHTML = sorted.map(([name, change]) =>
            `<div class="category-rank-row">
                <span class="category-rank-name">${name}</span>
                <span class="category-rank-change ${change >= 0 ? 'positive' : 'negative'}">${change >= 0 ? '+' : ''}${this.formatMoneyShort(change)}</span>
            </div>`
        ).join('');
    }

    renderHistoryList() {
        const c = document.getElementById('history-list');
        const snaps = [...this.data.snapshots].sort((a, b) => b.date.localeCompare(a.date));
        if (!snaps.length) {
            c.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-state-text">暂无记录</div></div>';
            return;
        }
        c.innerHTML = snaps.map((s, i) => {
            const t = this.getSnapshotTotal(s);
            const p = snaps[i + 1] ? this.getSnapshotTotal(snaps[i + 1]) : t;
            const ch = t - p;

            // 明细数据
            const details = this.data.accounts
                .filter(a => s.assets[a.id] && s.assets[a.id] > 0)
                .map(a => `<div class="history-detail-row"><span>${a.name}</span><span>${this.formatMoney(s.assets[a.id])}</span></div>`)
                .join('');

            return `<div class="swipe-row" data-id="${s.date}">
                <div class="swipe-delete-bg">删除</div>
                <div class="swipe-row-content" onclick="app.toggleHistoryDetail('detail-${i}')">
                    <span class="history-row-date">${s.date}</span>
                    <span class="history-row-total">${this.formatMoney(t)}</span>
                    <span class="history-row-change ${ch >= 0 ? 'positive' : 'negative'}">${ch >= 0 ? '+' : ''}${this.formatMoneyShort(ch)}</span>
                </div>
            </div>
            <div class="history-detail" id="detail-${i}">${details || '<div class="history-detail-row"><span>无明细</span><span></span></div>'}</div>`;
        }).join('');
        this.bindSwipeDelete(c, (date) => this.deleteSnapshot(date));
    }

    toggleHistoryDetail(id) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('open');
    }

    deleteSnapshot(date) {
        this.showActionSheet(`删除 ${date} 的快照`, [{
            label: '删除', destructive: true, action: () => {
                this.data.snapshots = this.data.snapshots.filter(s => s.date !== date);
                this.saveData();
                this.renderHistory();
                this.renderDashboard();
                this.toast('已删除');
            }
        }]);
    }

    // ==================== Settings ====================
    renderSettings() {
        const c = document.getElementById('category-manager');
        c.innerHTML = this.data.categories.map(cat => `
            <div class="swipe-row" data-id="${cat}">
                <div class="swipe-delete-bg">删除</div>
                <div class="swipe-row-content"><span>${cat}</span></div>
            </div>
        `).join('');
        this.bindSwipeDelete(c, (name) => this.deleteCategory(name));
    }

    showAddCategory() {
        this.openSheet('添加类别', `
            <div class="form-group"><label>类别名称</label>
                <input type="text" id="input-category-name" placeholder="如：数字货币" autocomplete="off"></div>
            <button class="btn-primary" onclick="app.addCategory()">添加</button>
        `);
        setTimeout(() => document.getElementById('input-category-name')?.focus(), 300);
    }

    addCategory() {
        const n = document.getElementById('input-category-name').value.trim();
        if (!n) { this.toast('请输入名称', 'error'); return; }
        if (this.data.categories.includes(n)) { this.toast('已存在', 'error'); return; }
        this.data.categories.push(n);
        this.saveData(); this.renderSettings(); this.closeSheet();
        this.toast('已添加', 'success');
    }

    deleteCategory(name) {
        if (this.data.accounts.some(a => a.category === name)) {
            this.toast('该类别下有账户，无法删除', 'error'); return;
        }
        this.showActionSheet(`删除类别「${name}」`, [{
            label: '删除', destructive: true, action: () => {
                this.data.categories = this.data.categories.filter(c => c !== name);
                this.saveData(); this.renderSettings(); this.toast('已删除');
            }
        }]);
    }

    // ==================== Import/Export ====================
    exportData() {
        const b = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `asset-tracker-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        this.toast('导出成功', 'success');
    }

    importData(event) {
        const f = event.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = (e) => {
            try {
                const d = JSON.parse(e.target.result);
                if (!d.categories || !d.accounts || !d.snapshots) throw new Error('格式不正确');
                this.showActionSheet('导入将覆盖现有数据', [{
                    label: '确认导入', destructive: true, action: () => {
                        this.data = d; this.saveData(); this.init();
                        this.toast('导入成功', 'success');
                    }
                }]);
            } catch (err) {
                this.toast('导入失败：' + err.message, 'error');
            }
        };
        r.readAsText(f);
        event.target.value = '';
    }

    clearData() {
        this.showActionSheet('此操作不可恢复，所有数据将被永久删除', [{
            label: '清除所有数据', destructive: true, action: () => {
                localStorage.removeItem(STORAGE_KEY);
                this.data = { categories: [...DEFAULT_CATEGORIES], accounts: [], snapshots: [] };
                this.init();
                this.toast('已清除');
            }
        }]);
    }

    // ==================== Hide Amounts ====================
    toggleHideAmounts() {
        const app = document.querySelector('.app');
        const hidden = app.classList.toggle('hide-amounts');
        localStorage.setItem('asset-tracker-hide', hidden ? '1' : '0');
        this.updateEyeIcon(hidden);
    }

    restoreHideAmounts() {
        const hidden = localStorage.getItem('asset-tracker-hide') === '1';
        if (hidden) document.querySelector('.app').classList.add('hide-amounts');
        this.updateEyeIcon(hidden);
    }

    updateEyeIcon(hidden) {
        const icon = document.getElementById('eye-icon');
        if (!icon) return;
        if (hidden) {
            icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 01-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
        } else {
            icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
        }
    }

    // ==================== Utilities ====================
    formatMoney(a) {
        if (Math.abs(a) >= 10000) return '¥' + (a / 10000).toFixed(2) + '万';
        return '¥' + a.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    formatMoneyShort(a) {
        if (Math.abs(a) >= 10000) return '¥' + (a / 10000).toFixed(1) + '万';
        return '¥' + a.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    getLatestSnapshot() {
        if (!this.data.snapshots.length) return null;
        return [...this.data.snapshots].sort((a, b) => b.date.localeCompare(a.date))[0];
    }
}

const app = new AssetTracker();
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') app.closeSheet(); });
