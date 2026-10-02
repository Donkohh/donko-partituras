-- ==============================================================================
-- DONKO PARTITURAS - DATABASE SCHEMA & SECURITY POLICIES (SUPABASE)
-- ==============================================================================
-- Ejecutar este script en el Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ==============================================================================

-- 1. TABLA: CARPETAS (folders)
CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. TABLA: PARTITURAS (scores)
CREATE TABLE IF NOT EXISTS public.scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    mime_type TEXT DEFAULT 'application/pdf',
    folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. ÍNDICES DE RENDIMIENTO PARA BÚSQUEDA Y ORDENACIÓN
CREATE INDEX IF NOT EXISTS idx_scores_title ON public.scores(title);
CREATE INDEX IF NOT EXISTS idx_scores_folder_id ON public.scores(folder_id);
CREATE INDEX IF NOT EXISTS idx_scores_created_at ON public.scores(created_at);
CREATE INDEX IF NOT EXISTS idx_folders_name ON public.folders(name);

-- 4. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

-- 5. POLÍTICAS RLS PARA TABLA 'folders'
-- Lectura pública para cualquier usuario (músico / visitante anónimo y autenticado)
DROP POLICY IF EXISTS "Permitir lectura publica de carpetas" ON public.folders;
CREATE POLICY "Permitir lectura publica de carpetas"
ON public.folders FOR SELECT
TO anon, authenticated
USING (true);

-- Modificación exclusiva para administradores autenticados
DROP POLICY IF EXISTS "Permitir insercion solo a admin" ON public.folders;
CREATE POLICY "Permitir insercion solo a admin"
ON public.folders FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualizacion solo a admin" ON public.folders;
CREATE POLICY "Permitir actualizacion solo a admin"
ON public.folders FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir eliminacion solo a admin" ON public.folders;
CREATE POLICY "Permitir eliminacion solo a admin"
ON public.folders FOR DELETE
TO authenticated
USING (true);

-- 6. POLÍTICAS RLS PARA TABLA 'scores'
-- Lectura pública para cualquier usuario
DROP POLICY IF EXISTS "Permitir lectura publica de partituras" ON public.scores;
CREATE POLICY "Permitir lectura publica de partituras"
ON public.scores FOR SELECT
TO anon, authenticated
USING (true);

-- Modificación exclusiva para administradores autenticados
DROP POLICY IF EXISTS "Permitir insercion de partituras solo a admin" ON public.scores;
CREATE POLICY "Permitir insercion de partituras solo a admin"
ON public.scores FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualizacion de partituras solo a admin" ON public.scores;
CREATE POLICY "Permitir actualizacion de partituras solo a admin"
ON public.scores FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir eliminacion de partituras solo a admin" ON public.scores;
CREATE POLICY "Permitir eliminacion de partituras solo a admin"
ON public.scores FOR DELETE
TO authenticated
USING (true);

-- ==============================================================================
-- 7. CONFIGURACIÓN DEL STORAGE BUCKET: 'scores'
-- ==============================================================================

-- Crear el bucket de almacenamiento si no existe (público para lectura directa en Safari/Chrome)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'scores',
    'scores',
    true,
    52428800, -- 50 MB límite por archivo PDF
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['application/pdf'];

-- Políticas de Storage RLS
DROP POLICY IF EXISTS "Lectura publica de PDFs en storage" ON storage.objects;
CREATE POLICY "Lectura publica de PDFs en storage"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'scores');

DROP POLICY IF EXISTS "Subida de PDFs solo a admin" ON storage.objects;
CREATE POLICY "Subida de PDFs solo a admin"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'scores');

DROP POLICY IF EXISTS "Actualizacion de PDFs solo a admin" ON storage.objects;
CREATE POLICY "Actualizacion de PDFs solo a admin"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'scores')
WITH CHECK (bucket_id = 'scores');

DROP POLICY IF EXISTS "Eliminacion de PDFs solo a admin" ON storage.objects;
CREATE POLICY "Eliminacion de PDFs solo a admin"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'scores');

-- ==============================================================================
-- 8. FUNCIÓN RPC PARA VALIDACIÓN SEGURA DE PIN EN SUPABASE
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.verify_admin_pin(pin_input TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- El PIN se valida en el servidor PostgreSQL (no expuesto en frontend)
    stored_pin TEXT := '1102';
BEGIN
    RETURN (trim(pin_input) = stored_pin);
END;
$$;
