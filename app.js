// Asset Tracker App
const STORAGE_KEY = 'asset-tracker-data';

const DEFAULT_CATEGORIES = ['现金存款', '基金', '股票', '房产', '保险', '加密货币', '其他'];

const CATEGORY_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'
];

class AssetTracker {
    constructor() {
        this.data = this.loadData();
        this.charts = {};
        this.init();
    }

    init() {
        this.createToastContainer();
        this.bindNavigation();
        this.preventDoubleTapZoom();
        this.renderDashboard();
        this.renderAccounts();
        this.renderSnapshotForm();
        this.renderHistory();
        this.renderSettings();
        this.setSnapshotDate();
    }

    // ==================== Toast 通知 ====================
    createToastContainer() {
        if (!document.querySelector('.toast-container')) {
            const el = document.createElement('div');
            el.className = 'toast-container';
            document.body.appendChild(el);
        }
    }

    toast(message, type = 'info') {
        const container = document.querySelector('.toast-container');
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => el.remove(), 2600);
    }

    // ==================== 防止 iOS 双击缩放 ====================
    preventDoubleTapZoom() {
        let lastTap = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTap < 300) {
                e.preventDefault();
            }
            lastTap = now;
        }, { passive: false });
    }

    // ==================== 数据加载/保存 ====================
    loadData() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.error('数据加载失败:', e);
        }
        return {
            categories: [...DEFAULT_CATEGORIES],
            accounts: [],
            snapshots: []
        };
    }

    saveData() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            this.toast('数据保存失败，存储空间可能不足', 'error');
        }
    }

    // ==================== 导航 ====================
    bindNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                item.classList.add('active');
                document.getElementById(`page-${page}`).classList.add('active');

                // 滚动到顶部
                document.querySelector('.main-content').scrollTop = 0;

                if (page === 'dashboard') this.renderDashboard();
                if (page === 'history') this.renderHistory();
                if (page === 'snapshot') this.renderSnapshotForm();
                if (page === 'accounts') this.renderAccounts();
            });
        });
    }

    // ==================== 仪表盘 ====================
    renderDashboard() {
        const snapshots = [...this.data.snapshots].sort((a, b) => a.date.localeCompare(b.date));
        const latest = snapshots[snapshots.length - 1];
        const previous = snapshots[snapshots.length - 2];

        const total = latest ? this.getSnapshotTotal(latest) : 0;
        document.getElementById('total-assets').textContent = this.formatMoney(total);

        if (latest) {
            document.getElementById('last-update').textContent = `最近更新: ${latest.date}`;
        } else {
            document.getElementById('last-update').textContent = '';
        }

        // 月度变化
        if (latest && previous) {
            const prevTotal = this.getSnapshotTotal(previous);
            const change = total - prevTotal;
            const pct = prevTotal > 0 ? (change / prevTotal * 100).toFixed(2) : 0;
            document.getElementById('month-change').textContent = this.formatMoney(change);
            const changeEl = document.getElementById('month-change-pct');
            changeEl.textContent = `${change >= 0 ? '+' : ''}${pct}%`;
            changeEl.className = `card-change ${change >= 0 ? 'positive' : 'negative'}`;
        } else {
            document.getElementById('month-change').textContent = '¥0';
            document.getElementById('month-change-pct').textContent = '';
        }

        document.getElementById('account-count').textContent = this.data.accounts.length;
        const usedCategories = [...new Set(this.data.accounts.map(a => a.category))];
        document.getElementById('category-count').textContent = usedCategories.length;

        this.renderTrendChart(snapshots);

        if (latest) {
            this.renderAllocationChart(latest);
            this.renderCategoryList(latest);
        } else {
            // 空状态
            document.getElementById('category-list').innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-text">暂无数据<br>请先添加账户，再记录第一笔快照</div>
                </div>
            `;
        }
    }

    getSnapshotTotal(snapshot) {
        return Object.values(snapshot.assets).reduce((sum, val) => sum + (val || 0), 0);
    }

    renderTrendChart(snapshots) {
        const ctx = document.getElementById('chart-trend');
        if (this.charts.trend) this.charts.trend.destroy();

        if (snapshots.length === 0) {
            this.charts.trend = new Chart(ctx, {
                type: 'line',
                data: { labels: ['暂无数据'], datasets: [{ data: [0], borderColor: '#6366f1' }] },
                options: { responsive: true, plugins: { legend: { display: false } },
                    scales: { x: { display: false }, y: { display: false } } }
            });
            return;
        }

        this.charts.trend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: snapshots.map(s => s.date),
                datasets: [{
                    label: '总资产',
                    data: snapshots.map(s => this.getSnapshotTotal(s)),
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: snapshots.length > 20 ? 2 : 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (item) => '¥' + item.raw.toLocaleString()
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#8b8fa3', maxTicksLimit: 8 }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#8b8fa3',
                            callback: (val) => '¥' + (val / 10000).toFixed(0) + '万'
                        }
                    }
                }
            }
        });
    }

    renderAllocationChart(snapshot) {
        const ctx = document.getElementById('chart-allocation');
        if (this.charts.allocation) this.charts.allocation.destroy();

        const categoryTotals = {};
        this.data.accounts.forEach(account => {
            const val = snapshot.assets[account.id] || 0;
            if (val > 0) {
                categoryTotals[account.category] = (categoryTotals[account.category] || 0) + val;
            }
        });

        const labels = Object.keys(categoryTotals);
        const data = Object.values(categoryTotals);

        if (labels.length === 0) return;

        const colors = labels.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]);

        this.charts.allocation = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#8b8fa3', padding: 12, font: { size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (item) => {
                                const total = item.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((item.raw / total) * 100).toFixed(1);
                                return `${item.label}: ¥${item.raw.toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    renderCategoryList(snapshot) {
        const container = document.getElementById('category-list');
        const categoryTotals = {};

        this.data.accounts.forEach(account => {
            const val = snapshot.assets[account.id] || 0;
            categoryTotals[account.category] = (categoryTotals[account.category] || 0) + val;
        });

        const total = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
        const sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

        if (sorted.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-text">暂无数据</div></div>';
            return;
        }

        container.innerHTML = sorted.map(([name, value], i) => {
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
            return `
                <div class="category-item">
                    <div class="category-item-left">
                        <div class="category-dot" style="background:${color}"></div>
                        <span class="category-name">${name}</span>
                    </div>
                    <div>
                        <span class="category-value">${this.formatMoney(value)}</span>
                        <span class="category-pct">${pct}%</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ==================== 账户管理 ====================
    renderAccounts() {
        const grid = document.getElementById('accounts-grid');
        const latestSnapshot = this.getLatestSnapshot();

        if (this.data.accounts.length === 0) {
            grid.innerHTML = `
                <div class="account-card" style="display:flex;align-items:center;justify-content:center;min-height:160px;border-style:dashed;" onclick="app.showAddAccount()">
                    <div style="text-align:center;color:var(--text-muted)">
                        <div style="font-size:32px;margin-bottom:8px">+</div>
                        <div>添加第一个账户</div>
                    </div>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.data.accounts.map(account => {
            const balance = latestSnapshot ? (latestSnapshot.assets[account.id] || 0) : 0;
            return `
                <div class="account-card">
                    <div class="account-card-header">
                        <span class="account-category-tag">${account.category}</span>
                        <div class="account-card-actions">
                            <button onclick="event.stopPropagation();app.editAccount('${account.id}')" title="编辑">✏️</button>
                            <button onclick="event.stopPropagation();app.deleteAccount('${account.id}')" title="删除">🗑️</button>
                        </div>
                    </div>
                    <div class="account-name">${account.name}</div>
                    <div class="account-balance">${this.formatMoney(balance)}</div>
                </div>
            `;
        }).join('');
    }

    showAddAccount(editId = null) {
        const account = editId ? this.data.accounts.find(a => a.id === editId) : null;
        const title = account ? '编辑账户' : '添加账户';

        const categoryOptions = this.data.categories.map(c =>
            `<option value="${c}" ${account && account.category === c ? 'selected' : ''}>${c}</option>`
        ).join('');

        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = `
            <div class="form-group">
                <label>账户名称</label>
                <input type="text" id="input-account-name" placeholder="如：招商银行储蓄卡" value="${account ? account.name : ''}" autocomplete="off">
            </div>
            <div class="form-group">
                <label>资产类别</label>
                <select id="input-account-category">${categoryOptions}</select>
            </div>
            <button class="btn-primary" onclick="app.saveAccount('${editId || ''}')">${title}</button>
        `;
        this.openModal();
        // 自动聚焦
        setTimeout(() => document.getElementById('input-account-name').focus(), 100);
    }

    editAccount(id) {
        this.showAddAccount(id);
    }

    saveAccount(editId) {
        const name = document.getElementById('input-account-name').value.trim();
        const category = document.getElementById('input-account-category').value;

        if (!name) {
            this.toast('请输入账户名称', 'error');
            return;
        }

        if (editId) {
            const account = this.data.accounts.find(a => a.id === editId);
            account.name = name;
            account.category = category;
            this.toast('账户已更新', 'success');
        } else {
            this.data.accounts.push({
                id: 'acc_' + Date.now(),
                name,
                category
            });
            this.toast('账户添加成功', 'success');
        }

        this.saveData();
        this.renderAccounts();
        this.closeModal();
    }

    deleteAccount(id) {
        if (!confirm('确定删除此账户？')) return;
        this.data.accounts = this.data.accounts.filter(a => a.id !== id);
        this.saveData();
        this.renderAccounts();
        this.toast('账户已删除');
    }

    // ==================== 快照 ====================
    setSnapshotDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('snapshot-date').value = today;
    }

    renderSnapshotForm() {
        const container = document.getElementById('snapshot-accounts');
        const latestSnapshot = this.getLatestSnapshot();

        const grouped = {};
        this.data.accounts.forEach(account => {
            if (!grouped[account.category]) grouped[account.category] = [];
            grouped[account.category].push(account);
        });

        if (Object.keys(grouped).length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <div class="empty-state-text">请先在「账户管理」中添加账户</div>
                </div>
            `;
            return;
        }

        let html = Object.entries(grouped).map(([category, accounts]) => `
            <div class="snapshot-category" data-category="${category}">
                <h3>${category}</h3>
                ${accounts.map(account => {
                    const prevVal = latestSnapshot ? (latestSnapshot.assets[account.id] || 0) : 0;
                    return `
                        <div class="snapshot-account-row">
                            <span class="snapshot-account-name">${account.name}</span>
                            <input class="snapshot-account-input" type="number" inputmode="decimal"
                                data-account-id="${account.id}"
                                data-category="${category}"
                                placeholder="输入金额"
                                value="${prevVal || ''}"
                                onchange="app.updateSnapshotTotals()"
                                oninput="app.updateSnapshotTotals()">
                            <span class="snapshot-account-prev">上次: ${this.formatMoney(prevVal)}</span>
                        </div>
                    `;
                }).join('')}
                <div class="snapshot-category-total">
                    <span>小计</span>
                    <strong data-subtotal="${category}">¥0</strong>
                </div>
            </div>
        `).join('');

        html += `
            <div class="snapshot-total-bar">
                <span class="label">总计</span>
                <span class="value" id="snapshot-grand-total">¥0</span>
            </div>
        `;

        container.innerHTML = html;
        this.updateSnapshotTotals();
    }

    updateSnapshotTotals() {
        const inputs = document.querySelectorAll('.snapshot-account-input');
        const subtotals = {};
        let grandTotal = 0;

        inputs.forEach(input => {
            const category = input.dataset.category;
            const val = parseFloat(input.value) || 0;
            subtotals[category] = (subtotals[category] || 0) + val;
            grandTotal += val;
        });

        // 更新各类别小计
        Object.entries(subtotals).forEach(([category, sum]) => {
            const el = document.querySelector(`[data-subtotal="${category}"]`);
            if (el) el.textContent = this.formatMoney(sum);
        });

        // 更新总计
        const totalEl = document.getElementById('snapshot-grand-total');
        if (totalEl) totalEl.textContent = this.formatMoney(grandTotal);
    }

    saveSnapshot() {
        const date = document.getElementById('snapshot-date').value;
        if (!date) {
            this.toast('请选择日期', 'error');
            return;
        }

        const assets = {};
        let hasData = false;
        document.querySelectorAll('.snapshot-account-input').forEach(input => {
            const val = parseFloat(input.value) || 0;
            assets[input.dataset.accountId] = val;
            if (val > 0) hasData = true;
        });

        if (!hasData) {
            this.toast('请至少填写一个账户的金额', 'error');
            return;
        }

        const existingIdx = this.data.snapshots.findIndex(s => s.date === date);
        if (existingIdx >= 0) {
            if (!confirm(`${date} 的快照已存在，是否覆盖？`)) return;
            this.data.snapshots[existingIdx].assets = assets;
        } else {
            this.data.snapshots.push({ date, assets });
        }

        this.data.snapshots.sort((a, b) => a.date.localeCompare(b.date));
        this.saveData();
        this.toast('快照保存成功！', 'success');
        this.renderSnapshotForm();
    }

    // ==================== 历史趋势 ====================
    renderHistory() {
        this.updateHistoryChart();
        this.renderHistoryTable();
    }

    updateHistoryChart() {
        const range = parseInt(document.getElementById('history-range').value);
        let snapshots = [...this.data.snapshots].sort((a, b) => a.date.localeCompare(b.date));

        if (range > 0) {
            const cutoff = new Date();
            cutoff.setMonth(cutoff.getMonth() - range);
            const cutoffStr = cutoff.toISOString().split('T')[0];
            snapshots = snapshots.filter(s => s.date >= cutoffStr);
        }

        const ctx = document.getElementById('chart-history');
        if (this.charts.history) this.charts.history.destroy();

        if (snapshots.length === 0) {
            this.charts.history = new Chart(ctx, {
                type: 'line',
                data: { labels: ['暂无数据'], datasets: [{ data: [0], borderColor: '#6366f1' }] },
                options: { responsive: true, plugins: { legend: { display: false } },
                    scales: { x: { display: false }, y: { display: false } } }
            });
            return;
        }

        const datasets = [{
            label: '总资产',
            data: snapshots.map(s => this.getSnapshotTotal(s)),
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: snapshots.length > 20 ? 1 : 3
        }];

        const categoryData = {};
        snapshots.forEach(snapshot => {
            this.data.accounts.forEach(account => {
                if (!categoryData[account.category]) categoryData[account.category] = {};
                if (!categoryData[account.category][snapshot.date]) categoryData[account.category][snapshot.date] = 0;
                categoryData[account.category][snapshot.date] += (snapshot.assets[account.id] || 0);
            });
        });

        Object.entries(categoryData).forEach(([category, dateMap], i) => {
            const data = snapshots.map(s => dateMap[s.date] || 0);
            if (data.some(v => v > 0)) {
                datasets.push({
                    label: category,
                    data,
                    borderColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                    tension: 0.4,
                    borderWidth: 1.5,
                    pointRadius: snapshots.length > 20 ? 0 : 2,
                    borderDash: [4, 4]
                });
            }
        });

        this.charts.history = new Chart(ctx, {
            type: 'line',
            data: {
                labels: snapshots.map(s => s.date),
                datasets
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: { color: '#8b8fa3', font: { size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (item) => `${item.dataset.label}: ¥${item.raw.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#8b8fa3', maxTicksLimit: 8 }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#8b8fa3',
                            callback: (val) => '¥' + (val / 10000).toFixed(0) + '万'
                        }
                    }
                }
            }
        });
    }

    renderHistoryTable() {
        const tbody = document.querySelector('#history-table tbody');
        const snapshots = [...this.data.snapshots].sort((a, b) => b.date.localeCompare(a.date));

        if (snapshots.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px">暂无快照记录</td></tr>`;
            return;
        }

        tbody.innerHTML = snapshots.map((snapshot, i) => {
            const total = this.getSnapshotTotal(snapshot);
            const prev = snapshots[i + 1] ? this.getSnapshotTotal(snapshots[i + 1]) : total;
            const change = total - prev;
            const changeClass = change >= 0 ? 'positive' : 'negative';
            return `
                <tr>
                    <td>${snapshot.date}</td>
                    <td>${this.formatMoney(total)}</td>
                    <td class="${changeClass}">${change >= 0 ? '+' : ''}${this.formatMoney(change)}</td>
                    <td><button class="btn-delete-snapshot" onclick="app.deleteSnapshot('${snapshot.date}')">删除</button></td>
                </tr>
            `;
        }).join('');
    }

    deleteSnapshot(date) {
        if (!confirm(`确定删除 ${date} 的快照？`)) return;
        this.data.snapshots = this.data.snapshots.filter(s => s.date !== date);
        this.saveData();
        this.renderHistory();
        this.toast('快照已删除');
    }

    // ==================== 设置 ====================
    renderSettings() {
        const container = document.getElementById('category-manager');
        container.innerHTML = this.data.categories.map(cat => `
            <div class="category-manager-item">
                <span>${cat}</span>
                <button onclick="app.deleteCategory('${cat}')">&times;</button>
            </div>
        `).join('');
    }

    showAddCategory() {
        document.getElementById('modal-title').textContent = '添加资产类别';
        document.getElementById('modal-body').innerHTML = `
            <div class="form-group">
                <label>类别名称</label>
                <input type="text" id="input-category-name" placeholder="如：数字货币" autocomplete="off">
            </div>
            <button class="btn-primary" onclick="app.addCategory()">添加</button>
        `;
        this.openModal();
        setTimeout(() => document.getElementById('input-category-name').focus(), 100);
    }

    addCategory() {
        const name = document.getElementById('input-category-name').value.trim();
        if (!name) {
            this.toast('请输入类别名称', 'error');
            return;
        }
        if (this.data.categories.includes(name)) {
            this.toast('该类别已存在', 'error');
            return;
        }

        this.data.categories.push(name);
        this.saveData();
        this.renderSettings();
        this.closeModal();
        this.toast('类别添加成功', 'success');
    }

    deleteCategory(name) {
        const hasAccounts = this.data.accounts.some(a => a.category === name);
        if (hasAccounts) {
            this.toast('该类别下还有账户，无法删除', 'error');
            return;
        }
        if (!confirm(`确定删除类别「${name}」？`)) return;

        this.data.categories = this.data.categories.filter(c => c !== name);
        this.saveData();
        this.renderSettings();
        this.toast('类别已删除');
    }

    // ==================== 数据导入导出 ====================
    exportData() {
        const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `asset-tracker-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast('数据导出成功', 'success');
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!imported.categories || !imported.accounts || !imported.snapshots) {
                    throw new Error('数据格式不正确');
                }
                if (!confirm('导入将覆盖现有数据，确定继续？')) return;
                this.data = imported;
                this.saveData();
                this.init();
                this.toast('导入成功！', 'success');
            } catch (err) {
                this.toast('导入失败：' + err.message, 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    clearData() {
        if (!confirm('确定清除所有数据？此操作不可恢复！')) return;
        if (!confirm('再次确认：所有账户和历史快照将被永久删除。')) return;
        localStorage.removeItem(STORAGE_KEY);
        this.data = { categories: [...DEFAULT_CATEGORIES], accounts: [], snapshots: [] };
        this.init();
        this.toast('数据已清除');
    }

    // ==================== 工具方法 ====================
    formatMoney(amount) {
        if (Math.abs(amount) >= 10000) {
            return '¥' + (amount / 10000).toFixed(2) + '万';
        }
        return '¥' + amount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    getLatestSnapshot() {
        if (this.data.snapshots.length === 0) return null;
        return [...this.data.snapshots].sort((a, b) => b.date.localeCompare(a.date))[0];
    }

    openModal() {
        document.getElementById('modal-overlay').classList.add('active');
    }

    closeModal() {
        document.getElementById('modal-overlay').classList.remove('active');
    }
}

// 启动
const app = new AssetTracker();

// 模态框外部点击关闭
document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) app.closeModal();
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') app.closeModal();
});
