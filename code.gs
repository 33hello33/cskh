// Code.gs - Backend Google Apps Script
/**
 * Tạo webapp URL
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Quản lý chăm sóc khách hàng')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setFaviconUrl("https://www.vietnamobile.com.vn/templates/mobile/img/user-1.png");
}

/**
 * Include file HTML/CSS/JS
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Load TẤT CẢ dữ liệu cần thiết trong 1 lần gọi duy nhất
 */
function getAllData(sessionId) {
  try {
    var currentUser = getCurrentUser(sessionId);
    if (!currentUser) return { success: false, error: 'Chưa đăng nhập' };
    
    var spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    var range = {
      ranges: [
        'Nhân viên!A1:F', 'Trạng thái!A1:C', 'Nguồn khách!A1:C', 'Khách hàng!A1:K', 'Lịch sử!A1:B', 
        'Nhắc việc!A1:B' // <--- THÊM RANGE MỚI
      ]
    };
    var response = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, range);
    var valueRanges = response.valueRanges;
    
    var staff = parseStaffData(valueRanges[0].values);
    var statuses = parseStatusesData(valueRanges[1].values);
    var sources = parseSourcesData(valueRanges[2].values);
    var customers = parseCustomersData(valueRanges[3].values, currentUser, staff);
    var history = parseHistoryData(valueRanges[4].values);
    var reminders = parseRemindersData(valueRanges[5].values, currentUser); 

    return {
      success: true, user: currentUser, staff: staff, statuses: statuses, sources: sources, 
      customers: customers, history: history, reminders: reminders
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Parse Staff data
 */
function parseStaffData(data) {
  if (!data || data.length <= 1) return [];
  
  var staff = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    staff.push({
      id: row[0],
      name: row[1],
      position: row[2],
      username: row[3],
      password: row[4],
      manager: row[5] || ''
    });
  }
  return staff;
}

/**
 * Parse Statuses data
 */
function parseStatusesData(data) {
  if (!data || data.length <= 1) return [];
  
  var statuses = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    statuses.push({
      id: row[0],
      name: row[1],
      color: row[2]
    });
  }
  return statuses;
}

/**
 * Parse Sources data
 */
function parseSourcesData(data) {
  if (!data || data.length <= 1) return [];
  
  var sources = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    sources.push({
      id: row[0],
      name: row[1],
      description: row[2] || ''
    });
  }
  return sources;
}

/**
 * Parse Customers data với phân quyền
 */
function parseCustomersData(data, currentUser, staff) {
  if (!data || data.length <= 1) return [];
  
  var allCustomers = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var careHistory = [];
    var orders = [];
    
    try {
      careHistory = row[10] ? JSON.parse(row[10]) : [];
    } catch (e) {
      careHistory = [];
    }
    
    try {
      orders = row[9] ? JSON.parse(row[9]) : [];
    } catch (e) {
      orders = [];
    }
    
    var totalOrderValue = 0;
    var latestOrder = null;
    
    if (orders.length > 0) {
      totalOrderValue = orders.reduce(function(sum, order) {
        return sum + (order.orderValue || 0);
      }, 0);
      latestOrder = orders.sort(function(a, b) {
        return new Date(b.closedDate) - new Date(a.closedDate);
      })[0];
    }
    
    allCustomers.push({
      id: row[0],
      createdDate: row[1] ? formatDateToString(row[1]) : '',
      name: row[2],
      phone: row[3],
      notes: row[4],
      address: row[5],
      status: row[6],
      assignedStaff: row[7],
      source: row[8],
      orders: orders,
      closedDate: latestOrder ? formatDateToString(latestOrder.closedDate) : '',
      orderCode: latestOrder ? latestOrder.orderCode : '',
      orderValue: totalOrderValue,
      careHistory: careHistory
    });
  }
  
  // Áp dụng phân quyền
  if (currentUser.isManager) {
    return allCustomers;
  }
  
  return allCustomers.filter(function(customer) {
    if (customer.assignedStaff === currentUser.name) {
      return true;
    }
    
    // ↓ THÊM: Nếu user là manager của assigned staff
    var assignedStaffObj = staff.find(function(s) {
      return s.name === customer.assignedStaff;
    });
    if (assignedStaffObj && assignedStaffObj.manager === currentUser.name) {
      return true;
    }
    
    if (customer.careHistory && customer.careHistory.length > 0) {
      return customer.careHistory.some(function(care) {
        if (care.staff === currentUser.name) return true;
        
        // ↓ THÊM: Hoặc staff trong care history có manager là user hiện tại
        var careStaffObj = staff.find(function(s) {
          return s.name === care.staff;
        });
        return careStaffObj && careStaffObj.manager === currentUser.name;
      });
    }
    
    return false;
  });
}

