# Pràctica — Fase 1: proposta gràfica d’una biblioteca multimèdia web

## 1. L’encàrrec

Heu de dissenyar la proposta gràfica d’una web que permeti consultar i gestionar una biblioteca multimèdia. La web tindrà una identitat visual pròpia i s’organitzarà en cinc categories: **Sèries, Pel·lícules, Jocs, Llibres i Fotos**.

El primer pas per entrar a la web serà introduir un codi d’accés. Una vegada validat, la persona usuària podrà seleccionar la categoria que vol consultar.

En aquesta primera fase treballareu el **disseny visual, l’organització de la informació i els recorreguts de navegació**. Desenvolupareu en detall les seccions de **sèries i pel·lícules**, prenent com a referència el funcionament actual de MiniTV. Les categories de jocs, llibres i fotos han d’aparèixer en la navegació i tenir una pantalla provisional que indiqui que es desenvoluparan més endavant.

El lliurament d’aquesta fase serà una maqueta o un prototip navegable. La validació real del codi, la connexió amb serveis de dades, la gestió de fitxers i la reproducció real es programaran en fases posteriors. Ara n’heu de representar les pantalles, les accions i els estats.

## 2. Accés amb codi i selecció de categoria

### Pantalla d’accés

La primera pantalla ha d’incloure:

- Nom i logotip de la web.
- Una composició gràfica coherent amb la identitat del projecte.
- Una breu instrucció per accedir-hi.
- Camp per introduir un **PIN numèric de quatre dígits**, seguint el model actual.
- Opció per mostrar o ocultar el codi.
- Botó **Entrar**.
- Estat de validació en curs.
- Missatge comprensible quan el codi sigui incomplet, incorrecte o no es pugui validar.

Representeu el recorregut d’accés correcte i un intent amb error. El catàleg s’ha de mostrar després de l’accés correcte.

### Selecció de categoria

Després d’entrar, s’han de poder identificar i seleccionar les cinc categories. Podeu presentar-les amb targetes, botons o pestanyes, sempre amb text i una identificació visual coherent.

La navegació ha d’indicar la categoria activa i permetre canviar de secció. Cada pantalla interior ha de tenir una manera clara de tornar al nivell anterior.

```text
Accés amb codi
└── Selecció de categoria
    ├── Sèries → Catàleg → Sèrie → Temporada → Fitxa d’episodi
    ├── Pel·lícules → Catàleg → Fitxa de pel·lícula
    ├── Jocs → Pantalla provisional
    ├── Llibres → Pantalla provisional
    └── Fotos → Pantalla provisional
```

## 3. Consulta dels catàlegs

Entrar a **Sèries** o a **Pel·lícules** ha de portar primer al catàleg de la categoria. Des del catàleg s’escull el títol que es vol consultar, tal com funciona la web de referència.

Cal diferenciar dues decisions de la interfície: **la vista** determina com es presenten els elements; **l’ordenació** determina en quin ordre apareixen.

| Funció actual que heu de representar | Sèries | Pel·lícules |
|---|---|---|
| Vista de mosaic | Targetes distribuïdes en una graella, amb protagonisme de la portada | Targetes distribuïdes en una graella, amb protagonisme de la portada |
| Vista de llista | Files amb imatge, informació i accés al detall | Files amb imatge, informació i accions |
| Ordenació per nom | Ordre alfabètic | Ordre alfabètic |
| Ordenació per puntuació | De més a menys puntuació | De més a menys puntuació |
| Ordenació per any | No forma part del selector actual | De més recent a més antiga |
| Cerca | Per nom | Per nom |
| Filtre de favorits | Mostrar només les sèries favorites | Mostrar només les pel·lícules favorites |
| Filtre per gènere | No forma part del filtre actual | Permet seleccionar diversos gèneres; mostra les pel·lícules que coincideixen amb qualsevol dels seleccionats |
| Neteja de filtres | Restablir la cerca i els filtres | Restablir la cerca i els filtres |
| Indicadors | Filtres actius i quantitat de resultats respecte del total | Filtres actius i quantitat de resultats respecte del total |
| Selector de títols | Accés directe a una sèrie des del desplegable | Accés directe a una pel·lícula des del desplegable |

Els controls de mosaic i llista han de mostrar quina vista està activa. Canviar de vista ha de conservar la cerca, els filtres i el criteri d’ordenació.

