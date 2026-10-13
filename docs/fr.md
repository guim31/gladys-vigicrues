# Vigicrues

Amène dans Gladys la **vigilance crues** officielle (Vigicrues) et la **hauteur et le débit des
cours d'eau** près de chez vous, à partir des données ouvertes de Vigicrues et de Hub'Eau. Sans
compte ni clé.

> **C'est un complément, pas un système d'alerte de sécurité.** Les données peuvent être en
> retard, manquer ou être fausses, et l'intégration dépend de votre Gladys, de votre accès à
> Internet et de deux services publics. En cas de crue, suivez les consignes officielles
> (vigicrues.gouv.fr, la préfecture, votre mairie, le 112). Intégration non affiliée au SCHAPI /
> Vigicrues ni à l'État.

## Ce que vous obtenez

- **Un appareil par station de mesure** suivie : hauteur d'eau en mètres, débit en m³/h (ou en m³/s, au choix) quand
  la station en mesure un, **vigilance crues** de son tronçon (vert, jaune, orange, rouge) et
  date de la dernière mesure.
- Une station qui n'envoie plus rien est signalée comme telle (« Pas de nouvelle mesure
  depuis… ») : une vieille valeur n'est jamais republiée comme si elle était fraîche.
- Deux **déclencheurs de scène** : « La vigilance crues monte » (jaune, orange ou rouge) et
  « La vigilance crues redescend », filtrés par station, tronçon et couleur.
- Un **widget** de tableau de bord : vos stations, leur hauteur, sa tendance (monte, stable,
  baisse) et la couleur de vigilance.
- Un bouton **« Chercher des stations »** qui liste les stations autour de votre maison, dans
  une commune ou un département, avec leur cours d'eau.

## Prérequis

- Gladys Assistant **5.2.0** ou plus récent.
- Un accès à Internet depuis Gladys : l'intégration lit `hubeau.eaufrance.fr` et
  `www.vigicrues.gouv.fr`.
- Pour « Autour de ma maison » : la position de votre maison dans Gladys (Paramètres,
  Maisons). Avec plusieurs maisons, choisissez la vôtre dans le réglage **Maison**. L'intégration la demande à l'installation (permission « localisation ») ; elle ne
  sert qu'à trouver les stations les plus proches, n'est ni enregistrée ni écrite dans les logs.
- La France métropolitaine pour la vigilance. Hub'Eau couvre aussi les départements
  d'outre-mer : leurs stations ont hauteur et débit, sans vigilance.

## Configuration

### Réglages

| Réglage                            | Ce qu'il fait                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codes des stations                 | Codes séparés par des virgules (`O200004001, B540001001`), ou les adresses des pages des stations sur vigicrues.gouv.fr.                                    |
| Communes (codes INSEE)             | Toutes les stations en service de ces communes : `31555` pour Toulouse, `75056` pour Paris. Le code INSEE n'est pas le code postal.                         |
| Maison                             | La maison dont la position sert à « Autour de ma maison » et à « Chercher des stations ». Vide : la première maison de Gladys qui a une position.           |
| Autour de ma maison                | Suit aussi les 3 stations les plus proches qui envoient des mesures, à 5, 10 ou 20 km de votre maison.                                                      |
| Fréquence de mise à jour           | 15 (par défaut), 20 ou 30 minutes. La vigilance est lue toutes les 30 minutes.                                                                              |
| Unité du débit                     | **m³/h** (par défaut) : l'unité que Gladys affiche partout. **m³/s** : l'unité de Vigicrues, sans unité dans Gladys (le nom de la fonctionnalité la donne). |
| Langue des noms de fonctionnalités | Noms des fonctionnalités des nouveaux appareils et langue de leurs textes (couleur, dernière mesure). Français par défaut.                                  |

La configuration apporte 20 stations au plus. Enregistrez, puis ouvrez l'onglet
**Découverte** et créez les appareils voulus. Une station dont vous avez créé l'appareil reste
suivie même si vous la retirez des réglages : supprimez l'appareil pour arrêter.

### Trouver vos stations

Le bouton **Chercher des stations** de la configuration liste les stations en service, les
plus proches d'abord, avec leur cours d'eau, leur distance et si elles ont envoyé une mesure
ces dernières heures. Tapez, dans le champ « Où » :

- rien : les stations autour de la maison choisie dans les réglages (10 km, ou la distance choisie) ;
- un code INSEE de commune : `31555` ;
- un département et un nom : `31 Toulouse`, `75 Seine`, `08 Meuse` ;
- un code de station : `O200004001`.

