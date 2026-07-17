const STORAGE_KEY = 'asset-tracker-data';
const DEFAULT_CATEGORIES = ['现金存款', '基金', '股票', '房产', '保险', '加密货币', '其他', '负债'];
// 正资产调色板：低饱和柔和色（iOS 莫兰迪/雾面调），色相均匀、无相近撞色，深色背景下不刺眼
const CATEGORY_COLORS = ['#7ba0c9','#8f8bc7','#a986bf','#cf9a6a','#ccbb6f','#77b389','#6fb0b0','#7fb3ce'];
// 负债专用色：柔和玫灰红，深色背景下沉稳不刺眼，同时传达负向语义
const LIABILITY_COLOR = '#c0808f';
const isLiability = (cat) => typeof cat === 'string' && cat.includes('负债');
const THEME_KEY = 'asset-tracker-theme';

class AssetTracker {
    constructor() {
        this.data = this.loadData();
        this.charts = {};
        this._initialized = false;
        this.setup();
    }

    // 首屏轻量启动：只绑定事件 + 渲染当前可见的「总览」页，
    // 其余页面在切换时由 bindNavigation 懒渲染，避免进入时白做功。
    setup() {
        this.createToastContainer();
        this.bindNavigation();
        this.bindSheetGesture();
        this.preventDoubleTapZoom();
        this.restoreHideAmounts();
        this.restoreTheme();
        this._initialized = true;
        this.renderDashboard();
        this.setSnapshotDate();
    }

