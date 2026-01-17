import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function EpicUsernameWarning() {
  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Complete Your Profile</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>
          You need to add your Epic Games Username before you can create or join matches.
        </span>
        <Button asChild size="sm" variant="outline" className="ml-4 shrink-0">
          <Link to="/profile">Go to Profile</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
