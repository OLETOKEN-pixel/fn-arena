import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Upload, X, Loader2, Trash2, ZoomIn, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();

  const fetchProofs = useCallback(async () => {
    try {
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

      const userIds = [...new Set(proofsData.map(p => p.user_id))];
      
      const { data: profilesData } = await supabase
        .from('profiles_public')
        .select('user_id, username, avatar_url')
        .in('user_id', userIds);

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
    
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image file (JPG, PNG, etc.)',
        variant: 'destructive',
      });
      return;
    }

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

      // Step 1: Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('proofs')
        .upload(fileName, file);

      if (uploadError) {
        const errorMsg = uploadError.message?.toLowerCase() || '';
        if (errorMsg.includes('policy') || errorMsg.includes('permission') || errorMsg.includes('security')) {
          throw new Error('Not authorized: You must be a participant and the match must be in progress');
        } else if (errorMsg.includes('size') || errorMsg.includes('large')) {
          throw new Error('File too large: Maximum size is 5MB');
        } else if (errorMsg.includes('type') || errorMsg.includes('format')) {
          throw new Error('Invalid format: Please upload JPG, PNG, or GIF');
        }
        throw new Error(uploadError.message || 'Failed to upload file');
      }

      // Step 2: Get public URL
      const { data: urlData } = supabase.storage
        .from('proofs')
        .getPublicUrl(fileName);

      // Step 3: Use server-side RPC to create proof record (uses auth.uid())
      const { data: rpcResult, error: rpcError } = await supabase.rpc('create_match_proof', {
        p_match_id: matchId,
        p_image_url: urlData.publicUrl,
      });

      if (rpcError) {
        // Clean up uploaded file on failure
        await supabase.storage.from('proofs').remove([fileName]);
        throw new Error(rpcError.message || 'Failed to save proof record');
      }

      const result = rpcResult as { success: boolean; error?: string; message?: string };
      
      if (!result.success) {
        // Clean up uploaded file on failure
        await supabase.storage.from('proofs').remove([fileName]);
        throw new Error(result.error || 'Failed to save proof record');
      }

      toast({
        title: 'Proof uploaded',
        description: 'Your screenshot has been uploaded successfully',
      });

      // Invalidate challenges query for real-time progress update
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
      
      fetchProofs();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload screenshot. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (proof: Proof) => {
    try {
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
      <Card 
        className="border-border/50 bg-card"
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <CardContent className="p-4">
          {/* Header with Upload */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold">Proof Screenshots</span>
              <span className="text-xs text-muted-foreground">({proofs.length})</span>
            </div>
            {isParticipant && (
              <div className="relative">
                <Input
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => handleUpload(e.target.files)}
                  disabled={uploading}
                />
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled={uploading}>
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload
                </Button>
              </div>
            )}
          </div>

          {/* Drop Zone - ONLY when dragging */}
          {isParticipant && dragActive && (
            <div
              className="relative border-2 border-dashed rounded-lg p-6 text-center transition-all mb-3 border-primary bg-primary/10"
            >
              <div className="flex items-center justify-center gap-2 text-primary">
                <Upload className="w-5 h-5" />
                <span className="text-sm font-medium">Drop image here</span>
              </div>
            </div>
          )}

          {/* Proofs Gallery - Horizontal Scroll with larger thumbnails */}
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : proofs.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No screenshots yet</p>
              <p className="text-xs mt-1">Drag & drop or click Upload</p>
            </div>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {proofs.map((proof) => (
                <div
                  key={proof.id}
                  className="group relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border/50 bg-muted cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                  onClick={() => setSelectedProof(proof)}
                >
                  <img
                    src={proof.image_url}
                    alt="Proof"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder.svg';
                    }}
                  />
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ZoomIn className="w-5 h-5 text-white" />
                  </div>
                  {/* Delete button */}
                  {(proof.user_id === currentUserId || isAdmin) && (
                    <button
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(proof);
                      }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lightbox modal */}
      <Dialog open={!!selectedProof} onOpenChange={() => setSelectedProof(null)}>
        <DialogContent className="sm:max-w-4xl p-0 overflow-hidden bg-black/95 border-border/50">
          {selectedProof && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full h-8 w-8"
                onClick={() => setSelectedProof(null)}
              >
                <X className="w-4 h-4" />
              </Button>
              
              <img
                src={selectedProof.image_url}
                alt="Proof screenshot"
                className="w-full max-h-[70vh] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/placeholder.svg';
                }}
              />
              
              <div className="p-3 bg-card flex items-center justify-between border-t border-border/30">
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6 border border-border">
                    <AvatarImage src={selectedProof.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {selectedProof.username?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{selectedProof.username}</span>
                  <span className="text-xs text-muted-foreground">
                    • {formatDistanceToNow(new Date(selectedProof.created_at), { addSuffix: true })}
                  </span>
                </div>
                
                {(selectedProof.user_id === currentUserId || isAdmin) && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      handleDelete(selectedProof);
                      setSelectedProof(null);
                    }}
                    className="gap-1.5 h-7"
                  >
                    <Trash2 className="w-3 h-3" />
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
