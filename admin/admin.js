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
      loadEditorContent();
    }
  });
});

/* =========================
JSON CONTENT EDITOR
========================= */

let currentData = null;
let selectedModule = null;
let selectedChapter = null;
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
  loadEditorContent();
});

async function loadEditorContent() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Please log in to edit content");
    return;
  }

  if (!modulesTableName || !chaptersTableName) {
    alert("Table configuration not loaded. Please refresh the page.");
    return;
  }

  try {
    let data;
    let error;
    
    if (currentTable === 'db_modules') {
      console.log(`Loading from ${modulesTableName} with relationship to ${chaptersTableName}`);
      
      const result = await supabase
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
      
      data = result.data;
      error = result.error;
      
      if (error) {
        console.error('Query error:', error);
        throw error;
      }
    } else {
      const result = await supabase
        .from(currentTable)
        .select('*')
        .order('id', { ascending: true });
      
      data = result.data;
      error = result.error;
    }

    if (error) throw error;

    currentData = data;
    selectedModule = null;
    selectedChapter = null;
    renderModulesList();
  } catch (err) {
    console.error('LoadEditorContent error:', err);
    alert("Failed to load content: " + err.message);
  }
}

function renderModulesList() {
  const modulesList = document.getElementById('modules-list');
  modulesList.innerHTML = '';

  currentData.forEach(module => {
    const chaptersArray = module[chaptersTableName] || [];
    const moduleDiv = document.createElement('div');
    moduleDiv.className = 'module-item' + (selectedModule?.id === module.id ? ' active' : '');
    moduleDiv.innerHTML = `
      <div class="module-item-title">${module.title}</div>
      <div class="module-item-subtitle">${chaptersArray.length || 0} chapters</div>
      <div class="module-item-actions">
        <button class="module-item-btn" data-action="edit-module" data-module-id="${module.id}" title="Edit Module">
          <i class="fas fa-edit"></i>
        </button>
        <button class="module-item-btn" data-action="delete-module" data-module-id="${module.id}" title="Delete Module">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      <div class="chapter-list" id="chapters-${module.id}"></div>
    `;

    moduleDiv.addEventListener('click', (e) => {
      if (!e.target.closest('.module-item-actions')) {
        selectModule(module);
      }
    });

    modulesList.appendChild(moduleDiv);

    // Render chapters
    if (chaptersArray && chaptersArray.length > 0) {
      const chaptersContainer = moduleDiv.querySelector(`#chapters-${module.id}`);
      chaptersArray.forEach(chapter => {
        const chapterDiv = document.createElement('div');
        chapterDiv.className = 'chapter-item' + (selectedChapter?.id === chapter.id ? ' active' : '');
        chapterDiv.textContent = chapter.title;
        chapterDiv.addEventListener('click', (e) => {
          e.stopPropagation();
          selectChapter(module, chapter);
        });
        chaptersContainer.appendChild(chapterDiv);
      });
    }
  });

  // Attach event listeners to action buttons
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      const moduleId = btn.getAttribute('data-module-id');
      const chapterId = btn.getAttribute('data-chapter-id');

      if (action === 'edit-module') {
        selectModule(currentData.find(m => m.id === moduleId));
      } else if (action === 'delete-module') {
        deleteModule(moduleId);
      } else if (action === 'edit-chapter') {
        const module = currentData.find(m => m.id === moduleId);
        const chapter = module[chaptersTableName].find(c => c.id === chapterId);
        selectChapter(module, chapter);
      } else if (action === 'delete-chapter') {
        deleteChapter(moduleId, chapterId);
      }
    });
  });

  // Attach search listener
  initializeSearchListener();
}

function selectModule(module) {
  selectedModule = module;
  selectedChapter = null;
  renderEditorContent();
  renderModulesList();
}

function selectChapter(module, chapter) {
  selectedModule = module;
  selectedChapter = chapter;
  renderEditorContent();
  renderModulesList();
}

function renderEditorContent() {
  const editorContent = document.getElementById('editor-content');

  if (!selectedModule) {
    editorContent.innerHTML = `
      <div class="no-selection">
        <i class="fas fa-inbox"></i>
        <p>Select a module or chapter to edit</p>
      </div>
    `;
    return;
  }

  if (selectedChapter) {
    renderChapterEditor(editorContent);
  } else {
    renderModuleEditor(editorContent);
  }
}

