import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://nsmioyqhnefljfpmzksk.supabase.co",
  "sb_publishable_skwyA6GX4YTiiRpvF8PWFw_iHUFgXCZ"
);

const fileInput = document.getElementById('upload-json');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');

if (fileInput) {
  fileInput.addEventListener('change', () => {
    const fileName = fileInput.files.length > 0 ? fileInput.files[0].name : 'No file chosen';
    const fileNameDisplay = document.querySelector('.custom-file-upload .file-name');
    if (fileNameDisplay) {
      fileNameDisplay.textContent = fileName;
    }
  });
}

// Show login form or user info depending on auth state
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    // User is logged in → hide login form, show user info
    document.getElementById('login-form')?.classList.add('hidden');
    document.getElementById('user-info')?.classList.remove('hidden');
    document.getElementById('logout-btn')?.classList.remove('hidden');

    const emailDisplay = document.getElementById('user-email-display');
    if (emailDisplay) {
      emailDisplay.textContent = `Logged in as ${session.user.email}`;
    }

    // Fetch table names now that user is authenticated
    await fetchTableNames();

    enableNavigation();
  } else {
    // Not logged in → show login form, hide user info
    document.getElementById('login-form')?.classList.remove('hidden');
    document.getElementById('user-info')?.classList.add('hidden');
    document.getElementById('logout-btn')?.classList.add('hidden');

    disableNavigation();
    forceLoginSection();
  }
}

// Force settings section (login) to be visible on page load
function forceLoginSection() {
  const sections = document.querySelectorAll('.admin-section');
  sections.forEach(sec => sec.classList.remove('active'));
  
  const settingsSection = document.getElementById('settings-section');
  if (settingsSection) {
    settingsSection.classList.add('active');
  }

  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(i => i.classList.remove('active'));
  
  const settingsNav = document.querySelector('[data-target="settings-section"]');
  if (settingsNav) {
    settingsNav.classList.add('active');
  }

  const headerTitle = document.querySelector('.admin-header h1');
  const headerSubtitle = document.querySelector('.admin-header p');
  if (headerTitle) {
    headerTitle.textContent = 'Settings';
    if (headerSubtitle) headerSubtitle.textContent = '';
  }

  // Ensure login form is visible using class
  document.getElementById('login-form')?.classList.remove('hidden');
}

// Disable navigation until logged in
function disableNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    const target = item.getAttribute('data-target');
    if (target !== 'settings-section') {
      item.style.opacity = '0.5';
      item.style.cursor = 'not-allowed';
      item.setAttribute('data-disabled', 'true');
    } else {
      item.style.opacity = '1';
      item.style.cursor = 'pointer';
      item.removeAttribute('data-disabled');
    }
  });
}

// Enable navigation after login
function enableNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.style.opacity = '1';
    item.style.cursor = 'pointer';
    item.removeAttribute('data-disabled');
  });
}

// Handle login form submission
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = loginForm.email.value;
    const password = loginForm.password.value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      alert('Login failed: ' + error.message);
    } else {
      alert('Login successful!');
      checkAuth();
    }
  });
}

// Handle logout button click
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    alert('Logged out');
    checkAuth();
  });
}

// Initial auth check on page load
checkAuth();

/* =========================
DOWNLOAD JSON
========================= */
document.getElementById("download-json").addEventListener("click", async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Please log in to download JSON");
    return;
  }

  if (!modulesTableName || !chaptersTableName) {
    alert("Table configuration not loaded. Please refresh the page.");
    return;
  }

  const { data, error } = await supabase
    .from(modulesTableName)
    .select(`
      id,
      title,
      description,
      duration,
      sort_order,
      ${chaptersTableName} (
        id,
        title,
        video_id,
        duration,
        description,
        links,
        sort_order
      )
    `)
    .order("sort_order", { ascending: true })
    .order("sort_order", { foreignTable: chaptersTableName, ascending: true });

  if (error) {
    alert("Failed to download JSON");
    console.error(error);
    return;
  }

  const json = {
    modules: data.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      duration: m.duration,
      chapters: (m[chaptersTableName] || []).map(c => ({
        id: c.id,
        title: c.title,
        videoId: c.video_id || "",
        duration: c.duration,
        description: c.description,
        links: c.links || []
      }))
    }))
  };

  downloadFile("learning-data.json", JSON.stringify(json, null, 2));
});

