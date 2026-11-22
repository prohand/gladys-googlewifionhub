# Google Wifi / OnHub

Diese Integration verbindet Gladys Assistant mit einem WLAN-System **Google Wifi**, **Nest Wifi**
(Router) oder **OnHub** (TP-Link oder ASUS). Sie zeigt Gladys, ob das Internet funktioniert, welche
Geräte im WLAN sind und wie schnell die Verbindung ist, und erlaubt einer Szene, das Internet eines
Geräts zu pausieren oder das WLAN neu zu starten.

Benötigt **Gladys 5.3 oder neuer**.

## Zwei Wege zum WLAN

| Kanal            | Was du brauchst                                  | Was du bekommst                                                                                                |
| ---------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Lokal**        | Die IP-Adresse des Routers                       | Internetstatus, WAN-Kabel, Laufzeit, Firmware, verfügbares Update, öffentliche Adresse                         |
| **Google-Cloud** | Ein Google-Refresh-Token (siehe unten), optional | Verbundene Geräte (Anwesenheit), Live-Durchsatz, Speedtest, Anzahl der Geräte, WLAN-Punkte, Pause und Neustart |

Beide lassen sich gemeinsam nutzen; die meisten beginnen mit dem lokalen Kanal, der kein Konto
braucht.

Der Konfigurationsbildschirm zeigt den Standardschalter **Lokale Verbindung bevorzugen**.
Eingeschaltet (Standard) kommt der Internetstatus vom Router selbst; ausgeschaltet aus der
Google-Cloud. Jedes Gerät zeigt ein Abzeichen mit dem Kanal, den es wirklich nutzt: _lokal_,
_Cloud_ oder _nicht erreichbar_. Antwortet der Router im LAN nicht, die Cloud aber schon, wechselt
das Router-Abzeichen auf _Cloud_ mit einem orangen Punkt.

## Den lokalen Kanal einrichten

1. Finde die Adresse des **WLAN-Hauptpunkts** (der an deinem Modem hängt). Bei einem Google
   Wifi-Netz mit Werkseinstellungen ist es `192.168.86.1`. In der Google Home-App:
   **WLAN → Einstellungen → Erweiterte Netzwerkeinstellungen → LAN**.
2. Trage sie unter **Router-Adresse (lokal)** ein und speichere.
3. Klicke auf **Verbindung testen**: Die Antwort zeigt Modell, Firmware und Internetstatus.

Die Integration liest `http://<Adresse>/api/v1/status`, die Statusseite, die der Router im lokalen
Netzwerk ohne Passwort bereitstellt. Sie liest nur: Darüber lässt sich nichts ändern.

Gladys muss diese Adresse erreichen können: Liegt Gladys in einem anderen Subnetz, erlaube es in
deiner Firewall.

## Den Google-Cloud-Kanal einrichten (optional)

Der Cloud-Kanal nutzt die API der Google Home-App. **Google dokumentiert sie nicht**: Sie
funktioniert heute, kann sich aber eines Tages ändern. Er braucht ein **Refresh-Token** des
Google-Kontos, das das WLAN verwaltet.

1. Besorge ein Refresh-Token für die Google Wifi-App. Community-Tools übernehmen die
   Google-Anmeldung und zeigen das Token an, das mit `1//` beginnt. Suche nach „Google Wifi refresh
   token" oder „OnHub auth tool": Nimm eines, dem du vertraust, es sieht deine Google-Anmeldung.
2. Füge das Token unter **Google-Refresh-Token** ein und speichere.
3. Klicke auf **Verbindung testen**: Die Antwort listet die WLAN-Systeme und die Anzahl der
   verbundenen Geräte.

Das Token wird in Gladys in einem geheimen Feld gespeichert, nie wieder angezeigt, nie in die Logs
geschrieben und nur an Google gesendet. Zum Widerrufen entferne den Zugriff von Google Wifi /
Google Home in den Sicherheitseinstellungen deines Google-Kontos (Verbindungen zu Drittanbietern)
und füge dann ein neues ein.

## Geräte

Öffne **Erkennung** auf der Seite der Integration und füge die gewünschten Geräte hinzu.