function renderModuleEditor(container) {
  const module = selectedModule;
  const chaptersArray = module[chaptersTableName] || [];
  container.innerHTML = `
    <div class="edit-form">
      <h2 style="margin-bottom: 24px;">${module.title}</h2>

      <div class="form-group">
        <label class="form-label">Module Title</label>
        <input type="text" class="form-input" id="edit-title" value="${module.title}" />
      </div>

      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="edit-description">${module.description || ''}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Duration</label>
        <input type="text" class="form-input" id="edit-duration" value="${module.duration || ''}" placeholder="e.g., 10 Days" />
      </div>

      <div class="form-actions">
        <button class="btn-save" id="save-module">
          <i class="fas fa-save"></i> Save Module
        </button>
        <button class="btn-delete" id="delete-module">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>

      <div class="chapters-section">
        <div class="chapters-header">
          <h3>Chapters (${chaptersArray.length || 0})</h3>
          <button class="btn-add-chapter" id="add-chapter">
            <i class="fas fa-plus"></i> Add Chapter
          </button>
        </div>

        <div class="chapters-list">
          ${chaptersArray?.map(ch => `
            <div class="chapter-card">
              <div class="chapter-card-header">
                <div style="flex: 1;">
                  <div class="chapter-card-title">${ch.title}</div>
                  <div class="chapter-card-id">ID: ${ch.id} • ${ch.duration || 'N/A'}</div>
                </div>
                <div class="chapter-card-actions">
                  <button class="chapter-card-btn edit" data-action="edit-chapter" data-chapter-id="${ch.id}">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="chapter-card-btn delete" data-action="delete-chapter" data-chapter-id="${ch.id}">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          `).join('') || '<p style="color: var(--text-muted);">No chapters yet</p>'}
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('save-module')?.addEventListener('click', saveModule);
  document.getElementById('delete-module')?.addEventListener('click', () => deleteModule(module.id));
  document.getElementById('add-chapter')?.addEventListener('click', addChapter);

  document.querySelectorAll('[data-action="edit-chapter"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const chapterId = btn.getAttribute('data-chapter-id');
      const chapter = chaptersArray.find(c => c.id === chapterId);
      if (chapter) selectChapter(module, chapter);
    });
  });

  document.querySelectorAll('[data-action="delete-chapter"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const chapterId = btn.getAttribute('data-chapter-id');
      deleteChapter(module.id, chapterId);
    });
  });
}

function renderChapterEditor(container) {
  const chapter = selectedChapter;
  const module = selectedModule;
  container.innerHTML = `
    <div class="edit-form">
      <h2 style="margin-bottom: 24px;">Edit Chapter</h2>

      <div class="form-group">
        <label class="form-label">Chapter ID</label>
        <input type="text" class="form-input" id="edit-ch-id" value="${chapter.id}" />
      </div>

      <div class="form-group">
        <label class="form-label">Chapter Title</label>
        <input type="text" class="form-input" id="edit-ch-title" value="${chapter.title}" />
      </div>

      <div class="form-group">
        <label class="form-label">Video ID (YouTube)</label>
        <input type="text" class="form-input" id="edit-ch-videoId" value="${chapter.video_id || ''}" placeholder="e.g., IYVEI1EYfPg" />
      </div>

      <div class="form-group">
        <label class="form-label">Duration</label>
        <input type="text" class="form-input" id="edit-ch-duration" value="${chapter.duration || ''}" placeholder="e.g., 3 hours" />
      </div>

      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="edit-ch-description">${chapter.description || ''}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Links (JSON Array)</label>
        <textarea class="form-textarea" id="edit-ch-links" style="font-family: monospace; font-size: 0.9rem;">${JSON.stringify(chapter.links || [], null, 2)}</textarea>
      </div>

      <div class="form-actions">
        <button class="btn-save" id="save-chapter">
          <i class="fas fa-save"></i> Save Chapter
        </button>
        <button class="btn-delete" id="delete-chapter">
          <i class="fas fa-trash"></i> Delete
        </button>
        <button class="btn-cancel" id="back-to-module">
          <i class="fas fa-arrow-left"></i> Back
        </button>
      </div>
    </div>
  `;

  document.getElementById('save-chapter')?.addEventListener('click', saveChapter);
  document.getElementById('delete-chapter')?.addEventListener('click', () => deleteChapter(module.id, chapter.id));
  document.getElementById('back-to-module')?.addEventListener('click', () => selectModule(module));
}

async function saveModule() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Please log in");
    return;
  }

  if (!modulesTableName) {
    alert("Table configuration not loaded");
    return;
  }

  const title = document.getElementById('edit-title').value;
  const description = document.getElementById('edit-description').value;
  const duration = document.getElementById('edit-duration').value;

  try {
    const { error } = await supabase
      .from(modulesTableName)
      .update({ title, description, duration })
      .eq('id', selectedModule.id);

    if (error) throw error;

    alert('Module saved successfully!');
    selectedModule.title = title;
    selectedModule.description = description;
    selectedModule.duration = duration;
    renderModulesList();
    renderEditorContent();
  } catch (err) {
    console.error(err);
    alert('Failed to save: ' + err.message);
  }
}

async function saveChapter() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Please log in");
    return;
  }

  if (!chaptersTableName) {
    alert("Table configuration not loaded");
    return;
  }

  const id = document.getElementById('edit-ch-id').value;
  const title = document.getElementById('edit-ch-title').value;
  const video_id = document.getElementById('edit-ch-videoId').value;
  const duration = document.getElementById('edit-ch-duration').value;
  const description = document.getElementById('edit-ch-description').value;
  
  let links = [];
  try {
    links = JSON.parse(document.getElementById('edit-ch-links').value);
  } catch (e) {
    alert('Links must be valid JSON');
    return;
  }

  try {
    const { error } = await supabase
      .from(chaptersTableName)
      .update({ title, video_id, duration, description, links })
      .eq('id', id);

    if (error) throw error;

    alert('Chapter saved successfully!');
    selectedChapter.title = title;
    selectedChapter.video_id = video_id;
    selectedChapter.duration = duration;
    selectedChapter.description = description;
    selectedChapter.links = links;
    selectModule(selectedModule);
  } catch (err) {
    console.error(err);
    alert('Failed to save: ' + err.message);
  }
}

async function deleteModule(moduleId) {
  if (!confirm('Are you sure you want to delete this module? This will also delete all its chapters.')) {
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Please log in");
    return;
  }

  if (!modulesTableName || !chaptersTableName) {
    alert("Table configuration not loaded");
    return;
  }

  try {
    await supabase.from(chaptersTableName).delete().eq('module_id', moduleId);
    await supabase.from(modulesTableName).delete().eq('id', moduleId);

    alert('Module deleted successfully!');
    currentData = currentData.filter(m => m.id !== moduleId);
    selectedModule = null;
    selectedChapter = null;
    renderModulesList();
    renderEditorContent();
  } catch (err) {
    console.error(err);
    alert('Failed to delete: ' + err.message);
  }
}

async function deleteChapter(moduleId, chapterId) {
  if (!confirm('Are you sure you want to delete this chapter?')) {
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    alert("Please log in");
    return;
  }

  if (!chaptersTableName) {
    alert("Table configuration not loaded");
    return;
  }

  try {
    await supabase.from(chaptersTableName).delete().eq('id', chapterId);

    alert('Chapter deleted successfully!');
    selectedModule.chapters = selectedModule.chapters.filter(c => c.id !== chapterId);
    selectedChapter = null;
    renderModulesList();
    renderEditorContent();
  } catch (err) {
    console.error(err);
    alert('Failed to delete: ' + err.message);
  }
}

function addChapter() {
  const newChapterId = prompt('Enter new chapter ID (e.g., 1.4):');
  if (!newChapterId) return;

  const chapter = {
    id: newChapterId,
    title: 'New Chapter',
    video_id: '',
    duration: '',
    description: '',
    links: []
  };

  selectedChapter = chapter;
  renderEditorContent();
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
      const chapters = item.querySelectorAll('.chapter-item');
      const matches = title.includes(query);
      
      let chapterMatches = false;
      chapters.forEach(ch => {
        const chTitle = ch.textContent.toLowerCase();
        if (chTitle.includes(query)) {
          ch.style.display = 'block';
          chapterMatches = true;
        } else {
          ch.style.display = 'none';
        }
      });

      item.style.display = matches || chapterMatches ? 'block' : 'none';
    });
  });
}