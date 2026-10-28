ALTER TABLE public.job_requisitions ADD COLUMN IF NOT EXISTS blind_review boolean NOT NULL DEFAULT true;
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS alias_color text,
  ADD COLUMN IF NOT EXISTS alias_animal text,
  ADD COLUMN IF NOT EXISTS identity_revealed_at timestamptz;

CREATE OR REPLACE FUNCTION public.tg_assign_applicant_alias()
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
      SELECT 1 FROM public.job_applications
      WHERE requisition_id = NEW.requisition_id AND alias_color = c AND alias_animal = a AND id <> NEW.id);
  END LOOP;
  NEW.alias_color := c; NEW.alias_animal := a;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_applicant_alias ON public.job_applications;
CREATE TRIGGER trg_assign_applicant_alias BEFORE INSERT OR UPDATE OF alias_color ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.tg_assign_applicant_alias();

CREATE OR REPLACE FUNCTION public.tg_applicant_identity_reveal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('interview','offer','hired') AND NEW.identity_revealed_at IS NULL THEN
    NEW.identity_revealed_at := now();
    INSERT INTO public.job_application_events (application_id, actor_id, from_status, to_status, note)
    VALUES (NEW.id, auth.uid(), OLD.status, NEW.status, 'Identity revealed to hiring team');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_applicant_identity_reveal ON public.job_applications;
CREATE TRIGGER trg_applicant_identity_reveal BEFORE UPDATE OF status ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.tg_applicant_identity_reveal();

UPDATE public.job_applications SET alias_color = NULL WHERE alias_color IS NULL;
UPDATE public.job_applications SET identity_revealed_at = updated_at
  WHERE status IN ('interview','offer','hired') AND identity_revealed_at IS NULL;