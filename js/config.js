// ==============================================================================
// DONKO PARTITURAS - CONFIGURACIÓN DEL CLIENTE
// ==============================================================================
// Solo contiene URLs y llaves públicas (anon key).
// Los secretos y el PIN NUNCA se encuentran en este archivo.
// ==============================================================================

export const CONFIG = {
  // URL del proyecto Supabase (endpoint estándar de la API de Supabase)
  SUPABASE_URL: window.ENV?.SUPABASE_URL || "https://udzbqddjiurunqjcxahm.supabase.co",
  
  // Llave anónima pública de Supabase (segura para el cliente, protegida por RLS)
  SUPABASE_ANON_KEY: window.ENV?.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkemJxZGRqaXVydW5xamN4YWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4Nzg3NzcsImV4cCI6MjEwNjQ1NDc3N30.F4C7-UPCQSIVKKraz9ag33GMdzQ1P2n3MEqz8JpL-No",
  
  // Nombre del Storage Bucket configurado en Supabase
  STORAGE_BUCKET: "scores",
  
  // Nombre de la aplicación
  APP_NAME: "Donko Partituras",
  
  // Límite de tamaño máximo por archivo PDF (50 MB)
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024
};
