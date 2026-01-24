import { AvatarShopCard } from './AvatarShopCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { ShopAvatar } from '@/hooks/useAvatarShop';

interface AvatarGridProps {
  avatars: ShopAvatar[];
  userXp: number;
  onPurchase: (id: string) => void;
  onEquip: (id: string) => void;
  isPurchasing: boolean;
  isEquipping: boolean;
  isLoading?: boolean;
}

export function AvatarGrid({
  avatars,
  userXp,
  onPurchase,
  onEquip,
  isPurchasing,
  isEquipping,
  isLoading,
}: AvatarGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
        ))}
      </div>
    );
  }

  if (avatars.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Nessun avatar disponibile</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {avatars.map((avatar) => (
        <AvatarShopCard
          key={avatar.id}
          avatar={avatar}
          userXp={userXp}
          onPurchase={onPurchase}
          onEquip={onEquip}
          isPurchasing={isPurchasing}
          isEquipping={isEquipping}
        />
      ))}
    </div>
  );
}