| Gerät                                         | Kanal | Funktionen                                                                                                             |
| --------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| **Google Wifi router** (der Router)           | lokal | Internet (an/aus), WAN-Kabel verbunden, Laufzeit (Tage), Update verfügbar, Firmware (Text), öffentliche Adresse (Text) |
| **Wi-Fi _Name_** (das Netzwerk)               | Cloud | Internet, Live-Download und -Upload (Mbit/s), letzter Speedtest (Mbit/s), Anzahl verbundener Geräte                    |
| **Wi-Fi point _Raum_**                        | Cloud | Online, Helligkeit des Leuchtrings (0-100 %, einstellbar)                                                              |
| **Verbundene Geräte** (Handy, PC, Fernseher…) | Cloud | Verbunden (Anwesenheit), Internetzugang (Schalter: aus = Internet pausiert), Live-Download und -Upload                 |

Google merkt sich jedes Gerät, das jemals im WLAN war: Die Erkennung listet nur die gerade
verbundenen und die, die du schon hinzugefügt hast. Schalte **Verbundene Geräte in der Erkennung
anzeigen** aus, um sie auszublenden.

Die Werte werden in jedem **Aktualisierungsintervall** aktualisiert (standardmäßig 60 s). Nur
geänderte Werte werden an Gladys gesendet.

## Szenen

### Auslöser

| Auslöser                 | Wann                                                 | Variablen                        |
| ------------------------ | ---------------------------------------------------- | -------------------------------- |
| Internet weg             | Der Router meldet, dass das Internet ausgefallen ist | `source` (local / cloud)         |
| Internet wieder da       | Das Internet ist zurück                              | `source`, `offline_minutes`      |
| Gerät mit WLAN verbunden | Ein Gerät verbindet sich (Filter: eins oder alle)    | `name`, `ip`                     |
| Gerät hat WLAN verlassen | Ein Gerät trennt sich (Filter: eins oder alle)       | `name`, `ip`                     |
| WLAN-Punkt offline       | Ein Punkt antwortet nicht mehr                       | `name`                           |
| Router-Update verfügbar  | Der Router meldet eine neue Firmware                 | `current_version`, `new_version` |

Jeder Auslöser feuert einmal pro Änderung, nie erneut, solange sich nichts ändert. Ein Router, der
einfach nicht mehr antwortet, gilt nicht als Internetausfall.

### Aktionen

| Aktion                          | Was sie tut                                                 | Ausgaben                                |
| ------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| Internet eines Geräts pausieren | Pausiert (oder aktiviert) das Internet eines Geräts (Cloud) | `paused`                                |
| Speedtest starten               | Misst die Internetgeschwindigkeit, etwa eine Minute (Cloud) | `download_mbps`, `upload_mbps`          |
| WLAN neu starten                | Startet einen Punkt oder alle Punkte neu (Cloud)            | `restarted`                             |
| Internet prüfen                 | Liest jetzt den Router                                      | `online`, `source`, `connected_clients` |

Beispiel: „an Schultagen um 21:00 das Internet des Kinder-Tablets pausieren; um 7:00 wieder
aktivieren".

## Dashboard-Widgets

- **WLAN-Status**: Internet, Firmware, Update, Laufzeit, verbundene Geräte, WLAN-Punkte, letzter
  Speedtest, Live-Durchsatz (sobald das Netzwerkgerät hinzugefügt ist) und eine Schaltfläche
  **Speedtest starten**.
- **WLAN-Geräte**: die gerade verbundenen Geräte, die aktivsten zuerst, mit einem Abzeichen, wenn
  eines pausiert oder im Gastnetz ist.

## Schaltflächen im Konfigurationsbildschirm

- **Verbindung testen**: liest jetzt beide Kanäle und sagt, was geantwortet hat.
- **Speedtest starten** (Cloud).
- **WLAN neu starten** (Cloud): zuerst das Bestätigungsfeld aktivieren. Alle Punkte starten neu:
  einige Minuten kein Netzwerk, auch für Gladys, wenn es das WLAN nutzt.

## Fehlerbehebung

- **„Router im lokalen Netzwerk nicht erreichbar"**: Prüfe die Adresse und ob Gladys sie erreicht
  (`curl http://192.168.86.1/api/v1/status` vom Gladys-Rechner). Nimm den Hauptpunkt, keine
  Erweiterung.
- **„Google hat das Token abgelehnt"**: Das Token wurde widerrufen oder falsch kopiert: Erzeuge
  ein neues.
- **Durchsatz oder Speedtest bleiben leer**: Manche Systeme liefern sie nicht; der Rest
  funktioniert.
- **Ein Gerät hat einen seltsamen Namen**: Benenne es in der Google Home-App oder in Gladys um.

## Datenschutz

Der lokale Kanal verlässt nie dein Netzwerk. Der Cloud-Kanal spricht nur mit Google, mit deinem
eigenen Token. Die Integration speichert nichts außerhalb der Gladys-Konfiguration.
