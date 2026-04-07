import { useEffect, useState } from "react";
import {
  getApiBaseUrl,
  getHealth,
  getVideos,
  playEpisode,
  volumeDown,
  volumeUp,
} from "./api/raspberryApi";

export default function App() {
  const [health, setHealth] = useState(null);
  const [videos, setVideos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [nextHealth, nextVideos] = await Promise.all([getHealth(), getVideos()]);
        if (cancelled) return;
        setHealth(nextHealth);
        setVideos(nextVideos);
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError.message || "No se pudo conectar con la Raspberry.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRefresh() {
    setLoading(true);
    setActionMessage("");
    try {
      const [nextHealth, nextVideos] = await Promise.all([getHealth(), getVideos()]);
      setHealth(nextHealth);
      setVideos(nextVideos);
      setError("");
    } catch (nextError) {
      setError(nextError.message || "No se pudo actualizar.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePlayFirstEpisode() {
    const firstDirectory = videos?.directories?.[0];
    const firstEpisode = firstDirectory?.videos?.[0];

    if (!firstEpisode) {
      setActionMessage("No hay episodios disponibles todavia.");
      return;
    }

    try {
      const result = await playEpisode({
        id: firstEpisode.id,
        directory: firstDirectory.relativePath,
      });
      setActionMessage(`Reproduciendo ${result.playing}`);
      await handleRefresh();
    } catch (nextError) {
      setActionMessage(nextError.message || "No se pudo reproducir el episodio.");
    }
  }

  async function handleVolume(changeFn, label) {
    try {
      await changeFn();
      setActionMessage(label);
    } catch (nextError) {
      setActionMessage(nextError.message || "No se pudo enviar la accion.");
    }
  }

  const directories = videos?.directories || [];
  const totalEpisodes = directories.reduce(
    (sum, directory) => sum + (directory.episodeCount || 0),
    0
  );

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">TvSimpsonsApp -> RaspberryPiWEB</p>
        <h1>Web local para controlar la Raspberry desde el movil</h1>
        <p className="lead">
          Esta base confirma la arquitectura nueva: el movil abre una web en la
          Raspberry, y la Raspberry expone API y persistencia sin depender de
          stores moviles.
        </p>

        <div className="status-grid">
          <article className="status-card">
            <span className="label">API base</span>
            <strong>{getApiBaseUrl()}</strong>
          </article>
          <article className="status-card">
            <span className="label">Estado</span>
            <strong>{health?.ok ? "Conectada" : loading ? "Cargando" : "Sin conexion"}</strong>
          </article>
          <article className="status-card">
            <span className="label">Reproduciendo</span>
            <strong>{health?.playing || "Nada ahora mismo"}</strong>
          </article>
          <article className="status-card">
            <span className="label">Episodios detectados</span>
            <strong>{totalEpisodes}</strong>
          </article>
        </div>

        <div className="actions">
          <button onClick={handleRefresh} disabled={loading}>
            Refrescar
          </button>
          <button onClick={handlePlayFirstEpisode} disabled={loading}>
            Probar reproduccion
          </button>
          <button onClick={() => handleVolume(volumeUp, "Volumen subido")} disabled={loading}>
            Vol +
          </button>
          <button onClick={() => handleVolume(volumeDown, "Volumen bajado")} disabled={loading}>
            Vol -
          </button>
        </div>

        {error ? <p className="message error">{error}</p> : null}
        {actionMessage ? <p className="message">{actionMessage}</p> : null}
      </section>

      <section className="content-grid">
        <article className="panel">
          <h2>Encaje tecnico</h2>
          <ul>
            <li>React sirve la interfaz en navegador.</li>
            <li>La Raspberry mantiene el control de reproduccion por HTTP.</li>
            <li>La persistencia deberia vivir en SQLite o JSON en la Raspberry.</li>
            <li>El QR solo necesita apuntar a IP y puerto locales.</li>
          </ul>
        </article>

        <article className="panel">
          <h2>Directorios de video</h2>
          {directories.length ? (
            <ul>
              {directories.slice(0, 6).map((directory) => (
                <li key={directory.relativePath}>
                  {directory.name} ({directory.episodeCount || 0} episodios)
                </li>
              ))}
            </ul>
          ) : (
            <p>No se han encontrado directorios todavia.</p>
          )}
        </article>

        <article className="panel panel-wide">
          <h2>Fases recomendadas de migracion</h2>
          <ol>
            <li>Migrar primero navegacion, temporadas y episodios a componentes web.</li>
            <li>Reutilizar los endpoints existentes `/health`, `/videos` y `/play`.</li>
            <li>Anadir nuevos endpoints persistentes en la Raspberry para favoritos, vistos o configuracion.</li>
            <li>Servir el build final desde la propia Raspberry para que todo viva en la misma URL.</li>
          </ol>
        </article>
      </section>
    </main>
  );
}