/**
 * Đăng nhập
 */
function login(username, password) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Nhân viên');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[3] === username && row[4] === password) {
        const user = {
          id: row[0],
          name: row[1],
          position: row[2],
          username: row[3],
          isManager: row[2] === 'Admin'
        };
        
        // Tạo session ID unique cho mỗi lần đăng nhập
        const sessionId = Utilities.getUuid();
        const sessionData = {
          user: user,
          timestamp: new Date().getTime(),
          sessionId: sessionId
        };
        
        // Lưu session với sessionId làm key
        PropertiesService.getScriptProperties().setProperty('session_' + sessionId, JSON.stringify(sessionData));
        
        return { success: true, user: user, sessionId: sessionId };
      }
    }
    
    return { success: false, error: 'Tên đăng nhập hoặc mật khẩu không đúng' };
  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Lấy thông tin user hiện tại
 */
function getCurrentUser(sessionId) {
  try {
    if (!sessionId) return null;
    
    const sessionJson = PropertiesService.getScriptProperties().getProperty('session_' + sessionId);
    if (!sessionJson) return null;
    
    const sessionData = JSON.parse(sessionJson);
    
    // Check session timeout (24 giờ)
    const now = new Date().getTime();
    const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
    
    if (now - sessionData.timestamp > sessionTimeout) {
      // Session hết hạn, xóa session
      PropertiesService.getScriptProperties().deleteProperty('session_' + sessionId);
      return null;
    }
    
    return sessionData.user;
  } catch (error) {
    return null;
  }
}

/**
 * Đăng xuất
 */
