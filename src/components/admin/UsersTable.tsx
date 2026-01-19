import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Ban, CheckCircle, ChevronUp, ChevronDown, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/custom-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DeleteUserDialog } from './DeleteUserDialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Profile } from '@/types';

interface UsersTableProps {
  users: Profile[];
  loading: boolean;
  onUserUpdated: () => void;
}

type SortField = 'username' | 'email' | 'created_at' | 'role';
type SortDirection = 'asc' | 'desc';

export function UsersTable({ users, loading, onUserUpdated }: UsersTableProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sorting
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  
  // Delete dialog
  const [deleteUser, setDeleteUser] = useState<{ id: string; username: string } | null>(null);

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    let result = [...users];

    // Status filter
    if (statusFilter === 'banned') {
      result = result.filter(u => u.is_banned);
    } else if (statusFilter === 'active') {
      result = result.filter(u => !u.is_banned);
    } else if (statusFilter === 'admin') {
      result = result.filter(u => u.role === 'admin');
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(u => 
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.user_id?.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortField) {
        case 'username':
          aVal = a.username || '';
          bVal = b.username || '';
          break;
        case 'email':
          aVal = a.email || '';
          bVal = b.email || '';
          break;
        case 'created_at':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case 'role':
          aVal = a.role || '';
          bVal = b.role || '';
          break;
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return result;
  }, [users, statusFilter, searchQuery, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleBanUser = async (e: React.MouseEvent, userId: string, isBanned: boolean) => {
    e.stopPropagation();
    
    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: !isBanned })
      .eq('user_id', userId);

    if (error) {
      toast({
        title: 'Errore',
        description: 'Impossibile aggiornare lo stato utente.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: isBanned ? 'Utente sbloccato' : 'Utente bannato',
        description: 'Stato utente aggiornato.',
      });
      onUserUpdated();
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  const exportCSV = () => {
    const headers = ['ID', 'Username', 'Email', 'Role', 'Banned', 'Created'];
    const rows = filteredUsers.map(u => [
      u.user_id,
      u.username,
      u.email,
      u.role,
      u.is_banned ? 'Yes' : 'No',
      new Date(u.created_at).toISOString(),
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Quick Filters */}
      <div className="flex flex-wrap gap-2">
        {['all', 'active', 'banned', 'admin'].map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setStatusFilter(status);
              setCurrentPage(1);
            }}
          >
            {status === 'all' && 'Tutti'}
            {status === 'active' && 'Attivi'}
            {status === 'banned' && 'Bannati'}
            {status === 'admin' && 'Admin'}
            <span className="ml-1 text-xs opacity-70">
              ({status === 'all' ? users.length : 
                status === 'active' ? users.filter(u => !u.is_banned).length :
                status === 'banned' ? users.filter(u => u.is_banned).length :
                users.filter(u => u.role === 'admin').length})
            </span>
          </Button>
        ))}
      </div>

      {/* Search & Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Cerca per username, email, ID..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          className="w-64"
        />

        <div className="ml-auto flex gap-2">
          <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v)); setCurrentPage(1); }}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        {filteredUsers.length} utenti trovati
      </p>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead>Avatar</TableHead>
              <TableHead 
                className="cursor-pointer hover:text-foreground"
                onClick={() => handleSort('username')}
              >
                <span className="flex items-center gap-1">Username <SortIcon field="username" /></span>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:text-foreground"
                onClick={() => handleSort('email')}
              >
                <span className="flex items-center gap-1">Email <SortIcon field="email" /></span>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:text-foreground"
                onClick={() => handleSort('role')}
              >
                <span className="flex items-center gap-1">Role <SortIcon field="role" /></span>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead 
                className="cursor-pointer hover:text-foreground"
                onClick={() => handleSort('created_at')}
              >
                <span className="flex items-center gap-1">Created <SortIcon field="created_at" /></span>
              </TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                </TableCell>
              </TableRow>
            ) : paginatedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  Nessun utente trovato
                </TableCell>
              </TableRow>
            ) : (
              paginatedUsers.map((user) => (
                <TableRow 
                  key={user.id} 
                  className="hover:bg-secondary/30 cursor-pointer"
                  onClick={() => navigate(`/admin/users/${user.user_id}`)}
                >
                  <TableCell>
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={user.avatar_url ?? undefined} />
                      <AvatarFallback>{user.username?.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    {user.role === 'admin' ? (
                      <Badge variant="destructive">Admin</Badge>
                    ) : (
                      <Badge variant="outline">User</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.is_banned ? (
                      <Badge variant="destructive">Banned</Badge>
                    ) : (
                      <Badge variant="default" className="bg-success/20 text-success">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/users/${user.user_id}`);
                        }}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      {user.role !== 'admin' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => handleBanUser(e, user.user_id, user.is_banned)}
                          >
                            {user.is_banned ? (
                              <CheckCircle className="w-4 h-4 text-success" />
                            ) : (
                              <Ban className="w-4 h-4 text-destructive" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteUser({ id: user.user_id, username: user.username });
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum = i + 1;
              if (totalPages > 5 && currentPage > 3) {
                pageNum = currentPage - 2 + i;
              }
              if (pageNum > totalPages) return null;
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    onClick={() => setCurrentPage(pageNum)}
                    isActive={currentPage === pageNum}
                    className="cursor-pointer"
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {/* Delete User Dialog */}
      {deleteUser && (
        <DeleteUserDialog
          open={!!deleteUser}
          onOpenChange={(open) => !open && setDeleteUser(null)}
          userId={deleteUser.id}
          username={deleteUser.username}
          onDeleted={onUserUpdated}
        />
      )}
    </div>
  );
}
