import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Play, MoreVertical, Pencil, Trash2, Star } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface HighlightCardProps {
  id: string;
  youtubeVideoId: string;
  title: string;
  createdAt: string;
  author: {
    userId: string;
    username: string;
    avatarUrl: string | null;
  };
  currentUserId: string | null;
  isAdmin: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => void;
  // Voting props
  voteCount: number;
  isVoted: boolean;
  onVote: () => void;
  isVoting: boolean;
}

export function HighlightCard({
  youtubeVideoId,
  title,
  createdAt,
  author,
  currentUserId,
  isAdmin,
  onPlay,
  onEdit,
  onDelete,
  voteCount,
  isVoted,
  onVote,
  isVoting,
}: HighlightCardProps) {
  const [imageError, setImageError] = useState(false);
  const thumbnailUrl = imageError
    ? `https://img.youtube.com/vi/${youtubeVideoId}/mqdefault.jpg`
    : `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;
  
  const canManage = currentUserId === author.userId;
  const canDelete = canManage || isAdmin;
  const timeAgo = formatDistanceToNow(new Date(createdAt), { addSuffix: true });

  return (
    <Card className="group relative overflow-hidden bg-card border-border hover:border-primary/50 transition-all duration-300">
      {/* Thumbnail */}
      <div 
        className="relative aspect-video cursor-pointer overflow-hidden"
        onClick={onPlay}
      >
        <img
          src={thumbnailUrl}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setImageError(true)}
        />
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center">
            <Play className="w-8 h-8 text-primary-foreground fill-current ml-1" />
          </div>
        </div>

        {/* Voted indicator glow */}
        {isVoted && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-accent/90 text-accent-foreground text-[10px] font-bold flex items-center gap-1">
            <Star className="w-3 h-3 fill-current" />
            Your Vote
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 
            className="font-semibold text-sm line-clamp-2 cursor-pointer hover:text-primary transition-colors flex-1"
            onClick={onPlay}
          >
            {title}
          </h3>
          
          {canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canManage && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Author info + Vote */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <Avatar className="w-6 h-6">
              <AvatarImage src={author.avatarUrl || undefined} />
              <AvatarFallback className="text-xs">
                {author.username?.charAt(0).toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">{author.username}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>

          {/* Vote Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onVote();
            }}
            disabled={isVoting || !currentUserId}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all duration-300",
              "border",
              isVoted
                ? "bg-accent/15 border-accent/40 text-accent shadow-[0_0_12px_hsl(45_95%_55%/0.2)]"
                : "bg-secondary/50 border-border hover:border-primary/40 hover:bg-primary/10 text-muted-foreground hover:text-foreground",
              isVoting && "opacity-50 cursor-not-allowed",
              !currentUserId && "opacity-40 cursor-not-allowed",
              isVoted && "animate-vote-pop"
            )}
          >
            <Star className={cn("w-3.5 h-3.5", isVoted && "fill-current")} />
            <span>{voteCount}</span>
          </button>
        </div>
      </div>
    </Card>
  );
}
