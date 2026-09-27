# Pràctica: disseny i desenvolupament d’una biblioteca multimèdia web

## Primera fase: aplicació local amb sistema de fitxers real

**Projecte de referència:** TvSimpsonsApp / MiniTV.  
**Producte que construireu:** una aplicació web amb identitat visual pròpia per consultar, organitzar, carregar i consumir contingut multimèdia des del vostre ordinador.  
**Continuïtat del projecte:** en una segona fase traslladarem l’aplicació, les dades i els fitxers a una Raspberry Pi.  
**Dedicació proposada:** 60 hores, distribuïdes en vuit subfases.  
**Modalitat proposada:** individual. Si el professorat organitza parelles, caldrà registrar les aportacions i defensar individualment les decisions.  
**Coneixements previs:** HTML i CSS, JavaScript bàsic, manipulació de dades JSON, nocions de Python i ús inicial de Git. El calendari es pot ajustar segons el nivell del grup abans de començar.

---

## 1. El repte

Un petit centre cultural necessita una biblioteca multimèdia que pugui funcionar dins la seva xarxa. Vol organitzar-hi pel·lícules, sèries, llibres, jocs i imatges, amb una interfície fàcil d’utilitzar des d’un ordinador i des d’un mòbil.

L’encàrrec consisteix a **dissenyar i construir una versió pròpia de la web del projecte MiniTV**, reproduint bona part de les seves funcions. Haureu de pensar tant en l’experiència de la persona que utilitza la web com en l’organització interna dels fitxers i de les dades.

Durant aquesta primera fase, tot funcionarà a la vostra màquina: navegador, servidor, catàleg, configuració i arxius multimèdia. Quan afegiu un fitxer des de la web, haurà d’aparèixer a la carpeta corresponent del disc. Quan reinicieu el servidor, el catàleg i les modificacions s’hauran de conservar.

**El primer treball serà de disseny:** investigareu referents, definireu la marca, escollireu un logotip, tres colors base i la tipografia, i preparareu una proposta de maquetació amb Affinity o Figma. Després concretareu l’arquitectura de la informació i començareu la implementació.

La reproducció de funcionalitats no obliga a reproduir l’estètica de MiniTV. Podeu crear una biblioteca de cinema independent, una mediateca escolar, un arxiu de videojocs o una altra temàtica coherent que mantingui totes les seccions obligatòries.

## 2. Relació amb el projecte original

El projecte de referència separa la web, situada a `WebApp/`, del servidor Python, situat a `DeviceApp/`, i desa el contingut a `MultimediaContent/`. La web utilitza React amb Vite i el servidor ofereix una API amb Flask.

La proposta de pràctica pren com a referència les funcionalitats presents al codi, especialment:

- Les biblioteques de sèries, pel·lícules, jocs, llibres i imatges.
- La navegació de sèrie a temporada i de temporada a episodi.
- Les fitxes amb informació i portades, la cerca, els filtres i l’ordenació.
- Les marques de favorits i de contingut vist.
- La càrrega de fitxers, l’edició de metadades i l’eliminació de contingut.
- La reproducció de vídeo al navegador, la consulta de llibres i la galeria d’imatges.
- El panell d’estat i la configuració.

**Adaptació didàctica:** l’estructura de dades i les rutes d’API que es proposen més endavant són una versió simplificada per a aquesta pràctica. No constitueixen una còpia del contracte d’API original. A la segona fase desplegarem l’aplicació que hàgiu construït; connectar-la directament al servidor original requeriria una adaptació addicional.

El projecte original inclou un mode de maqueta local amb dades simulades. El podeu estudiar com a exemple, però **una maqueta amb dades en memòria o només a `localStorage` no és el resultat final d’aquesta pràctica**. L’objectiu inclou treballar amb carpetes i arxius reals mitjançant un servidor local.

## 3. Objectius d’aprenentatge

En acabar aquesta fase haureu de ser capaços de:

1. Transformar un encàrrec funcional en una proposta visual justificada.
2. Definir una identitat amb logotip, paleta, tipografia i criteris d’ús.
3. Organitzar les seccions d’una aplicació i representar-ne els recorreguts d’ús.
4. Traslladar una maqueta d’Affinity o Figma a una interfície adaptable.
5. Separar presentació, lògica de servidor, metadades i contingut multimèdia.
6. Crear una API local que llegeixi i modifiqui dades persistents.
7. Relacionar els elements visibles de la web amb fitxers reals.
8. Implementar formularis, validacions, cerca, filtres i estats d’interfície.
9. Verificar les operacions de càrrega, consulta, modificació i eliminació.
10. Preparar un projecte portable que es pugui instal·lar en una altra màquina.

## 4. Abast de la primera fase

### 4.1. Funcionalitats obligatòries

Els identificadors següents serviran per relacionar requisits, proves i evidències.

| ID | Funcionalitat | Resultat mínim verificable |
|---|---|---|
| RF01 | Identitat i interfície | Marca pròpia aplicada de manera coherent a totes les seccions; versió d’escriptori i versió mòbil. |
| RF02 | Navegació | Accés a inici, cinc biblioteques, càrrega i configuració; secció activa identificable i retorn als llistats. |
| RF03 | Pel·lícules | Llistat amb portada, títol i any; fitxa amb descripció, gènere i accés al vídeo disponible. |
| RF04 | Sèries | Llistat de sèries, fitxa, temporades agrupades i episodis ordenats numèricament. |
| RF05 | Llibres | Llistat i fitxa amb títol, autoria i descripció; obertura d’un PDF local al navegador o en una pestanya del mateix navegador. |
| RF06 | Jocs | Catàleg i fitxa amb portada, nom, plataforma i descripció; filtre per plataforma. L’execució del joc és una ampliació. |
| RF07 | Imatges | Graella amb miniatures, ampliació d’una imatge i retorn a la galeria. |
| RF08 | Cerca i ordenació | Cerca per títol o nom a les cinc biblioteques; ordre A–Z i Z–A; filtre de gènere a pel·lícules. |
| RF09 | Favorits i vistos | Favorits a pel·lícules, sèries, llibres i jocs; filtre de favorits; vist/no vist a pel·lícules i episodis. |
| RF10 | Càrrega real | Càrrega de vídeos, PDF, imatges i portades al disc a través de la web; càrrega múltiple d’episodis. |
| RF11 | Edició | Modificació persistent de títol i descripció; any i gènere a pel·lícules; autoria a llibres; plataforma a jocs. |
| RF12 | Eliminació | Eliminació confirmada d’una pel·lícula, un episodi, un llibre, una imatge o una fitxa de joc; coherència entre catàleg i disc. |
| RF13 | Consum de contingut | Vídeo real amb reproducció, pausa, desplaçament temporal i volum mitjançant controls nadius o equivalents; PDF i galeria funcionals. |
| RF14 | Inici i estat | Resum de quantitats per categoria, volum real de contingut emmagatzemat i estat de connexió amb l’API. |
| RF15 | Preferències | Desar el nom visible de la biblioteca, la secció inicial i l’ordre preferit; aplicar-los després de reiniciar. |
| RF16 | Persistència | Catàleg, metadades, marques i preferències conservats després de recarregar el navegador i reiniciar el servidor. |
| RF17 | Actualització del disc | Acció per tornar a explorar la biblioteca: incorporar fitxers afegits manualment i detectar els que ja no hi són. |
| RF18 | Qualitat d’ús | Formularis etiquetats, operació amb teclat, focus visible i estats de càrrega, buit, error i confirmació. |