function logout(sessionId) {
  try {
    if (sessionId) {
      PropertiesService.getScriptProperties().deleteProperty('session_' + sessionId);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Thêm function helper để format date
function formatDateToString(date) {
  if (!date) return '';
  
  try {
    // Nếu đã là string thì return luôn
    if (typeof date === 'string') return date;
    
    // Nếu là Date object thì format thành YYYY-MM-DD
    if (date instanceof Date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    return '';
  } catch (e) {
    return '';
  }
}

/**
 * Format JSON với mỗi object trên 1 dòng
 */
function formatJsonCompact(data) {
  if (!data || data.length === 0) return '[]';
  
  const formattedItems = data.map(item => JSON.stringify(item));
  return '[\n ' + formattedItems.join(',\n ') + '\n]';
}

/**
 * Thêm khách hàng mới
 */
function addCustomer(customerData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Khách hàng');
    var editorName = customerData._editorName || 'Admin';
    delete customerData._editorName;

    const lastRow = sheet.getLastRow();
    const newId = lastRow > 1 ? Math.max(...sheet.getRange('A2:A' + lastRow).getValues().flat()) + 1 : 1;
    const createdDate = customerData.createdDate || new Date().toISOString().split('T')[0];
    
    let orders = [];
    if (customerData.status === 'Đã chốt' && customerData.orderValue) {
      orders = [{
        id: Date.now(), 
        closedDate: customerData.closedDate || new Date().toISOString().split('T')[0],
        orderCode: customerData.orderCode || '',
        orderValue: customerData.orderValue || 0
      }];
    }
    
    sheet.appendRow([
        newId, createdDate, customerData.name, customerData.phone,
        customerData.notes || '', customerData.address, customerData.status,
        customerData.assignedStaff, customerData.source || '',
        formatJsonCompact(orders), formatJsonCompact([])
    ]);
    // SỬA: Ghi log chỉ lưu Tên khách hàng vào cột Đối tượng
    recordLog(editorName, "Thêm", "Khách hàng", customerData.name, "Tạo mới khách hàng");
    return { success: true, id: newId };
  } catch (error) { return { success: false, error: error.toString() }; }
}

/**
 * Cập nhật khách hàng
 */
function updateCustomer(customerId, customerData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Khách hàng');
    const data = sheet.getDataRange().getValues();
    
    // LẤY TÊN NGƯỜI SỬA: Nếu không có _editorName thì mới mặc định là Admin
    var editorName = customerData._editorName || 'Admin';
    // Xóa key tạm này đi trước khi xử lý dữ liệu để không ảnh hưởng logic khác
    delete customerData._editorName;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == customerId) {
        var oldName = data[i][2];
        var oldPhone = data[i][3];
        var oldStatus = data[i][6];
        var oldStaff = data[i][7];
        
        var changes = [];
        if (oldName != customerData.name) changes.push("Tên: " + oldName + " -> " + customerData.name);
        if (oldPhone != customerData.phone) changes.push("SĐT: " + oldPhone + " -> " + customerData.phone);
        if (oldStatus != customerData.status) changes.push("Trạng thái: " + oldStatus + " -> " + customerData.status);
        if (oldStaff != customerData.assignedStaff) changes.push("Phụ trách: " + oldStaff + " -> " + customerData.assignedStaff);
        
        // Kiểm tra thay đổi Ghi chú (Notes) - Thêm vào log nếu cần thiết
        var oldNotes = data[i][4];
        if (oldNotes != customerData.notes) {
             // Cắt ngắn ghi chú nếu quá dài để log cho gọn
             let shortOld = oldNotes.length > 15 ? oldNotes.substring(0, 15) + "..." : oldNotes;
             let shortNew = customerData.notes.length > 15 ? customerData.notes.substring(0, 15) + "..." : customerData.notes;
             changes.push("Ghi chú: " + shortOld + " -> " + shortNew);
        }

        if (changes.length > 0) {
           // Ghi log với đúng tên editorName
           recordLog(editorName, "Sửa", "Khách hàng", customerData.name, changes.join("; "));
        }

        const createdDate = customerData.createdDate || new Date().toISOString().split('T')[0];
        let currentOrders = [];
        try { currentOrders = data[i][9] ? JSON.parse(data[i][9]) : []; } catch (e) { currentOrders = []; }
        
        if (customerData.status === 'Đã chốt' && customerData.orderValue) {
          const newOrder = {
            closedDate: customerData.closedDate || new Date().toISOString().split('T')[0],
            orderCode: customerData.orderCode || '',
            orderValue: customerData.orderValue || 0
          };
          const existingIndex = currentOrders.findIndex(order => order.orderCode === newOrder.orderCode && order.closedDate === newOrder.closedDate);
          if (existingIndex >= 0) { currentOrders[existingIndex] = newOrder; } else { currentOrders.push(newOrder); }
        }
        if (customerData.orders) {
          currentOrders = customerData.orders.map(order => ({
            id: order.id || Date.now(), closedDate: order.closedDate, orderCode: order.orderCode || '', orderValue: order.orderValue || 0
          }));
        }

        sheet.getRange(i + 1, 2, 1, 9).setValues([[
            createdDate, customerData.name, customerData.phone,
            customerData.notes || '', customerData.address, customerData.status,
            customerData.assignedStaff, customerData.source || '',
            formatJsonCompact(currentOrders)
        ]]);
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy khách hàng' };
  } catch (error) { return { success: false, error: error.toString() }; }
}

/**
 * Xóa khách hàng
 */
function deleteCustomer(customerId, userAction) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Khách hàng');
    const data = sheet.getDataRange().getValues();
    var editorName = userAction || 'Admin';
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == customerId) {
        var customerName = data[i][2];
        sheet.deleteRow(i + 1);
        
        // SỬA: Ghi log chỉ lưu Tên khách hàng vào cột Đối tượng
        recordLog(editorName, "Xóa", "Khách hàng", customerName, "Đã xóa khách hàng khỏi hệ thống");
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy khách hàng' };
  } catch (error) { return { success: false, error: error.toString() }; }
}

/**
 * Thêm lịch sử chăm sóc
 */
function addCareHistory(customerId, careData, editorName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Khách hàng');
    const data = sheet.getDataRange().getValues();
    var userAction = editorName || 'Admin';
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == customerId) {
        var customerName = data[i][2];
        let careHistory = [];
        try { careHistory = data[i][10] ? JSON.parse(data[i][10]) : []; } catch (e) { careHistory = []; }
        
        const newCareEntry = {
          id: Date.now(),
          contactDate: careData.contactDate,
          content: careData.content,
          nextContactDate: careData.nextContactDate,
          staff: careData.staff
        };
        careHistory.unshift(newCareEntry);
        sheet.getRange(i + 1, 11).setValue(formatJsonCompact(careHistory));
        
        // LOG: Category = "Lịch sử chăm sóc"
        var logDetail = careData.contactDate + ": " + careData.content;
        recordLog(userAction, "Thêm", "Lịch sử chăm sóc", "KH" + customerId + " - " + customerName, logDetail);

        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy khách hàng' };
  } catch (error) { return { success: false, error: error.toString() }; }
}

