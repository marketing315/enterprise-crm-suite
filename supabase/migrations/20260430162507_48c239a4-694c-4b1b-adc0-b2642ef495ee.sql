-- Punto 8: Reminder pagamenti in ritardo (additivo, idempotente)

-- 1. Aggiungi tipo notifica per pagamenti in ritardo
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_overdue';