Els favorits i les preferències seran compartits per una única biblioteca local. No cal implementar comptes d’usuari ni sincronització entre usuaris.

### 4.2. Ampliacions opcionals

Només s’abordaran quan el recorregut obligatori funcioni:

- Importació de metadades d’un servei extern i conservació local dels resultats.
- Més idiomes d’interfície.
- Accés mitjançant PIN validat al servidor.
- Visor EPUB o de còmics, o visor PDF propi amb controls addicionals.
- Emulació de jocs amb fitxers de prova adequats.
- Progrés de visualització, continuar mirant i marcar una temporada sencera com a vista.
- Càrrega de carpetes arrossegant-les, previsualització avançada o cancel·lació d’una càrrega.
- Eliminació completa de temporades o sèries amb resum previ dels elements afectats.

Les ampliacions no substitueixen els requisits obligatoris ni afegeixen punts fora de la rúbrica.

### 4.3. Treball reservat per a la segona fase

Queden fora d’aquest lliurament la instal·lació a la Raspberry, els serveis d’arrencada, l’accés des de la xarxa local, el QR de connexió, la pantalla tàctil, GPIO, la càmera del dispositiu, el volum del sistema i l’apagada física.

En aquesta fase, el botó de reproducció actuarà sobre el navegador. No cal controlar un reproductor extern ni executar ordres del sistema. Tampoc cal implementar les alarmes, la meteorologia, els aniversaris o la gestió avançada de memòria cau del projecte original.

## 5. Organització i calendari

Cada subfase acaba amb un lliurament revisable. Conservareu totes les versions importants, incloses les decisions de disseny que canvieu posteriorment.

| Subfase | Treball principal | Hores orientatives | Lliurament |
|---|---|---:|---|
| 1.1 | Investigació i identitat visual | 6 h | E1. Dossier visual i recursos de marca |
| 1.2 | Seccions, recorreguts i maquetació | 8 h | E2. Mapa, fluxos i proposta Affinity/Figma |
| 1.3 | Entorn, carpetes i model de dades | 6 h | E3. Projecte inicial i biblioteca de prova |
| 1.4 | Interfície adaptable | 8 h | E4. Web navegable amb dades provisionals |
| 1.5 | API i consulta del catàleg real | 10 h | E5. Biblioteques connectades al disc |
| 1.6 | Càrregues, edició i persistència | 10 h | E6. Gestió completa del contingut |
| 1.7 | Reproducció i experiència d’ús | 8 h | E7. Aplicació funcional integrada |
| 1.8 | Proves, documentació i lliurament | 4 h | E8. Versió final i defensa |
| **Total** | | **60 h** | |

Abans de començar la maquetació amb codi s’hauran de presentar E1 i E2. La revisió serveix per detectar problemes de jerarquia o navegació mentre encara són fàcils de corregir. No cal congelar el disseny: els canvis posteriors s’han d’explicar breument al dossier.

## 6. Subfase 1.1 — Investigació i identitat visual

**Pregunta que heu de resoldre:** quina personalitat tindrà la vostra biblioteca i com es reconeixerà visualment?

### Tasques

**1. Redacteu un breu document de projecte, entre 200 i 350 paraules.** Ha d’incloure:

- Nom provisional i finalitat de la biblioteca.
- Públic destinatari i context d’ús.
- Tres tasques habituals que ha de poder fer aquest públic.
- Tres adjectius que defineixin la personalitat visual.
- Una necessitat d’ús que hagi de condicionar el disseny, com ara llegibilitat en mòbil o facilitat per localitzar un episodi.

**2. Investigueu un mínim de sis referents.** Incloeu almenys dues biblioteques o catàlegs, dues interfícies que destaqueu per la navegació i dos referents gràfics o de marca. Per a cadascun, registreu:

- Nom, enllaç, data de consulta i captura o fragment visual.
- Què considereu útil: jerarquia, colors, composició, targetes, cercador, etc.
- Quina idea concreta voleu aplicar i com l’adaptareu.
- Un aspecte que no encaixa amb el vostre públic o amb el vostre projecte.

No n’hi ha prou amb enganxar captures. S’avaluarà la relació entre l’anàlisi i les decisions que preneu.

**3. Prepareu un tauler de referències o moodboard.** Ha de reunir composició, color, tipografia, imatges i estil d’icones. Afegiu un text de 100–150 paraules que expliqui la direcció artística.

**4. Dissenyeu o escolliu el logotip.** Presenteu almenys tres esbossos o alternatives, seleccioneu-ne una i justifiqueu-la. Lliureu:

- Logotip principal i versió simplificada per a espais petits.
- Versió que funcioni sobre fons clar i sobre fons fosc.
- Exportació SVG quan l’original sigui vectorial i PNG amb transparència.
- Prova d’ús a la capçalera i a una mida aproximada de 32 × 32 píxels.
- Procedència i permís d’ús si incorporeu recursos de tercers.

El logotip pot ser tipogràfic. No es valorarà la complexitat del dibuix, sinó la coherència i la llegibilitat.

**5. Escolliu exactament tres colors base.** Per a cadascun, indiqueu el codi HEX, la funció i un exemple d’aplicació:

| Color | Funció que heu de definir | Exemples d’ús possibles |
|---|---|---|
| Base 1 | Color principal de marca | Botons principals, elements actius |
| Base 2 | Color de suport | Superfícies, capçaleres o elements secundaris |
| Base 3 | Color d’accent | Destacats, selecció o accions puntuals |

Podeu afegir blanc, negre i una escala de grisos com a neutres. Els colors d’estat, si en necessiteu, s’han de documentar a part. Això no amplia la paleta base a quatre o cinc colors de marca.

Mostreu combinacions reals de text i fons. Comproveu-ne la llegibilitat i no feu dependre una distinció únicament del color: un error també ha de tenir text, i un favorit també ha de tenir una icona o etiqueta comprensible.

**6. Escolliu la tipografia.** Utilitzeu una família principal i, com a màxim, una segona família per als titulars. Definiu:

- Família, pesos i font alternativa si no es pot carregar.
- Mides orientatives per a títol de pàgina, subtítol, text, botons i informació secundària.
- Interlineat i criteri de longitud de les línies.
- Disponibilitat de caràcters catalans i llegibilitat en pantalles petites.
- Procedència i condicions d’ús.

Per mantenir el funcionament local, allotgeu les fonts al projecte quan la llicència ho permeti, o utilitzeu fonts del sistema.

### Lliurament E1