/**
 * Thêm nhân viên mới
 */
function addStaff(staffData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Nhân viên');
    
    const lastRow = sheet.getLastRow();
    const newId = lastRow > 1 ? Math.max(...sheet.getRange('A2:A' + lastRow).getValues().flat()) + 1 : 1;
    
    sheet.appendRow([newId, staffData.name, staffData.position, staffData.username, staffData.password, staffData.manager || '']);
    
    return { success: true, id: newId };
  } catch (error) {
    console.error('Lỗi thêm nhân viên:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Thêm trạng thái mới
 */
function addStatus(statusData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Trạng thái');
    
    const lastRow = sheet.getLastRow();
    const newId = lastRow > 1 ? Math.max(...sheet.getRange('A2:A' + lastRow).getValues().flat()) + 1 : 1;
    
    sheet.appendRow([newId, statusData.name, statusData.color]);
    
    return { success: true, id: newId };
  } catch (error) {
    console.error('Lỗi thêm trạng thái:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Cập nhật lịch sử chăm sóc
 */
function updateCareHistory(customerId, entryId, careData, editorName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Khách hàng');
    const data = sheet.getDataRange().getValues();
    var userAction = editorName || 'Admin';
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == customerId) {
        var customerName = data[i][2];
        let careHistory = [];
        try { careHistory = data[i][10] ? JSON.parse(data[i][10]) : []; } catch (e) { careHistory = []; }
        
        const index = careHistory.findIndex(entry => entry.id == entryId);
        if (index !== -1) {
          var oldEntry = careHistory[index];
          var changes = [];

          if (oldEntry.content !== careData.content) {
              var oldShort = oldEntry.content.length > 20 ? oldEntry.content.substring(0, 20) + "..." : oldEntry.content;
              var newShort = careData.content.length > 20 ? careData.content.substring(0, 20) + "..." : careData.content;
              changes.push("Nội dung: [" + oldShort + "] -> [" + newShort + "]");
          }
          if (oldEntry.contactDate !== careData.contactDate) changes.push("Ngày: " + oldEntry.contactDate + " -> " + careData.contactDate);
          if (oldEntry.staff !== careData.staff) changes.push("NV: " + oldEntry.staff + " -> " + careData.staff);

          careHistory[index] = {
            id: careHistory[index].id,
            contactDate: careData.contactDate,
            content: careData.content,
            nextContactDate: careData.nextContactDate,
            staff: careData.staff
          };
          sheet.getRange(i + 1, 11).setValue(formatJsonCompact(careHistory));
          
          // LOG: Category = "Lịch sử chăm sóc"
          var logDetail = changes.length > 0 ? changes.join("; ") : "Cập nhật không thay đổi";
          recordLog(userAction, "Sửa", "Lịch sử chăm sóc", "KH" + customerId + " - " + customerName, logDetail);

          return { success: true };
        }
        return { success: false, error: 'Không tìm thấy lịch sử chăm sóc' };
      }
    }
    return { success: false, error: 'Không tìm thấy khách hàng' };
  } catch (error) { return { success: false, error: error.toString() }; }
}

/**
 * Xóa lịch sử chăm sóc
 */
function deleteCareHistory(customerId, entryId, editorName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Khách hàng');
    const data = sheet.getDataRange().getValues();
    var userAction = editorName || 'Admin';
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == customerId) {
        var customerName = data[i][2];
        let careHistory = [];
        try { careHistory = data[i][10] ? JSON.parse(data[i][10]) : []; } catch (e) { careHistory = []; }
        
        var deletedEntry = careHistory.find(entry => entry.id == entryId);
        var deletedContent = deletedEntry ? deletedEntry.content : "";

        careHistory = careHistory.filter(entry => entry.id != entryId);
        sheet.getRange(i + 1, 11).setValue(formatJsonCompact(careHistory));
        
        // LOG: Category = "Lịch sử chăm sóc"
        recordLog(userAction, "Xóa", "Lịch sử chăm sóc", "KH" + customerId + " - " + customerName, "Nội dung: " + deletedContent);

        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy khách hàng' };
  } catch (error) { return { success: false, error: error.toString() }; }
}

/**
 * Cập nhật nhân viên
 */
