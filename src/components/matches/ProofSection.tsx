import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Upload, X, Loader2, Trash2, ZoomIn, ImageIcon, Images } from 'lucide-react';
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
        .from('profiles')
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

      const { error: uploadError } = await supabase.storage
        .from('proofs')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('proofs')
        .getPublicUrl(fileName);

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
      <Card className="border-border/50 bg-gradient-to-br from-card via-card to-secondary/10 overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/30">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center border border-primary/30">
                <Camera className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-lg">Proof Screenshots</span>
                <p className="text-xs font-normal text-muted-foreground mt-0.5">
                  Upload game result screenshots
                </p>
              </div>
            </div>
            {proofs.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 text-muted-foreground">
                <Images className="w-4 h-4" />
                <span className="text-sm font-medium">{proofs.length}</span>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          {/* Upload area - Larger */}
          {isParticipant && (
            <div
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                dragActive 
                  ? 'border-primary bg-primary/10 scale-[1.02]' 
                  : 'border-border/50 hover:border-primary/50 hover:bg-secondary/30'
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
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="text-base text-muted-foreground">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-base font-medium text-foreground">
                      Drag & drop or click to upload
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Max 5MB • JPG, PNG, WebP
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Proofs gallery - Larger Grid */}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : proofs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground rounded-xl bg-secondary/20 border border-dashed border-border/50">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-base font-medium">No screenshots yet</p>
              <p className="text-sm mt-1">Upload proof of your game results</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {proofs.map((proof) => (
                <div
                  key={proof.id}
                  className="group relative aspect-video rounded-xl overflow-hidden border border-border/50 bg-muted shadow-md hover:shadow-xl transition-all hover:scale-[1.02]"
                >
                  <img
                    src={proof.image_url}
                    alt="Proof screenshot"
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setSelectedProof(proof)}
                  />
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-6 h-6 border border-white/20">
                          <AvatarImage src={proof.avatar_url || undefined} />
                          <AvatarFallback className="text-[10px] bg-primary/20">
                            {proof.username?.charAt(0) || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-white font-medium truncate max-w-[80px]">
                          {proof.username}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 bg-white/10 hover:bg-white/20 text-white"
                          onClick={() => setSelectedProof(proof)}
                        >
                          <ZoomIn className="w-4 h-4" />
                        </Button>
                        {(proof.user_id === currentUserId || isAdmin) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 bg-destructive/20 hover:bg-destructive/40 text-white"
                            onClick={() => handleDelete(proof)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lightbox modal */}
      <Dialog open={!!selectedProof} onOpenChange={() => setSelectedProof(null)}>
        <DialogContent className="sm:max-w-5xl p-0 overflow-hidden bg-black/95 border-border/50">
          {selectedProof && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full"
                onClick={() => setSelectedProof(null)}
              >
                <X className="w-5 h-5" />
              </Button>
              
              <img
                src={selectedProof.image_url}
                alt="Proof screenshot"
                className="w-full max-h-[80vh] object-contain"
              />
              
              <div className="p-5 bg-card flex items-center justify-between border-t border-border/30">
                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8 border border-border">
                    <AvatarImage src={selectedProof.avatar_url || undefined} />
                    <AvatarFallback className="text-sm">
                      {selectedProof.username?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <span className="font-medium">{selectedProof.username}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      • {formatDistanceToNow(new Date(selectedProof.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                
                {(selectedProof.user_id === currentUserId || isAdmin) && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      handleDelete(selectedProof);
                      setSelectedProof(null);
                    }}
                    className="gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
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