/* =========================
JSON EDITOR FUNCTIONS
========================= */

const jsonEditor = document.getElementById('json-editor');
const formatBtn = document.getElementById('format-json');
const validateBtn = document.getElementById('validate-json');
const copyBtn = document.getElementById('copy-json');
const clearBtn = document.getElementById('clear-json');
const uploadEditorBtn = document.getElementById('upload-editor-btn');

// Update line numbers and stats when editor content changes
function updateEditorStats() {
  const content = jsonEditor.value;
  const lines = content.split('\n').length;
  const sizeBytes = new Blob([content]).size;
  
  document.getElementById('line-count').textContent = lines;
  document.getElementById('size-count').textContent = sizeBytes;

  // Update line numbers
  const lineNumbers = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  document.getElementById('editor-line-numbers').textContent = lineNumbers;

  // Validate JSON in real-time
  updateValidationStatus();
}

// Validate JSON and show status
function updateValidationStatus() {
  const content = jsonEditor.value.trim();
  const status = document.getElementById('editor-status');
  const statusMessage = document.getElementById('editor-status-message');
  const validStatus = document.getElementById('valid-status');

  if (!content) {
    status.classList.add('hidden');
    validStatus.textContent = '?';
    validStatus.className = 'status-invalid';
    return;
  }

  try {
    JSON.parse(content);
    status.classList.remove('hidden');
    status.className = 'editor-status success';
    statusMessage.innerHTML = '<i class="fas fa-check-circle"></i> Valid JSON ✓';
    validStatus.textContent = '✓ Valid';
    validStatus.className = 'status-valid';
  } catch (err) {
    status.classList.remove('hidden');
    status.className = 'editor-status error';
    statusMessage.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${err.message}`;
    validStatus.textContent = '✗ Invalid';
    validStatus.className = 'status-invalid';
  }
}

// Format/prettify JSON
if (formatBtn) {
  formatBtn.addEventListener('click', () => {
    const content = jsonEditor.value.trim();
    try {
      const json = JSON.parse(content);
      jsonEditor.value = JSON.stringify(json, null, 2);
      updateEditorStats();
      showStatus('JSON formatted successfully!', 'success');
    } catch (err) {
      showStatus('Invalid JSON: ' + err.message, 'error');
    }
  });
}

// Validate JSON
if (validateBtn) {
  validateBtn.addEventListener('click', () => {
    const content = jsonEditor.value.trim();
    try {
      JSON.parse(content);
      showStatus('JSON is valid! ✓', 'success');
    } catch (err) {
      showStatus('Invalid JSON: ' + err.message, 'error');
    }
  });
}

// Copy JSON to clipboard
if (copyBtn) {
  copyBtn.addEventListener('click', () => {
    const content = jsonEditor.value;
    if (!content.trim()) {
      showStatus('Nothing to copy!', 'error');
      return;
    }
    navigator.clipboard.writeText(content).then(() => {
      showStatus('Copied to clipboard! ✓', 'success');
    }).catch(() => {
      showStatus('Failed to copy', 'error');
    });
  });
}

// Clear editor
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the editor?')) {
      jsonEditor.value = '';
      updateEditorStats();
      showStatus('Editor cleared', 'info');
    }
  });
}

// Sync from editor
if (uploadEditorBtn) {
  uploadEditorBtn.addEventListener('click', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showStatus('Please log in to upload', 'error');
      return;
    }

    const content = jsonEditor.value.trim();
    if (!content) {
      showStatus('Editor is empty', 'error');
      return;
    }

    try {
      const json = JSON.parse(content);
      validateJSON(json);
      
      if (confirm('This will replace all existing modules & chapters. Continue?')) {
        await syncToSupabase(json);
        showStatus('JSON synced successfully! ✓', 'success');
      }
    } catch (err) {
      showStatus('Error: ' + err.message, 'error');
    }
  });
}

// Download and populate editor
document.getElementById("download-json").addEventListener("click", async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Please log in to download JSON");
    return;
  }

  if (!modulesTableName || !chaptersTableName) {
    alert("Table configuration not loaded. Please refresh the page.");
    return;
  }

  try {
    const { data, error } = await supabase
      .from(modulesTableName)
      .select(`
        id,
        title,
        description,
        duration,
        sort_order,
        ${chaptersTableName} (
          id,
          title,
          video_id,
          duration,
          description,
          links,
          sort_order
        )
      `)
      .order("sort_order", { ascending: true })
      .order("sort_order", { foreignTable: chaptersTableName, ascending: true });

    if (error) throw error;

    const json = {
      modules: data.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        duration: m.duration,
        chapters: (m[chaptersTableName] || []).map(c => ({
          id: c.id,
          title: c.title,
          videoId: c.video_id || "",
          duration: c.duration,
          description: c.description,
          links: c.links || []
        }))
      }))
    };

    // Populate editor and download
    const jsonString = JSON.stringify(json, null, 2);
    jsonEditor.value = jsonString;
    updateEditorStats();
    downloadFile("learning-data.json", jsonString);
    showStatus('JSON downloaded and loaded in editor!', 'success');
  } catch (err) {
    showStatus('Failed to download: ' + err.message, 'error');
    console.error(err);
  }
});

// Show status message
function showStatus(message, type) {
  const status = document.getElementById('editor-status');
  const statusMessage = document.getElementById('editor-status-message');
  
  status.className = `editor-status ${type}`;
  statusMessage.textContent = message;
  status.classList.remove('hidden');

  // Auto-hide after 5 seconds
  setTimeout(() => {
    status.classList.add('hidden');
  }, 5000);
}

// Track editor changes
if (jsonEditor) {
  jsonEditor.addEventListener('input', updateEditorStats);
  jsonEditor.addEventListener('change', updateEditorStats);
  updateEditorStats(); // Initial update
}

/* =========================
UPLOAD JSON
========================= */
document.getElementById("upload-btn").addEventListener("click", async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Please log in to upload JSON");
    return;
  }

  const fileInput = document.getElementById("upload-json");
  const file = fileInput.files[0];

  if (!file) {
    alert("Select a JSON file first");
    return;
  }

  try {
    const text = await file.text();
    const json = JSON.parse(text);

    validateJSON(json);

    await syncToSupabase(json);

    alert("JSON uploaded and synced successfully 🎉");
  } catch (err) {
    console.error(err);
    alert("Upload failed: " + err.message);
  }
});

/* =========================
SYNC LOGIC
========================= */
async function syncToSupabase(json) {
  if (!modulesTableName || !chaptersTableName) {
    throw new Error("Table configuration not loaded");
  }

  await supabase.from(chaptersTableName).delete().neq("id", "");
  await supabase.from(modulesTableName).delete().neq("id", "");

  const modulesPayload = json.modules.map((m, index) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    duration: m.duration,
    sort_order: index + 1
  }));

  const { error: modulesError } = await supabase
    .from(modulesTableName)
    .insert(modulesPayload);

  if (modulesError) throw modulesError;

  const chaptersPayload = json.modules.flatMap((m) =>
    (m.chapters || []).map((c, cIndex) => ({
      id: c.id,
      module_id: m.id,
      title: c.title,
      video_id: c.videoId || "",
      duration: c.duration,
      description: c.description,
      links: Array.isArray(c.links) ? c.links : [],
      sort_order: cIndex + 1
    }))
  );

  const { error: chaptersError } = await supabase
    .from(chaptersTableName)
    .insert(chaptersPayload);

  if (chaptersError) throw chaptersError;
}

/* =========================
VALIDATION
========================= */
function validateJSON(json) {
  if (!json.modules || !Array.isArray(json.modules)) {
    throw new Error("Invalid JSON: missing or invalid modules array");
  }

  json.modules.forEach(m => {
    if (!m.id || !m.title || !Array.isArray(m.chapters)) {
      throw new Error(`Invalid module: ${m.id || "missing id"}`);
    }

    m.chapters.forEach(c => {
      if (!c.id || !c.title) {
        throw new Error(`Invalid chapter: ${c.id || "missing id"}`);
      }
      if (!("videoId" in c)) {
        throw new Error(`Invalid chapter: ${c.id} missing videoId`);
      }
      if ("links" in c && !Array.isArray(c.links)) {
        throw new Error(`Invalid chapter: ${c.id} links must be an array`);
      }
    });
  });
}

/* =========================
UTIL
========================= */
function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

/* =========================
SIDEBAR NAVIGATION
========================= */
const navItems = document.querySelectorAll(".nav-item");
const sections = document.querySelectorAll(".admin-section");

navItems.forEach(item => {
  item.addEventListener("click", (e) => {
    e.preventDefault();

    const target = item.getAttribute("data-target");
    const isDisabled = item.getAttribute('data-disabled') === 'true';

    // Check if user is trying to access a restricted section without login
    if (isDisabled && target !== 'settings-section') {
      alert('Please log in first to access this section');
      return;
    }

    sections.forEach(sec => sec.classList.remove("active"));

    const targetSection = document.getElementById(target);
    if (targetSection) targetSection.classList.add("active");

    navItems.forEach(i => i.classList.remove("active"));
    item.classList.add("active");

    const headerTitle = document.querySelector('.admin-header h1');
    const headerSubtitle = document.querySelector('.admin-header p');
    if (headerTitle && headerSubtitle) {
      headerTitle.textContent = item.querySelector('span').textContent;
      headerSubtitle.textContent = '';
    }

    // Load editor content when switching to editor section
    if (target === 'content-editor-section') {
      loadDynamicContent();
    }
  });
});

/* =========================
JSON CONTENT EDITOR
========================= */

let currentData = null;
let selectedRecord = null;
let currentTable = 'db_modules';

// Dynamic table names (fetched from public_tables_list)
let modulesTableName = null;
let chaptersTableName = null;
let availableTables = []; // Store all available tables

// Fetch table names from public_tables_list
async function fetchTableNames() {
  try {
    const { data, error } = await supabase
      .from('public_tables_list')
      .select('id, table_name');

    if (error) throw error;

    console.log('Available tables:', data);

    // Store all available tables
    availableTables = data;

    // Find the modules and chapters table names by ID
    data.forEach(row => {
      if (row.table_name === 'db_modules') {
        modulesTableName = row.table_name;
      } else if (row.table_name === 'db_chapters') {
        chaptersTableName = row.table_name;
      }
    });

    if (!modulesTableName || !chaptersTableName) {
      console.error('Failed to find modules or chapters in table list');
      throw new Error('Required tables not found in public_tables_list');
    }

    console.log(`✓ Modules table: ${modulesTableName}`);
    console.log(`✓ Chapters table: ${chaptersTableName}`);

    // Populate the table selector dropdown
    populateTableSelector();
  } catch (err) {
    console.error('Failed to fetch table names:', err);
    alert('Error loading table configuration: ' + err.message);
  }
}

// Populate table selector dropdown with available tables
function populateTableSelector() {
  const tableSelect = document.getElementById('table-select');
  if (!tableSelect) return;

  // Clear existing options
  tableSelect.innerHTML = '';

  // Add options for each available table
  availableTables.forEach(table => {
    const option = document.createElement('option');
    option.value = table.table_name;
    option.textContent = table.table_name || table.id;
    tableSelect.appendChild(option);
  });

  // Set default to modules table
  if (modulesTableName) {
    tableSelect.value = modulesTableName;
    currentTable = modulesTableName;
  }

  console.log('Table selector populated with options:', availableTables);
}

// Table selector listener
document.getElementById('table-select')?.addEventListener('change', (e) => {
  currentTable = e.target.value;
  selectedRecord = null;
  loadDynamicContent();
});

// Get table schema/columns
async function getTableSchema(tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select()
      .limit(0);

    if (error) throw error;

    // Get column info from the response
    const result = await supabase.rpc('get_table_columns', { table_name: tableName }).catch(() => null);
    
    return result?.data || null;
  } catch (err) {
    console.error('Failed to get schema:', err);
    return null;
  }
}

async function loadDynamicContent() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Please log in to edit content");
    return;
  }

  if (!currentTable) {
    alert("Table not selected");
    return;
  }

  try {
    console.log(`Loading data from table: ${currentTable}`);
    
    let { data, error } = await supabase
      .from(currentTable)
      .select('*')
      .order('created_at', { ascending: false });
    
    // Fallback: try ordering by id if created_at doesn't exist
    if (error) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from(currentTable)
        .select('*')
        .order('id', { ascending: true });
      
      if (fallbackError) throw fallbackError;
      data = fallbackData;
      error = null;
    }

    if (error) throw error;

    currentData = data || [];
    selectedRecord = null;
    
    renderDynamicList();
  } catch (err) {
    console.error('LoadDynamicContent error:', err);
    alert("Failed to load content: " + err.message);
  }
}

function renderDynamicList() {
  const recordsList = document.getElementById('modules-list');
  recordsList.innerHTML = '';

  // Add "New Record" button at the top
  const newRecordBtn = document.createElement('button');
  newRecordBtn.className = 'btn-new-module';
  newRecordBtn.innerHTML = '<i class="fas fa-plus"></i> New ' + (currentTable.replace('db_', '').replace(/_/g, ' '));
  newRecordBtn.addEventListener('click', addNewRecord);
  recordsList.appendChild(newRecordBtn);

  // Render records
  currentData.forEach((record, index) => {
    const displayField = record.title || record.name || record.email || record.id || `Record ${index + 1}`;
    const recordDiv = document.createElement('div');
    recordDiv.className = 'module-item' + (selectedRecord?.id === record.id ? ' active' : '');
    recordDiv.innerHTML = `
      <div class="module-item-title">${displayField}</div>
      <div class="module-item-subtitle">${currentTable}</div>
      <div class="module-item-actions">
        <button class="module-item-btn" data-action="edit-record" data-record-id="${record.id}" title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="module-item-btn" data-action="delete-record" data-record-id="${record.id}" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;

    recordDiv.addEventListener('click', (e) => {
      if (!e.target.closest('.module-item-actions')) {
        selectRecord(record);
      }
    });

    recordsList.appendChild(recordDiv);
  });

  // Attach event listeners to action buttons
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      const recordId = btn.getAttribute('data-record-id');

      if (action === 'edit-record') {
        const record = currentData.find(r => r.id == recordId);
        if (record) selectRecord(record);
      } else if (action === 'delete-record') {
        deleteRecord(recordId);
      }
    });
  });

  // Attach search listener
  initializeSearchListener();
}