function updateStaff(staffId, staffData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Nhân viên');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == staffId) {
        sheet.getRange(i + 1, 2, 1, 5).setValues([[
            staffData.name,
            staffData.position,
            staffData.username,
            staffData.password,
            staffData.manager || ''
        ]]);
        return { success: true };
      }
    }
    
    return { success: false, error: 'Không tìm thấy nhân viên' };
  } catch (error) {
    console.error('Lỗi cập nhật nhân viên:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Xóa nhân viên
 */
function deleteStaff(staffId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Nhân viên');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == staffId) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    
    return { success: false, error: 'Không tìm thấy nhân viên' };
  } catch (error) {
    console.error('Lỗi xóa nhân viên:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Cập nhật trạng thái
 */
function updateStatus(statusId, statusData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Trạng thái');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == statusId) {
        sheet.getRange(i + 1, 2, 1, 2).setValues([[
          statusData.name,
          statusData.color
        ]]);
        return { success: true };
      }
    }
    
    return { success: false, error: 'Không tìm thấy trạng thái' };
  } catch (error) {
    console.error('Lỗi cập nhật trạng thái:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Xóa trạng thái
 */
function deleteStatus(statusId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Trạng thái');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == statusId) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    
    return { success: false, error: 'Không tìm thấy trạng thái' };
  } catch (error) {
    console.error('Lỗi xóa trạng thái:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Thêm nguồn khách mới
 */
function addSource(sourceData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Nguồn khách');
    
    const lastRow = sheet.getLastRow();
    const newId = lastRow > 1 ? Math.max(...sheet.getRange('A2:A' + lastRow).getValues().flat()) + 1 : 1;
    
    sheet.appendRow([newId, sourceData.name, sourceData.description || '']);
    
    return { success: true, id: newId };
  } catch (error) {
    console.error('Lỗi thêm nguồn khách:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Cập nhật nguồn khách
 */
function updateSource(sourceId, sourceData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Nguồn khách');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == sourceId) {
        sheet.getRange(i + 1, 2, 1, 2).setValues([[
          sourceData.name,
          sourceData.description || ''
        ]]);
        return { success: true };
      }
    }
    
    return { success: false, error: 'Không tìm thấy nguồn khách' };
  } catch (error) {
    console.error('Lỗi cập nhật nguồn khách:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Xóa nguồn khách
 */
function deleteSource(sourceId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Nguồn khách');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == sourceId) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    
    return { success: false, error: 'Không tìm thấy nguồn khách' };
  } catch (error) {
    console.error('Lỗi xóa nguồn khách:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Thay đổi thứ tự trạng thái
 */
function reorderStatus(statusId, direction) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Trạng thái');
    const data = sheet.getDataRange().getValues();
    
    // Tìm vị trí hiện tại
    let currentIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == statusId) {
        currentIndex = i;
        break;
      }
    }
    
    if (currentIndex === -1) {
      return { success: false, error: 'Không tìm thấy trạng thái' };
    }
    
    let targetIndex = currentIndex;
    if (direction === 'up' && currentIndex > 1) {
      targetIndex = currentIndex - 1;
    } else if (direction === 'down' && currentIndex < data.length - 1) {
      targetIndex = currentIndex + 1;
    } else {
      return { success: false, error: 'Không thể di chuyển' };
    }
    
    // Hoán đổi 2 dòng
    const currentRow = data[currentIndex];
    const targetRow = data[targetIndex];
    
    // Cập nhật trong sheet
    sheet.getRange(currentIndex + 1, 1, 1, currentRow.length).setValues([targetRow]);
    sheet.getRange(targetIndex + 1, 1, 1, targetRow.length).setValues([currentRow]);
    
    return { success: true };
    
  } catch (error) {
    console.error('Lỗi thay đổi thứ tự trạng thái:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Thêm đơn hàng mới cho khách hàng
 */
function addOrderToCustomer(customerId, orderData, editorName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Khách hàng');
    const data = sheet.getDataRange().getValues();
    var userAction = editorName || 'Admin';
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == customerId) {
        var customerName = data[i][2];
        let currentOrders = [];
        try { currentOrders = data[i][9] ? JSON.parse(data[i][9]) : []; } catch (e) { currentOrders = []; }
        
        const newOrder = {
          id: Date.now(),
          closedDate: orderData.closedDate,
          orderCode: orderData.orderCode || '',
          orderValue: orderData.orderValue || 0
        };
        currentOrders.push(newOrder);
        
        const currentStatus = data[i][6];
        const newStatus = currentStatus === 'Đã chốt' ? currentStatus : 'Đã chốt';
        
        sheet.getRange(i + 1, 7).setValue(newStatus);
        sheet.getRange(i + 1, 10).setValue(formatJsonCompact(currentOrders));

        // LOG: Category = "Đơn hàng"
        var logDetail = "Mã: " + newOrder.orderCode + " - Giá trị: " + (newOrder.orderValue).toLocaleString('vi-VN');
        recordLog(userAction, "Thêm", "Đơn hàng", "KH" + customerId + " - " + customerName, logDetail);
        
        return { success: true };
      }
    }
    return { success: false, error: 'Không tìm thấy khách hàng' };
  } catch (error) { return { success: false, error: error.toString() }; }
}

/**
 * Cập nhật đơn hàng của khách hàng
 */
function updateOrderOfCustomer(customerId, orderId, orderData, editorName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Khách hàng');
    const data = sheet.getDataRange().getValues();
    var userAction = editorName || 'Admin';

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == customerId) {
        var customerName = data[i][2];
        let currentOrders = [];
        try { currentOrders = data[i][9] ? JSON.parse(data[i][9]) : []; } catch (e) { currentOrders = []; }
        
        const orderIndex = currentOrders.findIndex(order => order.id == orderId);
        if (orderIndex >= 0) {
          var oldCode = currentOrders[orderIndex].orderCode;
          currentOrders[orderIndex] = {
            id: currentOrders[orderIndex].id,
            closedDate: orderData.closedDate,
            orderCode: orderData.orderCode || '',
            orderValue: orderData.orderValue || 0
          };
          
          sheet.getRange(i + 1, 10).setValue(formatJsonCompact(currentOrders));

          // LOG: Category = "Đơn hàng"
          var logDetail = "(Mã cũ: " + oldCode + ") -> Mới: " + orderData.orderCode + " - " + (orderData.orderValue).toLocaleString('vi-VN');
          recordLog(userAction, "Sửa", "Đơn hàng", "KH" + customerId + " - " + customerName, logDetail);

          return { success: true };
        } else { return { success: false, error: 'Không tìm thấy đơn hàng' }; }
      }
    }
    return { success: false, error: 'Không tìm thấy khách hàng' };
  } catch (error) { return { success: false, error: error.toString() }; }
}

/**
 * Xóa đơn hàng của khách hàng
 */
function deleteOrderFromCustomer(customerId, orderId, editorName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Khách hàng');
    const data = sheet.getDataRange().getValues();
    var userAction = editorName || 'Admin';
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == customerId) {
        var customerName = data[i][2];
        let currentOrders = [];
        try { currentOrders = data[i][9] ? JSON.parse(data[i][9]) : []; } catch (e) { currentOrders = []; }
        
        const orderIndex = currentOrders.findIndex(order => order.id == orderId);
        if (orderIndex >= 0) {
          var deletedOrderCode = currentOrders[orderIndex].orderCode;
          currentOrders.splice(orderIndex, 1);

          let newStatus = data[i][6];
          if (currentOrders.length === 0 && newStatus === 'Đã chốt') {
            newStatus = 'Khách hàng mới';
          }
          
          sheet.getRange(i + 1, 7).setValue(newStatus);
          sheet.getRange(i + 1, 10).setValue(formatJsonCompact(currentOrders));
          
          // LOG: Category = "Đơn hàng"
          recordLog(userAction, "Xóa", "Đơn hàng", "KH" + customerId + " - " + customerName, "Mã đơn: " + deletedOrderCode);

          return { success: true };
        } else { return { success: false, error: 'Không tìm thấy đơn hàng' }; }
      }
    }
    return { success: false, error: 'Không tìm thấy khách hàng' };
  } catch (error) { return { success: false, error: error.toString() }; }
}

