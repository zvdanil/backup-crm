import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get environment variables
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ 
        error: 'Missing environment variables',
        message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
      });
    }

    // Verify authorization
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Verify that the user making the request is authenticated and is owner/admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check user role
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden: Only owners and admins can create users' });
    }

    // Parse request body
    const { email, password, parentName, childName, role, isActive } = req.body;

    if (!email || !password || !parentName || !childName) {
      return res.status(400).json({ error: 'Missing required fields' });
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
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }
    if (!authData.user) {
      return res.status(400).json({ error: 'User creation failed' });
    }

    // Wait a bit for trigger to create profile
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if profile exists
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('id', authData.user.id)
      .maybeSingle();

    let profileData;

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
        .single();

      if (updateError) {
        return res.status(400).json({ error: updateError.message });
      }
      profileData = updatedProfile;
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
        .single();

      if (createError) {
        return res.status(400).json({ error: createError.message });
      }
      profileData = createdProfile;
    }

    return res.status(200).json({ data: profileData, error: null });
  } catch (error: any) {
    console.error('[API create-user] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      data: null 
    });
  }
}
