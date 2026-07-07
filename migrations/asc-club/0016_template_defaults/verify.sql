-- asc-club migration 0016 verify: run via `--command` (all SELECTs).
SELECT id,
       (default_subject = subject) AS subject_matches_default,
       (default_body = body) AS body_matches_default
  FROM email_templates
  ORDER BY id;