Dossier visual en PDF, d’unes 5–8 pàgines, amb document de projecte, referents comentats, moodboard, alternatives de logotip, paleta i tipografia. Adjunteu els recursos finals i els fitxers editables corresponents.

**Criteri de finalització:** una altra persona pot identificar els tres colors base, la tipografia i el logotip seleccionat, i entendre per què encaixen amb el projecte.

## 7. Subfase 1.2 — Arquitectura de la informació i proposta de maquetació

**Pregunta que heu de resoldre:** com s’orientarà la persona usuària i com completarà les tasques principals?

### Tasques

**1. Feu un inventari de seccions.** Per a cada secció, indiqueu objectiu, contingut, accions, punt d’entrada i manera de sortir-ne. L’organització mínima ha de contemplar:

```text
Inici / Resum
Biblioteca
├── Pel·lícules → Fitxa → Reproductor
├── Sèries → Fitxa → Temporada → Episodi → Reproductor
├── Llibres → Fitxa → PDF
├── Jocs → Fitxa
└── Imatges → Galeria → Imatge ampliada
Càrrega de contingut
Configuració i estat
```

Podeu modificar l’agrupació i els noms visibles si totes les funcionalitats continuen sent localitzables. Per exemple, càrrega i configuració poden conviure en una àrea de gestió amb pestanyes clares.

**2. Dibuixeu el mapa de navegació.** Mostreu la relació entre les pantalles, els nivells de profunditat, la navegació principal i els retorns. Decidiu on apareixeran el cercador, els filtres, els favorits i l’accés a la càrrega.

**3. Representeu quatre recorreguts d’ús.** Cada recorregut ha de contenir inici, passos, resultat i almenys una alternativa o error:

1. Trobar una pel·lícula, consultar-la i reproduir-la.
2. Entrar en una sèrie, escollir temporada i marcar un episodi com a vist.
3. Carregar un llibre, completar-ne la fitxa i obrir el PDF.
4. Eliminar una imatge, cancel·lar primer l’operació i confirmar-la en un segon intent.

**4. Prepareu wireframes de totes les famílies de pantalla.** Treballeu primer la distribució de blocs i la jerarquia. Penseu especialment en:

- Quina informació ha de veure’s abans de desplaçar la pàgina.
- Què és clicable i com es reconeix.
- Com varia una targeta entre pel·lícula, llibre i joc.
- On es mostren els filtres actius i com s’eliminen.
- Què passa amb títols llargs, portades absents i catàlegs buits.
- Com es conserva el context quan es torna d’una fitxa al llistat.

**5. Feu una proposta d’alta fidelitat amb Affinity o Figma.** Ha d’aplicar E1 i incloure, com a mínim, aquestes nou pantalles d’escriptori:

1. Inici amb resum de la biblioteca.
2. Llistat de pel·lícules amb cerca i filtres.
3. Fitxa de pel·lícula amb accions.
4. Fitxa de sèrie amb temporades.
5. Llistat d’episodis d’una temporada.
6. Biblioteca de llibres amb un exemple de fitxa.
7. Biblioteca de jocs amb filtre de plataforma i exemple de fitxa.
8. Galeria amb exemple d’imatge ampliada.
9. Àrea de gestió amb les variants de càrrega i configuració.

Afegiu la versió mòbil de quatre pantalles: llistat de pel·lícules, fitxa de pel·lícula, episodis i càrrega. Com a referència de treball podeu utilitzar marcs de 1440 px i 390 px d’amplada; el codi s’haurà d’adaptar també a amplades intermèdies.

**6. Dissenyeu els estats.** Representeu almenys un exemple de càrrega, catàleg buit, cerca sense resultats, error de connexió, error de formulari i confirmació d’eliminació. Poden aparèixer com a variants dels marcs anteriors.

**7. Prepareu una petita guia de components.** Incloeu botons, camp de text, selector, targeta, etiqueta de categoria, missatge d’estat i diàleg. Definiu espaiats, cantonades, icones i estats de focus, selecció i desactivació.

**8. Feu una revisió amb una altra persona.** Demaneu-li que localitzi una pel·lícula i que expliqui com hi afegiria un llibre. Registreu tres observacions i les millores resultants.

### Lliurament E2

- Mapa de seccions i quatre recorreguts d’ús.
- Wireframes, maquetes d’escriptori i mòbil, estats i guia de components.
- Si treballeu amb Figma: enllaç amb permís de consulta i exportació PDF. Connecteu les pantalles dels recorreguts principals.
- Si treballeu amb Affinity: fitxer editable i exportació PDF. Afegiu fletxes, numeració o un guió de navegació que permeti seguir els mateixos recorreguts.
- Resum de la revisió amb una altra persona.

No es penalitzarà utilitzar Affinity perquè no ofereixi el mateix prototipatge interactiu que Figma. S’avaluarà que la proposta permeti entendre i comprovar els recorreguts.

**Criteri de finalització:** totes les seccions i les accions obligatòries tenen una ubicació prevista i els quatre recorreguts es poden seguir sense explicacions orals de l’autor.

## 8. Subfase 1.3 — Entorn local, sistema de fitxers i dades

**Pregunta que heu de resoldre:** on viurà cada element i com el trobarà l’aplicació?

### 8.1. Arquitectura de treball

La base proposada és React amb Vite per a la interfície i Python amb Flask per a l’API, seguint el projecte de referència. Si el professorat fixa una altra tecnologia abans de començar, s’hauran de mantenir els mateixos requisits funcionals i de persistència.

```text
Navegador
   │ peticions HTTP
   ▼
API local
   ├── llegeix i desa metadades i preferències
   ├── explora, carrega i elimina fitxers
   └── serveix vídeos, PDF, imatges i portades
             │
             ▼
      MultimediaContent/
```

El navegador no pot gestionar arbitràriament les carpetes de l’ordinador. Seleccionar un fitxer en un formulari no significa que s’hagi desat a la biblioteca: cal enviar-lo al servidor i comprovar que s’ha escrit al disc.

En desenvolupament podeu tenir dos serveis locals, per exemple Vite al port 5173 i l’API al 5050. Documenteu el proxy o la configuració necessària perquè es comuniquin. La versió compilada també s’haurà de poder servir localment sense dependre del servidor de desenvolupament de Vite.

### 8.2. Estructura mínima de carpetes

Prepareu aquesta estructura, o una d’equivalent justificada. Les carpetes de contingut mantindran els noms indicats per facilitar el treball posterior.

