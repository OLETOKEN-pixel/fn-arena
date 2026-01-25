-- =============================================
-- PULIZIA DATABASE: Elimina tutti gli utenti non-admin
-- Admin: user_id = 'ea30bfbf-780e-47ce-be1b-65e229595dc2'
-- Ordine corretto rispettando tutte le FK
-- =============================================

-- 1. Elimina platform_earnings (referenzia matches)
DELETE FROM platform_earnings;

-- 2. Elimina match_proofs
DELETE FROM match_proofs;

-- 3. Elimina match_chat_messages
DELETE FROM match_chat_messages;

-- 4. Elimina match_participants
DELETE FROM match_participants;

-- 5. Elimina match_results
DELETE FROM match_results;

-- 6. Elimina transactions che referenziano matches
DELETE FROM transactions 
WHERE match_id IS NOT NULL;

-- 7. Elimina TUTTI i matches (l'admin non ne ha creati)
DELETE FROM matches;

-- 8. Elimina team_members
DELETE FROM team_members;

-- 9. Elimina teams
DELETE FROM teams;

-- 10. Elimina notifications
DELETE FROM notifications 
WHERE user_id != 'ea30bfbf-780e-47ce-be1b-65e229595dc2';

-- 11. Elimina transactions rimanenti
DELETE FROM transactions 
WHERE user_id != 'ea30bfbf-780e-47ce-be1b-65e229595dc2';

-- 12. Elimina user_xp
DELETE FROM user_xp 
WHERE user_id != 'ea30bfbf-780e-47ce-be1b-65e229595dc2';

-- 13. Elimina user_challenge_progress
DELETE FROM user_challenge_progress 
WHERE user_id != 'ea30bfbf-780e-47ce-be1b-65e229595dc2';

-- 14. Elimina user_avatars
DELETE FROM user_avatars 
WHERE user_id != 'ea30bfbf-780e-47ce-be1b-65e229595dc2';

-- 15. Elimina tips
DELETE FROM tips 
WHERE from_user_id != 'ea30bfbf-780e-47ce-be1b-65e229595dc2'
  AND to_user_id != 'ea30bfbf-780e-47ce-be1b-65e229595dc2';

-- 16. Elimina vip_subscriptions
DELETE FROM vip_subscriptions 
WHERE user_id != 'ea30bfbf-780e-47ce-be1b-65e229595dc2';

-- 17. Elimina withdrawal_requests
DELETE FROM withdrawal_requests 
WHERE user_id != 'ea30bfbf-780e-47ce-be1b-65e229595dc2';

-- 18. Elimina highlights
DELETE FROM highlights 
WHERE user_id != 'ea30bfbf-780e-47ce-be1b-65e229595dc2';

-- 19. Elimina chat_messages
DELETE FROM chat_messages 
WHERE user_id != 'ea30bfbf-780e-47ce-be1b-65e229595dc2';

-- 20. Elimina wallets
DELETE FROM wallets 
WHERE user_id != 'ea30bfbf-780e-47ce-be1b-65e229595dc2';

-- 21. Elimina profiles (ultimo passo)
DELETE FROM profiles 
WHERE user_id != 'ea30bfbf-780e-47ce-be1b-65e229595dc2';