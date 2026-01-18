import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, Wallet } from '@/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  wallet: Wallet | null;
  loading: boolean;
  signUp: (email: string, password: string, username: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: (redirectAfter?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshWallet: () => Promise<void>;
  isProfileComplete: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  const isProfileComplete = Boolean(profile?.epic_username);

  const generateUniqueUsername = async (baseUsername: string): Promise<string> => {
    let username = baseUsername.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
    if (!username) username = 'user';
    
    // Check if base username is available
    const { data: existing } = await supabase
      .from('profiles')
      .select('username')
      .ilike('username', username)
      .maybeSingle();
    
    if (!existing) return username;
    
    // Add random suffix
    const suffix = Math.floor(Math.random() * 9999);
    return `${username.slice(0, 16)}${suffix}`;
  };

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data as Profile | null;
  };

  const createProfileForOAuthUser = async (sessionUser: User): Promise<Profile | null> => {
    const email = sessionUser.email || '';
    const baseUsername = email.split('@')[0] || 'user';
    const username = await generateUniqueUsername(baseUsername);
    
    const { data: newProfile, error } = await supabase
      .from('profiles')
      .insert({
        user_id: sessionUser.id,
        username,
        email,
        // epic_username remains null → profile is incomplete
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating profile for OAuth user:', error);
      return null;
    }
    
    return newProfile as Profile;
  };

  const fetchWallet = async (userId: string) => {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching wallet:', error);
      return null;
    }
    return data as Wallet | null;
  };

  const refreshProfile = useCallback(async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  }, [user]);

  const refreshWallet = useCallback(async () => {
    if (user) {
      const walletData = await fetchWallet(user.id);
      setWallet(walletData);
    }
  }, [user]);

  useEffect(() => {
    const initializeUserData = async (sessionUser: User) => {
      let profileData = await fetchProfile(sessionUser.id);
      
      // If no profile exists (new OAuth user), create one
      if (!profileData) {
        profileData = await createProfileForOAuthUser(sessionUser);
      }
      
      setProfile(profileData);
      const walletData = await fetchWallet(sessionUser.id);
      setWallet(walletData);
      setLoading(false);
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer profile/wallet fetch to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            initializeUserData(session.user);
          }, 0);
        } else {
          setProfile(null);
          setWallet(null);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setTimeout(() => {
          initializeUserData(session.user);
        }, 0);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Real-time subscription for wallet updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`wallet-${user.id}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'wallets', 
          filter: `user_id=eq.${user.id}` 
        },
        () => {
          refreshWallet();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user, refreshWallet]);

  const signUp = async (email: string, password: string, username: string) => {
    // First, check if username is available (case-insensitive)
    const { data: isAvailable, error: checkError } = await supabase.rpc('check_username_available', {
      p_username: username,
    });

    if (checkError) {
      console.error('Error checking username:', checkError);
      return { error: new Error('Failed to verify username availability') };
    }

    if (!isAvailable) {
      return { error: new Error('Username is already taken. Please choose a different one.') };
    }

    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) {
      return { error };
    }

    // Create profile after signup
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: data.user.id,
          username,
          email,
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        // Check for unique constraint violation
        if (profileError.code === '23505' && profileError.message.includes('username')) {
          return { error: new Error('Username is already taken. Please choose a different one.') };
        }
        return { error: new Error(profileError.message) };
      }
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error };
  };

  const signInWithGoogle = async (redirectAfter?: string) => {
    // Store redirect destination for after OAuth callback
    if (redirectAfter) {
      localStorage.setItem('auth_redirect', redirectAfter);
    }
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });

    return { error };
  };


  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setWallet(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        wallet,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
        refreshProfile,
        refreshWallet,
        isProfileComplete,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