## 4. Secció de sèries

### 4.1. Targeta de sèrie al catàleg

Cada sèrie ha de mostrar, tant en mosaic com en llista:

- Portada.
- Nom de la sèrie.
- Any de la primera emissió.
- Puntuació sobre 5, o un missatge si no està disponible.
- Accés a la fitxa mitjançant la portada i l’acció **Veure detalls**.

### 4.2. Fitxa de sèrie i selecció de temporada

La pantalla ha de permetre identificar la sèrie i escollir una temporada. Ha d’incloure:

- Identificació de la sèrie i imatge de capçalera.
- Nombre de temporades i nombre total d’episodis.
- Acció per afegir o treure la sèrie dels favorits.
- Accés a la personalització de la sèrie.
- Retorn al catàleg de sèries.
- Graella de temporades.

Cada **targeta de temporada** ha de mostrar la portada, el nom o número de temporada i el nombre d’episodis. També cal representar la diferència visual entre temporades amb contingut disponible i temporades sense episodis carregats, així com l’acció d’eliminar una temporada amb confirmació.

La fitxa general actual se centra en la capçalera i les temporades. La sinopsi detallada es consulta a la fitxa de cada episodi. Una sinopsi general de la sèrie es pot proposar com a ampliació del disseny.

### 4.3. Pantalla de temporada

En seleccionar una temporada, s’ha de mostrar:

- Imatge de capçalera.
- Nom de la sèrie i nom o número de temporada.
- Nombre d’episodis i durada acumulada quan hi hagi dades.
- Retorn a la sèrie.
- Accions per marcar tots els episodis com a vistos o no vistos, amb confirmació.
- Acció d’eliminar la temporada, amb confirmació.
- Llista d’episodis en ordre numèric.

Cada **fila d’episodi** ha de contenir una miniatura, el número, el títol, la data d’emissió i un accés recognoscible al detall. Cal distingir visualment els episodis disponibles dels que encara no tenen fitxer carregat.

### 4.4. Fitxa d’episodi

En seleccionar un episodi s’ha d’obrir una finestra de detall, com a la web actual, amb aquesta informació:

| Informació | Contingut |
|---|---|
| Context | Nom de la sèrie i temporada |
| Identificació | Número i títol de l’episodi |
| Imatge | Fotograma o miniatura de l’episodi |
| Durada | Minuts de durada, si es coneixen |
| Emissió | Data d’emissió |
| Puntuació | Valoració de l’episodi; la fitxa actual utilitza el valor sobre 10 |
| Sinopsi | Resum de l’episodi |
| Estat | Vist o no vist; disponibilitat del fitxer |

La finestra ha d’incloure tancament i accions per marcar vist/no vist, reproduir a MiniTV, reproduir al navegador, reproduir en un monitor extern, descarregar el fitxer i eliminar l’episodi amb confirmació. Si no hi ha fitxer, cal indicar-ho i mostrar la reproducció desactivada; la descàrrega i l’eliminació del fitxer només apareixen quan correspon.

## 5. Secció de pel·lícules

### 5.1. Targeta de pel·lícula al catàleg

Cada pel·lícula ha de mostrar, tant en mosaic com en llista:

- Portada que permeti obrir la fitxa.
- Títol.
- Any d’estrena.
- Puntuació sobre 5, o un missatge si no està disponible.
- Acció per afegir o treure dels favorits, amb el diàleg de confirmació que utilitza la web actual.
- Acció de descàrrega, disponible quan hi ha un fitxer associat.
- Acció d’eliminar, amb confirmació.

### 5.2. Fitxa de pel·lícula

En seleccionar una pel·lícula s’ha d’obrir una pantalla de detall amb:

| Informació | Contingut |
|---|---|
| Identificació | Títol i títol original quan sigui diferent |
| Imatges | Imatge de capçalera i carrusel d’imatges amb controls de navegació |
| Estrena | Data d’estrena |
| Durada | Durada de la pel·lícula |
| Puntuació | Valor numèric sobre 5 i representació amb estrelles |
| Gèneres | Un o diversos gèneres |
| Sinopsi | Resum de l’argument |
| Enllaços externs | IMDb i Rotten Tomatoes, quan estiguin disponibles |
| Marques personals | Favorita/no favorita i vista/no vista |