function selectRecord(record) {
  selectedRecord = record;
  renderEditorContent();
  renderDynamicList();
}

function renderEditorContent() {
  const editorContent = document.getElementById('editor-content');

  if (!selectedRecord) {
    editorContent.innerHTML = `
      <div class="no-selection">
        <i class="fas fa-inbox"></i>
        <p>Select a record to edit</p>
      </div>
    `;
    return;
  }

  renderDynamicEditor(editorContent);
}

function renderDynamicEditor(container) {
  const record = selectedRecord;
  
  // Build form dynamically based on record fields
  const fields = Object.keys(record).filter(key => !key.startsWith('_'));
  
  let formHTML = `
    <div class="edit-form">
      <h2 style="margin-bottom: 24px;">${record.title || record.name || record.id || 'Edit Record'}</h2>
  `;

  fields.forEach(field => {
    const value = record[field];
    const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let inputHTML = '';

    if (field === 'id') {
      // ID fields are read-only
      inputHTML = `<input type="text" class="form-input" value="${value}" disabled />`;
    } else if (typeof value === 'boolean') {
      inputHTML = `<input type="checkbox" id="edit-${field}" ${value ? 'checked' : ''} />`;
    } else if (typeof value === 'number') {
      inputHTML = `<input type="number" class="form-input" id="edit-${field}" value="${value || ''}" />`;
    } else if (typeof value === 'object' && value !== null) {
      inputHTML = `<textarea class="form-textarea" id="edit-${field}" style="font-family: monospace; font-size: 0.9rem;">${JSON.stringify(value, null, 2)}</textarea>`;
    } else if (field.includes('email')) {
      inputHTML = `<input type="email" class="form-input" id="edit-${field}" value="${value || ''}" />`;
    } else if (field.includes('url') || field.includes('link')) {
      inputHTML = `<input type="url" class="form-input" id="edit-${field}" value="${value || ''}" />`;
    } else if (field.includes('date') || field.includes('time')) {
      inputHTML = `<input type="datetime-local" class="form-input" id="edit-${field}" value="${value || ''}" />`;
    } else if (field.includes('description') || field.includes('content') || field.includes('message')) {
      inputHTML = `<textarea class="form-textarea" id="edit-${field}">${value || ''}</textarea>`;
    } else {
      inputHTML = `<input type="text" class="form-input" id="edit-${field}" value="${value || ''}" />`;
    }

    formHTML += `
      <div class="form-group">
        <label class="form-label">${fieldLabel}</label>
        ${inputHTML}
      </div>
    `;
  });

  formHTML += `
    <div class="form-actions">
      <button class="btn-save" id="save-record">
        <i class="fas fa-save"></i> Save Changes
      </button>
      <button class="btn-delete" id="delete-record-btn">
        <i class="fas fa-trash"></i> Delete
      </button>
    </div>
  </div>
  `;

  container.innerHTML = formHTML;

  // Attach event listeners
  document.getElementById('save-record')?.addEventListener('click', saveRecord);
  document.getElementById('delete-record-btn')?.addEventListener('click', () => deleteRecord(record.id));
}


