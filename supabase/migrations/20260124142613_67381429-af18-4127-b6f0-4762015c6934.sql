-- =====================================================
-- AVATAR SHOP SYSTEM - Complete Implementation
-- =====================================================

-- 1. Create avatars catalog table
CREATE TABLE public.avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_url text NOT NULL,
  price_xp integer NOT NULL DEFAULT 500,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only ONE avatar can be default
CREATE UNIQUE INDEX idx_avatars_single_default ON public.avatars (is_default) WHERE is_default = true;

-- 2. Create user_avatars ownership table
CREATE TABLE public.user_avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_id uuid NOT NULL REFERENCES public.avatars(id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, avatar_id)
);

-- 3. Add avatar_id to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avatar_id uuid REFERENCES public.avatars(id);

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_avatars ENABLE ROW LEVEL SECURITY;

-- Avatars: everyone can view active avatars
CREATE POLICY "Anyone can view active avatars" 
ON public.avatars FOR SELECT 
USING (is_active = true);

-- User avatars: users can view their own
CREATE POLICY "Users can view own avatars" 
ON public.user_avatars FOR SELECT 
USING (auth.uid() = user_id);

-- =====================================================
-- RPC: PURCHASE AVATAR
-- =====================================================
CREATE OR REPLACE FUNCTION public.purchase_avatar(p_avatar_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_price integer;
  v_current_xp integer;
  v_avatar_name text;
  v_image_url text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Get avatar details
  SELECT price_xp, name, image_url INTO v_price, v_avatar_name, v_image_url
  FROM avatars WHERE id = p_avatar_id AND is_active = true;
  
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'avatar_not_found');
  END IF;

  -- Check if already owned
  IF EXISTS (SELECT 1 FROM user_avatars WHERE user_id = v_user_id AND avatar_id = p_avatar_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_owned');
  END IF;

  -- Get current XP with lock
  SELECT total_xp INTO v_current_xp FROM user_xp WHERE user_id = v_user_id FOR UPDATE;
  v_current_xp := COALESCE(v_current_xp, 0);

  IF v_current_xp < v_price THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'insufficient_xp', 
      'required', v_price, 
      'current', v_current_xp
    );
  END IF;

  -- Deduct XP
  UPDATE user_xp 
  SET total_xp = total_xp - v_price, updated_at = now() 
  WHERE user_id = v_user_id;

  -- Grant avatar ownership
  INSERT INTO user_avatars (user_id, avatar_id) VALUES (v_user_id, p_avatar_id);

  RETURN jsonb_build_object(
    'success', true, 
    'avatar_name', v_avatar_name, 
    'image_url', v_image_url,
    'xp_spent', v_price
  );
END;
$$;

-- =====================================================
-- RPC: EQUIP AVATAR
-- =====================================================
CREATE OR REPLACE FUNCTION public.equip_avatar(p_avatar_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_image_url text;
  v_is_default boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Get avatar info
  SELECT image_url, is_default INTO v_image_url, v_is_default
  FROM avatars WHERE id = p_avatar_id AND is_active = true;

  IF v_image_url IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'avatar_not_found');
  END IF;

  -- Verify ownership (default avatar is always allowed)
  IF NOT v_is_default AND NOT EXISTS (
    SELECT 1 FROM user_avatars WHERE user_id = v_user_id AND avatar_id = p_avatar_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_owned');
  END IF;

  -- Update profile
  UPDATE profiles 
  SET avatar_id = p_avatar_id, avatar_url = v_image_url, updated_at = now()
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object('success', true, 'image_url', v_image_url);
END;
$$;

-- =====================================================
-- RPC: GET AVATAR SHOP
-- =====================================================
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
  v_equipped_id uuid;
BEGIN
  -- Get user's currently equipped avatar
  SELECT p.avatar_id INTO v_equipped_id FROM profiles p WHERE p.user_id = v_user_id;

  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    a.image_url,
    a.price_xp,
    a.is_default,
    (ua.id IS NOT NULL OR a.is_default) AS is_owned,
    (a.id = v_equipped_id) AS is_equipped,
    a.sort_order
  FROM avatars a
  LEFT JOIN user_avatars ua ON ua.avatar_id = a.id AND ua.user_id = v_user_id
  WHERE a.is_active = true
  ORDER BY a.is_default DESC, a.sort_order ASC, a.created_at ASC;
END;
$$;

-- =====================================================
-- TRIGGER: ASSIGN DEFAULT AVATAR TO NEW USERS
-- =====================================================
CREATE OR REPLACE FUNCTION public.assign_default_avatar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_avatar_id uuid;
  v_default_image_url text;
BEGIN
  -- Get default avatar
  SELECT id, image_url INTO v_default_avatar_id, v_default_image_url
  FROM avatars WHERE is_default = true LIMIT 1;

  IF v_default_avatar_id IS NOT NULL THEN
    -- Grant ownership of default avatar
    INSERT INTO user_avatars (user_id, avatar_id)
    VALUES (NEW.user_id, v_default_avatar_id)
    ON CONFLICT DO NOTHING;

    -- Set as active avatar if not already set
    UPDATE profiles 
    SET avatar_id = v_default_avatar_id, avatar_url = v_default_image_url
    WHERE user_id = NEW.user_id AND avatar_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on profiles insert
DROP TRIGGER IF EXISTS trg_assign_default_avatar ON profiles;
CREATE TRIGGER trg_assign_default_avatar
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION assign_default_avatar();

-- =====================================================
-- SEED AVATARS DATA
-- =====================================================
INSERT INTO public.avatars (name, image_url, price_xp, is_default, sort_order) VALUES
  ('Rookie', '/src/assets/avatars/rookie.png', 0, true, 0),
  ('Dread', '/src/assets/avatars/dread.png', 500, false, 1),
  ('Drip', '/src/assets/avatars/drip.png', 500, false, 2),
  ('Beanie', '/src/assets/avatars/beanie.png', 500, false, 3),
  ('Galaxy', '/src/assets/avatars/galaxy.png', 500, false, 4),
  ('Salute', '/src/assets/avatars/salute.png', 500, false, 5),
  ('Pro Gamer', '/src/assets/avatars/progamer.png', 500, false, 6),
  ('TCL', '/src/assets/avatars/tcl.png', 500, false, 7),
  ('Hype', '/src/assets/avatars/hype.png', 500, false, 8);

-- =====================================================
-- GRANT DEFAULT AVATAR TO EXISTING USERS
-- =====================================================
DO $$
DECLARE
  v_default_avatar_id uuid;
  v_default_image_url text;
BEGIN
  SELECT id, image_url INTO v_default_avatar_id, v_default_image_url
  FROM avatars WHERE is_default = true LIMIT 1;

  IF v_default_avatar_id IS NOT NULL THEN
    -- Grant ownership to all existing users
    INSERT INTO user_avatars (user_id, avatar_id)
    SELECT p.user_id, v_default_avatar_id
    FROM profiles p
    ON CONFLICT DO NOTHING;

    -- Set as active for users without avatar
    UPDATE profiles 
    SET avatar_id = v_default_avatar_id, avatar_url = v_default_image_url
    WHERE avatar_id IS NULL;
  END IF;
END;
$$;