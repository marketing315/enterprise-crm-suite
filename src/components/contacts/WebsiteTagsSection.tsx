import { Globe, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Json } from '@/integrations/supabase/types';

interface WebsiteTag {
  id: number;
  name: string;
}

interface WebsiteTagsSectionProps {
  events: Array<{
    raw_payload: Json;
  }>;
}

/**
 * Extracts unique website tags from lead events' raw payloads.
 * These are tags from external systems (Systeme.io, etc.) - NOT CRM tags.
 */
function extractWebsiteTags(events: WebsiteTagsSectionProps['events']): WebsiteTag[] {
  const tagMap = new Map<number, WebsiteTag>();

  for (const event of events) {
    const payload = event.raw_payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
    
    const payloadObj = payload as Record<string, Json | undefined>;
    
    // Extract from contact.tags array (Systeme.io format)
    const contact = payloadObj.contact;
    if (contact && typeof contact === 'object' && !Array.isArray(contact)) {
      const contactObj = contact as Record<string, Json | undefined>;
      const contactTags = contactObj.tags;
      if (Array.isArray(contactTags)) {
        for (const tag of contactTags) {
          if (tag && typeof tag === 'object' && !Array.isArray(tag) && 'id' in tag && 'name' in tag) {
            const t = tag as { id: number; name: string };
            tagMap.set(t.id, { id: t.id, name: t.name });
          }
        }
      }
    }

    // Also check for single tag object (when a tag is being added)
    const singleTag = payloadObj.tag;
    if (singleTag && typeof singleTag === 'object' && !Array.isArray(singleTag) && 'id' in singleTag && 'name' in singleTag) {
      const t = singleTag as { id: number; name: string };
      tagMap.set(t.id, { id: t.id, name: t.name });
    }
  }

  return Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function WebsiteTagsSection({ events }: WebsiteTagsSectionProps) {
  const websiteTags = extractWebsiteTags(events);

  if (websiteTags.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
        <Globe className="h-4 w-4" />
        Tag sito web
      </h3>
      <p className="text-xs text-muted-foreground">
        Tag importati automaticamente dal sito (sola lettura)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {websiteTags.map((tag) => (
          <Badge 
            key={tag.id} 
            variant="secondary"
            className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800"
          >
            <Tag className="h-3 w-3 mr-1" />
            {tag.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}
