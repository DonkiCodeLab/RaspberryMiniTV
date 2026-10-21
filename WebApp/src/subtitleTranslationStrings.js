import { normalizeLanguage } from "./i18n/languages.js";
import { withLanguages } from "./i18n/index.js";
const strings = withLanguages({
  es: {
    translate: "Traducir subtítulo con la IA", translateSource: "Subtítulo de origen", translating: "Traduciendo subtítulo con OpenAI…", translatedCues: "Líneas traducidas", translateWaiting: "Esperando el límite de consultas de IA…",
    translationHint: "Se enviará el texto del subtítulo a OpenAI y se guardará una nueva pista en el idioma seleccionado. Se usará la cuenta y el modelo configurados en el dashboard.",
    translationNoSource: "Puedes descargar un subtítulo en otro idioma y volver a elegir este idioma para traducirlo con IA.",
    translationSaved: "Traducción generada por IA. Se han conservado los tiempos del original; puede contener errores de traducción.",
    SUBTITLE_TRANSLATION_FAILED: "No se pudo completar la traducción. No se ha guardado un fichero incompleto.", SUBTITLE_TRANSLATION_INVALID: "La traducción estaba incompleta o no era válida. No se ha guardado; puedes reintentarlo.", SUBTITLE_TRANSLATION_NOT_FOUND: "La tarea ya no está disponible. Comprueba si se ha guardado la pista antes de reintentar.",
    AI_DISABLED: "Activa la IA en los ajustes de OpenAI del dashboard.", AI_NOT_CONFIGURED: "Configura la clave de OpenAI en el dashboard para traducir subtítulos.", AI_AUTH_ERROR: "OpenAI rechazó la clave configurada. Revísala en el dashboard.", AI_UPSTREAM_RATE_LIMIT: "OpenAI ha alcanzado su límite de uso. Revisa la cuota o inténtalo más tarde.", AI_TIMEOUT: "OpenAI tardó demasiado. Puedes reintentar la traducción.", AI_MODEL_ERROR: "El modelo configurado no pudo completar la traducción. Revísalo en los ajustes de OpenAI.",
  },
  ca: {
    translate: "Traduir subtítol amb la IA", translateSource: "Subtítol d’origen", translating: "Traduint subtítol amb OpenAI…", translatedCues: "Línies traduïdes", translateWaiting: "Esperant el límit de consultes d’IA…",
    translationHint: "S’enviarà el text del subtítol a OpenAI i es desarà una pista nova en l’idioma seleccionat. S’utilitzarà el compte i el model configurats al dashboard.", translationNoSource: "Pots descarregar un subtítol en un altre idioma i tornar a triar aquest idioma per traduir-lo amb IA.",
    translationSaved: "Traducció generada per IA. S’han conservat els temps originals; pot contenir errors de traducció.",
    SUBTITLE_TRANSLATION_FAILED: "No s’ha pogut completar la traducció. No s’ha desat un fitxer incomplet.", SUBTITLE_TRANSLATION_INVALID: "La traducció era incompleta o no era vàlida. No s’ha desat; torna-ho a provar.", SUBTITLE_TRANSLATION_NOT_FOUND: "La tasca ja no està disponible. Comprova si s’ha desat la pista abans de tornar-ho a provar.",
    AI_DISABLED: "Activa la IA als ajustos d’OpenAI del dashboard.", AI_NOT_CONFIGURED: "Configura la clau d’OpenAI al dashboard per traduir subtítols.", AI_AUTH_ERROR: "OpenAI ha rebutjat la clau configurada. Revisa-la al dashboard.", AI_UPSTREAM_RATE_LIMIT: "OpenAI ha arribat al límit d’ús. Revisa la quota o torna-ho a provar més tard.", AI_TIMEOUT: "OpenAI ha trigat massa. Torna a provar la traducció.", AI_MODEL_ERROR: "El model configurat no ha pogut completar la traducció. Revisa’l als ajustos d’OpenAI.",
  },
  en: {
    translate: "Translate subtitle with AI", translateSource: "Source subtitle", translating: "Translating subtitle with OpenAI…", translatedCues: "Translated cues", translateWaiting: "Waiting for the AI request limit…",
    translationHint: "The subtitle text will be sent to OpenAI and saved as a new track in the selected language, using the account and model configured in the dashboard.", translationNoSource: "Download a subtitle in another language, then select this language again to translate it with AI.",
    translationSaved: "AI-generated translation. Original timings were preserved; the translation may contain errors.",
    SUBTITLE_TRANSLATION_FAILED: "Could not complete the translation. No incomplete file was saved.", SUBTITLE_TRANSLATION_INVALID: "The translation was incomplete or invalid. It was not saved; please retry.", SUBTITLE_TRANSLATION_NOT_FOUND: "This task is no longer available. Check whether the track was saved before retrying.",
    AI_DISABLED: "Enable AI in the dashboard’s OpenAI settings.", AI_NOT_CONFIGURED: "Configure an OpenAI key in the dashboard to translate subtitles.", AI_AUTH_ERROR: "OpenAI rejected the configured key. Review it in the dashboard.", AI_UPSTREAM_RATE_LIMIT: "OpenAI reached its usage limit. Check your quota or try again later.", AI_TIMEOUT: "OpenAI took too long. You can retry the translation.", AI_MODEL_ERROR: "The configured model could not complete the translation. Review it in OpenAI settings.",
  },
});
export function subtitleTranslationStrings(language) { return strings[normalizeLanguage(language)] || strings.es; }
