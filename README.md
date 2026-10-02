# 🎵 Donko Partituras

Biblioteca web de partituras para lectura en vivo (optimizada para iPad/Safari, móvil y PC) y administración protegida mediante **Supabase como backend administrado**.

---

## 📑 Índice
1. [Arquitectura y Respuestas de Diseño](#1-arquitectura-y-respuestas-de-diseño)
2. [Configuración Detallada de Supabase (11 Puntos)](#2-configuración-detallada-de-supabase-11-puntos)
3. [Estructura del Proyecto](#3-estructura-del-proyecto)
4. [Instrucciones de Despliegue Paso a Paso](#4-instrucciones-de-despliegue-paso-a-paso)
5. [Guía de Uso](#5-guía-de-uso)
6. [Seguridad y Protección del PIN](#6-seguridad-y-protección-del-pin)
7. [Plan de Pruebas y Criterios de Aceptación](#7-plan-de-pruebas-y-criterios-de-aceptación)

---

## 1. Arquitectura y Respuestas de Diseño

### 1.1 Autenticación Administrativa
- **Sin PIN en frontend:** El PIN inicial (`1102`) **nunca** se incluye en HTML, JavaScript, variables públicas ni LocalStorage.
- **Validación Server-Side:** Se realiza mediante la Supabase Edge Function `admin-auth` utilizando comparación en tiempo constante (`timingSafeEqual`) y retardo de protección contra fuerza bruta.
- **Sesión Criptográfica:** Tras validar el PIN, el backend genera tokens JWT de sesión de Supabase Auth (`access_token`, `refresh_token`), permitiendo que el cliente ejecute operaciones autorizadas a través de RLS en PostgreSQL y Storage.

### 1.2 Almacenamiento de PDFs
- Se utiliza **Supabase Storage** con el bucket dedicado `scores`.
- Límite de 50MB por archivo, validación estricta de tipo MIME `application/pdf` y sanitización de nombres de archivo.

### 1.3 Base de Datos
- PostgreSQL administrado en Supabase con dos tablas relacionales: `folders` y `scores`.
- Índices B-Tree optimizados en `title`, `folder_id` y `created_at` para búsquedas y ordenamientos en sub-milisegundos.

### 1.4 Row Level Security (RLS)
- **Lectura:** Pública para cualquier visitante anónimo (`anon`) y autenticado (`authenticated`).
- **Escritura / Modificación / Eliminación:** Estrictamente restringida a usuarios con rol `authenticated` (el administrador). Cualquier intento de modificación no autorizado por API directa es bloqueado a nivel de motor PostgreSQL con HTTP 401/403.

### 1.5 Carpetas
- Carpetas organizativas independientes (ej. *Ensayo martes*, *Concierto viernes*).
- Se listan automáticamente en orden alfabético junto con el conteo dinámico de partituras asociadas.

### 1.6 Copias Independientes de PDFs
- Al subir una partitura directamente a una carpeta (ej. `Santo.pdf` a *Ensayo martes*), se crean **dos registros y dos archivos físicos independientes** en Storage:
  1. `folders/<folder_id>/<uuid>_Santo.pdf` (asociado a la carpeta).
  2. `general/<uuid>_Santo.pdf` (asociado a la biblioteca general con `folder_id = null`).
- Modificar o eliminar la versión de la carpeta **no afecta** la copia de la biblioteca general.

### 1.7 Acceso Público de Lectura
- Los músicos acceden a la URL fija sin formularios de registro, login ni contraseñas.
- Al tocar una partitura, se utiliza el **visor PDF nativo de Safari/navegador**, garantizando rendimiento máximo, zoom táctil de alta definición, gestos táctiles de iOS y cero distorsión de color sobre las partituras musicales.

### 1.8 Operaciones Administrativas
- Subida múltiple simultánea con Drag & Drop y barras de progreso por archivo.
- Detección y resolución de archivos duplicados con diálogo interactivo (*Cancelar*, *Mantener ambos*, *Reemplazar*).
- Eliminación segura de carpetas con modal de decisión:
  - *Eliminar solamente la carpeta* (opción predeterminada y más segura).
  - *Eliminar la carpeta y sus partituras*.
- Eliminación individual de partituras con confirmación previa.
- Renombrado rápido de partituras.

### 1.9 Secretos
- El PIN (`ADMIN_PIN`), la llave `SUPABASE_SERVICE_ROLE_KEY` y las credenciales del servidor residen **exclusivamente en Supabase Secrets**.
- En el cliente solo se exponen `SUPABASE_URL` y `SUPABASE_ANON_KEY`, las cuales son públicas por diseño de Supabase y seguras gracias a RLS.

### 1.10 Despliegue
- Frontend estático ultra-liviano (Vanilla JS ES Modules, HTML5, CSS3) compatible con **Netlify**, **Vercel**, **Cloudflare Pages** o **GitHub Pages**, con costo mensual de **$0**.

---

## 2. Configuración Detallada de Supabase (11 Puntos)

### 1. Tablas a Crear
- `public.folders` (Carpetas organizativas)
- `public.scores` (Partituras y metadatos)

### 2. Columnas de Cada Tabla

#### Tabla `public.folders`
| Columna | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único |
| `name` | `TEXT` | `NOT NULL UNIQUE` | Nombre de la carpeta |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Fecha de creación |

#### Tabla `public.scores`
| Columna | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único |
| `title` | `TEXT` | `NOT NULL` | Nombre extraído del archivo |
| `filename` | `TEXT` | `NOT NULL` | Nombre original del archivo |
| `file_path` | `TEXT` | `NOT NULL` | Ruta del archivo en Storage |
| `file_size` | `BIGINT` | `NULL` | Tamaño en bytes |
| `mime_type` | `TEXT` | `DEFAULT 'application/pdf'` | Tipo MIME |
| `folder_id` | `UUID` | `REFERENCES public.folders(id) ON DELETE CASCADE` | ID de carpeta o `NULL` para general |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Fecha de subida |

### 3. Storage Buckets a Crear
- Bucket: `scores`

### 4. ¿Público o Privado y por qué?
- **Público (`public = true`)**: Permite la descarga y transmisión directa de los PDFs hacia el visor nativo de Safari/iPad vía URLs CDN directas sin consumo de cómputo serverless ni expiración de tokens durante ensayos de larga duración. Las operaciones de escritura (`INSERT`, `UPDATE`, `DELETE`) están bloqueadas por Storage RLS para usuarios no autenticados.

### 5. Políticas RLS

#### Para la tabla `folders`:
```sql
-- Lectura pública:
CREATE POLICY "Permitir lectura publica de carpetas" ON public.folders FOR SELECT TO anon, authenticated USING (true);
-- Escritura solo Admin:
CREATE POLICY "Permitir insercion solo a admin" ON public.folders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Permitir actualizacion solo a admin" ON public.folders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Permitir eliminacion solo a admin" ON public.folders FOR DELETE TO authenticated USING (true);
```

#### Para la tabla `scores`:
```sql
-- Lectura pública:
CREATE POLICY "Permitir lectura publica de partituras" ON public.scores FOR SELECT TO anon, authenticated USING (true);
-- Escritura solo Admin:
CREATE POLICY "Permitir insercion de partituras solo a admin" ON public.scores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Permitir actualizacion de partituras solo a admin" ON public.scores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Permitir eliminacion de partituras solo a admin" ON public.scores FOR DELETE TO authenticated USING (true);
```

#### Para el Storage Bucket `scores`:
```sql
CREATE POLICY "Lectura publica de PDFs en storage" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'scores');
CREATE POLICY "Subida de PDFs solo a admin" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'scores');
CREATE POLICY "Actualizacion de PDFs solo a admin" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'scores') WITH CHECK (bucket_id = 'scores');
CREATE POLICY "Eliminacion de PDFs solo a admin" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'scores');
```

### 6. Edge Functions Necesarias
- `admin-auth`: Valida el PIN en el servidor y entrega la sesión administrativa.

### 7. Variables de Entorno y Secretos

#### En Frontend (Público):
- `SUPABASE_URL`: `https://udzbqddjiurunqjcxahm.supabase.co`
- `SUPABASE_ANON_KEY`: `eyJhbGciOiJIUzI1NiIsInR5cCI...`

#### En Supabase Edge Functions (Secretos Privados):
- `ADMIN_PIN`: `1102`
- `SUPABASE_URL`: Inyectado automáticamente por Supabase
- `SUPABASE_ANON_KEY`: Inyectado automáticamente por Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Inyectado automáticamente por Supabase

### 8. Valores Públicos vs Secretos
- **Públicos:** URL de Supabase y Llave Anónima (`anon key`).
- **Secretos:** PIN de administración (`1102`), llave de servicio (`service_role key`), contraseñas y base de datos interna.

### 9. Cómo Configurar el Administrador
1. Ejecuta el script `supabase/schema.sql` en el SQL Editor de tu proyecto Supabase.
2. Despliega la función `admin-auth` con `ADMIN_PIN=1102` en Supabase CLI (`supabase secrets set ADMIN_PIN=1102`).

### 10. Cómo Conectar el Frontend con Supabase
- El archivo `js/config.js` contiene los parámetros de conexión listos y configurados.

### 11. Cómo Desplegar el Frontend
- Se sube el repositorio directamente a **Netlify** o **Vercel** (ambos detectarán automáticamente los archivos `netlify.toml` y `vercel.json`).

---

## 3. Estructura del Proyecto

```
donko-partituras/
├── index.html                     # Aplicación SPA (Biblioteca pública y Panel Admin)
├── css/
│   └── styles.css                 # Estilos oscuros modernos optimizados para iPad
├── js/
│   ├── config.js                  # Configuración pública de Supabase
│   ├── supabaseClient.js          # Cliente Supabase y métodos API
│   ├── app.js                     # Controlador público (búsqueda, carpetas, visor)
│   └── admin.js                   # Controlador del panel administrativo
├── supabase/
│   ├── schema.sql                 # Script SQL con tablas, índices, RLS y Storage
│   └── functions/
│       └── admin-auth/
│           └── index.ts           # Supabase Edge Function para validación segura de PIN
├── netlify.toml                   # Configuración para despliegue en Netlify
├── vercel.json                    # Configuración para despliegue en Vercel
├── package.json                   # Metadatos y scripts de desarrollo local
└── README.md                      # Documentación completa
```

---

## 4. Instrucciones de Despliegue Paso a Paso

### Paso 1: Configurar Supabase
1. Ingresa a tu panel de Supabase: [supabase.com/dashboard](https://supabase.com/dashboard).
2. Ve a **SQL Editor** > **New Query**.
3. Pega el contenido completo de `supabase/schema.sql` y presiona **Run**.

### Paso 2: Desplegar Edge Function (Opcional si usas CLI)
```bash
supabase functions deploy admin-auth --no-verify-jwt
supabase secrets set ADMIN_PIN=1102
```

### Paso 3: Desplegar Frontend en Netlify o Vercel
- **Netlify:**
  1. Conecta tu repositorio de GitHub en Netlify.
  2. Directorio de publicación: `.` (raíz).
  3. Despliega haciendo clic en **Deploy Site**.
- **Vercel:**
  1. Importa el repositorio en Vercel.
  2. Framework Preset: `Other`.
  3. Presiona **Deploy**.

---

## 5. Guía de Uso

1. **Para Músicos / Lectores:**
   - Abre la URL en Safari en el iPad.
   - Escribe en el buscador para encontrar cualquier partitura al instante.
   - Toca una carpeta (ej. *Concierto viernes*) para ver sus partituras específicas.
   - Toca cualquier partitura: se abrirá en el visor nativo de Safari.

2. **Para el Administrador:**
   - Toca el botón 🔒 en la esquina superior derecha (o accede a `/admin`).
   - Introduce el PIN `1102` en el teclado numérico.
   - **Subir partituras:** Selecciona el destino (Biblioteca general o carpeta) y arrastra tus archivos PDF.
   - **Crear carpetas:** Escribe el nombre en *Crear Carpeta* y presiona el botón.
   - **Eliminar carpetas:** Elige si deseas conservar o eliminar las partituras de dicha carpeta.

---

## 6. Plan de Pruebas y Verificación

- [x] Acceso público sin login ni contraseñas.
- [x] Búsqueda reactiva insensible a mayúsculas y tildes.
- [x] Apertura nativa de PDFs en Safari/iPad sin filtros oscuros alterando la música.
- [x] Subida múltiple simultánea con barra de progreso.
- [x] Manejo de duplicados (*Cancelar*, *Mantener ambos*, *Reemplazar*).
- [x] Independencia de copias entre carpetas y biblioteca general.
- [x] Protección de operaciones de base de datos y Storage mediante RLS.
- [x] PIN ausente en frontend, HTML, JS y LocalStorage.
