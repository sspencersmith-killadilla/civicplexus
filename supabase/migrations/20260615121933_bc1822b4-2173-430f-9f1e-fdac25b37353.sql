
-- Seed a default template + tasks per worker type, idempotently.
DO $$
DECLARE
  wt RECORD;
  tpl_id UUID;
  tasks JSONB;
  t JSONB;
  idx INT;
BEGIN
  FOR wt IN SELECT id, key, name FROM public.worker_types LOOP
    -- skip if any template already exists for this worker type
    IF EXISTS (SELECT 1 FROM public.onboarding_templates WHERE worker_type_id = wt.id) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.onboarding_templates (worker_type_id, name, description, is_default, is_active, template_type)
    VALUES (wt.id, wt.name || ' — Standard Onboarding',
            'Default playbook for ' || wt.name || '. Edit tasks to fit your municipality.',
            true, true, 'onboarding')
    RETURNING id INTO tpl_id;

    tasks := CASE wt.key
      WHEN 'office' THEN '[
        {"title":"Accept offer letter","category":"forms","assignee":"employee","days_offset":-7},
        {"title":"Complete I-9 Section 1","category":"compliance","assignee":"employee","days_offset":-3},
        {"title":"Submit W-4 and state withholding","category":"forms","assignee":"employee","days_offset":-3},
        {"title":"Set up direct deposit","category":"forms","assignee":"employee","days_offset":-2},
        {"title":"Upload ID badge photo","category":"forms","assignee":"employee","days_offset":-2},
        {"title":"Provision SSO and email account","category":"provisioning","assignee":"it","days_offset":-1},
        {"title":"Issue laptop and peripherals","category":"equipment","assignee":"it","days_offset":0},
        {"title":"Day-1 orientation session","category":"introduction","assignee":"hr","days_offset":0},
        {"title":"Acknowledge core HR policies","category":"policy","assignee":"employee","days_offset":1},
        {"title":"Manager 1:1 introduction","category":"introduction","assignee":"manager","days_offset":1},
        {"title":"Complete required compliance training","category":"training","assignee":"employee","days_offset":7},
        {"title":"30-day check-in","category":"introduction","assignee":"manager","days_offset":30},
        {"title":"60-day check-in","category":"introduction","assignee":"manager","days_offset":60},
        {"title":"90-day review","category":"introduction","assignee":"manager","days_offset":90}
      ]'::jsonb
      WHEN 'field' THEN '[
        {"title":"Accept offer letter","category":"forms","assignee":"employee","days_offset":-7},
        {"title":"Complete I-9 Section 1","category":"compliance","assignee":"employee","days_offset":-3},
        {"title":"Submit W-4 and state withholding","category":"forms","assignee":"employee","days_offset":-3},
        {"title":"DOT / CDL verification (if applicable)","category":"compliance","assignee":"hr","days_offset":-3},
        {"title":"Submit PPE sizing form","category":"forms","assignee":"employee","days_offset":-2},
        {"title":"Set up direct deposit","category":"forms","assignee":"employee","days_offset":-1},
        {"title":"Issue PPE kit (helmet, vest, boots)","category":"equipment","assignee":"facilities","days_offset":0},
        {"title":"Issue radio and vehicle assignment","category":"equipment","assignee":"facilities","days_offset":0},
        {"title":"OSHA 10 safety training","category":"training","assignee":"employee","days_offset":3},
        {"title":"Supervisor field orientation","category":"introduction","assignee":"manager","days_offset":0},
        {"title":"Acknowledge safety and conduct policies","category":"policy","assignee":"employee","days_offset":1},
        {"title":"30-day safety check-in","category":"introduction","assignee":"manager","days_offset":30},
        {"title":"90-day review","category":"introduction","assignee":"manager","days_offset":90}
      ]'::jsonb
      WHEN 'public_safety' THEN '[
        {"title":"Conditional offer of employment","category":"forms","assignee":"hr","days_offset":-30},
        {"title":"Schedule fingerprinting","category":"compliance","assignee":"hr","days_offset":-21},
        {"title":"CJIS security acknowledgment","category":"compliance","assignee":"employee","days_offset":-14},
        {"title":"Psychological evaluation scheduled","category":"compliance","assignee":"hr","days_offset":-14},
        {"title":"Medical and drug screening","category":"compliance","assignee":"employee","days_offset":-10},
        {"title":"Complete I-9 Section 1","category":"compliance","assignee":"employee","days_offset":-3},
        {"title":"Submit W-4 and state withholding","category":"forms","assignee":"employee","days_offset":-3},
        {"title":"Uniform and duty-gear sizing","category":"forms","assignee":"employee","days_offset":-3},
        {"title":"Issue duty equipment and uniform","category":"equipment","assignee":"facilities","days_offset":0},
        {"title":"Oath of office","category":"introduction","assignee":"hr","days_offset":0},
        {"title":"Assign Field Training Officer","category":"introduction","assignee":"manager","days_offset":0},
        {"title":"Enroll in academy / in-service training","category":"training","assignee":"hr","days_offset":1},
        {"title":"30-day FTO checkpoint","category":"introduction","assignee":"manager","days_offset":30},
        {"title":"90-day probation review","category":"introduction","assignee":"manager","days_offset":90}
      ]'::jsonb
      WHEN 'temporary' THEN '[
        {"title":"Accept short-term offer","category":"forms","assignee":"employee","days_offset":-3},
        {"title":"Complete I-9 Section 1","category":"compliance","assignee":"employee","days_offset":-1},
        {"title":"Submit W-4 and state withholding","category":"forms","assignee":"employee","days_offset":-1},
        {"title":"Set up direct deposit","category":"forms","assignee":"employee","days_offset":-1},
        {"title":"Acknowledge abbreviated policy pack","category":"policy","assignee":"employee","days_offset":0},
        {"title":"Timecard / scheduling setup","category":"provisioning","assignee":"hr","days_offset":0},
        {"title":"Supervisor introduction","category":"introduction","assignee":"manager","days_offset":0},
        {"title":"Issue any required equipment","category":"equipment","assignee":"facilities","days_offset":0}
      ]'::jsonb
      WHEN 'contractor' THEN '[
        {"title":"Sign master services agreement / NDA","category":"forms","assignee":"employee","days_offset":-5},
        {"title":"Upload Certificate of Insurance","category":"compliance","assignee":"employee","days_offset":-3},
        {"title":"Submit W-9","category":"forms","assignee":"employee","days_offset":-3},
        {"title":"Scoped account request","category":"provisioning","assignee":"it","days_offset":-1},
        {"title":"Security and data-handling briefing","category":"training","assignee":"employee","days_offset":0},
        {"title":"Set access expiration date","category":"provisioning","assignee":"it","days_offset":0},
        {"title":"Sponsor sign-off","category":"introduction","assignee":"manager","days_offset":0}
      ]'::jsonb
      WHEN 'volunteer' THEN '[
        {"title":"Submit volunteer application","category":"forms","assignee":"employee","days_offset":-7},
        {"title":"Background check consent","category":"compliance","assignee":"employee","days_offset":-7},
        {"title":"Sign liability waiver","category":"forms","assignee":"employee","days_offset":-3},
        {"title":"Volunteer orientation","category":"introduction","assignee":"hr","days_offset":0},
        {"title":"Acknowledge volunteer code of conduct","category":"policy","assignee":"employee","days_offset":0},
        {"title":"Role and schedule assignment","category":"introduction","assignee":"manager","days_offset":0}
      ]'::jsonb
      WHEN 'elected' THEN '[
        {"title":"Schedule oath of office","category":"introduction","assignee":"hr","days_offset":-3},
        {"title":"File Statement of Economic Interest","category":"compliance","assignee":"employee","days_offset":-3},
        {"title":"Ethics training","category":"training","assignee":"employee","days_offset":0},
        {"title":"Public records / open meetings training","category":"training","assignee":"employee","days_offset":0},
        {"title":"Issue official email and directory listing","category":"provisioning","assignee":"it","days_offset":0},
        {"title":"Issue ID badge","category":"equipment","assignee":"facilities","days_offset":0},
        {"title":"Onboarding briefing with Clerk","category":"introduction","assignee":"hr","days_offset":1},
        {"title":"Acknowledge confidentiality policy","category":"policy","assignee":"employee","days_offset":1}
      ]'::jsonb
      ELSE '[
        {"title":"Accept offer","category":"forms","assignee":"employee","days_offset":-7},
        {"title":"Complete I-9 Section 1","category":"compliance","assignee":"employee","days_offset":-3},
        {"title":"Submit W-4","category":"forms","assignee":"employee","days_offset":-3},
        {"title":"Day-1 orientation","category":"introduction","assignee":"hr","days_offset":0}
      ]'::jsonb
    END;

    idx := 0;
    FOR t IN SELECT * FROM jsonb_array_elements(tasks) LOOP
      INSERT INTO public.template_tasks (template_id, title, category, assignee, days_offset, sort_order, is_required)
      VALUES (
        tpl_id,
        t->>'title',
        (t->>'category')::public.task_category,
        (t->>'assignee')::public.task_assignee,
        COALESCE((t->>'days_offset')::int, 0),
        idx * 10,
        true
      );
      idx := idx + 1;
    END LOOP;
  END LOOP;
END $$;
