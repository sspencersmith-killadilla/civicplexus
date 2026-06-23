
CREATE OR REPLACE FUNCTION public.tg_employees_autoassign_training()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _due date;
BEGIN
  IF NEW.worker_type_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.worker_type_id = OLD.worker_type_id THEN RETURN NEW; END IF;
  _due := COALESCE(NEW.start_date, CURRENT_DATE) + INTERVAL '30 days';
  INSERT INTO public.employee_training (employee_id, course_id, due_date, status, assigned_by)
  SELECT NEW.id, c.id, _due, 'assigned', NULL FROM public.courses c
   WHERE c.active = true AND (c.auto_assign_on_hire = true OR (NEW.worker_type_id = ANY(c.required_for_worker_types)))
     AND NOT EXISTS (SELECT 1 FROM public.employee_training et WHERE et.employee_id = NEW.id AND et.course_id = c.id AND et.status <> 'cancelled');
  RETURN NEW;
END $function$;

INSERT INTO public.org_settings (singleton, org_name, ein, address, phone, primary_color, accent_color, tmrs_member_rate_pct, tmrs_employer_match_pct)
SELECT true,'City of Demo Springs','74-1234567','101 Main St, Demo Springs, TX 78900','512-555-0100','#0F172A','#3B82F6',7.00,2.00
WHERE NOT EXISTS (SELECT 1 FROM public.org_settings);
UPDATE public.org_settings SET org_name=COALESCE(NULLIF(org_name,''),'City of Demo Springs'), ein=COALESCE(NULLIF(ein,''),'74-1234567'),
  address=COALESCE(NULLIF(address,''),'101 Main St, Demo Springs, TX 78900'), phone=COALESCE(NULLIF(phone,''),'512-555-0100'),
  tmrs_member_rate_pct=COALESCE(tmrs_member_rate_pct,7.00), tmrs_employer_match_pct=COALESCE(tmrs_employer_match_pct,2.00);