```text
LaMevaBiblioteca/
├── WebApp/
│   ├── public/brand/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── styles/
│   │   └── assets/
│   ├── package.json
│   └── .env.example
├── DeviceApp/
│   ├── app.py
│   ├── services/
│   ├── requirements.txt
│   └── .env.example
├── MultimediaContent/
│   ├── Videos/
│   │   ├── Movies/
│   │   │   └── viatge-curt/
│   │   │       └── viatge-curt.mp4
│   │   └── TVShows/
│   │       └── serie-demo/
│   │           ├── S01E01.mp4
│   │           ├── S01E02.mp4
│   │           ├── S02E01.mp4
│   │           └── S02E02.mp4
│   ├── Books/
│   │   └── guia-demo.pdf
│   ├── Games/
│   ├── Pictures/
│   │   └── paisatge.jpg
│   ├── Covers/
│   ├── metadata/
│   │   └── catalog.json
│   └── settings/
│       ├── preferences.json
│       └── marks.json
├── demo/
│   ├── README.md
│   └── manifest.json
├── docs/
│   ├── disseny/
│   ├── arquitectura.md
│   ├── api.md
│   ├── proves.md
│   ├── fonts-i-llicencies.md
│   └── migracio-raspberry.md
├── .gitignore
└── README.md
```

`Covers/`, `metadata/` i `settings/` són una simplificació didàctica: el projecte original distribueix aquestes dades en altres fitxers i carpetes. Si utilitzeu SQLite, podeu substituir els tres JSON per una base de dades documentada; els fitxers multimèdia continuaran existint al disc.

En aquest model, les temporades són agrupacions lògiques a partir de `SxxExx`. Els episodis es guarden directament dins la carpeta de la sèrie. No cal crear subcarpetes de temporada.

### 8.3. Normes d’organització

- Desar rutes relatives a `MultimediaContent/`, com ara `Videos/Movies/viatge-curt/viatge-curt.mp4`.
- No desar rutes personals absolutes al catàleg ni al codi del client.
- Utilitzar noms de carpeta i fitxer previsibles, sense dependre de majúscules i minúscules per distingir continguts.
- Separar el títol visible del nom físic: «Viatge curt» pot correspondre a `viatge-curt.mp4`.
- Assignar un identificador estable a cada registre. No utilitzar la posició dins d’un array com a identificador persistent.
- Distingir episodis de sèries diferents encara que comparteixin el codi `S01E01`.
- Ordenar temporades i episodis per número, no per una comparació ingènua de textos.
- Generar les carpetes buides necessàries en la inicialització o conservar-les amb un fitxer marcador.

### 8.4. Model de dades

Documenteu els camps, el tipus i les relacions de pel·lícula, sèrie, episodi, llibre, joc i imatge. També heu de representar marques i preferències.

Exemple orientatiu d’una pel·lícula; les rutes són relatives a l’arrel multimèdia:

```json
{
  "id": "movie-001",
  "type": "movie",
  "title": "Viatge curt",
  "description": "Peça de demostració de la biblioteca.",
  "year": 2025,
  "genres": ["Documental"],
  "fileRelativePath": "Videos/Movies/viatge-curt/viatge-curt.mp4",
  "coverRelativePath": "Covers/viatge-curt.jpg",
  "createdAt": "2026-01-15T10:00:00Z"
}
```

Un episodi haurà de relacionar-se amb un `seriesId` i tenir número de temporada i d’episodi. Un llibre incorporarà autoria; un joc, plataforma. La disponibilitat del fitxer es verificarà al servidor. Les marques de favorit o vist es relacionaran amb l’identificador estable.

**Fonts de veritat:** el disc determina quins fitxers existeixen; el catàleg desa títols, descripcions i relacions; el fitxer de marques o la base de dades desa l’estat d’ús. Explorar el disc no ha de sobreescriure els títols editats ni esborrar els favorits.

Per als jocs es permet una fitxa sense binari: ha d’indicar que només és una entrada de catàleg. Aquesta excepció no s’aplica als vídeos, llibres i imatges de demostració.

### 8.5. Biblioteca de prova

Prepareu aquest joc de dades mínim, amb contingut propi, facilitat pel professorat o reutilitzable amb les condicions corresponents:

| Contingut | Quantitat mínima | Variacions que cal provar |
|---|---:|---|
| Pel·lícules | 3 | Dos gèneres, anys diferents i un títol llarg |
| Sèries | 2 | Dues temporades per sèrie i dos episodis per temporada: 8 episodis en total |
| Llibres | 3 PDF | Dues autories diferents i un títol amb accents |
| Jocs | 2 fitxes | Dues plataformes diferents; binaris opcionals |
| Imatges | 6 | Orientacions horitzontal i vertical |
| Portades | Les necessàries | Almenys una fitxa sense portada per comprovar l’alternativa visual |

Els vídeos han de ser clips curts reproduïbles. Podeu reutilitzar un mateix clip propi en diversos fitxers d’episodi per provar l’estructura; les entrades han de continuar sent independents. No cal descarregar pel·lícules o capítols comercials.

Afegiu un fitxer de format no admès i un nom d’episodi incorrecte a la carpeta de proves, fora de la biblioteca, per provar els errors. Un fitxer de text reanomenat a `.mp4` no compta com a vídeo reproduïble.

### Lliurament E3

Repositori inicial, arbre de carpetes, model de dades, biblioteca de prova i instruccions per posar-la en marxa. Indiqueu les versions de les eines emprades i com es configura l’arrel multimèdia.

**Criteri de finalització:** el servidor pot localitzar el contingut des d’una arrel configurable i un company pot entendre la relació entre els registres i els fitxers sense conèixer les carpetes personals de l’autor.

## 9. Subfase 1.4 — Construcció de la interfície

**Pregunta que heu de resoldre:** com traslladareu el disseny a components reutilitzables i una web adaptable?

### Tasques

1. Implementeu l’estructura general: capçalera, marca, navegació principal, contingut i accés a gestió.
2. Convertiu la paleta, la tipografia i els espaiats en variables o regles centralitzades.
3. Creeu components reutilitzables: targeta multimèdia, barra de cerca, selector d’ordre, filtres, botó de favorit, missatge d’estat, formulari i diàleg.
4. Construïu les cinc biblioteques i les pantalles de detall segons E2.
5. Implementeu la navegació entre sèrie, temporada i episodi.
6. Prepareu formularis visibles de càrrega, edició i preferències.
7. Feu servir dades provisionals només com a suport d’aquesta subfase, separades de la presentació.
8. Reviseu l’adaptació a 390 px, 768 px i 1440 px d’amplada, sense desplaçament horitzontal accidental.
9. Comproveu els títols llargs, les portades absents i els llistats amb pocs elements.

Es pot utilitzar navegació per rutes o una altra solució coherent. En tots els casos s’ha de poder tornar al llistat anterior, reconèixer la secció activa i recuperar-se d’una recàrrega de pàgina.

Feu servir elements HTML adequats: botons per a accions, enllaços per navegar i etiquetes associades als camps. Els controls només amb icona han de tenir un nom accessible. La navegació i els formularis s’han de poder utilitzar amb teclat.

### Lliurament E4

Web navegable, captures de les tres amplades i comparació de quatre pantalles amb la maqueta. Documenteu breument els canvis rellevants de disseny.

**Criteri de finalització:** les seccions i els recorreguts es poden recórrer amb dades provisionals; la identitat visual s’aplica de manera consistent i no hi ha pantalles obligatòries substituïdes per un text de «pendent».