function changePassword(username, newPassword) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Nhân viên');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][3] === username) {
        sheet.getRange(i + 1, 5).setValue(newPassword);
        return { success: true };
      }
    }
    
    return { success: false, error: 'Không tìm thấy tài khoản' };
  } catch (error) {
    console.error('Lỗi đổi mật khẩu:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Ghi log hoạt động (Đã xử lý giới hạn 50.000 ký tự)
 */
function recordLog(editorName, action, category, targetInfo, detailChange) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Lịch sử');
    if (!sheet) return;

    var now = new Date();
    var todayStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
    var timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm");
    
    // Tạo object log (thêm key 'c' cho category/phân loại)
    var newLog = {
      t: timeStr,
      u: editorName || 'Ẩn danh',
      a: action,
      c: category || 'Khác',
      o: targetInfo,
      d: detailChange
    };

    var lastRow = sheet.getLastRow();
    var saved = false;

    if (lastRow > 1) {
      var lastDateRaw = sheet.getRange(lastRow, 1).getValue();
      var lastDateStr = '';
      if (lastDateRaw instanceof Date) {
         lastDateStr = Utilities.formatDate(lastDateRaw, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
         lastDateStr = String(lastDateRaw);
      }

      if (lastDateStr === todayStr) {
        var cell = sheet.getRange(lastRow, 2);
        var currentContent = cell.getValue();
        var jsonArr = [];
        try { 
          jsonArr = currentContent ? JSON.parse(currentContent) : []; 
        } catch(e) { jsonArr = []; }
        
        var tempArr = [newLog].concat(jsonArr);
        var newContent = JSON.stringify(tempArr);
        
        if (newContent.length < 49000) {
          cell.setValue(newContent);
          saved = true;
        }
      }
    }
    
    if (!saved) {
      sheet.appendRow([todayStr, JSON.stringify([newLog])]);
    }

  } catch (e) {
    console.error("Lỗi ghi log: " + e.toString());
  }
}

function parseHistoryData(data) {
  if (!data || data.length <= 1) return [];
  
  var allLogs = [];
  
  // Duyệt từ dòng 2 (bỏ header)
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var dateVal = row[0]; // Cột Ngày
    var jsonContent = row[1]; // Cột JSON
    
    // Format ngày chuẩn YYYY-MM-DD để client dễ lọc
    var dateStr = formatDateToString(dateVal);
    
    if (jsonContent) {
      try {
        var dailyLogs = JSON.parse(jsonContent);
        // Quan trọng: Gán thêm ngày vào từng log con để biết log đó thuộc ngày nào
        if (Array.isArray(dailyLogs)) {
          dailyLogs.forEach(function(log) {
            log.fullDate = dateStr; 
          });
          // Gộp vào mảng tổng
          allLogs = allLogs.concat(dailyLogs);
        }
      } catch (e) {
        // Bỏ qua dòng lỗi
      }
    }
  }
  
  // Sắp xếp giảm dần theo thời gian (Mới nhất lên đầu)
  return allLogs.sort(function(a, b) {
    // So sánh ngày trước
    if (b.fullDate !== a.fullDate) {
      return new Date(b.fullDate) - new Date(a.fullDate);
    }
    // Nếu trùng ngày thì so sánh giờ (log.t)
    return b.t.localeCompare(a.t);
  });
}

