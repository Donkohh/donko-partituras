// ==============================================================================
// DONKO PARTITURAS - ADMIN PANEL CONTROLLER
// ==============================================================================
import { 
  loginWithPin, 
  logoutAdmin, 
  getAdminSession, 
  createFolder, 
  deleteFolder, 
  uploadPdfScore, 
  deleteScore, 
  renameScore,
  getFolders,
  getScores,
  getAllScores
} from './supabaseClient.js';
import { state, loadData, renderView, escapeHtml, formatBytes } from './app.js';

let isAdminAuthenticated = false;
let enteredPin = '';

// ==============================================================================
// INICIALIZACIÓN DEL MÓDULO ADMIN
// ==============================================================================
export async function initAdmin() {
  setupAdminModalEvents();
  setupUploadEvents();
  setupFolderAdminEvents();

  // Comprobar si ya existe una sesión de admin activa en Supabase
  const session = await getAdminSession();
  if (session) {
    setAdminState(true);
  }
}

function setAdminState(isAuth) {
  isAdminAuthenticated = isAuth;
  const adminPanel = document.getElementById('admin-panel');
  const adminBtn = document.getElementById('btn-admin');

  if (isAuth) {
    if (adminPanel) adminPanel.style.display = 'block';
    if (adminBtn) {
      adminBtn.innerHTML = '⚙️ Admin';
      adminBtn.classList.add('active');
    }
    updateAdminFolderSelect();
    renderAdminScoresList();
  } else {
    if (adminPanel) adminPanel.style.display = 'none';
    if (adminBtn) {
      adminBtn.innerHTML = '🔒';
      adminBtn.classList.remove('active');
    }
  }
}

// ==============================================================================
// MODAL DE PIN Y AUTENTICACIÓN
// ==============================================================================
export function openPinModal() {
  if (isAdminAuthenticated) {
    // Si ya está autenticado, hacer scroll hacia el panel de administración
    const adminPanel = document.getElementById('admin-panel');
    adminPanel?.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const modal = document.getElementById('pin-modal');
  const pinInput = document.getElementById('pin-input');
  enteredPin = '';
  if (pinInput) pinInput.value = '';
  modal?.classList.add('active');
  pinInput?.focus();
}

export function closePinModal() {
  const modal = document.getElementById('pin-modal');
  modal?.classList.remove('active');
  enteredPin = '';
  if (window.location.hash === '#admin') {
    history.replaceState(null, '', ' ');
  }
}

function setupAdminModalEvents() {
  const pinModal = document.getElementById('pin-modal');
  const pinCloseBtn = document.getElementById('pin-close-btn');
  const pinSubmitBtn = document.getElementById('pin-submit-btn');
  const pinInput = document.getElementById('pin-input');
  const logoutBtn = document.getElementById('btn-admin-logout');

  // Cerrar modal al hacer clic en cancelar o fondo
  pinCloseBtn?.addEventListener('click', closePinModal);
  pinModal?.addEventListener('click', (e) => {
    if (e.target === pinModal) closePinModal();
  });

  // Teclado numérico en pantalla (ideal para iPad / pantallas táctiles)
  document.querySelectorAll('.keypad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val');
      if (val === 'clear') {
        enteredPin = '';
      } else if (val === 'backspace') {
        enteredPin = enteredPin.slice(0, -1);
      } else if (val && enteredPin.length < 8) {
        enteredPin += val;
      }
      if (pinInput) pinInput.value = enteredPin ? '•'.repeat(enteredPin.length) : '';
    });
  });

  // Entrada de teclado físico en PC / iPad Magic Keyboard
  pinInput?.addEventListener('input', (e) => {
    enteredPin = e.target.value.replace(/\D/g, ''); // solo dígitos
    e.target.value = enteredPin ? '•'.repeat(enteredPin.length) : '';
  });

  pinInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitPinAuth();
    }
  });

  pinSubmitBtn?.addEventListener('click', submitPinAuth);

  // Cerrar sesión
  logoutBtn?.addEventListener('click', async () => {
    await logoutAdmin();
    setAdminState(false);
    showToast("Sesión administrativa cerrada.", "success");
    await loadData();
  });
}