## 10. Subfase 1.5 — API local i consulta del catàleg real

**Pregunta que heu de resoldre:** com mostrarà la web el que existeix realment al disc?

### Tasques

1. Inicieu el servidor local i exposeu un endpoint d’estat.
2. Implementeu la lectura del catàleg i l’exploració de les carpetes multimèdia.
3. Associeu els fitxers descoberts amb registres existents mitjançant les rutes relatives; assigneu un identificador als nous.
4. Agrupeu els episodis per sèrie i temporada i ordeneu-los correctament.
5. Retorneu informació suficient per construir llistats i fitxes sense rutes absolutes del sistema.
6. Substituïu les dades provisionals per peticions a l’API, centralitzades a `services/` o equivalent.
7. Serviu portades i contingut des de rutes HTTP locals.
8. Calculeu les quantitats i la mida real del contingut des del servidor.
9. Afegiu l’acció «Actualitzar biblioteca» per repetir l’exploració.
10. Mostreu estats de càrrega, error de connexió i reintent.

### Contracte d’API orientatiu

Les rutes següents corresponen a la pràctica. Podeu adaptar-les si documenteu els canvis i manteniu una convenció consistent. Les operacions d’escriptura es completaran a la subfase 1.6.

| Mètode i ruta | Funció |
|---|---|
| `GET /api/health` | Estat del servei local |
| `GET /api/library?type=movie` | Catàleg o una categoria; tipus definits: `movie`, `series`, `episode`, `book`, `game`, `picture` |
| `GET /api/items/<id>` | Fitxa d’un element |
| `GET /api/series/<id>/seasons` | Temporades d’una sèrie |
| `GET /api/series/<id>/episodes?season=1` | Episodis d’una temporada |
| `GET /api/stats` | Recompte per categoria i bytes emmagatzemats |
| `POST /api/library/rescan` | Explorar de nou les carpetes i informar d’altes i absències |
| `POST /api/series` | Crear una sèrie a la qual associar episodis |
| `POST /api/games` | Crear una fitxa de joc, amb binari opcional |
| `POST /api/uploads` | Rebre fitxers i camps del formulari amb `multipart/form-data` |
| `PATCH /api/items/<id>` | Modificar metadades |
| `DELETE /api/items/<id>` | Eliminar un element segons les regles de la pràctica |
| `GET /api/marks` | Llegir favorits i vistos |
| `PATCH /api/marks/<id>` | Canviar les marques d’un element |
| `GET /api/settings` | Llegir preferències |
| `PATCH /api/settings` | Desar preferències |
| `GET /api/items/<id>/content` | Servir el fitxer associat |
| `GET /api/items/<id>/cover` | Servir la portada associada, si existeix |

Per a cada endpoint implementat documenteu els camps d’entrada, un exemple de resposta correcta i els errors previsibles. Distingiu, com a mínim, petició invàlida, element inexistent, duplicat i error intern. Una operació fallida no ha de respondre com si s’hagués completat.

### Regles de coherència

- **Fitxer nou al disc:** després d’actualitzar, es crea una entrada bàsica amb el nom del fitxer si no hi ha metadades.
- **Fitxer conegut:** es conserva l’identificador, el títol editat i les marques.
- **Fitxer que falta:** la fitxa es marca com a no disponible i no permet reproduir-lo. No s’elimina silenciosament la informació editada.
- **Fitxer restituït a la mateixa ruta:** torna a estar disponible sense duplicar-ne la fitxa.
- **Joc sense binari:** conserva explícitament l’estat «Només catàleg».
- **Portada absent:** apareix una alternativa gràfica local i no una imatge trencada.

No és obligatori detectar automàticament un canvi de nom manual d’un fitxer: podeu tractar-lo com una absència i una alta nova, sempre que ho documenteu.

Al resum d’estat, compteu les sèries separadament dels episodis. Si hi ha fitxes no disponibles, distingiu-les dels elements disponibles. Indiqueu quines carpetes inclou el càlcul de mida i les unitats utilitzades. No presenteu dades inventades d’espai lliure o de capacitat del disc.

### Lliurament E5

API documentada, web connectada i evidència d’aquest recorregut: afegir un fitxer manualment, actualitzar la biblioteca i veure’l a la web; retirar-lo, actualitzar i veure’n l’estat no disponible.

**Criteri de finalització:** la biblioteca visible es correspon amb el disc i les dades provenen de l’API. La web informa correctament quan el servidor està aturat.

## 11. Subfase 1.6 — Càrrega, edició, eliminació i persistència

**Pregunta que heu de resoldre:** com gestionarà la persona usuària el contingut sense editar JSON ni moure fitxers manualment?

### 11.1. Càrrega de contingut

Prepareu un formulari amb selecció de tipus, fitxer o fitxers, metadades i portada opcional. Abans d’enviar-lo, mostreu què es carregarà i a quina categoria.

Formats mínims obligatoris:

- Pel·lícules i episodis: `.mp4`, amb clips comprovats en el navegador de prova.
- Llibres: `.pdf`.
- Imatges i portades: `.jpg`, `.jpeg` i `.png`.
- Jocs: alta de fitxa sense binari. Si admeteu binaris, documenteu els formats i l’estat d’execució.

Fixeu i documenteu un límit de mida per fitxer, per exemple 50 MB, adequat al material de demostració. El servidor també l’ha d’aplicar. El fet que un fitxer tingui una extensió admesa no garanteix que el navegador el pugui reproduir; els clips de demostració s’han de comprovar.

Per a sèries, permeteu seleccionar una sèrie existent o crear-la i carregar diversos episodis en una mateixa operació. Llegiu la temporada i l’episodi de noms com `S01E02.mp4`. La selecció múltiple de fitxers és suficient; la càrrega d’una carpeta completa és opcional.

Durant la càrrega:

1. Valideu camps obligatoris, extensió, mida i format dels noms d’episodi.
2. Desactiveu l’enviament repetit mentre la petició estigui en curs.
3. Mostreu activitat real. Un indicador «Carregant…» és suficient; no inventeu percentatges.
4. Deseu el fitxer a la carpeta correcta i actualitzeu el catàleg.
5. Mostreu un resultat que identifiqui els elements desats i els errors.
6. Actualitzeu el llistat i el resum d’estat.

En una càrrega múltiple podeu rebutjar tot el lot abans de desar-lo si hi ha errors, o acceptar-ne només els elements vàlids. Heu d’escollir una política, documentar-la i informar del resultat per fitxer. No es pot anunciar que tot el lot ha anat bé quan només n’ha arribat una part.

**Duplicats:** rebutgeu-los amb un missatge clar o genereu un nom nou sense sobreescriure. No s’ha de perdre un fitxer anterior de manera silenciosa. Dins d’una sèrie, la combinació de temporada i episodi no s’ha de duplicar sense una decisió explícita.

### 11.2. Edició de metadades

Permeteu modificar els camps de RF11 amb un formulari que carregui els valors actuals. Ha d’haver-hi accions de desar i cancel·lar, errors comprensibles i confirmació d’èxit.

