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

  try {
    // Создаем admin клиент
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Получаем JWT токен из запроса
    // Supabase SDK отправляет его либо в Authorization, либо в apikey
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    const apiKeyHeader = req.headers.get('apikey');
    const jwt = authHeader || apiKeyHeader;

    console.log("[create-user] JWT extraction:", {
      hasAuthHeader: !!authHeader,
      hasApiKey: !!apiKeyHeader,
      jwtLength: jwt?.length || 0,
    });

    if (!jwt) {
      return new Response(
        JSON.stringify({ error: "No authentication token provided" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Проверяем JWT и получаем пользователя через admin API
    const { data: { user }, error: userError } = 
      await supabaseAdmin.auth.getUser(jwt);

    console.log("[create-user] User verification:", {
      userId: user?.id,
      hasError: !!userError,
      errorMsg: userError?.message,
    });

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: `Unauthorized: ${userError?.message || "Invalid token"}`,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Проверяем роль пользователя
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    console.log("[create-user] Role check:", {
      hasProfile: !!profile  ,
      role: profile?.role,
    });

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
