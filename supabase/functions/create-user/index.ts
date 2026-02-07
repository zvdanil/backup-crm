import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

serve(async (req) => {
  // Handle CORS preflight requests (OPTIONS)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // ТЕСТ: сразу возвращаем успех чтобы проверить доходит ли запрос
  return new Response(
    JSON.stringify({ message: 'Function reached!', test: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )

  try {
    // Создаем Supabase client из контекста запроса
    // В Supabase Edge Functions JWT автоматически передается через внутренний контекст
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization")!,
          },
        },
      },
    );

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    // Если не сработало - попробуем альтернативный способ
    if (userError || !user) {
      // Временно отключаем проверку авторизации для отладки
      // return new Response(
      //   JSON.stringify({ error: 'Unauthorized', details: userError?.message }),
      //   { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      // )

      // Пропускаем без проверки для теста
      console.log("[create-user] WARNING: Skipping auth check for debugging");
    } else {
      // Проверяем роль только если user найден
      const { data: profile } = await supabaseClient
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || (profile.role !== "owner" && profile.role !== "admin")) {
        return new Response(
          JSON.stringify({
            error: "Forbidden: Only owners and admins can create users",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Создаем admin client для создания пользователя
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Parse request body
    const { email, password, parentName, childName, role, isActive } =
      await req.json();

    if (!email || !password || !parentName || !childName) {
      throw new Error("Missing required fields");
    }

    // Create user using Admin API (bypasses rate limits)
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          parent_name: parentName,
          child_name: childName,
          full_name: parentName,
        },
      });

    if (authError) throw authError;
    if (!authData.user) throw new Error("User creation failed");

    // Wait a bit for trigger to create profile
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check if profile exists
    const { data: existingProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("id", authData.user.id)
      .maybeSingle();

    let profileData;

    if (existingProfile) {
      // Update existing profile
      const { data: updatedProfile, error: updateError } = await supabaseAdmin
        .from("user_profiles")
        .update({
          role: role || "newregistration",
          is_active: isActive !== undefined ? isActive : false,
          parent_name: parentName,
          child_name: childName,
          full_name: parentName,
        })
        .eq("id", authData.user.id)
        .select("*")
        .single();

      if (updateError) throw updateError;
      profileData = updatedProfile;
    } else {
      // Create profile explicitly
      const { data: createdProfile, error: createError } = await supabaseAdmin
        .from("user_profiles")
        .insert({
          id: authData.user.id,
          full_name: parentName,
          parent_name: parentName,
          child_name: childName,
          role: role || "newregistration",
          is_active: isActive !== undefined ? isActive : false,
        })
        .select("*")
        .single();

      if (createError) throw createError;
      profileData = createdProfile;
    }

    return new Response(JSON.stringify({ data: profileData, error: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        data: null,
        error: { message: error.message || "Internal server error" },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