Canviar el títol visible no obliga a canviar el nom del fitxer. Manteniu l’identificador i la relació amb els favorits o vistos.

### 11.3. Eliminació

Abans de confirmar, mostreu el títol i expliqueu si s’eliminarà també el fitxer físic. La cancel·lació no ha de modificar res.

Quan es confirma:

- Pel·lícula, episodi, llibre o imatge: elimineu el fitxer associat i el registre; netegeu-ne les marques.
- Fitxa de joc sense binari: elimineu només les dades i els recursos que li siguin exclusius.
- Una portada compartida o un recurs predeterminat no s’ha d’eliminar mentre altres elements l’utilitzin.
- Si falta el fitxer d’un registre no disponible, permeteu eliminar la fitxa igualment.
- Si una operació de disc falla, informeu-ne i no anuncieu una eliminació completa.

Eliminar una sèrie o temporada sencera és opcional. Si ho implementeu, el diàleg ha de mostrar el nombre d’episodis afectats.

### 11.4. Persistència de marques i configuració

Deseu al servidor els favorits, els vistos i les preferències. `localStorage` pot guardar detalls temporals de la interfície, però no serà l’únic lloc on existeixin aquestes dades.

Comproveu que es mantenen en aquests tres casos:

1. Recàrrega de la pàgina.
2. Tancament i reobertura del navegador.
3. Aturada i reinici del servidor.

Si feu servir JSON, gestioneu les escriptures perquè no deixin fitxers parcials i perquè dues peticions no sobreescriguin canvis sense control. Podeu escriure en un temporal, substituir el fitxer final i serialitzar les modificacions. Si feu servir SQLite, utilitzeu transaccions per a les dades relacionades.

### 11.5. Regles tècniques de les operacions sobre fitxers

Tota lectura, càrrega o eliminació s’ha de limitar a la carpeta multimèdia configurada. El servidor ha de resoldre la ruta i comprovar que queda dins d’aquesta carpeta, també quan hi ha noms manipulats o enllaços simbòlics. No n’hi ha prou amb eliminar visualment `../` d’un text.

Els noms rebuts del navegador no s’han d’utilitzar com a ordres del sistema. No s’ha de poder sobreescriure codi, configuració o fitxers aliens a la biblioteca des del formulari de càrrega.

### Lliurament E6

Demostració de càrrega, edició i eliminació amb comprovació al disc; evidència de persistència després de reiniciar; documentació de la política de duplicats i de lots.

**Criteri de finalització:** els canvis es poden fer des de la web, tenen efectes reals i es conserven. Les operacions cancel·lades o rebutjades no deixen modificacions inesperades.

## 12. Subfase 1.7 — Reproducció i experiència d’ús completa

**Pregunta que heu de resoldre:** la biblioteca és útil quan algú intenta fer-hi les tasques habituals?

### Tasques

**1. Reproducció de vídeo.** Connecteu el reproductor amb el fitxer servit per l’API. Ha de reproduir, pausar, permetre moure’s a un altre moment i ajustar el volum. Es poden utilitzar els controls nadius de `<video>`.

El servidor ha de permetre el lliurament parcial necessari per al desplaçament temporal. Verifiqueu amb un clip de durada suficient que el salt funciona; no carregueu tot el vídeo com a dades codificades dins de JSON.

**2. Llibres i imatges.** Obriu PDF reals i implementeu l’ampliació d’imatges. Si el visor és un diàleg, ha de poder tancar-se amb teclat i retornar el focus al control d’origen. L’obertura del PDF en una pestanya nova amb el visor del navegador és vàlida.

**3. Cerca, filtres i ordenació.** Implementeu la cerca sense distingir majúscules de minúscules. Afegiu A–Z i Z–A, filtre de gènere a pel·lícules, filtre de plataforma a jocs i filtre de favorits a les quatre categories corresponents.

Els filtres han de poder combinar-se: per exemple, pel·lícules favorites d’un gènere que coincideixin amb un text. Afegiu una manera clara de netejar-los. La cerca sense accents és una millora opcional.

**4. Favorits i vistos.** L’estat ha de ser reconeixible a les fitxes i on tingui sentit als llistats. Marcar un episodi d’una sèrie no ha de modificar-ne un d’una altra amb el mateix codi. La marca de vist pot ser manual; no cal detectar automàticament el final de reproducció.

**5. Resum i preferències.** Completeu l’inici amb recomptes i mida real. Apliqueu la secció inicial i l’ordre preferit quan s’obre l’aplicació. El nom configurat de la biblioteca ha d’aparèixer a la interfície.

**6. Estats i recuperació.** Reviseu aquests casos:

- Biblioteca buida amb accés visible a la càrrega.
- Cerca sense coincidències amb opció de netejar els filtres.
- Servidor aturat amb missatge i acció de reintent.
- Fitxer no disponible amb reproducció desactivada.
- Portada absent amb alternativa local.
- Formulari incorrecte amb missatge al camp corresponent.
- Operació en curs amb controls que evitin repeticions accidentals.

**7. Ús amb teclat i adaptació.** Completeu un recorregut només amb teclat i repetiu les tasques principals en amplada mòbil. No hi ha d’haver accions accessibles exclusivament quan es passa el ratolí per damunt.

### Lliurament E7

Aplicació integrada i demostració dels quatre recorreguts definits a E2 amb dades reals. Adjunteu una llista de correccions fetes després de provar-la amb una altra persona.

**Criteri de finalització:** la persona de prova pot consultar, filtrar, carregar i consumir contingut sense que l’autor li indiqui cada pas. Els requisits RF01–RF18 estan implementats o identificats honestament com a pendents abans de l’última revisió.

## 13. Subfase 1.8 — Verificació, documentació i lliurament final

### 13.1. Pla de proves obligatori

Per a cada prova, registreu preparació, passos, resultat esperat, resultat obtingut i una evidència breu. No n’hi ha prou amb marcar «correcte» en una llista. Podeu aportar captures, respostes HTTP, fragments de registre o una demostració reproduïble.

