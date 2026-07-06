import { useState, useMemo } from "react";
import {
  Briefcase, Wrench, Shield, HeartPulse, GraduationCap, Truck, Leaf,
  Building2, Bus, Cog, Droplets, Flame, Gavel, Handshake, HardHat,
  Hammer, Landmark, Lightbulb, Mail, Microscope, PenTool, PawPrint,
  Palette, Radio, Recycle, Ruler, Scale, Scissors, Sparkles, Stethoscope,
  TreePine, Trophy, UserPlus, Users, Wallet, Wifi, Zap, Book,
  BadgeCheck, Calendar, Camera, Car, ClipboardList, Code2, Compass,
  Database, DollarSign, Feather, FileText, FlaskConical, Globe, Headphones,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const JOB_ICONS: Record<string, LucideIcon> = {
  Briefcase, Wrench, Shield, HeartPulse, GraduationCap, Truck, Leaf,
  Building2, Bus, Cog, Droplets, Flame, Gavel, Handshake, HardHat,
  Hammer, Landmark, Lightbulb, Mail, Microscope, PenTool, PawPrint,
  Palette, Radio, Recycle, Ruler, Scale, Scissors, Sparkles, Stethoscope,
  TreePine, Trophy, UserPlus, Users, Wallet, Wifi, Zap, Book,
  BadgeCheck, Calendar, Camera, Car, ClipboardList, Code2, Compass,
  Database, DollarSign, Feather, FileText, FlaskConical, Globe, Headphones,
};

export function JobIcon({ name, className }: { name?: string | null; className?: string }) {
  const Cmp = (name && JOB_ICONS[name]) || Briefcase;
  return <Cmp className={className ?? "h-4 w-4"} />;
}

export function IconPicker({
  value, onChange, size = "sm",
}: { value?: string | null; onChange: (name: string) => void; size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const entries = useMemo(() => {
    const list = Object.entries(JOB_ICONS);
    if (!q.trim()) return list;
    const n = q.toLowerCase();
    return list.filter(([name]) => name.toLowerCase().includes(n));
  }, [q]);
  const Current = (value && JOB_ICONS[value]) || Briefcase;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size={size} type="button" className="gap-2">
          <Current className="h-4 w-4" />
          <span className="text-xs">{value ?? "Choose icon"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-xs mb-2" />
        <div className="grid grid-cols-8 gap-1 max-h-64 overflow-y-auto">
          {entries.map(([name, Icon]) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => { onChange(name); setOpen(false); }}
              className={cn(
                "flex items-center justify-center rounded-md p-2 hover:bg-muted",
                value === name && "bg-primary/10 ring-1 ring-primary",
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}