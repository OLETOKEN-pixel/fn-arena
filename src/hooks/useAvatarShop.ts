import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface ShopAvatar {
  id: string;
  name: string;
  image_url: string;
  price_xp: number;
  is_default: boolean;
  is_owned: boolean;
  is_equipped: boolean;
  sort_order: number;
}

interface PurchaseResult {
  success: boolean;
  error?: string;
  avatar_name?: string;
  image_url?: string;
  xp_spent?: number;
  required?: number;
  current?: number;
}

interface EquipResult {
  success: boolean;
  error?: string;
  image_url?: string;
}

export function useAvatarShop() {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch shop avatars with ownership status
  const {
    data: avatars = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['avatar-shop', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_avatar_shop');
      if (error) throw error;
      return (data as ShopAvatar[]) || [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: async (avatarId: string) => {
      const { data, error } = await supabase.rpc('purchase_avatar', {
        p_avatar_id: avatarId,
      });
      if (error) throw error;
      return data as unknown as PurchaseResult;
    },
    onSuccess: (result) => {
      if (result.success) {
        toast({
          title: '🎉 Avatar Acquistato!',
          description: `Hai sbloccato "${result.avatar_name}" per ${result.xp_spent} XP`,
        });
        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['avatar-shop'] });
        queryClient.invalidateQueries({ queryKey: ['user-xp'] });
      } else {
        let message = 'Acquisto fallito';
        if (result.error === 'insufficient_xp') {
          message = `XP insufficienti! Hai ${result.current} XP, servono ${result.required} XP`;
        } else if (result.error === 'already_owned') {
          message = 'Possiedi già questo avatar';
        } else if (result.error === 'avatar_not_found') {
          message = 'Avatar non trovato';
        }
        toast({
          title: 'Acquisto fallito',
          description: message,
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Errore',
        description: 'Impossibile completare l\'acquisto',
        variant: 'destructive',
      });
      console.error('Purchase error:', error);
    },
  });

  // Equip mutation
  const equipMutation = useMutation({
    mutationFn: async (avatarId: string) => {
      const { data, error } = await supabase.rpc('equip_avatar', {
        p_avatar_id: avatarId,
      });
      if (error) throw error;
      return data as unknown as EquipResult;
    },
    onSuccess: (result) => {
      if (result.success) {
        toast({
          title: '✓ Avatar Impostato',
          description: 'Il tuo avatar è stato aggiornato',
        });
        // Refresh profile to update avatar everywhere
        refreshProfile();
        queryClient.invalidateQueries({ queryKey: ['avatar-shop'] });
      } else {
        let message = 'Impossibile impostare l\'avatar';
        if (result.error === 'not_owned') {
          message = 'Non possiedi questo avatar';
        }
        toast({
          title: 'Errore',
          description: message,
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Errore',
        description: 'Impossibile impostare l\'avatar',
        variant: 'destructive',
      });
      console.error('Equip error:', error);
    },
  });

  // Derived data
  const ownedAvatars = avatars.filter((a) => a.is_owned);
  const equippedAvatar = avatars.find((a) => a.is_equipped);

  return {
    avatars,
    ownedAvatars,
    equippedAvatar,
    isLoading,
    error,
    purchaseAvatar: purchaseMutation.mutate,
    equipAvatar: equipMutation.mutate,
    isPurchasing: purchaseMutation.isPending,
    isEquipping: equipMutation.isPending,
  };
}
