-- Create RPC to set user role (admin only)
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id UUID,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
BEGIN
  -- Check admin permission
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non autorizzato');
  END IF;

  -- Validate role
  IF p_role NOT IN ('admin', 'user') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ruolo non valido');
  END IF;

  -- Update user_roles (source of truth)
  IF p_role = 'admin' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles 
    WHERE user_id = p_user_id AND role = 'admin'::app_role;
  END IF;

  -- Sync profiles.role for UI compatibility
  UPDATE public.profiles 
  SET role = p_role, updated_at = now()
  WHERE user_id = p_user_id;

  -- Log admin action
  INSERT INTO public.admin_action_logs (admin_user_id, action_type, target_type, target_id, details)
  VALUES (v_admin_id, 'set_role', 'user', p_user_id, 
    jsonb_build_object('new_role', p_role));

  RETURN jsonb_build_object('success', true, 'role', p_role);
END;
$$;

-- Grant execute to authenticated users (RPC checks is_admin internally)
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) TO authenticated;

-- Fix: Sync crescitaesponenziale's profiles.role with user_roles
UPDATE public.profiles 
SET role = 'admin', updated_at = now()
WHERE user_id = '5778baef-fb11-4191-9683-17cc4c3f2a23';