| Prova | Acció | Resultat esperat | Requisits |
|---|---|---|---|
| T01 | Iniciar el projecte seguint el README en una còpia nova | Web i API disponibles sense editar rutes personals | RF02, RF16 |
| T02 | Recórrer totes les seccions a 390, 768 i 1440 px | Navegació usable, contingut llegible i sense desbordaments accidentals | RF01, RF02, RF18 |
| T03 | Comparar el catàleg amb la biblioteca de prova | Tres pel·lícules, dues sèries, vuit episodis, tres llibres, dos jocs i sis imatges | RF03–RF07 |
| T04 | Navegar entre sèries, temporades i episodis | Agrupació correcta i sense confusions entre codis repetits de sèries diferents | RF04 |
| T05 | Cercar amb majúscules, ordenar i combinar filtres | Resultat coherent; netejar els filtres recupera el llistat | RF08, RF09 |
| T06 | Cercar un text inexistent i visitar una categoria buida | Missatges diferents per a cerca sense resultats i biblioteca buida | RF18 |
| T07 | Marcar favorits i vistos; editar un títol | Les marques persisteixen i continuen vinculades al mateix element | RF09, RF11, RF16 |
| T08 | Carregar una pel·lícula des de la web | Fitxer al directori correcte, fitxa visible i recompte actualitzat | RF10, RF14 |
| T09 | Carregar diversos episodis, incloent un nom incorrecte | S’aplica la política del lot i s’informa exactament del resultat | RF04, RF10, RF18 |
| T10 | Enviar un format no admès, un fitxer massa gran i un duplicat | Rebuig o tractament documentat; cap sobreescriptura silenciosa | RF10 |
| T11 | Carregar un PDF, una imatge i una portada | Fitxers locals accessibles i associats correctament | RF05, RF07, RF10 |
| T12 | Crear i editar una fitxa de joc sense binari | Catàleg, filtre de plataforma i estat «Només catàleg» correctes | RF06, RF11 |
| T13 | Cancel·lar i després confirmar una eliminació | Cancel·lar no modifica res; confirmar elimina el que s’havia anunciat | RF12 |
| T14 | Afegir, retirar i restituir un fitxer manualment; explorar de nou | Alta, indisponibilitat i recuperació sense perdre metadades ni duplicar la fitxa | RF17 |
| T15 | Reproduir i pausar un vídeo; avançar-lo i canviar el volum | Controls efectius sobre el contingut real | RF13 |
| T16 | Obrir un PDF i ampliar/tancar una imatge | Contingut correcte i retorn a un estat usable | RF05, RF07, RF13 |
| T17 | Desar preferències; reiniciar navegador i servidor | Nom, secció inicial, ordre, catàleg i marques es mantenen | RF15, RF16 |
| T18 | Aturar l’API mentre es consulta la web i tornar-la a iniciar | Error comprensible i recuperació amb reintent | RF14, RF18 |
| T19 | Retirar una portada de prova | Alternativa gràfica coherent, sense imatge trencada | RF01, RF18 |
| T20 | Fer una petició de prova amb una ruta que surti de la biblioteca | Rebuig; cap lectura, escriptura o eliminació fora de l’arrel | RF10, RF12 |
| T21 | Comparar mida i recomptes amb els fitxers del disc | Valors reals, unitats i abast del càlcul documentats | RF14 |
| T22 | Fer un recorregut amb teclat i executar el build local | Controls accessibles i versió compilada navegable, també després de recarregar | RF02, RF18 |
| T23 | Canviar l’arrel multimèdia a una còpia en una altra carpeta | L’aplicació funciona sense modificar components ni perdre marques | RF16, RF17 |
| T24 | Desconnectar Internet mantenint la connexió local amb l’API | Es poden consultar les fitxes, veure portades, reproduir vídeos i obrir PDF locals | RF03–RF07, RF13 |

Les proves es faran sobre una còpia del contingut de demostració. T20 utilitzarà un fitxer innocu preparat expressament fora de l’arrel multimèdia; no s’ha de provar amb fitxers personals del sistema.

Les proves manuals documentades són suficients per als recorreguts visuals. Per a la detecció d’episodis, la resolució de rutes i la política de duplicats, es recomanen proves automatitzades perquè permeten repetir fàcilment els casos límit.

### 13.2. README i documentació

El README ha de permetre que una altra persona instal·li i executi el projecte. Incloeu:

1. Descripció del producte i requisits implementats.
2. Versions de Node, Python i altres eines utilitzades.
3. Instal·lació de dependències i preparació de l’entorn Python.
4. Inicialització de carpetes i dades de demostració.
5. Ordres exactes per executar API i web en desenvolupament.
6. Configuració de ports, URL de l’API i arrel multimèdia.
7. Ordres de compilació i execució local de la versió compilada.
8. Ubicació de metadades, preferències i marques.
9. Com fer una còpia de seguretat i restaurar-la amb el servidor aturat.
10. Com executar les proves i quines limitacions es coneixen.

Adjunteu un `.env.example` per a cada entorn que el necessiti, amb valors ficticis i explicació de com es carreguen. No inclogueu secrets als fitxers del client ni a les variables públiques de Vite.

### 13.3. Preparació per a la Raspberry

Redacteu `docs/migracio-raspberry.md`, d’una o dues pàgines, amb:

- Quines carpetes contenen codi, quines contenen dades i quines es regeneren.
- Quins fitxers caldrà copiar per conservar catàleg, contingut, portades i preferències.
- Quines dependències s’hauran d’instal·lar al nou sistema.
- Quins valors de configuració canviaran: arrel del contingut, adreça i port.
- Com se servirà el frontend compilat i com es connectarà amb l’API.
- Quines funcionalitats de dispositiu queden pendents per a la segona fase.
- Resultat de T23: prova de canvi de carpeta dins del vostre ordinador.

La primera fase no es considerarà dependent d’una Raspberry disponible a casa. La portabilitat es comprova localment amb el canvi d’arrel, les rutes relatives i la instal·lació reproduïble.

### 13.4. Lliurament final E8

Lliureu un repositori o paquet de projecte que contingui:

- Codi font i fitxers de dependències amb les versions utilitzades.
- README i configuracions d’exemple.
- E1 i E2, amb els editables i les exportacions.
- Documents d’arquitectura, API, proves i preparació de la migració.
- Biblioteca de demostració o paquet annex local, amb instruccions de restauració i manifest. No ha de dependre d’enllaços de descàrrega temporals.
- Relació de recursos externs, autoria i condicions d’ús.
- Llista de funcionalitats completades, limitacions i ampliacions.
- Historial de treball amb fites identificables d’E1 a E8; si heu reutilitzat codi o eines generatives, indiqueu per a què i expliqueu el resultat.

Excloeu `node_modules`, entorns virtuals, memòries cau, arxius temporals i credencials. Els fitxers grans de demostració poden anar en un annex separat del repositori, sempre que el professorat rebi el paquet necessari per executar les proves sense buscar contingut addicional.

### 13.5. Defensa de 8–10 minuts

Prepareu aquesta demostració:

1. **Disseny, 2 minuts:** públic, referents, logotip, tres colors, tipografia i una decisió de maquetació.
2. **Funcionalitat, 4 minuts:** navegar, filtrar, reproduir, carregar i modificar contingut; demostrar una eliminació cancel·lada i una confirmada.
3. **Arquitectura, 2 minuts:** mostrar al disc on s’ha desat un fitxer i explicar-ne la relació amb la fitxa i l’API.
4. **Persistència i continuïtat, 1–2 minuts:** reiniciar el servidor, comprovar una preferència i explicar què caldrà traslladar a la Raspberry.

El professorat pot demanar una petita modificació o l’explicació d’una funció per comprovar l’autoria i la comprensió. Les limitacions s’han de declarar; una funcionalitat simulada no s’ha de presentar com si estigués connectada al disc.

## 14. Rúbrica d’avaluació de la primera fase

