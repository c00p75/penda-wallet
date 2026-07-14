-- Give the seeded default categories an icon so they're not the only ones
-- without one once users start adding their own.
update categories set icon = '🎬' where is_system and name = 'Entertainment';
update categories set icon = '🍔' where is_system and name = 'Food & Drinks';
update categories set icon = '💊' where is_system and name = 'Health';
update categories set icon = '🏠' where is_system and name = 'Housing';
update categories set icon = '💰' where is_system and name = 'Income';
update categories set icon = '📦' where is_system and name = 'Other';
update categories set icon = '🛍️' where is_system and name = 'Shopping';
update categories set icon = '🔄' where is_system and name = 'Transfer';
update categories set icon = '🚗' where is_system and name = 'Transportation';
update categories set icon = '💡' where is_system and name = 'Utilities';