async function submitPinAuth() {
  const submitBtn = document.getElementById('pin-submit-btn');
  const pinError = document.getElementById('pin-error');

  if (!enteredPin || enteredPin.length < 2) {
    if (pinError) pinError.textContent = "Por favor introduce el PIN.";
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Verificando...";
  }
  if (pinError) pinError.textContent = "";

  try {
    await loginWithPin(enteredPin);
    closePinModal();
    setAdminState(true);
    showToast("Bienvenido al panel de administración", "success");
    await loadData();
    
    // Desplazar vista al panel administrativo
    document.getElementById('admin-panel')?.scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    if (pinError) {
      pinError.textContent = error.message || "PIN incorrecto. Intenta de nuevo.";
    }
    enteredPin = '';
    const pinInput = document.getElementById('pin-input');
    if (pinInput) pinInput.value = '';
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Ingresar";
    }
  }
}

// ==============================================================================
// GESTIÓN DE CARPETAS
// ==============================================================================
function setupFolderAdminEvents() {
  const createFolderBtn = document.getElementById('btn-create-folder');
  const newFolderInput = document.getElementById('input-folder-name');

  createFolderBtn?.addEventListener('click', async () => {
    const name = newFolderInput?.value?.trim();
    if (!name) {
      showToast("Ingresa un nombre para la carpeta", "error");
      return;
    }

    try {
      createFolderBtn.disabled = true;
      await createFolder(name);
      if (newFolderInput) newFolderInput.value = '';
      showToast(`Carpeta "${name}" creada con éxito`, "success");
      await loadData();
      updateAdminFolderSelect();
    } catch (error) {
      showToast(error.message || "Error al crear carpeta", "error");
    } finally {
      createFolderBtn.disabled = false;
    }
  });

  newFolderInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      createFolderBtn?.click();
    }
  });
}

export function updateAdminFolderSelect() {
  const uploadFolderSelect = document.getElementById('upload-target-folder');
  const deleteFolderSelect = document.getElementById('admin-folders-list');

  if (uploadFolderSelect) {
    const currentValue = uploadFolderSelect.value;
    uploadFolderSelect.innerHTML = `
      <option value="">📁 Biblioteca General (Todas las partituras)</option>
      ${state.folders.map(f => `<option value="${f.id}">📁 Carpeta: ${escapeHtml(f.name)}</option>`).join('')}
    `;
    uploadFolderSelect.value = currentValue || "";
  }

  if (deleteFolderSelect) {
    if (state.folders.length === 0) {
      deleteFolderSelect.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">No hay carpetas creadas.</div>`;
    } else {
      deleteFolderSelect.innerHTML = state.folders.map(f => `
        <div class="score-item" style="cursor: default;">
          <div class="score-main">
            <span class="score-icon">📁</span>
            <span class="score-title">${escapeHtml(f.name)}</span>
          </div>
          <button class="btn btn-danger btn-sm" onclick="window.confirmDeleteFolder('${f.id}', '${escapeHtml(f.name)}')">
            🗑️ Eliminar
          </button>
        </div>
      `).join('');
    }
  }
}

// Modal de confirmación para eliminar carpeta
window.confirmDeleteFolder = function(folderId, folderName) {
  const modal = document.getElementById('delete-folder-modal');
  const titleEl = document.getElementById('delete-folder-name');
  const confirmBtn = document.getElementById('btn-confirm-delete-folder');
  const cancelBtn = document.getElementById('btn-cancel-delete-folder');

  if (titleEl) titleEl.textContent = folderName;
  modal?.classList.add('active');

  const handleCancel = () => {
    modal?.classList.remove('active');
    cleanup();
  };

  const handleConfirm = async () => {
    const deleteFilesRadio = document.querySelector('input[name="folder-delete-mode"]:checked');
    const deleteFiles = deleteFilesRadio?.value === 'with_files';

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Eliminando...";

    try {
      await deleteFolder(folderId, deleteFiles);
      showToast(`Carpeta "${folderName}" eliminada`, "success");
      modal?.classList.remove('active');
      await loadData();
      updateAdminFolderSelect();
    } catch (err) {
      showToast("Error al eliminar carpeta: " + err.message, "error");
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Continuar";
      cleanup();
    }
  };

  function cleanup() {
    confirmBtn?.removeEventListener('click', handleConfirm);
    cancelBtn?.removeEventListener('click', handleCancel);
  }

  confirmBtn?.addEventListener('click', handleConfirm);
  cancelBtn?.addEventListener('click', handleCancel);
};

