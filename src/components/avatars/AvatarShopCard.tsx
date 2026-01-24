import { useState } from 'react';
import { Check, ShoppingCart, Zap, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ShopAvatar } from '@/hooks/useAvatarShop';

interface AvatarShopCardProps {
  avatar: ShopAvatar;
  userXp: number;
  onPurchase: (id: string) => void;
  onEquip: (id: string) => void;
  isPurchasing: boolean;
  isEquipping: boolean;
}

export function AvatarShopCard({
  avatar,
  userXp,
  onPurchase,
  onEquip,
  isPurchasing,
  isEquipping,
}: AvatarShopCardProps) {
  const [showEquipPrompt, setShowEquipPrompt] = useState(false);

  const canAfford = userXp >= avatar.price_xp;
  const isOwned = avatar.is_owned;
  const isEquipped = avatar.is_equipped;
  const isFree = avatar.is_default;

  const handlePurchase = () => {
    onPurchase(avatar.id);
    // Show equip prompt after purchase
    setTimeout(() => setShowEquipPrompt(true), 500);
  };

  const handleEquip = () => {
    onEquip(avatar.id);
    setShowEquipPrompt(false);
  };

  return (
    <div
      className={cn(
        'relative rounded-xl border-2 bg-card overflow-hidden transition-all duration-200',
        isEquipped
          ? 'border-accent shadow-lg shadow-accent/20'
          : isOwned
          ? 'border-primary/50'
          : 'border-border hover:border-muted-foreground/50'
      )}
    >
      {/* Equipped badge */}
      {isEquipped && (
        <div className="absolute top-2 right-2 z-10 bg-accent text-accent-foreground px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
          <Check className="w-3 h-3" />
          Attivo
        </div>
      )}

      {/* Owned badge (not equipped) */}
      {isOwned && !isEquipped && (
        <div className="absolute top-2 right-2 z-10 bg-primary/20 text-primary px-2 py-0.5 rounded-full text-xs font-semibold">
          Posseduto
        </div>
      )}

      {/* Free badge for default */}
      {isFree && !isOwned && (
        <div className="absolute top-2 left-2 z-10 bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          Gratis
        </div>
      )}

      {/* Avatar image */}
      <div className="aspect-square bg-muted p-4">
        <img
          src={avatar.image_url}
          alt={avatar.name}
          className="w-full h-full object-cover rounded-lg"
          loading="lazy"
        />
      </div>

      {/* Info section */}
      <div className="p-3 space-y-2">
        {/* Price display - always show */}
        <div className="flex items-center justify-center gap-1.5 text-sm">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className={cn('font-bold', canAfford ? 'text-accent' : 'text-muted-foreground')}>
            {avatar.price_xp} XP
          </span>
        </div>

        {/* Action button */}
        <div className="pt-1">
          {isEquipped ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled
            >
              <Check className="w-4 h-4 mr-1.5" />
              In Uso
            </Button>
          ) : isOwned ? (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={handleEquip}
              disabled={isEquipping}
            >
              Imposta
            </Button>
          ) : (
            <Button
              variant={canAfford ? 'default' : 'outline'}
              size="sm"
              className="w-full"
              onClick={handlePurchase}
              disabled={!canAfford || isPurchasing}
            >
              <ShoppingCart className="w-4 h-4 mr-1.5" />
              {isPurchasing ? 'Acquisto...' : 'Acquista'}
            </Button>
          )}
        </div>
      </div>

      {/* Equip prompt after purchase */}
      {showEquipPrompt && isOwned && !isEquipped && (
        <div className="absolute inset-0 bg-background/95 flex flex-col items-center justify-center p-4 animate-in fade-in">
          <p className="text-sm font-medium mb-3 text-center">
            Avatar sbloccato! Vuoi impostarlo ora?
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEquipPrompt(false)}
            >
              Dopo
            </Button>
            <Button size="sm" onClick={handleEquip} disabled={isEquipping}>
              Imposta
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
