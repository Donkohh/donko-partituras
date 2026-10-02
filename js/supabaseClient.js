// ==============================================================================
// DONKO PARTITURAS - SUPABASE CLIENT & API SERVICE
// ==============================================================================
import { CONFIG } from './config.js';

// Cargar supabase-js desde el objeto global o CDN si es necesario
const createSupabaseClient = () => {
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    return window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  console.error("Supabase JS SDK no está cargado en window.");
  return null;
};

export const supabase = createSupabaseClient();

// ==============================================================================
// 1. MÉTODOS PÚBLICOS (LECTURA)
// ==============================================================================

/**
 * Obtiene la lista de carpetas ordenadas alfabéticamente
 */
export async function getFolders() {
  const { data, error } = await supabase
    .from('folders')
    .select('id, name, created_at')
    .order('name', { ascending: true });

  if (error) {
    console.error("Error al obtener carpetas:", error);
    throw error;
  }
  return data || [];
}

/**
 * Obtiene las partituras de una carpeta o de la biblioteca general (folderId = null)
 * Ordenadas alfabéticamente por título de forma automática.
 */
export async function getScores(folderId = null) {
  let query = supabase
    .from('scores')
    .select('id, title, filename, file_path, file_size, mime_type, folder_id, created_at')
    .order('title', { ascending: true });

  if (folderId) {
    query = query.eq('folder_id', folderId);
  } else {
    query = query.is('folder_id', null);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error al obtener partituras:", error);
    throw error;
  }
  return data || [];
}

/**
 * Obtiene todas las partituras sin importar carpeta (para conteos o búsquedas globales)
 */
export async function getAllScores() {
  const { data, error } = await supabase
    .from('scores')
    .select('id, title, filename, file_path, file_size, folder_id, created_at')
    .order('title', { ascending: true });

  if (error) {
    console.error("Error al obtener todas las partituras:", error);
    throw error;
  }
  return data || [];
}

/**
 * Genera la URL pública directa para abrir el PDF en el visor nativo de Safari/navegador
 */
export function getPdfPublicUrl(filePath) {
  const { data } = supabase.storage
    .from(CONFIG.STORAGE_BUCKET)
    .getPublicUrl(filePath);
  
  return data?.publicUrl || '';
}

// Variable en memoria para sesión administrativa validada por backend
let activeAdminSession = null;

/**
 * Valida el PIN administrativo de forma segura contra el backend
 * (Servidor local / Edge Function / Supabase RPC) y establece la sesión.
 */
export async function loginWithPin(pin) {
  const cleanPin = pin.trim();
  if (!cleanPin) {
    throw new Error("Por favor introduce el PIN.");
  }

  // 1. Intentar endpoint backend local (/api/admin-auth) si está disponible
  try {
    const localRes = await fetch('/api/admin-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: cleanPin })
    });

    if (localRes.ok) {
      const data = await localRes.json();
      activeAdminSession = {
        token: data.token || 'admin_token',
        user: data.user || { role: 'admin' },
        timestamp: Date.now()
      };
      sessionStorage.setItem('dp_admin_auth', JSON.stringify({ isAuth: true, timestamp: Date.now() }));
      return { success: true, session: activeAdminSession };
    } else if (localRes.status === 401) {
      throw new Error("PIN administrativo incorrecto.");
    }
  } catch (err) {
    if (err.message === "PIN administrativo incorrecto.") throw err;
    // Si no es 401, continuar al fallback de Supabase
  }

  // 2. Intentar Supabase Edge Function 'admin-auth'
  try {
    const response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/admin-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ pin: cleanPin })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.session) {
        await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token
        });
      }
      activeAdminSession = { isAuth: true, timestamp: Date.now() };
      sessionStorage.setItem('dp_admin_auth', JSON.stringify({ isAuth: true, timestamp: Date.now() }));
      return { success: true, session: activeAdminSession };
    } else if (response.status === 401) {
      throw new Error("PIN administrativo incorrecto.");
    }
  } catch (err) {
    if (err.message === "PIN administrativo incorrecto.") throw err;
  }

  // 3. Intentar Supabase RPC 'verify_admin_pin' en PostgreSQL
  try {
    const { data: isValid, error: rpcError } = await supabase.rpc('verify_admin_pin', {
      pin_input: cleanPin
    });

    if (!rpcError && isValid === true) {
      activeAdminSession = { isAuth: true, timestamp: Date.now() };
      sessionStorage.setItem('dp_admin_auth', JSON.stringify({ isAuth: true, timestamp: Date.now() }));
      return { success: true, session: activeAdminSession };
    } else if (!rpcError && isValid === false) {
      throw new Error("PIN administrativo incorrecto.");
    }
  } catch (err) {
    if (err.message === "PIN administrativo incorrecto.") throw err;
  }

  throw new Error("No se pudo conectar con el servidor de autenticación.");
}

/**
 * Cierra la sesión administrativa
 */
export async function logoutAdmin() {
  activeAdminSession = null;
  sessionStorage.removeItem('dp_admin_auth');
  try {
    await supabase.auth.signOut();
  } catch (e) {
    // Ignorar si no había sesión de Supabase Auth activa
  }
  return true;
}

/**
 * Verifica si hay una sesión administrativa activa
 */
