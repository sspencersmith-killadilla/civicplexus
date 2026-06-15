import { Mail, KeyRound, Smartphone, IdCard, Laptop, Server, type LucideIcon } from "lucide-react";

export type ProvisioningKind = {
  key: string;
  label: string;
  icon: LucideIcon;
};

export const PROVISIONING_KINDS: ProvisioningKind[] = [
  { key: "email", label: "Email account", icon: Mail },
  { key: "ad_account", label: "AD / SSO account", icon: KeyRound },
  { key: "vpn", label: "VPN access", icon: Server },
  { key: "phone", label: "Phone / extension", icon: Smartphone },
  { key: "badge", label: "Access badge", icon: IdCard },
  { key: "equipment", label: "Equipment (laptop/radio)", icon: Laptop },
];

export const DEFAULT_PROVISIONING_KINDS = ["email", "ad_account", "vpn"];

export function kindMeta(key: string): ProvisioningKind {
  return PROVISIONING_KINDS.find((k) => k.key === key) ?? { key, label: key, icon: Server };
}