# Google Wifi / OnHub

Cette intégration relie Gladys Assistant à un système Wi-Fi **Google Wifi**, **Nest Wifi**
(routeur) ou **OnHub** (TP-Link ou ASUS). Elle indique à Gladys si internet fonctionne, quels
appareils sont sur le Wi-Fi, quel est le débit, et permet à une scène de couper l'internet d'un
appareil ou de redémarrer le Wi-Fi.

Nécessite **Gladys 5.3 ou plus récent**.

## Deux façons de joindre le Wi-Fi

| Canal            | Ce qu'il faut                                              | Ce que vous obtenez                                                                                                    |
| ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Local**        | L'adresse IP du routeur                                    | État internet, câble WAN, durée d'allumage, firmware, mise à jour disponible, adresse publique                         |
| **Cloud Google** | Un jeton Google (refresh token, voir plus bas), facultatif | Appareils connectés (présence), débit en direct, test de débit, nombre d'appareils, points Wi-Fi, pause et redémarrage |

Les deux s'utilisent ensemble ; la plupart des gens commencent par le canal local, qui ne demande
aucun compte.

L'écran de configuration affiche l'interrupteur standard **Préférer la connexion locale**. Activé
(par défaut), l'état internet vient du routeur lui-même ; désactivé, il vient du cloud Google.
Chaque appareil affiche un badge avec le canal qu'il utilise vraiment : _local_, _cloud_ ou
_injoignable_. Quand le routeur ne répond plus sur le réseau local mais que le cloud répond, le
badge du routeur passe à _cloud_ avec un point orange.

## Configurer le canal local

1. Trouvez l'adresse du point Wi-Fi **principal** (celui branché à votre box). Sur un réseau
   Google Wifi resté en réglages d'usine, c'est `192.168.86.1`. Dans l'application Google Home :
   **Wi-Fi → Paramètres → Paramètres réseau avancés → LAN**.
2. Saisissez-la dans **Adresse du routeur (local)** et enregistrez.
3. Cliquez sur **Tester la connexion** : la réponse donne le modèle, le firmware et l'état
   internet.

L'intégration lit `http://<adresse>/api/v1/status`, la page d'état que le routeur sert sur le
réseau local sans mot de passe. Elle ne fait que lire : rien ne peut être modifié par ce biais.

Gladys doit pouvoir joindre cette adresse : si Gladys est sur un autre sous-réseau, autorisez-le
dans votre pare-feu.

## Configurer le canal cloud Google (facultatif)

Le canal cloud utilise l'API de l'application Google Home. **Google ne la documente pas** : elle
fonctionne aujourd'hui, elle peut changer un jour. Il faut un **jeton (refresh token)** du compte
Google qui gère le Wi-Fi.

1. Récupérez un refresh token pour l'application Google Wifi. Des outils communautaires font la
   connexion Google pour vous et affichent le jeton, qui commence par `1//`. Cherchez « Google Wifi
   refresh token » ou « OnHub auth tool » : choisissez un outil de confiance, il voit votre
   connexion Google.
2. Collez le jeton dans **Jeton Google (refresh token)** et enregistrez.
3. Cliquez sur **Tester la connexion** : la réponse liste les systèmes Wi-Fi et le nombre
   d'appareils connectés.

Le jeton est stocké dans Gladys dans un champ secret, jamais réaffiché, jamais écrit dans les logs
et envoyé uniquement à Google. Pour le révoquer, retirez l'accès Google Wifi / Google Home dans les
paramètres de sécurité de votre compte Google (connexions tierces), puis collez-en un nouveau.

## Appareils

Ouvrez **Découverte** dans la page de l'intégration et ajoutez les appareils voulus.

| Appareil                                     | Canal | Fonctionnalités                                                                                                                    |
| -------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Google Wifi router** (le routeur)          | local | Internet (on/off), câble WAN branché, durée d'allumage (jours), mise à jour disponible, firmware (texte), adresse publique (texte) |
| **Wi-Fi _nom_** (le réseau)                  | cloud | Internet, débit descendant et montant en direct (Mb/s), dernier test de débit (Mb/s), nombre d'appareils connectés                 |
| **Wi-Fi point _pièce_**                      | cloud | En ligne, luminosité de l'anneau lumineux (0-100 %, réglable)                                                                      |
| **Appareils connectés** (téléphone, PC, TV…) | cloud | Connecté (présence), accès internet (interrupteur : éteint = internet en pause), débit en direct                                   |

