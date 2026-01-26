-- =============================================================================
-- SEED SCRIPT: 10k Ticket Performance Test
-- =============================================================================
-- Distribuisce 10.000 ticket su brand esistenti con:
-- - Contatti realistici con telefoni
-- - Mix di status, priority, assignment
-- - Tag categories distribuite
-- - Date aging realistiche per test SLA
-- =============================================================================

-- STEP 0: Verifica brand disponibili
DO $$
DECLARE
  v_brand_count INT;
BEGIN
  SELECT COUNT(*) INTO v_brand_count FROM brands;
  IF v_brand_count = 0 THEN
    RAISE EXCEPTION 'Nessun brand trovato. Crea almeno un brand prima del seed.';
  END IF;
  RAISE NOTICE 'Brand disponibili: %', v_brand_count;
END $$;

-- =============================================================================
-- STEP 1: Crea contatti di test (2000 contatti → ~5 ticket/contatto media)
-- =============================================================================
DO $$
DECLARE
  v_brand RECORD;
  v_contact_id UUID;
  v_phone_normalized TEXT;
  i INT;
  v_contacts_per_brand INT := 1000;
BEGIN
  FOR v_brand IN SELECT id, name FROM brands LIMIT 3 LOOP
    RAISE NOTICE 'Creando % contatti per brand %...', v_contacts_per_brand, v_brand.name;
    
    FOR i IN 1..v_contacts_per_brand LOOP
      -- Genera telefono unico
      v_phone_normalized := '3' || LPAD((EXTRACT(EPOCH FROM now())::bigint % 1000000000 + i + (SELECT COUNT(*) FROM contacts WHERE brand_id = v_brand.id))::TEXT, 9, '0');
      
      -- Crea contatto
      INSERT INTO contacts (brand_id, first_name, last_name, email, city, status)
      VALUES (
        v_brand.id,
        'Test' || i,
        'User' || (i % 100),
        'test' || i || '_' || LEFT(v_brand.id::TEXT, 8) || '@perf.test',
        (ARRAY['Milano', 'Roma', 'Napoli', 'Torino', 'Bologna', 'Firenze', 'Palermo', 'Genova'])[1 + (i % 8)],
        (ARRAY['new', 'active', 'qualified', 'unqualified']::contact_status[])[1 + (i % 4)]
      )
      RETURNING id INTO v_contact_id;
      
      -- Crea telefono
      INSERT INTO contact_phones (brand_id, contact_id, phone_raw, phone_normalized, country_code, is_primary)
      VALUES (
        v_brand.id,
        v_contact_id,
        '+39 ' || SUBSTRING(v_phone_normalized FROM 1 FOR 3) || ' ' || SUBSTRING(v_phone_normalized FROM 4 FOR 3) || ' ' || SUBSTRING(v_phone_normalized FROM 7),
        v_phone_normalized,
        'IT',
        true
      );
      
      -- Progress ogni 500
      IF i % 500 = 0 THEN
        RAISE NOTICE '  ... % contatti creati', i;
      END IF;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Contatti creati con successo!';
END $$;

-- =============================================================================
-- STEP 2: Assicura che ogni brand abbia tag di categoria per ticket
-- =============================================================================
DO $$
DECLARE
  v_brand RECORD;
  v_tag_names TEXT[] := ARRAY['Assistenza Tecnica', 'Reclami', 'Informazioni', 'Fatturazione', 'Spedizioni', 'Resi'];
  v_tag_colors TEXT[] := ARRAY['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#6366f1'];
  i INT;
