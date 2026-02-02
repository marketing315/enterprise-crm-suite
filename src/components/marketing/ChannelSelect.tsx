import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveMarketingChannels } from "@/hooks/useMarketingChannels";

interface ChannelSelectProps {
  value?: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}

export function ChannelSelect({
  value,
  onValueChange,
  placeholder = "Seleziona canale",
  allowEmpty = true,
}: ChannelSelectProps) {
  const { data: channels, isLoading } = useActiveMarketingChannels();

  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => onValueChange(v === "__empty__" ? null : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && (
          <SelectItem value="__empty__">Tutti i canali</SelectItem>
        )}
        {isLoading ? (
          <SelectItem value="loading" disabled>Caricamento...</SelectItem>
        ) : (
          channels?.map((channel) => (
            <SelectItem key={channel.id} value={channel.id}>
              {channel.name} ({channel.type})
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