### 14.1. Criteris i nivells d’assoliment

La nota valora el procés de disseny, el producte funcional i les evidències de verificació. Cada fila correspon a una subfase i té un pes explícit.

| Subfase i pes | Excel·lent — nivell 4 | Assolit — nivell 3 | Bàsic — nivell 2 | Insuficient — nivell 1 |
|---|---|---|---|---|
| **1.1. Investigació i identitat visual — 12%** | E1 complet: sis referents analitzats i vinculats a decisions; moodboard coherent; tres alternatives de logotip i versions finals llegibles; exactament tres colors base amb usos justificats; tipografia definida i recursos amb procedència. | Tots els elements principals són presents, coherents i justificats; hi ha petites mancances en les variants o en l’anàlisi d’alguns referents. | Hi ha marca, paleta i tipografia utilitzables, però la recerca és superficial, falten alternatives o els criteris d’ús són incomplets. | Identitat improvisada o inconsistent; falten diversos elements obligatoris o no s’explica l’origen ni l’elecció dels recursos. |
| **1.2. Seccions, recorreguts i maquetació — 13%** | E2 cobreix totes les seccions, quatre recorreguts, nou pantalles d’escriptori, quatre variants mòbils i els sis estats; components coherents; revisió amb una altra persona incorporada. | Mapa i recorreguts complets; maquetes clares i adaptació mòbil coherent; alguna variant, estat o conclusió de la revisió necessita més detall. | Les pantalles principals estan definides, però hi ha recorreguts amb buits, poca adaptació mòbil o poca previsió d’errors i estats. | Falten seccions o recorreguts essencials; les maquetes no permeten entendre com s’utilitzarà l’aplicació. |
| **1.3. Entorn, fitxers i model de dades — 15%** | Carpetes reals ben separades, conjunt de prova complet, identificadors estables, relacions correctes i rutes relatives; configuració portable i E3 reproduïble. | Estructura i model correctes, amb contingut real suficient; hi ha petites omissions de documentació o variacions menors del conjunt de prova. | L’entorn funciona, però falten dades de prova, les relacions són fràgils o cal ajustar manualment rutes per executar-lo en una altra ubicació. | Es confonen codi, dades i contingut; el sistema depèn de rutes personals o no es poden relacionar els registres amb els fitxers. |
| **1.4. Implementació visual i adaptació — 10%** | E4 manté la identitat i la jerarquia de les maquetes, reutilitza components i resol bé 390, 768 i 1440 px; navegació semàntica i sense desbordaments. | Interfície coherent i adaptable a les tres amplades, amb totes les pantalles principals; petits problemes d’espaiat o consistència. | Interfície usable sobretot en una amplada; desviacions importants de la maqueta, components duplicats o algun problema de llegibilitat. | Maquetació incompleta, navegació confusa o problemes d’adaptació que impedeixen utilitzar seccions obligatòries. |
| **1.5. API i catàleg real — 15%** | Les cinc biblioteques consulten l’API; el catàleg reflecteix el disc; temporades, episodis, estadístiques i exploració funcionen, preservant metadades i detectant absències; contracte documentat. | Consulta real i agrupació correctes; exploració i estadístiques funcionals; petites mancances de documentació o tractament d’algun error. | L’API consulta contingut real però falta alguna categoria o l’exploració, les absències o les estadístiques són incompletes. | Predominen dades fixes o simulades; no es pot demostrar una relació fiable entre la web, l’API i el disc. |
| **1.6. Gestió i persistència — 15%** | Càrrega simple i múltiple, edició i eliminació coherents; validació al servidor, duplicats controlats, rutes confinades i errors clars; catàleg, marques i preferències sobreviuen al reinici. | Totes les operacions principals i la persistència funcionen; algun cas secundari de lot, error o neteja de recursos necessita millora, sense pèrdua silenciosa de dades. | Només part de la gestió funciona o algunes dades es perden en reiniciar; validacions o confirmacions incompletes. | Operacions simulades, canvis només al navegador, pèrdua habitual de dades o modificacions de fitxers sense control adequat. |
| **1.7. Consum i experiència d’ús — 12%** | Vídeo amb tots els controls, PDF i galeria funcionals; cerca i filtres combinables; favorits i vistos correctes; preferències aplicades; recorreguts complets amb teclat i estats que permeten recuperar-se d’errors. | Consum de contingut i tasques principals resolts; petites friccions de navegació, focus o missatges sense impedir completar-les. | Es pot consultar i consumir part del contingut, però falten controls, filtres, marques o recuperació d’errors; cal ajuda puntual de l’autor. | Els recorreguts principals no es poden completar o la reproducció, la consulta i els controls fallen de manera generalitzada. |
| **1.8. Verificació, documentació i defensa — 8%** | T01–T24 documentades amb evidència i incidències resoltes o delimitades; instal·lació en còpia nova, build local i canvi d’arrel comprovats; lliurament complet i defensa clara de les decisions. | Proves principals i instruccions reproduïbles; preparació de la migració coherent; omissions menors d’evidències o documentació. | Proves parcials i README que requereix ajuda; limitacions poc detallades o defensa amb dificultats per explicar algunes parts. | No es pot reproduir el projecte amb el lliurament; gairebé no hi ha proves o manca comprensió de l’arquitectura i del treball presentat. |
| **Total — 100%** | | | | |

### 14.2. Càlcul de la nota

S’assigna a cada criteri el nivell que descriu millor les evidències presentades: 4, 3, 2 o 1. Un criteri no lliurat o sense evidència avaluable rep **nivell 0**.

**Punts del criteri = pes × nivell / 4.**  
**Nota final sobre 10 = suma dels punts / 10.**

Exemple: nivell 3 en un criteri del 12% aporta `12 × 3 / 4 = 9` punts sobre 100. Obtenir nivell 3 a totes les files equival a un 7,5 sobre 10.

### 14.3. Aplicació dels criteris

- Els lliuraments E1–E8 permeten seguir el procés; no s’afegeixen percentatges ocults per presentació o per impressions generals.
- La tria d’Affinity o Figma no altera la puntuació. Es valoren la qualitat visual, la definició de les seccions i la comprensió dels recorreguts.
- Una maqueta sense API ni fitxers reals pot demostrar assoliments de disseny i maquetació, però no acredita la consulta del disc, les operacions de gestió ni la persistència.
- L’aspecte visual no compensa funcionalitats absents; una aplicació funcional tampoc substitueix el treball artístic i de planificació.
- Una mateixa mancança no comporta una penalització addicional fora de la rúbrica. Cada fila es valora segons les evidències que li corresponen.
- Les ampliacions poden enriquir les evidències d’un criteri, però no substitueixen els mínims obligatoris ni eleven la nota per sobre de 10.
- Per considerar **completada funcionalment la primera fase**, cal demostrar RF01–RF18 i el recorregut complet amb fitxers reals, incloent càrrega, reinici, consulta i eliminació. La nota dels treballs incomplets continua calculant-se amb la mateixa rúbrica.