async function saveRecord() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Please log in");
    return;
  }

  if (!selectedRecord || !currentTable) {
    alert("No record selected");
    return;
  }

  try {
    const fields = Object.keys(selectedRecord).filter(key => !key.startsWith('_') && key !== 'id');
    const updates = {};

    fields.forEach(field => {
      const input = document.getElementById(`edit-${field}`);
      if (!input) return;

      let value = input.type === 'checkbox' ? input.checked : input.value;

      // Try to parse JSON if it looks like JSON
      if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
        try {
          value = JSON.parse(value);
        } catch (e) {
          // Keep as string if not valid JSON
        }
      }

      updates[field] = value;
    });

    const { error } = await supabase
      .from(currentTable)
      .update(updates)
      .eq('id', selectedRecord.id);

    if (error) throw error;

    alert('Record saved successfully!');
    
    // Update in memory and UI
    Object.assign(selectedRecord, updates);
    renderDynamicList();
    renderEditorContent();
  } catch (err) {
    console.error(err);
    alert('Failed to save: ' + err.message);
  }
}

async function deleteRecord(recordId) {
  if (!confirm('Are you sure you want to delete this record?')) {
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Please log in");
    return;
  }

  if (!currentTable) {
    alert("Table not selected");
    return;
  }

  try {
    const { error } = await supabase
      .from(currentTable)
      .delete()
      .eq('id', recordId);

    if (error) throw error;

    alert('Record deleted successfully!');
    currentData = currentData.filter(r => r.id !== recordId);
    selectedRecord = null;
    renderDynamicList();
    renderEditorContent();
  } catch (err) {
    console.error(err);
    alert('Failed to delete: ' + err.message);
  }
}

