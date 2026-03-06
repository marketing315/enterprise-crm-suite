
INSERT INTO contact_field_definitions (scope, brand_id, key, label, field_type, is_active, display_order)
VALUES
  ('global', NULL, 'cap_keplero', 'CAP (Keplero)', 'text', true, 100),
  ('global', NULL, 'nome_keplero', 'Nome (Keplero)', 'text', true, 101),
  ('global', NULL, 'numero_keplero', 'Numero (Keplero)', 'text', true, 102),
  ('global', NULL, 'zona_keplero', 'Zona (Keplero)', 'text', true, 103),
  ('global', NULL, 'citta_keplero', 'Città (Keplero)', 'text', true, 104),
  ('global', NULL, 'cognome_keplero', 'Cognome (Keplero)', 'text', true, 105),
  ('global', NULL, 'indirizzo_keplero', 'Indirizzo (Keplero)', 'text', true, 106),
  ('global', NULL, 'pacemaker_keplero', 'Pacemaker (Keplero)', 'text', true, 107),
  ('global', NULL, 'numero_civico_keplero', 'Numero Civico (Keplero)', 'text', true, 108),
  ('global', NULL, 'esito_chiamata_keplero', 'Esito Chiamata (Keplero)', 'text', true, 109),
  ('global', NULL, 'motivo_rifiuto_keplero', 'Motivo Rifiuto (Keplero)', 'text', true, 110),
  ('global', NULL, 'motivo_contatto_keplero', 'Motivo Contatto (Keplero)', 'text', true, 111),
  ('global', NULL, 'ora_appuntamento_keplero', 'Ora Appuntamento (Keplero)', 'text', true, 112),
  ('global', NULL, 'data_appuntamento_keplero', 'Data Appuntamento (Keplero)', 'text', true, 113),
  ('global', NULL, 'ha_gia_dispositivo_keplero', 'Ha già dispositivo (Keplero)', 'text', true, 114),
  ('global', NULL, 'telefono_principale_keplero', 'Telefono Principale (Keplero)', 'text', true, 115),
  ('global', NULL, 'telefono_secondario_keplero', 'Telefono Secondario (Keplero)', 'text', true, 116),
  ('global', NULL, 'disponibilita_orarie_keplero', 'Disponibilità Orarie (Keplero)', 'text', true, 117),
  ('global', NULL, 'fissato_keplero', 'Fissato (Keplero)', 'text', true, 118)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.upsert_contact_field_values_by_key(
  p_contact_id uuid,
  p_brand_id uuid,
  p_field_values jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_field_def RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_field_values)
  LOOP
    SELECT * INTO v_field_def
    FROM contact_field_definitions
    WHERE key = (v_item->>'field_key')
      AND is_active = true
      AND (brand_id IS NULL OR brand_id = p_brand_id)
    ORDER BY brand_id NULLS LAST
    LIMIT 1;
    
    IF v_field_def IS NULL THEN
      CONTINUE;
    END IF;
    
    INSERT INTO contact_field_values (
      contact_id, brand_id, field_definition_id,
      value_text, updated_by_user_id
    )
    VALUES (
      p_contact_id,
      p_brand_id,
      v_field_def.id,
      v_item->>'value',
      NULL
    )
    ON CONFLICT (contact_id, field_definition_id) DO UPDATE SET
      value_text = EXCLUDED.value_text,
      updated_at = now();
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object('updated', v_count);
END;
$$;