// ==============================================================================
// SUBIDA DE ARCHIVOS (DRAG & DROP, MÚLTIPLE Y PROGRESO)
// ==============================================================================
function setupUploadEvents() {
  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('file-upload-input');

  dropzone?.addEventListener('click', () => fileInput?.click());

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer?.files?.length) {
      handleFilesSelected(Array.from(e.dataTransfer.files));
    }
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files?.length) {
      handleFilesSelected(Array.from(e.target.files));
      e.target.value = ''; // Reset input
    }
  });
}

async function handleFilesSelected(files) {
  const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');

  if (pdfFiles.length === 0) {
    showToast("Por favor selecciona archivos con formato PDF", "error");
    return;
  }

  const targetFolderId = document.getElementById('upload-target-folder')?.value || null;
  const progressContainer = document.getElementById('upload-progress-container');
  if (progressContainer) progressContainer.innerHTML = '';

  for (const file of pdfFiles) {
    await processSingleFileUpload(file, targetFolderId);
  }

  showToast(`Proceso de subida completado`, "success");
  await loadData();
  renderAdminScoresList();
}

async function processSingleFileUpload(file, folderId) {
  const progressContainer = document.getElementById('upload-progress-container');
  const fileId = 'prog_' + Math.random().toString(36).substr(2, 9);
  const baseTitle = file.name.replace(/\.pdf$/i, '').trim();

  // Crear elemento de progreso
  const progressItem = document.createElement('div');
  progressItem.className = 'progress-item';
  progressItem.id = fileId;
  progressItem.innerHTML = `
    <div class="progress-info">
      <span>📄 ${escapeHtml(file.name)}</span>
      <span class="progress-status" id="${fileId}_status">Verificando...</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" id="${fileId}_bar" style="width: 15%"></div>
    </div>
  `;
  progressContainer?.appendChild(progressItem);

  const statusBar = document.getElementById(`${fileId}_bar`);
  const statusText = document.getElementById(`${fileId}_status`);

  // 1. Comprobar si existe un archivo duplicado con el mismo título en el destino
  const existingScore = state.allScores.find(s => 
    s.title.toLowerCase() === baseTitle.toLowerCase() && 
    (folderId ? s.folder_id === folderId : s.folder_id === null)
  );

  let uploadTitle = baseTitle;
  let isReplace = false;
  let existingScoreId = null;

  if (existingScore) {
    // Pedir confirmación al usuario para resolver duplicado
    const resolution = await promptDuplicateResolution(file.name);
    if (resolution === 'cancel') {
      if (statusText) statusText.textContent = "Cancelado";
      if (statusBar) {
        statusBar.className = "progress-bar-fill error";
        statusBar.style.width = "100%";
      }
      return;
    } else if (resolution === 'keep_both') {
      uploadTitle = `${baseTitle} (copia)`;
    } else if (resolution === 'replace') {
      isReplace = true;
      existingScoreId = existingScore.id;
    }
  }

  // 2. Ejecutar la subida
  try {
    if (statusText) statusText.textContent = "Subiendo...";
    if (statusBar) statusBar.style.width = "65%";

    await uploadPdfScore({
      file,
      folderId,
      customTitle: uploadTitle,
      isReplace,
      existingScoreId
    });

    if (statusBar) {
      statusBar.style.width = "100%";
      statusBar.className = "progress-bar-fill success";
    }
    if (statusText) statusText.textContent = "Completado ✓";
  } catch (error) {
    console.error("Error subiendo archivo:", error);
    if (statusBar) {
      statusBar.style.width = "100%";
      statusBar.className = "progress-bar-fill error";
    }
    if (statusText) statusText.textContent = "Error: " + error.message;
  }
}

