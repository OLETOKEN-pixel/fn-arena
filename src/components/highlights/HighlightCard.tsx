import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Play, MoreVertical, Pencil, Trash2, Star, ArrowRightLeft, X, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { VoteState } from '@/hooks/useHighlightVotes';

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
  voteCount: number;
  voteState: VoteState;
  onCastVote: () => void;
  onRemoveVote: () => void;
  onSwitchVote: () => void;
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
  voteState,
  onCastVote,
  onRemoveVote,
  onSwitchVote,
  isVoting,
}: HighlightCardProps) {
  const [imageError, setImageError] = useState(false);
  const thumbnailUrl = imageError
    ? `https://img.youtube.com/vi/${youtubeVideoId}/mqdefault.jpg`
    : `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;

  const canManage = currentUserId === author.userId;
  const canDelete = canManage || isAdmin;
  const timeAgo = formatDistanceToNow(new Date(createdAt), { addSuffix: true });
  const isVotedHere = voteState === 'VOTED_THIS';

  return (
    <Card
      className={cn(
        "group relative overflow-hidden bg-card border-border transition-all duration-300",
        isVotedHere
          ? "border-accent/40 shadow-[0_0_20px_hsl(var(--accent)/0.12)]"
          : "hover:border-primary/30"
      )}
    >
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
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center">
            <Play className="w-7 h-7 text-primary-foreground fill-current ml-0.5" />
          </div>
        </div>

        {/* YOUR VOTE badge on thumbnail */}
        {isVotedHere && (
          <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-md bg-accent/90 text-accent-foreground text-[11px] font-bold tracking-wide flex items-center gap-1.5 shadow-lg">
            <Star className="w-3 h-3 fill-current" />
            YOUR VOTE
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Title + Actions */}
        <div className="flex items-start justify-between gap-2">
          <h3
            className="font-semibold text-sm leading-snug line-clamp-2 cursor-pointer hover:text-primary transition-colors flex-1"
            onClick={onPlay}
          >
            {title}
          </h3>

          {canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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

        {/* Author */}
        <div className="flex items-center gap-2">
          <Avatar className="w-5 h-5">
            <AvatarImage src={author.avatarUrl || undefined} />
            <AvatarFallback className="text-[10px]">
              {author.username?.charAt(0).toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground">{author.username}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </div>

        {/* ===== VOTE MODULE ===== */}
        <div className={cn(
          "rounded-lg border p-3 transition-all duration-300",
          isVotedHere
            ? "bg-accent/8 border-accent/25"
            : "bg-secondary/30 border-border"
        )}>
          <div className="flex items-center justify-between gap-3">
            {/* Vote Count */}
            <div className="flex items-center gap-2">
              <Star className={cn(
                "w-4 h-4 transition-colors",
                isVotedHere ? "text-accent fill-accent" : "text-muted-foreground"
              )} />
              <span className={cn(
                "font-display font-bold text-lg tabular-nums transition-colors",
                isVotedHere ? "text-accent" : "text-foreground"
              )}>
                {voteCount}
              </span>
              <span className="text-xs text-muted-foreground">
                {voteCount === 1 ? 'vote' : 'votes'}
              </span>
            </div>

            {/* Vote Action Button */}
            {voteState === 'NOT_VOTED' && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onCastVote(); }}
                disabled={isVoting || !currentUserId}
                className="gap-1.5 font-semibold hover:border-primary/50 hover:bg-primary/10 hover:text-primary transition-all active:scale-[0.97]"
              >
                {isVoting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Star className="w-3.5 h-3.5" />
                )}
                {!currentUserId ? 'Login to vote' : 'VOTE'}
              </Button>
            )}

            {voteState === 'VOTED_THIS' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onRemoveVote(); }}
                disabled={isVoting}
                className="gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all active:scale-[0.97]"
              >
                {isVoting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
                Remove
              </Button>
            )}

            {voteState === 'VOTED_OTHER' && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onSwitchVote(); }}
                disabled={isVoting}
                className="gap-1.5 font-semibold hover:border-accent/50 hover:bg-accent/10 hover:text-accent transition-all active:scale-[0.97]"
              >
                {isVoting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                )}
                Switch Vote
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