BEGIN
  FOR v_brand IN SELECT id, name FROM brands LIMIT 3 LOOP
    FOR i IN 1..array_length(v_tag_names, 1) LOOP
      INSERT INTO tags (brand_id, name, color, scope, description)
      VALUES (
        v_brand.id,
        v_tag_names[i],
        v_tag_colors[i],
        'ticket',
        'Tag categoria per test performance'
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
    RAISE NOTICE 'Tag creati/verificati per brand %', v_brand.name;
  END LOOP;
END $$;

-- =============================================================================
-- STEP 3: Assicura operatori per round-robin test
-- =============================================================================
DO $$
DECLARE
  v_brand RECORD;
  v_user RECORD;
  v_role_exists BOOLEAN;
BEGIN
  FOR v_brand IN SELECT id, name FROM brands LIMIT 3 LOOP
    -- Verifica se ci sono operatori
    SELECT EXISTS(
      SELECT 1 FROM user_roles WHERE brand_id = v_brand.id AND role IN ('callcenter', 'admin')
    ) INTO v_role_exists;
    
    IF NOT v_role_exists THEN
      -- Assegna primo utente disponibile come callcenter
      SELECT * INTO v_user FROM users LIMIT 1;
      IF v_user.id IS NOT NULL THEN
        INSERT INTO user_roles (brand_id, user_id, role)
        VALUES (v_brand.id, v_user.id, 'callcenter')
        ON CONFLICT DO NOTHING;
        RAISE NOTICE 'Assegnato operatore % al brand %', v_user.email, v_brand.name;
      END IF;
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- STEP 4: Genera 10.000 ticket con distribuzioni realistiche
-- =============================================================================
DO $$
DECLARE
  v_brand RECORD;
  v_contact RECORD;
  v_operator RECORD;
  v_tag RECORD;
  v_ticket_id UUID;
  v_tickets_per_brand INT;
  v_total_tickets INT := 10000;
  v_brand_count INT;
  v_status ticket_status;
  v_priority INT;
  v_created_offset INTERVAL;
  v_is_assigned BOOLEAN;
  v_is_resolved BOOLEAN;
  i INT;
  v_contact_ids UUID[];
  v_operator_ids UUID[];
  v_tag_ids UUID[];
BEGIN
  -- Conta brand
  SELECT COUNT(*) INTO v_brand_count FROM brands LIMIT 3;
  v_tickets_per_brand := v_total_tickets / GREATEST(v_brand_count, 1);
  
  FOR v_brand IN SELECT id, name FROM brands LIMIT 3 LOOP
    RAISE NOTICE '=== Generando % ticket per brand % ===', v_tickets_per_brand, v_brand.name;
    
    -- Cache contatti per questo brand
    SELECT ARRAY_AGG(id) INTO v_contact_ids
    FROM contacts WHERE brand_id = v_brand.id;
    
    -- Cache operatori per questo brand
    SELECT ARRAY_AGG(ur.user_id) INTO v_operator_ids
    FROM user_roles ur WHERE ur.brand_id = v_brand.id AND ur.role IN ('callcenter', 'admin');
    
    -- Cache tag per questo brand
    SELECT ARRAY_AGG(t.id) INTO v_tag_ids
    FROM tags t WHERE t.brand_id = v_brand.id AND t.scope IN ('ticket', 'mixed') AND t.is_active = true;
    
    -- Fallback se nessun contatto
    IF v_contact_ids IS NULL OR array_length(v_contact_ids, 1) IS NULL THEN
      RAISE NOTICE 'Nessun contatto per brand %, skip', v_brand.name;
      CONTINUE;
    END IF;
    
    FOR i IN 1..v_tickets_per_brand LOOP
      -- Distribuzione status realistica:
      -- 40% open, 25% in_progress, 15% resolved, 15% closed, 5% reopened
      v_status := (ARRAY['open', 'open', 'open', 'open', 
                         'in_progress', 'in_progress', 'in_progress',
                         'resolved', 'resolved',
                         'closed', 'closed',
                         'reopened']::ticket_status[])[1 + (i % 12)];
      
      -- Distribuzione priority realistica:
      -- P1: 5%, P2: 15%, P3: 50%, P4: 20%, P5: 10%
      v_priority := (ARRAY[1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5])[1 + (i % 20)];
      
      -- Aging: distribuito da 0 a 30 giorni
      v_created_offset := (random() * 30)::INT * INTERVAL '1 day' + (random() * 24)::INT * INTERVAL '1 hour';
      
      -- 70% assegnati, 30% non assegnati
      v_is_assigned := (i % 10) < 7;
      
      -- Resolved/closed hanno date specifiche
      v_is_resolved := v_status IN ('resolved', 'closed');
      
      -- Inserisci ticket
      INSERT INTO tickets (
        brand_id,
        contact_id,
        status,
        priority,
        title,
        description,
        category_tag_id,
        assigned_to_user_id,
        assigned_by_user_id,
        assigned_at,
        created_by,
        opened_at,
        resolved_at,
        closed_at,
        created_at
      )
      VALUES (
        v_brand.id,
        v_contact_ids[1 + (i % array_length(v_contact_ids, 1))],
        v_status,
        v_priority,
        'Ticket Test #' || i || ' - ' || v_status || ' P' || v_priority,
        'Descrizione ticket di test per performance benchmark. Ticket numero ' || i || ' del brand ' || v_brand.name,
        -- 80% con categoria, 20% senza
        CASE WHEN v_tag_ids IS NOT NULL AND array_length(v_tag_ids, 1) > 0 AND (i % 5) < 4
          THEN v_tag_ids[1 + (i % array_length(v_tag_ids, 1))]
          ELSE NULL
        END,
        -- Assegnazione
        CASE WHEN v_is_assigned AND v_operator_ids IS NOT NULL AND array_length(v_operator_ids, 1) > 0
          THEN v_operator_ids[1 + (i % array_length(v_operator_ids, 1))]
          ELSE NULL
        END,
        -- 50% auto-assegnati (NULL), 50% manuali (stesso operatore)
        CASE WHEN v_is_assigned AND (i % 2) = 0 AND v_operator_ids IS NOT NULL AND array_length(v_operator_ids, 1) > 0
          THEN v_operator_ids[1 + (i % array_length(v_operator_ids, 1))]
          ELSE NULL
        END,
        CASE WHEN v_is_assigned THEN now() - v_created_offset + INTERVAL '30 minutes' ELSE NULL END,
        -- 60% AI, 40% user
        CASE WHEN (i % 5) < 3 THEN 'ai' ELSE 'user' END::ticket_creator,
        now() - v_created_offset,
        CASE WHEN v_is_resolved THEN now() - v_created_offset + INTERVAL '2 hours' ELSE NULL END,
        CASE WHEN v_status = 'closed' THEN now() - v_created_offset + INTERVAL '3 hours' ELSE NULL END,
        now() - v_created_offset
      );
      
      -- Progress ogni 1000
      IF i % 1000 = 0 THEN
        RAISE NOTICE '  ... % ticket creati', i;
      END IF;
    END LOOP;
    
    RAISE NOTICE 'Completato brand %: % ticket', v_brand.name, v_tickets_per_brand;
  END LOOP;
  
  RAISE NOTICE '=== SEED COMPLETATO: % ticket totali ===', v_total_tickets;
END $$;

-- =============================================================================
-- STEP 5: Statistiche finali
-- =============================================================================
SELECT 
  b.name as brand,
  COUNT(*) as total_tickets,
  COUNT(*) FILTER (WHERE t.status IN ('open', 'in_progress', 'reopened')) as active,
  COUNT(*) FILTER (WHERE t.assigned_to_user_id IS NULL AND t.status IN ('open', 'in_progress', 'reopened')) as unassigned,
  COUNT(*) FILTER (WHERE t.assigned_by_user_id IS NULL AND t.assigned_to_user_id IS NOT NULL) as auto_assigned,
  COUNT(*) FILTER (WHERE t.assigned_by_user_id IS NOT NULL) as manual_assigned,
  ROUND(AVG(t.priority), 2) as avg_priority
FROM tickets t
JOIN brands b ON b.id = t.brand_id
GROUP BY b.id, b.name
ORDER BY total_tickets DESC;
