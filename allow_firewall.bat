@echo off
chcp 65001 >nul
echo Разрешаем порты 5173 и 3001 в Брандмауэре Windows для локальной сети...
netsh advfirewall firewall delete rule name="Televizion Vite 5173" >nul 2>&1
netsh advfirewall firewall delete rule name="Televizion Backend 3001" >nul 2>&1
netsh advfirewall firewall add rule name="Televizion Vite 5173" dir=in action=allow protocol=TCP localport=5173 profile=private,domain,public
netsh advfirewall firewall add rule name="Televizion Backend 3001" dir=in action=allow protocol=TCP localport=3001 profile=private,domain,public
echo Готово! Порты 5173 и 3001 теперь доступны в домашней сети.
pause
