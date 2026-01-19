import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface VipStatus {
  isVip: boolean;
  expiresAt: string | null;
  daysRemaining: number;
}

export function useVipStatus() {
  const { user } = useAuth();
  const [vipStatus, setVipStatus] = useState<VipStatus>({
    isVip: false,
    expiresAt: null,
    daysRemaining: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchVipStatus = useCallback(async () => {
    if (!user) {
      setVipStatus({ isVip: false, expiresAt: null, daysRemaining: 0 });
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('check_vip_status');
      
      if (error) throw error;

      const result = data as { is_vip: boolean; expires_at: string | null; days_remaining: number };
      
      setVipStatus({
        isVip: result.is_vip,
        expiresAt: result.expires_at,
        daysRemaining: result.days_remaining,
      });
    } catch (error) {
      console.error('Error fetching VIP status:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchVipStatus();
  }, [fetchVipStatus]);

  const purchaseVip = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.rpc('purchase_vip');
      
      if (error) throw error;

      const result = data as { success: boolean; error?: string; expires_at?: string; days_remaining?: number };
      
      if (result.success) {
        setVipStatus({
          isVip: true,
          expiresAt: result.expires_at || null,
          daysRemaining: result.days_remaining || 30,
        });
      }
      
      return { success: result.success, error: result.error };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  const sendTip = async (toUserId: string, amount: number): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.rpc('send_tip', {
        p_to_user_id: toUserId,
        p_amount: amount,
      });
      
      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      return { success: result.success, error: result.error };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  const changeUsername = async (newUsername: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.rpc('change_username_vip', {
        p_new_username: newUsername,
      });
      
      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  return {
    ...vipStatus,
    loading,
    refreshVipStatus: fetchVipStatus,
    purchaseVip,
    sendTip,
    changeUsername,
  };
}