Copiez les codes voulus dans **Codes des stations**, puis enregistrez. Le code d'une station
est aussi la fin de l'adresse de sa page sur vigicrues.gouv.fr.

## Appareils

Un appareil par station, nommé comme Hub'Eau la nomme (« La Meuse à Charleville-Mézières »).
Ses fonctionnalités sont en lecture seule :

| Fonctionnalité       | Type (Gladys)               | Valeur                                                                                                                                                                                                                          |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hauteur d'eau        | Profondeur du liquide, en m | Hauteur à l'échelle, au-dessus de son zéro : une valeur négative est normale à l'étiage. Ce n'est pas une altitude.                                                                                                             |
| Débit                | Débit d'eau, en m³/h        | Converti depuis les m³/s de Vigicrues (1 m³/s = 3 600 m³/h). Avec l'unité **m³/s**, la fonctionnalité s'appelle « Débit (m³/s) » et n'a pas d'unité : Gladys n'en a pas pour les m³/s. Seulement si la station mesure un débit. |
| Vigilance crues      | Niveau de risque            | La couleur du tronçon de la station, en pastille de risque Gladys : 0 vert, 1 jaune, 2 orange, 3 rouge. Seulement pour une station Vigicrues.                                                                                   |
| Couleur de vigilance | Texte                       | Vert, Jaune, Orange ou Rouge.                                                                                                                                                                                                   |
| Dernière mesure      | Texte                       | Date de la dernière mesure (« 29/09 15:30 »), ou « Pas de nouvelle mesure depuis… » après 3 heures sans mesure.                                                                                                                 |

La hauteur et le débit ne sont envoyés que quand ils changent, et une fois toutes les 12 heures
sinon. Après 3 heures sans nouvelle mesure, ils ne sont plus envoyés : Gladys affiche leur âge
réel. Une station qui se met à mesurer un débit reçoit la fonctionnalité : l'onglet Découverte
propose alors de mettre l'appareil à jour.

**Changer d'unité du débit** change la structure des appareils : l'onglet **Découverte**
propose « Mettre à jour » pour chaque station qui mesure un débit. Tant que vous ne l'avez pas
fait, le débit reste envoyé dans l'unité de l'appareil créé, pour ne jamais mélanger les deux.
Le nom d'une fonctionnalité est figé à sa création : renommez-la dans l'appareil (« Débit » ou
« Débit (m³/s) ») si besoin. L'historique déjà enregistré garde son ancienne unité.

## Widget

Ajoutez le widget **Vigicrues** à un tableau de bord.

- Sans réglage : une ligne par station (10 au plus) avec sa hauteur et sa tendance, colorée
  selon la vigilance de son tronçon : vert, jaune, rouge pour orange et rouge (la palette des
  widgets n'a pas d'orange, le titre donne la couleur exacte). Gris : pas de tronçon, ou pas de
  mesure récente.
- Avec une station choisie : ses tuiles de hauteur et de débit (avec son unité, m³/h ou m³/s), en direct, puis sa vigilance
  avec le nom du tronçon, sa tendance et sa dernière mesure.

Le widget se termine par la source et sa date, et un lien vers Vigicrues.

## Déclencheurs de scène

**La vigilance crues monte** : le tronçon d'une station suivie passe au jaune, à l'orange ou au
rouge, ou à une couleur plus haute. **La vigilance crues redescend** : il revient à une couleur
plus basse.

