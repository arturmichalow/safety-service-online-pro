-- Indywidualny koszt godziny pracownika. NULL zachowuje dotychczasowe stawki domyślne.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hourlyCost" DECIMAL(10,2);
