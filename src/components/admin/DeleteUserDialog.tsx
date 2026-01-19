import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
  onDeleted: () => void;
}

export function DeleteUserDialog({ 
  open, 
  onOpenChange, 
  userId, 
  username, 
  onDeleted 
}: DeleteUserDialogProps) {
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canDelete = confirmText === 'DELETE';

  const handleDelete = async () => {
    if (!canDelete) return;

    setDeleting(true);
    try {
      const { data, error } = await supabase.rpc('admin_prepare_delete_user', {
        p_user_id: userId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete user');
      }

      toast({
        title: 'User Deleted',
        description: `${username}'s data has been permanently removed.`,
      });

      onDeleted();
      onOpenChange(false);
      setConfirmText('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete user',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Delete User Permanently
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              You are about to permanently delete <strong>{username}</strong> and all their data including:
            </p>
            <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
              <li>Match history and participation</li>
              <li>Wallet and transactions</li>
              <li>VIP subscription</li>
              <li>Tips sent and received</li>
              <li>Team memberships</li>
              <li>Highlights and proofs</li>
              <li>Notifications</li>
            </ul>
            <p className="text-destructive font-medium">
              This action cannot be undone!
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="confirm">Type DELETE to confirm</Label>
          <Input
            id="confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className={confirmText && !canDelete ? 'border-destructive' : ''}
          />
        </div>

        <AlertDialogFooter>
          <Button 
            variant="outline" 
            onClick={() => { onOpenChange(false); setConfirmText(''); }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete || deleting}
          >
            {deleting ? (
              'Deleting...'
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Permanently
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