Filtres (tous facultatifs) : la **station**, le code du **tronçon** (visible dans les
paramètres de l'appareil, `VIGICRUES_SECTION`, par exemple `LO18`) et la **nouvelle couleur**.
Sans filtre de station, une scène se lance une fois par station suivie du tronçon.

Variables pour les actions : `station_name`, `river`, `section`, `section_name`, `color`
(`green`, `yellow`, `orange`, `red`), `color_name` (dans la langue des réglages),
`previous_color`, `previous_color_name`.

Les déclencheurs ne partent que pour les stations dont l'appareil existe, jamais à la première
lecture, et pas après plus d'un jour sans vigilance (redémarrage, Vigicrues injoignable). Un
seuil de hauteur est une condition de scène sur la fonctionnalité « Hauteur d'eau », pas un
déclencheur.

## Exemples de scènes

- **Orange ou rouge près de chez soi** : déclencheur « La vigilance crues monte », couleur
  orange et rouge → envoyer le message « Vigilance {{color_name}} sur {{section_name}} :
  consultez vigicrues.gouv.fr » et passer une lampe en rouge.
- **Fin d'alerte** : déclencheur « La vigilance crues redescend », couleur vert → message
  « Retour au vert sur {{section_name}} ».
- **Seuil de hauteur** : déclencheur « Changement d'état de l'appareil » sur « Hauteur d'eau »
  de votre station, au-dessus de 3,5 m → envoyer un message à toute la maison.
- **Station muette** : rien à faire, la fonctionnalité « Dernière mesure » le dit sur le
  tableau de bord.

## Sources des données, licence et quotas

- **Vigicrues** (`www.vigicrues.gouv.fr/services`) : la vigilance de chaque tronçon
  (`InfoVigiCru.geojson`, environ 2,2 Mo, émis au moins deux fois par jour), lue toutes les
  30 minutes, et les stations de chaque tronçon (lues une fois par semaine). © VIGICRUES.
- **Hub'Eau Hydrométrie** (`hubeau.eaufrance.fr/api/v2/hydrometrie`) : les stations et leurs
  mesures en temps réel, mises à jour toutes les 5 minutes depuis la plateforme hydrométrique
  nationale, gardées un mois. Une requête par mise à jour pour toutes vos stations.
- Les deux sont publiés sous la **Licence Ouverte / Open Licence Etalab 2.0** : réutilisation
  libre en citant la source et sa date — le widget affiche les deux.
- Aucun des deux services ne publie de quota. L'intégration reste légère : une requête Hub'Eau
  par mise à jour (15 minutes au plus vite), la vigilance toutes les 30 minutes, le référentiel
  une fois par semaine, et elle se nomme dans ses requêtes. Hub'Eau peut refuser un usage
  abusif : ne réduisez pas ces délais.

## Dépannage

- **« Code de station inconnu »** : Hub'Eau ne connaît pas ce code. Vérifiez-le avec
  « Chercher des stations » ou sur vigicrues.gouv.fr (la fin de l'adresse de la page de la
  station).
- **Pas de fonctionnalité de vigilance** : la station n'est pas sur un tronçon Vigicrues
  (beaucoup de petits cours d'eau sont seulement mesurés), ou Vigicrues n'a pas répondu à la
  publication de l'appareil : l'intégration réessaie toutes les heures, puis l'onglet
  Découverte propose de mettre l'appareil à jour.
- **Pas de fonctionnalité de débit** : la station ne mesure que la hauteur
  (Charleville-Mézières, par exemple).
- **« Pas de nouvelle mesure depuis… »** : la station n'envoie plus rien (maintenance, panne,
  dégâts de crue). Hub'Eau garde un mois : au-delà, « Aucune mesure depuis plus d'un mois ».
- **« Hub'Eau ne répond pas »** ou **« Vigicrues ne répond pas »** dans la configuration : le
  service est en panne ou Gladys n'a pas accès à Internet. Les valeurs reviennent toutes
  seules.
- **« Autour de ma maison »** ne fait rien : indiquez la position de votre maison dans Gladys
  (Paramètres, Maisons) ; l'écran de configuration le signale. Si vous avez choisi une maison
  dans le réglage **Maison**, c'est la sienne qui compte : l'écran de configuration la nomme
  quand elle n'a pas de position ou n'existe plus (choisissez-en une autre, ou videz le champ).
- **Logs** : calmes par défaut (démarrage, station muette ou revenue, changement de vigilance,
  pannes une seule fois). `LOG_LEVEL=debug` montre chaque mise à jour.

## Limites

- **Pas un système d'alerte de sécurité** : un complément seulement, sans garantie de délai ni
  de disponibilité. Les consignes officielles priment.
- La vigilance couvre la France métropolitaine seulement ; les services d'outre-mer de
  Vigicrues ne sont pas lus.
- Les hauteurs sont des cotes au-dessus du zéro de l'échelle de chaque station : elles ne se
  comparent ni d'une station à l'autre, ni à une altitude.
- Les mesures en temps réel sont brutes, non validées : des valeurs aberrantes arrivent.
- Certaines stations envoient une fois par heure, avec jusqu'à 75 minutes de retard environ.
- Les prévisions de Vigicrues ne sont pas lues.
- Testée sur de vraies réponses de Hub'Eau et de Vigicrues enregistrées en septembre et
  octobre 2026, pas encore sur un Gladys réel : vos retours sont bienvenus.
- Non affiliée au SCHAPI / Vigicrues, à l'État ni à Hub'Eau.
