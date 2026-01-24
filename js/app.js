   const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxfObJiGRrjA749EIM230loYjVbFy7oNsGhr-sXXjdzt3EWjuQSdbWI-WOhyiv-czFXSw/exec";

async function callGAS(functionName, ...args) {
    try {
        const response = await fetch(SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({
                method: functionName,
                parameters: args
            })
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);
        return result;
    } catch (error) {
        console.error(`Lỗi API (${functionName}):`, error);
        throw error;
    }
}

let customers = [];
let staff = [];
let statuses = [];
let currentCustomer = null;
let currentSort = { field: 'id', direction: 'desc' };
let dateFilter = 'thisMonth';
let invoiceData  = [];

// Thêm các biến global cho pagination
let currentPage = 1;
let itemsPerPage = 10;
let filteredCustomers = [];
let currentHistoryLogs = [];
let allHistoryData = [];
let pendingListStatusChange = null;

let historyCurrentPage = 1;
const historyItemsPerPage = 16;
let historyFilteredLogs = [];

let remindCurrentPage = 1;
const remindItemsPerPage = 16;

// Thêm biến global cho user
let currentUser = null;
// Thêm biến global cho sessionId
let currentSessionId = null;

// Thêm biến global cho charts
let statusChart, staffChart, trendChart, staffPerformanceChart, monthlyChart, sourceChart, sourceRevenueChart, staffRevenueChart;

let sources = [];
let careNeededFilter = false;
let reportFromDate = null;
let reportToDate = null;
let confirmCallback = null;

let currentStatusTab = '';

let reminders = [];
let currentRemindFilter = 'pending';
let currentRemindStatus = 'pending';

let parentModal = null;

let customStartDate = null;
let customEndDate = null;

// Cấu hình legend chung cho tất cả biểu đồ
const commonLegendConfig = {
    display: true,
    position: 'top',
    labels: {
        boxWidth: 10,
        boxHeight: 10,
        font: {
            size: 11
        },
        padding: 8,
        usePointStyle: false
    }
};

// --- KHỞI TẠO ỨNG DỤNG ---
document.addEventListener('DOMContentLoaded', function() {
    initApp();
    setupEventListeners();
});

async function initApp() {
    try {
        document.getElementById('login-modal').style.display = 'none';
        currentSessionId = localStorage.getItem('currentSessionId');

// THAY THẾ google.script.run:
        const result = await callGAS('getAllData', currentSessionId );

        if (!result.success) {
            localStorage.removeItem('currentSessionId');
            currentSessionId = null;
            showLoginModal();
            return;
        }

        currentUser = result.user;
        staff = result.staff;
        statuses = result.statuses;
        sources = result.sources;
        customers = result.customers;
      invoiceData = result.invoices;
        window.allHistoryData = result.history || [];
        window.reminders = result.reminders || [];
        renderReminders();
        updateReminderTabBadge();

        // -----------------------------------------

        showUserInfo();
        renderStatusTabs();
        setupPagination();
        filterCustomers();
        populateDropdowns();
        renderSettingsContent();
        setupCustomDateFilter();

        // Khởi tạo bộ lọc ngày cho history (mặc định hôm nay)
        const historyDateInput = document.getElementById('history-date-filter');
        if (historyDateInput) {
             historyDateInput.value = new Date().toISOString().split('T')[0];
        }

        const reportsTab = document.getElementById('reports');
        if (reportsTab && reportsTab.classList.contains('active')) {
            renderReports();
        }

        // --- SỬA LỖI TẠI ĐÂY: Thêm đoạn kiểm tra Tab Lịch sử ---
        // Nếu tab Lịch sử đang active thì tải lại dữ liệu ngay lập tức
        const historyTabContent = document.getElementById('history');
        if (historyTabContent && historyTabContent.classList.contains('active')) {
             loadHistoryLogs();
        }
        // --------------------------------------------------------

    } catch (error) {
        console.error('Lỗi khởi tạo:', error);
        localStorage.removeItem('currentSessionId');
        currentSessionId = null;
        showLoginModal();
    }
}

// Function đăng nhập
async function performLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) {
        alert('Vui lòng nhập đầy đủ thông tin');
        return;
    }

    try {
        showButtonLoading('#login-modal .btn-success', 'Đang đăng nhập...');

        const result = await callGAS('login', username, password );

        if (result.success) {
            currentUser = result.user;
            currentSessionId = result.sessionId;

            // Lưu sessionId vào localStorage
            localStorage.setItem('currentSessionId', currentSessionId);

            hideLoginModal();
            showUserInfo();
            initApp(); // Reload app with user permissions
        } else {
            showNotification(result.error, 'error');
        }

    } catch (error) {
        console.error('Lỗi đăng nhập:', error);
        showNotification('Có lỗi xảy ra khi đăng nhập', 'error');
    } finally {
        hideButtonLoading('#login-modal .btn-success');
    }
}

// Function đăng xuất
async function performLogout() {
    try {
        showButtonLoading('#user-info .btn-secondary', 'Đang thoát...');

        await callGAS('logout', currentSessionId);

        currentUser = null;
        currentSessionId = null;
        customers = [];
        filteredCustomers = [];

        window.reminders = []; // Xóa dữ liệu trong biến
        document.getElementById('reminder-list-container').innerHTML = ''; // Xóa giao diện

        // Xóa sessionId khỏi localStorage
        localStorage.removeItem('currentSessionId');

        showLoginModal();
        hideUserInfo();

        // Clear form
        document.getElementById('login-form').reset();

    } catch (error) {
        console.error('Lỗi đăng xuất:', error);
    } finally {
        hideButtonLoading('#user-info .btn-secondary');
    }
}

// Show/hide login modal
function showLoginModal() {
    const modal = document.getElementById('login-modal');
    modal.classList.add('show');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function hideLoginModal() {
    const modal = document.getElementById('login-modal');
    modal.classList.remove('show');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Show/hide user info
function showUserInfo() {
    if (currentUser) {
        // Chỉ hiện tên, không hiện chức vụ
        document.getElementById('current-user-name').textContent = currentUser.name;
        document.getElementById('user-info').style.display = 'flex';

        // Add manager class if user is manager
        if (currentUser.isManager) {
            document.body.classList.add('manager-user');
        } else {
            document.body.classList.remove('manager-user');
        }
    }
}

function hideUserInfo() {
    document.getElementById('user-info').style.display = 'none';
    document.body.classList.remove('manager-user');
}


// Thêm function setup pagination
function setupPagination() {
    // Event listener cho items per page
    const itemsPerPageSelect = document.getElementById('items-per-page');
    if (itemsPerPageSelect) {
        itemsPerPageSelect.addEventListener('change', function() {
            itemsPerPage = parseInt(this.value);
            currentPage = 1;
            renderCustomers();
        });
    }
}

// Load khách hàng
function loadCustomers() {
    return callGAS(getCustomers,{});
}

// Setup event listeners
function setupEventListeners() {
    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });

    // Search functionality - KHÔI PHỤC PHẦN NÀY
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(function() {
            filterCustomers();
        }, 300));
    }

    // Filter functionality
    const statusFilter = document.getElementById('status-filter');
    const staffFilter = document.getElementById('staff-filter');
    const todayFilterCheckbox = document.getElementById('today-filter');

    if (statusFilter) {
        statusFilter.addEventListener('change', function() {
            filterCustomers();
        });
    }

    if (staffFilter) {
        staffFilter.addEventListener('change', function() {
            filterCustomers();
        });
    }

    // Thêm event listener cho today filter
    const dateFilterSelect = document.getElementById('date-filter');
    if (dateFilterSelect) {
        dateFilterSelect.onchange = function() {
            dateFilter = this.value;
            filterCustomers();
        };
    }

    // Thêm vào function setupEventListeners
    const careNeededCheckbox = document.getElementById('care-needed-checkbox');
    if (careNeededCheckbox) {
        careNeededCheckbox.addEventListener('change', function() {
            careNeededFilter = this.checked;
            filterCustomers();
        });
    }

    // Modal close functionality
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('close')) {
            closeModal();
        }
    });

    document.addEventListener('click', function(e) {
        if (e.target.closest('.nav-tab[data-tab="history"]')) {
            loadHistoryLogs();
        }
    });

    // Escape key to close modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });

    // Color picker change event
    document.addEventListener('change', function(e) {
        if (e.target.id === 'status-color') {
            const colorText = document.getElementById('color-text');
            if (colorText) {
                colorText.textContent = e.target.value.toUpperCase();
            }
        }
    });

    const positionField = document.getElementById('staff-position');
    if (positionField) {
        positionField.addEventListener('change', function() {
            const managerField = document.getElementById('manager-field');
            const staffId = document.getElementById('staff-id').value;
            if (this.value === 'Nhân viên') {
                managerField.style.display = 'block';
                populateManagerDropdown(staffId);
            } else {
                managerField.style.display = 'none';
                document.getElementById('staff-manager').value = '';
            }
        });
    }
}

