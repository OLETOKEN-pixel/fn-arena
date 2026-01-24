import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAvatarShop } from '@/hooks/useAvatarShop';

export function ProfileAvatarSection() {
  const {
    ownedAvatars,
    equippedAvatar,
    isLoading,
    equipAvatar,
    isEquipping,
  } = useAvatarShop();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="w-16 h-16 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Il Mio Avatar</CardTitle>
        <CardDescription>
          Seleziona un avatar tra quelli sbloccati ({ownedAvatars.length} posseduti)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 flex-wrap">
          {ownedAvatars.map((avatar) => {
            const isActive = avatar.id === equippedAvatar?.id;
            return (
              <button
                key={avatar.id}
                onClick={() => !isActive && equipAvatar(avatar.id)}
                disabled={isActive || isEquipping}
                className={cn(
                  'relative w-16 h-16 rounded-full overflow-hidden border-2 transition-all',
                  isActive
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border hover:border-muted-foreground cursor-pointer'
                )}
              >
                <img
                  src={avatar.image_url}
                  alt="Avatar"
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                {isActive && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <Check className="w-6 h-6 text-primary" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {ownedAvatars.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Non hai ancora avatar. Visita lo Shop in Challenges per sbloccarne!
          </p>
        )}

        <Button
          variant="link"
          className="mt-4 p-0 h-auto text-sm"
          asChild
        >
          <Link to="/challenges">Vai allo Shop Avatar →</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
