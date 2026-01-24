import { Skeleton } from '@/components/ui/skeleton';
import { AvatarShopCard } from './AvatarShopCard';
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
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="rounded-xl border border-border overflow-hidden">
            <Skeleton className="aspect-square" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-16 mx-auto" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (avatars.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Nessun avatar disponibile nello shop</p>
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
