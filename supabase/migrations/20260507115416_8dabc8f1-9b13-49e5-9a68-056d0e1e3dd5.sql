GRANT USAGE, CREATE ON SCHEMA import_storico TO sandbox_exec;
GRANT ALL ON ALL TABLES IN SCHEMA import_storico TO sandbox_exec;
ALTER DEFAULT PRIVILEGES IN SCHEMA import_storico GRANT ALL ON TABLES TO sandbox_exec;