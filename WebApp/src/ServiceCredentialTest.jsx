import React, { useEffect, useRef, useState } from "react";
import { testServiceCredentials } from "./api/raspberryApi";

const strings = {
  es: ["Probar credenciales", "Comprobando…", "El servicio responde correctamente.", "No se pudo validar el servicio. Revisa las credenciales, la conexión y la cuota del servicio.", "Prueba los valores actuales sin guardarlos."],
  ca: ["Prova les credencials", "Comprovant…", "El servei respon correctament.", "No s'ha pogut validar el servei. Revisa les credencials, la connexió i la quota del servei.", "Prova els valors actuals sense desar-los."],
  en: ["Test credentials", "Testing…", "The service responded successfully.", "Could not validate the service. Check credentials, connectivity and service quota.", "Tests the current values without saving them."],
};
export default function ServiceCredentialTest({ provider, credentials, configured, disabled, language }) {
  const s = strings[language] || strings.es;
  const [state, setState] = useState("");
  const version = JSON.stringify(credentials);
  const current = useRef(version);
  current.current = version;
  const pending = useRef(false);
  useEffect(() => { setState(""); }, [version]);
  async function test() {
    if (pending.current) return;
    pending.current = true;
    setState("busy");
    try {
      await testServiceCredentials(provider, credentials);
      if (current.current === version) setState("ok");
    } catch {
      if (current.current === version) setState("error");
    } finally { pending.current = false; }
  }
  if (!configured) return null;
  return <div className="service-credential-test">
    <button type="button" className="dialog-button" title={s[4]} disabled={disabled || state === "busy"} onClick={test}>{state === "busy" ? s[1] : s[0]}</button>
    {state === "ok" && <p role="status">{s[2]}</p>}
    {state === "error" && <p className="dialog-error" role="alert">{s[3]}</p>}
  </div>;
}