    // 全量刷新（导入/清除数据后调用）
    init() {
        if (!this._initialized) this.setup();
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

        // 较上次：直接对比上一笔快照（用户约每月固定记录一次，口径清晰）
        if (latest && snapshots.length >= 2) {
            const prev = snapshots[snapshots.length - 2];
            const pt = this.getSnapshotTotal(prev);
            const change = total - pt;
            const pct = pt !== 0 ? (change / Math.abs(pt) * 100).toFixed(2) : 0;
            this.animateNumber('month-change', change);
            const el = document.getElementById('month-change-pct');
            el.textContent = `${change >= 0 ? '+' : ''}${pct}%`;
            el.className = `card-change ${change >= 0 ? 'positive' : 'negative'}`;
        } else {
            document.getElementById('month-change').textContent = '¥0';
            document.getElementById('month-change-pct').textContent = '';
        }

        // 年度收益：优先用「去年最后一笔快照」作为年初基准；若无（缺年初数据）则回退到今年第一笔
        const yearStart = new Date().getFullYear() + '-01-01';
        const lastYearSnap = [...snapshots].reverse().find(s => s.date < yearStart);
        const yearFirstSnap = snapshots.find(s => s.date >= yearStart);
        const yearBase = lastYearSnap || yearFirstSnap;
        if (latest && yearBase && yearBase !== latest) {
            const yStart = this.getSnapshotTotal(yearBase);
            const yChange = total - yStart;
            const yPct = yStart !== 0 ? (yChange / Math.abs(yStart) * 100).toFixed(2) : 0;
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
            this.renderAccountAllocationChart(latest);
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
        // 去抖：数值几乎没变化时直接赋值，避免频繁切 tab 反复滚动
        if (Math.abs(target - from) < 0.5) { el.textContent = this.formatMoney(target); return; }
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

    isHidden() {
        return document.querySelector('.app').classList.contains('hide-amounts');
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
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => this.isHidden() ? '****' : '¥' + i.raw.toLocaleString() } } },
                scales: {
                    x: { grid: { color: this._cssVar('--chart-grid') }, ticks: { color: this._cssVar('--text-muted'), maxTicksLimit: 6 } },
                    y: { grid: { color: this._cssVar('--chart-grid') }, ticks: { color: this._cssVar('--text-muted'), callback: v => this.isHidden() ? '' : '¥' + (v / 10000).toFixed(0) + '万' } }
                }
            }
        });
    }

    // 类别 → 颜色的稳定映射（按类别在列表中的索引），使两个饼图色彩呼应
    categoryColor(cat) {
        if (isLiability(cat)) return LIABILITY_COLOR; // 负债锁定柔和玫灰红
        // 负债不占调色板索引，正资产按过滤后的顺序取色，颜色分布更连续
        const list = this.data.categories.filter(c => !isLiability(c));
        const idx = list.indexOf(cat);
        return CATEGORY_COLORS[(idx < 0 ? 0 : idx) % CATEGORY_COLORS.length];
    }

    // 提亮颜色：用于同类别下多个账户的区分
    shadeColor(hex, percent) {
        const n = parseInt(hex.slice(1), 16);
        let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        r = Math.min(255, Math.round(r + (255 - r) * percent));
        g = Math.min(255, Math.round(g + (255 - g) * percent));
        b = Math.min(255, Math.round(b + (255 - b) * percent));
        return `rgb(${r},${g},${b})`;
    }

    // 饼图空状态占位
    _setChartEmpty(canvasId, empty) {
        const cv = document.getElementById(canvasId);
        if (!cv) return;
        let ph = cv.parentElement.querySelector('.chart-empty');
        if (empty) {
            cv.style.display = 'none';
            if (!ph) {
                ph = document.createElement('div');
                ph.className = 'chart-empty';
                ph.textContent = '暂无数据';
                cv.parentElement.appendChild(ph);
            }
            ph.style.display = '';
        } else {
            cv.style.display = '';
            if (ph) ph.style.display = 'none';
        }
    }

    _doughnutTooltip() {
        return {
            callbacks: {
                label: (i) => {
                    const t = i.dataset.data.reduce((a, b) => a + b, 0);
                    const pct = ((i.raw / t) * 100).toFixed(1);
                    if (this.isHidden()) return `${i.label}: **** (${pct}%)`;
                    return `${i.label}: ¥${i.raw.toLocaleString()} (${pct}%)`;
                }
            }
        };
    }

    // 自定义饼图图例：每项直接标注百分比，移动端无需 hover 即可看清比例
    _renderLegend(containerId, labels, data, colors) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const total = data.reduce((a, b) => a + b, 0) || 1;
        // 按占比降序排列，方便一眼看主次
        const rows = labels.map((l, i) => ({ label: l, color: colors[i], value: data[i] }))
            .sort((a, b) => b.value - a.value);
        el.innerHTML = rows.map(r => {
            const pct = ((r.value / total) * 100).toFixed(1);
            return `<div class="legend-row">
                <span class="legend-dot" style="background:${r.color}"></span>
                <span class="legend-label">${r.label}</span>
                <span class="legend-pct">${pct}%</span>
            </div>`;
        }).join('');
    }

    renderAllocationChart(snapshot) {
        const ctx = document.getElementById('chart-allocation');
        if (this.charts.allocation) this.charts.allocation.destroy();
        const ct = {};
        this.data.accounts.forEach(a => {
            const v = snapshot.assets[a.id] || 0;
            if (v > 0) ct[a.category] = (ct[a.category] || 0) + v; // 仅正资产进配置图，负债不参与
        });
        const labels = Object.keys(ct), data = Object.values(ct);
        this._setChartEmpty('chart-allocation', !labels.length);
        if (!labels.length) { this._renderLegend('legend-allocation', [], [], []); return; }
        const colors = labels.map(l => this.categoryColor(l));
        this.charts.allocation = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }] },
            options: {
                responsive: true, cutout: '68%',
                plugins: {
                    legend: { display: false }, // 用下方自定义图例（带百分比）代替
                    tooltip: this._doughnutTooltip()
                }
            }
        });
        this._renderLegend('legend-allocation', labels, data, colors);
    }

    renderAccountAllocationChart(snapshot) {
        const ctx = document.getElementById('chart-account-allocation');
        if (this.charts.accountAllocation) this.charts.accountAllocation.destroy();
        const items = this.data.accounts
            .map(a => ({ name: a.name, category: a.category, value: snapshot.assets[a.id] || 0 }))
            .filter(x => x.value > 0)
            .sort((a, b) => b.value - a.value);
        this._setChartEmpty('chart-account-allocation', !items.length);
        if (!items.length) { this._renderLegend('legend-account-allocation', [], [], []); return; }
        // 账户颜色继承所属类别，同类别多个账户按亮度区分，与左侧类别图呼应
        const seen = {};
        const colors = items.map(x => {
            const base = this.categoryColor(x.category);
            const k = seen[x.category] = (seen[x.category] || 0) + 1;
            return k === 1 ? base : this.shadeColor(base, Math.min((k - 1) * 0.18, 0.72));
        });
        const labels = items.map(x => x.name), data = items.map(x => x.value);
        this.charts.accountAllocation = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }] },
            options: {
                responsive: true, cutout: '68%',
                plugins: {
                    legend: { display: false }, // 用下方自定义图例（带百分比）代替
                    tooltip: this._doughnutTooltip()
                }
            }
        });
        this._renderLegend('legend-account-allocation', labels, data, colors);
    }

    // 切换资产分布视图：按类别 / 按账户（合并为一个卡片 + 分段切换）
    switchAllocationView(view) {
        document.querySelectorAll('.allocation-card .seg-btn')
            .forEach(b => b.classList.toggle('active', b.dataset.view === view));
        const cat = document.getElementById('view-category');
        const acc = document.getElementById('view-account');
        if (cat) cat.classList.toggle('active', view === 'category');
        if (acc) acc.classList.toggle('active', view === 'account');
        // 隐藏容器渲染时尺寸可能为 0，切回可见后让对应图表重新适配
        const chart = view === 'category' ? this.charts.allocation : this.charts.accountAllocation;
        if (chart) chart.resize();
    }

    // ==================== 主题：浅色 / 深色 / 跟随系统 ====================
    // 读取 CSS 变量当前值，供图表配色与主题保持一致
    _cssVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    getThemePref() {
        return localStorage.getItem(THEME_KEY) || 'auto';
    }

    // 应用主题：mode = auto/light/dark；auto 时跟随系统
    applyTheme(mode) {
        const dark = mode === 'dark'
            || (mode === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        // 同步状态栏/浏览器主题色
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', dark ? '#000000' : '#f2f2f7');
        // 图表配色依赖 CSS 变量，主题变了需重渲（清脏检查缓存强制重画）
        if (this._initialized) {
            this._trendHash = null;
            this.renderDashboard();
            this.renderHistory();
        }
    }

    // 用户选择主题
    setTheme(mode) {
        localStorage.setItem(THEME_KEY, mode);
        this.applyTheme(mode);
        this._syncThemeButtons(mode);
    }

    _syncThemeButtons(mode) {
        document.querySelectorAll('#theme-seg .seg-btn')
            .forEach(b => b.classList.toggle('active', b.dataset.themeOpt === mode));
    }

    // 启动时恢复主题偏好，并在 auto 模式下监听系统切换
    restoreTheme() {
        const mode = this.getThemePref();
        this.applyTheme(mode);
        this._syncThemeButtons(mode);
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (this.getThemePref() === 'auto') this.applyTheme('auto');
            });
        }
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
                    <div class="category-dot" style="background:${this.categoryColor(n)}"></div>
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
        this.showActionSheet('此操作不可恢复，将同时清除该账户在所有历史快照中的记录', [
            {
                label: '删除账户', destructive: true, action: () => {
                    this.data.accounts = this.data.accounts.filter(a => a.id !== id);
                    // 清理孤儿数据：同步移除所有快照中该账户的条目，避免总额与明细对不上
                    this.data.snapshots.forEach(s => { delete s.assets[id]; });
                    this.saveData(); this.renderAccounts(); this.renderDashboard(); this.toast('已删除');
                }
            }
        ]);
    }

    // ==================== Snapshot ====================
    setSnapshotDate() {
        const el = document.getElementById('snapshot-date');
        const today = new Date().toISOString().split('T')[0];
        el.value = today;
        el.max = today; // #4 记录日期不能选未来
    }

    renderSnapshotForm() {
        const c = document.getElementById('snapshot-accounts');
        const dateVal = document.getElementById('snapshot-date').value;
        // #5 若所选日期已存在快照 → 进入编辑模式，预填该快照原值；否则用最新快照作参考
        const existing = this.data.snapshots.find(s => s.date === dateVal);
        const isEditing = !!existing;
        const snap = existing || this.getLatestSnapshot();
        const grouped = {};
        this.data.accounts.forEach(a => { if (!grouped[a.category]) grouped[a.category] = []; grouped[a.category].push(a); });

        if (!Object.keys(grouped).length) {
            c.innerHTML = `<div class="empty-state">
                <div class="empty-state-icon" style="font-size:48px">📊</div>
                <div class="empty-state-text">还没有账户<br>在「我的」中添加账户后即可记录</div>
            </div>`;
            return;
        }

        let html = isEditing
            ? `<div class="snapshot-edit-banner">正在编辑 ${dateVal} 的历史记录，保存后将覆盖该日数据</div>`
            : '';
        html += Object.entries(grouped).map(([cat, accs]) => `
            <div class="ios-group">
                <div class="ios-group-header">${cat}</div>
                ${accs.map(a => {
                    const pv = snap ? (snap.assets[a.id] || 0) : 0;
                    return `<div class="snapshot-input-row">
                        <span class="snapshot-input-name">${a.name}</span>
                        <input class="snapshot-input-field" type="number" inputmode="decimal"
                            data-account-id="${a.id}" data-category="${cat}"
                            placeholder="金额（负债填负数）" value="${pv || ''}"
                            oninput="app.updateSnapshotTotals()">
                        <span class="snapshot-prev">${(!isEditing && pv) ? '上次 ' + this.formatMoneyShort(pv) : ''}</span>
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
            if (v !== 0) has = true;
        });
        if (!has) { this.toast('请至少填写一个金额（负债填负数）', 'error'); return; }

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
        this.renderAccountRank();
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
                    borderColor: this.categoryColor(cat),
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
                    legend: { labels: { color: this._cssVar('--text-secondary'), font: { size: 11 } } },
                    tooltip: { callbacks: { label: i => this.isHidden() ? `${i.dataset.label}: ****` : `${i.dataset.label}: ¥${i.raw.toLocaleString()}` } }
                },
                scales: {
                    x: { grid: { color: this._cssVar('--chart-grid') }, ticks: { color: this._cssVar('--text-muted'), maxTicksLimit: 6 } },
                    y: { grid: { color: this._cssVar('--chart-grid') }, ticks: { color: this._cssVar('--text-muted'), callback: v => this.isHidden() ? '' : '¥' + (v / 10000).toFixed(0) + '万' } }
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

    calcAnnualizedReturn(startVal, endVal, days) {
        if (startVal <= 0 || days < 1) return null;
        // 简单年化：(收益率) * (365/天数)
        const returnRate = (endVal - startVal) / startVal;
        return returnRate * (365 / days);
    }

    formatAnnualized(rate) {
        if (rate === null) return '';
        const pct = (rate * 100).toFixed(1);
        const cls = rate >= 0 ? 'positive' : 'negative';
        return `<span class="annualized ${cls}">${rate >= 0 ? '+' : ''}${pct}%/yr</span>`;
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
        const days = (new Date(lastSnap.date) - new Date(firstSnap.date)) / (1000 * 60 * 60 * 24);
        const catData = {};
        this.data.accounts.forEach(a => {
            const startVal = firstSnap.assets[a.id] || 0;
            const endVal = lastSnap.assets[a.id] || 0;
            if (!catData[a.category]) catData[a.category] = { start: 0, end: 0 };
            catData[a.category].start += startVal;
            catData[a.category].end += endVal;
        });

        const sorted = Object.entries(catData).map(([name, d]) => ({
            name, endVal: d.end, change: d.end - d.start,
            annualized: this.calcAnnualizedReturn(d.start, d.end, days)
        })).sort((a, b) => b.change - a.change);

        el.innerHTML = sorted.map(({ name, endVal, change, annualized }) =>
            `<div class="category-rank-row">
                <div class="rank-main"><span class="category-rank-name">${name}</span><span class="rank-current">${this.formatMoneyShort(endVal)}</span></div>
                <div class="rank-sub"><span class="category-rank-change ${change >= 0 ? 'positive' : 'negative'}">${change >= 0 ? '+' : ''}${this.formatMoneyShort(change)}</span>${this.formatAnnualized(annualized)}</div>
            </div>`
        ).join('');
    }

    renderAccountRank() {
        const el = document.getElementById('account-rank');
        const range = parseInt(document.getElementById('history-range').value);
        let snaps = [...this.data.snapshots].sort((a, b) => a.date.localeCompare(b.date));
        if (range > 0) {
            const co = new Date(); co.setMonth(co.getMonth() - range);
            snaps = snaps.filter(s => s.date >= co.toISOString().split('T')[0]);
        }
        if (snaps.length < 2) { el.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:14px">数据不足</div>'; return; }

        const firstSnap = snaps[0], lastSnap = snaps[snaps.length - 1];
        const days = (new Date(lastSnap.date) - new Date(firstSnap.date)) / (1000 * 60 * 60 * 24);
        const accChanges = this.data.accounts.map(a => {
            const startVal = firstSnap.assets[a.id] || 0;
            const endVal = lastSnap.assets[a.id] || 0;
            return {
                name: a.name, endVal,
                change: endVal - startVal,
                annualized: this.calcAnnualizedReturn(startVal, endVal, days)
            };
        }).filter(x => x.change !== 0).sort((a, b) => b.change - a.change);

        if (!accChanges.length) {
            el.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:14px">期间无变化</div>';
            return;
        }

        el.innerHTML = accChanges.map(({ name, endVal, change, annualized }) =>
            `<div class="category-rank-row">
                <div class="rank-main"><span class="category-rank-name">${name}</span><span class="rank-current">${this.formatMoneyShort(endVal)}</span></div>
                <div class="rank-sub"><span class="category-rank-change ${change >= 0 ? 'positive' : 'negative'}">${change >= 0 ? '+' : ''}${this.formatMoneyShort(change)}</span>${this.formatAnnualized(annualized)}</div>
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
            <div class="history-detail" id="detail-${i}">
                ${details || '<div class="history-detail-row"><span>无明细</span><span></span></div>'}
                <button class="history-edit-btn" onclick="event.stopPropagation(); app.editSnapshot('${s.date}')">编辑此快照</button>
            </div>`;
        }).join('');
        this.bindSwipeDelete(c, (date) => this.deleteSnapshot(date));
    }

    toggleHistoryDetail(id) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('open');
    }

    // #5 编辑历史快照：跳到记录页，把日期设为该快照并按其原值预填
    editSnapshot(date) {
        const nav = document.querySelector('.nav-item[data-page="snapshot"]');
        if (nav) nav.click(); // 切换到「记录」页（会先按今天渲染一次）
        const el = document.getElementById('snapshot-date');
        if (el) el.value = date; // 覆盖为要编辑的日期
        this.renderSnapshotForm(); // 按该日期重渲染并预填
        document.querySelector('.main-content').scrollTop = 0;
        this.toast('正在编辑 ' + date);
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
                this.showActionSheet('选择导入方式', [
                    {
                        label: '合并（保留现有并补充）', action: () => {
                            this.mergeImport(d); this.saveData(); this.init();
                            this.toast('已合并导入', 'success');
                        }
                    },
                    {
                        label: '覆盖（清空并替换）', destructive: true, action: () => {
                            this.data = d; this.saveData(); this.init();
                            this.toast('已覆盖导入', 'success');
                        }
                    }
                ]);
            } catch (err) {
                this.toast('导入失败：' + err.message, 'error');
            }
        };
        r.readAsText(f);
        event.target.value = '';
    }

    mergeImport(d) {
        // 类别去重合并
        (d.categories || []).forEach(c => { if (!this.data.categories.includes(c)) this.data.categories.push(c); });
        // 账户按 id 合并（已存在则跳过，避免重复）
        (d.accounts || []).forEach(a => { if (!this.data.accounts.find(x => x.id === a.id)) this.data.accounts.push(a); });
        // 快照按日期合并：同日期合并明细（导入值优先），新日期直接追加
        (d.snapshots || []).forEach(ns => {
            const ex = this.data.snapshots.find(s => s.date === ns.date);
            if (ex) Object.assign(ex.assets, ns.assets);
            else this.data.snapshots.push(ns);
        });
        this.data.snapshots.sort((a, b) => a.date.localeCompare(b.date));
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
        // 重渲染图表，让趋势/饼图坐标轴与 tooltip 同步打码或恢复
        this._trendHash = null;
        this.renderDashboard();
        if (document.getElementById('page-history')?.classList.contains('active')) this.updateHistoryChart();
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
