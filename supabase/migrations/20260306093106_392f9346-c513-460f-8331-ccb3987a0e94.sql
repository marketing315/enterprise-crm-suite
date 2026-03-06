-- Fix search_path warnings for geo functions
CREATE OR REPLACE FUNCTION public.cap_to_provincia(p_cap text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
SELECT CASE substring(p_cap, 1, 2)
  WHEN '00' THEN 'RM' WHEN '01' THEN 'VT' WHEN '02' THEN 'RI' WHEN '03' THEN 'FR' WHEN '04' THEN 'LT'
  WHEN '05' THEN 'TR' WHEN '06' THEN 'PG'
  WHEN '07' THEN 'SS' WHEN '08' THEN 'CA' WHEN '09' THEN 'CA'
  WHEN '10' THEN 'TO' WHEN '11' THEN 'AO' WHEN '12' THEN 'CN' WHEN '13' THEN 'VC' WHEN '14' THEN 'AT' WHEN '15' THEN 'AL'
  WHEN '16' THEN 'GE' WHEN '17' THEN 'SV' WHEN '18' THEN 'IM' WHEN '19' THEN 'SP'
  WHEN '20' THEN 'MI' WHEN '21' THEN 'VA' WHEN '22' THEN 'CO' WHEN '23' THEN 'SO' WHEN '24' THEN 'BG' WHEN '25' THEN 'BS'
  WHEN '26' THEN 'CR' WHEN '27' THEN 'PV' WHEN '28' THEN 'NO' WHEN '29' THEN 'PC'
  WHEN '30' THEN 'VE' WHEN '31' THEN 'TV' WHEN '32' THEN 'BL' WHEN '33' THEN 'UD' WHEN '34' THEN 'TS'
  WHEN '35' THEN 'PD' WHEN '36' THEN 'VI' WHEN '37' THEN 'VR' WHEN '38' THEN 'TN' WHEN '39' THEN 'BZ'
  WHEN '40' THEN 'BO' WHEN '41' THEN 'MO' WHEN '42' THEN 'RE' WHEN '43' THEN 'PR' WHEN '44' THEN 'FE'
  WHEN '45' THEN 'RO' WHEN '46' THEN 'MN' WHEN '47' THEN 'FC' WHEN '48' THEN 'RA'
  WHEN '50' THEN 'FI' WHEN '51' THEN 'PT' WHEN '52' THEN 'AR' WHEN '53' THEN 'SI' WHEN '54' THEN 'MS'
  WHEN '55' THEN 'LU' WHEN '56' THEN 'PI' WHEN '57' THEN 'LI' WHEN '58' THEN 'GR' WHEN '59' THEN 'PO'
  WHEN '60' THEN 'AN' WHEN '61' THEN 'PU' WHEN '62' THEN 'MC' WHEN '63' THEN 'AP'
  WHEN '64' THEN 'TE' WHEN '65' THEN 'PE' WHEN '66' THEN 'CH' WHEN '67' THEN 'AQ'
  WHEN '70' THEN 'BA' WHEN '71' THEN 'FG' WHEN '72' THEN 'BR' WHEN '73' THEN 'LE' WHEN '74' THEN 'TA' WHEN '76' THEN 'BT'
  WHEN '75' THEN 'MT' WHEN '85' THEN 'PZ'
  WHEN '80' THEN 'NA' WHEN '81' THEN 'CE' WHEN '82' THEN 'BN' WHEN '83' THEN 'AV' WHEN '84' THEN 'SA'
  WHEN '86' THEN 'CB'
  WHEN '87' THEN 'CS' WHEN '88' THEN 'CZ' WHEN '89' THEN 'RC'
  WHEN '90' THEN 'PA' WHEN '91' THEN 'TP' WHEN '92' THEN 'AG' WHEN '93' THEN 'CL' WHEN '94' THEN 'EN'
  WHEN '95' THEN 'CT' WHEN '96' THEN 'SR' WHEN '97' THEN 'RG' WHEN '98' THEN 'ME'
  ELSE NULL
END
$$;

CREATE OR REPLACE FUNCTION public.provincia_to_regione(p_sigla text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
SELECT CASE p_sigla
  WHEN 'TO' THEN 'Piemonte' WHEN 'VC' THEN 'Piemonte' WHEN 'NO' THEN 'Piemonte' WHEN 'CN' THEN 'Piemonte'
  WHEN 'AT' THEN 'Piemonte' WHEN 'AL' THEN 'Piemonte' WHEN 'BI' THEN 'Piemonte' WHEN 'VB' THEN 'Piemonte'
  WHEN 'AO' THEN 'Valle d''Aosta'
  WHEN 'MI' THEN 'Lombardia' WHEN 'VA' THEN 'Lombardia' WHEN 'CO' THEN 'Lombardia' WHEN 'SO' THEN 'Lombardia'
  WHEN 'BG' THEN 'Lombardia' WHEN 'BS' THEN 'Lombardia' WHEN 'PV' THEN 'Lombardia' WHEN 'CR' THEN 'Lombardia'
  WHEN 'MN' THEN 'Lombardia' WHEN 'LC' THEN 'Lombardia' WHEN 'LO' THEN 'Lombardia' WHEN 'MB' THEN 'Lombardia'
  WHEN 'GE' THEN 'Liguria' WHEN 'SV' THEN 'Liguria' WHEN 'IM' THEN 'Liguria' WHEN 'SP' THEN 'Liguria'
  WHEN 'VR' THEN 'Veneto' WHEN 'VI' THEN 'Veneto' WHEN 'BL' THEN 'Veneto' WHEN 'TV' THEN 'Veneto'
  WHEN 'VE' THEN 'Veneto' WHEN 'PD' THEN 'Veneto' WHEN 'RO' THEN 'Veneto'
  WHEN 'TN' THEN 'Trentino-Alto Adige' WHEN 'BZ' THEN 'Trentino-Alto Adige'
  WHEN 'TS' THEN 'Friuli Venezia Giulia' WHEN 'GO' THEN 'Friuli Venezia Giulia'
  WHEN 'UD' THEN 'Friuli Venezia Giulia' WHEN 'PN' THEN 'Friuli Venezia Giulia'
  WHEN 'PC' THEN 'Emilia-Romagna' WHEN 'PR' THEN 'Emilia-Romagna' WHEN 'RE' THEN 'Emilia-Romagna'
  WHEN 'MO' THEN 'Emilia-Romagna' WHEN 'BO' THEN 'Emilia-Romagna' WHEN 'FE' THEN 'Emilia-Romagna'
  WHEN 'RA' THEN 'Emilia-Romagna' WHEN 'FC' THEN 'Emilia-Romagna' WHEN 'RN' THEN 'Emilia-Romagna'
  WHEN 'FI' THEN 'Toscana' WHEN 'PT' THEN 'Toscana' WHEN 'AR' THEN 'Toscana' WHEN 'SI' THEN 'Toscana'
  WHEN 'MS' THEN 'Toscana' WHEN 'LU' THEN 'Toscana' WHEN 'PI' THEN 'Toscana' WHEN 'LI' THEN 'Toscana'
  WHEN 'GR' THEN 'Toscana' WHEN 'PO' THEN 'Toscana'
  WHEN 'PG' THEN 'Umbria' WHEN 'TR' THEN 'Umbria'
  WHEN 'AN' THEN 'Marche' WHEN 'PU' THEN 'Marche' WHEN 'MC' THEN 'Marche' WHEN 'AP' THEN 'Marche' WHEN 'FM' THEN 'Marche'
  WHEN 'RM' THEN 'Lazio' WHEN 'VT' THEN 'Lazio' WHEN 'RI' THEN 'Lazio' WHEN 'FR' THEN 'Lazio' WHEN 'LT' THEN 'Lazio'
  WHEN 'AQ' THEN 'Abruzzo' WHEN 'TE' THEN 'Abruzzo' WHEN 'PE' THEN 'Abruzzo' WHEN 'CH' THEN 'Abruzzo'
  WHEN 'CB' THEN 'Molise' WHEN 'IS' THEN 'Molise'
  WHEN 'NA' THEN 'Campania' WHEN 'CE' THEN 'Campania' WHEN 'BN' THEN 'Campania' WHEN 'AV' THEN 'Campania' WHEN 'SA' THEN 'Campania'
  WHEN 'BA' THEN 'Puglia' WHEN 'FG' THEN 'Puglia' WHEN 'BR' THEN 'Puglia' WHEN 'LE' THEN 'Puglia' WHEN 'TA' THEN 'Puglia' WHEN 'BT' THEN 'Puglia'
  WHEN 'PZ' THEN 'Basilicata' WHEN 'MT' THEN 'Basilicata'
  WHEN 'CS' THEN 'Calabria' WHEN 'CZ' THEN 'Calabria' WHEN 'RC' THEN 'Calabria' WHEN 'KR' THEN 'Calabria' WHEN 'VV' THEN 'Calabria'
  WHEN 'PA' THEN 'Sicilia' WHEN 'TP' THEN 'Sicilia' WHEN 'AG' THEN 'Sicilia' WHEN 'CL' THEN 'Sicilia'
  WHEN 'EN' THEN 'Sicilia' WHEN 'CT' THEN 'Sicilia' WHEN 'SR' THEN 'Sicilia' WHEN 'RG' THEN 'Sicilia' WHEN 'ME' THEN 'Sicilia'
  WHEN 'SS' THEN 'Sardegna' WHEN 'NU' THEN 'Sardegna' WHEN 'CA' THEN 'Sardegna' WHEN 'OR' THEN 'Sardegna' WHEN 'OT' THEN 'Sardegna' WHEN 'CI' THEN 'Sardegna' WHEN 'VS' THEN 'Sardegna' WHEN 'OG' THEN 'Sardegna'
  ELSE NULL
END
$$;

CREATE OR REPLACE FUNCTION public.cap_to_regione(p_cap text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT public.provincia_to_regione(public.cap_to_provincia(p_cap))
$$;