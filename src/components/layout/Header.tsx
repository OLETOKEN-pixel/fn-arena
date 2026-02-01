import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, LogOut, Menu, X, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { useVipStatus } from '@/hooks/useVipStatus';
import { CoinIcon } from '@/components/common/CoinIcon';
import { PlayerSearchBar } from '@/components/common/PlayerSearchBar';
import { NotificationsDropdown } from '@/components/notifications/NotificationsDropdown';
import { VipBanner } from '@/components/vip/VipBanner';
import { VipModal } from '@/components/vip/VipModal';
import { TipModal } from '@/components/vip/TipModal';

// Social Icons
const XIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

interface HeaderProps {
  onMobileMenuToggle?: () => void;
  isMobileMenuOpen?: boolean;
}

export function Header({ onMobileMenuToggle, isMobileMenuOpen }: HeaderProps) {
  const { user, profile, wallet, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const { isVip } = useVipStatus();
  const navigate = useNavigate();
  const [showVipModal, setShowVipModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="h-full px-4 lg:px-6 flex items-center justify-between gap-4">
        {/* Left side: Mobile menu + Search */}
        <div className="flex items-center gap-3">
          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMobileMenuToggle}
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </Button>

          {/* Player Search Bar */}
          <PlayerSearchBar />
        </div>

        {/* Center: Tip Button (visible to all logged-in users) */}
        {user && (
          <div className="hidden sm:flex items-center">
            <Button
              onClick={() => setShowTipModal(true)}
              className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 text-black font-bold hover:from-amber-400 hover:via-yellow-400 hover:to-amber-300 shadow-lg shadow-amber-500/20 transition-all duration-200 hover:scale-105 hover:shadow-amber-500/30"
            >
              <Gift className="w-4 h-4 mr-2" />
              Send Tip
            </Button>
          </div>
        )}

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <>
              {/* VIP Banner */}
              <VipBanner onClick={() => setShowVipModal(true)} />

              {/* Social Icons */}
              <div className="hidden lg:flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href="https://x.com/oleboytokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-muted-foreground hover:text-accent transition-all duration-200 hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                    >
                      <XIcon />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>X (Twitter)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href="https://www.tiktok.com/@oleboytokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-muted-foreground hover:text-accent transition-all duration-200 hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                    >
                      <TikTokIcon />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>TikTok</TooltipContent>
                </Tooltip>
              </div>

              {/* Wallet balance with clickable coin */}
              <Link
                to="/wallet"
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors group"
              >
                <CoinIcon 
                  size="sm" 
                  className="transition-all duration-200 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" 
                />
                <span className="font-medium text-sm">
                  {wallet?.balance?.toFixed(2) ?? '0.00'}
                </span>
              </Link>

              {/* Notifications Dropdown */}
              <NotificationsDropdown />

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0">
                    <Avatar className="h-10 w-10">
                      <AvatarImage 
                        src={profile?.avatar_url ?? undefined} 
                        alt={profile?.username}
                        className="object-cover"
                      />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {profile?.username?.charAt(0).toUpperCase() ?? 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {profile?.username?.charAt(0).toUpperCase() ?? 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{profile?.username}</span>
                      <span className="text-xs text-muted-foreground">{profile?.email}</span>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="cursor-pointer">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/wallet" className="cursor-pointer">Wallet</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/teams" className="cursor-pointer">My Teams</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/notifications" className="cursor-pointer">
                      Notifications
                      {unreadCount > 0 && (
                        <span className="ml-auto text-xs bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
                          {unreadCount}
                        </span>
                      )}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleSignOut}
                    className="text-destructive focus:text-destructive cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-3">
              {/* Clickable coin for non-logged users - links to auth with redirect to buy */}
              <Link 
                to="/auth?next=/buy" 
                className="group"
                aria-label="Buy Coins"
              >
                <CoinIcon 
                  size="lg" 
                  className="transition-all duration-200 group-hover:scale-110 group-hover:drop-shadow-[0_0_12px_rgba(245,158,11,0.5)]" 
                />
              </Link>
              <Button asChild className="bg-[#5865F2] hover:bg-[#4752C4] text-white">
                <Link to="/auth">
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  Sign in with Discord
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* VIP Modal */}
      <VipModal open={showVipModal} onOpenChange={setShowVipModal} />

      {/* Tip Modal (VIP only, without pre-selected recipient) */}
      <TipModal
        open={showTipModal}
        onOpenChange={setShowTipModal}
        recipientId=""
        recipientUsername=""
      />
    </header>
  );
}
