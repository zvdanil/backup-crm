import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  // Handle CORS preflight requests (OPTIONS)
  // Браузер отправляет preflight запрос перед основным запросом
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204, // No Content - правильный статус для OPTIONS
      headers: corsHeaders,
    })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    // Create Supabase client with service role key (admin)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify that the user making the request is authenticated and is owner/admin
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    // Check user role
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
      throw new Error('Forbidden: Only owners and admins can create users')
    }

    // Parse request body
    const { email, password, parentName, childName, role, isActive } = await req.json()

    if (!email || !password || !parentName || !childName) {
      throw new Error('Missing required fields')
    }

    // Create user using Admin API (bypasses rate limits)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        parent_name: parentName,
        child_name: childName,
        full_name: parentName,
      },
    })

    if (authError) throw authError
    if (!authData.user) throw new Error('User creation failed')

    // Wait a bit for trigger to create profile
    await new Promise(resolve => setTimeout(resolve, 500))

    // Check if profile exists
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('id', authData.user.id)
      .maybeSingle()

    let profileData

    if (existingProfile) {
      // Update existing profile
      const { data: updatedProfile, error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .update({
          role: role || 'newregistration',
          is_active: isActive !== undefined ? isActive : false,
          parent_name: parentName,
          child_name: childName,
          full_name: parentName,
        })
        .eq('id', authData.user.id)
        .select('*')
        .single()

      if (updateError) throw updateError
      profileData = updatedProfile
    } else {
      // Create profile explicitly
      const { data: createdProfile, error: createError } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          full_name: parentName,
          parent_name: parentName,
          child_name: childName,
          role: role || 'newregistration',
          is_active: isActive !== undefined ? isActive : false,
        })
        .select('*')
        .single()

      if (createError) throw createError
      profileData = createdProfile
    }

    return new Response(
      JSON.stringify({ data: profileData, error: null }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        data: null, 
        error: { message: error.message || 'Internal server error' } 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