La fitxa ha de permetre tornar al catàleg, personalitzar la pel·lícula, reproduir-la a MiniTV, al navegador o en un monitor extern, descarregar-la i eliminar-la amb confirmació.

## 6. Gestió i estats que també heu de preveure

La proposta ha de reservar un accés clar a les accions de gestió que ja existeixen per a sèries i pel·lícules. En aquesta fase n’heu de dibuixar el funcionament:

| Acció | Què ha de mostrar la proposta |
|---|---|
| Afegir contingut | Selecció d’un fitxer de pel·lícula o d’una carpeta d’episodis; cerca del títol a TMDB; resultats amb portada, títol, any, títol original i resum; selecció del resultat i confirmació |
| Revisar la càrrega | Errors de format, gestió d’episodis duplicats, progrés de càrrega, cancel·lació i resultat final; les variants es poden representar amb anotacions |
| Personalitzar | Edició del nom, selecció de la imatge de capçalera, ajust de l’enquadrament vertical i previsualització; en pel·lícules, també edició dels enllaços d’IMDb i Rotten Tomatoes |
| Desar o cancel·lar | Accions clarament diferenciades al formulari de personalització |
| Eliminar | Confirmació que identifiqui la pel·lícula, sèrie, temporada o episodi afectat; opcions de cancel·lar i confirmar |
| Reproduir al navegador | Finestra de vídeo amb controls de reproducció i tancament |
| Accedir a MiniTV | Ubicació de l’accés al dispositiu, present a les pantalles actuals; el panell del dispositiu es desenvoluparà en una altra fase |

Prepareu variants visuals per als estats següents: càrrega de dades, catàleg buit, cerca sense resultats, imatge absent, dada desconeguda, error amb opció de tornar-ho a provar, contingut no disponible i confirmació d’una acció.

Les dades desconegudes s’han d’indicar amb un text comprensible. La maqueta ha d’utilitzar contingut d’exemple suficient per comprovar la llegibilitat dels títols, la utilitat del mosaic i la llista, i la navegació entre temporades i episodis.

## 7. Proposta gràfica i lliurament

Definiu una identitat coherent: nom, logotip, paleta de colors, tipografia, estil d’icones, botons, camps de formulari i targetes. Justifiqueu breument les decisions i apliqueu-les a totes les pantalles.

Lliureu:

1. **Una breu guia visual** amb els elements de la identitat i els components principals.
2. **Un mapa de navegació** que comenci per l’accés amb codi i inclogui les cinc categories.
3. **Maquetes d’escriptori** de l’accés, la selecció de categories, el catàleg de sèries en mosaic i llista, la fitxa de sèrie, la temporada, la finestra d’episodi, el catàleg de pel·lícules en mosaic i llista i la fitxa de pel·lícula.
4. **Les variants de gestió i d’estat** descrites a l’apartat anterior. Podeu reutilitzar components i anotar els comportaments compartits.
5. **Adaptacions a mòbil** de l’accés, la selecció de categories i els dos recorreguts de consulta complets. Mostreu com s’adapten el mosaic, la llista i els controls.
6. **Un prototip o un guió visual** que permeti seguir els dos recorreguts: codi → sèries → sèrie → temporada → episodi, i codi → pel·lícules → pel·lícula.
7. **El fitxer editable i una exportació PDF**. Podeu treballar amb Figma, Affinity o l’eina de disseny acordada a classe. Si l’eina no permet connectar pantalles, utilitzeu numeració, fletxes i anotacions.

Es valoraran la coherència gràfica, la jerarquia de la informació, la claredat de la navegació, la llegibilitat, l’adaptació a mòbil i la presència de totes les funcions i dades demanades. Les icones i els colors han d’anar acompanyats de recursos que permetin entendre les accions i els estats.

**La fase estarà completada quan una altra persona pugui seguir els recorreguts i entendre què passa en cada pantalla sense necessitar una explicació oral de l’autor.**

---

**Nota per al professorat:** aquest enunciat concreta una primera fase de proposta gràfica. El document `enunciat-practica-minitv-fase-1.md` recull una proposta més extensa de desenvolupament local i es conserva com a material de planificació. L’inventari funcional d’aquest enunciat s’ha contrastat amb `WebApp/src/App.jsx` i `WebApp/src/tmdbApi.js`. Els camps, els filtres i les escales de puntuació descrits corresponen a la interfície actual; les ampliacions s’identifiquen explícitament.
