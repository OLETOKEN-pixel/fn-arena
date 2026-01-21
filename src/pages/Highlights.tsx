import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Youtube, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { HighlightCard } from '@/components/highlights/HighlightCard';
import { AddHighlightModal } from '@/components/highlights/AddHighlightModal';
import { VideoPlayerModal } from '@/components/highlights/VideoPlayerModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Highlight {
  id: string;
  user_id: string;
  youtube_url: string;
  youtube_video_id: string;
  title: string;
  created_at: string;
  username?: string;
  avatar_url?: string | null;
}

type FilterType = 'all' | 'mine';

export default function Highlights() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const isAdmin = profile?.role === 'admin';
  
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
  const [playingHighlight, setPlayingHighlight] = useState<Highlight | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Highlight | null>(null);

  const fetchHighlights = useCallback(async () => {
    try {
      let query = supabase
        .from('highlights')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter === 'mine' && user) {
        query = query.eq('user_id', user.id);
      }

      const { data: highlightsData, error } = await query;

      if (error) throw error;

      if (!highlightsData || highlightsData.length === 0) {
        setHighlights([]);
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(highlightsData.map(h => h.user_id))];
      
      // Fetch profiles
      const { data: profilesData } = await supabase
        .from('profiles_public')
        .select('user_id, username, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);

      const enrichedHighlights: Highlight[] = highlightsData.map(h => ({
        ...h,
        username: profileMap.get(h.user_id)?.username || 'Unknown',
        avatar_url: profileMap.get(h.user_id)?.avatar_url || null,
      }));

      setHighlights(enrichedHighlights);
    } catch (error) {
      console.error('Error fetching highlights:', error);
      toast({
        title: 'Error',
        description: 'Failed to load highlights',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [filter, user, toast]);

  useEffect(() => {
    fetchHighlights();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('highlights-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'highlights',
        },
        () => fetchHighlights()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchHighlights]);

  const handleAddHighlight = async (data: { youtubeUrl: string; title: string; youtubeVideoId: string }) => {
    if (!user) {
      toast({
        title: 'Login required',
        description: 'Please login to add highlights',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase
      .from('highlights')
      .insert({
        user_id: user.id,
        youtube_url: data.youtubeUrl,
        youtube_video_id: data.youtubeVideoId,
        title: data.title,
      });

    if (error) {
      throw new Error('Failed to add highlight');
    }

    toast({
      title: 'Highlight added',
      description: 'Your video has been added successfully',
    });
  };

  const handleEditHighlight = async (data: { youtubeUrl: string; title: string; youtubeVideoId: string }) => {
    if (!editingHighlight) return;

    const { error } = await supabase
      .from('highlights')
      .update({
        youtube_url: data.youtubeUrl,
        youtube_video_id: data.youtubeVideoId,
        title: data.title,
      })
      .eq('id', editingHighlight.id);

    if (error) {
      throw new Error('Failed to update highlight');
    }

    setEditingHighlight(null);
    toast({
      title: 'Highlight updated',
      description: 'Your video has been updated successfully',
    });
  };

  const handleDeleteHighlight = async () => {
    if (!deleteConfirm) return;

    const { error } = await supabase
      .from('highlights')
      .delete()
      .eq('id', deleteConfirm.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete highlight',
        variant: 'destructive',
      });
      return;
    }

    setDeleteConfirm(null);
    toast({
      title: 'Highlight deleted',
      description: 'The video has been removed',
    });
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Hero Section */}
        <Card className="bg-gradient-to-br from-primary/10 via-card to-accent/10 border-primary/20">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Youtube className="w-7 h-7 text-red-500" />
                  Community Highlights
                </CardTitle>
                <CardDescription className="mt-1">
                  Watch epic plays and montages from our community
                </CardDescription>
              </div>
              {user && (
                <Button onClick={() => setShowAddModal(true)} className="shrink-0">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your Highlight
                </Button>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Filters */}
        <div className="flex items-center justify-between">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
            <TabsList>
              <TabsTrigger value="all">All Highlights</TabsTrigger>
              {user && <TabsTrigger value="mine">My Highlights</TabsTrigger>}
            </TabsList>
          </Tabs>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : highlights.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">
                {filter === 'mine' ? 'No highlights yet' : 'No highlights found'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {filter === 'mine' 
                  ? "You haven't added any highlights yet"
                  : 'Be the first to share your epic plays!'
                }
              </p>
              {user && (
                <Button onClick={() => setShowAddModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Highlight
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {highlights.map((highlight) => (
              <HighlightCard
                key={highlight.id}
                id={highlight.id}
                youtubeVideoId={highlight.youtube_video_id}
                title={highlight.title}
                createdAt={highlight.created_at}
                author={{
                  userId: highlight.user_id,
                  username: highlight.username || 'Unknown',
                  avatarUrl: highlight.avatar_url,
                }}
                currentUserId={user?.id || null}
                isAdmin={isAdmin}
                onPlay={() => setPlayingHighlight(highlight)}
                onEdit={() => setEditingHighlight(highlight)}
                onDelete={() => setDeleteConfirm(highlight)}
              />
            ))}
          </div>
        )}

        {/* Modals */}
        <AddHighlightModal
          open={showAddModal}
          onOpenChange={setShowAddModal}
          onSubmit={handleAddHighlight}
        />

        {editingHighlight && (
          <AddHighlightModal
            open={true}
            onOpenChange={() => setEditingHighlight(null)}
            onSubmit={handleEditHighlight}
            editMode
            initialData={{
              youtubeUrl: editingHighlight.youtube_url,
              title: editingHighlight.title,
            }}
          />
        )}

        {playingHighlight && (
          <VideoPlayerModal
            open={true}
            onOpenChange={() => setPlayingHighlight(null)}
            videoId={playingHighlight.youtube_video_id}
            title={playingHighlight.title}
          />
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Highlight?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The video "{deleteConfirm?.title}" will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteHighlight} className="bg-destructive hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}