Google garde en mémoire tous les appareils déjà passés sur le Wi-Fi : la découverte ne liste que
ceux connectés en ce moment, plus ceux que vous avez déjà ajoutés. Désactivez **Afficher les
appareils connectés dans la découverte** pour les masquer.

Les valeurs sont rafraîchies à chaque **Intervalle de rafraîchissement** (60 s par défaut). Seules
les valeurs qui changent sont envoyées à Gladys.

## Scènes

### Déclencheurs

| Déclencheur                       | Quand                                                   | Variables                        |
| --------------------------------- | ------------------------------------------------------- | -------------------------------- |
| Internet coupé                    | Le routeur signale que internet est tombé               | `source` (local / cloud)         |
| Internet rétabli                  | Internet est revenu                                     | `source`, `offline_minutes`      |
| Appareil connecté au Wi-Fi        | Un appareil se connecte (filtre : un appareil, ou tous) | `name`, `ip`                     |
| Appareil déconnecté du Wi-Fi      | Un appareil se déconnecte (filtre : un ou tous)         | `name`, `ip`                     |
| Point Wi-Fi hors ligne            | Un point ne répond plus                                 | `name`                           |
| Mise à jour du routeur disponible | Le routeur annonce un nouveau firmware                  | `current_version`, `new_version` |

Chaque déclencheur part une fois par changement, jamais tant que rien ne change. Un routeur qui ne
répond simplement plus n'est pas pris pour une coupure internet.

### Actions

| Action                                   | Ce qu'elle fait                                             | Sorties                                 |
| ---------------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| Mettre en pause l'internet d'un appareil | Met en pause (ou rétablit) l'internet d'un appareil (cloud) | `paused`                                |
| Lancer un test de débit                  | Mesure le débit internet, environ une minute (cloud)        | `download_mbps`, `upload_mbps`          |
| Redémarrer le Wi-Fi                      | Redémarre un point, ou tous les points (cloud)              | `restarted`                             |
| Vérifier internet                        | Lit le routeur maintenant                                   | `online`, `source`, `connected_clients` |

Exemple : « les jours d'école à 21 h, couper l'internet de la tablette des enfants ; à 7 h, le
rétablir ».

## Widgets du tableau de bord

- **État du Wi-Fi** : internet, firmware, mise à jour, durée d'allumage, appareils connectés,
  points Wi-Fi, dernier test de débit, débit en direct (une fois l'appareil réseau ajouté) et un
  bouton **Lancer un test de débit**.
- **Appareils du Wi-Fi** : les appareils sur le Wi-Fi en ce moment, les plus actifs d'abord, avec
  un badge quand l'un est en pause ou sur le réseau invité.

## Boutons de l'écran de configuration

- **Tester la connexion** : lit les deux canaux maintenant et dit ce qui a répondu.
- **Lancer un test de débit** (cloud).
- **Redémarrer le Wi-Fi** (cloud) : cochez d'abord la case de confirmation. Tous les points
  redémarrent : plus de réseau pendant quelques minutes, Gladys compris s'il passe par le Wi-Fi.

## Dépannage

- **« Routeur injoignable sur le réseau local »** : vérifiez l'adresse, et que Gladys peut la
  joindre (`curl http://192.168.86.1/api/v1/status` depuis la machine Gladys). Utilisez le point
  principal, pas une extension.
- **« Google a refusé le jeton »** : le jeton a été révoqué ou mal copié : générez-en un nouveau.
- **Le débit ou le test de débit restent vides** : certains systèmes ne les donnent pas ; le reste
  fonctionne.
- **Un appareil a un nom bizarre** : renommez-le dans l'application Google Home, ou dans Gladys.

## Vie privée

Le canal local ne sort jamais de votre réseau. Le canal cloud ne parle qu'à Google, avec votre
propre jeton. L'intégration ne stocke rien en dehors de la configuration de Gladys.
