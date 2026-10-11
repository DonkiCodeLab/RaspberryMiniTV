const es = {
  title: 'Codex del proyecto', hint: 'Pide cambios, consulta el código y revisa el resultado desde tu Raspberry.',
  isolated: 'Los cambios se guardan en la copia de desarrollo. La MiniTV en uso no se actualiza automáticamente.',
  loading: 'Conectando…', setup: 'Preparar la Raspberry', setupHint: 'Ejecuta esto desde la carpeta del proyecto en la Raspberry. El instalador crea una clave de administrador para esta sección.',
  refresh: 'Comprobar de nuevo', password: 'Clave de administrador de Codex', unlock: 'Desbloquear', lock: 'Bloquear panel',
  lockedHint: 'Usa la clave que muestra el instalador. Es distinta del PIN de la MiniTV.',
  connect: 'Conectar ChatGPT', disconnect: 'Desconectar ChatGPT', loginHint: 'Abre el enlace, inicia sesión e introduce este código:',
  loginOpen: 'Autorizar en OpenAI', loginDone: 'Cuenta vinculada.', loginFailed: 'No se ha podido vincular la cuenta. Inténtalo de nuevo.',
  account: 'Cuenta conectada', noAccount: 'Vincula tu cuenta para empezar. Se aplican los límites de tu plan de Codex.',
  history: 'Conversaciones', fresh: 'Nueva conversación', more: 'Ver anteriores', empty: 'Todavía no hay conversaciones.',
  placeholder: 'Por ejemplo: revisa cómo funciona el dashboard y propón una mejora.', prompt: 'Tu mensaje para Codex',
  send: 'Enviar', stop: 'Detener', working: 'Codex está trabajando…', waiting: 'Codex necesita tu respuesta', ready: 'Listo',
  you: 'Tú', command: 'Comando', files: 'Archivos modificados', plan: 'Plan', diff: 'Ver cambios de esta tarea',
  approve: 'Aprobar una vez', reject: 'Rechazar', question: 'Responde para continuar', answer: 'Enviar respuesta',
  permission: 'Aprobación requerida', detail: 'Ver detalles', demo: 'Codex no ejecuta tareas en el modo de demostración.',
  historyLimit: 'Se muestran las últimas 30 intervenciones. El historial completo se conserva en la Raspberry.',
  completed: 'Completada', failed: 'Fallida', interrupted: 'Detenida', inProgress: 'En curso',
  retry: 'Reintentar conexión', installDetail: 'Necesita un kernel Linux de 64 bits, Node.js 20 o superior e Internet. En Raspberry Pi OS de 32 bits prepara un entorno compatible sin reinstalar el sistema.',
};
const ca = {
  title: 'Codex del projecte', hint: 'Demana canvis, consulta el codi i revisa el resultat des de la Raspberry.',
  isolated: 'Els canvis es desen a la còpia de desenvolupament. La MiniTV en ús no s’actualitza automàticament.',
  loading: 'Connectant…', setup: 'Preparar la Raspberry', setupHint: 'Executa això des de la carpeta del projecte a la Raspberry. L’instal·lador crea una clau d’administrador per a aquesta secció.',
  refresh: 'Tornar a comprovar', password: 'Clau d’administrador de Codex', unlock: 'Desbloquejar', lock: 'Bloquejar el panell',
  lockedHint: 'Fes servir la clau que mostra l’instal·lador. És diferent del PIN de la MiniTV.',
  connect: 'Connectar ChatGPT', disconnect: 'Desconnectar ChatGPT', loginHint: 'Obre l’enllaç, inicia sessió i introdueix aquest codi:',
  loginOpen: 'Autoritzar a OpenAI', loginDone: 'Compte vinculat.', loginFailed: 'No s’ha pogut vincular el compte. Torna-ho a provar.',
  account: 'Compte connectat', noAccount: 'Vincula el teu compte per començar. S’apliquen els límits del teu pla de Codex.',
  history: 'Converses', fresh: 'Conversa nova', more: 'Veure anteriors', empty: 'Encara no hi ha converses.',
  placeholder: 'Per exemple: revisa com funciona el dashboard i proposa una millora.', prompt: 'El teu missatge per a Codex',
  send: 'Enviar', stop: 'Aturar', working: 'Codex està treballant…', waiting: 'Codex necessita la teva resposta', ready: 'A punt',
  you: 'Tu', command: 'Ordre', files: 'Fitxers modificats', plan: 'Pla', diff: 'Veure els canvis d’aquesta tasca',
  approve: 'Aprovar un cop', reject: 'Rebutjar', question: 'Respon per continuar', answer: 'Enviar resposta',
  permission: 'Cal aprovació', detail: 'Veure detalls', demo: 'Codex no executa tasques en el mode de demostració.',
  historyLimit: 'Es mostren les últimes 30 intervencions. L’historial complet es conserva a la Raspberry.',
  completed: 'Completada', failed: 'Fallida', interrupted: 'Aturada', inProgress: 'En curs',
  retry: 'Tornar a connectar', installDetail: 'Necessita un kernel Linux de 64 bits, Node.js 20 o superior i Internet. Amb Raspberry Pi OS de 32 bits prepara un entorn compatible sense reinstal·lar el sistema.',
};
const en = {
  title: 'Project Codex', hint: 'Request changes, explore the code and review results on your Raspberry.',
  isolated: 'Changes stay in the development copy. The running MiniTV is not updated automatically.',
  loading: 'Connecting…', setup: 'Set up the Raspberry', setupHint: 'Run this from the project folder on your Raspberry. The installer creates a separate administrator key for this section.',
  refresh: 'Check again', password: 'Codex administrator key', unlock: 'Unlock', lock: 'Lock panel',
  lockedHint: 'Use the key printed by the installer. It is separate from the MiniTV PIN.',
  connect: 'Connect ChatGPT', disconnect: 'Disconnect ChatGPT', loginHint: 'Open the link, sign in and enter this code:',
  loginOpen: 'Authorize with OpenAI', loginDone: 'Account linked.', loginFailed: 'Could not link your account. Please try again.',
  account: 'Account connected', noAccount: 'Link your account to get started. Your Codex plan limits apply.',
  history: 'Conversations', fresh: 'New conversation', more: 'Load older', empty: 'No conversations yet.',
  placeholder: 'For example: review how the dashboard works and suggest an improvement.', prompt: 'Your message to Codex',
  send: 'Send', stop: 'Stop', working: 'Codex is working…', waiting: 'Codex needs your response', ready: 'Ready',
  you: 'You', command: 'Command', files: 'Changed files', plan: 'Plan', diff: 'View changes for this task',
  approve: 'Approve once', reject: 'Decline', question: 'Reply to continue', answer: 'Send answer',
  permission: 'Approval required', detail: 'View details', demo: 'Codex does not run tasks in demo mode.',
  historyLimit: 'Showing the last 30 turns. Full history is kept on the Raspberry.',
  completed: 'Completed', failed: 'Failed', interrupted: 'Stopped', inProgress: 'Running',
  retry: 'Reconnect', installDetail: 'Requires a 64-bit Linux kernel, Node.js 20 or newer and Internet. On 32-bit Raspberry Pi OS it prepares a compatible environment without reinstalling the OS.',
};
export function codexStrings(language) { return ({ es, ca, en })[language] || es; }

export function codexLoginUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(url.hostname) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