INSERT INTO public.positions (id,title,position_code,department,worker_type_id,flsa_class,pay_grade,status,budgeted_fte) VALUES
('00000001-0000-0000-0000-000000000001','Patrol Officer','PD-PAT-01','Police','92919c71-dd8c-4c6b-a9cb-55d8f21c4783','non_exempt','PS3','open',12),
('00000001-0000-0000-0000-000000000002','Police Sergeant','PD-SGT-01','Police','92919c71-dd8c-4c6b-a9cb-55d8f21c4783','exempt','PS5','filled',4),
('00000001-0000-0000-0000-000000000003','HR Generalist','HR-GEN-01','Human Resources','73e49e03-2459-41fd-9879-49f1ec3e8c78','exempt','G3','filled',2),
('00000001-0000-0000-0000-000000000004','Public Works Crew Lead','PW-LEAD-01','Public Works','997e5370-e0e3-4344-9876-9a834b6ac0fd','non_exempt','G2','filled',3),
('00000001-0000-0000-0000-000000000005','Accounting Clerk','FIN-ACC-01','Finance','73e49e03-2459-41fd-9879-49f1ec3e8c78','non_exempt','G1','open',2),
('00000001-0000-0000-0000-000000000006','City Manager','EXEC-CM-01','Executive','ced9f240-91e1-4abb-acab-8ee0465dc42b','exempt','EX1','filled',1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pay_groups (id,name,description) VALUES ('00000002-0000-0000-0000-000000000001','Bi-Weekly Standard','All non-exempt + most exempt staff') ON CONFLICT DO NOTHING;
INSERT INTO public.pay_calendars (id,pay_group_id,frequency,anchor_period_start,check_date_offset_days,cutoff_offset_days) VALUES
('00000003-0000-0000-0000-000000000001','00000002-0000-0000-0000-000000000001','biweekly','2025-01-05',5,2) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pay_grades (id,code,name,currency,min_annual,mid_annual,max_annual,flsa_default) VALUES
('00000004-0000-0000-0000-000000000001','G1','General 1','USD',38000,46000,54000,'non_exempt'),
('00000004-0000-0000-0000-000000000002','G2','General 2','USD',46000,56000,66000,'non_exempt'),
('00000004-0000-0000-0000-000000000003','G3','General 3','USD',58000,72000,86000,'exempt'),
('00000004-0000-0000-0000-000000000004','PS3','Public Safety 3','USD',62000,74000,86000,'non_exempt'),
('00000004-0000-0000-0000-000000000005','PS5','Public Safety 5','USD',78000,92000,106000,'exempt'),
('00000004-0000-0000-0000-000000000006','EX1','Executive 1','USD',140000,170000,200000,'exempt')
ON CONFLICT DO NOTHING;

INSERT INTO public.market_ranges (job_family,level,geo,currency,p25,p50,p75,effective_date,source) VALUES
('Police Patrol','III','Central TX','USD',62000,71000,82000,'2025-01-01','TML survey'),
('HR Generalist','III','Central TX','USD',58000,68000,80000,'2025-01-01','SHRM 2025'),
('Public Works','II','Central TX','USD',44000,52000,62000,'2025-01-01','TML survey')
ON CONFLICT DO NOTHING;

INSERT INTO public.employees (id,first_name,last_name,personal_email,work_email,phone,department,job_title,worker_type_id,position_id,start_date,status) VALUES
('00000005-0000-0000-0000-000000000001','Marcus','Holloway','marcus.holloway@example.com','mholloway@demosprings.gov','512-555-0201','Executive','City Manager','ced9f240-91e1-4abb-acab-8ee0465dc42b','00000001-0000-0000-0000-000000000006','2019-04-15','active'),
('00000005-0000-0000-0000-000000000002','Priya','Raman','priya.raman@example.com','praman@demosprings.gov','512-555-0202','Human Resources','HR Director','73e49e03-2459-41fd-9879-49f1ec3e8c78',NULL,'2020-06-01','active'),
('00000005-0000-0000-0000-000000000003','Jamal','Foster','jamal.foster@example.com','jfoster@demosprings.gov','512-555-0203','Human Resources','HR Generalist','73e49e03-2459-41fd-9879-49f1ec3e8c78','00000001-0000-0000-0000-000000000003','2022-09-12','active'),
('00000005-0000-0000-0000-000000000004','Diane','Castellanos','dcastel@example.com','dcastellanos@demosprings.gov','512-555-0204','Police','Police Chief','92919c71-dd8c-4c6b-a9cb-55d8f21c4783',NULL,'2018-02-05','active'),
('00000005-0000-0000-0000-000000000005','Travis','Nguyen','travis.nguyen@example.com','tnguyen@demosprings.gov','512-555-0205','Police','Police Sergeant','92919c71-dd8c-4c6b-a9cb-55d8f21c4783','00000001-0000-0000-0000-000000000002','2019-08-19','active'),
('00000005-0000-0000-0000-000000000006','Hannah','Bishop','hbishop@example.com','hbishop@demosprings.gov','512-555-0206','Police','Patrol Officer','92919c71-dd8c-4c6b-a9cb-55d8f21c4783','00000001-0000-0000-0000-000000000001','2021-03-22','active'),
('00000005-0000-0000-0000-000000000007','Andre','Williams','andre.williams@example.com','awilliams@demosprings.gov','512-555-0207','Police','Patrol Officer','92919c71-dd8c-4c6b-a9cb-55d8f21c4783','00000001-0000-0000-0000-000000000001','2023-07-10','active'),
('00000005-0000-0000-0000-000000000008','Sofia','Mendez','sofia.mendez@example.com',NULL,'512-555-0208','Police','Patrol Officer (Trainee)','92919c71-dd8c-4c6b-a9cb-55d8f21c4783','00000001-0000-0000-0000-000000000001','2026-01-15','preboarding'),
('00000005-0000-0000-0000-000000000009','Wesley','Park','wesley.park@example.com','wpark@demosprings.gov','512-555-0209','Public Works','Public Works Director','73e49e03-2459-41fd-9879-49f1ec3e8c78',NULL,'2017-11-01','active'),
('00000005-0000-0000-0000-00000000000a','Roberto','Salinas','rsalinas@example.com','rsalinas@demosprings.gov','512-555-0210','Public Works','Crew Lead','997e5370-e0e3-4344-9876-9a834b6ac0fd','00000001-0000-0000-0000-000000000004','2020-04-06','active'),
('00000005-0000-0000-0000-00000000000b','Kenya','Brooks','kenya.brooks@example.com','kbrooks@demosprings.gov','512-555-0211','Public Works','Maintenance Worker II','997e5370-e0e3-4344-9876-9a834b6ac0fd',NULL,'2022-05-30','active'),
('00000005-0000-0000-0000-00000000000c','Devon','Carter','devon.carter@example.com','dcarter@demosprings.gov','512-555-0212','Public Works','Maintenance Worker I','997e5370-e0e3-4344-9876-9a834b6ac0fd',NULL,'2024-02-12','active'),
('00000005-0000-0000-0000-00000000000d','Lillian','Webb','lwebb@example.com','lwebb@demosprings.gov','512-555-0213','Finance','Finance Director','73e49e03-2459-41fd-9879-49f1ec3e8c78',NULL,'2019-01-22','active'),
('00000005-0000-0000-0000-00000000000e','Owen','Hartley','owen.hartley@example.com','ohartley@demosprings.gov','512-555-0214','Finance','Senior Accountant','73e49e03-2459-41fd-9879-49f1ec3e8c78',NULL,'2021-09-08','active'),
('00000005-0000-0000-0000-00000000000f','Margot','Sinclair','margot.sinclair@example.com','msinclair@demosprings.gov','512-555-0215','Finance','Accounting Clerk','73e49e03-2459-41fd-9879-49f1ec3e8c78','00000001-0000-0000-0000-000000000005','2023-11-13','active'),
('00000005-0000-0000-0000-000000000010','Theo','Reyes','theo.reyes@example.com','treyes@demosprings.gov','512-555-0216','Parks & Recreation','Parks Supervisor','997e5370-e0e3-4344-9876-9a834b6ac0fd',NULL,'2018-06-04','active'),
('00000005-0000-0000-0000-000000000011','Ivy','Sutton','ivy.sutton@example.com',NULL,'512-555-0217','Parks & Recreation','Lifeguard (Seasonal)','41ae6684-90e2-467c-ac1d-6dd7462534e7',NULL,'2025-05-15','offboarded'),
('00000005-0000-0000-0000-000000000012','Nikhil','Pradhan','nikhil@vendor.example','nikhil@demosprings.gov',NULL,'IT','Network Consultant','99f60172-e2d8-4a58-967f-dd93dc89d92b',NULL,'2024-10-01','active')
ON CONFLICT (id) DO NOTHING;

UPDATE public.employees SET end_date='2025-09-05', separation_date='2025-09-05', separation_reason='Seasonal end of term', rehire_eligible=true
 WHERE id='00000005-0000-0000-0000-000000000011' AND end_date IS NULL;

INSERT INTO public.employee_comp (id,employee_id,effective_date,base_annual,currency,pay_grade_id,source,change_reason) VALUES
('00000006-0000-0000-0000-000000000001','00000005-0000-0000-0000-000000000001','2024-10-01',182000,'USD','00000004-0000-0000-0000-000000000006','market','Council comp study'),
('00000006-0000-0000-0000-000000000002','00000005-0000-0000-0000-000000000002','2024-10-01',118000,'USD','00000004-0000-0000-0000-000000000003','merit','FY25 merit'),
('00000006-0000-0000-0000-000000000003','00000005-0000-0000-0000-000000000003','2024-10-01',68000,'USD','00000004-0000-0000-0000-000000000003','merit','FY25 merit'),
('00000006-0000-0000-0000-000000000004','00000005-0000-0000-0000-000000000004','2024-10-01',142000,'USD','00000004-0000-0000-0000-000000000005','merit','FY25 merit'),
('00000006-0000-0000-0000-000000000005','00000005-0000-0000-0000-000000000005','2024-10-01',95000,'USD','00000004-0000-0000-0000-000000000005','merit','FY25 merit'),
('00000006-0000-0000-0000-000000000006','00000005-0000-0000-0000-000000000006','2024-10-01',72000,'USD','00000004-0000-0000-0000-000000000004','merit','FY25 merit'),
('00000006-0000-0000-0000-000000000007','00000005-0000-0000-0000-000000000007','2024-10-01',66000,'USD','00000004-0000-0000-0000-000000000004','hire','Initial hire'),
('00000006-0000-0000-0000-000000000008','00000005-0000-0000-0000-000000000009','2024-10-01',125000,'USD','00000004-0000-0000-0000-000000000003','merit','FY25 merit'),
('00000006-0000-0000-0000-000000000009','00000005-0000-0000-0000-00000000000a','2024-10-01',62000,'USD','00000004-0000-0000-0000-000000000002','promotion','Promotion to Crew Lead'),
('00000006-0000-0000-0000-00000000000a','00000005-0000-0000-0000-00000000000b','2024-10-01',52000,'USD','00000004-0000-0000-0000-000000000002','merit','FY25 merit'),
('00000006-0000-0000-0000-00000000000b','00000005-0000-0000-0000-00000000000c','2024-10-01',44000,'USD','00000004-0000-0000-0000-000000000001','hire','Initial hire'),
('00000006-0000-0000-0000-00000000000c','00000005-0000-0000-0000-00000000000d','2024-10-01',132000,'USD','00000004-0000-0000-0000-000000000003','merit','FY25 merit'),
('00000006-0000-0000-0000-00000000000d','00000005-0000-0000-0000-00000000000e','2024-10-01',82000,'USD','00000004-0000-0000-0000-000000000003','merit','FY25 merit'),
('00000006-0000-0000-0000-00000000000e','00000005-0000-0000-0000-00000000000f','2024-10-01',48000,'USD','00000004-0000-0000-0000-000000000001','merit','FY25 merit'),
('00000006-0000-0000-0000-00000000000f','00000005-0000-0000-0000-000000000010','2024-10-01',74000,'USD','00000004-0000-0000-0000-000000000003','merit','FY25 merit')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employee_leave_enrollments (employee_id,plan_id,effective_from,opening_balance_hours)
SELECT e.id,p.id,COALESCE(e.start_date,CURRENT_DATE),40 FROM public.employees e CROSS JOIN public.leave_plans p
 WHERE e.status='active' AND p.code IN ('PTO','SICK') ON CONFLICT DO NOTHING;

INSERT INTO public.leave_balances (employee_id,plan_id,accrued_hours,used_hours,pending_hours)
SELECT e.id,p.id, CASE p.code WHEN 'PTO' THEN 120 ELSE 80 END, CASE p.code WHEN 'PTO' THEN 40 ELSE 12 END, 0
  FROM public.employees e CROSS JOIN public.leave_plans p
 WHERE e.status='active' AND p.code IN ('PTO','SICK') ON CONFLICT DO NOTHING;

INSERT INTO public.policies (id,title,version,body_md,effective_date,requires_reack_months,published) VALUES
('00000008-0000-0000-0000-000000000001','Code of Conduct',3,'# Code of Conduct\n\nAll employees are expected to act with integrity...','2025-01-01',12,true),
('00000008-0000-0000-0000-000000000002','Acceptable Use of Technology',2,'# Acceptable Use\n\nCity-issued devices and accounts must be used for...','2025-01-01',12,true)
ON CONFLICT DO NOTHING;

INSERT INTO public.policy_campaigns (id,policy_id,name,status,due_date) VALUES
('00000009-0000-0000-0000-000000000001','00000008-0000-0000-0000-000000000001','Annual Code of Conduct 2026','active', CURRENT_DATE + 30)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.policy_campaign_assignments (campaign_id,employee_id,status)
SELECT '00000009-0000-0000-0000-000000000001', e.id, 'pending' FROM public.employees e WHERE e.status='active' ON CONFLICT DO NOTHING;

INSERT INTO public.certifications (id,name,issuer,validity_months,compliance_framework) VALUES
('0000000a-0000-0000-0000-000000000001','TCOLE Basic Peace Officer','TCOLE',24,'TCOLE'),
('0000000a-0000-0000-0000-000000000002','CPR/AED','American Red Cross',24,'OSHA'),
('0000000a-0000-0000-0000-000000000003','CDL Class B','Texas DPS',12,'DOT')
ON CONFLICT DO NOTHING;

INSERT INTO public.courses (id,name,provider,duration_minutes,active,auto_assign_on_hire,recurrence_months,issues_certification_id,description) VALUES
('0000000b-0000-0000-0000-000000000001','New Hire Orientation','Internal',90,true,false,NULL,NULL,'Mandatory orientation.'),
('0000000b-0000-0000-0000-000000000002','Workplace Harassment Prevention','Internal',60,true,false,12,NULL,'Annual EEO refresher.'),
('0000000b-0000-0000-0000-000000000003','CPR / AED Recertification','Red Cross',180,true,false,24,'0000000a-0000-0000-0000-000000000002','Hands-on recertification.'),
('0000000b-0000-0000-0000-000000000004','Cybersecurity Awareness','KnowBe4',45,true,false,12,NULL,'Phishing, password hygiene, data classification.')
ON CONFLICT DO NOTHING;

INSERT INTO public.employee_training (id,employee_id,course_id,status,due_date,completed_at,score) VALUES
('0000000c-0000-0000-0000-000000000001','00000005-0000-0000-0000-000000000006','0000000b-0000-0000-0000-000000000003','complete', CURRENT_DATE - 200, (now() - interval '200 days'), 95),
('0000000c-0000-0000-0000-000000000002','00000005-0000-0000-0000-000000000007','0000000b-0000-0000-0000-000000000003','assigned', CURRENT_DATE + 14, NULL, NULL),
('0000000c-0000-0000-0000-000000000003','00000005-0000-0000-0000-00000000000a','0000000b-0000-0000-0000-000000000004','overdue',  CURRENT_DATE - 5,  NULL, NULL),
('0000000c-0000-0000-0000-000000000004','00000005-0000-0000-0000-000000000003','0000000b-0000-0000-0000-000000000002','in_progress', CURRENT_DATE + 30, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employee_certifications (employee_id,certification_id,issued_at,expires_at) VALUES
('00000005-0000-0000-0000-000000000006','0000000a-0000-0000-0000-000000000001','2021-04-12','2027-04-12'),
('00000005-0000-0000-0000-000000000007','0000000a-0000-0000-0000-000000000001','2023-08-01','2025-08-01'),
('00000005-0000-0000-0000-00000000000a','0000000a-0000-0000-0000-000000000003','2024-05-10','2026-05-10')
ON CONFLICT DO NOTHING;

INSERT INTO public.tcole_licenses (employee_id,license_number,license_level,issued_on,cycle_start,cycle_end,required_hours,status) VALUES
('00000005-0000-0000-0000-000000000004','TX-PO-009921','master','2010-05-14','2025-09-01','2027-08-31',40,'active'),
('00000005-0000-0000-0000-000000000005','TX-PO-018442','advanced','2014-11-02','2025-09-01','2027-08-31',40,'active'),
('00000005-0000-0000-0000-000000000006','TX-PO-031120','intermediate','2021-04-12','2025-09-01','2027-08-31',40,'active'),
('00000005-0000-0000-0000-000000000007','TX-PO-038870','basic','2023-08-01','2025-09-01','2027-08-31',40,'active')
ON CONFLICT DO NOTHING;

INSERT INTO public.tmrs_enrollments (employee_id,member_rate_pct,enrolled_on,member_id_external)
SELECT e.id,7.00,COALESCE(e.start_date,CURRENT_DATE),'TMRS-'||substr(e.id::text,1,8)
  FROM public.employees e WHERE e.status='active' AND e.worker_type_id <> '99f60172-e2d8-4a58-967f-dd93dc89d92b'
ON CONFLICT DO NOTHING;

INSERT INTO public.job_requisitions (id,position_id,title,department,worker_type_id,location,employment_type,salary_min,salary_max,summary,description,requirements,slug,status,posted_at) VALUES
('0000000d-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000001','Patrol Officer','Police','92919c71-dd8c-4c6b-a9cb-55d8f21c4783','Demo Springs, TX','Full-time',62000,82000,'Join our patrol team protecting Demo Springs.','Patrol assigned beats, respond to calls for service, write reports, and engage the community.','TCOLE license or willingness to attend academy; valid TX driver license.','patrol-officer','open', now() - interval '14 days'),
('0000000d-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000005','Accounting Clerk','Finance','73e49e03-2459-41fd-9879-49f1ec3e8c78','Demo Springs, TX','Full-time',38000,48000,'Process AP, reconcile accounts, support month-end close.','Day-to-day accounting operations for a small municipal finance team.','2+ years AP/AR; Excel; municipal experience a plus.','accounting-clerk','open', now() - interval '7 days')
ON CONFLICT DO NOTHING;

INSERT INTO public.job_applications (id,requisition_id,applicant_name,email,phone,source,status,rating) VALUES
('0000000e-0000-0000-0000-000000000001','0000000d-0000-0000-0000-000000000001','Marcus Chen','marcus.chen@example.com','512-555-0301','LinkedIn','phone_screen',4),
('0000000e-0000-0000-0000-000000000002','0000000d-0000-0000-0000-000000000001','Riley Tanaka','riley.tanaka@example.com','512-555-0302','Indeed','interview',5),
('0000000e-0000-0000-0000-000000000003','0000000d-0000-0000-0000-000000000001','Brett Aldridge','brett.aldridge@example.com','512-555-0303','Referral','new',NULL),
('0000000e-0000-0000-0000-000000000004','0000000d-0000-0000-0000-000000000002','Tasha Kim','tasha.kim@example.com','512-555-0304','City website','offer',5),
('0000000e-0000-0000-0000-000000000005','0000000d-0000-0000-0000-000000000002','Eddie Vargas','eddie.vargas@example.com','512-555-0305','Indeed','rejected',2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.interviews (id,application_id,stage,scheduled_at,duration_minutes,location,interviewer_ids,status) VALUES
('0000000f-0000-0000-0000-000000000001','0000000e-0000-0000-0000-000000000002','panel', now() + interval '3 days', 60, 'PD Conference Room A', '{}', 'scheduled'),
('0000000f-0000-0000-0000-000000000002','0000000e-0000-0000-0000-000000000001','phone_screen', now() - interval '2 days', 30, 'Phone', '{}', 'complete')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.review_cycles (id,name,period_start,period_end,kickoff_at,self_review_due,manager_review_due,signoff_due,status,template_key) VALUES
('00000011-0000-0000-0000-000000000001','FY25 Annual Reviews','2024-10-01','2025-09-30','2025-10-01','2025-10-15','2025-10-31','2025-11-15','draft','annual')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.performance_reviews (id,employee_id,review_period_start,review_period_end,status,overall_rating,manager_narrative) VALUES
('00000012-0000-0000-0000-000000000001','00000005-0000-0000-0000-000000000006','2024-10-01','2025-09-30','manager_complete',4,'Hannah consistently exceeds expectations on community engagement.'),
('00000012-0000-0000-0000-000000000002','00000005-0000-0000-0000-000000000007','2024-10-01','2025-09-30','draft',NULL,NULL),
('00000012-0000-0000-0000-000000000003','00000005-0000-0000-0000-00000000000a','2024-10-01','2025-09-30','finalized',5,'Roberto led the storm-response crew with exemplary judgment.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.goals (id,owner_employee_id,title,description,category,status,progress,target_date,weight) VALUES
('00000013-0000-0000-0000-000000000001','00000005-0000-0000-0000-000000000006','Complete advanced TCOLE coursework','Earn advanced license within 18 months.','development','active',45,CURRENT_DATE+180,1),
('00000013-0000-0000-0000-000000000002','00000005-0000-0000-0000-000000000003','Deploy new onboarding workflow','Cut manual onboarding tasks by 50%.','project','active',70,CURRENT_DATE+90,2),
('00000013-0000-0000-0000-000000000003','00000005-0000-0000-0000-00000000000a','Zero recordable safety incidents','Maintain crew safety record for FY25.','team','active',80,CURRENT_DATE+120,3),
('00000013-0000-0000-0000-000000000004','00000005-0000-0000-0000-00000000000f','GASB 87 lease compliance','Complete all schedules by Q3 close.','performance','at_risk',30,CURRENT_DATE+60,1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.equipment_catalog (id,sku,name,category,sizes,unit_cost) VALUES
('00000014-0000-0000-0000-000000000001','LAP-DELL-7440','Dell Latitude 7440','laptop','[]'::jsonb,1450),
('00000014-0000-0000-0000-000000000002','PHONE-IPH15','iPhone 15','phone','[]'::jsonb,829),
('00000014-0000-0000-0000-000000000003','UNIF-PD-SHIRT','PD Patrol Shirt','uniform','["S","M","L","XL","XXL"]'::jsonb,65),
('00000014-0000-0000-0000-000000000004','BOOT-PW-STEEL','Steel-Toe Boot','ppe','["8","9","10","11","12"]'::jsonb,145)
ON CONFLICT DO NOTHING;

INSERT INTO public.equipment_issuance (employee_id,item_id,size,status,issued_at) VALUES
('00000005-0000-0000-0000-000000000003','00000014-0000-0000-0000-000000000001',NULL,'issued', now() - interval '180 days'),
('00000005-0000-0000-0000-000000000006','00000014-0000-0000-0000-000000000003','M','issued', now() - interval '60 days'),
('00000005-0000-0000-0000-000000000006','00000014-0000-0000-0000-000000000002',NULL,'issued', now() - interval '60 days'),
('00000005-0000-0000-0000-00000000000a','00000014-0000-0000-0000-000000000004','10','issued', now() - interval '30 days'),
('00000005-0000-0000-0000-00000000000c','00000014-0000-0000-0000-000000000004','11','issued', now() - interval '300 days')
ON CONFLICT DO NOTHING;

INSERT INTO public.ppe_sizing (employee_id,shirt,pants,boot,glove,hat) VALUES
('00000005-0000-0000-0000-000000000006','M','32x32','10','M','7 1/4'),
('00000005-0000-0000-0000-000000000007','L','34x34','11','L','7 3/8'),
('00000005-0000-0000-0000-00000000000a','XL','36x32','10','XL','7 1/2'),
('00000005-0000-0000-0000-00000000000b','L','32x30','9','M','7 1/4'),
('00000005-0000-0000-0000-00000000000c','M','30x30','11','M','7')
ON CONFLICT DO NOTHING;

INSERT INTO public.benefits_handoffs (employee_id,carrier,plan_type,enrollment_window_start,enrollment_window_end,status) VALUES
('00000005-0000-0000-0000-000000000007','BlueCross BlueShield TX','medical', CURRENT_DATE - 30, CURRENT_DATE + 1, 'pending'),
('00000005-0000-0000-0000-000000000008','BlueCross BlueShield TX','medical', CURRENT_DATE, CURRENT_DATE + 30,'pending'),
('00000005-0000-0000-0000-00000000000c','Delta Dental','dental', CURRENT_DATE - 60, CURRENT_DATE - 30,'submitted')
ON CONFLICT DO NOTHING;

INSERT INTO public.provisioning_requests (employee_id,kind,status,details) VALUES
('00000005-0000-0000-0000-000000000008','email','pending','{"alias":"smendez"}'),
('00000005-0000-0000-0000-000000000008','radio','pending','{"channel_group":"PD-1"}'),
('00000005-0000-0000-0000-000000000008','badge','pending','{"clearance":"officer"}')
ON CONFLICT DO NOTHING;

INSERT INTO public.grievances (id,submitted_by,subject_employee_id,category,severity,summary,details,is_anonymous,status,due_date) VALUES
('00000015-0000-0000-0000-000000000001', NULL, '00000005-0000-0000-0000-00000000000b', 'safety', 'medium', 'Lifting equipment past inspection date',
 'Reporter notes the boom lift sticker shows last inspection 14 months ago. Requesting investigation.', true, 'triage', CURRENT_DATE + 14)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fmla_cases (id,employee_id,status,reason,rolling_period_start,case_start_date,case_end_date,hours_used,hours_entitled)
VALUES ('00000016-0000-0000-0000-000000000001','00000005-0000-0000-0000-00000000000e','open','Birth and bonding','2024-11-01','2025-11-01','2026-01-23',160,480)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dependents (employee_id,first_name,last_name,relationship,dob) VALUES
('00000005-0000-0000-0000-00000000000e','Eleanor','Hartley','child','2025-11-01'),
('00000005-0000-0000-0000-000000000006','Joaquin','Bishop','spouse','1988-07-19'),
('00000005-0000-0000-0000-00000000000a','Maria','Salinas','spouse','1985-03-04')
ON CONFLICT DO NOTHING;
