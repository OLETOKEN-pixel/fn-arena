import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Upload, X, Loader2, Trash2, ZoomIn, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface Proof {
  id: string;
  match_id: string;
  user_id: string;
  image_url: string;
  description: string | null;
  created_at: string;
  username?: string;
  avatar_url?: string | null;
}

interface ProofSectionProps {
  matchId: string;
  currentUserId: string;
  isAdmin: boolean;
  isParticipant: boolean;
}

export function ProofSection({ matchId, currentUserId, isAdmin, isParticipant }: ProofSectionProps) {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedProof, setSelectedProof] = useState<Proof | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const { toast } = useToast();

  const fetchProofs = useCallback(async () => {
    try {
      // First get proofs
      const { data: proofsData, error: proofsError } = await supabase
        .from('match_proofs')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: false });

      if (proofsError) throw proofsError;

      if (!proofsData || proofsData.length === 0) {
        setProofs([]);
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(proofsData.map(p => p.user_id))];
      
      // Fetch profiles for those users
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .in('user_id', userIds);

      // Map profiles to proofs
      const profileMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);
      
      const enrichedProofs: Proof[] = proofsData.map(proof => ({
        ...proof,
        username: profileMap.get(proof.user_id)?.username || 'Unknown',
        avatar_url: profileMap.get(proof.user_id)?.avatar_url || null,
      }));

      setProofs(enrichedProofs);
    } catch (error) {
      console.error('Error fetching proofs:', error);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    fetchProofs();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`proofs-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_proofs',
          filter: `match_id=eq.${matchId}`,
        },
        () => fetchProofs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, fetchProofs]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image file (JPG, PNG, etc.)',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload an image smaller than 5MB',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${matchId}/${currentUserId}/${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('proofs')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('proofs')
        .getPublicUrl(fileName);

      // Create proof record
      const { error: insertError } = await supabase
        .from('match_proofs')
        .insert({
          match_id: matchId,
          user_id: currentUserId,
          image_url: urlData.publicUrl,
        });

      if (insertError) throw insertError;

      toast({
        title: 'Proof uploaded',
        description: 'Your screenshot has been uploaded successfully',
      });

      fetchProofs();
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload screenshot. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (proof: Proof) => {
    try {
      // Extract path from URL
      const urlParts = proof.image_url.split('/proofs/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage.from('proofs').remove([filePath]);
      }

      const { error } = await supabase
        .from('match_proofs')
        .delete()
        .eq('id', proof.id);

      if (error) throw error;

      toast({
        title: 'Proof deleted',
        description: 'The screenshot has been removed',
      });

      fetchProofs();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Delete failed',
        description: 'Failed to delete screenshot',
        variant: 'destructive',
      });
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleUpload(e.dataTransfer.files);
  };

  if (!isParticipant && !isAdmin) return null;

  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" />
            Proof Screenshots
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload area */}
          {isParticipant && (
            <div
              className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragActive 
                  ? 'border-primary bg-primary/10' 
                  : 'border-border hover:border-primary/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Input
                type="file"
                accept="image/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => handleUpload(e.target.files)}
                disabled={uploading}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop or click to upload screenshot
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Max 5MB • JPG, PNG
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Proofs gallery */}
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : proofs.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No proof screenshots uploaded yet
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {proofs.map((proof) => (
                <div
                  key={proof.id}
                  className="group relative aspect-video rounded-lg overflow-hidden border border-border bg-muted"
                >
                  <img
                    src={proof.image_url}
                    alt="Proof screenshot"
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setSelectedProof(proof)}
                  />
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8"
                      onClick={() => setSelectedProof(proof)}
                    >
                      <ZoomIn className="w-4 h-4" />
                    </Button>
                    {(proof.user_id === currentUserId || isAdmin) && (
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8"
                        onClick={() => handleDelete(proof)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {/* Author badge */}
                  <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/70 rounded px-1.5 py-0.5">
                    <Avatar className="w-4 h-4">
                      <AvatarImage src={proof.avatar_url || undefined} />
                      <AvatarFallback className="text-[8px]">
                        {proof.username?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] text-white">
                      {proof.username}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lightbox modal */}
      <Dialog open={!!selectedProof} onOpenChange={() => setSelectedProof(null)}>
        <DialogContent className="sm:max-w-4xl p-0 overflow-hidden bg-black border-none">
          {selectedProof && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white"
                onClick={() => setSelectedProof(null)}
              >
                <X className="w-5 h-5" />
              </Button>
              
              <img
                src={selectedProof.image_url}
                alt="Proof screenshot"
                className="w-full max-h-[80vh] object-contain"
              />
              
              <div className="p-4 bg-card flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={selectedProof.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {selectedProof.username?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{selectedProof.username}</span>
                  <span className="text-sm text-muted-foreground">
                    • {formatDistanceToNow(new Date(selectedProof.created_at), { addSuffix: true })}
                  </span>
                </div>
                
                {(selectedProof.user_id === currentUserId || isAdmin) && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      handleDelete(selectedProof);
                      setSelectedProof(null);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
