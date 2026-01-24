-- Update avatar image URLs to use public folder paths for better caching/performance
UPDATE public.avatars SET image_url = '/avatars/rookie.png' WHERE name = 'Rookie';
UPDATE public.avatars SET image_url = '/avatars/dread.png' WHERE name = 'Dread';
UPDATE public.avatars SET image_url = '/avatars/drip.png' WHERE name = 'Drip';
UPDATE public.avatars SET image_url = '/avatars/beanie.png' WHERE name = 'Beanie';
UPDATE public.avatars SET image_url = '/avatars/galaxy.png' WHERE name = 'Galaxy';
UPDATE public.avatars SET image_url = '/avatars/salute.png' WHERE name = 'Salute';
UPDATE public.avatars SET image_url = '/avatars/progamer.png' WHERE name = 'ProGamer';
UPDATE public.avatars SET image_url = '/avatars/tcl.png' WHERE name = 'TCL';
UPDATE public.avatars SET image_url = '/avatars/hype.png' WHERE name = 'Hype';

-- Also update any profiles that have the old avatar URLs
UPDATE public.profiles 
SET avatar_url = '/avatars/' || SUBSTRING(avatar_url FROM '[^/]+$')
WHERE avatar_url LIKE '%/src/assets/avatars/%' OR avatar_url LIKE '/src/assets/avatars/%';

-- Update get_avatar_shop to exclude default avatar from shop listing
CREATE OR REPLACE FUNCTION public.get_avatar_shop()
RETURNS TABLE (
  id uuid,
  name text,
  image_url text,
  price_xp integer,
  is_default boolean,
  is_owned boolean,
  is_equipped boolean,
  sort_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_equipped_avatar_id uuid;
BEGIN
  -- Get current equipped avatar
  SELECT p.avatar_id INTO v_equipped_avatar_id
  FROM profiles p
  WHERE p.id = v_user_id;

  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    a.image_url,
    a.price_xp,
    a.is_default,
    -- Check if user owns this avatar
    EXISTS (
      SELECT 1 FROM user_avatars ua 
      WHERE ua.user_id = v_user_id AND ua.avatar_id = a.id
    ) OR a.is_default AS is_owned,
    -- Check if this is the equipped avatar
    (a.id = v_equipped_avatar_id) AS is_equipped,
    a.sort_order
  FROM avatars a
  WHERE a.is_active = true
    AND a.is_default = false  -- EXCLUDE default avatar from shop
  ORDER BY a.sort_order ASC;
END;
$$;

-- Create a separate function to get user's owned avatars (including default) for profile section
CREATE OR REPLACE FUNCTION public.get_user_avatars()
RETURNS TABLE (
  id uuid,
  name text,
  image_url text,
  is_default boolean,
  is_equipped boolean,
  sort_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_equipped_avatar_id uuid;
BEGIN
  -- Get current equipped avatar
  SELECT p.avatar_id INTO v_equipped_avatar_id
  FROM profiles p
  WHERE p.id = v_user_id;

  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    a.image_url,
    a.is_default,
    (a.id = v_equipped_avatar_id) AS is_equipped,
    a.sort_order
  FROM avatars a
  WHERE a.is_active = true
    AND (
      a.is_default = true  -- Default is always available
      OR EXISTS (
        SELECT 1 FROM user_avatars ua 
        WHERE ua.user_id = v_user_id AND ua.avatar_id = a.id
      )
    )
  ORDER BY a.is_default DESC, a.sort_order ASC;
END;
$$;