async function addNewRecord() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Please log in");
    return;
  }

  if (!currentTable) {
    alert("Table not selected");
    return;
  }

  // Get a sample record to understand the fields
  if (currentData.length === 0) {
    alert('Cannot create record without knowing table structure. Try editing an existing record first.');
    return;
  }

  const sampleRecord = currentData[0];
  const fields = Object.keys(sampleRecord).filter(key => !key.startsWith('_'));

  // Prompt for required fields
  const recordData = {};
  let cancel = false;

  for (const field of fields) {
    if (field === 'id' || field === 'created_at' || field === 'updated_at') continue;
    
    const value = prompt(`Enter ${field}:`, '');
    if (value === null) {
      cancel = true;
      break;
    }
    recordData[field] = value || null;
  }

  if (cancel) return;

  try {
    const { data, error } = await supabase
      .from(currentTable)
      .insert([recordData])
      .select();

    if (error) throw error;

    alert('Record created successfully!');
    currentData.push(data[0]);
    selectedRecord = data[0];
    renderDynamicList();
    renderEditorContent();
  } catch (err) {
    console.error(err);
    alert('Failed to create record: ' + err.message);
  }
}

// Initialize search listener
function initializeSearchListener() {
  const searchInput = document.getElementById('search-content');
  if (!searchInput) return;

  // Remove any existing listeners by cloning
  const newSearchInput = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(newSearchInput, searchInput);

  newSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    
    document.querySelectorAll('.module-item').forEach(item => {
      const title = item.querySelector('.module-item-title')?.textContent.toLowerCase() || '';
      const matches = title.includes(query);
      item.style.display = matches ? 'block' : 'none';
    });
  });
}