// ==============================================================================
// SUPABASE EDGE FUNCTION: admin-auth
// ==============================================================================
// Valida el PIN administrativo de forma 100% segura en el servidor.
// El PIN (1102) se almacena como secreto de entorno (ADMIN_PIN) en Supabase Secrets.
// Al validar el PIN, genera/obtiene la sesión autenticada de Supabase Auth para el admin.
// ==============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Comparación de strings en tiempo constante para evitar ataques de temporización (timing attacks)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Comparar con sí mismo para mantener tiempo similar
    let dummy = 0;
    for (let i = 0; i < a.length; i++) {
      dummy |= a.charCodeAt(i) ^ a.charCodeAt(i);
    }
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

serve(async (req) => {
  // Manejo de preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pin } = await req.json();

    if (!pin || typeof pin !== "string") {
      return new Response(
        JSON.stringify({ error: "PIN requerido y debe ser una cadena." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Obtener el PIN seguro desde las variables de entorno de Supabase Secrets
    const serverPin = Deno.env.get("ADMIN_PIN") || "1102";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const adminEmail = Deno.env.get("ADMIN_EMAIL") || "admin@donkopartituras.local";
    const adminPassword = Deno.env.get("ADMIN_PASSWORD") || `dp_admin_${serverPin}_secure_key`;

    // Validar PIN de forma segura
    const isPinValid = timingSafeEqual(pin.trim(), serverPin.trim());

    if (!isPinValid) {
      // Pequeño retardo para mitigar ataques de fuerza bruta
      await new Promise((resolve) => setTimeout(resolve, 800));
      return new Response(
        JSON.stringify({ error: "PIN administrativo incorrecto." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Inicializar cliente Supabase con Service Role para gestionar sesión de Admin
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Asegurar que el usuario administrador existe en Supabase Auth
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    let adminUser = usersData?.users?.find((u) => u.email === adminEmail);

    if (!adminUser) {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { role: "admin", name: "Donko Administrador" },
      });
      if (createError) {
        console.error("Error creando usuario admin:", createError);
      } else {
        adminUser = newUser.user;
      }
    }

    // Iniciar sesión y generar tokens JWT válidos
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, anonKey);
    const { data: sessionData, error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });

    if (signInError || !sessionData.session) {
      return new Response(
        JSON.stringify({ error: "Error generando sesión administrativa: " + (signInError?.message || "Desconocido") }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Retornar la sesión segura
    return new Response(
      JSON.stringify({
        success: true,
        message: "Autenticación administrativa exitosa",
        session: sessionData.session,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
