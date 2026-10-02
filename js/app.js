// ==============================================================================
// DONKO PARTITURAS - PUBLIC APP CONTROLLER (SAFARI / IPAD / MOBILE / DESKTOP)
// ==============================================================================
import { getFolders, getScores, getAllScores, getPdfPublicUrl } from './supabaseClient.js';
import { initAdmin, openPinModal } from './admin.js';

// Estado global de la aplicación pública
export const state = {
  folders: [],
  scores: [],
  allScores: [],
  currentFolder: null, // null = biblioteca general
  searchQuery: '',
  isLoading: true
};

// ==============================================================================
// INICIALIZACIÓN
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  initAdmin();
  handleRoute();
  await loadData();
});

// Manejo de rutas mediante Hash para soportar navegación y deep-linking en Safari
window.addEventListener('hashchange', () => {
  handleRoute();
});

function handleRoute() {
  const hash = window.location.hash;
  if (hash === '#admin' || window.location.pathname.endsWith('/admin')) {
    openPinModal();
  } else if (hash.startsWith('#folder/')) {
    const folderId = hash.replace('#folder/', '');
    const folder = state.folders.find(f => f.id === folderId);
    if (folder) {
      selectFolder(folder);
    }
  } else if (state.currentFolder !== null && !hash.startsWith('#folder/')) {
    // Volver a la biblioteca general si el hash está vacío
    backToGeneralLibrary(false);
  }
}

// ==============================================================================
// CARGA DE DATOS DESDE SUPABASE
// ==============================================================================
export async function loadData() {
  state.isLoading = true;
  renderLoadingState();

  try {
    const [folders, scores, allScores] = await Promise.all([
      getFolders(),
      getScores(state.currentFolder ? state.currentFolder.id : null),
      getAllScores()
    ]);

    state.folders = folders;
    state.scores = scores;
    state.allScores = allScores;

    renderView();
  } catch (error) {
    console.error("Error cargando biblioteca:", error);
    renderErrorState("No se pudo conectar con la biblioteca. Revisa tu conexión a internet.");
  } finally {
    state.isLoading = false;
  }
}

// ==============================================================================
// RENDERIZADO DE LA INTERFAZ
// ==============================================================================
export function renderView() {
  renderBreadcrumb();
  renderFolders();
  renderScores();
  updateSearchClearButton();
}

function renderBreadcrumb() {
  const breadcrumbEl = document.getElementById('breadcrumb-container');
  if (!breadcrumbEl) return;

  if (state.currentFolder) {
    breadcrumbEl.innerHTML = `
      <div class="breadcrumb-bar">
        <button id="btn-back" class="btn-back" title="Volver a la biblioteca">
          ← Volver
        </button>
        <div class="breadcrumb-title">
          <span>📁</span>
          <span>${escapeHtml(state.currentFolder.name)}</span>
        </div>
      </div>
    `;
    document.getElementById('btn-back')?.addEventListener('click', () => backToGeneralLibrary());
    breadcrumbEl.style.display = 'block';
  } else {
    breadcrumbEl.style.display = 'none';
    breadcrumbEl.innerHTML = '';
  }
}

function renderFolders() {
  const foldersSection = document.getElementById('folders-section');
  const foldersGrid = document.getElementById('folders-grid');
  const foldersCount = document.getElementById('folders-count');

  if (!foldersSection || !foldersGrid) return;

  // Si estamos dentro de una carpeta o buscando, ocultamos la sección de carpetas
  if (state.currentFolder || state.searchQuery.trim() !== '') {
    foldersSection.style.display = 'none';
    return;
  }

  foldersSection.style.display = 'block';

  if (state.folders.length === 0) {
    foldersSection.style.display = 'none';
    return;
  }

  if (foldersCount) {
    foldersCount.textContent = `${state.folders.length}`;
  }

  // Contar partituras por carpeta
  const countsByFolder = {};
  state.allScores.forEach(s => {
    if (s.folder_id) {
      countsByFolder[s.folder_id] = (countsByFolder[s.folder_id] || 0) + 1;
    }
  });

  foldersGrid.innerHTML = state.folders.map(folder => {
    const count = countsByFolder[folder.id] || 0;
    return `
      <div class="folder-card" data-folder-id="${folder.id}">
        <span class="folder-icon">📁</span>
        <div class="folder-info">
          <div class="folder-name">${escapeHtml(folder.name)}</div>
          <div class="folder-badge">${count} ${count === 1 ? 'partitura' : 'partituras'}</div>
        </div>
      </div>
    `;
  }).join('');

  // Eventos de clic para abrir carpetas
  foldersGrid.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => {
      const folderId = card.getAttribute('data-folder-id');
      const folder = state.folders.find(f => f.id === folderId);
      if (folder) selectFolder(folder);
    });
  });
}

