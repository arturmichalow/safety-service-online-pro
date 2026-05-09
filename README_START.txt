SAFETY SERVICE ONLINE PRO v3

Co dodane:
- boczna nawigacja jak na screenach
- aktywny przycisk podświetla się na pomarańczowo
- Klienci: kliknięcie firmy pokazuje dane kontaktowe i edycję
- status firmy: zielona/pomarańczowa/czerwona lampka
- przypisanie firmy do pracownika
- baza pracowników: Artur, Kamil, Grzegorz, Paulina, Paweł, Arkadiusz, Paweł
- użytkownicy i role z uprawnieniami do modułów
- AI analiza rentowności
- eksport Excel miesięczny/roczny z historią, godzinami, dojazdami
- import danych z Excela - ekran przygotowany
- PWA / instrukcja instalacji na telefonie

Railway:
Build Command:
npm run build

Pre-deploy Command:
./node_modules/.bin/prisma generate && ./node_modules/.bin/prisma db push --accept-data-loss && npm run seed

Po wgraniu ZIP do GitHub Railway zrobi deploy.
Konta:
admin@safety-service.pl / admin123
pracownik@safety-service.pl / praca123


AKTUALIZACJA v6.5 - ZLECENIA DODATKOWE
1. Po wgraniu plikow do GitHub Railway zbuduje aplikacje.
2. Poniewaz doszedl nowy model ExtraOrder, w Railway ustaw Pre-deploy Command:
   ./node_modules/.bin/prisma generate && ./node_modules/.bin/prisma db push --accept-data-loss && npm run seed
3. Build Command ma zostac: npm run build
4. Po wdrozeniu pojawi sie nowa zakladka: Zlecenia dodatkowe.
5. Rentownosc liczy teraz: obsluga miesieczna + zlecenia dodatkowe - koszty dojazdow - dodatkowe koszty - koszt czasu pracy.
