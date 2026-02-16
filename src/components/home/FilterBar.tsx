import { LayoutGrid, List, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

function FilterPill({ label }: { label: string }) {
  return (
    <button className={cn(
      "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm",
      "bg-card border border-border/50 text-muted-foreground",
      "hover:border-primary/30 hover:text-foreground transition-all duration-200"
    )}>
      {label}
      <ChevronDown className="w-3.5 h-3.5" />
    </button>
  );
}

export function FilterBar() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hidden">
        <FilterPill label="Mode" />
        <FilterPill label="Region" />
        <FilterPill label="Platform" />
        <FilterPill label="Entry Fee" />
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button className="p-2 rounded-lg bg-primary/10 text-primary">
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
          <List className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