function renderScores() {
  const scoresContainer = document.getElementById('scores-container');
  const scoresTitle = document.getElementById('scores-title');
  const scoresCount = document.getElementById('scores-count');

  if (!scoresContainer) return;

  // Filtrado reactivo en memoria por búsqueda (insensible a mayúsculas/minúsculas y acentos)
  let filteredScores = state.scores;
  if (state.searchQuery.trim() !== '') {
    // La búsqueda se realiza sobre la vista activa (General o Carpeta actual)
    const searchSet = state.scores;
    const query = normalizeText(state.searchQuery.trim());
    filteredScores = searchSet.filter(score => normalizeText(score.title).includes(query));
  }

  // Ordenamiento alfabético automático
  filteredScores.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));

  if (scoresTitle) {
    if (state.currentFolder) {
      scoresTitle.textContent = `Partituras en ${state.currentFolder.name}`;
    } else if (state.searchQuery.trim() !== '') {
      scoresTitle.textContent = `Resultados de búsqueda`;
    } else {
      scoresTitle.textContent = `Biblioteca General`;
    }
  }

  if (scoresCount) {
    scoresCount.textContent = `${filteredScores.length}`;
  }

  if (filteredScores.length === 0) {
    if (state.searchQuery.trim() !== '') {
      scoresContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-text">No se encontraron partituras para "${escapeHtml(state.searchQuery)}".</div>
        </div>
      `;
    } else {
      scoresContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎵</div>
          <div class="empty-state-text">No hay partituras en esta sección aún.</div>
        </div>
      `;
    }
    return;
  }

  scoresContainer.innerHTML = `
    <div class="scores-list">
      ${filteredScores.map(score => {
        const sizeFormatted = score.file_size ? formatBytes(score.file_size) : '';
        return `
          <div class="score-item" data-score-path="${score.file_path}" data-score-title="${escapeHtml(score.title)}">
            <div class="score-main">
              <span class="score-icon">🎵</span>
              <span class="score-title">${escapeHtml(score.title)}</span>
            </div>
            <div class="score-meta">
              ${sizeFormatted ? `<span>${sizeFormatted}</span>` : ''}
              <span class="score-action-icon">↗</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Asignar evento para abrir PDF directamente en el visor nativo de Safari/navegador
  scoresContainer.querySelectorAll('.score-item').forEach(item => {
    item.addEventListener('click', () => {
      const filePath = item.getAttribute('data-score-path');
      openPdfInNativeViewer(filePath);
    });
  });
}

// ==============================================================================
// LECTURA DE PDF EN VISOR NATIVO (SAFARI / IPAD / CHROME)
// ==============================================================================
export function openPdfInNativeViewer(filePath) {
  if (!filePath) return;
  const publicUrl = getPdfPublicUrl(filePath);
  if (!publicUrl) {
    alert("No se pudo obtener el enlace del archivo.");
    return;
  }

  // En Safari para iPad, window.open con la URL directa del PDF aprovecha el visor nativo
  // completo con zoom táctil de alta definición, desplazamiento fluido y controles nativos de iOS.
  window.open(publicUrl, '_blank', 'noopener,noreferrer');
}

// ==============================================================================
// NAVEGACIÓN ENTRE CARPETAS
// ==============================================================================
export async function selectFolder(folder) {
  state.currentFolder = folder;
  window.location.hash = `#folder/${folder.id}`;
  state.isLoading = true;
  renderLoadingState();

  try {
    state.scores = await getScores(folder.id);
    renderView();
  } catch (err) {
    console.error("Error al cargar partituras de carpeta:", err);
  } finally {
    state.isLoading = false;
  }
}

export async function backToGeneralLibrary(updateHash = true) {
  state.currentFolder = null;
  if (updateHash) {
    window.location.hash = '';
  }
  state.isLoading = true;
  renderLoadingState();

  try {
    state.scores = await getScores(null);
    renderView();
  } catch (err) {
    console.error("Error al volver a la biblioteca general:", err);
  } finally {
    state.isLoading = false;
  }
}

// ==============================================================================
// EVENTOS Y BUSCADOR
// ==============================================================================
function setupEventListeners() {
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const brandLink = document.getElementById('brand-link');
  const adminBtn = document.getElementById('btn-admin');

  // Búsqueda en tiempo real
  searchInput?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderScores();
    renderFolders();
    updateSearchClearButton();
  });

  // Limpiar buscador
  searchClearBtn?.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = '';
      state.searchQuery = '';
      renderScores();
      renderFolders();
      updateSearchClearButton();
      searchInput.focus();
    }
  });

  // Logo vuelve al inicio
  brandLink?.addEventListener('click', (e) => {
    e.preventDefault();
    backToGeneralLibrary();
  });

  // Botón de administración
  adminBtn?.addEventListener('click', () => {
    openPinModal();
  });
}

function updateSearchClearButton() {
  const searchClearBtn = document.getElementById('search-clear-btn');
  if (!searchClearBtn) return;
  if (state.searchQuery.length > 0) {
    searchClearBtn.classList.add('visible');
  } else {
    searchClearBtn.classList.remove('visible');
  }
}

// ==============================================================================
// ESTADOS DE CARGA Y UTILIDADES
// ==============================================================================
function renderLoadingState() {
  const scoresContainer = document.getElementById('scores-container');
  if (scoresContainer) {
    scoresContainer.innerHTML = `
      <div class="empty-state">
        <div class="loading-spinner"></div>
        <div class="empty-state-text" style="margin-top: 1rem;">Cargando partituras...</div>
      </div>
    `;
  }
}

function renderErrorState(message) {
  const scoresContainer = document.getElementById('scores-container');
  if (scoresContainer) {
    scoresContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">${escapeHtml(message)}</div>
      </div>
    `;
  }
}

export function normalizeText(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