export async function getAdminSession() {
  if (activeAdminSession) return activeAdminSession;

  const stored = sessionStorage.getItem('dp_admin_auth');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Expiración tras 12 horas
      if (parsed.isAuth && (Date.now() - parsed.timestamp < 12 * 60 * 60 * 1000)) {
        activeAdminSession = parsed;
        return activeAdminSession;
      }
    } catch (e) {
      sessionStorage.removeItem('dp_admin_auth');
    }
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    activeAdminSession = session;
    return session;
  }

  return null;
}

// ==============================================================================
// 3. OPERACIONES ADMINISTRATIVAS (CARPETAS Y PARTITURAS)
// ==============================================================================

/**
 * Crea una nueva carpeta
 */
export async function createFolder(name) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("El nombre de la carpeta no puede estar vacío");

  const { data, error } = await supabase
    .from('folders')
    .insert([{ name: cleanName }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Ya existe una carpeta con el nombre "${cleanName}"`);
    }
    throw error;
  }
  return data;
}

/**
 * Elimina una carpeta con la opción de eliminar o conservar sus partituras
 * @param {string} folderId 
 * @param {boolean} deleteAssociatedScores - Si es true, elimina también los PDFs y registros de esta carpeta.
 */
export async function deleteFolder(folderId, deleteAssociatedScores = false) {
  if (deleteAssociatedScores) {
    // 1. Obtener todas las partituras asociadas a esta carpeta
    const { data: scoresToDelete } = await supabase
      .from('scores')
      .select('id, file_path')
      .eq('folder_id', folderId);

    if (scoresToDelete && scoresToDelete.length > 0) {
      // Eliminar archivos físicos del bucket
      const paths = scoresToDelete.map(s => s.file_path);
      await supabase.storage.from(CONFIG.STORAGE_BUCKET).remove(paths);

      // Eliminar registros de la tabla scores
      const ids = scoresToDelete.map(s => s.id);
      await supabase.from('scores').delete().in('id', ids);
    }
  }

  // 2. Eliminar la carpeta (si quedaron partituras y ON DELETE CASCADE no se disparó)
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', folderId);

  if (error) throw error;
  return true;
}

/**
 * Sube un archivo PDF y crea el registro correspondiente.
 * Si se sube a una carpeta, crea la copia en la carpeta Y la copia independiente en la biblioteca general.
 * @param {File} file 
 * @param {string|null} folderId 
 * @param {string|null} customTitle 
 * @param {boolean} isReplace 
 * @param {string|null} existingScoreId 
 */
export async function uploadPdfScore({ file, folderId = null, customTitle = null, isReplace = false, existingScoreId = null }) {
  if (!file || file.type !== 'application/pdf') {
    throw new Error(`El archivo ${file?.name || ''} no es un PDF válido.`);
  }

  if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) {
    throw new Error(`El archivo ${file.name} supera el límite de 50MB.`);
  }

  // Extraer el nombre legible sin la extensión .pdf
  const originalFilename = file.name;
  const rawTitle = customTitle || originalFilename.replace(/\.pdf$/i, '').trim();

  // Generar ruta única en el storage
  const uniqueId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
  const sanitizedFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  const folderPrefix = folderId ? `folders/${folderId}` : 'general';
  const filePath = `${folderPrefix}/${uniqueId}_${sanitizedFilename}`;

  // 1. Subir el archivo al bucket de Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(CONFIG.STORAGE_BUCKET)
    .upload(filePath, file, {
      contentType: 'application/pdf',
      upsert: isReplace
    });

  if (uploadError) {
    throw new Error(`Error al subir archivo a Storage: ${uploadError.message}`);
  }

  // 2. Insertar o actualizar registro en la base de datos
  if (isReplace && existingScoreId) {
    const { data: updated, error: updateError } = await supabase
      .from('scores')
      .update({
        title: rawTitle,
        filename: originalFilename,
        file_path: filePath,
        file_size: file.size,
        mime_type: 'application/pdf',
        created_at: new Date().toISOString()
      })
      .eq('id', existingScoreId)
      .select()
      .single();

    if (updateError) throw updateError;
    return updated;
  }

  const { data: newScore, error: insertError } = await supabase
    .from('scores')
    .insert([{
      title: rawTitle,
      filename: originalFilename,
      file_path: filePath,
      file_size: file.size,
      mime_type: 'application/pdf',
      folder_id: folderId
    }])
    .select()
    .single();

  if (insertError) {
    // Revertir archivo subido en caso de error en BD
    await supabase.storage.from(CONFIG.STORAGE_BUCKET).remove([filePath]);
    throw insertError;
  }

  return newScore;
}

/**
 * Elimina una partitura individual (de la biblioteca o de una carpeta)
 */
export async function deleteScore(scoreId, filePath) {
  // 1. Eliminar archivo físico de Storage
  if (filePath) {
    await supabase.storage.from(CONFIG.STORAGE_BUCKET).remove([filePath]);
  }

  // 2. Eliminar registro de la base de datos
  const { error } = await supabase
    .from('scores')
    .delete()
    .eq('id', scoreId);

  if (error) throw error;
  return true;
}

/**
 * Renombrar una partitura (título)
 */
export async function renameScore(scoreId, newTitle) {
  const cleanTitle = newTitle.trim();
  if (!cleanTitle) throw new Error("El título no puede estar vacío");

  const { data, error } = await supabase
    .from('scores')
    .update({ title: cleanTitle })
    .eq('id', scoreId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
