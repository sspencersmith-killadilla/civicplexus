import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getMyVolunteerProfile, upsertMyVolunteerProfile } from "@/lib/volunteer-portal.functions";

export const Route = createFileRoute("/_authenticated/volunteer/profile")({
  component: VolunteerProfilePage,
});

function VolunteerProfilePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const profileFn = useServerFn(getMyVolunteerProfile);
  const saveFn = useServerFn(upsertMyVolunteerProfile);

  const profile = useQuery({ queryKey: ["my-volunteer-profile"], queryFn: () => profileFn() });

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [skills, setSkills] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (profile.data) {
      setFirst(profile.data.first_name ?? "");
      setLast(profile.data.last_name ?? "");
      setEmail(profile.data.email ?? "");
      setPhone(profile.data.phone ?? "");
      setSkills((profile.data.skills ?? []).join(", "));
      setNotes(profile.data.notes ?? "");
    }
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          first_name: first,
          last_name: last,
          email: email || null,
          phone: phone || null,
          skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["my-volunteer-profile"] });
      navigate({ to: "/volunteer" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card className="p-6 max-w-2xl">
      <h2 className="font-serif text-xl">Volunteer profile</h2>
      <p className="text-xs text-muted-foreground mb-4">
        A coordinator uses this to approve you for shifts and get in touch. Update it any time.
      </p>
      <form
        onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <div><Label>First name *</Label><Input required value={first} onChange={(e) => setFirst(e.target.value)} /></div>
          <div><Label>Last name *</Label><Input required value={last} onChange={(e) => setLast(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <div>
          <Label>Skills / interests</Label>
          <Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="first aid, event setup, tutoring" />
          <p className="text-xs text-muted-foreground mt-1">Comma-separated.</p>
        </div>
        <div>
          <Label>Anything else?</Label>
          <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Availability, preferred programs, accessibility needs, etc." />
        </div>
        <Button type="submit" disabled={save.isPending || !first || !last}>
          {save.isPending ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </Card>
  );
}