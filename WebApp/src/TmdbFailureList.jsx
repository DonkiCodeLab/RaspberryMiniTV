import React from "react";

const labels = {
  es: {
    title: "Descargas con errores", help: "Descartar una imagen cancela sus reintentos y la excluye de las portadas y galerías, también al reiniciar. El resto del título se conserva.",
    movie: "Película", tv: "Serie", season: "Temporada", episode: "Episodio",
    poster: "Carátula / cartel", backdrop: "Imagen de fondo", still: "Imagen del episodio",
    logo: "Logo", profile: "Foto del reparto / equipo", selected: "Portada elegida", extra: "Imagen extra",
    unknown: "Imagen (tipo no disponible)", metadata: "Ficha / datos TMDB", variant: "extra",
    original: "Original", thumbnails: "Miniatura", technical: "Detalle técnico",
    discard: "Descartar imagen", discarding: "Descartando…",
  },
  ca: {
    title: "Descàrregues amb errors", help: "Descartar una imatge cancel·la els reintents i l’exclou de les portades i galeries, també en reiniciar. La resta del títol es conserva.",
    movie: "Pel·lícula", tv: "Sèrie", season: "Temporada", episode: "Episodi",
    poster: "Caràtula / cartell", backdrop: "Imatge de fons", still: "Imatge de l’episodi",
    logo: "Logo", profile: "Foto del repartiment / equip", selected: "Portada triada", extra: "Imatge extra",
    unknown: "Imatge (tipus no disponible)", metadata: "Fitxa / dades TMDB", variant: "extra",
    original: "Original", thumbnails: "Miniatura", technical: "Detall tècnic",
    discard: "Descartar imatge", discarding: "Descartant…",
  },
  en: {
    title: "Failed downloads", help: "Discarding an image stops retries and excludes it from covers and galleries, including after a restart. The rest of the title is kept.",
    movie: "Movie", tv: "Series", season: "Season", episode: "Episode",
    poster: "Cover / poster", backdrop: "Backdrop", still: "Episode image",
    logo: "Logo", profile: "Cast / crew portrait", selected: "Selected cover", extra: "Extra image",
    unknown: "Image (type unavailable)", metadata: "TMDB metadata", variant: "extra",
    original: "Original", thumbnails: "Thumbnail", technical: "Technical details",
    discard: "Discard image", discarding: "Discarding…",
  },
};

export function tmdbFailureKey(item) {
  return `${item.media}:${item.resource || "metadata"}:${item.path || ""}`;
}

export default function TmdbFailureList({ errors, language, busy = "", onDiscard }) {
  const t = labels[language] || labels.es;
  if (!errors?.length) return null;
  return <div className="tmdb-failures">
    <h4>{t.title} ({errors.length})</h4>
    <p className="tmdb-failures__help">{t.help}</p>
    <div className="tmdb-failures__scroll" role="region" aria-label={t.title} tabIndex={0}>
      <ul className="tmdb-failures__list">{errors.map(item => {
        const key = tmdbFailureKey(item);
        const usages = [...new Set((item.contexts || [{ type: "metadata" }]).map(context => [
          t[context.type] || t.unknown,
          context.extra && context.type !== "extra" ? `(${t.variant})` : "",
          context.season != null ? `${t.season} ${context.season}` : "",
          context.episode != null ? `${t.episode} ${context.episode}` : "",
          context.episodeName || context.personName || "",
        ].filter(Boolean).join(" · ")))];
        const stages = [...new Set((item.stages || []).map(stage => stage.phase === "images" ? t.original
          : stage.phase === "thumbnails" ? `${t.thumbnails}${stage.width ? ` ${stage.width} px` : ""}` : "").filter(Boolean))];
        return <li key={key} className="tmdb-failure">
          <div className="tmdb-failure__body">
            <span className="tmdb-failure__kind">{t[item.kind] || (item.media?.startsWith("tv/") ? t.tv : t.movie)}</span>
            <strong className="tmdb-failure__title">{item.title || item.media}</strong>
            {usages.map(usage => <span className="tmdb-failure__usage" key={usage}>{usage}</span>)}
            {stages.length > 0 && <span className="tmdb-failure__stages">{stages.join(" · ")}</span>}
            <p className="tmdb-failure__reason">{item.error}</p>
            {item.path && <details><summary>{t.technical}</summary><code>{item.media} · {item.path}</code></details>}
          </div>
          {item.resource === "image" && <button type="button" className="dialog-button tmdb-failure__discard"
            disabled={Boolean(busy)} onClick={() => onDiscard(item)}
            aria-label={`${t.discard}: ${item.title || item.media} · ${usages.join(", ")} · ${item.path}`}>
            {busy === key ? t.discarding : t.discard}
          </button>}
        </li>;
      })}</ul>
    </div>
  </div>;
}