// Modal de resolución de duplicados
function promptDuplicateResolution(filename) {
  return new Promise((resolve) => {
    const modal = document.getElementById('duplicate-modal');
    const filenameEl = document.getElementById('duplicate-filename');
    const cancelBtn = document.getElementById('btn-dup-cancel');
    const keepBothBtn = document.getElementById('btn-dup-keep-both');
    const replaceBtn = document.getElementById('btn-dup-replace');

    if (filenameEl) filenameEl.textContent = filename;
    modal?.classList.add('active');

    const handleAction = (action) => {
      modal?.classList.remove('active');
      cancelBtn?.removeEventListener('click', onCancel);
      keepBothBtn?.removeEventListener('click', onKeepBoth);
      replaceBtn?.removeEventListener('click', onReplace);
      resolve(action);
    };

    const onCancel = () => handleAction('cancel');
    const onKeepBoth = () => handleAction('keep_both');
    const onReplace = () => handleAction('replace');

    cancelBtn?.addEventListener('click', onCancel);
    keepBothBtn?.addEventListener('click', onKeepBoth);
    replaceBtn?.addEventListener('click', onReplace);
  });
}

// ==============================================================================
// GESTIÓN Y ELIMINACIÓN DE PARTITURAS
// ==============================================================================
export function renderAdminScoresList() {
  const container = document.getElementById('admin-scores-table');
  if (!container) return;

  if (state.allScores.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 1rem 0;">No hay partituras registradas.</div>`;
    return;
  }

  // Ordenar alfabéticamente
  const sorted = [...state.allScores].sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));

  container.innerHTML = sorted.map(score => {
    const folderName = score.folder_id 
      ? (state.folders.find(f => f.id === score.folder_id)?.name || 'Carpeta') 
      : 'Biblioteca General';
    
    return `
      <div class="score-item" style="cursor: default;">
        <div class="score-main">
          <span class="score-icon">🎵</span>
          <div>
            <div class="score-title">${escapeHtml(score.title)}</div>
            <div class="score-meta" style="font-size: 0.75rem;">
              <span>📁 ${escapeHtml(folderName)}</span>
              ${score.file_size ? `<span>• ${formatBytes(score.file_size)}</span>` : ''}
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn btn-secondary btn-sm" onclick="window.promptRenameScore('${score.id}', '${escapeHtml(score.title)}')">
            ✏️
          </button>
          <button class="btn btn-danger btn-sm" onclick="window.confirmDeleteScore('${score.id}', '${score.file_path}', '${escapeHtml(score.title)}')">
            🗑️
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Modal de confirmación para eliminar partitura
window.confirmDeleteScore = function(scoreId, filePath, scoreTitle) {
  const modal = document.getElementById('delete-score-modal');
  const titleEl = document.getElementById('delete-score-name');
  const confirmBtn = document.getElementById('btn-confirm-delete-score');
  const cancelBtn = document.getElementById('btn-cancel-delete-score');

  if (titleEl) titleEl.textContent = `"${scoreTitle}"`;
  modal?.classList.add('active');

  const handleCancel = () => {
    modal?.classList.remove('active');
    cleanup();
  };

  const handleConfirm = async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Eliminando...";

    try {
      await deleteScore(scoreId, filePath);
      showToast(`Partitura eliminada correctamente`, "success");
      modal?.classList.remove('active');
      await loadData();
      renderAdminScoresList();
    } catch (err) {
      showToast("Error al eliminar: " + err.message, "error");
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Eliminar";
      cleanup();
    }
  };

  function cleanup() {
    confirmBtn?.removeEventListener('click', handleConfirm);
    cancelBtn?.removeEventListener('click', handleCancel);
  }

  confirmBtn?.addEventListener('click', handleConfirm);
  cancelBtn?.addEventListener('click', handleCancel);
};

// Renombrar partitura
window.promptRenameScore = async function(scoreId, currentTitle) {
  const newTitle = prompt("Nuevo nombre para la partitura:", currentTitle);
  if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
    try {
      await renameScore(scoreId, newTitle.trim());
      showToast("Partitura renombrada", "success");
      await loadData();
      renderAdminScoresList();
    } catch (err) {
      showToast("Error al renombrar: " + err.message, "error");
    }
  }
};

// ==============================================================================
// UTILIDAD: NOTIFICACIONES TOAST
// ==============================================================================
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