function getHistoryData(dateStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Lịch sử');
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Lấy toàn bộ cột ngày để tìm cho nhanh
  var dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var rowIndex = -1;

  for (var i = 0; i < dates.length; i++) {
    var d = dates[i][0];
    var dStr = '';
    if (d instanceof Date) {
      dStr = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else {
      dStr = String(d);
    }

    if (dStr === dateStr) {
      rowIndex = i + 2; // +2 vì mảng bắt đầu từ 0 và header là dòng 1
      break;
    }
  }

  if (rowIndex > 0) {
    var jsonContent = sheet.getRange(rowIndex, 2).getValue();
    try {
      return JSON.parse(jsonContent);
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * Parse dữ liệu Nhắc việc & Phân quyền xem
 */
function parseRemindersData(data, currentUser) {
  if (!data || data.length <= 1) return [];
  var allReminders = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var dateStr = formatDateToString(row[0]);
    var jsonContent = row[1];
    
    if (jsonContent) {
      try {
        var items = JSON.parse(jsonContent);
        if (Array.isArray(items)) {
          items.forEach(function(r) { r.dueDate = dateStr; }); // Gán ngày vào object
          allReminders = allReminders.concat(items);
        }
      } catch (e) {}
    }
  }

  // LOGIC PHÂN QUYỀN HIỂN THỊ:
  // Hiện nếu: Mình là người tạo HOẶC Mình được gán HOẶC Gán cho "ALL"
  return allReminders.filter(function(r) {
    var isCreator = r.createdBy === currentUser.name;
    var isAssignedToMe = false;
    
    if (r.assignTo === 'ALL') {
      isAssignedToMe = true;
    } else if (Array.isArray(r.assignTo)) {
      isAssignedToMe = r.assignTo.includes(currentUser.name);
    }
    
    return isCreator || isAssignedToMe;
  });
}

/**
 * Lưu nhắc việc (Lưu theo dòng Ngày hết hạn)
 */
function saveReminder(data) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Nhắc việc');
    var dueDateStr = data.dueDate; // YYYY-MM-DD
    var lastRow = sheet.getLastRow();
    
    // Tạo object dữ liệu mới
    var newObj = {
      id: data.id || Date.now(),
      content: data.content,
      createdBy: data.createdBy,
      assignTo: data.assignTo,
      priority: data.priority,
      isDone: data.isDone || false,
      timestamp: new Date().getTime()
    };

    // TRƯỜNG HỢP 1: CẬP NHẬT (UPDATE)
    // Phải quét tìm đúng dòng chứa ID này để sửa
    if (data.id) {
      for (var i = 2; i <= lastRow; i++) {
        // Chỉ quét những dòng trùng ngày để tối ưu tốc độ
        if (formatDateToString(sheet.getRange(i, 1).getValue()) === dueDateStr) {
           var cell = sheet.getRange(i, 2);
           var jsonVal = cell.getValue();
           if (jsonVal && jsonVal.includes(String(data.id))) { // Check nhanh bằng string trước
              var items = JSON.parse(jsonVal);
              var idx = items.findIndex(function(x) { return x.id == data.id; });
              if (idx !== -1) {
                  items[idx] = newObj; // Cập nhật
                  cell.setValue(JSON.stringify(items));
                  return { success: true };
              }
           }
        }
      }
      // Nếu có ID mà không tìm thấy (hiếm), sẽ tự động chuyển sang logic Thêm mới bên dưới
    }

    // TRƯỜNG HỢP 2: THÊM MỚI (CREATE)
    // Tìm dòng cuối cùng của ngày đó để xem còn chỗ chứa không
    var targetRowIndex = -1;
    
    if (lastRow > 1) {
       var dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
       for (var i = 0; i < dates.length; i++) {
         if (formatDateToString(dates[i][0]) === dueDateStr) {
           targetRowIndex = i + 2; 
           // Không break, tiếp tục chạy để lấy dòng cuối cùng trùng ngày
         }
       }
    }

    // Nếu tìm thấy dòng cũ của ngày này
    if (targetRowIndex > 0) {
       var cell = sheet.getRange(targetRowIndex, 2);
       var currentContent = cell.getValue();
       
       // KIỂM TRA GIỚI HẠN KÝ TỰ (Giống recordLog)
       if (currentContent.length < 49000) {
          var currentItems = JSON.parse(currentContent);
          currentItems.push(newObj);
          cell.setValue(JSON.stringify(currentItems));
          return { success: true };
       }
    }

    // Nếu chưa có dòng nào của ngày này HOẶC dòng cuối đã đầy (>49k ký tự)
    // -> Tạo dòng mới
    sheet.appendRow([dueDateStr, JSON.stringify([newObj])]);
    return { success: true };

  } catch (e) { return { success: false, error: e.toString() }; }
}

/**
 * Đổi trạng thái (Xong/Chưa xong) hoặc Xóa
 */
function updateReminderStatus(id, dateStr, isDone, isDelete) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Nhắc việc');
    var lastRow = sheet.getLastRow();
    
    for (var i = 2; i <= lastRow; i++) {
      var d = formatDateToString(sheet.getRange(i, 1).getValue());
      
      if (d === dateStr) {
        var cell = sheet.getRange(i, 2);
        var jsonVal = cell.getValue();
        var items = jsonVal ? JSON.parse(jsonVal) : [];
        var isFound = false;
        
        if (isDelete) {
           var oldLength = items.length;
           items = items.filter(function(x) { return x.id != id; });
           if (items.length < oldLength) isFound = true;
        } else {
           var idx = items.findIndex(function(x) { return x.id == id; });
           if (idx !== -1) {
             items[idx].isDone = isDone;
             isFound = true;
           }
        }
        
        if (isFound) {
            if (items.length === 0 && isDelete) {
                sheet.deleteRow(i);
            } else {
                cell.setValue(JSON.stringify(items));
            }
            return { success: true };
        }
      }
    }
    return { success: false, error: 'Không tìm thấy ID công việc này' };
  } catch (e) { return { success: false, error: e.toString() }; }
}