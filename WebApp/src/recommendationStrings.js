const strings = {
  es: {
    tasteLimit: "Máximo 12 entradas por categoría y 100 caracteres por entrada.", aiReason: "Por qué podría gustarte · IA",
    warningUnverified: "Se han omitido títulos que TMDB no ha podido identificar con seguridad.", warningLookup: "No se han podido comprobar algunos títulos en TMDB.", warningWatched: "Se han omitido títulos que ya has visto.", warningIgnoredTaste: "No se han guardado como gustos permanentes las preferencias ambiguas o solo para esta ocasión.", warningTasteLimit: "Has alcanzado el límite de 12 gustos por categoría; puedes editarlos.",
    searchMode: "Buscar", recommendMode: "Recomiéndame", mode: "Qué quieres hacer", profile: "Recomendaciones para", loading: "Cargando tus gustos…", retry: "Reintentar",
    intro: "¿Qué géneros, actores o directores te gustan? Cuéntame también algún título que te haya gustado y lo que prefieres evitar.",
    privacy: "Tus gustos se guardan para este usuario. Para recomendar se envían a OpenAI tus gustos, la conversación reciente y fichas resumidas con tus marcas de visto y favorito; no se envían archivos multimedia.",
    prompt: "Cuéntame qué te apetece ver", placeholder: "Me gustan las comedias de aventuras y Tom Hanks. ¿Qué me recomiendas?", send: "Enviar", waiting: "Preparando recomendaciones…", cancel: "Cancelar", cancelled: "Espera cancelada. La consulta puede seguir procesándose.",
    tastes: "Tus gustos guardados", noTastes: "Todavía no hay gustos guardados para este usuario.", edit: "Editar gustos", removeTaste: "Quitar", save: "Guardar gustos", cancelEdit: "Cancelar edición", newline: "Un nombre o título por línea.", saved: "Gustos actualizados.",
    genres: "Géneros favoritos", actors: "Actores y actrices", directors: "Directores", likedTitles: "Títulos que te gustan", dislikedGenres: "Géneros que prefieres evitar", dislikedTitles: "Títulos que no te gustan",
    forget: "Olvidar gustos y conversación", forgetNote: "Borra los gustos y las conversaciones de películas y series de este usuario.", forgotten: "Se han borrado los gustos y las conversaciones de este usuario.",
    history: "Conversación", you: "Tú", assistant: "Recomendador", question: "Para afinar la recomendación", recommendations: "Para ti", available: "En tu biblioteca", missing: "No está en tu biblioteca", open: "Ver en mi biblioteca", torrent: "Buscar torrent", missingLocal: "La ficha ya no está en la biblioteca. Actualiza el catálogo.",
    noAutomaticDownload: "Buscar torrent abre la búsqueda del título; tú eliges qué descargar.", warning: "Algunos títulos no se han podido comprobar. Las recomendaciones pueden estar incompletas.",
    conflict: "Los gustos han cambiado en otra consulta. Se han recargado; revisa los cambios y vuelve a intentarlo.", missingProfile: "Este usuario ya no está disponible. Selecciona otro perfil.", memoryError: "No se han podido cargar o guardar tus gustos. Puedes reintentarlo.", noResults: "No hay títulos confirmados en esta respuesta. Prueba a contarme algo más sobre tus gustos.",
    examples: ["Me gustan la ciencia ficción y las historias de viajes en el tiempo", "Prefiero comedias y quiero evitar el terror", "Hazme preguntas para conocer mis gustos"],
  },
  ca: {
    tasteLimit: "Màxim 12 entrades per categoria i 100 caràcters per entrada.", aiReason: "Per què et podria agradar · IA",
    warningUnverified: "S’han omès títols que TMDB no ha pogut identificar amb seguretat.", warningLookup: "No s’han pogut comprovar alguns títols a TMDB.", warningWatched: "S’han omès títols que ja has vist.", warningIgnoredTaste: "No s’han desat com a gustos permanents les preferències ambigües o només per a aquesta ocasió.", warningTasteLimit: "Has arribat al límit de 12 gustos per categoria; els pots editar.",
    searchMode: "Cerca", recommendMode: "Recomana’m", mode: "Què vols fer", profile: "Recomanacions per a", loading: "Carregant els teus gustos…", retry: "Torna-ho a provar",
    intro: "Quins gèneres, actors o directors t’agraden? Explica’m també algun títol que t’hagi agradat i què prefereixes evitar.",
    privacy: "Els teus gustos es desen per a aquest usuari. Per recomanar s’envien a OpenAI els teus gustos, la conversa recent i fitxes resumides amb les teves marques de vist i preferit; no s’envien fitxers multimèdia.",
    prompt: "Explica’m què et ve de gust veure", placeholder: "M’agraden les comèdies d’aventures i Tom Hanks. Què em recomanes?", send: "Envia", waiting: "Preparant recomanacions…", cancel: "Cancel·la", cancelled: "Espera cancel·lada. La consulta es pot continuar processant.",
    tastes: "Els teus gustos desats", noTastes: "Encara no hi ha gustos desats per a aquest usuari.", edit: "Edita els gustos", removeTaste: "Treu", save: "Desa els gustos", cancelEdit: "Cancel·la l’edició", newline: "Un nom o títol per línia.", saved: "Gustos actualitzats.",
    genres: "Gèneres preferits", actors: "Actors i actrius", directors: "Directors", likedTitles: "Títols que t’agraden", dislikedGenres: "Gèneres que prefereixes evitar", dislikedTitles: "Títols que no t’agraden",
    forget: "Oblida els gustos i la conversa", forgetNote: "Esborra els gustos i les converses de pel·lícules i sèries d’aquest usuari.", forgotten: "S’han esborrat els gustos i les converses d’aquest usuari.",
    history: "Conversa", you: "Tu", assistant: "Recomanador", question: "Per afinar la recomanació", recommendations: "Per a tu", available: "A la biblioteca", missing: "No és a la teva biblioteca", open: "Veure a la meva biblioteca", torrent: "Cerca torrent", missingLocal: "La fitxa ja no és a la biblioteca. Actualitza el catàleg.",
    noAutomaticDownload: "Cerca torrent obre la cerca del títol; tu tries què vols descarregar.", warning: "No s’han pogut comprovar alguns títols. Les recomanacions poden ser incompletes.",
    conflict: "Els gustos han canviat en una altra consulta. S’han recarregat; revisa els canvis i torna-ho a provar.", missingProfile: "Aquest usuari ja no està disponible. Selecciona un altre perfil.", memoryError: "No s’han pogut carregar o desar els teus gustos. Pots tornar-ho a provar.", noResults: "No hi ha títols confirmats en aquesta resposta. Prova d’explicar-me més coses sobre els teus gustos.",
    examples: ["M’agraden la ciència-ficció i les històries de viatges en el temps", "Prefereixo comèdies i vull evitar el terror", "Fes-me preguntes per conèixer els meus gustos"],
  },
  en: {
    tasteLimit: "Up to 12 entries per category and 100 characters per entry.", aiReason: "Why you might enjoy it · AI",
    warningUnverified: "Titles that TMDB could not identify reliably have been omitted.", warningLookup: "Some titles could not be checked in TMDB.", warningWatched: "Titles you have already watched have been omitted.", warningIgnoredTaste: "Ambiguous or one-time preferences were not saved as permanent tastes.", warningTasteLimit: "You have reached the limit of 12 tastes per category; you can edit them.",
    searchMode: "Search", recommendMode: "Recommend for me", mode: "What would you like to do", profile: "Recommendations for", loading: "Loading your tastes…", retry: "Retry",
    intro: "Which genres, actors or directors do you enjoy? Tell me about a title you liked and anything you would prefer to avoid.",
    privacy: "Your tastes are saved for this user. Recommendations send your tastes, recent conversation and brief title information with your watched and favorite marks to OpenAI; media files are not sent.",
    prompt: "Tell me what you feel like watching", placeholder: "I enjoy adventure comedies and Tom Hanks. What would you recommend?", send: "Send", waiting: "Preparing recommendations…", cancel: "Cancel", cancelled: "Stopped waiting. The request may still be processing.",
    tastes: "Your saved tastes", noTastes: "No tastes saved for this user yet.", edit: "Edit tastes", removeTaste: "Remove", save: "Save tastes", cancelEdit: "Cancel editing", newline: "One name or title per line.", saved: "Tastes updated.",
    genres: "Favorite genres", actors: "Actors", directors: "Directors", likedTitles: "Titles you like", dislikedGenres: "Genres to avoid", dislikedTitles: "Titles you dislike",
    forget: "Forget tastes and conversation", forgetNote: "Deletes this user’s movie and series tastes and conversations.", forgotten: "This user’s tastes and conversations have been deleted.",
    history: "Conversation", you: "You", assistant: "Recommender", question: "To refine your recommendations", recommendations: "For you", available: "In your library", missing: "Not in your library", open: "View in my library", torrent: "Search torrents", missingLocal: "This title is no longer in your library. Refresh the catalog.",
    noAutomaticDownload: "Search torrents opens a title search; you choose what to download.", warning: "Some titles could not be checked. Recommendations may be incomplete.",
    conflict: "Your tastes changed in another request and have been reloaded. Review the changes and try again.", missingProfile: "This user is no longer available. Select another profile.", memoryError: "Your tastes could not be loaded or saved. Please try again.", noResults: "This response has no confirmed titles. Try telling me more about your tastes.",
    examples: ["I like science fiction and time travel stories", "I prefer comedies and want to avoid horror", "Ask me questions to learn my tastes"],
  },
};

export function recommendationStrings(language) {
  const key = String(language || "es").toLowerCase().split(/[-_]/)[0];
  return strings[key === "cat" ? "ca" : key] || strings.es;
}

export function recommendationWarning(code, language) {
  const key = { AI_RECOMMENDATION_UNVERIFIED: "warningUnverified", AI_RECOMMENDATION_LOOKUP_FAILED: "warningLookup",
    AI_RECOMMENDATION_ALREADY_WATCHED: "warningWatched", AI_PREFERENCE_UPDATE_IGNORED: "warningIgnoredTaste", AI_PREFERENCE_LIMIT: "warningTasteLimit" }[code];
  const s = recommendationStrings(language);
  return s[key || "warning"];
}
