ALTER TABLE public.board_application_submissions
  ADD COLUMN IF NOT EXISTS alias_color text,
  ADD COLUMN IF NOT EXISTS alias_animal text;

CREATE OR REPLACE FUNCTION public.tg_assign_board_alias()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  colors text[] := ARRAY['Cyan','Amber','Coral','Indigo','Jade','Crimson','Teal','Saffron','Violet','Olive','Scarlet','Azure','Plum','Ochre','Cobalt','Rose','Lime','Slate','Ruby','Mint','Copper','Sapphire','Lilac','Bronze','Emerald','Tangerine','Magenta','Pearl','Sienna','Navy'];
  animals text[] := ARRAY['Cormorant','Otter','Heron','Lynx','Falcon','Badger','Marten','Ibis','Gecko','Bison','Puffin','Kestrel','Tapir','Wombat','Osprey','Pelican','Ocelot','Ferret','Raven','Walrus','Quokka','Egret','Panda','Koala','Mongoose','Narwhal','Jaguar','Toucan','Moose','Gazelle','Hedgehog','Lemur','Mantis','Newt','Oriole','Penguin','Robin','Salmon','Starling','Swift','Tortoise','Viper','Weasel','Yak','Zebra','Beaver','Crane','Dingo','Finch','Gopher','Hare','Iguana','Jackal','Kiwi','Llama','Magpie','Orca','Parrot','Sparrow','Wren'];
  c text; a text; tries int := 0;
BEGIN
  IF NEW.alias_color IS NOT NULL THEN RETURN NEW; END IF;
  LOOP
    c := colors[1 + floor(random()*array_length(colors,1))::int];
    a := animals[1 + floor(random()*array_length(animals,1))::int];
    tries := tries + 1;
    EXIT WHEN tries > 50 OR NOT EXISTS (
      SELECT 1 FROM public.board_application_submissions WHERE alias_color = c AND alias_animal = a AND id <> NEW.id);
  END LOOP;
  NEW.alias_color := c; NEW.alias_animal := a;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_board_alias ON public.board_application_submissions;
CREATE TRIGGER trg_assign_board_alias BEFORE INSERT OR UPDATE OF alias_color ON public.board_application_submissions
FOR EACH ROW EXECUTE FUNCTION public.tg_assign_board_alias();

UPDATE public.board_application_submissions SET alias_color = NULL WHERE alias_color IS NULL;

CREATE TABLE IF NOT EXISTS public.identity_reveal_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL CHECK (subject_kind IN ('job_application','board_application')),
  subject_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.identity_reveal_log TO authenticated;
GRANT ALL ON public.identity_reveal_log TO service_role;
ALTER TABLE public.identity_reveal_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reveal log read by hr or clerk" ON public.identity_reveal_log FOR SELECT TO authenticated
  USING (public.is_clerk_or_hr(auth.uid()));
CREATE POLICY "reveal log insert own" ON public.identity_reveal_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND public.is_clerk_or_hr(auth.uid()));