function loadHistoryLogs() {
    const dateInput = document.getElementById('history-date-filter');
    // Nếu chưa chọn ngày thì lấy hôm nay
    if (!dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
    const selectedDate = dateInput.value;

    // Lấy dữ liệu từ biến toàn cục
    const allLogs = window.allHistoryData || [];

    // LỌC NGAY TẠI TRÌNH DUYỆT: Theo ngày VÀ Theo quyền hạn
    currentHistoryLogs = allLogs.filter(log => {
        const matchDate = log.fullDate === selectedDate;

        // Logic mới: Nếu là Manager -> Xem hết (true), Nếu nhân viên -> Chỉ xem dòng của mình
        const matchUser = currentUser.isManager ? true : (log.u === currentUser.name);

        return matchDate && matchUser;
    });

    // Reset tìm kiếm và trang
    const searchInput = document.getElementById('history-search-input');
    if (searchInput) searchInput.value = '';

    // Mặc định filtered logs bằng toàn bộ logs đã lọc quyền
    historyFilteredLogs = [...currentHistoryLogs];

    historyCurrentPage = 1;
    // Reset về trang 1

    // Render
    renderHistoryTable();
}

// Thêm function để check ngày hôm nay
function isToday(dateString) {
    if (!dateString) return false;

    const today = new Date();
    const checkDate = new Date(dateString);

    return today.getFullYear() === checkDate.getFullYear() &&
           today.getMonth() === checkDate.getMonth() &&
           today.getDate() === checkDate.getDate();
}

function isThisMonth(dateString) {
    if (!dateString) return false;

    const today = new Date();
    const checkDate = new Date(dateString);

    // Kiểm tra trùng năm và trùng tháng
    return today.getFullYear() === checkDate.getFullYear() &&
           today.getMonth() === checkDate.getMonth(); 
}

// Thêm function render reports
function renderReports() {
    // Khởi tạo date range nếu chưa có
    if (!reportFromDate || !reportToDate) {
        initializeReportDateRange();
    }

    renderOverviewCards();
    renderStatusChart();
    renderStaffStackedChart();
    renderTrendChart();
    renderTopCustomersByRevenue();
    renderStaffPerformanceChart();
    renderMonthlyChart();
    renderSourceChart();
    renderSourceRevenueChart();
    renderStaffRevenueChart();
}

// Render overview cards
function renderOverviewCards() {
    const filteredCustomers = getFilteredCustomers('created');
    const totalCustomers = filteredCustomers.length;

    // UPDATED: Tính tổng doanh thu từ orders array trong khoảng thời gian
    let totalRevenue = 0;
    let closedCount = 0;

    filteredCustomers.forEach(customer => {
        if (customer.orders && customer.orders.length > 0) {
            customer.orders.forEach(order => {
                if (order.closedDate && isDateInRange(order.closedDate, 'closed')) {
                    totalRevenue += order.orderValue || 0;
                    closedCount++;
                }
            });
        }
    });

    const todayCustomers = filteredCustomers.filter(customer => isThisMonth(customer.createdDate)).length;

    // Tìm nhân viên chăm sóc nhiều nhất trong khoảng thời gian
    const staffCareCount = {};
    filteredCustomers.forEach(customer => {
        if (customer.careHistory) {
            customer.careHistory.forEach(care => {
                if (care.staff && isDateInRange(care.contactDate)) {
                    staffCareCount[care.staff] = (staffCareCount[care.staff] || 0) + 1;
                }
            });
        }
    });

    const topStaff = Object.keys(staffCareCount).reduce((a, b) => 
        staffCareCount[a] > staffCareCount[b] ? a : b, '-');

    document.getElementById('total-customers-count').textContent = totalCustomers;

    // UPDATED: Hiển thị doanh thu và số đơn hàng
    document.getElementById('total-care-count').textContent = 
        `${new Intl.NumberFormat('vi-VN').format(totalRevenue)} (${closedCount} đơn)`;

    document.getElementById('today-customers-count').textContent = todayCustomers;
    document.getElementById('top-staff-name').textContent = topStaff;
}

/**
 * Lấy màu của trạng thái từ cấu hình
 */
function getStatusColor(statusName) {
    const status = statuses.find(s => s.name === statusName);
    return status ? status.color : '#6B7280'; // Gray default
}

/**
 * Lấy danh sách màu cho các trạng thái
 */
function getStatusColors(statusNames) {
    return statusNames.map(statusName => getStatusColor(statusName));
}

/**
 * Lấy tất cả màu của statuses có thứ tự
 */
function getAllStatusColors() {
    return statuses.map(status => status.color);
}

/**
 * Tạo màu cho biểu đồ với fallback colors nếu không đủ trạng thái
 */
function generateChartColors(itemCount) {
    const statusColors = getAllStatusColors();
    const fallbackColors = [
        '#3B82F6', '#10B981', '#F59E0B', '#EC4899', 
        '#8B5CF6', '#EF4444', '#06B6D4', '#84CC16',
        '#F97316', '#EAB308', '#14B8A6', '#8B5CF6'
    ];

    const colors = [...statusColors];

    // Nếu không đủ màu, thêm từ fallback
    while (colors.length < itemCount) {
        const fallbackIndex = colors.length % fallbackColors.length;
        colors.push(fallbackColors[fallbackIndex]);
    }

    return colors.slice(0, itemCount);
}

// Render status chart
function renderStatusChart() 
{
    const ctx = document.getElementById('statusChart').getContext('2d');
    
    if (statusChart) {
        statusChart.destroy();
    }

    let totalThu = 0;
    let totalChi = 0;

    // 1. Tính toán số liệu từ invoiceData [cite: 22, 23]
    if (Array.isArray(invoiceData)) {
        invoiceData.forEach(inv => {
            const thu = parseInt(inv.dadong?.toString().replace(/[^\d]/g, '')) || 0;
            const chi = parseInt(inv.conno?.toString().replace(/[^\d]/g, '')) || 0;
            totalThu += thu;
            totalChi += chi;
        });
    }

    // Định dạng tiền tệ để hiển thị trong nhãn
    const formatter = new Intl.NumberFormat('vi-VN');
    const labelThu = `Thu: ${formatter.format(totalThu)} đ`;
    const labelChi = `Chi: ${formatter.format(totalChi)} đ`;

    statusChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: [labelThu, labelChi],
            datasets: [{
                data: [totalThu, totalChi],
                backgroundColor: ['#E462A8', '#6C63FF'], // Thu xanh, Chi đỏ [cite: 170]
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'right', // Đưa chú thích vào góc bên phải
                    align: 'start',    // Căn lên phía trên cùng của góc
                    labels: {
                        boxWidth: 12,
                        padding: 15,
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `Số tiền: ${formatter.format(value)} đ (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderTrendChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');

    if (trendChart) {
        trendChart.destroy();
    }

    const monthlyRevenue = {};
    const currentDate = new Date();

    // 1. Khởi tạo dữ liệu cho 12 tháng gần nhất
    for (let i = 11; i >= 0; i--) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        monthlyRevenue[monthKey] = 0;
    }
   
// SỬA TẠI ĐÂY: Thêm kiểm tra invoiceData
    if (!invoiceData || !Array.isArray(invoiceData)) {
        console.warn("invoiceData chưa sẵn sàng hoặc không phải mảng");
        return; 
    }
   
    // 2. Tích lũy doanh thu từ dữ liệu invoice
    invoiceData.forEach(inv => {
        if (inv.ngaylap) {
            // Chuyển đổi ngaylap thành đối tượng Date
            const date = new Date(inv.ngaylap);
            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            
            // Nếu tháng này nằm trong khung 12 tháng, cộng dồn số tiền đã đóng
            if (monthlyRevenue[monthKey] !== undefined) {
                // Đảm bảo dadong là số (loại bỏ dấu phẩy nếu có và chuyển kiểu)
                const amount = parseFloat(inv.conno.toString().replace(/[^\d]/g, '')) || 0;
                monthlyRevenue[monthKey] += amount;
            }
        }
    });

    const months = Object.keys(monthlyRevenue);
    const monthLabels = months.map(month => {
        const [year, monthNum] = month.split('-');
        return `${monthNum}/${year}`;
    });

    const successColor = getComputedStyle(document.documentElement).getPropertyValue('--success').trim() || '#10B981';

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Lợi nhuận từ Tổng thu học phí + bán hàng - phiếu chi - phiếu nhập kho - chi lương',
                data: Object.values(monthlyRevenue),
                borderColor: successColor,
                backgroundColor: hexToRgba(successColor, 0.1),
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: commonLegendConfig,
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Doanh thu: ' + new Intl.NumberFormat('vi-VN').format(context.raw) + ' VNĐ';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'VNĐ'
                    },
                    ticks: {
                        callback: function(value) {
                            // Rút gọn hiển thị trục Y (ví dụ 1.000.000 -> 1M)
                            if (value >= 1000000) return (value / 1000000) + 'M';
                            return new Intl.NumberFormat('vi-VN').format(value);
                        }
                    }
                }
            }
        }
    });
}

// Render staff chart
function renderStaffStackedChart() {
    const ctx = document.getElementById('staffChart').getContext('2d');
    
    if (staffChart) {
        staffChart.destroy();
    }

    const monthlyRevenue = {};
    const currentDate = new Date();

    // 1. Khởi tạo dữ liệu cho 12 tháng gần nhất
    for (let i = 11; i >= 0; i--) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        monthlyRevenue[monthKey] = 0;
    }
   
// SỬA TẠI ĐÂY: Thêm kiểm tra invoiceData
    if (!invoiceData || !Array.isArray(invoiceData)) {
        console.warn("invoiceData chưa sẵn sàng hoặc không phải mảng");
        return; 
    }
   
    // 2. Tích lũy doanh thu từ dữ liệu invoice
    invoiceData.forEach(inv => {
        if (inv.ngaylap) {
            // Chuyển đổi ngaylap thành đối tượng Date
            const date = new Date(inv.ngaylap);
            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            
            // Nếu tháng này nằm trong khung 12 tháng, cộng dồn số tiền đã đóng
            if (monthlyRevenue[monthKey] !== undefined) {
                // Đảm bảo dadong là số (loại bỏ dấu phẩy nếu có và chuyển kiểu)
                const amount = parseFloat(inv.dadong.toString().replace(/[^\d]/g, '')) || 0;
                monthlyRevenue[monthKey] += amount;
            }
        }
    });

    const months = Object.keys(monthlyRevenue);
    const monthLabels = months.map(month => {
        const [year, monthNum] = month.split('-');
        return `${monthNum}/${year}`;
    });

    const successColor = getComputedStyle(document.documentElement).getPropertyValue('--success').trim() || '#10B981';

    staffChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Doanh thu thực thu',
                data: Object.values(monthlyRevenue),
                borderColor: successColor,
                backgroundColor: hexToRgba(successColor, 0.1),
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: commonLegendConfig,
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Doanh thu: ' + new Intl.NumberFormat('vi-VN').format(context.raw) + ' VNĐ';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'VNĐ'
                    },
                    ticks: {
                        callback: function(value) {
                            // Rút gọn hiển thị trục Y (ví dụ 1.000.000 -> 1M)
                            if (value >= 1000000) return (value / 1000000) + 'M';
                            return new Intl.NumberFormat('vi-VN').format(value);
                        }
                    }
                }
            }
        }
    });
}


function renderStaffPerformanceChart()
{
    const ctx = document.getElementById('staffPerformanceChart').getContext('2d');
    
    // Hủy biểu đồ cũ nếu tồn tại để vẽ biểu đồ mới
    if (staffPerformanceChart) {
        staffPerformanceChart.destroy();
    }
    
    const sourceRevenue = {}; 
    
    // 1. Khởi tạo doanh thu bằng 0 cho tất cả các lớp (sources) hiện có
    sources.forEach(source => {
        sourceRevenue[source.name] = 0;
    });

    // 2. Tạo bản đồ tra cứu nhanh: customer.id -> customer.source (Lớp)
    const customerSourceMap = {};
    customers.forEach(c => {
        customerSourceMap[c.id] = c.source || 'Chưa xác định';
    });
    
    // 3. Tính toán tổng doanh thu thực thu từ dữ liệu hóa đơn (invoiceData)
    if (Array.isArray(invoiceData)) {
        invoiceData.forEach(inv => {
            // Xác định lớp của học viên dựa trên mã học viên (inv.id)
            const mahv = inv.id; 
            const source = customerSourceMap[mahv] || 'Chưa xác định';
            
            // Làm sạch và chuyển đổi số tiền đã đóng (dadong)
            const amountReceived = parseInt(inv.dadong.toString().replace(/[^\d]/g, '')) || 0;
            
            if (sourceRevenue[source] === undefined) {
                sourceRevenue[source] = 0;
            }
            
            // Cộng dồn vào tổng doanh thu của lớp tương ứng
            sourceRevenue[source] += amountReceived;
        });
    }
    
    // 4. Chuẩn bị dữ liệu và định dạng nhãn kèm số tiền
    const formatter = new Intl.NumberFormat('vi-VN');
    const sourceNames = Object.keys(sourceRevenue).filter(name => sourceRevenue[name] > 0);
    const revenueValues = sourceNames.map(name => sourceRevenue[name]);
    
    // Tạo mảng nhãn hiển thị ở Legend kèm số tiền: "Tên lớp: 1.000.000 đ"
    const displayLabels = sourceNames.map(name => `${name}: ${formatter.format(sourceRevenue[name])} đ`);
    
    const colors = generateChartColors(sourceNames.length);
    
    // 5. Khởi tạo Pie Chart
    staffPerformanceChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: displayLabels, // Sử dụng nhãn đã kèm số tiền
            datasets: [{
                data: revenueValues,
                backgroundColor: colors,
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'right', // Đưa chú thích vào góc bên phải
                    align: 'start',    // Căn nhãn từ trên xuống dưới
                    labels: {
                        boxWidth: 12,
                        padding: 15,
                        font: {
                            size: 11,
                            weight: 'bold'
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            // Lấy lại tên lớp gốc (không kèm tiền) để hiển thị trong tooltip cho gọn
                            const sourceName = sourceNames[context.dataIndex];
                            return `${sourceName}: ${formatter.format(value)} VNĐ (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Biểu đồ chăm sóc theo tháng
function renderMonthlyChart() 
{
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    
    // Hủy biểu đồ cũ nếu tồn tại
    if (monthlyChart) {
        monthlyChart.destroy();
    }
    
    const sourceDebt = {}; 
    
    // 1. Khởi tạo dữ liệu nợ bằng 0 cho tất cả các nguồn (lớp) hiện có
    sources.forEach(source => {
        sourceDebt[source.name] = 0;
    });

    // 2. Tạo bản đồ tra cứu nhanh: customer.id -> customer.source
    const customerSourceMap = {};
    customers.forEach(c => {
        customerSourceMap[c.id] = c.source;
    });
    
    // 3. Tính toán tổng nợ từ dữ liệu hóa đơn (invoiceData)
    if (Array.isArray(invoiceData)) {
        invoiceData.forEach(inv => {
            const mahv = inv.id; 
            const source = customerSourceMap[mahv] || 'Chưa xác định';
            
            // Làm sạch dữ liệu tiền nợ và cộng dồn
            const debtAmount = parseInt(inv.conno?.toString().replace(/[^\d]/g, '')) || 0;
            
            if (sourceDebt[source] === undefined) {
                sourceDebt[source] = 0;
            }
            sourceDebt[source] += debtAmount;
        });
    }
    
    const sourceNames = Object.keys(sourceDebt);
    const debtValues = Object.values(sourceDebt);
    const colors = generateChartColors(sourceNames.length);
    
    // 4. Khởi tạo biểu đồ cột với nhãn dọc trong thân cột
    monthlyChart = new Chart(ctx, {
        type: 'bar',
        plugins: [ChartDataLabels], // Kích hoạt plugin hiển thị nhãn
        data: {
            labels: sourceNames,
            datasets: [{
                label: 'Tổng tiền còn nợ (VNĐ)',
                data: debtValues,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 4,
                // Cấu hình hiển thị số liệu bên trong thân cột
                datalabels: {
                    anchor: 'center', // Vị trí neo ở giữa cột
                    align: 'center',  // Căn giữa
                    rotation: -90,    // Xoay dọc chữ 90 độ ngược chiều kim đồng hồ
                    color: '#ffffff', // Chữ màu trắng để nổi bật trên nền màu
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    formatter: function(value) {
                        if (value === 0) return ''; // Không hiện nếu không có nợ
                        // Định dạng rút gọn: Triệu (Tr) hoặc Ngàn (K)
                        if (value >= 1000000) return (value / 1000000).toFixed(1) + ' Tr';
                        if (value >= 1000) return (value / 1000).toFixed(0) + ' K';
                        return value;
                    }
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Còn nợ: ' + new Intl.NumberFormat('vi-VN').format(context.raw) + ' VNĐ';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            if (value >= 1000000) return (value / 1000000) + 'M';
                            return new Intl.NumberFormat('vi-VN').format(value);
                        }
                    },
                    title: {
                        display: true,
                        text: 'Số tiền nợ (VNĐ)'
                    }
                }
            }
        }
    });
}

// BIỂU ĐỒ MỚI 1: Khách hàng theo nguồn
function renderSourceChart() 
{
    const ctx = document.getElementById('sourceChart').getContext('2d');
    
    const allCustomers = customers; 

    if (sourceChart) {
        sourceChart.destroy();
    }

    const monthlyData = {};
    const currentDate = new Date();

    for (let i = 11; i >= 0; i--) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        monthlyData[monthKey] = {
            newCustomers: 0
        };
    }

    allCustomers.forEach(customer => {
        if (customer.createdDate) {
            const date = new Date(customer.createdDate);
            if (!isNaN(date.getTime())) {
                const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                if (monthlyData[monthKey]) {
                    monthlyData[monthKey].newCustomers++;
                }
            }
        }
    });

    const months = Object.keys(monthlyData);
    const monthLabels = months.map(month => {
        const [year, monthNum] = month.split('-');
        return `${monthNum}/${year}`;
    });

    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#4A6FDC';

    sourceChart = new Chart(ctx, {
        type: 'line',
        // Kích hoạt plugin hiển thị nhãn dữ liệu
        plugins: [ChartDataLabels], 
        data: {
            labels: monthLabels,
            datasets: [
                {
                    label: 'Số lượng học viên mới',
                    data: months.map(month => monthlyData[month].newCustomers),
                    borderColor: primaryColor,
                    backgroundColor: hexToRgba(primaryColor, 0.1),
                    tension: 0.4,
                    fill: true,
                    pointRadius: 6, // Tăng kích thước điểm để dễ nhìn số liệu
                    pointHoverRadius: 8,
                    // Cấu hình nhãn dữ liệu cho riêng tập dữ liệu này
                    datalabels: {
                        align: 'top',    // Hiển thị phía trên điểm nút
                        anchor: 'end',   // Neo vào điểm cuối của dữ liệu
                        offset: 4,       // Khoảng cách so với điểm
                        color: primaryColor, // Màu chữ
                        font: {
                            weight: 'bold',
                            size: 11
                        },
                        formatter: function(value) {
                            return value > 0 ? value : ''; // Chỉ hiện nếu số lượng > 0
                        }
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // Đảm bảo không bị cắt mất nhãn ở phía trên cùng của biểu đồ
            layout: {
                padding: {
                    top: 25 
                }
            },
            plugins: {
                legend: commonLegendConfig,
                tooltip: {
                    mode: 'index',
                    intersect: false
                },
                // Vô hiệu hóa nhãn dữ liệu mặc định cho các thành phần khác nếu cần
                datalabels: {
                    display: true 
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    },
                    title: {
                        display: true,
                        text: 'Khách hàng'
                    }
                }
            }
        }
    });
}

// BIỂU ĐỒ MỚI 2: Doanh thu theo nguồn khách
function renderSourceRevenueChart() {
    const ctx = document.getElementById('sourceRevenueChart').getContext('2d');
    
    if (sourceRevenueChart) {
        sourceRevenueChart.destroy();
    }
    
    const sourceCustomerCount = {}; // Thống kê số lượng học viên theo nguồn
    
    // 1. Khởi tạo dữ liệu từ danh sách nguồn
    sources.forEach(source => {
        sourceCustomerCount[source.name] = 0;
    });
    
    // 2. Thống kê số lượng khách hàng theo nguồn dựa trên bộ lọc hiện tại
    getFilteredCustomers('created').forEach(customer => {
        const source = customer.source || 'Chưa xác định';
        
        if (sourceCustomerCount[source] === undefined) {
            sourceCustomerCount[source] = 0;
        }
        
        sourceCustomerCount[source] += 1;
    });
    
    // 3. Chuẩn bị dữ liệu và lọc bỏ các nguồn không có học viên để Legend gọn gàng hơn
    const sourceNames = Object.keys(sourceCustomerCount).filter(name => sourceCustomerCount[name] > 0);
    const countValues = sourceNames.map(name => sourceCustomerCount[name]);
    
    // Tạo mảng nhãn hiển thị ở Legend kèm số lượng: "Tên nguồn: X học viên"
    const displayLabels = sourceNames.map(name => `${name}: ${sourceCustomerCount[name]} học viên`);
    
    const colors = generateChartColors(sourceNames.length);
    
    sourceRevenueChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: displayLabels, // Sử dụng nhãn đã kèm số liệu
            datasets: [{
                data: countValues,
                backgroundColor: colors,
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'right', // Đưa chú thích vào góc bên phải
                    align: 'start',    // Căn lề từ phía trên xuống
                    labels: {
                        boxWidth: 12,
                        padding: 15,
                        font: {
                            size: 11,
                            weight: 'bold'
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            // Lấy lại tên nguồn gốc (không kèm số lượng) để hiển thị trong tooltip
                            const sourceName = sourceNames[context.dataIndex];
                            return `${sourceName}: ${value} học viên (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// BIỂU ĐỒ MỚI 3: Doanh thu theo nhân viên
function renderStaffRevenueChart() {
    const staffRevenue = {};

    // THÊM: Lọc staff theo quyền
    let staffToShow = staff;
    if (currentUser && !currentUser.isManager) {
        staffToShow = staff.filter(s => s.name === currentUser.name);
    }

    // Khởi tạo dữ liệu cho staff được phép hiển thị
    staffToShow.forEach(s => {
        staffRevenue[s.name] = 0;
    });

    // UPDATED: Tính doanh thu từ orders array trong khoảng thời gian
    getFilteredCustomers('created').forEach(customer => {
        if (customer.assignedStaff && customer.orders && customer.orders.length > 0) {
            customer.orders.forEach(order => {
                if (order.closedDate && isDateInRange(order.closedDate, 'closed')) {
                    if (staffRevenue[customer.assignedStaff] !== undefined) {
                        staffRevenue[customer.assignedStaff] += order.orderValue || 0;
                    }
                }
            });
        }
    });

    const staffRevenueArray = Object.keys(staffRevenue).map(name => ({
        name: name,
        revenue: staffRevenue[name]
    })).sort((a, b) => b.revenue - a.revenue);

    const html = staffRevenueArray.map((staff, index) => `
        <div class="top-item">
            <div class="top-item-info">
                <div class="top-item-rank">${index + 1}</div>
                <span>${staff.name}</span>
            </div>
            <span class="top-item-count">${staff.revenue > 0 ? new Intl.NumberFormat('vi-VN').format(staff.revenue) : '0'}</span>
        </div>
    `).join('');

    document.getElementById('staffRevenueList').innerHTML = html || 
        '<p class="text-muted text-center">Chưa có dữ liệu doanh thu</p>';
}

// Cập nhật function refreshChartsAfterStatusChange - gọi khi có thay đổi cấu hình
function refreshChartsAfterStatusChange() {
    const reportsTab = document.getElementById('reports');
    if (reportsTab && reportsTab.classList.contains('active')) {
        renderReports();
    }

    updateStatusStyles();

    // MỚI: Render lại tabs để cập nhật màu sắc/thứ tự
    renderStatusTabs();

    renderCustomers();
}

function hexToRgba(hex, opacity = 0.1) {
    // Remove # if present
    hex = hex.replace('#', '');

    // Parse r, g, b values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Switch tabs
function switchTab(tabName) {
    // Remove active class from all tabs and sections
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // Add active class to clicked tab and corresponding section
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');

    if (tabName === 'settings') {
        renderSettingsContent();
    }

    // Render reports khi chuyển sang tab reports
    if (tabName === 'reports') {
        renderReports();
    }

    if (tabName === 'customers') {
        updateStatusStyles();
    }

    if (tabName === 'reminders') {
        filterRemindersUI('pending');
    }
}


// Render top customers
function renderTopCustomersByRevenue() {
    // 1. Tạo Map để cộng dồn doanh thu cho từng khách hàng từ invoiceData
    const revenueByCustomer = {};

    if (Array.isArray(invoiceData)) {
        invoiceData.forEach(inv => {
            // Kiểm tra ngày lập hóa đơn có nằm trong khoảng thời gian lọc hay không
            if (inv.ngaylap && isDateInRange(inv.ngaylap, 'closed')) {
                const customerId = inv.id; // mahv
                
                // Làm sạch dữ liệu số tiền conno (xóa dấu chấm, đơn vị đ...)
                const amount = parseInt(inv.conno.toString().replace(/[^\d]/g, '')) || 0;

                if (amount > 0) {
                    revenueByCustomer[customerId] = (revenueByCustomer[customerId] || 0) + amount;
                }
            }
        });
    }

    // 2. Chuyển đổi dữ liệu Map thành mảng để hiển thị Top 10
    const topRevenueData = Object.keys(revenueByCustomer).map(id => {
        // Tìm thông tin tên khách hàng từ danh sách customers hiện tại
        const customerInfo = customers.find(c => String(c.id) === String(id));
        return {
            id: id,
            name: customerInfo ? customerInfo.name : 'Không xác định',
            revenue: revenueByCustomer[id]
        };
    })
    .sort((a, b) => b.revenue - a.revenue) // Sắp xếp giảm dần
    .slice(0, 10); // Lấy top 10

    // 3. Render HTML
    const html = topRevenueData.map((item, index) => `
        <div class="top-item">
            <div class="top-item-info">
                <div class="top-item-rank">${index + 1}</div>
                <span>KH${item.id} - ${item.name}</span>
            </div>
            <span class="top-item-count">${new Intl.NumberFormat('vi-VN').format(item.revenue)}</span>
        </div>
    `).join('');

    const container = document.getElementById('topCustomersList');
    if (container) {
        container.innerHTML = html || '<p class="text-muted text-center">Chưa có dữ liệu doanh thu trong kỳ</p>';
    }
}

// Render customers
function renderCustomers() {
    updateStatusStyles();

    const container = document.getElementById('customers-list');
    if (!container) return;

    const totalItems = filteredCustomers.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const pageCustomers = filteredCustomers.slice(startIndex, endIndex);

    updatePaginationInfo(totalItems, startIndex + 1, endIndex, totalPages);

    if (pageCustomers.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="14" class="text-center"> <div class="text-muted mt-4">
                        <h3>Không tìm thấy khách hàng nào</h3>
                        <p>Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const customersHtml = pageCustomers.map(customer => {
        const statusClass = getStatusClass(customer.status);
        const lastCare = customer.careHistory && customer.careHistory.length > 0 ? customer.careHistory[0] : null;
        const nextContactDate = lastCare && lastCare.nextContactDate ? formatDate(lastCare.nextContactDate) : '┄';

        const careCount = customer.careHistory ? customer.careHistory.length : 0;
        let careCountBadge = '';
        if (careCount > 0) {
            let badgeClass = 'care-count-low';
            if (careCount >= 6) badgeClass = 'care-count-high';
            else if (careCount >= 3) badgeClass = 'care-count-medium';
            careCountBadge = `<span class="care-count-badge ${badgeClass}">${careCount}</span>`;
        }

        let orderInfo = { closedDate: '┄', orderCode: '┄', totalValue: 0, orderCount: 0 };
        if (customer.orders && customer.orders.length > 0) {
            const latestOrder = customer.orders.sort((a, b) => new Date(b.closedDate) - new Date(a.closedDate))[0];
            orderInfo.closedDate = formatDate(latestOrder.closedDate);
            orderInfo.orderCode = latestOrder.orderCode || '┄';
            orderInfo.totalValue = customer.orders.reduce((sum, order) => sum + (order.orderValue || 0), 0);
            orderInfo.orderCount = customer.orders.length;
        }

        const orderValueFormatted = orderInfo.totalValue > 0 ? new Intl.NumberFormat('vi-VN').format(orderInfo.totalValue) : '┄';
        let orderValueBadge = '';
        if (orderInfo.orderCount > 1) {
            orderValueBadge = `<span style="position: absolute; top: -1px; background: #66666691; color: white; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 8px; min-width: 16px; text-align: center;">${orderInfo.orderCount}</span>`;
        }
        const orderCodeDisplay = orderInfo.orderCount > 1 ? `${orderInfo.orderCode} (+${orderInfo.orderCount - 1})` : orderInfo.orderCode;

        const canEdit = currentUser.isManager || customer.assignedStaff === currentUser.name;
        const canDelete = currentUser.isManager || customer.assignedStaff === currentUser.name;

        return `
            <tr>
                <td>${customer.id}</td>

                <td>${formatDate(customer.createdDate)}</td>
                <td>
                    <div class="customer-name-wrapper">
                        <a href="#" onclick="viewCustomerDetails(${customer.id}); return false;">
                            ${customer.name}
                        </a>
                        ${careCountBadge}
                    </div>
                </td>
                <td>${customer.phone || '┄'}</td>
                <td>${customer.source || 'Chưa xác định'}</td>
                <td>
                    <div id="status-badge-${customer.id}" 
                        class="status-badge ${statusClass}" 
                        style="position: relative; cursor: pointer; padding-right: 20px; display: inline-flex; align-items: center; justify-content: center; min-width: 125px; transition: all 0.2s;">
                        
                        <span id="status-text-${customer.id}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${customer.status || 'Chưa xác định'}</span>
                        
                        <i class="fas fa-chevron-down" style="position: absolute; right: 8px; font-size: 10px; opacity: 0.7;"></i>
                        
                        <select onchange="handleTableStatusChange(this, ${customer.id}, '${customer.status || ''}')" 
                                onclick="event.stopPropagation();"
                                style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; appearance: none;">
                            <option value="" data-color="#6B7280" style="color: #6B7280; font-weight: bold;" ${!customer.status ? 'selected' : ''}>Chưa xác định</option>
                            ${statuses.map(s => `<option value="${s.name}" data-color="${s.color}" style="color: ${s.color}; font-weight: bold;" ${s.name === customer.status ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                    </div>
                </td>
                <td>${customer.assignedStaff || 'Chưa phân công'}</td>
                <td class="note-cell" title="${customer.notes || ''}">${customer.notes || '┄'}</td>
                <td class="order-column">${orderInfo.closedDate}</td>
                <td class="order-column">${orderCodeDisplay}</td>
                <td style="position: relative;">${orderValueFormatted}${orderValueBadge}</td>
                <td>${lastCare ? formatDate(lastCare.contactDate) : '┄'}</td>
                <td style="color: ${nextContactDate !== '┄' ? '#F59E0B' : '#666'}; font-weight: ${nextContactDate !== '┄' ? '600' : 'normal'};">${nextContactDate}</td>
                <td class="actions">
                    ${canEdit ? `<button class="btn btn-sm btn-no-bg btn-secondary" onclick="editCustomer(${customer.id})"><i class="fas fa-edit"></i></button>` : ''}
                    <button class="btn btn-sm btn-no-bg btn-success" onclick="addCareHistory(${customer.id})"><i class="fas fa-notes-medical"></i></button>
                    ${canDelete ? `<button class="btn btn-sm btn-no-bg btn-danger" onclick="deleteCustomer(${customer.id}, this)"><i class="fas fa-trash"></i></button>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = customersHtml;
}

// Thêm function update pagination info
function updatePaginationInfo(total, from, to, totalPages) {
    document.getElementById('total-customers').textContent = total;
    document.getElementById('showing-from').textContent = from;
    document.getElementById('showing-to').textContent = to;
    document.getElementById('current-page').textContent = currentPage;
    document.getElementById('total-pages').textContent = totalPages;

    // Enable/disable buttons
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

// Thêm function change page
function changePage(direction) {
    const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);

    if (direction === -1 && currentPage > 1) {
        currentPage--;
    } else if (direction === 1 && currentPage < totalPages) {
        currentPage++;
    }

    renderCustomers();
}

// Filter customers
function filterCustomers() {
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';

    // THAY ĐỔI: Lấy status từ biến global tab đang chọn
    const statusFilter = currentStatusTab; 

    const staffFilter = document.getElementById('staff-filter')?.value || '';

    filteredCustomers = customers.filter(customer => {
        const matchesSearch = !searchTerm || [
            `KH${customer.id}`,       // ID
            customer.name,            // Tên
            customer.phone,           // Điện thoại
            customer.source,          // Nguồn
            customer.status,          // Trạng thái
            customer.assignedStaff,   // Phụ trách
            customer.notes,           // Ghi chú
            customer.address,         // Địa chỉ
            customer.orderCode,       // Mã đơn hàng
            customer.email            // Email
        ].some(val => val && String(val).toLowerCase().includes(searchTerm));

        // Logic so sánh status
        let matchesStatus = true;
        if (statusFilter) {
            if (statusFilter === 'Chưa xác định') {
                matchesStatus = !customer.status || customer.status === 'Chưa xác định';
            } else {
                matchesStatus = customer.status === statusFilter;
            }
        }

        const matchesStaff = !staffFilter || customer.assignedStaff === staffFilter;
        const matchesDate = checkDateFilter(customer.createdDate, dateFilter);
        const matchesCareNeeded = !careNeededFilter || needsCareInNext7Days(customer);

        return matchesSearch && matchesStatus && matchesStaff && matchesDate && matchesCareNeeded;
    });

    if (currentSort.field) {
        sortTable(currentSort.field, true);
    } else {
        currentPage = 1;
        renderCustomers();
    }

    renderStatusTabs(); 
}

function checkDateFilter(dateString, filter) {
    if (filter === 'all' || !dateString) return true;
    const customerDate = new Date(dateString);
    const today = new Date();

    switch(filter) {
        case 'today':
            return isToday(dateString);
        case 'thisMonth':
            return customerDate.getFullYear() === today.getFullYear() &&
                   customerDate.getMonth() === today.getMonth();
        case 'lastMonth':
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            return customerDate.getFullYear() === lastMonth.getFullYear() &&
                   customerDate.getMonth() === lastMonth.getMonth();

        // --- THÊM CASE NÀY ---
        case 'custom':
            if (!customStartDate || !customEndDate) return true;
            return customerDate >= customStartDate && customerDate <= customEndDate;
        // ---------------------

        default:
            return true;
    }
}

// Populate dropdowns
function populateDropdowns() {
    // Status dropdown trong form thêm/sửa (Vẫn giữ)
    const statusSelects = document.querySelectorAll('select[name="status"]');
    statusSelects.forEach(select => {
        select.innerHTML = '<option value="">Chọn trạng thái</option>' +
            statuses.map(status => `<option value="${status.name}">${status.name}</option>`).join('');
    });

    // Staff dropdown trong form (Vẫn giữ)
    const staffSelects = document.querySelectorAll('select[name="assignedStaff"]');
    staffSelects.forEach(select => {
        select.innerHTML = '<option value="">Chọn nhân viên</option>' +
            staff.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    });

    // Source dropdown trong form (Vẫn giữ)
    const sourceSelects = document.querySelectorAll('select[name="source"]');
    sourceSelects.forEach(select => {
        select.innerHTML = '<option value="">Chọn nguồn khách</option>' +
            sources.map(source => `<option value="${source.name}">${source.name}</option>`).join('');
    });

    // ĐÃ XOÁ: Phần populate cho status-filter

    // Staff filter (Vẫn giữ)
    const staffFilter = document.getElementById('staff-filter');
    if (staffFilter) {
        staffFilter.innerHTML = '<option value="">Tất cả nhân viên</option>' +
            staff.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    }

    // Care history staff dropdown (Vẫn giữ)
    const careStaffSelect = document.getElementById('care-staff');
    if (careStaffSelect) {
        careStaffSelect.innerHTML = '<option value="">Chọn nhân viên</option>' +
            staff.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    }

    const reportStaffSelect = document.getElementById('report-staff-filter');
    if (reportStaffSelect) {
        reportStaffSelect.innerHTML = '<option value="">Tất cả nhân viên</option>' +
            staff.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    }
}

// Show add customer modal
function showAddCustomerModal() {
    document.getElementById('customer-form').reset();
    document.getElementById('customer-id').value = '';

    // Set ngày tạo mặc định là hôm nay
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('customer-created-date').value = today;

    // RESET closed fields về trạng thái ban đầu
    const closedFields = document.getElementById('closed-fields');
    closedFields.innerHTML = `
        <div class="form-group" style="display: flex; gap: 15px;">
            <div style="flex: 1;">
                <label for="customer-closed-date">Ngày chốt <span class="required-star">*</span></label>
                <input type="date" 
                      id="customer-closed-date" 
                      name="closedDate" 
                      class="form-control" 
                      required>
            </div>
            <div style="flex: 1;">
                <label for="customer-order-code">Mã đơn hàng</label>
                <input type="text" 
                      id="customer-order-code" 
                      name="orderCode" 
                      class="form-control" 
                      placeholder="Nhập mã đơn hàng">
            </div>
            <div style="flex: 1;">
                <label for="customer-order-value">Giá trị đơn hàng <span class="required-star">*</span></label>
                <input type="text" 
                      id="customer-order-value" 
                      name="orderValue" 
                      class="form-control" 
                      placeholder="Nhập giá trị đơn hàng"
                      oninput="formatOrderValue(this)"
                      required>
            </div>
        </div>
    `;
    closedFields.style.display = 'none'; // Ẩn mặc định

    document.getElementById('customer-modal-title').textContent = 'Thêm khách hàng mới';
    populateDropdowns();

    // Đợi populate xong rồi mới set default values
    setTimeout(() => {
        const assignedStaffSelect = document.querySelector('select[name="assignedStaff"]');
        const statusSelect = document.querySelector('select[name="status"]');

        // RESET field state (fix bug khi chuyển đổi tài khoản)
        if (assignedStaffSelect) {
            assignedStaffSelect.disabled = false;
            assignedStaffSelect.style.backgroundColor = 'white';
            assignedStaffSelect.style.cursor = 'pointer';
            assignedStaffSelect.title = '';
        }

        // SET DEFAULT VALUES
        if (currentUser) {
            if (currentUser.isManager) {
                if (assignedStaffSelect) {
                    assignedStaffSelect.value = currentUser.name;
                }
            } else {
                if (assignedStaffSelect) {
                    assignedStaffSelect.value = currentUser.name;
                    assignedStaffSelect.disabled = true;
                    assignedStaffSelect.style.backgroundColor = '#f5f5f5';
                    assignedStaffSelect.style.cursor = 'not-allowed';
                }
            }
        }

        // SET DEFAULT STATUS = "Khách hàng mới"
        if (statusSelect) {
            statusSelect.value = 'Khách hàng mới';
        }

    }, 100);

    showModal('customer-modal');
}


// Show edit customer modal
function editCustomer(customerId) {
    const customer = customers.find(c => c.id == customerId);
    if (!customer) return;

    document.getElementById('customer-id').value = customer.id;
    document.getElementById('customer-created-date').value = formatDateForInput(customer.createdDate);
    document.getElementById('customer-name').value = customer.name;
    document.getElementById('customer-phone').value = customer.phone || '';
    document.getElementById('customer-notes').value = customer.notes || '';
    document.getElementById('customer-address').value = customer.address || '';
    document.getElementById('customer-source').value = customer.source || '';

    // UPDATED: Sử dụng index thay vì createdAt
    const closedFields = document.getElementById('closed-fields');
    if (customer.orders && customer.orders.length > 0) {
        const ordersHtml = customer.orders
            .sort((a, b) => new Date(b.closedDate) - new Date(a.closedDate))
            .map((order, index) => `
                <div style="display: flex; gap: 4px; align-items: center; margin-bottom: 10px; padding: 4px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #059669;">
                    <div style="flex: 1;">
                        <strong>Đơn ${customer.orders.length - index}:</strong> ${order.orderCode || 'N/A'} - ${formatDate(order.closedDate)} - 
                        <span style="color: #059669; font-weight: 600;">${new Intl.NumberFormat('vi-VN').format(order.orderValue || 0)}</span>
                    </div>
                    <div style="display: flex; gap: 4px;">
                        <button type="button" class="btn btn-sm btn-no-bg btn-secondary" onclick="editOrderInForm('${order.id}', ${customer.id})" title="Sửa">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-no-bg btn-danger" onclick="deleteOrderInForm('${order.id}', ${customer.id})" title="Xóa">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');

        closedFields.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 style="margin: 0; color: var(--primary);">Danh sách đơn hàng (${customer.orders.length}):</h4>
                <button type="button" class="btn btn-sm btn-success" onclick="showAddOrderInFormModal(${customer.id})">
                    <i class="fas fa-plus"></i> Thêm đơn
                </button>
            </div>
            ${ordersHtml}
        `;
        closedFields.style.display = 'block';
    } else {
        closedFields.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <p style="color: #666; margin-bottom: 10px;">Chưa có đơn hàng nào</p>
                <button type="button" class="btn btn-sm btn-success" onclick="showAddOrderInFormModal(${customer.id})">
                    <i class="fas fa-plus"></i> Thêm đơn hàng đầu tiên
                </button>
            </div>
        `;
        closedFields.style.display = 'block';
    }

    setTimeout(() => {
        document.querySelector('select[name="status"]').value = customer.status || '';
        document.querySelector('select[name="assignedStaff"]').value = customer.assignedStaff || '';
        document.querySelector('select[name="source"]').value = customer.source || '';
    }, 100);

    document.getElementById('customer-modal-title').textContent = 'Sửa thông tin khách hàng';
    populateDropdowns();
    showModal('customer-modal');
}

// Edit order trong detail modal
function editOrderInDetail(orderId, customerId) {
    const customer = customers.find(c => c.id == customerId);
    const order = customer.orders.find(o => o.id == orderId);

    // THÊM DÒNG NÀY - set parent modal
    parentModal = 'customer-detail-modal';

    document.getElementById('edit-order-customer-id').value = customerId;
    document.getElementById('edit-order-created-at').value = order.id;
    document.getElementById('edit-order-closed-date').value = formatDateForInput(order.closedDate);
    document.getElementById('edit-order-code').value = order.orderCode || '';
    document.getElementById('edit-order-value').value = order.orderValue ? order.orderValue.toLocaleString('vi-VN') : '';

    document.getElementById('customer-detail-modal').classList.remove('show');
    showModal('edit-order-modal');
}

// Delete order trong detail modal
async function deleteOrderInDetail(orderId, customerId, btn) {
    if (!(await showCustomConfirm('Bạn có chắc muốn xóa đơn hàng này?'))) return;
    // Hiệu ứng loading trên nút
    const originalIcon = btn.innerHTML;
    if(btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
    }

    try {
        const result = await callGAS(
                'deleteOrderFromCustomer', customerId, orderId, currentUser ? currentUser.name : 'Unknown'); // Đã thêm user

        if (result.success) {
            showNotification('Xóa đơn hàng thành công!');
            await refreshData();
            currentCustomer = customers.find(c => c.id == customerId);
            viewCustomerDetails(customerId);
            filterCustomers();
        } else {
            showNotification('Lỗi: ' + result.error, 'error');
            // Nếu lỗi thì trả lại nút cũ
            if(btn) { btn.innerHTML = originalIcon;
            btn.disabled = false; }
        }
    } catch (error) {
        showNotification('Có lỗi xảy ra khi xóa đơn hàng', 'error');
        if(btn) { btn.innerHTML = originalIcon; btn.disabled = false; }
    }
}

// Edit order trong form modal
function editOrderInForm(orderId, customerId) {
    parentModal = 'customer-modal';
    const customer = customers.find(c => c.id == customerId);
    const order = customer.orders.find(o => o.id == orderId); // SỬA: find thay vì [orderId]

    document.getElementById('edit-order-customer-id').value = customerId;
    document.getElementById('edit-order-created-at').value = order.id;
    document.getElementById('edit-order-closed-date').value = formatDateForInput(order.closedDate);
    document.getElementById('edit-order-code').value = order.orderCode || '';
    document.getElementById('edit-order-value').value = order.orderValue ? order.orderValue.toLocaleString('vi-VN') : '';

    document.getElementById('customer-modal').classList.remove('show');
    showModal('edit-order-modal');
}

// Delete order trong form modal
async function deleteOrderInForm(orderId, customerId) {
    if (!(await showCustomConfirm('Bạn có chắc muốn xóa đơn hàng này?'))) return;
    try {
        const result = await callGAS(
                'deleteOrderFromCustomer', customerId, orderId, currentUser ? currentUser.name : 'Unknown'); // Đã thêm user

        if (result.success) {
            showNotification('Xóa đơn hàng thành công!');
            await refreshData();
            editCustomer(customerId); // Refresh edit modal
            filterCustomers();
        } else {
            showNotification('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Có lỗi xảy ra khi xóa đơn hàng', 'error');
    }
}

// Show add order modal từ form
function showAddOrderInFormModal(customerId) {
    parentModal = 'customer-modal'; // Track modal cha
    document.getElementById('add-order-form').reset();
    document.getElementById('add-order-customer-id').value = customerId;
    document.getElementById('add-order-closed-date').value = new Date().toISOString().split('T')[0];

    document.getElementById('customer-modal').classList.remove('show');
    showModal('add-order-modal');
}

// Save edit order
async function saveEditOrder() {
    const customerId = document.getElementById('edit-order-customer-id').value;
    const orderId = document.getElementById('edit-order-created-at').value;
    // Đọc index thay vì createdAt
    const closedDate = document.getElementById('edit-order-closed-date').value;
    const orderCode = document.getElementById('edit-order-code').value.trim();
    const orderValue = parseOrderValue(document.getElementById('edit-order-value').value);

    if (!closedDate || !orderValue) {
        alert('Vui lòng nhập đầy đủ thông tin');
        return;
    }

    try {
        showButtonLoading('#edit-order-modal .btn-success', 'Đang lưu...');
        const orderData = {
            closedDate: closedDate,
            orderCode: orderCode,
            orderValue: orderValue
        };
        const result = await callGAS(
                'updateOrderOfCustomer',parseInt(customerId), parseInt(orderId), orderData, currentUser ? currentUser.name : 'Unknown'); // Đã thêm user

        if (result.success) {
            hideButtonLoading('#edit-order-modal .btn-success');
            showNotification('Cập nhật đơn hàng thành công!');
            closeModal();

            await refreshData();
            currentCustomer = customers.find(c => c.id == customerId);
            // Kiểm tra modal nào đang mở để refresh đúng
            if (parentModal === 'customer-modal') {
                editCustomer(customerId);
            } else {
                viewCustomerDetails(customerId);
            }
            filterCustomers();
        } else {
            hideButtonLoading('#edit-order-modal .btn-success');
            showNotification('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        hideButtonLoading('#edit-order-modal .btn-success');
        showNotification('Có lỗi xảy ra khi cập nhật đơn hàng', 'error');
    }
}

// Cancel edit order - quay về modal trước đó
function cancelEditOrder() {
    document.getElementById('edit-order-modal').classList.remove('show');

    if (parentModal && document.getElementById(parentModal)) {
        document.getElementById(parentModal).classList.add('show');
    } else {
        document.body.style.overflow = 'auto';
    }
}

function cancelAddOrder() {
    document.getElementById('add-order-modal').classList.remove('show');

    if (parentModal && document.getElementById(parentModal)) {
        document.getElementById(parentModal).classList.add('show');
    } else {
        document.body.style.overflow = 'auto';
    }
}

// Save customer
window.saveCustomer = async function() {
    const form = document.getElementById('customer-form');
    const customerId = document.getElementById('customer-id').value;

    // Lấy thông tin form cơ bản
    const customerData = {
        createdDate: document.getElementById('customer-created-date').value,
        name: document.getElementById('customer-name').value.trim(),
        phone: document.getElementById('customer-phone').value.trim(),
        notes: document.getElementById('customer-notes').value.trim(),
        address: document.getElementById('customer-address').value.trim(),
        status: document.querySelector('select[name="status"]').value,
        assignedStaff: document.querySelector('select[name="assignedStaff"]').value,
        source: document.querySelector('select[name="source"]').value,

        // QUAN TRỌNG: Truyền tên người đang đăng nhập để ghi log
        _editorName: currentUser ? currentUser.name : 'Unknown' 
    };

    // Logic xử lý đơn hàng khi thêm mới trạng thái đã chốt
    if (!customerId && customerData.status === 'Đã chốt') {
        customerData.closedDate = document.getElementById('customer-closed-date').value;
        customerData.orderCode = document.getElementById('customer-order-code').value.trim();
        customerData.orderValue = parseOrderValue(document.getElementById('customer-order-value').value);
        if (!customerData.closedDate || !customerData.orderValue) {
            alert('Vui lòng nhập đầy đủ Ngày chốt và Giá trị đơn hàng');
            return;
        }
    }

    if (!customerData.name || !customerData.createdDate || !customerData.phone) {
        showCustomAlert('Vui lòng nhập đầy đủ thông tin bắt buộc', 'error');
        return;
    }

    try {
        showButtonLoading('#customer-modal .d-flex .btn-success', 'Đang lưu...');
       const result = customerId 
            ? await callGAS('updateCustomer', parseInt(customerId), customerData)
            : await callGAS('addCustomer', customerData);

        if (result.success) {
            showNotification('Thành công!');
            closeModal();

            // Vẽ lại dữ liệu và giao diện
            await refreshData();
            // Đảm bảo update lại các Tab thống kê
            renderStatusTabs(); 
        } else {
            hideButtonLoading('#customer-modal .d-flex .btn-success');
            showNotification('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        hideButtonLoading('#customer-modal .d-flex .btn-success');
        showNotification('Có lỗi xảy ra', 'error');
    }
};


// Thêm function kiểm tra nhân viên có được sử dụng không
function isStaffInUse(staffName) {
    return customers.some(customer => customer.assignedStaff === staffName);
}

// Thêm function kiểm tra trạng thái có được sử dụng không
function isStatusInUse(statusName) {
    return customers.some(customer => customer.status === statusName);
}

// Delete customer
window.deleteCustomer = async function(customerId, btn) {
    const customer = customers.find(c => c.id == customerId);
    if (!customer) return;

    if (!(await showCustomConfirm(`Bạn có chắc muốn xóa khách hàng "KH${customer.id} - ${customer.name}"?`, 'Xóa khách hàng'))) {
        return;
    }

    // --- BẮT ĐẦU: Hiệu ứng Loading ---
    const originalIcon = btn ? btn.innerHTML : '';
    if (btn) { 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; 
        btn.disabled = true; 
    }
    // ---------------------------------

    try {
        const result = await callGAS(
        'deleteCustomer', 
        customerId, 
        currentUser ? currentUser.name : 'Unknown'
    );

        if (result.success) {
            showNotification('Xóa khách hàng thành công!');
            await refreshData();
        } else {
            showNotification('Lỗi: ' + result.error, 'error');
            // Restore nút nếu lỗi
            if (btn) { btn.innerHTML = originalIcon; btn.disabled = false; }
        }
    } catch (error) {
        console.error('Error deleting customer:', error);
        showNotification('Có lỗi xảy ra khi xóa khách hàng', 'error');
        // Restore nút nếu lỗi
        if (btn) { btn.innerHTML = originalIcon; btn.disabled = false; }
    }
};

// View customer details
function viewCustomerDetails(customerId) {
    const customer = customers.find(c => c.id == customerId);
    if (!customer) return;

    currentCustomer = customer;

    const totalOrderValue = (customer.orders || []).reduce((sum, o) => sum + (o.orderValue || 0), 0);
    const orderCount = customer.orders ? customer.orders.length : 0;
    const careCount = customer.careHistory ? customer.careHistory.length : 0;

    // Render Đơn hàng
    let ordersHtml = '<p class="text-muted text-center" style="font-size:12px; margin:0; padding:5px;">Chưa có đơn hàng</p>';
    if (customer.orders && customer.orders.length > 0) {
        ordersHtml = `
        <table style="width:100%; font-size:12.5px; border-collapse: collapse;">
            <tr style="background:#f8f9fa; color:#666; font-size:10px; text-transform:uppercase;">
                <th style="padding:4px; text-align:left;">Mã đơn</th>
                <th style="padding:4px; text-align:left;">Ngày chốt</th>
                <th style="padding:4px; text-align:right;">Giá trị</th>
                <th style="padding:4px; text-align:right; width:50px;"></th>
            </tr>
            ${customer.orders.sort((a, b) => new Date(b.closedDate) - new Date(a.closedDate)).map(order => `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:4px; font-weight:600;">${order.orderCode || '---'}</td>
                    <td style="padding:4px;">${formatDate(order.closedDate)}</td>
                    <td style="padding:4px; text-align:right; color:#059669; font-weight:bold;">${new Intl.NumberFormat('vi-VN').format(order.orderValue || 0)}</td>
                    <td style="padding:4px; text-align:right;">
                         <button class="btn btn-sm btn-no-bg btn-secondary" style="padding:0 2px;" onclick="editOrderInDetail('${order.id}', ${customer.id})"><i class="fas fa-edit"></i></button>
                         <button class="btn btn-sm btn-no-bg btn-danger" style="padding:0 2px;" onclick="deleteOrderInDetail('${order.id}', ${customer.id}, this)"> <i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('')}
        </table>`;
    }

    // Render Lịch sử chăm sóc
    let historyHtml = '<p class="text-muted text-center" style="font-size:12px; margin:0; padding:5px;">Chưa có lịch sử chăm sóc</p>';
    if (customer.careHistory && customer.careHistory.length > 0) {
        const sortedHistory = [...customer.careHistory].sort((a, b) => new Date(b.contactDate) - new Date(a.contactDate));
        historyHtml = `<div class="timeline">` + sortedHistory.map(entry => `
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-header">
                    <span style="font-weight:700; color:var(--primary);">${formatDate(entry.contactDate)}</span> 
                    <span>- ${entry.staff}</span>
                    ${entry.nextContactDate ? `<span style="margin-left:auto; color:#F59E0B; font-weight:600;"><i class="fas fa-bell" style="font-size:10px;"></i> ${formatDate(entry.nextContactDate)}</span>` : ''}
                </div>
                <div class="timeline-content-compact">
                    <div style="flex:1; white-space: pre-wrap; margin-right:10px;">${entry.content}</div>
                    <div style="white-space:nowrap;">
                        <button class="btn btn-sm btn-no-bg btn-secondary" style="padding:0 2px;" onclick="editCareHistory(${entry.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-no-bg btn-danger" style="padding:0 2px;" onclick="deleteCareHistory(${entry.id}, this)"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>
        `).join('') + `</div>`;
    }

    const modalContent = `
        <div class="modal-detail-header">
            <button class="close" style="position: absolute; right: 15px; top: 15px; z-index: 100;" onclick="closeModal()">&times;</button>
           
            <div class="modal-detail-title">
                <div style="width: 30px; height: 30px; background: var(--primary); color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px;">
                    ${customer.name.charAt(0).toUpperCase()}
                </div>
                <div style="font-size:1.1rem; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${customer.name} <span style="font-size:12px; color:#888; font-weight:400;">(ID: ${customer.id})</span>
                </div>
                
                <div style="margin-left: 10px; margin-right: 35px;">
                     <select class="form-control status-dropdown" style="width: auto; height:28px; padding: 0 10px; font-size:12px; font-weight: 600; border-radius: 4px; border: 1px solid #e2e8f0;"
                            onchange="changeCustomerStatusInModal(${customer.id}, this.value, '${customer.status || ''}')"
                            data-current-status="${customer.status || ''}">
                        <option value="" data-color="#6B7280">Chưa xác định</option>
                        ${statuses.map(status => 
                            `<option value="${status.name}" data-color="${status.color}" ${(customer.status === status.name) ? 'selected' : ''}>${status.name}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            
            <div class="modal-detail-stats" style="gap: 20px;">
                
                <div class="stat-item" style="flex: 1.4;">
                    <span class="stat-label">Doanh thu</span>
                    <span class="stat-value" style="color: #059669;">${new Intl.NumberFormat('vi-VN').format(totalOrderValue)}</span>
                </div>

                <div class="stat-item" style="border-left-color: #F59E0B; flex: 0.8;">
                    <span class="stat-label">Số đơn</span>
                    <span class="stat-value">${orderCount}</span>
                </div>

                <div class="stat-item" style="border-left-color: #3B82F6; flex: 0.8;">
                    <span class="stat-label">Lần chăm sóc</span>
                    <span class="stat-value care-count-display">${careCount}</span>
                </div>
            </div>
        </div>

        <div class="detail-stack">
            <div class="detail-card">
                <div class="detail-card-title">Thông tin liên hệ</div>
                <div class="contact-grid">
                     <div class="contact-item"><span class="info-label"><i class="fas fa-phone"></i> Điện thoại:</span><span class="info-value">${customer.phone || '---'}</span></div>
                     <div class="contact-item"><span class="info-label"><i class="fas fa-share-alt"></i> Nguồn:</span><span class="info-value">${customer.source || '---'}</span></div>
                     <div class="contact-item"><span class="info-label"><i class="fas fa-user-tie"></i> Phụ trách:</span><span class="info-value">${customer.assignedStaff || '---'}</span></div>
                     <div class="contact-item"><span class="info-label"><i class="fas fa-calendar"></i> Ngày tạo:</span><span class="info-value">${formatDate(customer.createdDate)}</span></div>
                     <div class="contact-item full-width" style="border-bottom:none;"><span class="info-label"><i class="fas fa-map-marker-alt"></i> Địa chỉ:</span><span class="info-value">${customer.address || '---'}</span></div>
                </div>
            </div>

            <div class="detail-card" style="padding-bottom:5px;">
                <div class="detail-card-title" style="margin-bottom:5px; border-bottom:none;">Ghi chú</div>
                <div class="note-content">${customer.notes ? customer.notes : 'Không có ghi chú'}</div>
            </div>

            <div class="detail-card">
                <div class="detail-card-title">
                    <span><i class="fas fa-shopping-cart"></i> Đơn hàng (${orderCount})</span>
                    <button class="btn btn-sm btn-success" style="padding: 4px 6px; font-size:11px;" onclick="showAddOrderModal(${customer.id})"><i class="fas fa-plus"></i> Thêm</button>
                </div>
                <div style="max-height: 200px; overflow-y: auto;">${ordersHtml}</div>
            </div>

            <div class="detail-card">
                <div class="detail-card-title">
                    <span><i class="fas fa-history"></i> Lịch sử chăm sóc</span>
                     <button class="btn btn-sm btn-success" style="padding: 4px 6px; font-size:11px;" onclick="addCareHistory(${customer.id})"><i class="fas fa-plus"></i> Thêm</button>
                </div>
                <div id="care-history-list" style="max-height: 300px; overflow-y: auto;">${historyHtml}</div>
            </div>
        </div>
    `;

    // Inject nội dung không dùng wrapper padding để sticky header hoạt động
    const modalContentContainer = document.querySelector('#customer-detail-modal .modal-content');
    modalContentContainer.innerHTML = modalContent;

    showModal('customer-detail-modal');
    setTimeout(() => { updateStatusDropdownColor(); }, 100);
}

// Show add order modal
function showAddOrderModal(customerId) {
    parentModal = 'customer-detail-modal'; // Track modal cha
    document.getElementById('add-order-form').reset();
    document.getElementById('add-order-customer-id').value = customerId;

    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('add-order-closed-date').value = today;

    // Ẩn customer detail modal trước
    document.getElementById('customer-detail-modal').classList.remove('show');
    showModal('add-order-modal');
}

// Save new order
async function saveNewOrder() {
    const customerId = document.getElementById('add-order-customer-id').value;
    const closedDate = document.getElementById('add-order-closed-date').value;
    const orderCode = document.getElementById('add-order-code').value.trim();
    const orderValue = parseOrderValue(document.getElementById('add-order-value').value);

    if (!closedDate || !orderValue) {
        alert('Vui lòng nhập đầy đủ Ngày chốt và Giá trị đơn hàng');
        return;
    }

    const customer = customers.find(c => c.id == customerId);
    if (!customer) return;
    try {
        showButtonLoading('#add-order-modal .btn-success', 'Đang lưu...');
        const newOrder = {
            id: Date.now(),
            closedDate: closedDate,
            orderCode: orderCode,
            orderValue: orderValue,
            createdAt: new Date().toISOString()
        };
        const result = await callGAS(
                'addOrderToCustomer',parseInt(customerId), newOrder, currentUser ? currentUser.name : 'Unknown'); // Đã thêm user

        if (result.success) {
            hideButtonLoading('#add-order-modal .btn-success');
            showNotification('Thêm đơn hàng thành công!');
            closeModal();

            await refreshData();
            currentCustomer = customers.find(c => c.id == customerId);
            // UPDATED: Kiểm tra xem từ modal nào gọi để quay về đúng modal
            if (parentModal === 'customer-modal') {
                editCustomer(customerId);
            } else {
                viewCustomerDetails(customerId);
            }
            filterCustomers();
        } else {
            hideButtonLoading('#add-order-modal .btn-success');
            showNotification('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        hideButtonLoading('#add-order-modal .btn-success');
        showNotification('Có lỗi xảy ra khi lưu đơn hàng', 'error');
    }
}

// Render care history
function renderCareHistory(careHistory) {
    const container = document.getElementById('care-history-list');

    // Sắp xếp theo ngày mới nhất
    const sortedHistory = [...careHistory].sort((a, b) => new Date(b.contactDate) - new Date(a.contactDate));

    if (sortedHistory.length === 0) {
        container.innerHTML = '<p class="text-muted text-center" style="font-size:12px; margin:0; padding:5px;">Chưa có lịch sử chăm sóc</p>';
        return;
    }

    // Render đúng cấu trúc TIMELINE như lúc view detail
    const historyHtml = `<div class="timeline">` + sortedHistory.map(entry => `
        <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-header">
                <span style="font-weight:700; color:var(--primary);">${formatDate(entry.contactDate)}</span> 
                <span>- ${entry.staff}</span>
                ${entry.nextContactDate ? `<span style="margin-left:auto; color:#F59E0B; font-weight:600;"><i class="fas fa-bell" style="font-size:10px;"></i> ${formatDate(entry.nextContactDate)}</span>` : ''}
            </div>
            <div class="timeline-content-compact">
                <div style="flex:1; white-space: pre-wrap; margin-right:10px;">${entry.content}</div>
                <div style="white-space:nowrap;">
                    <button class="btn btn-sm btn-no-bg btn-secondary" style="padding:0 2px;" onclick="editCareHistory(${entry.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-no-bg btn-danger" style="padding:0 2px;" onclick="deleteCareHistory(${entry.id}, this)"> <i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>
    `).join('') + `</div>`;

    container.innerHTML = historyHtml;
}

// Edit care history
function editCareHistory(entryId) {
    if (!currentCustomer) return;

    const entry = currentCustomer.careHistory.find(e => e.id == entryId);
    if (!entry) return;

    document.getElementById('care-form').reset();
    document.getElementById('care-customer-name').textContent = currentCustomer.name;

    // Populate form with entry data
    document.getElementById('care-contact-date').value = formatDateForInput(entry.contactDate);
    document.getElementById('care-content').value = entry.content;
    document.getElementById('care-next-contact-date').value = formatDateForInput(entry.nextContactDate);

    // Set staff selection
    setTimeout(() => {
        document.getElementById('care-staff').value = entry.staff || '';
    }, 100);

    // Store entry ID for update
    document.getElementById('care-entry-id').value = entryId;

    populateDropdowns();
    showModal('care-modal');
}

// Delete care history
async function deleteCareHistory(entryId, btn) {
    if (!currentCustomer) return;
    if (!(await showCustomConfirm('Bạn có chắc muốn xóa lịch sử chăm sóc này?', 'Xóa lịch sử'))) return;
    // Hiệu ứng loading trên nút
    const originalIcon = btn.innerHTML;
    if(btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
    }

    try {
        const result = await callGAS(
                deleteCareHistory, currentCustomer.id, entryId, currentUser ? currentUser.name : 'Unknown'); // Đã thêm user

        if (result.success) {
            showNotification('Xóa lịch sử chăm sóc thành công!');
            await refreshData();
            currentCustomer = customers.find(c => c.id == currentCustomer.id);
            renderCareHistory(currentCustomer?.careHistory || []);
            updateCareCount();
            filterCustomers();
        } else {
            showNotification('Lỗi: ' + result.error, 'error');
            if(btn) { btn.innerHTML = originalIcon; btn.disabled = false; }
        }
    } catch (error) {
        console.error('Error deleting care history:', error);
        showNotification('Có lỗi xảy ra khi xóa lịch sử chăm sóc', 'error');
        if(btn) { btn.innerHTML = originalIcon; btn.disabled = false;
        }
    }
}

// Format date for input fields (YYYY-MM-DD)
function formatDateForInput(dateString) {
  if (!dateString) return '';

  try {
    // Nếu đã đúng format YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString;
    }

    // Nếu format DD/MM/YYYY hoặc D/M/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)) {
      const parts = dateString.split('/');
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }

    // Fallback: parse bằng Date object
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return '';
  }
}

// Show add care history modal
function addCareHistory(customerId) {
    currentCustomer = customers.find(c => c.id == customerId);
    if (!currentCustomer) return;

    document.getElementById('care-form').reset();
    document.getElementById('care-entry-id').value = ''; // Reset entry ID
    document.getElementById('care-customer-name').textContent = `KH${currentCustomer.id} - ${currentCustomer.name}`;

    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    document.getElementById('care-contact-date').value = today;
    document.getElementById('care-next-contact-date').value = nextWeek;

    populateDropdowns();

    // FIX: Set default staff to current logged in user instead of assigned staff
    setTimeout(() => {
        const careStaffSelect = document.getElementById('care-staff');
        if (careStaffSelect && currentUser && currentUser.name) {
            careStaffSelect.value = currentUser.name;
        }
    }, 100);

    showModal('care-modal');
}

// Save care history
async function saveCareHistory() {
    if (!currentCustomer) return;

    const form = document.getElementById('care-form');
    const formData = new FormData(form);
    const entryId = document.getElementById('care-entry-id').value;

    const careData = {
        contactDate: formData.get('contactDate'),
        content: formData.get('content'),
        nextContactDate: formData.get('nextContactDate'),
        staff: formData.get('staff')
    };
    // Validate required fields
    if (!careData.contactDate || !careData.content || !careData.staff) {
        alert('Vui lòng điền đầy đủ thông tin');
        return;
    }

    try {
        showButtonLoading('#care-modal .btn-success', 'Đang lưu...');
        let result;

        if (entryId && entryId.trim() !== '') {
            result =await callGAS(
                    'updateCareHistory', currentCustomer.id, parseInt(entryId), careData, currentUser ? currentUser.name : 'Unknown'); // Đã thêm user
        } else {
            result = await callGAS(
                    'addCareHistory', currentCustomer.id, careData, currentUser ? currentUser.name : 'Unknown'); // Đã thêm user
        }

        if (result.success) {
            // Ẩn loading và hiển thị thông báo ngay lập tức
            hideButtonLoading('#care-modal .btn-success');
            showNotification(entryId && entryId.trim() !== '' ? 'Cập nhật lịch sử chăm sóc thành công!' : 'Thêm lịch sử chăm sóc thành công!');
            document.getElementById('care-modal').classList.remove('show');

            await refreshData();
            currentCustomer = customers.find(c => c.id == currentCustomer.id);

            filterCustomers();

            renderCareHistory(currentCustomer?.careHistory || []);
            updateCareCount();
            // THÊM DÒNG NÀY
            document.getElementById('customer-detail-modal').classList.add('show');
        } else {
            hideButtonLoading('#care-modal .btn-success');
            showNotification('Lỗi: ' + result.error, 'error');
        }

    } catch (error) {
        console.error('Error saving care history:', error);
        hideButtonLoading('#care-modal .btn-success');
        showNotification('Có lỗi xảy ra khi lưu lịch sử chăm sóc', 'error');
    }
}

// Function cập nhật số lần chăm sóc trong modal
function updateCareCount() {
    if (currentCustomer) {
        const careCountElement = document.querySelector('#customer-detail-modal .care-count-display');
        if (careCountElement) {
            const careCount = currentCustomer.careHistory ? currentCustomer.careHistory.length : 0;
            careCountElement.textContent = `${careCount}`; 
        }
    }
}

// Show settings modal
function showSettingsModal() {
    renderSettingsContent();
    showModal('settings-modal');
}

// Render settings content
function renderSettingsContent() {
    // Render staff list - giữ nguyên
    const staffContainer = document.querySelector('#settings #staff-list');
    if (staffContainer) {
        const staffHtml = staff.length > 0 ? staff.map(s => `
            <div class="settings-item">
                <span>
                    ${s.name} - ${s.position}
                    ${s.manager ? `<span style="color: #666; font-size: 12px; margin-left: 8px;">(QL: ${s.manager})</span>` : ''}
                </span>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-no-bg btn-secondary" onclick="editStaff(${s.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-no-bg btn-danger" onclick="deleteStaffConfirm(${s.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('') : '<p class="text-muted">Chưa có nhân viên</p>';

        staffContainer.innerHTML = staffHtml;
    }

    // Render status list - giữ nguyên
    const statusContainer = document.querySelector('#settings #status-list');
    if (statusContainer) {
        const statusHtml = statuses.length > 0 ? statuses.map((s, index) => {
            // Kiểm tra trạng thái đặc biệt
            const isProtectedStatus = s.name === 'Đã chốt' || s.name === 'Khách hàng mới';
            const isFirst = index === 0;
            const isLast = index === statuses.length - 1;

            return `
                <div class="settings-item">
                    <span style="color: ${s.color}">
                        <i class="fas fa-circle" style="color: ${s.color}"></i> ${s.name}
                    </span>
                    <div class="d-flex gap-2 align-items-center">
                        ${!isProtectedStatus ? `
                            <!-- Nút di chuyển -->
                            <button class="btn btn-sm btn-no-bg" 
                                    onclick="moveStatus(${s.id}, 'up')" 
                                    ${isFirst ? 'disabled' : ''}
                                    title="Di chuyển lên">
                                <i class="fas fa-chevron-up"></i>
                            </button>
                            <button class="btn btn-sm btn-no-bg" 
                                    onclick="moveStatus(${s.id}, 'down')" 
                                    ${isLast ? 'disabled' : ''}
                                    title="Di chuyển xuống">
                                <i class="fas fa-chevron-down"></i>
                            </button>
                            
                            <!-- Nút edit/delete -->
                            <button class="btn btn-sm btn-no-bg btn-secondary" onclick="editStatus(${s.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-no-bg btn-danger" onclick="deleteStatusConfirm(${s.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : `
                            <span class="text-muted" style="font-size: 12px; font-style: italic; margin-left: 60px;">Trạng thái hệ thống</span>
                        `}
                    </div>
                </div>
            `;
        }).join('') : '<p class="text-muted">Chưa có trạng thái</p>';

        statusContainer.innerHTML = statusHtml;
    }

    // THÊM: Render source list
    const sourceContainer = document.querySelector('#settings #source-list');
    if (sourceContainer) {
        const sourceHtml = sources.length > 0 ? sources.map(s => `
            <div class="settings-item">
                <span>
                    <i class="fas fa-share-alt"></i> ${s.name}
                    ${s.description ? `<small class="text-muted"> - ${s.description}</small>` : ''}
                </span>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-no-bg btn-secondary" onclick="editSource(${s.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-no-bg btn-danger" onclick="deleteSourceConfirm(${s.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('') : '<p class="text-muted">Chưa có nguồn khách</p>';

        sourceContainer.innerHTML = sourceHtml;
    }
}

// Thêm function di chuyển trạng thái
async function moveStatus(statusId, direction) {
    try {
        const result = await callGAS(
                'reorderStatus',statusId, direction);
        if (result.success) {
            showNotification(`Di chuyển trạng thái thành công!`);
            await refreshData();

            // Refresh charts để cập nhật thứ tự màu sắc
            refreshChartsAfterStatusChange();
        } else {
            showNotification('Lỗi: ' + result.error, 'error');
        }

    } catch (error) {
        console.error('Error moving status:', error);
        showNotification('Có lỗi xảy ra khi di chuyển trạng thái', 'error');
    }
}

// Add staff
function addStaff() {
    document.getElementById('staff-form').reset();
    document.getElementById('staff-id').value = '';
    document.getElementById('staff-modal-title').textContent = 'Thêm nhân viên mới';

    // RESET ALL FIELD STATES TO DEFAULT (EDITABLE)
    const nameField = document.getElementById('staff-name');
    const positionField = document.getElementById('staff-position');
    const usernameField = document.getElementById('staff-username');
    const passwordField = document.getElementById('staff-password');

    // Reset name field
    nameField.readOnly = false;
    nameField.style.backgroundColor = 'white';
    nameField.style.cursor = 'text';
    nameField.title = '';

    // Reset position field
    positionField.disabled = false;
    positionField.style.backgroundColor = 'white';
    positionField.style.cursor = 'pointer';
    positionField.title = '';

    // Reset username field
    usernameField.readOnly = false;
    usernameField.style.backgroundColor = 'white';
    usernameField.style.cursor = 'text';
    usernameField.title = '';

    // Reset password field
    passwordField.readOnly = false;
    passwordField.style.backgroundColor = 'white';
    passwordField.style.cursor = 'text';
    passwordField.title = '';

    // ↓↓↓ THAY ĐỔI: Kiểm tra giá trị position mặc định và hiển thị manager field nếu cần
    const managerField = document.getElementById('manager-field');

    // Đợi DOM render xong rồi kiểm tra giá trị position
    setTimeout(() => {
        const currentPosition = positionField.value;
        if (currentPosition === 'Nhân viên') {
            managerField.style.display = 'block';
            populateManagerDropdown();
        } else {
            managerField.style.display = 'none';
        }
    }, 50);

    showModal('staff-modal');
}

// Function mới: editStaff
function editStaff(staffId) {
    const staffMember = staff.find(s => s.id == staffId);
    if (!staffMember) return;

    document.getElementById('staff-id').value = staffMember.id;
    document.getElementById('staff-name').value = staffMember.name;
    document.getElementById('staff-position').value = staffMember.position;
    document.getElementById('staff-username').value = staffMember.username || '';
    document.getElementById('staff-password').value = staffMember.password || '';
    // Kiểm tra xem nhân viên có được sử dụng không
    const isInUse = isStaffInUse(staffMember.name);

    // Disable các field nếu nhân viên đang được sử dụng, chỉ để password có thể sửa
    const nameField = document.getElementById('staff-name');
    const positionField = document.getElementById('staff-position');
    const usernameField = document.getElementById('staff-username');
    const passwordField = document.getElementById('staff-password');

    if (isInUse) {
        // Disable tên, chức vụ, tên đăng nhập
        nameField.readOnly = true;
        nameField.style.backgroundColor = '#f5f5f5';
        nameField.style.cursor = 'not-allowed';
        nameField.title = 'Không thể sửa vì đang được sử dụng bởi khách hàng';

        positionField.disabled = true;
        positionField.style.backgroundColor = '#f5f5f5';
        positionField.style.cursor = 'not-allowed';
        positionField.title = 'Không thể sửa vì đang được sử dụng bởi khách hàng';

        usernameField.readOnly = true;
        usernameField.style.backgroundColor = '#f5f5f5';
        usernameField.style.cursor = 'not-allowed';
        usernameField.title = 'Không thể sửa vì đang được sử dụng bởi khách hàng';

        // Password vẫn có thể sửa
        passwordField.readOnly = false;
        passwordField.style.backgroundColor = 'white';
        passwordField.style.cursor = 'text';
        passwordField.title = '';
    } else {
        // Reset tất cả về trạng thái có thể edit
        nameField.readOnly = false;
        nameField.style.backgroundColor = 'white';
        nameField.style.cursor = 'text';
        nameField.title = '';

        positionField.disabled = false;
        positionField.style.backgroundColor = 'white';
        positionField.style.cursor = 'pointer';
        positionField.title = '';

        usernameField.readOnly = false;
        usernameField.style.backgroundColor = 'white';
        usernameField.style.cursor = 'text';
        usernameField.title = '';

        passwordField.readOnly = false;
        passwordField.style.backgroundColor = 'white';
        passwordField.style.cursor = 'text';
        passwordField.title = '';
    }

    const managerField = document.getElementById('manager-field');
    if (staffMember.position === 'Nhân viên') {
        managerField.style.display = 'block';
        populateManagerDropdown(staffId);
        setTimeout(() => {
            document.getElementById('staff-manager').value = staffMember.manager || '';
        }, 100);
    } else {
        managerField.style.display = 'none';
    }

    document.getElementById('staff-modal-title').textContent = 'Sửa thông tin nhân viên';
    showModal('staff-modal');
}

// Function mới: saveStaff
async function saveStaff() {
    const form = document.getElementById('staff-form');
    const formData = new FormData(form);
    const staffId = document.getElementById('staff-id').value;

    // Lấy giá trị trực tiếp từ các field thay vì từ formData
    const nameField = document.getElementById('staff-name');
    const positionField = document.getElementById('staff-position');
    const usernameField = document.getElementById('staff-username');
    const passwordField = document.getElementById('staff-password');

    const staffData = {
        name: nameField.value.trim(),
        position: positionField.value.trim(),
        username: usernameField.value.trim(),
        password: passwordField.value.trim(),
        manager: document.getElementById('staff-manager').value.trim()
    };

    // Validate chỉ những field cần thiết
    if (!staffData.name || !staffData.position || !staffData.username || !staffData.password) {
        alert('Vui lòng điền đầy đủ thông tin');
        return;
    }

    try {
        showButtonLoading('#staff-modal .btn-success', 'Đang lưu...');

        let result;
        if (staffId) {
            result = await callGAS(
                    'updateStaff', parseInt(staffId), staffData);
        } else {
            result = await callGAS(
                    'addStaff',staffData);
        }

        if (result.success) {
            // Ẩn loading và hiển thị thông báo ngay lập tức
            hideButtonLoading('#staff-modal .btn-success');
            showNotification(staffId ? 'Cập nhật nhân viên thành công!' : 'Thêm nhân viên thành công!');
            closeModal();
            await refreshData();
        } else {
            hideButtonLoading('#staff-modal .btn-success');
            showNotification('Lỗi: ' + result.error, 'error');
        }

    } catch (error) {
        console.error('Error saving staff:', error);
        hideButtonLoading('#staff-modal .btn-success');
        showNotification('Có lỗi xảy ra khi lưu nhân viên', 'error');
    }
}

// Populate manager dropdown
function populateManagerDropdown(excludeStaffId) {
    const managerSelect = document.getElementById('staff-manager');
    if (!managerSelect) return;

    const managers = staff.filter(s => 
        s.position !== 'Admin' && s.id != excludeStaffId
    );

    managerSelect.innerHTML = '<option value="">Không có người quản lý</option>' +
        managers.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
}

// Function mới: deleteStaffConfirm
async function deleteStaffConfirm(staffId) {
    const staffMember = staff.find(s => s.id == staffId);
    if (!staffMember) return;

    // Kiểm tra xem nhân viên có được sử dụng không
    if (isStaffInUse(staffMember.name)) {
        showNotification(`Không thể xóa nhân viên "${staffMember.name}" vì đang được phân công cho khách hàng!`, 'info');
        return;
    }

    // --- THAY ĐỔI TẠI ĐÂY: Dùng Custom Confirm thay vì confirm() mặc định ---
    if (!(await showCustomConfirm(`Bạn có chắc muốn xóa nhân viên "${staffMember.name}"?`, 'Xóa nhân viên'))) {
        return;
    }
    // -----------------------------------------------------------------------

    try {
        const result = await callGAS(
                'deleteStaff', staffId);

        if (result.success) {
            showNotification('Xóa nhân viên thành công!');
            await refreshData();
        } else {
            showNotification('Lỗi: ' + result.error, 'error');
        }

    } catch (error) {
        console.error('Error deleting staff:', error);
        showNotification('Có lỗi xảy ra khi xóa nhân viên', 'error');
    }
}


// Add status
function addStatus() {
    document.getElementById('status-form').reset();
    document.getElementById('status-id').value = '';
    document.getElementById('status-color').value = '#3B82F6';
    document.getElementById('status-modal-title').textContent = 'Thêm trạng thái mới';

    // RESET NAME FIELD STATE TO DEFAULT (EDITABLE)
    const nameField = document.getElementById('status-name');
    nameField.readOnly = false;
    nameField.style.backgroundColor = 'white';
    nameField.style.cursor = 'text';
    nameField.title = '';

    // Cập nhật color text
    const colorText = document.getElementById('color-text');
    if (colorText) {
        colorText.textContent = '#3B82F6';
    }

    showModal('status-modal');
}

// Thêm function để xử lý nút Hủy trong care modal
function cancelCareModal() {
    // Đóng modal care
    document.getElementById('care-modal').classList.remove('show');

    // Nếu đang ở table view và có currentCustomer, mở lại customer detail modal
    if (currentCustomer) {
        document.getElementById('customer-detail-modal').classList.add('show');
    } else {
        // Nếu không có currentCustomer, đóng hoàn toàn
        document.body.style.overflow = 'auto';
    }
}

// Function mới: editStatus
function editStatus(statusId) {
    const status = statuses.find(s => s.id == statusId);
    if (!status) return;

    document.getElementById('status-id').value = status.id;
    document.getElementById('status-name').value = status.name;
    document.getElementById('status-color').value = status.color;
    document.getElementById('status-modal-title').textContent = 'Sửa thông tin trạng thái';

    // Dùng readonly thay vì disabled để vẫn submit được
    const nameField = document.getElementById('status-name');
    if (isStatusInUse(status.name)) {
        nameField.readOnly = true;
        nameField.style.backgroundColor = '#f5f5f5';
        nameField.style.cursor = 'not-allowed';
        nameField.title = 'Không thể sửa tên vì đang được sử dụng bởi khách hàng';
    } else {
        nameField.readOnly = false;
        nameField.style.backgroundColor = 'white';
        nameField.style.cursor = 'text';
        nameField.title = '';
    }

    // Cập nhật color text nếu có
    const colorText = document.getElementById('color-text');
    if (colorText) {
        colorText.textContent = status.color.toUpperCase();
    }

    showModal('status-modal');
}

// Function mới: saveStatus
async function saveStatus() {
    const form = document.getElementById('status-form');
    const formData = new FormData(form);
    const statusId = document.getElementById('status-id').value;

    const statusData = {
        name: formData.get('name').trim(),
        color: formData.get('color')
    };

    if (!statusData.name) {
        alert('Vui lòng nhập tên trạng thái');
        return;
    }

    try {
        showButtonLoading('#status-modal .btn-success', 'Đang lưu...');

        let result;
        if (statusId) {
            result = await callGAS(
                    'updateStatus', parseInt(statusId), statusData);
        } else {
            result = await callGAS(
                    'addStatus',statusData);
        }

        if (result.success) {
            // Ẩn loading và hiển thị thông báo ngay lập tức
            hideButtonLoading('#status-modal .btn-success');
            showNotification(statusId ? 'Cập nhật trạng thái thành công!' : 'Thêm trạng thái thành công!');
            closeModal();
            await refreshData();

            // Refresh charts with new colors
            refreshChartsAfterStatusChange();
        } else {
            hideButtonLoading('#status-modal .btn-success');
            showNotification('Lỗi: ' + result.error, 'error');
        }

    } catch (error) {
        console.error('Error saving status:', error);
        hideButtonLoading('#status-modal .btn-success');
        showNotification('Có lỗi xảy ra khi lưu trạng thái', 'error');
    }
}


// Function mới: deleteStatusConfirm
async function deleteStatusConfirm(statusId) {
    const status = statuses.find(s => s.id == statusId);
    if (!status) return;

    // Kiểm tra xem trạng thái có được sử dụng không
    if (isStatusInUse(status.name)) {
        showNotification(`Không thể xóa trạng thái "${status.name}" vì đang được sử dụng bởi khách hàng!`, 'info');
        return;
    }

    // --- THAY ĐỔI TẠI ĐÂY ---
    if (!(await showCustomConfirm(`Bạn có chắc muốn xóa trạng thái "${status.name}"?`, 'Xóa trạng thái'))) {
        return;
    }
    // ------------------------

    try {
        const result = await callGAS(
                'deleteStatus', statusId);

        if (result.success) {
            showNotification('Xóa trạng thái thành công!');
            await refreshData();
            refreshChartsAfterStatusChange();
        } else {
            showNotification('Lỗi: ' + result.error, 'error');
        }

    } catch (error) {
        console.error('Error deleting status:', error);
        showNotification('Có lỗi xảy ra khi xóa trạng thái', 'error');
    }
}

// Utility functions
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show');
    });
    document.body.style.overflow = 'auto';
}

function handleError(error) {
    console.error('Error:', error);
    showNotification('Có lỗi xảy ra: ' + error.toString(), 'error');
}

function formatDate(dateString) {
    if (!dateString) return 'Chưa xác định';
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN');
}

function getStatusClass(status) {
    // Tìm status trong array statuses để lấy màu thực
    const statusObj = statuses.find(s => s.name === status);
    if (statusObj) {
        return `status-dynamic-${statusObj.id}`;
    }
    return 'status-new'; // fallback
}

// Thêm function để tạo CSS động cho status colors
function updateStatusStyles() {
    // Xóa style cũ nếu có
    const existingStyle = document.getElementById('dynamic-status-styles');
    if (existingStyle) {
        existingStyle.remove();
    }

    // Tạo CSS mới
    const style = document.createElement('style');
    style.id = 'dynamic-status-styles';

    const css = statuses.map(status => `
        .status-dynamic-${status.id} {
            background: ${hexToRgba(status.color, 0.15)};
            color: #334155;
            border: 1px solid ${hexToRgba(status.color, 0.2)};
        }
    `).join('');

    style.textContent = css;
    document.head.appendChild(style);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Thêm vào cuối file JavaScript.html, trước dòng cuối cùng
function showButtonLoading(buttonSelector, loadingText = 'Đang xử lý...') {
    const button = document.querySelector(buttonSelector);
    if (button) {
        button.dataset.originalText = button.innerHTML;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
        button.disabled = true;
    }
}

function hideButtonLoading(buttonSelector) {
    const button = document.querySelector(buttonSelector);
    if (button && button.dataset.originalText) {
        button.innerHTML = button.dataset.originalText;
        button.disabled = false;
        delete button.dataset.originalText;
    }
}

// Thêm function sortTable
function sortTable(field, keepDirection = false) {
    if (!keepDirection) {
        if (currentSort.field === field) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.field = field;
            currentSort.direction = 'asc';
        }
    }

    filteredCustomers.sort((a, b) => {
        let valueA, valueB;

        switch(field) {
            case 'id': // Sắp xếp theo ID số
                valueA = parseInt(a.id);
                valueB = parseInt(b.id);
                break;
            case 'createdDate':
                valueA = new Date(a.createdDate || '1970-01-01');
                valueB = new Date(b.createdDate || '1970-01-01');
                break;
            case 'name':
                valueA = a.name.toLowerCase();
                valueB = b.name.toLowerCase();
                break;
            case 'phone':
                valueA = a.phone || '';
                valueB = b.phone || '';
                break;
            case 'notes':
                valueA = a.notes || '';
                valueB = b.notes || '';
                break;
            case 'status':
                valueA = a.status || '';
                valueB = b.status || '';
                break;
            case 'assignedStaff':
                valueA = a.assignedStaff || '';
                valueB = b.assignedStaff || '';
                break;
            case 'source':
                valueA = a.source || '';
                valueB = b.source || '';
                break;
            case 'closedDate':
                valueA = a.closedDate ? new Date(a.closedDate) : new Date(0);
                valueB = b.closedDate ? new Date(b.closedDate) : new Date(0);
                break;
            case 'orderCode':
                valueA = a.orderCode || '';
                valueB = b.orderCode || '';
                break;
            case 'orderValue':
                valueA = a.orderValue || 0;
                valueB = b.orderValue || 0;
                break;
            case 'lastContact':
                valueA = a.careHistory && a.careHistory.length > 0 ? new Date(a.careHistory[0].contactDate) : new Date(0);
                valueB = b.careHistory && b.careHistory.length > 0 ? new Date(b.careHistory[0].contactDate) : new Date(0);
                break;
            case 'nextContact':
                const nextContactA = a.careHistory && a.careHistory.length > 0 && a.careHistory[0].nextContactDate ? new Date(a.careHistory[0].nextContactDate) : new Date(0);
                const nextContactB = b.careHistory && b.careHistory.length > 0 && b.careHistory[0].nextContactDate ? new Date(b.careHistory[0].nextContactDate) : new Date(0);
                valueA = nextContactA;
                valueB = nextContactB;
                break;
            default:
                return 0;
        }

        if (valueA < valueB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valueA > valueB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    currentPage = 1;
    updateSortIcons(field, currentSort.direction);
    renderCustomers();
}

function updateSortIcons(activeField, direction) {
    // Reset all icons
    document.querySelectorAll('th i[id^="sort-"]').forEach(icon => {
        icon.className = 'fas fa-sort';
    });

    // Set active icon
    const activeIcon = document.getElementById(`sort-${activeField}`);
    if (activeIcon) {
        activeIcon.className = direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
    }
}

let draggedCard = null;

// Function chuyển trạng thái khách hàng
async function changeCustomerStatus(customerId, newStatus) {   
    const customer = customers.find(c => c.id == customerId);
    if (!customer) return;

    const oldStatus = customer.status || 'Chưa xác định';
    if (oldStatus === newStatus) return;
    const oldStatusDisplay = oldStatus || 'Chưa xác định';
    const newStatusDisplay = newStatus || 'Chưa xác định';

    if (!(await showCustomConfirm(`Chuyển trạng thái khách hàng "${customer.name}" từ "${oldStatusDisplay}" sang "${newStatusDisplay}"?`))) {
        return;
    }

    if (newStatus === 'Đã chốt') {
        document.getElementById('order-customer-id').value = customerId;
        document.getElementById('order-closed-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('order-code').value = customer.orderCode || '';
        if (customer.orderValue) {
            document.getElementById('order-value').value = customer.orderValue.toLocaleString('vi-VN');
        } else {
            document.getElementById('order-value').value = '';
        }
        showModal('order-info-modal');
        return;
    }

    const oldStatusForAPI = customer.status;
    // Cập nhật Optimistic UI (Giao diện thay đổi ngay)
    customer.status = newStatus === 'Chưa xác định' ? '' : newStatus;

    // Vẽ lại các tab trạng thái ngay lập tức
    renderStatusTabs();
    // Vẽ lại bảng dữ liệu
    filterCustomers();

    try {
        // QUAN TRỌNG: Copy object và thêm _editorName
        const customerData = { ...customer };
        customerData._editorName = currentUser ? currentUser.name : 'Unknown';

        const result = await callGAS(
                'updateCustomer',customerId, customerData);

        if (result.success) {
            showNotification(`Chuyển trạng thái thành công từ "${oldStatusDisplay}" sang "${newStatusDisplay}"!`);
            // Refresh lại full data để đảm bảo đồng bộ
            await refreshData(); 
        } else {
            // Revert nếu lỗi
            customer.status = oldStatusForAPI;
            renderStatusTabs();
            filterCustomers();
            showNotification('Lỗi: ' + result.error, 'error');
        }

    } catch (error) {
        console.error('Error changing status:', error);
        customer.status = oldStatusForAPI;
        renderStatusTabs();
        filterCustomers();
        showNotification('Có lỗi xảy ra khi chuyển trạng thái', 'error');
    }
}

async function refreshData() {
    try {
        const result = await callGAS(
                'getAllData',currentSessionId);

        if (result.success) {
            currentUser = result.user;
            staff = result.staff;
            statuses = result.statuses;
            sources = result.sources;
            customers = result.customers;
            invoiceData = result.invoices || [];
           
            window.allHistoryData = result.history || [];
            window.reminders = result.reminders || [];
            updateReminderTabBadge();

            // Cập nhật giao diện các tab khác
            filterCustomers();
            populateDropdowns();
            renderSettingsContent();
            renderStatusTabs();

            const reportsTab = document.getElementById('reports');
            if (reportsTab && reportsTab.classList.contains('active')) {
                renderReports();
            }

            const historyTab = document.querySelector('.nav-tab[data-tab="history"]');
            if (historyTab && historyTab.classList.contains('active')) {
                loadHistoryLogs();
            }

            if (document.querySelector('.nav-tab[data-tab="reminders"]') && 
                document.querySelector('.nav-tab[data-tab="reminders"]').classList.contains('active')) {
                renderReminders();
            }

        }
    } catch (error) {
        console.error('Lỗi refresh data:', error);
    }
}

// Show add source modal
function addSource() {
    document.getElementById('source-form').reset();
    document.getElementById('source-id').value = '';
    document.getElementById('source-modal-title').textContent = 'Thêm nguồn khách mới';

    // RESET FIELD STATES TO DEFAULT
    const nameField = document.getElementById('source-name');
    nameField.readOnly = false;
    nameField.style.backgroundColor = 'white';
    nameField.style.cursor = 'text';
    nameField.title = '';

    showModal('source-modal');
}

// Edit source
function editSource(sourceId) {
    const source = sources.find(s => s.id == sourceId);
    if (!source) return;

    document.getElementById('source-id').value = source.id;
    document.getElementById('source-name').value = source.name;
    document.getElementById('source-description').value = source.description || '';
    document.getElementById('source-modal-title').textContent = 'Sửa thông tin nguồn khách';

    // Kiểm tra xem nguồn khách có được sử dụng không
    const isInUse = isSourceInUse(source.name);

    const nameField = document.getElementById('source-name');
    if (isInUse) {
        nameField.readOnly = true;
        nameField.style.backgroundColor = '#f5f5f5';
        nameField.style.cursor = 'not-allowed';
        nameField.title = 'Không thể sửa tên vì đang được sử dụng bởi khách hàng';
    } else {
        nameField.readOnly = false;
        nameField.style.backgroundColor = 'white';
        nameField.style.cursor = 'text';
        nameField.title = '';
    }

    showModal('source-modal');
}

// Save source
async function saveSource() {
    const form = document.getElementById('source-form');
    const formData = new FormData(form);
    const sourceId = document.getElementById('source-id').value;

    const sourceData = {
        name: formData.get('name').trim(),
        description: formData.get('description').trim()
    };

    if (!sourceData.name) {
        alert('Vui lòng nhập tên nguồn khách');
        return;
    }

    try {
        showButtonLoading('#source-modal .btn-success', 'Đang lưu...');

        let result;
        if (sourceId) {
            result = await callGAS(
                    'updateSource',parseInt(sourceId), sourceData);
        } else {
            result = await callGAS(
                    'addSource',sourceData);
        }

        if (result.success) {
            hideButtonLoading('#source-modal .btn-success');
            showNotification(sourceId ? 'Cập nhật nguồn khách thành công!' : 'Thêm nguồn khách thành công!');
            closeModal();
            await refreshData();
        } else {
            hideButtonLoading('#source-modal .btn-success');
            showNotification('Lỗi: ' + result.error, 'error');
        }

    } catch (error) {
        console.error('Error saving source:', error);
        hideButtonLoading('#source-modal .btn-success');
        showNotification('Có lỗi xảy ra khi lưu nguồn khách', 'error');
    }
}

// Delete source confirm
async function deleteSourceConfirm(sourceId) {
    const source = sources.find(s => s.id == sourceId);
    if (!source) return;

    // Kiểm tra xem nguồn khách có được sử dụng không
    if (isSourceInUse(source.name)) {
        showNotification(`Không thể xóa nguồn khách "${source.name}" vì đang được sử dụng bởi khách hàng!`, 'info');
        return;
    }

    // --- THAY ĐỔI TẠI ĐÂY ---
    if (!(await showCustomConfirm(`Bạn có chắc muốn xóa nguồn khách "${source.name}"?`, 'Xóa nguồn khách'))) {
        return;
    }
    // ------------------------

    try {
        const result = await callGAS(
                'deleteSource',sourceId);

        if (result.success) {
            showNotification('Xóa nguồn khách thành công!');
            await refreshData();
        } else {
            showNotification('Lỗi: ' + result.error, 'error');
        }

    } catch (error) {
        console.error('Error deleting source:', error);
        showNotification('Có lỗi xảy ra khi xóa nguồn khách', 'error');
    }
}

// Check if source is in use
function isSourceInUse(sourceName) {
    return customers.some(customer => customer.source === sourceName);
}

// FUNCTION TOGGLE HIỆN/ẨN FIELDS KHI CHỌN STATUS "ĐÃ CHỐT"
function toggleClosedFields() {
    const statusSelect = document.getElementById('customer-status');
    const closedFields = document.getElementById('closed-fields');

    // Luôn hiển thị closed fields để quản lý orders
    // Không còn phụ thuộc vào status "Đã chốt" nữa
    closedFields.style.display = 'block';

    // Nếu đang trong mode thêm mới và chọn "Đã chốt", hiển thị form thêm đơn hàng đầu tiên
    const customerId = document.getElementById('customer-id').value;

    if (!customerId && statusSelect.value === 'Đã chốt') {
        // Mode thêm mới + status "Đã chốt" → hiển thị form đơn hàng
        closedFields.innerHTML = `
            <div class="form-group" style="display: flex; gap: 15px;">
                <div style="flex: 1;">
                    <label for="customer-closed-date">Ngày chốt <span class="required-star">*</span></label>
                    <input type="date" 
                          id="customer-closed-date" 
                          name="closedDate" 
                          class="form-control" 
                          required>
                </div>
                <div style="flex: 1;">
                    <label for="customer-order-code">Mã đơn hàng</label>
                    <input type="text" 
                          id="customer-order-code" 
                          name="orderCode" 
                          class="form-control" 
                          placeholder="Nhập mã đơn hàng">
                </div>
                <div style="flex: 1;">
                    <label for="customer-order-value">Giá trị đơn hàng <span class="required-star">*</span></label>
                    <input type="text" 
                          id="customer-order-value" 
                          name="orderValue" 
                          class="form-control" 
                          placeholder="Nhập giá trị đơn hàng"
                          oninput="formatOrderValue(this)"
                          required>
                </div>
            </div>
        `;
    } else if (!customerId) {
        // Mode thêm mới + status khác → ẩn
        closedFields.style.display = 'none';
    }
    // Nếu có customerId (mode edit) → đã được xử lý trong editCustomer()
}

// Function format số với dấu chấm phân cách
function formatOrderValue(input) {
    // Lấy giá trị và loại bỏ tất cả ký tự không phải số
    let value = input.value.replace(/[^\d]/g, '');

    // Format với dấu chấm phân cách hàng nghìn
    if (value) {
        value = parseInt(value).toLocaleString('vi-VN');
    }

    // Set lại giá trị đã format
    input.value = value;
}

// Function chuyển đổi format số về number
function parseOrderValue(formattedValue) {
    return parseInt(formattedValue.replace(/\./g, '')) || 0;
}

// Thêm function này vào JavaScript.html
function toggleOrderColumns() {
    const body = document.body;
    const btn = document.getElementById('toggle-order-btn');

    if (body.classList.contains('hide-order-columns')) {
        // Hiện cột
        body.classList.remove('hide-order-columns');
        btn.innerHTML = '<i class="fas fa-eye"></i> Hiện cột';
        btn.classList.add('active');
    } else {
        // Ẩn cột
        body.classList.add('hide-order-columns');
        btn.innerHTML = '<i class="fas fa-eye-slash"></i> Ẩn cột';
        btn.classList.remove('active');
    }
}

// Thêm các function này vào JavaScript.html
async function changeCustomerStatusInModal(customerId, newStatus, oldStatus) {
    if (newStatus === oldStatus) return;
    const customer = customers.find(c => c.id == customerId);
    if (!customer) return;

    // --- THÊM DÒNG NÀY: Cập nhật màu ngay lập tức khi vừa chọn ---
    updateStatusDropdownColor();
    // ------------------------------------------------------------

    const oldStatusDisplay = oldStatus || 'Chưa xác định';
    const newStatusDisplay = newStatus || 'Chưa xác định';

    // Hiển thị Confirm
    if (!(await showCustomConfirm(`Bạn có chắc muốn chuyển trạng thái từ "${oldStatusDisplay}" sang "${newStatusDisplay}"?`))) {
        // Nếu bấm Hủy (Cancel):
        const statusElement = document.querySelector('.status-dropdown');
        if (statusElement) {
            statusElement.value = oldStatus || ''; // Trả về giá trị cũ
            updateStatusDropdownColor();           // Trả về màu cũ
        }
        return;
    }

    // Nếu chuyển sang "Đã chốt", hiện modal nhập thông tin đơn hàng
    if (newStatus === 'Đã chốt') {
        document.getElementById('order-customer-id').value = customerId;
        document.getElementById('order-closed-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('order-code').value = customer.orderCode || '';
        if (customer.orderValue) {
            document.getElementById('order-value').value = customer.orderValue.toLocaleString('vi-VN');
        } else {
            document.getElementById('order-value').value = '';
        }

        // Ẩn customer detail modal và hiện order info modal
        document.getElementById('customer-detail-modal').classList.remove('show');
        showModal('order-info-modal');
        return;
    }

    // Với các trạng thái khác, cập nhật trực tiếp
    await updateCustomerStatusDirect(customerId, newStatus, oldStatus);
}

async function updateCustomerStatusDirect(customerId, newStatus, oldStatus) {
    const customer = customers.find(c => c.id == customerId);
    if (!customer) return;

    try {
        // Cập nhật UI ngay lập tức
        customer.status = newStatus === 'Chưa xác định' ? '' : newStatus;

        // Cập nhật dropdown trong modal ngay lập tức nếu đang mở
        const statusElement = document.querySelector('#detail-customer-info select');
        if (statusElement) {
            statusElement.value = newStatus;
            // Cập nhật màu sắc dropdown
            if (typeof updateStatusDropdownColor === 'function') updateStatusDropdownColor();
        }

        // Báo thành công ngay (Optimistic)
        showNotification(`Chuyển trạng thái thành công từ "${oldStatus || 'Chưa xác định'}" sang "${newStatus}"!`);

        // QUAN TRỌNG: Thêm _editorName
        const customerData = { ...customer };
        customerData._editorName = currentUser ? currentUser.name : 'Unknown';

        const result = await callGAS(
                'updateCustomer',customerId, customerData);

        if (!result.success) {
            // Rollback nếu lỗi
            customer.status = oldStatus === 'Chưa xác định' ? '' : oldStatus;
            if (statusElement) statusElement.value = oldStatus || '';
            showNotification('Lỗi: ' + result.error, 'error');
            filterCustomers(); // Vẽ lại bảng để hoàn tác
            renderStatusTabs(); // Vẽ lại tabs
        } else {
            // Cập nhật thành công thực sự -> Vẽ lại toàn bộ
            filterCustomers();
            renderStatusTabs();
            // Refresh ngầm để lấy dữ liệu mới nhất
            refreshData(); 
        }

    } catch (error) {
        console.error('Error changing status:', error);
        showNotification('Có lỗi xảy ra khi chuyển trạng thái', 'error');
        // Rollback UI
        customer.status = oldStatus === 'Chưa xác định' ? '' : oldStatus;
        filterCustomers();
        renderStatusTabs();
    }
}

function cancelOrderInfo() {
    document.getElementById('order-info-modal').classList.remove('show');

    // 1. Nếu đang ở trong Modal Chi tiết (Detail Modal)
    if (currentCustomer && document.getElementById('customer-detail-modal')) {
        document.getElementById('customer-detail-modal').classList.add('show');
        const statusElement = document.querySelector('.status-dropdown');
        if (statusElement) {
            statusElement.value = currentCustomer.status || '';
            updateStatusDropdownColor();
        }
    } 
    // 2. Nếu đang ở ngoài Danh sách (List View) - SỬA Ở ĐÂY
    else if (pendingListStatusChange) {
        const { customerId, oldStatus, oldStyle, oldClass } = pendingListStatusChange;

        const badge = document.getElementById(`status-badge-${customerId}`);
        const textSpan = document.getElementById(`status-text-${customerId}`);

        if (badge && textSpan) {
            textSpan.textContent = oldStatus || 'Chưa xác định';
            badge.className = oldClass;
            badge.setAttribute('style', oldStyle); // Phục hồi style cũ

            // Phục hồi giá trị cho select ẩn
            const selectEl = badge.querySelector('select');
            if(selectEl) selectEl.value = oldStatus;
        }
        document.body.style.overflow = 'auto';
        pendingListStatusChange = null; // Reset biến
    } 
    else {
        document.body.style.overflow = 'auto';
    }
}

async function saveOrderInfo() {
    const customerId = document.getElementById('order-customer-id').value;
    const closedDate = document.getElementById('order-closed-date').value;
    const orderCode = document.getElementById('order-code').value.trim();
    const orderValue = parseOrderValue(document.getElementById('order-value').value);

    if (!closedDate || !orderValue) {
        alert('Vui lòng nhập đầy đủ Ngày chốt và Giá trị đơn hàng');
        return;
    }

    const customer = customers.find(c => c.id == customerId);
    if (!customer) return;

    try {
        showButtonLoading('#order-info-modal .btn-success', 'Đang lưu...');

        // UPDATED: Thêm order mới vào orders array
        const newOrder = {
            id: Date.now(),
            closedDate: closedDate,
            orderCode: orderCode,
            orderValue: orderValue,
            createdAt: new Date().toISOString()
        };

        // Lấy orders hiện tại hoặc tạo mới
        const currentOrders = customer.orders || [];
        currentOrders.push(newOrder);

        // Cập nhật customer data
        const updatedCustomerData = {
            ...customer,
            status: 'Đã chốt',
            orders: currentOrders
        };

        // CẬP NHẬT UI NGAY LẬP TỨC
        customer.status = 'Đã chốt';
        customer.orders = currentOrders;

        // Đóng modal và render ngay
        hideButtonLoading('#order-info-modal .btn-success');
        document.getElementById('order-info-modal').classList.remove('show');

        // Báo thành công ngay
        showNotification('Chốt đơn hàng thành công!');

        pendingListStatusChange = null;
        // Gọi API sau
        const result = await callGAS(
                'updateCustomer',parseInt(customerId), updatedCustomerData);

        if (result.success) {
            // Cập nhật currentCustomer và các view khác
            currentCustomer = customer;
            filterCustomers();
            await refreshData();
        } else {
            showNotification('Lỗi: ' + result.error, 'error');
        }

    } catch (error) {
        console.error('Error saving order info:', error);
        hideButtonLoading('#order-info-modal .btn-success');
        showNotification('Có lỗi xảy ra khi lưu thông tin đơn hàng', 'error');
    }
}

// Thêm function này để cập nhật màu dropdown sau khi render
function updateStatusDropdownColor() {
    const dropdown = document.querySelector('.status-dropdown');
    if (dropdown) {
        const selectedOption = dropdown.options[dropdown.selectedIndex];
        const color = selectedOption.getAttribute('data-color') || '#6B7280';
        dropdown.style.color = color;
        dropdown.style.fontWeight = '600';

        // Tạo CSS cho từng option
        const options = dropdown.querySelectorAll('option');
        options.forEach(option => {
            const optionColor = option.getAttribute('data-color');
            if (optionColor) {
                option.style.color = optionColor;
            }
        });
    }
}

// Thêm function này vào JavaScript.html
function showNotification(message, type = 'success') {
    // Remove existing notification
    const existing = document.querySelector('.custom-notification');
    if (existing) existing.remove();

    // Create new notification
    const notification = document.createElement('div');
    notification.className = `custom-notification ${type}`;
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}" 
               style="color: var(--${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'info'});"></i>
            <span>${message}</span>
        </div>
    `;

    document.body.appendChild(notification);

    // Auto remove after 1 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 1000);
}

// Function kiểm tra khách hàng cần chăm sóc trong 7 ngày tới
function needsCareInNext7Days(customer) {
    if (!customer.careHistory || customer.careHistory.length === 0) {
        return false;
    }

    // Lấy lịch sử chăm sóc gần nhất
    const latestCare = customer.careHistory
        .sort((a, b) => new Date(b.contactDate) - new Date(a.contactDate))[0];

    // Kiểm tra nextContactDate
    if (!latestCare.nextContactDate) {
        return false;
    }

    const nextContactDate = new Date(latestCare.nextContactDate);
    const today = new Date();
    const next7Days = new Date();
    next7Days.setDate(today.getDate() + 7);

    // Reset time để so sánh chính xác theo ngày
    today.setHours(0, 0, 0, 0);
    next7Days.setHours(23, 59, 59, 999);
    nextContactDate.setHours(0, 0, 0, 0);

    return nextContactDate >= today && nextContactDate <= next7Days;
}

// Function khởi tạo default date range (đầu tháng - cuối tháng)
function initializeReportDateRange() {
    const today = new Date();

    // Ngày đầu tháng hiện tại
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    // Ngày cuối tháng hiện tại  
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const fromDateInput = document.getElementById('report-from-date');
    const toDateInput = document.getElementById('report-to-date');

    if (fromDateInput && toDateInput) {
        // Fix format để tránh timezone issues
        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        fromDateInput.value = formatDate(firstDay);
        toDateInput.value = formatDate(lastDay);

        // THAY ĐỔI: Set đúng thời gian cho reportFromDate và reportToDate
        reportFromDate = new Date(firstDay);
        reportFromDate.setHours(0, 0, 0, 0);

        reportToDate = new Date(lastDay);
        reportToDate.setHours(23, 59, 59, 999);

        // THÊM EVENT LISTENERS CHO AUTO UPDATE
        setupDateChangeListeners();
    }
}

function applyReportDateFilterAuto() {
    const fromDateInput = document.getElementById('report-from-date');
    const toDateInput = document.getElementById('report-to-date');

    if (fromDateInput.value) {
        reportFromDate = new Date(fromDateInput.value);
        reportFromDate.setHours(0, 0, 0, 0); // THÊM: Set to start of day
    }
    if (toDateInput.value) {
        reportToDate = new Date(toDateInput.value);
        reportToDate.setHours(23, 59, 59, 999); // Set to end of day
    }

    if (reportFromDate && reportToDate && reportFromDate > reportToDate) {
        showNotification('Ngày bắt đầu không thể lớn hơn ngày kết thúc!', 'error');
        return;
    }

    // Re-render all reports
    renderReports();
}

function setupDateChangeListeners() {
    const fromDateInput = document.getElementById('report-from-date');
    const toDateInput = document.getElementById('report-to-date');

    if (fromDateInput && toDateInput) {
        // Debounce function để tránh call quá nhiều
        const debouncedUpdate = debounce(function() {
            applyReportDateFilterAuto();
        }, 300);

        fromDateInput.addEventListener('change', debouncedUpdate);
        toDateInput.addEventListener('change', debouncedUpdate);
    }
}

// Function reset filter
function resetReportDateFilter() {
    // Reset về default values
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const fromDateInput = document.getElementById('report-from-date');
    const toDateInput = document.getElementById('report-to-date');

    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    if (fromDateInput && toDateInput) {
        fromDateInput.value = formatDate(firstDay);
        toDateInput.value = formatDate(lastDay);

        reportFromDate = firstDay;
        reportToDate = lastDay;

        renderReports();
        showNotification('Đã reset bộ lọc ngày!');
    }
}

// Function kiểm tra ngày có trong khoảng filter không
function isDateInRange(dateString, filterType = 'created') {
    if (!dateString || (!reportFromDate && !reportToDate)) return true;

    const checkDate = new Date(dateString);
    checkDate.setHours(12, 0, 0, 0); // THAY ĐỔI: Set to noon để tránh timezone issues

    // So sánh với từ ngày (bắt đầu ngày)
    if (reportFromDate) {
        const fromDate = new Date(reportFromDate);
        fromDate.setHours(0, 0, 0, 0);
        if (checkDate < fromDate) return false;
    }

    // So sánh với đến ngày (cuối ngày)
    if (reportToDate) {
        const toDate = new Date(reportToDate);
        toDate.setHours(23, 59, 59, 999);
        if (checkDate > toDate) return false;
    }

    return true;
}

// Function lọc khách hàng theo date range
function getFilteredCustomers(filterType = 'created') {
    // THÊM DÒNG NÀY: Lấy giá trị nhân viên đang chọn
    const staffFilter = document.getElementById('report-staff-filter')?.value || ''; 

    return customers.filter(customer => {
        // THÊM DÒNG NÀY: Kiểm tra nếu có chọn nhân viên thì lọc, không thì bỏ qua
        if (staffFilter && customer.assignedStaff !== staffFilter) return false;
        if (filterType === 'created') {
            return isDateInRange(customer.createdDate);
        } else if (filterType === 'closed') {
             // ... code cũ ...
            if (!customer.orders || customer.orders.length === 0) {
                return false;
            }
            return customer.orders.some(order => 
                order.closedDate && isDateInRange(order.closedDate)
            );
        }
        return true;
    });
}

// Function áp dụng filter
function applyReportDateFilter() {
    applyReportDateFilterAuto();
    showNotification('Đã áp dụng bộ lọc ngày!');
}

function showCustomConfirm(message, title = 'Xác nhận') {
    return new Promise((resolve) => {
        confirmCallback = resolve;
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        showModal('custom-confirm-modal');
    });
}

function closeCustomConfirm(result) {
    document.getElementById('custom-confirm-modal').classList.remove('show');
    document.body.style.overflow = 'auto';
    if (confirmCallback) {
        confirmCallback(result);
        confirmCallback = null;
    }
}

function showCustomAlert(message, type = 'info') {
    showNotification(message, type);
}

// Show change password modal
function showChangePasswordModal() {
    document.getElementById('change-password-form').reset();
    showModal('change-password-modal');
}

// Save new password
async function saveNewPassword() {
    const newPassword = document.getElementById('new-password').value.trim();
    const confirmPassword = document.getElementById('confirm-password').value.trim();

    if (!newPassword || !confirmPassword) {
        showNotification('Vui lòng nhập đầy đủ thông tin', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showNotification('Mật khẩu nhập lại không khớp!', 'error');
        return;
    }

    if (newPassword.length < 4) {
        showNotification('Mật khẩu phải có ít nhất 4 ký tự', 'error');
        return;
    }

    if (!currentUser || !currentUser.username) {
        showNotification('Không tìm thấy thông tin tài khoản', 'error');
        return;
    }

    try {
        showButtonLoading('#change-password-modal .btn-success', 'Đang lưu...');

        const result = await callGAS(
                'changePassword',currentUser.username, newPassword);

        if (result.success) {
            hideButtonLoading('#change-password-modal .btn-success');
            showNotification('Đổi mật khẩu thành công!');
            closeModal();

            // Cập nhật password trong currentUser (không cần reload)
            currentUser.password = newPassword;
        } else {
            hideButtonLoading('#change-password-modal .btn-success');
            showNotification('Lỗi: ' + result.error, 'error');
        }

    } catch (error) {
        console.error('Lỗi đổi mật khẩu:', error);
        hideButtonLoading('#change-password-modal .btn-success');
        showNotification('Có lỗi xảy ra khi đổi mật khẩu', 'error');
    }
}

function renderStatusTabs() {
    const container = document.getElementById('status-tabs-container');
    if (!container) return;

    // 1. LẤY GIÁ TRỊ TRỰC TIẾP TỪ GIAO DIỆN (DOM) ĐỂ ĐẢM BẢO CHÍNH XÁC
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
    const staffFilter = document.getElementById('staff-filter')?.value || '';
    const dateFilterVal = document.getElementById('date-filter')?.value || 'all'; // Quan trọng
    const careNeededVal = document.getElementById('care-needed-checkbox')?.checked || false;

    // 2. Đếm số lượng dựa trên bộ lọc
    const counts = { 'total': 0 };

    customers.forEach(customer => {
        // Kiểm tra xem khách hàng có khớp với các bộ lọc NGOẠI TRỪ TRẠNG THÁI hay không
        const matchesSearch = !searchTerm || [
            `KH${customer.id}`,
            customer.name,
            customer.phone,
            customer.source,
            customer.status,
            customer.assignedStaff,
            customer.notes,
            customer.address,
            customer.orderCode,
            customer.email
        ].some(val => val && String(val).toLowerCase().includes(searchTerm));

        const matchesStaff = !staffFilter || customer.assignedStaff === staffFilter;

        // Gọi hàm checkDateFilter có sẵn với giá trị ngày lấy từ giao diện
        const matchesDate = checkDateFilter(customer.createdDate, dateFilterVal);

        const matchesCareNeeded = !careNeededVal || needsCareInNext7Days(customer);

        // NẾU KHỚP TẤT CẢ (TRỪ STATUS) THÌ MỚI ĐẾM
        if (matchesSearch && matchesStaff && matchesDate && matchesCareNeeded) {
            const s = customer.status || 'Chưa xác định';
            counts[s] = (counts[s] || 0) + 1;
            counts['total']++;
        }
    });

    // 3. Render giao diện (Giữ nguyên style cũ)
    const defaultColor = '#4A6FDC'; 
    const inactiveTextColor = '#555555';
    const bgOpacity = 0.1;

    // Tab Tất cả
    const allActive = currentStatusTab === '';
    const allStyle = allActive 
        ? `background: ${defaultColor}; color: white; z-index: 10;` 
        : `background: ${hexToRgba(defaultColor, bgOpacity)}; color: ${inactiveTextColor};`;

    let html = `
        <div class="status-pipeline-tab ${allActive ? 'active' : ''}" 
             onclick="switchStatusTab('')"
             style="${allStyle}">
             <i class="fas fa-list"></i> Tất cả
             <span class="status-count-badge" style="${allActive ? 'background: rgba(255,255,255,0.3); color: white;' : 'background: rgba(0,0,0,0.1);'}">
                ${counts['total']}
             </span>
        </div>
    `;

    // Tab Chưa xác định (chỉ hiện nếu có > 0)
    if (counts['Chưa xác định'] > 0) {
        const undefColor = '#6B7280';
        const undefActive = currentStatusTab === 'Chưa xác định';
        const undefStyle = undefActive
            ? `background: ${undefColor}; color: white; z-index: 10;` 
            : `background: ${hexToRgba(undefColor, bgOpacity)}; color: ${inactiveTextColor};`;

         html += `
            <div class="status-pipeline-tab ${undefActive ? 'active' : ''}" 
                 onclick="switchStatusTab('Chưa xác định')"
                 style="${undefStyle}">
                 <i class="fas fa-question-circle"></i> Chưa xác định
                 <span class="status-count-badge" style="${undefActive ? 'background: rgba(255,255,255,0.3); color: white;' : 'background: rgba(0,0,0,0.1);'}">
                    ${counts['Chưa xác định'] || 0}
                 </span>
            </div>
        `;
    }

    // Các Tab Trạng thái
    statuses.forEach(status => {
        const isActive = currentStatusTab === status.name;
        const count = counts[status.name] || 0;
        const color = status.color || '#333';

        const style = isActive 
            ? `background: ${color}; color: white; z-index: 10;` 
            : `background: ${hexToRgba(color, bgOpacity)}; color: ${inactiveTextColor};`;

        html += `
            <div class="status-pipeline-tab ${isActive ? 'active' : ''}" 
                 onclick="switchStatusTab('${status.name}')"
                 style="${style}">
                 ${status.name}
                 <span class="status-count-badge" style="${isActive ? 'background: rgba(255,255,255,0.3); color: white;' : 'background: rgba(0,0,0,0.1);'}">
                    ${count}
                 </span>
            </div>
        `;
    });

    container.innerHTML = html;
}

function switchStatusTab(statusName) {
    currentStatusTab = statusName;

    // Re-render lại tabs để cập nhật trạng thái active
    renderStatusTabs();

    // Reset về trang 1
    currentPage = 1;

    // Filter và render lại bảng
    filterCustomers();
}

function setupCustomDateFilter() {
    const dateSelect = document.getElementById('date-filter');
    const customInput = document.getElementById('custom-date-picker');

    // 1. Khởi tạo Flatpickr
    const fp = flatpickr(customInput, {
        mode: "range",
        dateFormat: "d/m/Y",
        locale: { rangeSeparator: " - " },
        onClose: function(selectedDates) {
            if (selectedDates.length === 2) {
                customStartDate = selectedDates[0];
                customStartDate.setHours(0,0,0,0); // Đầu ngày

                customEndDate = selectedDates[1];
                customEndDate.setHours(23,59,59,999); // Cuối ngày

                dateFilter = 'custom';
                filterCustomers();
            }
        }
    });

    // 2. Xử lý khi chọn dropdown
    dateSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
            this.style.display = 'none';      // Ẩn dropdown
            customInput.style.display = 'block'; // Hiện ô chọn ngày
            fp.open(); // Mở lịch ngay
        } else {
            dateFilter = this.value;
            filterCustomers();
        }
    });

    // 3. Xử lý khi click lại vào ô ngày để muốn quay về dropdown (Optional UX)
    // Bạn có thể thêm nút "X" nếu muốn, nhưng đơn giản nhất là reload hoặc thêm logic reset sau.
}

function resetCustomerFilters() {
    // 1. Reset các ô input và select về mặc định
    document.getElementById('search-input').value = '';
    const staffFilter = document.getElementById('staff-filter');
    if (staffFilter) staffFilter.value = '';

    // 2. Reset bộ lọc ngày về "Tháng này"
    const dateSelect = document.getElementById('date-filter');
    const customInput = document.getElementById('custom-date-picker');

    if (dateSelect) {
        dateSelect.value = 'thisMonth';     // Giá trị mặc định
        dateSelect.style.display = 'block'; // Hiện lại dropdown
    }
    if (customInput) {
        customInput.style.display = 'none'; // Ẩn ô nhập ngày tự chọn
        customInput.value = '';
    }

    // 3. Reset checkbox & Tabs
    const careCheckbox = document.getElementById('care-needed-checkbox');
    if (careCheckbox) careCheckbox.checked = false;

    currentStatusTab = ''; // Về tab "Tất cả"

    // 4. Cập nhật biến toàn cục & Render lại
    dateFilter = 'thisMonth';
    careNeededFilter = false;

    renderStatusTabs(); // Cập nhật thanh trạng thái (số liệu về mặc định)
    filterCustomers();  // Tải lại bảng dữ liệu

    // 5. HIỂN THỊ THÔNG BÁO (QUAN TRỌNG)
    showNotification('Đã reset bộ lọc thành công!', 'success');
}

// Hàm vẽ bảng lịch sử
function renderHistoryTable() {
    const tbody = document.getElementById('history-table-body');
    const logs = historyFilteredLogs;

    // Cập nhật UI phân trang ngay cả khi không có dữ liệu
    updateHistoryPaginationUI(historyCurrentPage, logs.length);

    if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Không có dữ liệu lịch sử.</td></tr>';
        return;
    }

    const totalItems = logs.length;
    const totalPages = Math.ceil(totalItems / historyItemsPerPage);
    if (historyCurrentPage < 1) historyCurrentPage = 1;
    if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;

    // Tính toán lại range hiển thị sau khi chỉnh page
    updateHistoryPaginationUI(historyCurrentPage, totalItems);

    const startIndex = (historyCurrentPage - 1) * historyItemsPerPage;
    const endIndex = Math.min(startIndex + historyItemsPerPage, totalItems);
    const pageLogs = logs.slice(startIndex, endIndex);

    const html = pageLogs.map(log => {
        let badgeClass = 'secondary';
        if (log.a === 'Sửa') badgeClass = 'warning';
        if (log.a === 'Thêm') badgeClass = 'success';
        if (log.a === 'Xóa') badgeClass = 'danger';

        let categoryColor = '#666';
        let categoryText = log.c || 'Khác';
        if (categoryText === 'Đơn hàng') categoryColor = '#059669';
        if (categoryText === 'Lịch sử chăm sóc') categoryColor = '#3B82F6';
        if (categoryText === 'Khách hàng') categoryColor = '#F59E0B';

        // XỬ LÝ HIỂN THỊ TÊN KHÁCH HÀNG (Loại bỏ ID KH... nếu có tên)
        let displayObj = log.o || '';
        // Nếu chuỗi có dạng "KH12 - Tên", cắt bỏ phần "KH12 - "
        if (displayObj.includes(' - ')) {
            const parts = displayObj.split(' - ');
            if (parts.length > 1) {
                displayObj = parts.slice(1).join(' - '); // Lấy phần tên
            }
        }

        return `
            <tr>
                <td style="font-weight: bold; color: #666;">${log.t}</td>
                <td>${log.u}</td>
                <td><span class="badge bg-${badgeClass}" style="padding: 3px 8px; border-radius: 4px; color: white; background-color: var(--${badgeClass}); font-size: 11px;">${log.a}</span></td>
                <td style="font-weight: 600; color: ${categoryColor};">${categoryText}</td> 
                <td style="font-weight: 500;">${displayObj}</td>
                <td style="white-space: pre-wrap; font-size: 13px;">${log.d}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = html;
}

// 4. Hàm cập nhật UI nút bấm (Hàm mới - copy thêm vào)
function updateHistoryPaginationUI(current, total) {
    const totalPages = Math.ceil(total / historyItemsPerPage);
    const infoSpan = document.getElementById('hist-page-info');
    const showingSpan = document.getElementById('hist-showing-info'); // Span mới
    const prevBtn = document.getElementById('hist-prev');
    const nextBtn = document.getElementById('hist-next');

    // Cập nhật số trang 1/10
    if (infoSpan) infoSpan.textContent = total === 0 ? "1/1" : `${current}/${totalPages}`;

    // Cập nhật dòng "Hiển thị X-Y trong tổng Z"
    if (showingSpan) {
        if (total === 0) {
            showingSpan.textContent = "0-0 trong tổng 0";
        } else {
            const start = (current - 1) * historyItemsPerPage + 1;
            const end = Math.min(current * historyItemsPerPage, total);
            showingSpan.textContent = `Hiển thị ${start}-${end} trong tổng ${total}`;
        }
    }

    if (prevBtn) prevBtn.disabled = current <= 1;
    if (nextBtn) nextBtn.disabled = current >= totalPages || total === 0;
}

// 5. Hàm chuyển trang (Hàm mới - export ra window để nút bấm gọi được)
function changeHistoryPage(direction) {
    historyCurrentPage += direction;
    renderHistoryTable();
}

// Hàm lọc tìm kiếm trong bảng lịch sử
function filterHistoryTable() {
    const term = document.getElementById('history-search-input').value.toLowerCase();
    const actionFilter = document.getElementById('history-action-filter').value;     // Lấy giá trị filter hành động
    const categoryFilter = document.getElementById('history-category-filter').value; // Lấy giá trị filter phân loại

    // Lọc từ danh sách gốc của ngày hiện tại (currentHistoryLogs)
    historyFilteredLogs = currentHistoryLogs.filter(log => {
        // 1. Lọc theo từ khóa tìm kiếm
        const matchesSearch = !term || 
            (log.u && log.u.toLowerCase().includes(term)) || 
            (log.o && log.o.toLowerCase().includes(term)) || 
            (log.d && log.d.toLowerCase().includes(term));

        // 2. Lọc theo Hành động (Thêm/Sửa/Xóa) - log.a
        const matchesAction = !actionFilter || log.a === actionFilter;

        // 3. Lọc theo Phân loại - log.c
        const matchesCategory = !categoryFilter || log.c === categoryFilter;

        return matchesSearch && matchesAction && matchesCategory;
    });

    historyCurrentPage = 1; // Reset về trang 1 khi filter
    renderHistoryTable();
}

function filterRemindersUI() {
    remindCurrentPage = 1;
    renderReminders();
}

function changeRemindPage(direction) {
    // Logic chặn trang sẽ nằm trong renderReminders để lấy số liệu thực tế
    remindCurrentPage += direction;
    renderReminders();
}

function renderReminders() {
    const container = document.getElementById('reminder-list-container');

    // 1. LẤY GIÁ TRỊ BỘ LỌC
    const filterDate = document.getElementById('remind-filter-date').value;
    const filterStatus = currentRemindStatus; // Biến global
    const searchTerm = document.getElementById('remind-search-input').value.toLowerCase();

    // 2. LỌC DỮ LIỆU CƠ BẢN (Date & Search)
    let baseList = window.reminders.filter(r => {
        const matchDate = !filterDate || r.dueDate === filterDate;

        const content = (r.content || '').toLowerCase();
        const createdBy = (r.createdBy || '').toLowerCase();
        const assignTo = (Array.isArray(r.assignTo) ? r.assignTo.join(' ') : (r.assignTo || '')).toLowerCase();

        const matchSearch = !searchTerm || 
                            content.includes(searchTerm) || 
                            createdBy.includes(searchTerm) || 
                            assignTo.includes(searchTerm);

        return matchDate && matchSearch;
    });

    // 3. TÍNH TOÁN VÀ CẬP NHẬT COUNT
    const countPending = baseList.filter(r => !r.isDone).length;
    const countDone = baseList.filter(r => r.isDone).length;

    const countPendingEl = document.getElementById('count-pending');
    if (countPendingEl) countPendingEl.textContent = countPending;

    const countDoneEl = document.getElementById('count-done');
    if (countDoneEl) countDoneEl.textContent = countDone;

    // 4. LỌC THEO TAB HIỆN TẠI
    let filteredList = baseList.filter(r => {
        if (filterStatus === 'pending') return !r.isDone;
        if (filterStatus === 'done') return r.isDone;
        return true;
    });

    // 5. SẮP XẾP
    filteredList.sort((a, b) => {
        if (filterStatus === 'done') {
             return new Date(b.dueDate) - new Date(a.dueDate);
        }
        if (a.priority === 'High' && b.priority !== 'High') return -1;
        if (a.priority !== 'High' && b.priority === 'High') return 1;
        return new Date(a.dueDate) - new Date(b.dueDate);
    });

    // 6. PHÂN TRANG
    const totalItems = filteredList.length;
    const totalPages = Math.ceil(totalItems / remindItemsPerPage) || 1;

    if (remindCurrentPage < 1) remindCurrentPage = 1;
    if (remindCurrentPage > totalPages) remindCurrentPage = totalPages;

    const startIndex = (remindCurrentPage - 1) * remindItemsPerPage;
    const endIndex = Math.min(startIndex + remindItemsPerPage, totalItems);
    const pageData = filteredList.slice(startIndex, endIndex);

    // Cập nhật UI phân trang
    document.getElementById('remind-page-info').textContent = `${remindCurrentPage}/${totalPages}`;
    document.getElementById('remind-showing-info').textContent = totalItems > 0 ?
        `${startIndex + 1}-${endIndex} / ${totalItems}` : '0-0 / 0';

    // 7. RENDER HTML
    if (totalItems === 0) {
        container.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 20px;">Không tìm thấy công việc nào</td></tr>';
        return;
    }

    const html = pageData.map(r => {
        let assignText = r.assignTo === 'ALL' ? 'Tất cả' : (Array.isArray(r.assignTo) ? r.assignTo.join(', ') : r.assignTo);
        if (assignText.length > 20) assignText = assignText.substring(0, 20) + '...';

        const priorityBadge = r.priority === 'High' 
            ? '<span class="badge bg-danger" style="color:white; padding:2px 6px; border-radius:4px; font-size:11px;">Gấp</span>' 
            : '<span class="badge bg-secondary" style="color:white; background:#64748B; padding:2px 6px; border-radius:4px; font-size:11px;">Thường</span>';

        const statusText = r.isDone 
            ? '<span style="color:#10B981; font-weight:600;"><i class="fas fa-check-circle"></i> Đã xong</span>' 
            : '<span style="color:#F59E0B; font-weight:600;"><i class="fas fa-clock"></i> Đang chờ</span>';

        // --- SỬA Ở ĐÂY: Thêm điều kiện currentUser.isManager ---
        const canEdit = currentUser.isManager || r.createdBy === currentUser.name;
        // ------------------------------------------------------

        return `
        <tr style="${r.isDone ? 'background:#f8f9fa; color:#999;' : ''}">
            <td>${formatDate(r.dueDate)}</td>
            <td class="text-center">${priorityBadge}</td>
            <td style="max-width: 300px; white-space: normal;">
                <div style="font-weight:500;">${r.content}</div>
            </td>
            <td>${r.createdBy}</td>
            <td title="${Array.isArray(r.assignTo) ? r.assignTo.join(', ') : r.assignTo}">${assignText}</td>
            <td>${statusText}</td>
            <td>
                <div class="d-flex gap-2 justify-content-center">
                    <button class="btn btn-sm btn-no-bg ${r.isDone ? 'btn-secondary' : 'btn-success'}" 
                            onclick="toggleReminderStatus(${r.id}, '${r.dueDate}', ${!r.isDone})"
                            title="${r.isDone ? 'Đánh dấu chưa xong' : 'Hoàn thành'}">
                        <i class="fas ${r.isDone ? 'fa-undo' : 'fa-check'}"></i>
                    </button>
                    ${canEdit ? `
                    <button class="btn btn-sm btn-secondary btn-no-bg" onclick="editReminder(${r.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger btn-no-bg" onclick="deleteReminder(${r.id}, '${r.dueDate}')">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                </div>
            </td>
        </tr>
        `;
    }).join('');

    container.innerHTML = html;
}

function showAddReminderModal() {
    document.getElementById('reminder-form').reset();
    document.getElementById('remind-id').value = '';
    document.getElementById('remind-date').value = new Date().toISOString().split('T')[0];

    // Render Staff Checkbox
    const container = document.getElementById('staff-checklist-container');
    container.innerHTML = staff.map(s => `
        <label class="staff-check-item">
            <input type="checkbox" name="selectedStaff" value="${s.name}"> ${s.name}
        </label>
    `).join('');

    // Mặc định chọn "Tất cả"
    document.querySelector('input[name="assignType"][value="all"]').checked = true;
    toggleStaffSelect();

    showModal('reminder-modal');
}

function toggleStaffSelect() {
    const isSpecific = document.querySelector('input[name="assignType"][value="specific"]').checked;
    document.getElementById('staff-checklist-container').style.display = isSpecific ? 'block' : 'none';
}

function editReminder(id) {
    const item = window.reminders.find(r => r.id == id);
    if(!item) return;

    document.getElementById('remind-id').value = item.id;
    document.getElementById('remind-content').value = item.content;
    document.getElementById('remind-date').value = formatDateForInput(item.dueDate);
    document.getElementById('remind-priority').value = item.priority;

    // Xử lý radio và checklist
    const container = document.getElementById('staff-checklist-container');
    container.innerHTML = staff.map(s => `
        <label class="staff-check-item">
            <input type="checkbox" name="selectedStaff" value="${s.name}"> ${s.name}
        </label>
    `).join('');

    if (item.assignTo === 'ALL') {
        document.querySelector('input[name="assignType"][value="all"]').checked = true;
    } else {
        document.querySelector('input[name="assignType"][value="specific"]').checked = true;
        // Check các user đã chọn
        const checkboxes = document.querySelectorAll('input[name="selectedStaff"]');
        checkboxes.forEach(cb => {
            if (item.assignTo.includes(cb.value)) cb.checked = true;
        });
    }
    toggleStaffSelect();
    showModal('reminder-modal');
}

async function saveReminderToSheet() {
    const id = document.getElementById('remind-id').value;
    const content = document.getElementById('remind-content').value.trim();
    const date = document.getElementById('remind-date').value;
    const priority = document.getElementById('remind-priority').value;
    const assignType = document.querySelector('input[name="assignType"]:checked').value;

    let assignTo = 'ALL';
    if (assignType === 'specific') {
        const checked = document.querySelectorAll('input[name="selectedStaff"]:checked');
        assignTo = Array.from(checked).map(cb => cb.value);
        if (assignTo.length === 0) return alert('Vui lòng chọn ít nhất 1 nhân viên!');
    }

    if (!content || !date) return alert('Vui lòng nhập đủ thông tin!');

    const data = {
        id: id || null,
        content: content,
        dueDate: date,
        priority: priority,
        assignTo: assignTo,
        createdBy: currentUser.name,
        isDone: false
    };

    showButtonLoading('#reminder-modal .btn-success', 'Đang lưu...');
    try {
        await callGAS('saveReminder',data);

        closeModal();
        showNotification('Đã lưu công việc!');
        await refreshData(); // Load lại để lấy ID mới và cập nhật list
        // Chuyển sang tab Nhắc việc nếu đang ở tab khác
        if (!document.querySelector('.nav-tab[data-tab="reminders"]').classList.contains('active')) {
             switchTab('reminders');
        } else {
             renderReminders();
        }

    } catch(e) {
        showNotification('Lỗi: ' + e.message, 'error');
    } finally {
        hideButtonLoading('#reminder-modal .btn-success');
    }
}

async function toggleReminderStatus(id, date, newStatus) {
    // 1. Hỏi xác nhận Yes/No
    const actionName = newStatus ? "Đã xong" : "Chưa xong";
    if(!(await showCustomConfirm(`Bạn có chắc chắn muốn đánh dấu công việc này là "${actionName}"?`))) return;

    // 2. Cập nhật giao diện ngay lập tức (Optimistic Update)
    const item = window.reminders.find(r => r.id == id);
    if(item) {
        item.isDone = newStatus;

        // Vẽ lại bảng dữ liệu
        renderReminders(); 

        // Cập nhật số đếm trên Tab (chấm đỏ)
        if (typeof updateReminderTabBadge === 'function') {
            updateReminderTabBadge();
        }
    }

    // 3. Gửi xuống Server lưu lại
    await callGAS('updateReminderStatus',id, date, newStatus, false);
}

async function deleteReminder(id, date) {
    // 1. Hỏi xác nhận Yes/No
    if(!(await showCustomConfirm("Bạn có chắc chắn muốn xóa vĩnh viễn công việc này?"))) return;

    // Lưu lại danh sách cũ để phòng trường hợp lỗi thì khôi phục
    const originalList = [...window.reminders];

    // 2. Xóa trên giao diện ngay lập tức
    window.reminders = window.reminders.filter(r => r.id != id);
    renderReminders();

    // Cập nhật số đếm trên Tab
    if (typeof updateReminderTabBadge === 'function') {
        updateReminderTabBadge();
    }

    // 3. Gửi lệnh xóa xuống Server
    try {
        await callGAS(
                'updateReminderStatus', id, date, false, true); // true = tham số isDelete
        showNotification("Đã xóa công việc!");
    } catch(e) {
        // Nếu lỗi thì hoàn tác lại dữ liệu cũ
        window.reminders = originalList;
        renderReminders();
        updateReminderTabBadge();
        showNotification("Lỗi xóa: " + e.message, 'error');
    }
}

// Hàm cập nhật số lượng trên Tab
function updateReminderTabBadge() {
    // Đếm số việc chưa xong (isDone == false)
    const pendingCount = window.reminders ? window.reminders.filter(r => !r.isDone).length : 0;
    const badge = document.getElementById('reminder-tab-badge');

    if (badge) {
        badge.textContent = pendingCount > 99 ? '99+' : pendingCount;
        // Chỉ hiện khi có việc cần làm (> 0)
        badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';

        // Hiệu ứng rung nhẹ khi có việc mới (nếu muốn)
        if (pendingCount > 0) {
            badge.style.animation = 'none';
            badge.offsetHeight; /* trigger reflow */
            badge.style.animation = 'popIn 0.3s ease';
        }
    }
}

function switchRemindFilter(status) {
    currentRemindStatus = status;

    // Update UI active class
    document.querySelectorAll('.remind-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${status}`).classList.add('active');

    // Reset page và render lại
    remindCurrentPage = 1;
    renderReminders();
}

async function handleTableStatusChange(selectEl, customerId, currentStatus) {
    const newStatus = selectEl.value;
    if (newStatus === currentStatus) return;

    const badge = document.getElementById(`status-badge-${customerId}`);
    const textSpan = document.getElementById(`status-text-${customerId}`);

    // Lưu style cũ
    const oldStyle = badge.getAttribute('style');
    const oldClass = badge.className;

    // UI Update ngay lập tức
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const newColor = selectedOption.getAttribute('data-color') || '#6B7280';

    textSpan.textContent = newStatus || 'Chưa xác định';
    badge.className = 'status-badge'; 
    badge.style.background = hexToRgba(newColor, 0.15);
    badge.style.color = '#334155';
    badge.style.border = `1px solid ${hexToRgba(newColor, 0.2)}`;
    badge.style.position = 'relative';
    badge.style.cursor = 'pointer';
    badge.style.paddingRight = '20px';
    badge.style.display = 'inline-flex';
    badge.style.alignItems = 'center';
    badge.style.justifyContent = 'center';
    badge.style.minWidth = '125px';

    const oldStatusDisplay = currentStatus || 'Chưa xác định';
    const newStatusDisplay = newStatus || 'Chưa xác định';

    if (!(await showCustomConfirm(`Bạn có chắc muốn chuyển trạng thái từ "${oldStatusDisplay}" sang "${newStatusDisplay}"?`))) {
        // Revert nếu Cancel Confirm
        textSpan.textContent = oldStatusDisplay;
        badge.className = oldClass;
        badge.setAttribute('style', oldStyle);
        selectEl.value = currentStatus || '';
        return;
    }

    // Trường hợp: "Đã chốt" -> Hiện Modal Đơn hàng
    if (newStatus === 'Đã chốt') {
        const customer = customers.find(c => c.id == customerId);
        if (customer) {
            // --- SỬA Ở ĐÂY: Lưu trạng thái để phục hồi nếu hủy modal ---
            pendingListStatusChange = {
                customerId: customerId,
                oldStatus: currentStatus || '',
                oldStyle: oldStyle,
                oldClass: oldClass
            };
            // --------------------------------------------------------

            document.getElementById('order-customer-id').value = customerId;
            document.getElementById('order-closed-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('order-code').value = customer.orderCode || '';
            document.getElementById('order-value').value = customer.orderValue ? customer.orderValue.toLocaleString('vi-VN') : '';
            showModal('order-info-modal');
        }
        return;
    }

    // Trường hợp thường
    await updateCustomerStatusDirect(customerId, newStatus, currentStatus);
}

// Export functions to global scope for onclick handlers
window.showAddCustomerModal = showAddCustomerModal;
window.editCustomer = editCustomer;
window.saveCustomer = saveCustomer;
window.deleteCustomer = deleteCustomer;
window.viewCustomerDetails = viewCustomerDetails;
window.addCareHistory = addCareHistory;
window.saveCareHistory = saveCareHistory;
window.showSettingsModal = showSettingsModal;
window.addStaff = addStaff;
window.addStatus = addStatus;
window.closeModal = closeModal;
window.cancelCareModal = cancelCareModal;
window.editStaff = editStaff;
window.saveStaff = saveStaff;
window.deleteStaffConfirm = deleteStaffConfirm;
window.editStatus = editStatus;
window.saveStatus = saveStatus;
window.deleteStatusConfirm = deleteStatusConfirm;
window.sortTable = sortTable;
window.changePage = changePage;
window.showNotification = showNotification;
// Export functions
window.performLogin = performLogin;
window.performLogout = performLogout;

window.refreshChartsAfterStatusChange = refreshChartsAfterStatusChange;
window.getStatusColor = getStatusColor;
window.getAllStatusColors = getAllStatusColors;
window.hexToRgba = hexToRgba;
window.changeCustomerStatus = changeCustomerStatus;

// EXPORT CÁC FUNCTIONS MỚI - Thêm vào cuối file
window.addSource = addSource;
window.editSource = editSource;
window.saveSource = saveSource;
window.deleteSourceConfirm = deleteSourceConfirm;
window.toggleClosedFields = toggleClosedFields;
window.formatOrderValue = formatOrderValue;
window.toggleOrderColumns = toggleOrderColumns;

// Export functions
window.changeCustomerStatusInModal = changeCustomerStatusInModal;
window.cancelOrderInfo = cancelOrderInfo;
window.saveOrderInfo = saveOrderInfo;
window.updateStatusDropdownColor = updateStatusDropdownColor;

window.renderTopCustomersByRevenue = renderTopCustomersByRevenue;
window.renderSourceChart = renderSourceChart;
window.renderSourceRevenueChart = renderSourceRevenueChart;
window.renderStaffRevenueChart = renderStaffRevenueChart;
window.moveStatus = moveStatus;

// Export functions mới
window.applyReportDateFilter = applyReportDateFilter;
window.resetReportDateFilter = resetReportDateFilter;
window.initializeReportDateRange = initializeReportDateRange;
window.setupDateChangeListeners = setupDateChangeListeners;
window.applyReportDateFilterAuto = applyReportDateFilterAuto;
window.showCustomConfirm = showCustomConfirm;
window.closeCustomConfirm = closeCustomConfirm;
window.showCustomAlert = showCustomAlert;

// Export functions
window.showAddOrderModal = showAddOrderModal;
window.saveNewOrder = saveNewOrder;
window.editOrderInDetail = editOrderInDetail;
window.deleteOrderInDetail = deleteOrderInDetail;
window.editOrderInForm = editOrderInForm;
window.deleteOrderInForm = deleteOrderInForm;
window.saveEditOrder = saveEditOrder;
window.showAddOrderInFormModal = showAddOrderInFormModal;
window.cancelEditOrder = cancelEditOrder;

window.populateManagerDropdown = populateManagerDropdown;

window.showChangePasswordModal = showChangePasswordModal;

window.resetCustomerFilters = resetCustomerFilters;
window.saveNewPassword = saveNewPassword;
window.changeHistoryPage = changeHistoryPage;
window.switchStatusTab = switchStatusTab;

window.showAddReminderModal = showAddReminderModal;
window.saveReminderToSheet = saveReminderToSheet;
window.toggleReminderStatus = toggleReminderStatus;
window.deleteReminder = deleteReminder;
window.filterRemindersUI = filterRemindersUI;
window.toggleStaffSelect = toggleStaffSelect;
window.editReminder = editReminder;
window.changeRemindPage = changeRemindPage;
window.updateReminderTabBadge = updateReminderTabBadge;
window.switchRemindFilter = switchRemindFilter;
