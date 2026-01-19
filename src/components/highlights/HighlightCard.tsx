import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Play, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
}: HighlightCardProps) {
  const [imageError, setImageError] = useState(false);
  // Use hqdefault as primary (always available), fallback to mqdefault
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
      </div>

      {/* Content */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 
            className="font-semibold text-sm line-clamp-2 cursor-pointer hover:text-primary transition-colors"
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

        {/* Author info */}
        <div className="flex items-center gap-2 mt-2">
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
      </div>
    </Card>
  );
}
